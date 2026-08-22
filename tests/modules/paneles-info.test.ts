// ─────────────────────────────────────────────
// tests · Las líneas de los cuadros ⓘ: prosa fuera, matemática entre `$…$`
// ─────────────────────────────────────────────
//
// Los cinco cuadros ⓘ escriben su matemática en LaTeX y la marcan con `$…$`; `pintarLineaPanel`
// la compone con KaTeX y deja la prosa en la fuente del panel. Las dos mitades del contrato se
// pueden romper por separado, y las dos se comprueban aquí:
//
//   • Que el CATÁLOGO esté bien marcado —delimitadores pares, el valor DENTRO de ellos y el
//     símbolo en su forma LaTeX—, en los tres idiomas. Es lo que un traductor puede romper sin
//     enterarse: un `$` de menos convierte la línea entera en literal.
//   • Que las cinco REDACCIONES metan por ahí los valores que les tocan.
//
// Nada de esto toca el DOM: las cinco funciones son puras y devuelven strings.

import { describe, test, assert, igual } from "../runner";
import { fijarIdioma, t, type Idioma } from "../../src/i18n";
import {
  lineasResumen, lineasPolar, lineasParametricas, lineasDerivada, lineasIntegral, lineasImplicita,
} from "../../src/host-obsidian/analysis/lineasAnalisis";
import { notablesDeImplicita } from "../../src/math/notablesImplicita";
import {
  numeroALatex, puntoALatex, intervaloALatex, listaALatex, formatearLectura,
} from "../../src/core/analysis/formatoNumero";
import { analizarDerivada } from "../../src/core/analysis/analisisDerivada";
import type { AnalisisIntegral } from "../../src/core/analysis/analisisIntegral";
import { analizarIntegral } from "../../src/core/analysis/analisisIntegral";
import { analizarPolar } from "../../src/core/analysis/analisisPolar";
import { analizarParametrico } from "../../src/core/analysis/analisisParametrico";
import { crearFuncionReal } from "../../src/core/fields/funcionRealMathjs";

const IDIOMAS: Idioma[] = ["es", "en", "pt", "de"];

/** Los trozos de una línea que van dentro de `$…$` (los índices impares al partir por `$`). */
function trozosMate(linea: string): string[] {
  const partes = linea.split("$");
  return partes.filter((_, i) => i % 2 === 1);
}

/** ¿El token cae DENTRO de un par de `$`? */
const enMate = (linea: string, token: string): boolean =>
  trozosMate(linea).some((m) => m.includes(token));

/** Marca inconfundible para seguir un valor interpolado hasta la línea final. */
const V = "@@";

