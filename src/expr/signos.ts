// ─────────────────────────────────────────────
// expr · Análisis de SIGNO (interpretación abstracta sobre el AST)
// ─────────────────────────────────────────────

import { valorConstanteFactor, type Nodo } from "./nodo";

//
// ¿Qué signos puede tomar una expresión sobre los reales? Se responde con el CONJUNTO de
// signos posibles {−, 0, +} como máscara de bits, propagado recursivamente por el árbol:
// el signo de una suma es la suma de conjuntos, el de un producto el producto, el de una
// potencia par siempre {0,+}, etc. Es interpretación abstracta clásica: exacta en el sentido
// de que NUNCA descarta un signo alcanzable (si duda, devuelve TODO), así que las dos
// preguntas que interesan son seguras:
//
//   • `esNoNegativo` (la máscara no contiene −) ⇒ la guarda `R ≥ 0` es SIEMPRE cierta y sobra.
//   • `esSiempreNegativo` (la máscara es solo −) ⇒ `R ≥ 0` es imposible: no hay solución real.
//
// Sustituye a un catálogo plano de formas reconocidas (abs/sqrt/exp/potencia par/constante),
// que fallaba en cuanto se COMPONÍAN: `x²+1`, `|x|+3`, `2|x|`, `x⁴+x²`, `√x+|x|` son todas
// obviamente ≥0 y ninguna encajaba. Al ser recursivo cubre la familia entera y crece solo.

/** Signos posibles como máscara: se combinan con `|`. */
export const SIG_NEG = 1, SIG_CERO = 2, SIG_POS = 4;
export const SIG_TODO = SIG_NEG | SIG_CERO | SIG_POS;

/** Signo (máscara) de un número concreto. */
const signoDeNumero = (v: number): number =>
  !Number.isFinite(v) ? SIG_TODO : v > 0 ? SIG_POS : v < 0 ? SIG_NEG : SIG_CERO;

/** Signos de `a + b` recorriendo las 9 combinaciones: `+` y `−` juntos dan cualquier cosa. */
function sumaSignos(a: number, b: number): number {
  let r = 0;
  for (const [ma, va] of [[SIG_NEG, -1], [SIG_CERO, 0], [SIG_POS, 1]] as const) {
    if (!(a & ma)) continue;
    for (const [mb, vb] of [[SIG_NEG, -1], [SIG_CERO, 0], [SIG_POS, 1]] as const) {
      if (!(b & mb)) continue;
      r |= va + vb > 0 ? SIG_POS : va + vb < 0 ? SIG_NEG : va === 0 ? SIG_CERO : SIG_TODO;
    }
  }
  return r;
}

/** Signos de `a · b`: aquí el producto de signos SÍ está determinado en cada combinación. */
function productoSignos(a: number, b: number): number {
  let r = 0;
  for (const [ma, va] of [[SIG_NEG, -1], [SIG_CERO, 0], [SIG_POS, 1]] as const) {
    if (!(a & ma)) continue;
    for (const [mb, vb] of [[SIG_NEG, -1], [SIG_CERO, 0], [SIG_POS, 1]] as const) {
      if (!(b & mb)) continue;
      r |= signoDeNumero(va * vb);
    }
  }
  return r;
}

/** Máscara con − y + intercambiados (el signo de `-u`). */
const negarSignos = (s: number): number =>
  (s & SIG_CERO) | ((s & SIG_NEG) ? SIG_POS : 0) | ((s & SIG_POS) ? SIG_NEG : 0);

/** Constantes con NOMBRE que mathjs evalúa (no son variables libres). */
const NOMBRES_CONSTANTES = new Set(["pi", "e", "tau", "phi"]);

/** Funciones de UN argumento con signo conocido a priori, independientemente del argumento. */
const SIGNO_FUNCION: Record<string, number> = {
  abs: SIG_CERO | SIG_POS, sqrt: SIG_CERO | SIG_POS,
  exp: SIG_POS, cosh: SIG_POS,
};
/** Funciones IMPARES: su signo es exactamente el de su argumento. */
const FUNCION_IMPAR = new Set(["cbrt", "sinh", "asinh", "atanh", "tanh", "atan", "asin"]);

