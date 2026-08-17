// ─────────────────────────────────────────────
// math · Dominio de una expresión: qué condiciones necesita para existir
// ─────────────────────────────────────────────
//
// El plugin comprueba que una transformación conserva la función MUESTREÁNDOLA en una decena de
// puntos «anodinos» —no enteros, de los dos signos, cerca y lejos del origen— elegidos para no
// caer justo en una raíz. Esa guarda funciona bien contra el error grande: si una forma amplía
// el dominio en todo un INTERVALO (`√u² → u` para u<0), alguna de las muestras cae dentro y la
// diferencia salta.
//
// Contra el error pequeño no funciona, y por construcción: un dominio que cambia en un solo
// PUNTO no lo ve nadie que se dedique a evitar los puntos especiales. Es exactamente el caso
// clásico:
//
//     x²/x  →  x        difieren SOLO en x = 0
//     (x²−1)/(x−1) → x+1   difieren SOLO en x = 1
//
// La primera la hacía el simplificador y se colaba entera. No es un fallo de la muestra: es que
// la muestra no puede saber dónde mirar. Este módulo se lo dice.
//
// La idea es leer del ÁRBOL las condiciones que la expresión necesita para existir —un
// denominador que no se anule, un radicando par no negativo, un argumento de logaritmo
// positivo, un argumento de arcoseno acotado— y de ahí sacar dos cosas:
//
//   • PUNTOS DE QUIEBRE: dónde una de esas condiciones está justo en su frontera. Son los
//     puntos que la muestra tiene que visitar, y se calculan EXACTOS cuando la condición es
//     polinómica (reusando el motor de raíces reales del propio CAS).
//   • VIOLACIÓN: si en un punto dado alguna condición se incumple. Esto es lo que decide, y es
//     SEMÁNTICO, no numérico: `1/x` no está definida en 0 porque su denominador se anula, y da
//     igual que en coma flotante `1/0` valga `Infinity` y que `(1/x)^(-1)` valga entonces 0.
//     Comparar los números habría dado por buena `(1/x)^(-1) → x`; comparar los dominios no.
//
// Lo que este módulo NO hace es decidir implicaciones entre condiciones («¿x²≥0 implica x≠0?»).
// No hace falta: quien pregunta ya tiene los puntos donde eso se nota, y ahí se comprueba.

import { parse } from "mathjs";

import { type Nodo } from "../formatoExpr";
import { compilarExpresion } from "../evaluador";
import { ecuacionAPolinomio } from "./extraer";
import { gradoY, sustituirX } from "./polinomio2";
import { raicesReales, type Polinomio } from "./polinomio";
import { CERO } from "./racional";

/**
 * Una condición que la expresión necesita para estar definida. `expr` es el subárbol al que se
 * le exige (el denominador, el radicando, el argumento del logaritmo…).
 *
 *   • `noCero`      `expr ≠ 0`    denominador, o base de una potencia negativa
 *   • `noNegativo`  `expr ≥ 0`    radicando de índice PAR
 *   • `positivo`    `expr > 0`    argumento de un logaritmo
 *   • `acotado`     `|expr| ≤ 1`  argumento de arcoseno / arcocoseno
 */
export type TipoRestriccion = "noCero" | "noNegativo" | "positivo" | "acotado";

export interface Restriccion {
  readonly tipo: TipoRestriccion;
  /** El subárbol condicionado, como string mathjs re-parseable. */
  readonly expr: string;
}

/** Funciones cuyo primer argumento tiene que ser ≥ 0 (raíz de índice par). */
const RAIZ_PAR = new Set(["sqrt"]);
/** Funciones cuyo primer argumento tiene que ser > 0. */
const LOGARITMO = new Set(["log", "log10", "log2", "ln"]);
/** Funciones cuyo primer argumento tiene que estar en [−1, 1]. */
const ARCO_ACOTADO = new Set(["asin", "acos", "arcsin", "arccos"]);

const desParen = (n: Nodo): Nodo => (n.type === "ParenthesisNode" ? desParen(n.content) : n);

