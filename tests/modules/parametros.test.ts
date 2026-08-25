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

import { describe, test, igual, assert, aprox } from "../runner";
import {
  separarParametros, sustituirParametros, recorridoDe,
} from "../../src/core/parsing/parametros";
import { dividirEcuaciones } from "../../src/core/parsing/dividirEcuaciones";
import { insertarProductoImplicito } from "../../src/core/parsing/productoImplicito";
import { evaluarConstante, compilarFuncion } from "../../src/evaluador";
import { normalizarEntrada } from "../../src/parser";
import { exprALatex } from "../../src/latex";
import { simplificarEcuaciones } from "../../src/simplificar";
import { mismaFuncion } from "../../src/math/dominio";
import { clasificarDegenerada, degeneradaPorSingularidad } from "../../src/degeneradas";
import { degeneradaDeEcuacion } from "../../src/host-obsidian/analysis/clasificacion";

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

describe("parámetros · BUG-001: un valor que indefiniza la fórmula", () => {
  // Con `A = 0`, `Ax^{A-1}` es `0·x^{-1}` (indefinida en x=0) y `Ax^{A}` es `0·x^0`
  // (0^0 indeterminada en el origen). El bug: la sustitución escribe los valores entre
  // paréntesis, el exponente llega como `(0)-1` y el lector de dominio no lo plegaba —
  // así que el guardián daba por buena la reducción a la constante `0`, que rellena el
  // agujero del origen, y el bloque graficaba una recta `y=0` que no es la función.
  // Lo tecleado A MANO (`0x^{-1}`) siempre se comportó bien: la regresión era del formato
  // `(valor)` que introdujo v1.4.0.

  /** La fórmula del bloque con los valores declarados puestos y normalizada, como llega
   *  al compilador (`construirObjeto.norm`). */
  const sustituida = (src: string): string => {
    const { parametros, source } = separarParametros(src);
    return insertarProductoImplicito(normalizarEntrada(sustituirParametros(source.trim(), parametros)));
  };

  test("los dos bloques de la reproducción, sustituidos", () => {
    igual(sustituirParametros("Ax^{A-1}", separarParametros("A = 0").parametros), "(0)x^{(0)-1}");
    igual(sustituirParametros("Ax^{A}", separarParametros("A = 0").parametros), "(0)x^{(0)}");
  });

  test("el guardián ya NO da por buena la reducción a la constante 0", () => {
    assert(!mismaFuncion("0", sustituida("Ax^{A-1}\nA=0")), "0·x^{-1} difiere de 0 en x=0");
    assert(!mismaFuncion("0", sustituida("Ax^{A}\nA=0")), "0·x^0 difiere de 0 en x=0");
  });

  test("Simplificar conserva la estructura, igual que lo tecleado a mano", () => {
    const p = separarParametros("A = 0").parametros;
    // Del slider: la forma `(valor)` sobrevive a Simplificar…
    igual(simplificarEcuaciones([sustituirParametros("Ax^{A-1}", p)])[0], "(0)*x^((0)-1)");
    igual(simplificarEcuaciones([sustituirParametros("Ax^{A}", p)])[0], "(0)*x^((0))");
    // …exactamente como la misma forma tecleada directamente, que siempre se conservó.
    igual(simplificarEcuaciones(["0x^{-1}"])[0], "0*x^(-1)");
  });

  test("la función compilada tiene su agujero en el origen, y cero fuera", () => {
    for (const src of ["Ax^{A-1}\nA=0", "Ax^{A}\nA=0"]) {
      const f = compilarFuncion(sustituida(src), "x");
      assert(Number.isNaN(f(0) as number), `${src}: f(0) es NaN`);
      igual(f(2) as number, 0, `${src}: f(2) = 0`);
      igual(f(-2) as number, 0, `${src}: f(-2) = 0`);
      igual(f(0.5) as number, 0, `${src}: f(0.5) = 0`);
    }
  });

  test("misma conducta que la forma tecleada directamente (paridad)", () => {
    const conSlider = compilarFuncion(sustituida("Ax^{A-1}\nA=0"), "x");
    const aMano = compilarFuncion("0*x^(-1)", "x");
    igual(Number.isNaN(conSlider(0) as number), Number.isNaN(aMano(0) as number), "f(0):");
    igual(conSlider(3), aMano(3), "f(3):");

    const conSliderB = compilarFuncion(sustituida("Ax^{A}\nA=0"), "x");
    const aManoB = compilarFuncion("0*x^0", "x");
    igual(Number.isNaN(conSliderB(0) as number), Number.isNaN(aManoB(0) as number), "f(0) caso B:");
  });

  test("el bloque se VELA: Indefinida la rota por cociente, Indeterminada la de 0^0", () => {
    // El muestreo de `clasificarDegenerada` ve reales (ceros) y se queda callado: el velo lo
    // pone `degeneradaPorSingularidad`, que ve la constante con el dominio roto en un punto.
    for (const [src, etiqueta] of [
      ["Ax^{A-1}\nA=0", "Indefinida"],
      ["Ax^{A}\nA=0", "Indeterminada"],
    ] as const) {
      const n = sustituida(src);
      const f = compilarFuncion(n, "x");
      igual(clasificarDegenerada(f), null, `${src}: el muestreo solo no basta`);
      igual(degeneradaPorSingularidad(n, f)?.etiqueta, etiqueta, `${src}:`);
    }
  });

  test("el velo llega por el camino REAL del bloque (degeneradaDeEcuacion)", () => {
    // La misma pregunta que hace el host, sobre la ecuación YA SUSTITUIDA.
    const p = separarParametros("A = 0").parametros;
    igual(degeneradaDeEcuacion(sustituirParametros("Ax^{A-1}", p))?.etiqueta, "Indefinida");
    igual(degeneradaDeEcuacion(sustituirParametros("Ax^{A}", p))?.etiqueta, "Indeterminada");
  });

  test("NO REGRESIÓN: lo que siempre se dibujó sigue dibujándose", () => {
    const sinVelo = (expr: string): string | undefined =>
      degeneradaPorSingularidad(expr, compilarFuncion(expr, "x"))?.etiqueta;
    igual(sinVelo("1/x"), undefined, "el polo de 1/x es una asíntota, no un velo");
    igual(sinVelo("tan(x)"), undefined, "tan no tiene condiciones leíbles: sin velo");
    igual(sinVelo("sqrt(x)"), undefined, "la frontera de una raíz SÍ existe");
    igual(sinVelo("(x^2 - 1)/(x - 1)"), undefined, "agujero removable NO constante: se dibuja");
    igual(sinVelo("5/(x - 5)"), undefined, "el polo del deslizador también es asíntota");
    igual(sinVelo("x^2"), undefined, "un polinomio no se vela");
  });

  test("la indeterminación PURA sí se vela: `y = 0^0` es Indeterminada", () => {
    igual(clasificarDegenerada(compilarFuncion("0^0", "x"))?.etiqueta, "Indeterminada");
  });
});

