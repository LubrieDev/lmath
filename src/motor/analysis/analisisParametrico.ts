// ─────────────────────────────────────────────
// analysis · Propiedades geométricas de una curva paramétrica (x(t), y(t))
// ─────────────────────────────────────────────
//
// Hermano de `analisisPolar`, y por el mismo motivo: el ⓘ nació para y=f(x) y sus
// categorías no significan nada sobre una curva paramétrica general. "Intersección con Y"
// es ambiguo (una Lissajous cruza el eje una docena de veces), "raíz" no dice si es x(t)=0
// o y(t)=0, y "vértice" ni siquiera está definido fuera de familias concretas. Ninguna de
// las tres es una propiedad INTRÍNSECA de la curva.
//
// Lo que sí lo es, y es lo que se calcula aquí: el intervalo del parámetro, si el trazo se
// cierra, su periodo, la caja que la contiene, si pasa por el origen, sus simetrías, cuántas
// veces se corta a sí misma, su longitud y su área algebraica.
//
// Las reglas son las de la polar, y se repiten porque se han ganado:
//
//  • TODO se verifica NUMÉRICAMENTE sobre la curva que se dibuja, nunca se deduce de cómo
//    está escrita la expresión. Una simetría se comprueba viendo si el punto reflejado
//    está en la curva, no mirando si aparece un coseno.
//
//  • SOBRE EL DOMINIO TRAZADO, no sobre ℝ. Es la lección que dejó la espiral de Arquímedes
//    en la polar: una propiedad que solo tiene la prolongación no se anuncia. Si el periodo
//    de la curva excede el intervalo que se dibuja, se dice —lo que se ve es un trozo—.
//
//  • Callar antes que decir algo ambiguo. Si un cálculo no es robusto (demasiadas
//    autointersecciones, una componente no evaluable) se devuelve `null` y el panel omite
//    esa línea, en vez de enseñar un número en el que no se puede confiar.
//
//  • El ÁREA se publica como ALGEBRAICA, con su signo y contando la multiplicidad de giro.
//    Es la integral de contorno ½∮(x dy − y dx), que es el área encerrada solo si la curva
//    es simple. En una Lissajous, que se cruza doce veces, los lóbulos recorridos en
//    sentidos opuestos se cancelan y el resultado puede ser 0: eso NO es un error, es lo
//    que mide esa integral, y por eso se llama por su nombre en vez de "área encerrada".

import { compilarFuncion } from "../../evaluador";
import { periodoDeExpresion, periodoComun } from "../parsing/periodoPolar";

const DOS_PI = 2 * Math.PI;

/** Muestras del barrido base. El panel se abre una vez, no por fotograma, y de aquí salen
 *  la caja, la longitud, el área y los candidatos a autointersección. */
const MUESTRAS = 2000;

/** Tolerancia relativa de los tests de simetría y de cierre. */
const TOL_REL = 1e-6;

/** Tope de autointersecciones listadas. Por encima, el número deja de ser información
 *  (y el conteo deja de ser robusto): se devuelve `null` y el panel calla. */
const MAX_AUTOINTERSECCIONES = 200;

export type SimetriaParametrica = "origen" | "ejeX" | "ejeY";

/** Familia clásica reconocida. Solo la Lissajous y sus casos degenerados: son las que se
 *  reconocen por la FORMA de las componentes (una armónica pura en cada una). */
export type FamiliaParametrica =
  | { tipo: "lissajous"; a: number; b: number; desfase: number }
  | { tipo: "elipse" }
  | { tipo: "circunferencia" };