/**
 * Las variables LIBRES de una expresión: los símbolos que no son constantes con nombre ni el
 * nombre de una función. Lo último importa —el `fn` de un `FunctionNode` es también un
 * `SymbolNode` en mathjs—, porque contar `sqrt` como variable haría que toda expresión con
 * funciones pareciera depender de una variable inexistente.
 */
export function variablesLibresDe(exprNorm: string): string[] {
  try {
    const nombres = new Set<string>();
    (parse(exprNorm) as unknown as Nodo).filter(
      (n: Nodo, camino: string, padre: Nodo | null) =>
        n.type === "SymbolNode" && !(padre !== null && padre.type === "FunctionNode" && camino === "fn")
    ).forEach((n) => { if (!CONSTANTES.has(n.name)) nombres.add(n.name); });
    return [...nombres];
  } catch { return []; }
}

/** El valor de un nodo constante, o `null` si no lo es. */
function constante(n0: Nodo): number | null {
  const n = desParen(n0);
  if (n.type === "ConstantNode") return Number(n.value);
  if (n.type === "OperatorNode" && n.args.length === 1 && n.op === "-") {
    const v = constante(n.args[0]);
    return v === null ? null : -v;
  }
  // `1/2`, `3/4`: los exponentes racionales llegan así del normalizador.
  if (n.type === "OperatorNode" && n.args.length === 2 && n.op === "/") {
    const a = constante(n.args[0]), b = constante(n.args[1]);
    return a === null || b === null || b === 0 ? null : a / b;
  }
  return null;
}

/**
 * ¿El exponente obliga a que la base sea ≥ 0? Lo hace cuando es un racional de denominador PAR
 * (`u^(1/2)`, `u^(3/4)`): esa potencia es una raíz par disfrazada. Un exponente entero no obliga
 * a nada, y uno irracional (`u^π`) sí obligaría, pero no se afirma sobre lo que no se reconoce.
 */
function exponenteDeRaizPar(e: number): boolean {
  if (!Number.isFinite(e) || Number.isInteger(e)) return false;
  for (let q = 2; q <= 64; q += 1) {
    const p = e * q;
    if (Math.abs(p - Math.round(p)) < 1e-12) return q % 2 === 0;
  }
  return false;
}

/**
 * Las condiciones de dominio de la expresión, recorriendo el árbol entero. Devuelve `[]` si no
 * necesita ninguna (un polinomio) y `null` si no se puede ni leer.
 *
 * Es deliberadamente INCOMPLETA en un punto: los polos de `tan`, `cot`, `sec` y `csc` no se
 * emiten. No son la anulación de un subárbol sino un retículo infinito de puntos, y meterlos
 * como condición exigiría un lenguaje que este módulo no tiene. Quien pregunte por ellos seguirá
 * teniendo la muestra numérica, que los ve igual que antes.
 */
/**
 * Caché de la lectura de condiciones. No es un lujo: el guardián pregunta por el dominio en cada
 * punto de prueba —una veintena por comparación—, y sin caché volvía a parsear y recorrer el
 * árbol entero cada vez. El tope existe porque las claves son expresiones de usuario y una nota
 * larga podría hacer crecer el mapa sin fin.
 */
const CACHE = new Map<string, Restriccion[] | null>();
const CACHE_MAX = 512;

export function restriccionesDe(exprNorm: string): Restriccion[] | null {
  const guardado = CACHE.get(exprNorm);
  if (guardado !== undefined) return guardado;
  const calculado = leerRestricciones(exprNorm);
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(exprNorm, calculado);
  return calculado;
}

