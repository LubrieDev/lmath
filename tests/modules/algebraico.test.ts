// ─────────────────────────────────────────────
// algebraico · Números exactos de cualquier grado, y el CAMINO DE VUELTA (E3)
// ─────────────────────────────────────────────
//
// La etapa que cierra la fuga que motivaba la reforma entera: hasta ahora un resultado exacto no
// podía volver a ser una expresión, y todo lo que no cupiera en `a + b√d` salía como decimal.
//
//     antes:   x³ = 2  →  x = 1.2599210498948732
//     ahora:   x³ = 2  →  x = ∛2
//
// Lo que se prueba aquí, por orden de importancia:
//
//   1. La ARITMÉTICA es exacta y sus resultados están bien formados (el intervalo aísla de
//      verdad UNA raíz; si no, todo lo demás sería una casualidad).
//   2. La IGUALDAD decide, sin tolerancias: `√2·√3 = √6` sale `true` por Sturm, no por comparar
//      decimales que casualmente coinciden.
//   3. El ORDEN es total.
//   4. La FORMA CERRADA reconoce lo que se puede escribir y ADMITE lo que no.
//   5. Nada de esto pasa por coma flotante salvo cuando se pide explícitamente.

import { describe, test, assert, igual } from "../runner";

import {
  type Algebraico, aproximarA, bienFormado, comoRadical, compararA, desdeRacional,
  igualesA, negadoA, productoA, raicesAlgebraicas, signoA, sumaA,
} from "../../src/CAS/numeros/algebraico";
import { formaCerrada, tieneFormaCerrada } from "../../src/CAS/numeros/forma";
import { raicesExactas } from "../../src/CAS/resolver/exactas";
import { leerComoCero } from "../../src/CAS/puente/lectura";
import { type Expresion, esExacta } from "../../src/CAS/nucleo/expresion";
import { esExacto, numAlgebraico, productoN, sumaN, textoN } from "../../src/CAS/nucleo/numero";
import { normalizar } from "../../src/CAS/normal/canonica";
import { aMathjs } from "../../src/CAS/puente/mathjs";
import { type Polinomio } from "../../src/math/polinomio";
import { rac } from "../../src/math/racional";

/** Un polinomio de coeficientes enteros, del término independiente hacia arriba. */
const P = (...c: number[]): Polinomio => c.map((n) => rac(BigInt(n)));

const texto = (e: Expresion): string => {
  const n = aMathjs(e);
  return n === null ? "«sin forma expresable»" : n.toString();
};

/** La raíz positiva de `x² − n`. */
const raizDe = (n: number): Algebraico => {
  const rs = raicesAlgebraicas(P(-n, 0, 1));
  return rs[rs.length - 1];
};

const CBRT2 = raicesAlgebraicas(P(-2, 0, 0, 1))[0];
const AUREO = raicesAlgebraicas(P(-1, -1, 1))[1];

// ─────────────────────────────────────────────
// 1 · Construcción y aritmética
// ─────────────────────────────────────────────

