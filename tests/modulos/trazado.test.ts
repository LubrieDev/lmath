// ─────────────────────────────────────────────
// tests · Trazado: samplers, continuación y lectura de geometría
// ─────────────────────────────────────────────
//
// Paridad del sampler explícito con `src/render/muestreoExplicito`, continuación
// implícita (incluidas singularidades), caché de geometría, `yEnRamas`, puntos
// notables y la batería de robustez/auditoría.
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { VP, TOL_FINAL, TOL_INT, fr, ce, clampBanda } from "./comun";
import { crearViewport } from "../../src/motor/scene/viewport-utils";
import { TrazadorExplicitoAdaptativo } from "../../src/motor/tracing/explicit/TrazadorExplicitoAdaptativo";
import { TrazadorContinuacion } from "../../src/motor/tracing/continuation/TrazadorContinuacion";
import { DescubrimientoMuestreado } from "../../src/motor/discovery/sampled/DescubrimientoMuestreado";
import { ProveedorConCache } from "../../src/motor/providers/ProveedorConCache";
import { yEnRamas } from "../../src/motor/analysis/lecturaRama";
import { analizarPuntosNotables, resumenPuntosNotables } from "../../src/motor/analysis/puntosNotablesDeRama";
import { estadoGrupo } from "../../src/analisis";
import { trazar } from "../../src/herramientas/trazador";
import { muestrearFuncion } from "../../src/render/muestreoExplicito";
import { construirObjeto } from "../../src/motor/parsing/construirObjeto";
import { crearProveedor } from "../../src/motor/app/composicion";
import type { CampoEscalar, Rama, Geometria, ObjetoExplicito } from "../../src/motor/contracts";

// ════════════════════════════════════════════════
// ════════════════════════════════════════════════
// PARIDAD con el sampler LEGADO (`src/render/muestreoExplicito.ts`).
//
// Qué se compara, y por qué se cambió (2026-07-22). Antes esta prueba exigía igualdad
// VÉRTICE A VÉRTICE: mismo número de puntos y misma `x` exacta que la copia legada. Eso
// convertía al legado —que ya no dibuja nada y que la auditoría documentó como DIVERGENTE
// del vivo— en la definición de "correcto", y CONGELABA el trazador: cualquier mejora del
// muestreo o del refinado la rompía por construcción, aunque no cambiara un solo píxel.
// Medido: poner un tope sub-píxel al refinado (que ahorra hasta un 59% del tiempo) fallaba
// con "esperado 4146 puntos, obtuve 4090" — 1,4% menos vértices, todos SUB-PÍXEL.
//
// Ahora se compara lo OBSERVABLE, que es lo que la prueba debe proteger:
//   • mismo número de ramas y mismas asíntotas verticales (estructura),
//   • y las dos curvas a menos de `TOL_PARIDAD_PX` de distancia EN PANTALLA.
// Una diferencia que no se ve, no es una regresión. Una que se ve, sigue fallando: la
// tolerancia es una fracción de píxel, muy por debajo del grosor del trazo.
// ════════════════════════════════════════════════

/** Tolerancia de la paridad, en píxeles de pantalla. Un cuarto de píxel es indistinguible
 *  (el trazo mide ~2 px) y aun así deja fuera cualquier cambio de forma real. */
const TOL_PARIDAD_PX = 0.25;

