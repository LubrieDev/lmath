// ─────────────────────────────────────────────
// normal · Las LEYES de la forma canónica (E2)
// ─────────────────────────────────────────────
//
// Normalizar es la operación de la que depende todo lo que venga después, así que lo que se
// prueba aquí son leyes, no ejemplos:
//
//   1. IDEMPOTENCIA. Sin ella, «forma canónica» no significa nada.
//   2. CONSERVA EL VALOR. Comprobado contra el evaluador REAL del plugin, no contra otra
//      implementación mía: si las dos estuvieran mal de la misma manera, coincidirían igual.
//   3. CONSERVA EL DOMINIO. Es la mitad que el motor actual comprueba a posteriori con una
//      muestra, y la razón por la que aquí se prueba en los puntos que de verdad importan (los
//      ceros de los denominadores), no en puntos anodinos.
//   4. CANONIZA DE VERDAD. Dos escrituras de la misma cosa acaban en la MISMA estructura.

import { describe, test, assert, igual } from "../runner";
import { parse } from "mathjs";

import {
  type Expresion, aplicacion, constante, entero, esExacta, literal, opuesto,
  potencia, producto, simbolo, suma, cociente, resta,
} from "../../src/CAS/nucleo/expresion";
import { desdeTexto, numFlotante, textoN } from "../../src/CAS/nucleo/numero";
import { iguales } from "../../src/CAS/nucleo/igualdad";
import { normalizar } from "../../src/CAS/normal/canonica";
import { siempreDefinida } from "../../src/CAS/dominio/definicion";
import { aMathjs, deMathjs } from "../../src/CAS/puente/mathjs";
import { type Nodo } from "../../src/expr/nodo";
import { compilarExpresion } from "../../src/evaluador";
import { normalizarEntrada } from "../../src/parser";
import { insertarProductoImplicito } from "../../src/core/parsing/productoImplicito";
import { ECUACIONES, EXPRESIONES } from "../oro/corpus";

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────

const leer = (s: string): Expresion | null => {
  try { return deMathjs(parse(insertarProductoImplicito(normalizarEntrada(s))) as unknown as Nodo); }
  catch { return null; }
};

const texto = (e: Expresion): string => {
  const n = aMathjs(e);
  return n === null ? `<${e.clase}>` : n.toString();
};

/** Evalúa una expresión con el evaluador REAL del plugin, pasando por el puente. */
function evaluar(e: Expresion, scope: Record<string, number>): number {
  const n = aMathjs(e);
  if (n === null) return NaN;
  try {
    const v = compilarExpresion(n.toString())(scope);
    return typeof v === "number" ? v : NaN;
  } catch { return NaN; }
}

/** Puntos de prueba: anodinos, más los enteros pequeños donde viven los ceros y los polos —que
 *  es justo donde una normalización descuidada cambia el dominio sin que nadie la vea—. */
const PUNTOS = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, -7.3, -1.2, 0.4, 2.7, 5.8];

/** ¿Coinciden dos expresiones en un punto, incluida su NO definición? */
function coinciden(a: Expresion, b: Expresion, scope: Record<string, number>): boolean {
  const va = evaluar(a, scope), vb = evaluar(b, scope);
  const fa = Number.isFinite(va), fb = Number.isFinite(vb);
  if (fa !== fb) return false;
  if (!fa) return true;
  return Math.abs(va - vb) <= 1e-9 * (1 + Math.abs(va));
}

// Generador reproducible, con el mismo motor que `nucleo.test.ts`.
function crearRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOJAS: Expresion[] = [
  entero(0), entero(1), entero(-1), entero(2), entero(3), entero(-2),
  literal(desdeTexto("0.5")), simbolo("x"), simbolo("y"), constante("pi"),
];

function generar(r: () => number, prof: number): Expresion {
  if (prof <= 0 || r() < 0.35) return HOJAS[Math.floor(r() * HOJAS.length)];
  const h = (): Expresion => generar(r, prof - 1);
  switch (Math.floor(r() * 8)) {
    case 0: return suma([h(), h()]);
    case 1: return suma([h(), h(), h()]);
    case 2: return producto([h(), h()]);
    case 3: return producto([h(), h(), h()]);
    case 4: return potencia(h(), entero(Math.floor(r() * 5) - 2));
    case 5: return opuesto(h());
    case 6: return resta(h(), h());
    default: return aplicacion("sin", [h()]);
  }
}

const lote = (seed: number, n: number, prof = 4): Expresion[] => {
  const r = crearRng(seed);
  return Array.from({ length: n }, () => generar(r, prof));
};

// ─────────────────────────────────────────────
// 1 · Idempotencia
// ─────────────────────────────────────────────

describe("normal · la forma canónica es idempotente", () => {
  test("normalizar dos veces da exactamente lo mismo", () => {
    for (const e of lote(4004, 400)) {
      const una = normalizar(e);
      const dos = normalizar(una);
      assert(iguales(una, dos), `no idempotente: ${texto(e)} → ${texto(una)} → ${texto(dos)}`);
    }
  });

  test("y también sobre el corpus real", () => {
    for (const c of [...EXPRESIONES, ...ECUACIONES.flatMap((e) => e.split("="))]) {
      const e = leer(c);
      if (e === null) continue;
      const una = normalizar(e);
      assert(iguales(una, normalizar(una)), `no idempotente: ${c}`);
    }
  });
});