describe("algebraico · la aritmética es exacta y está bien formada", () => {
  test("∛2 es la raíz de x³−2, y vale lo que tiene que valer", () => {
    assert(bienFormado(CBRT2), "el intervalo debe aislar UNA raíz");
    assert(Math.abs(aproximarA(CBRT2) - Math.cbrt(2)) < 1e-12, "valor");
  });

  test("una suma de algebraicos sigue siendo un algebraico bien formado", () => {
    const s = sumaA(raizDe(2), raizDe(3));
    assert(s !== null, "√2+√3 se puede calcular");
    assert(bienFormado(s as Algebraico), "y el resultado aísla una sola raíz");
    assert(Math.abs(aproximarA(s as Algebraico) - (Math.SQRT2 + Math.sqrt(3))) < 1e-12, "valor");
  });

  test("un producto de algebraicos también", () => {
    const p = productoA(raizDe(2), raizDe(3));
    assert(p !== null, "√2·√3 se puede calcular");
    assert(bienFormado(p as Algebraico), "bien formado");
    assert(Math.abs(aproximarA(p as Algebraico) - Math.sqrt(6)) < 1e-12, "valor");
  });

  test("el opuesto no necesita resultantes", () => {
    const n = negadoA(raizDe(2));
    assert(bienFormado(n), "bien formado");
    assert(Math.abs(aproximarA(n) + Math.SQRT2) < 1e-12, "−√2");
  });

  test("el signo se decide sin decimales", () => {
    igual(signoA(raizDe(2)), 1, "√2 > 0");
    igual(signoA(negadoA(raizDe(2))), -1, "−√2 < 0");
    igual(signoA(desdeRacional(rac(0n))), 0, "0 es 0");
  });

  test("la torre numérica opera algebraicos y NO los degrada a flotante", () => {
    const a = numAlgebraico(raizDe(2));
    const b = numAlgebraico(raizDe(3));
    const s = sumaN(a, b), p = productoN(a, b);
    assert(esExacto(s), `√2+√3 debe seguir siendo exacto, salió ${textoN(s)}`);
    assert(esExacto(p), `√2·√3 debe seguir siendo exacto, salió ${textoN(p)}`);
  });

  test("un algebraico que resulta ser racional se GUARDA como racional", () => {
    // Si no, `3/2` escrito y `3/2` salido de resolver una ecuación serían datos distintos y no
    // compararían iguales.
    const n = numAlgebraico(desdeRacional(rac(3n, 2n)));
    igual(n.clase, "racional", "debe bajar a la planta racional");
    igual(textoN(n), "3/2", "y escribirse como tal");
  });
});

// ─────────────────────────────────────────────
// 2 · La igualdad DECIDE
// ─────────────────────────────────────────────

describe("algebraico · la igualdad se decide, no se estima", () => {
  test("√2·√3 = √6, y se demuestra", () => {
    const p = productoA(raizDe(2), raizDe(3));
    assert(p !== null, "se calcula");
    assert(igualesA(p as Algebraico, raizDe(6)), "y es exactamente √6");
  });

  test("√2 ≠ √3", () => {
    assert(!igualesA(raizDe(2), raizDe(3)), "no son el mismo número");
  });

  test("el mismo número construido dos veces es el mismo número", () => {
    assert(igualesA(raizDe(5), raizDe(5)), "√5 = √5");
  });

  test("dos POLINOMIOS distintos con la misma raíz dan iguales", () => {
    // `x²−2` y `x⁴−4` comparten la raíz √2. La igualdad no mira los polinomios: mira si el mcd
    // tiene una raíz en la intersección de los intervalos, que es lo que de verdad decide.
    const porCuarta = raicesAlgebraicas(P(-4, 0, 0, 0, 1));
    const positiva = porCuarta[porCuarta.length - 1];
    assert(igualesA(positiva, raizDe(2)), "la raíz positiva de x⁴−4 es √2");
  });

  test("el orden es total y consistente", () => {
    const v = [raizDe(2), raizDe(3), raizDe(5), desdeRacional(rac(3n, 2n)), CBRT2, AUREO];
    for (const a of v) {
      for (const b of v) {
        igual(compararA(a, b), -compararA(b, a) as -1 | 0 | 1, "antisimetría");
        if (compararA(a, b) === 0) assert(igualesA(a, b), "un 0 significa iguales");
      }
    }
    assert(compararA(CBRT2, raizDe(2)) < 0, "∛2 (1.26) < √2 (1.41)");
    assert(compararA(AUREO, raizDe(2)) > 0, "φ (1.618) > √2");
  });
});

// ─────────────────────────────────────────────
// 3 · La forma cerrada
// ─────────────────────────────────────────────

