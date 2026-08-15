// ─────────────────────────────────────────────
// expr · Cuarentena de `rationalize` (guarda de expansión)
// ─────────────────────────────────────────────

import { parse, rationalize, type MathNode } from "mathjs";

import { valorConstanteFactor, type Nodo } from "./nodo";

//
// `rationalize` (mathjs) es la ÚNICA operación del proyecto capaz de colgar el hilo
// principal de Obsidian: expande la potencia de forma NAIVE (sin combinar semejantes
// durante el proceso) y luego pasa el árbol resultante por el motor de reglas de
// `simplify`, que es superexponencial en el tamaño de ese árbol. El coste no depende
// del texto de entrada sino del nº de MONOMIOS que produce la expansión:
//
//     (x+y)^3        →  2³ =  8 monomios  →   0.06 s
//     (x+y+1)^2      →  3² =  9           →   0.07 s
//     (x+y)^4        →  2⁴ = 16           →   1.4  s
//     (x+y+1)^3      →  3³ = 27           →  12    s
//     (x²+y²−1)³     →  3³ = 27           →  NUNCA TERMINA
//     (x+1)^12       →  2¹² = 4096        →  NUNCA TERMINA
//
// El corte es abrupto entre 16 y 27, así que se rechaza todo lo que pase de
// `LIMITE_EXPANSION`. `simplify` a secas NO tiene el problema (no expande potencias):
// es el fallback seguro de los llamadores. La guarda es DETERMINISTA (no un timeout):
// la misma entrada da siempre el mismo resultado → caché y pruebas estables.

/** Máximo de monomios que se admite expandir. Ver la tabla de arriba: 16 es el último
 *  valor con coste tolerable (~1 s); 27 ya es inviable. */
export const LIMITE_EXPANSION = 16;

/**
 * Nº de MONOMIOS que produciría la expansión naive del árbol (la magnitud que gobierna
 * el coste de `rationalize`). Suma en `+`/`−`, PRODUCTO en `*`/`/`, POTENCIA en `^` con
 * exponente entero. Las funciones (sin, √…) valen 1: hacen que `rationalize` aborte de
 * inmediato por no polinómica, así que no inflan nada. No itera sobre el exponente
 * (`Math.pow`) → un exponente absurdo devuelve `Infinity` en O(1), nunca cuelga.
 */
export function costeExpansion(n: Nodo): number {
  if (!n || typeof n !== "object") return 1;
  if (n.type === "ParenthesisNode") return costeExpansion(n.content);
  if (n.type === "OperatorNode") {
    const args = n.args ?? [];
    if (args.length === 1) return costeExpansion(args[0]);          // menos unario
    const a = costeExpansion(args[0]), b = costeExpansion(args[1]);
    if (n.op === "+" || n.op === "-") return a + b;
    if (n.op === "*") return a * b;
    if (n.op === "/") return a * b;                                  // común denominador
    if (n.op === "^") {
      const k = valorConstanteFactor(args[1]);
      // Exponente NO entero (x^{2/3}) → no es polinómica: `rationalize` aborta sin
      // expandir. Se devuelve el coste de la base para no bloquearla por nada.
      if (k === null || !Number.isInteger(k)) return a;
      return Math.pow(a, Math.abs(k));
    }
    return a + b;
  }
  return 1; // símbolo, constante, función (átomo para la expansión)
}

/**
 * `rationalize` con la guarda de expansión: null si la expresión desbordaría el
 * presupuesto (o si mathjs la rechaza por no polinómica). Es el ÚNICO punto por el que
 * el proyecto llama a `rationalize` → una expresión no puede colgar Obsidian.
 */
export function rationalizeSeguro(expr: Nodo | string): Nodo | null {
  let nodo: Nodo;
  try { nodo = typeof expr === "string" ? parse(expr) as unknown as Nodo : expr; } catch { return null; }
  if (costeExpansion(nodo) > LIMITE_EXPANSION) return null;
  try { return rationalize(nodo as unknown as MathNode) as unknown as Nodo; } catch { return null; }
}
