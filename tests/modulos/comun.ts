// ─────────────────────────────────────────────
// tests · Soporte compartido de la suite del motor
// ─────────────────────────────────────────────
//
// Viewport, tolerancias y envoltorios que usan varios módulos de `tests/modulos/`.
// No contiene pruebas: solo el andamiaje que antes vivía en la cabecera de
// `motor.test.ts` cuando la suite era un único archivo.

import { crearViewport } from "../../src/motor/scene/viewport-utils";
import type { FuncionReal, CampoEscalar, Viewport, Tolerancia } from "../../src/motor/contracts";

export const VP: Viewport = crearViewport([-8, 8], [-7, 7], 768, 261, 1);
export const TOL_FINAL: Tolerancia = { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" };
export const TOL_INT: Tolerancia = { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "interactiva" };

export const fr = (f: (x: number) => number): FuncionReal => ({ eval: f });
export const ce = (f: (x: number, y: number) => number): CampoEscalar => ({ eval: f });

// Recorte a la banda [yBot, yTop] que usa muestreoExplicito (3× alto de vista).
export function clampBanda(y: number, vp: Viewport): number {
  const H = vp.domY[1] - vp.domY[0];
  const yTop = vp.domY[1] + H, yBot = vp.domY[0] - H;
  if (!Number.isFinite(y)) return y > 0 ? yTop : yBot;
  return Math.max(yBot, Math.min(yTop, y));
}