describe("Sampler explícito: paridad con muestreoExplicito (misma curva en pantalla)", () => {
  /** Polilínea (mundo) → coordenadas de pantalla, recortando la y a la banda del legado. */
  const aPantalla = (p: ArrayLike<number>, vp: typeof VP, recortar: boolean): number[] => {
    const out: number[] = [];
    const ax = vp.anchoPx / (vp.domX[1] - vp.domX[0]);
    const ay = vp.altoPx / (vp.domY[1] - vp.domY[0]);
    for (let k = 0; k + 1 < p.length; k += 2) {
      const y = recortar ? clampBanda(p[k + 1], vp) : p[k + 1];
      out.push((p[k] - vp.domX[0]) * ax, vp.altoPx - (y - vp.domY[0]) * ay);
    }
    return out;
  };
  /** Distancia máxima de los vértices de `A` a la polilínea `B` (Hausdorff dirigida, px).
   *  Contra los SEGMENTOS de B, no contra sus vértices: dos muestreos de la MISMA curva
   *  colocan los vértices en sitios distintos, y comparar vértice a vértice es justamente
   *  el anclaje que se quiere quitar. */
  const distanciaMaxPx = (A: readonly number[], B: readonly number[]): number => {
    if (B.length < 4) return A.length ? Infinity : 0;
    let peor = 0;
    for (let i = 0; i + 1 < A.length; i += 2) {
      const px = A[i], py = A[i + 1];
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      let mejor = Infinity;
      for (let k = 0; k + 3 < B.length; k += 2) {
        const vx = B[k + 2] - B[k], vy = B[k + 3] - B[k + 1];
        const L2 = vx * vx + vy * vy;
        let t = L2 > 0 ? ((px - B[k]) * vx + (py - B[k + 1]) * vy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - (B[k] + t * vx), dy = py - (B[k + 1] + t * vy);
        const d = Math.hypot(dx, dy);
        if (d < mejor) mejor = d;
        if (mejor <= TOL_PARIDAD_PX * 0.5) break;
      }
      if (mejor > peor) peor = mejor;
    }
    return peor;
  };

  const casos: Array<[string, (x: number) => number]> = [
    ["sin(x)", Math.sin],
    ["x^2 (fuera de banda en bordes)", (x) => x * x],
    ["1/x (polo en 0)", (x) => 1 / x],
    ["tan(x) (polos múltiples)", Math.tan],
    ["x^3 - 2x", (x) => x * x * x - 2 * x],
  ];
  for (const [nombre, f] of casos) {
    for (const interactivo of [false, true]) {
      const tol = interactivo ? TOL_INT : TOL_FINAL;
      test(`${nombre} [${interactivo ? "interactiva" : "final"}]`, () => {
        const nuevo = new TrazadorExplicitoAdaptativo().trazar(fr(f), "id", VP, tol);
        const viejo = muestrearFuncion({
          evalX: f, domX: [VP.domX[0], VP.domX[1]], domY: [VP.domY[0], VP.domY[1]],
          H: VP.altoPx, interactivo,
        });
        igual(nuevo.ramas.length, viejo.polilineas.length, "nº de ramas");
        for (let r = 0; r < nuevo.ramas.length; r++) {
          // El nuevo emite la y REAL (el crosshair la necesita); el legado la trae ya
          // recortada a la banda. Se recorta la del nuevo para comparar lo mismo.
          const pn = aPantalla(nuevo.ramas[r].puntos, VP, true);
          const pv = aPantalla(viejo.polilineas[r], VP, false);
          // En AMBOS sentidos: así ni el nuevo se sale de la curva del legado, ni deja sin
          // cubrir un tramo que el legado sí dibujaba (una sola dirección no vería eso).
          const dn = distanciaMaxPx(pn, pv);
          const dv = distanciaMaxPx(pv, pn);
          assert(
            dn <= TOL_PARIDAD_PX && dv <= TOL_PARIDAD_PX,
            `rama ${r}: separación máxima ${Math.max(dn, dv).toFixed(3)} px ` +
              `(nuevo→viejo ${dn.toFixed(3)}, viejo→nuevo ${dv.toFixed(3)}; tope ${TOL_PARIDAD_PX})`
          );
        }
        // Asíntotas verticales: mismas posiciones.
        const av = viejo.asintotas.slice().sort((a, b) => a - b);
        const an = nuevo.asintotas
          .filter((a) => a.tipo === "vertical")
          .map((a) => a.valor as number)
          .sort((a, b) => a - b);
        igual(an.length, av.length, "nº de asíntotas");
        // En PÍXELES, por lo mismo que la comparación de las ramas: `1e-9` en unidades de
        // mundo ataba la posición a la profundidad exacta de bisección del legado. Una
        // asíntota situada 1,3e−5 más allá —que es lo que cambia al topar el refinado— son
        // 0,0006 px: no existe forma de verla. Lo que sí debe fallar es que se mueva de
        // píxel, y eso lo sigue cazando.
        const porPx = VP.anchoPx / (VP.domX[1] - VP.domX[0]);
        for (let i = 0; i < av.length; i++) {
          const dpx = Math.abs(an[i] - av[i]) * porPx;
          assert(
            dpx <= TOL_PARIDAD_PX,
            `asíntota ${i}: ${dpx.toFixed(4)} px de diferencia (tope ${TOL_PARIDAD_PX})`
          );
        }
      });
    }
  }
});

// ════════════════════════════════════════════════
describe("Sampler explícito: oscilación de amplitud EXPONENCIAL (curva suave, sin asíntotas)", () => {
  // Bug: e^x(cos x−sin x) es SUAVE (sin polos), pero en x grande su amplitud crece tanto que
  //  (1) el refinado se agotaba en los cruces por cero → la línea se rompía y se marcaba una
  //      asíntota fantasma (a partir de ~x=16 no se dibujaba nada visible);
  //  (2) cada pico x=kπ (con f''~e^{kπ}) pasaba la prueba de divergencia y se marcaba también
  //      como asíntota.
  // Debe trazarse como curva CONTINUA que barre la banda hasta el borde, SIN asíntotas.
  const VP_ANCHO = crearViewport([-80, 80], [-40, 40], 1000, 500, 1);
  const Hbanda = VP_ANCHO.domY[1] - VP_ANCHO.domY[0];
  // Nº de tramos casi verticales que barren toda la banda visible con x por encima de `xMin`.
  const barridosBanda = (ramas: readonly Rama[], xMin: number): number => {
    let n = 0;
    for (const rama of ramas) {
      const p = rama.puntos;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ya = p[i + 1], yb = p[i + 3];
        const barre = Math.min(ya, yb) < VP_ANCHO.domY[1] && Math.max(ya, yb) > VP_ANCHO.domY[0] &&
          Math.abs(yb - ya) > Hbanda;
        if (barre && Math.min(p[i], p[i + 2]) > xMin) n++;
      }
    }
    return n;
  };

  test("e^x(cos x−sin x): curva continua hasta el borde, SIN asíntotas fantasma", () => {
    const res = new TrazadorExplicitoAdaptativo()
      .trazar(fr((x) => Math.exp(x) * (Math.cos(x) - Math.sin(x))), "id", VP_ANCHO, TOL_FINAL);
    igual(res.asintotas.length, 0, "una función suave no genera asíntotas");
    assert(barridosBanda(res.ramas, 20) >= 10,
      `la curva barre la banda también lejos del origen (x>20): ${barridosBanda(res.ramas, 20)}`);
  });

  test("los polos REALES sí se detectan (tan x mantiene sus asíntotas)", () => {
    const res = new TrazadorExplicitoAdaptativo().trazar(fr(Math.tan), "id", VP_ANCHO, TOL_FINAL);
    assert(res.asintotas.length > 20, `tan(x) registra sus muchos polos: ${res.asintotas.length}`);
  });
});

