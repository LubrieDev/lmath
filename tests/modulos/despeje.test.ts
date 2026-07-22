// ─────────────────────────────────────────────
// tests · Despeje y simplificación
// ─────────────────────────────────────────────
//
// Transformaciones del panel (Despejar y / Simplificar), raíz impar y cuadrática
// general, la guarda de expansión de `rationalize` y la batería graduada del
// despejador (de trivial a imposible), con sus comprobadores `ramasDelDespeje` y
// `despejeCorrecto`.
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { despejarEcuaciones, despejarY } from "../../src/despejar";
import { simplificarCondiciones } from "../../src/condiciones";
import { clasificarDespeje, tieneFamilia } from "../../src/despejeInverso";
import { simplificarEcuaciones } from "../../src/simplificar";
import { costeExpansion, rationalizeSeguro, LIMITE_EXPANSION, type Nodo } from "../../src/formatoExpr";
import { derivadaLatex, derivarExpr } from "../../src/derivar";
import { crearFuncionReal } from "../../src/motor/fields/funcionRealMathjs";
import { bloqueALatex, exprALatex } from "../../src/latex";
import { compilarFuncion } from "../../src/evaluador";
import { parse } from "mathjs";
import { construirObjeto } from "../../src/motor/parsing/construirObjeto";
import { expandirDobleSigno } from "../../src/motor/parsing/dobleSigno";

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
    igual(despLatex("x^{2/3}+y^{2/3}=1"), "y=\\pm \\sqrt{{\\left(1-\\sqrt[3]{x^{2}}\\right)}^{3}}",
      "astroide → y=±√((1−∛(x²))³)");
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
    igual(simpLatex("1/sqrt(2)"), "f(x)=\\frac{1}{\\sqrt{2}}", "1/√2: radical exacto, no 0.707…");
    // La expansión (rationalize) sigue viva y ahora convive con las fracciones.
    igual(simpLatex("(x+1)^2"), "f(x)=x^{2}+2x+1", "expandir sigue funcionando");
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
    igual(derivarExpr("x*log(x)"), "log(x) + 1", "d/dx(x·ln x) = ln x + 1");
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

/** Ramas reales de un despeje `y = …` con el centinela `pm`: expande el ± en sus dos signos. */
function ramasDelDespeje(despeje: string): string[] {
  const m = despeje.match(/^y\s*=\s*(.*)$/s);
  if (!m) return [];
  const salida: string[] = [];
  const expandir = (s: string): void => {
    const i = s.indexOf("pm(");
    if (i < 0) { salida.push(s); return; }
    let d = 1, j = i + 3;
    while (j < s.length && d > 0) { if (s[j] === "(") d++; if (s[j] === ")") d--; j++; }
    const dentro = s.slice(i + 3, j - 1);
    for (const sg of ["+", "-"]) expandir(`${s.slice(0, i)}(${sg}(${dentro}))${s.slice(j)}`);
  };
  expandir(m[1]);
  return salida;
}

/** Comprueba que TODA rama del despeje satisface la ecuación ORIGINAL donde es real. */
function despejeCorrecto(ecuacion: string, F: (x: number, y: number) => number): void {
  const ramas = ramasDelDespeje(despejarEcuaciones([ecuacion])[0]);
  assert(ramas.length > 0, `${ecuacion}: no quedó aislada en y`);
  let viables = 0;
  for (const rama of ramas) {
    const f = crearFuncionReal(rama);
    for (let x = -3; x <= 3; x += 0.137) {
      const y = f.eval(x) as number;
      if (!Number.isFinite(y)) continue;         // fuera del dominio de la rama
      aprox(F(x, y), 0, 1e-6 * (1 + x ** 4 + y ** 4), `${ecuacion} en x=${x.toFixed(2)}`);
      viables++;
    }
  }
  assert(viables >= 2, `${ecuacion}: la rama nunca es real (no se validó nada)`);
}

