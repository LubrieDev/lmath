// ─────────────────────────────────────────────
// tests · Carril: seguimiento de la cámara sobre la curva
// ─────────────────────────────────────────────
//
// Tangentes verticales, avance por longitud de arco, recorte por pendiente, rampa de
// verticalidad, rama vecina, los casos de integración A/B con `arnesCarril` y la
// derivada explosiva (`generarTicks` + centro acotado).
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { crearViewport } from "../../src/motor/scene/viewport-utils";
import {
  avanzarPorArco, factorRampaVerticalidad, existeRamaVecina, recortarRamasPorPendiente, PENDIENTE_CORTE_CARRIL, podarVerticesDePolo,
} from "../../src/motor/analysis/lecturaRama";
import { construirObjetosEscena } from "../../src/motor/app/composicion";
import type { Viewport, Rama, Punto } from "../../src/motor/contracts";
import { Escena } from "../../src/motor/scene/Escena";
import { Overlay, generarTicks } from "../../src/motor/rendering/overlay/Overlay";
import { RendererCanvas2D } from "../../src/motor/rendering/RendererCanvas2D";
import { Crosshair } from "../../src/motor/rendering/Crosshair";
import { Camara, centroCarrilAcotado } from "../../src/motor/interaction/Camara";
import { Navegacion } from "../../src/motor/interaction/Navegacion";

// ════════════════════════════════════════════════
// Carril SOBRE la curva en tramos casi verticales. Bug (2 iteraciones): en x³+y³=9
// la tangente vertical en (∛9, 0) hace que, a mucho zoom, el tramo trazado sea una
// ASTILLA de x más estrecha que un paso de A/D. (1º) railX la rebasaba, yEnCurva
// daba null y railY quedaba null PARA SIEMPRE (punto invisible, cámara perdida);
// (2º) conservar la última y dejaba el punto FLOTANDO fuera de la línea. Ahora el
// avance es por LONGITUD DE ARCO sobre la polilínea (avanzarPorArco): el punto se pega
// al borde del tramo y baja CABALGANDO la vertical, siempre sobre la curva.
// Se simula el bucle REAL de Navegacion+Camara con stubs de rAF/canvas/window.
describe("Carril: tangente vertical de x³+y³=9 (siempre sobre la curva)", () => {
  test("viajar → zoom-in profundo → cabalgar la vertical → zoom-out sigue en la línea", () => {
    const g = globalThis as Record<string, unknown>;
    if (!g.window) g.window = { devicePixelRatio: 1 };
    let pendiente: ((t: number) => void) | null = null;
    g.requestAnimationFrame = (g.window as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => { pendiente = cb; return 1; };
    g.cancelAnimationFrame = (g.window as Record<string, unknown>).cancelAnimationFrame = () => { pendiente = null; };

    const fakeCanvas = () => {
      const handlers: Record<string, (e: unknown) => void> = {};
      return {
        handlers, tabIndex: 0, style: {} as Record<string, string>,
        setCssStyles(s: Record<string, string>) { Object.assign(this.style, s); },
        focus() {}, addEventListener(tipo: string, fn: (e: unknown) => void) { handlers[tipo] = fn; },
        removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {},
      };
    };
    const cnvCam = fakeCanvas(), cnvNav = fakeCanvas();
    const ctxNulo = null as unknown as CanvasRenderingContext2D;
    const escena = new Escena(construirObjetosEscena("x^3+y^3=9"),
      new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo));
    const camara = new Camara(cnvCam as unknown as HTMLCanvasElement, 130,
      { onViewport: () => {}, onCursor: () => {} });
    camara.redimensionar(300);
    const nav = new Navegacion(cnvNav as unknown as HTMLCanvasElement, camara,
      {
        y: (x) => escena.yEnCurva(x),
        avanzarArco: (x, y, dPx, vp, recortar) => escena.avanzarArcoEnCurva(x, y, dPx, vp, recortar),
        hayVecina: (x, y, dir, vp) => escena.hayRamaVecinaCarril(x, y, dir, vp),
        tieneAsintotasVerticales: () => escena.tieneAsintotasVerticales(),
      },
      () => escena.actualizar(camara.viewport(), "interactiva"));

    let t = 0;
    const frame = (): boolean => {
      const cb = pendiente;
      if (!cb) return false;
      pendiente = null;
      t += 50;
      cb(t);
      return true;
    };
    const tecla = (k: string, abajo: boolean, shift = false) =>
      cnvNav.handlers[abajo ? "keydown" : "keyup"]({
        key: k, shiftKey: shift, preventDefault() {}, stopPropagation() {},
      });
    const semiY = () => (camara.viewport().domY[1] - camara.viewport().domY[0]) / 2;
    const yExacta = (x: number) => Math.cbrt(9 - x * x * x);

    nav.alternarCarril(); // punto en (0, ∛9), vista por defecto
    aprox(nav.railY ?? NaN, Math.cbrt(9), 0.05, "arranque: punto sobre la curva en x=0");

    // 1) A/D con Shift (precisión) hasta cerca de la tangente vertical, SIN
    //    pasarla (a velocidad normal un frame salta ~0.9 de mundo y la rebasaría).
    tecla("d", true, true);
    for (let i = 0; i < 500 && nav.railX < 2.0; i++) if (!frame()) break;
    tecla("d", false, true); frame();
    assert(nav.railX >= 2.0 && nav.railX < 2.08,
      `viajó hasta x=${nav.railX.toFixed(3)} (antes de la tangente en ∛9≈2.0801)`);

    // 2) Zoom-in profundo (W): la cámara sigue el punto; el tramo se vuelve astilla.
    tecla("w", true);
    for (let i = 0; i < 500 && semiY() > 0.06; i++) if (!frame()) break;
    tecla("w", false); frame();
    assert(semiY() <= 0.06, `zoom-in a semiY=${semiY().toFixed(3)}`);

    // 3) D de nuevo, hasta MUY pasada la tangente (x=2.5, donde la curva está en
    //    y≈−1.7, lejísimos de la vista de semiY=0.06): un paso de A/D excede la
    //    astilla, así que el punto debe PEGARSE al borde del tramo y CABALGAR la
    //    vertical frame a frame (cámara siguiéndolo), nunca flotar fuera de ella.
    tecla("d", true);
    for (let i = 0; i < 500 && nav.railX < 2.5; i++) if (!frame()) break;
    tecla("d", false); frame();
    assert(nav.railX >= 2.5, `cabalgó la vertical hasta railX=${nav.railX.toFixed(4)}`);
    assert(nav.railY !== null, "railY nunca se anula");
    aprox(nav.railY!, yExacta(nav.railX), 0.1,
      `el punto sigue SOBRE la curva: y=${nav.railY!.toFixed(4)} vs exacta ${yExacta(nav.railX).toFixed(4)}`);

    // 4) Zoom-out (S): sigue sobre la línea y dentro de la vista.
    tecla("s", true);
    for (let i = 0; i < 500 && semiY() < 3.5; i++) if (!frame()) break;
    tecla("s", false); frame();
    assert(nav.railY !== null && Number.isFinite(nav.railY), "railY finita tras el zoom-out");
    aprox(nav.railY!, yExacta(nav.railX), 0.05,
      `sobre la curva tras zoom-out: y=${nav.railY!.toFixed(4)} vs exacta ${yExacta(nav.railX).toFixed(4)}`);
    const vp = camara.viewport();
    assert(nav.railX >= vp.domX[0] && nav.railX <= vp.domX[1] &&
      nav.railY! >= vp.domY[0] && nav.railY! <= vp.domY[1],
      "el punto queda DENTRO de la vista (la cámara lo siguió)");

    nav.destruir();
    camara.destruir();
  });
});

