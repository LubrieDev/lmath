// ─────────────────────────────────────────────
// tracing/raster · Contorno por MARCHING SQUARES (campo de signo a resolución de píxel)
// ─────────────────────────────────────────────
//
// Extrae la curva F(x,y)=0 evaluando el SIGNO de F en una rejilla ligada a los PÍXELES del
// viewport y uniendo, celda a celda, los cruces por las aristas (marching squares clásico).
// Coste FIJO O(píxeles) —independiente del número de componentes—, que es justo lo que la
// continuación por semillas NO tiene: un campo de altísima frecuencia (cos(xy)=∛(y²) con
// zoom-out) tiene MILES de hebras hiperbólicas y la continuación, acotada por presupuesto y
// por `MAX_COMPONENTES`, solo dibuja ~10% → parece rayado disperso. Aquí se dibuja TODO lo que
// el píxel puede resolver: la banda se llena fielmente. La sub-resolución (hebras a < 1 px al
// alejar más) es aliasing honesto —no se puede mostrar lo que no cabe en un píxel—, no un hueco.
//
// Los segmentos por celda se ENLAZAN en polilíneas (comparten el punto de cruce de cada arista)
// para emitir pocas `Rama` largas en vez de una tirada de micro-segmentos: el renderer hace un
// `stroke` por rama, así que enlazar es lo que mantiene el coste de dibujo bajo. NO conoce
// mathjs ni Canvas (opera sobre el oráculo `CampoEscalar`): Ring 1, testeable en aislamiento.

import type { CampoEscalar, Viewport, Rama } from "../../contracts";

/**
 * Contornos de F(x,y)=0 dentro del viewport por marching squares. `cellPx` es el lado de celda
 * en píxeles (1 ≈ resolución de pantalla); `maxNodos` acota el nº de evaluaciones (si la rejilla
 * lo excede, se engrosa la celda). Devuelve polilíneas en coordenadas de MUNDO como `Rama[]`.
 */
