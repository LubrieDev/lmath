// ─────────────────────────────────────────────
// lector · El lector propio: de la notación escrita a `Expresion`
// ─────────────────────────────────────────────
//
// El lector de E4 (`src/CAS/io/leer/`) sustituye al camino histórico
//
//     texto → 49 regex → cadena mathjs → parse → árbol de mathjs → deMathjs → Expresion
//
// por un tokenizador y un analizador de precedencias que producen la `Expresion` directamente.
//
// ── Lo que de verdad se defiende aquí ────────────────────────────────────────────────────
// No es que el lector nuevo funcione: es que lee **lo mismo** que el de siempre. Cambiar quién
// lee las notas de la gente es de las cosas más arriesgadas que se pueden hacer en este plugin
// —una nota que dibujaba una curva pasaría a dibujar otra, en silencio, en el vault de alguien—.
//
// Por eso el grueso de este archivo no son aserciones escritas a mano sino una comparación
// DIFERENCIAL: para cada caso del corpus se lee por los dos caminos y se exige que las dos
// expresiones sean la misma tras normalizar. Es el mismo método con el que se validó el puente
// en E1 y el compilador nativo en su día.
//
// ── Estado ───────────────────────────────────────────────────────────────────────────────
// El lector NO está en producción. Sigue leyendo el de siempre. Estas pruebas son la condición
// para cambiarlo, no el permiso: mientras quede una divergencia conocida (ver el archivo de
// progreso), el cambio no se hace.

import { describe, test, assert, igual } from "../runner";
import { leerExpresionLatex } from "../../src/CAS/io/leer/latex";
import { leerExpresion } from "../../src/CAS/puente/lectura";
import { normalizar } from "../../src/CAS/normal/canonica";
import { iguales } from "../../src/CAS/nucleo/igualdad";
import { type Expresion } from "../../src/CAS/nucleo/expresion";
import { ECUACIONES, EXPRESIONES } from "../oro/corpus";

/** Texto canónico y corto de una expresión, para que un fallo se pueda leer. */
function texto(e: Expresion | null): string {
  if (e === null) return "∅";
  switch (e.clase) {
    case "literal": return e.numero.clase === "racional"
      ? (e.numero.valor.d === 1n ? String(e.numero.valor.n)
        : `${e.numero.valor.n}/${e.numero.valor.d}`)
      : String(e.numero.valor);
    case "simbolo": return e.nombre;
    case "constante": return e.nombre;
    case "potencia": return `${texto(e.base)}^${texto(e.exponente)}`;
    case "producto": return `(${e.factores.map(texto).join("·")})`;
    case "suma": return `(${e.sumandos.map(texto).join("+")})`;
    case "aplicacion": return `${e.funcion}(${e.args.map(texto).join(",")})`;
    case "rama": return `±[${e.alternativas.map(texto).join("|")}]`;
    case "condicionado": return `dom(${texto(e.cuerpo)})`;
    case "familia": return `fam(${e.parametro}·${texto(e.paso)})`;
  }
}

/** ¿Los dos caminos leen lo mismo? Se comparan tras NORMALIZAR: lo que importa es que
 *  signifiquen lo mismo, no que el árbol salga con los factores en el mismo orden. */
function leenIgual(entrada: string): { ok: boolean; viejo: string; nuevo: string } {
  let viejo: Expresion | null = null;
  let nuevo: Expresion | null = null;
  try { viejo = leerExpresion(entrada); } catch { viejo = null; }
  try { nuevo = leerExpresionLatex(entrada); } catch { nuevo = null; }
  const detalle = { viejo: texto(viejo), nuevo: texto(nuevo) };
  if (viejo === null || nuevo === null) return { ok: false, ...detalle };
  try { return { ok: iguales(normalizar(viejo), normalizar(nuevo)), ...detalle }; }
  catch { return { ok: false, ...detalle }; }
}

// ─────────────────────────────────────────────
// 1 · La gramática, caso a caso
// ─────────────────────────────────────────────