export interface AnalisisParametrico {
  tMin: number;
  tMax: number;
  /** ¿p(tMax) ≈ p(tMin)? Se comprueba sobre el intervalo DIBUJADO. */
  cerrada: boolean;
  /** Periodo de la curva (mcm de los de sus componentes), o `null` si no es periódica. */
  periodo: number | null;
  /** ¿El periodo excede el intervalo trazado? Entonces solo se ve un trozo de la curva. */
  periodoExcedeDominio: boolean;
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  pasaPorOrigen: boolean;
  simetrias: SimetriaParametrica[];
  /** Puntos donde la curva se corta a sí misma; `null` si hay demasiados. */
  autointersecciones: number | null;
  longitud: number | null;
  /** ½∮(x dy − y dx) sobre el intervalo trazado. Solo si la curva es cerrada. */
  areaAlgebraica: number | null;
  familia: FamiliaParametrica | null;
}

interface Punto { x: number; y: number }

/** Búsqueda ternaria del extremo de una función unimodal en [a,b] (ver `analisisPolar`). */
function refinarExtremo(
  g: (t: number) => number, a: number, b: number, buscarMaximo: boolean
): number {
  let lo = a, hi = b;
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const v1 = g(m1), v2 = g(m2);
    const malo1 = !Number.isFinite(v1), malo2 = !Number.isFinite(v2);
    if (malo1 && malo2) break;
    const mejor2 = malo1 || (!malo2 && (buscarMaximo ? v2 > v1 : v2 < v1));
    if (mejor2) lo = m1; else hi = m2;
  }
  return g((lo + hi) / 2);
}

/**
 * ¿Se cortan los segmentos AB y CD? Devuelve el punto, o `null`.
 *
 * Los extremos SÍ cuentan (t y u en el intervalo CERRADO). Exigirlos abiertos —que es lo
 * natural para no contar el vértice que dos segmentos consecutivos comparten— se comía los
 * cruces que caen justo sobre una muestra, y no son un caso raro: una curva simétrica pone
 * sus cruces en valores redondos del parámetro, que es precisamente donde cae la rejilla.
 * La lemniscata de Gerono (cos t, sin 2t) se cruza en el origen con t=π/2 y t=3π/2, ambos
 * muestras exactas, y salían CERO autointersecciones. Los segmentos consecutivos no llegan
 * aquí: el llamador solo compara parejas no adyacentes.
 */
function corteSegmentos(a: Punto, b: Punto, c: Punto, d: Punto): Punto | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-15) return null; // paralelos o degenerados
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  const EPS = 1e-9;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/**
 * Armónica dominante de una componente muestreada sobre un periodo: su índice, amplitud y
 * fase (como `A·sin(kt + φ)`), y qué fracción de la energía queda FUERA de ese término.
 * Con residuo apreciable la componente no es una armónica pura y no hay familia clásica.
 */
function armonicaDominante(
  vs: number[]
): { k: number; amplitud: number; fase: number; residuo: number } | null {
  const N = vs.length;
  const KMAX = 16;
  const media = vs.reduce((s, v) => s + v, 0) / N;
  let energia = vs.reduce((s, v) => s + (v - media) * (v - media), 0) / N;
  if (energia < 1e-18) return null; // componente constante: no hay armónica

  let mejorK = 0, mejorA = 0, mejorB = 0, mejorAmp = 0;
  for (let k = 1; k <= KMAX; k++) {
    let A = 0, B = 0;
    for (let i = 0; i < N; i++) {
      const th = (i * DOS_PI) / N;
      A += vs[i] * Math.sin(k * th);
      B += vs[i] * Math.cos(k * th);
    }
    A *= 2 / N; B *= 2 / N;
    const amp = Math.hypot(A, B);
    if (amp > mejorAmp) { mejorAmp = amp; mejorK = k; mejorA = A; mejorB = B; }
  }
  if (mejorK === 0 || mejorAmp < 1e-9) return null;

  // Residuo tras quitar la media y la armónica dominante, relativo a la amplitud.
  energia -= (mejorAmp * mejorAmp) / 2;
  const residuo = Math.sqrt(Math.max(0, energia)) / mejorAmp;
  // A·sin(kt) + B·cos(kt) = amp·sin(kt + φ) con φ = atan2(B, A).
  return { k: mejorK, amplitud: mejorAmp, fase: Math.atan2(mejorB, mejorA), residuo };
}

