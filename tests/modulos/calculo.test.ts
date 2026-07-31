// ─────────────────────────────────────────────
// tests · Cálculo: integral definida y derivadas
// ─────────────────────────────────────────────
//
// Parser de la notación LaTeX de `obs-integral`, área con signo y clasificación,
// relleno de la región, fachada del panel, primitiva simbólica (Barrow) y la
// derivada de exponenciales de base ≠ e.
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { fr } from "./comun";
import { crearViewport } from "../../src/motor/scene/viewport-utils";
import { derivadaLatex, derivarExpr } from "../../src/derivar";
import {
  extraerIntegral, evaluarLimite, integralOperadorLatex, integralValorLatex, integralPrimitivaLatex, evaluarArea, cuerpoAreaLatex, cuerpoAreaLatexExacto, etiquetaIntegral,
} from "../../src/integral";
import { integrarExpr } from "../../src/integrar";
import {
  areaDefinida, recortarRegion, ETIQUETA_DIVERGENTE, ETIQUETA_FUERA_DOMINIO, ETIQUETA_LIMITES,
} from "../../src/motor/analysis/areaBajoRama";
import { analizarIntegral } from "../../src/motor/analysis/analisisIntegral";
import { analizarDerivada } from "../../src/motor/analysis/analisisDerivada";
import { compilarFuncion } from "../../src/evaluador";
import {
  RELLENO_POSITIVO, RELLENO_NEGATIVO, TRAMA_POSITIVA, BORDE_REGION,
} from "../../src/motor/rendering/RendererCanvas2D";
import { crearFuncionReal } from "../../src/motor/fields/funcionRealMathjs";
import { normalizarEntrada } from "../../src/parser";
import { insertarProductoImplicito } from "../../src/motor/parsing/productoImplicito";
import { construirObjetosEscena } from "../../src/motor/app/composicion";
import type { FuncionReal, Rama } from "../../src/motor/contracts";
import { Escena } from "../../src/motor/scene/Escena";
import { Overlay } from "../../src/motor/rendering/overlay/Overlay";
import { RendererCanvas2D } from "../../src/motor/rendering/RendererCanvas2D";
import { Crosshair } from "../../src/motor/rendering/Crosshair";

describe("Integral definida: parser de la notación LaTeX (obs-integral)", () => {
  test("forma canónica \\int_{a}^{b} f\\,dx: integrando, límites y variable", () => {
    const it = extraerIntegral("\\int_{0}^{2}x^{2}\\,dx");
    assert(it !== null, "reconocida");
    igual(it!.integrando, "x^{2}", "integrando crudo");
    igual(it!.a, "0", "límite inferior");
    igual(it!.b, "2", "límite superior");
    igual(it!.variable, "x", "variable del diferencial");
  });

  test("límites simbólicos (a, b) y variable literal", () => {
    const it = extraerIntegral("\\int_{a}^{b}x^{2}\\,dx");
    igual(it!.a, "a", "a simbólico");
    igual(it!.b, "b", "b simbólico");
    // Un límite simbólico no evalúa a número (no hay área concreta).
    igual(evaluarLimite(it!.a), null, "a no numérico");
  });

  test("desliz \\in por \\int cuando va seguido de límite", () => {
    const it = extraerIntegral("\\in_{a}^{b}x^{2}\\,dx");
    assert(it !== null, "el ∈ con límites se lee como integral");
    igual(it!.integrando, "x^{2}", "integrando");
  });

  test("límites en orden inverso ^b _a", () => {
    const it = extraerIntegral("\\int^{2}_{0} x^2 \\, dx");
    igual(it!.a, "0", "inferior por _");
    igual(it!.b, "2", "superior por ^");
  });

  test("límites de un solo token sin llaves y diferencial pegado", () => {
    const it = extraerIntegral("\\int_0^1 e^{x}dx");
    igual(it!.a, "0", "a sin llaves");
    igual(it!.b, "1", "b sin llaves");
    igual(it!.integrando, "e^{x}", "diferencial pegado recortado");
  });

  test("número de varias cifras sin llaves se toma entero (indulgente)", () => {
    const it = extraerIntegral("\\int_0^{10} x dx");
    igual(it!.b, "10", "10 completo, no solo el 1");
  });

  test("diferencial ausente → variable por defecto x", () => {
    const it = extraerIntegral("\\int_{-1}^{1} x^2");
    igual(it!.integrando, "x^2", "sin dx, integrando íntegro");
    igual(it!.variable, "x", "variable por defecto");
    igual(it!.a, "-1", "límite negativo con llaves");
  });

  test("variable distinta de x en el diferencial", () => {
    const it = extraerIntegral("\\int_{0}^{1} t^2 \\, dt");
    igual(it!.variable, "t", "dt");
    // El integrando de CÓMPUTO renombra la variable a x (integrar/graficar trabajan en x),
    // de modo que `∫₀¹ t²dt` computa como `∫₀¹ x²dx` (= 1/3) en vez de dar "Fuera de dominio"
    // por una `t` libre. El panel operador conserva la variable escrita (integrandoDisplay).
    igual(it!.integrando, "x^2", "integrando en x para el cómputo (t→x)");
    igual(it!.integrandoDisplay, "t^2", "integrando como se escribió (panel operador)");
  });

  test("variable ≠ x: el área SÍ se computa (regresión: antes daba 'Fuera de dominio')", () => {
    igual(evaluarArea("\\int_{0}^{1} t^2 \\, dt")?.tipo, "valor", "∫₀¹t²dt es un valor, no una etiqueta");
    igual(evaluarArea("\\int_{0}^{1} y^2 \\, dy")?.tipo, "valor", "∫₀¹y²dy: la y del diferencial no es 'y libre'");
  });

  test("\\displaystyle y \\limits decorativos se toleran", () => {
    const it = extraerIntegral("\\displaystyle\\int\\limits_{0}^{2} x^2 \\, dx");
    igual(it!.a, "0", "límite tras \\limits");
    igual(it!.integrando, "x^2", "integrando limpio");
  });

  test("integral indefinida (sin límites) → null", () => {
    igual(extraerIntegral("\\int x^2 \\, dx"), null, "sin límites no es definida");
  });

  test("límites evaluables a número (incluye \\pi)", () => {
    const it = extraerIntegral("\\int_{0}^{\\pi} \\sin(x) \\, dx");
    igual(evaluarLimite(it!.a), 0, "a = 0");
    aprox(evaluarLimite(it!.b)!, Math.PI, 1e-12, "b = π");
  });

  test("forma por líneas (comodidad secundaria)", () => {
    const it = extraerIntegral("f(x) = x^2\na = 0\nb = 2");
    igual(it!.integrando, "x^2", "integrando de f(x)=…");
    igual(it!.a, "0", "a por línea");
    igual(it!.b, "2", "b por línea");
  });

  test("forma por líneas con y=expr y expresión suelta", () => {
    igual(extraerIntegral("y = 3x\na=0\nb=1")!.integrando, "3x", "lado no-y de y=expr");
    igual(extraerIntegral("2x+1\na=0\nb=1")!.integrando, "2x+1", "expresión suelta");
  });

  test("regresión: los strings exactos del usuario (con y sin espacios/\\,dx)", () => {
    igual(extraerIntegral("\\int_0^2 x^2")!.integrando, "x^2", "a mano, sin dx");
    const conDx = extraerIntegral("\\int_{0}^{2} x^2 \\, dx");
    igual(conDx!.integrando, "x^2", "con espacios y \\, dx");
    igual(conDx!.a, "0", "límite a");
    igual(conDx!.b, "2", "límite b");
  });

  test("robustez: caracteres invisibles (NBSP, espacio de ancho cero) no rompen el parseo", () => {
    //   = espacio no-rompible; ​ = espacio de ancho cero (típicos del copiar-pegar).
    const nbsp = "\\int_{0}^{2} x^2 \\, dx";
    const zwsp = "\\int_{0}^{2} x^2 \\,​ dx";
    igual(extraerIntegral(nbsp)!.integrando, "x^2", "con NBSP");
    igual(extraerIntegral(zwsp)!.integrando, "x^2", "con ancho cero");
  });

  test("bloque vacío o sin datos → null", () => {
    igual(extraerIntegral(""), null, "vacío");
    igual(extraerIntegral("a=0\nb=1"), null, "sin integrando");
    igual(extraerIntegral("f(x)=x^2\na=0"), null, "falta límite b");
  });

  test("operador LaTeX: round-trip tipográfico con \\int y el diferencial", () => {
    const tex = integralOperadorLatex("\\int_{0}^{2}x^{2}\\,dx");
    assert(tex.startsWith("\\int_{0}^{2}"), `límites en el operador: ${tex}`);
    assert(tex.includes("x^{2}"), `integrando renderizado: ${tex}`);
    assert(tex.endsWith("\\,dx"), `diferencial: ${tex}`);
  });

  test("operador de un bloque no reconocido: marcadores, no texto suelto", () => {
    const tex = integralOperadorLatex("");
    assert(tex.includes("\\int") && tex.includes("\\text{[...]}"), `marcador de integral: ${tex}`);
  });

  test("valor LaTeX ensambla el operador con = <valor>", () => {
    const tex = integralValorLatex("\\int_{0}^{2}x^{2}\\,dx", "\\frac{8}{3}");
    assert(tex.includes("=") && tex.trim().endsWith("\\frac{8}{3}"), `= valor: ${tex}`);
  });
});

