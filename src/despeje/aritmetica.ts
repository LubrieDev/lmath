// ─────────────────────────────────────────────
// despeje · aritmetica — las fracciones enteras del despejador
// ─────────────────────────────────────────────
//
// Tres ayudantes numéricos que usan las tres piezas del despeje: las estrategias por
// término (para leer un exponente `y^{3/2}`), el despeje cuadrático (para reducir el
// grado común) y la presentación (para escribir `x/2` y no `2x/4`). Viven aparte porque
// los comparten y ninguno es dueño.

/** Máximo común divisor de dos enteros (valor absoluto). */
export const mcdEnteros = (a: number, b: number): number => (b === 0 ? Math.abs(a) : mcdEnteros(b, Math.abs(a % b)));

/** Reduce num/den a términos mínimos con den>0. null si den es 0. */
export function normalizarFraccion(num: number, den: number): { num: number; den: number } | null {
  if (den === 0) return null;
  if (den < 0) { num = -num; den = -den; }
  const g = mcdEnteros(Math.abs(num), den) || 1;
  return { num: num / g, den: den / g };
}

/** Fracción exacta `num/den` de un decimal positivo, con den ≤ 64 — el mismo listón que usa
 *  el simplificador para decidir qué decimal es una fracción que alguien escribió y cuál es
 *  la expansión de un decimal. null si no cae en ninguna. */
export function fraccionSencilla(v: number): { num: number; den: number } | null {
  for (let den = 2; den <= 64; den++) {
    const num = v * den;
    if (Math.abs(num - Math.round(num)) <= 1e-9 * Math.max(1, Math.abs(num)))
      return normalizarFraccion(Math.round(num), den);
  }
  return null;
}