/**
 * Analiza la curva (x(t), y(t)) sobre `[tMin, tMax]`. Las expresiones vienen YA
 * normalizadas en `t` (tal como las construye `construirObjeto`). Devuelve `null` si no
 * compilan o no son evaluables: el llamador no monta el panel y el plano no se toca.
 */
export function analizarParametrico(
  exprX: string, exprY: string, tMin: number, tMax: number,
  // Inyectable SOLO para poder comprobar la estabilidad del conteo de autointersecciones
  // al refinar: un número que cambia con la resolución no es un número que se pueda
  // enseñar. El panel siempre usa el valor por defecto.
  muestras: number = MUESTRAS
): AnalisisParametrico | null {
  const MUESTRAS = muestras;
  let gx: (t: number) => number;
  let gy: (t: number) => number;
  try {
    const cx = compilarFuncion(exprX, "t");
    const cy = compilarFuncion(exprY, "t");
    gx = (t) => { const v = cx(t); return typeof v === "number" ? v : NaN; };
    gy = (t) => { const v = cy(t); return typeof v === "number" ? v : NaN; };
  } catch { return null; }

  const largo = tMax - tMin;
  const paso = largo / MUESTRAS;
  const ts: number[] = new Array<number>(MUESTRAS + 1);
  const pts: Punto[] = new Array<Punto>(MUESTRAS + 1);
  let finitos = 0;
  for (let i = 0; i <= MUESTRAS; i++) {
    const t = tMin + i * paso;
    ts[i] = t;
    pts[i] = { x: gx(t), y: gy(t) };
    if (Number.isFinite(pts[i].x) && Number.isFinite(pts[i].y)) finitos++;
  }
  if (finitos < 8) return null;

  // ── Caja contenedora ─────────────────────────────────────────────────────
  let iXMin = -1, iXMax = -1, iYMin = -1, iYMax = -1;
  for (let i = 0; i <= MUESTRAS; i++) {
    const p = pts[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (iXMin < 0 || p.x < pts[iXMin].x) iXMin = i;
    if (iXMax < 0 || p.x > pts[iXMax].x) iXMax = i;
    if (iYMin < 0 || p.y < pts[iYMin].y) iYMin = i;
    if (iYMax < 0 || p.y > pts[iYMax].y) iYMax = i;
  }
  // Se refina sobre las muestras vecinas: si no, la caja sería la de la rejilla y un
  // extremo exacto (el 1 de un seno) saldría 0.9999 — el mismo ruido que el panel ya
  // aprendió a no enseñar.
  const alrededor = (i: number): [number, number] =>
    [ts[Math.max(0, i - 1)], ts[Math.min(MUESTRAS, i + 1)]];
  const mejor = (i: number, g: (t: number) => number, max: boolean, base: number): number => {
    const [a, b] = alrededor(i);
    const v = refinarExtremo(g, a, b, max);
    if (!Number.isFinite(v)) return base;
    return max ? Math.max(v, base) : Math.min(v, base);
  };
  const xMin = mejor(iXMin, gx, false, pts[iXMin].x);
  const xMax = mejor(iXMax, gx, true, pts[iXMax].x);
  const yMin = mejor(iYMin, gy, false, pts[iYMin].y);
  const yMax = mejor(iYMax, gy, true, pts[iYMax].y);
  const escala = Math.max(xMax - xMin, yMax - yMin, 1e-9);

  // ── Cierre y periodo ─────────────────────────────────────────────────────
  const pIni = pts[0], pFin = pts[MUESTRAS];
  const cerrada =
    Number.isFinite(pIni.x) && Number.isFinite(pFin.x) &&
    Math.hypot(pFin.x - pIni.x, pFin.y - pIni.y) < TOL_REL * escala;

  const px = periodoDeExpresion(exprX, "t");
  const py = periodoDeExpresion(exprY, "t");
  let periodo: number | null = null;
  if (px !== null && py !== null) periodo = periodoComun(px, py);
  else if (px !== null && py === null) periodo = null;  // una componente no periódica
  else if (px === null && py !== null) periodo = null;
  const periodoExcedeDominio = periodo !== null && periodo > largo * (1 + 1e-9);

  // ── Paso por el origen ───────────────────────────────────────────────────
  // Se busca el mínimo de la distancia al origen sobre la polilínea: basta con que un
  // punto de un segmento llegue al origen, no hace falta que caiga una muestra encima.
  let distMin = Infinity;
  for (let i = 0; i < MUESTRAS; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    // Proyección del origen sobre el segmento, acotada a él.
    const s = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    distMin = Math.min(distMin, Math.hypot(a.x + s * dx, a.y + s * dy));
  }
  const pasaPorOrigen = distMin < 1e-4 * escala;

  // ── Simetrías, verificadas contra la curva DIBUJADA ──────────────────────
  // Se indexan las muestras en una rejilla y se pregunta si el punto reflejado cae cerca
  // de alguna. Es la comprobación honesta: no mira la fórmula, mira los puntos.
  const celda = escala / 200;
  const rejilla = new Map<string, Punto[]>();
  const clave = (x: number, y: number) =>
    `${Math.round(x / celda)},${Math.round(y / celda)}`;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const k = clave(p.x, p.y);
    const lista = rejilla.get(k);
    if (lista) lista.push(p); else rejilla.set(k, [p]);
  }
  const enLaCurva = (x: number, y: number): boolean => {
    const cx = Math.round(x / celda), cy = Math.round(y / celda);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const p of rejilla.get(`${cx + dx},${cy + dy}`) ?? [])
          if (Math.hypot(p.x - x, p.y - y) < 2 * celda) return true;
    return false;
  };
  const simetriaVale = (refl: (p: Punto) => Punto): boolean => {
    let comprobados = 0;
    for (let i = 0; i <= MUESTRAS; i += 7) {
      const p = pts[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const q = refl(p);
      if (!enLaCurva(q.x, q.y)) return false;
      comprobados++;
    }
    return comprobados >= 16;
  };
  const simetrias: SimetriaParametrica[] = [];
  if (simetriaVale((p) => ({ x: -p.x, y: -p.y }))) simetrias.push("origen");
  if (simetriaVale((p) => ({ x: p.x, y: -p.y }))) simetrias.push("ejeX");
  if (simetriaVale((p) => ({ x: -p.x, y: p.y }))) simetrias.push("ejeY");

  // ── Autointersecciones ───────────────────────────────────────────────────
  // Se comparan los segmentos por parejas, saltando los adyacentes, y se DEDUPLICAN los
  // cortes por posición: un cruce cae en varias parejas cuando la curva pasa dos veces
  // muy cerca, y contarlo dos veces sería peor que no contarlo.
  // El deduplicado va por REJILLA ESPACIAL, no por barrido de la lista: dentro de un bucle
  // que ya es O(n²), un `cortes.some(...)` lineal lo vuelve O(n²·k) y ese patrón exacto
  // —un dedupe cuadrático dentro de otro— es el que congeló Obsidian en la 1.2.9.
  const celdaCorte = 1e-3 * escala;
  const vistos = new Set<string>();
  const yaContado = (p: Punto): boolean => {
    const cx = Math.round(p.x / celdaCorte), cy = Math.round(p.y / celdaCorte);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (vistos.has(`${cx + dx},${cy + dy}`)) return true;
    return false;
  };

  let demasiadosCortes = false;
  let nCortes = 0;
  for (let i = 0; i < MUESTRAS && !demasiadosCortes; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
    const minAx = Math.min(a.x, b.x), maxAx = Math.max(a.x, b.x);
    const minAy = Math.min(a.y, b.y), maxAy = Math.max(a.y, b.y);
    for (let j = i + 2; j < MUESTRAS; j++) {
      // El último segmento toca al primero en una curva cerrada: no es un cruce.
      if (i === 0 && j === MUESTRAS - 1 && cerrada) continue;
      const c = pts[j], d = pts[j + 1];
      if (!Number.isFinite(c.x) || !Number.isFinite(d.x)) continue;
      // Rechazo por caja: descarta la inmensa mayoría de parejas con cuatro comparaciones.
      if (Math.min(c.x, d.x) > maxAx || Math.max(c.x, d.x) < minAx ||
          Math.min(c.y, d.y) > maxAy || Math.max(c.y, d.y) < minAy) continue;
      const p = corteSegmentos(a, b, c, d);
      if (p === null || yaContado(p)) continue;
      vistos.add(`${Math.round(p.x / celdaCorte)},${Math.round(p.y / celdaCorte)}`);
      nCortes++;
      if (nCortes > MAX_AUTOINTERSECCIONES) { demasiadosCortes = true; break; }
    }
  }
  const autointersecciones: number | null = demasiadosCortes ? null : nCortes;

  // ── Longitud y área algebraica ───────────────────────────────────────────
  let longitud: number | null = 0;
  for (let i = 0; i < MUESTRAS; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!Number.isFinite(a.x) || !Number.isFinite(b.x) ||
        !Number.isFinite(a.y) || !Number.isFinite(b.y)) { longitud = null; break; }
    longitud += Math.hypot(b.x - a.x, b.y - a.y);
  }

  let areaAlgebraica: number | null = null;
  if (cerrada && finitos === MUESTRAS + 1) {
    let suma = 0;
    for (let i = 0; i < MUESTRAS; i++) {
      const a = pts[i], b = pts[i + 1];
      suma += a.x * b.y - b.x * a.y;
    }
    areaAlgebraica = suma / 2;
  }

  // ── Familia ──────────────────────────────────────────────────────────────
  let familia: FamiliaParametrica | null = null;
  if (periodo !== null && !periodoExcedeDominio) {
    const N = 512;
    const xs: number[] = [], ys: number[] = [];
    let evaluables = true;
    for (let i = 0; i < N && evaluables; i++) {
      const t = tMin + (i * periodo) / N;
      const vx = gx(t), vy = gy(t);
      if (!Number.isFinite(vx) || !Number.isFinite(vy)) evaluables = false;
      xs.push(vx); ys.push(vy);
    }
    const hx = evaluables ? armonicaDominante(xs) : null;
    const hy = evaluables ? armonicaDominante(ys) : null;
    if (hx && hy && hx.residuo < 0.01 && hy.residuo < 0.01) {
      // Ambas componentes son armónicas puras: es una Lissajous de razón a:b.
      const mcd = (m: number, n: number): number => (n === 0 ? m : mcd(n, m % n));
      const g = mcd(hx.k, hy.k);
      const a = hx.k / g, b = hy.k / g;
      // Desfase con el origen de t desplazado para que la fase de y sea 0 (que es la
      // forma canónica x=A·sin(at+δ), y=B·sin(bt)); si no, δ dependería de dónde empieza
      // el intervalo, que es una elección del bloque y no una propiedad de la curva.
      let desfase = hx.fase - (hx.k / hy.k) * hy.fase;
      desfase = ((desfase % DOS_PI) + DOS_PI) % DOS_PI;
      if (desfase > Math.PI) desfase -= DOS_PI;
      if (a === 1 && b === 1) {
        const redonda = Math.abs(hx.amplitud - hy.amplitud) < 0.01 * hx.amplitud &&
          Math.abs(Math.abs(desfase) - Math.PI / 2) < 0.01;
        familia = redonda ? { tipo: "circunferencia" } : { tipo: "elipse" };
      } else {
        familia = { tipo: "lissajous", a, b, desfase };
      }
    }
  }

  return {
    tMin, tMax, cerrada, periodo, periodoExcedeDominio,
    xMin, xMax, yMin, yMax,
    pasaPorOrigen, simetrias, autointersecciones, longitud, areaAlgebraica, familia,
  };
}
