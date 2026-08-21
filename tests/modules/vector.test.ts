// ─────────────────────────────────────────────
// tests · obs-vector: parser del bloque, tipografía y dibujo
// ─────────────────────────────────────────────
//
// Lógica PURA (sin DOM ni canvas). Lo que se fija aquí es, sobre todo, la REGLA DE GÉNERO —la
// caja de la primera letra decide si algo es un punto o un vector— porque es una convención
// invisible: nada en la interfaz la explica, así que si se rompe, se rompe en silencio y lo
// único que se nota es que las flechas dejan de estar donde estaban.

import { describe, test, assert, igual, aprox } from "../runner";
import {
  parsearBloqueVector, separarPar, evaluarComponente, dibujoDeBloque, hayDibujo,
} from "../../src/vector/bloqueVector";
import {
  bloqueVectorALatex, entradaALatex, rotuloALatex, PLANTILLA_VACIA,
} from "../../src/vector/latexVector";
import { encuadreDeDibujo, recortarSegmento } from "../../src/vector/renderVector";
import { analizarDibujo } from "../../src/vector/analisisVector";

/** La única entrada de un bloque de una línea (los tests de abajo leen casi siempre así). */
const una = (fuente: string) => parsearBloqueVector(fuente).entradas[0];

/**
 * El LaTeX de un bloque de una línea, SIN los espacios que no significan nada.
 *
 * En modo matemático el espacio en blanco es insignificante: `- y` y `-y` producen el mismo
 * glifo. Y el emisor de mathjs los reparte a su manera (`-y` sale `- y`, `u+v` sale `u+ v`),
 * espaciado que comparten los cinco bloques del plugin porque comparten `exprALatex`. Fijar esos
 * espacios en un test de obs-vector sería fijar un detalle de la librería en el sitio equivocado:
 * lo que este módulo tiene que garantizar es la ESTRUCTURA que compone —la flecha, los
 * paréntesis, la coma—, no cómo separa mathjs sus operandos.
 *
 * El espacio que va tras una BARRA sí se conserva: `\ ` no es separación, es el comando de
 * espacio fino, y es exactamente el que este módulo pone tras la coma del par.
 */
const tex = (fuente: string) => entradaALatex(una(fuente)).replace(/(?<!\\) /g, "");

describe("obs-vector · el par ordenado", () => {
  test("separa las dos componentes con paréntesis o con corchetes", () => {
    igual(separarPar("(3,2)")?.join("|"), "3|2", "paréntesis:");
    igual(separarPar("[3, 2]")?.join("|"), "3|2", "corchetes:");
    igual(separarPar("\\left(3,2\\right)")?.join("|"), "3|2", "delimitadores LaTeX:");
  });

  test("la coma que separa es la de NIVEL 0, no la primera que aparezca", () => {
    // `f(1,2)` tiene una coma que no separa nada del par; contarlas sin profundidad partiría
    // la componente por la mitad.
    igual(separarPar("(max(1,2), 3)")?.join("|"), "max(1,2)|3", "coma anidada:");
  });

  test("no es un par si el delimitador no envuelve TODO el texto", () => {
    igual(separarPar("(1,2)+(3,4)"), null, "suma de dos pares:");
    igual(separarPar("(1,2,3)"), null, "tres componentes:");
    igual(separarPar("(1)"), null, "sin coma:");
    igual(separarPar("3,2"), null, "sin delimitadores:");
  });

  test("una componente acepta lo mismo que cualquier otro bloque de LMath", () => {
    aprox(evaluarComponente("\\frac{1}{2}") ?? NaN, 0.5, 1e-12, "fracción LaTeX:");
    aprox(evaluarComponente("2\\pi") ?? NaN, 2 * Math.PI, 1e-12, "producto implícito:");
    aprox(evaluarComponente("-\\sqrt{2}") ?? NaN, -Math.SQRT2, 1e-12, "radical:");
    igual(evaluarComponente("y"), null, "símbolo libre: no es un número");
  });
});