describe("paneles ⓘ · el catálogo marca su matemática, en los tres idiomas", () => {
  /**
   * Cada mensaje que recibe un VALOR, con los argumentos con los que se le llama. El valor
   * marcado (`@@`) tiene que acabar entre `$…$`; los que NO son valores —un recuento de
   * pétalos, el nombre de un tipo de punto crítico— se pasan como prosa y no se exigen.
   */
  const conValor = (): { nombre: string; linea: string }[] => {
    const T = t();
    return [
      { nombre: "resumen.interseccionY", linea: T.resumen.interseccionY(V) },
      { nombre: "resumen.vertice", linea: T.resumen.vertice(V) },
      { nombre: "resumen.verticeMin", linea: T.resumen.verticeMin(V) },
      { nombre: "resumen.verticeMax", linea: T.resumen.verticeMax(V) },
      { nombre: "polar.periodo", linea: T.polar.periodo(V) },
      { nombre: "polar.rangoRadial", linea: T.polar.rangoRadial(V, V) },
      { nombre: "polar.radioConstante", linea: T.polar.radioConstante(V) },
      { nombre: "polar.extremosEn", linea: T.polar.extremosEn(V, V) },
      { nombre: "polar.pasaPorPolo", linea: T.polar.pasaPorPolo(V) },
      { nombre: "polar.areaBarrida", linea: T.polar.areaBarrida(V, V) },
      { nombre: "parametrica.intervalo", linea: T.parametrica.intervalo(V, V) },
      { nombre: "parametrica.periodo", linea: T.parametrica.periodo(V) },
      { nombre: "parametrica.periodoExcede", linea: T.parametrica.periodoExcede(V) },
      { nombre: "parametrica.caja", linea: T.parametrica.caja(V, V, V, V) },
      { nombre: "parametrica.longitud", linea: T.parametrica.longitud(V) },
      { nombre: "parametrica.areaAlgebraica", linea: T.parametrica.areaAlgebraica(V) },
      { nombre: "parametrica.lissajous", linea: T.parametrica.familia.lissajous("3", "2", V) },
      { nombre: "integral.impropia", linea: T.integral.impropia("x", V) },
      { nombre: "integral.intervalo", linea: T.integral.intervalo(V, V, "x") },
      { nombre: "integral.cruces", linea: T.integral.cruces("x", V) },
      { nombre: "integral.areaPositiva", linea: T.integral.areaPositiva(V) },
      { nombre: "integral.areaNegativa", linea: T.integral.areaNegativa(V) },
      { nombre: "integral.promedio", linea: T.integral.promedio(V) },
      { nombre: "derivada.pendienteEn0", linea: T.derivada.pendienteEn0(V) },
      { nombre: "derivada.criticoItem", linea: T.derivada.criticoItem(V, "máximo") },
      { nombre: "derivada.creciente", linea: T.derivada.creciente(V) },
      { nombre: "derivada.decreciente", linea: T.derivada.decreciente(V) },
      { nombre: "derivada.inflexionUna", linea: T.derivada.inflexionUna(V) },
      { nombre: "derivada.noDerivableUno", linea: T.derivada.noDerivableUno(V) },
      { nombre: "derivada.punto", linea: T.derivada.punto(V) },
      { nombre: "derivada.rangoAnalisis", linea: T.derivada.rangoAnalisis(V, V) },
    ];
  };

  test("el valor interpolado cae SIEMPRE dentro de los `$`", () => {
    for (const idioma of IDIOMAS) {
      fijarIdioma(idioma);
      for (const { nombre, linea } of conValor())
        assert(enMate(linea, V), `${idioma}/${nombre}: el valor quedó fuera de los $ → «${linea}»`);
    }
    fijarIdioma("es");
  });

  test("los delimitadores están PAREADOS: un `$` suelto deja la línea en literal", () => {
    for (const idioma of IDIOMAS) {
      fijarIdioma(idioma);
      for (const { nombre, linea } of conValor()) {
        const cuantos = linea.split("$").length - 1;
        igual(cuantos % 2, 0, `${idioma}/${nombre}: nº impar de $ en «${linea}»`);
      }
    }
    fijarIdioma("es");
  });

  test("dentro de los `$` el símbolo va en LaTeX, no en Unicode", () => {
    // `≤` y `π` no existen para KaTeX: dentro de matemática se escriben `\le` y `\pi`. Este es
    // el error natural al traducir a partir de la línea vieja, que era texto plano.
    const PROHIBIDOS = ["≤", "≥", "π", "θ", "∞", "·", "√"];
    for (const idioma of IDIOMAS) {
      fijarIdioma(idioma);
      for (const { nombre, linea } of conValor())
        for (const trozo of trozosMate(linea))
          for (const c of PROHIBIDOS)
            assert(!trozo.includes(c), `${idioma}/${nombre}: «${c}» dentro de $…$ → «${linea}»`);
    }
    fijarIdioma("es");
  });
});