// ════════════════════════════════════════════════
describe("Régimen de ALTA FRECUENCIA en explícitas (envolvente estable)", () => {
  const T = new TrazadorExplicitoAdaptativo();
  const vpZ = (semi: number) =>
    crearViewport([-semi * 1.33, semi * 1.33], [-semi, semi], 400, 300, 1);
  const huella = (rs: readonly Rama[]) => {
    let n = 0, s = 0;
    for (const r of rs) { n += r.puntos.length; for (const v of r.puntos) s += Number.isFinite(v) ? v : 1e9; }
    return `${rs.length}:${n}:${s.toFixed(6)}`;
  };

  test("las curvas NORMALES no entran en el régimen (nada cambia para ellas)", () => {
    // La garantía que protege todo el repertorio: si no hay columnas irresolubles, el
    // trazador toma exactamente el camino de siempre. Ninguna de estas debe producir
    // una rama "incierta" (que es la firma de la envolvente).
    const normales: Array<[string, (x: number) => number]> = [
      ["x²", (x) => x * x],
      ["sin x", Math.sin],
      ["tan x", Math.tan],
      ["1/x", (x) => 1 / x],
      ["e^x", Math.exp],
      ["⌊x⌋", Math.floor],
      ["ln|x|", (x) => Math.log(Math.abs(x))],
      ["√(9−x²)", (x) => Math.sqrt(9 - x * x)],
    ];
    for (const [nombre, f] of normales) {
      for (const semi of [7, 1, 0.01]) {
        const r = T.trazar(fr(f), "o", vpZ(semi), TOL_FINAL);
        assert(!r.ramas.some((b) => b.calidad === "incierta"),
          `${nombre} a semiY=${semi}: sin banda de envolvente`);
      }
    }
  });

  test("un POLO no es una oscilación: tan x nunca se convierte en banda", () => {
    // Dentro de la columna que contiene el polo, tan sube a +∞, salta a −∞ y vuelve a
    // subir: leído como secuencia son 2 retornos, la misma firma que un ciclo. Si se
    // confundiera, las asíntotas se volverían bandas (rompía 8 pruebas de la suite).
    for (const semi of [7, 100, 1000]) {
      const r = T.trazar(fr(Math.tan), "o", vpZ(semi), TOL_FINAL);
      assert(!r.ramas.some((b) => b.calidad === "incierta"), `tan x a semiY=${semi}: sin banda`);
    }
  });

  test("sin(1/x) con zoom profundo: las DOS pasadas dan geometría IDÉNTICA (fin del parpadeo)", () => {
    // El parpadeo era exactamente esto: la pasada interactiva y la final muestreaban con
    // densidades distintas y elegían hebras distintas de una banda irresoluble (medido:
    // 122 ramas contra 38, 31% de píxeles distintos). La envolvente se calcula sobre una
    // rejilla de columnas clavada a los PÍXELES y con un número FIJO de muestras, así que
    // ambas pasadas obtienen el mismo resultado bit a bit.
    const f = fr((x) => Math.sin(1 / x));
    for (const semi of [0.01, 0.001]) {
      const vp = vpZ(semi);
      const gi = T.trazar(f, "o", vp, TOL_INT);
      const gf = T.trazar(f, "o", vp, TOL_FINAL);
      const bandasI = gi.ramas.filter((b) => b.calidad === "incierta");
      const bandasF = gf.ramas.filter((b) => b.calidad === "incierta");
      assert(bandasI.length > 0, `semiY=${semi}: hay banda (la zona es irresoluble)`);
      igual(huella(bandasF), huella(bandasI), `semiY=${semi}: banda idéntica en ambas pasadas`);
    }
  });

  test("la banda se marca `incierta` y NO es recorrible (sin `parametro`)", () => {
    // `CalidadRama:"incierta"` existía en el contrato desde el principio sin emitirse nunca.
    // Y una banda no es función de x: omitir `parametro` es cómo se declara que el
    // crosshair/carril no tienen una y única que leer ahí.
    const r = T.trazar(fr((x) => Math.sin(1 / x)), "o", vpZ(0.001), TOL_FINAL);
    const banda = r.ramas.find((b) => b.calidad === "incierta");
    assert(banda !== undefined, "hay banda");
    igual(banda!.parametro, undefined, "la banda no lleva parámetro x");
  });

  test("la amplitud SUBPÍXEL no genera banda (x·sin(1/x) oscila igual pero no se ve)", () => {
    // Mismo número de oscilaciones por píxel que sin(1/x), pero su amplitud junto al
    // origen es menor que un píxel: dibujar una banda ahí sería inventar grosor.
    const r = T.trazar(fr((x) => x * Math.sin(1 / x)), "o", vpZ(7), TOL_FINAL);
    assert(!r.ramas.some((b) => b.calidad === "incierta"), "sin banda con amplitud subpíxel");
  });
});

