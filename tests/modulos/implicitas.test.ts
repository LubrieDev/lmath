// ─────────────────────────────────────────────
// tests · Curvas implícitas: separación, polos y teselado
// ─────────────────────────────────────────────
//
// Consolidación de familias (Etapa 5), separables con polos (7), monomio recíproco,
// multiplicación implícita (8), transpuestas en X (12), trig periódica en y (13),
// detección de periodicidad del campo, astillas junto a los polos y el rasterizado
// por signo (marching squares).
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { VP, TOL_FINAL, ce } from "./comun";
import { crearViewport } from "../../src/motor/scene/viewport-utils";
import { TrazadorExplicitoAdaptativo } from "../../src/motor/tracing/explicit/TrazadorExplicitoAdaptativo";
import { TrazadorContinuacion } from "../../src/motor/tracing/continuation/TrazadorContinuacion";
import { DescubrimientoMuestreado } from "../../src/motor/discovery/sampled/DescubrimientoMuestreado";
import { ProveedorImplicitoSeparable } from "../../src/motor/providers/ProveedorImplicitoSeparable";
import {
  despejarRamas, tienePolos, separarTrigY, ramasMonomioY, localizarPolos,
} from "../../src/motor/analysis/separarImplicita";
import { detectarPeriodos } from "../../src/motor/analysis/periodicidadCampo";
import { ProveedorImplicitoPeriodico } from "../../src/motor/providers/ProveedorImplicitoPeriodico";
import { yEnRamas } from "../../src/motor/analysis/lecturaRama";
import { trazar } from "../../src/herramientas/trazador";
import { bloqueALatex } from "../../src/latex";
import { construirObjeto } from "../../src/motor/parsing/construirObjeto";
import { insertarProductoImplicito } from "../../src/motor/parsing/productoImplicito";
import { crearProveedor, construirObjetosEscena } from "../../src/motor/app/composicion";
import { ProveedorExplicito } from "../../src/motor/providers/ProveedorExplicito";
import { ProveedorImplicitoRasterizado } from "../../src/motor/providers/ProveedorImplicitoRasterizado";
import { contornosMarchingSquares } from "../../src/motor/tracing/raster/marchingSquares";
import type {
  CampoEscalar, Tolerancia, Rama, Geometria, ObjetoExplicito, ObjetoImplicito, ProveedorGeometria, Estilo,
} from "../../src/motor/contracts";
import { interseccionesDeGeometrias, MAX_PUNTOS } from "../../src/motor/analysis/interseccionesRamas";
import { campoTranspuesto } from "../../src/motor/analysis/separarImplicita";
import { Escena } from "../../src/motor/scene/Escena";
import { Overlay } from "../../src/motor/rendering/overlay/Overlay";
import { RendererCanvas2D } from "../../src/motor/rendering/RendererCanvas2D";
import { Crosshair } from "../../src/motor/rendering/Crosshair";

