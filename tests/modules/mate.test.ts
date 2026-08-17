// ─────────────────────────────────────────────
// tests · Motor matemático: racionales exactos y raíces reales de polinomios
// ─────────────────────────────────────────────
//
// Lo que se defiende aquí no es «que los números salgan parecidos», sino las dos propiedades que
// hacen que este motor exista:
//
//  1. **Exactitud**: una raíz racional sale como el racional que es. El bug que originó el
//     módulo fue una solución que valía (0,0) y pasaba a valer (8.4e-6, 8.4e-6) al mover el
//     plano, así que un 0 que sale «casi 0» aquí es un fallo, no una tolerancia.
//  2. **Completitud**: se encuentran TODAS las raíces reales. Es la propiedad que ningún método
//     por muestreo puede prometer, y por eso las pruebas insisten en los tres casos que lo
//     rompen: raíces dobles (no cambian de signo), raíces muy juntas (caben entre dos muestras)
//     y raíces lejos del origen (fuera de cualquier rango fijo).

import { describe, test, assert, igual, aprox } from "../runner";
import {
  rac, aNumero, aTexto, comparar, desdeDecimal, desdeNumero, esCero, suma, resta, producto,
  cociente, CERO, UNO,
} from "../../src/math/racional";
import {
  type Polinomio, raicesReales, raicesEnIntervalo, libreDeCuadrados, mcdPol, dividir,
  productoPol, sumaPol, derivada, evaluar, cotaCauchy, grado, componer, aTextoPol,
} from "../../src/math/polinomio";
import {
  type Polinomio2, NULO2, suma2, termino2, sustituirY, sustituirX, resultanteY, compartenComponente,
} from "../../src/math/polinomio2";
import { resolverSistema, resolverBloque } from "../../src/math/resolverSistema";
import { resolverNumerico } from "../../src/math/numerico";
import { ramasDe } from "../../src/math/ramas";
import { infinitasPorPeriodicidad } from "../../src/host-obsidian/info/infinitasPeriodicas";
import {
  solucionALatex, solucionATexto, decimalALatex,
} from "../../src/host-obsidian/info/latexSolucion";
import {
  type ValorExacto, aLatexE, aNumeroE, aTextoE, cocienteE, exacto, igualesE, productoE,
  raizCuadrada, racionalDe, restaE, sumaE,
} from "../../src/math/simbolico/valorExacto";
import { raicesConForma, racionalCercano } from "../../src/math/simbolico/raicesSimbolicas";
import { evaluarExacto } from "../../src/math/simbolico/polinomioExacto";
import {
  constanteExacta, raizEnteraK,
} from "../../src/math/simbolico/constanteExacta";
import { parse } from "mathjs";
import { normalizarEntrada } from "../../src/parser";
import { insertarProductoImplicito } from "../../src/core/parsing/productoImplicito";
import type { Nodo as NodoTest } from "../../src/expr/nodo";

/** Un polinomio a partir de coeficientes enteros, de menor a mayor grado. */
const P = (...c: number[]): Polinomio => c.map((k) => rac(BigInt(k)));

/** Los valores de las raíces, ordenados, para comparar de un vistazo. */
const valores = (p: Polinomio): number[] => raicesReales(p).map((r) => r.valor);

describe("mate · racionales exactos", () => {
  test("reduce y pone el signo en el numerador", () => {
    igual(aTexto(rac(2n, 4n)), "1/2");
    igual(aTexto(rac(3n, -6n)), "-1/2");
    igual(aTexto(rac(-4n, 2n)), "-2");
  });

  test("la aritmética no pierde nada donde el doble sí", () => {
    // 0.1 + 0.2 === 0.30000000000000004 en coma flotante. Aquí es exactamente 3/10.
    const t = suma(rac(1n, 10n), rac(2n, 10n));
    igual(aTexto(t), "3/10");
    assert(comparar(t, rac(3n, 10n)) === 0, "3/10 exacto");
  });

  test("resta de iguales da CERO de verdad, no un residuo", () => {
    const a = cociente(rac(1n), rac(3n));
    const tres = producto(a, rac(3n));
    assert(esCero(resta(tres, UNO)), "3·(1/3) − 1 debe ser exactamente 0");
  });

  test("desdeDecimal lee los DÍGITOS y desdeNumero lee los BITS", () => {
    igual(aTexto(desdeDecimal("0.1") ?? CERO), "1/10");
    igual(aTexto(desdeDecimal("1.25") ?? CERO), "5/4");
    igual(aTexto(desdeDecimal("-2.5") ?? CERO), "-5/2");
    igual(aTexto(desdeDecimal("1e3") ?? CERO), "1000");
    igual(desdeDecimal("chorizo"), null);
    // El double 0.1 NO es 1/10, y el módulo no finge que lo sea.
    assert(comparar(desdeNumero(0.1), rac(1n, 10n)) !== 0, "desdeNumero(0.1) ≠ 1/10");
    igual(aTexto(desdeNumero(0.5)), "1/2");
  });

  test("aNumero sobrevive a coeficientes que desbordan el doble", () => {
    const enorme = rac(10n ** 400n, 3n * 10n ** 399n);
    aprox(aNumero(enorme), 10 / 3, 1e-9, "10^400/(3·10^399):");
  });
});

describe("mate · álgebra de polinomios", () => {
  test("producto y división se deshacen", () => {
    const a = P(-2, 0, 1);            // x² − 2
    const b = P(1, 3);                // 3x + 1
    const { coc, resto } = dividir(productoPol(a, b), b);
    igual(aTextoPol(coc), aTextoPol(a));
    assert(grado(resto) < 0, "resto nulo");
  });

  test("la derivada es formal y exacta", () => {
    igual(aTextoPol(derivada(P(5, 4, 3))), "6x + 4");
  });

  test("el mcd encuentra el factor repetido", () => {
    const raizDoble = productoPol(P(-1, 1), P(-1, 1));   // (x−1)²
    const g = mcdPol(raizDoble, derivada(raizDoble));
    igual(aTextoPol(g), "x - 1");
  });

  test("libreDeCuadrados colapsa las multiplicidades", () => {
    const p = productoPol(productoPol(P(-1, 1), P(-1, 1)), P(-2, 1));  // (x−1)²(x−2)
    igual(aTextoPol(libreDeCuadrados(p)), aTextoPol(productoPol(P(-1, 1), P(-2, 1))));
  });

  test("componer sustituye una curva en otra", () => {
    // p(x)=x², q(x)=x+1  →  p(q(x)) = x² + 2x + 1
    igual(aTextoPol(componer(P(0, 0, 1), P(1, 1))), "x^2 + 2x + 1");
  });

  test("la cota de Cauchy encierra de verdad a las raíces", () => {
    const p = P(-1000, 0, 1);          // x² − 1000, raíces ±31.6…
    const cota = aNumero(cotaCauchy(p));
    assert(cota > Math.sqrt(1000), `la cota ${cota} debe superar 31.6`);
  });
});

describe("mate · raíces reales: exactitud", () => {
  test("la raíz en el origen es EXACTAMENTE cero", () => {
    // x² − x = x(x−1): es el sistema `y = Ax` ∩ `y = x²` con A=1, el caso del bug.
    const r = raicesReales(P(0, -1, 1));
    igual(r.length, 2);
    igual(r[0].valor, 0);                       // === 0, no ±1e-16
    igual(r[1].valor, 1);
    assert(r[0].exacto !== null && esCero(r[0].exacto), "la raíz 0 se reconoce racional");
  });

  test("una raíz racional no entera sale exacta", () => {
    // 2x − 3 = 0  →  x = 3/2
    const r = raicesReales(P(-3, 2));
    igual(r.length, 1);
    igual(r[0].valor, 1.5);
    igual(aTexto(r[0].exacto ?? CERO), "3/2");
  });

  test("una raíz irracional se refina hasta el límite del doble", () => {
    const r = raicesReales(P(-2, 0, 1));        // x² − 2
    igual(r.length, 2);
    aprox(r[0].valor, -Math.SQRT2, 1e-15, "−√2:");
    aprox(r[1].valor, Math.SQRT2, 1e-15, "√2:");
    igual(r[0].exacto, null);                    // irracional: no se finge exacta
  });

  test("no inventa raíces donde no las hay", () => {
    igual(raicesReales(P(1, 0, 1)).length, 0);   // x² + 1
    igual(raicesReales(P(5)).length, 0);         // constante
    igual(raicesReales([]).length, 0);           // polinomio nulo
  });
});

