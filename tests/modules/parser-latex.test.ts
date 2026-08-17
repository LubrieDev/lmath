// ─────────────────────────────────────────────
// tests · Parser y LaTeX: entrada y renderizado de fórmulas
// ─────────────────────────────────────────────
//
// `latex.ts` (símbolo·variable, paréntesis escalables), la herramienta trazador de
// transformaciones, `func^n(x)`, trig sin backslash, los símbolos de entrada (± y
// comandos LaTeX) y las formas degeneradas.
//
// Se carga desde `tests/motor.test.ts`, que es quien imprime el resumen.

import { describe, test, assert, igual, aprox } from "../runner";
import { crearViewport } from "../../src/core/scene/viewport-utils";
import { simplificarEcuaciones } from "../../src/simplificar";
import { despejarEcuaciones } from "../../src/despejar";
import { derivadaLatex, derivarExpr } from "../../src/derivar";
import { extraerIntegral, cuerpoAreaLatexExacto, etiquetaIntegral } from "../../src/integral";
import { trazar, parsearEntrada, normalizarTipo } from "../../src/tools/trazador";
import { bloqueALatex, exprALatex } from "../../src/latex";
import { normalizarEntrada, comandosNoSoportados } from "../../src/parser";
import { compilarFuncion } from "../../src/evaluador";
import { parse } from "mathjs";
import { insertarProductoImplicito } from "../../src/core/parsing/productoImplicito";
import { construirObjetosEscena } from "../../src/core/app/composicion";
import type { Tolerancia } from "../../src/core/contracts";