// ─────────────────────────────────────────────
// 2 y 3 · Valor y dominio
// ─────────────────────────────────────────────

describe("normal · normalizar conserva el valor Y el dominio", () => {
  test("sobre expresiones generadas, en puntos anodinos y en los conflictivos", () => {
    let comprobados = 0;
    for (const e of lote(5005, 250)) {
      const n = normalizar(e);
      for (const x of PUNTOS) {
        const scope = { x, y: x + 0.3 };
        assert(coinciden(e, n, scope),
          `cambia en x=${x}: ${texto(e)} → ${texto(n)} (${evaluar(e, scope)} vs ${evaluar(n, scope)})`);
        comprobados++;
      }
    }
    assert(comprobados > 3000, `pocas comprobaciones (${comprobados})`);
  });

  test("sobre el corpus real", () => {
    for (const c of [...EXPRESIONES, ...ECUACIONES.flatMap((e) => e.split("="))]) {
      const e = leer(c);
      if (e === null) continue;
      const n = normalizar(e);
      for (const x of PUNTOS) {
        const scope = { x, y: x + 0.3, t: x, k: 1 };
        assert(coinciden(e, n, scope), `«${c}» cambia en x=${x}: ${texto(e)} → ${texto(n)}`);
      }
    }
  });

  test("LA TRAMPA 1: `0 · (1/x)` NO se colapsa a 0", () => {
    const e = producto([entero(0), potencia(simbolo("x"), entero(-1))]);
    const n = normalizar(e);
    assert(!iguales(n, entero(0)),
      `se colapsó a 0 y eso inventa un valor en x=0: ${texto(n)}`);
    assert(!Number.isFinite(evaluar(n, { x: 0 })), "en x=0 no debe existir");
  });

  test("`0 · x` SÍ se colapsa a 0, porque x está definida en todas partes", () => {
    igual(texto(normalizar(producto([entero(0), simbolo("x")]))), "0", "0·x = 0");
  });

  test("LA TRAMPA 2: `1/x − 1/x` NO se colapsa a 0", () => {
    const inv = potencia(simbolo("x"), entero(-1));
    const n = normalizar(resta(inv, inv));
    assert(!iguales(n, entero(0)), `se colapsó a 0: ${texto(n)}`);
    assert(!Number.isFinite(evaluar(n, { x: 0 })), "en x=0 no debe existir");
  });

  test("`x − x` SÍ se colapsa a 0", () => {
    igual(texto(normalizar(resta(simbolo("x"), simbolo("x")))), "0", "x−x = 0");
  });

  test("LA TRAMPA 3: `x · x^(−1)` NO se colapsa a 1", () => {
    const n = normalizar(producto([simbolo("x"), potencia(simbolo("x"), entero(-1))]));
    assert(!iguales(n, entero(1)), `se colapsó a 1: ${texto(n)}`);
    assert(!Number.isFinite(evaluar(n, { x: 0 })), "en x=0 no debe existir");
  });

  test("LA TRAMPA 3 bis: `x^2 · x^(−1)` NO se colapsa a x", () => {
    // Más ancha que la anterior y bastante menos evidente: aquí el exponente total es 1, no 0, y
    // aun así el dominio cambia —el producto no existe en x=0 y la `x` sí—. La primera versión
    // del normalizador solo se guardaba del total nulo y dejaba pasar este; lo destapó el
    // autodiagnóstico del oráculo, comparando `x^2/x` con `x`.
    const n = normalizar(producto([potencia(simbolo("x"), entero(2)), potencia(simbolo("x"), entero(-1))]));
    assert(!iguales(n, simbolo("x")), `se colapsó a x: ${texto(n)}`);
    assert(!Number.isFinite(evaluar(n, { x: 0 })), "en x=0 no debe existir");
  });

  test("`x^2 · x^3` SÍ se junta: no hay ningún exponente negativo", () => {
    const n = normalizar(producto([potencia(simbolo("x"), entero(2)), potencia(simbolo("x"), entero(3))]));
    assert(iguales(n, potencia(simbolo("x"), entero(5))), `x²·x³ = x⁵, obtuve ${texto(n)}`);
  });

  test("`x^(−2) · x^(−1)` SÍ se junta: las dos formas exigen x ≠ 0", () => {
    const n = normalizar(producto([potencia(simbolo("x"), entero(-2)), potencia(simbolo("x"), entero(-1))]));
    assert(iguales(n, potencia(simbolo("x"), entero(-3))), `x⁻²·x⁻¹ = x⁻³, obtuve ${texto(n)}`);
  });

  test("`pi · pi^(−1)` SÍ se colapsa a 1: π no es cero", () => {
    const n = normalizar(producto([constante("pi"), potencia(constante("pi"), entero(-1))]));
    igual(texto(n), "1", "π/π = 1 sin discusión");
  });

  test("`siempreDefinida` no se pasa de optimista", () => {
    assert(siempreDefinida(suma([simbolo("x"), entero(1)])), "un polinomio sí");
    assert(siempreDefinida(potencia(simbolo("x"), entero(3))), "una potencia entera positiva sí");
    assert(!siempreDefinida(potencia(simbolo("x"), entero(-1))), "1/x no");
    assert(!siempreDefinida(aplicacion("sqrt", [simbolo("x")])), "√x no");
    assert(!siempreDefinida(aplicacion("tan", [simbolo("x")])), "tan x tampoco: no declara sus polos");
    assert(siempreDefinida(aplicacion("sin", [simbolo("x")])), "sin x sí");
  });
});

