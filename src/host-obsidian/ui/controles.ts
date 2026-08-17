// ─────────────────────────────────────────────
// host-obsidian · ui/controles — piezas sueltas de interfaz
// ─────────────────────────────────────────────
//
// Tooltip, iconos, glifos de unidad y etiquetas matemáticas: lo que montan TODOS los
// bloques y ninguno debería reimplementar. `montarEtiquetaMath` recibe el plugin en vez
// de leerlo de un `this` porque es lo único que necesita de él (su `app`, para KaTeX), y
// pasarlo explícito deja el módulo utilizable desde cualquier sitio.

import {
  MarkdownRenderChild,
  MarkdownRenderer,
  setTooltip,
  type Component,
  type MarkdownPostProcessorContext,
} from "obsidian";

import { ICONO, GLIFO_UNIDAD } from "./iconos";
import { t } from "../../i18n";
import type { UnidadTrig } from "../../trig/bloqueTrig";
import type { PluginConAjustes } from "../ajustes";

/**
 * Tooltip ÚNICO y consistente para los controles del motor: el de Obsidian (oscuro),
 * anclado ARRIBA para que el cursor no lo tape. Usa `setTooltip` (API de Obsidian), que NO
 * pone `title` → sin el tooltip NATIVO del navegador que antes lo duplicaba.
 *
 * ARRIBA SIEMPRE, en todo el plugin. No es una preferencia: el cursor está justo encima de lo
 * que se señala, así que un tooltip por debajo aparece donde va la mano y tapa el control —y en
 * los controles del plano, el propio plano—. Este es el único sitio donde se elige la posición.
 */
export function ponerTooltip(el: HTMLElement, texto: string): void {
  setTooltip(el, texto, { placement: "top" });
}

/**
 * Rótulo accesible de un control que YA tiene semántica ARIA propia (`role="slider"`,
 * `role="group"`): pone su nombre y ancla ARRIBA el tooltip.
 *
 * Existe porque un `aria-label` no es solo para el lector de pantalla: Obsidian deriva de él un
 * tooltip, y ese camino NO pasa por `setTooltip`, así que se quedaba con la posición por defecto
 * —debajo—. El deslizador de un parámetro enseñaba «Valor de B» tapando el propio deslizador
 * mientras se arrastraba. Se fija con `data-tooltip-position`, que es lo que lee ese camino.
 *
 * No se usa `ponerTooltip` aquí a propósito: el nombre accesible se escribe explícitamente en vez
 * de confiar en que la API lo derive, porque estos controles no tienen texto del que caerse.
 */
export function ponerEtiquetaAccesible(el: HTMLElement, texto: string): void {
  el.setAttribute("aria-label", texto);
  el.setAttribute("data-tooltip-position", "top");
}

/** Crea el botón-icono de opciones dentro de la barra dada y lo devuelve. Reemplaza al
 *  antiguo "Opciones ▾"; común a los tres bloques. `titulo` es su tooltip CERRADO (lo que
 *  despliega, distinto en cada bloque). El icono (☰/✕) lo pone `iconoBotonOpciones`; el
 *  resaltado, `estiloBotonOpciones` (ambos en cada `sincronizar`). */
export function crearBotonOpciones(barra: HTMLElement, titulo: string): HTMLElement {
  const b = barra.createDiv();
  iconoBotonOpciones(b, false, titulo);
  return b;
}

/** Pone en el botón de opciones el glifo que corresponde a su estado: ☰ cuando el menú
 *  está CERRADO (pulsar abre) y ✕ cuando está ABIERTO (pulsar cierra), con el tooltip
 *  describiendo esa acción —`titulo` es el del estado cerrado—. `sincronizar` lo llama en
 *  cada clic, así que solo repinta cuando el glifo CAMBIA (`dataset.icono` = el actual). */
export function iconoBotonOpciones(b: HTMLElement, abierto: boolean, titulo: string): void {
  const nombre = abierto ? "cerrar" : "menu";
  if (b.dataset.icono === nombre) return;
  b.dataset.icono = nombre;
  b.empty();
  montarIcono(b, nombre, 18);
  ponerTooltip(b, abierto ? t().botones.cerrarMenu : titulo);
}

/** Pinta un icono de `ICONO` (lado `px`) como <svg> hijo de `el`, heredando el color vía
 *  `fill:currentColor`. Sin `innerHTML`: usa la API DOM de Obsidian (createSvg). */
export function montarIcono(el: HTMLElement, nombre: keyof typeof ICONO, px: number): void {
  const svg = el.createSvg("svg", {
    attr: { viewBox: "0 -960 960 960", width: px, height: px, fill: "currentColor" },
  });
  svg.createSvg("path", { attr: { d: ICONO[nombre] } });
}