describe("algebraico · la forma cerrada reconoce lo que se puede escribir", () => {
  test("∛2 se escribe como ∛2", () => {
    const f = formaCerrada(CBRT2);
    assert(f !== null, "tiene forma cerrada");
    igual(texto(f as Expresion), "nthRoot(2, 3)", "∛2");
  });

  test("una raíz cuadrada sale en forma CANÓNICA, con el cuadrado extraído", () => {
    // No se monta a mano: se le pide a `ValorExacto`, que ya sabe que √12 es 2√3.
    igual(texto(formaCerrada(raizDe(12)) as Expresion), "2 * sqrt(3)", "√12 = 2√3");
    igual(texto(formaCerrada(raizDe(18)) as Expresion), "3 * sqrt(2)", "√18 = 3√2");
    igual(texto(formaCerrada(raizDe(2)) as Expresion), "sqrt(2)", "√2 se queda como está");
  });

  test("el número áureo sale de la fórmula general de segundo grado", () => {
    const f = formaCerrada(AUREO);
    assert(f !== null, "tiene forma cerrada");
    assert(texto(f as Expresion).includes("sqrt(5)"), `debe llevar √5: ${texto(f as Expresion)}`);
  });

  test("una raíz sin forma cerrada lo ADMITE, en vez de aproximarla", () => {
    // x⁵ − x − 1 es el ejemplo de manual de quíntica no resoluble por radicales.
    const quintica = raicesAlgebraicas(P(-1, -1, 0, 0, 0, 1));
    igual(quintica.length, 1, "tiene una sola raíz real");
    assert(!tieneFormaCerrada(quintica[0]), "y NO se puede escribir con radicales");
    // Pero el número sigue siendo exacto y utilizable, que es lo que importa.
    assert(bienFormado(quintica[0]), "sigue siendo un número exacto y bien formado");
    assert(signoA(quintica[0]) === 1, "y se le puede preguntar el signo");
  });

  test("`comoRadical` solo dice que sí en la familia de los binomios", () => {
    assert(comoRadical(CBRT2) !== null, "x³−2 sí");
    assert(comoRadical(raizDe(7)) !== null, "x²−7 sí");
    assert(comoRadical(AUREO) === null, "x²−x−1 no es un binomio");
  });
});

// ─────────────────────────────────────────────
// 4 · El camino de vuelta, de punta a punta
// ─────────────────────────────────────────────

describe("algebraico · de la ecuación escrita a la expresión exacta", () => {
  // El texto se lee UNA vez, en el borde, y a partir de ahí todo son expresiones. Que la prueba
  // tenga que hacer este paso explícito es la señal de que la frontera existe: `raicesExactas`
  // ya no sabe leer, y por tanto ya no arrastra el parser en su grafo de dependencias.
  const raicesDe = (ec: string) => {
    const cero = leerComoCero(ec);
    return cero === null ? null : raicesExactas(cero);
  };
  const resolver = (ec: string): string[] =>
    (raicesDe(ec) ?? []).map((r) => texto(r.expresion));

  test("EL CASO: x³ = 2 da ∛2, no 1.2599210498948732", () => {
    igual(resolver("x^3 = 2").join(" , "), "nthRoot(2, 3)", "∛2");
  });

  test("las raíces racionales salen como racionales", () => {
    igual(resolver("2*x = 3").join(" , "), "3 / 2", "3/2");
    igual(resolver("x^3 - 6*x^2 + 11*x - 6 = 0").join(" , "), "1 , 2 , 3", "1, 2 y 3");
    igual(resolver("x^4 = 16").join(" , "), "-2 , 2", "±2, no ⁴√16");
  });

  test("las cuadráticas salen con su radical", () => {
    igual(resolver("x^2 = 12").join(" , "), "-1 * 2 * sqrt(3) , 2 * sqrt(3)", "±2√3");
  });

  test("sin raíces reales, la lista es vacía y no hay invento", () => {
    igual(resolver("x^2 + 1 = 0").length, 0, "x²+1 no corta el eje");
  });

  test("lo que no es polinómico se declara fuera de esta vía", () => {
    igual(raicesDe("sin(x) = 0"), null, "no es polinómica");
    igual(raicesDe("x^2 + y = 3"), null, "tiene dos variables");
  });

  test("la expresión que sale es EXACTA y normalizable", () => {
    for (const ec of ["x^3 = 2", "x^2 = 12", "x^2 - x - 1 = 0", "2*x = 3"]) {
      for (const r of raicesDe(ec) ?? []) {
        assert(esExacta(r.expresion), `${ec}: la expresión debe ser exacta`);
        const n = normalizar(r.expresion);
        assert(esExacta(n), `${ec}: y seguir siéndolo tras normalizar`);
      }
    }
  });

  test("ninguna solución exacta se convierte en decimal al cruzar el puente", () => {
    for (const ec of ["x^3 = 2", "x^2 = 12", "x^2 - x - 1 = 0"]) {
      for (const r of raicesDe(ec) ?? []) {
        const s = texto(r.expresion);
        assert(!/\d\.\d{6,}/.test(s), `salió un decimal largo: ${s}`);
      }
    }
  });
});
