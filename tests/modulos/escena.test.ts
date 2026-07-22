// ─────────────────────────────────────────────
// tests · Escena: sistemas, intersecciones y encuadre
// ─────────────────────────────────────────────
//
// Sistemas de varias ecuaciones (Etapa 9), intersecciones derivadas de la geometría
// (11), funciones escalón (floor/ceil), autoencuadre y el barrido de estrés que
// vigila que ninguna expresión cuelgue el hilo principal.
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { VP, TOL_FINAL, TOL_INT, fr } from "./comun";
import { crearViewport } from "../../src/motor/scene/viewport-utils";
import { TrazadorExplicitoAdaptativo } from "../../src/motor/tracing/explicit/TrazadorExplicitoAdaptativo";
import { ProveedorImplicitoSeparable } from "../../src/motor/providers/ProveedorImplicitoSeparable";
import { yEnRamas } from "../../src/motor/analysis/lecturaRama";
import { estadoGrupo, analizarFuncion, raicesALatex } from "../../src/analisis";
import { despejarEcuaciones } from "../../src/despejar";
import { simplificarEcuaciones } from "../../src/simplificar";
import { derivadaLatex, derivarExpr } from "../../src/derivar";
import { trazar } from "../../src/herramientas/trazador";
import { bloqueALatex } from "../../src/latex";
import { normalizarEntrada } from "../../src/parser";
import { compilarFuncion } from "../../src/evaluador";
import { parse } from "mathjs";
import { construirObjeto } from "../../src/motor/parsing/construirObjeto";
import { insertarProductoImplicito } from "../../src/motor/parsing/productoImplicito";
import { dividirEcuaciones } from "../../src/motor/parsing/dividirEcuaciones";
import { crearProveedor, construirObjetosEscena } from "../../src/motor/app/composicion";
import { ProveedorExplicito } from "../../src/motor/providers/ProveedorExplicito";
import { ProveedorImplicitoRasterizado } from "../../src/motor/providers/ProveedorImplicitoRasterizado";
import { ProveedorParametrico } from "../../src/motor/providers/ProveedorParametrico";
import type { Tolerancia, Rama, Geometria, ObjetoImplicito, Punto } from "../../src/motor/contracts";
import { semiYAutoencuadre, semiYAcotado, cuantizarSemirrango } from "../../src/motor/scene/autoencuadre";
import { interseccionSegmentos, interseccionesDeGeometrias } from "../../src/motor/analysis/interseccionesRamas";
import { Escena } from "../../src/motor/scene/Escena";
import { Overlay } from "../../src/motor/rendering/overlay/Overlay";
import { RendererCanvas2D } from "../../src/motor/rendering/RendererCanvas2D";
import { Crosshair } from "../../src/motor/rendering/Crosshair";

// ════════════════════════════════════════════════
// Sistemas (Etapa 9): varias ecuaciones por bloque → N objetos con N colores.
describe("Sistemas: varias ecuaciones (Etapa 9)", () => {
  const TOL: Tolerancia = TOL_FINAL;

  test("dividirEcuaciones: por líneas, por \\\\ (cases), 1 línea, vacío; no parte la coma", () => {
    igual(dividirEcuaciones("y=x\ny=-x").length, 2, "dos líneas → 2");
    igual(dividirEcuaciones("y=x").length, 1, "una línea → 1");
    igual(dividirEcuaciones("   ").length, 0, "vacío → 0");
    igual(dividirEcuaciones("\\begin{cases}y=x\\\\y=2x\\end{cases}").length, 2, "cases → 2");
    // La tupla paramétrica lleva coma pero es UNA ecuación (no se parte por comas).
    const par = dividirEcuaciones("(cos(t), sin(t))");
    igual(par.length, 1, "tupla paramétrica = 1 ecuación");
    igual(par[0], "(cos(t), sin(t))", "tupla intacta");
  });

  test("dividirEcuaciones: cases con aligned anidado, `\\\\[1ex]` y marcadores `&`", () => {
    // Formato EXACTO que emite el panel LaTeX (round-trip: lo mostrado se puede
    // volver a pegar como entrada). El `&` es alineación, no operador; `\\[1ex]` es
    // el salto con argumento de espaciado. Cada `\\` de una cadena JS = 1 backslash;
    // la entrada real tiene 2 backslashes en `\\[1ex]` → aquí `\\\\[1ex]`.
    const eqs = dividirEcuaciones(
      "\\begin{cases}\\begin{aligned}x+y&=2\\\\[1ex]x-y&=0\\end{aligned}\\end{cases}"
    );
    igual(eqs.length, 2, "aligned anidado → 2 ecuaciones");
    igual(eqs[0], "x+y=2", "sin `&`, sin entorno, sin `\\[1ex]`");
    igual(eqs[1], "x-y=0", "segunda ecuación limpia");
    // Con espacios alrededor de `&` y `\\` sin argumento de espaciado.
    const conEspacios = dividirEcuaciones(
      "\\begin{cases}\\begin{aligned}x+y &= 2 \\\\ x-y &= 0\\end{aligned}\\end{cases}"
    );
    igual(conEspacios.length, 2, "con espacios y `\\\\` pelado → 2");
    // array{lcl} con su spec de columnas también se desenvuelve.
    igual(dividirEcuaciones("\\begin{array}{lcl}y=x\\\\y=2x\\end{array}").length, 2, "array{lcl} → 2");
  });

  test("crearProveedor elige el proveedor por tipo de objeto", () => {
    assert(crearProveedor(construirObjeto("y=x^2", "id")) instanceof ProveedorExplicito, "explícita");
    assert(crearProveedor(construirObjeto("x^2+y^2=9", "id")) instanceof ProveedorImplicitoRasterizado, "implícita suave → ruta genérica (raster-wrapper; delega a continuación mientras no sea densa)");
    assert(crearProveedor(construirObjeto("tan(x)+y^2=2", "id")) instanceof ProveedorImplicitoSeparable, "separable con polos");
    assert(crearProveedor(construirObjeto("(cos(t),sin(t))", "id")) instanceof ProveedorParametrico, "paramétrica");
    assert(crearProveedor(construirObjeto("r=1+cos(theta)", "id")) instanceof ProveedorParametrico, "polar");
  });

  test("construirObjetosEscena: un sistema → N objetos con colores distintos, cada uno traza", () => {
    const objs = construirObjetosEscena("y=x\nx^2+y^2=9\n(cos(t),sin(t))");
    igual(objs.length, 3, "tres ecuaciones → tres objetos");
    // Colores distintos (paleta).
    const cols = objs.map((o) => o.estilo.color.join(","));
    igual(new Set(cols).size, 3, "tres colores distintos");
    // Cada proveedor produce geometría (al menos una rama) en una vista estándar.
    for (const o of objs) {
      const g = o.proveedor.geometria(VP, TOL);
      assert(g.ramas.length >= 1, "cada objeto del sistema traza al menos una rama");
    }
  });

  test("sistema lineal {y=x, y=-x}: dos rectas que se cruzan en el origen", () => {
    const objs = construirObjetosEscena("y=x\ny=-x");
    igual(objs.length, 2, "dos rectas");
    const ys = objs.map((o) => {
      const r = o.proveedor.geometria(VP, TOL).ramas[0];
      // y en x=2 leído de la geometría: +2 y −2 respectivamente (en algún orden).
      return yEnRamas([r], 2)!;
    }).sort((a, b) => a - b);
    aprox(ys[0], -2, 0.05, "una recta da y(2)=−2");
    aprox(ys[1], 2, 0.05, "la otra da y(2)=+2");
  });

  test("un solo objeto sigue funcionando (sin regresión de bloque de 1 ecuación)", () => {
    igual(construirObjetosEscena("y=sin(x)").length, 1, "una ecuación → un objeto");
    igual(construirObjetosEscena("").length, 0, "bloque vacío → cero objetos (plano vacío)");
  });
});