describe("obs-vector · la regla de género (la caja de la primera letra)", () => {
  test("minúscula = VECTOR, y lleva flecha", () => {
    const e = una("v = (3,2)");
    assert(e.tipo === "declaracion" && e.genero === "vector", "v debería ser un vector");
    igual(tex("v = (3,2)"), "\\vec{v}=\\left(3,\\ 2\\right)");
  });

  test("MAYÚSCULA = PUNTO, y va desnudo", () => {
    const e = una("A = (1,2)");
    assert(e.tipo === "declaracion" && e.genero === "punto", "A debería ser un punto");
    igual(tex("A = (1,2)"), "A=\\left(1,\\ 2\\right)");
  });

  test("con argumentos = CAMPO, sea cual sea la caja del nombre", () => {
    for (const fuente of ["F(x,y) = (-y, x)", "f(x,y) = (-y, x)"]) {
      const e = una(fuente);
      assert(e.tipo === "declaracion" && e.genero === "campo", `${fuente}: debería ser un campo`);
    }
    igual(tex("F(x,y)=(-y,x)"), "F\\left(x,y\\right)=\\left(-y,\\ x\\right)");
  });

  test("una flecha ESCRITA a mano manda sobre la caja de la letra", () => {
    // Quien teclea `\vec{A}` ya ha dicho que eso es un vector; responderle con un punto sería
    // corregirle, y encima castigar justo a quien escribe la notación correcta.
    const e = una("\\vec{A} = (1,2)");
    assert(e.tipo === "declaracion" && e.genero === "vector", "\\vec{A} debería ser un vector");
    igual(tex("\\vec{v} = (3,2)"), "\\vec{v}=\\left(3,\\ 2\\right)", "no se duplica la flecha:");
  });

  test("el subíndice y la prima siguen siendo el mismo nombre", () => {
    igual(tex("v_1 = (1,0)"), "\\vec{v_1}=\\left(1,\\ 0\\right)");
    igual(tex("u' = (0,1)"), "\\vec{u'}=\\left(0,\\ 1\\right)");
  });
});

describe("obs-vector · el vector entre dos puntos", () => {
  const AB = "A=(1,2)\nB=(5,4)\nAB";

  test("AB resuelve a la resta de los dos puntos declarados", () => {
    const e = parsearBloqueVector(AB).entradas[2];
    assert(e.tipo === "diferencia", "la tercera línea debería ser una diferencia");
    if (e.tipo !== "diferencia") return;
    igual(e.par.valor?.join("|"), "4|2", "componentes:");
    // `\overrightarrow` y no `\vec`: la flecha tiene que cubrir las dos letras. Ver `conFlecha`.
    igual(entradaALatex(e), "\\overrightarrow{AB}=\\left(4,\\ 2\\right)");
  });

  test("las tres formas de escribirlo dicen lo mismo", () => {
    for (const forma of ["AB", "A->B", "A → B", "\\vec{AB}"]) {
      const e = parsearBloqueVector(`A=(1,2)\nB=(5,4)\n${forma}`).entradas[2];
      igual(e.tipo, "diferencia", `${forma}:`);
    }
  });

  test("sin los dos puntos declarados NO es un vector: es lo que esté escrito", () => {
    // `AB` a secas es el producto A·B de toda la vida, y como tal se pinta. Inventarle un
    // vector a partir de puntos que no existen sería afirmar coordenadas que nadie ha dado.
    igual(una("AB").tipo, "libre", "sin declarar:");
    igual(parsearBloqueVector("A=(1,2)\nAB").entradas[1].tipo, "libre", "solo un extremo:");
  });

  test("el orden no importa: AB puede escribirse antes que sus puntos", () => {
    const e = parsearBloqueVector("AB\nA=(1,2)\nB=(5,4)").entradas[0];
    igual(e.tipo, "diferencia", "AB en la primera línea:");
  });

  test("la resta se lee redondeada, no con la basura de la coma flotante", () => {
    const e = parsearBloqueVector("A=(0.1,0)\nB=(0.3,0)\nAB").entradas[2];
    assert(e.tipo === "diferencia" && e.par.x === "0.2", `esperaba "0.2", obtuve "${
      e.tipo === "diferencia" ? e.par.x : "?"}"`);
  });
});