describe("paneles ⓘ · las cinco redacciones escriben la matemática donde toca", () => {
  // Las afirmaciones de aquí abajo son sobre el texto ESPAÑOL, así que se fija: el idioma por
  // defecto es el inglés y depender del que dejara otro bloque sería una prueba que pasa por
  // el orden en que se cargan los módulos.
  fijarIdioma("es");

  test("EL CASO del pantallazo: la intersección Y de arccot es un par compuesto", () => {
    // `arccot x` corta el eje y en (0, π/2). Se lee «Intersección con el eje y: (0, π/2)», donde esa
    // barra puede ser una división o un separador; ahora es una fracción de verdad.
    const lineas = lineasResumen(
      { raices: [], vertices: [], intervalosRaiz: [] },
      Math.PI / 2, false, false);
    igual(lineas[0], "Intersección con el eje y: $\\left(0,\\ \\frac{\\pi}{2}\\right)$");
    igual(lineas[1], "No hay raíces reales");
    igual(lineas[2], "No hay vértices");
  });

  test("raíces, vértices y la Y no definida", () => {
    const lineas = lineasResumen(
      { raices: [-1, 1], vertices: [{ x: 0, y: -1, tipo: "min" }], intervalosRaiz: [] },
      -1, false, false);
    igual(lineas[0], "Intersección con el eje y: $\\left(0,\\ -1\\right)$");
    igual(lineas[1], "Raíces: $-1,\\ 1$");
    igual(lineas[2], "Vértice mínimo: $\\left(0,\\ -1\\right)$");
    // Sin f(0) (discontinuidad en 0) NO se compone ningún número: la línea lo dice con
    // palabras, y lo que nunca puede aparecer es el NaN del que salió.
    const rota = lineasResumen({ raices: [], vertices: [], intervalosRaiz: [] }, NaN, false, false);
    igual(rota[0], "Intersección con el eje y: no definida (discontinuidad en $x = 0$)");
    for (const l of rota) assert(!l.includes("NaN"), `un NaN llegó al cuadro: «${l}»`);
  });

  test("polar: el ángulo de los extremos y el rango del radio", () => {
    const a = analizarPolar("2 + 2cos(theta)");   // cardioide
    assert(a !== null, "la cardioide debe analizarse");
    if (a === null) return;
    const lineas = lineasPolar(a);
    const radio = lineas.find((l) => l.startsWith("Radio"));
    assert(radio !== undefined && radio.includes("\\le r \\le"),
      `el rango radial debe ir en matemática: «${radio}»`);
    for (const l of lineas) igual((l.split("$").length - 1) % 2, 0, `«${l}» con $ impares`);
  });

  test("paramétrica: el intervalo del parámetro y la caja", () => {
    const a = analizarParametrico("cos(t)", "sin(t)", 0, 2 * Math.PI);
    assert(a !== null, "la circunferencia debe analizarse");
    if (a === null) return;
    const lineas = lineasParametricas(a);
    assert(lineas.some((l) => l.includes("\\le t \\le")), "el intervalo de t va en matemática");
    assert(lineas.some((l) => l.includes("\\le x \\le")), "y la caja también");
    for (const l of lineas) igual((l.split("$").length - 1) % 2, 0, `«${l}» con $ impares`);
  });

  test("derivada: los críticos y los tramos de crecimiento", () => {
    // f(x) = x², f′(x) = 2x: un mínimo en 0, decreciente antes y creciente después.
    const lineas = lineasDerivada(analizarDerivada((x) => x * x, (x) => 2 * x), false)
      .map((l) => l.texto);
    assert(lineas.some((l) => l.includes("$x = 0$")), `el crítico en x=0: ${lineas.join(" | ")}`);
    for (const l of lineas) igual((l.split("$").length - 1) % 2, 0, `«${l}» con $ impares`);
  });

  test("integral: el intervalo y el valor con su forma cerrada", () => {
    const A = analizarIntegral(crearFuncionReal("x^2"), 0, 2);
    assert(A !== null, "la integral debe analizarse");
    if (A === null) return;
    const lineas = lineasIntegral(A, "x", "\\int_{0}^{2} x^2 dx");
    assert(lineas.some((l) => l.includes("\\le x \\le")), "el intervalo va en matemática");
    const valor = lineas.find((l) => l.startsWith("Valor"));
    assert(valor !== undefined && valor.includes("$"), `el valor va compuesto: «${valor}»`);
    for (const l of lineas) igual((l.split("$").length - 1) % 2, 0, `«${l}» con $ impares`);
  });
});