describe("mate · raíces reales: completitud", () => {
  test("encuentra la raíz DOBLE, que no cambia de signo", () => {
    // (x−1)²: ningún barrido por cambio de signo la ve nunca.
    const r = raicesReales(productoPol(P(-1, 1), P(-1, 1)));
    igual(r.length, 1);
    igual(r[0].valor, 1);
  });

  test("encuentra dos raíces más juntas que cualquier paso de muestreo", () => {
    // (x − 1/1000)(x + 1/1000): separadas por 0.002, invisibles para un paso de 0.02.
    const p = productoPol([rac(-1n, 1000n), UNO], [rac(1n, 1000n), UNO]);
    const v = valores(p);
    igual(v.length, 2);
    aprox(v[0], -0.001, 1e-15, "raíz izquierda:");
    aprox(v[1], 0.001, 1e-15, "raíz derecha:");
  });

  test("encuentra una raíz LEJOS del origen, fuera de cualquier rango fijo", () => {
    // x − 12345 = 0. El análisis por muestreo del panel usa [−10, 10]: para él no existe.
    const r = raicesReales(P(-12345, 1));
    igual(r.length, 1);
    igual(r[0].valor, 12345);
  });

  test("cuenta bien un polinomio con muchas raíces", () => {
    // (x+3)(x+2)(x+1)x(x−1)(x−2)(x−3)
    let p: Polinomio = [UNO];
    for (const k of [-3, -2, -1, 0, 1, 2, 3]) p = productoPol(p, P(-k, 1));
    const v = valores(p);
    igual(v.length, 7);
    for (let i = 0; i < 7; i++) igual(v[i], i - 3, `raíz ${i}:`);
  });

  test("Sturm cuenta exactamente en un intervalo dado", () => {
    let p: Polinomio = [UNO];
    for (const k of [-3, -2, -1, 0, 1, 2, 3]) p = productoPol(p, P(-k, 1));
    igual(raicesEnIntervalo(p, rac(-10n), rac(10n)), 7, "todas:");
    igual(raicesEnIntervalo(p, rac(0n), rac(10n)), 3, "en (0,10]:");
    igual(raicesEnIntervalo(p, rac(-1n, 2n), rac(1n, 2n)), 1, "solo el 0:");
  });

  test("no se marea con coeficientes grandes", () => {
    // (1000x − 1)(x + 7777) : una raíz diminuta y otra enorme, en el mismo polinomio.
    const p = productoPol([rac(-1n), rac(1000n)], P(7777, 1));
    const v = valores(p);
    igual(v.length, 2);
    aprox(v[0], -7777, 1e-9, "raíz grande:");
    aprox(v[1], 0.001, 1e-15, "raíz pequeña:");
  });
});

describe("mate · eliminación en dos variables", () => {
  /** El polinomio en x,y a partir de términos `[coef, gradoX, gradoY]`. */
  const Q = (...t: Array<[number, number, number]>): Polinomio2 =>
    t.reduce((acc, [c, i, j]) => suma2(acc, termino2(rac(BigInt(c)), i, j)), NULO2);

  test("sustituir y = f(x) deja una ecuación de una variable", () => {
    // x² + y² − 9 con y = x  →  2x² − 9
    const circulo = Q([1, 2, 0], [-9, 0, 0], [1, 0, 2]);
    igual(aTextoPol(sustituirY(circulo, P(0, 1))), "2x^2 - 9");
  });

  test("la resultante cruza una recta con una circunferencia", () => {
    // x² + y² = 9  ∩  y = x   →   x = ±3/√2
    const circulo = Q([1, 2, 0], [-9, 0, 0], [1, 0, 2]);
    const recta = Q([-1, 1, 0], [1, 0, 1]);            // y − x
    const r = resultanteY(circulo, recta);
    const v = raicesReales(r).map((z) => z.valor);
    igual(v.length, 2);
    aprox(v[0], -3 / Math.SQRT2, 1e-12, "izquierda:");
    aprox(v[1], 3 / Math.SQRT2, 1e-12, "derecha:");
  });

  test("la resultante cruza DOS circunferencias, sin ninguna explícita", () => {
    // x²+y²=4  ∩  (x−3)²+y²=4  →  las dos se cortan en x = 3/2 (dos puntos, misma abscisa)
    const c1 = Q([1, 2, 0], [-4, 0, 0], [1, 0, 2]);
    const c2 = Q([1, 2, 0], [-6, 1, 0], [5, 0, 0], [1, 0, 2]);
    const r = resultanteY(c1, c2);
    const v = raicesReales(r).map((z) => z.valor);
    assert(v.length >= 1, "debe haber solución");
    for (const x of v) aprox(x, 1.5, 1e-12, "abscisa común:");
  });

  test("una raíz de la resultante NO es siempre una solución real", () => {
    // Dos circunferencias separadas: x²+y²=1 y (x−10)²+y²=1. Restándolas sale x=5, y esa x SÍ es
    // raíz de la resultante —las dos curvas comparten ahí una raíz en y, pero COMPLEJA (y²=−24)—.
    // Es la trampa de eliminar: la resultante trabaja sobre ℂ, y el plano es real. Por eso el
    // solver no puede quedarse con las raíces de la resultante: tiene que volver a sustituir y
    // comprobar que la y que sale es real. Esta prueba fija esa obligación.
    const c1 = Q([1, 2, 0], [-1, 0, 0], [1, 0, 2]);
    const c2 = Q([1, 2, 0], [-20, 1, 0], [99, 0, 0], [1, 0, 2]);
    const xs = raicesReales(resultanteY(c1, c2));
    igual(xs.length, 1, "la resultante sí tiene una raíz real:");
    aprox(xs[0].valor, 5, 1e-12, "en x=5:");
    // Y al volver a la curva, esa x no da ninguna y real: no hay intersección.
    const enY = sustituirX(c1, rac(5n));               // y² + 24
    igual(raicesReales(enY).length, 0, "ninguna y real:");
  });

  test("dos curvas IGUALES se detectan como solape, no como puntos", () => {
    const c = Q([1, 2, 0], [-9, 0, 0], [1, 0, 2]);
    assert(compartenComponente(c, c), "la misma curva consigo misma se solapa");
    const recta = Q([-1, 1, 0], [1, 0, 1]);
    assert(!compartenComponente(c, recta), "una recta y una circunferencia no se solapan");
  });

  test("la parábola y la recta del bug: x = 0 y x = A, exactos", () => {
    // y = x²  ∩  y = Ax  con A = 1  →  x² − x = 0
    const parabola = Q([1, 2, 0], [-1, 0, 1]);        // x² − y
    const recta = Q([1, 1, 0], [-1, 0, 1]);           // x − y
    const r = resultanteY(parabola, recta);
    const raices = raicesReales(r);
    igual(raices.length, 2);
    igual(raices[0].valor, 0, "la raíz en el origen:");
    igual(raices[1].valor, 1);
  });
});

