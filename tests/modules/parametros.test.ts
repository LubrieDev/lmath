// ─────────────────────────────────────────────
// tests · Parámetros declarados: `A = 1` + `f(x) = A\sin x`
// ─────────────────────────────────────────────
//
// Lógica PURA, la primera mitad de los deslizadores del issue #1. Lo que se fija aquí es la
// FRONTERA de qué es una declaración, porque el daño de equivocarse es asimétrico: leer de más
// hace desaparecer una curva que el autor sí quería (`y = 2` es una recta), y leer de menos
// devuelve el bloque al comportamiento roto de antes (`A = 1` convertida en LA curva).
//
// La otra mitad es la sustitución, donde el riesgo es morder al vecino: una `A` que entre dentro
// de `\Alpha`, o un parámetro `pi` que se coma el `\pi` de la fórmula.

import { describe, test, igual, assert } from "../runner";
import {
  separarParametros, sustituirParametros, recorridoDe,
} from "../../src/core/parsing/parametros";
import { dividirEcuaciones } from "../../src/core/parsing/dividirEcuaciones";
import { insertarProductoImplicito } from "../../src/core/parsing/productoImplicito";
import { evaluarConstante } from "../../src/evaluador";
import { exprALatex } from "../../src/latex";

/** Los parámetros de un source, en texto compacto. */
const params = (src: string): string =>
  separarParametros(src).parametros.map((p) => `${p.escrito}→${p.nombre}=${p.valor}`).join(" ");

/** Lo que queda del source para graficar. */
const resto = (src: string): string => separarParametros(src).source.trim();

describe("parámetros · qué es una declaración", () => {
  test("el bloque del issue, tal como lo escribió quien lo pidió", () => {
    const src = "A = 1;\n\\alpha = 1;\n\\phi = 0;\nB = 2;\nf(x) = A\\sin (\\alpha x + \\phi) + B";
    igual(params(src), "A→A=1 \\alpha→alpha=1 \\phi→phi=0 B→B=2");
    igual(resto(src), "f(x) = A\\sin (\\alpha x + \\phi) + B", "y queda una sola fórmula:");
    // La prueba de fuego: la fórmula tiene que ser UNA ecuación, no la quinta de cinco.
    igual(dividirEcuaciones(separarParametros(src).source).length, 1, "una ecuación:");
  });

  test("el punto y coma final es opcional", () => {
    igual(params("A = 1\nB = 2"), "A→A=1 B→B=2");
    igual(params("A = 1;\nB = 2;"), "A→A=1 B→B=2");
  });

  test("el lado derecho es cualquier constante, no solo un número", () => {
    igual(params("A = \\frac{1}{2}"), "A→A=0.5", "fracción:");
    igual(params("A = 2\\pi"), "A→A=" + 2 * Math.PI, "2π:");
    igual(params("A = -3"), "A→A=-3", "negativo:");
  });

  test("una COORDENADA no es un parámetro: sigue siendo la curva de siempre", () => {
    // Es la mitad cara del error: leer `y = 2` como declaración borraría una recta que el autor
    // sí quería dibujar, y sin decir nada.
    for (const c of ["y = 2", "x = 3", "r = 2", "t = 1", "theta = 1", "\\theta = 1"]) {
      igual(params(c), "", `${c}:`);
      igual(resto(c), c, `${c} intacta:`);
    }
  });

  test("un parámetro que depende de otro NO se declara: se queda como estaba", () => {
    // Misma decisión que `w = u+v` en obs-vector: se escribe, no se resuelve. Sin grafo de
    // dependencias, `2A` no se evalúa con ámbito vacío y la línea no es declaración.
    igual(params("A = 1\nB = 2A"), "A→A=1", "solo la primera:");
    igual(resto("A = 1\nB = 2A"), "B = 2A", "y la otra sigue su camino:");
  });

  test("lo que no tiene forma de declaración pasa de largo", () => {
    igual(params("y = x^2"), "", "una función:");
    igual(params("x^2+y^2=9"), "", "una implícita:");
    igual(params("f(x) = 2"), "", "con argumentos NO es declaración:");
    igual(params("x = y = 2"), "", "dos igualdades:");
    igual(params("A = "), "", "sin valor:");
    igual(params("A = k"), "", "valor que no es constante:");
  });

  test("un bloque sin parámetros atraviesa la función sin enterarse", () => {
    const src = "y = x^2\ny = 2x";
    igual(params(src), "");
    igual(separarParametros(src).source, src, "el source sale idéntico");
  });

  test("declarado dos veces, gana el último", () => {
    igual(params("A = 1\nA = 5"), "A→A=5");
  });

  test("un nombre declarado TAPA a la constante que se llame igual", () => {
    // El issue declara `\phi` como fase y mathjs lo tiene como razón áurea. Gana lo declarado:
    // quien escribe `\phi = 0` arriba no está pidiendo 1,618.
    igual(params("\\phi = 0"), "\\phi→phi=0");
    assert(Math.abs((evaluarConstante("\\phi") ?? 0) - 1.618) < 0.01, "y sin declarar sigue siendo φ");
  });
});