// ════════════════════════════════════════════════
// El carril recorre por LONGITUD DE ARCO EN PANTALLA sobre la polilínea (no por x): así en
// una sección casi vertical avanza en y a ritmo uniforme y el punto NUNCA se sale de la línea
// (está siempre sobre un segmento trazado). `avanzarPorArco` es el primitivo puro.
describe("Carril: avance por longitud de arco (avanzarPorArco)", () => {
  // Viewport isótropo 10 px/unidad: aPantallaX(x)=x·10, aPantallaY(y)=100−y·10.
  const vp = { domX: [0, 10] as [number, number], domY: [0, 10] as [number, number], anchoPx: 100, altoPx: 100, dpr: 1 };
  const rama = (pts: number[]): Rama =>
    ({ puntos: Float64Array.from(pts), cerrada: false, calidad: "best-effort", objetoId: "id" });
  // Distancia EN PANTALLA entre dos puntos de mundo (para comprobar la velocidad uniforme).
  const distPx = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot((a.x - b.x) * 10, (a.y - b.y) * 10);

  test("recorre ~deltaPx EN PANTALLA sea cual sea la pendiente, siempre sobre la línea", () => {
    // Diagonal y=x: 10 px de arco desde (0,0) → un punto sobre la recta a 10 px en pantalla.
    const diag = avanzarPorArco([rama([0, 0, 10, 10])], 0, 0, 10, vp)!;
    aprox(distPx(diag, { x: 0, y: 0 }), 10, 1e-6, "diagonal: 10 px de arco en pantalla");
    aprox(diag.y, diag.x, 1e-9, "sigue sobre la recta y=x");
    // CASI VERTICAL (x va de 5 a 5.01, y de 0 a 10): 10 px de arco mueven ~1 en y y casi
    // nada en x — lo que el paso-por-x NO lograba (se disparaba). Punto sobre la línea.
    const vert = avanzarPorArco([rama([5, 0, 5.01, 10])], 5, 0, 10, vp)!;
    aprox(distPx(vert, { x: 5, y: 0 }), 10, 1e-6, "vertical: 10 px de arco en pantalla");
    aprox(vert.y, 1, 1e-3, "avanza en y (~1), no se dispara");
    assert(Math.abs(vert.x - 5) < 0.01, `x apenas cambia: ${vert.x}`);
  });

  test("re-proyecta sobre la curva (arco 0) y respeta la dirección del signo", () => {
    // deltaPx=0 desde un punto FUERA de la recta → el pie de perpendicular en pantalla (que
    // en y=x es el punto medio): re-proyección sobre la polilínea re-trazada.
    const proy = avanzarPorArco([rama([0, 0, 10, 10])], 3, 3.5, 0, vp)!;
    aprox(proy.x, 3.25, 1e-6, "re-proyección x");
    aprox(proy.y, 3.25, 1e-6, "re-proyección y");
    // Signo: −10 px retrocede (hacia −x en una rama x-creciente).
    const atras = avanzarPorArco([rama([0, 0, 10, 10])], 5, 5, -10, vp)!;
    assert(atras.x < 5 && atras.y < 5, `dirección − retrocede: (${atras.x}, ${atras.y})`);
  });

  test("se PEGA al borde al agotar la rama y SALTA el hueco a la rama vecina", () => {
    // Clamp: un avance enorme se queda en el extremo del tramo (la cámara lo seguiría).
    const borde = avanzarPorArco([rama([0, 0, 10, 10])], 0, 0, 1e6, vp)!;
    aprox(borde.x, 10, 1e-9, "clamp x en el borde");
    aprox(borde.y, 10, 1e-9, "clamp y en el borde");
    // Salto de hueco: dos ramas horizontales separadas (x∈[0,1] y x∈[3,4]). Desde (0.5,0),
    // 8 px de arco: 5 px agotan la 1ª rama (hasta x=1), el hueco se TELETRANSPORTA (no
    // consume arco) hasta x=3, y quedan 3 px → x=3.3. Como √(x²−1).
    const salto = avanzarPorArco([rama([0, 0, 1, 0]), rama([3, 0, 4, 0])], 0.5, 0, 8, vp)!;
    aprox(salto.x, 3.3, 1e-6, "saltó el hueco y avanzó el resto en la rama vecina");
    aprox(salto.y, 0, 1e-9, "sobre la rama vecina");
  });

  // Cruce de asíntota vertical (tan, sec, 1/x): al llegar al borde de la vista, el carril
  // debe SALTAR a la rama vecina por su EXTREMO OPUESTO (borde inferior), no re-trazarse sin
  // fin. Fixture: rama A casi vertical que ASCIENDE hasta el borde superior (y=10) en una
  // franja de x; rama B en franja de x DISJUNTA que NACE en el borde inferior (y=-10). Un
  // deltaPx grande hacia +x agota A, teletransporta el hueco y aterriza cerca del pie de B.
  test("cruza al borde opuesto de la rama vecina (salto de rama en asíntota vertical)", () => {
    const ramaA = rama([0, 0, 0.01, 10]);   // asciende: index 0 abajo, extremo superior en el borde
    const ramaB = rama([5, -10, 5.01, 0]);  // franja de x disjunta: index 0 (entrada +x) EN EL PIE
    // ~100px agotan A (llega al borde superior), el hueco no consume arco, 1px entra en B.
    const cruce = avanzarPorArco([ramaA, ramaB], 0, 0, 101, vp)!;
    assert(cruce.x > 4.9 && cruce.x < 5.1, `aterriza en la franja de B: x=${cruce.x}`);
    assert(cruce.y < -9, `aterriza en el EXTREMO INFERIOR de B (borde opuesto): y=${cruce.y}`);
  });

  test("SALTA los segmentos de longitud 0 (vértices duplicados) en vez de clavarse", () => {
    // Rama con un vértice DUPLICADO a mitad (como los que emite el trazador en las costuras
    // del refinado). Antes avanzarPorArco retornaba en ese segmento (L===0) → carril clavado.
    const conDuplicado = rama([0, 0, 5, 5, 5, 5, 10, 10]); // (5,5) repetido
    const r = avanzarPorArco([conDuplicado], 0, 0, 1e6, vp)!; // arco enorme → clamp al final
    aprox(r.x, 10, 1e-6, "atraviesa el duplicado y llega al final (no se clava en (5,5))");
    aprox(r.y, 10, 1e-6, "sobre la recta y=x");
  });
});