function leerRestricciones(exprNorm: string): Restriccion[] | null {
  let raiz: Nodo;
  try { raiz = parse(exprNorm) as unknown as Nodo; } catch { return null; }

  const out: Restriccion[] = [];
  const anotar = (tipo: TipoRestriccion, n: Nodo) => {
    const expr = desParen(n).toString();
    // Una condición SIN variables no condiciona nada: o es cierta siempre (`2 ≠ 0`, del
    // denominador de un exponente `1/2`) o la expresión no existe en ningún punto, y eso ya lo
    // dice al evaluarla. Guardarla solo añadiría barridos inútiles.
    if (variablesLibresDe(expr).length === 0) return;
    if (!out.some((r) => r.tipo === tipo && r.expr === expr)) out.push({ tipo, expr });
  };

  const visitar = (n0: Nodo): void => {
    const n = desParen(n0);
    if (n.type === "OperatorNode") {
      if (n.op === "/" && n.args.length === 2) anotar("noCero", n.args[1]);
      if (n.op === "^" && n.args.length === 2) {
        const e = constante(n.args[1]);
        if (e !== null && e < 0) anotar("noCero", n.args[0]);
        if (e !== null && exponenteDeRaizPar(e)) anotar("noNegativo", n.args[0]);
      }
    } else if (n.type === "FunctionNode") {
      const nombre = n.fn?.name ?? "";
      const arg = n.args[0];
      if (arg) {
        if (RAIZ_PAR.has(nombre)) anotar("noNegativo", arg);
        if (LOGARITMO.has(nombre)) anotar("positivo", arg);
        if (ARCO_ACOTADO.has(nombre)) anotar("acotado", arg);
        if (nombre === "nthRoot" && n.args.length === 2) {
          const k = constante(n.args[1]);
          if (k !== null && Number.isInteger(k) && k % 2 === 0) anotar("noNegativo", arg);
        }
      }
    }
    n.forEach((h: Nodo) => visitar(h));
  };

  try { visitar(raiz); } catch { return null; }
  return out;
}

/**
 * Compilación reutilizada. `compilarExpresion` parsea y compila en CADA llamada, y aquí la misma
 * condición se evalúa en una veintena de puntos —y el barrido la evalúa tres mil veces—: sin
 * esto, el guardián pagaba una compilación de mathjs por punto.
 */
const COMPILADAS = new Map<string, ((s: Record<string, number>) => unknown) | null>();

function compilada(expr: string): ((s: Record<string, number>) => unknown) | null {
  const guardada = COMPILADAS.get(expr);
  if (guardada !== undefined) return guardada;
  let f: ((s: Record<string, number>) => unknown) | null;
  try { f = compilarExpresion(expr); } catch { f = null; }
  if (COMPILADAS.size >= CACHE_MAX) COMPILADAS.clear();
  COMPILADAS.set(expr, f);
  return f;
}

/** El valor de la condición en ese punto, o `NaN` si no se puede evaluar. */
function valorDe(expr: string, scope: Record<string, number>): number {
  const f = compilada(expr);
  if (f === null) return NaN;
  try {
    const v = f(scope);
    return typeof v === "number" ? v : NaN;
  } catch { return NaN; }
}

/** Margen con el que se considera que una condición está EN su frontera. */
const EPS = 1e-12;

/** ¿Esta condición concreta se incumple con esos valores? Un valor que no se puede evaluar no
 *  incumple nada: el módulo no afirma sobre lo que no sabe. */
function violaUna(r: Restriccion, scope: Record<string, number>): boolean {
  const v = valorDe(r.expr, scope);
  if (!Number.isFinite(v)) return false;
  switch (r.tipo) {
    case "noCero": return Math.abs(v) <= EPS;
    case "noNegativo": return v < -EPS;
    case "positivo": return v <= EPS;
    case "acotado": return Math.abs(v) > 1 + EPS;
  }
}

/**
 * ¿La expresión está FUERA de su dominio en ese punto? Es la pregunta semántica: se responde
 * mirando las condiciones, no el número que salga de evaluar.
 *
 * La diferencia importa. `1/x` en x=0 vale `Infinity` en coma flotante, así que `(1/x)^(-1)`
 * vale 0 —un número perfectamente finito e igual al de `x`—. Comparando valores, la
 * transformación `(1/x)^(-1) → x` pasa por buena; comparando dominios, se ve que la primera
 * exige `x ≠ 0` y la segunda no.
 */
export function fueraDeDominio(exprNorm: string, scope: Record<string, number>): boolean {
  const rs = restriccionesDe(exprNorm);
  if (rs === null) return false;
  return rs.some((r) => violaUna(r, scope));
}

// ── Puntos de quiebre ────────────────────────────────────────────────────────
//
// Dónde mirar. Son los ceros de cada condición (y también los ±1 de un arco acotado): la
// frontera entre estar dentro y estar fuera del dominio.

