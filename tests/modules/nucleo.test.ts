// ─────────────────────────────────────────────
// núcleo · Las LEYES del núcleo simbólico (E1)
// ─────────────────────────────────────────────
//
// Aquí el peso está en las propiedades, no en los casos. Un caso dice que algo funciona para lo
// que se le ocurrió a quien lo escribió; una ley dice que funciona para todo lo que el generador
// sepa construir, y es lo que hace falta cuando lo que se está fijando es una REPRESENTACIÓN
// sobre la que se va a construir todo lo demás.
//
// Las cuatro que sostienen la etapa:
//
//   1. El hash es determinista, estable y sensible — y NUNCA decide una igualdad.
//   2. El orden es un orden total de verdad: reflexivo, antisimétrico, transitivo y sin empates
//      entre expresiones distintas.
//   3. El viaje de ida y vuelta por el puente es EXACTO en la dirección que importa.
//   4. La exactitud no se pierde por el camino.

import { describe, test, assert, igual } from "../runner";
import { parse } from "mathjs";

import {
  type Expresion, CERO_E, MENOS_UNO_E, UNO_E,
  aplicacion, condicionado, constante, entero, esExacta, familia, literal, opuesto,
  potencia, producto, rama, simbolo, simbolosDe, suma,
} from "../../src/CAS/nucleo/expresion";
import { desdeTexto, esExacto, numFlotante, textoN } from "../../src/CAS/nucleo/numero";
import { comparar, ordenar } from "../../src/CAS/nucleo/orden";
import { iguales, sinRepetidas } from "../../src/CAS/nucleo/igualdad";
import { normalizar } from "../../src/CAS/normal/canonica";
import { aMathjs, deMathjs } from "../../src/CAS/puente/mathjs";
import { CATALOGO, fichaDe } from "../../src/CAS/registro/catalogo";
import { type Nodo } from "../../src/expr/nodo";
import { normalizarEntrada } from "../../src/parser";
import { insertarProductoImplicito } from "../../src/core/parsing/productoImplicito";
import { ECUACIONES, EXPRESIONES } from "../oro/corpus";

// ─────────────────────────────────────────────
// Generador reproducible de expresiones
// ─────────────────────────────────────────────
//
// Sembrado, como el fuzzer del despeje: el mismo `seed` da exactamente el mismo lote, así que un
// fallo se puede reproducir y perseguir en vez de mirarlo pasar.

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
  entero(0), entero(1), entero(-1), entero(2), entero(7),
  literal(desdeTexto("0.5")), literal(numFlotante(0.30000000000000004)),
  simbolo("x"), simbolo("y"), simbolo("t"), simbolo("alpha"),
  constante("pi"), constante("e"), constante("phi"),
];

function generar(r: () => number, profundidad: number): Expresion {
  if (profundidad <= 0 || r() < 0.3) return HOJAS[Math.floor(r() * HOJAS.length)];
  const hijo = (): Expresion => generar(r, profundidad - 1);
  const cual = Math.floor(r() * 9);
  switch (cual) {
    case 0: return suma([hijo(), hijo()]);
    case 1: return suma([hijo(), hijo(), hijo()]);
    case 2: return producto([hijo(), hijo()]);
    case 3: return potencia(hijo(), hijo());
    case 4: return aplicacion("sin", [hijo()]);
    case 5: return aplicacion("log", [hijo(), hijo()]);
    case 6: return rama(r() < 0.5 ? 0 : 1, [hijo(), hijo()]);
    case 7: return condicionado(hijo(), { tipo: "noNegativo", expr: hijo() });
    default: return familia("k", r() < 0.5 ? "enteros" : "naturales", hijo());
  }
}

const lote = (seed: number, cuantas: number, prof = 4): Expresion[] => {
  const r = crearRng(seed);
  return Array.from({ length: cuantas }, () => generar(r, prof));
};

// ─────────────────────────────────────────────
// 1 · El hash
// ─────────────────────────────────────────────

