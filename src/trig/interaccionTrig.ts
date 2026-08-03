// ─────────────────────────────────────────────
// trig · Interacción con el círculo (parte PURA)
// ─────────────────────────────────────────────
//
// La aritmética del arrastre, separada del DOM para poder probarla: qué ángulo señala el
// puntero, cuánto ha girado desde el último evento, dónde lo deja el imán y a qué ángulo del
// bloque se está agarrando. El cableado de eventos vive en el host; aquí no se toca un `window`.
//
// El arrastre tiene UN grado de libertad —el punto no puede salirse de la circunferencia—, así
// que no hay ambigüedad de blanco ni nada que resolver por prioridad: basta con el ángulo del
// puntero respecto al centro.

import type { EncuadreTrig } from "./renderTrig";
import { DOS_PI, aRadianes, coterminalPrincipal } from "./modeloTrig";

/** El imán se pega a los notables, y notable = múltiplo de 15°. Única definición del bloque. */
export const PASO_IMAN = aRadianes(15);
/** Radio de captura del imán: a menos de esto, el ángulo aterriza en el notable. */
const TOLERANCIA_IMAN = aRadianes(4);

/** Margen (px) alrededor de la circunferencia dentro del cual el puntero la agarra. */
export const AGARRE_PX = 20;
/** El mismo margen con el dedo, que tapa lo que señala y apunta con menos precisión. */
export const AGARRE_PX_TACTIL = 30;

/** Ángulo que señala el puntero respecto al centro, en (−π, π]. */
export function anguloDePuntero(e: EncuadreTrig, x: number, y: number): number {
  // La Y del lienzo crece hacia abajo y la del plano hacia arriba: se invierte antes del atan2,
  // o el arrastre saldría reflejado y girar a la derecha bajaría el ángulo.
  return Math.atan2(e.cy - y, x - e.cx);
}

/**
 * Diferencia mínima entre dos ángulos, en (−π, π]. Es lo que permite ACUMULAR el giro en vez de
 * saltar: pasar de 350° a 10° es avanzar 20°, no retroceder 340°, y solo así el arrastre puede
 * dar vueltas completas (y la espiral del arco significar algo).
 */
export function deltaAngular(desde: number, hasta: number): number {
  let d = (hasta - desde) % DOS_PI;
  if (d > Math.PI) d -= DOS_PI;
  if (d <= -Math.PI) d += DOS_PI;
  return d;
}

/**
 * Imanta al notable más próximo si está dentro de la tolerancia; si no, deja el ángulo intacto.
 * Trabaja sobre el ángulo COMPLETO, no sobre su coterminal, así que conserva las vueltas: a
 * 730° el imán lleva a 735°, no de vuelta a 15°.
 */
export function imantar(rad: number): number {
  const cerca = Math.round(rad / PASO_IMAN) * PASO_IMAN;
  return Math.abs(rad - cerca) <= TOLERANCIA_IMAN ? cerca : rad;
}

/**
 * ¿Actúa el imán en ESTE gesto? El ajuste manda, y `Alt` lo suspende mientras se mantiene.
 *
 * El imán encendido es lo correcto casi siempre —los ángulos que se quieren enseñar son notables—
 * y estorba exactamente cuando no lo es: colocar el punto en un ángulo cualquiera. Sin una vía de
 * escape, ese caso obliga a ir a los ajustes, apagar, arrastrar y volver a encender; con `Alt` la
 * excepción dura lo que dura el gesto, que es lo que dura la intención.
 *
 * Se decide POR EVENTO y no al empezar el arrastre, así que soltar `Alt` a mitad vuelve a pegar el
 * punto sin levantar el dedo. Eso sale gratis gracias a la separación crudo/mostrado del host: el
 * ángulo que acumula el arrastre nunca se imanta, el imán se aplica al mostrarlo, y por eso puede
 * dejar de aplicarse —y volver a aplicarse— sin haber perdido nada por debajo.
 *
 * `Alt` solo QUITA. Con el ajuste apagado no hay imán que suspender y la tecla no hace nada:
 * un modificador que además pudiera encenderlo daría dos formas de decir lo mismo y ninguna
 * descubrible.
 */
export function imanVigente(ajuste: boolean, altPulsado: boolean): boolean {
  return ajuste && !altPulsado;
}

/** ¿Está el puntero lo bastante cerca de la circunferencia para agarrarla? */
export function agarraCircunferencia(
  e: EncuadreTrig, x: number, y: number, tolPx: number
): boolean {
  const d = Math.hypot(x - e.cx, y - e.cy);
  return Math.abs(d - e.R) <= tolPx;
}