describe("parámetros · el recorrido del mando", () => {
  test("−10..10 por defecto, que es lo que cubre casi todo lo que se teclea", () => {
    const r = recorridoDe(1);
    igual(`${r.min}..${r.max}`, "-10..10", "recorrido:");
    igual(r.paso, 0.01, "paso:");
    igual(r.pasoGrande, 1, "salto de Shift:");
    igual(r.decimales, 2, "decimales:");
  });

  test("si el valor declarado se sale, el recorrido CRECE hasta contenerlo", () => {
    // Un mando que arranca pegado a su tope no sirve; y recortar en silencio el valor escrito
    // sería peor todavía, porque la curva dejaría de ser la que el autor pidió.
    const r = recorridoDe(37.5);
    igual(`${r.min}..${r.max}`, "-38..38", "contiene al 37,5:");
    const n = recorridoDe(-120);
    igual(`${n.min}..${n.max}`, "-120..120", "y también a un negativo:");
  });

  test("los decimales salen del paso, no de un número clavado", () => {
    igual(recorridoDe(0).decimales, 2, "escala normal:");
    igual(recorridoDe(1000).decimales, 0, "escala grande, paso de 1:");
  });
});

describe("parámetros · un nombre griego es un nombre, no un producto", () => {
  // Sin esto, `alpha` se parte en `a*l*p*h*a` y el panel lo pinta `al{p}h{a}`, que es lo que se
  // veía al declarar el `\alpha` del issue. Es la tabla de átomos del producto implícito.

  test("una letra griega llega entera al compilador", () => {
    igual(insertarProductoImplicito("alpha"), "alpha", "alpha:");
    igual(insertarProductoImplicito("omega"), "omega", "omega:");
    igual(insertarProductoImplicito("2alpha"), "2*alpha", "con coeficiente:");
    igual(insertarProductoImplicito("alpha*x"), "alpha*x", "por una variable:");
  });

  test("las cortas también, y no muerden a las largas", () => {
    // `eta` cabe dentro de `theta`, `beta` y `zeta`: el orden por longitud es lo que lo impide.
    igual(insertarProductoImplicito("theta"), "theta", "theta entera:");
    igual(insertarProductoImplicito("beta"), "beta", "beta entera:");
    igual(insertarProductoImplicito("zeta"), "zeta", "zeta entera:");
    igual(insertarProductoImplicito("eta"), "eta", "y eta suelta:");
    igual(insertarProductoImplicito("xi"), "xi", "xi:");
    igual(insertarProductoImplicito("mu"), "mu", "mu:");
  });

  test("y se pintan como la letra que son", () => {
    igual(exprALatex("alpha"), "\\alpha", "alpha:");
    igual(exprALatex("omega"), "\\omega", "omega:");
    igual(exprALatex("phi"), "\\phi", "la que ya funcionaba:");
  });

  test("lo que NO es griego se sigue partiendo igual que siempre", () => {
    igual(insertarProductoImplicito("xy"), "x*y", "dos variables:");
    igual(insertarProductoImplicito("3xy"), "3*x*y", "con coeficiente:");
    igual(insertarProductoImplicito("xsin(x)"), "x*sin(x)", "función:");
    igual(insertarProductoImplicito("2e5"), "2e5", "notación científica:");
  });
});