describe("obs-vector · las líneas que el bloque no interpreta", () => {
  test("la notación que el traductor no entiende se pinta TAL CUAL", () => {
    // `\nabla` no está en la lista de comandos soportados: pasarlo por el pipeline lo
    // degradaría a `n·a·b·l·a` en cursiva. KaTeX, en cambio, lo pinta perfectamente.
    // Comparación EXACTA (sin pasar por `tex`): lo que se comprueba aquí es justamente que el
    // texto llega intacto, espacios incluidos —y en `\nabla f` ese espacio es el que separa el
    // comando de su argumento, no un adorno del emisor—.
    igual(entradaALatex(una("\\nabla f(x,y)")), "\\nabla f(x,y)");
    igual(una("\\nabla f(x,y)").tipo, "libre", "tipo:");
  });

  test("una igualdad libre pasa por el mismo pipeline que el resto del plugin", () => {
    igual(tex("w = u+v"), "w=u+v");
  });

  test("un RHS que no es un par no declara nada", () => {
    igual(una("v = 3").tipo, "libre", "escalar:");
    igual(una("v = (1,2,3)").tipo, "libre", "terna:");
  });

  test("el bloque VACÍO enseña la forma que se espera, no un hueco", () => {
    igual(bloqueVectorALatex(parsearBloqueVector("")).join(""), PLANTILLA_VACIA);
    igual(bloqueVectorALatex(parsearBloqueVector("\n   \n")).join(""), PLANTILLA_VACIA);
  });

  test("una tarjeta por LÍNEA, en el orden en que están escritas", () => {
    const fs = bloqueVectorALatex(parsearBloqueVector("v=(3,2)\nA=(1,2)\n\\nabla f"));
    igual(fs.length, 3, "número de tarjetas:");
    igual(fs[0], "\\vec{v}=\\left(3,\\ 2\\right)");
    igual(fs[2], "\\nabla f");
  });
});

describe("obs-vector · qué llega al plano", () => {
  test("un vector es una flecha DESDE EL ORIGEN", () => {
    const d = dibujoDeBloque(parsearBloqueVector("v=(3,2)"));
    igual(d.flechas.length, 1, "flechas:");
    igual(d.marcas.length, 0, "marcas:");
    igual(d.flechas[0].desde.join("|"), "0|0", "arranca en el origen:");
    igual(d.flechas[0].hasta.join("|"), "3|2", "acaba en el extremo:");
  });

  test("un punto es una MARCA, no un vector de posición", () => {
    // Dibujar A=(1,2) como flecha desde el origen diría algo que el usuario no ha escrito, y
    // es justo la confusión que este bloque debería ayudar a deshacer.
    const d = dibujoDeBloque(parsearBloqueVector("A=(1,2)"));
    igual(d.flechas.length, 0, "flechas:");
    igual(d.marcas.length, 1, "marcas:");
  });

  test("AB es la flecha que va de A a B, no una desde el origen", () => {
    const d = dibujoDeBloque(parsearBloqueVector("A=(1,2)\nB=(5,4)\nAB"));
    igual(d.flechas.length, 1, "flechas:");
    igual(d.marcas.length, 2, "marcas (los dos puntos):");
    igual(d.flechas[0].desde.join("|"), "1|2", "arranca en A:");
    igual(d.flechas[0].hasta.join("|"), "5|4", "acaba en B:");
  });

  test("un CAMPO no se dibuja: no es un vector, son infinitos", () => {
    const b = parsearBloqueVector("F(x,y)=(-y,x)");
    assert(!hayDibujo(dibujoDeBloque(b)), "un campo no debería producir dibujo");
  });

  test("tampoco se dibuja lo que no tiene números", () => {
    assert(!hayDibujo(dibujoDeBloque(parsearBloqueVector("v=(a,b)"))), "componentes simbólicas");
    assert(!hayDibujo(dibujoDeBloque(parsearBloqueVector("\\nabla f"))), "notación suelta");
    assert(!hayDibujo(dibujoDeBloque(parsearBloqueVector(""))), "bloque vacío");
  });

  test("cada entrada conserva su papel en la paleta = su línea del bloque", () => {
    const d = dibujoDeBloque(parsearBloqueVector("v=(3,2)\nA=(1,2)\nw=(-1,-1)"));
    igual(d.flechas[0].rol, 0, "v:");
    igual(d.marcas[0].rol, 1, "A:");
    igual(d.flechas[1].rol, 2, "w:");
  });
});