// ════════════════════════════════════════════════
// Recorte de ramas por PENDIENTE en pantalla (carril en asíntotas verticales). Sustituye al recorte
// por franja de vista: el criterio es GEOMÉTRICO y no depende del encuadre. Sin ningún recorte el
// carril camina el chorro del polo (la rama de tan(x) sube a y≈2·10⁷: arco ~1.6·10⁹ px, días de
// recorrido) y NUNCA alcanza el extremo para saltar a la vecina.
describe("Carril: recorte por pendiente (recortarRamasPorPendiente)", () => {
  const rama = (pts: number[]): Rama =>
    ({ puntos: Float64Array.from(pts), cerrada: false, calidad: "best-effort", objetoId: "id" });
  // Celdas 1:1 (px/unidad iguales en ambos ejes) → pendiente de pantalla = pendiente de mundo.
  const vpCuadrado = crearViewport([-10, 10], [-10, 10], 200, 200, 1);

  test("descarta los tramos casi verticales y conserva los recorribles", () => {
    // Sube suave (pend 1), se dispara (pend ~10⁶) y vuelve a bajar suave: solo quedan los extremos.
    const conChorro = rama([0, 0, 1, 1, 1.001, 1001, 1.002, 1, 2, 0]);
    const rec = recortarRamasPorPendiente([conChorro], vpCuadrado, PENDIENTE_CORTE_CARRIL);
    igual(rec.length, 2, "el chorro parte la rama en dos tramos recorribles");
    aprox(rec[0].puntos[rec[0].puntos.length - 1], 1, 1e-9, "el 1er tramo acaba donde empieza el chorro");
    aprox(rec[1].puntos[1], 1, 1e-9, "el 2º tramo arranca donde el chorro termina");
  });

  test("una rama enteramente suave queda intacta: el umbral es la PENDIENTE, no la y", () => {
    // y=x hasta y=100: pendiente 1 en todas partes, muy fuera de la vista. No se corta nada.
    const suave = rama([0, 0, 50, 50, 100, 100]);
    const rec = recortarRamasPorPendiente([suave], vpCuadrado, PENDIENTE_CORTE_CARRIL);
    igual(rec.length, 1, "no se corta por salirse de la vista, solo por empinarse");
    igual(rec[0].puntos.length, 6, "conserva todos los vértices");
  });

  test("un segmento VERTICAL puro (dx=0) se descarta sin dividir por cero", () => {
    const vertical = rama([0, 0, 0, 500, 1, 500]);
    const rec = recortarRamasPorPendiente([vertical], vpCuadrado, PENDIENTE_CORTE_CARRIL);
    igual(rec.length, 1, "solo sobrevive el tramo horizontal");
    aprox(rec[0].puntos[1], 500, 1e-9, "arranca donde acabó la vertical");
  });

  // El trazador cierra las ramas que topan con un polo en `yTop = domY[1] + alto` (3 semi-alturas:
  // ±21 con la vista por defecto). Es un vértice de RENDER. Caminándolo, el carril rebasaba la punta
  // real de la rama, BAJABA por ese segmento sintético y se clavaba en y=21.
  test("podarVerticesDePolo quita los vértices sintéticos de cierre, no los reales", () => {
    const vp = crearViewport([-8, 8], [-7, 7], 768, 261, 1); // yTop = 21, yBot = −21
    const conPolo = rama([-1.5, -21, -1.5, -2e7, 0, 0, 1.5, 2e7, 1.5, 21]);
    const pod = podarVerticesDePolo([conPolo], vp);
    const p = pod[0].puntos, n = p.length >> 1;
    igual(n, 3, "quedan la punta, el centro y la otra punta");
    aprox(p[1], -2e7, 1e-9, "el primer vértice pasa a ser la punta real");
    aprox(p[2 * n - 1], 2e7, 1e-9, "y el último, la otra punta");
    const limpia = rama([0, 0, 1, 1, 2, 4]);
    igual(podarVerticesDePolo([limpia], vp)[0].puntos.length, 6, "una rama sin vértices de polo no se toca");
  });
});