describe("paneles ⓘ · una implícita se resume desde su ECUACIÓN, no desde el plano", () => {
  fijarIdioma("es");

  /** Las líneas del cuadro de una curva implícita, tal cual las pinta el panel. */
  const cuadro = (ec: string, trig = false): string[] => {
    const N = notablesDeImplicita(ec);
    assert(N !== null, `${ec}: debería poder analizarse`);
    return N === null ? [] : lineasImplicita(N, trig);
  };

  test("el pie «En la vista actual» ha desaparecido del catálogo", () => {
    // Era la confesión de que la respuesta dependía del encuadre. Ya no depende, así que ni
    // la frase ni la clave existen: esto lo comprueba el compilador, y aquí queda la razón.
    for (const idioma of IDIOMAS) {
      fijarIdioma(idioma);
      const todas = Object.values(t().resumen).map((v) => typeof v === "string" ? v : "");
      for (const s of todas)
        assert(!/vista actual|current view|vista atual/i.test(s), `«${s}» sigue hablando de la vista`);
    }
    fijarIdioma("es");
  });

  test("una circunferencia: cortes con los dos ejes y sus dos vértices, EXACTOS", () => {
    const l = cuadro("x^2 + y^2 = 25");
    igual(l[0], "Intersección con el eje y: $\\left(0,\\ -5\\right)$");
    igual(l[1], "Intersección con el eje y: $\\left(0,\\ 5\\right)$");
    igual(l[2], "Raíces: $-5,\\ 5$");
    // Los vértices de una circunferencia son su punto más alto y el más bajo, que aquí
    // coinciden con los cortes del eje Y. Salen de ∂F/∂x = 2x = 0, no de mirar el dibujo.
    igual(l[3], "Vértice: $\\left(0,\\ -5\\right)$");
    igual(l[4], "Vértice: $\\left(0,\\ 5\\right)$");
    igual(l.length, 5, "y ningún pie: es polinómica y está resuelta entera");
  });

  test("una elipse, con los semiejes en su sitio", () => {
    const l = cuadro("x^2/9 + y^2/4 = 1");
    igual(l[0], "Intersección con el eje y: $\\left(0,\\ -2\\right)$");
    igual(l[1], "Intersección con el eje y: $\\left(0,\\ 2\\right)$");
    igual(l[2], "Raíces: $-3,\\ 3$");
  });

  test("una hipérbola no corta los ejes, y eso SÍ se puede afirmar", () => {
    // `xy = 1` no toca ninguno de los dos ejes y no tiene tangente horizontal en ningún punto.
    // Las tres negaciones son verdad y están respaldadas por el motor, no por la ventana.
    const l = cuadro("x*y = 1");
    igual(l[0], "No corta el eje y");
    igual(l[1], "No hay raíces reales");
    igual(l[2], "No hay vértices");
    igual(l.length, 3);
  });

  test("la respuesta NO depende del encuadre: una curva lejos del origen", () => {
    // Con el resumen viejo, una circunferencia centrada en (5,5) y una vista alrededor del
    // origen no tenía ni cortes ni vértices «en la vista actual». La curva sí los tiene.
    const l = cuadro("(x - 5)^2 + (y - 5)^2 = 1");
    igual(l[0], "No corta el eje y");
    igual(l[1], "No hay raíces reales");
    igual(l[2], "Vértice: $\\left(5,\\ 4\\right)$");
    igual(l[3], "Vértice: $\\left(5,\\ 6\\right)$");
  });

  test("una cúbica: tres raíces y los vértices del óvalo", () => {
    const l = cuadro("y^2 = x^3 - x");
    igual(l[1], "Raíces: $-1,\\ 0,\\ 1$");
    assert(l.some((s) => s.startsWith("Vértice:")), `debería tener vértices: ${l.join(" | ")}`);
  });

  test("un punto SINGULAR no es un vértice", () => {
    // La cúspide de `y² = x³` está en el origen: ahí se anulan ∂F/∂x Y ∂F/∂y a la vez, así que
    // no hay tangente horizontal que declarar. Sin el filtro, el origen se colaba como vértice.
    const l = cuadro("y^2 = x^3");
    igual(l.filter((s) => s.startsWith("Vértice")).length, 0, `${l.join(" | ")}`);
    assert(l.includes("No hay vértices"), `${l.join(" | ")}`);
  });

  test("lo que el motor NO sabe resolver se CALLA, y se dice que se calla", () => {
    // `sin x + sin y = 1` se le escapa al motor. Antes el cuadro escribía tres líneas sobre la
    // ventana; ahora no afirma nada de lo que no sabe, y lo advierte.
    const l = cuadro("\\sin(x) + \\sin(y) = 1", true);
    assert(!l.some((s) => s.startsWith("No ")), `no puede negar nada: ${l.join(" | ")}`);
    igual(l[l.length - 1], "Hay puntos notables que el motor no ha podido determinar.");
  });

  test("lo escrito que no es una ecuación no tiene curva de la que hablar", () => {
    igual(notablesDeImplicita("x^2 + y^2"), null);
  });

  test("coste acotado: abrir el cuadro no cuelga la nota", () => {
    // Son TRES sistemas por curva, y el cuadro se refresca en cada pasada final (con caché por
    // ecuación). Si esto se dispara, la nota se congela al abrirlo.
    const t0 = Date.now();
    for (const ec of ["x^2 + y^2 = 25", "y^2 = x^3 - x", "x^2/9 + y^2/4 = 1", "x*y = 1"])
      cuadro(ec);
    const ms = Date.now() - t0;
    assert(ms < 2000, `cuatro curvas tardaron ${ms} ms`);
  });
});