describe("Integral definida: área con signo y clasificación (areaBajoRama)", () => {
  // Construye la FuncionReal por la MISMA ruta que grafica el motor.
  const fr = (expr: string) => crearFuncionReal(insertarProductoImplicito(normalizarEntrada(expr)));
  const valor = (r: ReturnType<typeof areaDefinida>) => (r.tipo === "valor" ? r.valor : NaN);

  test("polinomio regular: ∫₀² x² dx = 8/3", () => {
    const r = areaDefinida(fr("x^2"), 0, 2);
    igual(r.tipo, "valor", "es un valor");
    aprox(valor(r), 8 / 3, 1e-6, "8/3");
    assert(r.tipo === "valor" && !r.impropia, "no impropia");
  });

  test("área con signo: ∫₀^π sin(x) dx = 2, ∫₀^{2π} sin = 0", () => {
    aprox(valor(areaDefinida(fr("sin(x)"), 0, Math.PI)), 2, 1e-6, "= 2");
    aprox(valor(areaDefinida(fr("sin(x)"), 0, 2 * Math.PI)), 0, 1e-6, "= 0 (se cancela)");
  });

  test("cancelación por signo: ∫₋₁¹ x³ dx = 0 (raíz interior, no polo)", () => {
    const r = areaDefinida(fr("x^3"), -1, 1);
    igual(r.tipo, "valor", "raíz en 0 no confunde con polo");
    aprox(valor(r), 0, 1e-9, "= 0");
  });

  test("intervalo orientado: ∫₂⁰ x² dx = −8/3", () => {
    aprox(valor(areaDefinida(fr("x^2"), 2, 0)), -8 / 3, 1e-6, "signo invertido");
  });

  test("a == b → 0", () => {
    igual(valor(areaDefinida(fr("x^2"), 3, 3)), 0, "intervalo nulo");
  });

  test("polo INTERIOR con cambio de signo: ∫₋₁¹ 1/x → divergente", () => {
    const r = areaDefinida(fr("1/x"), -1, 1);
    igual(r.tipo, "etiqueta", "etiquetada");
    igual((r as any).etiqueta, ETIQUETA_DIVERGENTE.etiqueta, "Integral divergente");
  });

  test("polo interior del MISMO signo (off-grid): ∫₀¹ 1/(x-0.5)^2 → divergente", () => {
    igual(areaDefinida(fr("1/(x-0.5)^2"), 0, 1).tipo, "etiqueta", "pico detectado");
  });

  test("singularidad en extremo DIVERGENTE: ∫₀¹ 1/x^2 y ∫₀¹ 1/x", () => {
    igual((areaDefinida(fr("1/x^2"), 0, 1) as any).etiqueta, ETIQUETA_DIVERGENTE.etiqueta, "1/x² diverge");
    igual((areaDefinida(fr("1/x"), 0, 1) as any).etiqueta, ETIQUETA_DIVERGENTE.etiqueta, "1/x diverge (log)");
  });

  test("impropia CONVERGENTE: ∫₀¹ 1/√x dx = 2 (marcada impropia)", () => {
    const r = areaDefinida(fr("1/sqrt(x)"), 0, 1);
    igual(r.tipo, "valor", "converge");
    aprox(valor(r), 2, 5e-3, "≈ 2 (aproximado)");
    assert(r.tipo === "valor" && r.impropia, "marcada impropia");
  });

  test("intervalo fuera del dominio: ∫₀^4 √(x−1) dx → Fuera de dominio", () => {
    igual((areaDefinida(fr("sqrt(x-1)"), 0, 4) as any).etiqueta, ETIQUETA_FUERA_DOMINIO.etiqueta, "hueco interior");
  });

  test("límites no numéricos → etiqueta", () => {
    igual((areaDefinida(fr("x^2"), NaN, 2) as any).etiqueta, ETIQUETA_LIMITES.etiqueta, "a no finito");
  });

  test("recortarRegion: recorta la polilínea a [a,b] con puntos de corte interpolados", () => {
    // Recta y=x muestreada en x∈[-5,5]; recorte a [0,2].
    const puntos: number[] = [];
    for (let i = -5; i <= 5; i++) puntos.push(i, i);
    const rama = { puntos: Float64Array.from(puntos), cerrada: false, calidad: "exacta" as const, objetoId: "t" };
    const regs = recortarRegion([rama], 0, 2);
    assert(regs.length === 1, `un tramo continuo, obtuve ${regs.length}`);
    const r = regs[0];
    aprox(r[0], 0, 1e-9, "empieza en x=0");
    aprox(r[r.length - 2], 2, 1e-9, "acaba en x=2");
    for (let i = 0; i < r.length; i += 2) assert(r[i] >= -1e-9 && r[i] <= 2 + 1e-9, `x en [0,2]: ${r[i]}`);
  });
});

