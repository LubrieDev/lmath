// ─────────────────────────────────────────────
// analysis · Números "bonitos" para el panel ⓘ (entero, múltiplo de π, decimal)
// ─────────────────────────────────────────────
//
// El panel venía imprimiendo `v.toFixed(4)` a pelo, y eso produce tres fealdades
// distintas que conviene no confundir porque solo una es de formato:
//
//   1. RELLENO: un valor exacto se escribe con ceros muertos (`1` → "1.0000").
//      Puramente cosmético.
//   2. RUIDO: los puntos notables salen de un cálculo NUMÉRICO (bisección para las
//      raíces, ajuste parabólico para los vértices), así que el último dígito de los
//      4 que se muestran suele ser basura: un vértice real en 3 aterriza en 2.99994
//      y `toFixed(4)` lo imprime fielmente como "2.9999". Aquí no sobra un dígito:
//      el valor ya venía con error, y ningún formateo por dígitos lo arregla.
//   3. SIMBÓLICO: el máximo de sin(x) está en π/2 y se leía "1.5708". El número es
//      correcto y aun así es la peor respuesta posible: quien mira una trigonométrica
//      quiere π, no su desarrollo decimal.
//
// Este módulo ataca los tres con la misma herramienta: buscar la forma CERRADA más
// simple que explique el valor dentro de una tolerancia, y caer al decimal si no hay
// ninguna. El orden (entero → múltiplo racional de π → decimal) va de lo más simple a
// lo más específico, que es también el orden en que un humano los reconocería.
//
// Sobre la TOLERANCIA: `TOL_SNAP` es deliberadamente 1e-4, del orden del error real de
// los estimadores de arriba y del último dígito que el panel llega a enseñar. Es un
// ajuste HONESTO —no un maquillaje— porque solo puede mover la cifra que ya era ruido:
// por debajo de esa escala el panel no distingue 3 de 2.99994, así que escribir "3" no
// afirma nada que el número no dijera. Y los falsos positivos son despreciables: que un
// valor sin relación caiga a menos de 1e-4 de p·π/q con q ≤ 16 es un accidente de
// probabilidad ~1e-3, y cuando ocurre el error introducido sigue siendo invisible.

// ─────────────────────────────────────────────
// De dónde viene el número
// ─────────────────────────────────────────────
//
// La cabecera de arriba justifica los 4 decimales con que «el último dígito suele ser basura».
// Es cierto —y solo para los números ESTIMADOS: una raíz sale de una bisección y un vértice de un
// ajuste parabólico, así que su cuarta cifra ya venía con error y mostrar más sería inventar.
//
// Pero por esta misma función pasaban también números EVALUADOS. La intersección con el eje Y es
// `f(0)`: no se estima, se calcula, y llega con toda la precisión de un `double`. Aplicarle la
// política de redondeo de un valor estimado le quitaba información que sí existía —`2.99888…` se
// imprimía `2.9989`— y, peor, la tolerancia de reconocimiento (`TOL_SNAP`) le permitía saltar a
// una forma cerrada que estaba a 1e-4, una distancia enorme para un número exacto.
//
// Por eso el número viaja con su PROCEDENCIA. No es un ajuste fino de dígitos: es que «cuántas
// cifras son de fiar» no es una propiedad del formato, es una propiedad de cómo se obtuvo el
// número, y solo lo sabe quien lo calculó.

/** Cómo se obtuvo el número, que es lo que decide cuántas de sus cifras significan algo. */
export type Origen =
  /** Calculado exactamente (evaluar `f(0)`, leer una coordenada del viewport). Todas sus cifras
   *  son buenas hasta la precisión de la máquina. */
  | "evaluado"
  /** Estimado por un método numérico (bisección, ajuste parabólico, cuadratura). Sus últimas
   *  cifras son ruido del método. */
  | "medido";

/** Cifras SIGNIFICATIVAS de cada procedencia. Las 4 de `medido` son las de siempre; las 6 de
 *  `evaluado` conservan lo que el cálculo de verdad sabe sin llegar a enseñar el ruido de la
 *  coma flotante (que empieza hacia la cifra 16). */
