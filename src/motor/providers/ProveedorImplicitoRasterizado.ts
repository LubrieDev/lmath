// ─────────────────────────────────────────────
// providers · ProveedorImplicitoRasterizado (campo oscilatorio → marching squares por píxel)
// ─────────────────────────────────────────────
//
// Envuelve el proveedor GENÉRICO (descubrimiento + continuación) y decide, POR VIEWPORT, si la
// curva está en el régimen de ALTA FRECUENCIA que la continuación no puede dibujar: un campo
// como cos(xy)=∛(y²) al alejar el zoom tiene MILES de hebras hiperbólicas (xy≈2πk), y la
// continuación —acotada por `MAX_COMPONENTES` y por presupuesto de evaluaciones— solo traza
// ~10% → rayado disperso. Ahí se cambia a un rasterizado por SIGNO (marching squares a
// resolución de píxel, coste FIJO O(píxeles)) que llena la banda fielmente.
//
// La decisión se toma por la FRECUENCIA local: el máximo de cambios de signo de F sobre una
// línea de sondeo (fila/columna). Una cónica/folium/lemniscata cruza una línea ≤ un puñado de
// veces a cualquier zoom → sigue por continuación (lazos cerrados, puntos notables). Un campo
// que cruza una línea decenas o cientos de veces está en el régimen denso → rasterizado. La
// decisión es por-viewport: la MISMA curva va por continuación con zoom-in (pocas hebras, suave)
// y por raster con zoom-out (muchas). NO conoce mathjs ni Canvas (Ring 2).

import type {
  ProveedorGeometria, CampoEscalar, Viewport, Tolerancia, Geometria,
} from "../contracts";
import { contornosMarchingSquares } from "../tracing/raster/marchingSquares";

// Cambios de signo en UNA línea de sondeo por encima de los cuales la vista se considera de alta
// frecuencia (denso). Muy por encima de lo que produce cualquier cónica (≤ ~4) y por debajo de
// lo que produce cos(xy) en cuanto |x| crece → transición limpia continuación↔raster.
const UMBRAL_CRUCES = 24;
// Líneas de sondeo por eje y muestras por línea (barato: ~2·SONDEOS·MUESTRAS evaluaciones;
// basta para DETECTAR la alta frecuencia, no para contarla con exactitud).
const SONDEOS = 14;
const MUESTRAS_SONDEO = 220;
// Resolución del raster por pasada. Interactiva gruesa (fluidez durante el gesto), final a ~1 px
// (resolución NATIVA de pantalla: lo más fino que el píxel puede mostrar; el resto de las hebras
// es subpíxel, no dibujable). Ambas deterministas → la banda solo se AFINA al soltar, no parpadea
// con hebras que aparecen/desaparecen (el defecto que tenía la continuación entre pasadas).
const CELDA_PX_INTERACTIVA = 3.0;
const CELDA_PX_FINAL = 1.0;
const MAX_NODOS_INTERACTIVA = 60_000;
const MAX_NODOS_FINAL = 340_000;

export class ProveedorImplicitoRasterizado implements ProveedorGeometria {
  constructor(
    public readonly objetoId: string,
    private readonly F: CampoEscalar,
    /** Pipeline genérico (descubrimiento + continuación) para el régimen suave / zoom-in. */
    private readonly respaldo: ProveedorGeometria
  ) {}

  geometria(viewport: Viewport, tolerancia: Tolerancia): Geometria {
    if (!this.esAltaFrecuencia(viewport)) return this.respaldo.geometria(viewport, tolerancia);
    const interactiva = tolerancia.pasada === "interactiva";
    const ramas = contornosMarchingSquares(
      this.F, viewport, this.objetoId,
      interactiva ? CELDA_PX_INTERACTIVA : CELDA_PX_FINAL,
      interactiva ? MAX_NODOS_INTERACTIVA : MAX_NODOS_FINAL
    );
    return { ramas, singularidades: [], puntosNotables: [], asintotas: [] };
  }

  /**
   * ¿La vista está en el régimen de ALTA FRECUENCIA? Máximo de cambios de signo de F sobre
   * SONDEOS filas y SONDEOS columnas; si alguna línea cruza más de `UMBRAL_CRUCES` veces, la
   * curva es demasiado densa para la continuación y se rasteriza. Cota superior de coste barata.
   */
  private esAltaFrecuencia(vp: Viewport): boolean {
    const [x0, x1] = vp.domX, [y0, y1] = vp.domY;
    const cuenta = (fijo: number, a: number, b: number, eje: "col" | "fila"): number => {
      let cruces = 0, prev = NaN, prevFin = false;
      for (let k = 0; k <= MUESTRAS_SONDEO; k++) {
        const t = a + (k / MUESTRAS_SONDEO) * (b - a);
        const w = eje === "col" ? this.F.eval(fijo, t) : this.F.eval(t, fijo);
        const f = Number.isFinite(w);
        if (f && prevFin && (w >= 0) !== (prev >= 0)) cruces++;
        prev = w; prevFin = f;
      }
      return cruces;
    };
    for (let s = 1; s < SONDEOS; s++) {
      const fx = x0 + (s / SONDEOS) * (x1 - x0);
      if (cuenta(fx, y0, y1, "col") > UMBRAL_CRUCES) return true;
      const fy = y0 + (s / SONDEOS) * (y1 - y0);
      if (cuenta(fy, x0, x1, "fila") > UMBRAL_CRUCES) return true;
    }
    return false;
  }
}