describe("Integral definida: relleno de la región (dibujarRegion + Escena)", () => {
  // ctx grabador: registra cada relleno y cada trazo (color, punteado y vértices de
  // pantalla). `restore()` apaga el dash como aproximación del stack real de Canvas:
  // el tramado lo activa dentro de su save/restore, los bordes trazan sin dash.
  function ctxGrabador() {
    const rellenos: { color: string; puntos: [number, number][] }[] = [];
    const trazos: { color: string; dash: boolean; puntos: [number, number][] }[] = [];
    let cur: [number, number][] = [];
    let fill = "", stroke = "", dash = false;
    const ctx = {
      save() {}, restore() { dash = false; }, beginPath() { cur = []; }, closePath() {}, clip() {},
      moveTo(x: number, y: number) { cur.push([x, y]); },
      lineTo(x: number, y: number) { cur.push([x, y]); },
      set fillStyle(v: string) { fill = v; }, get fillStyle() { return fill; },
      set strokeStyle(v: string) { stroke = v; }, get strokeStyle() { return stroke; },
      fill() { rellenos.push({ color: fill, puntos: cur.slice() }); },
      stroke() { trazos.push({ color: stroke, dash, puntos: cur.slice() }); },
      arc() {}, set lineWidth(_v: number) {},
      set lineJoin(_v: string) {}, setLineDash(d: number[]) { dash = d.length > 0; },
    } as unknown as CanvasRenderingContext2D;
    return { ctx, rellenos, trazos };
  }

  // Rama y=f(x) muestreada en [x0,x1] (paso fino), como Float64Array intercalado.
  const ramaDe = (f: (x: number) => number, x0: number, x1: number, n = 200) => {
    const p: number[] = [];
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; p.push(x, f(x)); }
    return { puntos: Float64Array.from(p), cerrada: false, calidad: "exacta" as const, objetoId: "t" };
  };
  const vp = crearViewport([-5, 5], [-5, 5], 400, 400, 1);

  test("f>0 en todo [a,b]: un solo relleno POSITIVO que baja al eje", () => {
    const { ctx, rellenos } = ctxGrabador();
    const regs = recortarRegion([ramaDe((x) => x * x, -5, 5)], 0, 2);
    new RendererCanvas2D(ctx).dibujarRegion(regs, vp);
    igual(rellenos.length, 1, "un tramo");
    igual(rellenos[0].color, RELLENO_POSITIVO, "tinte positivo");
    const ejeY = 200; // y=0 → centro del lienzo 400px
    aprox(rellenos[0].puntos[0][1], ejeY, 1e-6, "empieza en el eje");
    aprox(rellenos[0].puntos[rellenos[0].puntos.length - 1][1], ejeY, 1e-6, "termina en el eje");
  });

  test("cambio de signo: dos rellenos (negativo y positivo) partidos en y=0", () => {
    const { ctx, rellenos } = ctxGrabador();
    const regs = recortarRegion([ramaDe((x) => x * x * x, -3, 3)], -1, 1);
    new RendererCanvas2D(ctx).dibujarRegion(regs, vp);
    igual(rellenos.length, 2, "dos tramos de signo");
    const colores = rellenos.map((r) => r.color);
    assert(colores.includes(RELLENO_POSITIVO) && colores.includes(RELLENO_NEGATIVO), "ambos tintes");
  });

  test("tramado diagonal sólido anclado al mundo + bordes verticales en a y b", () => {
    const { ctx, rellenos, trazos } = ctxGrabador();
    const regs = recortarRegion([ramaDe((x) => x * x, -5, 5)], 0, 2);
    new RendererCanvas2D(ctx).dibujarRegion(regs, vp);
    igual(rellenos.length, 1, "un relleno");
    const tramas = trazos.filter((t) => t.color === TRAMA_POSITIVA);
    igual(tramas.length, 1, "hay tramado frío (f>0), en un solo stroke");
    assert(!tramas[0].dash, "el tramado es SÓLIDO, no punteado");
    const bordes = trazos.filter((t) => t.color === BORDE_REGION);
    igual(bordes.length, 2, "dos bordes (a y b)");
    // Vista [-5,5]→400px (40 px/unidad, eje en 200): el borde de b=2 es la vertical
    // x=280 del eje (y=200) a la curva (y=4 → 40px). El de a=0 degenera a un punto.
    const b = bordes[1];
    aprox(b.puntos[0][0], 280, 1e-6, "x de pantalla del borde b");
    aprox(b.puntos[0][1], 200, 1e-6, "arranca en el eje");
    aprox(b.puntos[1][1], 40, 1e-6, "termina en la curva (y=4)");
  });

  test("el tramado acompaña al pan: panear la vista TRASLADA las diagonales", () => {
    // Misma región en dos encuadres desplazados 0.1 unidades en x (= 4 px con la vista
    // [-5,5]→400px). Las diagonales xPx+yPx=c van ancladas al MUNDO: su fase debe
    // correrse esos 4 px (c baja 4), no quedarse quieta en pantalla.
    const trama = (vista: ReturnType<typeof crearViewport>) => {
      const { ctx, trazos } = ctxGrabador();
      const regs = recortarRegion([ramaDe((x) => x * x, -5, 5)], 0, 2);
      new RendererCanvas2D(ctx).dibujarRegion(regs, vista);
      return trazos.find((t) => t.color === TRAMA_POSITIVA)!;
    };
    const a = trama(crearViewport([-5, 5], [-5, 5], 400, 400, 1));
    const b = trama(crearViewport([-4.9, 5.1], [-5, 5], 400, 400, 1));
    // Fase de la familia: c = xPx+yPx de cualquier vértice, módulo el paso (12 px).
    const fase = (t: typeof a) => (((t.puntos[0][0] + t.puntos[0][1]) % 12) + 12) % 12;
    const esperado = (fase(a) + 8) % 12; // c se corre −4 px ≡ +8 (mód 12)
    aprox(fase(b), esperado, 1e-6, "la fase del tramado se traslada con el mundo");
  });

  test("Escena.fijarIntegral cachea la región recortada en actualizar", () => {
    const ctxNulo = null as unknown as CanvasRenderingContext2D;
    const escena = new Escena(construirObjetosEscena("x^2"),
      new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo));
    escena.fijarIntegral(0, 2);
    escena.actualizar(vp, "final");
    const regs = escena.regionesIntegral();
    assert(regs.length >= 1, "hay región cacheada");
    for (const poly of regs)
      for (let i = 0; i < poly.length; i += 2)
        assert(poly[i] >= -1e-6 && poly[i] <= 2 + 1e-6, `x recortada a [0,2]: ${poly[i]}`);
  });
});