// ════════════════════════════════════════════════
// Consolidación implícita (Etapa 5): familias de curvas + límites de muestreo.
// Locks de NO-REGRESIÓN de comportamientos verificados con harness desechable
// (líneas, hipérbolas, parábola/seno implícitos, esquinas, nodos, traslación,
// completitud). Auditoría: 0 bugs de corrección; estos tests fijan lo bueno.
describe("Consolidación implícita (Etapa 5): familias y límites de muestreo", () => {
  const descubrir = new DescubrimientoMuestreado();
  const trazar = new TrazadorContinuacion();
  const geom = (F: CampoEscalar, vp = VP, tol = TOL_FINAL): readonly Rama[] => {
    const { semillas, singularidades } = descubrir.descubrir(F, vp, tol);
    return trazar.trazar(F, "id", semillas, singularidades, vp, tol);
  };
  const residualMax = (F: CampoEscalar, ramas: readonly Rama[]): number => {
    let m = 0;
    for (const r of ramas)
      for (let k = 0; k < r.puntos.length; k += 2)
        m = Math.max(m, Math.abs(F.eval(r.puntos[k], r.puntos[k + 1])));
    return m;
  };
  const noFinitos = (ramas: readonly Rama[]): number => {
    let n = 0;
    for (const r of ramas) for (let k = 0; k < r.puntos.length; k++) if (!Number.isFinite(r.puntos[k])) n++;
    return n;
  };
  const reversiones = (ramas: readonly Rama[]): number => {
    let rev = 0;
    for (const r of ramas) {
      const p = r.puntos;
      for (let k = 4; k < p.length; k += 2) {
        const ax = p[k - 2] - p[k - 4], ay = p[k - 1] - p[k - 3];
        const bx = p[k] - p[k - 2], by = p[k + 1] - p[k - 1];
        const na = Math.hypot(ax, ay), nb = Math.hypot(bx, by);
        if (na > 1e-12 && nb > 1e-12 && (ax * bx + ay * by) / (na * nb) < -0.5) rev++;
      }
    }
    return rev;
  };
  // Distancia del punto de rama más cercano a (cx,cy).
  const distMin = (ramas: readonly Rama[], cx: number, cy: number): number => {
    let m = Infinity;
    for (const r of ramas)
      for (let k = 0; k < r.puntos.length; k += 2)
        m = Math.min(m, Math.hypot(r.puntos[k] - cx, r.puntos[k + 1] - cy));
    return m;
  };

  test("familia de verticales x²=4 → 2 ramas abiertas en x=±2, residual ~0", () => {
    const F = ce((x, y) => x * x - 4);
    const ramas = geom(F);
    igual(ramas.length, 2, "dos rectas verticales");
    for (const r of ramas) assert(!r.cerrada, "verticales son abiertas");
    assert(residualMax(F, ramas) < 1e-6, `residual ${residualMax(F, ramas)}`);
    // Cada rama debe ser ~vertical: x casi constante (±2).
    for (const r of ramas) {
      let minX = Infinity, maxX = -Infinity;
      for (let k = 0; k < r.puntos.length; k += 2) { minX = Math.min(minX, r.puntos[k]); maxX = Math.max(maxX, r.puntos[k]); }
      assert(maxX - minX < 0.05, `rama casi vertical (Δx=${(maxX - minX).toFixed(3)})`);
      assert(Math.abs(Math.abs((minX + maxX) / 2) - 2) < 0.05, "x≈±2");
    }
  });

  test("hipérbola rectangular xy=1 → 2 ramas abiertas, residual bajo, finitas", () => {
    const F = ce((x, y) => x * y - 1);
    const ramas = geom(F);
    igual(ramas.length, 2, "dos ramas en cuadrantes opuestos");
    igual(noFinitos(ramas), 0, "sin coordenadas no finitas");
    assert(residualMax(F, ramas) < 1e-5, `residual ${residualMax(F, ramas)}`);
  });

  test("parábola implícita y−x²=0 → 1 rama abierta (igual que la explícita), residual bajo", () => {
    const F = ce((x, y) => y - x * x);
    const ramas = geom(F);
    igual(ramas.length, 1, "una rama abierta");
    assert(!ramas[0].cerrada, "la parábola es abierta");
    igual(reversiones(ramas), 0, "sin oscilación");
    assert(residualMax(F, ramas) < 1e-5, `residual ${residualMax(F, ramas)}`);
  });

  test("seno implícito y−sin(3x)=0 → 1 rama abierta conexa, sin oscilación", () => {
    const F = ce((x, y) => y - Math.sin(3 * x));
    const ramas = geom(F);
    igual(ramas.length, 1, "una rama conexa");
    igual(reversiones(ramas), 0, "sin oscilación");
    igual(noFinitos(ramas), 0, "finita");
  });

  test("diamante |x|+|y|=1: esquinas son endpoints EXACTOS (sin huecos), cobertura total, sin oscilar", () => {
    // Las 4 esquinas (90°, ∇F discontinuo) fragmentan la curva en segmentos abiertos
    // (conectividad best-effort), PERO no deben dejar HUECOS: cada esquina verdadera
    // debe coincidir con un punto de rama. Lock del "sin huecos" + cobertura + no oscilar.
    const F = ce((x, y) => Math.abs(x) + Math.abs(y) - 1);
    const ramas = geom(F);
    for (const [cx, cy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][])
      assert(distMin(ramas, cx, cy) < 1e-6, `esquina (${cx},${cy}) cubierta sin hueco`);
    igual(reversiones(ramas), 0, "sin oscilación en las esquinas");
    assert(residualMax(F, ramas) < 1e-9, `residual exacto (piecewise lineal): ${residualMax(F, ramas)}`);
    // Cobertura del perímetro: proyectando puntos del círculo unidad sobre el rombo
    // (x,y)→(x,y)/(|x|+|y|) se recorre todo |x|+|y|=1; cada uno debe estar a < 1 paso.
    let cubiertos = 0, total = 0;
    for (let i = 0; i < 400; i++) {
      const ang = (i / 400) * 2 * Math.PI;
      const px = Math.cos(ang), py = Math.sin(ang);
      const n = Math.abs(px) + Math.abs(py);
      total++;
      if (distMin(ramas, px / n, py / n) < 0.06) cubiertos++;
    }
    assert(cubiertos / total > 0.99, `cobertura del perímetro ${(100 * cubiertos / total).toFixed(1)}%`);
  });

  test("nodo y²=x² (dos rectas y=±x cruzándose) → 2 ramas, residual 0", () => {
    const F = ce((x, y) => y * y - x * x);
    const ramas = geom(F);
    igual(ramas.length, 2, "dos rectas");
    assert(residualMax(F, ramas) < 1e-9, "residual ~0 (rectas exactas)");
  });

  test("tan implícito y−tan(x)=0 → 7 ramas (paridad con el explícito), todas finitas", () => {
    // El trazado implícito (continuación) reproduce el nº de ramas del sampler explícito
    // de tan en [-8,8] (6 polos → 7 intervalos), por un algoritmo totalmente distinto.
    const F = ce((x, y) => y - Math.tan(x));
    const ramas = geom(F);
    igual(ramas.length, 7, "siete ramas entre polos");
    igual(noFinitos(ramas), 0, "sin coordenadas no finitas cerca de los polos");
  });

  test("seno de gran amplitud y−10sin(x)=0 → conexo (1 rama) y acotado", () => {
    // La curva sale del viewport por arriba/abajo y vuelve; debe trazarse como UNA rama
    // conexa (no fragmentarse) mientras quepa en el margen, sin coords no finitas.
    const F = ce((x, y) => y - 10 * Math.sin(x));
    const ramas = geom(F);
    igual(ramas.length, 1, "una rama conexa");
    igual(noFinitos(ramas), 0, "finita");
  });

  test("óvalos de Cassini (a=1, c=1.1) → 2 componentes cerradas", () => {
    const F = ce((x, y) => (x * x + y * y) ** 2 - 2 * 1.21 * (x * x - y * y) + 1.21 * 1.21 - 1);
    const ramas = geom(F);
    igual(ramas.length, 2, "dos óvalos separados");
    for (const r of ramas) assert(r.cerrada, "cada óvalo cierra");
  });

  test("precisión lejos del origen: círculo centrado en (50,30) → 1 cerrada, residual bajo", () => {
    const vp = crearViewport([42, 58], [23, 37], 768, 261, 1);
    const F = ce((x, y) => (x - 50) ** 2 + (y - 30) ** 2 - 9);
    const ramas = geom(F, vp);
    igual(ramas.length, 1, "una componente");
    assert(ramas[0].cerrada, "cierra");
    assert(residualMax(F, ramas) < 1e-4, `residual ${residualMax(F, ramas)}`);
  });

  test("completitud del muestreo: componentes de radio ≳ una celda se hallan (límite documentado)", () => {
    // El descubrimiento por rejilla halla una componente solo si algún NODO de la rejilla
    // cae dentro (cambio de signo en una arista). Para VP=[-8,8]×[-7,7] (celda ~0.29×0.42)
    // un círculo se halla con holgura para r≥0.4; por debajo de ~0.25 puede perderse (no es
    // un bug: es el límite del muestreo; el descubridor por intervalos es la mejora futura).
    for (const r of [1, 0.6, 0.4]) {
      const F = ce((x, y) => x * x + y * y - r * r);
      igual(geom(F).length, 1, `círculo r=${r} hallado`);
    }
  });
});

