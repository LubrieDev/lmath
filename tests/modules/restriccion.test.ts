// ─────────────────────────────────────────────
// tests · Restricción de dominio: `expr {a ≤ x ≤ b}`
// ─────────────────────────────────────────────
//
// Lógica PURA. Lo que se fija aquí es sobre todo la FRONTERA de la sintaxis, porque es donde
// una restricción puede hacer daño: las llaves son el carácter más común de una fórmula LaTeX,
// así que lo importante no es tanto que `{0 ≤ x ≤ 2π}` se lea bien como que `\frac{1}{2}` y
// `x^{2}` sigan sin leerse como nada.
//
// La otra mitad es la salida segura: ante una forma que no se entiende, la expresión tiene que
// volver INTACTA. Si este módulo «arreglara» lo que no entiende, el `\leq` desaparecería de la
// cadena y el bloque dibujaría algo sin decir que ha ignorado lo que el autor escribió.

import { describe, test, igual, assert } from "../runner";
import {
  separarRestriccion, sinRestricciones, dentro, transformarSinRestriccion, lineasDeEcuacion,
} from "../../src/core/parsing/restriccionDominio";
import { dividirEcuaciones } from "../../src/core/parsing/dividirEcuaciones";
import { comandosNoSoportados } from "../../src/parser";
import { construirObjeto } from "../../src/core/parsing/construirObjeto";
import { bloqueALatex } from "../../src/latex";

/** El intervalo de una expresión, en texto compacto, o `null`. */
const rango = (ec: string): string | null => {
  const r = separarRestriccion(ec).restriccion;
  return r === null ? null : `${r.variable}:${r.min}..${r.max}`;
};

/** Lo que queda de la expresión una vez separada la restricción. */
const resto = (ec: string): string => separarRestriccion(ec).expr;

describe("restricción · las formas que se escriben a mano", () => {
  test("intervalo por los dos lados, en las tres notaciones del comparador", () => {
    igual(rango("sin(x) {0 \\leq x \\leq 6}"), "x:0..6", "\\leq:");
    igual(rango("sin(x) {0 \\le x \\le 6}"), "x:0..6", "\\le:");
    igual(rango("sin(x) {0 <= x <= 6}"), "x:0..6", "<=:");
    igual(rango("sin(x) {0 ≤ x ≤ 6}"), "x:0..6", "unicode:");
  });

  test("estricto y no estricto dan el MISMO intervalo", () => {
    // Decisión declarada en la cabecera del módulo: la diferencia es un punto, que no ocupa un
    // píxel. Si algún día se dibujara el extremo abierto, esta prueba es la que hay que romper.
    igual(rango("sin(x) {0 < x < 6}"), "x:0..6", "<:");
    igual(rango("sin(x) {0 > x > -6}"), "x:-6..0", ">:");
  });

  test("acotada por un solo lado, con la variable a cualquier lado del comparador", () => {
    igual(rango("sqrt(x) {x \\geq 4}"), "x:4..Infinity", "x ≥ a:");
    igual(rango("sqrt(x) {4 \\leq x}"), "x:4..Infinity", "a ≤ x:");
    igual(rango("sin(x) {x \\leq 2}"), "x:-Infinity..2", "x ≤ b:");
    igual(rango("sin(x) {2 \\geq x}"), "x:-Infinity..2", "b ≥ x:");
  });

  test("el intervalo al revés (a ≥ x ≥ b) se ordena solo", () => {
    igual(rango("sin(x) {6 \\geq x \\geq 0}"), "x:0..6");
  });

  test("los extremos aceptan lo mismo que cualquier otra expresión del plugin", () => {
    const dosPi = separarRestriccion("sin(x) {0 \\leq x \\leq 2\\pi}").restriccion;
    assert(Math.abs((dosPi?.max ?? 0) - 2 * Math.PI) < 1e-12, "2π:");
    const fraccion = separarRestriccion("sin(x) {\\frac{\\pi}{2} \\leq x \\leq \\pi}").restriccion;
    assert(Math.abs((fraccion?.min ?? 0) - Math.PI / 2) < 1e-12, "π/2:");
    igual(rango("sin(x) {-3 \\leq x \\leq 3}"), "x:-3..3", "negativo:");
  });

  test("la variable puede ser la de cualquier bloque, y θ llega normalizada", () => {
    igual(rango("(cos(t), sin(t)) {0 \\leq t \\leq 3}"), "t:0..3", "paramétrica:");
    igual(rango("r = cos(θ) {0 \\leq θ \\leq 3}"), "theta:0..3", "θ unicode:");
    igual(rango("r = cos(\\theta) {0 \\leq \\theta \\leq 3}"), "theta:0..3", "\\theta:");
  });

  test("la expresión sale sin el grupo, y sin espacio de más", () => {
    igual(resto("sin(x) {0 \\leq x \\leq 6}"), "sin(x)");
    igual(resto("y = \\frac{1}{2}x {x \\geq 0}"), "y = \\frac{1}{2}x");
  });
});

