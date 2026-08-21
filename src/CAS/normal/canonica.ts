// ─────────────────────────────────────────────
// normal · La forma canónica, que ahora es ESTRUCTURAL (PURO)
// ─────────────────────────────────────────────
//
// `normalizar(e)` devuelve la forma canónica de `e`. Dos expresiones que sean la misma cosa
// tienen la MISMA forma canónica, y por tanto el mismo hash y la misma estructura: comprobar si
// dos expresiones son iguales deja de pasar por imprimirlas.
//
// Ese es el cambio de fondo respecto del motor actual, donde el orden canónico se decide AL
// IMPRIMIR (`renderCanonico` de `formatoExpr.ts` ordena y serializa en la misma función), las
// claves de ordenación son cadenas (`claveFactor`) y la idempotencia se comprueba sobre el
// texto. Con esto, cambiar la tipografía deja de ser cambiar el álgebra.
//
// ── LO QUE NORMALIZAR NO ES ──────────────────────────────────────────────────────────────
// No es simplificar. Normalizar **conserva el valor Y el dominio, sin condiciones**, y solo hace
// lo que se puede demostrar seguro:
//
//     aplanar y ORDENAR          a+b+c en un orden fijo, sea cual sea el orden escrito
//     plegar números             2+3 → 5, 2·3 → 6, 2^3 → 8, en aritmética EXACTA
//     quitar neutros             u+0 → u, u·1 → u
//     juntar semejantes          2x+3x → 5x, x·x → x²
//
// Y NO hace nada cuya validez dependa de una condición. Expandir, factorizar, cancelar, aplicar
// identidades trigonométricas o reducir radicales son transformaciones con nombre propio, se
// piden aparte, y las que necesiten una condición la llevarán escrita. Esa separación es lo que
// hace que esta función sea segura de aplicar siempre, sin guardián numérico detrás.
//
// ── Las trampas del dominio, y cómo se esquivan ──────────────────────────────────────────
// Varias reglas que parecen inofensivas cambian el dominio. Todas se controlan por delante, con
// `siempreDefinida` o con el análisis de exponentes de `juntarExponentes`:
//
//     0 · u      →  0    `0·(1/x)` NO vale 0 en x=0. Solo se colapsa si el resto está definido.
//     u − u      →  0    `1/x − 1/x` NO vale 0 en x=0. Si los coeficientes se anulan y la base
//                        no está siempre definida, el grupo se deja sin juntar.
//     u^a · u^b  →  u^(a+b)
//                        `x·x⁻¹ → x⁰` es el caso de manual, pero la trampa es MÁS ANCHA:
//                        `x²·x⁻¹ → x` también cambia el dominio, y no lo parece. La condición
//                        exacta está en `juntarExponentes`.
//
// El motor actual no esquiva ninguna: las hace y luego comprueba con una muestra si coló. Esa
// comprobación a posteriori es la que aquí deja de hacer falta —y la muestra, además, no puede
// saber dónde mirar, que es por lo que hubo que enseñárselo con los puntos de quiebre—.

import {
  type Condicion, type Expresion, type Literal,
  CERO_E, UNO_E,
  aplicacion, condicionado, familia, literal, potencia, producto, rama, suma,
} from "../nucleo/expresion";
import {
  type Numero, CERO_N, UNO_N,
  enteroDe, esCeroN, esUnoN, numEntero as enteroN, potenciaN, productoN, signoN, sumaN,
} from "../nucleo/numero";
import { iguales } from "../nucleo/igualdad";
import { comparar, ordenar } from "../nucleo/orden";
import { siempreDefinida } from "../dominio/definicion";

// ─────────────────────────────────────────────
// Lectura de un término y de un factor
// ─────────────────────────────────────────────
//
// Un sumando cualquiera se lee como `coeficiente · base`, y un factor cualquiera como
// `base ^ exponente`. Con esa lectura, juntar semejantes es agrupar por base y operar los
// coeficientes (o los exponentes), sin ningún caso especial para el signo, la resta ni la
// división: todo eso ya son productos y potencias.

interface Termino { readonly coef: Numero; readonly base: Expresion }
interface Factor { readonly base: Expresion; readonly exp: Expresion }

/** Saca a la superficie los sumandos de las sumas anidadas. Un solo nivel basta: los hijos
 *  llegan ya normalizados, y una suma normalizada no tiene sumas dentro. */
const aplanarSumandos = (es: readonly Expresion[]): Expresion[] =>
  es.flatMap((e) => (e.clase === "suma" ? e.sumandos : [e]));

/** Lo mismo para los factores. */
const aplanarFactores = (es: readonly Expresion[]): Expresion[] =>
  es.flatMap((e) => (e.clase === "producto" ? e.factores : [e]));

