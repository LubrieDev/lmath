// ─────────────────────────────────────────────
// host-obsidian · analysis/transformaciones — la forma con la que nace el panel
// ─────────────────────────────────────────────
//
// Las transformaciones AUTOMÁTICAS (las de los ajustes) aplicadas al bloque. No toca el
// DOM ni el adaptador: entran ecuaciones, salen ecuaciones. Reutiliza el MISMO pipeline
// que los botones del panel, así que no hay dos definiciones de "despejar".

import { despejarEcuaciones } from "../../despejar";
import { simplificarEcuaciones } from "../../simplificar";
import type { AjustesTransformaciones } from "../ajustes";

/**
 * Aplica las transformaciones AUTOMÁTICAS activas (ajustes del plugin) al bloque, en el
 * orden formal despejar → simplificar, y devuelve el resultado que el panel muestra por
 * defecto. Reutiliza el MISMO pipeline que los botones (despejarEcuaciones/
 * simplificarEcuaciones): sin lógica duplicada. Si una transformación FALLA (lanza), se
 * conserva el resultado anterior —nunca rompe el render—.
 */
export function baseAutomatica(
  ecuaciones: readonly string[],
  ajustes: AjustesTransformaciones
): readonly string[] {
  let base: readonly string[] = ecuaciones;
  if (ajustes.despejarAuto) {
    try { base = despejarEcuaciones(base); } catch { /* conserva el resultado anterior */ }
  }
  // La simplificación es SIEMPRE automática (no configurable): todo bloque se muestra ya
  // simplificado/expandido, sin botón. Va tras el despeje (orden formal despejar → simplificar).
  try { base = simplificarEcuaciones(base); } catch { /* conserva el resultado anterior */ }
  return base;
}