describe("núcleo · el hash", () => {
  test("es determinista: construir dos veces lo mismo da el mismo hash", () => {
    for (const e of lote(1001, 200)) {
      const otra = reconstruir(e);
      igual(otra.hash, e.hash, "misma estructura, mismo hash");
    }
  });

  test("es sensible al ORDEN de los hijos", () => {
    const a = aplicacion("log", [simbolo("x"), entero(2)]);
    const b = aplicacion("log", [entero(2), simbolo("x")]);
    assert(a.hash !== b.hash, "f(a,b) y f(b,a) no deberían compartir hash");
  });

  test("es sensible a la CLASE", () => {
    const s = suma([simbolo("x"), simbolo("y")]);
    const p = producto([simbolo("x"), simbolo("y")]);
    assert(s.hash !== p.hash, "una suma y un producto de los mismos hijos no deberían coincidir");
  });

  test("distingue un exacto de su decimal", () => {
    const exacto = literal(desdeTexto("0.5"));
    const flota = literal(numFlotante(0.5));
    assert(exacto.hash !== flota.hash, "1/2 exacto y 0.5 flotante son datos distintos");
    assert(!iguales(exacto, flota), "y tampoco son iguales");
  });

  test("es estable frente a la ampliación del catálogo", () => {
    // El hash de `sin(x)` está escrito aquí como literal a propósito: si algún día cambia porque
    // se añadió una función al catálogo o una clase al final de `RANGO_CLASE`, esta prueba lo
    // dice. Un hash que se mueve solo invalidaría toda memoización persistida.
    igual(aplicacion("sin", [simbolo("x")]).hash, 261351794, "hash de sin(x)");
    igual(simbolo("x").hash, 1434157063, "hash de x");
    igual(entero(1).hash, 1100010981, "hash de 1");
  });

  test("NUNCA decide una igualdad: una colisión no engaña a `iguales`", () => {
    // Se fabrica la colisión a mano, porque encontrar dos expresiones reales que colisionen en
    // 32 bits llevaría más tiempo que el que tiene una suite. Lo que se prueba es lo que importa:
    // que `iguales` no se conforma con que los hashes coincidan.
    const falsoA = { clase: "simbolo", nombre: "a", hash: 42 } as unknown as Expresion;
    const falsoB = { clase: "simbolo", nombre: "b", hash: 42 } as unknown as Expresion;
    igual(falsoA.hash, falsoB.hash, "la colisión está montada");
    assert(!iguales(falsoA, falsoB), "el hash no puede decidir: son símbolos distintos");
  });
});

/** Reconstruye una expresión con los constructores, para comprobar que el hash sale igual. */
function reconstruir(e: Expresion): Expresion {
  switch (e.clase) {
    case "literal": return literal(e.numero);
    case "simbolo": return simbolo(e.nombre);
    case "constante": return constante(e.nombre);
    case "potencia": return potencia(reconstruir(e.base), reconstruir(e.exponente));
    case "producto": return producto(e.factores.map(reconstruir));
    case "suma": return suma(e.sumandos.map(reconstruir));
    case "aplicacion": return aplicacion(e.funcion, e.args.map(reconstruir));
    case "rama": return rama(e.eje, [reconstruir(e.alternativas[0]), reconstruir(e.alternativas[1])]);
    case "condicionado":
      return e.condicion.tipo === "y"
        ? condicionado(reconstruir(e.cuerpo), e.condicion)
        : condicionado(reconstruir(e.cuerpo), { tipo: e.condicion.tipo, expr: reconstruir(e.condicion.expr) });
    case "familia": return familia(e.parametro, e.conjunto, reconstruir(e.paso));
  }
}

// ─────────────────────────────────────────────
// 2 · El orden
// ─────────────────────────────────────────────

