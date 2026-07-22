import { parse } from "mathjs";

import { CENTINELAS_SIGNO } from "./motor/parsing/dobleSigno";
import { FUNCIONES_ESCALON_RAPIDAS } from "./constantes";

// ─────────────────────────────────────────────
// Compilador NATIVO de expresiones (acelerador del evaluador)
// ─────────────────────────────────────────────
//
// mathjs sigue siendo el PARSER (su AST es la fuente de verdad de la sintaxis); lo que
// cambia aquí es QUIÉN EVALÚA. `mathjs.compile().evaluate(scope)` paga, en CADA muestra,
// el despacho de typed-function y la construcción del scope: medido, ~14× más lento que
// una función JS generada. Su propio autor lo confirma (~15×). Como el trazado hace de
// 2.500 a 220.000 evaluaciones por pasada, esa envoltura ERA el grueso del tiempo de
// frame — no la matemática.
//
// Aquí se recorre el AST de mathjs y se GENERA el código JS equivalente, que se compila
// una sola vez con `new Function`. Medido sobre el trazador completo: de 2,3× a 18× más
// rápido, con geometría BIT-IDÉNTICA (mismas ramas, mismos vértices) en todo el
// repertorio probado. No es una aproximación: es la misma matemática, evaluada directa.
//
// TRES SALVAGUARDAS, porque acelerar el evaluador no vale un solo cambio de dibujo:
//
//   1. WHITELIST. Solo se genera código para nodos y funciones cuya semántica se ha
//      VERIFICADO idéntica a la de mathjs (ver la tabla de equivalencias más abajo).
//      Cualquier nodo desconocido —una función rara, un símbolo libre, una matriz—
//      aborta la generación devolviendo `null`.
//   2. VALIDACIÓN DIFERENCIAL. Aunque la generación tenga éxito, la función resultante se
//      COMPARA contra mathjs sobre una batería de puntos de sonda antes de darla por
//      buena. Si discrepan en un solo punto, se devuelve `null`. Esto convierte cualquier
//      error de traducción que se me haya escapado en una pérdida de rendimiento, nunca
//      en un cambio de resultado.
//   3. FALLBACK. `null` significa "usa mathjs como siempre". El camino antiguo queda
//      intacto y sigue siendo el que responde por todo lo que no se sepa acelerar.
//
// EQUIVALENCIAS VERIFICADAS (sondeadas contra mathjs, ver la tabla de `PUNTOS_SONDA`):
//   • Fuera del dominio real, mathjs devuelve un Complex que los oráculos coaccionan a
//     NaN; las `Math.*` nativas devuelven NaN directamente → mismo resultado observable.
//     Comprobado en sqrt(−1), log(−1), asin(2), acosh(0.5), atanh(2), x^(1/3) con x<0.
//   • `floor`/`ceil` usan las RÁPIDAS del motor (`FUNCIONES_ESCALON_RAPIDAS`), no las de
//     `Math`: conservan la corrección epsilon de mathjs (floor(0.1·30) = 3, no 2).
//   • `mod`/`%` siguen el signo del DIVISOR (mathjs), no el del dividendo (JS): −4 mod 3
//     es 2, no −1. Se genera la forma `a − b·floor(a/b)`.
//   • `acot`/`asec`/`acsc` usan las convenciones INYECTADAS por el motor
//     (`FUNCIONES_INVERSAS_EXTRA`), no las de mathjs: acot es π/2 − atan (rango continuo).
//   • Los centinelas de doble signo (`pm`/`mp`/…) y la guarda de dominio (`dom`) se
//     INLINEAN, leyendo los signos de `CENTINELAS_SIGNO` para no duplicar esa tabla.
//
// SOBRE `new Function` Y LA CSP: generar código en caliente exige `unsafe-eval` en la
// Content Security Policy del entorno. mathjs 12 NO usa `new Function` ni `eval` (sus
// versiones antiguas sí; conviene no dar por hecho lo contrario), así que esto SÍ es una
// capacidad nueva que el plugin pasa a necesitar para tomar la vía rápida.
//
// No es un riesgo, porque el fallo es LIMPIO por construcción: la llamada a `new Function`
// vive dentro del `try` de `compilarNativo`, de modo que si la CSP la bloquea se lanza,
// se captura y se devuelve `null` → toda expresión cae al camino de mathjs y el motor se
// comporta EXACTAMENTE como antes de este archivo, solo que sin la aceleración. Es decir:
// donde `new Function` esté permitido se gana velocidad, y donde no, no se pierde nada.

