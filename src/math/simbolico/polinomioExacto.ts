// ─────────────────────────────────────────────
// simbólico · Evaluar un polinomio de ℚ[x] en un número algebraico (PURO)
// ─────────────────────────────────────────────
//
// La pieza que convierte una abscisa exacta en una ORDENADA exacta.
//
// Cuando un sistema tiene una curva explícita `y = f(x)` con f de coeficientes racionales —que
// es el caso de casi todo lo que se escribe—, la ordenada de una solución es literalmente
// `f(x)`. Si la abscisa es `(7 − √13)/2`, evaluar f ahí dentro del cuerpo ℚ(√13) da la ordenada
// exacta, sin pasar en ningún momento por un decimal.
//
// Es Horner, el esquema de toda la vida, con las operaciones del cuerpo en vez de las de los
// números: `((aₙ·x + aₙ₋₁)·x + …)·x + a₀`. Que ℚ(√d) sea un cuerpo cerrado es justo lo que
// permite reutilizar el esquema tal cual; el resultado nunca se sale del cuerpo donde vive x.

import { type Polinomio, normalizar } from "../polinomio";
import { type ValorExacto, CERO_E, exacto, productoE, sumaE } from "./valorExacto";

/**
 * `p(v)` en aritmética exacta, o `null` si el resultado se sale del alcance representable.
 *
 * `null` no puede ocurrir con `v` en un solo cuerpo cuadrático y `p` racional —el cuerpo es
 * cerrado—, pero se propaga igualmente en vez de suponerlo: si algún día `ValorExacto` admite
 * más formas, este módulo seguirá siendo honesto sin tocarlo.
 */
export function evaluarExacto(p: Polinomio, v: ValorExacto): ValorExacto | null {
  const P = normalizar(p);
  if (P.length === 0) return CERO_E;
  let acumulado: ValorExacto | null = exacto(P[P.length - 1]);
  for (let i = P.length - 2; i >= 0; i--) {
    if (acumulado === null) return null;
    const escalado = productoE(acumulado, v);
    if (escalado === null) return null;
    acumulado = sumaE(escalado, exacto(P[i]));
  }
  return acumulado;
}
