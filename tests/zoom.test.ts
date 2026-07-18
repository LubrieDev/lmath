// ─────────────────────────────────────────────
// tests · Suite LENTA: barrido de zoom (regresión "la curva desaparece / parpadea")
// ─────────────────────────────────────────────
//
// Vive APARTE de `motor.test.ts` por una razón de COSTE, no de tema: este barrido traza cada
// curva en ~150 viewports × 2 lienzos × 2 pasadas y se lleva ~80 s, cuatro veces más que TODO
// el resto de la suite junta. Mezclado, convertía el `npm run test` de cada cambio pequeño en
// una espera de dos minutos, y el ciclo corto es lo que hace que la validación se ejecute de
// verdad. Aquí el muestreo FINO es innegociable: los fallos aparecían en bandas estrechas de
// zoom (semiY≈24.0–24.75) que un barrido grueso se salta —recortarlo sería no probar nada—.
//
// Se corre con `npm run test:zoom`, y `npm run test:todo` encadena las dos suites (lo que hay
// que pasar antes de dar por cerrado un cambio del trazado/descubrimiento).
//
// Regresión del "al alejar el zoom, parte de la curva desaparece y parpadea". La rejilla
// de descubrimiento tiene celdas ligadas a los PÍXELES, pero una curva acotada (corazón,
// astroide: radio ~1) tiene tamaño fijo en MUNDO → al alejar el zoom cabe entera en una
// celda, ninguna arista cambia de signo y no se siembra nada. Y como cada pasada usa una
// rejilla distinta, cada una la perdía a un zoom distinto: de ahí el PARPADEO (aparece al
// soltar el gesto, desaparece al arrastrar).
//
// Se exige lo que el usuario ve: a CUALQUIER zoom y en LAS DOS pasadas, la curva se
// dibuja (nunca cero ramas) y con el mismo nº de arcos que a zoom normal en el rango
// donde la figura aún tiene tamaño de sobra en pantalla.

import { describe, test, assert, igual, resumen } from "./runner";
import { crearViewport } from "../src/motor/scene/viewport-utils";
import { TrazadorContinuacion } from "../src/motor/tracing/continuation/TrazadorContinuacion";
import { construirObjeto } from "../src/motor/parsing/construirObjeto";
import { crearProveedor } from "../src/motor/app/composicion";
import type { Viewport, Tolerancia, Geometria, ObjetoImplicito, Semilla } from "../src/motor/contracts";

