// ─────────────────────────────────────────────
// parsing · Restricción de dominio escrita junto a la función (PURO)
// ─────────────────────────────────────────────
//
// La sintaxis del issue #1, que es también la de Desmos: el intervalo va entre LLAVES al final
// de la expresión.
//
//   \sin x {0 \leq x \leq 2\pi}     ·  acotada por los dos lados
//   \sqrt{x} {x \geq 4}             ·  acotada por uno
//   (\cos t, \sin t) {0 ≤ t ≤ π}    ·  media circunferencia: aquí el intervalo ES el dominio
//
// ── Por qué llaves, y cómo se distinguen de las de LaTeX ──────────────────────────────────
// En LaTeX las llaves AGRUPAN (`x^{2}`, `\sqrt{x}`, `\frac{1}{2}`) y son con diferencia el
// carácter estructural más frecuente de una fórmula. Lo que separa un grupo de una restricción
// no es dónde está, es lo que hay DENTRO: **una restricción contiene un comparador**. Ningún
// grupo tipográfico lo contiene, así que la regla no puede confundirse con la notación que ya se
// escribe. Y el grupo se busca solo al FINAL: es donde lo pone quien lo escribe, y buscarlo en
// cualquier posición obligaría a mirar dentro de cada `\frac` por si acaso.
//
// ── Por qué se separa ANTES que nada ──────────────────────────────────────────────────────
// Dos razones, y las dos son de vida o muerte para el bloque:
//
//  1. `\leq` y `\geq` NO están en `COMANDOS_SOPORTADOS` (parser.ts), y esa lista blanca es lo
//     que vela el bloque entero como «Símbolo no soportado». Ese veto es CORRECTO fuera de aquí:
//     `y \le x` es una REGIÓN y este plugin no dibuja regiones, así que velarlo es decir la
//     verdad. Aceptar el comparador globalmente sería prometer regiones sin querer. Aceptado
//     dentro de las llaves y solo ahí, las dos cosas siguen siendo ciertas a la vez.
//  2. El grupo llegaría a mathjs como una agrupación y reventaría la expresión entera.
//
// ── Qué NO decide este módulo ─────────────────────────────────────────────────────────────
// El RECORTE. Aquí solo se lee el intervalo; quien lo aplica es `construirObjeto`, y lo hace
// con el mecanismo que el motor ya tiene: fuera del intervalo la función devuelve NaN, y el
// contrato dice que un valor no finito es «fuera del dominio» (`contracts/oraculos.ts`). El
// descubridor, el trazador, los puntos notables y el autoencuadre lo tratan solos como ausencia
// de curva; no hace falta motor nuevo. En paramétricas y polares el intervalo es todavía más
// directo: ES el dominio del parámetro.
//
// ── `<` y `≤` se leen igual ───────────────────────────────────────────────────────────────
// A propósito, y hay que decirlo en la documentación en vez de fingir lo contrario: la
// diferencia entre abierto y cerrado es UN punto, que no ocupa un píxel. Aceptar las dos formas
// y dibujar lo mismo es lo honesto; dibujar un circulito hueco en el extremo sería otra
// funcionalidad, no un matiz de esta.

import { normalizarEntrada } from "../../parser";
import { evaluarConstante } from "../../evaluador";

/** El sentido de un comparador, una vez leído: `≤`/`<`/`\le` o `≥`/`>`/`\ge`. */
export type Sentido = "le" | "ge";

/** Un intervalo leído de las llaves, ya en números. */
export interface RestriccionDominio {
  /**
   * La variable que el intervalo acota, ya normalizada (`x`, `t`, `theta`). Se guarda porque
   * el bloque tiene que comprobar que es la SUYA: un `{0 ≤ t ≤ 3}` en una explícita en x no
   * acota nada, y aplicarlo callando recortaría por una variable que no existe.
   */
  readonly variable: string;
  /** Extremos ya evaluados. `-Infinity`/`+Infinity` cuando ese lado no se acotó. */
  readonly min: number;
  readonly max: number;
  /** El grupo tal y como se escribió, con sus llaves. */
  readonly texto: string;
  /**
   * Los operandos TAL COMO SE ESCRIBIERON (`["0", "x", "2\\pi"]`) y el sentido de cada
   * comparador entre ellos. Es lo que el panel tipografía: con `min`/`max` escribiría
   * `6.283185307179586` donde el autor puso `2\pi`, y una coletilla que no se parece a lo que
   * uno escribió no se reconoce como propia.
   */
  readonly piezas: readonly string[];
  readonly signos: readonly Sentido[];
}

