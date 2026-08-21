// ─────────────────────────────────────────────
// resolver · Raíces EXACTAS de una ecuación, como expresiones (PURO)
// ─────────────────────────────────────────────
//
// El circuito completo, cerrado por primera vez:
//
//     texto  →  polinomio exacto  →  raíces aisladas  →  forma cerrada  →  EXPRESIÓN
//     ─────     ───────────────      ──────────────      ────────────      ─────────
//     parser    extraer.ts           polinomio.ts        forma.ts          núcleo
//               (ya existía)         (ya existía)        (E3)              (E1)
//
// De las cinco etapas, tres ya estaban en el motor y llevan versiones funcionando. Lo que faltaba
// era la última flecha: que el resultado exacto pudiera volver a ser una expresión en vez de
// salir directamente a LaTeX o, peor, como un decimal.
//
// ── Lo que cambia, en una línea ──────────────────────────────────────────────────────────
//     antes:   x³ = 2  →  x = 1.2599210498948732
//     ahora:   x³ = 2  →  x = ∛2
//
// Y no porque se haya añadido un caso para las raíces cúbicas: el aislamiento por Sturm ya
// encontraba esa raíz exacta, y lo único que se ha añadido es un tipo capaz de sostenerla y una
// función que reconoce cuándo tiene forma de radical.
//
// ── Alcance, dicho por delante ───────────────────────────────────────────────────────────
// Solo ecuaciones POLINÓMICAS de una variable. Un `sin`, un logaritmo o un exponente
// irracional hacen que `extraer.ts` devuelva `null`, y entonces aquí se devuelve `null` también:
// esa ecuación no se resuelve por esta vía, y decirlo es la respuesta correcta. Las raíces sin
// forma cerrada (una quíntica general) salen como `Literal` algebraico —exactas y operables,
// aunque no se sepan escribir con radicales—, que es estrictamente mejor que un decimal.

import { type Expresion } from "../nucleo/expresion";
import { type Algebraico, raicesAlgebraicas } from "../numeros/algebraico";
import { comoExpresion, formaCerrada } from "../numeros/forma";
import { polinomicaIgualadaACero } from "../algebra/polinomica";
import { type Polinomio, esNulo, grado } from "../../math/polinomio";
import { type Polinomio2, gradoY, normalizar2 } from "../../math/polinomio2";

/** Una solución exacta: el número, y su escritura cuando la tiene. */
export interface SolucionExacta {
  /** El valor, siempre exacto. */
  readonly valor: Algebraico;
  /** Su forma cerrada (`∛2`, `(1+√5)/2`, `3/2`), o `null` si no la tiene. */
  readonly forma: Expresion | null;
  /** El valor como expresión SIEMPRE: la forma cerrada si existe, y si no el número algebraico
   *  tal cual. Es lo que se le entrega a quien vaya a seguir manipulándolo. */
  readonly expresion: Expresion;
}

/**
 * El polinomio en x de una ecuación, si es que la ecuación es polinómica y NO tiene y.
 *
 * `ecuacionAPolinomio` devuelve un polinomio en (x, y) con los coeficientes agrupados por
 * potencias de y; si solo hay un grupo, es que y no aparece y ese grupo es el polinomio en x.
 */
function soloEnX(p: Polinomio2): Polinomio | null {
  const q = normalizar2(p);
  if (q.length === 0) return null;
  return gradoY(q) === 0 ? q[0] : null;
}

/**
 * Las raíces reales EXACTAS de `expr = 0`, en orden creciente, cuando `expr` es polinómica en una
 * sola variable.
 *
 * `null` significa «esto no es de lo que sé resolver así» —no es polinómica, tiene dos variables,
 * o se reduce a `0 = 0`—, y quien llama sigue por donde ya iba. Una lista vacía es otra cosa:
 * significa que no tiene NINGUNA raíz real, y eso sí es una respuesta.
 *
 * ── Recibe una `Expresion`, no un texto ──────────────────────────────────────────────────
 * Antes recibía la ecuación escrita, y con eso el parser entero entraba en el grafo de
 * dependencias del núcleo: `raicesExactas` era pura por dentro y arrastraba `parser.ts`,
 * `formatoExpr.ts` y `expr/` completo por su firma. Quien tenga un texto lo lee antes, en el
 * borde (`puente/lectura.ts` hoy, el lector propio a partir de E4).
 */
export function raicesExactas(expr: Expresion): SolucionExacta[] | null {
  let eq;
  try { eq = polinomicaIgualadaACero(expr); } catch { return null; }
  if (eq === null) return null;

  const p = soloEnX(eq.p);
  if (p === null || esNulo(p) || grado(p) < 1) return null;

  return raicesAlgebraicas(p).map((valor) => ({
    valor,
    forma: formaCerrada(valor),
    expresion: comoExpresion(valor),
  }));
}
