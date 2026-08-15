// ─────────────────────────────────────────────
// tests · Despeje: batería graduada y frontera del despejador
// ─────────────────────────────────────────────
//
// Recorre el despejador de lo trivial a lo imposible y fija DÓNDE ESTÁ LA FRONTERA:
// qué tiene forma cerrada y qué no. Su valor está tanto en lo que despeja como en lo
// que declara imposible, porque comprueba que el motor NO inventa.
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual } from "../runner";
import { despejarEcuaciones } from "../../src/despejar";
import { simplificarEcuaciones } from "../../src/simplificar";
import { crearFuncionReal } from "../../src/core/fields/funcionRealMathjs";
import { bloqueALatex } from "../../src/latex";
import { expandirDobleSigno } from "../../src/core/parsing/dobleSigno";

// ─────────────────────────────────────────────
// Símbolos de entrada: doble signo (±, ∓) y comandos LaTeX
// ─────────────────────────────────────────────
//
// Antes, TODO comando LaTeX no reconocido caía en el barrido residual (`\\cmd` → `cmd`) y el
// producto implícito lo partía letra a letra (`\times` → `t*i*m*e*s`): símbolos libres, NaN en
// todo x, plano vacío SIN error. Y `\pm` ni siquiera era evaluable. Estas pruebas fijan las
// tres piezas: los símbolos con equivalente directo se traducen, el ± produce sus DOS ramas
// reales, y lo que no se sabe traducir se DICE (etiqueta) en vez de graficarse como basura.

