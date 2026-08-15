// ─────────────────────────────────────────────
// host-obsidian · ui · Catálogo de iconos y glifos
// ─────────────────────────────────────────────
//
// Las trayectorias SVG de los chips del plano y de los glifos de unidad angular. Es un
// catálogo de datos, no lógica: se separa porque ~90 líneas de trayectorias entre medias
// de la lógica de los bloques solo estorban a quien lee cualquiera de las dos cosas.

import type { UnidadTrig } from "../../trig/bloqueTrig";

export const ICONO = {
  inicio: "M220-180h150v-250h220v250h150v-390L480-765 220-570v390Zm-60 60v-480l320-240 320 240v480H530v-250H430v250H160Zm320-353Z",
  acercar: "M450-450H200v-60h250v-250h60v250h250v60H510v250h-60v-250Z",
  alejar: "M200-450v-60h560v60H200Z",
  carril: "M450-42v-75q-137-14-228-105T117-450H42v-60h75q14-137 105-228t228-105v-75h60v75q137 14 228 105t105 228h75v60h-75q-14 137-105 228T510-117v75h-60Zm244.5-223.5Q784-355 784-480t-89.5-214.5Q605-784 480-784t-214.5 89.5Q176-605 176-480t89.5 214.5Q355-176 480-176t214.5-89.5Zm-321-108Q330-417 330-480t43.5-106.5Q417-630 480-630t106.5 43.5Q630-543 630-480t-43.5 106.5Q543-330 480-330t-106.5-43.5ZM544-416q26-26 26-64t-26-64q-26-26-64-26t-64 26q-26 26-26 64t26 64q26 26 64 26t64-26Zm-64-64Z",
  info: "M453-280h60v-240h-60v240Zm50.5-323.2q9.5-9.2 9.5-22.8 0-14.45-9.48-24.22-9.48-9.78-23.5-9.78t-23.52 9.78Q447-640.45 447-626q0 13.6 9.48 22.8 9.48 9.2 23.5 9.2t23.52-9.2ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.23-60Q622-140 721-239.5t99-241Q820-622 721.19-721T480-820q-141 0-240.5 98.81T140-480q0 141 99.5 240.5t241 99.5Zm-.5-340Z",
  menu: "M120-240v-60h720v60H120Zm0-210v-60h720v60H120Zm0-210v-60h720v60H120Z",
  reproducir: "M320-200v-560l440 280-440 280Z",
  pausar: "M520-200v-560h240v560H520Zm-320 0v-560h240v560H200Z",
  cerrar: "m249-207-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z",
  // Editar el bloque: en móvil no existe el botón `</>` de Obsidian —aparece al pasar el
  // ratón, y no hay ratón—, así que el bloque se queda sin puerta a su propio código.
  editar: "M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h405l-60 60H180v600h600v-348l60-60v408q0 24-18 42t-42 18H180Zm300-360ZM360-360v-170l382-382q9-9 20-13t22-4q11 0 22.32 4.5Q817.63-920 827-911l83 84q8.61 8.96 13.3 19.78 4.7 10.83 4.7 22.02 0 11.2-4.5 22.7T910-742L530-360H360Zm508-425-84-84 84 84ZM420-420h85l253-253-43-42-43-42-252 251v86Zm295-295-43-42 43 42 43 42-43-42Z",
  // Los mandos de los parámetros declarados: una píldora con su manija, que es exactamente lo
  // que abre el botón.
  deslizadores: "M201-360q-53 0-86.5-33.5T81-480q0-53 33.5-86.5T201-600h558q53 0 86.5 33.5T879-480q0 53-33.5 86.5T759-360H201Zm365-60h197q26 0 43-17t17-43q0-34-17-47t-43-13H566v120Z",
} as const;

/**
 * Glifos de UNIDAD del chip °/rad de obs-trig: las palabras DEG, RAD y GRAD dibujadas, no texto.
 *
 * Van aparte de `ICONO` porque **no son cuadrados**. El resto del juego llena una caja de 960×960;
 * una palabra de tres o cuatro letras que tiene que caber a lo ancho ocupa una franja de 840×276,
 * así que dibujarla en un lienzo cuadrado la dejaría en un tercio del alto del chip e ilegible.
 * Cada glifo lleva su `viewBox` ajustado a la tinta, y el chip lo pinta a lo ancho.
 *
 * **Las cajas llevan 30 unidades de margen por lado**, y no es estética: ajustadas al píxel de la
 * tinta, el borde inferior de las letras cae exactamente sobre el límite del lienzo y a este
 * tamaño se queda con media cobertura de píxel — se ve comido por abajo. El margen le da al
 * rasterizador con qué trabajar.
 *
 * DEG y RAD comparten caja para que el chip no cambie de cuerpo al alternar entre ellas. GRAD
 * lleva una letra más y no cabe a ese cuerpo, así que su caja es más baja: se ve algo menor, que
 * es lo que le pasa a cualquier palabra larga en un ancho fijo.
 *
 * Los archivos fuente están en `assets/icons/unit_*.svg`.
 */