// ════════════════════════════════════════════════
// Rampa de velocidad del carril de INERCIA por VERTICALIDAD local (pendiente en pantalla): ×1
// donde el tramo es suave (el centro de la rama, tan'(0)=1) → ×MAX donde es casi vertical (junto
// a la asíntota). Geométrica, no mira la fórmula → vale igual para tan(x) y para arccot(x²)/(2√x).
describe("Carril: rampa de velocidad por verticalidad (factorRampaVerticalidad)", () => {
  test("×1 en el tramo suave, ×MAX en casi-vertical, monótona en medio", () => {
    aprox(factorRampaVerticalidad(0), 1, 1e-9, "horizontal: ×1");
    aprox(factorRampaVerticalidad(1), 1, 1e-9, "pendiente 1 (tan'(0)): ×1");
    aprox(factorRampaVerticalidad(5), 5, 1e-9, "pendiente 5: ×5");
    aprox(factorRampaVerticalidad(10), 10, 1e-9, "pendiente 10: ×MAX");
    aprox(factorRampaVerticalidad(1e6), 10, 1e-9, "casi-vertical: saturada en ×MAX");
    aprox(factorRampaVerticalidad(Infinity), 10, 1e-9, "vertical exacta (Δx=0): ×MAX");
    const f2 = factorRampaVerticalidad(2), f5 = factorRampaVerticalidad(5), f8 = factorRampaVerticalidad(8);
    assert(f2 < f5 && f5 < f8, `monótona: ${f2} < ${f5} < ${f8}`);
  });
});

// ════════════════════════════════════════════════
// Detección Caso A / Caso B del carril de asíntotas EN TIEMPO REAL: ¿hay una rama vecina real a la
// que saltar en la dirección de avance? Sobre la geometría (no el tipo de función).
describe("Carril: detección de rama vecina (existeRamaVecina)", () => {
  const vp = { domX: [0, 10] as [number, number], domY: [0, 10] as [number, number], anchoPx: 100, altoPx: 100, dpr: 1 };
  const rama = (pts: number[]): Rama =>
    ({ puntos: Float64Array.from(pts), cerrada: false, calidad: "best-effort", objetoId: "id" });

  test("Caso A: con rama vecina en la dirección de avance → true", () => {
    // Dos franjas de x disjuntas (como dos períodos de tan): desde la 1ª, avanzando +x, hay vecina.
    const ramas = [rama([0, 0, 1, 5]), rama([3, -5, 4, 0])];
    assert(existeRamaVecina(ramas, 0.5, 2.5, 1, vp), "+x: hay vecina (Caso A)");
    assert(!existeRamaVecina(ramas, 0.5, 2.5, -1, vp), "−x desde la 1ª: no hay vecina");
  });

  test("Caso B: rama única, sin continuación al otro lado → false", () => {
    const ramas = [rama([1, 0, 2, 5])];
    assert(!existeRamaVecina(ramas, 1.5, 2.5, -1, vp), "−x (hacia la asíntota): sin vecina (Caso B)");
    assert(!existeRamaVecina(ramas, 1.5, 2.5, 1, vp), "+x: tampoco");
  });
});

// ════════════════════════════════════════════════
// INTEGRACIÓN: carril de INERCIA en asíntotas verticales. Reproduce el bucle real Navegacion+Camara
// con stubs de rAF/canvas/window; registra railX/railY/centro de cámara por frame. Dos casos,
// elegidos EN TIEMPO REAL por si hay rama vecina alcanzable (`hayVecina`), no por el tipo de función:
//   • CASO A (tan x, sec x, x⁻²): la cámara PERSIGUE al punto en X y en Y con el muelle de inercia,
//     sin tope de viewport; el punto sube hasta donde la curva deja de ser recorrible (pendiente en
//     pantalla > 50, criterio geométrico) y SALTA a la vecina. Como railY pasa poco tiempo en los
//     extremos rápidos, la cámara se asienta de por sí cerca de la línea base.
//   • CASO B (arccot(x²)/(2√x)): sin vecina (convergencia real), la cámara deja de perseguir al punto
//     en Y y se anima a y=0 con la curva ×10→×1; el punto escapa por la asíntota fuera de la vista.
const arnesCarril = (fuente: string) => {
  const g = globalThis as Record<string, unknown>;
  if (!g.window) g.window = { devicePixelRatio: 1 };
  let pendiente: ((t: number) => void) | null = null;
  g.requestAnimationFrame = (g.window as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => { pendiente = cb; return 1; };
  g.cancelAnimationFrame = (g.window as Record<string, unknown>).cancelAnimationFrame = () => { pendiente = null; };
  const fakeCanvas = () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    return { handlers, tabIndex: 0, style: {} as Record<string, string>,
      setCssStyles(s: Record<string, string>) { Object.assign(this.style, s); },
      focus() {}, addEventListener(tipo: string, fn: (e: unknown) => void) { handlers[tipo] = fn; },
      removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {} };
  };
  const cnvCam = fakeCanvas(), cnvNav = fakeCanvas();
  const ctxNulo = null as unknown as CanvasRenderingContext2D;
  const escena = new Escena(construirObjetosEscena(fuente),
    new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo));
  const camara = new Camara(cnvCam as unknown as HTMLCanvasElement, 130,
    { onViewport: () => {}, onCursor: () => {} });
  camara.redimensionar(300);
  const nav = new Navegacion(cnvNav as unknown as HTMLCanvasElement, camara,
    { y: (x) => escena.yEnCurva(x),
      avanzarArco: (x, y, dPx, vp, recortar) => escena.avanzarArcoEnCurva(x, y, dPx, vp, recortar),
      hayVecina: (x, y, dir, vp) => escena.hayRamaVecinaCarril(x, y, dir, vp),
      tieneAsintotasVerticales: () => escena.tieneAsintotasVerticales() },
    () => escena.actualizar(camara.viewport(), "interactiva"));
  let t = 0;
  const frame = (): boolean => { const cb = pendiente; if (!cb) return false; pendiente = null; t += 50; cb(t); return true; };
  const tecla = (k: string, abajo: boolean) => cnvNav.handlers[abajo ? "keydown" : "keyup"]({ key: k, shiftKey: false, preventDefault() {}, stopPropagation() {} });
  const camCy = () => (camara.viewport().domY[0] + camara.viewport().domY[1]) / 2;
  const semi = () => (camara.viewport().domY[1] - camara.viewport().domY[0]) / 2;
  nav.alternarCarril();
  escena.actualizar(camara.viewport(), "final"); // settle que puebla el flag de asíntotas
  return { nav, camara, frame, tecla, camCy, semi, escena, destruir: () => { nav.destruir(); camara.destruir(); } };
};