describe("paneles ⓘ · las piezas compuestas se escriben enteras", () => {
  test("un par ordenado es UNA expresión, con paréntesis que crecen", () => {
    igual(puntoALatex(0, Math.PI / 2), "\\left(0,\\ \\frac{\\pi}{2}\\right)");
    igual(puntoALatex(-1, 2), "\\left(-1,\\ 2\\right)");
    // La coma lleva su espacio: sin él el segundo miembro se pega al primero y el par se lee
    // como un número con decimales.
    assert(puntoALatex(1, 5).includes(",\\ "), "la coma separa, y se tiene que ver");
  });

  test("un intervalo sabe escribir el infinito", () => {
    igual(intervaloALatex(-Infinity, -1), "\\left(-\\infty,\\ -1\\right)");
    igual(intervaloALatex(0, Infinity), "\\left(0,\\ \\infty\\right)");
  });

  test("una lista es un solo fragmento, no varios pegados", () => {
    igual(listaALatex([Math.PI / 4, (3 * Math.PI) / 4]),
      "\\frac{\\pi}{4},\\ \\frac{3\\pi}{4}");
    igual(listaALatex([]), "");
    igual(listaALatex([2]), "2");
  });

  test("el número sigue reconociendo su forma cerrada", () => {
    // No es nuevo —es `numeroALatex` de siempre—, pero ahora es lo que se ve en los cinco
    // cuadros, así que su contrato es el de todos ellos.
    igual(numeroALatex(Math.PI / 2), "\\frac{\\pi}{2}");
    igual(numeroALatex(-Math.PI / 4), "-\\frac{\\pi}{4}");
    igual(numeroALatex(2.99994), "3");
    igual(numeroALatex(Infinity), "\\infty");
  });
});

// ─────────────────────────────────────────────
// La PRECISIÓN según de dónde venga el número
// ─────────────────────────────────────────────
//
// Todos los números del panel pasaban por la misma política: 4 decimales, y reconocimiento de
// forma cerrada con tolerancia 1e-4. La política es correcta —y la cabecera de `formatoNumero.ts`
// la justifica bien— **para los valores ESTIMADOS**: una raíz sale de una bisección y un vértice
// de un ajuste parabólico, así que su cuarta cifra ya venía con error y mostrar más sería inventar.
//
// El problema es que por ahí pasaban también valores EVALUADOS. La intersección con el eje Y es
// `f(0)`: no se estima, se calcula. Aplicarle el redondeo de un estimado le quitaba información
// que sí existía —`2.99888…` se imprimía `2.9989`— y, peor, le permitía saltar a una forma cerrada
// que estaba a 1e-4, una distancia enorme para un número exacto.
//
// Lo que se defiende aquí es que las dos políticas coexisten y que cada número recibe la suya.