describe("lector · la gramática", () => {
  const leer = (s: string): string => texto(leerExpresionLatex(s));

  test("números y símbolos", () => {
    igual(leer("42"), "42");
    igual(leer("1.5"), "3/2", "un decimal escrito ES un racional exacto");
    igual(leer("x"), "x");
    igual(leer("pi"), "pi", "π es una CONSTANTE, no un símbolo llamado pi");
  });

  test("el producto implícito lo decide el analizador, no un paso aparte", () => {
    igual(leer("2x"), "(2·x)");
    igual(leer("xy"), "(x·y)");
    igual(leer("abc"), "(a·b·c)");
    igual(leer("2pi"), "(2·pi)");
  });

  test("precedencias: la potencia antes que el producto, y este antes que la suma", () => {
    igual(leer("1+2*3"), "(1+(2·3))");
    igual(leer("2*3^2"), "(2·3^2)");
    igual(leer("-x^2"), "(-1·x^2)", "el menos unario NO se lleva el exponente");
  });

  test("la potencia asocia por la derecha y admite signo en el exponente", () => {
    igual(leer("2^3^2"), "2^3^2");
    igual(leer("2^{-1}"), "2^(-1·1)");
  });

  test("no hay resta, ni división, ni menos unario: son azúcar", () => {
    // El árbol no los tiene como nodos. `a−b` es una suma con un factor −1 y `a/b` un producto
    // por una potencia de exponente −1: es lo que hace que asociatividad y conmutatividad sean
    // gratis en la forma canónica.
    igual(leer("a-b"), "(a+(-1·b))");
    igual(leer("a/b"), "(a·b^-1)");
  });

  test("las funciones salen del CATÁLOGO, no de una lista paralela", () => {
    igual(leer("sin(x)"), "sin(x)");
    igual(leer("sin x"), "sin(x)", "sin paréntesis toma el factor siguiente");
    igual(leer("nthRoot(x, 3)"), "nthRoot(x,3)", "varios argumentos");
  });

  test("un nombre que no está en el catálogo es un símbolo, no una función", () => {
    igual(leer("zw"), "(z·w)");
  });

  test("el valor absoluto con barras", () => {
    igual(leer("|x|"), "abs(x)");
    igual(leer("|x+1|"), "abs((x+1))");
  });

  test("el doble signo es una RAMA, no un centinela", () => {
    igual(leer("pm(x)"), "±[x|(-1·x)]");
    igual(leer("mp(x)"), "±[(-1·x)|x]", "mp es el mismo constructor con las alternativas al revés");
  });

  test("el grado es un operador POSPUESTO, no un adorno que se descarta", () => {
    igual(leer("30°"), "(30·pi·180^-1)", "30° es 30·π/180");
    igual(leer("x^2°"), "(x^2·pi·180^-1)", "el grado califica a la potencia YA formada");
    igual(leer("2°x"), "(2·pi·180^-1·x)", "y después sigue habiendo producto implícito");
  });

  test("el argumento numérico desnudo de una trigonométrica DIRECTA está en grados", () => {
    igual(leer("sin(45)"), "sin((45·pi·180^-1))");
    igual(leer("cos(30)+1"), "(cos((30·pi·180^-1))+1)");
    // Un símbolo o una constante dentro basta para que no se toque.
    igual(leer("sin(x)"), "sin(x)");
    igual(leer("sin(pi)"), "sin(pi)");
    // Y la frontera de la regla: ni inversas ni hiperbólicas.
    igual(leer("asin(1)"), "asin(1)", "el argumento de una inversa no es un ángulo");
    igual(leer("sinh(30)"), "sinh(30)", "sinh(30) es 30, no 30°");
  });

  test("un exponente fraccionario de denominador impar es la raíz REAL, no una potencia", () => {
    // No es cosmética: `x^(1/3)` como potencia es NaN en todo x<0, y la raíz cúbica real vale
    // −2 en x=−8. Son funciones distintas y la que se quiere es la segunda.
    igual(leer("x^{1/3}"), "nthRoot(x,3)");
    igual(leer("x^{2/3}"), "nthRoot(x^2,3)");
    igual(leer("x^{1/4}"), "nthRoot(x,4)");
    // Denominador 2 NO: ahí potencia y raíz ya son la misma función, y unificarlas es del
    // normalizador. El lector no decide dos veces lo mismo.
    igual(leer("x^{1/2}"), "x^(1·2^-1)");
    // Exponente negativo: se queda como potencia, igual que en el motor de hoy.
    igual(leer("x^{-1/3}"), "x^(-1·1·3^-1)");
  });

  test("lo que no se puede leer devuelve null, no una expresión inventada", () => {
    igual(leerExpresionLatex(""), null);
    igual(leerExpresionLatex("("), null, "un paréntesis sin cerrar no se completa a la brava");
  });
});