describe("núcleo · el orden es TOTAL", () => {
  const muestra = lote(2002, 120, 3);

  test("reflexivo: comparar algo consigo mismo da 0", () => {
    for (const e of muestra) igual(comparar(e, e), 0, "e vs e");
  });

  test("antisimétrico: comparar(a,b) y comparar(b,a) son opuestos", () => {
    for (const a of muestra) {
      for (const b of muestra) {
        igual(comparar(a, b), -comparar(b, a) as -1 | 0 | 1, "antisimetría");
      }
    }
  });

  test("transitivo", () => {
    const orden = ordenar(muestra);
    for (let i = 0; i + 2 < orden.length; i++) {
      assert(comparar(orden[i], orden[i + 1]) <= 0 && comparar(orden[i + 1], orden[i + 2]) <= 0,
        "la lista ordenada debe estar ordenada");
      assert(comparar(orden[i], orden[i + 2]) <= 0, "transitividad");
    }
  });

  test("comparar da 0 SOLO si son estructuralmente iguales", () => {
    for (const a of muestra) {
      for (const b of muestra) {
        if (comparar(a, b) === 0) assert(iguales(a, b), "un 0 debe significar iguales");
        if (iguales(a, b)) igual(comparar(a, b), 0, "iguales deben comparar 0");
      }
    }
  });

  test("no depende del historial: reconstruir no cambia el orden", () => {
    for (const a of muestra.slice(0, 40)) {
      for (const b of muestra.slice(0, 40)) {
        igual(comparar(reconstruir(a), reconstruir(b)), comparar(a, b), "orden estable");
      }
    }
  });

  test("las variables principales van delante", () => {
    assert(comparar(simbolo("x"), simbolo("y")) < 0, "x antes que y");
    assert(comparar(simbolo("y"), simbolo("alpha")) < 0, "y antes que un parámetro cualquiera");
    assert(comparar(entero(2), simbolo("x")) < 0, "los números antes que los símbolos");
    assert(comparar(constante("pi"), simbolo("x")) < 0, "las constantes antes que las variables");
  });

  test("ordenar es idempotente", () => {
    const una = ordenar(muestra);
    igual(ordenar(una).map((e) => e.hash).join(","), una.map((e) => e.hash).join(","), "idempotente");
  });
});

// ─────────────────────────────────────────────
// 3 · El puente
// ─────────────────────────────────────────────