// ─────────────────────────────────────────────
// 4 · Canoniza de verdad
// ─────────────────────────────────────────────

describe("normal · dos escrituras de lo mismo dan la MISMA estructura", () => {
  const mismaForma = (a: string, b: string, msg: string): void => {
    const ea = leer(a), eb = leer(b);
    assert(ea !== null && eb !== null, `no se leen: ${a} / ${b}`);
    const na = normalizar(ea as Expresion), nb = normalizar(eb as Expresion);
    assert(iguales(na, nb), `${msg}: ${texto(na)} ≠ ${texto(nb)}`);
  };

  test("la conmutatividad deja de existir", () => {
    mismaForma("x + y", "y + x", "suma conmutativa");
    mismaForma("x * y", "y * x", "producto conmutativo");
    mismaForma("2 + x + 3", "x + 5", "constantes plegadas");
  });

  test("la asociatividad deja de existir", () => {
    mismaForma("(x + y) + t", "x + (y + t)", "suma asociativa");
    mismaForma("(x * y) * t", "x * (y * t)", "producto asociativo");
  });

  test("los términos semejantes se juntan", () => {
    mismaForma("2*x + 3*x", "5*x", "2x+3x = 5x");
    mismaForma("x + x", "2*x", "x+x = 2x");
    mismaForma("x - x + y", "y", "se cancelan (x está definida en todas partes)");
  });

  test("los factores semejantes se juntan", () => {
    mismaForma("x * x", "x^2", "x·x = x²");
    mismaForma("x^2 * x^3", "x^5", "suma de exponentes");
  });

  test("los números se pliegan en aritmética EXACTA", () => {
    const n = normalizar(leer("1/2 + 1/3") as Expresion);
    igual(texto(n), "5 / 6", "un medio más un tercio es cinco sextos, no 0.8333…");
    assert(esExacta(n), "y sigue siendo exacto");
  });

  test("una potencia numérica se pliega exacta", () => {
    igual(texto(normalizar(leer("2^10") as Expresion)), "1024", "2^10");
    igual(texto(normalizar(leer("(1/2)^(-2)") as Expresion)), "4", "(1/2)^(−2)");
  });

  test("el coeficiente queda DELANTE sin que nadie lo pida", () => {
    // Es lo que hoy hace a mano `coeficientesAlFrente`; aquí sale del orden total.
    igual(texto(normalizar(leer("x * 7") as Expresion)), "7 * x", "el número primero");
    igual(texto(normalizar(leer("x * pi") as Expresion)), "pi * x", "la constante antes que la variable");
  });

  test("el ± cuyas dos ramas coinciden deja de ser un ±", () => {
    const e = leer("pm(0)");
    assert(e !== null, "se lee");
    igual(texto(normalizar(e as Expresion)), "0", "±0 es una sola curva");
  });

  test("NO expande: eso es otra transformación, con su propio nombre", () => {
    const n = normalizar(leer("(x + 1) * (x + 2)") as Expresion);
    assert(texto(n).includes("("), `no debería haber expandido: ${texto(n)}`);
  });

  test("NO cancela una fracción: eso necesita una condición", () => {
    const n = normalizar(leer("(x^2 - 1)/(x - 1)") as Expresion);
    assert(!iguales(n, normalizar(leer("x + 1") as Expresion)),
      "cancelar cambiaría el dominio en x=1");
  });
});

// ─────────────────────────────────────────────
// 5 · La exactitud sobrevive a la normalización
// ─────────────────────────────────────────────

describe("normal · la exactitud sobrevive", () => {
  test("una expresión exacta sigue siendo exacta después de normalizar", () => {
    for (const e of lote(6006, 200)) {
      if (!esExacta(e)) continue;
      assert(esExacta(normalizar(e)), `perdió exactitud: ${texto(e)} → ${texto(normalizar(e))}`);
    }
  });

  test("un flotante contamina y se nota", () => {
    const e = suma([literal(numFlotante(0.1)), entero(1)]);
    const n = normalizar(e);
    assert(!esExacta(n), "sumar un flotante da un flotante, y se dice");
  });

  test("normalizar NO decimaliza un racional", () => {
    const n = normalizar(cociente(entero(1), entero(3)));
    igual(texto(n), "1 / 3", "un tercio se queda en un tercio");
    assert(esExacta(n), "y exacto");
  });
});