describe("restricción · lo que NO es una restricción", () => {
  test("un grupo LaTeX sin comparador se queda donde está", () => {
    // Es la regla que sostiene toda la sintaxis: lo que distingue una restricción de una
    // agrupación no es la posición, es el comparador de dentro.
    igual(rango("\\sqrt{x}"), null, "raíz:");
    igual(rango("x^{2}"), null, "exponente:");
    igual(rango("\\frac{1}{2}"), null, "fracción:");
    igual(resto("\\sqrt{x+1}"), "\\sqrt{x+1}", "intacta:");
  });

  test("el grupo se busca al final: una fórmula con llaves ANTES no se toca", () => {
    igual(rango("\\frac{1}{2}x^{2} {0 \\leq x \\leq 4}"), "x:0..4", "lo lee:");
    igual(resto("\\frac{1}{2}x^{2} {0 \\leq x \\leq 4}"), "\\frac{1}{2}x^{2}", "y deja el resto:");
  });

  test("`\\left(` NO es un comparador, aunque empiece por `\\le`", () => {
    // Sin la guarda `(?![a-zA-Z])`, `\le` casaría dentro de `\left` y cualquier fórmula con
    // paréntesis LaTeX dentro de unas llaves se leería como un intervalo.
    igual(rango("\\sqrt{\\left(x\\right)}"), null);
  });

  test("dos variables no son un intervalo: eso es una región, y no se dibujan", () => {
    igual(rango("x {x \\leq y}"), null, "x ≤ y:");
    igual(resto("x {x \\leq y}"), "x {x \\leq y}", "vuelve intacta, para que el bloque se vele:");
  });

  test("una forma que no se entiende vuelve intacta en vez de arreglarse a medias", () => {
    igual(rango("sin(x) {0 \\leq x \\geq 6}"), null, "comparadores opuestos:");
    igual(rango("sin(x) {x \\leq }"), null, "cota vacía:");
    igual(rango("sin(x) {x \\leq k}"), null, "cota que no es un número:");
    igual(rango("sin(x) {0 \\leq 1 \\leq 6}"), null, "sin variable en medio:");
    igual(resto("sin(x) {0 \\leq x \\geq 6}"), "sin(x) {0 \\leq x \\geq 6}", "intacta:");
  });
});