describe("Despejar y: raíz impar + cuadrática general (familia del corazón)", () => {
  test("corazón (x²+y²−1)³=x²y³ → y = (∛(x²) ± √(∛(x⁴)+4−4x²))/2, COMPLETO", () => {
    const r = despejarY("\\left(x^{2}+y^{2}-1\\right)^{3}=x^{2}y^{3}");
    assert(r !== null && r.completo, "el despeje del corazón es COMPLETO (antes: parcial)");
    igual(
      r!.latex,
      "y=\\frac{\\sqrt[3]{x^{2}} \\pm \\sqrt{\\sqrt[3]{x^{4}}+4-4x^{2}}}{2}",
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
    for (const ec of ["log(y)=x", "e^y=x", "2^y+1=x", "sinh(y)=x", "atanh(y)=x",
                      "sin(2y)=x", "tan(2y)+x=2", "(y+1)^3=x", "exp(y^3)=x"])
      assert(completa(ec), `se despeja del todo: ${ec}`);
    // Fidelidad NUMÉRICA: cada rama despejada cumple su ecuación original donde es real.
    const chequeos: Array<[string, string, (x: number, y: number) => number]> = [
      ["log(y)=x", "exp(x)", (x, y) => Math.log(y) - x],
      ["e^y=x", "log(x)", (x, y) => Math.exp(y) - x],
      ["sinh(y)=x", "asinh(x)", (x, y) => Math.sinh(y) - x],
      ["(y+1)^3=x", "nthRoot(x,3)-1", (x, y) => (y + 1) ** 3 - x],
      ["exp(y^3)=x", "cbrt(log(x))", (x, y) => Math.exp(y ** 3) - x],
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
    igual(tex("(log(y))^2=x"), "y=e^{\\pm \\sqrt{x}},\\quad x \\ge 0", "(ln y)²=x ⇒ y=e^{±√x}, x≥0");
    igual(despejarEcuaciones(["abs(2*y+1)=x"])[0], "y = ((dom(pm((x)), x)) - (1)) / (2)", "|2y+1|=x ⇒ y=(±x−1)/2, x≥0");
    igual(despejarEcuaciones(["nthRoot(y^3-2, 4)=x"])[0], "y = cbrt((dom(((x))^4, x)) + (2))", "⁴√(y³−2)=x ⇒ guarda x≥0");
    // Guarda TRIVIALMENTE cierta (t=x²≥0) → sin coletilla; guarda constante NEGATIVA → sin
    // solución real, no se fuerza nada y la ecuación se queda como está.
    assert(!/\\ge 0/.test(tex("sqrt(tan(y)+1)=x^2")), "guarda obvia (x²≥0): sin coletilla");
    assert(!/^y = /.test(despejarEcuaciones(["sqrt(2*y+1)=-3"])[0]), "√(…)=−3: sin solución real, parcial");
    // Fidelidad NUMÉRICA de las ramas nuevas contra la ecuación original.
    const chequeos: Array<[string, string, (x: number, y: number) => number]> = [
      [String.raw`\sqrt{\tan(y)+1}=x`, "atan(x^2-1)", (x, y) => Math.sqrt(Math.tan(y) + 1) - x],
      ["e^(y^2)=x", "sqrt(log(x))", (x, y) => Math.exp(y * y) - x],
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
    resoluble("log(y) = x", (x, y) => Math.log(y) - x, "ln y = x");
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
    resoluble("log(y^3 + 1) = x", (x, y) => Math.log(y ** 3 + 1) - x, "ln(y³+1)");
    resoluble("sqrt(tan(y) + 1) = x", (x, y) => Math.sqrt(Math.tan(y) + 1) - x, "√(tan y+1)");
    resoluble("(log(y))^2 = x", (x, y) => Math.log(y) ** 2 - x, "(ln y)²");
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
      ["log(y) + y = x", "trascendente mixta (Lambert de nuevo)"],
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