// ════════════════════════════════════════════════
// Tipografía LaTeX: símbolo con nombre × variable, y paréntesis escalables (src/latex.ts).
// ════════════════════════════════════════════════
describe("latex.ts: símbolo·variable y paréntesis escalables", () => {
  test("símbolo con nombre × variable NO se pega al comando (evita `\\pix` en rojo)", () => {
    // Bug: `\pi\cdot x` colapsaba a `\pix` (comando inexistente → KaTeX en rojo). Ahora la
    // variable va en llaves: `\pi{x}` (π·x). Vale con coeficiente delante.
    igual(exprALatex("pi*x"), "\\pi{x}", "π·x → \\pi{x}, no \\pix");
    igual(exprALatex("5*pi*x"), "5\\pi{x}", "5·π·x → 5\\pi{x}");
    igual(exprALatex("pi*theta"), "\\pi\\theta", "comando·comando SÍ se pega (válido)");
  });

  test("todos los paréntesis quedan escalables \\left(…\\right)", () => {
    igual(exprALatex("2*(x+1)"), "2\\left( x+1\\right)", "( → \\left(  ) → \\right)");
    // No se duplica lo que ya es escalable ni se rompen comandos con llaves.
    assert(!/(?<!\\left)\(/.test(exprALatex("(x+1)*(x-1)")), "sin paréntesis sin escalar");
    igual(exprALatex("sqrt(x)"), "\\sqrt{x}", "\\sqrt{} intacto (no toca sus llaves)");
  });

  test("constantes con nombre (π, e) DELANTE y términos semejantes combinados", () => {
    const s = (ec: string) => simplificarEcuaciones([ec])[0];
    // π delante de la variable y 5πx−xπ combinado a 4πx (rationalize los dejaba sueltos).
    igual(s("(x^2+5x-x)*pi"), "pi * x ^ 2 + 4 * pi * x", "π delante + combinado");
    igual(exprALatex(s("(x^2+5x-x)*pi")), "\\pi{x}^{2}+4\\pi{x}", "LaTeX: \\pi delante, sin espacio");
    igual(s("5*pi*x - x*pi"), "4 * pi * x", "junta 5πx−xπ → 4πx");
    igual(s("x^2*pi"), "pi * x ^ 2", "x²·π → π·x²");
    igual(s("3*x*e + 2*e*x"), "5 * e * x", "e también va delante y combina");
    // Polinomios SIN constante con nombre: orden canónico intacto (variables antes que constantes).
    igual(s("2*x + 6"), "2 * x + 6", "sin π: canónico intacto");
    igual(s("-2*x + 6"), "-2 * x + 6", "sin π: negativo al frente intacto");
  });

  test("coeficiente NEGATIVO con π: el menos unario de mathjs no rompe el orden", () => {
    const s = (ec: string) => simplificarEcuaciones([ec])[0];
    // `-pi*(2x+4)` distribuye a `pi * -2 * x - 4 * pi` (el −2 es OperatorNode unario,
    // no ConstantNode): sin reconocerlo, el panel mostraba el erróneo `\pi-2x-4\pi`.
    igual(s("-pi*(2*x+4)"), "-2 * pi * x - 4 * pi", "coeficiente al frente con signo");
    igual(exprALatex(s("-pi*(2*x+4)")), "-2\\pi{x}-4\\pi", "LaTeX: -2πx−4π");
    igual(exprALatex(s("pi*(2*x+4)")), "2\\pi{x}+4\\pi", "sin signo: intacto (regresión)");
  });

  test("un `log` SIN base es DECIMAL: valor y tipografía, en las cuatro grafías", () => {
    // Antes las cuatro acababan en el `log` de mathjs, que es el NATURAL: `log(100)` valía
    // 4,605 en vez de 2 y se pintaba `\ln 100`. No era tipografía, era el valor —y la curva.
    const val = (e: string) =>
      compilarFuncion(insertarProductoImplicito(normalizarEntrada(e)), "x")(3) as number;
    for (const e of ["log(100)", String.raw`\log{100}`, String.raw`\log(100)`, String.raw`\log 100`])
      aprox(val(e), 2, 1e-12, `${e} = 2 (base 10)`);
    aprox(val("ln(e)"), 1, 1e-12, "ln sigue siendo el natural");
    aprox(val("log(8,2)"), 3, 1e-12, "con base escrita: intacto");
    // Tipografía: base en subíndice —igual que ya se pintaba `log(u,b)`— y el criterio de
    // paréntesis del resto del panel (átomo sin ellos, como `\ln 2` y `\sin x`).
    igual(bloqueALatex(["log(2)"]), "f(x)=\\log_{10} 2", "log(2) → \\log_{10} 2");
    igual(bloqueALatex([String.raw`\log{x}`]), "f(x)=\\log_{10} x", "argumento atómico: sin paréntesis");
    igual(bloqueALatex(["log(x+1)"]), "f(x)=\\log_{10}\\left( x+1\\right)", "compuesto: con paréntesis");
    igual(bloqueALatex(["ln(x)"]), "f(x)=\\ln x", "el natural se pinta \\ln, no \\log_{e}");
    // Y el despeje conoce la inversa de cada base.
    igual(despejarEcuaciones(["log(y)=x"])[0], "y = (10)^((x))", "log y = x ⇒ y = 10^x");
    igual(despejarEcuaciones(["ln(y)=x"])[0], "y = (e)^((x))", "ln y = x ⇒ y = e^x");
  });

  test("Simplificar: log(e^u) = u (identidad válida en TODO ℝ)", () => {
    const s = (ec: string) => simplificarEcuaciones([ec])[0];
    igual(s("ln(e^(3*x))"), "3 * x", "ln(e^{3x}) → 3x");
    igual(s("sin(x) + ln(e^(2*x))"), "sin(x) + 2 * x", "dentro de una suma");
    // La inversa e^(log u)=u NO se aplica (solo vale para u>0: cambiaría el dominio).
    igual(s("e^(ln(x))"), "e ^ log(x, e)", "e^{ln x} intacto (dominio x>0)");
  });

  test("Simplificar: aplana la FRACCIÓN DE FRACCIONES (mismo criterio que la derivada)", () => {
    const s = (ec: string) => simplificarEcuaciones([ec])[0];
    // Con una función, `rationalize` se rinde y `simplify` deja la fracción anidada
    // `(sin x/2 + cos x/3)/x`. `combinarFracciones` la aplana a UNA sola fracción, adoptada
    // por ser menos anidada y numéricamente equivalente (mismo dominio).
    // (El doble paréntesis del numerador es artefacto de `combinarFracciones`; se
    // re-parsea al pintar el LaTeX, que sale limpio: `\frac{3\sin x+2\cos x}{6x}`.)
    igual(s("(sin(x)/2 + cos(x)/3)/x"), "(3 * sin(x) + 2 * cos(x)) / (6 * x)",
      "fracción de fracciones con trig → una sola fracción");
    igual(exprALatex(s("(sin(x)/2 + cos(x)/3)/x")), "\\frac{3\\sin x+2\\cos x}{6x}",
      "LaTeX limpio de la fracción aplanada");
    // Lo YA plano queda intacto (no se toca lo que no está anidado).
    igual(s("x/(x^2+1)"), "x / (x ^ 2 + 1)", "fracción plana: intacta");
    // GUARDIÁN de dominio: aplanar cancelaría √x·√x=x y admitiría x<0 → se RECHAZA y se
    // conserva la forma fiel al dominio (√x sigue presente, indefinida en x<0).
    const dom = s("(sin(x)/sqrt(x))/sqrt(x)");
    assert(/sqrt/.test(dom), `conserva √x (dominio x≥0), no lo cancela: ${dom}`);
  });

  test("Simplificar: NO combina una suma de fracciones legible (función+raíz+impl.+fracción)", () => {
    const s = (ec: string) => simplificarEcuaciones([ec])[0];
    // Bug: `simplify` reescribía `arccot(x²)/(2√x) − 2x√x/(x⁴+1)` a una fracción de
    // fracciones `(arccot(x²)/2 − 2√x²x/(x⁴+1))/√x`, que luego se combinaba en la fea
    // `(arccot(x²)(x⁴+1) − 4√x²x)/(2√x(x⁴+1))`. Ahora, al ser una fracción de fracciones, se
    // recupera la ENTRADA ORIGINAL (más plana y equivalente): la forma legible del usuario.
    const r = s("arccot(x^2)/(2*sqrt(x)) - 2*x*sqrt(x)/(x^4+1)");
    igual(r, "acot(x ^ 2) / (2 * sqrt(x)) - 2 * x * sqrt(x) / (x ^ 4 + 1)",
      "suma de fracciones legible: conservada, no combinada");
    igual(exprALatex(r),
      "\\frac{\\operatorname{arccot}\\left(x^{2}\\right)}{2\\sqrt{x}}-\\frac{2x\\sqrt{x}}{x^{4}+1}",
      "LaTeX de la forma legible (arccot + raíz + producto implícito + fracciones)");
    // NO debe aparecer la fracción combinada ni `sqrt(x)^2`.
    assert(!/\\frac\{[^}]*\\operatorname\{arccot\}[^}]*\\left\(x\^\{4\}\+1\\right\)/.test(exprALatex(r)),
      `no combina en una sola fracción: ${exprALatex(r)}`);
  });

  test("LaTeX: variable pegada a función/raíz NO se fusiona en identificador (xsqrt, xsin)", () => {
    // Bug: `ladoALatex` normalizaba SIN insertar el producto implícito, así que `2x\sqrt{x}`
    // → `2xsqrt(x)` y mathjs leía `xsqrt` como FUNCIÓN → `\frac{2\mathrm{xsqrt}(x)}{…}`. Ahora
    // inserta el `*` (como el motor) → `x` y `\sqrt{x}` quedan separados.
    igual(exprALatex(String.raw`2x\sqrt{x}`), "2x\\sqrt{x}", "2x√x no se fusiona en xsqrt");
    igual(exprALatex(String.raw`\frac{2x\sqrt{x}}{x^4+1}`), "\\frac{2x\\sqrt{x}}{x^{4}+1}",
      "fracción con producto implícito y raíz");
    igual(exprALatex("x*sin(x)"), "x\\sin x", "x·sin(x) explícito intacto");
    igual(exprALatex("3xy"), "3xy", "producto implícito puro: intacto");
    // Regresión: NO debe aparecer \mathrm{xsqrt}/\mathrm{xsin} en ninguno.
    assert(!/mathrm\{x(sqrt|sin)/.test(exprALatex(String.raw`2x\sqrt{x}`)), "sin \\mathrm{xsqrt}");
  });

  test("función desnuda en producto: al final; parentizada SOLO junto a una potencia", () => {
    // Bug: `cos(x)·e^x` salía `\cos x{e}^{x}`, que se lee como cos(x·e^x). La función desnuda
    // (`\cos x`, sin paréntesis) se reordena al FINAL para que no parezca tragarse el factor
    // siguiente; y como el acompañante es una POTENCIA (`e^x`), además se parentiza.
    igual(exprALatex("cos(x)*e^x"), "e^{x}\\left(\\cos x\\right)", "función·potencia → e^x(cos x)");
    igual(exprALatex("x^2*ln(x)"), "x^{2}\\left(\\ln x\\right)", "x²·ln x → x²(ln x)");
    // Coeficiente numérico o variable suelta: se reordena pero NO se parentiza (queda limpio).
    igual(exprALatex("cos(x)*2"), "2\\cos x", "cos(x)·2 → 2 cos x (número: sin paréntesis)");
    igual(exprALatex("sin(x)*x"), "x\\sin x", "sin(x)·x → x sin x (variable: sin paréntesis)");
    // Función con argumento NO atómico ya lleva sus paréntesis: no es 'desnuda', no se toca.
    igual(exprALatex("sin(x+1)*x"), "\\sin\\left( x+1\\right)x", "sin(x+1)·x: no se reordena");
    // Varias funciones con una potencia: todas parentizadas al final, en orden estable.
    igual(exprALatex("sin(x)*e^x*cos(x)"), "e^{x}\\left(\\sin x\\right)\\left(\\cos x\\right)",
      "e^x·sin x·cos x → e^x(sin x)(cos x)");
  });
});

// ════════════════════════════════════════════════
// Herramienta de desarrollo: trazador de transformaciones (src/tools/). No pinta
// nada; reproduce paso a paso lo que ENTREGA (string mathjs) y RENDERIZA (LaTeX) cada
// bloque, reutilizando el MISMO pipeline que el panel. Protege el contrato de esa salida.
// ════════════════════════════════════════════════
describe("Herramienta: trazador de transformaciones", () => {
  test("parsearEntrada: [a/b] separa por / DENTRO de corchetes; x/2 sin corchetes es división", () => {
    igual(parsearEntrada("[x^2/x^3]").join("|"), "x^2|x^3", "corchetes → dos ecuaciones");
    igual(parsearEntrada("x/2").join("|"), "x/2", "sin corchetes: / es división, una ecuación");
    igual(parsearEntrada("[ a / b / c ]").join("|"), "a|b|c", "recorta espacios; 3 ecuaciones");
  });

  test("normalizarTipo: acepta nombres de bloque, cortos y sinónimos en español", () => {
    igual(normalizarTipo("obs-system"), "system", "obs-system → system");
    igual(normalizarTipo("sistema"), "system", "sinónimo español");
    igual(normalizarTipo("obs-derivate"), "derivate", "obs-derivate → derivate");
    igual(normalizarTipo("derivada"), "derivate", "sinónimo español");
    igual(normalizarTipo("cualquier-cosa"), "graph", "desconocido → graph por defecto");
  });

  test("trazar graph: Original → Simplificado → Despejar y, con mathjs y LaTeX", () => {
    const t = trazar("x^3+y^3=9", "graph");
    igual(t.bloques.length, 1, "una curva");
    const p = t.bloques[0].pasos;
    igual(p.map((s) => s.etiqueta).join(" | "),
      "Original (escrito) | Simplificado | Despejar y", "los tres pasos en orden");
    igual(p[2].mathjs[0], "y = nthRoot((9 - x ^ 3), 3)", "Despejar entrega el string graficable");
    igual(p[2].latex, "y=\\sqrt[3]{9-x^{3}}", "Despejar renderiza la raíz cúbica");
    igual(t.bloques[0].diagnostico[0].tipo, "implicita", "diagnóstico: tipo implícita");
  });

  test("trazar graph con [a/b]: dos curvas INDEPENDIENTES", () => {
    const t = trazar("[x^2/x^3]", "graph");
    igual(t.bloques.length, 2, "dos bloques independientes");
    igual(t.bloques[0].pasos[0].latex, "f(x)=x^{2}", "curva 1");
    igual(t.bloques[1].pasos[0].latex, "f(x)=x^{3}", "curva 2");
  });

  test("trazar derivate: operador (f simplificada) y derivada evaluada = lo graficado", () => {
    const t = trazar("\\frac{d}{dx}(x^2)", "derivate");
    const p = t.bloques[0].pasos;
    igual(p[0].latex, "\\frac{d}{dx}\\left(x^{2}\\right)", "operador desenvuelto y simplificado");
    igual(p[1].mathjs[0], "2 * x", "la derivada evaluada es el string que grafica el plano");
    igual(p[1].latex, "f'\\left(x\\right) = 2x", "LaTeX de la derivada");
  });

  test("trazar system: trata TODAS las ecuaciones como UN sistema (cases)", () => {
    const t = trazar("[x-y=1/x+y=3]", "system");
    igual(t.bloques.length, 1, "un solo bloque (el sistema entero)");
    igual(t.bloques[0].pasos[2].mathjs.join(" ; "), "y = x - 1 ; y = -x + 3", "despeja ambas");
    assert(t.bloques[0].pasos[0].latex.startsWith("\\begin{cases}"), "LaTeX en cases");
  });

  test("normalizarTipo: obs-integral y sinónimos → integral", () => {
    igual(normalizarTipo("obs-integral"), "integral", "obs-integral → integral");
    igual(normalizarTipo("integrar"), "integral", "sinónimo español");
  });

  test("trazar integral: EXTRAE límites/integrando ANTES del parser (no i*n*t)", () => {
    // Regresión: obs-integral caía a graph y el parser algebraico corrompía `\int`→i*n*t,
    // `dx`→d*x. Ahora se detecta la integral y SOLO el integrando pasa al parser.
    const t = trazar("\\int_{1/2}^{2}\\frac{\\arccot\\left(x^{2}\\right)}{2\\sqrt{x}}\\,dx", "integral");
    igual(t.tipo, "integral", "tipo integral (cabecera obs-integral)");
    const d = t.bloques[0].diagnostico[0];
    igual(d.tipo, "explicita", "el INTEGRANDO se clasifica como explícita");
    igual(d.normalizada, "(acot(x^(2)))/(2*sqrt(x))", "el parser recibe SOLO el integrando");
    assert(!/i\s*\*\s*n\s*\*\s*t/.test(d.normalizada), "no aparece i*n*t");
    assert(/inferior=1\/2/.test(d.extra ?? "") && /superior=2/.test(d.extra ?? "") && /variable=x/.test(d.extra ?? ""),
      `límites y variable extraídos: ${d.extra}`);
    // El plano grafica el integrando; sin primitiva elemental → valor numérico.
    igual(t.bloques[0].pasos[0].mathjs[0], "(acot(x^(2)))/(2*sqrt(x))", "grafica el integrando");
    assert(/\\approx 0\.507/.test(t.bloques[0].pasos[1].latex), "valor numérico ≈ 0.5074");
  });

  test("trazar integral: con primitiva elemental muestra la regla de Barrow", () => {
    const t = trazar("\\int_{0}^{2}x^2\\,dx", "integral");
    igual(t.bloques[0].pasos[1].etiqueta, "Primitiva evaluada (Barrow)", "paso de Barrow");
    igual(t.bloques[0].pasos[1].latex, "\\left[\\frac{x^{3}}{3}\\right]_{0}^{2} = \\frac{8}{3}", "[x³/3]₀²=8/3");
  });

  test("trazar integral: entrada que no es integral se avisa (no va al parser)", () => {
    const t = trazar("x^2+1", "integral");
    assert(/no es una integral/.test(t.bloques[0].diagnostico[0].tipo), "diagnóstico claro");
    igual(t.bloques[0].pasos.length, 0, "sin pasos (nada que trazar)");
  });
});

// ════════════════════════════════════════════════
// Parser: potencia de función vs función compuesta (desambiguación `func^n(x)`).
// `\tan^{2}(x)` = pow(tan(x),2); `\tan(x^2)` = tan(pow(x,2)). NUNCA confundirlos.
// Se verifica SEMÁNTICAMENTE (evaluación numérica), no por el toString (cuyos
// paréntesis del exponente son cosméticos: `^{2}`→`^(2)`, `^2`→`^2`).
describe("Parser: potencia de función func^n(x) → pow(func(x), n)", () => {
  const val = (s: string, x: number) => parse(normalizarEntrada(s)).evaluate({ x });
  const X = 0.5;

  test("`func^n(x)` es POTENCIA de la función: (func(x))^n", () => {
    aprox(val(String.raw`\tan^{2}(x)`, X), Math.tan(X) ** 2, 1e-9, "tan²(x) = (tan x)²");
    aprox(val(String.raw`tan^2(x)`, X), Math.tan(X) ** 2, 1e-9, "sin backslash: idéntico");
    aprox(val(String.raw`\sin^{2}(x)`, X), Math.sin(X) ** 2, 1e-9, "sin²(x)");
    aprox(val(String.raw`\sec^{2}(x)`, X), (1 / Math.cos(X)) ** 2, 1e-9, "sec²(x)");
    // Las DOS bases, porque la potencia de la función y la base del logaritmo son
    // decisiones independientes: `\log` sin base es decimal y `\ln` es natural.
    aprox(val(String.raw`\log^{2}(x)`, X), Math.log10(X) ** 2, 1e-9, "log²(x) = (log₁₀ x)²");
    aprox(val(String.raw`\ln^{2}(x)`, X), Math.log(X) ** 2, 1e-9, "ln²(x) = (ln x)²");
    aprox(val(String.raw`\tan^{3}(x)`, X), Math.tan(X) ** 3, 1e-9, "tan³(x)");
  });

  test("`func(x^n)` es función COMPUESTA: func(x^n) — intacto y DISTINTO", () => {
    aprox(val(String.raw`\tan(x^2)`, X), Math.tan(X ** 2), 1e-9, "tan(x²)");
    aprox(val(String.raw`\sin(x^{3})`, X), Math.sin(X ** 3), 1e-9, "sin(x³)");
    aprox(val(String.raw`\sin(x)`, X), Math.sin(X), 1e-9, "sin(x) sin potencia");
    // La distinción es real: los dos patrones dan valores distintos.
    assert(Math.abs(val(String.raw`\tan^{2}(x)`, X) - val(String.raw`\tan(x^2)`, X)) > 0.01,
      "tan²(x) ≠ tan(x²)");
  });

  test("COMBINADO y ANIDADO no se confunden", () => {
    aprox(val(String.raw`\sin^{2}(x^2)`, X), Math.sin(X ** 2) ** 2, 1e-9, "sin²(x²) = (sin(x²))²");
    aprox(val(String.raw`\tan^{2}(\sin(x))`, X), Math.tan(Math.sin(X)) ** 2, 1e-9, "tan²(sin x)");
    aprox(val(String.raw`\sin^{2}(x)+\cos^{2}(x)`, X), 1, 1e-9, "sin²+cos² = 1 (pitágoras)");
  });

  test("no confunde la inversa ^{-1} ni el `tan` dentro de `atan`", () => {
    aprox(val(String.raw`\tan^{-1}(x)`, X), Math.atan(X), 1e-9, "^{-1} = arctan, no potencia −1");
    // `a\tan^{2}(x)` = a·tan²(x): el `\` deja claro que es `tan`, NO parte de `atan`.
    const norm = normalizarEntrada(String.raw`a\tan^{2}(x)`);
    assert(norm.includes("(tan(x))") && !norm.includes("atan"), "a·tan²(x): tan, no atan");
  });
});

describe("Parser: trig SIN backslash con llaves y exponente vacío", () => {
  test("`tan{x}` (sin backslash) → tan(x); no MathJS 'Unexpected operator {'", () => {
    // Notación informal que MathJS no acepta: antes quedaba `tan{x}` crudo → parse fallaba →
    // el panel caía al texto normalizado (`sqrt(...)` en vez de `\sqrt{...}`) y no graficaba.
    igual(normalizarEntrada("tan{x}"), "tan(x)", "tan{x} → tan(x)");
    igual(normalizarEntrada("sin{2x}"), "sin(2x)", "sin{2x} → sin(2x)");
    // La guarda NO debe romper la inversa `\arctan{x}` (ya convertida a atan por su vía).
    assert(!normalizarEntrada(String.raw`\arctan{x}`).includes("{"), "arctan{x}: sin llaves residuales");
  });

  test("exponente VACÍO `x^{}` se colapsa a la base (como lo pinta KaTeX)", () => {
    igual(normalizarEntrada("x^{}"), "x", "x^{} → x");
    igual(normalizarEntrada("e^{x^{}}"), "e^(x)", "e^{x^{}} → e^(x) (no e^(x^()))");
  });

  test("caso reportado: √|y|+tan{x}+1/(e^{x^{}})=π parsea y despeja", () => {
    // Regresión #4: normaliza limpio (√|y| como abs, tan(x), e^x) en vez del texto crudo.
    igual(normalizarEntrada(String.raw`\sqrt{|y|}+tan{x}+1/(e^{x^{}})=\pi`),
      "sqrt(abs(y))+tan(x)+1/(e^(x))=pi", "normalización completa del caso reportado");
  });

  test("exponente fraccionario de una FUNCIÓN: `abs(y)^{1/2}` → `sqrt(abs(y))` (radical exacto)", () => {
    // Una LLAMADA a función real (`abs(y)`, tras convertir `|y|`) es la base ENTERA de la raíz:
    // `|y|^{1/2}` → `sqrt(abs(y))` (`\sqrt{|y|}`), no `abs(y)^(1/2)` (`{|y|}^{1/2}`). La regla NO
    // debe casar el `(y)` suelto dejando `abs` colgando (`abssqrt((y))`): la alternativa de
    // función toma `abs(y)` completo, y un `(…)` pegado a una VARIABLE (`x(x+1)`) sigue sin
    // tomarse por base (producto implícito, no llamada).
    igual(normalizarEntrada("|y|^{1/2}"), "sqrt(abs(y))", "|y|^{1/2} → sqrt(abs(y)) (radical, sin abs colgando)");
    igual(normalizarEntrada("abs(x)^{1/2}"), "sqrt(abs(x))", "abs(x)^{1/2} → sqrt(abs(x))");
    igual(normalizarEntrada("sin(x)^{1/2}"), "sqrt(sin(x))", "sin(x)^{1/2} → sqrt(sin(x))");
    // Un `(…)` pegado a una VARIABLE es producto implícito `x·(x+1)^{1/2}`, no una base: intacto.
    igual(normalizarEntrada("x(x+1)^{1/2}"), "x(x+1)^(1/2)", "x(x+1)^{1/2} → producto implícito, no raíz");
    // Un `(…)` SIN nada delante sí es la base de la raíz (comportamiento intacto).
    igual(normalizarEntrada("(x+1)^{1/2}"), "sqrt((x+1))", "(x+1)^{1/2} → sqrt((x+1))");
  });

  test("el argumento en llaves de una trigonométrica puede llevar llaves DENTRO", () => {
    // La regla usaba `\{([^{}]+)\}`, que por construcción no puede casar un grupo anidado: se
    // aplicaba de fuera hacia dentro y una sola vez, así que en `\cos{\tan{x}}` convertía el
    // `\tan` interior y dejaba el `\cos{` roto; el barrido de barras residuales le quitaba
    // después la suya y quedaba `cos{...}`, que MathJS rechaza. El bloque no dibujaba nada.
    igual(normalizarEntrada(String.raw`\sin{\sqrt{x}}`), "sin(sqrt(x))", "raíz dentro del seno");
    igual(normalizarEntrada(String.raw`\cos{\sin{x}}`), "cos(sin(x))", "una trig dentro de otra");
    igual(normalizarEntrada(String.raw`\cos{\tan{\sin{\csc{x^{3}}}}}`), "cos(tan(sin(csc(x^(3)))))",
      "cuatro niveles");
    // Y NO se arregla repitiendo la pasada plana: `convertirRaices` corre DESPUÉS de esta
    // regla, así que al llegar aquí la raíz todavía tiene sus llaves puestas.
    // (`logNat` viaja con nombre propio hasta el final, donde se resuelve a `log(·, e)`.)
    igual(normalizarEntrada(String.raw`\sin{\ln{x^{\sqrt{2}}}}`), "sin(log(x^(sqrt(2)), e))",
      "logaritmo y raíz dentro del seno");
  });

  test("la guarda por la izquierda no le roba el argumento a una inversa ni a una hiperbólica", () => {
    // Sin barra que delimite el nombre, el `sin` de `asin{` casaría y la inversa se quedaría
    // sin argumento. Y `sinh{` no es `sin{`: entre el nombre y la llave está la `h`.
    igual(normalizarEntrada(String.raw`\arcsin{\sqrt{x}}`), "asin(sqrt(x))", "inversa con raíz");
    igual(normalizarEntrada("asin{x}"), "asin(x)", "inversa ya convertida");
    igual(normalizarEntrada(String.raw`\sinh{x}`), "sinh(x)", "hiperbólica, que antes no casaba");
    igual(normalizarEntrada(String.raw`\tanh{\sqrt{x}}`), "tanh(sqrt(x))", "hiperbólica con raíz");
  });

  test("las hiperbólicas NO pasan su argumento a grados", () => {
    // `FUNCIONES_TRIG` (la lista de la conversión a radianes) y la lista de esta regla son
    // distintas a propósito: el argumento de un seno hiperbólico no es un ángulo.
    igual(normalizarEntrada(String.raw`\sin{30}`), "sin(30*pi/180)", "el seno sí");
    igual(normalizarEntrada(String.raw`\sinh{30}`), "sinh(30)", "el seno hiperbólico no");
  });

  test("una llave sin cerrar se deja intacta en vez de destrozar la cadena", () => {
    // Media conversión es peor que ninguna: el resto del parser hace lo mismo ante un grupo
    // sin cerrar, y así el bloque puede decir que no lo entiende en vez de graficar basura.
    igual(normalizarEntrada(String.raw`\sin{x`), "sin{x", "sin cierre, sin tocar");
  });
});

describe("Símbolos de entrada: ± y comandos LaTeX", () => {
  const norm = (s: string) => insertarProductoImplicito(normalizarEntrada(s));
  const vpSim = crearViewport([-10, 10], [-7, 7], 600, 420, 1);
  const TOL_SIM: Tolerancia = { desviacionMaxPx: 0.5, pasoMaxPx: 2, pasada: "final" };
  const ramasDe = (source: string): number =>
    construirObjetosEscena(source).reduce(
      (n, o) => n + o.proveedor.geometria(vpSim, TOL_SIM).ramas.length, 0);

  test("símbolos con equivalente directo (antes: sopa de letras → plano vacío)", () => {
    igual(norm("2\\times x"), "2* x", "\\times → *");
    igual(norm("x\\div 2"), "x/ 2", "\\div → /");
    igual(norm("2\\ast x"), "2* x", "\\ast → *");
    igual(norm("x/\\infty"), "x/Infinity", "\\infty → Infinity");
    igual(norm("x−1"), "x-1", "menos tipográfico U+2212 (copiar/pegar de Word) → -");
    igual(norm("\\lvert x\\rvert"), "abs( x)", "\\lvert…\\rvert → abs");
    igual(norm("\\operatorname{sech}(x)"), "sech(x)", "\\operatorname desenvuelve el nombre");
    igual(norm("\\mathrm{e}^x"), "e^x", "\\mathrm desenvuelve su contenido");
    igual(norm("x\\text{ (una recta)}"), "x", "\\text{…} es prosa: se borra entera");
    igual(norm("x\\,+\\,1"), "x + 1", "espaciados (\\, \\; \\!) no son matemática");
    igual(norm("\\displaystyle y=x^2"), "y=x^2", "directiva de composición: se borra (sin dejar espacio)");
  });

  test("función con argumento SIN agrupar (\\ln x, \\cos x, \\log_2 x)", () => {
    // El natural se normaliza con la base ESCRITA (`log(x, e)`): es la forma que sobrevive a
    // volver a pasar por el parser, donde un `log` sin base es el decimal del usuario.
    igual(norm("\\ln x"), "log(x, e)", "\\ln x (antes: log*x → NaN)");
    igual(norm("\\cos x"), "cos(x)", "\\cos x");
    igual(norm("\\arctan x"), "atan(x)", "\\arctan x");
    igual(norm("\\log_2 x"), "log(x,2)", "\\log_2 x");
    igual(norm("\\sin(x)"), "sin(x)", "la forma con paréntesis no cambia");
  });

  test("argumento sin agrupar CON coeficiente (\\cos 5t, \\sin 3\\theta) y θ Unicode", () => {
    // El número es el COEFICIENTE del argumento, no el argumento entero: antes la regla
    // capturaba solo el número, lo pasaba a GRADOS y dejaba la letra fuera
    // (`\cos 5t` → `cos(5·π/180)·t`) — y `x(t)=5\cos t-\cos 5t` (el ejemplo canónico de
    // las paramétricas por componentes) graficaba otra curva.
    igual(norm("\\cos 5t"), "cos(5*t)", "\\cos 5t es cos(5t), no cos(5°)·t");
    igual(norm("\\cos 2x"), "cos(2*x)", "\\cos 2x");
    igual(norm("\\sin 3\\theta"), "sin(3*theta)", "\\sin 3\\theta (comando griego tras el número)");
    igual(norm("\\sin 2\\pi x"), "sin(2*pi *x)", "corrida número·π·letra entera bajo la función");
    igual(norm("\\sin 3.5\\theta"), "sin(3.5*theta)", "coeficiente decimal");
    // El número PURO sigue siendo grados (comportamiento histórico intacto).
    igual(norm("\\cos 2"), "cos(2*pi/180)", "\\cos 2 sin símbolo detrás sigue en grados");
    // θ Unicode → theta: la polar compila contra `theta`; una θ libre era NaN en todo θ.
    igual(norm("r=sin(3θ)"), "r=sin(3*theta)", "θ Unicode se traduce como π");
  });

  test("grados: 30° y \\degree son 30·π/180", () => {
    aprox(compilarFuncion(norm("\\sin(90°)"), "x")(0) as number, 1, 1e-12, "sin(90°)=1");
    aprox(compilarFuncion(norm("\\sin(90\\degree)"), "x")(0) as number, 1, 1e-12, "sin(90\\degree)=1");
  });

  test("grados: el argumento trig NUMÉRICO puro es grados (\\sin{5}), también como fracción", () => {
    // Convención del plugin: número puro en una trig directa = grados. En TODAS las
    // formas de entrada (llaves, paréntesis, suelto) y también la FRACCIÓN de literales
    // (\frac{45}{2} = 22.5°): expresa el mismo número que su decimal, que ya convertía.
    igual(norm("\\sin{5}"), "sin(5*pi/180)", "\\sin{5} con llaves");
    igual(norm("\\sin(5)"), "sin(5*pi/180)", "\\sin(5) con paréntesis");
    igual(norm("\\sin 5"), "sin(5*pi/180)", "\\sin 5 suelto");
    igual(norm("\\sin(-30)"), "sin(-30*pi/180)", "negativo");
    igual(norm("\\sin(\\frac{45}{2})"), "sin((45)/(2)*pi/180)", "fracción de literales = 22.5°");
    aprox(compilarFuncion(norm("\\sin(\\frac{45}{2})"), "x")(0) as number,
      Math.sin(Math.PI / 8), 1e-12, "45/2 grados = π/8 rad");
    // Lo que NO es número puro NO se toca: símbolos, variable, inversas (su arg es un cociente).
    igual(norm("\\sin(\\frac{\\pi}{2})"), "sin((pi)/(2))", "π/2 son radianes, no grados");
    igual(norm("\\sin(\\frac{x}{2})"), "sin((x)/(2))", "x/2 es variable");
    igual(norm("\\arcsin(0.5)"), "asin(0.5)", "la inversa no convierte (cociente, no ángulo)");
    // El simplificado no pinta el coeficiente -1 pegado a π (`\frac{-1\pi}{6}`):
    // coeficientesAlFrente colapsa el factor de magnitud 1 al signo → `\frac{-\pi}{6}`.
    igual(bloqueALatex(simplificarEcuaciones(["y=\\sin(-30)"])),
      "y=\\sin\\left(\\frac{-\\pi}{6}\\right)", "-30° simplifica a -π/6, sin el -1");
  });

  test("± / ∓ → centinela pm/mp: se normaliza, se evalúa y se pinta como ±", () => {
    igual(norm("y=\\pm\\sqrt{4-x^2}"), "y=pm(sqrt(4-x^2))", "el operando del ± es el término entero");
    igual(norm("y=±x"), "y=pm(x)", "el Unicode ± vale igual que \\pm");
    igual(norm("y=1\\pm x"), "y=1+pm(x)", "tras un término, el ± es una SUMA del centinela");
    igual(norm("y=\\mp x"), "y=mp(x)", "∓ tiene su propio centinela (signos correlacionados)");
    igual(exprALatex("y=\\pm\\sqrt{4-x^2}"), "y=\\pm \\sqrt{4-x^{2}}", "el panel lo repinta como ±");
    const mpSuma = exprALatex("y=1\\mp x"); // `1 + mp(x)` NO debe salir como `1 + \mp x`
    assert(mpSuma.includes("\\mp") && !mpSuma.includes("+"), `a ∓ b sin el + intermedio: ${mpSuma}`);
    // Evaluable (rama principal): sin esto el bloque salía como "Indeterminada".
    aprox(compilarFuncion(norm("pm(x)+mp(1)"), "x")(3) as number, 2, 1e-12, "pm/mp evalúan +u/−u");
  });

  test("± en obs-graph/obs-system: DOS ramas reales, no media curva", () => {
    igual(ramasDe("y=\\pm\\sqrt{4-x^2}"), 2, "y=±√(4−x²) es la circunferencia entera (2 ramas)");
    igual(ramasDe("y=\\pm x"), 2, "y=±x son las dos rectas");
    igual(ramasDe("y=x"), 1, "sin ±, una sola rama (nada cambia)");
    igual(ramasDe("y=\\pm x\ny=1"), 3, "sistema: las 2 ramas del ± + la recta");
    // Las dos ramas son UN objeto (un color, una curva del selector): un solo ObjetoEscena.
    igual(construirObjetosEscena("y=\\pm\\sqrt{4-x^2}").length, 1, "± = UN objeto de escena");
  });

  test("± en obs-derivate: d/dx(±u) = ±u′ (antes: 'no derivable' o derivada falsa)", () => {
    igual(derivadaLatex(["y=\\pm x^2"]), "f'\\left(x\\right) = \\pm 2x", "d/dx(±x²) = ±2x");
    igual(derivadaLatex(["y=\\mp x^3"]), "f'\\left(x\\right) = \\mp 3x^{2}", "d/dx(∓x³) = ∓3x²");
    igual(derivarExpr("\\pm\\sqrt{x}"), "pm(1 / (2 * sqrt(x)))", "el ± sobrevive a la regla de la cadena");
    igual(derivarExpr("1\\pm x^2"), "pm(2 * x)", "la constante desaparece y el ± queda");
  });

  test("± en obs-integral: ∫(±f) = ±∫f", () => {
    const { cuerpo } = cuerpoAreaLatexExacto("\\int_{0}^{2}\\pm x\\,dx");
    igual(cuerpo, "\\pm 2", "el área hereda el doble signo (no un solo valor de la pareja)");
    igual(cuerpoAreaLatexExacto("\\int_{0}^{2}x\\,dx").cuerpo, "2", "sin ±, el valor no lo lleva");
    // Límite con menos tipográfico y con grados: antes daban "Límites no numéricos".
    igual(cuerpoAreaLatexExacto("\\int_{−1}^{1}x^2\\,dx").cuerpo, "\\frac{2}{3}", "límite con U+2212");
    igual(cuerpoAreaLatexExacto("\\int_{0}^{90°}\\sin x\\,dx").cuerpo, "1", "límite en grados");
  });

  test("comando no soportado: se DICE (etiqueta), no se grafica como basura", () => {
    igual(comandosNoSoportados("y=\\alpha x").join(","), "\\alpha", "\\alpha no es traducible");
    igual(comandosNoSoportados("y\\ge x").join(","), "\\ge", "las desigualdades no se grafican");
    igual(comandosNoSoportados("y=\\sum_{k=1}^{3}kx").join(","), "\\sum", "\\sum");
    igual(comandosNoSoportados("y=\\pm\\sqrt{4-x^2}").length, 0, "lo soportado no se marca");
    igual(comandosNoSoportados("y=\\operatorname{sech}(x)").length, 0, "\\operatorname sí se entiende");
    igual(comandosNoSoportados("\\int_{0}^{\\pi}\\sin(x)\\,dx").length, 0, "la integral entera se entiende");
    // El `\\` de `cases` es un SALTO DE LÍNEA: leerlo como comando `\y` velaría todo obs-system.
    igual(comandosNoSoportados("\\begin{cases}y=x\\\\y=2\\end{cases}").length, 0, "el \\\\ de cases no es un comando");
    // Las CUATRO constantes con nombre que el parser traduce tienen que estar en la lista: si
    // una falta, el bloque se vela como no soportado mientras el mismo símbolo escrito en
    // Unicode dibuja sin problema. Le pasaba a `\phi` (φ = razón áurea).
    for (const c of ["\\pi", "\\tau", "\\theta", "\\phi"])
      igual(comandosNoSoportados(`y=${c} x`).length, 0, `${c} es traducible y no se marca`);
    // Y una que NO se traduce sigue avisando, que es la mitad útil de la lista blanca.
    igual(comandosNoSoportados("y=\\varphi x").join(","), "\\varphi", "\\varphi no se traduce: se dice");
  });

  test("un símbolo UNICODE no traducible se dice igual que su gemelo con barra", () => {
    // El punto ciego que tenía este barrido: solo miraba comandos con `\`, así que `\nabla` se
    // vetaba y `∇` se colaba. Y colarse era peor que velarse: la expresión seguía por el pipeline
    // de lo evaluable y salía deformada —`∇f(x,y)` se tipografiaba `∇f * (x,y)`, con un producto
    // que nadie escribió—.
    igual(comandosNoSoportados("\\nabla f(x,y)").join(","), "\\nabla", "con barra:");
    igual(comandosNoSoportados("∇f(x,y)").join(","), "∇", "con el teclado, lo mismo:");
    igual(comandosNoSoportados("x ∈ R").join(","), "∈", "pertenencia");
    igual(comandosNoSoportados("1…5").join(","), "…", "puntos suspensivos");
  });

  test("los símbolos unicode que SÍ se traducen no se vetan", () => {
    // La lista se midió en contexto, no se supuso: estos cuatro tienen traducción real
    // (`2·3` → `2*3`, `30°` → grados) y vetarlos rompería expresiones que hoy funcionan.
    for (const e of ["2·3", "2×3", "6÷3", "\\sin(30°)", "√x", "±x", "x+∞"])
      igual(comandosNoSoportados(e).length, 0, `${e} es traducible:`);
  });

  test("la flecha de obs-vector está exenta en sus DOS formas", () => {
    // `->` ya lo estaba; `→` es la misma idea escrita de otra manera, y eximir solo a una dejaría
    // que la otra velara el bloque.
    igual(comandosNoSoportados("A->B").length, 0, "flecha ASCII:");
    igual(comandosNoSoportados("A→B").length, 0, "flecha unicode:");
    // Pero `<-` NO es sintaxis de nada: `y<-x` es `y < -x`, una región, y se sigue velando.
    igual(comandosNoSoportados("y<-x").join(","), "<", "y<-x sigue siendo una región:");
  });
});

// ─────────────────────────────────────────────
// Formas degeneradas: ninguna transformación puede FABRICAR un valor
// ─────────────────────────────────────────────
//
// `simplify`/`derivative` de mathjs son álgebra FORMAL: reducen `0/0` a `0` como si fuera un
// número. El panel de los cuatro bloques se alimenta de ahí, así que `f(x)=0/0` se mostraba
// como `f(x)=0` (sobre un plano velado con "Indeterminada": el panel contradecía al plano),
// `\frac{d}{dx}(0/0)` daba "f'(x) = 0" y graficaba la recta y=0, y `∫₀¹ 0/0 dx` se pintaba
// como `∫₀¹ 0 dx`. La regla: lo que no toma ningún valor real NO se transforma, se ETIQUETA.

describe("Formas degeneradas: nada las convierte en un número", () => {
  test("Simplificar conserva la forma escrita si la reducción cambia el DOMINIO", () => {
    igual(simplificarEcuaciones(["\\frac{0}{0}"])[0], "(0)/(0)", "0/0 NO se reduce a 0");
    igual(simplificarEcuaciones(["\\frac{0}{0}", "y=x"])[1], "y = x", "lo sano se sigue simplificando");
    igual(simplificarEcuaciones(["x^2+2x+1"])[0], "x ^ 2 + 2 * x + 1", "lo equivalente pasa el guardián");
    // El guardián muestrea las VARIABLES libres: el nombre de una función (`log`, `sqrt`) NO lo es
    // —si entra en el scope lo sombrea con un número y toda la expresión da NaN—.
    igual(simplificarEcuaciones(["\\ln(e^{3x})"])[0], "3 * x", "log(e^{3x}) → 3x (log no es una variable)");
  });

  test("obs-derivate: una función sin valores reales no tiene derivada", () => {
    igual(derivarExpr("\\frac{0}{0}"), null, "d/dx(0/0) no es 0: no hay nada que derivar");
    igual(derivadaLatex(["\\frac{0}{0}"]), "f'\\left(x\\right) = \\text{[...]}", "el panel no inventa la derivada");
    assert(derivarExpr("x^2") !== null, "lo derivable sigue derivándose");
  });

  test("obs-integral: el integrando debe ser una FUNCIÓN, y su fallo va al velo", () => {
    // Una ecuación (curva implícita) no se integra: se rechaza en la extracción, ANTES del parser.
    igual(extraerIntegral("\\int_{0}^{1}(x^2+y^2-1)^3=x^2y^3"), null, "integrando con `=` → no es integral");
    igual(extraerIntegral("\\int_{0}^{1}x+y\\,dx"), null, "integrando con `y` libre → tampoco");
    assert(extraerIntegral("\\int_{0}^{1}x^2\\,dx") !== null, "el integrando función sí se acepta");
    // TODA etiqueta va al PLANO (`etiquetaIntegral`), y el panel se queda SIN valor (null) y sin
    // etiqueta: solo la fórmula. Nivel 1 (no hay curva) y Nivel 2 (no hay número) salen por la
    // misma puerta, con el nombre correcto de cada uno.
    igual(etiquetaIntegral("\\int_{0}^{1}\\frac{0}{0}\\,dx")?.etiqueta, "Indeterminada",
      "0/0: no es 'Fuera de dominio' (eso habla del número); no hay curva");
    igual(cuerpoAreaLatexExacto("\\int_{0}^{1}\\frac{0}{0}\\,dx").cuerpo, null, "y el panel no la repite");
    igual(etiquetaIntegral("\\int_{-1}^{1}\\sqrt{x}\\,dx")?.etiqueta, "Fuera de dominio",
      "√x en [−1,1]: la curva existe, el área no");
    igual(cuerpoAreaLatexExacto("\\int_{-1}^{1}\\sqrt{x}\\,dx").cuerpo, null, "el panel se queda con la fórmula");
    igual(etiquetaIntegral("\\int_{-\\infty}^{\\infty}x^2\\,dx")?.etiqueta, "Límites no numéricos",
      "límites infinitos: la impropia no se evalúa, y se dice en el plano");
    igual(etiquetaIntegral("\\int_{0}^{2}x^2\\,dx"), null, "una integral con valor no tiene etiqueta");
  });
});

describe("LaTeX · el signo de un término simbólico se pinta como un signo", () => {
  /** El bloque despejado, tal como lo ve el panel «Despejar y». */
  const despejado = (ec: string): string => bloqueALatex(despejarEcuaciones([ec]));

  test("π y e SOBREVIVEN al despeje: no se evalúan a decimales", () => {
    // Es la propiedad de fondo: el despejador manipula el árbol, no lo evalúa. Una constante
    // con nombre llega al otro lado siendo la misma constante.
    igual(despejado("\\pi x + 6y = 12"), "y=\\frac{-\\pi{x}}{6}+2");
    igual(despejado("2y = \\pi"), "y=\\frac{\\pi}{2}");
    igual(despejado("\\pi y = 3x"), "y=\\frac{3x}{\\pi}");
    igual(despejado("y = e^x"), "y=e^{x}");
    for (const ec of ["\\pi x + 6y = 12", "2y = \\pi", "y = e^x"])
      assert(!/3\.14|2\.71/.test(despejado(ec)), `${ec}: se ha colado un decimal`);
  });

  test("un término negativo se RESTA, no se suma en negativo", () => {
    // `y + e = x` despeja a `y = -e + x`; al ordenar en grado descendente, el término negativo
    // quedaba detrás de un `+` y salía `x+-e`. El signo estaba escondido dentro del nodo.
    igual(despejado("y + e = x"), "y=x- e");
    igual(despejado("y + \\pi = x"), "y=x-\\pi");
    igual(despejado("y + z = x"), "y=x- z");
    // Con el signo pegado al primer factor del producto (`-2·e`), que es como sale del cambio
    // de lado, tampoco debe aparecer el `+-`.
    igual(despejado("y + 2e = x"), "y=x-2e");
    for (const ec of ["y + e = x", "y + \\pi = x", "y + z = x", "y + 2e = x"])
      assert(!despejado(ec).includes("+-"), `${ec}: quedó un «+-»`);
  });

  test("el menos de un producto no arrastra paréntesis", () => {
    igual(despejado("\\pi x + 6y = 12"), "y=\\frac{-\\pi{x}}{6}+2");
    igual(despejado("3 \\pi x + 6y = 12"), "y=\\frac{-\\pi{x}}{2}+2");
    igual(despejado("\\pi x + y = 12"), "y=-\\pi{x}+12");
  });

  test("donde el paréntesis SÍ significa algo, se queda", () => {
    // Estas tres cambiarían de valor sin él, así que la limpieza no debe tocarlas.
    igual(exprALatex("-(a + b)"), "-\\left( a+b\\right)");
    igual(exprALatex("-(a - b)"), "-\\left( a-b\\right)");
    igual(exprALatex("-(x^2)"), "-x^{2}", "una potencia no se convierte en (-x)^2");
  });

  test("NO REGRESIÓN: el menos de una FRACCIÓN sigue yendo fuera", () => {
    // Convención del panel: `d/dx 1/x` se lee `−1/x²`, no `(−1)/x²`. El arreglo del producto
    // no debe arrastrar al cociente —lo hizo una vez, y estas dos pruebas lo detectaron—.
    igual(exprALatex("-(1/x^2)"), "-\\frac{1}{x^{2}}");
    igual(exprALatex("-(2/x^3)"), "-\\frac{2}{x^{3}}");
  });
});