describe("parámetros · polos trigonométricos en valores exactos (BUG-001, familia tan)", () => {
  // `tan(A)` con `A = 90`: el parser lee el argumento numérico de una trigonométrica directa
  // en GRADOS (`tan(90)` → `tan(90·pi/180)`), y en coma flotante `Math.tan(pi/2)` no es
  // infinito sino el residuo 1.633e16 — un valor que no existe, presentado como número. El
  // bloque graficaba una recta `y=1.63e16` fuera de la vista en vez de velarse. La arreglo
  // está en la EVALUACIÓN (polos honestos: ±Infinity en el polo, cero exacto en el cero),
  // porque con eso el clasificador de siempre —«algún ±∞ → Indefinida»— hace el resto, y
  // también cubre los casos no constantes (`tan(A)·x` con A=90 es Infinity·x).

  /** El bloque del reporte, con el valor del deslizador puesto. */
  const bloque = (formula: string, decl: string): string => {
    const { parametros, source } = separarParametros(`${formula}\n${decl}`);
    return insertarProductoImplicito(
      normalizarEntrada(sustituirParametros(source.trim(), parametros))
    );
  };

  test("EL CASO: `tan(A)` con A=90 se vela como Indefinida", () => {
    igual(degeneradaDeEcuacion(bloque("tan(A)", "A=90"))?.etiqueta, "Indefinida");
  });

  test("la familia entera de polos exactos, en grados y en radianes", () => {
    for (const expr of [
      "tan(90)", "tan(-90)", "tan(270)", "tan(pi/2)",
      "sec(90)", "sec(pi/2)", "csc(180)", "csc(pi)",
      "cot(180)", "cot(0)", "cot(pi)",
      "1/cos(pi/2)", "1/sin(pi)",
    ]) {
      igual(
        degeneradaDeEcuacion(expr)?.etiqueta, "Indefinida", `${expr}:`
      );
    }
  });

  test("un polo multiplicado no se cuela: `tan(A)·x` con A=90 tampoco se dibuja", () => {
    igual(degeneradaDeEcuacion(bloque("tan(A)x", "A=90"))?.etiqueta, "Indefinida");
  });

  test("los ceros exactos son cero: sin(pi) y cos(pi/2) valen 0", () => {
    const f = compilarFuncion("sin(pi)", "x");
    igual(f(0) as number, 0, "sin(pi):");
    const g = compilarFuncion("cos(pi/2)", "x");
    igual(g(0) as number, 0, "cos(pi/2):");
  });

  test("NO REGRESIÓN: lo legítimo cerca del polo no se toca", () => {
    // `tan(x)` es una función con asíntotas: se dibuja, no se vela.
    igual(degeneradaDeEcuacion("tan(x)"), null, "tan(x):");
    // A dos centésimas del polo el valor es legítimo (≈5729): recta dibujable.
    igual(degeneradaDeEcuacion("tan(89.99)"), null, "tan(89.99):");
    // Y un argumento que no es el polo evalúa lo suyo.
    igual(compilarFuncion("tan(1.57)", "x")(0) as number, Math.tan(1.57), "tan(1.57):");
    igual(compilarFuncion("sin(x)", "x")(1) as number, Math.sin(1), "sin(x) en 1:");
    igual(compilarFuncion("cos(x)", "x")(0) as number, 1, "cos(0):");
  });

  test("un polo no es una constante declarable", () => {
    igual(evaluarConstante("tan(90)"), null, "A = tan(90) no declara nada:");
    aprox(evaluarConstante("tan(45)") ?? NaN, 1, 1e-12, "y tan(45) sigue siendo 1:");
  });
});
