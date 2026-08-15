// ─────────────────────────────────────────────
// tests · Despeje y simplificación (transformaciones del panel)
// ─────────────────────────────────────────────
//
// Lo que el PANEL ofrece sobre una fórmula escrita: Despejar y, Simplificar y el
// operador de derivada, comparados por su LaTeX final. Es el contrato de
// PRESENTACIÓN del despejador, no su cobertura algebraica.
//
// La familia radical/cuadrática y su presupuesto viven en `despeje-radicales.test.ts`;
// la cobertura graduada y la frontera de lo imposible, en `despeje-bateria.test.ts`.
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { despejarEcuaciones } from "../../src/despejar";
import { simplificarCondiciones } from "../../src/condiciones";
import { simplificarEcuaciones } from "../../src/simplificar";
import { derivadaLatex, derivarExpr } from "../../src/derivar";
import { crearFuncionReal } from "../../src/core/fields/funcionRealMathjs";
import { bloqueALatex, exprALatex } from "../../src/latex";
import { compilarFuncion } from "../../src/evaluador";
import { construirObjeto } from "../../src/core/parsing/construirObjeto";

// ════════════════════════════════════════════════
// Transformaciones del panel (strings re-parseables → LaTeX): Despejar y / Simplificar.
// Alimentan el toggle [Original][Opciones ▾]. Se comparan por su LaTeX final.
describe("Transformaciones del panel: Despejar y / Simplificar", () => {
  const despLatex = (ec: string) => bloqueALatex(despejarEcuaciones([ec]));
  const simpLatex = (ec: string) => bloqueALatex(simplificarEcuaciones([ec]));

  test("Despejar y: ORDEN CANÓNICO en lo polinómico (variables antes que constantes)", () => {
    // `mx + b`, no `b + mx`: el despeje sale directo en forma canónica (el `- x` con
    // espacio es cosmético de mathjs; KaTeX lo colapsa a `-x`).
    igual(despLatex("2x + y = 6"), "y=-2x+6", "2x+y=6 → y=-2x+6");
    igual(despLatex("x + y = 8"), "y=- x+8", "x+y=8 → y=-x+8");
    igual(despLatex("x + y = 2"), "y=- x+2", "x+y=2 → y=-x+2");
    igual(despLatex("3x - y = 1"), "y=3x-1", "3x−y=1 → y=3x−1");
  });

  test("Despejar y: raíz n-ésima impar; el radicando conserva 'positivos primero'", () => {
    // Dentro de la raíz NO se aplica el orden canónico (se conserva `9 - x³`, como pediste).
    igual(despLatex("x^3+y^3=9"), "y=\\sqrt[3]{9-x^{3}}", "x³+y³=9 → y=∛(9−x³)");
    igual(despLatex("x^{3}+y^{3}=9"), "y=\\sqrt[3]{9-x^{3}}", "entrada LaTeX con llaves: idéntico");
    igual(despLatex("y^5 = 2 - x"), "y=\\sqrt[5]{2- x}", "y⁵=2−x → y=⁵√(2−x)");
    igual(despLatex("2 y^3 = x"), "y=\\sqrt[3]{\\frac{x}{2}}", "coef+potencia → raíz de la fracción");
  });

  test("Despejar y: raíz de una POTENCIA de y (astroide) se aísla hasta y = ±√((…)ⁿ)", () => {
    // Antes quedaba PARCIAL en `∛(y²)=1−∛(x²)`: el factor con y es ∛(y²) —raíz de una POTENCIA
    // de y—, que no encajaba en ninguna estrategia (`despejeRaiz` solo cubre ⁿ√y desnuda). Ahora
    // se eleva al índice (y²=(1−∛(x²))³) y se saca la raíz par → las dos ramas con el ± (`pm`).
    // La potencia bajo el radical sale fuera, como en `(x+1)^{3/2}` → `(x+1)√(x+1)`: es la
    // misma extracción euclídea, y con base compuesta también se aplica (√(u³)=u√u exige
    // u ≥ 0, que es justo el dominio donde el radicando u³ es no negativo).
    igual(despLatex("x^{2/3}+y^{2/3}=1"),
      "y=\\pm \\left(1-\\sqrt[3]{x^{2}}\\right)\\sqrt{1-\\sqrt[3]{x^{2}}}",
      "astroide → y=±(1−∛(x²))√(1−∛(x²))");
    // El despeje grafica REALMENTE el astroide: residual 0 en el dominio |x|≤1 (ambas ramas).
    const rama = crearFuncionReal("sqrt((1 - nthRoot(x^2,3))^3)");
    for (const x of [-0.9, -0.4, 0, 0.5, 0.9]) {
      const y = rama.eval(x) as number;
      aprox(Math.cbrt(x * x) + Math.cbrt(y * y) - 1, 0, 1e-9, `∛(x²)+∛(y²)=1 en x=${x}`);
    }
  });

  test("Despejar y: valor ABSOLUTO de y (incl. recíproco) se aísla hasta y = ±(…)", () => {
    // Antes se quedaba PARCIAL en `1/|y| = 1 − 1/|x|`: el factor con y no era `y`, `yⁿ` ni
    // `ⁿ√y`, así que solo actuaba el despeje multiplicativo. Ahora se invierte el exponente
    // (|y| = |x|/(|x|−1)) y el absoluto abre las DOS ramas con el centinela `pm`.
    // La GUARDA DE DOMINIO (`, R≥0`, centinela `dom`): `abs(y)^e = R` exige R≥0 (el valor
    // absoluto no iguala nada negativo); sin ella, `y=±R` dibujaría la rama fantasma R<0.
    igual(despLatex("|x|^{-1}+|y|^{-1}=1"),
      "y=\\pm \\frac{\\left| x\\right|}{\\left| x\\right|-1},\\quad 1-{\\left| x\\right|}^{-1} \\ge 0",
      "1/|x|+1/|y|=1 → y=±|x|/(|x|−1), 1−1/|x|≥0");
    // La condición se reduce quitando el factor constante: `x/2 ≥ 0` ⇔ `x ≥ 0` (mismo conjunto).
    igual(despLatex("2|y| = x"), "y=\\pm \\frac{x}{2},\\quad x \\ge 0", "2|y|=x → y=±x/2, x≥0");
    // Con constante NEGATIVA la desigualdad se invierte: `−x/2 ≥ 0` ⇔ `x ≤ 0`.
    igual(despLatex("2|y| = -x"), "y=\\pm \\frac{- x}{2},\\quad x \\le 0", "2|y|=−x → y=±(−x/2), x≤0");
    igual(despLatex("|y|^{2} = x"), "y=\\pm \\sqrt{x},\\quad x \\ge 0", "|y|²=x → y=±√x, x≥0");
    // El argumento del ± con una SUMA necesita paréntesis: `\pm x-1` se leería `(\pm x)-1`.
    igual(despLatex("|y| = x - 1"), "y=\\pm\\left( x-1\\right),\\quad x \\ge 1", "|y|=x−1 → y=±(x−1), x≥1");
    // RAÍZ / exponente FRACCIONARIO de |y|: se invierte ELEVANDO (|y|=R^{1/e}), no se toma
    // `abs` por variable. `|y|^{1/2}` (antes se normalizaba a `abssqrt((y))`: abs colgando) y
    // `√|y|` = `sqrt(abs(y))` llevan al MISMO despeje y = ±R². El radicando en orden canónico.
    igual(despLatex("|y|^{1/2}+x^2=2"), "y=\\pm {\\left(-x^{2}+2\\right)}^{2},\\quad -\\sqrt{2} \\le x \\le \\sqrt{2}",
      "|y|^{1/2}+x²=2 → y=±(−x²+2)², −√2≤x≤√2 (√|y|=R exige R≥0; el sistema se resuelve en x)");
    igual(despLatex(String.raw`\sqrt{|y|}+\tan{x}=2`), "y=\\pm {\\left(2-\\tan x\\right)}^{2},\\quad 2-\\tan x \\ge 0",
      "√|y|+tan x=2 → y=±(2−tan x)², 2−tan x≥0");
    igual(despLatex("|y|^{1/3}+x=1"), "y=\\pm {\\left(- x+1\\right)}^{3},\\quad x \\le 1",
      "|y|^{1/3}+x=1 → y=±(−x+1)³, x≤1 (índice 3 → cubo)");
  });

  test("Keystone Stage 2: la guarda de dominio (dom) hace fieles las inversas de rango restringido", () => {
    // El BUG que arregla: `√(y⁴)=−3` NO tiene solución real (√(y⁴)=y²≥0), pero salía completo
    // con una curva inventada. Ahora la condición constante <0 lo deja PARCIAL (sin forzar nada).
    assert(!/^y = /.test(despejarEcuaciones(["sqrt(y^4) = -3"])[0]), "√(y⁴)=−3: sin solución → parcial");
    assert(!/^y = /.test(despejarEcuaciones(["abs(y) + 5 = 2"])[0]), "|y|=−3: sin solución → parcial");
    // Fidelidad NUMÉRICA: la despejada con `dom` evalúa a NaN FUERA del dominio (sin rama
    // fantasma) y a la rama correcta DENTRO. `x−√y=27 → y=dom((x−27)², x−27)`, válida x≥27.
    const rhs = despejarEcuaciones(["x-sqrt(y)=27"])[0].replace(/^y = /, "");
    const f = compilarFuncion(rhs, "x");
    assert(!Number.isFinite(f(10) as number), "x=10 (x−27<0): NaN, sin fantasma");
    const y30 = f(30) as number;
    aprox(y30, 9, 1e-9, "x=30 (dentro): y=(30−27)²=9");
    aprox(30 - Math.sqrt(y30), 27, 1e-9, "y=9 cumple la original x−√y=27");
  });

  test("Despejar y: potencia PAR se despeja hasta y = ±√(…) (radicando 'positivos primero')", () => {
    // Antes se detenía en `y²=…`; ahora aísla y como el par ± de raíces, con el radicando
    // normalizado a `16 - x²` (positivos primero, no `-x² + 16`). El ± va con `pm(·)` → `\pm`.
    igual(despLatex("x^2+y^2=16"), "y=\\pm \\sqrt{16-x^{2}}", "círculo r=4 → y=±√(16−x²)");
    igual(despLatex("x^2+y^2=25"), "y=\\pm \\sqrt{25-x^{2}}", "círculo r=5 → y=±√(25−x²)");
    igual(despLatex("y^2 = x"), "y=\\pm \\sqrt{x}", "y²=x → y=±√x");
    igual(despLatex("y^4 = x"), "y=\\pm \\sqrt[4]{x}", "par n≥4 usa nthRoot → y=±⁴√x");
    // Sistema (caso reportado): solo la ecuación par se despeja; la lineal se conserva.
    igual(bloqueALatex(despejarEcuaciones(["x^2+y^2=25", "y=x+1"])),
      "\\begin{cases}\\begin{aligned}y&=\\pm \\sqrt{25-x^{2}}\\\\[1ex]y&=x+1\\end{aligned}\\end{cases}",
      "sistema: y=±√(25−x²) ; y=x+1");
  });

  test("Despejar y: y² ATRAPADA en el numerador de una fracción se aísla del todo", () => {
    // Regresión #1: Simplificar reúne `x²+3x+y²−3x⁻²` en `(x⁴+3x³+x²y²−3)/x²`, con y² dentro
    // del numerador. El despeje veía la fracción como UN término y solo despejaba el
    // denominador → `(x⁴+…)=(e+8)x²` (PARCIAL). Ahora re-despeja la forma ya sin fracción →
    // y=±√(…). El panel encadena sobre la SIMPLIFICADA, así que se prueba esa cadena (el fallo).
    const chain = bloqueALatex(despejarEcuaciones(simplificarEcuaciones(["x^{2}+3x+y^{2}-3x^{-2}=e+8"])));
    igual(chain, "y=\\pm \\sqrt{\\frac{3+\\left( e+8\\right)x^{2}-x^{4}-3x^{3}}{x^{2}}}",
      "cadena simplificar→despejar: y aislada del todo");
  });

  test("Despejar y: RECÍPROCO (y en el denominador) se invierte y aísla", () => {
    // Regresión: la y bajo una fracción no la tocaba ninguna estrategia (todas exigen la y en
    // el NUMERADOR) → forma parcial `1/y = x`. Ahora se invierte el recíproco y se recurre.
    igual(despLatex("1/y = x"), "y=\\frac{1}{x}", "1/y=x → y=1/x");
    igual(despLatex("x/y = 2"), "y=\\frac{x}{2}", "x/y=2 → y=x/2");
    igual(despLatex("2/y + 3 = x"), "y=\\frac{2}{x-3}", "2/y+3=x → y=2/(x−3)");
    igual(despLatex("5/(2y) = x"), "y=\\frac{5}{2x}", "coef en el denominador: 5/(2y)=x → y=5/(2x)");
    igual(despLatex("1/y^2 = x"), "y=\\pm \\sqrt{\\frac{1}{x}}", "1/y²=x → y=±√(1/x) (dos ramas)");
    igual(despLatex("1/(x^2+y^2) = 3"), "y=\\pm \\sqrt{\\frac{1}{3}-x^{2}}", "círculo: 1/(x²+y²)=3 → y=±√(1/3−x²)");
  });

  test("Despejar y: T(u)=0 con u compuesta → familia kπ, k∈ℕ si u>0", () => {
    // `sin(1/(x²+y²))=0` ⇒ 1/(x²+y²)=kπ ⇒ (recíproco+círculo) y=±√(1/(kπ)−x²). Como
    // 1/(x²+y²)>0 obliga a kπ>0, el parámetro es NATURAL (k∈ℕ), no ℤ: el centinela `famN`.
    igual(despLatex("sin(1/(x^2+y^2)) = 0"), "y=\\pm \\sqrt{\\frac{1}{k\\pi}-x^{2}},\\quad k\\in\\mathbb{N}",
      "sin(1/(x²+y²))=0 → y=±√(1/(kπ)−x²), k∈ℕ");
    igual(despLatex(String.raw`\sin\left(\frac{1}{x^2+y^2}\right)=0`),
      "y=\\pm \\sqrt{\\frac{1}{k\\pi}-x^{2}},\\quad k\\in\\mathbb{N}", "misma, en LaTeX del editor");
    // u que toma cualquier signo (x+y) → la familia es ℤ, no ℕ.
    igual(despLatex("sin(x+y) = 0"), "y=- x+k\\pi,\\quad k\\in\\mathbb{Z}", "sin(x+y)=0 → y=−x+kπ, k∈ℤ");
    // cos se anula en π/2+kπ (desplazada) → ℤ.
    igual(despLatex("tan(x*y) = 0"), "y=\\frac{k\\pi}{x},\\quad k\\in\\mathbb{Z}", "tan(xy)=0 → y=kπ/x, k∈ℤ");
  });

  test("Despejar y: CUADRÁTICA en y² (bicuadrática) por la fórmula reducida", () => {
    // Caso reportado (lemniscata): (x²+y²)²−2(x²−y²)=0 es cuadrática en u=y²; se resuelve
    // por completar cuadrados → y=±√(−(x²+1)+√(4x²+1)). Antes daba el parcial 2x²y²+y⁴+2y²=…
    igual(despLatex("\\left(x^{2}+y^{2}\\right)^{2}-2\\cdot\\left(x^{2}-y^{2}\\right)"),
      "y=\\pm \\sqrt{-\\left(x^{2}+1\\right)+\\sqrt{4x^{2}+1}}",
      "lemniscata → y=±√(−(x²+1)+√(4x²+1))");
    // La rama física se valida numéricamente: y=+√(−(x²+1)+√(4x²+1)) cumple la ecuación
    // donde es real (|x|≤√2), y la rama −√(4x²+1) se descartó (nunca da y real).
    const rama = crearFuncionReal("sqrt(-(x^2+1)+sqrt(4*x^2+1))");
    for (const x of [-1.1, -0.4, 0.7, 1.2]) {
      const y = rama.eval(x) as number;
      const D = Math.pow(x * x + y * y, 2) - 2 * (x * x - y * y);
      aprox(D, 0, 1e-9, `(x²+y²)²−2(x²−y²)=0 en x=${x}`);
    }
    // Bicuadrática con DOS ramas reales → forma compacta anidada `±√(±√disc − p)`, correcta.
    const dos = despejarEcuaciones(["y^4 - 5*y^2 + 4 = 0"])[0];
    assert(/pm\(sqrt\(pm\(/.test(dos), `dos ramas → ± anidado: ${dos}`);
    // Sin solución real → no se fuerza el despeje (queda la forma implícita).
    assert(!/pm|sqrt/.test(despejarEcuaciones(["y^4 + y^2 + 1 = 0"])[0]),
      "y⁴+y²+1=0 (sin raíz real) no se despeja");
    // Cuadrática en y CON término lineal (g=1): ya NO queda fuera de alcance — se resuelve por
    // la fórmula general y=(−B±√(B²−4AC))/2A. y²+xy−x=0 → y=(−x±√(x²+4x))/2.
    const lineal = despejarEcuaciones(["y^2 + x*y - x = 0"])[0];
    assert(/^y = /.test(lineal) && /pm/.test(lineal), `g=1 se despeja del todo: ${lineal}`);
    for (const s of [1, -1]) {
      const rama = crearFuncionReal(`(-x + ${s}*sqrt(x^2 + 4*x))/2`);
      for (const x of [0.35, 0.7, 1.6, 3.2]) {
        const y = rama.eval(x) as number;
        aprox(y * y + x * y - x, 0, 1e-9, `y²+xy−x=0 en x=${x} (rama ${s > 0 ? "+" : "−"})`);
      }
    }
  });

  test("Despejar y: RAÍZ de y se invierte elevando (inverso de la raíz principal)", () => {
    // El caso reportado: la 2ª ecuación de un sistema `x−√y=27` quedaba `-√y=-x+27` en
    // vez de aislar y. Ahora se eleva al cuadrado → parábola completa.
    // Índice PAR (√): la inversión (elevar al cuadrado) solo vale donde el radicando es ≥0 →
    // GUARDA DE DOMINIO `, R≥0`. Índice IMPAR (∛): biyección en ℝ, exacta sin guarda.
    igual(despLatex("x-\\sqrt{y}=27"), "y={\\left( x-27\\right)}^{2},\\quad x \\ge 27", "x−√y=27 → y=(x−27)², x≥27");
    igual(despLatex("\\sqrt{y}=x-3"), "y={\\left( x-3\\right)}^{2},\\quad x \\ge 3", "√y=x−3 → y=(x−3)², x≥3");
    igual(despLatex("x-\\sqrt[3]{y}=1"), "y={\\left( x-1\\right)}^{3}", "cúbica (impar): x−∛y=1 → y=(x−1)³, sin guarda");
    igual(despLatex("2\\sqrt{y}=x"), "y=\\left({\\frac{x}{2}}\\right)^{2},\\quad x \\ge 0", "coef: 2√y=x → y=(x/2)², x≥0");
    // Encadenado con Simplificar: la potencia queda FACTORIZADA dentro de la guarda (`dom` es
    // opaca a rationalize, no se expande) → `(x−27)²`, que además lee mejor junto a `, x≥27`.
    const d = despejarEcuaciones(["x+y=2", "x-\\sqrt{y}=27"]);
    igual(bloqueALatex(simplificarEcuaciones(d)),
      "\\begin{cases}\\begin{aligned}y&=- x+2\\\\[1ex]y&={\\left( x-27\\right)}^{2},\\quad x \\ge 27\\end{aligned}\\end{cases}",
      "sistema Despejar→Simplificar: y=-x+2 ; y=(x−27)², x≥27");
  });

  test("Condiciones: el SISTEMA de guardas se resuelve, no se lista", () => {
    // Las guardas nacen sueltas (una por capa invertida / por elevación al cuadrado) pero son
    // desigualdades sobre la MISMA x: el simplificador las resuelve por tabla de signos, interseca
    // y devuelve el intervalo. Los puntos críticos salen en forma CERRADA (√3, no 1.7320508).
    const rango = (cs: string[]): string => {
      const r = simplificarCondiciones(cs);
      if (r === null) return "null";
      if (r.tipo !== "rango") return r.tipo;
      const { min, max } = r.rango;
      return `${min ? `${min.expr}${min.cerrado ? "<=" : "<"}` : ""}x${max ? `${max.cerrado ? "<=" : "<"}${max.expr}` : ""}`;
    };
    igual(rango(["(x^2+3)/(2*x)", "(x^2-3)/(2*x)"]), "sqrt(3)<=x",
      "las dos guardas de √(y+1)+√(y−2)=x son, juntas, x≥√3");
    igual(rango(["x-27"]), "27<=x", "signo despejado: x−27≥0 ⇔ x≥27");
    igual(rango(["-x+1"]), "x<=1", "coeficiente negativo: invierte el sentido");
    igual(rango(["-x^2+2"]), "-sqrt(2)<=x<=sqrt(2)", "cuadrática → intervalo con raíces exactas");
    igual(rango(["x", "x-3"]), "3<=x", "REDUNDANCIA: la condición implicada no recorta");
    igual(rango(["x-1", "-x+1/2"]), "imposible", "CONTRADICCIÓN: intersección vacía");
    igual(rango(["x^2+1"]), "siempre", "trivialmente cierta → sin coletilla");
    // Frontera declarada: lo que no sabe reducir NO lo toca (quien llama conserva las guardas).
    igual(rango(["2-tan(x)"]), "null", "no racional en x → fuera de alcance");
    igual(rango(["x^2-3"]), "null", "dos componentes inconexas: una unión no se lee de un vistazo");
  });

  test("Despejar y: expresión SUELTA con y libre se despeja como expr=0", () => {
    // Sin `=` pero con y libre: misma convención que construirObjeto (expr=0) — antes
    // `despejar` devolvía null y el menú quedaba deshabilitado (bug reportado).
    // Ahora el despeje trig inverso la COMPLETA (antes quedaba en tan(y)=…): la familia
    // general con su k∈ℤ. La misma con `=` da lo mismo (ver test de trig inversa).
    igual(despLatex("tan(y)(x^2+1)-sqrt(x+1)"),
      despLatex("tan(y)(x^2+1)=sqrt(x+1)"),
      "tan(y)(x²+1)-√(x+1) → mismo despeje que con `=`");
    igual(despLatex("x^3+y^3-9"), "y=\\sqrt[3]{9-x^{3}}", "x³+y³−9 → mismo despeje que con =9");
    // Sin y libre no hay nada que despejar: la expresión suelta queda intacta.
    igual(despejarEcuaciones(["x^2+1"])[0], "x^2+1", "sin y: intacta (sigue siendo f(x))");
  });

  test("Despejar y: trig y multiplicativo conservan 'positivos primero'", () => {
    igual(despLatex("tan(x) + y = 2"), "y=2-\\tan x", "trig: y=2−tan(x) (no −tan(x)+2)");
    // El multiplicativo puro (dividir los libres, sin invertir) queda para las funciones
    // de y SIN inversa registrada: `y^y·(x²+1)=√(x+1)` → `y^y = √(x+1)/(x²+1)` (parcial).
    // (tan(y)·(x²+1) ya no es su ejemplo: el despeje trig inverso la completa.)
    igual(despLatex("y^y*(x^2+1)=sqrt(x+1)"), "y^{y}=\\frac{\\sqrt{x+1}}{x^{2}+1}", "multiplicativo");
    // Sin `=`, sin y → se deja igual (el botón se deshabilitaría).
    igual(despejarEcuaciones(["x+x+x"])[0], "x+x+x", "sin `=` → sin cambio");
    igual(despejarEcuaciones(["y=x^2"])[0].replace(/\s/g, ""), "y=x^2", "ya despejada → sin cambio");
  });

  test("Despejar produce forma CANÓNICA → Simplificar después es un NO-OP", () => {
    // El bug reportado: despejar daba `y=6-2x` y Simplificar lo cambiaba a `y=-2x+6`.
    // Ahora despejar ya sale canónico, así que Simplificar no cambia nada (botón off).
    for (const ec of ["2x + y = 6", "x + y = 8", "x^3+y^3=9", "x^2+y^2=9",
                      "tan(x)+y=2", "tan(y)(x^2+1)=sqrt(x+1)"]) {
      const d = despejarEcuaciones([ec]);
      igual(bloqueALatex(simplificarEcuaciones(d)), bloqueALatex(d), `${ec}: Simplificar(Despejar) = Despejar`);
      igual(bloqueALatex(despejarEcuaciones(d)), bloqueALatex(d), `${ec}: Despejar idempotente`);
    }
  });

  test("Simplificar: reduce/expande en orden canónico; deshabilitado si ya está simple", () => {
    igual(simpLatex("x+x+x"), "f(x)=3x", "x+x+x → 3x");
    igual(simpLatex("(x+1)^2"), "f(x)=x^{2}+2x+1", "(x+1)² expandido (variables antes que 1)");
    igual(simpLatex("y = 2x + 3x - x"), "y=4x", "reduce términos semejantes");
    igual(simpLatex("y = 6 - 2x"), "y=-2x+6", "canónico: 6−2x → -2x+6");
    igual(simpLatex("y = 8 - x"), "y=- x+8", "canónico: 8−x → -x+8");
    igual(simpLatex("sin(x)"), "f(x)=\\sin x", "no simplificable → igual (botón off)");
    igual(simpLatex("x^2+y^2=9"), "x^{2}+y^{2}=9", "ya simple → igual");
  });

  test("Simplificar: FRACCIONES exactas, no decimales (x/2 → x/2, no 0.5x)", () => {
    // El bug reportado: `rationalize` serializaba los racionales como decimales
    // (`x/2`→`0.5x`, `x/3`→`0.333…x`). Ahora se recupera la fracción exacta.
    igual(simpLatex("x/2"), "f(x)=\\frac{x}{2}", "x/2 se queda x/2 (¡no 0.5x!)");
    igual(simpLatex("x/3"), "f(x)=\\frac{x}{3}", "x/3 → x/3 (no 0.333…x)");
    igual(simpLatex("x^2/4"), "f(x)=\\frac{x^{2}}{4}", "x²/4 → x²/4 (no 0.25x²)");
    igual(simpLatex("3x/4"), "f(x)=\\frac{3x}{4}", "3x/4 → 3x/4 (no 0.75x)");
    igual(simpLatex("x/2 + x/3"), "f(x)=\\frac{5x}{6}", "combina fracciones: x/2+x/3 → 5x/6");
    igual(simpLatex("2x/6"), "f(x)=\\frac{x}{3}", "reduce: 2x/6 → x/3");
    igual(simpLatex("100x/25"), "f(x)=4x", "reduce a entero: 100x/25 → 4x");
    igual(simpLatex("-x/3 - x/3"), "f(x)=\\frac{-2x}{3}", "negativo: -x/3-x/3 → -2x/3 (num con signo)");
    igual(simpLatex("(x+2)/2"), "f(x)=\\frac{x}{2}+1", "distribuye: (x+2)/2 → x/2 + 1");
    igual(simpLatex("1/2 + 1/2"), "f(x)=1", "constantes: 1/2+1/2 → 1");
    igual(simpLatex("sin(x)/2"), "f(x)=\\frac{\\sin x}{2}", "función/constante intacta: sin(x)/2");
    // Coeficiente IRRACIONAL: `rationalize`/`simplify` lo decimalizan (`√2`→`1.4142…`), pero
    // `resimbolizarConstantes` (el paso que ya cierra derivar/integrar) RECUPERA la forma exacta.
    igual(simpLatex("sqrt(2)*x"), "f(x)=\\sqrt{2}x", "√2·x: se conserva el radical, no el decimal");
    // Denominador RACIONALIZADO. Antes esto daba `1/√2`, y el precio no era solo tipográfico:
    // escribir la forma correcta `√2/2` la convertía en `1/√2`, así que Simplificar movía la
    // expresión hacia atrás y dejaba de ser un no-op sobre su propia salida.
    igual(simpLatex("1/sqrt(2)"), "f(x)=\\frac{\\sqrt{2}}{2}", "1/√2 → √2/2 (racionalizado)");
    igual(simpLatex("sqrt(2)/2"), "f(x)=\\frac{\\sqrt{2}}{2}", "√2/2 ya es la forma final: no empeora");
    // Radicales REDUCIBLES: `√20 = 2√5` (identidad exacta, mismo dominio). Antes salía `√20`
    // si k≤40 y decimalizado —`7.0710678…`— en cuanto se pasaba de ahí.
    igual(simpLatex("sqrt(20)"), "f(x)=2\\sqrt{5}", "√20 → 2√5");
    igual(simpLatex("sqrt(50)"), "f(x)=5\\sqrt{2}", "√50 → 5√2 (fuera de la tabla vieja)");
    igual(simpLatex("sqrt(20*x)"), "f(x)=2\\sqrt{5x}", "√(20x) → 2√(5x): el factor sale con variable dentro");
    igual(simpLatex("nthRoot(54,3)"), "f(x)=3\\sqrt[3]{2}", "∛54 → 3∛2 (índice ≠ 2)");
    // Exponente decimal IRREDUCIBLE: se queda como se escribió. Antes `simplify` lo convertía
    // en `5637/10000` y el emisor lo pintaba `\sqrt[10000]{x^{5637}}`.
    igual(simpLatex("x^0.5637"), "f(x)=x^{0.5637}", "x^0.5637 sobrevive intacto");
    // La expansión (rationalize) sigue viva y ahora convive con las fracciones.
    igual(simpLatex("(x+1)^2"), "f(x)=x^{2}+2x+1", "expandir sigue funcionando");
  });

  test("Radicales: se extrae la parte entera (división euclídea m = q·n + r)", () => {
    // Un radical no se deja en la primera forma equivalente: `√[n]{x^m}` con m = q·n + r se
    // escribe `x^q·√[n]{x^r}`, que es como lo dejaría una persona. La identidad es exacta y
    // NO mueve el dominio: una potencia de exponente fraccionario ya exige base ≥ 0 (el
    // motor evalúa con Math.pow, NaN en negativos), y el factor entero existe en todo ℝ.
    // Por eso no hace falta el |x| del caso general `√(x²)`: esa forma no llega por aquí,
    // solo llegan potencias de exponente fraccionario.
    igual(simpLatex("x^(3/2)"), "f(x)=x\\sqrt{x}", "3 = 1·2+1 → x√x");
    igual(simpLatex("x^(7/2)"), "f(x)=x^{3}\\sqrt{x}", "7 = 3·2+1 → x³√x");
    igual(simpLatex("x^(11/4)"), "f(x)=x^{2}\\sqrt[4]{x^{3}}", "11 = 2·4+3 → x²⁴√(x³)");
    igual(simpLatex("x^(5/4)"), "f(x)=x\\sqrt[4]{x}", "5 = 1·4+1 → x⁴√x");
    // Escrito como decimal da lo MISMO: la tipografía depende de la expresión, no de cómo
    // se tecleó (que es la regla que esta familia de arreglos viene defendiendo).
    igual(simpLatex("x^1.5"), "f(x)=x\\sqrt{x}", "1.5 y 3/2 son la misma función");
    igual(simpLatex("x^2.75"), "f(x)=x^{2}\\sqrt[4]{x^{3}}", "2.75 y 11/4 también");
    // Base compuesta: el factor extraído necesita paréntesis para no fundirse con el
    // radical. Los pone mathjs por precedencia, así que salen con SU tipografía —que mete un
    // espacio interior con unos contenidos y no con otros, `\left( x+1\right)` frente a
    // `\left(x^{2}+1\right)`—. Es un tic de mathjs que se ve en todo el proyecto (`(x+1)^2`
    // ya se pintaba así), no de esta construcción, y se fija aquí tal cual para que la
    // extracción no invente una tipografía distinta de la del resto del panel.
    igual(simpLatex("(x+1)^(3/2)"), "f(x)=\\left( x+1\\right)\\sqrt{x+1}", "base compuesta");
    igual(simpLatex("(x^2+1)^(3/2)"), "f(x)=\\left(x^{2}+1\\right)\\sqrt{x^{2}+1}",
      "y la misma construcción con otra base");
  });

  test("Radicales: la extracción también alcanza a lo escrito con LLAVES LaTeX", () => {
    // Un exponente racional escrito `x^{3/2}` NO llega aquí como potencia: el parser lo
    // convierte antes en `sqrt(x^3)`, y a propósito —la raíz da el valor real con base
    // negativa donde existe (`x^{2/3}` en x<0) y la potencia daría NaN—. El efecto colateral
    // era que las reglas de esta familia, que miran nodos `^`, no veían nunca esa forma: se
    // pintaba `√(x³)` mientras `x^{1.5}`, la MISMA función, salía `x√x`. Estas son las dos
    // escrituras enfrentadas, que es la regla que este bloque defiende.
    igual(simpLatex("x^{3/2}"), "f(x)=x\\sqrt{x}", "llaves LaTeX → x√x, como x^1.5");
    igual(simpLatex("x^{7/2}"), "f(x)=x^{3}\\sqrt{x}", "7/2");
    igual(simpLatex("x^{11/4}"), "f(x)=x^{2}\\sqrt[4]{x^{3}}", "11/4");
    igual(simpLatex("x^{5/4}"), "f(x)=x\\sqrt[4]{x}", "5/4");
    igual(simpLatex("x^{3/2}"), simpLatex("x^(3/2)"), "las dos escrituras coinciden");
    igual(simpLatex("x^{1.5}"), simpLatex("x^{3/2}"), "y el decimal con la fracción");
    // Por encima de los topes de índice no hay radical que pintar y la potencia se lee
    // mejor. Solo se cambia de forma con índice PAR, que es cuando raíz y potencia tienen el
    // mismo dominio (u ≥ 0): con índice impar la raíz existe en los negativos y la potencia
    // no, y anunciarla como potencia sería prometer una curva más corta que la dibujada.
    igual(simpLatex("x^{5/64}"), "f(x)=x^{\\frac{5}{64}}", "índice 64: potencia, no radical");
    igual(simpLatex("x^{7/32}"), "f(x)=x^{\\frac{7}{32}}", "índice 32: ídem");
    igual(simpLatex("x^{5/9}"), "f(x)=\\sqrt[9]{x^{5}}", "índice IMPAR: se queda radical");
    // Índice PAR con exponente PAR: `⁴√(x⁶)` vale |x|^{3/2} y es positiva en todo su dominio;
    // sacar el factor daría `x·⁴√(x²)`, negativa en x<0. El valor absoluto que lleva dentro
    // la raíz de índice par se perdería, así que no se toca.
    igual(simpLatex("x^{6/4}"), "f(x)=\\sqrt[4]{x^{6}}", "índice par con exponente par: intacto");
  });

  test("Radicales: el exponente IRRACIONAL se queda como potencia", () => {
    // `x^{π/2}` se pintaba `\sqrt{x^{π}}`. Es cierto y nadie lo escribe así: el radical es
    // la notación canónica de un exponente RACIONAL —p/q significa "raíz q-ésima de la
    // potencia p-ésima"—, y π/2 no lo es; ese `/2` es una división corriente, no un índice.
    igual(simpLatex("x^(pi/2)"), "f(x)=x^{\\frac{\\pi}{2}}", "π/2 no es un índice de raíz");
    igual(simpLatex("x^(phi/2)"), "f(x)=x^{\\frac{\\phi}{2}}", "φ/2 tampoco");
    igual(simpLatex("x^(e/3)"), "f(x)=x^{\\frac{e}{3}}", "ni e/3");
    igual(simpLatex("x^(tau/4)"), "f(x)=x^{\\frac{\\tau}{4}}", "ni τ/4");
    // Y la consistencia que motivó la regla vieja se mantiene: escrito como decimal por
    // una constante da la MISMA forma que escrito como cociente.
    igual(simpLatex("x^(0.5*phi)"), "f(x)=x^{\\frac{\\phi}{2}}", "0.5φ y φ/2 se pintan igual");
    // El exponente con variable nunca fue un radical y sigue sin serlo.
    igual(simpLatex("e^(x/2)"), "f(x)=e^{\\frac{x}{2}}", "e^{x/2} conserva su forma exponencial");
  });

  test("Radicales: dos raíces del mismo índice se funden en una", () => {
    // `simplify` reparte la potencia sobre el producto —`(2x)^{1/2}` → `2^{1/2}·x^{1/2}`— y
    // el panel pintaba `√2·√x`, que contradice su propia convención: `√(20x)` se deja
    // `2√(5x)`, con UN radical y lo que no sale dentro. Ahora coinciden.
    igual(simpLatex("(2*x)^(1/2)"), "f(x)=\\sqrt{2x}", "√2·√x → √(2x)");
    igual(simpLatex("(3*x)^(1/2)"), "f(x)=\\sqrt{3x}", "y con cualquier factor numérico");
    // Lo que ya estaba bien no se toca: el factor perfecto sigue saliendo fuera.
    igual(simpLatex("(4*x)^(1/2)"), "f(x)=2\\sqrt{x}", "√(4x) → 2√x, sin fusión que hacer");
    igual(simpLatex("sqrt(20*x)"), "f(x)=2\\sqrt{5x}", "la convención de referencia, intacta");
    // GUARDA DE DOMINIO: `√a·√b = √(ab)` es falsa con a y b ambos negativos (NaN·NaN frente
    // a un real). Con una de las dos demostrablemente ≥0 es segura, y sin eso NO se funde.
    igual(simpLatex("sqrt(x)*sqrt(x-1)"), "f(x)=\\sqrt{x}\\sqrt{x-1}",
      "dos radicandos simbólicos: no se fusionan");
  });

  test("Radicales: la base compuesta sobrevive entera, sin repartirse en dos raíces", () => {
    // `simplify` reparte `(2x)^{5/2}` en `4·2^{1/2}·x^{5/2}` y el panel pintaba
    // `4√2·x²√x`: dos radicales sueltos donde a mano se escribe UNO. Sale de encadenar dos
    // reescrituras sobre el ÁRBOL —extraer la parte entera deja `x^{1/2}` a la vista, y
    // entonces la fusión ve dos `^{1/2}` y los junta—, que es justo lo que no se podía
    // hacer cuando la extracción trabajaba sobre el LaTeX ya emitido.
    igual(simpLatex("(2*x)^(5/2)"), "f(x)=4x^{2}\\sqrt{2x}", "(2x)^{5/2} → 4x²√(2x)");
    igual(simpLatex("(2*x)^(3/2)"), "f(x)=2x\\sqrt{2x}", "(2x)^{3/2} → 2x√(2x)");
    // 3^{7/2} = 27√3, y el √3 se va dentro del radical con la x: 27x³√(3x).
    igual(simpLatex("(3*x)^(7/2)"), "f(x)=27x^{3}\\sqrt{3x}", "(3x)^{7/2} → 27x³√(3x)");
    // Los radicales van al FINAL del producto: `4x²√(2x)`, no `4√(2x)x²`.
    assert(!simpLatex("(2*x)^(5/2)").includes("}x^{2}"), "la raíz no se cuela antes de x²");
  });

  test("Radicales: el exponente NEGATIVO es el recíproco de la raíz", () => {
    // `x^{-1/2}` salía `x^{\frac{-1}{2}}`, con el signo DENTRO de la fracción, que no lo
    // escribe nadie. Es `1/√x`. Mismo dominio: la potencia negativa fraccionaria ya exigía
    // base > 0 y el recíproco excluye el mismo 0.
    igual(simpLatex("x^(-1/2)"), "f(x)=\\frac{1}{\\sqrt{x}}", "x^{-1/2} → 1/√x");
    igual(simpLatex("x^-0.5"), "f(x)=\\frac{1}{\\sqrt{x}}", "escrito en decimal, igual");
    igual(simpLatex("x^(-1/3)"), "f(x)=\\frac{1}{\\sqrt[3]{x}}", "índice 3");
    // Con parte entera, el recíproco envuelve al producto ENTERO: 1/(x²√x).
    igual(simpLatex("x^(-5/2)"), "f(x)=\\frac{1}{x^{2}\\sqrt{x}}", "x^{-5/2} → 1/(x²√x)");
    // Un exponente entero negativo NO es un radical y se queda como potencia.
    igual(simpLatex("x^(-2)"), "f(x)=x^{-2}", "x^{-2} sigue siendo una potencia");
  });

  test("Radicales: solo se pintan cuando se leen MEJOR que la potencia", () => {
    // Que exista una fracción exacta no basta. `x^{5/64}` salía `\sqrt[64]{x^{5}}`:
    // equivalente, ilegible y —lo peor— inestable, porque el aspecto pasaba a depender de
    // si el racionalizador encontró fracción, que es un detalle interno.
    igual(simpLatex("x^(5/64)"), "f(x)=x^{\\frac{5}{64}}", "índice 64: no se pinta radical");
    igual(simpLatex("x^(7/32)"), "f(x)=x^{\\frac{7}{32}}", "índice 32 tampoco");
    igual(simpLatex("x^(1/16)"), "f(x)=x^{\\frac{1}{16}}", "ni siquiera como raíz pura");
    igual(simpLatex("x^(7/8)"), "f(x)=x^{\\frac{7}{8}}", "índice 8 CON potencia: se lee peor");
    // Y los que sí: índice ≤5 con potencia, ≤8 si es raíz pura (sin exponente que leer).
    igual(simpLatex("x^(2/3)"), "f(x)=\\sqrt[3]{x^{2}}", "índice 3 con potencia");
    igual(simpLatex("x^(2/5)"), "f(x)=\\sqrt[5]{x^{2}}", "índice 5: el límite, y lo fija 1.3.1");
    igual(simpLatex("x^(1/8)"), "f(x)=\\sqrt[8]{x}", "raíz pura de índice 8");
    igual(simpLatex("x^(1/5)"), "f(x)=\\sqrt[5]{x}", "raíz pura de índice 5");
  });

  test("Simplificar: identidades trigonométricas válidas en TODO ℝ", () => {
    // mathjs no trae ninguna de las cinco. Solo entran las que no mueven el dominio: la
    // pitagórica no tiene excepciones y las paridades conservan los polos exactos.
    igual(simpLatex("sin(x)^2 + cos(x)^2"), "f(x)=1", "sin²+cos² = 1");
    igual(simpLatex("x^2 + sin(x)^2 + cos(x)^2"), "f(x)=x^{2}+1", "…también dentro de una suma");
    igual(simpLatex("sin(-x)"), "f(x)=-\\sin x", "sin(−x) = −sin x");
    igual(simpLatex("cos(-x)"), "f(x)=\\cos x", "cos(−x) = cos x");
    igual(simpLatex("tan(-x)"), "f(x)=-\\tan x", "tan(−x) = −tan x (mismos polos)");
    // Y la que NO debe casar: argumentos distintos.
    igual(simpLatex("sin(x)^2 + cos(2*x)^2"), "f(x)=\\sin^{2} x+\\cos^{2}\\left(2x\\right)",
      "argumentos distintos: NO es la pitagórica");
  });

  test("Simplificar: el logaritmo se conserva EXACTO, no decimalizado", () => {
    // Mismo criterio que `\sqrt{2}`: el panel muestra la forma exacta, no `1.4142…`. mathjs
    // PLIEGA `log(2, 10)` porque sus dos argumentos son constantes (a `log(u, e)` no lo toca,
    // porque `e` es un símbolo), así que la forma se recupera del decimal por aritmética:
    // elevar la base al valor y ver si sale entero.
    igual(simpLatex("log(2)"), "f(x)=\\log_{10} 2", "log 2 → \\log_{10} 2, no 0.30102999…");
    igual(simpLatex("log(3)"), "f(x)=\\log_{10} 3", "log 3 exacto");
    igual(simpLatex("ln(2)"), "f(x)=\\ln 2", "el natural ya salía exacto: sigue igual");
    igual(simpLatex("log(100)"), "f(x)=2", "cuando SÍ es entero, se resuelve: log 100 = 2");
    // `log(2)+1 = log 20`: exacto, y sobre todo NO la fracción `423026/325147` que salía de
    // racionalizar el decimal con un tope de denominador de 1e6.
    igual(simpLatex("log(2)+1"), "f(x)=\\log_{10} 20", "log 2 + 1 → log 20 (no una fracción monstruosa)");
    assert(!/\d{4,}/.test(simpLatex("log(2)+1")), "sin números de cuatro cifras inventados");
  });

  test("Simplificar: el recíproco de un logaritmo no deja un 1 suelto", () => {
    // `1/ln 10` se recuperaba como nodo `1/log(10)` y al multiplicar dejaba el 1 a la vista:
    // el cambio de base salía como `\frac{1\ln x}{\ln 10}`.
    igual(simpLatex("ln(x)/ln(10)"), "f(x)=\\frac{\\ln x}{\\ln 10}", "cambio de base sin el 1");
    igual(simpLatex("ln(x)/ln(2)"), "f(x)=\\frac{\\ln x}{\\ln 2}", "ídem en base 2");
  });

  test("Despejar: la fracción de la cuadrática sale REDUCIDA", () => {
    // `(y−1)²=x` se expande a `y²−2y+1=x` antes de despejar, así que el caso de manual más
    // común —una parábola desplazada— pasaba por la fórmula general y salía `(2±2√x)/2`.
    // Ninguna pasada de formato lo reducía: todas tratan `pm(·)` como función opaca.
    igual(despLatex("(y-1)^2 = x"), "y=1\\pm \\sqrt{x}", "(y−1)²=x → 1±√x (no (2±2√x)/2)");
    igual(despLatex("(y-3)^2 = x"), "y=3\\pm \\sqrt{x}", "(y−3)²=x → 3±√x");
    // Y lo que NO se debe tocar: sin factor común, la fracción se queda.
    igual(despLatex("y + 1/y = x"), "y=\\frac{x \\pm \\sqrt{x^{2}-4}}{2}", "sin factor común: intacta");
  });

  test("Despejar: exponente NO ENTERO de y (la misma ecuación, escrita de dos formas)", () => {
    // El despeje solo miraba exponentes enteros ≥2, así que el resultado dependía de cómo se
    // hubiera escrito la ecuación: `√y=x−3` se despejaba y `y^{0.5}=x−3` se quedaba parcial.
    // `y^e` con e no entero solo existe para y≥0, donde es inyectiva: inversa única, guarda R≥0.
    const raiz = despLatex("sqrt(y) = x - 3");
    igual(despLatex("y^0.5 = x - 3"), raiz, "y^{0.5}=x−3 despeja IGUAL que √y=x−3");
    igual(raiz, "y={\\left( x-3\\right)}^{2},\\quad x \\ge 3", "…y esa forma es la de siempre");
    igual(despLatex("y^(3/2) = x + 1"), "y=\\sqrt[3]{{\\left( x+1\\right)}^{2}},\\quad x \\ge -1",
      "y^{3/2}=x+1 → y=∛((x+1)²) con x≥−1");
    igual(despLatex("y^2.5 = x"), "y=\\sqrt[5]{x^{2}},\\quad x \\ge 0", "y^{2.5}=x → y=⁵√(x²)");
    // Exponente decimal irreducible: se invierte tal cual, sin inventar una fracción.
    igual(despLatex("y^0.5637 = x"), "y=x^{\\frac{1}{0.5637}},\\quad x \\ge 0",
      "y^{0.5637}=x → y=x^{1/0.5637}");
    // Coeficiente irracional: el panel del despeje era el único de los cuatro que no
    // recuperaba la forma exacta y mostraba `y = 0.22360679774997896x`.
    igual(despLatex("sqrt(20)*y = x"), "y=\\frac{\\sqrt{5}}{10}x", "√20·y=x → y=(√5/10)x, no 0.2236…");
  });

  test("Despejar: coeficiente FRACCIONARIO y reducción (y/2=x → y=2x, no y=x2)", () => {
    // El bug reportado: `y/2=x` daba el sinsentido `y=x2` (y/n no se reconocía como
    // lineal). Ahora se invierte la fracción y se reduce/ordena.
    igual(despLatex("y/2 = x"), "y=2x", "y/2=x → y=2x (¡no y=x2!)");
    igual(despLatex("y/3 = x - 1"), "y=3x-3", "y/3=x−1 → y=3x−3 (distribuye)");
    igual(despLatex("-y/2 = x"), "y=-2x", "-y/2=x → y=-2x (menos en la y)");
    igual(despLatex("2y/3 = x"), "y=\\frac{3x}{2}", "2y/3=x → y=3x/2");
    igual(despLatex("4y = 2x"), "y=\\frac{x}{2}", "reduce: 4y=2x → y=x/2 (¡no 2x/4!)");
    igual(despLatex("-2y = x"), "y=\\frac{- x}{2}", "coef negativo: -2y=x → y=-x/2 (no x/-2)");
    igual(despLatex("2y = x"), "y=\\frac{x}{2}", "2y=x → y=x/2");
    igual(despLatex("x*y = 6"), "y=\\frac{6}{x}", "coef simbólico intacto: xy=6 → y=6/x");
    // Coeficiente ±1 (forma canónica directa) SIN cambios de regresión.
    igual(despLatex("2x + y = 6"), "y=-2x+6", "coef 1 sigue canónico y=-2x+6");
    igual(despLatex("3x - y = 1"), "y=3x-1", "coef −1 sigue canónico y=3x−1");
  });

  test("Derivada (obs-derivate): fracción ÚNICA, no anidada (d/dx √x → 1/(2√x))", () => {
    // El bug reportado: `derivative` serializa `d/dx √x` como `(1/2)/√x` → fracción
    // ANIDADA `\frac{\frac{1}{2}}{\sqrt{x}}`. `racionalizarFracciones` la colapsa.
    igual(derivadaLatex(["sqrt(x)"]), "f'\\left(x\\right) = \\frac{1}{2\\sqrt{x}}",
      "d/dx √x → 1/(2√x), no fracción anidada");
    igual(derivadaLatex(["sqrt(x)/2"]), "f'\\left(x\\right) = \\frac{1}{4\\sqrt{x}}",
      "d/dx √x/2 → 1/(4√x)");
    igual(derivadaLatex(["3*sqrt(x)"]), "f'\\left(x\\right) = \\frac{3}{2\\sqrt{x}}",
      "d/dx 3√x → 3/(2√x)");
    // Regresión: derivadas SIN fracción decimal quedan como las da mathjs (menos fuera).
    igual(derivadaLatex(["1/x"]), "f'\\left(x\\right) = -\\frac{1}{x^{2}}",
      "d/dx 1/x → -1/x² (menos FUERA, sin tocar)");
    igual(derivadaLatex(["x^2"]), "f'\\left(x\\right) = 2x", "d/dx x² → 2x (intacta)");
    igual(derivadaLatex(["sin(x)"]), "f'\\left(x\\right) = \\cos x", "d/dx sin x → cos x");
  });

  test("Derivada (obs-derivate): simplificación algebraica posterior (fracción única)", () => {
    // El caso reportado: d/dx arctan(√(x+1)/(x²+1)) salía con CUATRO niveles de fracción
    // (`derivative` no combina). La etapa `simplificarDerivada` (sqrt(u)²→u +
    // `combinarFracciones`: común denominador, cancelación, numerador expandido) la deja
    // en una sola fracción. Solo se adopta si es numéricamente EQUIVALENTE a la cruda
    // (mismos valores y mismo dominio en la muestra) y más corta.
    igual(derivadaLatex(["atan(sqrt(x+1)/(x^2+1))"]),
      "f'\\left(x\\right) = \\frac{-3x^{2}-4x+1}{2\\sqrt{x+1}\\left( x+1+{\\left(x^{2}+1\\right)}^{2}\\right)}",
      "derivada de arctan compuesta → una sola fracción compacta");
    // Cociente: fracción combinada con el denominador al cuadrado (regla del cociente).
    igual(derivadaLatex(["x/(x^2+1)"]),
      "f'\\left(x\\right) = \\frac{1-x^{2}}{{\\left(x^{2}+1\\right)}^{2}}",
      "d/dx x/(x²+1) → (1−x²)/(x²+1)²");
    // Fracción anidada del cociente: (2x − x²/(x+1))/(x+1) → (x²+2x)/(x+1)².
    igual(derivadaLatex(["x^2/(x+1)"]),
      "f'\\left(x\\right) = \\frac{x^{2}+2x}{{\\left( x+1\\right)}^{2}}",
      "d/dx x²/(x+1): fracción anidada colapsada");
    // Las derivadas ya compactas quedan INTACTAS (la candidata no es más corta).
    igual(derivadaLatex(["x^2"]), "f'\\left(x\\right) = 2x", "2x intacta");
    igual(derivadaLatex(["1/x^2"]), "f'\\left(x\\right) = -\\frac{2}{x^{3}}", "-2/x³ intacta");
  });

  test("Derivada (obs-derivate): producto DISTRIBUIDO en vez de fracción de fracciones", () => {
    // d/dx(arccot(x²)·√x): la forma combinada es UNA fracción cuyo numerador vuelve a
    // llevar fracciones —`(arccot(x²)/2 − 2x²/(x⁴+1))/√x`—. La candidata `derivadaDistribuida`
    // aplica la regla del producto por términos y limpia cada uno por separado, dando términos
    // PLANOS (menos anidamiento de fracciones), que `simplificarDerivada` prefiere.
    igual(derivadaLatex(["arccot(x^2)*sqrt(x)"]),
      "f'\\left(x\\right) = \\frac{\\operatorname{arccot}\\left(x^{2}\\right)}{2\\sqrt{x}}-\\frac{2x\\sqrt{x}}{x^{4}+1}",
      "arccot(x²)·√x → términos planos, no fracción de fracciones");
    // La regla del producto también compacta lo que se cancela: d/dx(x·ln x) = ln x + 1.
    igual(derivarExpr("x*ln(x)"), "log(x, e) + 1", "d/dx(x·ln x) = ln x + 1");
    // Un cociente NO se reparte (sería la regla del cociente, que mathjs ya combina bien):
    // se conserva la fracción única del test anterior.
    igual(derivadaLatex(["x/(x^2+1)"]),
      "f'\\left(x\\right) = \\frac{1-x^{2}}{{\\left(x^{2}+1\\right)}^{2}}",
      "cociente: sigue en fracción única (no se distribuye)");
  });

  // La salida LaTeX ordena la suma polinómica de nivel superior en grado DESCENDENTE
  // (x² antes que x antes que la constante), aunque mathjs entregue el string sin ordenar
  // (`2x + x^2`). Es cosmético: el string que grafica el motor NO cambia (ver el `grafica`
  // del trazador), solo la tipografía del panel. Bug reportado: `f'(x)=2x+x²` debía pintarse
  // `x²+2x`.
  test("LaTeX: los términos del polinomio van en grado descendente", () => {
    // Caso reportado: d/dx(x³/3+x²−5) = 2x+x² debe MOSTRARSE como x²+2x.
    igual(derivadaLatex(["\\frac{x^{3}}{3}+x^{2}-5"]), "f'\\left(x\\right) = x^{2}+2x",
      "d/dx(x³/3+x²−5) → x²+2x (no 2x+x²)");
    // Una expresión suelta cualquiera: el orden se aplica en todo el pipeline compartido.
    igual(exprALatex("2*x + x^2"), "x^{2}+2x", "2x+x² → x²+2x");
    // (El espacio en `+ x` es artefacto tipográfico de mathjs ante un símbolo suelto —el
    // mismo que aparece en `\left( x+1`—; KaTeX lo ignora.)
    igual(exprALatex("3 - x^2 + x"), "-x^{2}+ x+3", "reordena con signos: 3−x²+x → -x²+x+3");
    igual(exprALatex("1 + x^3 + x"), "x^{3}+ x+1", "cúbico: 1+x³+x → x³+x+1");
    // Términos NO polinómicos (función de x) → se deja el orden de mathjs INTACTO.
    igual(exprALatex("1 + sin(x)"), "1+\\sin x", "no polinómico: no se reordena");
    // Lo ya descendente queda idéntico (regresión: sin reordenar de más).
    igual(exprALatex("x^2 - 5"), "x^{2}-5", "ya descendente: intacto");
  });

  test("Derivada (obs-derivate): el usuario escribe el OPERADOR y se desenvuelve", () => {
    // Bug reportado: escribir `\frac{d}{dx}(x^2)` en el bloque hacía que `d` se tratara
    // como variable (→ `d·x²/(d·x)`) y el panel pintara un operador anidado. Ahora se
    // reconoce el operador de Leibniz y se deriva su argumento igual que si se escribiera
    // solo `x^2`. Con `(…)` y con `\left(…\right)`, y con espacios.
    igual(derivadaLatex(["\\frac{d}{dx}(x^{2})"]), "f'\\left(x\\right) = 2x",
      "operador con (…) → deriva el interior x²");
    igual(derivadaLatex(["\\frac{d}{dx}\\left(x^{2}\\right)"]), "f'\\left(x\\right) = 2x",
      "operador con \\left(…\\right) → igual");
    igual(derivadaLatex(["  \\frac{d}{ dx }\\left( sin(x) \\right)"]),
      "f'\\left(x\\right) = \\cos x", "tolera espacios en el operador");
    // Operador SIN paréntesis: el prefijo `\frac{d}{dx}` es siempre el operador (en este
    // bloque `d` no es una variable), así que su argumento se deriva igual que agrupado.
    // Antes esto dejaba pasar `d` al parser (`d·x²/(d·x)`) y graficaba basura (→ `1`).
    igual(derivadaLatex(["\\frac{d}{dx} x^2"]), "f'\\left(x\\right) = 2x",
      "operador sin paréntesis → deriva x² igual (antes: basura)");
    // Sin grupo que envuelva TODO, el resto entero es el argumento: ambas grafías coinciden
    // (y ahora dan la derivada correcta de x+1, no una basura que solo casualmente coincidía).
    igual(derivadaLatex(["\\frac{d}{dx}(x)+1"]), derivadaLatex(["\\frac{d}{dx} x + 1"]),
      "sin grupo que envuelva TODO: el resto entero es el argumento");
    igual(derivadaLatex(["\\frac{d}{dx} x + 1"]), "f'\\left(x\\right) = 1",
      "d/dx(x+1) = 1 (correcta, no basura con `d` de variable)");
    // Otra variable de derivación (`\frac{d}{dy}`) o notación `dy/dx`: este bloque solo
    // deriva respecto de x → se RECHAZA en vez de derivar wrt x igual o filtrar `d`.
    igual(derivadaLatex(["\\frac{d}{dy}(x^2)"]), "f'\\left(x\\right) = \\text{[...]}",
      "\\frac{d}{dy} no es derivable por este bloque → sin resultado");
    igual(derivadaLatex(["\\frac{dy}{dx}"]), "f'\\left(x\\right) = \\text{[...]}",
      "dy/dx (Leibniz) → sin resultado (antes: -(y/x²) basura)");
    // Implícita escrita SIN `=` (`y` libre): no es una f(x) → no se deriva como ∂/∂x.
    igual(derivadaLatex(["x^2+y^2-16"]), "f'\\left(x\\right) = \\text{[...]}",
      "y libre → implícita, no f(x) (antes: ∂/∂x silencioso → 2x)");
    igual(derivadaLatex(["x^2+y^2=16"]), "f'\\left(x\\right) = \\text{[...]}",
      "misma implícita con `=` → coherente, tampoco se deriva");
  });
});