describe("restricción · los extremos que se escriben de verdad", () => {
  // Tres formas que un autor teclea sin pensarlo y que el módulo rechazaba. Las tres se midieron
  // sobre el código antes de tocarlo, y las tres acababan igual de mal: el bloque en blanco.

  test("`\\infty` acota por un lado sin acotar por el otro", () => {
    // `evaluarConstante` rechaza lo no finito a propósito (un ángulo infinito es un error), así
    // que el infinito se lee AQUÍ. Sin esto, `{-\infty ≤ x ≤ \pi}` se descartaba entero y la
    // curva desaparecía sin una palabra.
    igual(rango("sin(x) {-\\infty \\leq x \\leq 6}"), "x:-Infinity..6", "-\\infty:");
    igual(rango("sin(x) {0 \\leq x \\leq \\infty}"), "x:0..Infinity", "\\infty:");
    igual(rango("sin(x) {-∞ ≤ x ≤ 6}"), "x:-Infinity..6", "∞ unicode:");
    igual(rango("sin(x) {x \\leq \\infty}"), "x:-Infinity..Infinity", "de un solo lado:");
  });

  test("una constante con nombre vale de cota también con un solo comparador", () => {
    // `\pi`, `pi` y `e` tienen forma de nombre y valor de número. Preguntando primero por la
    // variable salían DOS variables, y la regla de «una y solo una» tiraba el intervalo:
    // encadenado funcionaba y de un lado no, que es la clase de incoherencia que nadie reporta
    // porque uno asume que lo escribió mal.
    const piso = separarRestriccion("sin(x) {x \\geq \\pi}").restriccion;
    assert(Math.abs((piso?.min ?? 0) - Math.PI) < 1e-12, "x ≥ \\pi:");
    const techo = separarRestriccion("sin(x) {x \\leq pi}").restriccion;
    assert(Math.abs((techo?.max ?? 0) - Math.PI) < 1e-12, "sin barra:");
    const numero = separarRestriccion("ln(x) {x \\geq e}").restriccion;
    assert(Math.abs((numero?.min ?? 0) - Math.E) < 1e-12, "e:");
    igual(rango("sin(x) {x \\leq k}"), null, "y una incógnita de verdad sigue sin valer:");
  });

  test("lo que no se deja leer se MARCA, para que el bloque no calle", () => {
    // La salida segura era «devolver intacto y que el veto de comandos lo vele», y no alcanza:
    // con el comparador en Unicode o sin comparador ninguno no queda `\comando` que vetar.
    const ilegible = (ec: string) => separarRestriccion(ec).ilegible;
    igual(ilegible("sin(x) {0 ≤ x ≤ chorizo}"), "{0 ≤ x ≤ chorizo}", "cota que no existe:");
    igual(ilegible("sin(x) {}"), "{}", "llaves vacías:");
    igual(ilegible("sin(x) {0 \\leq x \\geq 6}"), "{0 \\leq x \\geq 6}", "comparadores opuestos:");
    igual(ilegible("x {x \\leq y}"), "{x \\leq y}", "una región:");
  });

  test("un intervalo al revés se LEE, y queda vacío: lo detecta quien lo vela", () => {
    // No es ilegible —la sintaxis está bien— así que el módulo lo entrega tal cual y es el host
    // quien mira `min > max`. Aquí se fija que esa comprobación tiene con qué hacerse: el
    // intervalo sale invertido en vez de ordenarse solo, que sería inventarse la intención.
    const r = separarRestriccion("sin(x) {5 \\leq x \\leq 2}").restriccion;
    assert(r !== null && r.min > r.max, "5..2 queda invertido, no ordenado");
    igual(separarRestriccion("sin(x) {5 \\leq x \\leq 2}").ilegible, null, "y no es ilegible:");
    // Al revés con `≥` sí se ordena solo, porque ahí el orden escrito es el natural.
    igual(rango("sin(x) {6 \\geq x \\geq 0}"), "x:0..6", "con ≥ no hay nada que avisar:");
    // Un solo punto NO es vacío: contiene algo.
    igual(rango("sin(x) {2 \\leq x \\leq 2}"), "x:2..2", "un punto:");
  });

  test("y la notación de siempre NO se marca, que es lo que sostiene la sintaxis", () => {
    const ilegible = (ec: string) => separarRestriccion(ec).ilegible;
    igual(ilegible("sin(x) {0 \\leq x \\leq 6}"), null, "una restricción buena:");
    igual(ilegible("\\sqrt{x}"), null, "raíz:");
    igual(ilegible("\\frac{1}{2}"), null, "fracción:");
    // Pegado a lo anterior las llaves son de LaTeX: un exponente vacío está mal escrito, pero no
    // es una restricción a medio hacer y decir que lo es sería mandar a mirar donde no es.
    igual(ilegible("x^{}"), null, "exponente vacío:");
  });

  test("el comparador suelto se veta lo mismo tecleado que en LaTeX", () => {
    // `y \le x` se velaba y `y ≤ x` salía en blanco: la misma frase con dos comportamientos
    // según el teclado, y el silencioso era el peor de los dos.
    const veto = (s: string) => comandosNoSoportados(s).join(" ");
    igual(veto("y \\le x"), "\\le", "en LaTeX:");
    igual(veto("y ≤ x"), "≤", "en Unicode:");
    igual(veto("y < x"), "<", "en ASCII:");
    igual(veto(sinRestricciones("sin(x) {0 ≤ x ≤ 6}")), "", "y el intervalo pasa:");
    // La flecha de obs-vector no compara nada: su `>` es la punta. Y la exención es SOLO de `->`:
    // `<-` no es sintaxis de ningún bloque, así que `y<-x` es `y < -x` y se veta como tal.
    igual(veto("A->B"), "", "A->B:");
    igual(veto("y<-x"), "<", "y<-x sí es una comparación:");
  });
});

