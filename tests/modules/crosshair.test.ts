// ─────────────────────────────────────────────
// tests · La y que lee el crosshair: evaluada en explícitas, interpolada en el resto
// ─────────────────────────────────────────────
//
// Lo que se defiende aquí es una frontera, no un número: **el viewport, la polilínea y el
// muestreo sirven para visualizar, y no son la fuente de verdad matemática cuando la expresión
// se puede evaluar directamente.**
//
// El defecto que la motivó: el crosshair leía su `y` interpolando linealmente entre los vértices
// trazados, y como la densidad de vértices depende del zoom, el MISMO punto de la MISMA curva
// daba números distintos según lo cerca que estuvieras. En `y=exp(x)`, x=2,1: 8,16617 a un zoom y
// 8,17678 a otro. No es ruido en la última cifra —se ve en la tercera—.
//
// Por eso las dos primeras pruebas comparan la lectura CONSIGO MISMA a distintos encuadres, en
// vez de compararla con un valor esperado: lo que tiene que ser cierto es que el encuadre no
// entre en la respuesta.
//
// La frontera está en las explícitas y eso también se prueba: implícitas, paramétricas y polares
// siguen leyendo la rama, porque ahí «la y en esta x» no tiene respuesta única y la polilínea
// sabe por dónde pasó el trazador.

import { describe, test, assert, igual, aprox } from "../runner";
import { crearViewport } from "../../src/core/scene/viewport-utils";
import { construirObjeto } from "../../src/core/parsing/construirObjeto";
import { construirObjetosEscena, crearProveedor } from "../../src/core/app/composicion";
import { lectorExacto } from "../../src/math/ordenada";
import { yEnRamas } from "../../src/core/analysis/lecturaRama";
import { TOL_FINAL } from "./comun";
import { formatearLectura } from "../../src/core/analysis/formatoNumero";
import { formatearNumero } from "../../src/core/rendering/overlay/Overlay";

/** Encuadre con el mismo lienzo y distinto zoom/centro. */
const vista = (semiY: number, centroX = 0) =>
  crearViewport(
    [centroX - semiY * 2.3, centroX + semiY * 2.3], [-semiY, semiY], 900, 390, 1
  );

/** El objeto de escena de una ecuación suelta (el mismo camino que usa el bloque). */
const escenaDe = (ec: string) => construirObjetosEscena(ec)[0];