const CIFRAS: Readonly<Record<Origen, number>> = { evaluado: 6, medido: 4 };

/** Ajuste máximo que se permite para reconocer una forma cerrada, POR PROCEDENCIA.
 *
 *  Para un valor medido, 1e-4 es del orden del error real del estimador: reconocer π/2 en 1.5708
 *  no afirma nada que el número no dijera ya. Para uno evaluado sería falsificarlo, porque sus
 *  cifras son buenas mucho más allá: ahí solo se acepta la forma cerrada cuando de verdad
 *  coincide, y 1e-12 deja margen para el redondeo acumulado de unas pocas operaciones sin dejar
 *  pasar nada que no sea el mismo número. */
const TOL_SNAP_POR_ORIGEN: Readonly<Record<Origen, number>> = { evaluado: 1e-12, medido: 1e-4 };

/** Ajuste máximo por defecto (valores medidos). Ver cabecera. */
const TOL_SNAP = TOL_SNAP_POR_ORIGEN.medido;

/** Denominador máximo al buscar v = p·π/q. 16 cubre π/2, π/3, π/4, π/6, π/8, π/12 y
 *  π/16 —los ángulos que de verdad aparecen— sin abrir la puerta a coincidencias
 *  fortuitas con denominadores grandes, que ya no son "forma cerrada reconocible". */
const DEN_MAX_PI = 16;

/** Múltiplo máximo de π. Más allá de 64π el símbolo deja de ayudar a leer. */
const NUM_MAX_PI = 64;

/** Decimales del último recurso, cuando no hay forma cerrada. */
const DECIMALES = 4;

/** Fracción p/q ya reducida. */
interface Fraccion { p: number; q: number }

/**
 * Forma cerrada reconocida en un número. `decimal` es el caso "no hay nada mejor";
 * los otros dos llevan el valor exacto que se ha decidido que el número representa.
 */
export type FormaNumero =
  | { tipo: "entero"; n: number }
  | { tipo: "pi"; f: Fraccion }   // valor = (p/q)·π
  | { tipo: "decimal"; v: number };

const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b));

/** ¿`v` está a menos de la tolerancia de `objetivo`? Escala con la magnitud para que
 *  la tolerancia siga siendo "el último dígito visible" también en valores grandes. */
function cerca(v: number, objetivo: number, tol: number = TOL_SNAP): boolean {
  return Math.abs(v - objetivo) <= tol * Math.max(1, Math.abs(objetivo));
}

/**
 * La forma cerrada más simple que explica `v`, o `decimal` si no hay ninguna.
 * No lanza: un valor no finito sale como decimal y el llamador decide qué hacer.
 */
export function formaDe(v: number, origen: Origen = "medido"): FormaNumero {
  if (!Number.isFinite(v)) return { tipo: "decimal", v };
  const tol = TOL_SNAP_POR_ORIGEN[origen];

  // Cero y enteros primero: son la forma más simple y hacen de guarda para el resto
  // (sin esto, 0 entraría en la búsqueda de π con p=0 y saldría un "0·π" absurdo).
  const n = Math.round(v);
  if (cerca(v, n, tol)) return { tipo: "entero", n: n === 0 ? 0 : n }; // evita el -0

  // Múltiplo racional de π. Se prueba q creciente y se acepta el PRIMERO que encaje,
  // que por construcción es el de denominador más pequeño (π/2 antes que 2π/4).
  const ratio = v / Math.PI;
  for (let q = 1; q <= DEN_MAX_PI; q++) {
    const p = Math.round(ratio * q);
    if (p === 0 || Math.abs(p) > NUM_MAX_PI) continue;
    if (mcd(Math.abs(p), q) !== 1) continue;       // no reducida: ya se probó con q menor
    if (cerca(v, (p * Math.PI) / q, tol)) return { tipo: "pi", f: { p, q } };
  }

  return { tipo: "decimal", v };
}