// ════════════════════════════════════════════════
// Implícitas SEPARABLES con polos (Etapa 7): tan x + y² = 2 y similares.
// Una implícita separable en y (lineal o cuadrática par) CON polos se traza como
// 1–2 ramas explícitas con el sampler 1D (corta limpio los polos a cualquier zoom),
// arreglando el bug de la continuación al alejar el zoom (cruzaba los polos y
// conectaba cálices vecinos en ramas espurias de cientos de unidades en x).
describe("Implícitas separables con polos (Etapa 7)", () => {
  const ce2 = (f: (x: number, y: number) => number): CampoEscalar => ({ eval: f });

  test("despejarRamas: cuadrática par → 2 ramas; lineal → 1; no separable → null", () => {
    const tan = despejarRamas(ce2((x, y) => Math.tan(x) + y * y - 2));
    assert(tan !== null && tan.length === 2, "tan x+y²−2 → 2 ramas");
    // rama+ en x=0.5 debe ser √(2−tan 0.5).
    aprox(tan![0].eval(0.5), Math.sqrt(2 - Math.tan(0.5)), 1e-9, "rama+ correcta");
    aprox(tan![1].eval(0.5), -Math.sqrt(2 - Math.tan(0.5)), 1e-9, "rama− correcta");
    // Donde 2−tan x < 0 → NaN (fuera de dominio).
    assert(Number.isNaN(tan![0].eval(1.4)), "NaN donde no hay solución real");

    const lineal = despejarRamas(ce2((x, y) => y - Math.sin(x)));
    assert(lineal !== null && lineal.length === 1, "y−sin(x) → 1 rama (lineal)");
    aprox(lineal![0].eval(0.5), Math.sin(0.5), 1e-9, "rama lineal = sin(x)");

    assert(despejarRamas(ce2((x, y) => x ** 3 + y ** 3 - 3 * x * y)) === null, "folium (cúbica) → null");
    assert(despejarRamas(ce2((x, y) => Math.cos(y) + x)) === null, "cos(y)+x (par no cuadrática) → null");
  });

  test("tienePolos: tan/sec sí; cónicas no (el gate que preserva los lazos cerrados)", () => {
    assert(tienePolos(ce2((x, y) => Math.tan(x) + y * y - 2)), "tan x+y²−2 tiene polos");
    assert(tienePolos(ce2((x, y) => 1 / Math.cos(x) + y * y - 1)), "sec x+y²−1 tiene polos");
    assert(!tienePolos(ce2((x, y) => x * x + y * y - 9)), "círculo NO tiene polos");
    assert(!tienePolos(ce2((x, y) => x * x / 16 + y * y / 4 - 1)), "elipse NO tiene polos");
    assert(!tienePolos(ce2((x, y) => x * x - y * y - 1)), "hipérbola NO tiene polos");
    // Polo PAR: |F(x,0)|→∞ SIN cambio de signo (−3x⁻² diverge a −∞ por ambos lados). Antes
    // `tienePolos` lo daba false y la eq. `x²+3x+y²−3x⁻²` caía a la continuación genérica, que
    // pierde sus brazos asintóticos junto a x=0 al alejar el zoom; ahora enruta al sampler 1D.
    assert(tienePolos(ce2((x, y) => x * x + 3 * x + y * y - 3 / (x * x) - (Math.E + 8))),
      "x²+3x+y²−3x⁻² tiene polo PAR");
    // Control: un bache interior de |F| GRANDE pero FINITO (x⁴−100x², máx |F|=2500) NO es polo:
    // `divergeEnPolo` lo descarta por su desaceleración (no acelera sin cota como una asíntota).
    assert(!tienePolos(ce2((x, y) => x * x * x * x - 100 * x * x + y * y)),
      "polinomio con bache interior grande pero finito NO tiene polos");
  });

  test("tienePolos par → la eq. enruta al ProveedorImplicitoSeparable (brazos a cualquier zoom)", () => {
    const prov = crearProveedor(construirObjeto("x^{2}+3x+y^{2}-3x^{-2}=e+8", "z"));
    igual(prov.constructor.name, "ProveedorImplicitoSeparable", "enruta al separable, no al genérico");
    // Los brazos asintóticos junto a x=0 se dibujan a zoom-out (antes desaparecían).
    for (const semiY of [8, 40, 120]) {
      const vp = crearViewport([-semiY * 1.5, semiY * 1.5], [-semiY, semiY], 490, 330, 1);
      const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" });
      let cercaEje = 0;
      for (const r of g.ramas) for (let k = 0; k < r.puntos.length; k += 2)
        if (Math.abs(r.puntos[k]) < 0.5) cercaEje++;
      assert(cercaEje > 20, `semiY=${semiY}: los brazos junto a x=0 se trazan (${cercaEje} vértices)`);
    }
  });

  test("tan x+y²=2 por ramas explícitas: limpio a TODO zoom (sin ramas espurias)", () => {
    // Lock del bug de zoom-out: la continuación producía ramas de >200 en x al alejar;
    // la ruta separable mantiene cada cálice como rama acotada (extensión x ~ una franja).
    const F = ce2((x, y) => Math.tan(x) + y * y - 2);
    const ramas = despejarRamas(F)!;
    const prov = new ProveedorImplicitoSeparable("id", ramas, new TrazadorExplicitoAdaptativo(), F);
    for (const semi of [8, 96, 300]) {
      const sa = semi * 261 / 768;
      const vp = crearViewport([-semi, semi], [-sa, sa], 768, 261, 1);
      for (const pasada of ["final", "interactiva"] as const) {
        const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada });
        let maxXext = 0, noFin = 0;
        for (const r of g.ramas) {
          let a = Infinity, b = -Infinity;
          for (let k = 0; k < r.puntos.length; k += 2) {
            a = Math.min(a, r.puntos[k]); b = Math.max(b, r.puntos[k]);
            if (!Number.isFinite(r.puntos[k]) || !Number.isFinite(r.puntos[k + 1])) noFin++;
          }
          maxXext = Math.max(maxXext, b - a);
        }
        igual(noFin, 0, `x±${semi} ${pasada}: sin coords no finitas`);
        assert(maxXext < 5, `x±${semi} ${pasada}: sin ramas espurias (maxXext=${maxXext.toFixed(1)})`);
        assert(g.ramas.length >= 1, `x±${semi} ${pasada}: traza algo`);
      }
    }
  });

  test("despejarRamas generaliza a yⁿ: cúbica → 1 rama (∛), cuártica → 2", () => {
    const cub = despejarRamas(ce2((x, y) => Math.tan(x) + y ** 3 - 2));
    assert(cub !== null && cub.length === 1, "tan x+y³−2 → 1 rama (raíz impar)");
    aprox(cub![0].eval(0.5), Math.cbrt(2 - Math.tan(0.5)), 1e-9, "∛(2−tan x)");
    // ∛ es real también para radicando negativo:
    assert(Number.isFinite(cub![0].eval(1.4)) && cub![0].eval(1.4) < 0, "∛ negativo definido");
    const cuart = despejarRamas(ce2((x, y) => Math.tan(x) + y ** 4 - 2));
    assert(cuart !== null && cuart.length === 2, "tan x+y⁴−2 → 2 ramas (raíz par)");
    // y⁵ (impar alto) → 1 rama; mezcla de potencias → null
    assert(despejarRamas(ce2((x, y) => y ** 5 + x))!.length === 1, "y⁵+x → 1 rama");
    assert(despejarRamas(ce2((x, y) => y ** 2 + y ** 3 + x)) === null, "y²+y³ (mezcla) → null");
  });

  test("tan x+y³=2 (cúbica): limpio a TODO zoom — corte en polos evita conexión espuria", () => {
    // La ∛ comprime el polo; sin el corte en polos el sampler conectaría a través al
    // alejar el zoom (rama de cientos de unidades). Con el corte: cada tramo acotado.
    const F = ce2((x, y) => Math.tan(x) + y ** 3 - 2);
    const prov = new ProveedorImplicitoSeparable("id", despejarRamas(F)!, new TrazadorExplicitoAdaptativo(), F);
    for (const semi of [8, 96, 300]) {
      const sa = semi * 261 / 768;
      const vp = crearViewport([-semi, semi], [-sa, sa], 768, 261, 1);
      for (const pasada of ["final", "interactiva"] as const) {
        const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada });
        let maxXext = 0;
        for (const r of g.ramas) {
          let a = Infinity, b = -Infinity;
          for (let k = 0; k < r.puntos.length; k += 2) { a = Math.min(a, r.puntos[k]); b = Math.max(b, r.puntos[k]); }
          maxXext = Math.max(maxXext, b - a);
        }
        // Cada rama abarca a lo sumo ~un periodo de tan (π) entre polos consecutivos.
        assert(maxXext < 4, `x±${semi} ${pasada}: ramas acotadas (maxXext=${maxXext.toFixed(1)})`);
      }
    }
  });

  test("cúbica: la pasada interactiva alcanza el borde en los polos (verticales limpias)", () => {
    // Bug de "barras" durante el zoom: la ∛ comprime el polo y la pasada interactiva no
    // refinaba lo bastante (|y| llegaba a ~65 en una vista ±44, verticales inclinadas). El
    // corte en polos EXTIENDE el extremo al borde si no llegó → todas las ramas lo alcanzan.
    const F = ce2((x, y) => Math.tan(x) + y ** 3 - 2);
    const prov = new ProveedorImplicitoSeparable("id", despejarRamas(F)!, new TrazadorExplicitoAdaptativo(), F);
    const vp = crearViewport([-130, 130], [-44, 44], 768, 261, 1);
    for (const pasada of ["interactiva", "final"] as const) {
      const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada });
      let alcanzan = 0;
      for (const r of g.ramas) {
        let ry = 0;
        for (let k = 1; k < r.puntos.length; k += 2) ry = Math.max(ry, Math.abs(r.puntos[k]));
        if (ry >= 44) alcanzan++;
      }
      assert(alcanzan === g.ramas.length && g.ramas.length > 20,
        `${pasada}: todas (${alcanzan}/${g.ramas.length}) alcanzan el borde`);
    }
  });

  test("las ramas separadas cumplen F≈0 (están sobre la curva)", () => {
    const F = ce2((x, y) => Math.tan(x) + y * y - 2);
    const prov = new ProveedorImplicitoSeparable("id", despejarRamas(F)!, new TrazadorExplicitoAdaptativo(), F);
    const vp = crearViewport([-8, 8], [-7, 7], 768, 261, 1);
    const g = prov.geometria(vp, TOL_FINAL);
    let maxF = 0;
    for (const r of g.ramas) for (let k = 0; k < r.puntos.length; k += 2) {
      const y = r.puntos[k + 1];
      if (y > vp.domY[0] && y < vp.domY[1]) maxF = Math.max(maxF, Math.abs(F.eval(r.puntos[k], y)));
    }
    assert(maxF < 1e-3, `residual sobre la curva (visible) ${maxF}`);
  });
});

