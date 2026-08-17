// ─────────────────────────────────────────────
// tests · Dominio: qué necesita una expresión para existir, y qué transformaciones lo respetan
// ─────────────────────────────────────────────
//
// El guardián de fidelidad decide si una transformación se adopta. Antes preguntaba solo por los
// VALORES sobre una muestra anodina, y eso le dejaba un punto ciego con forma exacta: un dominio
// que cambia en un solo PUNTO. Estas pruebas fijan las dos mitades del arreglo —leer las
// condiciones del árbol y saber dónde mirar— y, sobre todo, el comportamiento observable: qué
// simplificaciones se hacen y cuáles NO.

import { describe, test, assert, igual } from "../runner";
import {
  restriccionesDe, puntosDeQuiebre, fueraDeDominio, mismaFuncion, variablesLibresDe,
} from "../../src/math/dominio";
import { simplificarEcuaciones } from "../../src/simplificar";

/** Las condiciones como texto ordenado y comparable: `noCero:x`. */
const conds = (e: string): string =>
  (restriccionesDe(e) ?? []).map((r) => `${r.tipo}:${r.expr}`).sort().join(" | ");

/** El lado derecho de la única ecuación simplificada. */
const simp = (e: string): string => simplificarEcuaciones([`y = ${e}`])[0].replace(/^y = /, "");

describe("dominio · las condiciones se leen del ÁRBOL", () => {
  test("cada constructor aporta la condición que le toca", () => {
    igual(conds("1/x"), "noCero:x");
    igual(conds("sqrt(x)"), "noNegativo:x");
    igual(conds("log(x, e)"), "positivo:x");
    igual(conds("asin(x)"), "acotado:x");
    igual(conds("x^(-2)"), "noCero:x");
    // Una raíz de índice PAR condiciona; una de índice impar existe en todo ℝ.
    igual(conds("nthRoot(x, 4)"), "noNegativo:x");
    igual(conds("nthRoot(x, 3)"), "");
    // Un exponente racional de denominador par ES una raíz par disfrazada.
    igual(conds("x^(1/2)"), "noNegativo:x");
    igual(conds("x^(3/4)"), "noNegativo:x");
    igual(conds("x^(1/3)"), "");
  });

  test("se acumulan por todo el árbol, y sin duplicados", () => {
    igual(conds("sqrt(x - 1)/(x - 2)"), "noCero:x - 2 | noNegativo:x - 1");
    igual(conds("1/x + 1/x"), "noCero:x", "la misma condición dos veces es una");
    igual(conds("sqrt(sqrt(x))"), "noNegativo:sqrt(x) | noNegativo:x", "también las anidadas");
  });

  test("un polinomio no necesita nada, y una condición sin variables no es condición", () => {
    igual(conds("x^2 + 1"), "");
    igual(conds("2*x - 7"), "");
    // El `2` del exponente `1/2` es un denominador del árbol, pero `2 ≠ 0` no condiciona nada.
    assert(!conds("x^(1/2)").includes("noCero"), "una condición constante no se guarda");
  });

  test("las variables libres excluyen los nombres de función y las constantes", () => {
    igual(variablesLibresDe("sqrt(x) + pi").sort().join(","), "x");
    igual(variablesLibresDe("x*y - e").sort().join(","), "x,y");
    igual(variablesLibresDe("log(2, e)").join(","), "");
  });
});

describe("dominio · estar fuera del dominio es una pregunta SEMÁNTICA", () => {
  test("no se responde con el número que salga de evaluar", () => {
    // `1/0` vale `Infinity` en coma flotante, así que preguntarle al número no sirve: hay que
    // preguntarle a la condición. De aquí depende que `(1/x)^(-1) → x` se rechace.
    igual(fueraDeDominio("1/x", { x: 0 }), true);
    igual(fueraDeDominio("(1/x)^(-1)", { x: 0 }), true);
    igual(fueraDeDominio("x", { x: 0 }), false);
    igual(fueraDeDominio("1/x", { x: 2 }), false);
  });

  test("cada tipo de condición se comprueba donde le corresponde", () => {
    igual(fueraDeDominio("sqrt(x)", { x: -1 }), true);
    igual(fueraDeDominio("sqrt(x)", { x: 0 }), false, "el borde SÍ entra en una raíz par");
    igual(fueraDeDominio("log(x, e)", { x: 0 }), true, "el borde NO entra en un logaritmo");
    igual(fueraDeDominio("asin(x)", { x: 2 }), true);
    igual(fueraDeDominio("asin(x)", { x: 1 }), false);
  });
});

