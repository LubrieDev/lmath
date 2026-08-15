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
    igual(r.puntos[0].exactoX, null, "irracional, no se finge exacta:");
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