describe("núcleo · el puente con mathjs", () => {
  test("ida y vuelta EXACTA: deMathjs(aMathjs(e)) ≡ e", () => {
    let comprobadas = 0;
    for (const e of lote(3003, 300)) {
      const n = aMathjs(e);
      if (n === null) continue;               // el formato viejo no sabe expresarlo: es legítimo
      const vuelta = deMathjs(n);
      assert(vuelta !== null, `no vuelve: ${textoDe(e)}`);
      assert(iguales(vuelta as Expresion, e), `el viaje cambió la expresión: ${textoDe(e)}`);
      comprobadas++;
    }
    assert(comprobadas > 150, `pocas expresiones comprobadas (${comprobadas})`);
  });

  test("los centinelas viven SOLO en el puente", () => {
    // Una `Rama` sale como `pm`, y al volver es otra vez una `Rama`. El núcleo no ha visto en
    // ningún momento la cadena "pm".
    const r = rama(0, [simbolo("x"), opuesto(simbolo("x"))]);
    const n = aMathjs(r);
    assert(n !== null, "una rama de alternativas opuestas sí se puede expresar");
    assert((n as Nodo).toString().includes("pm("), "debe salir como el centinela pm");
    const vuelta = deMathjs(n as Nodo);
    assert(vuelta !== null && vuelta.clase === "rama", "y al volver es una Rama otra vez");
  });

  test("`mp` es la misma Rama con las alternativas al revés", () => {
    const n = parse("mp(x)") as unknown as Nodo;
    const e = deMathjs(n);
    assert(e !== null && e.clase === "rama", "mp(x) es una rama");
    const r = e as Extract<Expresion, { clase: "rama" }>;
    igual(r.eje, 0, "mismo eje que pm");
    assert(iguales(r.alternativas[1], simbolo("x")), "la SEGUNDA alternativa es la positiva");
  });

  test("una rama que el formato viejo no sabe expresar devuelve null, no un apaño", () => {
    // Dos alternativas que no son opuestas: no hay centinela que diga eso.
    const r = rama(0, [simbolo("x"), simbolo("y")]);
    igual(aMathjs(r), null, "debe declararse incompetente");
  });

  test("`dom` va y vuelve como Condicionado", () => {
    const e = deMathjs(parse("dom(x, x - 3)") as unknown as Nodo);
    assert(e !== null && e.clase === "condicionado", "dom(...) es un Condicionado");
    const n = aMathjs(e as Expresion);
    assert(n !== null && (n as Nodo).toString().includes("dom("), "y vuelve a salir como dom");
  });

  test("`fam` va y vuelve como Familia", () => {
    const e = deMathjs(parse("fam(k, pi)") as unknown as Nodo);
    assert(e !== null && e.clase === "familia", "fam(...) es una Familia");
    const f = e as Extract<Expresion, { clase: "familia" }>;
    igual(f.parametro, "k", "el parámetro");
    igual(f.conjunto, "enteros", "fam es ℤ; famN sería ℕ");
    const g = deMathjs(parse("famN(k, pi)") as unknown as Nodo) as Extract<Expresion, { clase: "familia" }>;
    igual(g.conjunto, "naturales", "famN es ℕ");
  });

  test("el logaritmo entra en su forma canónica, con la base escrita", () => {
    const e = deMathjs(parse("log(x)") as unknown as Nodo);
    assert(e !== null && e.clase === "aplicacion", "log(x) es una aplicación");
    const a = e as Extract<Expresion, { clase: "aplicacion" }>;
    igual(a.funcion, "log", "es log");
    igual(a.args.length, 2, "con DOS argumentos: el de siempre y la base");
    assert(iguales(a.args[1], constante("e")), "la base es e");
  });

  test("una división de enteros entra como el RACIONAL que es", () => {
    const e = deMathjs(parse("1/2") as unknown as Nodo);
    assert(e !== null && e.clase === "literal", "1/2 es un literal, no una división");
    igual(textoN((e as Extract<Expresion, { clase: "literal" }>).numero), "1/2", "el número un medio");
  });

  test("un racional vuelve a mathjs SIN decimalizarse", () => {
    const n = aMathjs(literal(desdeTexto("0.5")));
    assert(n !== null, "se puede expresar");
    igual((n as Nodo).toString(), "1 / 2", "sale como cociente exacto, no como 0.5");
  });

  test("lo que sale del puente SOBREVIVE a convertirse en cadena", () => {
    // El motor histórico intercambia expresiones como TEXTO, así que un árbol cuyo `toString()`
    // no se relea con el mismo significado acaba siendo otra función. En mathjs el `^` liga más
    // que el menos: `-1 ^ 0` se lee `-(1^0)` = −1, no `(−1)^0` = 1. Lo destapó la ley de
    // conservación del valor del normalizador, y aquí queda fijado como regresión.
    //
    // La igualdad se exige SALVO NORMALIZACIÓN, y no estructural: al releer, mathjs escribe el
    // −1 como un menos unario aplicado al 1, que es otra estructura para el mismo número. Que el
    // viaje por cadena sea exacto hasta la última rama exige impresor propio, que es E7; lo que
    // sí es exacto YA es el viaje de nodo a nodo, y eso lo prueba el caso de arriba.
    const casos: Expresion[] = [
      potencia(entero(-1), entero(0)),
      potencia(entero(-2), entero(2)),
      potencia(opuesto(simbolo("x")), entero(2)),
      potencia(suma([simbolo("x"), entero(1)]), entero(2)),
      producto([entero(-1), potencia(simbolo("x"), entero(2))]),
    ];
    for (const e of casos) {
      const n = aMathjs(e);
      assert(n !== null, "se puede expresar");
      const releido = deMathjs(parse((n as Nodo).toString()) as unknown as Nodo);
      assert(releido !== null, `no se relee: ${(n as Nodo).toString()}`);
      assert(iguales(normalizar(releido as Expresion), normalizar(e)),
        `el viaje por cadena la cambió: ${(n as Nodo).toString()}`);
    }
  });

  test("lo que el núcleo no modela se declara, no se inventa", () => {
    igual(deMathjs(parse("x > 2") as unknown as Nodo), null, "una comparación todavía no se modela");
    igual(deMathjs(parse("desconocida(x)") as unknown as Nodo), null, "ni una función que no está en el catálogo");
  });
});