/**
 * Pinta el glifo de una unidad (θ con su subíndice) CONTENIDO en una caja de `px` de lado.
 *
 * No pasa por `montarIcono` porque estos glifos no son exactamente cuadrados —la caja mide
 * 387×378, así que sobra un 2% de ancho— y clavarles un lado los deformaría. Se escala por la
 * dimensión que ate y la otra sale de la proporción de su caja, que es la regla que vale sin
 * saber de antemano cuál de las dos es la larga: si algún día el subíndice creciera, el glifo
 * seguiría cabiendo en vez de desbordar el chip.
 */
export function montarGlifoUnidad(el: HTMLElement, unidad: UnidadTrig, px: number): void {
  const { caja, d } = GLIFO_UNIDAD[unidad];
  const [, , ancho, alto] = caja.split(" ").map(Number);
  const escala = px / Math.max(ancho, alto);
  const svg = el.createSvg("svg", {
    attr: {
      viewBox: caja,
      width: Math.round(ancho * escala),
      height: Math.round(alto * escala),
      fill: "currentColor",
    },
  });
  svg.createSvg("path", { attr: { d } });
}

/** Renderiza LaTeX INLINE como ETIQUETA de un botón/opción del toggle (glifo matemático
 *  en vez de texto): limpia `el`, pinta `$tex$` con KaTeX (mismo pipeline que el panel) y
 *  desenvuelve el `<p>` para que quede en línea. El color lo hereda del botón (KaTeX no
 *  fuerza color), así sigue el resaltado activo/inactivo. Async (no bloquea el montaje). */
export function montarEtiquetaMath(
  plugin: PluginConAjustes,
  el: HTMLElement, tex: string, ctx: MarkdownPostProcessorContext
): void {
  // Lifecycle propio atado al bloque (via ctx): NUNCA el plugin como componente
  // (su vida es demasiado larga → fuga). Obsidian lo descarga al quitar el bloque.
  const hijo = new MarkdownRenderChild(el);
  ctx.addChild(hijo);
  pintarMathEnLinea(plugin, el, tex, ctx.sourcePath, hijo);
}

/**
 * Lo mismo, pero con el COMPONENTE puesto desde fuera: pinta `$tex$` en `el` y desenvuelve el
 * `<p>` para que quede en línea. Es la variante para lo que se REPINTA —un cuadro que se
 * refresca en cada pasada—, donde crear un `MarkdownRenderChild` por render iría acumulando
 * hijos en el bloque; con el componente del bloque (`limpieza`) hay uno solo y se descarga con
 * él. Es el mismo trato que se da al panel de fórmula, que también se repinta.
 *
 * `respaldo` es el texto que queda si el render NO llega a completarse: un cuadro que se queda
 * en blanco es peor que uno feo, y aquí lo que se pinta es el resultado, no un adorno.
 */
export function pintarMathEnLinea(
  plugin: PluginConAjustes,
  el: HTMLElement, tex: string, sourcePath: string,
  componente: Component, respaldo?: string
): void {
  pintarLineaPanel(plugin, el, `$${tex}$`, sourcePath, componente, respaldo);
}

/**
 * Una LÍNEA de un cuadro ⓘ, que mezcla prosa y matemática: `Intersección Y: $\left(0,\
 * \frac{\pi}{2}\right)$`. La prosa se queda en la fuente del panel y lo que va entre `$`
 * se compone con KaTeX.
 *
 * Es el mismo trato que reciben las fórmulas del panel izquierdo, y la razón de que la
 * frontera la marquen los `$` y no un campo aparte es que solo el TEXTO sabe dónde está: en
 * «Raíces: …» la matemática es la lista, y en «Máximo en θ = …» es la igualdad entera. Cada
 * idioma pone sus delimitadores donde le corresponden y este módulo no tiene que adivinarlo.
 *
 * Sin `$` no se llama al renderizador: una línea de prosa pura («No hay raíces reales») se
 * pinta como texto y se ahorra el viaje.
 */
export function pintarLineaPanel(
  plugin: PluginConAjustes,
  el: HTMLElement, linea: string, sourcePath: string,
  componente: Component, respaldo?: string
): void {
  el.empty();
  if (!linea.includes("$")) { el.setText(linea); return; }
  void MarkdownRenderer.render(plugin.app, linea, el, sourcePath, componente)
    .then(() => {
      // El renderizador envuelve en `<p>`, que es un bloque con sus márgenes: se desenvuelve
      // para que la línea quede en el flujo del cuadro como cualquier otra.
      const p = el.querySelector("p");
      if (p) { while (p.firstChild) el.appendChild(p.firstChild); p.remove(); }
    })
    .catch(() => { el.setText(respaldo ?? linea); });
}