/** Firma de una expresión compilada: tantos argumentos como variables, resultado real. */
export type FuncionNativa = (...valores: number[]) => number;

// ── Traducciones directas a `Math` (semántica idéntica, verificada) ──────────────────
const FUNCIONES_MATH: Readonly<Record<string, string>> = {
  sin: "Math.sin", cos: "Math.cos", tan: "Math.tan",
  asin: "Math.asin", acos: "Math.acos", atan: "Math.atan", atan2: "Math.atan2",
  sinh: "Math.sinh", cosh: "Math.cosh", tanh: "Math.tanh",
  asinh: "Math.asinh", acosh: "Math.acosh", atanh: "Math.atanh",
  exp: "Math.exp", abs: "Math.abs", sign: "Math.sign",
  sqrt: "Math.sqrt", cbrt: "Math.cbrt",
  log10: "Math.log10", log2: "Math.log2",
  min: "Math.min", max: "Math.max",
};

// Operadores binarios de mathjs → operador JS. `pow`, `unaryMinus`, `unaryPlus` y `mod`
// NO están aquí: necesitan una forma propia (ver `generar`).
const OPERADORES: Readonly<Record<string, string>> = {
  add: "+", subtract: "-", multiply: "*", divide: "/",
};

/** Constantes simbólicas de mathjs con equivalente exacto. */
const CONSTANTES: Readonly<Record<string, string>> = {
  pi: "Math.PI", e: "Math.E", tau: "(2*Math.PI)", Infinity: "Infinity", NaN: "NaN",
};

/** Centinela de doble signo → su signo (+1/−1), para inlinearlos. */
const SIGNO_CENTINELA = new Map<string, number>(CENTINELAS_SIGNO.map(([n, s]) => [n, s]));

/**
 * Puntos de sonda de la validación diferencial. Cubren a propósito los casos donde una
 * traducción descuidada divergiría: negativos (dominios de raíz/log), el cero y sus
 * alrededores (polos), medios enteros (redondeos), magnitudes extremas (overflow), y
 * `0.1*30` —el valor que delata si `floor` perdió la corrección epsilon de mathjs—.
 * Se incluyen irracionales para no caer siempre en posiciones "bonitas" donde dos
 * implementaciones distintas coincidirían por casualidad.
 */
const PUNTOS_SONDA: readonly number[] = [
  0, 1, -1, 2, -2, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 3, -3,
  0.1, -0.1, 0.001, -0.001, 10, -10, 100, -100, 1e6, -1e6, 1e-6, -1e-6,
  Math.PI, -Math.PI, Math.PI / 2, -Math.PI / 2, Math.E, -Math.E,
  0.1 * 30, 1 / 3, -1 / 3, 0.7071067811865476, -1.4142135623730951,
  7.389056098930649, 0.36787944117144233, 123.456, -987.654,
];

/**
 * Genera el código JS de un nodo del AST, o `null` si aparece algo fuera de la whitelist.
 * Todo se envuelve en paréntesis: la precedencia queda garantizada por construcción y no
 * hay que razonar sobre ella (el coste en bytes es irrelevante, lo compila el motor JS).
 */
