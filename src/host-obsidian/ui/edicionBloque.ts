// ─────────────────────────────────────────────
// host-obsidian · ui/edicionBloque — la puerta al CÓDIGO del bloque
// ─────────────────────────────────────────────
//
// Obsidian ofrece su botón `</>` para ver la fuente de un bloque ya renderizado, pero aparece
// AL PASAR EL RATÓN: en el móvil no existe. Y nuestros lienzos se quedan los toques que
// empiezan sobre ellos (`touch-action:none`, que es lo que permite mover el plano con el dedo),
// así que sin este chip un bloque renderizado en el teléfono no tiene NINGUNA puerta a lo que
// uno escribió: se puede leer, pero no corregir.
//
// Esto vivía como método privado de `MotorExperimental`, y por eso los bloques que llegaron
// después —obs-trig en la 1.3.2, obs-vector en la 1.4.0— nacieron sin él aunque compartan el
// mismo plano y el mismo problema. Aquí son dos funciones libres: montar el chip y saber llegar
// al editor. El siguiente bloque lo hereda con una línea en vez de con una copia, que es
// exactamente lo que no ocurrió las dos veces anteriores.
//
// Y funcionó: `obs-vector` lo heredó al partirse el módulo y `obs-trig` en la 2.0.0, los dos con
// una línea. **Los seis bloques lo montan ya**, así que si algún día hay un séptimo sin chip ✎,
// no será porque no estuviera compartido.

import { MarkdownView, type MarkdownPostProcessorContext } from "obsidian";

import { ladoIcono, MARGEN_FLOTANTE } from "./reparto";
import { ponerTooltip, montarIcono } from "./controles";
import { t } from "../../i18n";
import type { PluginConAjustes } from "../ajustes";

/**
 * Chip ✎ sobre el plano, y devuelve el elemento para que el bloque pueda esconderlo mientras
 * la fórmula flotante está abierta (ahí el botón no lleva a ningún sitio nuevo y solo compite
 * por la atención con lo que se ha venido a leer).
 *
 * Lo monta el bloque SOLO en táctil: con ratón el `</>` de Obsidian sigue siendo el camino y no
 * hace falta añadirle un botón de más al plano.
 *
 * Va SOLO en la esquina superior izquierda, apartado de la fila de abajo. No es un control del
 * plano como los demás: los de abajo a la derecha abren algo DENTRO del bloque y los de arriba a
 * la derecha mueven la vista, mientras que este SALE del bloque, al código de la nota. Además es
 * la única esquina que queda despejada con la fórmula abierta —el panel empieza justo por
 * debajo—, y alinea con el 🏠 al otro lado.
 *
 * `contenedor` es el elemento del que se saca la posición en el fichero, no el `wrap` del plano:
 * `getSectionInfo` quiere un elemento del bloque, y el contenedor es el que lo representa entero.
 */
export function montarChipEditar(
  plugin: PluginConAjustes,
  wrap: HTMLElement,
  contenedor: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  lado: number
): HTMLElement {
  // `lmath-sobre-panel`: es el único chip que sobrevive al modo fórmula. Ahí no hay plano, pero
  // sigue habiendo un bloque escrito, y corregir lo escrito es exactamente lo que se está
  // mirando (ver `ui/botonFormula`).
  const btn = wrap.createDiv({ cls: "lmath-sobre-panel" });
  ponerTooltip(btn, t().botones.editarBloque);
  btn.style.cssText =
    `position:absolute; top:6px; left:${MARGEN_FLOTANTE}px; ` +
    `width:${lado}px; height:${lado}px; ` +
    "display:flex; align-items:center; justify-content:center; line-height:1; " +
    "border-radius:50%; cursor:pointer; user-select:none; z-index:7; " +
    "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
    "border:1px solid var(--lmath-borde);";
  montarIcono(btn, "editar", ladoIcono(lado));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    irAlCodigoDelBloque(plugin, contenedor, ctx);
  });
  return btn;
}

/**
 * Lleva el cursor al CÓDIGO de este bloque, que es lo que hace el `</>` de Obsidian en
 * escritorio. Tres pasos, y ninguno se puede dar por hecho:
 *
 *  1. QUÉ LÍNEAS ocupa el bloque en el fichero: `getSectionInfo`. Devuelve null cuando el
 *     bloque no vive en un fichero editable (una vista previa, un embebido, un canvas);
 *     ahí no hay nada que editar y se sale sin hacer ruido.
 *  2. QUÉ VISTA lo contiene: la activa, comprobando que sea del MISMO fichero. Sin esa
 *     comprobación, tocar el chip de un bloque embebido movería el cursor de otra nota.
 *  3. En LECTURA no hay cursor donde ponerlo, así que primero se pasa la vista a edición.
 *     El salto se hace después, cuando el editor ya existe.
 *
 * El cursor cae DENTRO del cuerpo —nunca en las vallas ```—, así que en Live Preview el
 * bloque se abre mostrando su fuente, que es lo que se venía a hacer. Y cae al FINAL del
 * contenido, no al principio: se pulsa "editar" para seguir escribiendo, no para insertar
 * algo por delante de lo que ya hay.
 */
export function irAlCodigoDelBloque(
  plugin: PluginConAjustes,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  const seccion = ctx.getSectionInfo(el);
  if (!seccion) return;

  const vista = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (!vista || vista.file?.path !== ctx.sourcePath) return;

  /**
   * Final del CUERPO del bloque. `lineEnd` es la valla de cierre, así que la última línea
   * escribible es la anterior; se comprueba que de verdad sea una valla en vez de darlo por
   * hecho. Con el bloque VACÍO no hay ninguna línea de cuerpo (la valla de cierre va pegada
   * a la de apertura) y se cae al comienzo del hueco: es lo único que se puede hacer sin
   * inventarse una línea que el usuario no ha escrito.
   */
  const finDelCuerpo = (): { line: number; ch: number } => {
    const editor = vista.editor;
    const esValla = (n: number) => editor.getLine(n)?.trimStart().startsWith("```") ?? false;
    const ultima = esValla(seccion.lineEnd) ? seccion.lineEnd - 1 : seccion.lineEnd;
    if (ultima <= seccion.lineStart) return { line: seccion.lineStart + 1, ch: 0 };
    return { line: ultima, ch: editor.getLine(ultima).length };
  };

  const irAlBloque = () => {
    const destino = finDelCuerpo();
    vista.editor.setCursor(destino);
    // Tras cambiar de modo el bloque puede haber quedado fuera de pantalla, y en el móvil
    // además sube el teclado: sin esto, el cursor acaba donde no se ve.
    vista.editor.scrollIntoView({ from: destino, to: destino }, true);
    vista.editor.focus();
  };

  if (vista.getMode() === "preview") {
    // `setState` con el modo de edición; el editor no está listo hasta que la vista se
    // reconstruye, así que el salto va en el `then`, no a continuación.
    void vista.setState({ ...vista.getState(), mode: "source" }, { history: false })
      .then(irAlBloque);
  } else {
    irAlBloque();
  }
}