describe("mate · resolver un sistema escrito", () => {
  /** Las soluciones como texto `(x, y)`, para leer la prueba de un vistazo. */
  const puntos = (a: string, b: string): string[] => {
    const r = resolverSistema(a, b);
    if (r.tipo !== "puntos") return [r.tipo];
    return r.puntos.map((s) => `(${s.x}, ${s.y})`);
  };

  test("EL CASO DEL BUG: y = Ax con A=1, contra y = x²", () => {
    // Las dos soluciones son exactamente (0,0) y (1,1). Sin épsilon, sin vista, sin trazado.
    igual(puntos("y = x", "y = x^2").join(" "), "(0, 0) (1, 1)");
  });

  test("y = 2x contra y = x²: la raíz distinta de cero es exacta", () => {
    igual(puntos("y = 2x", "y = x^2").join(" "), "(0, 0) (2, 4)");
  });

  test("dos rectas se cortan en un punto racional", () => {
    igual(puntos("y = 2x + 1", "y = -x + 4").join(" "), "(1, 3)");
  });

  test("dos rectas paralelas no se cortan", () => {
    igual(puntos("y = 2x + 1", "y = 2x + 5").length, 0);
  });

  test("la misma recta dos veces es un solape, no una lista", () => {
    igual(puntos("y = 2x + 1", "y = 2x + 1").join(" "), "solape");
  });

  test("recta y circunferencia, con solución irracional", () => {
    const r = resolverSistema("x^2 + y^2 = 9", "y = x");
    assert(r.tipo === "puntos", "debe resolver");
    if (r.tipo !== "puntos") return;
    igual(r.puntos.length, 2);
    aprox(r.puntos[0].x, -3 / Math.SQRT2, 1e-12, "x izquierda:");
    aprox(r.puntos[1].y, 3 / Math.SQRT2, 1e-12, "y derecha:");
    // La solución es irracional y AUN ASÍ es exacta: 3/√2 vive en ℚ(√2) y el motor lo escribe
    // racionalizado. Esta prueba afirmaba lo contrario (`exactoX === null`) mientras el único
    // valor exacto que el motor sabía guardar era un racional.
    igual(r.puntos[0].exactoX && aTextoE(r.puntos[0].exactoX), "-3√2/2", "x izquierda exacta:");
    igual(r.puntos[1].exactoY && aTextoE(r.puntos[1].exactoY), "3√2/2", "y derecha exacta:");
  });

  test("dos circunferencias que se cortan de verdad", () => {
    const r = resolverSistema("x^2 + y^2 = 4", "(x-3)^2 + y^2 = 4");
    assert(r.tipo === "puntos", "debe resolver");
    if (r.tipo !== "puntos") return;
    igual(r.puntos.length, 2, "dos puntos:");
    for (const s of r.puntos) aprox(s.x, 1.5, 1e-12, "abscisa:");
    aprox(r.puntos[0].y, -Math.sqrt(4 - 2.25), 1e-9, "y de abajo:");
    aprox(r.puntos[1].y, Math.sqrt(4 - 2.25), 1e-9, "y de arriba:");
  });

  test("dos circunferencias separadas: la x complejo-común se DESCARTA", () => {
    // Es el candidato falso de la resultante. Si el verificador no estuviera, el panel
    // enseñaría un punto (5, algo) donde no se toca nada.
    igual(puntos("x^2 + y^2 = 1", "(x-10)^2 + y^2 = 1").length, 0);
  });

  test("hipérbola contra recta: la fracción entra por el camino exacto", () => {
    igual(puntos("y = 1/x", "y = x").join(" "), "(-1, -1) (1, 1)");
  });

  test("y = 1/x contra y = 0 no inventa una solución en el origen", () => {
    // Limpiar el denominador convierte `1/x = 0` en `1 = 0`; el peligro es el contrario,
    // que aparezca una raíz donde la curva no existe. No debe haber ninguna solución.
    igual(puntos("y = 1/x", "y = 0").length, 0);
  });

  test("una solución LEJOS del origen se encuentra igual", () => {
    // El cruce está en x = 500: fuera de cualquier vista razonable y de cualquier rango fijo.
    igual(puntos("y = x", "y = 500").join(" "), "(500, 500)");
  });

  test("tangencia: la parábola y su recta tangente tocan en UN punto", () => {
    igual(puntos("y = x^2", "y = 2x - 1").join(" "), "(1, 1)");
  });

  test("un sistema CON restricción de dominio se resuelve, y se RECORTA", () => {
    // La restricción no es parte de la ecuación, es un recorte sobre ella: hay que separarla
    // antes de resolver (o el motor no sabe leerla y el bloque se queda mudo) y aplicarla
    // después (o el panel lista cruces que en el plano no se dibujan).
    // Es `resolverBloque` quien separa el recorte: es la puerta que usa el bloque.
    const enBloque = (...ecs: string[]): string => {
      const r = resolverBloque(ecs);
      return r.tipo === "puntos" ? r.puntos.map((s) => `(${s.x}, ${s.y})`).join(" ") : r.tipo;
    };
    igual(enBloque("y = x {0 \\leq x \\leq 2}", "y = x^2"), "(0, 0) (1, 1)",
      "los dos cruces caen dentro:");
    igual(enBloque("y = x {3 \\leq x \\leq 9}", "y = x^2"), "",
      "fuera del recorte no hay solución que listar");
    igual(enBloque("y = x", "y = x^2 {0.5 \\leq x \\leq 9}"), "(1, 1)",
      "el recorte de la OTRA ecuación cuenta igual:");
  });

  test("lo no polinómico se declara noResoluble, no «sin solución»", () => {
    igual(puntos("y = \sin x", "y = x/2").join(" "), "noResoluble");
    igual(puntos("y = 2^x", "y = x").join(" "), "noResoluble");
  });

  test("las soluciones no dependen de cómo se escriba la ecuación", () => {
    const a = puntos("y = x^2", "y = x").join(" ");
    const b = puntos("x^2 - y = 0", "x - y = 0").join(" ");
    const c = puntos("y - x^2 = 0", "y = x").join(" ");
    igual(a, b, "implícita vs explícita:");
    igual(a, c, "lados cambiados:");
  });
});

describe("mate · camino numérico (sistemas no polinómicos)", () => {
  const xs = (a: string, b: string): number[] => {
    const r = resolverNumerico(a, b);
    return r.tipo === "puntos" ? r.puntos.map((p) => p.x) : [];
  };

  test("y = sin x contra y = x/2: las tres soluciones", () => {
    const v = xs("y = \sin x", "y = x/2");
    igual(v.length, 3, "tres cruces:");
    aprox(v[0], -1.895494, 1e-5, "izquierda:");
    aprox(v[1], 0, 1e-9, "el origen:");
    aprox(v[2], 1.895494, 1e-5, "derecha:");
  });

  test("y = 2^x contra y = x + 1: dos soluciones, una en el origen", () => {
    const v = xs("y = 2^x", "y = x + 1");
    igual(v.length, 2);
    aprox(v[0], 0, 1e-9, "x=0:");
    aprox(v[1], 1, 1e-9, "x=1:");
  });

  test("no depende de la vista: el intervalo explorado es una constante", () => {
    // La misma llamada dos veces da exactamente lo mismo; no hay ningún estado de cámara que
    // pueda cambiarla. Es la propiedad que se venía a arreglar.
    igual(JSON.stringify(xs("y = \sin x", "y = x/2")),
          JSON.stringify(xs("y = \sin x", "y = x/2")));
  });

  test("encuentra un cruce lejos del origen, fuera de cualquier vista", () => {
    const v = xs("y = \sin x", "y = 0");
    // sin x = 0 en cada múltiplo de π dentro de ±100: son 64 (de −31π a 31π).
    assert(v.length > 50, `debe encontrar decenas de cruces, encontró ${v.length}`);
    assert(v.some((x) => Math.abs(x - 31 * Math.PI) < 1e-6), "incluido el de x = 31π ≈ 97.4");
  });

  test("las asíntotas de la tangente NO se cuentan como soluciones", () => {
    const v = xs("y = \tan x", "y = 0");
    // Los ceros de tan son los múltiplos de π; sus asíntotas (π/2 + kπ) también cambian de
    // signo, y sin la distinción raíz/polo saldrían el doble de «soluciones».
    for (const x of v) {
      const resto = Math.abs(x / Math.PI - Math.round(x / Math.PI));
      assert(resto < 1e-6, `x=${x} no es múltiplo de π: es un polo colado como raíz`);
    }
  });

  test("una implícita no explícita se declara fuera de alcance", () => {
    igual(resolverNumerico("x^2 + y^2 = 9", "y = \sin x").tipo, "noResoluble");
  });
});