describe("Carril: CASO A · cruce de asíntotas persiguiendo al punto en X e Y (integración)", () => {
  test("mantener D salta rama tras rama; el punto queda EN PANTALLA y la cámara no se dispara", () => {
    const a = arnesCarril("tan(x)");
    assert(a.escena.tieneAsintotasVerticales(), "tan(x) tiene asíntotas verticales tras la pasada final");
    const semiIni = a.semi();
    a.tecla("d", true);
    let maxRezago = 0, maxAbsCamCy = 0, algunSalto = false;
    let xPrev = a.nav.railX;
    for (let i = 0; i < 120; i++) {
      if (!a.frame()) break;
      if (a.nav.railY !== null) maxRezago = Math.max(maxRezago, Math.abs(a.nav.railY - a.camCy()));
      maxAbsCamCy = Math.max(maxAbsCamCy, Math.abs(a.camCy()));
      if (a.nav.railX - xPrev > 1.5) algunSalto = true; // dio un brinco de rama (cruzó un polo)
      xPrev = a.nav.railX;
    }
    a.tecla("d", false); a.frame();
    // (1) Cruzó MUCHAS asíntotas.
    assert(a.nav.railX > 30, `cruzó varias asíntotas: railX=${a.nav.railX.toFixed(1)}`);
    assert(algunSalto, "hubo saltos de rama (brincos de railX al cruzar los polos)");
    // (2) El punto quedó SIEMPRE cerca del centro de cámara (dentro de ~1 vista → en pantalla),
    //     no disparado a y de miles: la persecución en Y no degenera.
    assert(maxRezago <= 1.2 * semiIni, `punto en pantalla: max|railY−camCy|=${maxRezago.toFixed(2)} ≤ ${(1.2 * semiIni).toFixed(2)}`);
    // (3) La cámara no se fue tras el polo: railY pasa poco tiempo en los extremos rápidos, así que
    //     el muelle se asienta cerca de la línea base sin necesidad de congelarlo.
    assert(maxAbsCamCy < 3, `cámara cerca de la línea base: max|camCy|=${maxAbsCamCy.toFixed(2)} < 3`);
    // (4) No hubo zoom (solo D): la semi-altura no cambió.
    aprox(a.semi(), semiIni, 1e-9, "sin zoom, semi-altura estable");
    a.destruir();
  });

  // El corte de la curva es por PENDIENTE (geométrico), no por el borde de la vista: el cruce debe
  // ocurrir igual con zoom-in y con zoom-out. Antes, con el recorte ligado al `domY`, el carril se
  // estancaba porque no encontraba rama vecina dentro del encuadre.
  for (const [nombre, tecla, objetivo, frames] of [
    ["zoom-in (semiY≈0.5)", "w", 0.5, 400] as const,
    ["zoom-out (semiY≈100)", "s", 100, 60] as const,
  ]) {
    test(`tan(x) cruza ramas también con ${nombre}, sin depender del encuadre`, () => {
      const a = arnesCarril("tan(x)");
      a.tecla(tecla, true);
      for (let i = 0; i < 2000; i++) {
        if (!a.frame()) break;
        if (tecla === "w" ? a.semi() <= objetivo : a.semi() >= objetivo) break;
      }
      a.tecla(tecla, false); a.frame();
      a.escena.actualizar(a.camara.viewport(), "final"); // el host hace la final al asentarse
      assert(a.escena.tieneAsintotasVerticales(), "el latch de asíntotas formales sobrevive al zoom");
      const xIni = a.nav.railX;
      a.tecla("d", true);
      for (let i = 0; i < frames; i++) if (!a.frame()) break;
      a.tecla("d", false); a.frame();
      // Cruzó al menos un polo: avanzó más allá de π/2, donde la rama de partida termina.
      assert(a.nav.railX > Math.PI / 2, `cruzó el polo pese al ${nombre}: railX=${a.nav.railX.toFixed(3)} (partió de ${xIni.toFixed(3)})`);
      assert(Number.isFinite(a.nav.railY!) && Math.abs(a.nav.railY!) < 1e3,
        `el punto no se disparó a y enormes: railY=${a.nav.railY!.toExponential(2)}`);
      a.destruir();
    });
  }
});