describe("paneles ⓘ · la precisión depende de la PROCEDENCIA del número", () => {
  fijarIdioma("es");

  const resumenCon = (interseccionY: number, extra: Partial<{
    raices: number[]; vertices: Array<{ x: number; y: number; tipo: "min" | "max" }>;
  }> = {}) => lineasResumen(
    { raices: extra.raices ?? [], vertices: extra.vertices ?? [], intervalosRaiz: [] },
    interseccionY, false, false);

  /** Un análisis de integral mínimo: solo importan los límites y las singularidades. */
  const integralCon = (
    a: number, b: number, extra: Partial<AnalisisIntegral> = {}
  ): AnalisisIntegral => ({
    a, b, valor: 1, impropia: false, singularidades: [], invertido: false,
    signo: 1, cruces: [], areaPositiva: null, areaNegativa: null, promedio: null, ...extra,
  });

  test("EL CASO: f(0)=2.99888… se escribe entero, no redondeado a 2.9989", () => {
    igual(resumenCon(2.99888123)[0], "Intersección con el eje y: $\\left(0,\\ 2.99888\\right)$");
  });

  test("un f(0) que NO es 3 ya no se anuncia como 3", () => {
    // Con la tolerancia de un estimado (1e-4) este valor saltaba a "3": a un número calculado
    // eso le cambia la tercera cifra decimal y afirma una exactitud que no tiene.
    igual(resumenCon(2.9999412)[0], "Intersección con el eje y: $\\left(0,\\ 2.99994\\right)$");
  });

  test("pero un f(0) que SÍ es entero sigue saliendo entero", () => {
    // La procedencia cambia la TOLERANCIA, no la política de reconocer formas cerradas: un 3
    // exacto sigue escribiéndose "3" y no "3.00000".
    igual(resumenCon(3)[0], "Intersección con el eje y: $\\left(0,\\ 3\\right)$");
    igual(resumenCon(-1)[0], "Intersección con el eje y: $\\left(0,\\ -1\\right)$");
  });

  test("y un f(0) que SÍ es π/2 sigue saliendo π/2", () => {
    // `arccot x` corta en π/2 de verdad: el doble que sale de evaluarlo ES π/2 hasta el último
    // bit, así que entra de sobra en la tolerancia estrecha. Lo que ya no entra es un 1.5708
    // escrito a mano, que está a 2.7e-8 y no es el mismo número.
    igual(resumenCon(Math.PI / 2)[0], "Intersección con el eje y: $\\left(0,\\ \\frac{\\pi}{2}\\right)$");
    // Sale `1.5708` y no `1.57080`: el panel recorta los ceros de relleno (los conserva el
    // readout del crosshair, que es donde sirven). No se pierde ninguna cifra —la sexta ERA el
    // cero— y lo que importa se mantiene: es un decimal, no π/2.
    igual(numeroALatex(1.5707963, "evaluado"), "1.5708", "un π/2 truncado NO es π/2");
    igual(numeroALatex(1.5707963), "\\frac{\\pi}{2}", "medido sí lo reconoce, y hace bien");
  });

  test("las RAÍCES conservan la política de estimado: 4 decimales", () => {
    // Salen de una bisección. La quinta cifra sería ruido del método, no del número.
    igual(resumenCon(0, { raices: [2.99888123] })[1], "Raíces: $2.9989$");
    igual(numeroALatex(2.99888123), "2.9989");
  });

  test("los VÉRTICES conservan su tolerancia de reconocimiento", () => {
    // Un vértice real en 3 aterriza en 2.99994 por el ajuste parabólico, y ahí escribir "3" no
    // afirma nada que el número no dijera: por debajo de 1e-4 el estimador no los distingue.
    const lineas = resumenCon(0, { vertices: [{ x: 2.9999412, y: -1.000007, tipo: "min" }] });
    igual(lineas[2], "Vértice mínimo: $\\left(3,\\ -1\\right)$");
  });

  // ── La auditoría de los ~38 números de los paneles ──────────────────────────────────
  //
  // La intersección Y fue el caso que se reportó, pero era UNA instancia. Al recorrer el
  // archivo entero salieron cinco sitios más cuyo número tampoco se estima. La clasificacion
  // completa, con el porqué de cada uno, está en la cabecera de `lineasAnalisis.ts`.

  test("los LÍMITES de una integral son lo que se escribió, no una medida", () => {
    // `evaluarLimite` compila y evalúa lo que hay en `\int_{a}^{b}`. Con la política de
    // estimados, un límite de 1.234e-5 se imprimía «0» y el panel rotulaba el intervalo
    // `0 <= x <= 0`, que no es el que se escribió.
    igual(lineasIntegral(integralCon(0, 0.00001234), "x", "")[1], "$0 \\le x \\le 1.234e-5$");
    igual(lineasIntegral(integralCon(Math.SQRT2, 2), "x", "")[1], "$1.41421 \\le x \\le 2$");
  });

  test("y siguen reconociendo su forma cerrada", () => {
    // La procedencia cambia la TOLERANCIA, no la política: un límite que es π sigue siendo π.
    igual(lineasIntegral(integralCon(0, Math.PI), "x", "")[1], "$0 \\le x \\le \\pi$");
  });

  test("las SINGULARIDADES de una impropia son esos mismos límites", () => {
    const A = integralCon(0, Math.SQRT2, { impropia: true, singularidades: [Math.SQRT2] });
    igual(lineasIntegral(A, "x", "")[0], "Integral definida · impropia en $x = 1.41421$, converge");
  });

  test("la PENDIENTE EN EL ORIGEN es una evaluación, no un ajuste", () => {
    // `df` es la derivada SIMBÓLICA ya compilada, así que `df(0)` trae todas sus cifras. Es el
    // mismo caso que `f(0)`, y estaba con la política de estimados.
    const A = analizarDerivada((x) => x / 3, () => 1 / 3);
    igual(lineasDerivada(A, false)[1].texto, "Pendiente en $x = 0$: $0.333333$");
  });

  test("pero los CRÍTICOS del mismo panel siguen siendo estimados", () => {
    // La mitad interesante de la auditoría es la que NO cambia: un crítico sale de un ajuste
    // parabólico y su quinta cifra es ruido del método. Que convivan las dos politicas en el
    // mismo cuadro es lo correcto, y esta prueba lo fija.
    const A = analizarDerivada(
      (x) => x * x - 2 * x * Math.SQRT2, (x) => 2 * x - 2 * Math.SQRT2);
    igual(lineasDerivada(A, false)[2].texto, "Punto crítico: $x = 1.4142$ (mínimo local)");
  });

  test("el PANEL recorta los ceros de relleno; el readout del crosshair los conserva", () => {
    // Dos sitios, dos necesidades. En el crosshair el número cambia mientras mueves el cursor:
    // con ancho fijo se distinguen 1.49050 y 1.48990 y la cuenta de decimales no baila. En un
    // panel el número es estático, no compite con nada, y los ceros solo estorbaban —una
    // pendiente de 0,05 se leía `0.0500000`—.
    igual(formatearLectura(0.5, "evaluado"), "0.500000", "crosshair: con relleno");
    igual(numeroALatex(0.5, "evaluado"), "0.5", "panel: sin relleno");
    igual(formatearLectura(1234.5, "evaluado"), "1234.50");
    igual(numeroALatex(1234.5, "evaluado"), "1234.5");
    igual(numeroALatex(0.00001234, "evaluado"), "1.234e-5", "también recorta la MANTISA");
  });

  test("recortar no pierde ninguna cifra significativa", () => {
    // Es la condición que hace el recorte inofensivo: los dos valores que colapsaban en `1.49`
    // siguen distinguiéndose, que era todo lo que había que conservar.
    igual(numeroALatex(1.4905, "evaluado"), "1.4905");
    igual(numeroALatex(1.4899, "evaluado"), "1.4899");
    igual(numeroALatex(2.995732273553991, "evaluado"), "2.99573", "y lo que tiene 6 cifras, las mantiene");
  });

  test("la procedencia por DEFECTO es `medido`: ningún llamador cambia sin pedirlo", () => {
    // Las seis funciones del módulo aceptan `origen` y todas lo tienen en "medido" por defecto.
    // Es lo que hace que este cambio no moviera ni una línea de los demás paneles.
    igual(numeroALatex(2.99888123), numeroALatex(2.99888123, "medido"));
    igual(puntoALatex(1.00004, 2.99888123), "\\left(1,\\ 2.9989\\right)");
    igual(listaALatex([2.99888123, 1.5707963]), "2.9989,\\ \\frac{\\pi}{2}");
    igual(intervaloALatex(2.99888123, 4), "\\left(2.9989,\\ 4\\right)");
  });
});
