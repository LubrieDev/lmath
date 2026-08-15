// ─────────────────────────────────────────────
// Diagnóstico de COSTE del trazador (terminal)
// ─────────────────────────────────────────────
//
// Responde a tres preguntas sobre el trazador explícito, sobre el motor real:
//
//   ¿cuánta geometría produce?   vértices por píxel de lienzo
//   ¿cuánta es INVISIBLE?        segmentos que caen sobre píxeles ya llenos
//   ¿dónde se va el tiempo?      evaluar la función vs emitir la geometría
//
// La columna que importa es REDUNDANTE-techo: qué fracción de los segmentos cae
// sobre píxeles que la imagen FINAL ya tiene pintados. En las vistas densas está
// entre el 96 % y el 99,9 % — geometría que no cambia un solo píxel.
//
// AVISO para quien intente cobrar ese 99 %: ya se probó parar el refinado por
// saturación y NO es seguro. `agotado` no controla solo cuánta geometría se emite;
// también decide si la rama se PARTE, si el polo se registra como ASÍNTOTA y si
// `esCruceContinuo` conecta. Al pararlo, `tan(x)` a ±3000 perdía 218 asíntotas —que
// pinta el overlay, fuera de la zona saturada—. Y `evals/vértice` ≈ 1,6 en todos los
// casos: el trazador no explora y descarta, emite casi todo lo que calcula, así que
// tampoco se puede emitir menos evaluando igual.
//
// Se bundlea con `npm run medir` y se ejecuta con node DIRECTO sobre el bundle:
//
//   node tools/.medir.cjs
//
// NB Windows: `node`, no `npm run medir -- …` (cmd.exe corrompe ^ y paréntesis).

import { TrazadorExplicitoAdaptativo } from "../src/core/tracing/explicit/TrazadorExplicitoAdaptativo";
import { crearFuncionReal } from "../src/core/fields/funcionRealMathjs";
import { crearViewport } from "../src/core/scene/viewport-utils";
import type { Rama, Viewport } from "../src/core/contracts";

const PLUMA = 2;                          // `grosorPx` real del trazo
const MARGEN = Math.ceil(PLUMA / 2) + 1;  // radio de pluma + 1 px de antialias

interface Medida {
  vertices: number;
  segmentos: number;
  redCausal: number;   // saltable mirando SOLO lo ya pintado (depende del orden)
  redTecho: number;    // saltable respecto a la imagen FINAL (la oportunidad real)
  saturados: number;
}

function analizar(ramas: readonly Rama[], vp: Viewport): Medida {
  const W = Math.round(vp.anchoPx), H = Math.round(vp.altoPx);
  const cov = new Float32Array(W * H);
  const kx = W / (vp.domX[1] - vp.domX[0]);
  const ky = H / (vp.domY[1] - vp.domY[0]);

  const splat = (x: number, y: number, cant: number) => {
    const xi = Math.floor(x - 0.5), yi = Math.floor(y - 0.5);
    const fx = x - 0.5 - xi, fy = y - 0.5 - yi;
    for (let dy = 0; dy <= 1; dy++) {
      const py = yi + dy; if (py < 0 || py >= H) continue;
      const wy = dy ? fy : 1 - fy;
      for (let dx = 0; dx <= 1; dx++) {
        const px = xi + dx; if (px < 0 || px >= W) continue;
        cov[py * W + px] += cant * wy * (dx ? fx : 1 - fx);
      }
    }
  };

  const recortar = (x0: number, y0: number, x1: number, y1: number): number[] | null => {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy], q = [x0, W - x0, y0, H - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  };

  // ¿Está TODA la huella del segmento —más la orla del grosor— ya saturada? Entonces
  // pintarlo es una operación nula: tinta opaca del mismo color sobre tinta plena.
  const yaCubierto = (c: number[]): boolean => {
    const dx = c[2] - c[0], dy = c[3] - c[1];
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.5));
    for (let k = 0; k <= n; k++) {
      const bx = Math.round(c[0] + (dx * k) / n), by = Math.round(c[1] + (dy * k) / n);
      for (let oy = -MARGEN; oy <= MARGEN; oy++) {
        const py = by + oy; if (py < 0 || py >= H) continue;
        for (let ox = -MARGEN; ox <= MARGEN; ox++) {
          const px = bx + ox; if (px < 0 || px >= W) continue;
          if (cov[py * W + px] < 0.999) return false;
        }
      }
    }
    return true;
  };

  const pintar = (c: number[]) => {
    const dx = c[2] - c[0], dy = c[3] - c[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const nx = -dy / len, ny = dx / len;
    const n = Math.max(1, Math.ceil(len / 0.34)), dl = len / n;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const bx = c[0] + dx * t, by = c[1] + dy * t;
      for (let l = 0; l < PLUMA; l++)
        splat(bx + nx * (l / (PLUMA - 1) - 0.5) * (PLUMA - 1),
              by + ny * (l / (PLUMA - 1) - 0.5) * (PLUMA - 1), dl);
    }
  };

  const cortados: (number[] | null)[] = [];
  let vertices = 0, segmentos = 0, redCausal = 0;
  for (const rama of ramas) {
    const pts = rama.puntos;
    vertices += pts.length / 2;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const c = recortar(
        (pts[i] - vp.domX[0]) * kx, H - (pts[i + 1] - vp.domY[0]) * ky,
        (pts[i + 2] - vp.domX[0]) * kx, H - (pts[i + 3] - vp.domY[0]) * ky
      );
      segmentos++;
      cortados.push(c);
      if (!c) { redCausal++; continue; }   // fuera de vista: también inútil
      if (yaCubierto(c)) { redCausal++; continue; }
      pintar(c);
    }
  }

  // Segunda vuelta con la imagen ya completa: el TECHO de lo que se podría ahorrar.
  let redTecho = 0;
  for (const c of cortados) if (!c || yaCubierto(c)) redTecho++;

  let saturados = 0;
  for (let i = 0; i < cov.length; i++) if (cov[i] >= 0.999) saturados++;
  return { vertices, segmentos, redCausal, redTecho, saturados };
}

