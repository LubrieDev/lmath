// ─────────────────────────────────────────────
// info · ¿Las soluciones de este sistema se repiten SIN FIN? (PURO)
// ─────────────────────────────────────────────
//
// El panel tiene tres formas de decir «hay muchas», y solo una de ellas es una afirmación sobre
// el infinito: el solape (una curva entera de soluciones), el tope visual (hay 44 y se listan
// 20) y esta, la periodicidad. Las dos primeras se leen del propio resultado; esta hay que
// DEDUCIRLA, y aquí está el criterio, aparte del DOM para poder probarlo.
//
// ── Por qué no basta con «hay una trigonométrica» ─────────────────────────────────────────
// Era el criterio anterior —una trig en el sistema y tres soluciones o más— y anunciaba
// infinitas en casos de manual donde no lo son:
//
//     y = sin x  ∩  y = x/2      tiene EXACTAMENTE tres soluciones
//     y = sin x  ∩  |y| = x/10   tiene exactamente seis
//
// La curva es periódica, pero la otra se escapa de la banda [−1, 1] y no vuelve a cortarla
// nunca. Que una curva se repita no hace que sus intersecciones se repitan.
//
// ── El criterio ───────────────────────────────────────────────────────────────────────────
// A lo anterior se le añade una condición NECESARIA de que las soluciones sigan apareciendo:
// que lleguen hasta el borde de lo explorado por los dos lados. Si dejan de salir mucho antes,
// se ha visto dónde se acaban, y entonces la lista es la respuesta completa (dentro del
// intervalo) en vez de una muestra de algo ilimitado.
//
// No es una demostración de infinitud —por muestreo no la hay—, y por eso el criterio es
// deliberadamente asimétrico: puede callarse ante un sistema que sí tiene infinitas (y entonces
// el panel lista las que encontró, que es cierto), pero ya no anuncia infinitas ante uno que
// tiene tres. El error que puede cometer dejó de ser el que miente.

import { DOMINIO_X } from "../../math/numerico";
import type { ResultadoBloque } from "../../math/resolverSistema";

/** Nº de soluciones a partir del cual se plantea siquiera la pregunta. */
const MIN_PERIODICO = 3;

/** Fracción del intervalo explorado que las soluciones deben alcanzar por los dos lados. */
const BORDE = 0.9;

/**
 * ¿Se puede afirmar que las soluciones son infinitas por periodicidad?
 *
 * @param resultado   lo que devolvió el motor (de ahí salen los puntos, si la lista es
 *                    aproximada —solo entonces puede haber periodicidad— y qué variable se
 *                    barrió, que es sobre la que se mide el alcance).
 * @param hayTrigonometria  si alguna ecuación del bloque usa una función periódica.
 */
export function infinitasPorPeriodicidad(
  resultado: ResultadoBloque, hayTrigonometria: boolean
): boolean {
  if (resultado.tipo !== "puntos" || !resultado.aproximado || !hayTrigonometria) return false;
  const puntos = resultado.puntos;
  if (puntos.length < MIN_PERIODICO) return false;

  // La coordenada que se recorrió: con el barrido en y, mirar la x no dice nada del alcance.
  const enY = resultado.exploradas.length > 0 && !resultado.exploradas.includes("x");
  const coordenada = (p: { x: number; y: number }): number => (enY ? p.y : p.x);

  const limite = Math.max(Math.abs(DOMINIO_X[0]), Math.abs(DOMINIO_X[1])) * BORDE;
  return puntos.some((p) => coordenada(p) <= -limite)
    && puntos.some((p) => coordenada(p) >= limite);
}
