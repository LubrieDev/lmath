// ─────────────────────────────────────────────
// host-obsidian · plataforma (¿con qué se está señalando?)
// ─────────────────────────────────────────────
//
// El bloque se adapta a dos cosas DISTINTAS e INDEPENDIENTES, y conviene no
// confundirlas nunca:
//
//   • CÓMO SE SEÑALA (este módulo). Con el dedo no hay hover ni teclado, así que
//     el crosshair, la cruz del cursor y el carril no tienen forma de existir:
//     sobran en CUALQUIER orientación. Depende del dispositivo.
//   • CUÁNTO SITIO HAY. El reparto del bloque (fórmula al lado del plano, o plano
//     completo con la fórmula superpuesta) depende del ANCHO DEL CONTENEDOR, no del
//     dispositivo: el mismo teléfono en horizontal da ~700px y ahí el reparto de
//     escritorio funciona igual de bien, mientras que un panel lateral estrecho en
//     el escritorio sufre exactamente lo mismo que un teléfono en vertical.
//
// Este módulo responde SOLO a la primera. La segunda se mide del contenedor.
//
// `Platform` es la respuesta de la propia API de Obsidian y vale para las dos
// plataformas móviles. Para probarlo en el escritorio, `app.emulateMobile(true)`
// en la consola lo voltea en caliente, sin recargar el plugin.

import { Platform } from "obsidian";

/**
 * ¿Se está señalando con el DEDO? true en la app móvil (teléfono o tablet).
 *
 * Se acepta a sabiendas un caso raro: una tablet con ratón o trackpad responde
 * true y pierde el crosshair aunque tenga puntero. La alternativa exacta a "hay
 * hover" sería `matchMedia("(hover: hover) and (pointer: fine)")`, pero un solo
 * criterio —el factor de forma— mantiene coherentes todas las decisiones que
 * dependen de él; dos criterios que puedan discrepar dejarían el bloque en
 * estados híbridos (mitad de ratón, mitad de dedo) imposibles de razonar.
 */
export function esTactil(): boolean {
  return Platform.isMobile;
}
