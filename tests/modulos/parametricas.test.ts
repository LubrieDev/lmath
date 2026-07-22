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
import { construirObjeto } from "../../src/motor/parsing/construirObjeto";
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