// ─────────────────────────────────────────────
// El decimal, según de dónde venga el número
// ─────────────────────────────────────────────

/** Por debajo de esto un decimal en notación fija sería una fila de ceros: se pasa a
 *  exponencial, que a esa escala se lee mejor y no pierde ninguna cifra. */
const MINIMO_FIJO = 1e-4;
/** Por encima de esto la notación fija deja de caber en una etiqueta. */
const MAXIMO_FIJO = 1e6;

/**
 * El número como DECIMAL para una lectura, con tantas cifras significativas como su procedencia
 * permita afirmar, y **conservando los ceros finales**.
 *
 * Los ceros finales son el punto, no un descuido: `1.4905` y `1.4899` se imprimían los dos como
 * `1.49` —cuatro cifras significativas y luego recortar los ceros—, así que dos valores distintos
 * se leían iguales y la cuenta de decimales visibles bailaba de un número a otro. Con
 * `toPrecision` sin recortar salen `1.49050` y `1.48990`: distintos, y con la misma anchura.
 *
 * Dentro del rango normal (entre 1e-4 y 1e6) NO hay notación exponencial. Un readout de posición
 * se lee, no se compara con otros: `1234.50` dice más que `1.2e+3`, que además solo conservaba
 * DOS cifras significativas.
 */
export function formatearLectura(v: number, origen: Origen = "evaluado"): string {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "-∞";
  if (v === 0) return "0";                          // cubre también el −0
  const cifras = CIFRAS[origen];
  const abs = Math.abs(v);
  if (abs < MINIMO_FIJO || abs >= MAXIMO_FIJO) return v.toExponential(cifras - 1);
  // `toPrecision` da notación fija en toda esta banda. La única excepción es el valor que al
  // redondear cruza la década de arriba (999999.7 → 1.00000e+6); sigue siendo correcto y con las
  // mismas cifras, así que no se fuerza nada para evitarlo.
  return v.toPrecision(cifras);
}

/** Decimal compacto: hasta 4 cifras y SIN ceros de relleno (1.5 no "1.5000"). El formato
 *  histórico del panel, que se conserva para los valores MEDIDOS —donde enseñar más cifras sería
 *  enseñar el ruido del estimador— y para todo lo que no declare procedencia. */
function decimalCompacto(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "-∞";
  const r = parseFloat(v.toFixed(DECIMALES));
  return Object.is(r, -0) ? "0" : String(r);
}

/**
 * Quita los ceros de relleno del final: `0.500000` → `0.5`, `1.23400e-5` → `1.234e-5`. Sobre un
 * exponencial recorta la MANTISA y deja el exponente en paz.
 */
function sinCerosFinales(s: string): string {
  const [mantisa, exponente] = s.split("e");
  const limpia = mantisa.includes(".")
    ? mantisa.replace(/0+$/, "").replace(/\.$/, "")
    : mantisa;
  return exponente === undefined ? limpia : `${limpia}e${exponente}`;
}

/**
 * El decimal que le toca a cada procedencia: el compacto de siempre si es medido, la lectura de
 * 6 cifras si es evaluado.
 *
 * ── Por qué el panel SÍ recorta los ceros y el crosshair NO ──────────────────────────────
 * Los ceros finales existen por el readout del crosshair, donde el número **cambia mientras
 * mueves el cursor**: con ancho fijo se distinguen `1.49050` y `1.48990`, que antes se leían los
 * dos `1.49`, y la cuenta de decimales visibles no baila de un punto al siguiente.
 *
 * En un panel ese argumento no existe: el número es estático y no compite con el de al lado. Ahí
 * los ceros solo estorban —una pendiente de 0,05 se leía `0.0500000` y una intersección Y de 0,5,
 * `0.500000`—, y no aportan nada, porque recortarlos **no pierde ninguna cifra significativa**:
 * `1.4905` y `1.4899` siguen distinguiéndose, que era todo lo que había que conservar.
 *
 * Es la misma idea que separa los tres formatos desde el principio: cuántas cifras son de fiar lo
 * decide la PROCEDENCIA, y cómo se escriben lo decide el SITIO donde se leen.
 */