// ════════════════════════════════════════════════
describe("Continuación implícita", () => {
  const descubrir = new DescubrimientoMuestreado();
  const trazar = new TrazadorContinuacion();
  const geomImplicita = (F: CampoEscalar, vp = VP, tol = TOL_FINAL): readonly Rama[] => {
    const { semillas, singularidades } = descubrir.descubrir(F, vp, tol);
    return trazar.trazar(F, "id", semillas, singularidades, vp, tol);
  };
  const residualMax = (F: CampoEscalar, rama: Rama): number => {
    let m = 0;
    for (let k = 0; k < rama.puntos.length; k += 2) {
      m = Math.max(m, Math.abs(F.eval(rama.puntos[k], rama.puntos[k + 1])));
    }
    return m;
  };
  const rangos = (rama: Rama) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < rama.puntos.length; k += 2) {
      minX = Math.min(minX, rama.puntos[k]); maxX = Math.max(maxX, rama.puntos[k]);
      minY = Math.min(minY, rama.puntos[k + 1]); maxY = Math.max(maxY, rama.puntos[k + 1]);
    }
    return { minX, maxX, minY, maxY };
  };

  test("círculo x²+y²=9 → 1 rama cerrada, tangentes verticales, residual pequeño", () => {
    const F = ce((x, y) => x * x + y * y - 9);
    const ramas = geomImplicita(F);
    igual(ramas.length, 1, "nº de ramas");
    assert(ramas[0].cerrada, "la rama debe ser cerrada");
    assert(residualMax(F, ramas[0]) < 1e-4, `residual ${residualMax(F, ramas[0])}`);
    const r = rangos(ramas[0]);
    aprox(r.maxX, 3, 0.05, "x máx (tangente vertical derecha)");
    aprox(r.minX, -3, 0.05, "x mín (tangente vertical izquierda)");
    aprox(r.maxY, 3, 0.05, "y máx"); aprox(r.minY, -3, 0.05, "y mín");
  });

  test("dos circunferencias disjuntas → 2 ramas cerradas separadas", () => {
    const F = ce((x, y) => ((x + 3) ** 2 + y * y - 1) * ((x - 3) ** 2 + y * y - 1));
    const ramas = geomImplicita(F);
    igual(ramas.length, 2, "nº de ramas");
    for (const rama of ramas) assert(rama.cerrada, "cada componente debe cerrar");
    const centros = ramas.map((rama) => {
      const r = rangos(rama);
      return (r.minX + r.maxX) / 2;
    }).sort((a, b) => a - b);
    aprox(centros[0], -3, 0.1, "centro izquierdo");
    aprox(centros[1], 3, 0.1, "centro derecho");
  });

  test("hipérbola x²−y²=1 → 2 ramas abiertas", () => {
    const F = ce((x, y) => x * x - y * y - 1);
    const ramas = geomImplicita(F);
    igual(ramas.length, 2, "nº de ramas");
    for (const rama of ramas) {
      assert(!rama.cerrada, "las ramas de la hipérbola son abiertas");
      assert(residualMax(F, rama) < 1e-4, `residual ${residualMax(F, rama)}`);
    }
  });

  test("recta implícita x−y=0 → 1 rama abierta con residual ~0", () => {
    const F = ce((x, y) => x - y);
    const ramas = geomImplicita(F);
    igual(ramas.length, 1, "nº de ramas");
    assert(!ramas[0].cerrada, "la recta es abierta");
    assert(residualMax(F, ramas[0]) < 1e-6, `residual ${residualMax(F, ramas[0])}`);
  });

  test("sin solución real (x²+y²+1=0) → 0 ramas", () => {
    igual(geomImplicita(ce((x, y) => x * x + y * y + 1)).length, 0, "no debe haber ramas");
  });

  test("las ramas implícitas no exponen parámetro x (no monovaluadas)", () => {
    const ramas = geomImplicita(ce((x, y) => x * x + y * y - 9));
    igual(ramas[0].parametro, undefined, "no debe haber parametro x");
  });

  test("elipse x²/16+y²/4=1 → 1 rama cerrada", () => {
    const ramas = geomImplicita(ce((x, y) => x * x / 16 + y * y / 4 - 1));
    igual(ramas.length, 1, "nº de ramas");
    assert(ramas[0].cerrada, "la elipse cierra");
  });

  test("círculos concéntricos → 2 ramas cerradas", () => {
    const ramas = geomImplicita(ce((x, y) => (x * x + y * y - 4) * (x * x + y * y - 16)));
    igual(ramas.length, 2, "nº de ramas");
    for (const r of ramas) assert(r.cerrada, "ambos círculos cierran");
  });

  test("dos rectas xy=0 (nodo en origen) → 2 ramas, residual 0", () => {
    const F = ce((x, y) => x * y);
    const ramas = geomImplicita(F);
    igual(ramas.length, 2, "nº de ramas");
    assert(residualMax(F, ramas[0]) === 0 && residualMax(F, ramas[1]) === 0, "residual exacto 0");
  });

  test("casos con nodo no se cuelgan y mantienen residual bajo (best-effort)", () => {
    // Lemniscata y folium: la Fase D no los certifica, pero NO deben colgarse ni
    // explotar el residual (el predictor pasa por encima del nodo). Lock de no-regresión.
    const lemniscata = ce((x, y) => (x * x + y * y) ** 2 - 4 * (x * x - y * y));
    const folium = ce((x, y) => x * x * x + y * y * y - 3 * x * y);
    for (const F of [lemniscata, folium]) {
      const ramas = geomImplicita(F);
      assert(ramas.length >= 1, "debe trazar al menos una rama");
      for (const r of ramas) assert(residualMax(F, r) < 1e-3, `residual ${residualMax(F, r)}`);
    }
  });

  test("dos pasadas: la interactiva conserva la topología con menos puntos", () => {
    const F = ce((x, y) => x * x + y * y - 9);
    const fin = geomImplicita(F, VP, TOL_FINAL);
    const sIntDesc = descubrir.descubrir(F, VP, TOL_INT);
    const intRamas = trazar.trazar(F, "id", sIntDesc.semillas, sIntDesc.singularidades, VP, TOL_INT);
    igual(intRamas.length, fin.length, "mismo nº de ramas en ambas pasadas");
    assert(intRamas[0].cerrada, "sigue cerrando en interactiva");
    const ptsInt = intRamas[0].puntos.length, ptsFin = fin[0].puntos.length;
    assert(ptsInt < ptsFin, `interactiva (${ptsInt}) debe tener menos puntos que final (${ptsFin})`);
  });
});

// ════════════════════════════════════════════════
describe("Caché de geometría (ProveedorConCache)", () => {
  test("misma vista → acierto (1 sola llamada interna, misma referencia)", () => {
    let llamadas = 0;
    const g: Geometria = { ramas: [], singularidades: [], puntosNotables: [], asintotas: [] };
    const interno = { objetoId: "x", geometria: () => { llamadas++; return g; } };
    const c = new ProveedorConCache(interno);
    const a = c.geometria(VP, TOL_FINAL);
    const b = c.geometria(VP, TOL_FINAL);
    igual(llamadas, 1, "debe llamar al proveedor una sola vez");
    assert(a === b, "debe devolver la misma referencia");
  });

  test("cambio de pasada y de región → fallo (recomputa)", () => {
    let llamadas = 0;
    const interno = {
      objetoId: "x",
      geometria: (): Geometria => {
        llamadas++;
        return { ramas: [], singularidades: [], puntosNotables: [], asintotas: [] };
      },
    };
    const c = new ProveedorConCache(interno);
    c.geometria(VP, TOL_FINAL);                 // miss → 1
    c.geometria(VP, TOL_INT);                   // miss (pasada) → 2
    const otro = crearViewport([-7.9, 8.1], [-7, 7], 768, 261, 1);
    c.geometria(otro, TOL_INT);                 // miss (región) → 3
    c.geometria(otro, TOL_INT);                 // hit
    igual(llamadas, 3, "debe recomputar exactamente 3 veces");
  });
});

