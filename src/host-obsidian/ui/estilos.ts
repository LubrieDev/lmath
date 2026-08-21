// ─────────────────────────────────────────────
// host-obsidian · ui/estilos — cromo compartido de los controles del plano
// ─────────────────────────────────────────────
//
// Cadenas de estilo, no nodos: cada una devuelve el `cssText` de un control y el llamador
// decide sobre qué elemento lo aplica. Salieron de `MotorExperimental` porque ninguna
// tocaba el estado del adaptador —son funciones de sus argumentos— y porque las comparten
// los seis bloques: el chip ⓘ y su popover tienen que verse igual en obs-graph y en
// obs-vector, y con el estilo escrito una sola vez no pueden separarse al retocar uno.

/** Resaltado compartido (color, fondo, borde, sombra) de los botones de la barra del
 *  panel según estén ACTIVOS (resaltado) o no (atenuado). Lo comparten el botón de
 *  texto (`estiloBotonPanel`) y el botón-icono de opciones (`estiloBotonOpciones`). */
export function chromeBotonPanel(activo: boolean): string {
  return activo
    ? "color:var(--lmath-texto); background:var(--lmath-chip-activo); " +
      "border:1px solid var(--lmath-borde-activo); box-shadow:var(--lmath-sombra);"
    : "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
      "border:1px solid var(--lmath-borde); box-shadow:var(--lmath-sombra);";
}

/** Estilo compartido de los botones de TEXTO de la barra (Original, Derivada): activo =
 *  resaltado; inactivo = atenuado. Texto en Lora. */
export function estiloBotonPanel(b: HTMLElement, activo: boolean): void {
  b.style.cssText =
    "pointer-events:auto; padding:3px 10px; font-size:11px; line-height:1.15; " +
    "cursor:pointer; user-select:none; border-radius:8px; white-space:nowrap; " +
    "font-family:\"Lora\", var(--font-interface); " +
    "transition:background 0.12s ease, color 0.12s ease; " +
    chromeBotonPanel(activo);
}

/** Estilo del botón-icono de menú que abre las opciones: CUADRADO de esquinas suaves,
 *  mismo resaltado activo/inactivo que los de texto. El icono usa `fill:currentColor`, así
 *  que sigue el color del botón (se aviva al activarse). */
export function estiloBotonOpciones(b: HTMLElement, activo: boolean): void {
  b.style.cssText =
    "pointer-events:auto; box-sizing:border-box; width:26px; height:22px; " +
    "display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; " +
    "cursor:pointer; user-select:none; border-radius:7px; " +
    "transition:background 0.12s ease, color 0.12s ease; " +
    chromeBotonPanel(activo);
}

/**
 * Chip ⓘ de la esquina inferior derecha del plano. Los tres bloques que lo tienen (resumen
 * de una explícita, resumen geométrico y soluciones del sistema) son excluyentes entre sí y
 * comparten sitio, tamaño y acento: un único estilo evita que se separen al retocar uno.
 */
export function estiloChipInfo(lado: number): string {
  return `position:absolute; bottom:8px; right:8px; width:${lado}px; height:${lado}px; ` +
    "display:flex; align-items:center; justify-content:center; line-height:1; " +
    "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
    "border:1px solid var(--lmath-acento-borde); border-radius:50%; cursor:pointer; " +
    "user-select:none; z-index:5;";
}

/**
 * Clase del popover ⓘ. La lleva el elemento ADEMÁS del estilo en línea de abajo, porque hay
 * una regla que el estilo en línea no puede escribir: la de sus `<p>` (ver `styles.css`). Las
 * líneas del cuadro pasan por `MarkdownRenderer`, que las envuelve en párrafos, y sus márgenes
 * tienen que estar a cero DESDE EL PRIMER FOTOGRAMA. Se nombra aquí, junto al estilo que
 * acompaña, para que el nombre no viva en cinco archivos.
 */
export const CLASE_POPOVER_INFO = "lmath-info-pop";

/**
 * Popover del ⓘ: se abre HACIA ARRIBA desde su chip, así que su borde inferior sube con la
 * fila de chips. Los topes son relativos al PLANO (`min(...)` contra el 100%): en el móvil
 * el plano mide ~321×263 y un cuadro de 260×200 anclado abajo se saldría por arriba en
 * cuanto el chip creciera; en escritorio el plano es mayor y los topes fijos siguen mandando.
 *
 * Va de `--lmath-tarjeta`, el MISMO material que la caja de la fórmula: los dos son objetos
 * posados sobre el bloque, y que compartan color es lo que los hace leerse como una capa y no
 * como dos accidentes. Si uno cambia, cambia el otro: el color se toca en el token, no aquí.
 */
/** Tope fijo del popover ⓘ. Manda en escritorio, donde el plano es grande. */
export const ALTO_MAX_POPOVER = 200;

/**
 * El alto máximo que puede tener un popover cuyo borde inferior está a `bajo` píxeles del
 * suelo del plano: nunca más que el hueco que le queda por encima, dejando 8 de aire.
 *
 * Es una función y no un literal porque `bajo` **cambia después de crear el elemento**: en el
 * bloque estrecho el cromo sube por encima de la franja de controles, y quien mueva el `bottom`
 * tiene que mover el techo con él. Cuando no se hacía, el panel conservaba el presupuesto de la
 * posición sin subir, crecía por encima del bloque y `.lmath-container` —`overflow:hidden`— le
 * cortaba la primera fila. Y no se salvaba solo: al no superar su propio máximo, su
 * `overflow-y:auto` no llegaba a activarse, así que lo cortado era INALCANZABLE.
 */
export const techoPopover = (bajo: number): string =>
  `min(${ALTO_MAX_POPOVER}px, calc(100% - ${bajo + 8}px))`;

export function estiloPopoverInfo(lado: number): string {
  const bajo = 8 + lado + 6;
  return `position:absolute; bottom:${bajo}px; right:8px; display:none; ` +
    "max-width:min(260px, calc(100% - 16px)); " +
    `max-height:${techoPopover(bajo)}; ` +
    "overflow-y:auto; padding:8px 10px; box-sizing:border-box; " +
    "background:var(--lmath-tarjeta); border:1px solid var(--lmath-borde); " +
    "border-radius:6px; font-size:11px; line-height:1.5; " +
    "color:var(--lmath-texto); z-index:5; box-shadow:var(--lmath-sombra-flotante);";
}