// CASO B: convergencia REAL sin rama vecina. La cámara deja de perseguir al punto en Y y se anima a
// un destino FIJO, y=0, con la curva ×10→×1; en X lo sigue con normalidad. El punto sigue subiendo
// por la asíntota más allá de lo visible (honesto: la función diverge de verdad).
describe("Carril: CASO B · convergencia real — la cámara se centra en y=0 y sigue el punto en X", () => {
  const camCx = (a: ReturnType<typeof arnesCarril>) => {
    const vp = a.camara.viewport();
    return (vp.domX[0] + vp.domX[1]) / 2;
  };
  for (const fuente of ["arccot(x^2)/(2 sqrt(x))", "arccot(x^2)/(2 sqrt(x)) - 2x sqrt(x)/(x^4+1)"]) {
    test(`${fuente}: mantener A ancla la cámara en y=0 y el punto escapa por la asíntota`, () => {
      const a = arnesCarril(fuente);
      assert(a.escena.tieneAsintotasVerticales(), "blow-up de borde de dominio detectado");
      const semiIni = a.semi();
      a.tecla("a", true);
      // Fase de acercamiento: la cámara va FIJA en el punto y SUBE con él hasta que este escapa de la
      // zona recorrible. Se detecta el pico: a partir de ahí empieza el viaje a y=0.
      let cyMax = 0;
      for (let i = 0; i < 30; i++) {
        if (!a.frame()) break;
        const d = Math.abs(a.camCy());
        if (d < cyMax) break; // ya ancló y está bajando
        cyMax = d;
      }
      // El viaje debe ser VISIBLE: al menos ~1/7 de la semi-altura. Con el muelle suave la cámara se
      // quedaba en cy≈0.2 mientras el punto ya iba por y≈8, y la animación no se percibía.
      assert(cyMax > semiIni / 7, `la cámara subió con el punto antes de anclar: max|camCy|=${cyMax.toFixed(3)} > ${(semiIni / 7).toFixed(3)}`);
      // Fase de anclaje: |camCy| decae MONÓTONAMENTE hasta y=0 exacto (no se para donde sea).
      let anterior = Math.abs(a.camCy());
      for (let i = 0; i < 60; i++) {
        if (!a.frame()) break;
        const d = Math.abs(a.camCy());
        assert(d <= anterior + 1e-12, `el anclaje solo acerca la cámara a y=0: ${d} ≤ ${anterior}`);
        anterior = d;
      }
      igual(a.camCy(), 0, "la cámara se asienta EXACTAMENTE en y=0 (eje X a media altura)");
      // El punto, mientras tanto, sigue subiendo por la asíntota y ha salido de la vista.
      assert(a.nav.railY! > semiIni, `el punto escapó por la asíntota: railY=${a.nav.railY!.toFixed(1)} > ${semiIni}`);
      assert(a.nav.railX > 0 && a.nav.railX < 0.05, `y quedó pegado a la asíntota x=0: railX=${a.nav.railX.toExponential(2)}`);
      // La X sigue persiguiendo al punto con normalidad (solo el eje Y queda anclado).
      aprox(camCx(a), a.nav.railX, 1e-9, "la cámara sigue al punto en X");
      a.tecla("a", false); a.frame();
      a.destruir();
    });
  }

  // Modo ESCAPE. Bug (reportado): el punto subía hasta la punta de la polilínea (y≈330) y luego
  // BAJABA —329, 328…— hasta clavarse en y=21, que es `domY[1] + alto`: el vértice sintético con que
  // el trazador cierra la rama en el polo. Ahora ese vértice se poda y, una vez fugado, la `y` se
  // INTEGRA: sube sin límite. Invertir con D deshace el camino y devuelve el punto a la curva.
  test("fugado, el punto sube SIN LÍMITE (nada de clavarse en 3·semiY) y D deshace el camino", () => {
    const a = arnesCarril("arccot(x^2)/(2 sqrt(x)) - 2x sqrt(x)/(x^4+1)");
    const semiIni = a.semi();
    const clampTrazador = 3 * semiIni; // el y=21 del bug
    a.tecla("a", true);
    let yPrev = a.nav.railY!, subidaMonotona = true;
    for (let i = 0; i < 200; i++) {
      if (!a.frame()) break;
      if (a.nav.railY! < yPrev - 1e-9) subidaMonotona = false;
      yPrev = a.nav.railY!;
    }
    const yPico = a.nav.railY!;
    assert(subidaMonotona, "manteniendo A el punto NUNCA baja (antes se daba la vuelta en la punta)");
    assert(yPico > 20 * clampTrazador, `sube sin límite: y=${yPico.toFixed(0)} ≫ 3·semiY=${clampTrazador}`);
    igual(a.camCy(), 0, "y la cámara ya está asentada en y=0");
    // Proceso inverso: D deshace la fuga y devuelve el punto a la curva, bajando en todo momento.
    a.tecla("a", false); a.tecla("d", true);
    let bajadaMonotona = true;
    yPrev = a.nav.railY!;
    for (let i = 0; i < 400; i++) {
      if (!a.frame()) break;
      if (a.nav.railY! > yPrev + 1e-9) bajadaMonotona = false;
      yPrev = a.nav.railY!;
      if (a.nav.railY! < semiIni) break;
    }
    a.tecla("d", false); a.frame();
    assert(bajadaMonotona, "manteniendo D el punto NUNCA vuelve a subir (antes se re-fugaba al descender)");
    assert(a.nav.railY! < semiIni, `el punto regresó a la vista: y=${a.nav.railY!.toFixed(2)}`);
    // Y regresó SOBRE la curva, no a un punto inventado.
    const yCurva = a.escena.yEnCurva(a.nav.railX);
    assert(yCurva !== null && Math.abs(yCurva - a.nav.railY!) < 0.2,
      `de vuelta sobre la curva: railY=${a.nav.railY!.toFixed(3)} vs f(railX)=${yCurva?.toFixed(3)}`);
    a.destruir();
  });
});

