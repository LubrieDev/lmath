// ─────────────────────────────────────────────
// oro · El dorado vigente, y el autodiagnóstico del oráculo que lo juzga
// ─────────────────────────────────────────────
//
// Dos cosas, y la segunda importa más que la primera.
//
//   1. El volcado de HOY coincide con el fichero dorado. Estricto: cualquier deriva falla, y
//      aceptarla es un acto deliberado (`npm run oro`). Cuando falla, el mensaje trae el diff YA
//      CLASIFICADO, para que se pueda decidir en el momento si es una mejora o una rotura.
//
//   2. El oráculo pasa su propio autodiagnóstico. Sin esto, todo lo anterior sería teatro: un
//      oráculo que dijera «igual» a todo dejaría pasar cualquier regresión disfrazada de cambio
//      cosmético, y la suite seguiría en verde. Es el mismo principio con el que `bateria-cas.ts`
//      se inyecta fallos conocidos antes de emitir su informe.
//
// El caso que de verdad prueba el oráculo es `x^2/x` frente a `x`: las dos son la MISMA función
// racional —cualquier comparación de valores dice que sí— y son funciones DISTINTAS, porque
// difieren en x=0. Si el oráculo aprueba ese par, no sirve para nada.

import { describe, test, assert, igual } from "../runner";
import { deserializar, serializar, volcarEcuaciones, volcarExpresiones } from "../oro/volcar";
import { comparar, informeATexto, clasificarCambio, type Clase } from "../oro/clasificar";
import { compararValor, mismaExpresion, type Veredicto } from "../oro/oraculo";
import { RUTA_ECUACIONES, RUTA_EXPRESIONES } from "../oro/rutas";

declare const require: (m: string) => {
  readFileSync(p: string, e: string): string;
  existsSync(p: string): boolean;
};
const fs = require("fs");

function comprobarDorado(ruta: string, actual: string): void {
  assert(fs.existsSync(ruta), `falta el fichero dorado ${ruta} — genéralo con «npm run oro»`);
  const guardado = fs.readFileSync(ruta, "utf8");
  if (guardado === actual) return;
  const informe = comparar(deserializar(guardado), deserializar(actual));
  throw new Error(
    `el volcado ya no coincide con ${ruta}\n${informeATexto(informe)}\n` +
    `      (si el cambio es correcto, acéptalo con «npm run oro»)`
  );
}

describe("oro · el volcado dorado del CAS", () => {
  test("las ecuaciones del corpus dan la misma salida que el dorado", () => {
    comprobarDorado(RUTA_ECUACIONES, serializar(volcarEcuaciones()));
  });

  test("las expresiones f(x) dan la misma salida que el dorado", () => {
    comprobarDorado(RUTA_EXPRESIONES, serializar(volcarExpresiones()));
  });

  test("el volcado es determinista dentro del mismo proceso", () => {
    igual(serializar(volcarExpresiones()), serializar(volcarExpresiones()),
      "dos volcados seguidos deben ser idénticos");
  });

  test("serializar y deserializar es un viaje de ida y vuelta exacto", () => {
    const regs = volcarEcuaciones();
    const vuelta = deserializar(serializar(regs));
    igual(vuelta.length, regs.length, "mismo número de observaciones");
    for (let i = 0; i < regs.length; i++) {
      igual(vuelta[i].caso, regs[i].caso, `caso ${i}`);
      igual(vuelta[i].clave, regs[i].clave, `clave ${i}`);
      igual(vuelta[i].valor, regs[i].valor, `valor ${i}`);
    }
  });
});

// ─────────────────────────────────────────────
// Autodiagnóstico del oráculo
// ─────────────────────────────────────────────

/** Parejas con veredicto conocido. La columna del porqué no es decorativa: es la que dice qué
 *  capacidad del oráculo se está probando, y por tanto qué se rompería si el caso fallara. */