/** Rango y densidad del barrido de reserva, para condiciones que no son polinómicas. */
const BARRIDO_MIN = -30;
const BARRIDO_MAX = 30;
const BARRIDO_PASOS = 3000;
const BISECCIONES = 60;
/** Tope de puntos devueltos: una condición periódica tiene infinitos ceros y la muestra no
 *  puede crecer sin fin. Con los primeros basta para detectar el cambio de dominio. */
const MAX_PUNTOS = 12;

/** Constantes con nombre que no son variables libres (misma lista que el resto del plugin). */
const CONSTANTES = new Set(["pi", "e", "tau", "phi", "Infinity", "NaN"]);

/**
 * Ceros EXACTOS de la condición cuando es polinómica en la variable pedida. Reutiliza el motor
 * de raíces del propio CAS —extracción a ℚ y aislamiento por Sturm—, así que un cero racional
 * sale como el número que es y no como su aproximación: importa, porque el punto se va a
 * EVALUAR, y evaluar `x²/x` en 1e-13 da 1e-13, un número perfectamente finito que no delata
 * nada. El agujero solo se ve pisándolo exactamente.
 */
function cerosPolinomicos(expr: string, variable: string): number[] | null {
  const eq = ecuacionAPolinomio(`${expr} = 0`);
  if (eq === null) return null;
  let p: Polinomio;
  if (variable === "y") {
    p = sustituirX(eq.p, CERO);
  } else {
    if (gradoY(eq.p) > 0) return null;   // depende también de y: no es una raíz de una variable
    p = eq.p[0] ?? [];
  }
  if (p.length === 0) return null;       // idénticamente nulo: no parte nada
  return raicesReales(p).map((r) => (r.exacto !== null ? Number(r.exacto.n) / Number(r.exacto.d) : r.valor));
}

/** Ceros por barrido con cambio de signo y bisección, para lo que no es polinómico. */
function cerosPorBarrido(expr: string, variable: string): number[] {
  const f = (x: number): number => valorDe(expr, { [variable]: x });
  const out: number[] = [];
  const paso = (BARRIDO_MAX - BARRIDO_MIN) / BARRIDO_PASOS;
  let xa = BARRIDO_MIN, va = f(xa);
  for (let i = 1; i <= BARRIDO_PASOS && out.length < MAX_PUNTOS; i++) {
    const xb = BARRIDO_MIN + i * paso, vb = f(xb);
    if (Number.isFinite(va) && Number.isFinite(vb) && va !== 0 && vb !== 0 && (va < 0) !== (vb < 0)) {
      let a = xa, b = xb, fa = va;
      for (let k = 0; k < BISECCIONES; k++) {
        const m = (a + b) / 2, fm = f(m);
        if (!Number.isFinite(fm)) break;
        if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
      }
      out.push(redondear((a + b) / 2, expr, variable));
    }
    if (va === 0) out.push(xa);
    xa = xb; va = vb;
  }
  return out;
}

/** Ajusta la raíz a un valor «redondo» si ahí la condición se anula de verdad: la bisección deja
 *  1e-15 de error, y en un agujero de dominio ese 1e-15 es la diferencia entre verlo y no verlo. */
function redondear(x: number, expr: string, variable: string): number {
  for (const cand of [Math.round(x), Math.round(x * 2) / 2, Math.round(x * 4) / 4, Math.round(x * 1e6) / 1e6]) {
    if (Math.abs(cand - x) < 1e-6 && valorDe(expr, { [variable]: cand }) === 0) return cand;
  }
  return x;
}

/**
 * Los puntos de `variable` donde el dominio de la expresión puede cambiar: los ceros de sus
 * condiciones y, en un arco acotado, también los ±1.
 *
 * Solo se responden las condiciones que dependen de ESA variable y de ninguna otra. Una
 * condición en dos variables (`x·y ≠ 0`) no define puntos sino una curva, y devolver medio
 * resultado sería peor que devolver ninguno: quien pregunta se queda con la muestra de siempre,
 * que es lo que ya tenía.
 */