// INTEGRACIÓN: REENGANCHE de cámara tras el salto de Caso A. Bug (reportado): la cámara seguía a
// railX SIEMPRE, así que en el salto el punto quedaba clavado en el centro y eran los ejes, la
// rejilla y la curva los que brincaban el hueco → teletransporte (visible en x⁻², de hueco angosto).
// Ahora la cámara absorbe el corte como desfase y lo reabsorbe con el MISMO muelle exponencial que el
// reenganche de Caso B; el movimiento CONTINUO se sigue exacto (un muelle sobre railX rezagaría todo
// el recorrido → lag). Se recorre el bucle real frame a frame hasta el primer salto.
describe("Carril: CASO A · la cámara REENGANCHA tras el salto en vez de teletransportarse", () => {
  const hastaElSalto = (fuente: string, tecla: string, maxFrames: number) => {
    const a = arnesCarril(fuente);
    const camCx = () => { const vp = a.camara.viewport(); return (vp.domX[0] + vp.domX[1]) / 2; };
    a.tecla(tecla, true);
    a.frame(); // 1er frame: dt=0, la cámara aún no ha enfocado
    let xPrev = a.nav.railX, cxPrev = camCx(), dPrev = Math.abs(a.nav.railX - camCx());
    let salto: { dRail: number; dCam: number } | null = null;
    let maxDesfaseSuave = 0;
    for (let i = 0; i < maxFrames && salto === null; i++) {
      if (!a.frame()) break;
      const d = Math.abs(a.nav.railX - camCx());
      // El desfase cámara–punto SOLO crece en el frame de un salto (fuera de él la cámara sigue al
      // punto exacto y el muelle lo decae). Sirve de marcador agnóstico: en x⁻² las dos ramas salen
      // por ARRIBA, así que un |Δy| grande no distingue el salto (sí en tan, que reaparece abajo).
      if (d > dPrev + 1e-9) salto = { dRail: a.nav.railX - xPrev, dCam: camCx() - cxPrev };
      else maxDesfaseSuave = Math.max(maxDesfaseSuave, d);
      xPrev = a.nav.railX; cxPrev = camCx(); dPrev = d;
    }
    a.tecla(tecla, false);
    return { a, salto, maxDesfaseSuave, camCx };
  };

  for (const [fuente, tecla] of [["tan(x)", "d"], ["x^(-2)", "a"]] as const) {
    test(`${fuente}: el corte no lo da la cámara, y el desfase se reabsorbe con el muelle`, () => {
      const { a, salto, maxDesfaseSuave, camCx } = hastaElSalto(fuente, tecla, 60);
      assert(salto !== null, `${fuente}: el punto saltó de rama`);
      // (1) Fuera del salto la cámara sigue al punto EXACTO: nada de rezago en el tramo continuo.
      assert(maxDesfaseSuave < 1e-9, `sin lag en el recorrido continuo: max|railX−camX|=${maxDesfaseSuave}`);
      // (2) En el frame del salto la cámara se mueve MENOS que el punto, justo el HUECO que este
      //     brincó (el resto del desplazamiento —arco recorrido— sí lo acompaña, sin lag).
      const rezagoDelFrame = Math.abs(salto!.dRail - salto!.dCam);
      assert(Math.abs(salto!.dCam) < Math.abs(salto!.dRail),
        `la cámara se movió menos que el punto: ΔcamX=${salto!.dCam.toFixed(3)} vs ΔrailX=${salto!.dRail.toFixed(3)}`);
      assert(rezagoDelFrame > 0.15, `la cámara NO acompañó el corte: se quedó atrás ${rezagoDelFrame.toFixed(3)} de mundo`);
      // (3) La cámara quedó rezagada respecto del punto (el hueco recién saltado).
      const desfaseTrasSalto = Math.abs(a.nav.railX - camCx());
      assert(desfaseTrasSalto > 0.1, `cámara rezagada tras el salto: |railX−camX|=${desfaseTrasSalto.toFixed(3)}`);
      // (4) Soltada la tecla, el bucle SIGUE vivo hasta reenganchar: el desfase decae de forma
      //     monótona hasta cero. Ni instantáneo (sería el corte de antes) ni eterno (sería lag).
      let anterior = desfaseTrasSalto, frames = 0;
      while (a.frame() && frames < 300) {
        const d = Math.abs(a.nav.railX - camCx());
        assert(d <= anterior + 1e-9, `el reenganche solo acerca la cámara: ${d} ≤ ${anterior}`);
        anterior = d; frames++;
      }
      assert(frames >= 4 && frames <= 200, `reenganche progresivo (${frames} frames), no instantáneo ni interminable`);
      aprox(a.nav.railX, camCx(), 1e-6, "al llegar, la cámara se fija centrada en el punto");
      a.destruir();
    });
  }
});