describe("crosshair · la lectura no depende del encuadre", () => {
  test("el ZOOM no cambia el valor de f(x)", () => {
    for (const ec of ["y=exp(x)", "y=x^2", "y=sin(x)", "y=1/x"]) {
      const lector = escenaDe(ec).lectorY;
      assert(lector !== undefined, `${ec} debe tener lector exacto`);
      if (!lector) continue;
      const x = 2.1;
      const referencia = lector(x);
      // Cuatro zooms que abarcan tres órdenes de magnitud: antes, cada uno daba un número.
      for (const semi of [7, 20, 60, 200]) {
        vista(semi);   // el encuadre existe, pero el lector no lo consulta: esa es la prueba
        igual(lector(x), referencia, `${ec} a zoom ±${semi}:`);
      }
    }
  });

  test("el PAN no introduce error de interpolación", () => {
    const lector = escenaDe("y=exp(x)").lectorY;
    assert(lector !== undefined, "debe tener lector exacto");
    if (!lector) return;
    const x = 2.1;
    const referencia = lector(x);
    for (const centro of [-50, -5, 0, 5, 50, 300]) {
      vista(7, centro);
      igual(lector(x), referencia, `desplazado a x₀=${centro}:`);
    }
  });

  test("el valor coincide con la evaluación directa, a precisión de MÁQUINA", () => {
    // No `aprox` con tolerancia: igualdad exacta. El lector no aproxima nada, evalúa la misma f
    // que traza la curva, así que cualquier diferencia sería un fallo y no un redondeo.
    const casos: Array<[string, (x: number) => number]> = [
      ["y=exp(x)", Math.exp],
      ["y=x^2", (x) => x * x],
      ["y=sin(x)", Math.sin],
      ["y=1/x", (x) => 1 / x],
    ];
    for (const [ec, verdad] of casos) {
      const lector = escenaDe(ec).lectorY;
      if (!lector) { assert(false, `${ec} sin lector`); continue; }
      for (const x of [-3.3, -0.7, 0.25, 1, 2.1, 3.7, 12.5]) {
        const leido = lector(x);
        const esperado = verdad(x);
        if (!Number.isFinite(esperado)) continue;
        igual(leido, esperado, `${ec} en x=${x}:`);
      }
    }
  });

  test("fuera del dominio devuelve null en vez de un número inventado", () => {
    const lector = escenaDe("y=sqrt(x)").lectorY;
    assert(lector !== undefined, "√x es explícita");
    if (!lector) return;
    igual(lector(-1), null, "√(−1) no es un punto de la curva:");
    aprox(lector(4) ?? 0, 2, 0, "√4 sí:");
  });

  test("una restricción de dominio recorta también la lectura", () => {
    // El lector usa la MISMA f que traza la curva, y esa ya trae el recorte aplicado: no hay una
    // segunda copia de la regla que se pueda desincronizar del dibujo.
    const lector = escenaDe("y=x {0 \\leq x \\leq 2}").lectorY;
    assert(lector !== undefined, "sigue siendo explícita");
    if (!lector) return;
    igual(lector(1), 1, "dentro del intervalo:");
    igual(lector(5), null, "fuera del intervalo no hay curva:");
  });
});

describe("crosshair · el arreglo no es vacuo: mide lo que hacía el camino viejo", () => {
  test("interpolar la rama SÍ varía con el zoom; evaluar la función NO", () => {
    // Las pruebas de arriba enseñan que el lector exacto ignora el encuadre, y eso sale gratis
    // porque ni lo recibe. Esta compara con lo que había ANTES —`yEnRamas` sobre la geometría
    // trazada a cada zoom— para dejar constancia de que el defecto era real y de cuánto era.
    const x = 2.1;
    const objeto = construirObjeto("y=exp(x)", "id");
    const proveedor = crearProveedor(objeto);
    const lector = lectorExacto(objeto);
    assert(lector !== null, "explícita: tiene lector");
    if (!lector) return;

    const porRama: number[] = [];
    for (const semi of [7, 20, 60, 200]) {
      const geo = proveedor.geometria(vista(semi), TOL_FINAL);
      const y = yEnRamas(geo.ramas, x);
      if (y !== null) porRama.push(y);
      // El lector exacto da SIEMPRE lo mismo, al mismo zoom en el que la rama se desvía.
      igual(lector(x), Math.exp(x), `evaluado a zoom ±${semi}:`);
    }

    assert(porRama.length >= 3, "debe haber lecturas de rama que comparar");
    const dispersion = Math.max(...porRama) - Math.min(...porRama);
    // La medición del hallazgo: entre el zoom más cercano y el más lejano, la lectura
    // interpolada se movía ~1e-2 sobre un valor de ~8,17. Se exige que sea claramente distinta
    // de cero para que esta prueba falle si algún día la rama pasa a ser exacta y el test deja
    // de tener sentido (y haya que revisarlo, no borrarlo).
    assert(dispersion > 1e-4,
      `la interpolación debería variar con el zoom (varió ${dispersion.toExponential(2)})`);
  });
});