// ════════════════════════════════════════════════
describe("Intersecciones del sistema (Etapa 11): derivadas de la geometría", () => {
  const EPS_M = ((VP.domX[1] - VP.domX[0]) / VP.anchoPx) * 3; // 3 px en mundo
  const geoms = (src: string): Geometria[] =>
    construirObjetosEscena(src).map((o) => o.proveedor.geometria(VP, TOL_FINAL));
  // Mismo filtro a la vista que aplica la Escena (la geometría desborda el viewport).
  const enVista = (pts: readonly Punto[]): Punto[] =>
    pts.filter((p) =>
      p.x >= VP.domX[0] && p.x <= VP.domX[1] &&
      p.y >= VP.domY[0] && p.y <= VP.domY[1]);

  test("interseccionSegmentos: cruce, paralelos, colineales, fuera de rango, contacto", () => {
    const p = interseccionSegmentos(-1, -1, 1, 1, -1, 1, 1, -1)!;
    aprox(p.x, 0, 1e-12, "cruce de diagonales: x=0");
    aprox(p.y, 0, 1e-12, "cruce de diagonales: y=0");
    igual(interseccionSegmentos(0, 0, 1, 0, 0, 1, 1, 1), null, "paralelos → null");
    igual(interseccionSegmentos(0, 0, 1, 0, 2, 0, 3, 0), null, "colineales → null (sin punto aislado)");
    igual(interseccionSegmentos(0, 0, 1, 1, 2, 0, 3, -1), null, "se cortarían fuera del rango → null");
    const q = interseccionSegmentos(0, 0, 1, 1, 1, 1, 2, 0)!;
    aprox(q.x, 1, 1e-9, "contacto exacto en el extremo compartido");
  });

  test("dos rectas {y=x, y=−x} → exactamente (0,0)", () => {
    const pts = enVista(interseccionesDeGeometrias(geoms("y=x\ny=-x"), EPS_M));
    igual(pts.length, 1, "una sola intersección");
    aprox(pts[0].x, 0, 1e-6, "x=0");
    aprox(pts[0].y, 0, 1e-6, "y=0");
  });

  test("recta y=x × círculo x²+y²=9 (explícita × continuación) → ±(3/√2, 3/√2)", () => {
    const pts = enVista(interseccionesDeGeometrias(geoms("y=x\nx^2+y^2=9"), EPS_M));
    igual(pts.length, 2, "dos cruces recta-círculo");
    const r = 3 / Math.SQRT2;
    const orden = [...pts].sort((a, b) => a.x - b.x);
    aprox(orden[0].x, -r, 0.02, "cruce inferior x≈−2.1213 (precisión del trazado)");
    aprox(orden[0].y, -r, 0.02, "cruce inferior y");
    aprox(orden[1].x, r, 0.02, "cruce superior x");
    aprox(orden[1].y, r, 0.02, "cruce superior y");
  });

  test("parábola y=x² × recta y=4 → (±2, 4)", () => {
    const pts = enVista(interseccionesDeGeometrias(geoms("y=x^2\ny=4"), EPS_M));
    igual(pts.length, 2, "dos cruces");
    const orden = [...pts].sort((a, b) => a.x - b.x);
    aprox(orden[0].x, -2, 0.01, "x=−2");
    aprox(orden[1].x, 2, 0.01, "x=+2");
    aprox(orden[0].y, 4, 0.01, "y=4");
  });

  test("y=sin(x) × y=0 → los 5 ceros kπ de la vista, con precisión del trazado", () => {
    const pts = enVista(interseccionesDeGeometrias(geoms("y=sin(x)\ny=0"), EPS_M));
    igual(pts.length, 5, "kπ para k=−2..2 en [−8,8]");
    const orden = [...pts].sort((a, b) => a.x - b.x);
    for (let k = -2; k <= 2; k++) {
      aprox(orden[k + 2].x, k * Math.PI, 0.01, `cero en ${k}π`);
    }
  });

  test("sin cruce → 0; curvas SOLAPADAS (misma recta ×2) → 0 puntos aislados, sin colgarse", () => {
    igual(enVista(interseccionesDeGeometrias(geoms("x^2+y^2=9\ny=5"), EPS_M)).length, 0,
      "círculo r=3 y recta y=5 no se tocan");
    igual(enVista(interseccionesDeGeometrias(geoms("y=x\ny=x"), EPS_M)).length, 0,
      "solape colineal: infinitas soluciones → 0 aisladas (límite documentado)");
  });

  test("solape → estado.solapa=true; cruce transversal e inexistente → false (infinitas vs. no)", () => {
    const solapa = (src: string): boolean => {
      const e = { solapa: false };
      interseccionesDeGeometrias(geoms(src), EPS_M, undefined, undefined, e);
      return e.solapa;
    };
    assert(solapa("y=x\ny=x"), "rectas idénticas → coinciden (infinitas)");
    assert(solapa("y=2x+1\ny=2x+1"), "misma recta repetida → coinciden");
    assert(!solapa("y=x\ny=-x"), "cruce transversal aislado → NO solapa");
    assert(!solapa("y=x\ny=x+3"), "paralelas distintas → NO solapa");
    assert(!solapa("y=x^2\ny=4"), "parábola y recta → cruces aislados, NO solapa");
  });

  test("tres objetos {y=x, y=−x, x²+y²=9} → 5 intersecciones (todos los pares)", () => {
    const pts = enVista(interseccionesDeGeometrias(geoms("y=x\ny=-x\nx^2+y^2=9"), EPS_M));
    igual(pts.length, 5, "origen + 4 cruces recta-círculo");
  });

  test("paramétrica (cos t, sin t) × explícita y=x (tipos mixtos, agnóstico)", () => {
    const pts = enVista(interseccionesDeGeometrias(geoms("(cos(t), sin(t))\ny=x"), EPS_M));
    igual(pts.length, 2, "círculo unitario paramétrico corta a y=x en 2 puntos");
    const r = 1 / Math.SQRT2;
    const orden = [...pts].sort((a, b) => a.x - b.x);
    aprox(orden[0].x, -r, 0.02, "−1/√2");
    aprox(orden[1].x, r, 0.02, "+1/√2");
  });

  test("caso denso y=sin(10x) × y=0: cuenta exacta y acotada (dedup + cap deterministas)", () => {
    const pts = enVista(interseccionesDeGeometrias(geoms("y=sin(10x)\ny=0"), EPS_M));
    igual(pts.length, 51, "kπ/10 para k=−25..25 en [−8,8]");
  });

  test("Escena: calcula en pasada final, conserva en interactiva, expone intersecciones()", () => {
    const objs = construirObjetosEscena("y=x\ny=-x");
    const ctxNulo = null as unknown as CanvasRenderingContext2D;
    const escena = new Escena(objs, new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo));
    escena.actualizar(VP); // default = "final"
    igual(escena.intersecciones().length, 1, "pasada final calcula el cruce");
    aprox(escena.intersecciones()[0].x, 0, 1e-6, "cruce en el origen");
    // Pasada interactiva (gesto): NO recalcula; conserva los puntos de mundo previos.
    const VP2 = crearViewport([-7, 9], [-7, 7], 768, 261, 1);
    escena.actualizar(VP2, "interactiva");
    igual(escena.intersecciones().length, 1, "interactiva conserva las últimas intersecciones");
  });
});