// ════════════════════════════════════════════════
// INTEGRACIÓN: el carril arranca donde x=0 NO está en la curva. Bug (reportado): en 1/x
// (asíntota en x=0) y arccot(x²)/(2√x) (dominio x>0) el punto NUNCA aparecía y A/D no hacía
// nada, porque el carril exigía arrancar en x=0 → railY=null → crosshair invisible e inerte.
// Con el fix (ySemilla + enganche por arco 0 al punto más cercano) el punto aparece de
// inmediato sobre la curva y A/D lo recorre. Simula el bucle real Navegacion+Camara.
describe("Carril: arranque cuando x=0 no está en la curva (1/x, dominio x>0)", () => {
  const correr = (fuente: string) => {
    const g = globalThis as Record<string, unknown>;
    if (!g.window) g.window = { devicePixelRatio: 1 };
    let pendiente: ((t: number) => void) | null = null;
    g.requestAnimationFrame = (g.window as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => { pendiente = cb; return 1; };
    g.cancelAnimationFrame = (g.window as Record<string, unknown>).cancelAnimationFrame = () => { pendiente = null; };
    const fakeCanvas = () => {
      const handlers: Record<string, (e: unknown) => void> = {};
      return { handlers, tabIndex: 0, style: {} as Record<string, string>,
        setCssStyles(s: Record<string, string>) { Object.assign(this.style, s); },
        focus() {}, addEventListener(tipo: string, fn: (e: unknown) => void) { handlers[tipo] = fn; },
        removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {} };
    };
    const cnvCam = fakeCanvas(), cnvNav = fakeCanvas();
    const ctxNulo = null as unknown as CanvasRenderingContext2D;
    const escena = new Escena(construirObjetosEscena(fuente),
      new Overlay(ctxNulo), new RendererCanvas2D(ctxNulo), new Crosshair(ctxNulo));
    const camara = new Camara(cnvCam as unknown as HTMLCanvasElement, 130, { onViewport: () => {}, onCursor: () => {} });
    camara.redimensionar(300);
    const nav = new Navegacion(cnvNav as unknown as HTMLCanvasElement, camara,
      { y: (x) => escena.yEnCurva(x), avanzarArco: (x, y, dPx, vp, recortar) => escena.avanzarArcoEnCurva(x, y, dPx, vp, recortar),
        hayVecina: (x, y, dir, vp) => escena.hayRamaVecinaCarril(x, y, dir, vp),
        tieneAsintotasVerticales: () => escena.tieneAsintotasVerticales() },
      () => escena.actualizar(camara.viewport(), "interactiva"));
    let t = 0;
    const frame = (): boolean => { const cb = pendiente; if (!cb) return false; pendiente = null; t += 50; cb(t); return true; };
    const tecla = (k: string, abajo: boolean) => cnvNav.handlers[abajo ? "keydown" : "keyup"]({ key: k, shiftKey: false, preventDefault() {}, stopPropagation() {} });
    nav.alternarCarril();
    escena.actualizar(camara.viewport(), "final");
    const yArranque = nav.railY;
    const xArranque = nav.railX;
    tecla("d", true);
    for (let i = 0; i < 40; i++) if (!frame()) break;
    tecla("d", false); frame();
    const res = { yArranque, xArranque, xFinal: nav.railX, yFinal: nav.railY };
    nav.destruir(); camara.destruir();
    return res;
  };

  test("1/x: el punto APARECE al activar el carril (railY no es null) y A/D lo recorre", () => {
    const r = correr("1/x");
    assert(r.yArranque !== null && Number.isFinite(r.yArranque), `punto sobre la curva al arrancar: railY=${r.yArranque}`);
    assert(r.yFinal !== null && Number.isFinite(r.yFinal), "sigue teniendo punto tras A/D");
    assert(Math.abs(r.xFinal - r.xArranque) > 1, `A/D recorre la curva: Δx=${(r.xFinal - r.xArranque).toFixed(2)}`);
  });

  test("arccot(x²)/(2√x) (dominio x>0): el punto APARECE y A/D lo recorre", () => {
    const r = correr("arccot(x^2)/(2 sqrt(x)) - 2 x sqrt(x)/(x^4+1)");
    assert(r.yArranque !== null && Number.isFinite(r.yArranque), `punto sobre la curva al arrancar: railY=${r.yArranque}`);
    assert(r.xArranque > 0, `arranca dentro del dominio x>0: x=${r.xArranque.toFixed(3)}`);
    assert(Math.abs(r.xFinal - r.xArranque) > 1, `A/D recorre la curva: Δx=${(r.xFinal - r.xArranque).toFixed(2)}`);
  });
});

// ════════════════════════════════════════════════
// Carril sobre una derivada EXPLOSIVA (obs-derivate e^{x²+1} → 2x·e^{x²+1}): al
// seguir el punto, la vista se centra en valores enormes (~1e16+). Dos defensas
// contra el CONGELAMIENTO del hilo principal que eso provocaba:
//   • generarTicks NO puede entrar en bucle infinito (paso < ULP del centro).
//   • enfocarCarril ACOTA el centro para no degenerar el encuadre en flotante.
describe("Carril: derivada explosiva sin congelar (generarTicks + centro acotado)", () => {
  test("generarTicks: bucle por índice, imposible de colgar en la zona letal", () => {
    // Centros donde el paso (~2) cae bajo el ULP del centro: el bucle viejo
    // `t += paso` no avanzaba → cuelgue. Aquí termina siempre y NO lanza.
    for (const c of [3.16e16, 5e16, 1e16, 1e17, 1e300]) {
      const t0 = Date.now();
      const ticks = generarTicks(c - 7, c + 7);
      assert(Date.now() - t0 < 500, `c=${c}: termina rápido (no cuelga)`);
      assert(ticks.length <= 40, `c=${c}: nº de ticks acotado (${ticks.length})`);
      for (const t of ticks) assert(Number.isFinite(t), `c=${c}: ticks finitos`);
    }
    // Casos degenerados: rango nulo/negativo → sin ticks (sin lanzar).
    igual(generarTicks(1e17, 1e17).length, 0, "rango 0 → sin ticks");
    igual(generarTicks(5, 3).length, 0, "rango negativo → sin ticks");
    // Caso sano intacto: [-8,8] da los ticks pares de siempre.
    const sanos = generarTicks(-8, 8);
    assert(sanos.includes(0) && sanos.includes(-8) && sanos.includes(8), "vista normal intacta");
  });

  test("centroCarrilAcotado: recorta el centro para que el encuadre no degenere", () => {
    // Centro sano (pequeño frente al semirrango·2⁴⁶): pasa intacto.
    igual(centroCarrilAcotado(0, 8), 0, "centro 0 intacto");
    igual(centroCarrilAcotado(1e6, 8), 1e6, "centro moderado intacto");
    // Centro enorme con semirrango pequeño: se recorta al borde numéricamente sano,
    // donde los bordes del encuadre siguen siendo representables DISTINTOS.
    for (const [c, semi] of [[1e17, 8], [1e300, 7], [-1e17, 8]] as const) {
      const cc = centroCarrilAcotado(c, semi);
      assert(Number.isFinite(cc), `acotado finito (c=${c})`);
      assert((cc + semi) > (cc - semi), `bordes distintos tras acotar (c=${c})`);
      assert(Math.abs(cc) <= Math.abs(c), `acotado no crece más que el centro (c=${c})`);
    }
    // Un semirrango grande admite centros grandes sin recortar (span 1e9 en 1e17 va bien).
    igual(centroCarrilAcotado(1e17, 1e9), 1e17, "semirrango grande: centro grande sano");
  });
});