describe("Integral definida: fachada del panel (evaluarArea + cuerpoAreaLatex)", () => {
  test("evaluarArea de la notación LaTeX: ∫₀² x² dx ≈ 8/3", () => {
    const r = evaluarArea("\\int_{0}^{2}x^{2}\\,dx");
    igual(r!.tipo, "valor", "es un valor");
    aprox((r as any).valor, 8 / 3, 1e-6, "8/3");
  });

  test("evaluarArea divergente: ∫₋₁¹ 1/x dx → etiqueta", () => {
    igual(evaluarArea("\\int_{-1}^{1} 1/x \\, dx")!.tipo, "etiqueta", "divergente");
  });

  test("evaluarArea con límites simbólicos → etiqueta (límites no numéricos)", () => {
    igual(evaluarArea("\\int_{a}^{b} x^2 \\, dx")!.tipo, "etiqueta", "a,b simbólicos");
  });

  test("evaluarArea de un bloque sin integral → null", () => {
    igual(evaluarArea("x^2"), null, "sin \\int");
  });

  test("cuerpoAreaLatex: entero exacto usa '=', impropia usa '\\approx'", () => {
    const exacto = cuerpoAreaLatex({ tipo: "valor", valor: 2, impropia: false });
    igual(exacto.conector, "=", "exacto con =");
    igual(exacto.cuerpo, "2", "entero limpio");
    const impropia = cuerpoAreaLatex({ tipo: "valor", valor: 1.9998, impropia: true });
    igual(impropia.conector, "\\approx", "impropia con ≈");
    const etiqueta = cuerpoAreaLatex({ tipo: "etiqueta", etiqueta: "Integral divergente", detalle: "x" });
    assert(etiqueta.cuerpo.includes("\\text{Integral divergente}"), "etiqueta como \\text");
  });

  test("integralValorLatex respeta el conector (= vs \\approx)", () => {
    const tex = integralValorLatex("\\int_{0}^{1} 1/sqrt(x) \\, dx", "2", "\\approx");
    assert(tex.includes("\\approx 2"), `usa ≈: ${tex}`);
  });
});