const VP: Viewport = crearViewport([-8, 8], [-7, 7], 768, 261, 1);
const TOL_FINAL: Tolerancia = { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" };
const TOL_INT: Tolerancia = { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "interactiva" };

/** Longitud TOTAL trazada, en unidades de mundo. Es la métrica que refleja lo que el usuario
 *  VE: una curva mutilada pierde longitud. El nº de RAMAS no sirve —la misma curva puede salir
 *  partida en 2 o en 4 polilíneas según si la continuación cruza o no una cúspide, con idéntico
 *  dibujo—, y usarlo como criterio fue lo que dejó pasar el bug la primera vez. */
function longitudTrazada(g: Geometria): number {
  let L = 0;
  for (const r of g.ramas)
    for (let k = 2; k < r.puntos.length; k += 2)
      L += Math.hypot(r.puntos[k] - r.puntos[k - 2], r.puntos[k + 1] - r.puntos[k - 1]);
  return L;
}

/** Viewport como el que arma `Camara`: domY es el mando del zoom, domX sale del ASPECTO. */
const vpZoom = (semiY: number, ancho: number, alto: number): Viewport =>
  crearViewport([-semiY * (ancho / alto), semiY * (ancho / alto)], [-semiY, semiY], ancho, alto, 1);

describe("Zoom-out: las curvas acotadas no desaparecen ni parpadean", () => {
  // Curvas ACOTADAS con su longitud REAL (no depende del zoom) y los lienzos con los que se
  // barre. El zoom de rueda es CONTINUO: se barre en pasos finos, porque los fallos aparecían
  // en BANDAS ESTRECHAS de zoom (semiY≈24.0–24.75) que un muestreo grueso se salta.
  const CURVAS: ReadonlyArray<{ nombre: string; fuente: string; largo: number }> = [
    { nombre: "corazón (x²+y²−1)³=x²y³", fuente: "(x^2+y^2-1)^3=x^2*y^3", largo: 7.5 },
    { nombre: "astroide x^{2/3}+y^{2/3}=1", fuente: "x^{2/3}+y^{2/3}=1", largo: 6.0 },
    { nombre: "lemniscata (nodo en el origen)", fuente: "(x^2+y^2)^2=2*(x^2-y^2)", largo: 7.4 },
    { nombre: "cardioide (cúspide)", fuente: "(x^2+y^2+x)^2=x^2+y^2", largo: 8.0 },
    { nombre: "círculo (control)", fuente: "x^2+y^2=9", largo: 18.85 },
  ];
  const LIENZOS: ReadonlyArray<[number, number]> = [[490, 330], [768, 261]];

  for (const { nombre, fuente, largo } of CURVAS) {
    test(`${nombre}: se traza ENTERA a cualquier zoom y en las dos pasadas`, () => {
      for (const [ancho, alto] of LIENZOS) {
        for (let semiY = 3; semiY <= 40; semiY += 0.25) {
          const vp = vpZoom(semiY, ancho, alto);
          for (const tol of [TOL_INT, TOL_FINAL]) {
            const g = crearProveedor(construirObjeto(fuente, "z")).geometria(vp, tol);
            const cobertura = longitudTrazada(g) / largo;
            assert(
              cobertura >= 0.9,
              `${ancho}x${alto} semiY=${semiY.toFixed(2)} ${tol.pasada}: solo se trazó el ` +
              `${(cobertura * 100).toFixed(0)}% de la curva (mutilada)`
            );
          }
        }
      }
    });
  }

  test("las dos pasadas trazan LO MISMO (la discrepancia entre ellas ES el parpadeo)", () => {
    // El parpadeo es que la pasada interactiva (durante el gesto) y la final (al soltar)
    // dibujen cosas distintas. Se exige que sus longitudes coincidan al 10%.
    for (const { nombre, fuente } of CURVAS) {
      for (let semiY = 3; semiY <= 40; semiY += 0.5) {
        const vp = vpZoom(semiY, 490, 330);
        const L = [TOL_INT, TOL_FINAL].map((tol) =>
          longitudTrazada(crearProveedor(construirObjeto(fuente, "z")).geometria(vp, tol))
        );
        const dif = Math.abs(L[0] - L[1]) / Math.max(L[0], L[1], 1e-9);
        assert(dif < 0.1, `${nombre} semiY=${semiY.toFixed(2)}: int=${L[0].toFixed(2)} vs fin=${L[1].toFixed(2)}`);
      }
    }
  });

  test("las curvas NO acotadas (control) siguen intactas", () => {
    const CONTROL: ReadonlyArray<[string, string, number]> = [
      ["hipérbola", "x^2-y^2=4", 2],
      ["cúbica", "x^3+y^3=9", 1],
      ["folium", "x^3+y^3=3*x*y", 1],
    ];
    for (const [nombre, fuente, esperadas] of CONTROL)
      for (const semiY of [6, 15, 30]) {
        const g = crearProveedor(construirObjeto(fuente, "z")).geometria(vpZoom(semiY, 768, 261), TOL_FINAL);
        assert(g.ramas.length >= esperadas, `${nombre} a semiY=${semiY}: ${g.ramas.length} ramas`);
        assert(longitudTrazada(g) > 5, `${nombre} a semiY=${semiY}: geometría no vacía`);
      }
  });

  test("una semilla sobre una CÚSPIDE arranca igual (∇F=0 no mata la curva)", () => {
    // La astroide con mucho zoom-out solo recibe semillas sobre los ejes = sus cuatro
    // cúspides, donde el corrector converge al propio punto singular y el primer paso
    // gira ~63° (más de lo que admite el predictor) → sin el arranque robusto, la curva
    // entera salía vacía. Se siembra a mano EXACTAMENTE en las cúspides.
    const F = (construirObjeto("x^{2/3}+y^{2/3}=1", "z") as ObjetoImplicito).F;
    const cuspides: Semilla[] = [
      { punto: { x: 1, y: 0 }, confianza: 1 },
      { punto: { x: -1, y: 0 }, confianza: 1 },
      { punto: { x: 0, y: 1 }, confianza: 1 },
      { punto: { x: 0, y: -1 }, confianza: 1 },
    ];
    const ramas = new TrazadorContinuacion().trazar(F, "z", cuspides, [], VP, TOL_FINAL);
    assert(ramas.length > 0, "sembrando SOLO en las cúspides, la curva sigue trazándose");
    // Cota HOLGADA a propósito: justo EN la cúspide ∂F/∂y es infinita, así que |F| deja de
    // medir bien el error de posición (el peor punto da |F|≈3·10⁻³, pero como ∂F/∂x=2/3 eso
    // son ~5·10⁻³ unidades de desvío: subpíxel a cualquier zoom razonable).
    for (const r of ramas)
      for (let k = 0; k < r.puntos.length; k += 2)
        assert(Math.abs(F.eval(r.puntos[k], r.puntos[k + 1])) < 1e-2, "los puntos están sobre la curva");
  });
});

describe("Zoom-out: campos PERIÓDICOS (teselado) — completos, estables y sin puentes", () => {
  // Regresión del "al alejar el zoom salen líneas rectas falsas / la red se dibuja a trozos".
  // La red de lazos tiene UNA componente cerrada por celda de 2π×2π: miles al alejar el zoom.
  // Antes: la pasada interactiva daba pasos más grandes que el lazo y el corrector saltaba al
  // lazo VECINO (28% de segmentos con |F(medio)|≈15 → rejas falsas cruzando la pantalla), y la
  // final se quedaba en MAX_COMPONENTES=200 lazos de ~3700 (curva a trozos). Ahora el test de
  // CUERDA rechaza los puentes y el TESELADO traza una celda y la traslada: se exige que todo
  // segmento esté sobre la curva, que haya ~un lazo por celda visible y que ambas pasadas
  // coincidan exactamente.
  const RED = "4(cos(x)+cos(y))+2cos(x+y)+2cos(x-y)-2cos(2x)-2cos(2y)-7=0";

  test("red de lazos: completa y sin segmentos-puente a cualquier zoom", () => {
    const F = (construirObjeto(RED, "z") as ObjetoImplicito).F;
    for (const semiY of [10, 30, 60, 120]) {
      const vp = vpZoom(semiY, 880, 340);
      const porPasada: number[] = [];
      for (const tol of [TOL_INT, TOL_FINAL]) {
        const g = crearProveedor(construirObjeto(RED, "z")).geometria(vp, tol);
        // (a) NINGÚN segmento abandona la curva (los puentes daban |F(medio)|≈15).
        let peor = 0;
        for (const r of g.ramas)
          for (let k = 2; k < r.puntos.length; k += 2) {
            const fm = Math.abs(F.eval(
              (r.puntos[k - 2] + r.puntos[k]) / 2, (r.puntos[k - 1] + r.puntos[k + 1]) / 2
            ));
            if (fm > peor) peor = fm;
          }
        assert(peor < 2, `semiY=${semiY} ${tol.pasada}: segmento-puente con |F(medio)|=${peor.toFixed(1)}`);
        // (b) COMPLETA: al menos un lazo por celda de 2π×2π enteramente visible.
        const P = 2 * Math.PI;
        const celdas = Math.floor((vp.domX[1] - vp.domX[0]) / P) * Math.floor((vp.domY[1] - vp.domY[0]) / P);
        assert(
          g.ramas.length >= celdas,
          `semiY=${semiY} ${tol.pasada}: ${g.ramas.length} ramas para ${celdas} celdas visibles`
        );
        porPasada.push(g.ramas.length);
      }
      // (c) SIN parpadeo: las dos pasadas trazan el mismo número de componentes.
      igual(porPasada[0], porPasada[1], `semiY=${semiY}: interactiva vs final`);
    }
  });

  test("componentes NO acotadas (cos(x+y)=0.3): las diagonales llegan a las 4 esquinas", () => {
    // Regresión del recorte-a-celda: conservar ramas ENTERAS de la ventana duplicaba ~20× los
    // tramos de la MISMA recta (copias que resbalan por ella), quemaba el tope de puntos y
    // dejaba las ESQUINAS de la vista vacías (se veía un rombo de curva sobre fondo negro).
    for (const semiY of [30, 120]) {
      const vp = vpZoom(semiY, 880, 340);
      for (const tol of [TOL_INT, TOL_FINAL]) {
        const g = crearProveedor(construirObjeto("cos(x+y)=0.3", "z")).geometria(vp, tol);
        const esquinas: Array<[number, number]> = [
          [vp.domX[0], vp.domY[0]], [vp.domX[1], vp.domY[0]],
          [vp.domX[0], vp.domY[1]], [vp.domX[1], vp.domY[1]],
        ];
        // Radio de cobertura: el espaciado entre rectas consecutivas es < 2π/√2 ≈ 4.44, así
        // que a < 5 unidades de CUALQUIER punto de la vista debe pasar una recta trazada.
        for (const [ex, ey] of esquinas) {
          let d2 = Infinity;
          for (const r of g.ramas)
            for (let k = 0; k < r.puntos.length; k += 2) {
              const dx = r.puntos[k] - ex, dy = r.puntos[k + 1] - ey;
              const d = dx * dx + dy * dy;
              if (d < d2) d2 = d;
            }
          assert(
            Math.sqrt(d2) < 5,
            `semiY=${semiY} ${tol.pasada}: esquina (${ex.toFixed(0)},${ey.toFixed(0)}) sin curva a ${Math.sqrt(d2).toFixed(1)} unidades`
          );
        }
      }
    }
  });

  test("astillas junto a CADA polo de tan: x²+x+|y|+tan x=2π+3 no pierde ramas lejos del centro", () => {
    // La curva tiene un par de ramas casi verticales pegado a CADA polo de tan (el dominio
    // de la rama despejada es un intervalo de ancho ~1/x² que ningún muestreo regular pisa).
    // Antes solo se dibujaban las ~5 del centro; con la retícula de polos extendida y la
    // escalera logarítmica deben aparecer TODAS las visibles, a cualquier zoom y pasada.
    const FUENTE = "x^2+x+sqrt(y^2)+tan(x)=2*pi+3";
    for (const semiY of [40, 120]) {
      const vp = vpZoom(semiY, 880, 340);
      const polosVisibles = Math.floor((vp.domX[1] - vp.domX[0]) / Math.PI);
      for (const tol of [TOL_INT, TOL_FINAL]) {
        const g = crearProveedor(construirObjeto(FUENTE, "z")).geometria(vp, tol);
        assert(
          g.ramas.length >= polosVisibles,
          `semiY=${semiY} ${tol.pasada}: ${g.ramas.length} ramas para ${polosVisibles} polos visibles`
        );
      }
    }
  });

  test("con zoom-in el teselado delega en el genérico (misma geometría de siempre)", () => {
    // A semiY=5 caben < 4 celdas en y: la vista se traza con el pipeline genérico. La longitud
    // debe ser la de los lazos visibles (≈9.1 de perímetro cada uno), no cero ni el doble.
    const g = crearProveedor(construirObjeto(RED, "z")).geometria(vpZoom(5, 880, 340), TOL_FINAL);
    assert(g.ramas.length >= 4, `lazos visibles a semiY=5: ${g.ramas.length}`);
    assert(longitudTrazada(g) > 4 * 8, "los lazos se trazan enteros");
  });
});

resumen();