describe("parámetros · la sustitución", () => {
  const uno = separarParametros("A = 3").parametros;

  test("`Ax` ES el producto A·x, así que se sustituye dentro", () => {
    // Aquí no existen los nombres de varias letras: el producto implícito parte toda secuencia
    // de letras en átomos. Preguntar «¿va seguido de letra?» dejaba `Ax` sin sustituir —la forma
    // más natural de escribirlo— y el bloque salía velado como «Indeterminada».
    igual(sustituirParametros("Ax", uno), "(3)x", "pegado a la variable:");
    igual(sustituirParametros("Ax^2", uno), "(3)x^2", "con exponente:");
    igual(sustituirParametros("Ab + BA", uno), "(3)b + B(3)", "y a cualquier otra letra:");
    igual(sustituirParametros("A\\sin x", uno), "(3)\\sin x", "delante de un comando:");
    igual(sustituirParametros("x + A", uno), "x + (3)", "al final:");
  });

  test("pero NO dentro de un átomo, que sí es un nombre entero", () => {
    const a = separarParametros("a = 5").parametros;
    igual(sustituirParametros("a\\tan x", a), "(5)\\tan x", "el suyo:");
    igual(sustituirParametros("tan(x)", a), "tan(x)", "dentro de una función, no:");
    igual(sustituirParametros("alpha", a), "alpha", "dentro de una griega, no:");
    igual(sustituirParametros("tau", a), "tau", "ni de una constante:");
    const p = separarParametros("P = 1").parametros;
    igual(sustituirParametros("Pi + P", p), "Pi + (1)", "`P` no parte la Π:");
  });

  test("un nombre con barra no se come al comando parecido", () => {
    const alpha = separarParametros("\\alpha = 2").parametros;
    igual(sustituirParametros("\\alpha x", alpha), "(2) x", "el suyo:");
    igual(sustituirParametros("\\alphax", alpha), "\\alphax", "pegado, no:");
    const pi = separarParametros("pi = 3").parametros;
    igual(sustituirParametros("\\pi + pi", pi), "\\pi + (3)", "`pi` no toca `\\pi`:");
  });

  test("el valor va entre paréntesis, y eso no es cosmética", () => {
    const neg = separarParametros("A = -2").parametros;
    igual(sustituirParametros("x^A", neg), "x^(-2)", "un negativo sin paréntesis rompería x^A");
    igual(sustituirParametros("A\\sin x", neg), "(-2)\\sin x", "y el producto implícito sigue:");
  });

  test("los valores actuales del deslizador ganan al declarado", () => {
    const ps = separarParametros("A = 1\nB = 2").parametros;
    const ahora = new Map([["A", 7]]);
    igual(sustituirParametros("A + B", ps, ahora), "(7) + (2)", "A movido, B en su valor inicial");
  });

  test("el bloque del issue, sustituido entero", () => {
    const { parametros, source } = separarParametros(
      "A = 1\n\\alpha = 1\n\\phi = 0\nB = 2\nf(x) = A\\sin (\\alpha x + \\phi) + B"
    );
    igual(
      sustituirParametros(source, parametros),
      "f(x) = (1)\\sin ((1) x + (0)) + (2)"
    );
  });

  test("sin parámetros, la expresión sale idéntica", () => {
    igual(sustituirParametros("A\\sin x", []), "A\\sin x");
  });
});