describe("Integral definida: primitiva simbólica (integrarExpr + Barrow)", () => {
  const integrandoF = (expr: string) => crearFuncionReal(insertarProductoImplicito(normalizarEntrada(expr)));
  const areaNum = (expr: string, a: number, b: number) => {
    const r = areaDefinida(integrandoF(expr), a, b);
    return r.tipo === "valor" ? r.valor : NaN;
  };
  // Teorema fundamental del cálculo: la primitiva hallada F debe cumplir F(b)−F(a) = ∫ₐᵇ f.
  // Se compara contra el área numérica (Simpson adaptativo), un cómputo INDEPENDIENTE: si mi
  // primitiva fuera errónea, no cuadraría. Es el mismo espíritu que la guarda de `integrarExpr`,
  // pero comprobado desde fuera y de punta a punta.
  const barrowNum = (expr: string, a: number, b: number) => {
    const P = integrarExpr(expr);
    assert(P !== null, `hay primitiva de ${expr}`);
    const F = crearFuncionReal(P!); // P ya es un string mathjs limpio
    return (F.eval(b) as number) - (F.eval(a) as number);
  };

  test("TFC: F(b)−F(a) coincide con el área numérica en todo el repertorio cubierto", () => {
    const casos: [string, number, number][] = [
      ["1/x", 1, 3], ["x", 0, 2], ["x^2", 0, 2], ["3x^2+2x", -1, 2],
      ["sin(x)", 0, Math.PI], ["cos(2x)", 0, 1], ["e^x", 0, 1], ["e^{3x}", 0, 0.5],
      ["(2x+1)^5", 0, 1], ["1/(1+x^2)", -1, 1], ["1/(x^2+4)", 0, 2], ["1/x^2", 1, 4],
      ["sqrt(x)", 0, 4], ["1/(3x+1)", 0, 2], ["x^3-2x", -1, 2], ["tan(x)", 0, 1],
      ["2^x", 0, 2],
    ];
    for (const [expr, a, b] of casos)
      aprox(barrowNum(expr, a, b), areaNum(expr, a, b), 1e-5, `∫ ${expr} en [${a},${b}]`);
  });

  test("linealidad y sustitución lineal: sumas y f(ax+b) se integran término a término", () => {
    // La derivada NUMÉRICA de la primitiva reproduce el integrando (guarda de integrarExpr).
    for (const expr of ["sin(x)+cos(x)", "cos(3x-1)", "e^{-x}", "(5-2x)^3"]) {
      const P = integrarExpr(expr);
      assert(P !== null, `hay primitiva de ${expr}`);
      const f = integrandoF(expr), F = crearFuncionReal(P!), h = 1e-6;
      for (const x of [-0.7, 0.4, 1.1]) {
        const dNum = ((F.eval(x + h) as number) - (F.eval(x - h) as number)) / (2 * h);
        aprox(dNum, f.eval(x) as number, 1e-4, `F'(${x}) = ${expr}`);
      }
    }
  });

  test("fuera de alcance del integrador → null (mejor ninguna que una incorrecta)", () => {
    // Sin primitiva ELEMENTAL o fuera del repertorio: se devuelve null y el panel cae al valor.
    for (const expr of ["x*sin(x)", "1/(x^2+x+1)", "ln(x)", "x^x", "sin(x^2)", "e^{x^2}"])
      igual(integrarExpr(expr), null, `sin primitiva: ${expr}`);
  });

  test("Barrow LaTeX del ejemplo del usuario: ∫₂³ (1/x) dx → [ln|x|]₂³", () => {
    const tex = integralPrimitivaLatex("\\int_{2}^{3}\\frac{1}{x}\\,dx");
    assert(tex !== null, "hay primitiva");
    assert(/\\ln/.test(tex!) && /x/.test(tex!) && tex!.includes("|"), `ln y |x|: ${tex}`);
    assert(/\\left\[/.test(tex!) && /\\right\]_\{2\}\^\{3\}/.test(tex!), `corchete con límites 2..3: ${tex}`);
  });

  test("Barrow LaTeX: forma x²/2 y límites; integrando fuera de alcance → null", () => {
    const tex = integralPrimitivaLatex("\\int_{0}^{2}x\\,dx");
    assert(tex !== null && tex.includes("\\frac{x^{2}}{2}"), `primitiva x²/2: ${tex}`);
    igual(integralPrimitivaLatex("\\int_{0}^{1} x \\sin(x) \\, dx"), null, "x·sin(x) sin primitiva → null");
    igual(integralPrimitivaLatex("x^2"), null, "sin integral reconocible → null");
  });

  test("valor EXACTO del área vía Barrow: fracción, ln, π y radical (no decimal)", () => {
    const casos: [string, string, string][] = [
      ["\\int_{0}^{2}x^{2}\\,dx", "=", "\\frac{8}{3}"],
      ["\\int_{1}^{3}\\frac{1}{x}\\,dx", "=", "\\ln 3"],
      ["\\int_{0}^{\\pi}\\sin(x)\\,dx", "=", "2"],
      ["\\int_{-1}^{1}\\frac{1}{1+x^2}\\,dx", "=", "\\frac{\\pi}{2}"],
      ["\\int_{0}^{4}\\sqrt{x}\\,dx", "=", "\\frac{16}{3}"],
    ];
    for (const [s, conector, cuerpo] of casos) {
      const r = cuerpoAreaLatexExacto(s);
      igual(r.conector, conector, `conector de ${s}`);
      igual(r.cuerpo, cuerpo, `cuerpo de ${s}`);
    }
  });

  test("irracional sin forma cerrada → \\approx (∫₀¹ eˣ dx = e−1 ≈ 1.7183)", () => {
    const r = cuerpoAreaLatexExacto("\\int_{0}^{1}e^{x}\\,dx");
    igual(r.conector, "\\approx", "usa ≈");
    assert(r.cuerpo !== null && /1\.718/.test(r.cuerpo), `decimal e−1: ${r.cuerpo}`);
  });

  test("polo interior: Barrow NO se aplica, se respeta la divergencia", () => {
    // El panel no lleva valor NI etiqueta (`cuerpo === null`) — el diagnóstico va al PLANO;
    // lo que importa aquí es que NO se afirme el número que daría Barrow (F(1)−F(−1) = 0).
    const r = cuerpoAreaLatexExacto("\\int_{-1}^{1}\\frac{1}{x}\\,dx");
    igual(r.cuerpo, null, "sin valor en el panel: la integral diverge");
    igual(etiquetaIntegral("\\int_{-1}^{1}\\frac{1}{x}\\,dx")?.etiqueta, "Integral divergente",
      "la etiqueta existe, y es la que el host pinta sobre el plano");
  });

  test("sin primitiva simbólica: valor numérico honesto con \\approx (∫₀¹ x·sin x)", () => {
    const r = cuerpoAreaLatexExacto("\\int_{0}^{1} x \\sin(x) \\, dx");
    igual(r.conector, "\\approx", "sin primitiva ⇒ aproximado");
  });
});

describe("Derivada de exponencial base≠e: \\ln k simbólico, no decimal (regresión 3^x)", () => {
  test("d/dx 3^x = 3^x·ln 3 (grafica y LaTeX), sin decimal que rompa el render", () => {
    const g = derivarExpr("3^x");
    assert(g !== null && /log\(3, ?e\)/.test(g), `el string graficado usa log(3, e): ${g}`);
    assert(!/1\.0986/.test(g!), `sin el decimal de ln 3: ${g}`);
    const tex = derivadaLatex(["3^x"]);
    // La función desnuda `\ln 3` acompaña una POTENCIA (`3^x`): se parentiza para acotar el
    // argumento junto al superíndice → `3^{x}\left(\ln 3\right)` (política de latex.ts).
    assert(/3\^\{x\}\\left\(\\ln 3\\right\)/.test(tex), `LaTeX = 3^{x}\\left(\\ln 3\\right): ${tex}`);
    assert(!/1\.09/.test(tex), `el LaTeX no lleva el decimal roto: ${tex}`);
  });

  test("el valor graficado se conserva EXACTO: (3^x·ln 3) en x=1 = 3·ln 3", () => {
    const F = crearFuncionReal(derivarExpr("3^x")!);
    aprox(F.eval(1) as number, 3 * Math.log(3), 1e-9, "d/dx 3^x en x=1");
  });

  test("un coeficiente numérico normal NO se re-simboliza: d/dx 2·sin x = 2 cos x", () => {
    assert(/2\\cos x/.test(derivadaLatex(["2*sin(x)"])), "2 cos x intacto (2 no es ln k)");
  });
});