// ─────────────────────────────────────────────
// 2 · LaTeX real
// ─────────────────────────────────────────────
//
// Entradas con la forma en que de verdad se escriben en una nota. Cada una está comprobada
// contra el lector histórico, no contra lo que a mí me parezca que debería salir.

const LATEX_REAL: readonly string[] = [
  "\\frac{1}{2}",
  "\\frac{x+1}{x-1}",
  "\\sqrt{x}",
  "\\sqrt[3]{x}",
  "x^{2}",
  "e^{2x}",
  "\\sin x",
  "\\sin(x+1)",
  "\\cos^{2}x",
  "\\sin^{-1}(x)",
  "\\arcsin x",
  "\\operatorname{arccot}(x)",
  "\\operatorname{sech}(x)",
  "\\ln x",
  "\\left(x+1\\right)^{2}",
  "\\alpha x",
  "2\\pi x",
  "\\pm\\sqrt{x}",
  "\\frac{\\sqrt{x}}{2}",
  "x^{2}+y^{2}",
  "\\tanh(x)",
  "\\lfloor x\\rfloor",
  "3\\sqrt{x}",
  "\\frac{1}{2}x",
  "x\\cdot y",
];

describe("lector · LaTeX real, comparado con el lector histórico", () => {
  for (const s of LATEX_REAL) {
    test(`«${s}»`, () => {
      const r = leenIgual(s);
      assert(r.ok, `viejo ${r.viejo} · nuevo ${r.nuevo}`);
    });
  }
});

// ─────────────────────────────────────────────
// 2b · El banco curado
// ─────────────────────────────────────────────
//
// El corpus viene del motor: son ecuaciones de despeje, y por eso no toca notaciones que sí
// aparecen en una nota cualquiera. Hubo un segundo banco RASPADO de las pruebas del parser que
// no sirvió —el raspado mete la prosa de los nombres de prueba y medía falsos positivos—, así
// que este está escrito a mano, caso por caso, alrededor de lo que el corpus deja fuera:
// grados, barras y exponentes fraccionarios.
//
// Es el banco que destapó que el lector nuevo se comía el símbolo de grado y leía `\sin(90°)`
// como el seno de 90 RADIANES, y que `sin(45)` son 45 GRADOS en este motor desde siempre.

