// ─────────────────────────────────────────────
// providers · ProveedorImplicitoTeselado (campo periódico → trazar UNA celda y teselar)
// ─────────────────────────────────────────────
//
// Implementa `ProveedorGeometria` para una implícita cuyo campo F es PERIÓDICO en x,
// en y, o en ambos (detectado numéricamente en analysis/periodicidadCampo). El caso
// canónico es la red de lazos de 4(cos x+cos y)+2cos(x+y)+2cos(x−y)−2cos 2x−2cos 2y=7:
// una componente cerrada por celda de 2π×2π, es decir MILES al alejar el zoom. El
// pipeline genérico (descubrimiento por rejilla + continuación) se rompe ahí por
// DISEÑO, no por un bug puntual: el tope de componentes deja la curva incompleta y el
// presupuesto se quema trazando mil veces la misma geometría.
//
// La periodicidad convierte ese imposible en O(1): toda componente es una TRASLACIÓN
// exacta k·P de las de una celda base. Se traza SOLO una ventana de 2P por eje
// periódico (2P y no P: una componente que cruce el borde de la celda cabe ENTERA en
// la ventana mientras su diámetro sea < P) y se emiten copias trasladadas — la misma
// tesis que ProveedorImplicitoPeriodico con sus copias verticales, llevada a 2D.
//
// Con MUCHO zoom-in la teselación no aporta (se ven 1–2 celdas y la ventana sería más
// GRANDE que la vista → más cara que trazar la vista directa): si en ningún eje caben
// ≥ MIN_CELDAS celdas, se delega al proveedor genérico que se recibe como respaldo.
// NO conoce mathjs ni Canvas (Ring 2).

import type {
  ProveedorGeometria,
  EstrategiaDescubrimiento,
  TrazadorContinuacion,
  CampoEscalar,
  Viewport,
  Tolerancia,
  Geometria,
  Rama,
} from "../contracts";
import type { PeriodosCampo } from "../analysis/periodicidadCampo";
import { crearViewport } from "../scene/viewport-utils";

/** Celdas visibles mínimas (en algún eje) para teselar; con menos, el genérico gana. */
const MIN_CELDAS = 4;
// Topes de salida: más allá, las copias son sub-píxel/moiré y solo cuestan memoria y
// render. Las copias se emiten DEL CENTRO HACIA FUERA, así el recorte cae en la orilla.
const MAX_LOSETAS = 8192;
const MAX_PUNTOS_TESELADO = 400_000;

export class ProveedorImplicitoTeselado implements ProveedorGeometria {
  constructor(
    public readonly objetoId: string,
    private readonly F: CampoEscalar,
    private readonly periodos: PeriodosCampo,
    private readonly descubrimiento: EstrategiaDescubrimiento,
    private readonly trazador: TrazadorContinuacion,
    /** Pipeline genérico (descubrimiento+continuación sobre la vista) para zoom-in. */
    private readonly respaldo: ProveedorGeometria
  ) {}