// ════════════════════════════════════════════════
// Implícitas afines en un monomio RECÍPROCO/ABSOLUTO de y (1/|x|+1/|y|=1): el
// descubrimiento por rejilla las perdía al alejar el zoom (la curva se pega a su
// asíntota y el cambio de signo cabe en una celda; la fila y=0 es un polo y se
// descarta) → ramas explícitas con el sampler 1D.
describe("Implícitas afines en monomio recíproco/absoluto (1/|x|+1/|y|=1)", () => {
  const ce2 = (f: (x: number, y: number) => number): CampoEscalar => ({ eval: f });

  test("ramasMonomioY: 1/|y| → 2 ramas; 1/y → 1; |y| → 2; polinómica → null", () => {
    // 1/|x|+1/|y|=1 ⇒ |y| = |x|/(|x|−1) ⇒ y = ±|x|/(|x|−1), solo donde |x|>1.
    const rec = ramasMonomioY(ce2((x, y) => 1 / Math.abs(x) + 1 / Math.abs(y) - 1));
    assert(rec !== null && rec.length === 2, "1/|x|+1/|y|−1 → 2 ramas");
    aprox(rec![0].eval(2), 2 / (2 - 1), 1e-9, "rama+ en x=2 → 2");
    aprox(rec![1].eval(2), -2 / (2 - 1), 1e-9, "rama− en x=2 → −2");
    aprox(rec![0].eval(-2), 2 / (2 - 1), 1e-9, "simétrica en x=−2 → 2");
    assert(Number.isNaN(rec![0].eval(0.5)), "|x|<1 → fuera de dominio (NaN)");

    // 1/x+1/y=1 ⇒ y = x/(x−1): monomio IMPAR → UNA rama.
    const imp = ramasMonomioY(ce2((x, y) => 1 / x + 1 / y - 1));
    assert(imp !== null && imp.length === 1, "1/x+1/y−1 → 1 rama");
    aprox(imp![0].eval(2), 2 / (2 - 1), 1e-9, "y(2)=2");
    aprox(imp![0].eval(0.5), 0.5 / (0.5 - 1), 1e-9, "y(0.5)=−1 (rama del cuadrante IV)");

    // |x|+|y|=1 (rombo) ⇒ y = ±(1−|x|).
    const rombo = ramasMonomioY(ce2((x, y) => Math.abs(x) + Math.abs(y) - 1));
    assert(rombo !== null && rombo.length === 2, "|x|+|y|−1 → 2 ramas");
    aprox(rombo![0].eval(0.25), 0.75, 1e-9, "rama+ del rombo");

    // No debe SECUESTRAR lo que ya resuelven bien los otros proveedores.
    assert(ramasMonomioY(ce2((x, y) => x * x + y * y - 16)) === null, "círculo → null (sigue en continuación)");
    assert(ramasMonomioY(ce2((x, y) => Math.tan(x) + y * y - 2)) === null, "tan x+y² → null (ya es separable)");
    assert(ramasMonomioY(ce2((x, y) => (x * x + y * y) ** 2 - 2 * (x * x - y * y))) === null, "lemniscata → null");
  });

  test("1/|x|+1/|y|=1: las 4 ramas SOBREVIVEN al zoom-out (lock del bug)", () => {
    // Bug: más allá de cierto zoom-out desaparecían ramas (en la captura, el cuadrante IV).
    // La rejilla de descubrimiento no ve el cambio de signo cuando la curva se pega a |y|=1.
    const objeto = construirObjeto("|x|^{-1}+|y|^{-1}=1", "mono");
    const cuadrante = (x: number, y: number): number | null => {
      if (Math.abs(x) < 1e-9 || Math.abs(y) < 1e-9) return null;
      return x > 0 ? (y > 0 ? 1 : 4) : (y > 0 ? 2 : 3);
    };
    for (const semi of [5, 20, 100, 200, 500]) {
      const prov = crearProveedor(objeto);          // proveedor fresco: sin caché entre zooms
      const sa = semi * 261 / 768;
      const vp = crearViewport([-semi, semi], [-sa, sa], 768, 261, 1);
      const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" });
      const vistos = new Set<number>();
      for (const r of g.ramas)
        for (let i = 0; i + 1 < r.puntos.length; i += 2) {
          const c = cuadrante(r.puntos[i], r.puntos[i + 1]);
          if (c) vistos.add(c);
        }
      for (const c of [1, 2, 3, 4])
        assert(vistos.has(c), `semi=${semi}: falta la rama del cuadrante ${c}`);
    }
  });
});

// ════════════════════════════════════════════════
// Multiplicación implícita (Etapa 8): 3xy → 3*x*y, sin reconocido como función.
// Paso de parsing propio del motor nuevo (no toca el parser compartido). Reconoce
// funciones/constantes como átomos y multiplica el resto.
describe("Multiplicación implícita (Etapa 8)", () => {
  const I = insertarProductoImplicito;

  test("variables pegadas se multiplican; funciones/constantes se preservan", () => {
    igual(I("3xy"), "3*x*y", "3xy");
    igual(I("xy"), "x*y", "xy");
    igual(I("x(x+1)"), "x*(x+1)", "x(x+1)");
    igual(I("(x+1)(x-1)"), "(x+1)*(x-1)", "(x+1)(x-1)");
    igual(I("2sin(x)"), "2*sin(x)", "2sin(x)");
    igual(I("xsin(x)"), "x*sin(x)", "xsin(x): el sin es función, la x variable");
    igual(I("sin(x)"), "sin(x)", "sin(x) intacto");
    igual(I("sqrt(x)"), "sqrt(x)", "sqrt intacto");
    igual(I("nthRoot(x,3)"), "nthRoot(x,3)", "nthRoot intacto");
    igual(I("2theta"), "2*theta", "2theta (constante de varias letras)");
    igual(I("2pi"), "2*pi", "2pi");
    igual(I("pix"), "pi*x", "pix → pi*x");
  });

  test("no rompe la notación científica", () => {
    igual(I("2e5"), "2e5", "2e5");
    igual(I("1.5e-3"), "1.5e-3", "1.5e-3");
    igual(I("2e5+x"), "2e5+x", "2e5+x");
  });

  test("camino completo: x³+y³=3xy clasifica implícita con F correcta", () => {
    const o = construirObjeto("x^3+y^3=3xy", "id");
    igual(o.tipo, "implicita", "tipo");
    // En (0.9,0.9): 0.729+0.729−3·0.81 = −0.972.
    aprox((o as { F: { eval(x: number, y: number): number } }).F.eval(0.9, 0.9), -0.972, 1e-3, "F(0.9,0.9)");
  });

  test("camino completo: y=2x y y=x sin(x) son explícitas correctas", () => {
    const dosx = construirObjeto("y=2x", "id");
    igual(dosx.tipo, "explicita", "y=2x → explícita");
    aprox((dosx as ObjetoExplicito).f.eval(3), 6, 1e-9, "2x en x=3 = 6");
    const xsinx = construirObjeto("y=x sin(x)", "id");
    aprox((xsinx as ObjetoExplicito).f.eval(Math.PI / 2), Math.PI / 2, 1e-9, "x·sin(x) en π/2");
  });
});

