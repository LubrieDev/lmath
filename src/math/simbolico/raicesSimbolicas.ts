// ─────────────────────────────────────────────
// simbólico · Forma cerrada de las raíces reales de un polinomio (PURO)
// ─────────────────────────────────────────────
//
// `raicesReales` (polinomio.ts) encuentra TODAS las raíces reales y ninguna de más, y devuelve
// la forma exacta solo cuando la raíz es racional. Este módulo recupera la que falta: la de las
// raíces que viven en un cuerpo cuadrático, que se escriben `(7 − √13)/2` y hasta ahora se
// enseñaban como `1.6972243622680054`.
//
// ── El procedimiento, y por qué es SOUND ──────────────────────────────────────────────────
// Una raíz irracional de grado 2 nunca viene sola: si `p` tiene coeficientes racionales y
// `u + v√d` es raíz, su CONJUGADO `u − v√d` también lo es (la conjugación permuta las raíces),
// y además es REAL. Es decir: las dos están en la lista de raíces reales que ya se calculó.
//
// De ahí sale el método, que es el clásico de identificar un factor por sus raíces:
//
//   1. Se toman las raíces irracionales de dos en dos y se calculan su suma y su producto EN
//      COMA FLOTANTE. Si esa pareja es un par de conjugados, suma y producto son racionales.
//   2. Se RECONSTRUYE cada uno como racional por fracciones continuas (el convergente de
//      denominador acotado que explica el decimal).
//   3. Se comprueba, EN ARITMÉTICA EXACTA, que `x² − Sx + M` divide a `p` sin resto.
//
// El paso 3 es lo que hace que los pasos 1 y 2 puedan ser tan aproximados como haga falta: el
// decimal solo se usa para PROPONER un candidato, y la división exacta es quien lo acepta. Una
// reconstrucción equivocada produce un polinomio que no divide, y se descarta. No hay ningún
// camino por el que un valor aproximado llegue a presentarse como exacto.
//
// ── Alcance ──────────────────────────────────────────────────────────────────────────────
// Grado 1 (racionales, que ya venían) y grado 2. Una raíz de grado 3 o más —la de `x³ = 2`, o
// `√2+√3`, que es de grado 4— no tiene forma cerrada en `ValorExacto` y sale como `null`: quien
// llama enseña el decimal. Ampliar esto es ampliar `ValorExacto`, no este módulo.

import {
  type Polinomio, type RaizReal, dividir, esNulo, grado, raicesReales,
} from "../polinomio";
import { type Racional, rac, resta, producto } from "../racional";
import { type ValorExacto, aNumeroE, exacto, raizDe } from "./valorExacto";

/** Denominador máximo al reconstruir un racional de un decimal. Un millón cubre de sobra los
 *  coeficientes que un usuario escribe y los que una eliminación produce; más allá, el
 *  candidato deja de ser creíble y la reconstrucción se declara fallida (que no es un error:
 *  significa «este decimal no parece racional», y entonces no hay forma cerrada que probar). */
const DENOMINADOR_MAXIMO = 1000000n;

/** Tolerancia relativa con la que un convergente se acepta como explicación del decimal. */
const TOL_RECONSTRUCCION = 1e-11;

/**
 * El racional de denominador acotado que explica el decimal, o `null`.
 *
 * Fracciones continuas: los convergentes son las MEJORES aproximaciones racionales de cada
 * tamaño, así que si el número es un racional sencillo aparece en pocas vueltas, y si no lo es,
 * ninguna vuelta lo alcanza y se sale por el tope. Es una CONJETURA, no una demostración; quien
 * llama la verifica exactamente.
 */
export function racionalCercano(v: number, maxDen: bigint = DENOMINADOR_MAXIMO): Racional | null {
  if (!Number.isFinite(v)) return null;
  const escala = Math.max(1, Math.abs(v));
  let x = v;
  let a = Math.floor(x);
  if (!Number.isSafeInteger(a)) return null;
  let pAnt = 1n, qAnt = 0n;
  let p = BigInt(a), q = 1n;
  for (let i = 0; i < 40; i++) {
    if (Math.abs(Number(p) / Number(q) - v) <= TOL_RECONSTRUCCION * escala) return rac(p, q);
    const frac = x - a;
    if (Math.abs(frac) < 1e-14) break;
    x = 1 / frac;
    a = Math.floor(x);
    if (!Number.isSafeInteger(a)) break;
    const A = BigInt(a);
    const p2 = A * p + pAnt, q2 = A * q + qAnt;
    if (q2 > maxDen || q2 <= 0n) break;
    pAnt = p; qAnt = q; p = p2; q = q2;
  }
  return null;
}