export interface EntradaRestringida {
  /** La ecuación sin el grupo: lo que ven el veto de comandos, el LaTeX y el motor. */
  readonly expr: string;
  /** `null` si no había restricción, o si había algo entre llaves que no se pudo leer. */
  readonly restriccion: RestriccionDominio | null;
  /**
   * Había un grupo final SEPARADO que parece un intento de restricción —lleva un comparador, o
   * está vacío— y no se pudo leer.
   *
   * Existe porque «devolver la ecuación intacta y que el veto de comandos la vele» no alcanza
   * para todos los casos, y el que se escapa es MUDO: con el comparador en Unicode (`{0 ≤ x ≤
   * chorizo}`) o sin comparador ninguno (`{}`), no queda ningún `\comando` que vetar, así que el
   * bloque salía en blanco sin decir nada. Y donde el veto sí saltaba mentía: «símbolo no
   * soportado: ≤» es falso dentro de las llaves, que es justo donde el comparador SÍ se soporta.
   * El problema real es el extremo que no se entiende, y eso hay que decirlo con sus palabras.
   *
   * Se pide que el grupo esté SEPARADO (espacio delante, o nada) para no confundirlo con la
   * notación de siempre: `x^{}` es un exponente vacío, no una restricción a medio escribir.
   *
   * Vale el grupo TAL COMO SE ESCRIBIÓ —con sus llaves— porque el aviso lo cita: el fallo está
   * en un extremo concreto, y verlo entre comillas es lo que lo señala. `null` si no lo hay.
   */
  readonly ilegible: string | null;
}

/**
 * Los comparadores, en un grupo CAPTURADOR: así `split` deja en el array los separadores además
 * de los operandos, y se lee el intervalo sin marcas internas ni segunda pasada.
 *
 * `\le` lleva `(?![a-zA-Z])` por un motivo concreto: sin esa guarda también casaría dentro de
 * `\left`, que empieza exactamente igual, y cualquier fórmula con paréntesis LaTeX entre llaves
 * se leería como un intervalo. `<=` va antes que `<` porque la alternancia se resuelve de
 * izquierda a derecha y la corta se comería la larga.
 */
const COMPARADOR = /(\\leq?(?![a-zA-Z])|<=|≤|<|\\geq?(?![a-zA-Z])|>=|≥|>)/g;

/** El mismo patrón sin `g`, para preguntar «¿hay comparador aquí?» sin arrastrar `lastIndex`. */
const HAY_COMPARADOR = new RegExp(COMPARADOR.source);

/**
 * El infinito escrito a mano, en las formas que llegan: `\infty`, `∞` y el `Infinity` que deja el
 * normalizador. Se lee AQUÍ y no en `evaluarConstante` a propósito: esa función rechaza lo no
 * finito porque un ángulo o una componente infinitos son un error, y aquí es exactamente lo
 * contrario —«por este lado no acotes»—, que es lo que uno escribe en `{-\infty ≤ x ≤ \pi}`.
 */
const INFINITO = /^([+-]?)\s*(?:\\infty|∞|Infinity)$/;

/**
 * Un extremo del intervalo ya en número, o `null` si eso no es una cota. `-Infinity`/`+Infinity`
 * son valores legítimos aquí: significan «sin acotar por ese lado», que es lo que `min`/`max`
 * llevan ya cuando la restricción es de un solo lado.
 */
function cotaDe(pieza: string): number | null {
  const s = pieza.trim();
  const inf = INFINITO.exec(s);
  if (inf) return inf[1] === "-" ? -Infinity : Infinity;
  return evaluarConstante(s);
}

/** El sentido de un comparador ya reconocido. */
const sentidoDe = (token: string): Sentido =>
  token.startsWith(">") || token.startsWith("≥") || token.startsWith("\\g") ? "ge" : "le";