  geometria(viewport: Viewport, tolerancia: Tolerancia): Geometria {
    const anchoMundo = viewport.domX[1] - viewport.domX[0];
    const altoMundo = viewport.domY[1] - viewport.domY[0];
    // Un eje se tesela si es periódico Y la vista abarca varias celdas. Si ninguno
    // cumple, estamos con zoom-in y el pipeline genérico es mejor Y más barato.
    const teselaX = this.periodos.px !== null && anchoMundo / this.periodos.px >= MIN_CELDAS;
    const teselaY = this.periodos.py !== null && altoMundo / this.periodos.py >= MIN_CELDAS;
    if (!teselaX && !teselaY) return this.respaldo.geometria(viewport, tolerancia);

    // Ventana de trazado por eje: si se tesela, 2P centrada en la celda de la retícula
    // k·P más cercana al centro de la vista (anclada a la retícula → estable al hacer
    // pan, no "recalcula" geometría distinta en cada frame); si no, el dominio real.
    const ventana = (dom: readonly [number, number], P: number | null, tesela: boolean):
      { v: [number, number]; P: number } => {
      if (!tesela || P === null) return { v: [dom[0], dom[1]], P: 0 };
      const c = Math.round((dom[0] + dom[1]) / 2 / P) * P;
      return { v: [c - P, c + P], P };
    };
    const wx = ventana(viewport.domX, this.periodos.px, teselaX);
    const wy = ventana(viewport.domY, this.periodos.py, teselaY);

    // Viewport auxiliar con la MISMA escala px/mundo que la vista (los umbrales del
    // trazador ligados a píxeles deciden igual que decidirían en pantalla), con un
    // suelo para que la rejilla de descubrimiento no degenere cuando la celda mide
    // pocos píxeles.
    const sx = viewport.anchoPx / anchoMundo;
    const sy = viewport.altoPx / altoMundo;
    const vpAux = crearViewport(
      wx.v, wy.v,
      Math.max(32, Math.round(sx * (wx.v[1] - wx.v[0]))),
      Math.max(32, Math.round(sy * (wy.v[1] - wy.v[0]))),
      viewport.dpr
    );
    const { semillas, singularidades } = this.descubrimiento.descubrir(this.F, vpAux, tolerancia);
    const trazadas = this.trazador.trazar(this.F, this.objetoId, semillas, singularidades, vpAux, tolerancia);

    // La base del teselado es lo trazado RECORTADO a la celda [c−P/2, c+P/2) por eje
    // teselado. El recorte hace el teselado EXACTO por construcción: las celdas
    // trasladadas parten el plano sin huecos ni solapes. La alternativa —quedarse
    // ramas ENTERAS representantes de cada clase— duplica trabajo en cuanto hay
    // componentes NO acotadas: en cos(x+y)=0.3 cada tramo diagonal de la ventana se
    // re-dibuja en cada copia que resbala por la MISMA recta (i+j constante), un
    // overdraw ~20× que quemaba el tope de puntos y dejaba las ESQUINAS de la vista
    // vacías. Coste del recorte: un lazo que cruza el borde sale partido en arcos
    // abiertos, que las celdas vecinas completan pixel-perfecto (misma traslación).
    const cX = (wx.v[0] + wx.v[1]) / 2, cY = (wy.v[0] + wy.v[1]) / 2;
    const celda: [number, number, number, number] = [
      teselaX ? cX - wx.P / 2 : -Infinity,
      teselaY ? cY - wy.P / 2 : -Infinity,
      teselaX ? cX + wx.P / 2 : Infinity,
      teselaY ? cY + wy.P / 2 : Infinity,
    ];
    const base: Array<{ r: Rama; bb: [number, number, number, number] }> = [];
    for (const r of trazadas) {
      for (const pieza of recortarRama(r, celda)) {
        const bb = cajaDeRama(pieza);
        if (bb) base.push({ r: pieza, bb });
      }
    }
    if (base.length === 0) return geometriaVacia();

    // Rango de copias por eje: las k tales que la CELDA trasladada toca la vista,
    // recorridas del centro hacia fuera (si un tope recorta, que caiga en la orilla).
    const rango = (dom: readonly [number, number], lo: number, hi: number, P: number, tesela: boolean): number[] => {
      if (!tesela) return [0];
      const kLo = Math.ceil((dom[0] - hi) / P), kHi = Math.floor((dom[1] - lo) / P);
      const kC = Math.min(kHi, Math.max(kLo, Math.round(((dom[0] + dom[1]) / 2 - (lo + hi) / 2) / P)));
      const ks: number[] = [];
      for (let d = 0; kC - d >= kLo || kC + d <= kHi; d++) {
        if (kC + d <= kHi) ks.push(kC + d);
        if (d > 0 && kC - d >= kLo) ks.push(kC - d);
      }
      return ks;
    };
    const ksX = rango(viewport.domX, celda[0], celda[2], wx.P, teselaX);
    const ksY = rango(viewport.domY, celda[1], celda[3], wy.P, teselaY);

    // Emisión centro→fuera con poda por caja (copias que no tocan la vista, fuera) y
    // topes de losetas/puntos: si se recorta, se pierde la ORILLA, nunca el centro.
    const ramas: Rama[] = [];
    let losetas = 0, puntos = 0;
    const pares: Array<[number, number]> = [];
    for (const i of ksX) for (const j of ksY) pares.push([i, j]);
    pares.sort((a, b) => (Math.abs(a[0] - ksX[0]) + Math.abs(a[1] - ksY[0])) - (Math.abs(b[0] - ksX[0]) + Math.abs(b[1] - ksY[0])));
    for (const [i, j] of pares) {
      if (losetas >= MAX_LOSETAS || puntos >= MAX_PUNTOS_TESELADO) break;
      const dx = i * wx.P, dy = j * wy.P;
      let emitida = false;
      for (const { r, bb } of base) {
        if (bb[2] + dx < viewport.domX[0] || bb[0] + dx > viewport.domX[1] ||
            bb[3] + dy < viewport.domY[0] || bb[1] + dy > viewport.domY[1]) continue;
        ramas.push(trasladar(r, dx, dy));
        puntos += r.puntos.length / 2;
        emitida = true;
      }
      if (emitida) losetas++;
    }
    return { ramas, singularidades: [], puntosNotables: [], asintotas: [] };
  }
}