// ─────────────────────────────────────────────
// Panel ⓘ de obs-derivate (analisisDerivada)
// ─────────────────────────────────────────────
//
// El cuadro describe a f leída en f′: pendiente en el origen, críticos CLASIFICADOS,
// crecimiento, inflexiones y puntos angulosos. Los tres primeros grupos son los que el
// panel viejo daba como "intersección Y / raíces / vértices" DE f′.
describe("Panel ⓘ de derivadas (analisisDerivada)", () => {
  const ev = (expr: string) => {
    const c = compilarFuncion(insertarProductoImplicito(normalizarEntrada(expr)), "x");
    return (x: number) => { const v = c(x); return typeof v === "number" ? v : NaN; };
  };
  // Analiza la f ESCRITA con la derivada que produce el propio bloque: la misma pareja
  // (f, f′) que vería el panel, no una derivada escrita a mano en el test.
  const an = (fExpr: string) => {
    const d = derivarExpr(insertarProductoImplicito(normalizarEntrada(fExpr)));
    assert(d !== null, `hay derivada de ${fExpr}`);
    return analizarDerivada(ev(fExpr), ev(d!));
  };
  const tramo = (A: ReturnType<typeof an>, i: number) => A.monotonia![i];

  test("ejemplo del cubo: x³−3x da máximo, mínimo, tres tramos e inflexión", () => {
    const A = an("x^3-3x");
    aprox(A.pendienteEn0!, -3, 1e-9, "f′(0) = −3");
    igual(A.criticos.length, 2, "dos críticos");
    aprox(A.criticos[0].x, -1, 1e-6, "en −1");
    igual(A.criticos[0].tipo, "maximo", "máximo local (f′ pasa de + a −)");
    aprox(A.criticos[1].x, 1, 1e-6, "en 1");
    igual(A.criticos[1].tipo, "minimo", "mínimo local");
    igual(A.monotonia!.length, 3, "tres tramos");
    igual(tramo(A, 0).a, -Infinity, "el primero llega desde −∞");
    igual(tramo(A, 0).creciente, true, "creciente");
    igual(tramo(A, 1).creciente, false, "decreciente en medio");
    igual(tramo(A, 2).b, Infinity, "el último llega a ∞");
    igual(A.inflexiones.length, 1, "una inflexión");
    aprox(A.inflexiones[0], 0, 1e-6, "en 0");
    igual(A.acotadoPorRango, false, "nada queda fuera del muestreo");
  });

  test("x³: punto estacionario que NO es extremo, y crecimiento en todo ℝ", () => {
    const A = an("x^3");
    igual(A.criticos.length, 1, "un crítico");
    igual(A.criticos[0].tipo, "estacionario", "f′ no cambia de signo: no es extremo");
    igual(A.monotonia!.length, 1, "un solo tramo");
    igual(tramo(A, 0).a, -Infinity, "desde −∞");
    igual(tramo(A, 0).b, Infinity, "hasta ∞ (los dos extremos, no uno)");
    aprox(A.inflexiones[0], 0, 1e-6, "inflexión en 0");
  });

  test("|x|: esquina, no un mínimo suave, y f′ que no existe ahí", () => {
    const A = an("abs(x)");
    igual(A.criticos.length, 1, "un crítico");
    aprox(A.criticos[0].x, 0, 1e-6, "en 0");
    igual(A.criticos[0].tipo, "esquina", "manda la FORMA, no el cambio de signo");
    igual(A.noDerivables!.length, 1, "un punto no derivable");
    aprox(A.noDerivables![0], 0, 1e-6, "en 0");
    igual(A.pendienteEn0, null, "en 0 no hay pendiente que dar");
    igual(A.monotonia!.length, 2, "decrece y crece");
  });

  test("√|x|: cúspide (los laterales DIVERGEN), no una esquina", () => {
    const A = an("sqrt(abs(x))");
    igual(A.criticos.length, 1, "un crítico");
    igual(A.criticos[0].tipo, "cuspide", "pendientes ±∞ de signos opuestos");
    igual(A.noDerivables!.length, 1, "y no es derivable ahí");
  });

  test("|x²−1|: dos esquinas y un máximo entre ellas", () => {
    const A = an("abs(x^2-1)");
    igual(A.criticos.length, 3, "−1, 0, 1");
    igual(A.criticos[0].tipo, "esquina", "−1 es esquina");
    igual(A.criticos[1].tipo, "maximo", "0 es máximo local");
    igual(A.criticos[2].tipo, "esquina", "1 es esquina");
    igual(A.noDerivables!.length, 2, "solo las esquinas son no derivables");
  });

  test("todo se enmascara por el DOMINIO de f: ln x no decrece en x<0", () => {
    // f′ = 1/x evalúa en x = −2, donde ln x no existe. Sin la máscara, el panel
    // anunciaba "decreciente en (−∞,0)" de una función que ahí no está.
    const A = an("ln(x)");
    igual(A.monotonia!.length, 1, "un único tramo");
    aprox(tramo(A, 0).a, 0, 1e-6, "empieza en 0 (borde del dominio, refinado)");
    igual(tramo(A, 0).b, Infinity, "y sigue hasta ∞");
    igual(tramo(A, 0).creciente, true, "creciente");
    igual(A.pendienteEn0, null, "0 no está en el dominio: sin pendiente");
    igual(A.criticos.length, 0, "sin críticos");
  });

  test("e^x: el sondeo no confunde el subdesbordamiento con un cambio de signo", () => {
    // f′ = e^x vale 0 en coma flotante mucho antes de 1e16; tomarlo por contraejemplo
    // dejaba a la exponencial "creciente en (−10, 10)".
    const A = an("e^{x}");
    igual(A.monotonia!.length, 1, "un tramo");
    igual(tramo(A, 0).a, -Infinity, "desde −∞");
    igual(tramo(A, 0).b, Infinity, "hasta ∞");
  });

  // ── Lo que el panel NO debe decir ─────────────────────────────────────────────
  test("1/x NO tiene esquinas: junto al polo f′ es empinada, no discontinua", () => {
    // La pendiente pasa de −2500 a −2497 entre muestras vecinas y el filtro barato se
    // dispara; el veredicto por límites laterales a dos escalas es quien lo descarta.
    const A = an("1/x");
    igual(A.noDerivables!.length, 0, "ninguna esquina inventada alrededor del polo");
    igual(A.criticos.length, 0, "y ningún crítico");
    igual(A.monotonia!.length, 2, "dos ramas, las dos decrecientes");
    igual(tramo(A, 0).creciente, false, "decreciente");
    igual(tramo(A, 1).creciente, false, "decreciente");
    igual(A.pendienteEn0, null, "en el polo no hay pendiente");
  });

  test("una oscilante no produce puntos angulosos ni tramos ilegibles", () => {
    const A = an("sin(x)");
    igual(A.noDerivables!.length, 0, "f′ salta entre muestras, pero es derivable");
    igual(A.monotonia, null, "siete tramos no son un párrafo que se lea");
    assert(A.criticos.length >= 3, "los críticos existen (el panel los resume como infinitos)");
  });

  test("f′ que no evalúa a un lado NO es una cúspide detectada (x^{2/3})", () => {
    // f′ = (2/3)x^(−1/3) es NaN para x<0 en este motor: no hay con qué mirar ese lado,
    // así que no se afirma nada de x = 0 en vez de inventarse un punto por muestra.
    const A = an("x^{2/3}");
    igual(A.noDerivables!.length, 0, "sin puntos inventados");
    igual(A.criticos.length, 0, "sin críticos inventados");
  });

  test("lo que pasa fuera del muestreo se anuncia, no se da por inexistente", () => {
    // x³−1000x tiene sus extremos en ±18,3: fuera de [−10,10]. El tramo muere en el
    // borde sin poder llegar a ∞ y eso es justo la señal de que falta información.
    const A = an("x^3-1000x");
    igual(A.acotadoPorRango, true, "se avisa del rango analizado");
    igual(A.criticos.length, 0, "no se listan los que no se han visto");
    const B = an("x^2");
    igual(B.acotadoPorRango, false, "y no se avisa cuando no hace falta");
  });

  test("función constante: sin críticos, sin tramos, sin nada que inventar", () => {
    const A = an("5");
    igual(A.criticos.length, 0, "f′ ≡ 0 no son puntos críticos, es un tramo entero");
    igual(A.monotonia!.length, 0, "ni crece ni decrece");
    igual(A.inflexiones.length, 0, "sin inflexiones");
    igual(A.pendienteEn0, 0, "la pendiente sí existe y vale 0");
  });

  test("campana 1/(x²+1): máximo en 0 e inflexiones en ±1/√3", () => {
    const A = an("1/(x^2+1)");
    igual(A.criticos.length, 1, "un crítico");
    igual(A.criticos[0].tipo, "maximo", "máximo en 0");
    igual(A.inflexiones.length, 2, "dos inflexiones");
    aprox(A.inflexiones[0], -1 / Math.sqrt(3), 1e-3, "−1/√3");
    aprox(A.inflexiones[1], 1 / Math.sqrt(3), 1e-3, "1/√3");
  });
});

