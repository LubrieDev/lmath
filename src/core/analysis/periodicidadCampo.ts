// ─────────────────────────────────────────────
// analysis · Periodicidad del campo escalar (detección numérica)
// ─────────────────────────────────────────────
//
// Detecta si F(x,y) es PERIÓDICO a lo largo de un eje: F(x+P, y) = F(x, y) para todo
// (x,y). Es la llave del `ProveedorImplicitoTeselado`: una curva de campo periódico
// (la red de lazos de 4(cos x+cos y)+2cos(x+y)+…=7) tiene INFINITAS componentes
// idénticas, y ni el descubrimiento por rejilla ni la continuación pueden con miles
// de ellas al alejar el zoom (tope de componentes → curva incompleta; pasos más
// grandes que el lazo → "puentes" rectos falsos). Con el período, basta trazar UNA
// celda y teselar traslaciones exactas: O(1 trazado) a cualquier zoom.
//
// La detección es NUMÉRICA y opera sobre el `CampoEscalar` opaco (Ring 2, sin
// mathjs): se compara F en ~30 puntos pseudo-aleatorios DETERMINISTAS contra sus
// trasladados por cada período candidato. Un falso positivo exigiría que un campo
// no periódico coincidiera en 30 puntos dispersos con tolerancia relativa 1e-9:
// en la práctica, imposible salvo construcción adversarial. Un falso negativo solo
// pierde la optimización (se cae al pipeline general, como hasta ahora).
//
// Los candidatos cubren los períodos de las combinaciones trig usuales: 2π (sin x,
// cos x…), π (tan, sin·cos, cos 2x), π/2, y sus múltiplos 4π/6π (cos(x/2), cos(x/3)),
// más 1/2/4 (sin(πx) y afines). Cualquier MÚLTIPLO de un período sirve para teselar;
// se prueban de menor a mayor solo para obtener la celda más pequeña (menos trabajo).

import type { CampoEscalar } from "../contracts";

const PI = Math.PI;
/** De menor a mayor: el primero que valide es la celda más económica. */
const CANDIDATOS: readonly number[] = [1, PI / 2, 2, PI, 4, 2 * PI, 4 * PI, 6 * PI];

// Puntos de sondeo deterministas (secuencia áurea 2D) en un rango moderado: lejos
// del origen los argumentos trig pierden precisión, y cerca de él abundan simetrías
// accidentales (F par/impar) que un punto solo no desempata — treinta sí.
const N_PUNTOS = 30;
const RANGO = 8.7;
const PHI = 0.6180339887498949;
function puntosSondeo(): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 1; i <= N_PUNTOS; i++) {
    const u = (i * PHI) % 1, v = (i * PHI * PHI) % 1;
    pts.push([(u * 2 - 1) * RANGO, (v * 2 - 1) * RANGO]);
  }
  return pts;
}

/** Mínimo de comparaciones VÁLIDAS (ambos valores finitos) para aceptar un período:
 *  con menos, el dominio de F apenas toca la zona de sondeo y no hay evidencia. */
const MIN_VALIDAS = 12;

/**
 * ¿Es P un período de F a lo largo del eje `eje`? Compara F(p) con F(p+P·ê).
 * Un lado finito y el otro no = el DOMINIO no es periódico → falla (evita declarar
 * periódico a √(x)+cos x). Ambos NO finitos cuenta como coincidencia: los huecos
 * de dominio de √(sin x) sí se repiten cada período.
 */
function esPeriodo(F: CampoEscalar, eje: "x" | "y", P: number): boolean {
  let validas = 0;
  for (const [x, y] of puntosSondeo()) {
    const a = F.eval(x, y);
    const b = eje === "x" ? F.eval(x + P, y) : F.eval(x, y + P);
    const fa = Number.isFinite(a), fb = Number.isFinite(b);
    if (fa !== fb) return false;
    if (!fa) continue;
    if (Math.abs(a - b) > 1e-9 * (1 + Math.abs(a) + Math.abs(b))) return false;
    validas++;
  }
  return validas >= MIN_VALIDAS;
}

export interface PeriodosCampo {
  /** Período a lo largo de x, o null si no se detectó. */
  readonly px: number | null;
  /** Período a lo largo de y, o null si no se detectó. */
  readonly py: number | null;
}

/** Detecta el período de F por eje (el menor candidato que valide, o null). */
export function detectarPeriodos(F: CampoEscalar): PeriodosCampo {
  const detectar = (eje: "x" | "y"): number | null => {
    for (const P of CANDIDATOS) if (esPeriodo(F, eje, P)) return P;
    return null;
  };
  return { px: detectar("x"), py: detectar("y") };
}