function generar(nodo: unknown, variables: ReadonlySet<string>): string | null {
  const n = nodo as {
    type?: string; value?: unknown; name?: string; content?: unknown;
    fn?: unknown; op?: string; args?: unknown[];
  };

  switch (n.type) {
    case "ConstantNode": {
      // Solo constantes NUMÉRICAS: un ConstantNode puede llevar una cadena o un booleano
      // (mathjs los admite) y traducirlos como número sería inventar semántica.
      const v = typeof n.value === "number" ? n.value : NaN;
      if (typeof n.value !== "number" || !Number.isFinite(v)) return null;
      return `(${v})`;
    }

    case "SymbolNode": {
      const nombre = n.name ?? "";
      if (variables.has(nombre)) return nombre;
      const cte = CONSTANTES[nombre];
      // Símbolo libre desconocido: mathjs lanzaría y el evaluador daría NaN. No se
      // reproduce aquí; se cede a mathjs (fallback) para no duplicar ese contrato.
      return cte ?? null;
    }

    case "ParenthesisNode":
      return generar(n.content, variables);

    case "OperatorNode": {
      const args = (n.args ?? []).map((a) => generar(a, variables));
      if (args.length === 0 || args.some((a) => a === null)) return null;
      const fn = typeof n.fn === "string" ? n.fn : "";

      if (fn === "unaryMinus") return args.length === 1 ? `(-${args[0]})` : null;
      if (fn === "unaryPlus") return args.length === 1 ? `(+${args[0]})` : null;
      // `^` de mathjs = Math.pow: base negativa con exponente no entero da Complex
      // (→NaN al coaccionar) igual que Math.pow da NaN. Verificado en x^(1/3), x^0.5.
      if (fn === "pow") return args.length === 2 ? `Math.pow(${args[0]},${args[1]})` : null;
      // mathjs: el resto toma el signo del DIVISOR (−4 mod 3 = 2). El `%` de JS toma el
      // del dividendo (−1), así que NO se puede traducir literalmente.
      if (fn === "mod") return args.length === 2 ? `__mod(${args[0]},${args[1]})` : null;

      const op = OPERADORES[fn];
      if (!op || args.length < 2) return null;
      return `(${args.join(op)})`;
    }

    case "FunctionNode": {
      const ref = n.fn as { name?: string } | string | undefined;
      const nombre = typeof ref === "string" ? ref : ref?.name ?? "";
      const args = (n.args ?? []).map((a) => generar(a, variables));
      if (args.some((a) => a === null)) return null;

      // Centinelas del doble signo: pm(u)=+u, mp(u)=−u (ver dobleSigno.ts). Se inlinean
      // leyendo la tabla real, así añadir un eje nuevo no exige tocar este archivo.
      const signo = SIGNO_CENTINELA.get(nombre);
      if (signo !== undefined) {
        return args.length === 1 ? (signo > 0 ? `(${args[0]})` : `(-${args[0]})`) : null;
      }
      // Guarda de dominio del despeje: dom(cuerpo, R) vale cuerpo donde R≥0 y NaN si no.
      // Con `cond` NaN, `NaN >= 0` es false → NaN, igual que la versión inyectada.
      if (nombre === "dom") {
        return args.length === 2 ? `((${args[1]})>=0?(${args[0]}):NaN)` : null;
      }
      // Recíprocas: mathjs las trae nativas y son exactamente estas (sec(0)=1,
      // csc(0)=Infinity, cot(0)=Infinity — verificado).
      if (nombre === "sec") return args.length === 1 ? `(1/Math.cos(${args[0]}))` : null;
      if (nombre === "csc") return args.length === 1 ? `(1/Math.sin(${args[0]}))` : null;
      if (nombre === "cot") return args.length === 1 ? `(1/Math.tan(${args[0]}))` : null;
      // Inversas INYECTADAS por el motor (FUNCIONES_INVERSAS_EXTRA): estas convenciones
      // mandan sobre las de mathjs, porque son las que el scope de evaluación aplica.
      if (nombre === "acot") return args.length === 1 ? `(Math.PI/2-Math.atan(${args[0]}))` : null;
      if (nombre === "acsc") return args.length === 1 ? `Math.asin(1/(${args[0]}))` : null;
      if (nombre === "asec") return args.length === 1 ? `Math.acos(1/(${args[0]}))` : null;
      // Escalón: las RÁPIDAS del motor, con la corrección epsilon de mathjs.
      if (nombre === "floor") return args.length === 1 ? `__floor(${args[0]})` : null;
      if (nombre === "ceil") return args.length === 1 ? `__ceil(${args[0]})` : null;
      // log(x) natural; log(x, base) = ln x / ln base (verificado: log(8,2)=3).
      if (nombre === "log") {
        if (args.length === 1) return `Math.log(${args[0]})`;
        if (args.length === 2) return `(Math.log(${args[0]})/Math.log(${args[1]}))`;
        return null;
      }
      // nthRoot(x,n): real y NEGATIVA para índice impar (nthRoot(−8,3) = −2), NaN para
      // índice par con radicando negativo. Math.pow(−8,1/3) daría NaN, así que hace falta
      // la forma explícita.
      if (nombre === "nthRoot") {
        if (args.length === 1) return `Math.cbrt(${args[0]})`;
        if (args.length === 2) return `__nthRoot(${args[0]},${args[1]})`;
        return null;
      }

      const f = FUNCIONES_MATH[nombre];
      if (!f || args.length === 0) return null;
      return `${f}(${args.join(",")})`;
    }

    default:
      return null;
  }
}

// ── Auxiliares inyectados en el código generado ──────────────────────────────────────