/**
 * El grupo `{…}` que CIERRA la cadena, o `null`. Se camina hacia atrás contando profundidad, no
 * se busca la primera llave: `\frac{1}{2} {0 ≤ x ≤ 1}` tiene tres grupos y solo el último es la
 * restricción.
 */
function grupoFinal(s: string): { antes: string; interior: string; texto: string } | null {
  if (!s.endsWith("}")) return null;
  let prof = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === "}") prof++;
    else if (s[i] === "{" && --prof === 0) {
      return { antes: s.slice(0, i), interior: s.slice(i + 1, -1), texto: s.slice(i) };
    }
  }
  return null;
}

/**
 * El nombre de variable de un operando, o `null` si no es una variable suelta. Pasa por
 * `normalizarEntrada` para que `\theta` y `θ` lleguen los dos como `theta`, que es como los
 * nombra el motor; así el bloque polar reconoce las tres formas sin una tabla propia.
 */
function nombreVariable(operando: string): string | null {
  const s = normalizarEntrada(operando.trim()).trim();
  return /^[a-zA-Z][a-zA-Z0-9]*$/.test(s) ? s : null;
}

/**
 * Lee el interior de las llaves. Devuelve `null` ante cualquier forma que no reconozca, y quien
 * llama marca eso como `ilegible` para que el bloque lo diga con sus palabras en vez de quedarse
 * en blanco (ver `EntradaRestringida.ilegible`).
 *
 * Formas aceptadas, que son las que se escriben a mano:
 *   a ≤ v ≤ b   ·   a ≥ v ≥ b   ·   v ≤ b   ·   v ≥ a   ·   a ≤ v   ·   a ≥ v
 *
 * Los extremos admiten `\infty` («no acotes por aquí») y cualquier constante con nombre (`\pi`,
 * `e`), que es lo que uno escribe: `{-\infty ≤ x ≤ \pi}`.
 */
function leerIntervalo(interior: string, texto: string): RestriccionDominio | null {
  const trozos = interior.split(COMPARADOR);
  // Con grupo capturador, `split` alterna operando y separador: los pares son las piezas y los
  // impares los comparadores.
  const piezas = trozos.filter((_, i) => i % 2 === 0).map((p) => p.trim());
  const signos = trozos.filter((_, i) => i % 2 === 1).map(sentidoDe);
  const comun = { texto, piezas, signos };

  const acotado = (v: number | null): v is number => v !== null;

  if (signos.length === 2) {
    // Encadenada: la variable es el operando de en medio, y los dos comparadores tienen que ir
    // en el mismo sentido. `0 ≤ x ≥ 5` no es un intervalo, son dos afirmaciones sueltas.
    if (signos[0] !== signos[1]) return null;
    const variable = nombreVariable(piezas[1]);
    if (!variable) return null;
    const a = cotaDe(piezas[0]);
    const b = cotaDe(piezas[2]);
    if (!acotado(a) || !acotado(b)) return null;
    return signos[0] === "le"
      ? { ...comun, variable, min: a, max: b }
      : { ...comun, variable, min: b, max: a };
  }

  if (signos.length === 1) {
    // Se pregunta por la COTA antes que por la variable, y ese orden es el arreglo: `\pi`, `pi`
    // y `e` tienen forma de nombre pero valor de número, así que preguntando primero por la
    // variable salían dos variables, la regla de «una y solo una» descartaba el intervalo, y
    // `{x ≤ \pi}` acababa velado como si estuviera mal escrito. Encadenado nunca falló porque
    // ahí los extremos van directos a evaluarse, sin pasar por el reconocedor de nombres.
    const cotaIzq = cotaDe(piezas[0]);
    const cotaDer = cotaDe(piezas[1]);
    const izquierda = cotaIzq === null ? nombreVariable(piezas[0]) : null;
    const derecha = cotaDer === null ? nombreVariable(piezas[1]) : null;
    // La variable tiene que estar en UN lado y la cota en el otro: `x ≤ y` acota una variable con
    // otra, que es una región (no se dibujan) y no un intervalo.
    if (izquierda && acotado(cotaDer)) {
      return signos[0] === "le"
        ? { ...comun, variable: izquierda, min: -Infinity, max: cotaDer }
        : { ...comun, variable: izquierda, min: cotaDer, max: Infinity };
    }
    if (derecha && acotado(cotaIzq)) {
      return signos[0] === "le"
        ? { ...comun, variable: derecha, min: cotaIzq, max: Infinity }
        : { ...comun, variable: derecha, min: -Infinity, max: cotaIzq };
    }
  }

  return null;
}