export function contornosMarchingSquares(
  F: CampoEscalar, vp: Viewport, objetoId: string, cellPx: number, maxNodos: number
): Rama[] {
  const [x0, x1] = vp.domX, [y0, y1] = vp.domY;
  let cols = Math.max(2, Math.round(vp.anchoPx / Math.max(0.5, cellPx)));
  let rows = Math.max(2, Math.round(vp.altoPx / Math.max(0.5, cellPx)));
  while ((cols + 1) * (rows + 1) > maxNodos && (cols > 2 || rows > 2)) {
    cols = Math.max(2, cols >> 1); rows = Math.max(2, rows >> 1);
  }
  const nx = cols + 1, ny = rows + 1;

  const xs = new Float64Array(nx), ys = new Float64Array(ny);
  for (let i = 0; i < nx; i++) xs[i] = x0 + (i / cols) * (x1 - x0);
  for (let j = 0; j < ny; j++) ys[j] = y0 + (j / rows) * (y1 - y0);

  // Valor y finitud de F en cada nodo (una sola pasada de evaluaciones = el coste dominante).
  const val = new Float64Array(nx * ny);
  const fin = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const base = j * nx, yj = ys[j];
    for (let i = 0; i < nx; i++) {
      const w = F.eval(xs[i], yj);
      if (Number.isFinite(w)) { val[base + i] = w; fin[base + i] = 1; }
    }
  }
  const pos = (n: number): boolean => val[n] >= 0;   // signo (solo válido si fin[n])

  // Punto de cruce por cada arista, con id único. Horizontales: idH = j*cols + i (i<cols, j<ny).
  // Verticales: idV = nH + j*nx + i (i<nx, j<rows). `has` marca las ya interpoladas.
  const nH = cols * ny;
  const total = nH + nx * rows;
  const cx = new Float64Array(total), cy = new Float64Array(total);
  const has = new Uint8Array(total);
  const cruceH = (i: number, j: number): number => {
    const a = j * nx + i, b = a + 1;
    if (!fin[a] || !fin[b] || pos(a) === pos(b)) return -1;
    const id = j * cols + i;
    if (!has[id]) { const t = val[a] / (val[a] - val[b]); cx[id] = xs[i] + t * (xs[i + 1] - xs[i]); cy[id] = ys[j]; has[id] = 1; }
    return id;
  };
  const cruceV = (i: number, j: number): number => {
    const a = j * nx + i, b = a + nx;
    if (!fin[a] || !fin[b] || pos(a) === pos(b)) return -1;
    const id = nH + j * nx + i;
    if (!has[id]) { const t = val[a] / (val[a] - val[b]); cx[id] = xs[i]; cy[id] = ys[j] + t * (ys[j + 1] - ys[j]); has[id] = 1; }
    return id;
  };

  // Segmentos como pares de ids de arista (los extremos comparten arista con la celda vecina).
  const segA: number[] = [], segB: number[] = [];
  const seg = (u: number, v: number) => { if (u >= 0 && v >= 0) { segA.push(u); segB.push(v); } };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const bl = j * nx + i, br = bl + 1, tl = bl + nx, tr = tl + 1;
      if (!fin[bl] || !fin[br] || !fin[tl] || !fin[tr]) continue;   // celda con hueco de dominio
      const mask = (pos(bl) ? 1 : 0) | (pos(br) ? 2 : 0) | (pos(tr) ? 4 : 0) | (pos(tl) ? 8 : 0);
      if (mask === 0 || mask === 15) continue;
      switch (mask) {
        case 1: case 14: seg(cruceV(i, j), cruceH(i, j)); break;          // esquina bl
        case 2: case 13: seg(cruceH(i, j), cruceV(i + 1, j)); break;      // esquina br
        case 4: case 11: seg(cruceV(i + 1, j), cruceH(i, j + 1)); break;  // esquina tr
        case 7: case 8: seg(cruceV(i, j), cruceH(i, j + 1)); break;       // esquina tl
        case 3: case 12: seg(cruceV(i, j), cruceV(i + 1, j)); break;      // horizontal partido
        case 6: case 9: seg(cruceH(i, j), cruceH(i, j + 1)); break;       // vertical partido
        case 5: case 10: {                                                // silla: dos segmentos
          const c = F.eval((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2);
          const centroPos = Number.isFinite(c) ? c >= 0 : true;
          const b = cruceH(i, j), r = cruceV(i + 1, j), t = cruceH(i, j + 1), l = cruceV(i, j);
          const unir = mask === 5 ? centroPos : !centroPos;
          if (unir) { seg(l, t); seg(b, r); } else { seg(l, b); seg(t, r); }
          break;
        }
      }
    }
  }
  if (segA.length === 0) return [];

  // Enlace de segmentos en polilíneas por id de arista compartido (cada arista toca ≤2 celdas
  // ⇒ grado ≤2). Se abren las cadenas por los extremos de grado 1 (bordes de vista / dominio) y
  // luego se recorren los lazos restantes.
  const adj = new Map<number, number[]>();
  const anota = (id: number, s: number) => { const a = adj.get(id); if (a) a.push(s); else adj.set(id, [s]); };
  for (let s = 0; s < segA.length; s++) { anota(segA[s], s); anota(segB[s], s); }
  const usado = new Uint8Array(segA.length);
  const otro = (s: number, id: number) => (segA[s] === id ? segB[s] : segA[s]);
  const ramas: Rama[] = [];
  const emitir = (ids: number[]) => {
    if (ids.length < 2) return;
    const puntos = new Float64Array(ids.length * 2);
    for (let k = 0; k < ids.length; k++) { puntos[k * 2] = cx[ids[k]]; puntos[k * 2 + 1] = cy[ids[k]]; }
    ramas.push({ puntos, cerrada: false, calidad: "best-effort", objetoId });
  };
  const recorrer = (id0: number, s0: number) => {
    const ids: number[] = [id0];
    let id = id0, s = s0;
    while (s >= 0 && !usado[s]) {
      usado[s] = 1;
      id = otro(s, id);
      ids.push(id);
      const lista = adj.get(id);
      s = -1;
      if (lista) for (const t of lista) if (!usado[t]) { s = t; break; }
    }
    emitir(ids);
  };
  for (const [id, lista] of adj) if (lista.length === 1 && !usado[lista[0]]) recorrer(id, lista[0]);
  for (let s = 0; s < segA.length; s++) if (!usado[s]) recorrer(segA[s], s);
  return ramas;
}