// ════════════════════════════════════════════════
describe("Lectura de geometría (yEnRamas)", () => {
  const rama: Rama = {
    puntos: Float64Array.from([0, 0, 1, 1, 2, 4]), // y = x² muestreado en 0,1,2
    cerrada: false, calidad: "best-effort", objetoId: "id",
    parametro: Float64Array.from([0, 1, 2]),
  };
  test("interpola linealmente dentro del rango", () => {
    aprox(yEnRamas([rama], 0.5)!, 0.5, 1e-12, "punto medio 0–1");
    aprox(yEnRamas([rama], 1.5)!, 2.5, 1e-12, "punto medio 1–2");
  });
  test("fuera del rango → null", () => {
    igual(yEnRamas([rama], -1), null, "antes del inicio");
    igual(yEnRamas([rama], 2.5), null, "después del fin");
  });
  test("rama sin parámetro → se ignora (null)", () => {
    const sinParam: Rama = { ...rama, parametro: undefined };
    igual(yEnRamas([sinParam], 1), null, "sin parametro no se puede leer por x");
  });
});

// ════════════════════════════════════════════════
describe("Puntos notables desde la polilínea", () => {
  test("parábola y=x²−4 → raíces ±2, vértice (0,−4), intersección-y (0,−4)", () => {
    const ramas = new TrazadorExplicitoAdaptativo()
      .trazar(fr((x) => x * x - 4), "id", VP, TOL_FINAL).ramas;
    const pn = analizarPuntosNotables(ramas, "id");
    const raices = pn.filter((p) => p.tipo === "raiz").map((p) => p.punto.x).sort((a, b) => a - b);
    igual(raices.length, 2, "nº de raíces");
    aprox(raices[0], -2, 0.05, "raíz izquierda");
    aprox(raices[1], 2, 0.05, "raíz derecha");
    const vert = pn.find((p) => p.tipo === "vertice");
    assert(!!vert, "debe haber un vértice");
    aprox(vert!.punto.x, 0, 0.05, "x del vértice");
    aprox(vert!.punto.y, -4, 0.05, "y del vértice");
    const iy = pn.find((p) => p.tipo === "interseccion-y");
    assert(!!iy, "debe haber intersección con Y");
    aprox(iy!.punto.y, -4, 0.05, "y de la intersección-y");
  });

  test("funciones con polos NO generan vértices espurios (segmentos sintéticos dx=0)", () => {
    // El emit sin recortar (rail v2) + emitPolo crean un pico no monótono a la misma x
    // junto a cada polo; antes se contaba como vértice (siempre fuera de pantalla) y
    // contaminaba el conteo. Deben ser 0; las reales (parábola, seno) se conservan.
    const tr = new TrazadorExplicitoAdaptativo();
    const verts = (f: (x: number) => number) =>
      analizarPuntosNotables(tr.trazar(fr(f), "id", VP, TOL_FINAL).ramas, "id")
        .filter((p) => p.tipo === "vertice").length;
    igual(verts((x) => 1 / x), 0, "1/x no tiene vértices");
    igual(verts((x) => Math.tan(x)), 0, "tan(x) no tiene vértices");
    igual(verts((x) => 1 / (x - 2)), 0, "1/(x−2) no tiene vértices");
    igual(verts((x) => x * x - 4), 1, "x²−4 conserva su vértice real");
    igual(verts((x) => Math.sin(x)), 6, "sin(x) conserva sus extremos reales");
  });

  test("intersección-Y: TODAS en curvas multivaluadas; una sola en explícitas", () => {
    // Una y=f(x) cruza el eje Y a lo sumo una vez, pero tan(y)=x lo cruza en cada
    // rama (en y=kπ): antes solo se emitía el PRIMER cruce y el resto se perdía.
    const iy = (src: string): number[] =>
      crearProveedor(construirObjeto(src, "id"))
        .geometria(crearViewport([-12, 12], [-7, 7], 900, 390, 1), TOL_FINAL)
        .puntosNotables.filter((p) => p.tipo === "interseccion-y")
        .map((p) => p.punto.y)
        .sort((a, b) => a - b);
    const tanY = iy("tan(y)=x");
    igual(tanY.length, 5, "tan(y)=x: 5 cruces en y∈[−7,7]");
    tanY.forEach((y, i) => aprox(y, (i - 2) * Math.PI, 0.01, `cruce en y=${i - 2}π`));
    igual(iy("y=sin(x)").length, 1, "explícita: un solo cruce (sin regresión)");
    aprox(iy("y=x^2+1")[0], 1, 0.01, "y=x²+1 cruza en (0,1)");
    igual(iy("y=1/x").length, 0, "1/x no cruza el eje Y");
  });

  test("raíces de EXTREMO de rama (dominio parcial): √(x+1) nace en (−1,0); sin falsas", () => {
    // La curva toca y=0 en el borde del dominio SIN cambio de signo: el sampler
    // bisecta el borde hasta subpíxel y el extremo queda a <½px de y=0. Los
    // extremos pegados al borde x de la vista NO cuentan (recorte, no dominio:
    // las colas de 1/x o e^(−x) serían raíces falsas).
    const raices = (src: string, vp = crearViewport([-12, 12], [-7, 7], 900, 390, 1)): number[] =>
      crearProveedor(construirObjeto(src, "id")).geometria(vp, TOL_FINAL)
        .puntosNotables.filter((p) => p.tipo === "raiz")
        .map((p) => p.punto.x);
    const r1 = raices("y=sqrt(x+1)");
    igual(r1.length, 1, "√(x+1): una raíz");
    aprox(r1[0], -1, 0.01, "en x=−1");
    const r2 = raices("tan(y)(x^2+1)=sqrt(x+1)");
    igual(r2.length, 1, "trig periódica: una raíz");
    aprox(r2[0], -1, 0.01, "en x=−1 (la rama k=0 nace en el eje X)");
    igual(raices("y=x^2-4").length, 2, "x²−4 conserva sus 2 raíces (sin duplicados)");
    igual(raices("y=1/x").length, 0, "1/x: sin raíces falsas");
    igual(raices("y=1/x", crearViewport([-1200, 1200], [-700, 700], 900, 390, 1)).length, 0,
      "1/x muy alejado: sin raíces falsas en el borde de la vista");
    igual(raices("y=exp(-x)", crearViewport([-5, 40], [-7, 7], 900, 390, 1)).length, 0,
      "e^(−x): sin raíz falsa aunque la cola sea subpíxel");
  });

  test("resumenPuntosNotables (ⓘ geométrico): listas sin capar + estados infinitas", () => {
    const vp = crearViewport([-12, 12], [-7, 7], 900, 390, 1);
    const resumen = (src: string) => {
      const g = crearProveedor(construirObjeto(src, "id")).geometria(vp, TOL_FINAL);
      return resumenPuntosNotables(g.ramas, "id", vp);
    };
    const r = resumen("tan(y)=x");
    igual(estadoGrupo(r.interseccionesY.length, true), "infinitas", "tan(y)=x: intersecciones-Y infinitas");
    igual(r.raices.length, 1, "tan(y)=x: raíz única (origen)");
    igual(r.vertices.length, 0, "tan(y)=x: sin vértices");
    const rp = resumen("tan(y)(x^2+1)=sqrt(x+1)");
    igual(estadoGrupo(rp.vertices.length, true), "infinitas", "periódica: vértices infinitos");
    aprox(rp.raices[0].punto.x, -1, 0.01, "periódica: raíz (−1,0) en el resumen");
  });

  test("Lissajous (sin 2t, sin 3t): puntos notables FINITOS por período (no 'infinitas')", () => {
    // Una paramétrica se traza sobre UN período [0,2π]: es un conjunto ACOTADO, así
    // que sus cruces con los ejes son FINITOS (la periodicidad en t RE-RECORRE la
    // curva, no añade cruces). El bug histórico: el ⓘ veía `sin(` en la fórmula y
    // aplicaba la heurística "trig ⇒ infinitas" (válida solo para y=f(x)/implícitas
    // sobre x∈ℝ). El host ahora fuerza esTrig=false para paramétricas/polares → se
    // cuentan los eventos de un período, deduplicados por posición (lo hace resumen).
    const vp = crearViewport([-12, 12], [-7, 7], 900, 390, 1);
    const g = crearProveedor(construirObjeto("(sin(2t), sin(3t))", "id")).geometria(vp, TOL_FINAL);
    const r = resumenPuntosNotables(g.ramas, "id", vp);

    // Analíticamente, sobre [0,2π): x=sin(2t)=0 en t=kπ/2 → Y-cruces en y∈{0,−1,1};
    // y=sin(3t)=0 en t=kπ/3 → X-cruces en x∈{0, ±√3/2}. Tras deduplicar: 3 y 3.
    igual(r.interseccionesY.length, 3, "3 intersecciones-Y distintas por período");
    igual(r.raices.length, 3, "3 raíces distintas por período");
    for (const p of r.interseccionesY) assert(Math.abs(p.punto.y) < 1.001, "Y-cruce acotado en [−1,1]");
    assert(r.raices.some((p) => Math.abs(Math.abs(p.punto.x) - Math.sqrt(3) / 2) < 0.02), "raíz en ±√3/2");
    assert(r.raices.some((p) => Math.abs(p.punto.x) < 0.02), "raíz en x=0");

    // Con la clasificación acotada (esTrig=false) NINGUNA categoría es "infinitas":
    // son finitas ("normal") o, si hubiera muchas en la vista, "demasiadas" —nunca
    // el falso "infinitas" que salía al tratar la tupla como una trig de x.
    for (const n of [r.interseccionesY.length, r.raices.length, r.vertices.length])
      assert(estadoGrupo(n, false) !== "infinitas", "paramétrica acotada: jamás 'infinitas'");
    // Y se documenta el bug que se corrige: con esTrig=true SÍ daría el falso positivo.
    igual(estadoGrupo(r.interseccionesY.length, true), "infinitas", "regresión: esTrig=true reproduce el bug");

    // Vértices = extremos GEOMÉTRICOS reales de la curva (no del parámetro), COMPLETOS:
    // 6 en y (tangente horizontal, dy/dt=0 → cimas/valles en y=±1) + 4 en x (tangente
    // vertical, dx/dt=0 → puntos más a izq/der en x=±1). Los 10 lados del "bounding
    // box" de la Lissajous. Cada uno debe ser tangente horizontal O vertical.
    igual(r.vertices.length, 10, "10 extremos geométricos (6 en y + 4 en x)");
    const tieneVert = (vx: number, vy: number) =>
      r.vertices.some((p) => Math.abs(p.punto.x - vx) < 0.02 && Math.abs(p.punto.y - vy) < 0.02);
    assert(tieneVert(1, Math.SQRT1_2) && tieneVert(-1, -Math.SQRT1_2), "extremos en x (tang. vertical) (±1,±0.707)");
    assert(tieneVert(0, 1) && tieneVert(0, -1), "extremos en y (tang. horizontal) (0,±1)");
    // Cada vértice es un extremo REAL de la curva: tangente ~horizontal (dy/dt≈0) o
    // ~vertical (dx/dt≈0). Recupera el t más cercano y comprueba que UNA derivada se
    // anula. Descarta que sean artefactos del muestreo del parámetro.
    const cx = (t: number) => Math.sin(2 * t), cy = (t: number) => Math.sin(3 * t);
    const dcx = (t: number) => 2 * Math.cos(2 * t), dcy = (t: number) => 3 * Math.cos(3 * t);
    for (const p of r.vertices) {
      let bt = 0, bd = Infinity;
      for (let t = 0; t < 2 * Math.PI; t += 5e-4) {
        const d = Math.hypot(cx(t) - p.punto.x, cy(t) - p.punto.y);
        if (d < bd) { bd = d; bt = t; }
      }
      assert(Math.abs(dcy(bt)) < 0.06 || Math.abs(dcx(bt)) < 0.06,
        `vértice (${p.punto.x.toFixed(2)},${p.punto.y.toFixed(2)}) es extremo real (tangente H o V)`);
    }
  });

  test("círculo paramétrico (cos t, sin t): 4 extremos incl. el de la COSTURA (1,0)", () => {
    // Verifica el manejo del cierre: el punto más a la derecha (1,0) cae en t=0, la
    // costura de la rama cerrada. Sin tratar la costura como punto interior se perdería.
    const vp = crearViewport([-2, 2], [-1.6, 1.6], 900, 720, 1);
    const g = crearProveedor(construirObjeto("(cos(t), sin(t))", "id")).geometria(vp, TOL_FINAL);
    const r = resumenPuntosNotables(g.ramas, "id", vp);
    igual(r.vertices.length, 4, "4 extremos: (±1,0) izq/der y (0,±1) arriba/abajo");
    const tiene = (vx: number, vy: number) =>
      r.vertices.some((p) => Math.abs(p.punto.x - vx) < 0.02 && Math.abs(p.punto.y - vy) < 0.02);
    assert(tiene(1, 0), "extremo derecho (1,0) en la costura t=0 (no se pierde)");
    assert(tiene(-1, 0) && tiene(0, 1) && tiene(0, -1), "los otros tres extremos");
  });

  test("INVARIANZA implícita↔explícita: x³+y³=9 da los mismos puntos que y=∛(9−x³)", () => {
    const vp = crearViewport([-12, 12], [-7, 7], 900, 390, 1);
    const firma = (src: string): string =>
      crearProveedor(construirObjeto(src, "id")).geometria(vp, TOL_FINAL).puntosNotables
        .map((p) => `${p.tipo}(${p.punto.x.toFixed(2)},${p.punto.y.toFixed(2)})`).sort().join(" ");
    // La implícita se traza por continuación pero despeja y=f(x) para los puntos notables.
    igual(firma("x^3 + y^3 = 9"), firma("y = cbrt(9 - x^3)"), "cúbica implícita ≡ explícita");
    assert(firma("x^3 + y^3 = 9").includes("raiz(2.08,0.00)"), "tiene la raíz (∛9, 0)");
    assert(firma("x^3 + y^3 = 9").includes("interseccion-y(0.00,2.08)"), "tiene la intersección Y");

    // Círculo: las dos ramas ±√ comparten extremos → DEDUP (sin raíces repetidas).
    const circ = crearProveedor(construirObjeto("x^2+y^2=9", "id")).geometria(vp, TOL_FINAL).puntosNotables;
    const raicesCirc = circ.filter((p) => p.tipo === "raiz");
    igual(raicesCirc.length, 2, "círculo: exactamente 2 raíces (±3), no duplicadas");

    // No despejable (a·yⁿ+c(x) no aplica) → sin puntos (fallback), sin romper.
    const noSep = crearProveedor(construirObjeto("x^2 + y^2 + x*y = 9", "id")).geometria(vp, TOL_FINAL);
    igual(noSep.puntosNotables.length, 0, "implícita no separable → sin puntos (fallback implícito)");
  });
});