/** `3x` → (3, x); `x` → (1, x); `−x` → (−1, x); `7` → (7, 1). */
function leerTermino(e: Expresion): Termino {
  if (e.clase === "literal") return { coef: e.numero, base: UNO_E };
  if (e.clase !== "producto") return { coef: UNO_N, base: e };
  const numeros = e.factores.filter((f): f is Literal => f.clase === "literal");
  if (numeros.length === 0) return { coef: UNO_N, base: e };
  const resto = e.factores.filter((f) => f.clase !== "literal");
  const coef = numeros.reduce((a, l) => productoN(a, l.numero), UNO_N);
  return { coef, base: producto(resto) };
}

/** `x^2` → (x, 2); `x` → (x, 1). */
function leerFactor(e: Expresion): Factor {
  return e.clase === "potencia" ? { base: e.base, exp: e.exponente } : { base: e, exp: UNO_E };
}

/** Reconstruye `coef · base`, sin dejar el `1·` ni el `·1` colgando. */
function montarTermino(t: Termino): Expresion {
  if (esCeroN(t.coef)) return CERO_E;
  if (iguales(t.base, UNO_E)) return literal(t.coef);
  if (esUnoN(t.coef)) return t.base;
  return producto([literal(t.coef), t.base]);
}

// ─────────────────────────────────────────────
// Sumas
// ─────────────────────────────────────────────

function normalizarSuma(sumandos: readonly Expresion[]): Expresion {
  // RE-APLANAR antes de agrupar. El constructor aplanó la lista ORIGINAL, pero normalizar un
  // sumando puede convertirlo en una suma —`(y·π + 3)·1` lo es—, y entonces la lista vuelve a
  // tener sumas dentro. Si se ordenara sin aplanar, el constructor aplanaría DESPUÉS y metería
  // los sumandos de dentro al final, deshaciendo el orden: la función dejaría de ser idempotente.
  // Lo encontró la prueba de idempotencia sobre lotes generados.
  const planos = aplanarSumandos(sumandos);
  const grupos: Array<{ base: Expresion; coef: Numero; partes: Expresion[] }> = [];
  let constante: Numero = CERO_N;

  for (const s of planos) {
    const t = leerTermino(s);
    if (iguales(t.base, UNO_E)) { constante = sumaN(constante, t.coef); continue; }
    const g = grupos.find((x) => iguales(x.base, t.base));
    if (g) { g.coef = sumaN(g.coef, t.coef); g.partes.push(s); }
    else grupos.push({ base: t.base, coef: t.coef, partes: [s] });
  }

  const salida: Expresion[] = [];
  for (const g of grupos) {
    if (esCeroN(g.coef) && !siempreDefinida(g.base)) {
      // Los coeficientes se anulan pero la base puede no existir en algún punto: juntarlos
      // FABRICARÍA un valor donde no lo hay (`1/x − 1/x` no es 0 en x=0). Se dejan como estaban.
      salida.push(...g.partes);
      continue;
    }
    const montado = montarTermino({ coef: g.coef, base: g.base });
    if (!iguales(montado, CERO_E)) salida.push(montado);
  }
  if (!esCeroN(constante)) salida.push(literal(constante));

  return suma(ordenar(salida));
}

// ─────────────────────────────────────────────
// Productos
// ─────────────────────────────────────────────

function normalizarProducto(factores: readonly Expresion[]): Expresion {
  const planos = aplanarFactores(factores);   // mismo motivo que en la suma
  const grupos: Array<{ base: Expresion; exps: Expresion[]; partes: Expresion[] }> = [];
  let constante: Numero = UNO_N;

  for (const f of planos) {
    if (f.clase === "literal") { constante = productoN(constante, f.numero); continue; }
    const { base, exp } = leerFactor(f);
    const g = grupos.find((x) => iguales(x.base, base));
    if (g) { g.exps.push(exp); g.partes.push(f); }
    else grupos.push({ base, exps: [exp], partes: [f] });
  }

  const salida: Expresion[] = [];
  for (const g of grupos) {
    if (g.exps.length === 1) { salida.push(...g.partes); continue; }
    const juntado = juntarExponentes(g.base, g.exps);
    if (juntado === null) salida.push(...g.partes);   // no se puede juntar sin arriesgar dominio
    else salida.push(juntado);
  }

  // El CERO absorbente solo se aplica si lo demás está definido en todas partes: `0·(1/x)` no
  // vale 0 en x=0, y colapsarlo inventaría un punto de la curva.
  if (esCeroN(constante)) {
    return salida.every(siempreDefinida) ? CERO_E : producto(ordenar([CERO_E, ...salida]));
  }
  if (!esUnoN(constante)) salida.push(literal(constante));

  // El número va DELANTE porque su rango de clase es el menor: la forma canónica pone el
  // coeficiente al principio sin que nadie lo pida aparte. Es lo que hoy hace a mano
  // `coeficientesAlFrente`, y aquí sale del orden.
  return producto(ordenar(salida));
}