describe("restricción · el resto del bloque", () => {
  test("`sinRestricciones` limpia línea a línea (un sistema tiene una por ecuación)", () => {
    igual(
      sinRestricciones("y = x {0 \\leq x \\leq 2}\ny = x^2 {x \\geq 1}"),
      "y = x\ny = x^2"
    );
    igual(sinRestricciones("y = \\sqrt{x}"), "y = \\sqrt{x}", "sin restricciones, intacto:");
  });

  test("un sistema escrito como `\\begin{cases}` se reparte igual que uno por líneas", () => {
    // El `\\` de LaTeX es el otro separador de ecuaciones, y `dividirEcuaciones` lo entiende.
    // Partiendo solo por saltos de línea, un cases llegaba entero en una línea: la restricción de
    // su primera ecuación no se separaba y el bloque se velaba por su propio `\leq`.
    const cases = "\\begin{cases}y=x {0 \\leq x \\leq 2}\\\\y=x^2\\end{cases}";
    igual(comandosNoSoportados(sinRestricciones(cases)).join(" "), "", "no se vela:");
    igual(
      separarRestriccion(lineasDeEcuacion(cases)[0]).restriccion?.max, 2,
      "y el intervalo se lee:"
    );
  });

  test("una transformación no toca la restricción", () => {
    // El pipeline no reconoce `\leq`: si una transformación recibiera la restricción, la
    // degradaría a `*l*e*q` y el panel enseñaría esa basura como si fuera lo escrito.
    igual(
      transformarSinRestriccion("x+x {0 \\leq x \\leq 2}", (e) => e.replace("x+x", "2x")),
      "2x {0 \\leq x \\leq 2}"
    );
    igual(transformarSinRestriccion("x+x", (e) => e.replace("x+x", "2x")), "2x", "sin restricción:");
  });

  test("`dentro` incluye los extremos y respeta los lados sin cota", () => {
    const r = separarRestriccion("sin(x) {0 \\leq x \\leq 6}").restriccion;
    assert(r !== null, "hay restricción");
    if (!r) return;
    assert(dentro(r, 0) && dentro(r, 6), "los extremos entran");
    assert(!dentro(r, -0.001) && !dentro(r, 6.001), "y lo de fuera no");
    const media = separarRestriccion("sqrt(x) {x \\geq 4}").restriccion;
    if (media) {
      assert(dentro(media, 1e9), "sin cota superior no hay techo");
      assert(!dentro(media, 3.999), "pero el suelo se respeta");
    }
  });
});