// ════════════════════════════════════════════════
describe("Separables en X (transpuestas) + saturación de intersecciones (Etapa 12)", () => {
  // Extensión en y de la rama más ancha (en y) de una geometría. Para x=g(y) con
  // polos (tan y+x=5), cada rama legítima vive en un intervalo de π en y; más que
  // eso = cruzó un polo de tan(y) (la rama horizontal espuria del bug reportado).
  const maxYext = (g: Geometria): number => {
    let peor = 0;
    for (const r of g.ramas) {
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 1; i < r.puntos.length; i += 2) {
        const y = r.puntos[i];
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (y1 - y0 > peor) peor = y1 - y0;
    }
    return peor;
  };

  test("gate: tan(y)+x=5 (separable en X) va a la ruta separable; el resto sin cambio", () => {
    assert(crearProveedor(construirObjeto("tan(y)+x=5", "id")) instanceof ProveedorImplicitoSeparable,
      "separable en x con polos → ProveedorImplicitoSeparable (transpuesta)");
    assert(crearProveedor(construirObjeto("tan(x)+y^2=2", "id")) instanceof ProveedorImplicitoSeparable,
      "separable en y sigue igual (sin regresión)");
    assert(crearProveedor(construirObjeto("x^2+y^2=9", "id")) instanceof ProveedorImplicitoRasterizado,
      "cónica suave sigue por la ruta genérica (raster-wrapper → continuación; sin regresión)");
  });

  test("campoTranspuesto + despejarRamas: tan(y)+x=5 se despeja como x = 5−tan(y)", () => {
    const F = (construirObjeto("tan(y)+x=5", "id") as ObjetoImplicito).F;
    const ramas = despejarRamas(campoTranspuesto(F));
    assert(ramas !== null && ramas.length === 1, "una rama (lineal en x)");
    aprox(ramas![0].eval(0), 5, 1e-9, "g(0) = 5 − tan(0) = 5");
    aprox(ramas![0].eval(Math.PI / 4), 4, 1e-9, "g(π/4) = 5 − 1 = 4");
  });

  test("tan(y)+x=5: sin ramas espurias a NINGÚN zoom ni pasada (maxYext ≤ π)", () => {
    const prov = crearProveedor(construirObjeto("tan(y)+x=5", "id"));
    for (const s of [8, 96, 250]) {
      const vp = crearViewport([-s, s], [-s * 7 / 8, s * 7 / 8], 768, 261, 1);
      for (const pasada of ["final", "interactiva"] as const) {
        const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada });
        assert(g.ramas.length >= 3, `x±${s} ${pasada}: hay ramas (${g.ramas.length})`);
        assert(maxYext(g) <= Math.PI + 0.1,
          `x±${s} ${pasada}: maxYext=${maxYext(g).toFixed(1)} ≤ π (no cruza polos de tan y)`);
        for (const r of g.ramas) {
          for (let i = 0; i < r.puntos.length; i++) {
            assert(Number.isFinite(r.puntos[i]), "coordenadas finitas");
          }
        }
      }
    }
  });

  test("tan(y)+x=5: zoom out profundo sin segmentos que crucen la vista (ambas pasadas)", () => {
    // Bug: en zoom out, el cero de c(y)=tan(y)−5 queda a 0.197 del polo — menos que el
    // paso del escaneo de localizarPolos — y ESCONDE el polo (mismo signo a ambos flancos).
    // La pasada interactiva (refinado corto) conectaba entonces a través del polo con dos
    // valores finitos, y al girar la geometría ese segmento cruzaba TODO el lienzo en
    // horizontal (relleno azul). El corte defensivo del trazador (salto > una vista de
    // alto en un intervalo subpíxel) debe eliminarlos en las DOS pasadas.
    const prov = crearProveedor(construirObjeto("tan(y)+x=5", "id"));
    for (const s of [1000, 2500]) {
      const domX: [number, number] = [-s, s];
      const domY: [number, number] = [-s * 7 / 8, s * 7 / 8];
      const vp = crearViewport(domX, domY, 768, 261, 1);
      for (const pasada of ["interactiva", "final"] as const) {
        const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada });
        let cruces = 0;
        for (const r of g.ramas) {
          const p = r.puntos;
          for (let i = 2; i + 1 < p.length; i += 2) {
            const yVis = Math.abs(p[i - 1]) <= domY[1] || Math.abs(p[i + 1]) <= domY[1];
            const lo = Math.max(Math.min(p[i - 2], p[i]), domX[0]);
            const hi = Math.min(Math.max(p[i - 2], p[i]), domX[1]);
            if (yVis && hi - lo > (domX[1] - domX[0]) * 0.6) cruces++;
          }
        }
        igual(cruces, 0, `x±${s} ${pasada}: sin segmentos que crucen la vista`);
      }
    }
  });

  test("tan(y)+x=5: residual ~0 sobre la curva y `parametro` omitido (como implícitas)", () => {
    const F = (construirObjeto("tan(y)+x=5", "id") as ObjetoImplicito).F;
    const prov = crearProveedor(construirObjeto("tan(y)+x=5", "id"));
    const g = prov.geometria(VP, TOL_FINAL);
    let peor = 0, n = 0;
    for (const r of g.ramas) {
      igual(r.parametro, undefined, "parametro omitido (yEnRamas lo leería como x)");
      for (let i = 0; i + 1 < r.puntos.length; i += 2) {
        const x = r.puntos[i], y = r.puntos[i + 1];
        // Solo puntos interiores a la vista (los de extensión al borde son sintéticos).
        if (Math.abs(x) > 8 || Math.abs(y) > 7) continue;
        const v = Math.abs(F.eval(x, y));
        if (Number.isFinite(v)) { if (v > peor) peor = v; n++; }
      }
    }
    assert(n > 100, `suficientes puntos en vista (${n})`);
    assert(peor < 1e-6, `residual máx ${peor.toExponential(1)} < 1e-6`);
  });

  test("tan(y)+x=5: asíntotas HORIZONTALES en y=(k+½)π (pasada final)", () => {
    const prov = crearProveedor(construirObjeto("tan(y)+x=5", "id"));
    const g = prov.geometria(VP, TOL_FINAL);
    const horiz = g.asintotas.filter((a) => a.tipo === "horizontal");
    assert(horiz.length >= 2, `hay asíntotas horizontales (${horiz.length})`);
    assert(horiz.some((a) => Math.abs((a.valor as number) - Math.PI / 2) < 0.01),
      "una en y ≈ π/2");
    igual(g.asintotas.filter((a) => a.tipo === "vertical").length, 0, "ninguna vertical");
  });

  test("saturación: >200 cruces → cap exacto en analysis; la Escena descarta y avisa", () => {
    // 15 verticales × 15 horizontales sintéticas = 225 cruces > MAX_PUNTOS.
    const linea = (pts: number[]): Rama =>
      ({ puntos: Float64Array.from(pts), cerrada: false, calidad: "exacta", objetoId: "s" });
    const gV: Geometria = {
      ramas: Array.from({ length: 15 }, (_, i) => linea([i - 7, -6.5, i - 7, 6.5])),
      singularidades: [], puntosNotables: [], asintotas: [],
    };
    const gH: Geometria = {
      ramas: Array.from({ length: 15 }, (_, j) => linea([-7.5, j * 0.9 - 6.3, 7.5, j * 0.9 - 6.3])),
      singularidades: [], puntosNotables: [], asintotas: [],
    };
    igual(interseccionesDeGeometrias([gV, gH], 0.01).length, MAX_PUNTOS, "cap determinista");

    const estilo: Estilo = { color: [1, 1, 1, 1], grosorPx: 2 };
    const provFake = (g: Geometria): ProveedorGeometria => ({ objetoId: "f", geometria: () => g });
    const ctxNulo = null as unknown as CanvasRenderingContext2D;
    const escena = new Escena(
      [{ proveedor: provFake(gV), estilo }, { proveedor: provFake(gH), estilo }],
      new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo)
    );
    escena.actualizar(VP);
    assert(escena.interseccionesSaturadas(), "saturado detectado");
    igual(escena.intersecciones().length, 0, "no se expone un subconjunto sesgado");
  });

  test("sin saturar (caso normal) el flag queda apagado", () => {
    const objs = construirObjetosEscena("y=x\ny=-x");
    const ctxNulo = null as unknown as CanvasRenderingContext2D;
    const escena = new Escena(objs, new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo));
    escena.actualizar(VP);
    assert(!escena.interseccionesSaturadas(), "no saturado");
    igual(escena.intersecciones().length, 1, "el cruce sigue ahí");
  });
});