/**
 * Parte una ecuación en «lo que se grafica» y «dónde se grafica».
 *
 * Si no hay restricción legible, la ecuación vuelve INTACTA: este módulo no arregla lo que no
 * entiende, y devolver el texto tal cual es lo que deja que el veto de comandos haga su trabajo.
 */
export function separarRestriccion(ec: string): EntradaRestringida {
  const s = ec.trim();
  const grupo = grupoFinal(s);
  if (!grupo) return { expr: ec, restriccion: null, ilegible: null };

  const restriccion = leerIntervalo(grupo.interior, grupo.texto);
  if (!restriccion) {
    // Un grupo SEPARADO (espacio delante, o solo) que lleva un comparador o está vacío es un
    // intento de restricción, no notación: se marca para que el bloque pueda decirlo. Pegado a
    // lo anterior no se toca, porque ahí las llaves son de LaTeX (`x^{}`, `\sqrt{x}`).
    const separado = grupo.antes === "" || /\s$/.test(grupo.antes);
    const interior = grupo.interior.trim();
    const intento = separado && (interior === "" || HAY_COMPARADOR.test(interior));
    return { expr: ec, restriccion: null, ilegible: intento ? grupo.texto : null };
  }
  return { expr: grupo.antes.trim(), restriccion, ilegible: null };
}

/**
 * Cómo se parte un bloque en ecuaciones **para este módulo**: por saltos de línea y por el `\\`
 * de LaTeX. Un sistema se puede escribir de las dos maneras y `dividirEcuaciones` entiende las
 * dos; mirando solo los saltos de línea, un `\begin{cases}…\\…\end{cases}` llegaba entero en una
 * sola línea, su restricción no se separaba de nada y el bloque acababa velado por su propio
 * `\leq` —justo lo que este módulo existe para evitar—.
 */
export function lineasDeEcuacion(source: string): string[] {
  return source.split(/\r?\n|\\\\/);
}

/**
 * El source SIN sus restricciones, ecuación a ecuación. Es lo que mira el veto de comandos: sin
 * este paso, el `\leq` de una restricción perfectamente válida velaría el bloque entero (ver la
 * cabecera). Un bloque de sistema tiene una restricción por ecuación, de ahí el reparto.
 *
 * Se rejunta con saltos de línea y no con el separador original a propósito: lo único que hace
 * quien lo recibe es buscar comandos, y ese barrido ya neutraliza el `\\` antes de mirar.
 */
export function sinRestricciones(source: string): string {
  return lineasDeEcuacion(source)
    .map((linea) => separarRestriccion(linea).expr)
    .join("\n");
}

/**
 * ¿Este valor de la variable está dentro? Los extremos ENTRAN siempre, también cuando se
 * escribió `<`: ver la cabecera.
 */
export function dentro(r: RestriccionDominio, v: number): boolean {
  return v >= r.min && v <= r.max;
}

/**
 * Aplica una transformación (simplificar, despejar) a la fórmula SIN tocar su restricción, y se
 * la devuelve puesta.
 *
 * Existe como una sola función porque el error contrario es silencioso y feo: el pipeline no
 * reconoce `\leq`, así que una transformación que reciba la restricción de vuelta la degrada a
 * `*l*e*q` —el barrido comodín del normalizador— y el panel enseña esa basura como si fuera lo
 * que el autor escribió. Una restricción no se simplifica ni se despeja: es una condición SOBRE
 * la fórmula, no parte de ella.
 */
export function transformarSinRestriccion(ec: string, fn: (expr: string) => string): string {
  const { expr, restriccion } = separarRestriccion(ec);
  const salida = fn(expr);
  return restriccion === null ? salida : `${salida} ${restriccion.texto}`;
}