/** Conjunto de signos que la expresión puede tomar sobre ℝ (máscara SIG_*). Conservador:
 *  ante cualquier duda devuelve `SIG_TODO`, nunca descarta un signo posible. */
export function signoDe(n: Nodo): number {
  const nodo = n.type === "ParenthesisNode" ? n.content : n;

  // Subárbol SIN variables libres (`3`, `pi-4`, `sqrt(2)-2`): se evalúa y se lee el signo
  // exacto. Subsume por completo el viejo caso "es una constante" de las guardas.
  if (nodo.filter((m: Nodo) => m.type === "SymbolNode" && !NOMBRES_CONSTANTES.has(m.name)).length === 0) {
    try {
      const v: unknown = nodo.evaluate();
      if (typeof v === "number") return signoDeNumero(v);
    } catch { /* no evaluable → sigue el análisis estructural */ }
  }

  if (nodo.type === "ConstantNode")
    return typeof nodo.value === "number" ? signoDeNumero(nodo.value) : SIG_TODO;
  if (nodo.type === "ParenthesisNode") return signoDe(nodo.content);

  if (nodo.type === "OperatorNode") {
    if (nodo.args.length === 1 && nodo.op === "-") return negarSignos(signoDe(nodo.args[0]));
    if (nodo.args.length === 2) {
      const [a, b] = nodo.args;
      switch (nodo.op) {
        case "+": return sumaSignos(signoDe(a), signoDe(b));
        case "-": return sumaSignos(signoDe(a), negarSignos(signoDe(b)));
        case "*": {
          // `u·u` es un CUADRADO aunque no esté escrito como potencia (`x*x`, `f(x)*f(x)`).
          if (a.toString() === b.toString()) return SIG_CERO | SIG_POS;
          return productoSignos(signoDe(a), signoDe(b));
        }
        case "/": {
          // Un divisor que puede anularse da ±∞/NaN: fuera del análisis (conservador).
          const sb = signoDe(b);
          return sb & SIG_CERO ? SIG_TODO : productoSignos(signoDe(a), sb);
        }
        case "^": {
          const k = valorConstanteFactor(b);
          if (k === null || !Number.isInteger(k)) return SIG_TODO;
          const sa = signoDe(a);
          // Exponente PAR ⇒ nunca negativo (y estrictamente > 0 si la base no se anula).
          if (k % 2 === 0) return sa & SIG_CERO ? SIG_CERO | SIG_POS : SIG_POS;
          return k < 0 && (sa & SIG_CERO) ? SIG_TODO : sa;  // impar ⇒ conserva el signo
        }
        default: return SIG_TODO;
      }
    }
    return SIG_TODO;
  }

  if (nodo.type === "FunctionNode") {
    const fn = nodo.fn?.name ?? "";
    if (SIGNO_FUNCION[fn] !== undefined && nodo.args.length === 1) return SIGNO_FUNCION[fn];
    if (FUNCION_IMPAR.has(fn) && nodo.args.length === 1) return signoDe(nodo.args[0]);
    if (fn === "nthRoot" && nodo.args.length === 2) {
      const k = valorConstanteFactor(nodo.args[1]);
      if (k === null || !Number.isInteger(k)) return SIG_TODO;
      return k % 2 === 0 ? SIG_CERO | SIG_POS : signoDe(nodo.args[0]);  // par ≥0; impar conserva
    }
    // Centinela del ±: `pm(u)` recorre AMBOS signos de u, así que su signo es el de u unido
    // al opuesto. Sin esto, una guarda sobre `pm(x)` se daría por cierta viendo solo la rama +.
    if ((fn === "pm" || fn === "mp") && nodo.args.length === 1) {
      const s = signoDe(nodo.args[0]);
      return s | negarSignos(s);
    }
    return SIG_TODO;
  }
  return SIG_TODO;   // SymbolNode libre (x, y) y todo lo demás
}

/** ¿La expresión es ≥0 para TODO real donde está definida? (⇒ una guarda `≥0` sobra). */
export const esNoNegativo = (n: Nodo): boolean => (signoDe(n) & SIG_NEG) === 0;

/** ¿La expresión es SIEMPRE <0? (⇒ una guarda `≥0` es imposible: sin solución real). */
export const esSiempreNegativo = (n: Nodo): boolean => signoDe(n) === SIG_NEG;