/**
 * La θ que comparten los tres glifos de unidad, dibujada UNA vez.
 *
 * Es un anillo elíptico con su barra: la elipse exterior se recorre en un sentido y la interior
 * en el contrario, y de ahí sale el hueco por la regla `nonzero` —la misma con la que están
 * hechas las contras de la D y de la R del juego—. La barra cruza de lado a lado; que solape con
 * el anillo no molesta, porque solapar en el mismo sentido sigue siendo relleno.
 */
/**
 * La θ que comparten los tres glifos de unidad, dibujada UNA vez.
 *
 * Lora no trae griego, así que esta es la única letra del juego que hay dibujada a mano. Se
 * construyó para PARECERSE A LA O DE LORA ITALIC —astas de 36 unidades a los lados contra 20
 * arriba y abajo, y la misma inclinación de 2,8°— porque una θ geométrica junto a un subíndice
 * serif se lee como dos alfabetos distintos en el mismo chip.
 *
 * El hueco sale de recorrer la elipse interior al revés que la exterior (regla `nonzero`), y la
 * barra cruza de lado a lado: solapar con el anillo en el mismo sentido sigue siendo relleno.
 */
const THETA =
  "M151.4 -272.1C198.2 -272.1 233.2 -211.2 229.5 -136.1C225.8 -60.9 184.9 0 138.1 0C91.3 0 56.3 -60.9 60 -136.1C63.7 -211.2 104.6 -272.1 151.4 -272.1ZM150.4 -251.9C123.4 -251.9 98.9 -200 95.8 -136.1C92.6 -72.1 112 -20.2 139.1 -20.2C166.1 -20.2 190.6 -72.1 193.7 -136.1C196.9 -200 177.5 -251.9 150.4 -251.9ZM60.6 -148.5L230.1 -148.5L228.9 -123.6L59.4 -123.6Z";

/**
 * La caja es la MISMA para las tres unidades, y eso es lo que hace que la θ no dé un salto al
 * recorrer el ciclo: el subíndice va centrado en una ranura de ancho fijo, así que cambiar de
 * unidad mueve la letra y nada más. Los 30 de margen por lado son los del resto del juego:
 * ajustada al píxel de la tinta, el borde se queda a media cobertura y se ve comido.
 */
const CAJA_UNIDAD = "30 -302 363 378";

/**
 * θ con el subíndice de cada unidad: θᴅ, θʀ, θɢ.
 *
 * Los subíndices son los CONTORNOS REALES de Lora Italic —la tipografía que el bloque ya
 * embebe—, extraídos de la fuente y no redibujados: así la letra del chip es exactamente la
 * misma que la del resto de la interfaz, con sus remates y su modulación. Las tres se escalan
 * por el MISMO factor en vez de encajar cada una en su caja, porque la G rebasa un pelo por
 * arriba y por abajo a propósito —corrección óptica del tipógrafo— y normalizarlas por separado
 * la destruiría.
 */