export function puntosDeQuiebre(exprNorm: string, variable: string): number[] {
  const rs = restriccionesDe(exprNorm);
  if (rs === null || rs.length === 0) return [];
  const out: number[] = [];
  for (const r of rs) {
    const vars = variablesLibresDe(r.expr);
    if (vars.length !== 1 || vars[0] !== variable) continue;
    // Un arco acotado cambia de dominio en |u| = 1, no en u = 0.
    const objetivos = r.tipo === "acotado"
      ? [`(${r.expr}) - 1`, `(${r.expr}) + 1`]
      : [r.expr];
    for (const obj of objetivos) {
      const exactos = cerosPolinomicos(obj, variable);
      for (const v of exactos ?? cerosPorBarrido(obj, variable))
        if (Number.isFinite(v) && !out.some((w) => Math.abs(w - v) < 1e-9)) out.push(v);
    }
    if (out.length >= MAX_PUNTOS) break;
  }
  return out.slice(0, MAX_PUNTOS);
}

// ── El guardián: ¿son la misma función? ──────────────────────────────────────

/**
 * Muestra «anodina»: no entera, de los dos signos, cerca y lejos del origen. Está elegida para
 * NO caer en raíces ni simetrías, que es justo lo que la hace buena detectando diferencias en
 * un intervalo y ciega ante un punto suelto. Los puntos de quiebre son el complemento.
 */
const MUESTRA = [-7.3, -2.6, -1.2, -0.7, -0.3, 0.4, 1.1, 2.7, 5.8, 11.4];

/** Los escenarios donde se comparan dos formas: la muestra, más un escenario por cada punto de
 *  quiebre de cualquiera de las dos, en la variable a la que pertenece. */
function escenarios(a: string, b: string, vars: readonly string[]): Record<string, number>[] {
  const base = (i: number): Record<string, number> => {
    const scope: Record<string, number> = {};
    vars.forEach((v, k) => { scope[v] = MUESTRA[(i + 3 * k) % MUESTRA.length]; });
    return scope;
  };
  const out = MUESTRA.map((_, i) => base(i));
  for (const v of vars)
    for (const q of [...puntosDeQuiebre(a, v), ...puntosDeQuiebre(b, v)])
      out.push({ ...base(0), [v]: q });
  return out;
}

/**
 * ¿`a` y `b` (strings mathjs ya normalizados) son la MISMA función: el mismo valor y el mismo
 * dominio? Es el guardián que decide si una transformación se adopta o se descarta, y lo usan
 * tanto el simplificador como la derivada.
 *
 * Comprueba dos cosas distintas, y hacen falta las dos:
 *
 *   • El VALOR sobre la muestra, incluida su no-finitud. Basta para el error grande: una forma
 *     que amplía el dominio en todo un intervalo (`√u² → u` con u<0) cae dentro de alguna
 *     muestra y se delata.
 *   • El DOMINIO sobre los puntos de quiebre, preguntándole a las CONDICIONES y no a los
 *     números. Es lo que hace falta para el error pequeño, y no es un refinamiento del anterior
 *     sino otra pregunta: en coma flotante el punto puede no delatarse nunca (`1/0` es
 *     `Infinity`, así que `(1/x)^(-1)` vale 0 en x=0 y coincide con `x`).
 *
 * Conservador por diseño: ante un error o una duda devuelve `false`, y quien llama se queda con
 * la forma que ya tenía. Su fallo posible es «no simplifico», nunca «simplifico mal».
 */
export function mismaFuncion(a: string, b: string): boolean {
  try {
    const vars = [...new Set([...variablesLibresDe(a), ...variablesLibresDe(b)])];
    const fa = compilada(a), fb = compilada(b);
    if (fa === null || fb === null) return false;
    // Las condiciones se leen UNA vez, no una por punto de prueba.
    const ra = restriccionesDe(a) ?? [], rb = restriccionesDe(b) ?? [];
    return escenarios(a, b, vars).every((scope) => {
      if (ra.some((r) => violaUna(r, scope)) !== rb.some((r) => violaUna(r, scope))) return false;
      const va = fa(scope), vb = fb(scope);
      const finA = typeof va === "number" && Number.isFinite(va);
      const finB = typeof vb === "number" && Number.isFinite(vb);
      if (!finA || !finB) return finA === finB;
      return Math.abs(va - vb) <= 1e-8 * (1 + Math.abs(va));
    });
  } catch { return false; }
}
