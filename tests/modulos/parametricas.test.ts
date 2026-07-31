// ─────────────────────────────────────────────
// tests · Paramétricas y polares
// ─────────────────────────────────────────────
//
// Clasificación y geometría de las curvas paramétricas y polares (Etapa 6) y la
// regresión de render de las paramétricas por componentes (X,Y).
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { VP, TOL_FINAL, TOL_INT } from "./comun";
import { crearViewport } from "../../src/motor/scene/viewport-utils";
import { TrazadorParametricoAdaptativo } from "../../src/motor/tracing/parametric/TrazadorParametricoAdaptativo";
import { despejarEcuaciones } from "../../src/despejar";
import { simplificarEcuaciones } from "../../src/simplificar";
import { trazar } from "../../src/herramientas/trazador";
import { bloqueALatex } from "../../src/latex";
import { normalizarEntrada } from "../../src/parser";
import { compilarFuncion } from "../../src/evaluador";
import {
  construirObjeto, expresionPolar, expresionesParametricas,
} from "../../src/motor/parsing/construirObjeto";
import { analizarPolar } from "../../src/motor/analysis/analisisPolar";
import { analizarParametrico } from "../../src/motor/analysis/analisisParametrico";
import { numeroATexto, numeroALatex } from "../../src/motor/analysis/formatoNumero";
import { dominioPolar, periodoDeR } from "../../src/motor/parsing/periodoPolar";
import { dividirEcuaciones } from "../../src/motor/parsing/dividirEcuaciones";
import { crearProveedor } from "../../src/motor/app/composicion";
import { ProveedorExplicito } from "../../src/motor/providers/ProveedorExplicito";
import type { Rama, ObjetoParametrico, ObjetoPolar, Parametrizacion } from "../../src/motor/contracts";