// ════════════════════════════════════════════════
// Trig periódica en y con coeficiente a(x) — F = a(x)·T(y)+c(x) (Etapa 13). La
// continuación perdía ramas casi horizontales al alejar el zoom (el grid de semillas
// no las ve todas: tan(y)·(x²+1)=√(x+1)); ahora son infinitas ramas explícitas
// y = T⁻¹(g(x)) + k·período con el sampler 1D (misma filosofía que Etapas 7/12).
describe("Trig periódica en y: a(x)·T(y)+c(x)=0 (Etapa 13)", () => {
  const SRC = "tan(y)(x^2+1)=sqrt(x+1)";
  const F = (s: string) => (construirObjeto(s, "id") as ObjetoImplicito).F;

  test("separarTrigY: detecta tan/sec/sin/cos con a(x); rechaza lo que no es afín en T", () => {
    igual(separarTrigY(F(SRC))?.tipo, "tan", "tan con a(x)=x²+1");
    igual(separarTrigY(F("sec(y)(x^2+1)=x"))?.tipo, "sec", "sec con a(x)");
    igual(separarTrigY(F("sin(y)*x=1"))?.tipo, "sin", "sin con a(x)=x");
    igual(separarTrigY(F("x^2+y^2=9")), null, "círculo → null");
    igual(separarTrigY(F("x*y=1")), null, "hipérbola → null");
    igual(separarTrigY(F("tan(y)+y=x")), null, "y fuera de la trig → null");
    igual(separarTrigY(F("tan(y)^2=x")), null, "cuadrática en tan → null");
    // g(x) = √(x+1)/(x²+1): el valor despejado es correcto.
    const g = separarTrigY(F(SRC))!.g;
    aprox(g(0), 1, 1e-9, "g(0)=√1/1=1");
    aprox(g(3), Math.sqrt(4) / 10, 1e-9, "g(3)=2/10");
  });

  test("gate: va a ProveedorImplicitoPeriodico; las rutas previas no cambian", () => {
    assert(crearProveedor(construirObjeto(SRC, "id")) instanceof ProveedorImplicitoPeriodico, "trig en y");
    assert(crearProveedor(construirObjeto("tan(x)(y^2+1)=sqrt(y+1)", "id")) instanceof ProveedorImplicitoPeriodico,
      "caso simétrico en x (transpuesta)");
    assert(crearProveedor(construirObjeto("tan(y)+x=5", "id")) instanceof ProveedorImplicitoSeparable,
      "separable transpuesta sigue por su ruta (Etapa 12)");
    assert(crearProveedor(construirObjeto("tan(x)+y^2=2", "id")) instanceof ProveedorImplicitoSeparable,
      "separable en y sigue igual (Etapa 7)");
    assert(crearProveedor(construirObjeto("x^2+y^2=9", "id")) instanceof ProveedorImplicitoRasterizado,
      "cónica suave sigue por la ruta genérica (raster-wrapper → continuación)");
  });

  test("expresión SUELTA con y libre → implícita expr=0 (no un falso f(x))", () => {
    // `tan(y)(x²+1)-√(x+1)` sin `=`: antes caía a explícita con y libre → NaN en todo
    // x → plano vacío + falso "Indeterminada". Ahora ≡ tan(y)(x²+1)=√(x+1).
    const obj = construirObjeto("tan(y)(x^2+1)-sqrt(x+1)", "id");
    igual(obj.tipo, "implicita", "clasifica implícita");
    assert(crearProveedor(obj) instanceof ProveedorImplicitoPeriodico, "misma ruta que con =");
    const vp = crearViewport([-7, 7], [-4, 4], 900, 390, 1);
    const g = crearProveedor(obj).geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" });
    assert(g.ramas.length > 0, "traza ramas (la curva se dibuja)");
    // Sin y libre, la expresión suelta sigue siendo explícita (regresión).
    igual(construirObjeto("x^2+1", "id").tipo, "explicita", "sin y: explícita como siempre");
    igual(construirObjeto("hypot(x, 2)", "id").tipo, "explicita", "la y de `hypot` NO es variable");
    // El panel la pinta `… = 0`, no `f(x)=…` (miente sobre lo dibujado).
    igual(bloqueALatex(["tan(y)(x^2+1)-sqrt(x+1)"]).endsWith("=0"), true, "panel: expr = 0");
    assert(!bloqueALatex(["tan(y)(x^2+1)-sqrt(x+1)"]).startsWith("f(x)"), "panel: sin prefijo f(x)");
  });

  test(`${SRC}: TODAS las ramas k presentes a cualquier zoom y en ambas pasadas`, () => {
    const prov = crearProveedor(construirObjeto(SRC, "id"));
    for (const s of [4, 40, 320]) {
      const domY: [number, number] = [-s, s];
      const vp = crearViewport([-s * 1.75, s * 1.75], domY, 900, 390, 1);
      for (const pasada of ["final", "interactiva"] as const) {
        const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada });
        // Cada rama (g≥0) vive en [kπ, kπ+π/2): comprobar que ningún k de la vista falta.
        const ks = new Set<number>();
        for (const r of g.ramas) {
          for (let i = 1; i < r.puntos.length; i += 2) {
            const y = r.puntos[i];
            if (y >= domY[0] && y <= domY[1]) ks.add(Math.floor(y / Math.PI + 1e-9));
          }
        }
        const kMin = Math.ceil(domY[0] / Math.PI), kMax = Math.floor(domY[1] / Math.PI) - 1;
        for (let k = kMin; k <= kMax; k++) {
          assert(ks.has(k), `y±${s} ${pasada}: rama k=${k} presente`);
        }
      }
    }
  });

  test(`${SRC}: residual ~0 (los puntos SÍ están sobre la curva) y sin crosshair (multivaluada)`, () => {
    const campo = F(SRC);
    const prov = crearProveedor(construirObjeto(SRC, "id"));
    const vp = crearViewport([-70, 72], [-38, 38], 900, 390, 1);
    const g = prov.geometria(vp, { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" });
    let peor = 0, n = 0;
    for (const r of g.ramas) {
      for (let i = 0; i + 1 < r.puntos.length; i += 2) {
        const x = r.puntos[i], y = r.puntos[i + 1];
        if (x < -1 || y < vp.domY[0] || y > vp.domY[1]) continue;
        const v = Math.abs(campo.eval(x, y));
        if (Number.isFinite(v)) { if (v > peor) peor = v; n++; }
      }
    }
    assert(n > 1000, `suficientes puntos (${n})`);
    assert(peor < 1e-6, `residual máx ${peor.toExponential(1)} < 1e-6`);
    // Ramas solapadas en x (multivaluada) → curvaRecorrible=false → sin crosshair/⌖.
    const ctxNulo = null as unknown as CanvasRenderingContext2D;
    const escena = new Escena(construirObjetosEscena(SRC),
      new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo));
    escena.actualizar(vp, "final");
    assert(!escena.curvaRecorrible(), "multivaluada → no recorrible");
  });

  test("astroide x^{2/3}+y^{2/3}=1: multivaluada (arcos superiores e inferiores) → sin crosshair", () => {
    // Bug: sus arcos SUPERIORES son x-monótonos (llevan `parametro`) pero los INFERIORES se
    // pliegan en x (sin `parametro`) cubriendo la MISMA franja de x → curva multivaluada.
    // curvaRecorrible filtraba las ramas sin parametro y, viendo solo los arcos superiores
    // disjuntos, la declaraba recorrible → el crosshair aparecía sobre el astroide. Debe ser
    // NO recorrible en cualquier encuadre (con o sin arcos monótonos según el zoom).
    const ctxNulo = null as unknown as CanvasRenderingContext2D;
    for (const vp of [
      crearViewport([-7, 7], [-7, 7], 768, 512, 1),
      crearViewport([-1.3, 1.3], [-1.3, 1.3], 768, 512, 1),
      crearViewport([-1.1, 1.1], [-1.1, 1.1], 768, 512, 1),
    ]) {
      const escena = new Escena(construirObjetosEscena("x^{2/3}+y^{2/3}=1"),
        new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo));
      escena.actualizar(vp, "final");
      assert(!escena.curvaRecorrible(), `astroide no recorrible @ [${vp.domX.join(",")}]`);
    }
  });

  test("transpuesta tan(x)(y^2+1)=sqrt(y+1): columnas verticales completas, sin `parametro`", () => {
    const prov = crearProveedor(construirObjeto("tan(x)(y^2+1)=sqrt(y+1)", "id"));
    const domX: [number, number] = [-38, 38];
    const g = prov.geometria(crearViewport(domX, [-20, 20], 900, 390, 1),
      { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" });
    const ks = new Set<number>();
    for (const r of g.ramas) {
      igual(r.parametro, undefined, "parametro omitido tras el giro");
      for (let i = 0; i < r.puntos.length; i += 2) {
        const x = r.puntos[i];
        if (x >= domX[0] && x <= domX[1]) ks.add(Math.floor(x / Math.PI + 1e-9));
      }
    }
    const kMin = Math.ceil(domX[0] / Math.PI), kMax = Math.floor(domX[1] / Math.PI) - 1;
    for (let k = kMin; k <= kMax; k++) assert(ks.has(k), `columna k=${k} presente`);
  });
});