export const GLIFO_UNIDAD = {
  degrees: { caja: CAJA_UNIDAD, d: THETA + "M290.9 -79.5Q306.5 -79.5 319.2 -76.1Q331.9 -72.7 341 -65.4Q350.1 -58.2 355 -47.3Q360 -36.4 360 -21.4Q360 -8.3 355.6 3.8Q351.2 15.8 342.3 25.3Q333.5 34.8 320.2 40.3Q306.8 45.9 289.1 45.9L242.8 45.9L243.2 40Q250 39.6 252.7 36.8Q255.3 34.1 255.9 29.2Q256.4 24.2 256.6 18L260.9 -59.3Q261.2 -62.9 261.5 -66.2Q261.8 -69.5 262.1 -72.2Q258.7 -72 255.5 -71.8Q252.3 -71.6 248.9 -71.4L249.4 -79.3L290.9 -79.5ZM289.9 -72.9Q283.1 -72.9 280.1 -70.7Q277.2 -68.6 276.4 -64.1Q275.5 -59.6 275.2 -52.7L271.1 24.8Q270.9 29.6 270.5 33Q270.2 36.4 269.8 38.7Q273.8 38.9 277 39Q280.2 39.1 283.1 39.1Q286.1 39.1 289 39.1Q305.2 39.1 317.4 30.9Q329.6 22.8 336.4 8.9Q343.3 -4.9 343.3 -22.1Q343.3 -45.1 330.3 -59Q317.2 -72.9 289.9 -72.9Z" },
  radians: { caja: CAJA_UNIDAD, d: THETA + "M297.2 -79.7Q314.5 -79.5 324.8 -75.2Q335.1 -70.9 339.5 -63.7Q343.9 -56.4 343.3 -46.9Q343 -40.1 340 -33.1Q337.1 -26 329.7 -20.3Q322.4 -14.6 308.6 -11.7Q311.5 -8.5 312.9 -7Q314.4 -5.5 315.2 -4.5Q316.1 -3.5 317.2 -1.7Q318.3 0.1 320.4 3.8L331.5 23Q334.4 27.8 337 31.7Q339.6 35.5 343.2 37.7Q346.9 40 352.4 40L352.1 45.9L330.3 45.9Q326.3 42.5 322.7 37.2Q319 31.9 315.4 26L304.5 6.9Q302.4 3 299.7 -1.9Q297 -6.7 293.4 -10.1Q291.8 -9.9 288.9 -9.9Q285.9 -9.9 283.4 -10Q280.9 -10.1 280.4 -10.1L278.6 24.6Q278.4 29.4 278.1 32.9Q277.7 36.4 277.3 38.7Q279.5 38.5 281.6 38.5Q283.8 38.4 285.9 38.2Q288.1 38 290.2 38L289.9 45.9L250.3 45.9L250.7 40Q257.5 39.6 260.2 36.8Q262.9 34.1 263.4 29.2Q263.9 24.2 264.1 18L268.2 -59.3Q268.4 -62.9 268.8 -66.2Q269.1 -69.5 269.5 -72.2Q266.2 -72 262.9 -71.8Q259.6 -71.6 256.4 -71.4L257 -79.3Q267 -79.5 276.9 -79.7Q286.8 -79.8 297.2 -79.7ZM296.1 -72.9Q289.9 -72.9 287.2 -70.4Q284.5 -67.9 283.8 -63.3Q283.1 -58.7 282.7 -52.3L280.7 -17.1Q283.6 -16.9 286.2 -16.7Q288.8 -16.5 291.8 -16.7Q301.7 -17.1 309.3 -19.9Q317 -22.8 321.6 -29.1Q326.2 -35.3 326.7 -45.5Q327.1 -52.3 325.4 -57.4Q323.7 -62.5 320 -66Q316.3 -69.5 310.3 -71.2Q304.3 -72.9 296.1 -72.9Z" },
  gradians: { caja: CAJA_UNIDAD, d: THETA + "M297.2 48.7Q279.3 48.7 266.2 41.2Q253 33.7 246.3 19.6Q239.6 5.5 240.7 -14Q241.4 -26.7 245.8 -38.8Q250.2 -50.9 258.2 -60.7Q266.2 -70.5 278.1 -76.4Q290 -82.2 305.6 -82.2Q312 -82.2 318.6 -81Q325.1 -79.8 331.2 -77.7Q337.2 -75.6 342.1 -72.5L341.7 -80.9L351.5 -80.9L349.4 -40L343 -40Q342.8 -51.2 338 -59Q333.1 -66.8 324.9 -70.9Q316.7 -75 306.3 -75Q296.8 -75 288.2 -70.8Q279.7 -66.6 273 -59Q266.4 -51.4 262.3 -41Q258.2 -30.7 257.5 -18.1Q256.6 -1.3 262 11.9Q267.3 25.1 277.8 32.6Q288.2 40.2 302.4 40.2Q307.2 40.2 312.6 39.3Q317.9 38.4 323.3 36.3Q328.7 34.2 333.5 31.2L334.6 10.3Q334.9 5.6 335.1 1.2Q335.3 -3.3 335.5 -7.8Q332.4 -7.6 329.2 -7.4Q326 -7.2 322.9 -7.1L323.3 -14.9L363.2 -14.9L362.8 -9Q357.8 -9 355 -6.4Q352.3 -3.8 351 -0.2Q349.8 3.5 349.4 7Q349 10.5 348.9 12.3L347.4 39.4L343.1 39.4Q340.3 39.4 335.3 40.5Q330.3 41.6 323.7 44.1Q318.1 46.2 310.6 47.5Q303.1 48.7 297.2 48.7Z" },
} as const satisfies Record<UnidadTrig, { caja: string; d: string }>;

/** Las tres unidades en el orden en que las recorre el chip. */
export const CICLO_UNIDAD: readonly UnidadTrig[] = ["degrees", "radians", "gradians"];