// ─────────────────────────────────────────────
// Batería graduada: de lo trivial a lo imposible
// ─────────────────────────────────────────────
//
// Recorre el despejador de menor a mayor dificultad y, sobre todo, MARCA LA FRONTERA: dónde
// acaba lo que la teoría permite automatizar y empieza lo que no tiene forma cerrada. El valor
// de la última sección es tanto como el de la primera —fija que el motor NO inventa—, y si
// alguna vez una de esas pasa a despejarse, el test avisa de que la frontera se movió.
//
// Cada caso resoluble se verifica NUMÉRICAMENTE contra la ecuación original: no basta con que
// salga un `y = …`, cada rama tiene que caer sobre la curva de verdad.
describe("Batería graduada del despejador: de trivial a imposible", () => {
  const completo = (ec: string): boolean => /^y = /.test(despejarEcuaciones([ec])[0]);

  /** ¿Toda rama de la despejada cae sobre la curva original? (soundness, muestreada). */
  const fiel = (ec: string, D: (x: number, y: number) => number): { ok: boolean; detalle: string } => {
    const rhs = despejarEcuaciones([ec])[0].replace(/^y = /, "");
    let comprobados = 0;
    for (const K of [-1, 0, 1, 2]) {
      const conK = rhs.replace(/fam[N]?\(k,([^)]*)\)/g, `(${K}*($1))`);
      for (const rama of expandirDobleSigno(conK)) {
        let f: ReturnType<typeof crearFuncionReal>;
        try { f = crearFuncionReal(rama); } catch { continue; }
        for (const x of [-3.3, -1.7, -0.6, 0.4, 1.2, 2.5, 4.1]) {
          const y = f.eval(x);
          if (typeof y !== "number" || !Number.isFinite(y)) continue;
          const d = D(x, y);
          if (!Number.isFinite(d)) continue;
          comprobados++;
          if (Math.abs(d) > 1e-6 * (1 + x * x + y * y))
            return { ok: false, detalle: `x=${x}, y=${y} ⇒ D=${d} (debería ser 0)` };
        }
      }
    }
    return { ok: comprobados > 0, detalle: `${comprobados} puntos comprobados` };
  };

  const resoluble = (ec: string, D: (x: number, y: number) => number, nota: string): void => {
    assert(completo(ec), `${nota}: debería despejarse del todo — ${despejarEcuaciones([ec])[0]}`);
    const r = fiel(ec, D);
    assert(r.ok, `${nota}: rama fuera de la curva original — ${r.detalle}`);
  };

  test("nivel 1 — lineal y polinómico directo", () => {
    resoluble("2*y + 3*x = 6", (x, y) => 2 * y + 3 * x - 6, "2y+3x=6");
    resoluble("y/3 - x = 1", (x, y) => y / 3 - x - 1, "y/3−x=1");
    resoluble("x^2 + y^2 = 9", (x, y) => x * x + y * y - 9, "circunferencia");
    resoluble("x^3 + y^3 = 9", (x, y) => x ** 3 + y ** 3 - 9, "cúbica simétrica");
    resoluble("x*y = 4", (x, y) => x * y - 4, "hipérbola xy=4");
  });

  test("nivel 2 — una capa invertible alrededor de y", () => {
    resoluble("ln(y) = x", (x, y) => Math.log(y) - x, "ln y = x");
    resoluble("e^y = x", (x, y) => Math.exp(y) - x, "e^y = x");
    resoluble("2^y = x", (x, y) => 2 ** y - x, "2^y = x (base ≠ e)");
    resoluble("sinh(y) = x", (x, y) => Math.sinh(y) - x, "sinh y = x");
    resoluble("x - sqrt(y) = 2", (x, y) => x - Math.sqrt(y) - 2, "√y con guarda");
    resoluble("abs(y) = x^2", (x, y) => Math.abs(y) - x * x, "|y| = x² (guarda trivial)");
  });

  test("nivel 3 — torres de composición (el inversor recursivo)", () => {
    resoluble("(y+1)^3 = x", (x, y) => (y + 1) ** 3 - x, "base compuesta impar");
    resoluble("exp(y^3) = x", (x, y) => Math.exp(y ** 3) - x, "e^{y³}");
    resoluble("e^(y^2) = x", (x, y) => Math.exp(y * y) - x, "e^{y²} (par ⇒ ± y guarda)");
    resoluble("ln(y^3 + 1) = x", (x, y) => Math.log(y ** 3 + 1) - x, "ln(y³+1)");
    resoluble("sqrt(tan(y) + 1) = x", (x, y) => Math.sqrt(Math.tan(y) + 1) - x, "√(tan y+1)");
    resoluble("(ln(y))^2 = x", (x, y) => Math.log(y) ** 2 - x, "(ln y)²");
    resoluble("nthRoot(y^3 - 2, 4) = x", (x, y) => (y ** 3 - 2) ** 0.25 - x, "⁴√(y³−2)");
  });

  test("nivel 4 — familias infinitas y dominio restringido a la vez", () => {
    resoluble("tan(y) + x = 2", (x, y) => Math.tan(y) + x - 2, "familia kπ");
    resoluble("sin(2*y) = x", (x, y) => Math.sin(2 * y) - x, "argumento compuesto");
    resoluble("1/(x^2 + y^2) = 3", (x, y) => 1 / (x * x + y * y) - 3, "recíproco → círculo");
    resoluble("sin(1/(x^2+y^2)) = 0", (x, y) => Math.sin(1 / (x * x + y * y)), "T(u)=0, k∈ℕ");
    resoluble("abs((y+1)^2 - 3) = x", (x, y) => Math.abs((y + 1) ** 2 - 3) - x, "dos ejes de signo");
  });

  test("nivel 5 — lo que exige un método, no una inversa", () => {
    resoluble("3*y^2 + 2*x*y + x^2 - 4 = 0", (x, y) => 3 * y * y + 2 * x * y + x * x - 4, "cuadrática general");
    resoluble("x^2*y^2 + x^2 + y^2 = 4", (x, y) => x * x * y * y + x * x + y * y - 4, "lineal en y²");
    resoluble("(x^2+y^2)^2 - 2*(x^2-y^2) = 0", (x, y) => (x * x + y * y) ** 2 - 2 * (x * x - y * y), "lemniscata (bicuadrática)");
    resoluble("cos(y)^2 - cos(y) = x", (x, y) => Math.cos(y) ** 2 - Math.cos(y) - x, "cuadrática en cos y");
    resoluble("(x^2 + y^2 - 1)^3 = x^2*y^3", (x, y) => (x * x + y * y - 1) ** 3 - x * x * y ** 3, "corazón (raíz impar)");
  });

  test("Simplificar es IDEMPOTENTE: el formato no depende de cómo se construyó el árbol", () => {
    // Hallado por la batería de verificación: `1/(y/3)` daba `(3) / (y)` y al simplificar OTRA
    // vez `3 / y`. Los paréntesis sobre un átomo son residuo de la CONSTRUCCIÓN del nodo
    // (`combinarFracciones` los pone), no información, y el formateador los conservaba: dos
    // árboles iguales se serializaban distinto. Como el motor compara STRINGS para saber si una
    // transformación cambió algo, "Simplificar" parecía hacer algo la segunda vez.
    igual(simplificarEcuaciones(["1/(y/3) = x^2 - 1"])[0], "3 / y = x ^ 2 - 1", "1/(y/3) ⇒ 3/y");
    const casos = [
      "1/(y/3) = x^2 - 1", "1/(y/2) = cos(x) + 1", "(x^2-1)/(x+1) = y",
      "sin(x)/2 + cos(x)/3 = y/x", "y = (2*x + 4)/2", "y = 1/(1 + 1/(1 + x))",
      "y^2 = (x^4 - 1)/(x^2 - 1)", "y = sqrt(x)/(sqrt(x)*2)", "abs(y)/4 = x/8",
    ];
    for (const ec of casos) {
      const una = simplificarEcuaciones([ec])[0];
      igual(simplificarEcuaciones([una])[0], una, `idempotente: ${ec}`);
    }
  });

  test("nivel 6 — IMPOSIBLES: sin forma cerrada, el motor no inventa", () => {
    // Cada una es un LÍMITE MATEMÁTICO, no una carencia de implementación. Si alguna empieza
    // a despejarse, o se ha añadido la función especial correspondiente (y hay que actualizar
    // este test) o el motor está inventando una respuesta: en ambos casos hay que mirarlo.
    const imposibles: Array<[string, string]> = [
      ["y^y = x", "no hay forma cerrada elemental"],
      ["y + e^y = x", "requiere la W de Lambert (no soportada)"],
      ["sin(y) + y = x", "trascendente mixta (ecuación de Kepler)"],
      ["y^5 + y = x", "grado ≥5 general: Abel–Ruffini"],
      ["y^5 + x*y + 1 = 0", "quíntica con coeficiente en x"],
      ["sin(y) + cos(y) = x", "no es polinomio en cos y por sí solo"],
      ["ln(y) + y = x", "trascendente mixta (Lambert de nuevo)"],
      ["x^3 + y^3 = 3*x*y", "folium: cúbica en y (Cardano, fuera de alcance)"],
      ["abs(abs((y+1)^2 - 3) - 2) = x", "tres ± independientes: >4 ramas"],
      ["tan(y) + y = x", "trascendente mixta"],
    ];
    for (const [ec, porque] of imposibles)
      assert(!completo(ec), `NO debe despejarse (${porque}): ${ec} → ${despejarEcuaciones([ec])[0]}`);
    // …y aun así, ninguna revienta ni se queda a medias de forma ilegible: todas siguen siendo
    // ecuaciones re-parseables (el panel las pinta tal cual).
    for (const [ec] of imposibles) {
      const salida = despejarEcuaciones([ec])[0];
      assert(salida.includes("="), `sigue siendo una ecuación: ${ec} → ${salida}`);
      assert(bloqueALatex([salida]).length > 0, `se puede pintar: ${ec}`);
    }
  });
});