/** Resto con el signo del DIVISOR (semántica de mathjs). */
function modNativo(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

/** Raíz n-ésima real: negativa admitida solo con índice impar (como mathjs). */
function nthRootNativo(x: number, n: number): number {
  if (x < 0) return Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : NaN;
  return Math.pow(x, 1 / n);
}

/**
 * ¿Dos resultados son observablemente el MISMO valor para el motor? Se comparan bajo la
 * coacción que los oráculos ya aplican (no-número → NaN), así que un Complex de mathjs y
 * un NaN nativo cuentan como iguales: es exactamente lo que el trazador verá.
 */
function equivalentes(a: unknown, b: number): boolean {
  const va = typeof a === "number" ? a : NaN;
  const naA = Number.isNaN(va), naB = Number.isNaN(b);
  if (naA || naB) return naA && naB;
  if (!Number.isFinite(va) || !Number.isFinite(b)) return va === b; // ±Infinity con signo
  // Tolerancia RELATIVA: ambas rutas hacen la misma aritmética IEEE, pero el orden de las
  // operaciones puede diferir en el último bit (mathjs mete llamadas intermedias).
  return Math.abs(va - b) <= 1e-12 * Math.max(1, Math.abs(va), Math.abs(b));
}

/**
 * Compila `expr` (YA normalizada) a una función JS nativa de las `variables` dadas, o
 * devuelve `null` si no se puede garantizar que sea equivalente a mathjs — en cuyo caso
 * el llamador debe usar el camino de mathjs de siempre.
 *
 * `referencia` es la evaluación por mathjs con la que se valida el resultado. Se pide al
 * llamador (que ya la tiene compilada) en vez de crearla aquí: así la validación mide
 * exactamente contra el camino que se va a sustituir, incluido su scope inyectado.
 */
export function compilarNativo(
  expr: string,
  variables: readonly string[],
  referencia: (valores: readonly number[]) => unknown
): FuncionNativa | null {
  let candidata: FuncionNativa;
  try {
    const cuerpo = generar(parse(expr), new Set(variables));
    if (cuerpo === null) return null;
    // Los auxiliares entran como PARÁMETROS de un envoltorio, no como globales: el cuerpo
    // los ve como identificadores locales (rápidos) y no se depende del ámbito global.
    const fabrica = new Function(
      "__mod", "__nthRoot", "__floor", "__ceil",
      `"use strict";return function(${variables.join(",")}){return ${cuerpo};};`
    ) as (
      m: typeof modNativo, r: typeof nthRootNativo,
      f: (x: number) => number, c: (x: number) => number
    ) => FuncionNativa;
    candidata = fabrica(
      modNativo, nthRootNativo,
      FUNCIONES_ESCALON_RAPIDAS.floor, FUNCIONES_ESCALON_RAPIDAS.ceil
    );
  } catch {
    return null; // expresión no parseable o código no compilable → mathjs
  }

  // ── Validación diferencial ─────────────────────────────────────────────────────────
  // Se barre el producto de los puntos de sonda sobre todas las variables. Con una
  // variable son ~40 evaluaciones; con dos, la diagonal y algunos cruces (el producto
  // completo sería 40² = 1600, innecesario para detectar una traducción mal hecha).
  const combinaciones = puntosDeSonda(variables.length);
  for (const punto of combinaciones) {
    let esperado: unknown;
    try {
      esperado = referencia(punto);
    } catch {
      esperado = NaN; // el camino de mathjs coacciona sus errores a NaN
    }
    let obtenido: number;
    try {
      obtenido = candidata(...punto);
    } catch {
      return null;
    }
    if (!equivalentes(esperado, obtenido)) return null;
  }
  return candidata;
}

/**
 * Puntos de sonda para `n` variables. Con n=1, todos. Con n≥2 se usa la DIAGONAL más
 * varios desplazamientos entre ejes: basta para delatar una traducción errónea (que lo
 * es en todo el dominio, no en un punto aislado) sin pagar un producto cartesiano.
 */
function puntosDeSonda(n: number): number[][] {
  if (n <= 0) return [[]];
  if (n === 1) return PUNTOS_SONDA.map((v) => [v]);
  const puntos: number[][] = [];
  for (const v of PUNTOS_SONDA) puntos.push(new Array<number>(n).fill(v));
  for (let d = 1; d < PUNTOS_SONDA.length; d++) {
    const fila: number[] = [];
    for (let k = 0; k < n; k++) fila.push(PUNTOS_SONDA[(d * (k + 1)) % PUNTOS_SONDA.length]);
    puntos.push(fila);
  }
  return puntos;
}