const BANCO_CURADO: readonly string[] = [
  // Grados escritos con el símbolo y con el comando.
  "30\u00b0", "\\sin(90\u00b0)", "\\sin(90\\degree)", "\\tan(45\\deg)",
  "\\cos(60\u00b0)+1", "x^2\u00b0", "2\u00b0x", "\\sin(2x)\u00b0",
  // El argumento numérico DESNUDO de una trigonométrica directa: grados.
  "\\sin(45)", "sin(45)", "\\cos(30)", "\\tan(0.5)", "\\sin(2)", "\\sin(-45)",
  "2\\sin(30)", "\\sin(1/2)", "\\sin(\\frac{45}{2})", "\\cot(45)", "\\sec(60)", "\\csc(30)",
  // Y las que NO lo son: con símbolo dentro, inversas e hiperbólicas.
  "\\sin(pi)", "\\sin(x)", "\\sin(2x)", "\\arcsin(0.5)", "\\sinh(2)",
  // Barras: sueltas, seguidas y consecutivas.
  "|x|", "|x+1|", "|-x|", "2|x|", "a|b|c", "|x|+|y|", "|x||y|",
  "\\left|x\\right|", "|x^2-1|",
  // Raíces y exponentes fraccionarios.
  "\\sqrt{x}", "\\sqrt[3]{x}", "\\sqrt[4]{x}", "x^{1/2}", "x^{1/3}", "x^{1/4}",
  "x^{2/3}", "x^{3/2}", "x^{0.5}", "x^{-1/2}", "x^{-1/3}", "2^{1/2}", "4^{1/2}",
  "(x+1)^{1/2}", "(x+1)^{1/3}", "\\sqrt{x}+x^{1/2}", "\\sqrt{x^2}",
  "x^{1/2}\\cdot x^{1/2}", "|y|^{1/2}", "x^{2}", "x^{-1}", "x^{1}",
  // Lo que ya se leía igual, para que siga.
  "\\frac{1}{2}", "\\frac{x+1}{x-1}", "e^{2x}", "\\sin x", "\\cos^{2}x", "\\sin^{-1}(x)",
  "\\operatorname{arccot}(x)", "\\ln x", "\\left(x+1\\right)^{2}", "\\alpha x", "2\\pi x",
  "\\pm\\sqrt{x}", "\\lfloor x\\rfloor", "x\\cdot y", "\\log_2 8", "\\tanh(x)",
  "nthRoot(x, 3)", "\\log(x)", "abs(x)", "3\\sqrt{x}",
];

describe("lector · el banco curado, comparado con el lector histórico", () => {
  test(`los ${BANCO_CURADO.length} casos escritos a mano se leen igual`, () => {
    const fallos: string[] = [];
    for (const c of BANCO_CURADO) {
      const r = leenIgual(c);
      if (!r.ok) fallos.push(`«${c}»  viejo ${r.viejo}  ·  nuevo ${r.nuevo}`);
    }
    assert(fallos.length === 0, `${fallos.length} divergencias:\n      ` + fallos.join("\n      "));
  });
});

// ─────────────────────────────────────────────
// 3 · La comparación diferencial sobre TODO el corpus
// ─────────────────────────────────────────────

/**
 * Las divergencias que quedan, DECLARADAS una a una. No es una lista de excepciones para que la
 * prueba pase: la comprobación exige que el conjunto medido sea EXACTAMENTE este, así que una
 * divergencia nueva rompe la suite y una que se arregle sin quitarla de aquí, también.
 *
 * Todas son la misma: el lector histórico solo lee `x^{m/n}` como radical real cuando el
 * exponente va entre LLAVES. Con paréntesis se queda en potencia, que en los negativos es NaN,
 * de modo que hoy `x^{2/3}` dibuja la cúspide completa y `x^(2/3)` solo su mitad derecha. Son la
 * misma expresión escrita de dos maneras y el motor dibuja dos curvas distintas.
 *
 * El lector nuevo lee las dos como el radical, que es lo que significa. Es un cambio VISIBLE en
 * las notas que usaran la forma con paréntesis, y por eso no entra por la puerta de atrás: es lo
 * que queda por decidir antes de que este lector lea en producción.
 */
const DIVERGENCIAS_CONOCIDAS: readonly string[] = ["x^(2/3)"];

describe("lector · divergencia CERO sobre el corpus", () => {
  /** Cada lado de cada ecuación del corpus, más las expresiones sueltas. */
  const casos: string[] = [];
  for (const ec of ECUACIONES) for (const lado of ec.split("=")) casos.push(lado.trim());
  for (const ex of EXPRESIONES) casos.push(ex);

  test(`los ${casos.filter((c) => c !== "").length} casos se leen igual, salvo los declarados`, () => {
    const fallos: string[] = [];
    for (const c of casos) {
      if (c === "") continue;
      const r = leenIgual(c);
      if (!r.ok) fallos.push(c);
    }
    const inesperadas = fallos.filter((c) => !DIVERGENCIAS_CONOCIDAS.includes(c));
    const desaparecidas = DIVERGENCIAS_CONOCIDAS.filter((c) => !fallos.includes(c));
    assert(inesperadas.length === 0, `divergencias NUEVAS: ${inesperadas.join(", ")}`);
    assert(
      desaparecidas.length === 0,
      `ya no divergen y siguen declaradas: ${desaparecidas.join(", ")}`
    );
  });

  test("el corpus no se ha quedado vacío por un cambio de rutas", () => {
    // Sin esto, la prueba de arriba pasaría también si el corpus dejara de cargarse, y
    // estaríamos mirando un verde que no compara nada.
    assert(casos.filter((c) => c !== "").length > 200, `solo ${casos.length} casos`);
  });
});