describe("restricción · el recorte, en el objeto que se grafica", () => {
  // El camino REAL de un bloque: `dividirEcuaciones` (que desenvuelve `f(x)=…`) y después
  // `construirObjeto`. Se comprueba sobre el ORÁCULO, que es lo que ve el trazador: fuera del
  // intervalo tiene que valer NaN, porque el contrato dice que no finito es «fuera del dominio»
  // y de ahí sale solo todo lo demás (no se traza, no hay puntos notables, no encuadra).
  const objeto = (fuente: string) => construirObjeto(dividirEcuaciones(fuente)[0], "t");

  test("una explícita vale NaN fuera del intervalo y lo de siempre dentro", () => {
    const o = objeto("f(x) = \\sin x {0 \\leq x \\leq 6}");
    assert(o.tipo === "explicita", "sigue siendo explícita");
    if (o.tipo !== "explicita") return;
    assert(Number.isNaN(o.f.eval(-1)), "por debajo:");
    assert(Number.isNaN(o.f.eval(9)), "por encima:");
    assert(Math.abs(o.f.eval(1) - Math.sin(1)) < 1e-12, "dentro, intacta:");
    assert(!Number.isNaN(o.f.eval(0)) && !Number.isNaN(o.f.eval(6)), "los extremos entran:");
  });

  test("sin restricción, la función no se envuelve en nada", () => {
    const o = objeto("\\sin x");
    if (o.tipo !== "explicita") return;
    assert(Math.abs(o.f.eval(-1) - Math.sin(-1)) < 1e-12, "intacta:");
  });

  test("una implícita se puede acotar por CUALQUIERA de sus dos variables", () => {
    const enX = objeto("x^2+y^2=9 {0 \\leq x \\leq 3}");
    const enY = objeto("x^2+y^2=9 {0 \\leq y \\leq 3}");
    if (enX.tipo !== "implicita" || enY.tipo !== "implicita") return;
    assert(Number.isNaN(enX.F.eval(-2, 1)), "en x recorta la izquierda:");
    assert(!Number.isNaN(enX.F.eval(1, -2)), "y no toca el eje vertical:");
    assert(Number.isNaN(enY.F.eval(1, -2)), "en y recorta abajo:");
    assert(!Number.isNaN(enY.F.eval(-2, 1)), "y no toca el horizontal:");
  });

  test("en paramétricas y polares el intervalo ES el dominio, y deja de ser periódica", () => {
    // Aquí no hace falta NaN: el recorrido ya era un dato del objeto. Y media circunferencia no
    // se cierra: mantener `periodica` haría que el trazador uniera el final con el principio.
    const p = objeto("(\\cos t, \\sin t) {0 \\leq t \\leq 3}");
    if (p.tipo !== "parametrica") return;
    igual(p.p.dominio[0], 0, "inicio:");
    igual(p.p.dominio[1], 3, "final:");
    igual(p.p.periodica, false, "periódica:");
    const q = objeto("r = 2\\cos(3\\theta) {0 \\leq \\theta \\leq 1}");
    if (q.tipo !== "polar") return;
    igual(q.p.dominio[1], 1, "polar, final del recorrido:");
  });

  test("un lado sin cota conserva el recorrido de siempre", () => {
    const p = objeto("(\\cos t, \\sin t) {t \\geq 1}");
    if (p.tipo !== "parametrica") return;
    igual(p.p.dominio[0], 1, "el suelo lo pone el autor:");
    assert(Math.abs(p.p.dominio[1] - 2 * Math.PI) < 1e-12, "y el techo sigue siendo 2π:");
  });

  test("una restricción sobre OTRA variable no dibuja: no se aplica a la que sea", () => {
    // `\sin x {0 ≤ t ≤ 3}` es un despiste. Recortar por x sería inventarse lo que quiso decir;
    // ignorarlo sería dibujar la curva entera como si no hubiera escrito nada.
    const o = objeto("\\sin x {0 \\leq t \\leq 3}");
    if (o.tipo !== "explicita") return;
    assert(Number.isNaN(o.f.eval(1)) && Number.isNaN(o.f.eval(2)), "vacío, y el plano se vela");
    const p = objeto("(\\cos t, \\sin t) {0 \\leq x \\leq 3}");
    if (p.tipo !== "parametrica") return;
    assert(Number.isNaN(p.p.eval(1).x), "y lo mismo en paramétricas");
  });

  test("y lo AVISA, para que el velo pueda decir por qué", () => {
    // El aviso es estructurado y sin texto: quién decide es el clasificador, quién lo redacta
    // es el host. Sin él, el plano solo podría decir «no definida en ℝ», que manda a buscar el
    // error a los números del intervalo, que están bien.
    igual(objeto("\\sin x {0 \\leq t \\leq 3}").avisoRestriccion, "variableAjena", "ajena:");
    igual(objeto("\\sin x {0 \\leq x \\leq 3}").avisoRestriccion, undefined, "la suya:");
    igual(objeto("\\sin x").avisoRestriccion, undefined, "sin restricción:");
    igual(
      objeto("r = \\cos(\\theta) {0 \\leq \\theta \\leq 3}").avisoRestriccion, undefined,
      "polar en θ:"
    );
    // La componente `y(t)=…` se grafica en x, pero el autor escribió `t`: las dos valen.
    igual(objeto("y(t) = t^2 {0 \\leq t \\leq 3}").avisoRestriccion, undefined, "componente en t:");
  });

  test("el panel escribe la restricción como coletilla, con lo que se escribió", () => {
    // `2\pi`, no `6.283185307179586`: una coletilla que no se parece a lo que uno escribió no
    // se reconoce como propia. Y el comparador se pinta `\le` venga de donde venga.
    igual(
      bloqueALatex(dividirEcuaciones("f(x) = \\sin x {0 \\leq x \\leq 2\\pi}")),
      "f(x)=\\sin x,\\quad 0 \\le x \\le 2\\pi"
    );
    igual(
      bloqueALatex(dividirEcuaciones("\\sin x {0 < x < 6}")),
      "f(x)=\\sin x,\\quad 0 \\le x \\le 6",
      "estricto se pinta cerrado, como se dibuja:"
    );
  });
});