/**
 * `u^a · u^b` → `u^(a+b)`, o `null` si juntarlos cambiaría el dominio.
 *
 * El razonamiento es sobre UN solo punto: `u = 0`. El dominio propio de `u` es común a las dos
 * formas, así que lo único que puede diferir es si cada una exige `u ≠ 0`:
 *
 *   • el producto original lo exige en cuanto ALGÚN exponente es negativo (hay una división);
 *   • la forma juntada lo exige solo si el exponente TOTAL es negativo.
 *
 * De ahí las tres respuestas, y ninguna es un caso especial: son la misma condición leída en sus
 * tres situaciones.
 *
 *     todos los exponentes ≥ 0        →  seguro (ninguna de las dos formas exige nada)
 *     total < 0                       →  seguro (las dos exigen u ≠ 0)
 *     algún exponente < 0, total ≥ 0  →  NO, salvo que se sepa que u ≠ 0
 *
 * El último es el caso que hay que ver, y es más ancho que el clásico `x·x⁻¹ → x⁰`: también lo es
 * `x²·x⁻¹ → x`, que parece inofensivo y no lo es —el producto no existe en x=0 y la `x` sí—. Se
 * coló en la primera versión de este archivo, guardada solo contra el total nulo, y lo destapó el
 * autodiagnóstico del oráculo (`x^2/x` frente a `x`).
 */
function juntarExponentes(base: Expresion, exps: readonly Expresion[]): Expresion | null {
  let total: Numero = CERO_N;
  let algunoNegativo = false;
  for (const e of exps) {
    if (e.clase !== "literal") return null;
    const k = enteroDe(e.numero);
    if (k === null) return null;
    if (k < 0n) algunoNegativo = true;
    total = sumaN(total, e.numero);
  }

  const totalNegativo = signoN(total) < 0;
  if (algunoNegativo && !totalNegativo && !baseNoNula(base)) return null;

  if (esCeroN(total)) return UNO_E;   // aquí solo se llega si la base es no nula
  if (esUnoN(total)) return base;
  return potencia(base, literal(total));
}

/** ¿Es la base un valor del que se sabe con certeza que no es cero? */
function baseNoNula(base: Expresion): boolean {
  if (base.clase === "constante") return true;              // π, e, τ, φ: ninguna es 0
  return base.clase === "literal" && !esCeroN(base.numero);
}

// ─────────────────────────────────────────────
// Potencias
// ─────────────────────────────────────────────

function normalizarPotencia(base: Expresion, exponente: Expresion): Expresion {
  // Números a un exponente entero: se pliega EXACTO. `2^3` → 8, `(1/2)^-2` → 4.
  if (base.clase === "literal" && exponente.clase === "literal") {
    const k = enteroDe(exponente.numero);
    if (k !== null) {
      const v = potenciaN(base.numero, k);
      if (v !== null) return literal(v);
    }
  }
  // `u^1 → u` es seguro siempre: los dos lados existen exactamente donde exista u.
  if (exponente.clase === "literal" && esUnoN(exponente.numero)) return base;
  // `u^0 → 1` NO lo es: ver `juntarExponentes`.
  if (exponente.clase === "literal" && esCeroN(exponente.numero) && baseNoNula(base)) return UNO_E;

  // `u^(p/2) → √(u^p)`, con p entero POSITIVO. Las dos son la misma función, sin condición: en
  // los reales `u^0.5` y `√u` son las dos NaN cuando u < 0, y ahí donde u ≥ 0 valen lo mismo.
  // Como la fracción llega reducida, un denominador 2 obliga a que p sea impar, y entonces `u^p`
  // conserva el signo de u: los dominios coinciden también en el caso general `u^(3/2) = √(u³)`.
  //
  // Sirve para que dos formas de escribir lo mismo dejen de ser dos cosas. Hoy `\sqrt{x}`,
  // `x^{1/2}` y `x^{0.5}` llegan al motor como tres expresiones distintas —el lector histórico
  // reescribe la segunda y no la tercera—, y sin esta regla la forma canónica heredaría esa
  // diferencia, que es tipográfica y no matemática.
  //
  // Va en la dirección de la RAÍZ y no de la potencia, y no es indiferente: convertir `√u` en
  // `u^(1/2)` lo pondría al alcance de `juntarExponentes`, que sumaría `u^(1/2)·u^(1/2) → u`.
  // Eso cambia el dominio —el producto es NaN en los negativos y `u` no— y la guarda de
  // `juntarExponentes` no lo ve, porque mira si la base está siempre definida y `x` lo está.
  // Dejar la raíz como aplicación la mantiene opaca, que es justo lo que aquí hace falta.
  if (exponente.clase === "literal" && exponente.numero.clase === "racional") {
    const { n: p, d: q } = exponente.numero.valor;
    if (q === 2n && p > 0n) {
      return aplicacion("sqrt", [p === 1n ? base : normalizarPotencia(base, literal(enteroN(p)))]);
    }
  }

  // `(u^a)^b → u^(a·b)` se deja FUERA a propósito: es falsa en general —`(x²)^(1/2)` es `|x|`,
  // no `x`— y la versión correcta lleva condición, así que es asunto de la reescritura con
  // condiciones y no de la forma canónica.
  return potencia(base, exponente);
}