/** ¿`q` divide a `p` sin resto? La comprobación exacta que valida cada candidato. */
function divideExacto(p: Polinomio, q: Polinomio): boolean {
  if (grado(q) < 1 || grado(p) < grado(q)) return false;
  return esNulo(dividir(p, q).resto);
}

/**
 * Los factores `x² − Sx + M` de coeficientes racionales que dividen a `p`, propuestos por las
 * parejas de raíces reales irracionales y confirmados por división exacta.
 *
 * Las parejas son O(k²) con k el número de raíces reales, y k está acotado por el grado (que el
 * lector de ecuaciones ya limita a 8), así que son 28 divisiones exactas en el peor caso.
 */
function factoresCuadraticos(p: Polinomio, raices: readonly RaizReal[]): Polinomio[] {
  const irracionales = raices.filter((r) => r.exacto === null);
  const factores: Polinomio[] = [];
  for (let i = 0; i < irracionales.length; i++) {
    for (let j = i + 1; j < irracionales.length; j++) {
      const S = racionalCercano(irracionales[i].valor + irracionales[j].valor);
      const M = racionalCercano(irracionales[i].valor * irracionales[j].valor);
      if (S === null || M === null) continue;
      const q: Polinomio = [M, { n: -S.n, d: S.d }, rac(1n)];
      if (divideExacto(p, q)) factores.push(q);
    }
  }
  return factores;
}

/** Las dos raíces de `x² + bx + c` como valores exactos, o `[]` si no son reales o no se
 *  dejan escribir. `x = (−b ± √(b²−4c))/2`. */
function raicesDeCuadratica(b: Racional, c: Racional): ValorExacto[] {
  const disc = resta(producto(b, b), producto(rac(4n), c));
  const mitad = rac(1n, 2n);
  const centro = producto({ n: -b.n, d: b.d }, mitad);
  const mas = raizDe(centro, mitad, disc);
  const menos = raizDe(centro, { n: -1n, d: 2n }, disc);
  const out: ValorExacto[] = [];
  if (mas) out.push(mas);
  if (menos) out.push(menos);
  return out;
}

/** Una raíz real con su forma cerrada, cuando la tiene. */
export interface RaizConForma {
  readonly raiz: RaizReal;
  /** `(7 − √13)/2`, `3/2`… o `null` si la raíz es de grado ≥ 3 y no se sabe escribir. */
  readonly exacto: ValorExacto | null;
}

/**
 * Las raíces reales de `p`, cada una con su forma cerrada cuando existe.
 *
 * Sustituye a `raicesReales` en el solucionador: mismo conjunto de raíces, mismo orden, más
 * información. Quien solo quiera los valores puede seguir usando `raicesReales` directamente.
 */
export function raicesConForma(p: Polinomio): RaizConForma[] {
  const raices = raicesReales(p);
  if (raices.length === 0) return [];

  // Candidatas: las raíces de todos los factores cuadráticos confirmados. Se emparejan con las
  // raíces por VALOR, que es seguro porque las raíces de un polinomio están separadas y las
  // formas cerradas se evalúan al mismo double que el aislamiento por Sturm produjo.
  const candidatas: ValorExacto[] = [];
  for (const q of factoresCuadraticos(p, raices))
    candidatas.push(...raicesDeCuadratica(q[1], q[0]));

  return raices.map((raiz) => {
    if (raiz.exacto !== null) return { raiz, exacto: exacto(raiz.exacto) };
    const escala = Math.max(1, Math.abs(raiz.valor));
    const forma = candidatas.find((c) => Math.abs(aNumeroE(c) - raiz.valor) <= 1e-9 * escala);
    return { raiz, exacto: forma ?? null };
  });
}
