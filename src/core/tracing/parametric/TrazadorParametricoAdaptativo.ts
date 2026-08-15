// ─────────────────────────────────────────────
// tracing/parametric · Trazador paramétrico ADAPTATIVO (Etapa 6)
// ─────────────────────────────────────────────
//
// Traza una curva p(t)=(x(t),y(t)) muestreando el PARÁMETRO t y refinando por
// geometría EN PANTALLA. Sirve por igual a paramétricas y polares (una polar es
// una paramétrica cartesiana). Misma filosofía que el sampler explícito —densidad
// ligada a píxeles, refinado por error en pantalla, corte en discontinuidades—
// pero en 2D, porque la curva no es función de x: el criterio de refinamiento es
// la DESVIACIÓN del punto medio respecto a la cuerda en píxeles (error de Fréchet
// en pantalla, justo lo que promete `Tolerancia.desviacionMaxPx`).
//
// Produce la MISMA `Rama` que los demás trazadores → "no se nota la estrategia".
// Las ramas paramétricas se emiten SIN `parametro`: `analysis/lecturaRama` usa
// `parametro` como la x (crosshair/carril por-x), y t≠x lo leería mal; el
// crosshair/carril por t/arco es trabajo futuro (igual que en implícitas).
//
// Casos generales (no parches por función):
//   • Hueco de dominio (p(t) no finito: raíz de negativo, etc.) → parte la rama,
//     bisecando para acercar el borde del dominio.
//   • Discontinuidad / polo (salto enorme en pantalla que NO se reduce al
//     subdividir, p.ej. r→∞ en una polar, o tan) → parte la rama (no une el salto).
//   • Cierre: una sola rama sin cortes con extremos coincidentes en pantalla →
//     `cerrada` (círculos, cardioides…).

import type {
  TrazadorParametrico,
  Parametrizacion,
  Viewport,
  Tolerancia,
  Rama,
} from "../../contracts";

// `util` = el punto sirve para trazar: es finito Y está dentro del viewport
// expandido por un margen. Un punto finito pero MUY lejos (p.ej. una polar con
// r→∞ cerca de un polo, o tan) NO es útil: se trata como borde de hueco (se cierra
// la rama y se reanuda al volver a la vista), igual que un valor no finito. Así se
// evita la fragmentación en miles de micro-ramas mientras la curva corre al
// infinito, y se acota el trabajo a lo que se ve (el renderer recorta a la vista).
type Pt = { x: number; y: number; sx: number; sy: number; util: boolean };
type Presupuesto = { evals: number; max: number };

const N0_FINAL = 400;            // muestras uniformes iniciales (pasada final)
const N0_INTERACTIVO = 200;
const PROF_MAX_FINAL = 20;       // profundidad de subdivisión por tramo
const PROF_MAX_INTERACTIVO = 14;
const SALTO_PX_FINAL = 10;       // cuerda en pantalla que fuerza subdivisión (densidad)
const SALTO_PX_INTERACTIVO = 16;
const MAX_EVALS_FINAL = 300_000;       // cota determinista (polares/paramétricas densas)
const MAX_EVALS_INTERACTIVO = 100_000;
// Giro máximo admitido en un vértice, en grados. Ver `GIRO_MAX` abajo: la desviación
// (sagita) NO acota la curvatura, y es la curvatura lo que el ojo lee como "faceta".
const GIRO_MAX_GRADOS_FINAL = 3;
const GIRO_MAX_GRADOS_INTERACTIVO = 4;
// Por debajo de esta cuerda en píxeles el criterio de giro se apaga: un quiebre más
// corto que esto queda dentro del propio grosor del trazo, no se ve, y seguir
// subdividiendo por ángulo no terminaría nunca en una cúspide REAL (cardioide en el
// origen, r=0 de una rosa), donde el giro es genuino y no un artefacto del muestreo.
const CUERDA_MIN_GIRO_PX = 1.5;