// ════════════════════════════════════════════════
// NUEVA CAPACIDAD (Etapa 6): curvas paramétricas y polares.
// Cubre clasificación (sin romper explícita/implícita), trazado (círculo/elipse/
// parábola/Lissajous, polar r=cte/cardioide/rosa), cierre, residual, robustez
// (polos → ramas acotadas, hueco de dominio, dominio vacío), dos pasadas y la
// omisión deliberada de `parametro` en ramas paramétricas.
describe("Paramétricas y polares (Etapa 6)", () => {
  const trz = new TrazadorParametricoAdaptativo();
  // Construye desde texto y traza (pasa por el clasificador real).
  const geomDe = (src: string, vp = VP, tol = TOL_FINAL): { tipo: string; ramas: readonly Rama[] } => {
    const o = construirObjeto(src, "id");
    if (o.tipo !== "parametrica" && o.tipo !== "polar") return { tipo: o.tipo, ramas: [] };
    return { tipo: o.tipo, ramas: trz.trazar((o as ObjetoParametrico | ObjetoPolar).p, "id", vp, tol) };
  };
  const residual = (ramas: readonly Rama[], g: (x: number, y: number) => number): number => {
    let m = 0;
    for (const r of ramas)
      for (let k = 0; k < r.puntos.length; k += 2) m = Math.max(m, Math.abs(g(r.puntos[k], r.puntos[k + 1])));
    return m;
  };
  const noFinitos = (ramas: readonly Rama[]): number => {
    let n = 0;
    for (const r of ramas) for (let k = 0; k < r.puntos.length; k++) if (!Number.isFinite(r.puntos[k])) n++;
    return n;
  };
  const totalPts = (ramas: readonly Rama[]): number => {
    let n = 0; for (const r of ramas) n += r.puntos.length / 2; return n;
  };

  test("clasificación: tupla → paramétrica, r=… → polar; explícita/implícita SIN regresión", () => {
    igual(construirObjeto("(cos(t), sin(t))", "id").tipo, "parametrica", "tupla → paramétrica");
    igual(construirObjeto("(t, t^2)", "id").tipo, "parametrica", "tupla polinómica → paramétrica");
    igual(construirObjeto("r=1+cos(theta)", "id").tipo, "polar", "r=… → polar");
    igual(construirObjeto("r=2", "id").tipo, "polar", "r=cte → polar");
    // Regresión: lo anterior debe seguir clasificando igual.
    igual(construirObjeto("y=sin(x)", "id").tipo, "explicita", "y=f(x) → explícita");
    igual(construirObjeto("sin(x)", "id").tipo, "explicita", "un lado → explícita");
    igual(construirObjeto("x^2+y^2=9", "id").tipo, "implicita", "F(x,y)=0 → implícita");
    igual(construirObjeto("(x+1)*(x-1)", "id").tipo, "explicita", "paréntesis sin coma top → explícita");
  });

  test("círculo paramétrico (cos t, sin t) → 1 rama cerrada sobre x²+y²=1", () => {
    const { tipo, ramas } = geomDe("(cos(t), sin(t))");
    igual(tipo, "parametrica", "tipo");
    igual(ramas.length, 1, "una rama");
    assert(ramas[0].cerrada, "la circunferencia cierra");
    igual(noFinitos(ramas), 0, "finita");
    assert(residual(ramas, (x, y) => x * x + y * y - 1) < 1e-4, "residual sobre el círculo");
    // Tangentes verticales alcanzadas (x=±1) sin artefacto.
    let minX = Infinity, maxX = -Infinity;
    for (let k = 0; k < ramas[0].puntos.length; k += 2) { minX = Math.min(minX, ramas[0].puntos[k]); maxX = Math.max(maxX, ramas[0].puntos[k]); }
    aprox(maxX, 1, 0.02, "x máx ≈ 1"); aprox(minX, -1, 0.02, "x mín ≈ -1");
  });

  test("elipse paramétrica (3cos t, 2sin t) → 1 rama cerrada sobre x²/9+y²/4=1", () => {
    const { ramas } = geomDe("(3*cos(t), 2*sin(t))");
    igual(ramas.length, 1, "una rama"); assert(ramas[0].cerrada, "cierra");
    assert(residual(ramas, (x, y) => x * x / 9 + y * y / 4 - 1) < 1e-4, "residual sobre la elipse");
  });

  test("parábola paramétrica (t, t²) → 1 rama abierta sobre y=x², acotada al margen", () => {
    const { ramas } = geomDe("(t, t^2)");
    igual(ramas.length, 1, "una rama");
    assert(!ramas[0].cerrada, "abierta");
    igual(noFinitos(ramas), 0, "finita");
    assert(residual(ramas, (x, y) => y - x * x) < 1e-6, "los puntos cumplen y=x²");
  });

  test("polar r=2 → circunferencia cerrada sobre x²+y²=4", () => {
    const { tipo, ramas } = geomDe("r=2");
    igual(tipo, "polar", "tipo"); igual(ramas.length, 1, "una rama");
    assert(ramas[0].cerrada, "cierra");
    assert(residual(ramas, (x, y) => x * x + y * y - 4) < 1e-4, "residual sobre r=2");
  });

  test("polar cardioide r=1+cos(theta) → 1 rama cerrada finita", () => {
    const { ramas } = geomDe("r=1+cos(theta)");
    igual(ramas.length, 1, "una rama"); assert(ramas[0].cerrada, "cierra");
    igual(noFinitos(ramas), 0, "finita");
  });

  test("polar rosa r=sin(2theta) → cerrada y finita (4 pétalos en un lazo)", () => {
    const { ramas } = geomDe("r=sin(2theta)");
    assert(ramas.length >= 1, "al menos una rama"); igual(noFinitos(ramas), 0, "finita");
    assert(ramas.some((r) => r.cerrada), "el recorrido cierra");
  });

  test("periodo polar: r=sin(θ/10) traza los 10 lazos (dominio 20π), no un arquito", () => {
    // Bug reportado: con dominio fijo [0,2π] solo se veía 1/10 de la curva (r≤0.59, un
    // arquito junto al origen). El periodo real es 20π; ahí r llega a 1 (en θ=5π).
    const o = construirObjeto("r=sin(theta/10)", "id");
    igual(o.tipo, "polar", "polar");
    aprox((o as ObjetoPolar).p.dominio[1], 20 * Math.PI, 1e-6, "θ ∈ [0, 20π] (periodo real)");
    const { ramas } = geomDe("r=sin(theta/10)");
    igual(noFinitos(ramas), 0, "finita");
    let maxR = 0;
    for (const r of ramas) for (let k = 0; k < r.puntos.length; k += 2)
      maxR = Math.max(maxR, Math.hypot(r.puntos[k], r.puntos[k + 1]));
    aprox(maxR, 1, 0.03, `radio máx ≈ 1 (alcanza θ=5π), fue ${maxR.toFixed(3)}`);
  });

  test("robustez: polar con polos r=1/sin(theta) (recta y=1) → ramas ACOTADAS, no miles", () => {
    // Cerca de θ=0,π el radio → ∞; el trazador deja de seguir lo que sale del margen
    // (no fragmenta en miles de micro-ramas). La y debe ser ≈1 en todo punto.
    const { ramas } = geomDe("r=1/sin(theta)");
    assert(ramas.length <= 8, `ramas acotadas (${ramas.length})`);
    igual(noFinitos(ramas), 0, "sin coordenadas no finitas");
    assert(totalPts(ramas) < 5000, `puntos acotados (${totalPts(ramas)})`);
    let maxDy = 0;
    for (const r of ramas) for (let k = 1; k < r.puntos.length; k += 2) maxDy = Math.max(maxDy, Math.abs(r.puntos[k] - 1));
    assert(maxDy < 1e-6, `y≈1 en toda la recta (máx |y-1|=${maxDy})`);
  });

  test("hueco de dominio: (sqrt(t-3), t) solo existe para t≥3 → finito, x≥~0", () => {
    const { ramas } = geomDe("(sqrt(t-3), t)");
    assert(ramas.length >= 1, "traza la parte definida"); igual(noFinitos(ramas), 0, "finita");
    let minX = Infinity;
    for (const r of ramas) for (let k = 0; k < r.puntos.length; k += 2) minX = Math.min(minX, r.puntos[k]);
    assert(minX > -0.05, `x mín en el borde del dominio (${minX})`);
  });

  test("dominio sin puntos reales (r=sqrt(-1-theta²)) → 0 ramas, sin lanzar", () => {
    const { ramas } = geomDe("r=sqrt(-1-theta^2)");
    igual(ramas.length, 0, "sin ramas");
  });

  test("dos pasadas: interactiva conserva el cierre con menos puntos", () => {
    const fin = geomDe("(cos(t), sin(t))", VP, TOL_FINAL);
    const int = geomDe("(cos(t), sin(t))", VP, TOL_INT);
    igual(int.ramas.length, fin.ramas.length, "misma topología");
    assert(int.ramas[0].cerrada && fin.ramas[0].cerrada, "ambas cierran");
    assert(totalPts(int.ramas) < totalPts(fin.ramas), "interactiva tiene menos puntos");
  });

  test("las ramas paramétricas NO exponen parámetro x (no monovaluadas en x)", () => {
    const { ramas } = geomDe("(cos(t), sin(t))");
    igual(ramas[0].parametro, undefined, "sin parametro (el lookup por x no aplica)");
  });
});

