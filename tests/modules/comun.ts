// ─────────────────────────────────────────────
// tests · Soporte compartido de la suite del motor
// ─────────────────────────────────────────────
//
// Viewport, tolerancias y envoltorios que usan varios módulos de `tests/modules/`.
// No contiene pruebas: solo el andamiaje que antes vivía en la cabecera de
// `motor.test.ts` cuando la suite era un único archivo, más los COMPROBADORES del
// despejador, que quedaron sueltos entre dos `describe` cuando `despeje.test.ts` era
// un solo archivo y ahora sirven a los módulos en que se partió.

import { assert, aprox } from "../runner";
import { despejarEcuaciones } from "../../src/despejar";
import { crearFuncionReal } from "../../src/core/fields/funcionRealMathjs";
import { crearViewport } from "../../src/core/scene/viewport-utils";
import type { FuncionReal, CampoEscalar, Viewport, Tolerancia } from "../../src/core/contracts";

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

/** Ramas reales de un despeje `y = …` con el centinela `pm`: expande el ± en sus dos signos. */
export function ramasDelDespeje(despeje: string): string[] {
  const m = despeje.match(/^y\s*=\s*(.*)$/s);
  if (!m) return [];
  const salida: string[] = [];
  const expandir = (s: string): void => {
    const i = s.indexOf("pm(");
    if (i < 0) { salida.push(s); return; }
    let d = 1, j = i + 3;
    while (j < s.length && d > 0) { if (s[j] === "(") d++; if (s[j] === ")") d--; j++; }
    const dentro = s.slice(i + 3, j - 1);
    for (const sg of ["+", "-"]) expandir(`${s.slice(0, i)}(${sg}(${dentro}))${s.slice(j)}`);
  };
  expandir(m[1]);
  return salida;
}

/** Comprueba que TODA rama del despeje satisface la ecuación ORIGINAL donde es real. */
export function despejeCorrecto(ecuacion: string, F: (x: number, y: number) => number): void {
  const ramas = ramasDelDespeje(despejarEcuaciones([ecuacion])[0]);
  assert(ramas.length > 0, `${ecuacion}: no quedó aislada en y`);
  let viables = 0;
  for (const rama of ramas) {
    const f = crearFuncionReal(rama);
    for (let x = -3; x <= 3; x += 0.137) {
      const y = f.eval(x) as number;
      if (!Number.isFinite(y)) continue;         // fuera del dominio de la rama
      aprox(F(x, y), 0, 1e-6 * (1 + x ** 4 + y ** 4), `${ecuacion} en x=${x.toFixed(2)}`);
      viables++;
    }
  }
  assert(viables >= 2, `${ecuacion}: la rama nunca es real (no se validó nada)`);
}