/**
 * Un paso de la ANIMACIÓN: avanza el ángulo y lo devuelve **siempre dentro de [0, 2π)**.
 *
 * El arrastre acumula giro (de 350° se pasa a 370°) y eso está bien: quien sigue girando con el
 * dedo está diciendo que quiere otra vuelta, y el contador de vueltas registra esa intención. La
 * animación es lo contrario: gira sola, y las vueltas que acumula no miden intención sino tiempo
 * transcurrido. Dejarla acumular llevaba a leer `511,5°` para un punto que es exactamente el de
 * `151,5°`, a que el deslizador se quedara clavado en su tope mientras el número seguía subiendo,
 * y a que el ⓘ contara vueltas que solo dicen cuánto rato lleva el botón pulsado.
 *
 * Así que aquí se reduce el ESTADO y no solo lo que se enseña. Es la diferencia entre una
 * interfaz coherente y una con dos verdades: si el ángulo interno siguiera creciendo, la esquina
 * del plano diría 20° y el panel ⓘ diría 1100° y tres vueltas, para el mismo punto.
 *
 * Consecuencia visible, y es la correcta: si el ángulo venía de más de una vuelta (un `θ = 750°`
 * escrito, o un arrastre largo), el primer paso lo reduce a su coterminal principal. **El punto no
 * se mueve** —750° y 30° son la misma posición—; lo único que cambia es el número, y cambia al
 * equivalente de la vuelta principal.
 */
export function pasoAnimacion(actual: number, velocidadRad: number, dt: number): number {
  return coterminalPrincipal(actual + velocidadRad * dt);
}

/**
 * Recorrido del DESLIZADOR del ángulo, en grados. **Siempre SIMÉTRICO en torno a 0**: la base es
 * −360…360, con el cero justo en el centro del mando.
 *
 * Una vuelta a cada lado, y no solo la principal, porque los dos sentidos de giro son igual de
 * legítimos en este bloque —`θ = -45°` es una entrada normal— y con el recorrido en 0…360 no había
 * forma de llegar a un ángulo negativo con el dedo: había que escribirlo. Con el cero en el medio,
 * además, el punto de referencia se encuentra sin mirar el número.
 *
 * El recorrido se ensancha en vueltas ENTERAS hasta contener todos los ángulos escritos, porque un
 * mando que no alcanza el valor que dice el propio texto del bloque es un mando roto: al montarse,
 * la manija se pondría en un ángulo que no es el escrito, y el dibujo cambiaría solo por existir el
 * deslizador. El ensanche es **simétrico**: contener 750° da −1080…1080, no −360…1080. Cuesta
 * precisión en un caso rarísimo y a cambio el cero no se mueve nunca del centro, que es lo que
 * hace del mando algo que se puede usar sin leerlo.
 *
 * Se miran TODOS los ángulos y no solo el activo porque el activo cambia con `Tab` o al agarrar
 * otro punto, y un mando cuyo recorrido baila bajo el dedo no se puede usar.
 */
export function rangoDeslizador(
  gradosEscritos: readonly number[]
): { min: number; max: number } {
  let vueltas = 1;
  for (const g of gradosEscritos) vueltas = Math.max(vueltas, Math.ceil(Math.abs(g) / 360));
  return { min: -360 * vueltas, max: 360 * vueltas };
}

/**
 * Acota un ángulo (en RADIANES) al recorrido de `rangoDeslizador` (que viene en GRADOS).
 *
 * Es el techo del arrastre y del teclado, y existe porque el ángulo tiene que vivir en **un solo
 * dominio**: los tres mandos —arrastre, teclado y deslizador— escriben el mismo número, así que
 * uno no puede alcanzar valores que otro no sepa representar. Sin esto, unas cuantas vueltas con
 * el dedo dejaban la manija clavada en el extremo mientras la lectura decía 12270°.
 *
 * Se acota el valor CRUDO, no solo lo que se muestra: guardar uno sin techo y enseñar otro
 * devolvería dos números distintos para el mismo punto, que es justo lo que esto arregla. Y como
 * el crudo se queda EN el tope, invertir el gesto responde al instante — no hay giro acumulado por
 * debajo que haya que deshacer antes de que el punto se mueva.
 *
 * La animación no pasa por aquí: envuelve a [0, 2π) por su cuenta (`pasoAnimacion`), y ese
 * intervalo cae siempre dentro del recorrido, así que las dos reglas no se pisan.
 */
export function acotarARecorrido(
  radianes: number, recorrido: { min: number; max: number }
): number {
  return Math.min(aRadianes(recorrido.max), Math.max(aRadianes(recorrido.min), radianes));
}

/**
 * Cuál de los ángulos del bloque queda más cerca del puntero, por distancia ANGULAR (no por
 * distancia al punto): todos viven sobre la misma circunferencia, así que la distancia euclídea
 * mide lo mismo y con peor precisión cerca del centro.
 */
export function indiceMasCercano(
  angulos: readonly number[], anguloPuntero: number
): number {
  let mejor = 0;
  let mejorDist = Infinity;
  angulos.forEach((a, i) => {
    const d = Math.abs(deltaAngular(a, anguloPuntero));
    if (d < mejorDist) { mejorDist = d; mejor = i; }
  });
  return mejor;
}