// ════════════════════════════════════════════════
// Paramétricas `(X, Y)`: NO son explícitas. Regresión: el host tomaba la tupla como
// f(x) (`exprExplicita`) y `compilarFuncion` lanzaba, abortando el render del plano.
// El gate se apoya en `construirObjeto(...).tipo`; se protege esa clasificación + que
// la geometría de esas curvas sí se produce.
describe("Zoom-in: el arco visible se refina, no se dibuja como una recta", () => {
  const T = new TrazadorParametricoAdaptativo();
  const vpZ = (semi: number) => crearViewport([-semi * 1.4, semi * 1.4], [-semi, semi], 900, 360, 1);

  /** Parametrización de una fuente que se sabe paramétrica o polar (falla si no lo es). */
  const parametrizacionDe = (src: string): Parametrizacion => {
    const obj = construirObjeto(src, "o");
    assert(obj.tipo === "parametrica" || obj.tipo === "polar", `${src}: paramétrica o polar`);
    return (obj as { p: Parametrizacion }).p;
  };

  /** Peor distancia (en píxeles) de la curva REAL a la polilínea dibujada: la "faceta". */
  const desviacionMaxPx = (
    ramas: readonly { puntos: Float64Array }[],
    p: Parametrizacion,
    vp: ReturnType<typeof crearViewport>
  ): number => {
    const ax = vp.anchoPx / (vp.domX[1] - vp.domX[0]);
    const ay = vp.altoPx / (vp.domY[1] - vp.domY[0]);
    const SX = (x: number) => (x - vp.domX[0]) * ax;
    const SY = (y: number) => vp.altoPx - (y - vp.domY[0]) * ay;
    const segs: number[][] = [];
    for (const r of ramas)
      for (let k = 0; k < r.puntos.length - 2; k += 2) {
        const s = [SX(r.puntos[k]), SY(r.puntos[k + 1]), SX(r.puntos[k + 2]), SY(r.puntos[k + 3])];
        if (s.every(Number.isFinite)) segs.push(s);
      }
    if (segs.length === 0) return NaN;
    let peor = 0;
    const [d0, d1] = p.dominio;
    for (let i = 0; i <= 4000; i++) {
      const q = p.eval(d0 + ((d1 - d0) * i) / 4000);
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
      const px = SX(q.x), py = SY(q.y);
      if (px < -20 || px > vp.anchoPx + 20 || py < -20 || py > vp.altoPx + 20) continue;
      let mejor = Infinity;
      for (const s of segs) {
        const vx = s[2] - s[0], vy = s[3] - s[1];
        const L2 = vx * vx + vy * vy;
        let t = L2 > 0 ? ((px - s[0]) * vx + (py - s[1]) * vy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(px - (s[0] + t * vx), py - (s[1] + t * vy));
        if (d < mejor) mejor = d;
        if (mejor < 0.2) break;
      }
      if (mejor > peor) peor = mejor;
    }
    return peor;
  };

  /**
   * Peor GIRO (grados) entre dos segmentos consecutivos LARGOS de la polilínea. Es la
   * métrica que de verdad detecta las facetas: la desviación es una sagita y escala con
   * el CUADRADO de la cuerda, así que con la curva pequeña en pantalla un vértice puede
   * girar 36° y quedarse muy por debajo del umbral de 1 px (que es justo lo que pasaba:
   * los giros salían cuantizados en 36/18/9/4,5° — la polilínea uniforme SIN refinar).
   * Solo cuentan los quiebres entre segmentos > 4 px: un giro grande entre segmentos de
   * 1 px es una cúspide REAL (el r=0 de una rosa), no un artefacto del muestreo.
   */
  const giroMaxGrados = (
    ramas: readonly { puntos: Float64Array }[],
    vp: ReturnType<typeof crearViewport>
  ): number => {
    const ax = vp.anchoPx / (vp.domX[1] - vp.domX[0]);
    const ay = vp.altoPx / (vp.domY[1] - vp.domY[0]);
    const SX = (x: number) => (x - vp.domX[0]) * ax;
    const SY = (y: number) => vp.altoPx - (y - vp.domY[0]) * ay;
    const dentro = (X: number, Y: number) =>
      X >= -5 && X <= vp.anchoPx + 5 && Y >= -5 && Y <= vp.altoPx + 5;
    let peor = 0;
    for (const r of ramas) {
      const P: number[][] = [];
      for (let k = 0; k + 1 < r.puntos.length; k += 2) {
        const X = SX(r.puntos[k]), Y = SY(r.puntos[k + 1]);
        if (Number.isFinite(X) && Number.isFinite(Y)) P.push([X, Y, dentro(X, Y) ? 1 : 0]);
      }
      for (let i = 1; i + 1 < P.length; i++) {
        if (!P[i - 1][2] || !P[i][2] || !P[i + 1][2]) continue;
        const ux = P[i][0] - P[i - 1][0], uy = P[i][1] - P[i - 1][1];
        const vx = P[i + 1][0] - P[i][0], vy = P[i + 1][1] - P[i][1];
        const l1 = Math.hypot(ux, uy), l2 = Math.hypot(vx, vy);
        if (l1 <= 4 || l2 <= 4) continue;
        let c = (ux * vx + uy * vy) / (l1 * l2);
        c = c < -1 ? -1 : c > 1 ? 1 : c;
        const a = (Math.acos(c) * 180) / Math.PI;
        if (a > peor) peor = a;
      }
    }
    return peor;
  };

  test("curvatura acotada: ninguna paramétrica se dibuja poligonal (giro ≤ 6° por vértice)", () => {
    // La regresión de la queja "al hacer zoom se ve hecha de aristas, al soltar se suaviza":
    // el giro medio por vértice de r=sin(θ/10) era de 19,7° en la pasada interactiva y 9,9°
    // en la final. Con el criterio de giro quedan por debajo de 4°. Se comprueba en varias
    // curvas y zooms porque el defecto NO era de esta polar: era del criterio de refinado.
    for (const src of [
      String.raw`r = \sin(\theta/10)`,
      String.raw`r = 1 + \cos(\theta)`,
      "(cos(t), sin(t))",
      "(cos(3t), sin(5t))",
      "(t, t^2)",
    ]) {
      const p = parametrizacionDe(src);
      for (const semi of [7, 2, 1, 0.5, 0.2, 0.05]) {
        const vp = vpZ(semi);
        for (const tol of [TOL_INT, TOL_FINAL]) {
          const g = giroMaxGrados(T.trazar(p, "o", vp, tol), vp);
          assert(!(g > 6), `${src} semiY=${semi} ${tol.pasada}: giro ${g.toFixed(2)}° (debe ser ≤6)`);
        }
      }
    }
  });

  test("polar r=sin(θ/10): sin aristas a ningún zoom, en AMBAS pasadas", () => {
    // Cuando el zoom deja el trozo visible dentro de UN paso del muestreo inicial en t, el
    // trazador bisecaba hasta el borde de visibilidad y emitía SOLO ese punto: el arco
    // intermedio salía como una recta. Medido a semiY=0.005: 7 puntos y 37,6 px de
    // desviación en la pasada interactiva, contra 519 puntos y 0,07 px en la final — el
    // síntoma de "poligonal al hacer zoom, suave al soltar".
    const p = parametrizacionDe(String.raw`r = \sin(\theta/10)`);
    for (const semi of [1, 0.05, 0.01, 0.005, 0.002, 0.001]) {
      const vp = vpZ(semi);
      for (const tol of [TOL_INT, TOL_FINAL]) {
        const ramas = T.trazar(p, "o", vp, tol);
        const d = desviacionMaxPx(ramas, p, vp);
        assert(!(d > 2), `semiY=${semi} ${tol.pasada}: desviación ${d.toFixed(2)}px (debe ser ≤2)`);
      }
    }
  });

  test("el refinado del borde no rompe otras paramétricas (Lissajous y círculo)", () => {
    for (const src of ["(cos(3t), sin(2t))", "(cos(t), sin(t))"]) {
      const p = parametrizacionDe(src);
      for (const semi of [2, 0.5, 0.05]) {
        const vp = vpZ(semi);
        for (const tol of [TOL_INT, TOL_FINAL]) {
          const ramas = T.trazar(p, "o", vp, tol);
          const d = desviacionMaxPx(ramas, p, vp);
          assert(!(d > 2), `${src} semiY=${semi} ${tol.pasada}: ${d.toFixed(2)}px`);
        }
      }
    }
  });
});

describe("Paramétricas (X,Y): clasificación y geometría (regresión render)", () => {
  const VP = crearViewport([-3, 3], [-3, 3], 400, 400, 1);
  for (const src of ["(sin(2t), sin(3t))", "(t*cos(t), t*sin(t))"]) {
    test(`${src} → parametrica con geometría`, () => {
      const obj = construirObjeto(src, "id");
      igual(obj.tipo, "parametrica", "clasificada como paramétrica (no explícita)");
      // compilarFuncion(tupla, 'x') LANZA: el gate de exprExplicita debe excluirla.
      let compila = true;
      try { compilarFuncion(normalizarEntrada(src), "x"); } catch { compila = false; }
      assert(!compila, "la tupla NO compila como f(x) (por eso hay que excluirla del ⓘ)");
      const g = crearProveedor(obj).geometria(VP, TOL_FINAL);
      assert(g.ramas.length >= 1 && g.ramas[0].puntos.length > 100, "traza geometría (no plano vacío)");
    });
  }

  // Componentes por SEPARADO (`x(t)=…` / `y(t)=…`, como se escriben en un libro o en Desmos).
  // Antes: `x(t)` normalizaba al producto `x*t` → implícita basura con una `t` fantasma (plano
  // vacío, sin explicación). Ahora dividirEcuaciones las FUSIONA en la tupla canónica.
  test("componentes x(t)/y(t) en dos líneas → UNA paramétrica (epitrocoide)", () => {
    const src = String.raw`x(t)=5\cos t-\cos(5t)` + "\n" + String.raw`y(t)=5\sin t-\sin(5t)`;
    const eqs = dividirEcuaciones(src);
    igual(eqs.length, 1, "las dos componentes son UNA ecuación (tupla)");
    const obj = construirObjeto(eqs[0], "id");
    igual(obj.tipo, "parametrica", "clasificada como paramétrica");
    const g = crearProveedor(obj).geometria(crearViewport([-8, 8], [-8, 8], 400, 400, 1), TOL_FINAL);
    assert(g.ramas.length >= 1 && g.ramas[0].puntos.length > 100, "traza la curva (no plano vacío)");
    // Orden libre: primero y(t). La tupla siempre sale (X, Y).
    const alReves = dividirEcuaciones(String.raw`y(t)=\sin t` + "\n" + String.raw`x(t)=\cos t`);
    igual(alReves.length, 1, "orden invertido → sigue siendo una tupla");
    igual(construirObjeto(alReves[0], "id").tipo, "parametrica", "y sigue siendo paramétrica");
    // Sin secuestrar los sistemas: dos ecuaciones normales siguen siendo dos.
    igual(dividirEcuaciones("y=x\ny=-x").length, 2, "un sistema de verdad NO se fusiona");
  });

  // UNA sola componente (o una expresión suelta en `t`) SÍ es graficable: es la función
  // t ↦ expr, o sea la explícita de siempre con la abscisa llamada `t` (se renombra t→x y la
  // traza el ProveedorExplicito). Antes: `x(t)` = producto `x·t` → implícita basura, plano vacío.
  test("una sola componente x(t)=… (o una expresión en t) se grafica como explícita en t", () => {
    const VP1 = crearViewport([-6, 6], [-6, 6], 400, 400, 1);
    for (const src of [
      String.raw`x(t)=5\cos t-\cos(5t)`,
      String.raw`y(t)=5\sin t-\sin(5t)`,
      String.raw`5\cos t-\cos(5t)`, // expresión SUELTA en t: la variable independiente es t
    ]) {
      const obj = construirObjeto(dividirEcuaciones(src)[0], "id");
      igual(obj.tipo, "explicita", `${src}: explícita (variable independiente renombrada t→x)`);
      const g = crearProveedor(obj).geometria(VP1, TOL_FINAL);
      assert(g.ramas.length >= 1 && g.ramas[0].puntos.length > 50, `${src}: traza (no plano vacío)`);
    }
    // El NOMBRE dice en qué eje cae el VALOR: `x(t)` afirma que el punto de parámetro t tiene ESA
    // abscisa → la curva sale TUMBADA (parámetro en el eje vertical); `y(t)`, de pie.
    const tumbada = construirObjeto(String.raw`x(t)=5\cos t-\cos(5t)`, "id");
    igual(tumbada.tipo === "explicita" ? tumbada.salida : null, "x", "x(t): el valor va al eje x");
    const dePie = construirObjeto(String.raw`y(t)=5\sin t-\sin(5t)`, "id");
    igual(dePie.tipo === "explicita" ? dePie.salida ?? "y" : null, "y", "y(t): el valor va al eje y");
    // La geometría tumbada es la de pie con las coordenadas intercambiadas: su recorrido en X
    // llega al rango de la función (±6), no al del parámetro.
    const gT = crearProveedor(tumbada).geometria(VP1, TOL_FINAL);
    let maxX = 0;
    for (const r of gT.ramas) for (let i = 0; i < r.puntos.length; i += 2) maxX = Math.max(maxX, Math.abs(r.puntos[i]));
    assert(maxX > 5, "x(t) tumbada: la abscisa alcanza los valores de la función (|x|>5)");
    // El renombrado es sobre el ÁRBOL: `\cot t` (una función con `t` en el NOMBRE) no se rompe
    // (un reemplazo textual la habría dejado en `cox`/`co x` → nada que graficar).
    const cot = construirObjeto(String.raw`\cot t`, "id");
    igual(cot.tipo, "explicita", "cot t: explícita en t");
    const gcot = crearProveedor(cot).geometria(VP1, TOL_FINAL);
    assert(gcot.ramas.length >= 1, "cot t se traza (el nombre de la función sobrevive al renombrado)");
    // Una f(x) de toda la vida NO se ve afectada (ni una ecuación en t, que no es una f(t)).
    igual(construirObjeto("x^2", "id").tipo, "explicita", "x² sigue siendo explícita en x");
  });

  test("panel de una componente sola: x(t)=… (Simplificar la respeta; no hay y que despejar)", () => {
    igual(bloqueALatex(simplificarEcuaciones([String.raw`x(t)=5\cos t-\cos(5t)`])),
      "x\\left(t\\right)=5\\cos t-\\cos\\left(5t\\right)",
      "Simplificar conserva la declaración (no la lee como el producto t·x)");
    // `y(t)=…`: su `y` es el NOMBRE de la componente, no la incógnita → Despejar no aplica.
    igual(despejarEcuaciones([String.raw`y(t)=\sin t`])[0], String.raw`y(t)=\sin t`,
      "Despejar deja intacta la componente y(t) (no inventa y = sin(t)/t)");
    // Expresión suelta: nada dice que su valor sea la abscisa → gráfica clásica (valor en la
    // ordenada), y el panel la declara y(t)=…, no f(x)=… (no hay ninguna x en la fórmula).
    igual(bloqueALatex([String.raw`5\cos t-\cos(5t)`]),
      "y\\left(t\\right)=5\\cos t-\\cos\\left(5t\\right)",
      "expresión suelta en t → se declara y(t)=…, no f(x)=…");
  });

  test("panel: el par ordenado DECLARA (x(t), y(t)); la componente suelta se pinta x(t)=…", () => {
    const par = bloqueALatex([String.raw`(\cos t, \sin t)`]);
    igual(par, "\\left(x\\left(t\\right),\\ y\\left(t\\right)\\right)=\\left(\\cos t,\\ \\sin t\\right)",
      "tupla → par ordenado declarado (no una tupla desnuda)");
    // La `t` es una VARIABLE: cursiva. mathjs la pinta `\mathrm{t}` (la confunde con la unidad
    // tonelada), lo que la dejaba recta —la única letra recta de la fórmula—.
    assert(!par.includes("\\mathrm"), "la t va en cursiva, no en \\mathrm (fuente de unidad)");
    igual(bloqueALatex([String.raw`x(t)=5\cos t-\cos(5t)`]),
      "x\\left(t\\right)=5\\cos t-\\cos\\left(5t\\right)",
      "componente suelta: x(t)=…, no el producto x·t");
  });

  test("LaTeX del panel: la potencia va SOBRE la función (desambigua de tan(x²))", () => {
    // Bug reportado: `pow(tan(x),2)` se pintaba `{\tan x}^{2}` (visualmente `\tan x^2`,
    // leído como tan(x²)). Debe ir `\tan^{2} x` (exponente sobre la función).
    igual(bloqueALatex([String.raw`tan^2(x)`]), "f(x)=\\tan^{2} x", "tan²(x) → \\tan^{2} x");
    // Argumento agrupado con LLAVES (lo que emite el editor de fórmulas de Obsidian/MathLive):
    // `\sin^{2}{\left(3\theta\right)}`. Sin la rama de llaves en `casarPotenciaFuncion`, el `{`
    // frenaba el casado y la expresión salía cruda (`sin^(2){(3*theta)}`): ni graficaba ni pintaba.
    igual(normalizarEntrada(String.raw`\sin^{2}{\left(3\theta\right)}`), "(sin((3theta)))^(2)",
      "potencia de función con argumento entre llaves → (sin(3θ))² (el `*` lo pone el producto implícito)");
    igual(bloqueALatex([String.raw`\sin^{2}{x}`]), "f(x)=\\sin^{2} x", "llaves: misma tipografía");
    igual(bloqueALatex([String.raw`\tan^{2}(x)`]), "f(x)=\\tan^{2} x", "misma entrada LaTeX");
    igual(bloqueALatex([String.raw`\tan(x^2)`]), "f(x)=\\tan\\left(x^{2}\\right)",
      "tan(x²) DISTINTO: exponente DENTRO del paréntesis");
    igual(bloqueALatex([String.raw`\sin^{2}(x)+\cos^{2}(x)`]), "f(x)=\\sin^{2} x+\\cos^{2} x",
      "identidad pitagórica clara");
    // Mismo render en Original, Simplificar y Despejar (todos pasan por bloqueALatex/toTex).
    igual(bloqueALatex(simplificarEcuaciones([String.raw`tan^2(x)`])), "f(x)=\\tan^{2} x",
      "Simplificar mantiene la notación clara");
    igual(bloqueALatex(despejarEcuaciones([String.raw`\tan^{2}(x)=y`])), "y=\\tan^{2} x",
      "Despejar mantiene la notación clara");
  });
});

describe("Panel ⓘ de curvas paramétricas", () => {
  const DOS_PI = 2 * Math.PI;
  const analizar = (bloque: string, muestras?: number) => {
    const comp = expresionesParametricas(bloque);
    assert(comp !== null, `${bloque} debe reconocerse como paramétrica`);
    return comp === null ? null : analizarParametrico(comp[0], comp[1], 0, DOS_PI, muestras);
  };

  test("el ejemplo del usuario: (sin(3t+π/2), sin(4t))", () => {
    const a = analizar("(sin(3t+pi/2), sin(4t))");
    assert(a !== null, "analizable");
    if (!a) return;
    igual(a.familia?.tipo, "lissajous");
    if (a.familia?.tipo === "lissajous") {
      igual(a.familia.a, 3, "razón de frecuencias 3:…");
      igual(a.familia.b, 4, "…:4");
      aprox(a.familia.desfase, Math.PI / 2, 1e-6, "desfase π/2");
    }
    igual(a.cerrada, true, "el trazo se cierra");
    aprox(a.periodo ?? NaN, DOS_PI, 1e-9, "periodo 2π (mcm de 2π/3 y π/2)");
    aprox(a.xMin, -1, 1e-6); aprox(a.xMax, 1, 1e-6);
    aprox(a.yMin, -1, 1e-6); aprox(a.yMax, 1, 1e-6);
    igual(a.pasaPorOrigen, true, "pasa por el origen");
    igual(a.simetrias.join(","), "origen,ejeX,ejeY", "las tres simetrías");
    // El área ALGEBRAICA de una Lissajous simétrica es 0: los lóbulos se recorren en
    // sentidos opuestos y se cancelan. No es un fallo, es lo que mide ½∮(x dy − y dx), y
    // por eso NO se rotula "área encerrada".
    aprox(a.areaAlgebraica ?? NaN, 0, 1e-6, "área algebraica nula por simetría");
  });

  test("autointersecciones: cuenta correcta, estable y contrastada con la fórmula", () => {
    // Para una Lissajous de frecuencias coprimas a:b el número de autointersecciones es
    // 2ab − a − b. Sirve de oráculo INDEPENDIENTE del algoritmo (que cuenta cortes de
    // segmentos), que es lo que hace fiable el número que se enseña.
    const formula = (a: number, b: number) => 2 * a * b - a - b;
    igual(analizar("(sin(3t+pi/2), sin(4t))")?.autointersecciones, formula(3, 4), "3:4 → 17");
    igual(analizar("(sin(2t), sin(3t))")?.autointersecciones, formula(2, 3), "2:3 → 7");
    igual(analizar("(cos(t), sin(2t))")?.autointersecciones, formula(1, 2), "1:2 → 1");
    igual(analizar("(cos(t), sin(t))")?.autointersecciones, formula(1, 1), "circunferencia → 0");

    // REGRESIÓN: el cruce de la lemniscata de Gerono cae EXACTAMENTE sobre dos muestras
    // (t=π/2 y t=3π/2). Con el corte exigido en el interior abierto de ambos segmentos
    // salían CERO autointersecciones, y no es un caso raro: una curva simétrica pone sus
    // cruces en valores redondos del parámetro, justo donde cae la rejilla.
    igual(analizar("(cos(t), sin(2t))")?.autointersecciones, 1, "el cruce sobre la muestra se ve");

    // Y el conteo no puede depender de la resolución: un número que cambia al refinar no
    // es un número que se pueda enseñar.
    for (const n of [500, 1000, 4000])
      igual(analizar("(sin(3t+pi/2), sin(4t))", n)?.autointersecciones, 17,
        `estable con ${n} muestras`);
  });

  test("longitudes y áreas contrastadas con sus valores exactos", () => {
    const circ = analizar("(cos(t), sin(t))");
    aprox(circ?.longitud ?? NaN, DOS_PI, 1e-4, "circunferencia: perímetro 2π");
    aprox(circ?.areaAlgebraica ?? NaN, Math.PI, 1e-4, "…y área π");
    igual(circ?.familia?.tipo, "circunferencia");

    const elip = analizar("(2cos(t), sin(t))");
    aprox(elip?.areaAlgebraica ?? NaN, DOS_PI, 1e-4, "elipse a=2,b=1: área πab = 2π");
    aprox(elip?.longitud ?? NaN, 9.68845, 1e-3, "…y perímetro 9.68845 (valor conocido)");
    igual(elip?.familia?.tipo, "elipse", "1:1 con amplitudes distintas es una elipse");

    // Un arco de cicloide mide 8 y una cardioide también (8a con a=1); la cardioide
    // encierra 3π/2. Son curvas SIN familia paramétrica reconocida, y está bien así.
    aprox(analizar("(t-sin(t), 1-cos(t))")?.longitud ?? NaN, 8, 1e-3, "cicloide: longitud 8");
    const card = analizar("(cos(t)*(1-cos(t)), sin(t)*(1-cos(t)))");
    aprox(card?.longitud ?? NaN, 8, 1e-3, "cardioide: longitud 8");
    aprox(card?.areaAlgebraica ?? NaN, (3 * Math.PI) / 2, 1e-3, "…y área 3π/2");
    igual(card?.familia, null, "no es una Lissajous: sin familia");
  });

  test("una curva abierta no finge propiedades de una cerrada", () => {
    // La parábola sobre [0,2π] no se cierra, no es periódica y —la parte que importa— NO
    // es simétrica: la parábola COMPLETA sí lo es respecto al eje y, pero el bloque solo
    // dibuja la rama derecha. Es la misma lección que dejó la espiral en el panel polar.
    const par = analizar("(t, t^2)");
    assert(par !== null, "analizable");
    if (!par) return;
    igual(par.cerrada, false, "no se cierra");
    igual(par.periodo, null, "no es periódica");
    igual(par.areaAlgebraica, null, "sin área: no encierra nada");
    igual(par.simetrias.length, 0, "solo se dibuja media parábola");
    igual(par.pasaPorOrigen, true, "pero sí pasa por el origen");
  });

  test("un periodo mayor que el intervalo trazado se declara", () => {
    // (cos t, sin(t/3)) se cierra en 6π y el bloque dibuja [0,2π]: lo que se ve es un
    // trozo. Decirlo es la diferencia entre describir la curva y describir el dibujo.
    const a = analizar("(cos(t), sin(t/3))");
    assert(a !== null, "analizable");
    if (!a) return;
    aprox(a.periodo ?? NaN, 6 * Math.PI, 1e-6, "periodo 6π");
    igual(a.periodoExcedeDominio, true, "excede el intervalo dibujado");
    igual(a.cerrada, false, "y por eso el trazo no se cierra");
  });
});

describe("Formato de números del panel ⓘ (entero, π, decimal)", () => {
  test("absorbe el ruido de los cálculos numéricos y no rellena con ceros", () => {
    // El panel imprimía `toFixed(4)` a pelo: un valor exacto salía "1.0000" y uno con el
    // error propio del estimador (bisección, ajuste parabólico) salía "2.9999".
    igual(numeroATexto(1), "1", "entero exacto sin decimales muertos");
    igual(numeroATexto(0.99999), "1", "ruido por debajo → entero");
    igual(numeroATexto(2.99994), "3", "el vértice que aterrizaba en 2.9999");
    igual(numeroATexto(-0), "0", "el cero negativo no se escribe -0");
    igual(numeroATexto(1.5), "1.5", "decimal legítimo, sin relleno");
  });

  test("reconoce los múltiplos racionales de π", () => {
    igual(numeroATexto(Math.PI), "π", "π, no 3.1416");
    igual(numeroATexto(Math.PI / 2), "π/2", "el máximo de sin x");
    igual(numeroATexto(Math.PI / 16), "π/16", "el ángulo del ejemplo polar");
    igual(numeroATexto((-3 * Math.PI) / 4), "-3π/4", "signo fuera, numerador con múltiplo");
    igual(numeroATexto(2 * Math.PI), "2π", "la vuelta completa");
  });

  test("NO inventa formas cerradas donde no las hay", () => {
    // El riesgo de un reconocedor así es el falso positivo: si 1.1 saliera como una
    // fracción de π el panel mentiría. La tolerancia (1e-4) es demasiado fina para eso.
    igual(numeroATexto(1.1), "1.1", "radio del ejemplo: decimal tal cual");
    igual(numeroATexto(0.9), "0.9", "el otro extremo del rizo");
    igual(numeroATexto(1 / 3), "0.3333", "sin forma cerrada → 4 decimales");
    igual(numeroATexto(3.2), "3.2", "cerca de π pero NO es π");
  });

  test("la variante LaTeX compone la fracción, no la escribe en línea", () => {
    igual(numeroALatex(Math.PI), "\\pi");
    igual(numeroALatex(Math.PI / 2), "\\frac{\\pi}{2}");
    igual(numeroALatex((-3 * Math.PI) / 4), "-\\frac{3\\pi}{4}", "el signo va fuera");
    igual(numeroALatex(3), "3", "un entero no se envuelve en nada");
  });
});

describe("Panel ⓘ de curvas polares", () => {
  test("el periodo de r NO es el periodo de la curva (son dos preguntas distintas)", () => {
    // r=1+0,1·sin(8θ): el rizo se repite cada π/4, pero el trazo no se cierra hasta 2π.
    // El trazador necesita el segundo; el panel enseña el primero. Confundirlos haría
    // que el panel contradijera al dibujo.
    aprox(periodoDeR("1+0.1*sin(8*theta)") ?? NaN, Math.PI / 4, 1e-9, "periodo de r");
    aprox(dominioPolar("1+0.1*sin(8*theta)")[1], 2 * Math.PI, 1e-9, "periodo de la curva");
    // Y donde el periodo de r SÍ es mayor que la vuelta, ambos coinciden.
    aprox(periodoDeR("sin(theta/10)") ?? NaN, 20 * Math.PI, 1e-6, "sin(θ/10) tarda 20π");
    igual(periodoDeR("2"), null, "una circunferencia no tiene periodo en θ");
    igual(periodoDeR("theta"), null, "la espiral tampoco: no es periódica");
  });

  test("el ejemplo del usuario: r = 1 + 0.1·sin(8θ)", () => {
    const a = analizarPolar("1+0.1*sin(8*theta)");
    assert(a !== null, "debe analizarse");
    if (!a) return;
    aprox(a.rMin, 0.9, 1e-9, "radio mínimo");
    aprox(a.rMax, 1.1, 1e-9, "radio máximo");
    aprox(a.thetaRMax, Math.PI / 16, 1e-6, "el máximo cae en π/16, no en la rejilla");
    igual(a.ordenRotacional, 8, "ocho rizos por vuelta");
    igual(a.cambiaSigno, false, "r nunca cambia de signo: es un anillo");
    igual(a.angulosPolo?.length, 0, "no toca el origen");
    // ½∫(1+0,1 sin8θ)² dθ sobre [0,2π] = π(1+0,005) — el número del prompt.
    aprox(a.areaBarrida ?? NaN, Math.PI * 1.005, 1e-6, "área barrida");
    igual(a.patron, null, "una circunferencia rizada no es una familia clásica");
  });

  test("el área es BARRIDA, no encerrada: la rosa se traza dos veces", () => {
    // Decisión documentada en analisisPolar.ts. r=cos(3θ) recorre sus tres pétalos DOS
    // veces sobre [0,2π], así que ½∫r²dθ = π/2 es el doble del área real (π/4). Llamarla
    // "encerrada" sería falso justo en la familia más típica del bloque.
    const rosa = analizarPolar("cos(3*theta)");
    assert(rosa !== null, "rosa analizable");
    if (!rosa) return;
    aprox(rosa.areaBarrida ?? NaN, Math.PI / 2, 1e-6, "el doble del área de los pétalos");
    igual(rosa.patron?.tipo, "rosa");
    igual(rosa.patron && "petalos" in rosa.patron ? rosa.patron.petalos : 0, 3,
      "n impar → n pétalos");
    // Donde la curva NO se re-recorre, el área barrida sí es la encerrada: la cardioide
    // r=1+cos θ encierra 3π/2 y eso es exactamente lo que sale.
    const card = analizarPolar("1+cos(theta)");
    aprox(card?.areaBarrida ?? NaN, (3 * Math.PI) / 2, 1e-6, "cardioide: 3π/2 exacto");
  });

  test("clasifica las familias clásicas por sus armónicos, no por cómo se escriben", () => {
    igual(analizarPolar("cos(2*theta)")?.patron?.tipo, "rosa");
    const par = analizarPolar("cos(2*theta)")?.patron;
    igual(par && "petalos" in par ? par.petalos : 0, 4, "n par → 2n pétalos");
    igual(analizarPolar("1+cos(theta)")?.patron?.tipo, "cardioide");
    igual(analizarPolar("1+2*cos(theta)")?.patron?.tipo, "limaconLazo");
    igual(analizarPolar("3+cos(theta)")?.patron?.tipo, "limaconConvexo");
    igual(analizarPolar("2")?.patron?.tipo, "circunferenciaCentrada");
    igual(analizarPolar("2*cos(theta)")?.patron?.tipo, "circunferenciaPorPolo");
    // La cardioide escrita de otra forma es la MISMA curva: el clasificador mira r, no
    // el texto (por eso no se casa la expresión escrita).
    igual(analizarPolar("cos(theta)+1")?.patron?.tipo, "cardioide", "orden de los términos");
  });

  test("el lazo interior del limaçon se delata por el cambio de signo de r", () => {
    const a = analizarPolar("1+2*cos(theta)");
    assert(a !== null, "analizable");
    if (!a) return;
    igual(a.cambiaSigno, true, "r pasa de negativo a positivo → cruza al otro lado del polo");
    aprox(a.rMin, -1, 1e-9);
    aprox(a.rMax, 3, 1e-9);
    igual(a.angulosPolo?.length, 2, "toca el origen dos veces por vuelta");
    aprox(a.angulosPolo?.[0] ?? NaN, (2 * Math.PI) / 3, 1e-6, "el primero en 2π/3");
  });

  test("las simetrías que se afirman son las que se verifican (regresión)", () => {
    // r=sin(θ/10) NO es simétrica respecto al polo: r(θ+π)≠r(θ). Una versión anterior lo
    // decía que sí porque su test "alternativo" era en realidad el de la recta θ=π/2
    // duplicado. Los tests son condiciones SUFICIENTES: cuando ninguno pasa, el panel
    // calla en vez de afirmar que no hay simetría.
    const espiralito = analizarPolar("sin(theta/10)");
    assert(!espiralito?.simetrias.includes("polo"), "sin(θ/10) no es simétrica al polo");
    // La circunferencia centrada las tiene todas; la cardioide solo la del eje polar.
    igual(analizarPolar("2")?.simetrias.length, 3, "la circunferencia, las tres");
    igual(analizarPolar("1+cos(theta)")?.simetrias.join(","), "ejePolar",
      "la cardioide solo respecto al eje polar");
    // Y la del ejemplo sí tiene la del polo, porque π es múltiplo de su periodo π/4.
    assert(analizarPolar("1+0.1*sin(8*theta)")?.simetrias.includes("polo") === true,
      "1+0,1·sin(8θ): r(θ+π)=r(θ)");
  });

  test("la espiral de Arquímedes no hereda las simetrías de su prolongación (regresión)", () => {
    // r=θ CUMPLE el test clásico de θ=π/2, porque r(−θ)=−r(θ), y la espiral completa
    // sobre θ∈ℝ sí es simétrica respecto al eje y: el espejo del punto de θ=π/4 está en
    // θ=−π/4, con radio negativo. Pero el bloque dibuja [0,2π], donde ese espejo NO
    // existe, así que la curva que se ve no lo es. El test se hace sobre el dominio
    // trazado justamente para no describir una curva distinta de la dibujada.
    const esp = analizarPolar("theta");
    assert(esp !== null, "analizable");
    if (!esp) return;
    igual(esp.simetrias.length, 0, "sobre [0,2π] no queda ninguna simetría");
    // El resto de la espiral sigue siendo correcto y no debe moverse con este cambio.
    aprox(esp.rMin, 0, 1e-9);
    aprox(esp.rMax, 2 * Math.PI, 1e-3, "r llega hasta 2π");
    aprox(esp.areaBarrida ?? NaN, (4 * Math.PI ** 3) / 3, 1e-4, "½∫θ²dθ = 4π³/3");
    igual(esp.angulosPolo?.length, 1, "toca el polo solo en θ=0");

    // La contrapartida: una r CONSTANTE tampoco tiene periodo simbólico, pero se repite
    // trivialmente y conserva sus tres simetrías. Si el dominio se comprobara con
    // `periodoDeR` en vez de numéricamente, la circunferencia las perdería.
    igual(analizarPolar("2")?.simetrias.length, 3, "la circunferencia no es una espiral");
  });

  test("expresionPolar reconoce el bloque por cualquiera de sus lados", () => {
    assert(expresionPolar("r = 1+cos(theta)") !== null, "r a la izquierda");
    assert(expresionPolar("1+cos(theta) = r") !== null, "r a la derecha");
    igual(expresionPolar("y = x^2"), null, "una explícita no es polar");
    igual(expresionPolar("x^2+y^2=1"), null, "una implícita tampoco");
    // Lo que devuelve tiene que ser analizable tal cual (θ Unicode y producto implícito
    // ya resueltos): es el contrato del que depende el panel.
    const expr = expresionPolar("r = 1+0.1sin(8θ)");
    assert(expr !== null && analizarPolar(expr) !== null, "θ Unicode y 0.1sin(8θ) implícito");
  });
});