describe("obs-vector · lo que se deduce del bloque (panel ⓘ)", () => {
  const analisis = (fuente: string) => analizarDibujo(dibujoDeBloque(parsearBloqueVector(fuente)));

  test("el módulo se da EXACTO cuando las componentes son enteras", () => {
    const A = analisis("v=(3,2)");
    igual(A?.vectores[0].modulo.exacto, "√13", "√13:");
    aprox(A?.vectores[0].modulo.valor ?? 0, Math.sqrt(13), 1e-12, "el decimal:");
    igual(analisis("v=(3,4)")?.vectores[0].modulo.exacto, "5", "cuadrado perfecto:");
    igual(analisis("v=(2,2)")?.vectores[0].modulo.exacto, "2√2", "con el factor fuera:");
  });

  test("sin componentes enteras no se finge una forma cerrada", () => {
    const A = analisis("v=(0.5,1.3)");
    igual(A?.vectores[0].modulo.exacto, null, "exacto:");
    assert((A?.vectores[0].modulo.valor ?? 0) > 1.39, "pero el decimal sí está");
  });

  test("la dirección se mide desde el semieje X positivo y da la vuelta entera", () => {
    // En [0, 2π) y no en (−π, π] como `atan2`: un vector que apunta hacia abajo está a 270°, no
    // a −90°, que es como lo lee cualquiera que mire el dibujo. Quien lo ESCRIBE es `textoAngulo`
    // (la unidad la elige el usuario), así que aquí solo se fija el número.
    aprox(analisis("v=(1,1)")?.vectores[0].direccion ?? -1, Math.PI / 4, 1e-12, "45°:");
    aprox(analisis("v=(0,-2)")?.vectores[0].direccion ?? -1, 3 * Math.PI / 2, 1e-12, "270°:");
  });

  test("la posición usa el mismo vocabulario que el círculo", () => {
    igual(analisis("v=(3,0)")?.vectores[0].posicion, "ejeX+", "sobre el eje:");
    igual(analisis("v=(-1,-1)")?.vectores[0].posicion, "III", "tercer cuadrante:");
  });

  test("el vector NULO no tiene dirección, y no se le inventa una", () => {
    const v = analisis("v=(0,0)")?.vectores[0];
    igual(v?.modulo.exacto, "0", "módulo:");
    igual(v?.direccion, null, "dirección:");
    igual(v?.posicion, null, "posición:");
    igual(v?.unitario, null, "unitario:");
  });

  test("con DOS vectores se describe la pareja: escalar, ángulo, determinante y áreas", () => {
    const P = analisis("u=(1,0)\nv=(0,1)")?.par;
    igual(P?.escalar.exacto, "0", "producto escalar:");
    aprox(P?.angulo ?? -1, Math.PI / 2, 1e-12, "ángulo:");
    igual(P?.relacion, "perpendicular", "relación:");
    igual(P?.areaParalelogramo.exacto, "1", "paralelogramo:");
    igual(P?.areaTriangulo.exacto, "1/2", "triángulo:");
  });

  test("dos vectores en la misma recta salen paralelos, no perpendiculares", () => {
    const P = analisis("u=(1,2)\nv=(2,4)")?.par;
    igual(P?.determinante.exacto, "0", "determinante:");
    igual(P?.relacion, "paralelo", "relación:");
    // Exactamente 0, no 2·10⁻⁸: es lo que distingue `atan2(|det|, u·v)` de la fórmula del
    // arcocoseno, que aquí perdía ocho cifras justo en el caso más reconocible.
    igual(P?.angulo, 0, "ángulo:");
  });

  test("con el vector nulo no se afirma ninguna relación (lo es todo a la vez)", () => {
    igual(analisis("u=(0,0)\nv=(1,1)")?.par?.relacion, null);
  });

  test("con TRES vectores no hay sección de pareja: serían tres respuestas, no una", () => {
    igual(analisis("u=(1,0)\nv=(0,1)\nw=(1,1)")?.par, null);
  });

  test("dos puntos dan distancia y punto medio, exactos si son enteros", () => {
    const P = analisis("A=(1,2)\nB=(5,4)")?.puntos;
    igual(P?.distancia.exacto, "2√5", "distancia:");
    igual(P?.medioExacto?.join("|"), "3|3", "punto medio:");
    igual(analisis("A=(0,0)\nB=(1,2)")?.puntos?.medioExacto?.join("|"), "1/2|1", "con mitades:");
  });

  test("sin nada dibujado no hay panel", () => {
    igual(analisis("F(x,y)=(-y,x)"), null, "un campo:");
    igual(analisis("\\nabla f"), null, "notación suelta:");
  });
});