// ════════════════════════════════════════════════
// Funciones escalón floor/ceil (piso ⌊⌋ y techo ⌈⌉): soporte transversal.
// Parser (\lfloor…\rfloor, \lceil…\rceil, Unicode), evaluación (nativas de mathjs),
// LaTeX del panel (\left\lfloor…\right\rfloor), simplificación (solo el argumento),
// trazado (saltos CORTADOS: escalones planos, sin "peldaños" verticales ni falsas
// asíntotas), derivada (0 donde existe, conservando el dominio del argumento) y
// sistemas (válidas en cualquier ecuación).
describe("Funciones escalón: floor y ceil (piso ⌊⌋ y techo ⌈⌉)", () => {
  const val = (s: string, x: number) =>
    parse(insertarProductoImplicito(normalizarEntrada(s))).evaluate({ x });

  test("parser: \\lfloor…\\rfloor / \\lceil…\\rceil → floor/ceil (con \\left, anidados, Unicode)", () => {
    igual(val(String.raw`\lfloor x \rfloor`, 2.7), 2, "⌊2.7⌋");
    igual(val(String.raw`\left\lfloor \frac{x}{2} \right\rfloor`, 5), 2, "\\left + \\frac: ⌊5/2⌋");
    igual(val(String.raw`\lceil x \rceil`, 2.1), 3, "⌈2.1⌉");
    igual(val(String.raw`\lceil x^{2} \rceil`, 1.5), 3, "⌈x²⌉ = ⌈2.25⌉");
    igual(val(String.raw`\lfloor x + \lceil x \rceil \rfloor`, 1.2), 3, "techo anidado en piso");
    igual(val(String.raw`\lfloor \lfloor x \rfloor / 2 \rfloor`, 5.9), 2, "piso anidado en piso");
    igual(val("⌊x⌋ + ⌈x⌉", 2.5), 5, "Unicode ⌊⌋ ⌈⌉");
    igual(val("floor(x) + ceil(x)", 2.5), 5, "forma interna directa (mathjs)");
    igual(val("2floor(x)", 2.5), 4, "producto implícito: no parte `floor` en letras");
  });

  test("evaluador: valores en negativos y enteros exactos", () => {
    const f = compilarFuncion(normalizarEntrada(String.raw`\lfloor x \rfloor`), "x");
    igual(f(-1.5), -2, "⌊−1.5⌋ = −2");
    igual(f(3), 3, "⌊3⌋ = 3");
    const g = compilarFuncion(normalizarEntrada(String.raw`\lceil x \rceil`), "x");
    igual(g(-1.5), -1, "⌈−1.5⌉ = −1");
    igual(g(3), 3, "⌈3⌉ = 3");
  });

  test("LaTeX del panel: \\left\\lfloor…\\right\\rfloor (round-trip con la entrada LaTeX)", () => {
    igual(bloqueALatex(["floor(x)"]), "f(x)=\\left\\lfloor x\\right\\rfloor", "interna → piso");
    igual(bloqueALatex([String.raw`\lfloor x \rfloor`]), "f(x)=\\left\\lfloor x\\right\\rfloor",
      "la entrada LaTeX produce el MISMO render (round-trip)");
    igual(bloqueALatex([String.raw`y=\lceil x \rceil`]), "y=\\left\\lceil x\\right\\rceil",
      "techo dentro de una ecuación");
  });

  test("simplificar: preserva el escalón y reduce SOLO su argumento", () => {
    const [s] = simplificarEcuaciones(["floor(x+x) + floor(x) + floor(x)"]);
    assert(s.includes("floor("), `conserva floor: ${s}`);
    // Equivalencia semántica (sin fijar el formato exacto): ⌊2x⌋ + 2⌊x⌋.
    const f = compilarFuncion(s, "x");
    const ref = (x: number) => Math.floor(2 * x) + 2 * Math.floor(x);
    for (const x of [-2.7, -0.3, 0.4, 1.5, 3.9]) igual(f(x), ref(x), `equivale en x=${x}`);
  });

  test("trazado: escalones PLANOS separados; el salto NO es asíntota", () => {
    const vp = crearViewport([-4, 4], [-3, 3], 768, 261, 1);
    for (const pasada of ["final", "interactiva"] as const) {
      const tol: Tolerancia = { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada };
      for (const [nombre, f] of [["floor", Math.floor], ["ceil", Math.ceil]] as const) {
        const res = new TrazadorExplicitoAdaptativo().trazar(fr(f), "id", vp, tol);
        igual(res.ramas.length, 8, `${nombre} [${pasada}]: una rama por peldaño`);
        for (const r of res.ramas) {
          let ymin = Infinity, ymax = -Infinity;
          for (let k = 1; k < r.puntos.length; k += 2) {
            ymin = Math.min(ymin, r.puntos[k]);
            ymax = Math.max(ymax, r.puntos[k]);
          }
          aprox(ymax - ymin, 0, 1e-9, `${nombre} [${pasada}]: cada peldaño es plano`);
        }
        igual(res.asintotas.length, 0, `${nombre} [${pasada}]: un salto finito no es asíntota`);
      }
    }
  });

  test("trazado: el salto también se corta montado sobre una pendiente (x+⌊x⌋)", () => {
    const vp = crearViewport([-1.5, 1.5], [-4, 4], 768, 261, 1);
    const res = new TrazadorExplicitoAdaptativo()
      .trazar(fr((x) => x + Math.floor(x)), "id", vp, TOL_FINAL);
    // Saltos visibles en x=−1, 0 y 1 → cuatro tramos inclinados separados.
    igual(res.ramas.length, 4, "cuatro tramos entre los tres saltos de la vista");
    for (const r of res.ramas) {
      let maxSalto = 0;
      for (let k = 3; k < r.puntos.length; k += 2)
        maxSalto = Math.max(maxSalto, Math.abs(r.puntos[k] - r.puntos[k - 2]));
      assert(maxSalto < 0.5, `sin peldaño interno (maxSalto=${maxSalto.toFixed(3)})`);
    }
  });

  test("guardia del corte: una pendiente continua EXTREMA no se parte como salto", () => {
    // Sigmoide casi vertical pero CONTINUA: el sondeo de mesetas (esSaltoFinito) ve
    // valores intermedios y conecta. Protege contra sobre-cortar verticales reales
    // (p. ej. la ∛ que comprime un polo de tan, test de la Etapa 7).
    const res = new TrazadorExplicitoAdaptativo()
      .trazar(fr((x) => 5 * Math.tanh(1e7 * x)), "id", VP, TOL_FINAL);
    igual(res.ramas.length, 1, "continua → una sola rama (sin corte espurio)");
  });

  test("obs-derivate: derivada de escalones (0 donde existe; conserva el dominio del argumento)", () => {
    igual(derivarExpr("floor(x)"), "0", "⌊x⌋′ = 0 (fuera de los enteros)");
    igual(derivarExpr("ceil(x)"), "0", "⌈x⌉′ = 0");
    igual(derivarExpr(String.raw`\lfloor 2x+1 \rfloor`), "0", "argumento afín: 0 igual");
    igual(derivarExpr("x*floor(x)"), "floor(x)", "regla del producto conserva el escalón");
    igual(derivarExpr("sin(x) + ceil(x^2)"), "cos(x)", "término escalón: aporte 0");
    // El dominio del ARGUMENTO no se pierde: d/dx ⌊√x⌋ existe solo donde √x existe.
    const d = derivarExpr("floor(sqrt(x))")!;
    const f = compilarFuncion(d, "x");
    igual(f(2.3), 0, "vale 0 donde √x es derivable");
    const enNegativo = f(-4);
    assert(!(typeof enNegativo === "number" && Number.isFinite(enNegativo)),
      "en x<0 NO es un real finito (el motor lo trata como hueco)");
    igual(derivadaLatex(["floor(x)"]), "f'\\left(x\\right) = 0", "panel de la derivada evaluada");
  });

  test("rendimiento: las mesetas NO disparan la búsqueda de asíntotas (presupuesto de evals)", () => {
    // Regresión del lag: con maxLocal admitiendo EMPATES (`<=`/`>=`), cada terna de
    // una meseta con |y|>1.5 lanzaba la búsqueda ternaria (60 iteraciones): 82 406
    // evaluaciones por frame frente a ~3 200 de sin(x) → ~1 s/frame con mathjs.
    // Con el máximo estricto, floor debe costar como cualquier función.
    const vp = crearViewport([-30, 30], [-15.6, 15.6], 600, 370, 1);
    const contar = (fn: (x: number) => number): number => {
      let n = 0;
      new TrazadorExplicitoAdaptativo().trazar(fr((x) => { n++; return fn(x); }), "id", vp,
        { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "interactiva" });
      return n;
    };
    const evalsFloor = contar(Math.floor), evalsSin = contar(Math.sin);
    assert(evalsFloor < evalsSin * 2.5,
      `floor dentro de presupuesto: ${evalsFloor} evals (sin(x): ${evalsSin})`);
  });

  test("rendimiento: el scope evalúa floor/ceil rápidas SIN perder la corrección epsilon", () => {
    // mathjs floor/ceil pasan por typed-function (~18 µs/eval vs 1.5 µs de sin);
    // FUNCIONES_ESCALON_RAPIDAS las sombrea en el scope. La corrección epsilon se
    // conserva: 0.1·30 = 2.9999999999999996 debe dar piso 3 (como mathjs), no 2.
    const f = compilarFuncion("floor(x)", "x");
    igual(f(2.9999999999999996), 3, "epsilon: casi-entero redondea al entero");
    igual(f(2.7), 2, "no-entero normal");
    igual(f(-1.5), -2, "negativo");
    const g = compilarFuncion("ceil(x)", "x");
    igual(g(2.0000000000000004), 2, "epsilon simétrico en ceil");
    igual(g(2.3), 3, "ceil normal");
  });

  test("ⓘ: las raíces por TRAMOS se detectan como intervalos con apertura/cierre", () => {
    // ⌊x⌋ vale 0 en [0,1): el análisis debe dar UN intervalo cerrado-abierto (no
    // "demasiadas para mostrar" por los 50 puntos muestreados sobre la meseta).
    const a = analizarFuncion(Math.floor);
    igual(a.intervalosRaiz.length, 1, "un tramo de raíces");
    aprox(a.intervalosRaiz[0].a, 0, 1e-6, "empieza en 0");
    aprox(a.intervalosRaiz[0].b, 1, 1e-6, "termina en 1");
    igual(a.intervalosRaiz[0].cerradoA, true, "0 incluido (⌊0⌋=0)");
    igual(a.intervalosRaiz[0].cerradoB, false, "1 excluido (⌊1⌋=1)");
    igual(a.raices.length, 0, "sin raíces puntuales (la meseta no es una lista de puntos)");
    igual(estadoGrupo(a.raices.length + a.intervalosRaiz.length, false), "normal",
      "el tramo cuenta como UN elemento: ya no cae en 'demasiadas'");

    // ⌈x⌉: simétrico, (−1, 0] — abierto a la izquierda, cerrado a la derecha.
    const c = analizarFuncion(Math.ceil);
    igual(c.intervalosRaiz.length, 1, "ceil: un tramo");
    aprox(c.intervalosRaiz[0].a, -1, 1e-6, "ceil: desde −1");
    aprox(c.intervalosRaiz[0].b, 0, 1e-6, "ceil: hasta 0");
    igual(c.intervalosRaiz[0].cerradoA, false, "−1 excluido (⌈−1⌉=−1)");
    igual(c.intervalosRaiz[0].cerradoB, true, "0 incluido (⌈0⌉=0)");

    // Mixto: tramo [0,1) + raíz PUNTUAL en −3 (cruce transversal normal).
    const m = analizarFuncion((x) => Math.floor(x) * (x + 3));
    igual(m.intervalosRaiz.length, 1, "mixto: el tramo se conserva");
    igual(m.raices.length, 1, "mixto: y la raíz puntual también");
    aprox(m.raices[0], -3, 1e-4, "raíz puntual en −3");

    // Sin escalones NADA cambia: puntuales como siempre, cero intervalos.
    const p = analizarFuncion((x) => x * x - 4);
    igual(p.intervalosRaiz.length, 0, "x²−4: sin tramos");
    igual(p.raices.length, 2, "x²−4: dos raíces puntuales");

    // ⌊1/x⌋ vale 0 para todo x>1: el tramo toca el borde del rango (x=10) y sigue en
    // 0 al sondear más lejos → se extiende a +∞ (no se recorta a (1,10]).
    const inf = analizarFuncion((x) => Math.floor(1 / x));
    igual(inf.intervalosRaiz.length, 1, "⌊1/x⌋: un tramo");
    aprox(inf.intervalosRaiz[0].a, 1, 1e-6, "empieza en 1");
    igual(inf.intervalosRaiz[0].b, Infinity, "no termina: se extiende a +∞");
    igual(inf.intervalosRaiz[0].cerradoA, false, "1 excluido (⌊1⌋=1)");
    igual(inf.intervalosRaiz[0].cerradoB, false, "∞ siempre abierto");
  });

  test("ⓘ: LaTeX del conjunto de raíces (solo la parte matemática)", () => {
    igual(raicesALatex([{ a: 0, b: 1, cerradoA: true, cerradoB: false }], []),
      "x\\in [0,1)", "⌊x⌋ → x∈[0,1)");
    igual(raicesALatex([{ a: -1, b: 0, cerradoA: false, cerradoB: true }], []),
      "x\\in (-1,0]", "⌈x⌉ → x∈(−1,0]");
    igual(raicesALatex([{ a: 0, b: 1, cerradoA: true, cerradoB: false }], [-3]),
      "x\\in [0,1)\\cup \\{-3\\}", "tramo ∪ raíces sueltas");
    igual(raicesALatex(
      [{ a: 0, b: 1, cerradoA: true, cerradoB: false }, { a: 2, b: 3, cerradoA: true, cerradoB: false }], []),
      "x\\in [0,1)\\cup [2,3)", "varios tramos unidos con ∪");
    igual(raicesALatex([{ a: -0.00000001, b: 0.5, cerradoA: true, cerradoB: false }], []),
      "x\\in [0,0.5)", "números compactos (−0 → 0, sin ceros de relleno)");
    igual(raicesALatex([{ a: 1, b: Infinity, cerradoA: false, cerradoB: false }], []),
      "x\\in (1,\\infty)", "⌊1/x⌋ → x∈(1,∞) (extremo no acotado)");
    igual(raicesALatex([{ a: -Infinity, b: Infinity, cerradoA: false, cerradoB: false }], []),
      "x\\in (-\\infty,\\infty)", "no acotado por ambos lados");
  });

  test("marcadores del plano: la meseta NO siembra puntos; queda SOLO la intersección Y", () => {
    // Regresión: cada muestra de la meseta [0,1) con y===0 se marcaba como raíz →
    // fila de ~8 puntos naranjas sobre el eje. Ahora la meseta se describe como
    // intervalo en el ⓘ y el plano solo marca la intersección Y (0,0) — que además
    // se PERDÍA (el corte del salto parte las ramas justo en x=0 y ninguna "cruzaba").
    const vp = crearViewport([-12.5, 12.5], [-7, 7], 614, 261, 2);
    for (const [nombre, src] of [["floor", String.raw`\lfloor x \rfloor`], ["ceil", String.raw`\lceil x \rceil`]] as const) {
      const g = crearProveedor(construirObjeto(src, "id")).geometria(vp, TOL_FINAL);
      igual(g.puntosNotables.length, 1, `${nombre}: un único punto notable`);
      igual(g.puntosNotables[0].tipo, "interseccion-y", `${nombre}: es la intersección Y`);
      aprox(g.puntosNotables[0].punto.x, 0, 1e-9, `${nombre}: en x=0`);
      aprox(g.puntosNotables[0].punto.y, 0, 1e-9, `${nombre}: en y=0`);
    }
    // El cero AISLADO (toque tangente) se conserva: x² sigue marcando su raíz en 0.
    const gx2 = crearProveedor(construirObjeto("y=x^2", "id")).geometria(vp, TOL_FINAL);
    assert(gx2.puntosNotables.some((p) => p.tipo === "raiz"), "x²: raíz tangente intacta");
    // Y el extremo de dominio duplicado (…(3,0)(3,0) de √) no pasa por falsa meseta:
    // el círculo conserva SUS DOS raíces (lo canda también el test de INVARIANZA).
    const gc = crearProveedor(construirObjeto("x^2+y^2=9", "id")).geometria(vp, TOL_FINAL);
    igual(gc.puntosNotables.filter((p) => p.tipo === "raiz").length, 2, "círculo: raíces ±3");
  });

  test("obs-system: floor/ceil válidas en ecuaciones del sistema (con soluciones)", () => {
    const objs = construirObjetosEscena("y = floor(x)\ny = x - 0.5");
    igual(objs.length, 2, "dos ecuaciones");
    igual(construirObjeto("y = floor(x)", "id").tipo, "explicita", "y=⌊x⌋ es explícita");
    const EPS_M = ((VP.domX[1] - VP.domX[0]) / VP.anchoPx) * 3;
    const geoms = objs.map((o) => o.proveedor.geometria(VP, TOL_FINAL));
    const pts = interseccionesDeGeometrias(geoms, EPS_M).filter((p) =>
      p.x >= VP.domX[0] && p.x <= VP.domX[1] && p.y >= VP.domY[0] && p.y <= VP.domY[1]);
    // ⌊x⌋ = x−0.5 en cada semientero x=k+0.5 de la vista; y∈[−7,7] acota a ~14–15.
    assert(pts.length >= 10, `soluciones en los semienteros (${pts.length})`);
    for (const p of pts) aprox(p.x - Math.floor(p.x), 0.5, 0.05, "cruce en un semientero");
    // Y en una IMPLÍCITA: ⌊x⌋ − y = 0 también traza (misma curva por otra vía).
    const gImp = crearProveedor(construirObjeto("floor(x) - y = 0", "id")).geometria(VP, TOL_FINAL);
    assert(gImp.ramas.length >= 2, "la forma implícita también produce escalones");
  });
});

