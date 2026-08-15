// ─────────────────────────────────────────────
// tests · Despeje: familia radical/cuadrática y su presupuesto
// ─────────────────────────────────────────────
//
// La familia que obliga al despejador a elevar al cuadrado y a aplicar la fórmula
// cuadrática general (el corazón, la lemniscata, la raíz impar), junto con la GUARDA
// DE EXPANSIÓN de `rationalize` que decide cuáles de esas curvas caben en el
// presupuesto de monomios. Van juntas porque son la misma frontera vista por sus dos
// caras: qué se puede desarrollar y qué se despeja gracias a ello.
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { despejeCorrecto } from "./comun";
import { despejarEcuaciones, despejarY } from "../../src/despejar";
import { clasificarDespeje, tieneFamilia } from "../../src/despejeInverso";
import { simplificarEcuaciones } from "../../src/simplificar";
import { costeExpansion, rationalizeSeguro, LIMITE_EXPANSION, type Nodo } from "../../src/formatoExpr";
import { crearFuncionReal } from "../../src/core/fields/funcionRealMathjs";
import { bloqueALatex } from "../../src/latex";
import { parse } from "mathjs";
import { expandirDobleSigno } from "../../src/core/parsing/dobleSigno";

describe("Despejar y: raíz impar + cuadrática general (familia del corazón)", () => {
  test("corazón (x²+y²−1)³=x²y³ → y = (∛(x²) ± √(∛(x⁴)+4−4x²))/2, COMPLETO", () => {
    const r = despejarY("\\left(x^{2}+y^{2}-1\\right)^{3}=x^{2}y^{3}");
    assert(r !== null && r.completo, "el despeje del corazón es COMPLETO (antes: parcial)");
    // `∛(x⁴)` se pinta `x∛x` por la extracción euclídea, igual que `x^{4/3}` escrito como
    // potencia: 4 = 1·3 + 1. Con índice IMPAR la identidad vale en todo ℝ (∛ conserva el
    // signo), y las dos formas coinciden punto por punto.
    igual(
      r!.latex,
      "y=\\frac{\\sqrt[3]{x^{2}} \\pm \\sqrt{x\\sqrt[3]{x}+4-4x^{2}}}{2}",
      "forma de la fórmula cuadrática con ± en el numerador"
    );
    // Y es CORRECTO: ambas ramas cumplen la ecuación original allí donde son reales.
    despejeCorrecto("(x^2+y^2-1)^3=x^2*y^3", (x, y) => (x * x + y * y - 1) ** 3 - x * x * y ** 3);
  });

  test("la MISMA curva despeja igual con `=` que como expresión suelta (todo a la izquierda)", () => {
    // La reducción por raíz impar miraba solo los LADOS de la ecuación; con la curva escrita
    // en su forma natural (`D=0`, o una expresión suelta) la potencia es un TÉRMINO, no un
    // lado, y el corazón salía "no se puede despejar y" mientras que con `=` sí despejaba.
    const conIgual = despejarY("\\left(x^{2}+y^{2}-1\\right)^{3}=x^{2}y^{3}");
    const suelta = despejarY("\\left(x^{2}+y^{2}-1\\right)^{3}-x^{2}y^{3}");
    const cero = despejarY("\\left(x^{2}+y^{2}-1\\right)^{3}-x^{2}y^{3}=0");
    assert(suelta !== null && suelta.completo, "expresión suelta: despeje COMPLETO");
    igual(suelta!.latex, conIgual!.latex, "misma curva, mismo despeje que con `=`");
    igual(cero!.latex, conIgual!.latex, "y también escrita `…=0`");
    despejeCorrecto("(x^2+y^2-1)^3-x^2*y^3", (x, y) => (x * x + y * y - 1) ** 3 - x * x * y ** 3);
    // El signo del término con la potencia importa: `x²y³ − (x²+y²−1)³ = 0` es la misma curva.
    despejeCorrecto("x^2*y^3-(x^2+y^2-1)^3=0", (x, y) => x * x * y ** 3 - (x * x + y * y - 1) ** 3);
  });

  test("la raíz impar libera la y y reduce el grado (varios n)", () => {
    despejeCorrecto("(x+y^2)^3=8*x^3", (x, y) => (x + y * y) ** 3 - 8 * x ** 3);
    despejeCorrecto("(y^2-x)^5=32*y^5", (x, y) => (y * y - x) ** 5 - 32 * y ** 5);
    despejeCorrecto("(x^2+y^2)^3=y^3", (x, y) => (x * x + y * y) ** 3 - y ** 3);
    // Sin y en el otro lado: (x+y)³=x³ ⇒ x+y=x ⇒ y=0 (la potencia impar es inyectiva).
    igual(despejarEcuaciones(["(x+y)^3=x^3"])[0], "y = 0", "(x+y)³=x³ ⇒ y=0");
    igual(despejarEcuaciones(["(x+y)^5=32*x^5"])[0], "y = x", "(x+y)⁵=32x⁵ ⇒ y=x");
  });

  test("potencia PAR no se reduce (ⁿ√(uⁿ)=|u| exigiría un ±): sin cambio de comportamiento", () => {
    // (x+y)²=x² NO puede reducirse a x+y=x (perdería la rama y=−2x). Debe seguir sin
    // inventarse un despeje incorrecto: o queda parcial, o el despeje que dé ha de ser CORRECTO.
    const s = despejarEcuaciones(["(x+y)^2=x^2"])[0];
    if (/^y = /.test(s)) despejeCorrecto("(x+y)^2=x^2", (x, y) => (x + y) ** 2 - x * x);
  });

  test("cuadrática general en y: los seis casos de manual", () => {
    igual(despejarEcuaciones(["x^2+y^2=2*x*y+4"])[0], "y = x + pm(2)", "x²+y²=2xy+4 ⇒ y=x±2");
    despejeCorrecto("3*y^2+2*x*y+x^2-4=0", (x, y) => 3 * y * y + 2 * x * y + x * x - 4);
    despejeCorrecto("y^2-2*x*y+x^2-9=0", (x, y) => (y - x) ** 2 - 9);
    // A(x) NO constante y dominio ESTRECHO (|x|≤½): la muestra de validación debe alcanzarlo.
    despejeCorrecto("x*y^2+y+x=0", (x, y) => x * y * y + y + x);
    // Lineal en y² con coeficiente en x → y=±√((4−x²)/(x²+1)).
    despejeCorrecto("x^2*y^2+x^2+y^2=4", (x, y) => x * x * y * y + x * x + y * y - 4);
    // Potencia par (`y⁴`): la raíz par ya da NaN donde el radicando es <0 → fiel sin guarda.
    // Raíz par (`√y`) y absoluto (`|y|`): la inversión añade la GUARDA DE DOMINIO (centinela `dom`).
    igual(despejarEcuaciones(["x^2+y^4=5"])[0], "y = pm(nthRoot((5 - x ^ 2), 4))", "y⁴ ⇒ ±⁴√ (sin guarda)");
    igual(despejarEcuaciones(["x+sqrt(y)=4"])[0], "y = dom(((-x + 4))^2, -x + 4)", "√y ⇒ elevar, con guarda R≥0");
    igual(despejarEcuaciones(["x+abs(y)=5"])[0], "y = dom(pm(-x + 5), -x + 5)", "|y| ⇒ ±, con guarda R≥0");
  });

  test("lo NO despejable sigue siendo parcial (no se fuerza nada)", () => {
    assert(!/^y = /.test(despejarEcuaciones(["x^3+y^3=3*x*y"])[0]), "folium: parcial");
    assert(!/^y = /.test(despejarEcuaciones(["y^y=3-x^x"])[0]), "y^y: parcial");
    // Trascendente SIN inversa registrada: solo el despeje multiplicativo (parcial).
    // (tan(y)·(…) ya no es el ejemplo: el trig inverso la completa; ver su test.)
    assert(/^\(y \^ y\)/.test(despejarEcuaciones(["y^y*(x^2+1)=sqrt(x+1)"])[0]),
      "trascendente: solo el despeje multiplicativo");
    // y en VARIOS términos y trascendente (sin forma cerrada): sigue parcial. `tan(2y)` ya NO
    // es ejemplo de límite: el inversor estructural lo completa (ver el test del keystone).
    assert(!/^y = /.test(despejarEcuaciones(["sin(y)+y=x"])[0]), "sin(y)+y: parcial (trascendente)");
    assert(!/^y = /.test(despejarEcuaciones(["y+tan(y)=x"])[0]), "y+tan(y): parcial (trascendente)");
  });

  test("Keystone: inversión estructural cierra huecos (log/exp/hiperbólica/trig compuesta/anidada)", () => {
    // y en UNA sola posición, anidada o en una función sin estrategia propia → se aísla pelando
    // la composición con inversas FIELES AL DOMINIO. Antes quedaban parciales.
    const completa = (ec: string) => /^y = /.test(despejarEcuaciones([ec])[0]);
    for (const ec of ["ln(y)=x", "e^y=x", "2^y+1=x", "sinh(y)=x", "atanh(y)=x",
                      "sin(2y)=x", "tan(2y)+x=2", "(y+1)^3=x", "exp(y^3)=x"])
      assert(completa(ec), `se despeja del todo: ${ec}`);
    // Fidelidad NUMÉRICA: cada rama despejada cumple su ecuación original donde es real.
    const chequeos: Array<[string, string, (x: number, y: number) => number]> = [
      ["ln(y)=x", "exp(x)", (x, y) => Math.log(y) - x],
      ["e^y=x", "ln(x)", (x, y) => Math.exp(y) - x],
      ["sinh(y)=x", "asinh(x)", (x, y) => Math.sinh(y) - x],
      ["(y+1)^3=x", "nthRoot(x,3)-1", (x, y) => (y + 1) ** 3 - x],
      ["exp(y^3)=x", "cbrt(ln(x))", (x, y) => Math.exp(y ** 3) - x],
    ];
    for (const [ec, rama, D] of chequeos) {
      const f = crearFuncionReal(rama);
      for (const x of [0.3, 0.8, 1.7, 3.2]) {
        const y = f.eval(x) as number;
        if (!Number.isFinite(y)) continue;
        aprox(D(x, y), 0, 1e-9, `${ec} en x=${x}`);
      }
    }
  });

  test("Keystone: capas de RANGO RESTRINGIDO bajo composición (guarda dom + ±)", () => {
    // Antes el inversor se rendía ante √, ⁿ√ par, potencia par y |·| envolviendo una expresión
    // compuesta. Son inversas EXACTAS bajo la guarda `t ≥ 0` (y el ± de las dos ramas cuando la
    // capa no es inyectiva), que es justo lo que emiten `conDominio`/`pm`: ahora se pelan.
    const tex = (ec: string) => bloqueALatex(despejarEcuaciones([ec]));
    // √ de una torre trig: la guarda x≥0 sale a MEDIA torre y viaja con la expresión.
    igual(tex(String.raw`\sqrt{\tan(y)+1}=x`), "y=\\arctan\\left(x^{2}-1\\right)+k\\pi,\\quad x \\ge 0,\\quad k\\in\\mathbb{Z}",
      "√(tan y+1)=x ⇒ y=arctan(x²−1)+kπ, x≥0");
    // Potencia PAR bajo exponencial: la condición HONESTA es ln x ≥ 0 (⇔ x ≥ 1), no x > 0.
    igual(tex("e^(y^2)=x"), "y=\\pm \\sqrt{\\ln x},\\quad \\ln x \\ge 0",
      "e^{y²}=x ⇒ y=±√(ln x), ln x≥0");
    // Potencia PAR de una base COMPUESTA (`(y+1)²=x` no: esa la coge antes la cuadrática).
    igual(despejarEcuaciones(["(y^3+1)^2=x"])[0], "y = cbrt((dom(pm(sqrt((x))), x)) - (1))",
      "(y³+1)²=x ⇒ y=∛(±√x−1), x≥0");
    igual(tex("(ln(y))^2=x"), "y=e^{\\pm \\sqrt{x}},\\quad x \\ge 0", "(ln y)²=x ⇒ y=e^{±√x}, x≥0");
    igual(despejarEcuaciones(["abs(2*y+1)=x"])[0], "y = ((dom(pm((x)), x)) - (1)) / (2)", "|2y+1|=x ⇒ y=(±x−1)/2, x≥0");
    igual(despejarEcuaciones(["nthRoot(y^3-2, 4)=x"])[0], "y = cbrt((dom(((x))^4, x)) + (2))", "⁴√(y³−2)=x ⇒ guarda x≥0");
    // Guarda TRIVIALMENTE cierta (t=x²≥0) → sin coletilla; guarda constante NEGATIVA → sin
    // solución real, no se fuerza nada y la ecuación se queda como está.
    assert(!/\\ge 0/.test(tex("sqrt(tan(y)+1)=x^2")), "guarda obvia (x²≥0): sin coletilla");
    assert(!/^y = /.test(despejarEcuaciones(["sqrt(2*y+1)=-3"])[0]), "√(…)=−3: sin solución real, parcial");
    // Fidelidad NUMÉRICA de las ramas nuevas contra la ecuación original.
    const chequeos: Array<[string, string, (x: number, y: number) => number]> = [
      [String.raw`\sqrt{\tan(y)+1}=x`, "atan(x^2-1)", (x, y) => Math.sqrt(Math.tan(y) + 1) - x],
      ["e^(y^2)=x", "sqrt(ln(x))", (x, y) => Math.exp(y * y) - x],
      ["(y+1)^2=x", "sqrt(x)-1", (x, y) => (y + 1) ** 2 - x],
      ["abs(2*y+1)=x", "(x-1)/2", (x, y) => Math.abs(2 * y + 1) - x],
    ];
    for (const [ec, rama, D] of chequeos) {
      const f = crearFuncionReal(rama);
      for (const x of [0.4, 1.3, 2.6, 5.1]) {
        const y = f.eval(x) as number;
        if (!Number.isFinite(y)) continue;
        aprox(D(x, y), 0, 1e-9, `${ec} en x=${x}`);
      }
    }
    // DOS ± independientes SÍ caben (dos ejes de signo → cuatro curvas): `|(y+1)²−3| = x`
    // necesita el ± del absoluto y el de la raíz, y son distintos.
    igual(despejarEcuaciones(["abs((y+1)^2-3)=x"])[0],
      "y = (dom(pm2(sqrt((dom(pm((x)), x)) + (3))), (dom(pm((x)), x)) + (3))) - (1)",
      "|(y+1)²−3|=x ⇒ dos ejes de signo");
    // LÍMITE honesto: un TERCER ± independiente necesitaría ocho ramas y el presupuesto es de
    // dos ejes → parcial, antes que entregar un despeje al que le faltan soluciones.
    assert(!/^y = /.test(despejarEcuaciones(["abs(abs((y+1)^2-3)-2)=x"])[0]),
      "tres ± independientes: parcial");
  });

  test("Keystone: EJES de signo independientes (el ± deja de perder soluciones)", () => {
    // `expandirDobleSigno` resuelve todos los ± de un MISMO eje con el mismo signo. Cuando dos
    // ± son independientes (`±arccos((a ± √d)/2)`: dos valores de cos y, dos ángulos cada uno),
    // un solo eje dibujaba 2 de las 4 curvas y las otras dos desaparecían EN SILENCIO. El
    // segundo eje (`pm2`) las recupera; el presupuesto sigue acotado (≤4 ramas, nunca 2ⁿ).
    const ramasDe = (ec: string): string[] => {
      const rhs = despejarEcuaciones([ec])[0].replace(/^y = /, "").replace(/fam\(k, 2\*pi\)/, "0");
      return expandirDobleSigno(rhs);
    };
    igual(String(expandirDobleSigno("pm(x) + 1").length), "2", "un eje → 2 ramas");
    igual(String(expandirDobleSigno("pm(x) + mp(1)").length), "2", "± y ∓ del MISMO eje → 2 ramas");
    igual(String(expandirDobleSigno("pm(x) + pm2(1)").length), "4", "dos ejes → 4 ramas");
    igual(String(expandirDobleSigno("x + 1").length), "1", "sin ± → la ecuación misma");

    // El caso que perdía curvas: cada solución real de la cuadrática en cos y debe estar en
    // alguna de las ramas expandidas. Antes faltaba la familia entera `+arccos(u₋)`.
    const F = (x: number, y: number) =>
      4 * (Math.cos(x) + Math.cos(y)) + 2 * Math.cos(x + y) + 2 * Math.cos(x - y) -
      2 * Math.cos(2 * x) - 2 * Math.cos(2 * y) - 7;
    const corazon = "4\\left(\\cos x+\\cos y\\right)+2\\cos\\left(x+y\\right)+2\\cos\\left(x-y\\right)-2\\cos 2x-2\\cos 2y-7=0";
    const fns = ramasDe(corazon).map((r) => crearFuncionReal(r));
    let cubiertas = 0;
    for (const x of [0.15, 0.35, 0.55, -0.4, 0.9]) {
      for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
        const d = 1 - 3 * (Math.cos(x) - 1) ** 2;
        if (d < 0) continue;
        const u = (Math.cos(x) + 1 + s2 * Math.sqrt(d)) / 2;
        if (Math.abs(u) > 1) continue;
        const y = s1 * Math.acos(u);
        if (Math.abs(F(x, y)) > 1e-9) continue;   // no es solución real: nada que exigir
        const trazada = fns.some((f) => {
          const v = f.eval(x);
          return typeof v === "number" && Math.abs(v - y) < 1e-9;
        });
        assert(trazada, `rama ±=(${s1},${s2}) en x=${x} debe estar entre las expandidas`);
        cubiertas++;
      }
    }
    assert(cubiertas >= 8, `la muestra ejercitó las cuatro combinaciones (${cubiertas})`);
  });

  test("Keystone: PARÁMETROS de familia independientes (k, m, n)", () => {
    // Hallado por la batería de verificación (tests/bateria-cas.ts): dos inversiones periódicas
    // anidadas aportan DOS enteros independientes, y emitir `fam(k,·)` en ambos sitios colapsaba
    // la solución a la diagonal k₁=k₂. Medido sobre `sin(cos y)=0.5`: 8 raíces reales en
    // [−12,12], la fórmula cubría 2. Mismo defecto que tenían los ± antes de repartirlos.
    igual(despejarEcuaciones(["sin(cos(y)) = x"])[0],
      "y = pm2(acos(pi/2 + pm(acos((x))) + fam(k, 2*pi))) + fam(m, 2*pi)",
      "sin(cos y)=x ⇒ parámetros k y m distintos");
    // La coletilla declara AMBOS: con un solo `k∈ℤ` la fórmula se leería como un único entero.
    igual(bloqueALatex(despejarEcuaciones(["sin(cos(y)) = x"])),
      "y=\\pm \\arccos\\left(\\frac{\\pi}{2} \\pm \\arccos x+2k\\pi\\right)+2m\\pi," +
      "\\quad k\\in\\mathbb{Z},\\quad m\\in\\mathbb{Z}", "coletilla con los dos parámetros");
    // COMPLETITUD numérica: toda raíz real de sin(cos y)=0.5 la cubre algún (k, m, signos).
    const raices: number[] = [];
    for (let y = -12; y <= 12; y += 1e-4) {
      const a = Math.sin(Math.cos(y)) - 0.5, b = Math.sin(Math.cos(y + 1e-4)) - 0.5;
      if (a * b < 0) raices.push(y + 5e-5);
    }
    assert(raices.length >= 8, `la ventana tiene varias raíces (${raices.length})`);
    for (const r of raices) {
      const cubierta = (): boolean => {
        for (let k = -4; k <= 4; k++) for (let m = -4; m <= 4; m++)
          for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
            const inner = Math.PI / 2 + s1 * Math.acos(0.5) + 2 * k * Math.PI;
            if (Math.abs(inner) > 1) continue;
            if (Math.abs(s2 * Math.acos(inner) + 2 * m * Math.PI - r) < 1e-3) return true;
          }
        return false;
      };
      assert(cubierta(), `la raíz y=${r.toFixed(4)} debe estar en la familia`);
    }
    // Con UNA sola inversión el parámetro sigue siendo `k` (sin churn en lo que ya funcionaba).
    igual(despejarEcuaciones(["tan(y) + x = 2"])[0], "y = atan((2 - x)) + fam(k, pi)",
      "una inversión: el parámetro sigue siendo k");
    // LÍMITE: agotado el repertorio (k, m, n), forma parcial antes que repetir un parámetro.
    assert(!/^y = /.test(despejarEcuaciones(["sin(tan(cos(sin(y)))) = x"])[0]),
      "cuatro inversiones periódicas: parcial");
  });

  test("trig PERIÓDICA de y → solución GENERAL: familia y = T⁻¹(g) + k·período (k∈ℤ)", () => {
    // El caso pedido: tan(y)+x=2 ⇒ y = arctan(2−x) + kπ, k∈ℤ. El centinela `fam(k, pi)`
    // representa la familia DISCRETA infinita (no una constante): string re-parseable.
    igual(despejarEcuaciones(["tan(y)+x=2"])[0], "y = atan((2 - x)) + fam(k, pi)",
      "tan(y)+x=2 ⇒ y = arctan(2−x) + kπ");
    // La familia es CORRECTA para todo k: cada rama cumple la ecuación original.
    for (const k of [-2, -1, 0, 1, 3]) {
      for (const x of [-1.3, 0.4, 2.7]) {
        const y = Math.atan(2 - x) + k * Math.PI;
        aprox(Math.tan(y) + x, 2, 1e-9, `tan(y)+x=2 en x=${x}, k=${k}`);
      }
    }
    // Coeficiente libre: se divide antes de invertir. cos → ± (dos bases) + período 2π.
    igual(despejarEcuaciones(["cos(y)*2=x"])[0], "y = pm(acos((x)/((2)))) + fam(k, 2*pi)",
      "2cos(y)=x ⇒ y = ±arccos(x/2) + 2kπ");
    // sin: forma única π/2 ± arccos(g) (≡ arcsin g / π−arcsin g). Verificación numérica.
    igual(despejarEcuaciones(["sin(y)=x"])[0], "y = pi/2 + pm(acos(x)) + fam(k, 2*pi)",
      "sin(y)=x ⇒ y = π/2 ± arccos(x) + 2kπ");
    for (const s of [1, -1]) {
      for (const k of [-1, 0, 2]) {
        for (const g of [-0.8, 0.3, 0.9]) {
          const y = Math.PI / 2 + s * Math.acos(g) + 2 * k * Math.PI;
          aprox(Math.sin(y), g, 1e-9, `sin(y)=${g} (rama ${s > 0 ? "+" : "−"}, k=${k})`);
        }
      }
    }
    // El k∈ℤ viaja hasta el LaTeX: familia pintada `…+k\pi` con su coletilla.
    const latex = despejarY("\\tan(y)+x=2");
    assert(latex !== null && latex.completo, "tan(y)+x=2: despeje completo");
    assert(latex!.latex.includes("\\arctan"), `arctan visible: ${latex!.latex}`);
    assert(latex!.latex.includes("k\\pi"), `k\\pi visible: ${latex!.latex}`);
    assert(latex!.latex.includes("k\\in\\mathbb{Z}"), `coletilla k∈ℤ: ${latex!.latex}`);
    // Clasificación por centinelas: las tres formas se distinguen.
    igual(clasificarDespeje(despejarEcuaciones(["tan(y)+x=2"])[0]), "familia-periodica", "familia");
    igual(clasificarDespeje(despejarEcuaciones(["x^2+y^2=16"])[0]), "ramas-finitas", "±√ finitas");
    igual(clasificarDespeje(despejarEcuaciones(["2x+y=6"])[0]), "unica", "y=f(x) única");
    // `tieneFamilia` no confunde identificadores que terminen en "fam".
    assert(!tieneFamilia("aleufam(x)"), "sufijo 'fam' de otro identificador: no es familia");
  });

  test("CUADRÁTICA en cos(y) (trig de argumentos compuestos): ±arccos(…±√…) + 2kπ", () => {
    // El caso pedido: 4(cosx+cosy)+2cos(x+y)+2cos(x−y)−2cos2x−2cos2y−7=0. Tras expandir
    // (cos(x±y) cancela los sin y; cos2y aporta el u²) es cuadrática en u=cos y:
    // y = ±arccos((cosx+1 ± √(1−3(cosx−1)²))/2) + 2kπ, k∈ℤ. El radicando sale con el
    // CUADRADO COMPLETADO (muestra el dominio), no como polinomio expandido.
    const corazon = "4\\left(\\cos x+\\cos y\\right)+2\\cos\\left(x+y\\right)+2\\cos\\left(x-y\\right)-2\\cos 2x-2\\cos 2y-7=0";
    igual(despejarEcuaciones([corazon])[0],
      "y = pm2(acos(((cos(x) + 1) + pm(sqrt(1 - 3 * (cos(x) - 1) ^ 2))) / (2))) + fam(k, 2*pi)",
      "cuadrática en cos y con cuadrado completado");
    // La familia es CORRECTA: ambos ± son independientes y cada combinación válida
    // (|u|≤1) cumple la ecuación original, para todo k.
    const F = (x: number, y: number) =>
      4 * (Math.cos(x) + Math.cos(y)) + 2 * Math.cos(x + y) + 2 * Math.cos(x - y) -
      2 * Math.cos(2 * x) - 2 * Math.cos(2 * y) - 7;
    let combinaciones = 0;
    for (const s2 of [1, -1]) {
      for (const s1 of [1, -1]) {
        for (const k of [-1, 0, 2]) {
          for (let x = -1.2; x <= 1.2; x += 0.1) {
            const d = 1 - 3 * (Math.cos(x) - 1) ** 2;
            if (d < 0) continue;
            const u = (Math.cos(x) + 1 + s2 * Math.sqrt(d)) / 2;
            if (Math.abs(u) > 1) continue;
            const y = s1 * Math.acos(u) + 2 * k * Math.PI;
            aprox(F(x, y), 0, 1e-9, `corazón trig en x=${x.toFixed(1)} (±=${s1},${s2}, k=${k})`);
            combinaciones++;
          }
        }
      }
    }
    assert(combinaciones > 20, `la muestra ejercitó ambas raíces y ambos arccos (${combinaciones})`);
    // Cuadrática DIRECTA en cos y y LINEAL en cos y (adición pura).
    igual(despejarEcuaciones(["cos(y)^2 - cos(y) = x"])[0],
      "y = pm2(acos(((1) + pm(sqrt(4 * x + 1))) / (2))) + fam(k, 2*pi)", "cos²y−cosy=x");
    igual(despejarEcuaciones(["cos(x+y) + cos(x-y) = 1"])[0],
      "y = pm(acos((1) / (2 * cos(x)))) + fam(k, 2*pi)", "2cosx·cosy=1 (lineal en cos y)");
    // sin²y entra por la pitagórica (SY²→1−CY²); la fracción común se reduce del todo.
    igual(despejarEcuaciones(["sin(y)^2 = x"])[0],
      "y = pm2(acos(pm(sqrt(1 - x)))) + fam(k, 2*pi)", "sin²y=x");
    // sin y IMPAR no es polinomio en cos y: se queda PARCIAL, no se inventa nada.
    assert(!/^y = /.test(despejarEcuaciones(["sin(y) + cos(y) = x"])[0]), "siny+cosy=x: parcial");
  });
});

