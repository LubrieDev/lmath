// ─────────────────────────────────────────────
// host-obsidian · ui/menu — la barra de toggle y su desplegable
// ─────────────────────────────────────────────
//
// El armazón que comparten los bloques con panel de fórmula. A diferencia del popover
// ⓘ, un menú SÍ se cierra al pulsar fuera: estorba hasta que se elige algo.

import type { MarkdownRenderChild } from "obsidian";

/**
 * Armazón del toggle del panel, COMÚN a los cuatro bloques: la barra de botones (arriba,
 * centrada, flotando sobre la fórmula) y el desplegable que cuelga de ella. Devuelve las
 * cajas vacías y el estilo de sus opciones; QUIÉN va dentro y qué hace al pulsarlo es cosa
 * de cada panel, que es lo único en lo que se diferencian.
 *
 * `barra` se crea antes que `menu` para que el desplegable quede por delante en el orden del
 * documento; ambos son absolutos dentro del panel, así que no participan en su flujo.
 */
export function crearMenuDesplegable(panelLatex: HTMLElement): {
  barra: HTMLElement;
  menu: HTMLElement;
  caja: HTMLElement;
  itemEstilo: (el: HTMLElement, habilitado: boolean) => void;
} {
  const barra = panelLatex.createDiv();
  barra.style.cssText =
    "position:absolute; top:8px; left:0; right:0; z-index:6; display:flex; gap:6px; " +
    "justify-content:center; pointer-events:none;";

  const menu = panelLatex.createDiv();
  menu.style.cssText =
    "position:absolute; top:36px; left:0; right:0; z-index:7; display:none; " +
    "flex-direction:column; align-items:center; pointer-events:none;";
  const caja = menu.createDiv();
  caja.style.cssText =
    "pointer-events:auto; display:flex; flex-direction:column; gap:2px; padding:4px; " +
    "border-radius:10px; background:var(--lmath-panel); " +
    "border:1px solid var(--lmath-borde); box-shadow:var(--lmath-sombra-flotante); " +
    "font-family:\"Lora\", var(--font-interface);";

  // Estilo de cada opción según esté HABILITADA (produciría un cambio) o no
  // (oscurecida y sin poder clicar, vía pointer-events).
  const itemEstilo = (el: HTMLElement, habilitado: boolean) => {
    el.style.cssText =
      "padding:5px 14px; font-size:11px; line-height:1.15; user-select:none; " +
      "border-radius:6px; white-space:nowrap; text-align:center; " +
      "transition:background 0.12s ease, color 0.12s ease; " +
      (habilitado
        ? "color:var(--lmath-texto); cursor:pointer; pointer-events:auto;"
        : "color:var(--lmath-texto-apagado); cursor:default; pointer-events:none;");
  };

  return { barra, menu, caja, itemEstilo };
}

/**
 * Cierra el desplegable al pulsar FUERA de la barra y del menú. Se registra en la limpieza
 * del bloque: es un listener del documento y sobreviviría al bloque que lo puso.
 */
export function cerrarMenuAlPulsarFuera(
  barra: HTMLElement, caja: HTMLElement, limpieza: MarkdownRenderChild, cerrar: () => void
): void {
  const onDocDown = (e: MouseEvent) => {
    if (!barra.contains(e.target as Node) && !caja.contains(e.target as Node)) cerrar();
  };
  document.addEventListener("mousedown", onDocDown);
  limpieza.register(() => document.removeEventListener("mousedown", onDocDown));
}