// ─────────────────────────────────────────────
// Panel ⓘ de obs-integral (analisisIntegral)
// ─────────────────────────────────────────────
//
// El cuadro describe la OPERACIÓN, no la curva del integrando: intervalo, valor, qué es
// ese valor (área o diferencia de áreas) y valor medio. Se prueba el análisis, que es
// donde vive todo lo que se puede afirmar de más; el ensamblado de líneas es del host.
//
// El último bloque de tests es el importante: comprueba lo que el panel NO debe decir.
describe("Panel ⓘ de integrales definidas (analisisIntegral)", () => {
  const integrando = (expr: string) => crearFuncionReal(insertarProductoImplicito(normalizarEntrada(expr)));
  const an = (expr: string, a: number, b: number) => analizarIntegral(integrando(expr), a, b);

  test("integral positiva: el valor ES el área, sin descomponer nada", () => {
    const A = an("2x", 0, 2)!;
    assert(A !== null, "hay análisis");
    aprox(A.valor, 4, 1e-9, "∫₀² 2x dx = 4");
    igual(A.signo, 1, "el integrando no baja del eje");
    igual(A.cruces!.length, 0, "no cruza");
    igual(A.areaPositiva, null, "sin cruces no se descompone: sería repetir el valor");
    igual(A.areaNegativa, null, "ídem");
    igual(A.impropia, false, "propia");
    igual(A.invertido, false, "límites en orden");
  });

  test("valor medio: ∫ₐᵇf/(b−a), y solo con intervalo no degenerado", () => {
    aprox(an("2x", 0, 2)!.promedio!, 2, 1e-9, "media de 2x en [0,2] = 2");
    aprox(an("x^2", 0, 2)!.promedio!, 4 / 3, 1e-6, "media de x² en [0,2] = 4/3");
    igual(an("x^2", 3, 3)!.promedio, null, "intervalo nulo: no hay media (sería 0/0)");
  });

  test("cambio de signo: cruces localizados y áreas que SUMAN el valor", () => {
    const A = an("x", -1, 1)!;
    aprox(A.valor, 0, 1e-9, "∫₋₁¹ x dx = 0");
    igual(A.signo, null, "cruza: no hay signo constante");
    igual(A.cruces!.length, 1, "un cruce");
    aprox(A.cruces![0], 0, 1e-9, "en x = 0");
    aprox(A.areaPositiva!, 0.5, 1e-6, "área positiva 1/2");
    aprox(A.areaNegativa!, -0.5, 1e-6, "área negativa −1/2");
    aprox(A.areaPositiva! + A.areaNegativa!, A.valor, 1e-6, "las dos suman el valor");
  });

  test("varios cruces: x³−x en [−2,2] parte en cuatro trozos", () => {
    const A = an("x^3-x", -2, 2)!;
    igual(A.cruces!.length, 3, "cruza en −1, 0, 1");
    aprox(A.cruces![0], -1, 1e-6, "−1");
    aprox(A.cruces![1], 0, 1e-6, "0");
    aprox(A.cruces![2], 1, 1e-6, "1");
    aprox(A.areaPositiva!, 2.5, 1e-5, "área sobre el eje 5/2");
    aprox(A.areaNegativa!, -2.5, 1e-5, "área bajo el eje −5/2");
  });

  test("integrando siempre negativo: signo −1 (el valor NO es el área)", () => {
    const A = an("-x^2", -1, 1)!;
    igual(A.signo, -1, "la curva se queda bajo el eje");
    aprox(A.valor, -2 / 3, 1e-6, "−2/3");
    igual(A.areaPositiva, null, "sin cruces, sin descomposición");
  });

  test("impropia convergente: se marca y se dice en qué extremo", () => {
    const A = an("1/sqrt(x)", 0, 1)!;
    igual(A.impropia, true, "singularidad en un extremo");
    igual(A.singularidades.length, 1, "una");
    aprox(A.singularidades[0], 0, 1e-12, "en x = 0");
    aprox(A.valor, 2, 1e-3, "≈ 2 (valor aproximado por encogimiento de ε)");
  });

  test("impropia sin primitiva: el panel redondea a la precisión que tiene, con ≈", () => {
    // ∫₀⁴dx/√x = 4, pero el método converge a 1e-4 y se leía "≈ 3.9996": cuatro decimales
    // de los que el último es ruido. Ver `cuerpoAreaExactoBase`.
    const r = cuerpoAreaLatexExacto("\\int_{0}^{4} \\frac{1}{\\sqrt{x}} \\, dx");
    igual(r.cuerpo, "4", "se redondea a 4");
    igual(r.conector, "\\approx", "sin dejar de ser aproximado");
    // Con primitiva (x^{-0.5} sí la tiene) Barrow da el valor EXACTO: la tolerancia de
    // consistencia se afloja en las impropias, que si no rechazaban siempre la primitiva.
    const exacto = cuerpoAreaLatexExacto("\\int_{0}^{1} x^{-0.5} \\, dx");
    igual(exacto.cuerpo, "2", "= 2 exacto");
    igual(exacto.conector, "=", "por Barrow, no aproximado");
  });

  test("límites al revés: se marca, y las áreas siguen siendo las del DIBUJO", () => {
    const A = an("x^2", 2, 0)!;
    igual(A.invertido, true, "a > b");
    aprox(A.valor, -8 / 3, 1e-6, "∫₂⁰x²dx = −8/3");
    aprox(A.promedio!, 4 / 3, 1e-6, "la media no cambia de signo (numerador y denominador sí)");
  });

  test("intervalo degenerado (a = b): la integral es 0 y no hay región que describir", () => {
    const A = an("x^2", 3, 3)!;
    igual(A.valor, 0, "0 por definición");
    igual(A.signo, null, "sin signo que afirmar");
    igual(A.areaPositiva, null, "sin áreas");
    igual(A.promedio, null, "sin media");
  });

  // ── Lo que el panel NO debe decir ─────────────────────────────────────────────
  test("tocar el eje sin cruzarlo NO es un cambio de signo (x² en [−1,1])", () => {
    const A = an("x^2", -1, 1)!;
    igual(A.cruces!.length, 0, "x² toca el 0 pero no cambia de signo");
    igual(A.signo, 1, "sigue siendo positiva");
    igual(A.areaPositiva, null, "y no se descompone nada");
  });

  test("demasiados cruces: se calla el conteo en vez de dar un número que no cabe", () => {
    const A = an("sin(x)", 0, 10 * Math.PI)!;
    igual(A.cruces, null, "9 cruces: más de los que el cuadro enumera");
    igual(A.signo, null, "tampoco se afirma un signo constante");
    igual(A.areaPositiva, null, "sin partición fiable, sin áreas");
  });

  test("integrando idénticamente nulo: signo 0, no un signo inventado", () => {
    const A = an("0", 0, 1)!;
    igual(A.signo, 0, "ni positivo ni negativo");
    igual(A.valor, 0, "valor 0");
  });

  test("sin número honesto no hay análisis: divergente y límites no finitos → null", () => {
    igual(an("1/x", -1, 1), null, "∫₋₁¹dx/x diverge (ya lo etiqueta el velo)");
    igual(an("sqrt(x-1)", 0, 4), null, "hueco del dominio dentro del intervalo");
    igual(an("x^2", NaN, 2), null, "límite no numérico");
  });

  test("la descomposición solo se publica si los trozos reconstruyen el total", () => {
    // Batería de integrandos con cruces: cuando hay áreas, tienen que cuadrar. Es la
    // invariante que impide publicar dos números plausibles de una partición equivocada.
    const casos: [string, number, number][] = [
      ["x", -1, 1], ["sin(x)", 0, 2 * Math.PI], ["x^3-x", -2, 2],
      ["x^2-1", -2, 2], ["cos(x)", 0, Math.PI], ["x-0.5", 0, 1],
    ];
    for (const [expr, a, b] of casos) {
      const A = an(expr, a, b)!;
      assert(A !== null, `hay análisis de ${expr}`);
      if (A.areaPositiva === null) continue;
      aprox(A.areaPositiva + A.areaNegativa!, A.valor, 1e-5, `${expr}: las áreas suman el valor`);
      assert(A.areaPositiva >= 0, `${expr}: el área positiva no es negativa`);
      assert(A.areaNegativa! <= 0, `${expr}: el área negativa no es positiva`);
    }
  });
});

// ─────────────────────────────────────────────
// Estrés: ninguna expresión puede colgar el hilo principal de Obsidian
// ─────────────────────────────────────────────
//
// Regresión del cuelgue del CORAZÓN `(x²+y²−1)³=x²y³`: `rationalize` (mathjs) expandía
// la potencia de forma naive y nunca terminaba → Obsidian se congelaba al RENDERIZAR el
// bloque, y volvía a congelarse al reabrir la nota (el bloque se re-renderiza al arrancar)
// → la única salida era borrar el .md. Una fórmula NUNCA debe poder inutilizar una nota.
//
// El banco recorre el pipeline COMPLETO que ejecuta el host al pintar un bloque (dividir →
// despejar → simplificar → geometría en las dos pasadas) y exige de cada curva difícil:
// que TERMINE, dentro de un presupuesto de tiempo, y con la geometría ACOTADA (memoria).
// Cualquier regresión que reintroduzca una expansión exponencial cuelga este test.