// ════════════════════════════════════════════════
describe("Continuación en singularidades (cúspides, nodos, tacnodos)", () => {
  const descubrir = new DescubrimientoMuestreado();
  const trazar = new TrazadorContinuacion();
  const geom = (F: CampoEscalar, vp = VP, tol = TOL_FINAL): readonly Rama[] => {
    const { semillas, singularidades } = descubrir.descubrir(F, vp, tol);
    return trazar.trazar(F, "id", semillas, singularidades, vp, tol);
  };
  // Reversiones: giros > 120° entre segmentos consecutivos = oscilación (bug clásico
  // del predictor-corrector cerca de cúspides). Debe ser 0 con el paso adaptativo.
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
  // Cobertura visual contra ground-truth (% de puntos gt a < d de algún vértice).
  const cobertura = (gt: [number, number][], ramas: readonly Rama[], d: number): number => {
    const d2 = d * d; let cub = 0, tot = 0;
    for (const [gx, gy] of gt) {
      if (gx < -16 || gx > 16 || gy < -14 || gy > 14) continue;
      tot++;
      let ok = false;
      for (const r of ramas) {
        const p = r.puntos;
        for (let k = 0; k < p.length; k += 2) {
          const dx = p[k] - gx, dy = p[k + 1] - gy;
          if (dx * dx + dy * dy < d2) { ok = true; break; }
        }
        if (ok) break;
      }
      if (ok) cub++;
    }
    return tot ? 100 * cub / tot : 100;
  };
  const ramasY = (ramas: readonly Rama[]) => {
    let pos = 0, neg = 0;
    for (const r of ramas) for (let k = 1; k < r.puntos.length; k += 2) {
      if (r.puntos[k] > 0.05) pos++; else if (r.puntos[k] < -0.05) neg++;
    }
    return { pos, neg };
  };

  test("cúspide y²=x³ NO oscila (0 reversiones) y traza ambas ramas", () => {
    const F = ce((x, y) => y * y - x * x * x);
    const ramas = geom(F);
    igual(reversiones(ramas), 0, "no debe oscilar en la cúspide");
    const { pos, neg } = ramasY(ramas);
    assert(pos > 50 && neg > 50, `ambas ramas (y+:${pos}, y-:${neg})`);
  });

  test("cardioide con cúspide NO oscila (0 reversiones)", () => {
    const F = ce((x, y) => (x * x + y * y - x) ** 2 - (x * x + y * y));
    igual(reversiones(geom(F)), 0, "no debe oscilar en la cúspide de la cardioide");
  });

  test("folium x³+y³=3xy: cobertura completa y sin oscilación, estable al trasladar", () => {
    const F = ce((x, y) => x * x * x + y * y * y - 3 * x * y);
    const gt: [number, number][] = [];
    for (let i = 0; i <= 4000; i++) {
      const t = -50 + i * 0.025, d = 1 + t * t * t;
      if (Math.abs(d) > 1e-6) gt.push([3 * t / d, 3 * t * t / d]);
    }
    for (const off of [0, 0.137, 0.274]) {
      const vp = crearViewport([-8 + off, 8 + off], [-7 + off * 0.5, 7 + off * 0.5], 768, 261, 1);
      const ramas = geom(F, vp);
      assert(cobertura(gt, ramas, 0.15) > 99, `cobertura ${cobertura(gt, ramas, 0.15).toFixed(1)}% (off=${off})`);
      igual(reversiones(ramas), 0, `sin oscilación (off=${off})`);
    }
  });

  test("lemniscata: sin oscilación y cuerda acotada (sin saltos grandes)", () => {
    const F = ce((x, y) => (x * x + y * y) ** 2 - 4 * (x * x - y * y));
    const ramas = geom(F);
    igual(reversiones(ramas), 0, "sin oscilación");
    const paso = ((VP.domX[1] - VP.domX[0]) / VP.anchoPx) * 2.5;
    let maxChord = 0;
    for (const r of ramas) for (let k = 2; k < r.puntos.length; k += 2) {
      maxChord = Math.max(maxChord, Math.hypot(r.puntos[k] - r.puntos[k - 2], r.puntos[k + 1] - r.puntos[k - 1]));
    }
    assert(maxChord < paso * 3, `cuerda máx ${(maxChord / paso).toFixed(1)}×paso (sin saltos)`);
  });

  test("tacnodo y²=x⁴: dedup evita el re-trazado (cuenta de ramas acotada) sin oscilar", () => {
    const F = ce((x, y) => y * y - x * x * x * x);
    for (const off of [0, 0.137, 0.274, 0.411]) {
      const vp = crearViewport([-8 + off, 8 + off], [-7 + off * 0.5, 7 + off * 0.5], 768, 261, 1);
      const ramas = geom(F, vp);
      assert(ramas.length >= 2 && ramas.length <= 3, `ramas=${ramas.length} (off=${off}) acotado`);
      igual(reversiones(ramas), 0, `sin oscilación (off=${off})`);
    }
  });

  test("curvas suaves no se fragmentan: círculo=1, hipérbola=2, no hay duplicados", () => {
    igual(geom(ce((x, y) => x * x + y * y - 9)).length, 1, "círculo sigue siendo 1 rama");
    igual(geom(ce((x, y) => x * x - y * y - 1)).length, 2, "hipérbola sigue siendo 2 ramas");
  });
});