describe("obs-vector · el nombre que se rotula en el plano", () => {
  // El rótulo del plano y la tarjeta tienen que decir la MISMA letra: el nombre sale del mismo
  // módulo que la tarjeta, no de una cadena compuesta en el renderizador, y esto es lo que lo
  // fija. Lo que el plano no dibuja tampoco se rotula, y esa frontera es la de `dibujoDeBloque`.
  const rotulo = (fuente: string) => rotuloALatex(una(fuente));

  test("un vector lleva su flecha, igual que en su tarjeta", () => {
    igual(rotulo("v=(3,2)"), "\\vec{v}", "minúscula:");
    igual(rotulo("\\vec{A}=(1,2)"), "\\vec{A}", "flecha escrita a mano:");
  });

  test("un punto va desnudo: no es un vector de posición", () => {
    igual(rotulo("A=(1,2)"), "A");
  });

  test("la flecha entre dos puntos cubre las dos letras", () => {
    igual(
      rotuloALatex(parsearBloqueVector("A=(1,2)\nB=(5,4)\nAB").entradas[2]),
      "\\overrightarrow{AB}"
    );
  });

  test("un nombre de dos letras lleva \\overrightarrow; uno decorado sigue con \\vec", () => {
    // `\vec` es una flecha corta y centrada: sobre `AB` parece la flecha de la A. La base es lo
    // que cuenta, así que un subíndice o una prima no convierten una variable en dos.
    igual(rotulo("ab=(3,2)"), "\\overrightarrow{ab}", "dos letras:");
    igual(rotulo("v_1=(1,0)"), "\\vec{v_1}", "subíndice:");
    igual(rotulo("u'=(0,1)"), "\\vec{u'}", "prima:");
  });

  test("lo que no se dibuja no se rotula", () => {
    igual(rotulo("F(x,y)=(-y,x)"), null, "campo:");
    igual(rotulo("\\nabla f(x,y)"), null, "notación suelta:");
  });
});

describe("obs-vector · el encuadre", () => {
  const ASPECTO = 768 / 261;   // el bloque de escritorio

  test("lo que cabe holgado en la vista de siempre no la mueve", () => {
    const d = dibujoDeBloque(parsearBloqueVector("v=(3,2)"));
    igual(encuadreDeDibujo(d, 7, ASPECTO), null, "vector pequeño:");
  });

  test("un vector grande ALEJA hasta que entra entero", () => {
    const d = dibujoDeBloque(parsearBloqueVector("v=(0,40)"));
    const semi = encuadreDeDibujo(d, 7, ASPECTO);
    assert(semi !== null && semi >= 40, `esperaba ≥40, obtuve ${String(semi)}`);
  });

  test("un vector diminuto ACERCA (si no, se ve como un punto en el centro)", () => {
    const d = dibujoDeBloque(parsearBloqueVector("v=(0.2,0.1)"));
    const semi = encuadreDeDibujo(d, 7, ASPECTO);
    assert(semi !== null && semi < 1, `esperaba <1, obtuve ${String(semi)}`);
  });

  test("la extensión HORIZONTAL también encuadra, corregida por el aspecto", () => {
    // 40 de ancho en una caja casi 3× más ancha que alta necesita ~14 de semirrango vertical:
    // pedir 40 dejaría el plano vacío, y pedir 0 lo dejaría cortado.
    const d = dibujoDeBloque(parsearBloqueVector("v=(40,0)"));
    const semi = encuadreDeDibujo(d, 7, ASPECTO) ?? 0;
    aprox(semi, (40 * 1.25) / ASPECTO, 1e-9, "semirrango vertical:");
  });

  test("sin nada que encuadrar no se toca la vista", () => {
    igual(encuadreDeDibujo({ flechas: [], marcas: [] }, 7, ASPECTO), null, "dibujo vacío:");
    const nulo = dibujoDeBloque(parsearBloqueVector("v=(0,0)"));
    igual(encuadreDeDibujo(nulo, 7, ASPECTO), null, "vector nulo:");
  });
});