const decimalDe = (v: number, origen: Origen): string =>
  origen === "evaluado" ? sinCerosFinales(formatearLectura(v, "evaluado")) : decimalCompacto(v);

/**
 * Texto plano del número, para las líneas del panel que no pasan por KaTeX.
 * Usa el símbolo π literal (la fuente del panel lo tiene) en vez de `\pi`.
 */
export function numeroATexto(v: number, origen: Origen = "medido"): string {
  const f = formaDe(v, origen);
  if (f.tipo === "entero") return String(f.n);
  if (f.tipo === "decimal") return decimalDe(f.v, origen);

  const { p, q } = f.f;
  const signo = p < 0 ? "-" : "";
  const mag = Math.abs(p);
  const numerador = mag === 1 ? "π" : `${mag}π`;
  return q === 1 ? `${signo}${numerador}` : `${signo}${numerador}/${q}`;
}

/**
 * LaTeX del número, para las líneas que sí se renderizan con KaTeX. El signo va
 * FUERA de la fracción (`-\frac{\pi}{4}`, no `\frac{-\pi}{4}`): es como se escribe a
 * mano y como lo compone KaTeX en el resto del plugin.
 */
export function numeroALatex(v: number, origen: Origen = "medido"): string {
  const f = formaDe(v, origen);
  if (f.tipo === "entero") return String(f.n);
  if (f.tipo === "decimal") {
    if (!Number.isFinite(f.v)) return f.v > 0 ? "\\infty" : "-\\infty";
    return decimalDe(f.v, origen);
  }

  const { p, q } = f.f;
  const signo = p < 0 ? "-" : "";
  const mag = Math.abs(p);
  const numerador = mag === 1 ? "\\pi" : `${mag}\\pi`;
  return q === 1 ? `${signo}${numerador}` : `${signo}\\frac{${numerador}}{${q}}`;
}

// ─────────────────────────────────────────────
// Piezas compuestas, en LaTeX
// ─────────────────────────────────────────────
//
// Un par y un intervalo son UNA expresión, no dos números con puntuación en medio: sus
// paréntesis pertenecen a la expresión y tienen que crecer con ella (`\left(…\right)`), y su
// coma es un separador y no un decimal. Por eso se componen aquí enteros en vez de dejar que
// cada panel pegue trozos: así los cinco cuadros escriben el mismo par de la misma manera.

/** Par ordenado en LaTeX, con paréntesis que crecen: `\left(0,\ \frac{\pi}{2}\right)`.
 *
 *  `origen` vale para las DOS coordenadas, que es lo que se necesita: un punto notable tiene sus
 *  dos coordenadas estimadas (vértice) o las dos calculadas (la intersección con el eje Y, cuyo
 *  `x` es el 0 exacto y cuyo `y` es `f(0)`). */
export function puntoALatex(x: number, y: number, origen: Origen = "medido"): string {
  return `\\left(${numeroALatex(x, origen)},\\ ${numeroALatex(y, origen)}\\right)`;
}

/** Intervalo ABIERTO en LaTeX, con ∞ donde toca: `\left(-\infty,\ -1\right)`. */
export function intervaloALatex(a: number, b: number, origen: Origen = "medido"): string {
  return `\\left(${numeroALatex(a, origen)},\\ ${numeroALatex(b, origen)}\\right)`;
}

/** Varios números como UN fragmento matemático: `\frac{\pi}{4},\ \frac{3\pi}{4}`.
 *
 *  El `map` lleva la lambda explícita y no `numeroALatex` a secas: pasada por referencia, `map`
 *  le daría el ÍNDICE como segundo argumento y el índice acabaría de procedencia. */
export function listaALatex(vs: readonly number[], origen: Origen = "medido"): string {
  return vs.map((v) => numeroALatex(v, origen)).join(",\\ ");
}