// ════════════════════════════════════════════════
describe("Robustez y casos límite (auditoría / break)", () => {
  const descubrir = new DescubrimientoMuestreado();
  const trazar = new TrazadorContinuacion();

  test("descubrimiento NO siembra en un polo (salto ±∞), sí en un cero real", () => {
    const vp = crearViewport([0, 1], [-1, 1], 768, 261, 1);
    // 1/(x−0.5): polo en x=0.5, sin ceros → ninguna semilla (salto, no cruce).
    igual(descubrir.descubrir(ce((x) => 1 / (x - 0.5)), vp, TOL_FINAL).semillas.length, 0,
      "un polo no debe generar semillas espurias");
    // x−0.5: cero real en x=0.5 → sí hay semillas.
    assert(descubrir.descubrir(ce((x) => x - 0.5), vp, TOL_FINAL).semillas.length > 0,
      "un cero real sí genera semillas");
  });

  test("implícito patológico sin(x·y)=0 con zoom-out: finito y acotado por presupuesto", () => {
    const F = ce((x, y) => Math.sin(x * y));
    const vp = crearViewport([-5e5, 5e5], [-3e5, 3e5], 768, 261, 1);
    const { semillas, singularidades } = descubrir.descubrir(F, vp, TOL_FINAL);
    const ramas = trazar.trazar(F, "id", semillas, singularidades, vp, TOL_FINAL);
    let pts = 0, noFin = 0;
    for (const r of ramas) {
      pts += r.puntos.length / 2;
      for (let k = 0; k < r.puntos.length; k++) if (!Number.isFinite(r.puntos[k])) noFin++;
    }
    igual(noFin, 0, "sin coordenadas no finitas");
    assert(pts < 40000, `puntos acotados por el presupuesto (${pts})`);
  });

  test("continuación es determinista (misma entrada/vista → misma geometría)", () => {
    const F = ce((x, y) => x * x + y * y - 9);
    const tr = (s = descubrir.descubrir(F, VP, TOL_FINAL).semillas) =>
      trazar.trazar(F, "id", s, [], VP, TOL_FINAL);
    const a = tr(), b = tr();
    igual(a.length, b.length, "mismo nº de ramas");
    igual(a[0].puntos.length, b[0].puntos.length, "mismo nº de puntos");
    for (let k = 0; k < a[0].puntos.length; k++) igual(a[0].puntos[k], b[0].puntos[k], `punto ${k}`);
  });

  test("explícito: ramas sin coordenadas no finitas en funciones extremas", () => {
    const fns: Array<(x: number) => number> = [
      (x) => Math.exp(x), (x) => 1 / x, (x) => Math.tan(x), (x) => x ** 1000, (x) => Math.log(x),
    ];
    for (const f of fns) {
      const { ramas } = new TrazadorExplicitoAdaptativo().trazar(fr(f), "id", VP, TOL_FINAL);
      for (const r of ramas) for (let k = 0; k < r.puntos.length; k++) {
        assert(Number.isFinite(r.puntos[k]), "toda coordenada de rama debe ser finita");
      }
    }
  });

  test("entradas degeneradas/ inválidas no rompen (parser → sin puntos, sin throw)", () => {
    // Estas clasifican como explícitas y compilan a f→NaN, o implícitas sin solución.
    for (const src of ["y=", "y=*/", "sin(x", "y=z"]) {
      const o = construirObjeto(src, "id");
      igual(o.tipo, "explicita", `${src} → explícita`);
      const { ramas } = new TrazadorExplicitoAdaptativo()
        .trazar((o as ObjetoExplicito).f, "id", VP, TOL_FINAL);
      assert(Array.isArray(ramas), "devuelve ramas (posiblemente vacías) sin lanzar");
    }
  });
});