const PAREJAS: Array<{ a: string; b: string; espera: Veredicto; porque: string }> = [
  // Lo mismo escrito de otra forma.
  { a: "x + 1", b: "1 + x", espera: "igual", porque: "conmutatividad" },
  { a: "2*x", b: "x*2", espera: "igual", porque: "conmutatividad del producto" },
  { a: "x^2 - 1", b: "(x-1)*(x+1)", espera: "igual", porque: "identidad polinómica exacta" },
  { a: "1/(x-1) + 1/(x+1)", b: "2*x/(x^2-1)", espera: "igual", porque: "suma de fracciones, mismo dominio" },

  // Distintas de verdad.
  { a: "2*x", b: "x", espera: "distinta", porque: "funciones racionales distintas" },
  { a: "x^2", b: "x^3", espera: "distinta", porque: "grados distintos" },
  { a: "sin(x)", b: "cos(x)", espera: "distinta", porque: "trascendentes distintas, por muestreo" },

  // EL caso: mismo valor en todas partes, dominio distinto en UN punto.
  { a: "x^2/x", b: "x", espera: "distinta", porque: "misma función racional, difieren en x=0" },
  { a: "(x^2-1)/(x-1)", b: "x + 1", espera: "distinta", porque: "difieren solo en x=1" },
  { a: "x/x", b: "1", espera: "distinta", porque: "difieren solo en x=0" },

  // Dominio por radicales: el error de manual.
  { a: "sqrt(x^2)", b: "x", espera: "distinta", porque: "√(x²)=|x|, no x" },
  { a: "sqrt(x^2)", b: "abs(x)", espera: "igual", porque: "√(x²)=|x| sí es cierto en todo ℝ" },

  // Identidades trascendentes, que solo el muestreo puede ver.
  { a: "sin(x)", b: "cos(pi/2 - x)", espera: "igual", porque: "identidad trigonométrica" },
  { a: "sin(x)^2 + cos(x)^2", b: "1", espera: "igual", porque: "pitagórica" },

  // Ausencia de respuesta.
  { a: "∅", b: "x", espera: "distinta", porque: "una de las dos no produjo resultado" },
];

describe("oro · autodiagnóstico del oráculo semántico", () => {
  for (const { a, b, espera, porque } of PAREJAS) {
    test(`«${a}» vs «${b}» → ${espera} (${porque})`, () => {
      const d = mismaExpresion(a, b);
      igual(d.veredicto, espera, `vía ${d.via}${d.detalle ? `: ${d.detalle}` : ""}`);
    });
  }

  test("un `indecidible` no se disfraza de aprobado", () => {
    // Dos formas que el oráculo no puede leer como expresión: la respuesta honesta es que no
    // sabe, no que sean iguales.
    const d = compararValor("y=\\pm \\sqrt{x},\\quad x \\ge 0", "y=\\sqrt{x}");
    igual(d.veredicto, "indecidible", `vía ${d.via}`);
  });

  test("las ramas se comparan como conjunto, no por orden", () => {
    const d = compararValor('["y = sqrt(x)","y = -sqrt(x)"]', '["y = -sqrt(x)","y = sqrt(x)"]');
    igual(d.veredicto, "igual", `vía ${d.via}`);
  });

  test("un número distinto de ramas es una diferencia", () => {
    const d = compararValor('["y = sqrt(x)","y = -sqrt(x)"]', '["y = sqrt(x)"]');
    igual(d.veredicto, "distinta", `vía ${d.via}`);
  });

  test("dos ecuaciones proporcionales son la misma curva", () => {
    const d = compararValor("2*y - 2*x = 0", "y - x = 0");
    igual(d.veredicto, "igual", `vía ${d.via}`);
  });
});

// ─────────────────────────────────────────────
// Autodiagnóstico del clasificador
// ─────────────────────────────────────────────

describe("oro · autodiagnóstico del clasificador de cambios", () => {
  const clase = (antes: string, ahora: string): Clase =>
    clasificarCambio("caso", "clave", antes, ahora).clase;

  test("otra escritura de la misma función es cosmética", () => {
    igual(clase("x + 1", "1 + x"), "cosmético");
  });

  test("una función distinta es un cambio matemático", () => {
    igual(clase("2*x", "x"), "matemático");
  });

  test("perder el dominio es un cambio matemático, no cosmético", () => {
    igual(clase("x^2/x", "x"), "matemático");
  });

  test("pasar de ∅ a una respuesta es un cambio de alcance", () => {
    igual(clase("∅", "x^2/2"), "alcance");
  });

  test("dejar de responder es un cambio de alcance", () => {
    igual(clase("x^2/2", "∅"), "alcance");
  });

  // El punto ciego declarado: el oráculo NO puede ver esta diferencia, porque los dos valores
  // coinciden hasta el último bit de un `double`. Lo caza la dimensión de exactitud, que es una
  // heurística sobre la ESCRITURA y no un veredicto sobre la función.
  test("decimalizar una constante exacta se caza como pérdida de exactitud", () => {
    igual(clase("nthRoot(2, 3)", "1.2599210498948732"), "exactitud");
    assert(
      clasificarCambio("c", "k", "nthRoot(2, 3)", "1.2599210498948732").detalle.startsWith("PÉRDIDA"),
      "debe decir que es una pérdida, no una ganancia"
    );
  });

  test("recuperar la forma exacta se caza como ganancia", () => {
    igual(clase("1.4142135623730951", "sqrt(2)"), "exactitud");
    assert(
      clasificarCambio("c", "k", "1.4142135623730951", "sqrt(2)").detalle.startsWith("ganancia"),
      "debe decir que es una ganancia"
    );
  });

  test("un decimal corto NO dispara la alarma de exactitud", () => {
    // `0.5` o `3.14` pueden ser lo que el usuario escribió; la firma que buscamos es la de un
    // irracional expandido, no la de cualquier decimal.
    igual(clase("x/2", "0.5*x"), "cosmético");
  });
});