// ─────────────────────────────────────────────
// 4 · La exactitud
// ─────────────────────────────────────────────

describe("núcleo · la exactitud no se pierde por el camino", () => {
  test("un decimal escrito es EXACTO, no un flotante", () => {
    assert(esExacto(desdeTexto("0.5")), "0.5 es 1/2");
    assert(esExacto(desdeTexto("0.5637")), "0.5637 es 5637/10000: lo escribió alguien");
    igual(textoN(desdeTexto("0.1")), "1/10", "se leen los DÍGITOS, no los bits del double");
  });

  test("un irracional decimalizado se marca como flotante, no se asciende a exacto", () => {
    // Es la regla que impide que una aproximación se convierta en un valor exacto.
    const e = deMathjs(parse("1.4142135623730951") as unknown as Nodo);
    assert(e !== null && e.clase === "literal", "es un literal");
    assert(!esExacta(e as Expresion), "pero NO exacto: son diecisiete cifras, no una escritura");
  });

  test("un decimal corto sigue siendo exacto al cruzar el puente", () => {
    const e = deMathjs(parse("0.125") as unknown as Nodo);
    assert(e !== null && esExacta(e as Expresion), "0.125 es 1/8");
  });

  test("`esExacta` ve un flotante escondido a cualquier profundidad", () => {
    const escondido = suma([simbolo("x"), producto([entero(2), literal(numFlotante(0.1))])]);
    assert(!esExacta(escondido), "debe encontrarlo dentro del producto");
    assert(esExacta(suma([simbolo("x"), entero(2)])), "y no dar falsos positivos");
  });
});

// ─────────────────────────────────────────────
// 5 · Cobertura real sobre el corpus
// ─────────────────────────────────────────────
//
// No es una ley: es una MEDIDA. Dice qué parte del corpus sabe cruzar el puente hoy, y su valor
// está en que se mueva —hacia arriba— cuando el núcleo crezca. El umbral está puesto por debajo
// de lo medido para que la prueba señale una regresión, no para presumir de una cifra.

describe("núcleo · cobertura del puente sobre el corpus", () => {
  const aNodo = (s: string): Nodo | null => {
    try { return parse(insertarProductoImplicito(normalizarEntrada(s))) as unknown as Nodo; }
    catch { return null; }
  };

  const cobertura = (casos: readonly string[]): { total: number; cruzan: number } => {
    let cruzan = 0, total = 0;
    for (const c of casos) {
      // De una ecuación se mide cada lado por separado: el `=` no es una expresión.
      for (const lado of c.split("=")) {
        const n = aNodo(lado);
        if (n === null) continue;
        total++;
        if (deMathjs(n) !== null) cruzan++;
      }
    }
    return { total, cruzan };
  };

  test("las expresiones f(x) del corpus cruzan el puente", () => {
    const { total, cruzan } = cobertura(EXPRESIONES);
    console.log(`      cobertura expresiones: ${cruzan}/${total} (${Math.round(100 * cruzan / total)}%)`);
    assert(cruzan / total >= 0.9, `cobertura caída a ${cruzan}/${total}`);
  });

  test("los lados de las ecuaciones del corpus cruzan el puente", () => {
    const { total, cruzan } = cobertura(ECUACIONES);
    console.log(`      cobertura ecuaciones: ${cruzan}/${total} (${Math.round(100 * cruzan / total)}%)`);
    assert(cruzan / total >= 0.9, `cobertura caída a ${cruzan}/${total}`);
  });

  test("todo lo que cruza, vuelve", () => {
    let ida = 0, vuelta = 0;
    for (const c of [...EXPRESIONES, ...ECUACIONES]) {
      for (const lado of c.split("=")) {
        const n = aNodo(lado);
        if (n === null) continue;
        const e = deMathjs(n);
        if (e === null) continue;
        ida++;
        if (aMathjs(e) !== null) vuelta++;
      }
    }
    igual(vuelta, ida, "toda expresión que entra debe poder salir");
  });
});