describe("Guarda de expansión (presupuesto de monomios de rationalize)", () => {
  test("el coste es el nº de monomios de la expansión naive", () => {
    igual(costeExpansion(parse("(x+y)^3") as unknown as Nodo), 8, "(x+y)³ → 2³");
    igual(costeExpansion(parse("(x^2+y^2-1)^3") as unknown as Nodo), 27, "(x²+y²−1)³ → 3³ (el corazón)");
    igual(costeExpansion(parse("(x+1)^12") as unknown as Nodo), 4096, "(x+1)¹² → 2¹²");
    igual(costeExpansion(parse("(x^2+y^2)^2-2*(x^2-y^2)") as unknown as Nodo), 6, "lemniscata: dentro del presupuesto");
  });

  test("un exponente absurdo no cuelga el propio cálculo del coste", () => {
    assert(costeExpansion(parse("(x+1)^1000000") as unknown as Nodo) === Infinity, "se resuelve en O(1), sin iterar");
  });

  test("por encima del límite NO se expande (null); por debajo sí", () => {
    assert(rationalizeSeguro("(x^2+y^2-1)^3-x^2*y^3") === null, "el corazón se rechaza");
    assert(costeExpansion(parse("(x^2+y^2)^2-2*(x^2-y^2)") as unknown as Nodo) <= LIMITE_EXPANSION, "la lemniscata cabe");
    assert(rationalizeSeguro("(x^2+y^2)^2-2*(x^2-y^2)") !== null, "y por tanto sí se expande");
  });

  test("rechazada la expansión, Simplificar degrada a la forma sin desarrollar (no cuelga)", () => {
    const s = simplificarEcuaciones(["(x^2+y^2-1)^3=x^2*y^3"])[0];
    assert(s.includes("^ 3") || s.includes("^3"), `conserva la potencia sin expandir: ${s}`);
  });

  test("la lemniscata conserva su despeje cuadrático completo (la guarda no la toca)", () => {
    const d = despejarEcuaciones(["(x^2+y^2)^2=2*(x^2-y^2)"])[0];
    assert(/^y = pm\(sqrt\(/.test(d), `y = ±√(…): ${d}`);
  });
});