describe("Periodicidad del campo (detección numérica para el teselado)", () => {
  const C = (f: (x: number, y: number) => number): CampoEscalar => ({ eval: f });

  test("red de lazos: período 2π en AMBOS ejes (la llave del teselado)", () => {
    const F = (construirObjeto(
      "4(cos(x)+cos(y))+2cos(x+y)+2cos(x-y)-2cos(2x)-2cos(2y)-7=0", "p"
    ) as ObjetoImplicito).F;
    const per = detectarPeriodos(F);
    aprox(per.px ?? 0, 2 * Math.PI, 1e-12, "período en x");
    aprox(per.py ?? 0, 2 * Math.PI, 1e-12, "período en y");
  });

  test("períodos mínimos por eje: tan→π, sin(πx)→2, eje sin trig→null", () => {
    const t = detectarPeriodos(C((x, y) => Math.tan(x) - y));
    aprox(t.px ?? 0, Math.PI, 1e-12, "tan x es π-periódico");
    igual(t.py, null, "y aparece lineal: sin período");
    const s = detectarPeriodos(C((x, y) => Math.sin(Math.PI * x) + y * y * y));
    aprox(s.px ?? 0, 2, 1e-12, "sin(πx) es 2-periódico");
    igual(s.py, null, "y³ no es periódico");
  });

  test("campos NO periódicos: null en ambos ejes (círculo, sin(x·y))", () => {
    for (const f of [C((x, y) => x * x + y * y - 9), C((x, y) => Math.sin(x * y))]) {
      const per = detectarPeriodos(f);
      igual(per.px, null, "px");
      igual(per.py, null, "py");
    }
  });

  test("dominio no periódico NO engaña: √x+cos x no declara período", () => {
    const per = detectarPeriodos(C((x, _y) => Math.sqrt(x) + Math.cos(x)));
    igual(per.px, null, "√x rompe la periodicidad del dominio");
  });

  test("la composición enruta la red de lazos al proveedor teselado", () => {
    const p = crearProveedor(construirObjeto("cos(x)+cos(y)+cos(x+y)=0.5", "p"));
    igual(p.constructor.name, "ProveedorImplicitoTeselado", "ruta del dispatcher");
    // …una implícita INVERTIBLE en y (x³+y³=9 ⇒ y=∛(9−x³), función de UN SOLO VALOR) se grafica
    // por el muestreo EXPLÍCITO: traza la curva entera hasta el borde, sin el corte de la
    // continuación (que la acota a ~2× la vista — la cola de e^x desaparecía).
    const q = crearProveedor(construirObjeto("x^3+y^3=9", "p"));
    igual(q.constructor.name, "ProveedorExplicito", "invertible en y → sampler explícito");
    // …y una MULTIVALUADA no periódica (el círculo, y=±√…) va al raster-wrapper genérico.
    const c = crearProveedor(construirObjeto("x^2+y^2=9", "p"));
    igual(c.constructor.name, "ProveedorImplicitoRasterizado", "multivaluada sin período → ruta genérica");
  });

  test("Grafo: la implícita invertible traza la COLA completa hasta el borde (ln(y)=x, sin corte)", () => {
    // Bug reportado: `\ln(y)=x` (⇒ y=e^x) por continuación se cortaba en x≈−8 (la cola y→0 por la
    // izquierda desaparecía), mientras la explícita `e^x` llegaba al borde. Ahora se rutea por el
    // sampler explícito → la cola alcanza el borde izquierdo de la vista (−11), como `e^x`.
    const vp = crearViewport([-11, 11], [-7, 7], 880, 390, 1);
    const xs: number[] = [];
    const g = crearProveedor(construirObjeto("\\ln(y) = x", "id")).geometria(vp, TOL_FINAL);
    for (const r of g.ramas) { const a = r.puntos; for (let k = 0; k < a.length; k += 2) xs.push(a[k]); }
    assert(xs.length > 0 && Math.min(...xs) < -10.5,
      `la cola izquierda llega al borde (no se corta en −8): xMin=${Math.min(...xs).toFixed(1)}`);
  });
});