describe("dominio · los puntos de quiebre son donde hay que mirar", () => {
  const quiebre = (e: string) => puntosDeQuiebre(e, "x").slice().sort((a, b) => a - b);

  test("salen EXACTOS cuando la condición es polinómica", () => {
    // Exactos y no aproximados: el agujero solo se ve pisándolo. Evaluar `x²/x` en 1e-13 da
    // 1e-13, un número perfectamente finito que no delata nada.
    igual(quiebre("1/x").join(","), "0");
    igual(quiebre("1/(x - 1)").join(","), "1");
    igual(quiebre("1/(x^2 - 4)").join(","), "-2,2");
    igual(quiebre("sqrt(x - 3)").join(","), "3");
    igual(quiebre("log(x - 2, e)").join(","), "2");
  });

  test("un arco acotado quiebra en |u| = 1, no en u = 0", () => {
    igual(quiebre("asin(x/2)").join(","), "-2,2");
  });

  test("sin condiciones no hay puntos, y una condición que no se anula tampoco los da", () => {
    igual(quiebre("x^2 + 1").length, 0);
    igual(quiebre("1/(x^2 + 1)").length, 0, "el denominador no tiene ceros reales");
  });

  test("una condición periódica tiene infinitos ceros: se acotan", () => {
    const p = quiebre("1/sin(x)");
    assert(p.length > 0 && p.length <= 12, `debe dar algunos y no todos: ${p.length}`);
    assert(p.some((v) => Math.abs(v) < 1e-9), "el 0 tiene que estar entre ellos");
    assert(p.some((v) => Math.abs(Math.abs(v) - Math.PI) < 1e-6), "y ±π también");
  });

  test("una condición en DOS variables no define puntos, y no se inventan", () => {
    igual(puntosDeQuiebre("1/(x*y)", "x").length, 0);
  });
});

describe("dominio · el guardián acepta lo válido y rechaza lo que cambia el dominio", () => {
  test("rechaza rellenar un agujero, aunque los números coincidan", () => {
    assert(!mismaFuncion("x", "x^2/x"), "x²/x no está definida en 0 y x sí");
    assert(!mismaFuncion("1", "x/x"), "x/x no está definida en 0");
    assert(!mismaFuncion("x", "(1/x)^(-1)"), "en coma flotante coinciden; en ℝ no");
    assert(!mismaFuncion("x + 1", "(x^2 - 1)/(x - 1)"), "difieren en x=1");
  });

  test("acepta lo que conserva el dominio exacto", () => {
    assert(mismaFuncion("1/x", "x/x^2"), "las dos exigen x ≠ 0");
    assert(mismaFuncion("2*x", "x + x"), "dos formas del mismo polinomio");
    assert(mismaFuncion("abs(x)", "sqrt(x^2)"), "las dos están definidas en todo ℝ");
    assert(mismaFuncion("x^2", "abs(x)^2"), "el cuadrado borra el módulo");
  });

  test("sigue viendo el error grande (un intervalo entero de diferencia)", () => {
    assert(!mismaFuncion("x", "sqrt(x)^2"), "√x² no existe para x<0");
    assert(!mismaFuncion("x", "sqrt(x^2)"), "√(x²) es |x|, que difiere en todo x<0");
  });
});

describe("dominio · lo que el simplificador hace y deja de hacer", () => {
  test("NO cancela un factor que se anula: el agujero se queda", () => {
    // Es el error clásico de un CAS que trata el álgebra como manipulación de cadenas. Las
    // cuatro se hacían antes de que el guardián supiera dónde mirar.
    igual(simp("x^2/x"), "x^2/x");
    igual(simp("x^3/x"), "x^3/x");
    igual(simp("x^2/x^2"), "x^2/x^2");
    igual(simp("sin(x)*x/x"), "sin(x)*x/x");
    igual(simp("(1/x)^(-1)"), "(1/x)^(-1)");
    igual(simp("(x^2 - 1)/(x - 1)"), "(x ^ 2 - 1) / (x - 1)");
  });

  test("SÍ simplifica cuando el dominio no se toca", () => {
    igual(simp("x/x^2"), "1 / x", "las dos exigen x ≠ 0");
    igual(simp("(2*x^2)/(4*x)"), "x ^ 2 / (2 * x)", "reduce el coeficiente y conserva el hueco");
    igual(simp("x + x"), "2 * x");
    igual(simp("(x + 1)^2"), "x ^ 2 + 2 * x + 1");
  });

  test("la raíz par de un cuadrado es el MÓDULO, y ahora se escribe", () => {
    // `√(x²) = x` es falso para x<0; `√(x²) = |x|` es cierto en todo ℝ. Antes no se reducía
    // nada —correcto pero a medias—; ahora se reduce a la forma que sí vale siempre.
    igual(simp("sqrt(x^2)"), "abs(x)");
    igual(simp("nthRoot(x^2, 2)"), "abs(x)");
    igual(simp("sqrt(abs(x)^2)"), "abs(x)");
  });

  test("elevar un módulo al cuadrado lo borra", () => {
    igual(simp("abs(x)^2"), "x ^ 2");
    igual(simp("abs(x)*abs(x)"), "x ^ 2");
    igual(simp("abs(-x)"), "abs(x)");
  });

  test("NO REGRESIÓN: lo que ya era correcto sigue igual", () => {
    igual(simp("ln(e^x)"), "x", "válida en todo ℝ");
    igual(simp("e^(ln(x))"), "e ^ log(x, e)", "solo vale para x>0: no se aplica");
    igual(simp("sin(x)^2 + cos(x)^2"), "1");
    igual(simp("asin(sin(x))"), "asin(sin(x))", "falsa fuera de [−π/2, π/2]");
    igual(simp("sqrt(x)*sqrt(x - 1)"), "sqrt(x) * sqrt(x - 1)", "juntarlas ampliaría el dominio");
  });
});