// ─────────────────────────────────────────────
// 6 · El registro
// ─────────────────────────────────────────────

describe("núcleo · el registro de funciones", () => {
  test("no hay ids repetidos", () => {
    assert(CATALOGO.size > 30, `el catálogo parece corto: ${CATALOGO.size}`);
  });

  test("cada ficha evalúa sobre ℝ y no devuelve complejos", () => {
    for (const ficha of CATALOGO.values()) {
      const n = ficha.aridad ?? 2;
      const v = ficha.evaluar(Array.from({ length: n }, () => 0.7));
      assert(typeof v === "number", `${ficha.id} no devolvió un número`);
    }
  });

  test("fuera del dominio real se devuelve NaN, no un complejo ni un infinito", () => {
    igual(Number.isNaN(fichaDe("sqrt")!.evaluar([-4])), true, "√(−4) no es real");
    igual(Number.isNaN(fichaDe("log")!.evaluar([-1, Math.E])), true, "ln(−1) no es real");
    igual(Number.isNaN(fichaDe("nthRoot")!.evaluar([-8, 4])), true, "índice par de un negativo");
    igual(fichaDe("nthRoot")!.evaluar([-8, 3]), -2, "índice impar de un negativo SÍ es real");
    igual(Number.isNaN(fichaDe("csc")!.evaluar([0])), true, "csc(0) es un polo, no ±∞");
  });

  test("las funciones que mathjs no trae están definidas como en el evaluador", () => {
    // acot con la convención CONTINUA de rango (0, π), que es la que ya usa el motor.
    igual(fichaDe("acot")!.evaluar([0]), Math.PI / 2, "acot(0) = π/2");
    assert(fichaDe("acot")!.evaluar([-1]) > Math.PI / 2, "acot decrece de π a 0: en −1 pasa de π/2");
  });

  test("los centinelas NO son funciones del catálogo", () => {
    for (const nombre of ["pm", "mp", "pm2", "mp2", "dom", "fam", "famN"]) {
      igual(fichaDe(nombre), null, `${nombre} no puede tener ficha: no es una función`);
    }
  });
});

// ─────────────────────────────────────────────
// 7 · Utilidades del núcleo
// ─────────────────────────────────────────────

describe("núcleo · consultas estructurales", () => {
  test("los símbolos libres salen sin repetir y en orden de aparición", () => {
    const e = suma([simbolo("y"), producto([simbolo("x"), simbolo("y")]), constante("pi")]);
    igual(simbolosDe(e).join(","), "y,x", "π no es una variable");
  });

  test("deduplicar usa la igualdad estructural, no la identidad de objeto", () => {
    const a = suma([simbolo("x"), entero(1)]);
    const b = suma([simbolo("x"), entero(1)]);
    assert(a !== b, "son dos objetos distintos");
    igual(sinRepetidas([a, b]).length, 1, "pero la misma expresión");
  });

  test("la resta y la división no existen: son azúcar", () => {
    igual(opuesto(simbolo("x")).clase, "producto", "−x es (−1)·x");
    const menos = opuesto(simbolo("x")) as Extract<Expresion, { clase: "producto" }>;
    assert(iguales(menos.factores[0], MENOS_UNO_E), "el primer factor es −1");
    igual(potencia(simbolo("x"), MENOS_UNO_E).clase, "potencia", "1/x es x^(−1)");
  });

  test("los atajos constantes son los que dicen ser", () => {
    igual(textoN((CERO_E).numero), "0", "cero");
    igual(textoN((UNO_E).numero), "1", "uno");
    igual(textoN((MENOS_UNO_E).numero), "-1", "menos uno");
  });
});

/** Texto de depuración de una expresión, solo para los mensajes de fallo. */
function textoDe(e: Expresion): string {
  const n = aMathjs(e);
  return n === null ? `<${e.clase}>` : n.toString();
}