// ─────────────────────────────────────────────
// El normalizador
// ─────────────────────────────────────────────

/**
 * La forma canónica de una expresión. De abajo arriba: se normalizan los hijos y después el
 * nodo, así que cada regla trabaja sobre hijos ya canónicos y no hace falta iterar hasta un
 * punto fijo (lo que a su vez garantiza que termina).
 *
 * IDEMPOTENTE: `normalizar(normalizar(e))` es `normalizar(e)`, comprobado como ley sobre lotes
 * generados. Sin esa propiedad, «forma canónica» no querría decir nada.
 */
export function normalizar(e: Expresion): Expresion {
  switch (e.clase) {
    case "literal":
    case "simbolo":
    case "constante":
      return e;

    case "suma":
      return normalizarSuma(e.sumandos.map(normalizar));
    case "producto":
      return normalizarProducto(e.factores.map(normalizar));
    case "potencia":
      return normalizarPotencia(normalizar(e.base), normalizar(e.exponente));

    case "aplicacion":
      // Los argumentos se normalizan; la función NO se toca. Las identidades (`sin(−u) =
      // −sin u`, `log(e^u) = u`) son reescrituras con nombre, no forma canónica.
      return aplicacion(e.funcion, e.args.map(normalizar));

    case "rama": {
      const a = normalizar(e.alternativas[0]), b = normalizar(e.alternativas[1]);
      // Si las dos alternativas resultan ser la misma expresión, el ± no abre nada: es una sola
      // curva escrita como si fueran dos. Colapsarla es seguro porque las dos ramas ya coinciden.
      return iguales(a, b) ? a : rama(e.eje, [a, b]);
    }

    case "condicionado": {
      const cuerpo = normalizar(e.cuerpo);
      return condicionado(cuerpo, normalizarCondicion(e.condicion));
    }

    case "familia":
      return familia(e.parametro, e.conjunto, normalizar(e.paso));
  }
}

function normalizarCondicion(c: Condicion): Condicion {
  if (c.tipo === "y") {
    // Conjunción: se normaliza cada parte, se ordenan y se quitan las repetidas. Que el orden
    // de las guardas no cuente es lo que hace que dos despejes que descubrieron las mismas
    // condiciones en distinto orden acaben en la misma expresión.
    const partes = c.partes.map(normalizarCondicion);
    const unicas: typeof partes = [];
    for (const p of partes) if (!unicas.some((q) => mismaCondicion(p, q))) unicas.push(p);
    const ordenadas = [...unicas].sort(compararCondicion);
    return ordenadas.length === 1 ? ordenadas[0] : { tipo: "y", partes: ordenadas };
  }
  return { tipo: c.tipo, expr: normalizar(c.expr) };
}

const mismaCondicion = (
  a: Condicion, b: Condicion
): boolean => compararCondicion(a, b) === 0;

/** Orden entre condiciones, apoyado en el de expresiones. Vive aquí y no en `orden.ts` porque
 *  solo lo necesita la normalización de conjunciones. */
function compararCondicion(
  a: Condicion, b: Condicion
): number {
  if (a.tipo !== b.tipo) return a.tipo < b.tipo ? -1 : 1;
  if (a.tipo === "y" && b.tipo === "y") {
    const n = Math.min(a.partes.length, b.partes.length);
    for (let i = 0; i < n; i++) {
      const c = compararCondicion(a.partes[i], b.partes[i]);
      if (c !== 0) return c;
    }
    return a.partes.length - b.partes.length;
  }
  if (a.tipo === "y" || b.tipo === "y") return a.tipo === "y" ? 1 : -1;
  return comparar(a.expr, b.expr);
}