function geometriaVacia(): Geometria {
  return { ramas: [], singularidades: [], puntosNotables: [], asintotas: [] };
}

/**
 * Recorta la polilínea de una rama al rectángulo [x0,y0,x1,y1] (±Infinity = sin
 * recorte en ese lado). Devuelve las PIEZAS que quedan dentro, como ramas nuevas.
 * Liang-Barsky por segmento: parámetros [t0,t1] del tramo interior; los cortes
 * parten la polilínea y las piezas resultantes son ABIERTAS (cerrada solo si el
 * lazo original quedó entero, sin ningún corte).
 */
function recortarRama(r: Rama, rect: [number, number, number, number]): Rama[] {
  const p = r.puntos;
  const n = p.length / 2;
  if (n < 2) return [];
  const piezas: number[][] = [];
  let actual: number[] | null = null;
  let cortada = false;

  for (let i = 0; i < n - 1; i++) {
    const ax = p[i * 2], ay = p[i * 2 + 1];
    const bx = p[(i + 1) * 2], by = p[(i + 1) * 2 + 1];
    // Liang-Barsky: intersección del segmento con el rectángulo en t ∈ [t0, t1].
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    let fuera = false;
    for (const [dd, q] of [[-dx, ax - rect[0]], [dx, rect[2] - ax], [-dy, ay - rect[1]], [dy, rect[3] - ay]] as const) {
      if (dd === 0) { if (q < 0) { fuera = true; break; } continue; }
      const t = q / dd;
      if (dd < 0) { if (t > t1) { fuera = true; break; } if (t > t0) t0 = t; }
      else { if (t < t0) { fuera = true; break; } if (t < t1) t1 = t; }
    }
    if (fuera || t0 > t1) { actual = null; cortada = true; continue; }
    if (t0 > 0 || t1 < 1) cortada = true;
    const xa = ax + dx * t0, ya = ay + dy * t0;
    const xb = ax + dx * t1, yb = ay + dy * t1;
    if (t0 > 0 || actual === null) {
      actual = [xa, ya];
      piezas.push(actual);
    }
    actual.push(xb, yb);
    if (t1 < 1) actual = null;
  }

  return piezas
    .filter((pz) => pz.length >= 4)
    .map((pz) => ({
      puntos: Float64Array.from(pz),
      cerrada: r.cerrada && !cortada && piezas.length === 1,
      calidad: r.calidad,
      objetoId: r.objetoId,
    }));
}

/** Caja [x0,y0,x1,y1] de una rama, o null si está vacía/degenerada. */
function cajaDeRama(r: Rama): [number, number, number, number] | null {
  const p = r.puntos;
  if (p.length < 4) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < p.length; k += 2) {
    x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]);
    y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]);
  }
  return Number.isFinite(x0) && Number.isFinite(y0) ? [x0, y0, x1, y1] : null;
}

/** Copia de una rama desplazada (dx, dy). Sin `parametro`: trasladada en x dejaría de
 *  ser la x de sus vértices, y una red periódica no es recorrible por-x de todos modos. */
function trasladar(r: Rama, dx: number, dy: number): Rama {
  if (dx === 0 && dy === 0) return { puntos: r.puntos, cerrada: r.cerrada, calidad: r.calidad, objetoId: r.objetoId };
  const p = r.puntos;
  const q = new Float64Array(p.length);
  for (let k = 0; k < p.length; k += 2) { q[k] = p[k] + dx; q[k + 1] = p[k + 1] + dy; }
  return { puntos: q, cerrada: r.cerrada, calidad: r.calidad, objetoId: r.objetoId };
}
