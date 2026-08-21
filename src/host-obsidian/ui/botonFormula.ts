// ─────────────────────────────────────────────
// host-obsidian · ui/botonFormula — la puerta al panel en el reparto FLOTANTE
// ─────────────────────────────────────────────
//
// En el reparto por columnas la fórmula está siempre a la vista y este botón no existe (se
// esconde solo). En el FLOTANTE el bloque ES el plano y la fórmula pasa a una tarjeta encima:
// sin este botón la fórmula existiría y no habría forma de verla.
//
// Estaba escrito dentro de `MotorExperimental`, y `obs-vector` se hizo el suyo al llegar en la
// 1.4.0. No salieron iguales —el de obs-vector iba a la IZQUIERDA, con la `f(x)` en texto plano
// y sin convertirse en ✕ al abrir—, así que el mismo control se comportaba de dos maneras según
// el bloque. Aquí hay una sola versión y los dos la usan.
//
// Lo que el botón hace al pulsarse NO vive aquí: cada bloque cierra cosas distintas al abrir la
// fórmula (obs-graph tiene varios ⓘ, obs-vector uno solo y además repinta su lienzo). Este
// módulo monta el botón y sabe DIBUJARLO en cada estado; la política es del bloque.

import type { MarkdownPostProcessorContext } from "obsidian";

import { MARGEN_FLOTANTE, ladoIcono, type Reparto } from "./reparto";
import { ponerTooltip, montarIcono, montarEtiquetaMath } from "./controles";
import { t } from "../../i18n";
import type { PluginConAjustes } from "../ajustes";

/**
 * Monta el botón y devuelve su `sincronizar`: el bloque lo llama cada vez que cambia el reparto
 * o el estado del panel, y el botón se redibuja según `reparto.estrecho` y `reparto.abierto`.
 *
 * Va abajo a la IZQUIERDA. Estuvo a la derecha, apartándose del ⓘ, mientras el panel era una
 * tarjeta que dejaba ver el plano alrededor; con los dos modos ya no comparte sitio con nada, y
 * la esquina libre es mejor destino: el pulgar llega sin cruzar la pantalla y el botón deja de
 * moverse según haya ⓘ o no. Es además donde `obs-trig` tuvo el suyo desde el principio.
 *
 * Sigue la regla de 1.2.9 del menú ☰: el botón muestra lo que hace AHORA —`f(x)` cuando abrirá,
 * ✕ cuando cerrará—, con el tooltip y el resaltado a juego.
 */
export function montarBotonFormula(
  plugin: PluginConAjustes,
  wrap: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  reparto: Reparto,
  alPulsar: () => void
): () => void {
  const lado = reparto.ladoChip;
  // `lmath-sobre-panel`: sobrevive al modo fórmula (ver `sincronizar`). Es el interruptor
  // entre las dos caras del bloque, así que es justo lo único que no puede desaparecer con una
  // de ellas.
  const boton = wrap.createDiv({ cls: "lmath-sobre-panel" });

  /** ¿Estamos EN el modo fórmula (el panel ocupando el bloque entero)? */
  const enModoFormula = () => reparto.estrecho && reparto.abierto && !!reparto.panelCompleto;

  const estilo = () => {
    boton.style.cssText =
      `position:absolute; bottom:${MARGEN_FLOTANTE}px; left:${MARGEN_FLOTANTE}px; ` +
      `height:${lado}px; min-width:${lado}px; padding:0 8px; box-sizing:border-box; ` +
      // El `display` va aquí y no en una llamada aparte: esta función escribe TODO el estilo
      // del botón de una vez, y una visibilidad puesta desde fuera se perdería en el siguiente
      // repintado del estado.
      `display:${reparto.estrecho ? "flex" : "none"}; ` +
      "align-items:center; justify-content:center; font-size:11px; line-height:1; " +
      "border-radius:8px; cursor:pointer; user-select:none; z-index:7; " +
      (reparto.abierto
        ? "color:var(--lmath-texto); background:var(--lmath-chip-activo); " +
          "border:1px solid var(--lmath-borde-activo);"
        : "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
          "border:1px solid var(--lmath-borde);");
  };

  // El glifo solo se repinta cuando CAMBIA (`dataset`): la etiqueta matemática pasa por
  // MarkdownRenderer, que no es gratis, y esto se llama en cada sincronización.
  //
  // Con el panel A PANTALLA el botón no CIERRA nada, CAMBIA DE MODO: enseña la otra cara del
  // bloque, así que el glifo es el destino —el plano cartesiano— y no una ✕. Una ✕ diría que
  // hay algo que quitar de encima, y no lo hay: lo que se está viendo no está tapando nada.
  // Con la tarjeta flotante sí hay algo posado sobre el plano, y ahí la ✕ es exacta.
  const glifo = () => {
    const nombre = !reparto.abierto ? "formula" : enModoFormula() ? "plano" : "cerrar";
    if (boton.dataset.glifo === nombre) return;
    boton.dataset.glifo = nombre;
    boton.empty();
    if (nombre === "formula") montarEtiquetaMath(plugin, boton, "f(x)", ctx);
    else montarIcono(boton, nombre === "plano" ? "cartesian_plane" : "cerrar", ladoIcono(lado));
    ponerTooltip(boton, nombre === "formula"
      ? t().botones.verFormula
      : nombre === "plano" ? t().botones.verPlano : t().botones.cerrarFormula);
  };

  boton.addEventListener("click", (e) => {
    e.stopPropagation();
    alPulsar();
  });

  const sincronizar = () => {
    estilo();
    glifo();
    // En modo fórmula el plano no está: no es que sus chips estorben, es que el bloque está
    // enseñando otra cosa. La clase apaga TODO el contenido del plano —lienzo, chips, velo,
    // rótulos— y deja solo lo que se marcó para vivir sobre el panel (este botón y el ✎). Es
    // una regla de la hoja de estilos y no una lista de elementos que ir escondiendo a mano:
    // así un chip nuevo nace ya apagado en vez de aparecer flotando sobre la fórmula.
    wrap.toggleClass("lmath-modo-formula", enModoFormula());
  };
  sincronizar();
  return sincronizar;
}