export class TrazadorParametricoAdaptativo implements TrazadorParametrico {
  trazar(
    p: Parametrizacion,
    objetoId: string,
    viewport: Viewport,
    tolerancia: Tolerancia
  ): readonly Rama[] {
    const [t0, t1] = p.dominio;
    if (!(t1 > t0) || !Number.isFinite(t0) || !Number.isFinite(t1)) return [];

    const interactivo = tolerancia.pasada === "interactiva";
    const N0 = interactivo ? N0_INTERACTIVO : N0_FINAL;
    const PROF_MAX = interactivo ? PROF_MAX_INTERACTIVO : PROF_MAX_FINAL;
    const SALTO_PX = interactivo ? SALTO_PX_INTERACTIVO : SALTO_PX_FINAL;
    // Umbral de desviación en píxeles: HONRA el campo del contrato (primer consumidor
    // real de `desviacionMaxPx`); durante el gesto se afloja ×2 (menos puntos).
    const desvBase =
      Number.isFinite(tolerancia.desviacionMaxPx) && tolerancia.desviacionMaxPx > 0
        ? tolerancia.desviacionMaxPx
        : 0.5;
    const DESV = Math.max(0.05, desvBase) * (interactivo ? 2 : 1);
    // Criterio de GIRO (curvatura), independiente de la desviación. Hace falta porque la
    // desviación es una SAGITA y escala con el cuadrado de la cuerda: en un arco de radio R
    // en pantalla, un giro θ deja una sagita de solo R(1−cos(θ/2)), así que con la curva
    // pequeña en pantalla un vértice puede girar 36° y aun así pasar el umbral de 1 px.
    // Medido en `r=sin(θ/10)`: los giros salían cuantizados en 36/18/9/4,5° —potencias de dos,
    // es decir, la polilínea del muestreo uniforme SIN refinar ni una vez— con un giro medio
    // por vértice de 19,7° (interactiva) y 9,9° (final). Eso es un polígono, y se hace visible
    // al acercarse porque los segmentos crecen hasta el tope de `SALTO_PX` (16 px) mientras el
    // giro se mantiene: aristas largas y anguladas. Acotar el giro es lo que faltaba.
    const GIRO_MAX =
      ((interactivo ? GIRO_MAX_GRADOS_INTERACTIVO : GIRO_MAX_GRADOS_FINAL) * Math.PI) / 180;
    // Salto que se considera DISCONTINUIDAD si no se reduce al subdividir.
    const SALTO_DISC = Math.max(viewport.anchoPx, viewport.altoPx) * 0.5;

    const ax = viewport.anchoPx / (viewport.domX[1] - viewport.domX[0]);
    const ay = viewport.altoPx / (viewport.domY[1] - viewport.domY[0]);
    const sx = (x: number): number => (x - viewport.domX[0]) * ax;
    const sy = (y: number): number => viewport.altoPx - (y - viewport.domY[0]) * ay;
    // Margen de utilidad: viewport expandido 1× su tamaño por cada lado (3× total).
    // Lo de fuera no se traza (el renderer recorta a la vista); evita perseguir ∞.
    const mx = viewport.domX[1] - viewport.domX[0];
    const my = viewport.domY[1] - viewport.domY[0];
    const enMargen = (x: number, y: number): boolean =>
      x > viewport.domX[0] - mx && x < viewport.domX[1] + mx &&
      y > viewport.domY[0] - my && y < viewport.domY[1] + my;

    const presupuesto: Presupuesto = {
      evals: 0,
      max: interactivo ? MAX_EVALS_INTERACTIVO : MAX_EVALS_FINAL,
    };
    const ev = (t: number): Pt => {
      presupuesto.evals++;
      const q = p.eval(t);
      const util = Number.isFinite(q.x) && Number.isFinite(q.y) && enMargen(q.x, q.y);
      return { x: q.x, y: q.y, sx: util ? sx(q.x) : NaN, sy: util ? sy(q.y) : NaN, util };
    };

    const ramas: Rama[] = [];
    let seg: number[] = [];
    let corte = false; // ¿hubo algún corte (hueco/discontinuidad)? → no puede cerrar
    const flush = () => {
      if (seg.length >= 4)
        ramas.push({ puntos: Float64Array.from(seg), cerrada: false, calidad: "best-effort", objetoId });
      seg = [];
    };
    const push = (q: Pt) => { seg.push(q.x, q.y); };

    // Procesa (ta,A] → (tb,B], asumiendo A ya emitido. Subdivide por desviación.
    const tramo = (ta: number, A: Pt, tb: number, B: Pt, prof: number): void => {
      if (presupuesto.evals > presupuesto.max) { if (A.util) push(A); return; }

      if (A.util && B.util) {
        const dxs = B.sx - A.sx, dys = B.sy - A.sy;
        const cuerda = Math.hypot(dxs, dys);
        if (prof < PROF_MAX) {
          const tm = (ta + tb) / 2;
          const M = ev(tm);
          if (M.util) {
            // Distancia perpendicular de M a la cuerda A–B, en píxeles.
            const dev = cuerda < 1e-9
              ? Math.hypot(M.sx - A.sx, M.sy - A.sy)
              : Math.abs(dxs * (A.sy - M.sy) - (A.sx - M.sx) * dys) / cuerda;
            // Giro en M entre las dos semicuerdas A→M y M→B: es exactamente el ángulo que
            // quedaría dibujado en ese vértice si este tramo se emitiera sin refinar más.
            let giro = 0;
            if (cuerda > CUERDA_MIN_GIRO_PX) {
              const ux = M.sx - A.sx, uy = M.sy - A.sy;
              const vx = B.sx - M.sx, vy = B.sy - M.sy;
              const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
              if (lu > 1e-9 && lv > 1e-9)
                giro = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
            }
            // ×2: si el tramo se acepta, M se DESCARTA y se emite la cuerda A→B entera, así
            // que el giro que acaba dibujado en la unión con el tramo vecino es ~el doble del
            // medido aquí (cada lado aporta su mitad). Comparar `giro` a secas dejaba pasar
            // 11,6° con un umbral nominal de 6°.
            if (dev > DESV || cuerda > SALTO_PX || giro * 2 > GIRO_MAX) {
              tramo(ta, A, tm, M, prof + 1);
              tramo(tm, M, tb, B, prof + 1);
              return;
            }
          } else {
            // El punto medio sale del margen (hueco de dominio o salida de la vista).
            tramo(ta, A, tm, M, prof + 1);
            tramo(tm, M, tb, B, prof + 1);
            return;
          }
        }
        // Profundidad agotada: salto enorme = discontinuidad (no se redujo) → corta.
        if (cuerda > SALTO_DISC) { push(A); flush(); corte = true; push(B); return; }
        push(B);
        return;
      }

      // A útil, B fuera (hueco de dominio o fuera de la vista) → bisecar el borde y cerrar.
      //
      // El arco VISIBLE que va de A al borde hay que trazarlo, no saltárselo. Antes se
      // emitía únicamente el punto del borde, así que todo lo que hubiera entre A y él se
      // dibujaba como UNA RECTA: en cuanto el zoom deja el trozo visible dentro de un solo
      // paso del muestreo inicial en t, la curva entera se convertía en un puñado de
      // aristas. Medido en `r=sin(θ/10)` a semiY=0.005: 7 puntos y 37,6 px de desviación en
      // la pasada interactiva (frente a 519 puntos y 0,07 px en la final) — que es
      // exactamente el síntoma "al hacer zoom se ve poligonal y al soltar se suaviza",
      // porque la final, con el doble de muestras iniciales, aún alcanzaba a resolverlo.
      // Refinando [ta, borde] con la lógica normal, el arco cumple la tolerancia en píxeles
      // en AMBAS pasadas.
      if (A.util && !B.util) {
        let lo = ta, hi = tb, ultimo = A;
        for (let k = 0; k < 24; k++) {
          const M = ev((lo + hi) / 2);
          if (M.util) { lo = (lo + hi) / 2; ultimo = M; } else hi = (lo + hi) / 2;
        }
        if (lo > ta && prof < PROF_MAX) tramo(ta, A, lo, ultimo, prof + 1);
        else push(ultimo);
        flush(); corte = true;
        return;
      }
      // A fuera, B útil → bisecar el borde e iniciar nueva rama. Simétrico del anterior: el
      // arco entre el borde y B también se refina en vez de emitirse como una sola recta.
      if (!A.util && B.util) {
        if (seg.length > 0) flush();
        let lo = tb, hi = ta, ultimo = B;
        for (let k = 0; k < 24; k++) {
          const M = ev((lo + hi) / 2);
          if (M.util) { lo = (lo + hi) / 2; ultimo = M; } else hi = (lo + hi) / 2;
        }
        corte = true;
        push(ultimo);
        if (lo < tb && prof < PROF_MAX) tramo(lo, ultimo, tb, B, prof + 1);
        else push(B);
        return;
      }
      // Ambos fuera → hueco; cierra lo que hubiera.
      if (seg.length > 0) { flush(); corte = true; }
    };

    const dt = (t1 - t0) / N0;
    let tA = t0;
    let A = ev(tA);
    if (A.util) push(A); else corte = true;
    for (let i = 1; i <= N0 && presupuesto.evals <= presupuesto.max; i++) {
      const tB = t0 + i * dt;
      const B = ev(tB);
      tramo(tA, A, tB, B, 0);
      tA = tB;
      A = B;
    }
    flush();

    // Cierre: una sola rama sin cortes y con extremos que coinciden en pantalla.
    if (!corte && ramas.length === 1) {
      const r = ramas[0].puntos, n = r.length;
      if (n >= 6) {
        const d = Math.hypot(sx(r[0]) - sx(r[n - 2]), sy(r[1]) - sy(r[n - 1]));
        if (d < Math.max(1, DESV * 2)) ramas[0] = { ...ramas[0], cerrada: true };
      }
    }
    return ramas;
  }
}