describe("crosshair · la frontera: qué curvas NO cambian", () => {
  test("implícitas, paramétricas y polares siguen leyendo la rama", () => {
    // `lectorY` sin fijar es la señal de «sigue el comportamiento de siempre»: la Escena cae a
    // `yEnRamas`. Son las curvas donde «la y en esta x» no tiene una sola respuesta.
    for (const ec of ["x^2+y^2=9", "(cos(t), sin(t))", "r = 2cos(3theta)"]) {
      igual(escenaDe(ec).lectorY, undefined, `${ec} no debe tener lector exacto:`);
    }
  });

  test("y = ±√(…) tampoco: son dos curvas, no una", () => {
    // Se expande en dos ramas y ahí la pregunta vuelve a ser ambigua. Darle un lector exacto
    // significaría elegir una de las dos ramas en silencio.
    igual(escenaDe("y = \\pm\\sqrt{9-x^2}").lectorY, undefined);
  });

  test("la explícita TRANSPUESTA se descarta a propósito", () => {
    // `salida: "x"` es una componente paramétrica dibujada tumbada: su f da la ABSCISA, no la
    // ordenada. Usarla como si diera la y respondería con seguridad un número equivocado, que es
    // peor que el aproximado que se venía dando.
    const tumbada = { ...construirObjeto("y=x^2", "id"), salida: "x" as const };
    igual(lectorExacto(tumbada), null);
  });

  test("lectorExacto solo acepta explícitas", () => {
    igual(lectorExacto(construirObjeto("x^2+y^2=9", "id")), null, "implícita:");
    igual(lectorExacto(construirObjeto("(cos(t), sin(t))", "id")), null, "paramétrica:");
    assert(lectorExacto(construirObjeto("y=x^2", "id")) !== null, "explícita sí");
  });
});

// ─────────────────────────────────────────────
// El READOUT: cuántas cifras se escriben, y por qué esas
// ─────────────────────────────────────────────
//
// Lo de arriba defiende que el NÚMERO no dependa del encuadre. Esto defiende lo otro: que al
// escribirlo no se tire la información que ese número sí tenía.
//
// El defecto: el readout usaba `formatearNumero`, que está escrita —y documentada— para las
// ETIQUETAS DE EJE. Una marca de eje es un número redondo que eligió `pasoBonito` y lo que se le
// pide es que quepa; un readout es un valor arbitrario y lo que se le pide es que se pueda leer y
// comparar. Con el formato de eje, `1.4905` y `1.4899` se imprimían los DOS como `1.49`, y por
// encima de 1000 se caía a `1.2e+3`, que son dos cifras significativas para una posición.
//
// La regla que sustituye a aquello tiene tres casos y no dos, y el tercero es el que faltaba:
//
//   evaluado   6 cifras significativas, ceros finales incluidos. Lo que se calculó exactamente.
//   medido     4 cifras, como siempre. Lo que salió de una bisección o de interpolar la polilínea:
//              enseñar más cifras sería enseñar el ruido del método.
//   eje        `formatearNumero`, intacta. Su objetivo es la legibilidad, no la precisión.

