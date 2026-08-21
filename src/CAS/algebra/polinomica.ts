// ─────────────────────────────────────────────
// álgebra · De `Expresion` a polinomio exacto en ℚ[x,y] (PURO)
// ─────────────────────────────────────────────
//
// La puerta del núcleo al álgebra exacta: dada una expresión, ¿es un polinomio (o una fracción
// de polinomios) y con qué coeficientes racionales?
//
// ── Reutiliza, no reimplementa ───────────────────────────────────────────────────────────
// El recorrido que decide si algo es polinómico y construye la fracción ya existe, está probado
// y es correcto: `math/extraerNodo.ts`. Aquí NO se vuelve a escribir. Lo único que cambia es el
// tipo de la entrada, y eso se resuelve con el puente: `Expresion → Nodo → Fraccion`.
//
// Escribir una segunda versión del mismo recorrido sobre `Expresion` habría sido más «limpio» de
// mirar y peor de todas las demás maneras: dos implementaciones del mismo criterio que se
// separan en cuanto una se corrige y la otra no. Cuando el motor histórico se retire, el
// recorrido se muda a `Expresion` y este archivo se queda sin puente —pero seguirá habiendo UNA
// implementación, que es lo que importa.
//
// ── Lo que este archivo consigue ─────────────────────────────────────────────────────────
// Que `resolver/exactas.ts` deje de recibir un `string`. Con eso, el cierre transitivo del
// núcleo pierde `parser.ts`, `formatoExpr.ts` y `expr/` entero, y el invariante «entre etapas
// viajan expresiones, no cadenas» pasa de ser una intención a ser verificable.

import { type Expresion, CERO_E } from "../nucleo/expresion";
import { aMathjs } from "../puente/mathjs";
import {
  type EcuacionPolinomica, type Fraccion, fraccionDe, polinomicaDeFracciones,
} from "../../math/extraerNodo";
import { type Polinomio2, normalizar2 } from "../../math/polinomio2";

export type { EcuacionPolinomica };

/**
 * La expresión como fracción de polinomios en ℚ[x,y], o `null` si no lo es.
 *
 * `null` cubre dos casos que no conviene distinguir aquí: que la expresión no sea polinómica
 * (`sin x`, `log y`, un exponente fraccionario) y que el puente no sepa escribirla en el
 * lenguaje del lector. Quien pregunta hace lo mismo en los dos casos: seguir por otro camino.
 */
export function fraccionDeExpresion(e: Expresion): Fraccion | null {
  const nodo = aMathjs(e);
  return nodo === null ? null : fraccionDe(nodo);
}

/**
 * La ecuación `izq = der` como polinomio igualado a cero, con el denominador que se limpió.
 *
 * Es la forma que consume el resolvedor: `p(x,y) = 0` más los puntos donde la ecuación original
 * no estaba definida, para que una solución nacida de la limpieza se pueda descartar.
 */
export function ecuacionPolinomicaDe(izq: Expresion, der: Expresion): EcuacionPolinomica | null {
  const a = fraccionDeExpresion(izq);
  if (a === null) return null;
  const b = fraccionDeExpresion(der);
  return b === null ? null : polinomicaDeFracciones(a, b);
}

/**
 * La expresión como POLINOMIO (denominador 1), o `null` si tiene denominador o no es polinómica.
 *
 * Distinto de `fraccionDeExpresion`: aquí `1/x` es `null`, porque quien pide un polinomio no
 * puede hacer nada con una fracción y prefiere enterarse.
 */
export function polinomio2De(e: Expresion): Polinomio2 | null {
  const f = fraccionDeExpresion(e);
  if (f === null) return null;
  const den = normalizar2(f.den);
  // Denominador constante 1: el único caso en que la fracción ES un polinomio.
  const esUno = den.length === 1 && den[0].length === 1 && den[0][0].n === 1n && den[0][0].d === 1n;
  return esUno ? normalizar2(f.num) : null;
}

/** `expr = 0` como polinomio, que es lo que pide un buscador de raíces. Pasa por el mismo camino
 *  que cualquier otra ecuación: no hay un atajo aparte que pudiera desviarse del general. */
export const polinomicaIgualadaACero = (e: Expresion): EcuacionPolinomica | null =>
  ecuacionPolinomicaDe(e, CERO_E);