describe("Polos y monomios: astillas junto a los polos (regresión zoom-out)", () => {
  test("monomio √|y|: √|y|+tan x=2 se separa en 2 ramas explícitas y=±g²", () => {
    const F: CampoEscalar = { eval: (x, y) => Math.sqrt(Math.abs(y)) + Math.tan(x) - 2 };
    const ramas = ramasMonomioY(F);
    assert(ramas !== null && ramas.length === 2, "2 ramas ±");
    // En x=0: √|y| = 2 ⇒ y = ±4.
    aprox(ramas![0].eval(0), 4, 1e-9, "rama +");
    aprox(ramas![1].eval(0), -4, 1e-9, "rama −");
  });

  test("localizarPolos completa la retícula periódica que el escaneo no ve", () => {
    // En c(x)=x²+x+tan x−C el CERO se pega al polo a ~1/x²: dentro de un paso de
    // escaneo c pasa por ±∞ y por 0 con extremos del MISMO signo → lejos del centro
    // el polo era invisible y las astillas de x²+x+|y|+tan x=C desaparecían del
    // dibujo. La extensión periódica verificada debe encontrarlos TODOS.
    const F: CampoEscalar = { eval: (x, y) => x * x + x + Math.abs(y) + Math.tan(x) - (2 * Math.PI + 3) };
    const polos = localizarPolos(F, -100, 100);
    const esperados = Math.floor(200 / Math.PI);         // uno cada π
    assert(polos.length >= esperados - 2, `${polos.length} polos (esperados ~${esperados})`);
    // Y todos son polos DE VERDAD (ninguno inventado): |c| enorme y signo opuesto a ±ε.
    let extendidos = 0;
    for (const p of polos) {
      const eps = Math.max(1e-9, Math.abs(p) * 1e-11);
      const a = F.eval(p - eps, 0), b = F.eval(p + eps, 0);
      if (Number.isFinite(a) && Number.isFinite(b) && a * b < 0 &&
          Math.min(Math.abs(a), Math.abs(b)) > 1e3) extendidos++;
    }
    assert(extendidos >= esperados - 2, "los candidatos extendidos están verificados");
  });

  test("polos NO periódicos: la extensión no inventa nada (tan(x²))", () => {
    const F: CampoEscalar = { eval: (x, y) => Math.tan(x * x) + y };
    const polos = localizarPolos(F, 1, 10);
    // Los polos reales están en x=√(π/2+kπ): espaciado DECRECIENTE, no uniforme.
    for (const p of polos) {
      const k = (p * p - Math.PI / 2) / Math.PI;
      aprox(k, Math.round(k), 1e-4, `polo espurio en x=${p}`);
    }
  });

  test("localizarPolos: MISMO conjunto de polos a cualquier zoom/paneo (sin espurios)", () => {
    // El período de la retícula se ancla a una ventana CENTRAL fija, no a la vista, y cada polo
    // se verifica con el sondeo a ±ε → conjunto DETERMINISTA, independiente del zoom/paneo.
    const F: CampoEscalar = { eval: (x, y) => x * x + x + Math.abs(y) + Math.tan(x) - (2 * Math.PI + 3) };
    const enComun = (a: number, b: number) => localizarPolos(F, a, b).filter((p) => p >= -15 && p <= 15);
    const base = enComun(-30, 30);
    // 10 polos reales de tan en [-15,15] (x=π/2+kπ), ni uno más (el CERO pegado a cada polo,
    // que el escaneo antes reportaba como polo espurio variable con el zoom, ya se filtra).
    igual(base.length, 10, "10 polos reales en [-15,15]");
    for (const [a, b] of [[-100, 100], [-500, 500], [-2000, 2000]] as [number, number][]) {
      const otro = enComun(a, b);
      igual(otro.length, base.length, `[${a},${b}]: mismo nº de polos en [-15,15]`);
      for (let i = 0; i < base.length; i++) aprox(otro[i], base[i], 1e-6, `[${a},${b}]: polo ${i} coincide`);
    }
    // Todos son polos REALES de tan (x=π/2+kπ), ninguno espurio.
    for (const p of base) aprox((p - Math.PI / 2) / Math.PI, Math.round((p - Math.PI / 2) / Math.PI), 1e-3, `polo real en x=${p.toFixed(3)}`);
    // Y una vista lejana (paneo) encuentra TODOS sus polos locales (antes se perdían).
    const lejos = localizarPolos(F, 200, 400);
    assert(lejos.length >= Math.floor(200 / Math.PI) - 2, `vista lejana [200,400]: ${lejos.length} polos (~64)`);
  });
});

describe("Rasterizado por signo (marching squares) para campos de alta frecuencia", () => {
  const TOLF: Tolerancia = { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" };
  const largoG = (g: Geometria) => {
    let L = 0; for (const r of g.ramas) for (let k = 2; k < r.puntos.length; k += 2)
      L += Math.hypot(r.puntos[k] - r.puntos[k - 2], r.puntos[k + 1] - r.puntos[k - 1]);
    return L;
  };

  test("contornosMarchingSquares recupera el círculo x²+y²=25 (perímetro ≈ 2πr)", () => {
    const F: CampoEscalar = { eval: (x, y) => x * x + y * y - 25 };
    const vp = crearViewport([-8, 8], [-8, 8], 400, 400, 1);
    const ramas = contornosMarchingSquares(F, vp, "z", 1, 400_000);
    let L = 0; for (const r of ramas) for (let k = 2; k < r.puntos.length; k += 2)
      L += Math.hypot(r.puntos[k] - r.puntos[k - 2], r.puntos[k + 1] - r.puntos[k - 1]);
    aprox(L, 2 * Math.PI * 5, 0.5, `perímetro trazado ${L.toFixed(2)} ≈ 31.42`);
    // Y cada vértice está SOBRE la curva (|F| ≈ 0).
    for (const r of ramas) for (let k = 0; k < r.puntos.length; k += 2)
      assert(Math.abs(F.eval(r.puntos[k], r.puntos[k + 1])) < 0.3, "vértice sobre F=0");
  });

  test("eq. cos(xy)=∛(y²): a zoom-out rasteriza (banda LLENA, no rayado disperso)", () => {
    const src = "\\ln{x^{2}+1}+\\cos{xy}=\\sqrt[3]{y^{2}}";
    const prov = crearProveedor(construirObjeto(src, "z"));
    igual(prov.constructor.name, "ProveedorImplicitoRasterizado", "eq.3 → rasterizado");
    const vp = crearViewport([-45, 45], [-22, 22], 560, 330, 1);
    const g = prov.geometria(vp, TOLF);
    // La continuación daba ~130 ramas / ~1300 u (≈10%); el raster da MILES de hebras y varias
    // veces esa longitud → banda llena. Cotas holgadas (no miden píxeles exactos).
    assert(g.ramas.length > 1000, `muchas hebras: ${g.ramas.length}`);
    assert(largoG(g) > 4000, `banda llena: largo ${largoG(g).toFixed(0)} u (continuación daba ~1300)`);
  });

  test("zoom-IN de la misma curva: vuelve a la continuación (curva suave, pocas hebras)", () => {
    const src = "\\ln{x^{2}+1}+\\cos{xy}=\\sqrt[3]{y^{2}}";
    const g = crearProveedor(construirObjeto(src, "z"))
      .geometria(crearViewport([-3, 3], [-2, 2], 560, 330, 1), TOLF);
    assert(g.ramas.length < 20, `pocas ramas (continuación): ${g.ramas.length}`);
  });

  test("las curvas SUAVES no se rasterizan: delegan a la continuación (lazos, no miles de hebras)", () => {
    const vp = crearViewport([-45, 45], [-22, 22], 560, 330, 1);
    for (const [n, s] of [["círculo", "x^2+y^2=9"], ["folium", "x^3+y^3=3*x*y"], ["hipérbola", "x^2-y^2=4"]] as const) {
      const g = crearProveedor(construirObjeto(s, "z")).geometria(vp, TOLF);
      assert(g.ramas.length < 10, `${n}: sigue por continuación (${g.ramas.length} ramas, no rasterizado)`);
    }
  });
});