function caso(
  nombre: string, expr: string, centroX: number, semiX: number,
  W = 470, H = 290, pasada: "interactiva" | "final" = "final"
) {
  const base = crearFuncionReal(expr);
  let evals = 0;
  const f = { eval: (x: number) => { evals++; return base.eval(x); } };
  const vp = crearViewport([centroX - semiX, centroX + semiX], [-7, 7], W, H, 1);

  const t0 = Date.now();
  const res = new TrazadorExplicitoAdaptativo().trazar(
    f, "m", vp, { desviacionMaxPx: 0.25, pasoMaxPx: 8, pasada });
  const ms = Date.now() - t0;

  const m = analizar(res.ramas, vp);
  const px = W * H;
  const pc = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : "0.0").padStart(5);
  process.stdout.write(
    `${nombre.padEnd(22)} vert ${String(m.vertices).padStart(9)} ` +
    `(${(m.vertices / px).toFixed(1).padStart(4)}/px) · ` +
    `evals/vert ${(evals / Math.max(1, m.vertices)).toFixed(1)} · ` +
    `REDUNDANTE causal ${pc(m.redCausal, m.segmentos)}% techo ${pc(m.redTecho, m.segmentos)}% · ` +
    `saturado ${pc(m.saturados, px)}% · ${String(ms).padStart(5)} ms\n`);
}

process.stdout.write("\n=== Vistas normales: no hay geometría que sobre ===\n");
caso("1/x ±8", "1/x", 0, 8);
caso("x^2/8 ±8", "x^2/8", 0, 8);
caso("sin(1/x) ±3", "sin(1/x)", 0, 3);
caso("tan(x) ±10", "tan(x)", 0, 10);

process.stdout.write("\n=== Vistas densas: el 96-99% es invisible ===\n");
caso("tan(x^2) ±10", "tan(x^2)", 0, 10);
caso("tan(x^2) ±40", "tan(x^2)", 0, 40);
caso("tan(x^2) ±120", "tan(x^2)", 0, 120);
caso("tan(x^2) ±300", "tan(x^2)", 0, 300);
caso("tan(x^2) 66±4", "tan(x^2)", 66, 4);
caso("tan(x) ±3000", "tan(x)", 0, 3000);
caso("tan(e^x) defecto", "tan(e^x)", 0, 20.6, 768, 261);

process.stdout.write("\n=== Pasada interactiva ===\n");
caso("tan(x^2) ±120 [int]", "tan(x^2)", 0, 120, 470, 290, "interactiva");
caso("tan(e^x) def [int]", "tan(e^x)", 0, 20.6, 768, 261, "interactiva");
process.stdout.write("\n");