// ─────────────────────────────────────────────
// 4 · Donde el lector nuevo NO coincide, y hace bien
// ─────────────────────────────────────────────
//
// Buscar la divergencia cero sirve para no romper nada, no para copiar los errores. Cuando la
// comparación destapa un fallo del lector histórico, se deja anotado aquí en vez de reproducirlo:
// si algún día se arregla el viejo, esta prueba lo dirá.

describe("lector · fallos del lector histórico que el nuevo no repite", () => {
  test("`\\sin^{-1}x` sin paréntesis: el viejo lo lee como un PRODUCTO", () => {
    // `normalizarEntrada` lo convierte en la cadena `asin x`, y de ahí `insertarProductoImplicito`
    // saca `asin *x`: mathjs lo parsea como el símbolo `asin` MULTIPLICADO por x, no como la
    // función aplicada. Es un fallo real y silencioso del motor de hoy —el símbolo no vale nada,
    // así que la evaluación da NaN en todo x y el plano sale vacío donde debería haber un
    // arcoseno—, y lo destapó esta comparación.
    const viejo = leerExpresion("\\sin^{-1}x");
    const nuevo = leerExpresionLatex("\\sin^{-1}x");
    igual(texto(viejo), "(asin·x)", "el viejo: producto, que es el fallo");
    igual(texto(nuevo), "asin(x)", "el nuevo: la función aplicada, que es lo correcto");
  });

  test("con paréntesis los dos aciertan, que es por lo que el fallo pasa desapercibido", () => {
    const r = leenIgual("\\sin^{-1}(x)");
    assert(r.ok, `viejo ${r.viejo} · nuevo ${r.nuevo}`);
    igual(r.nuevo, "asin(x)");
  });

  test("`x^{m/n}` es la raíz real, pero `x^(m/n)` no: la LLAVE cambia la función", () => {
    // La reescritura del lector histórico está escrita sobre el texto y exige `^{`. Con
    // paréntesis no casa, así que la misma expresión escrita de dos maneras da dos curvas:
    // `x^{2/3}` dibuja la cúspide entera y `x^(2/3)` solo su mitad derecha, porque una potencia
    // de exponente 2/3 es NaN en los negativos.
    igual(texto(leerExpresion("x^{2/3}")), "nthRoot(x^2,3)", "con llaves: la raíz real");
    igual(texto(leerExpresion("x^(2/3)")), "x^2/3", "con paréntesis: la potencia, que es otra cosa");
    // El lector nuevo lee las dos igual, que es la única lectura defendible.
    igual(texto(leerExpresionLatex("x^{2/3}")), "nthRoot(x^2,3)");
    igual(texto(leerExpresionLatex("x^(2/3)")), "nthRoot(x^2,3)");
  });

  test("`x^\\frac{2}{3}` sin llaves: el viejo lee (x²)/3, que no es lo que pone", () => {
    // `\frac{2}{3}` se convierte en el texto `(2)/(3)` ANTES de mirar el exponente, y entonces
    // `x^(2)/(3)` se asocia como `(x^2)/3`. No es una lectura discutible: es otra expresión.
    igual(texto(leerExpresion("x^\\frac{2}{3}")), "(x^2·3^-1)", "el viejo: x²/3");
    igual(texto(leerExpresionLatex("x^\\frac{2}{3}")), "nthRoot(x^2,3)", "el nuevo: la raíz");
  });
});