const CURVAS_ESTRES: ReadonlyArray<{ nombre: string; fuente: string }> = [
  { nombre: "corazón (x²+y²−1)³=x²y³", fuente: "\\left(x^{2}+y^{2}-1\\right)^{3}=x^{2}y^{3}" },
  { nombre: "recíproco x⁻¹", fuente: "x^{-1}" },
  { nombre: "lemniscata (x²+y²)²=2(x²−y²)", fuente: "(x^{2}+y^{2})^{2}=2(x^{2}-y^{2})" },
  { nombre: "astroide x^{2/3}+y^{2/3}=1", fuente: "x^{2/3}+y^{2/3}=1" },
  { nombre: "potencia alta (x+1)¹²", fuente: "(x+1)^{12}" },
];

// Presupuestos HOLGADOS: no miden rendimiento (sería frágil), sino la diferencia entre
// "termina" y "no termina". Antes del arreglo, el corazón no acababa NUNCA.
const MS_MAX_CURVA = 5000;

const PUNTOS_MAX_CURVA = 250_000;   // cota de memoria: ~4 MB de Float64Array

describe("Estrés: ninguna expresión cuelga el hilo principal", () => {
  for (const { nombre, fuente } of CURVAS_ESTRES) {
    test(`${nombre}: termina, acotada en tiempo y en memoria`, () => {
      const t0 = Date.now();
      const ecs = dividirEcuaciones(fuente);

      // Análisis simbólico (el panel LaTeX): AQUÍ estaba el cuelgue.
      const desp = despejarEcuaciones(ecs);
      const simp = simplificarEcuaciones(ecs);
      assert(desp.length === ecs.length && simp.length === ecs.length, "las transformaciones devuelven una forma por ecuación");

      // Geometría en las DOS pasadas (gesto + reposo), como hace la escena real.
      const prov = crearProveedor(construirObjeto(ecs[0], "estres"));
      let puntos = 0;
      for (const tol of [TOL_INT, TOL_FINAL]) {
        const g = prov.geometria(VP, tol);
        const n = g.ramas.reduce((s, r) => s + r.puntos.length / 2, 0);
        // Resultado VÁLIDO (geometría trazada) o fallo CONTROLADO (sin ramas), nunca basura.
        for (const r of g.ramas) assert(r.puntos.length % 2 === 0 && r.puntos.length >= 4, "polilínea bien formada");
        puntos = Math.max(puntos, n);
      }

      const ms = Date.now() - t0;
      assert(ms < MS_MAX_CURVA, `debe terminar en < ${MS_MAX_CURVA} ms (tardó ${ms} ms)`);
      assert(puntos < PUNTOS_MAX_CURVA, `geometría acotada (${puntos} puntos)`);
    });
  }

  test("el corazón SÍ se grafica (el arreglo no lo degrada a curva vacía)", () => {
    const prov = crearProveedor(construirObjeto("(x^2+y^2-1)^3=x^2*y^3", "corazon"));
    const g = prov.geometria(VP, TOL_FINAL);
    assert(g.ramas.length > 0, "el corazón produce geometría, no un fallo silencioso");
    // Sus puntos cumplen la ecuación: F(x,y)≈0 (la guarda es simbólica, no toca el trazado).
    const F = (construirObjeto("(x^2+y^2-1)^3=x^2*y^3", "c") as ObjetoImplicito).F;
    for (const r of g.ramas)
      for (let k = 0; k < r.puntos.length; k += 2)
        assert(Math.abs(F.eval(r.puntos[k], r.puntos[k + 1])) < 1e-3, "los puntos están sobre la curva");
  });
});