// ─────────────────────────────────────────────
// El RECORTE del trazo al lienzo
// ─────────────────────────────────────────────
//
// Con mucho zoom los extremos del vector se van a millones de píxeles y el rasterizador del
// canvas, que trabaja en coma fija, deja de ser fiable: la línea salía con otra inclinación o
// no salía. El recorte es lo que impide que esas coordenadas lleguen al canvas.
//
// La propiedad que hay que defender no es "corta bien", es que **el ángulo no cambia**: los dos
// extremos devueltos tienen que caer sobre la recta original. Eso es lo que se mide aquí.
describe("obs-vector · recorte del trazo al lienzo", () => {
  const CAJA = { anchoPx: 400, altoPx: 300 };
  /** Distancia del punto (x,y) a la recta que pasa por P0 y P1, en píxeles. */
  const desviacion = (
    x: number, y: number, x0: number, y0: number, x1: number, y1: number
  ): number => {
    const dx = x1 - x0, dy = y1 - y0;
    return Math.abs((x - x0) * dy - (y - y0) * dx) / Math.hypot(dx, dy);
  };

  test("un segmento que ya cabe entero no se toca", () => {
    const r = recortarSegmento(10, 20, 300, 200, CAJA);
    igual(r?.join(","), "10,20,300,200", "segmento interior:");
  });

  test("un segmento entero fuera no se dibuja", () => {
    igual(recortarSegmento(2000, 10, 3000, 200, CAJA), null, "a la derecha:");
    igual(recortarSegmento(10, -5000, 300, -4000, CAJA), null, "por encima:");
  });

  test("EL BUG: con extremos a millones de píxeles, el ángulo se conserva", () => {
    // Un vector cualquiera visto con un zoom brutal: los dos extremos caen lejísimos, y el
    // trozo que de verdad cruza la pantalla es una franja diminuta de esa recta.
    const x0 = -12_345_678, y0 = -6_172_839;
    const x1 = 23_456_789, y1 = 11_728_394;
    const r = recortarSegmento(x0, y0, x1, y1, CAJA);
    assert(r !== null, "el segmento cruza el lienzo, no puede descartarse");
    if (r === null) return;
    // 1. Lo que se le pasa al canvas ya es del tamaño del lienzo (y no millones).
    for (const v of r) assert(Math.abs(v) < 1e4, `coordenada aún enorme: ${v}`);
    // 2. Y sigue siendo LA MISMA RECTA: los dos extremos recortados caen sobre ella.
    aprox(desviacion(r[0], r[1], x0, y0, x1, y1), 0, 1e-6, "extremo inicial fuera de la recta:");
    aprox(desviacion(r[2], r[3], x0, y0, x1, y1), 0, 1e-6, "extremo final fuera de la recta:");
  });

  test("un segmento vertical (dx = 0) se recorta igual", () => {
    const r = recortarSegmento(200, -9_000_000, 200, 9_000_000, CAJA);
    assert(r !== null, "una vertical que cruza el lienzo se dibuja");
    if (r === null) return;
    igual(r[0], 200, "x del extremo inicial:");
    igual(r[2], 200, "x del extremo final:");
    assert(r[1] < r[3], "los extremos conservan el sentido del trazo");
  });

  test("el orden de los extremos se respeta (la punta va donde iba)", () => {
    const r = recortarSegmento(1_000_000, 150, -1_000_000, 150, CAJA);
    assert(r !== null && r[0] > r[2], "un trazo de derecha a izquierda no se invierte");
  });

  test("un segmento con coordenadas no finitas no se dibuja", () => {
    igual(recortarSegmento(0, 0, Infinity, 100, CAJA), null, "infinito:");
    igual(recortarSegmento(NaN, 0, 100, 100, CAJA), null, "NaN:");
  });
});