describe("mate · tercer escalón: ramas del despejador", () => {
  /** El bloque entero, que es la puerta donde viven los tres escalones. */
  const bloque = (...ecs: string[]) => resolverBloque(ecs);
  /** Las soluciones como texto, para leer la prueba de un vistazo. */
  const puntos = (...ecs: string[]): string => {
    const r = bloque(...ecs);
    return r.tipo === "puntos" ? r.puntos.map((s) => `(${s.x}, ${s.y})`).join(" ") : r.tipo;
  };

  // La solución de `x + √|y| = 3` ∩ `x = y`, que es la raíz de x + √x = 3 con x ≥ 0.
  const RAIZ = (7 - Math.sqrt(13)) / 2;
  // La OTRA raíz de x² − 7x + 9, la que introduce el elevar al cuadrado. No es solución del
  // sistema escrito (su residuo vale 4.6) y la guarda `x ≤ 3` del despeje es quien la mata.
  const ESPURIA = (7 + Math.sqrt(13)) / 2;

  test("EL CASO: `x + |y|^{1/2} = 3` ∩ `x − y = 0` se resuelve y se enumera", () => {
    const r = bloque("x + |y|^{1/2} = 3", "x - y = 0");
    assert(r.tipo === "puntos", `debe resolver, dio ${r.tipo}`);
    if (r.tipo !== "puntos") return;
    igual(r.puntos.length, 1, "una sola solución:");
    aprox(r.puntos[0].x, RAIZ, 1e-15, "x:");
    aprox(r.puntos[0].y, RAIZ, 1e-15, "y (la recta y = x):");
    igual(r.aproximado, false,
      "la rama es polinómica → la resuelve el carril EXACTO, completa sobre ℝ");
  });

  test("la raíz que introduce el elevar al cuadrado NO se lista: la mata la guarda", () => {
    const r = bloque("x + |y|^{1/2} = 3", "x - y = 0");
    // Sin esta comprobación la prueba pasaría por VACUIDAD (un `noResoluble` tampoco lista la
    // espuria), y entonces no defendería nada.
    assert(r.tipo === "puntos", `debe resolver, dio ${r.tipo}`);
    if (r.tipo !== "puntos") return;
    for (const s of r.puntos)
      assert(Math.abs(s.x - ESPURIA) > 1e-6,
        `(${s.x}) es la raíz espuria: la guarda x ≤ 3 no se aplicó`);
  });

  test("la forma sintáctica ya no decide: `x + √y = 3` da lo mismo que `|y|^{1/2}`", () => {
    // Las dos escrituras describen la misma curva en el semiplano y ≥ 0, que es donde cae la
    // solución. Antes una se resolvía y la otra no, según cómo estuviera escrita.
    const p = puntos("x + sqrt(y) = 3", "x - y = 0");
    assert(p !== "noResoluble", "las dos formas deben RESOLVERSE, no coincidir en el fallo");
    igual(p, puntos("x + |y|^{1/2} = 3", "x - y = 0"));
  });

  test("la MISMA ecuación en x, escrita como dos curvas distintas, da la misma abscisa", () => {
    // `y = √x` ∩ `y = 3 − x` y `x + √y = 3` ∩ `x = y` se reducen las dos a x + √x = 3. Son
    // sistemas DISTINTOS (la ordenada no es la misma: ahí y = √x, aquí y = x), pero la x tiene
    // que ser la misma, y antes una de las dos escrituras no se resolvía en absoluto.
    const a = bloque("y = sqrt(x)", "y = 3 - x");
    const b = bloque("x + sqrt(y) = 3", "x - y = 0");
    assert(a.tipo === "puntos" && b.tipo === "puntos", "las dos deben resolverse");
    if (a.tipo !== "puntos" || b.tipo !== "puntos") return;
    igual(a.puntos.length, 1);
    igual(b.puntos.length, 1);
    aprox(a.puntos[0].x, b.puntos[0].x, 1e-12, "misma abscisa:");
  });

  test("un sistema con π se enumera, y se dice que es aproximado", () => {
    // π no es algebraico: la solución no cae en el dominio de lo que el carril exacto sabe
    // enumerar, y fingir lo contrario sería el error. Lo que no puede pasar es no enumerarla.
    const r = bloque("sqrt(x) + nthRoot(y, 3) = sqrt(2)", "x - y = pi");
    assert(r.tipo === "puntos", `debe resolver, dio ${r.tipo}`);
    if (r.tipo !== "puntos") return;
    igual(r.puntos.length, 1, "una solución:");
    aprox(r.puntos[0].x, 3.10000232638268, 1e-9, "x:");
    aprox(r.puntos[0].y, -0.04159032720711309, 1e-9, "y:");
    igual(r.aproximado, true, "va por el carril numérico → la lista es la del intervalo:");
    igual(r.puntos[0].exactoX, null, "no se finge exacta:");
  });

  test("la misma con exponentes fraccionarios escritos en LaTeX", () => {
    const p = puntos("x^{1/2} + y^{1/3} = 2^{1/2}", "x - y = pi");
    assert(p !== "noResoluble", "las dos formas deben RESOLVERSE, no coincidir en el fallo");
    igual(p, puntos("sqrt(x) + nthRoot(y, 3) = sqrt(2)", "x - y = pi"));
  });

  test("valor absoluto: las DOS ramas se cruzan, y solo sobrevive la que existe", () => {
    // `|y| = x` ∩ `y = x − 2`: la rama y = x no corta, la rama y = −x sí, en (1, −1).
    igual(puntos("|y| = x", "y = x - 2"), "(1, -1)");
    igual(puntos("x + |y| = 3", "x - y = 0"), "(1.5, 1.5)");
  });

  test("NO REGRESIÓN: lo que resolvía el carril exacto sigue yendo por el carril exacto", () => {
    // Es el riesgo de introducir la etapa: `x²+y²=25` se despeja a `y = ±√(25−x²)`, que NO es
    // polinómico. Si las ramas fueran lo primero, este sistema pasaría a ser numérico y
    // perdería la exactitud y la completitud sobre ℝ. Por eso el escalón va el TERCERO.
    const r = bloque("x^2 + y^2 = 25", "y = x");
    assert(r.tipo === "puntos", "debe resolver");
    if (r.tipo !== "puntos") return;
    igual(r.aproximado, false, "sigue siendo exacto, no degrada a numérico:");
    igual(r.puntos.length, 2, "las dos soluciones:");
    aprox(r.puntos[1].x, 5 / Math.SQRT2, 1e-12, "x derecha:");
  });

  test("NO REGRESIÓN: los racionales siguen saliendo exactos", () => {
    const r = bloque("y = x", "y = x^2");
    assert(r.tipo === "puntos", "debe resolver");
    if (r.tipo !== "puntos") return;
    igual(r.aproximado, false);
    igual(r.puntos.map((s) => `${s.exactoX && aTextoE(s.exactoX)}`).join(" "), "0 1",
      "el 0 sigue siendo el 0:");
  });

  test("NO REGRESIÓN: el solape se sigue detectando antes que nada", () => {
    igual(puntos("y = 2x + 1", "y = 2x + 1"), "solape");
  });

  test("una familia periódica no abre ramas: serían infinitas", () => {
    // `tan y = x` despeja a `y = atan x + kπ`. Enumerar cuatro ramas y callar las demás sería
    // peor que no enumerar, así que el escalón de ramas se declara incompetente.
    igual(ramasDe("\\tan y = x"), null);
    // El sistema SÍ se resuelve, pero por el escalón anterior: `tan y = x` tiene la x despejada,
    // y contra `y = x` el camino numérico compone y barre `tan(y) − y = 0`. Es aproximado y
    // acotado al intervalo, que es exactamente lo que se puede prometer ahí.
    const r = bloque("\\tan y = x", "y = x");
    assert(r.tipo === "puntos", "el carril numérico mixto sí lo resuelve");
    if (r.tipo !== "puntos") return;
    igual(r.aproximado, true, "aproximado:");
    for (const s of r.puntos)
      assert(Math.abs(Math.tan(s.y) - s.y) < 1e-6, `(${s.x}) no cumple tan y = y`);
  });

  test("un despeje INCOMPLETO no abre ramas", () => {
    // Con y sin aislar, la ecuación transformada no es más resoluble que la original, y una
    // lista salida de un despeje parcial no se podría afirmar completa.
    igual(ramasDe("\\sin y + y^2 = x"), null);
    // Y aun así el sistema tiene respuesta por el carril numérico mixto: (0, 0).
    igual(puntos("\\sin y + y^2 = x", "y = x"), "(0, 0)");
  });

  test("las ramas llevan su guarda, y las escrituras equivalentes dan las mismas", () => {
    const r = ramasDe("x + |y|^{1/2} = 3");
    assert(r !== null, "debe dar ramas");
    if (!r) return;
    igual(r.length, 2, "el ± son dos ramas:");
    for (const rama of r) igual(rama.guardas.length, 1, "cada una con su guarda:");
    // La guarda es una expresión re-parseable, sin el centinela `dom` dentro.
    for (const rama of r)
      assert(!/dom\s*\(/.test(rama.ecuacion + rama.guardas.join()),
        `el centinela dom se quedó sin extraer: ${rama.ecuacion}`);
  });

  test("sin despeje útil no hay ramas (null no es «sin soluciones»)", () => {
    igual(ramasDe("\\tan y = x"), null, "familia periódica:");
    igual(ramasDe("\\sin y + y^2 = x"), null, "despeje incompleto:");
  });

  test("una ecuación escrita sobre X tiene las mismas capacidades que sobre Y", () => {
    // `|x| = 2` es `|y| = 2` girada 90°. El despejador solo sabe aislar y, así que sin la
    // transposición esta se quedaba fuera del análisis por casos: la ORIENTACIÓN de lo escrito
    // decidía la capacidad, que es la misma clase de fuga que la forma sintáctica.
    igual(puntos("|x| = 2", "y = 0"), "(-2, 0) (2, 0)");
    igual(puntos("|y| = 2", "x = 0"), "(0, -2) (0, 2)");
  });

  test("un símbolo libre no describe ninguna curva: ni se enumera ni se barre", () => {
    // `a` sin declarar. Cruzar esa rama no puede dar ninguna solución, y descartarla por el
    // ÁRBOL evita que el barrido numérico evalúe 40 000 muestras que fallan una a una (era
    // casi un segundo por pareja, y este escalón puede intentar hasta dieciséis).
    igual(ramasDe("x + a|y| = 3"), null, "símbolo libre:");
    igual(puntos("x + a|y| = 3", "y = x"), "noResoluble");
    // Las constantes que el motor SÍ conoce no son símbolos libres y deben pasar.
    assert(ramasDe("x - y = pi") !== null, "pi es una constante, no un símbolo libre");
    assert(ramasDe("x + |y| = e") !== null, "e es una constante, no un símbolo libre");
  });
});

describe("mate · valores exactos: el cuerpo ℚ(√d)", () => {
  const V = (n: number, d = 1) => exacto(rac(BigInt(n), BigInt(d)));
  /** `(a + b√d)/den` construido a pelo, para las pruebas. */
  const surd = (a: number, b: number, d: number, den = 1): ValorExacto => {
    const raiz = raizCuadrada(rac(BigInt(d))) ?? V(0);
    const parte = productoE(exacto(rac(BigInt(b), BigInt(den))), raiz) ?? V(0);
    return sumaE(exacto(rac(BigInt(a), BigInt(den))), parte) ?? V(0);
  };

  test("el radicando se reduce solo: √8 = 2√2, √9 = 3, √(4/9) = 2/3", () => {
    igual(aTextoE(raizCuadrada(rac(8n)) ?? V(0)), "2√2");
    igual(aTextoE(raizCuadrada(rac(9n)) ?? V(0)), "3");
    igual(aTextoE(raizCuadrada(rac(4n, 9n)) ?? V(0)), "2/3");
    igual(aTextoE(raizCuadrada(rac(48n)) ?? V(0)), "4√3");
    igual(aTextoE(raizCuadrada(rac(0n)) ?? V(0)), "0");
  });

  test("un radicando negativo NO es un número real: se declara fuera de alcance", () => {
    igual(raizCuadrada(rac(-2n)), null);
  });

  test("dividir RACIONALIZA el denominador: 1/√2 = √2/2", () => {
    const dos = raizCuadrada(rac(2n)) ?? V(0);
    igual(aTextoE(cocienteE(V(1), dos) ?? V(0)), "√2/2");
    igual(aTextoE(cocienteE(V(5), dos) ?? V(0)), "5√2/2");
    // 1/(1+√2) = √2 − 1: el conjugado deja el denominador en −1.
    igual(aTextoE(cocienteE(V(1), sumaE(V(1), dos) ?? V(0)) ?? V(0)), "-1 + √2");
  });

  test("la aritmética se queda en el cuerpo y se cierra sola", () => {
    const phi = surd(1, 1, 5, 2);                       // (1+√5)/2
    igual(aTextoE(phi), "(1 + √5)/2");
    // φ² = φ + 1, la identidad que DEFINE la áurea. Exacta, no «aproximadamente».
    const phi2 = productoE(phi, phi) ?? V(0);
    assert(igualesE(phi2, sumaE(phi, V(1)) ?? V(0)), "φ² debe ser exactamente φ+1");
    // (√2)² = 2: el radical desaparece y el valor vuelve a ser racional.
    const dos = raizCuadrada(rac(2n)) ?? V(0);
    igual(aTextoE(productoE(dos, dos) ?? V(0)), "2");
    igual(aTextoE(restaE(dos, dos) ?? V(0)), "0");
    igual(racionalDe(productoE(dos, dos) ?? V(0)) !== null, true, "y vuelve a ser racional:");
  });

  test("dos radicales DISTINTOS quedan fuera de alcance, y se dice", () => {
    // √2 + √3 es un número de grado 4: no cabe en ℚ(√d) y no se finge que quepa.
    const dos = raizCuadrada(rac(2n)) ?? V(0);
    const tres = raizCuadrada(rac(3n)) ?? V(0);
    igual(sumaE(dos, tres), null);
    igual(productoE(dos, tres), null);
  });

  test("la igualdad es EXACTA, no por decimales", () => {
    const a = surd(7, -1, 13, 2);                       // (7−√13)/2
    const b = cocienteE(restaE(V(7), raizCuadrada(rac(13n)) ?? V(0)) ?? V(0), V(2)) ?? V(0);
    assert(igualesE(a, b), "(7−√13)/2 debe ser el MISMO valor por los dos caminos");
    aprox(aNumeroE(a), (7 - Math.sqrt(13)) / 2, 1e-15, "y su decimal coincide:");
  });

  test("se escribe con un solo trazo de fracción, y también en LaTeX", () => {
    igual(aTextoE(surd(7, -1, 13, 2)), "(7 - √13)/2");
    igual(aTextoE(surd(0, -3, 2, 2)), "-3√2/2");
    igual(aTextoE(surd(1, 1, 5, 1)), "1 + √5");
    igual(aTextoE(V(-3, 4)), "-3/4");
    igual(aLatexE(surd(7, -1, 13, 2)), "\\frac{7 - \\sqrt{13}}{2}");
    igual(aLatexE(V(5)), "5");
  });

  test("evaluar un polinomio en un irracional se queda exacto", () => {
    const phi = surd(1, 1, 5, 2);
    // p(x) = x² − x − 1 se anula EXACTAMENTE en φ (es su polinomio mínimo).
    igual(aTextoE(evaluarExacto(P(-1, -1, 1), phi) ?? V(9)), "0");
    igual(aTextoE(evaluarExacto(P(3, -1), phi) ?? V(9)), "(5 - √5)/2");
  });

  test("la reconstrucción racional propone, y la división exacta dispone", () => {
    igual(aTexto(racionalCercano(0.5) ?? CERO), "1/2");
    igual(aTexto(racionalCercano(-7) ?? CERO), "-7");
    igual(aTexto(racionalCercano(1 / 3) ?? CERO), "1/3");
    // Un irracional no se deja reconstruir con denominador acotado: se dice que no.
    igual(racionalCercano(Math.SQRT2, 1000n), null);
  });
});

describe("mate · formas cerradas de las raíces", () => {
  const forma = (p: Polinomio): string =>
    raicesConForma(p).map((r) => (r.exacto ? aTextoE(r.exacto) : `~${r.raiz.valor.toPrecision(6)}`))
      .join(" ");

  test("las racionales siguen saliendo racionales", () => {
    igual(forma(P(0, -1, 1)), "0 1");                     // x² − x
    igual(forma(P(-3, 2)), "3/2");                        // 2x − 3
  });

  test("una cuadrática irracional sale como el radical que es", () => {
    igual(forma(P(-2, 0, 1)), "-√2 √2");                  // x² − 2
    igual(forma(P(9, -7, 1)), "(7 - √13)/2 (7 + √13)/2"); // x² − 7x + 9: EL caso
    igual(forma(P(-1, -1, 1)), "(1 - √5)/2 (1 + √5)/2");  // x² − x − 1: la áurea
  });

  test("encuentra los factores cuadráticos DENTRO de un polinomio mayor", () => {
    // (x²−2)(x²−3) = x⁴ − 5x² + 6. Ninguna de sus cuatro raíces es racional, y las cuatro
    // tienen forma cerrada porque el polinomio se parte en dos factores de grado 2 sobre ℚ.
    igual(forma(P(6, 0, -5, 0, 1)), "-√3 -√2 √2 √3");
    // (x−1)(x²−2): una racional y dos irracionales, mezcladas.
    igual(forma(productoPol(P(-1, 1), P(-2, 0, 1))), "-√2 1 √2");
  });

  test("grado 3 irreducible: no hay forma cerrada al alcance, y no se inventa", () => {
    const r = raicesConForma(P(-2, 0, 0, 1));             // x³ − 2
    igual(r.length, 1);
    igual(r[0].exacto, null, "∛2 no se finge representable:");
    aprox(r[0].raiz.valor, Math.cbrt(2), 1e-12, "pero el valor está:");
  });

  test("x⁴ − 10x² + 1 es irreducible sobre ℚ: sus raíces (±√2±√3) no se fingen", () => {
    const r = raicesConForma(P(1, 0, -10, 0, 1));
    igual(r.length, 4, "cuatro raíces reales:");
    for (const uno of r) igual(uno.exacto, null, "de grado 4, sin forma cerrada aquí:");
  });

  test("una raíz doble irracional no se cuenta dos veces ni pierde su forma", () => {
    igual(forma(productoPol(P(-2, 0, 1), P(-2, 0, 1))), "-√2 √2");   // (x²−2)²
  });
});

describe("mate · exactitud simbólica de las soluciones", () => {
  const exactos = (...ecs: string[]): string => {
    const r = resolverBloque(ecs);
    if (r.tipo !== "puntos") return r.tipo;
    return r.puntos.map((s) =>
      `(${s.exactoX ? aTextoE(s.exactoX) : "~"}, ${s.exactoY ? aTextoE(s.exactoY) : "~"})`).join(" ");
  };

  test("A) el caso con valor absoluto sale EXACTO, no decimal", () => {
    igual(exactos("x + |y|^{1/2} = 3", "x - y = 0"), "((7 - √13)/2, (7 - √13)/2)");
    const r = resolverBloque(["x + |y|^{1/2} = 3", "x - y = 0"]);
    assert(r.tipo === "puntos", "resuelve");
    if (r.tipo !== "puntos") return;
    igual(r.aproximado, false, "exacta:");
    igual(r.parcial, false, "y completa:");
    // El decimal sigue estando, para el trazado y para la verificación: lo que cambia es que ya
    // no es LA respuesta.
    aprox(r.puntos[0].x, (7 - Math.sqrt(13)) / 2, 1e-15, "decimal coherente:");
  });

  test("D) la circunferencia no se degrada Y ADEMÁS gana forma cerrada", () => {
    igual(exactos("x^2 + y^2 = 25", "y = x"), "(-5√2/2, -5√2/2) (5√2/2, 5√2/2)");
    igual(resolverBloque(["x^2 + y^2 = 25", "y = x"]).aproximado, false, "sigue exacta:");
  });

  test("la sección áurea aparece escrita como lo que es", () => {
    igual(exactos("y = x^2", "y = x + 1"), "((1 - √5)/2, (3 - √5)/2) ((1 + √5)/2, (3 + √5)/2)");
  });

  test("una vertical irracional también: √8 se reduce a 2√2", () => {
    igual(exactos("x^2 = 8", "y = 0"), "(-2√2, 0) (2√2, 0)");
    igual(exactos("x^2 = 2", "y = x"), "(-√2, -√2) (√2, √2)");
  });

  test("lo que NO tiene forma cerrada se marca, no se inventa", () => {
    igual(exactos("x^3 = 2", "y = 0"), "(~, 0)");
  });

  test("las cuatro raíces de un cuártico factorizable salen exactas", () => {
    igual(exactos("x^4 - 5x^2 + 6 = 0", "y = 0"), "(-√3, 0) (-√2, 0) (√2, 0) (√3, 0)");
  });
});

describe("mate · fronteras de cada transformación (adversariales)", () => {
  const puntos = (...ecs: string[]): string => {
    const r = resolverBloque(ecs);
    return r.tipo === "puntos" ? r.puntos.map((s) => `(${s.x}, ${s.y})`).join(" ") : r.tipo;
  };
  /** Residuo de una ecuación en un punto, evaluado SIN pasar por el motor. */
  const cumple = (f: (x: number, y: number) => number, x: number, y: number): boolean =>
    Math.abs(f(x, y)) <= 1e-6 * (1 + x * x + y * y);

  test("E) la raíz espuria de elevar al cuadrado se elimina (dos familias)", () => {
    // √(x−1) = x−3 eleva a x²−7x+10 = 0 → {2, 5}. Solo 5 la cumple: en x=2 el lado derecho es
    // negativo, y una raíz de índice par no lo es nunca.
    igual(puntos("sqrt(x - 1) = x - 3", "y = 0"), "(5, 0)");
    // √x = x−2 eleva a x²−5x+4 = 0 → {1, 4}. Solo 4.
    igual(puntos("sqrt(x) = x - 2", "y = 0"), "(4, 0)");
  });

  test("F) las DOS ramas de un valor absoluto se cruzan, no solo la principal", () => {
    igual(puntos("|y| = 2", "y = x"), "(-2, -2) (2, 2)");
    // Aquí la rama positiva no corta y la NEGATIVA sí: probando una sola no habría nada.
    igual(puntos("|y| = x", "y = x - 2"), "(1, -1)");
  });

  test("G) sin solución real: la lista vacía es una AFIRMACIÓN, no un fallo", () => {
    igual(puntos("x^2 + y^2 = 1", "y = 5"), "");
    const r = resolverBloque(["x^2 + y^2 = 1", "y = 5"]);
    igual(r.tipo, "puntos", "la circunferencia SÍ se resolvió:");
    igual(r.parcial, false, "se miró en todas partes, así que «no se cortan» es cierto");
  });

  test("H) soluciones múltiples: ninguna se pierde y ninguna se repite", () => {
    igual(puntos("nthRoot(y, 3) = x", "y = x"), "(-1, -1) (0, 0) (1, 1)");
    igual(puntos("x^4 - 5x^2 + 4 = 0", "y = 0"), "(-2, 0) (-1, 0) (1, 0) (2, 0)");
  });

  test("I) un valor absoluto cuya rama NO tiene solución no ensucia el resultado", () => {
    igual(puntos("x + |y| = 3", "x - y = 0"), "(1.5, 1.5)");
    igual(puntos("|y| = -1", "y = x"), "noResoluble", "ni se enumera: NO es «no hay»");
  });

  test("J) raíces de índice PAR e IMPAR se distinguen en su dominio", () => {
    // Impar: definida en todo ℝ y de un solo valor.
    igual(puntos("y^{1/3} = 2", "y = x"), "(8, 8)");
    igual(puntos("nthRoot(y, 3) = -2", "x = y"), "(-8, -8)");
    // Par: solo donde el radicando es ≥ 0, y su resultado nunca es negativo.
    igual(puntos("y^{1/2} = 3", "x = y"), "(9, 9)");
    igual(puntos("sqrt(y) = -1", "y = x"), "noResoluble");
  });

  test("exponentes racionales p/q, con las dos ramas cuando toca", () => {
    // y^(2/3) = 4 → y = ±8: el cuadrado dentro de la raíz cúbica pierde el signo, y las dos
    // preimágenes son soluciones.
    igual(puntos("y^{2/3} = 4", "x = 0"), "(0, -8) (0, 8)");
    // y^(3/2) = 8 → y = 4, una sola: la raíz cuadrada exterior ya fijaba el signo.
    igual(puntos("y^{3/2} = 8", "x = 0"), "(0, 4)");
  });

  test("denominadores: no se inventan soluciones donde la curva no existe", () => {
    igual(puntos("1/y = x", "y = x"), "(-1, -1) (1, 1)");
    igual(puntos("y = 1/x", "y = 0"), "", "la hipérbola no corta el eje X");
    igual(puntos("1/(y-1) = x", "y = 2"), "(1, 2)");
  });

  test("guardas anidadas: cada capa conserva la suya y se verifica el ORIGINAL", () => {
    // Dos radicales repartidos: el despeje eleva al cuadrado dos veces y arrastra dos guardas.
    const r = resolverBloque(["sqrt(y + 1) + sqrt(y - 2) = x", "x = 3"]);
    assert(r.tipo === "puntos", `debe resolver, dio ${r.tipo}`);
    if (r.tipo !== "puntos") return;
    assert(r.puntos.length > 0, "y encontrar la solución");
    for (const s of r.puntos)
      assert(cumple((x, y) => Math.sqrt(y + 1) + Math.sqrt(y - 2) - x, s.x, s.y),
        `(${s.x}, ${s.y}) no cumple la ecuación original`);
  });

  test("los polos no se cuelan como soluciones", () => {
    // Una asíntota cambia de signo igual que una raíz; no debe listarse.
    igual(puntos("y = 1/x", "y = 0"), "");
    igual(puntos("y = 1/(x-1)", "y = 0"), "");
  });

  test("π y e no destruyen el carril numérico", () => {
    igual(puntos("y = x", "x - y = pi"), "", "paralelas separadas por π: no se cortan");
    const r = resolverBloque(["|y| = pi", "y = x"]);
    assert(r.tipo === "puntos" && r.puntos.length === 2, "π dentro de un valor absoluto");
    if (r.tipo !== "puntos") return;
    aprox(r.puntos[1].x, Math.PI, 1e-9, "la rama positiva:");
    igual(r.aproximado, true, "con π no se promete exactitud:");
    igual(puntos("y = e", "x = 0"), "(0, 2.718281828459045)");
  });

  test("el ± del bloque son DOS curvas, y cada una aporta sus cortes", () => {
    // `y = ±⁴√(1−x⁴)` contra `y = ∛x`: las dos curvas son IMPARES, así que sus cortes van
    // por parejas simétricas —uno en cada rama del ±—. Se listaba solo el de la rama
    // positiva: el plano dibujaba las dos mitades (el trazado sí expandía el ±) y el cuadro
    // ⓘ nombraba un punto. Las dos mitades del motor discrepaban sobre cuántas curvas hay.
    const r = resolverBloque(["y = \\pm \\sqrt[4]{1-x^{4}}", "y = \\sqrt[3]{x}"]);
    assert(r.tipo === "puntos", `debería resolverse, dio ${r.tipo}`);
    if (r.tipo !== "puntos") return;
    igual(r.puntos.length, 2, "un corte por rama:");
    aprox(r.puntos[0].x, -0.7507490673728864, 1e-6, "la rama negativa, que faltaba:");
    aprox(r.puntos[0].y, -0.9088626726047159, 1e-6, "su ordenada:");
    aprox(r.puntos[1].x, 0.7507490673728864, 1e-6, "la positiva, que ya estaba:");
    // Y los dos cumplen las DOS ecuaciones, cada uno con su signo.
    for (const s of r.puntos) {
      aprox(s.y, Math.cbrt(s.x), 1e-6, `(${s.x.toFixed(4)}, …) está sobre ∛x`);
      aprox(Math.abs(s.y), Math.pow(1 - s.x ** 4, 0.25), 1e-6, "y sobre el squircle");
    }
  });

  test("una rama del ± NO se cruza con su hermana", () => {
    // Donde el radicando se anula, las dos mitades de `y = ±√(4−x²)` se tocan (x=±2, y=0).
    // Eso no es un corte entre curvas distintas: es la misma curva cerrándose, y enumerarlo
    // sería inventar soluciones. Contra una recta que NO pasa por ahí, la lista tiene que
    // traer los cortes con la recta y ninguno de esos dos.
    const r = resolverBloque(["y = \\pm\\sqrt{4-x^2}", "y = 1"]);
    assert(r.tipo === "puntos", `debería resolverse, dio ${r.tipo}`);
    if (r.tipo !== "puntos") return;
    for (const s of r.puntos)
      aprox(s.y, 1, 1e-6, `(${s.x.toFixed(4)}, ${s.y.toFixed(4)}) no está sobre y=1`);
    igual(r.puntos.length, 2, "la recta corta la semicircunferencia de arriba en dos puntos:");
  });

  test("el bloque distingue «no se cortan» de «no lo sé»", () => {
    const r = resolverBloque(["y = x", "y = x + 1", "\\tan(y^2) + |y|^{1/2} = x^x"]);
    assert(r.tipo === "puntos", `las dos rectas se resuelven, dio ${r.tipo}`);
    if (r.tipo !== "puntos") return;
    igual(r.puntos.length, 0, "las dos rectas no se cortan");
    igual(r.parcial, true, "pero de la tercera no se sabe nada: la lista es PARCIAL");
  });

  test("el intervalo que se anuncia es el que de verdad se ha barrido", () => {
    const enX = resolverBloque(["y = \\sin x", "y = x/2"]);
    assert(enX.tipo === "puntos" && enX.exploradas.join() === "x", "y=f(x) → se barre x");
    const enY = resolverBloque(["x = \\sin y", "x = y/2"]);
    assert(enY.tipo === "puntos" && enY.exploradas.join() === "y", "x=g(y) → se barre y");
    if (enY.tipo !== "puntos") return;
    igual(enY.puntos.length, 3, "y encuentra las mismas tres soluciones, giradas");
  });
});

describe("mate · constantes algebraicas que son racionales exactos", () => {
  const K = (expr: string): string => {
    const n = parse(insertarProductoImplicito(normalizarEntrada(expr))) as unknown as NodoTest;
    const r = constanteExacta(n);
    return r === null ? "null" : aTexto(r);
  };

  test("una raíz EXACTA se reconoce, escrita como se escriba", () => {
    igual(K("sqrt(16)"), "4");
    igual(K("nthRoot(64, 3)"), "4");
    igual(K("8^{2/3}"), "4");
    igual(K("x^{0}"), "null", "con variable dentro no es constante");
    igual(K("sqrt(16/9)"), "4/3");
    igual(K("nthRoot(-8, 3)"), "-2", "índice impar admite radicando negativo");
    igual(K("(1/4)^{1/2}"), "1/2");
  });

  test("lo que NO es racional se rechaza: no se cuela ningún decimal", () => {
    igual(K("sqrt(2)"), "null");
    igual(K("nthRoot(2, 3)"), "null");
    igual(K("pi"), "null");
    igual(K("e"), "null");
    igual(K("sqrt(-4)"), "null", "índice par de un negativo no es real");
    igual(K("2^{1/2}"), "null");
  });

  test("aritmética exacta con radicales que sí cierran", () => {
    igual(K("sqrt(9) + sqrt(16)"), "7");
    igual(K("sqrt(2)*sqrt(2)"), "null", "√2·√2 vale 2, pero cada factor NO es racional");
    igual(K("|-3|"), "3");
    igual(K("1/2 + 1/3"), "5/6");
    igual(K("0.1 + 0.2"), "3/10", "se leen los dígitos, no los bits");
  });

  test("la raíz entera se decide con enteros, no con `Math.sqrt`", () => {
    // 10^30 + 1 al cuadrado: un double no distingue este cuadrado perfecto de su vecino.
    const grande = (10n ** 30n + 1n) ** 2n;
    igual(raizEnteraK(grande, 2), 10n ** 30n + 1n);
    igual(raizEnteraK(grande + 1n, 2), null);
    igual(raizEnteraK(8n, 3), 2n);
    igual(raizEnteraK(9n, 3), null);
  });

  test("y eso hace EXACTO lo que antes salía en decimales", () => {
    // `y^{3/2} = 8` despeja a `y = nthRoot(8², 3)`, que es 4 exacto. Antes el carril exacto
    // rechazaba la rama por llevar un radical y el numérico devolvía 3.9999999999999996.
    const r = resolverBloque(["y^{3/2} = 8", "x = 0"]);
    assert(r.tipo === "puntos" && r.puntos.length === 1, "una solución");
    if (r.tipo !== "puntos") return;
    igual(r.puntos[0].y, 4, "y exactamente 4, no 3.9999999999999996");
    igual(r.puntos[0].exactoY && aTextoE(r.puntos[0].exactoY), "4");
    igual(r.aproximado, false, "y por el carril exacto:");
  });
});

describe("mate · el orden de los cuatro escalones es parte del contrato", () => {
  // Los escalones, y lo que cada uno puede prometer:
  //   1 exacto directo · 2 numérico directo (y=f(x) contra y=g(x)) · 3 ramas · 4 numérico
  //   SIMÉTRICO (curvas tumbadas y mixtas).
  // El orden no es una preferencia: cada escalón sabe resolver cosas que el siguiente resuelve
  // PEOR, así que adelantar cualquiera degrada respuestas que ya eran buenas. Estas pruebas
  // fijan esa propiedad, que se rompió una vez al ampliar el escalón 2.

  test("el numérico NO se adelanta a las ramas cuando estas resuelven exacto", () => {
    // `|y| = x` tiene la x despejada, así que un barrido simétrico podría resolverlo… en
    // decimales. Las ramas lo resuelven EXACTO, y son las que tienen que contestar.
    const r = resolverBloque(["|y| = x", "y = x - 2"]);
    assert(r.tipo === "puntos", "resuelve");
    if (r.tipo !== "puntos") return;
    igual(r.aproximado, false, "exacto, no aproximado:");
    igual(r.puntos[0].exactoX && aTextoE(r.puntos[0].exactoX), "1");
    igual(r.puntos[0].exactoY && aTextoE(r.puntos[0].exactoY), "-1");
  });

  test("lo mismo con una raíz impar escrita del lado de la x", () => {
    const r = resolverBloque(["nthRoot(y, 3) = x", "y = x"]);
    assert(r.tipo === "puntos" && r.puntos.length === 3, "tres soluciones");
    if (r.tipo !== "puntos") return;
    igual(r.aproximado, false, "y las tres exactas:");
    igual(r.puntos.map((s) => (s.exactoX ? aTextoE(s.exactoX) : "~")).join(" "), "-1 0 1");
  });

  test("el escalón 4 existe: resuelve lo que ninguno de los tres anteriores puede", () => {
    // Una horizontal transcendente contra una vertical: ni polinómica, ni `y = f(x)` las dos,
    // ni despejable en ramas útiles. El barrido mixto sí puede, y dice que es aproximado.
    const r = resolverBloque(["y = e", "x = 0"]);
    assert(r.tipo === "puntos" && r.puntos.length === 1, "una solución");
    if (r.tipo !== "puntos") return;
    aprox(r.puntos[0].y, Math.E, 1e-9, "y = e:");
    igual(r.puntos[0].x, 0, "sobre la vertical:");
    igual(r.aproximado, true, "aproximada, porque e no se puede escribir exacto aquí:");
  });

  test("el escalón 2 sigue teniendo el alcance de siempre, ni más ni menos", () => {
    // Su contrato es `y = f(x)` contra `y = g(x)`. Una implícita sigue fuera…
    igual(resolverNumerico("x^2 + y^2 = 9", "y = \\sin x").tipo, "noResoluble");
    // …y una TUMBADA también, salvo que se pidan los modos simétricos explícitamente.
    igual(resolverNumerico("x = \\sin y", "x = y/2").tipo, "noResoluble");
    igual(resolverNumerico("x = \\sin y", "x = y/2", { simetrico: true }).tipo, "puntos");
  });
});

describe("mate · coste acotado (el panel se abre, no se cuelga)", () => {
  /** Milisegundos de una llamada, con una vuelta previa para no medir la compilación. */
  const cuesta = (ecs: string[]): number => {
    resolverBloque(ecs);
    const t0 = Date.now();
    resolverBloque(ecs);
    return Date.now() - t0;
  };

  test("con relación explícita, el grado alto NO dispara el coste", () => {
    // `x⁸+y⁸=1` ∩ `y=x`: la ordenada de una abscisa irracional se obtenía sustituyendo una
    // aproximación de 17 dígitos de denominador en la ecuación de grado 8 y resolviéndola otra
    // vez —2,3 s POR RAÍZ, cuatro segundos y medio de panel—. Con la relación explícita la
    // ordenada es f(x) y se evalúa; el resultado es el mismo y cuesta microsegundos.
    const ms = cuesta(["x^8 + y^8 = 1", "y = x"]);
    assert(ms < 1000, `debe resolverse en menos de 1 s, tardó ${ms} ms`);
    const r = resolverBloque(["x^8 + y^8 = 1", "y = x"]);
    assert(r.tipo === "puntos" && r.puntos.length === 2, "y encontrar las dos soluciones");
    if (r.tipo !== "puntos") return;
    // x⁸+x⁸=1 → x = ±(1/2)^{1/8}
    aprox(r.puntos[1].x, Math.pow(0.5, 1 / 8), 1e-12, "la solución positiva:");
    aprox(r.puntos[1].y, r.puntos[1].x, 1e-15, "sobre la recta y = x:");
  });

  test("la expansión de ramas está acotada: nunca más de cuatro por ecuación", () => {
    for (const ec of ["x + |y|^{1/2} = 3", "|y| = |x|", "x^2 + y^2 = 25", "|y| = 2",
                      "y = x", "sqrt(y + 1) + sqrt(y - 2) = x"]) {
      const r = ramasDe(ec);
      if (r === null) continue;
      assert(r.length <= 4, `${ec} produjo ${r.length} ramas: la cota son 4 (dos ejes de signo)`);
    }
  });

  test("un bloque grande con curvas de todo tipo sigue siendo interactivo", () => {
    const ms = cuesta([
      "x + |y|^{1/2} = 3", "x - y = 0", "x^2 + y^2 = 9", "y = \\sin x", "y = 2^x",
    ]);
    assert(ms < 2000, `diez parejas deben resolverse en menos de 2 s, tardó ${ms} ms`);
  });
});

describe("mate · «infinitas por periodicidad» es una afirmación, y se comprueba", () => {
  const infinitas = (...ecs: string[]): boolean =>
    infinitasPorPeriodicidad(resolverBloque(ecs), true);

  test("lo son cuando las soluciones siguen apareciendo hasta el borde explorado", () => {
    assert(infinitas("y = \\sin x", "y = 0"), "sin x = 0 sí tiene infinitas");
    assert(infinitas("y = \\tan x", "y = 0"), "tan x = 0 también");
    assert(infinitas("x = \\sin y", "x = 0"), "y tumbado, midiendo la variable barrida");
  });

  test("NO lo son cuando se acaban dentro del intervalo (el fallo que había)", () => {
    // `sin x = x/2` tiene EXACTAMENTE tres soluciones, todas entre −2 y 2. El criterio viejo
    // («hay una trig y salen ≥3») las anunciaba como infinitas: una afirmación falsa sobre un
    // sistema de manual.
    assert(!infinitas("y = \\sin x", "y = x/2"), "sin x = x/2 tiene tres, no infinitas");
    assert(!infinitas("y = \\sin x", "|y| = x/10"), "seis, no infinitas");
    assert(!infinitas("x^2 + y^2 = 9", "y = \\sin x"), "dos, no infinitas");
  });

  test("un sistema EXACTO nunca se anuncia como periódico", () => {
    // Un polinómico no es periódico, y además su lista es completa: no hay nada que deducir.
    igual(infinitasPorPeriodicidad(resolverBloque(["y = x", "y = x^2"]), true), false);
    // Y sin trigonometría tampoco, por muchas soluciones que haya.
    igual(infinitasPorPeriodicidad(resolverBloque(["y = \\sin x", "y = 0"]), false), false);
  });
});

describe("mate · la solución se ESCRIBE como se escribe a mano", () => {
  const V = (n: number, d = 1) => exacto(rac(BigInt(n), BigInt(d)));
  /** `(a + b√d)/den`, como en el bloque de ℚ(√d). */
  const surd = (a: number, b: number, d: number, den = 1): ValorExacto => {
    const raiz = raizCuadrada(rac(BigInt(d))) ?? V(0);
    const parte = productoE(exacto(rac(BigInt(b), BigInt(den))), raiz) ?? V(0);
    return sumaE(exacto(rac(BigInt(a), BigInt(den))), parte) ?? V(0);
  };
  const punto = (x: ValorExacto | null, y: ValorExacto | null, xn = 0, yn = 0) =>
    solucionALatex({ x: xn, y: yn, exactoX: x, exactoY: y });

  test("el signo sale FUERA de la fracción, como en el resto del plugin", () => {
    // Es la convención de `numeroALatex` y la que defienden las pruebas de obs-derivate
    // (`d/dx 1/x` se lee −1/x², no (−1)/x²). Aquí se aplica al valor exacto.
    igual(aLatexE(V(-3, 2)), "-\\frac{3}{2}");
    igual(aLatexE(surd(0, -3, 2, 2)), "-\\frac{3\\sqrt{2}}{2}");
    igual(aLatexE(surd(-7, -1, 13, 2)), "-\\frac{7 + \\sqrt{13}}{2}");
    igual(aLatexE(surd(0, -1, 2)), "-\\sqrt{2}");
    for (const v of [V(-3, 2), surd(0, -3, 2, 2), surd(-7, -1, 13, 2), V(-1, 7)])
      assert(!aLatexE(v).includes("\\frac{-"), "ningún numerador debe empezar por menos");
  });

  test("el numerador no empieza por un signo que no es suyo", () => {
    // (−7 + √13)/2 se escribe (√13 − 7)/2: el menos de delante se leería como el signo del
    // valor entero, y no lo es.
    igual(aLatexE(surd(-7, 1, 13, 2)), "\\frac{\\sqrt{13} - 7}{2}");
    igual(aLatexE(surd(7, -1, 13, 2)), "\\frac{7 - \\sqrt{13}}{2}");
    igual(aLatexE(surd(0, 1, 2, 2)), "\\frac{\\sqrt{2}}{2}");
    igual(aLatexE(surd(0, 2, 2)), "2\\sqrt{2}");
    igual(aLatexE(V(0)), "0");
  });

  test("EL CASO: el par ordenado deja de ser ambiguo", () => {
    // `((7 - √13)/2, (7 - √13)/2)` en texto plano obliga a contar paréntesis para saber cuál
    // es la coma que separa el par. Con la raya de fracción no hay nada que contar.
    const r = surd(7, -1, 13, 2);
    igual(punto(r, r),
      "\\left(\\frac{7 - \\sqrt{13}}{2},\\ \\frac{7 - \\sqrt{13}}{2}\\right)");
    // Paréntesis ESCALABLES: el contenido tiene dos pisos y unos de altura fija se quedarían
    // a media asta.
    assert(punto(r, r).startsWith("\\left("), "los paréntesis deben crecer con el contenido");
    // Y la coma lleva su espacio: sin él, el segundo miembro se pega al primero.
    assert(punto(r, r).includes(",\\ "), "la coma separa, y se tiene que ver");
  });

  test("el decimal solo cuando no hay forma exacta, y sin notación de programador", () => {
    igual(punto(null, null, 1.6972243622680054, 2), "\\left(1.697,\\ 2\\right)");
    // `1.7e-5` con la `e` en cursiva, dentro de un par, se lee como el número e.
    igual(decimalALatex(0.000017), "1.7\\cdot 10^{-5}");
    igual(decimalALatex(1234), "1.2\\cdot 10^{3}");
    igual(decimalALatex(0), "0");
    igual(decimalALatex(-0.5), "-0.5");
  });

  test("una coordenada exacta y la otra no conviven en el mismo par", () => {
    igual(punto(V(0), null, 0, 1.5), "\\left(0,\\ 1.5\\right)");
    igual(punto(null, V(2), 1.5, 2), "\\left(1.5,\\ 2\\right)");
  });

  test("el RESPALDO en texto plano sigue siendo el de antes", () => {
    // Es lo que se ve si el renderizado matemático no llega a completarse; el cuadro no se
    // puede quedar mudo.
    const r = surd(7, -1, 13, 2);
    igual(solucionATexto({ x: 0, y: 0, exactoX: r, exactoY: r }), "((7 - √13)/2, (7 - √13)/2)");
    igual(solucionATexto({ x: 1.5, y: 2, exactoX: null, exactoY: null }), "(1.5, 2)");
  });

  test("de punta a punta: lo que resuelve el motor es lo que se pinta", () => {
    const r = resolverBloque(["x + |y|^{1/2} = 3", "x - y = 0"]);
    assert(r.tipo === "puntos" && r.puntos.length === 1, "el caso debe seguir resolviéndose");
    if (r.tipo !== "puntos") return;
    igual(solucionALatex(r.puntos[0]),
      "\\left(\\frac{7 - \\sqrt{13}}{2},\\ \\frac{7 - \\sqrt{13}}{2}\\right)");
  });
});