describe("crosshair · el readout conserva la información del número", () => {
  test("dos valores cercanos ya NO colapsan en el mismo texto", () => {
    // El caso que lo motivó. Con el formato de eje los dos daban "1.49".
    igual(formatearNumero(1.4905), formatearNumero(1.4899), "el formato de EJE sí los colapsa");
    igual(formatearLectura(1.4905), "1.49050");
    igual(formatearLectura(1.4899), "1.48990");
    assert(formatearLectura(1.4905) !== formatearLectura(1.4899), "el readout debe distinguirlos");
  });

  test("los ceros finales se conservan: la anchura no baila de un valor a otro", () => {
    // No es cosmética: es lo que hace que el número de decimales visibles no cambie al mover el
    // cursor, que era la mitad de la sensación de inestabilidad.
    for (const [v, esperado] of [[1.5, "1.50000"], [3, "3.00000"], [-0.5, "-0.500000"]] as const)
      igual(formatearLectura(v), esperado, `${v}:`);
  });

  test("valores GRANDES: notación fija, sin caer a dos cifras", () => {
    igual(formatearNumero(1234.5), "1.2e+3", "el formato de EJE sí cae a exponencial");
    igual(formatearLectura(1234.5), "1234.50");
    igual(formatearLectura(999.999), "999.999");
    igual(formatearLectura(123456), "123456");
  });

  test("valores PEQUEÑOS: notación fija hasta 1e-4", () => {
    igual(formatearNumero(0.0012345), "1.2e-3", "el formato de EJE sí cae a exponencial");
    igual(formatearLectura(0.0012345), "0.00123450");
    igual(formatearLectura(0.0001), "0.000100000");
  });

  test("fuera del rango normal SÍ hay exponencial, y con las 6 cifras", () => {
    // Por debajo de 1e-4 la notación fija sería una fila de ceros y por encima de 1e6 no cabe.
    // Lo que no se negocia es que se conserven las seis cifras.
    igual(formatearLectura(1e-5), "1.00000e-5");
    igual(formatearLectura(1e7), "1.00000e+7");
    igual(formatearLectura(0.000012345), "1.23450e-5");
  });

  test("el cero y los no finitos tienen su forma", () => {
    igual(formatearLectura(0), "0");
    igual(formatearLectura(-0), "0", "el −0 no debe salir con signo");
    igual(formatearLectura(Infinity), "∞");
    igual(formatearLectura(-Infinity), "-∞");
  });

  test("lo MEDIDO se queda en 4 cifras: no se enseña el ruido del estimador", () => {
    // La otra mitad de la regla. Una `y` interpolada de la polilínea trae el error del trazado;
    // con seis cifras significativas, cuatro de ellas serían ruido —y encima bailarían con el
    // zoom, porque la densidad de vértices depende del encuadre—.
    igual(formatearLectura(1.4905, "medido"), "1.490");
    igual(formatearLectura(1.4899, "medido"), "1.490");
    igual(formatearLectura(1234.5, "medido"), "1235");
  });

  test("el formato de las ETIQUETAS DE EJE se queda como estaba", () => {
    // Tercer caso: no se toca. Es de otro trabajo y su objetivo es que el número quepa.
    igual(formatearNumero(1.4905), "1.49");
    igual(formatearNumero(12.3456), "12.35");
    igual(formatearNumero(1234.5), "1.2e+3");
    igual(formatearNumero(0), "0");
  });
});

describe("crosshair · el TEXTO del readout tampoco depende del encuadre", () => {
  test("el zoom no cambia ni una cifra de lo que se escribe", () => {
    // Las pruebas de arriba comparan el NÚMERO; esta compara la CADENA, que es lo que el usuario
    // ve. Con un formato de cifras significativas, dos valores que solo difieren en el ruido
    // podrían aun así imprimirse distinto: aquí se afirma que no pasa.
    for (const ec of ["y=exp(x)", "y=3*sin(2*x)+2", "y=1/x"]) {
      const lector = escenaDe(ec).lectorY;
      assert(lector !== undefined, `${ec} debe tener lector exacto`);
      if (!lector) continue;
      const x = 2.058;
      const y0 = lector(x);
      assert(y0 !== null, `${ec}: debe haber y en x=${x}`);
      if (y0 === null) continue;
      const referencia = formatearLectura(y0);
      for (const semi of [4, 7, 20, 60, 200]) {
        vista(semi);
        const y = lector(x);
        igual(y === null ? "∅" : formatearLectura(y), referencia, `${ec} a zoom ±${semi}:`);
      }
    }
  });

  test("el pan tampoco", () => {
    const lector = escenaDe("y=exp(x)").lectorY;
    assert(lector !== undefined, "debe tener lector exacto");
    if (!lector) return;
    const y0 = lector(2.058);
    if (y0 === null) { assert(false, "debe haber y"); return; }
    const referencia = formatearLectura(y0);
    for (const centro of [-50, -5, 0, 5, 50, 300]) {
      vista(7, centro);
      const y = lector(2.058);
      igual(y === null ? "∅" : formatearLectura(y), referencia, `desplazado a x₀=${centro}:`);
    }
  });
});