// ─────────────────────────────────────────────
// Despeje por RAÍZ IMPAR + cuadrática general (la familia del corazón)
// ─────────────────────────────────────────────
//
// `(A(x)+y²)^n = B(x)·y^n` con n IMPAR: la potencia impar es invertible en ℝ, así que se saca la
// raíz n-ésima real de los dos lados SIN perder ni añadir soluciones, y la ⁿ√ entra en el producto
// liberando la y (`∛(x²y³)=∛(x²)·y`, porque el exponente de y es múltiplo del índice) → queda una
// CUADRÁTICA en y, que la fórmula general resuelve. Antes el corazón salía "despeje PARCIAL".

// ── Autoencuadre: la vista inicial se acerca a la curva ACOTADA, y solo a ella ─────────
describe("Autoencuadre: acercar la vista a la curva pequeña, nunca alejarla", () => {
  const rama = (pts: number[]): Rama => ({
    puntos: new Float64Array(pts), cerrada: false, calidad: "exacta", objetoId: "o",
  });
  // Vista por defecto: domY [-7,7] y domX derivada del aspecto (celdas 1:1).
  const vpDefecto = crearViewport([-12.8, 12.8], [-7, 7], 768, 420, 1);

  test("la mantisa del semirrango se redondea HACIA ARRIBA por la tabla fina", () => {
    igual(cuantizarSemirrango(1.29), 1.5, "1.29 → 1.5 (con la tabla gruesa saltaba a 2)");
    igual(cuantizarSemirrango(2.2), 2.5, "2.2 → 2.5");
    igual(cuantizarSemirrango(0.31), 0.4, "0.31 → 0.4 (misma tabla, otra década)");
    igual(cuantizarSemirrango(1), 1, "un valor ya redondo no se toca");
  });

  test("curva acotada y pequeña (corazón): se encuadra dejando aire", () => {
    // Caja del corazón (x²+y²−1)³=x²y³: ~[-1.2,1.2] × [-1.4,1.2].
    const corazon = [rama([-1.2, 0, 0, 1.2, 1.2, 0, 0, -1.4, -1.2, 0])];
    const semi = semiYAutoencuadre(corazon, vpDefecto);
    igual(semi, 2.5, "1.4 de alto sobre una ocupación del 60% → 2.33, cuantizado a 2.5");
    assert((semi as number) * 0.6 >= 1.4, "la curva no llena el cuadro: le sobra plano alrededor");
  });

  test("la curva que TOCA un borde puede continuar fuera: no se encuadra", () => {
    // Una recta cruza la vista de lado a lado: el trazado llega a los bordes de domX.
    const recta = [rama([-12.8, -12.8, 12.8, 12.8])];
    igual(semiYAutoencuadre(recta, vpDefecto), null, "recta → sin encuadre");
    // Y una curva acotada pero MUY alta: sale por arriba aunque su x sea pequeña.
    const alta = [rama([-1, -7, 0, 0, 1, 7])];
    igual(semiYAutoencuadre(alta, vpDefecto), null, "toca el borde superior → sin encuadre");
  });

  test("si la curva ya llena la vista no sobra espacio: no se encuadra", () => {
    const grande = [rama([-5, -5, 0, 0, 5, 5])];
    igual(semiYAutoencuadre(grande, vpDefecto), null, "ocupa ~el 90% del alto → se deja como está");
  });

  test("una curva ANCHA y plana (lemniscata) la gobierna la X, no la Y", () => {
    // Lemniscata: |x|≤√2, |y|≤~0.35. Con celdas 1:1 el semiY debe cubrir semiX = semiY·ancho/alto.
    const lemniscata = [rama([-1.414, 0, -0.7, 0.35, 0, 0, 0.7, -0.35, 1.414, 0])];
    const semi = semiYAutoencuadre(lemniscata, vpDefecto);
    igual(semi, 1.5, "manda la X: 1.414·(420/768)/0.6 = 1.29 → cuantizado a 1.5");
    // El encuadre no la deja PEGADA a los bordes laterales (era el síntoma: la curva tocaba los
    // dos lados del plano). Con la ocupación máxima del 60%, sobra al menos un tercio a lo ancho.
    const semiX = (semi as number) * (768 / 420);
    assert(1.414 / semiX < 0.7, "la curva ocupa menos del 70% del semiancho: respira");
  });

  test("sin geometría, o degenerada a un punto, no se encuadra", () => {
    igual(semiYAutoencuadre([], vpDefecto), null, "sin ramas");
    igual(semiYAutoencuadre([rama([2, 3, 2, 3])], vpDefecto), null, "un punto no tiene tamaño");
  });

  // Sondeo (FACTOR_SONDEO=8 × la vista por defecto): la vista GRANDE en la que se decide si una
  // curva que se sale es ACOTADA (contenida) o ilimitada (toca el borde del sondeo).
  const vpSondeo = crearViewport([-12.8 * 8, 12.8 * 8], [-7 * 8, 7 * 8], 768, 420, 1);

  test("curva ACOTADA que SE SALE de la vista por defecto (astroide r=8): se ALEJA para encuadrar", () => {
    // La astroide x^{2/3}+y^{2/3}=4 llega a ±8, se sale de [-7,7] y queda recortada. En el sondeo
    // está contenida → acotada → se encuadra a su extensión: semiY = 8/0.8 = 10 (llena el 80%).
    const astroide = [rama([-8, 0, 0, 8, 8, 0, 0, -8, -8, 0])];
    igual(semiYAcotado(astroide, vpSondeo, 7), 10, "astroide r=8 → semiY=10 (aleja de 7)");
  });

  test("curva ACOTADA que CABE en la vista por defecto (círculo r=5): no se toca (null)", () => {
    // Cabe en [-7,7]: el zoom-in o la vista base ya la gobiernan; no hay que alejar.
    const circulo = [rama([-5, 0, 0, 5, 5, 0, 0, -5, -5, 0])];
    igual(semiYAcotado(circulo, vpSondeo, 7), null, "r=5 cabe en la vista base → sin reencuadre");
  });

  test("curva ILIMITADA (toca el borde del SONDEO): no se encuadra (null)", () => {
    // Una recta llega a los bordes de la vista GRANDE → se asume que continúa fuera → ilimitada.
    const recta = [rama([-12.8 * 8, -7 * 8, 12.8 * 8, 7 * 8])];
    igual(semiYAcotado(recta, vpSondeo, 7), null, "recta que cruza el sondeo → sin encuadre");
  });
});
