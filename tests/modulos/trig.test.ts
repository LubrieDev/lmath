// ─────────────────────────────────────────────
// tests · obs-trig: parser del bloque y modelo del ángulo
// ─────────────────────────────────────────────
//
// Lógica PURA (sin DOM ni canvas). Cubre las dos reglas que más fácil se rompen sin que nadie
// se entere: que un número desnudo son RADIANES (la convención de todo LMath) y que las razones
// que no existen valen `null` y no un número enorme.

import { describe, test, assert, igual, aprox } from "../runner";
import {
  modeloDeAngulo, coterminalPrincipal, posicionDe, referenciaDe, aRadianes, aGrados, DOS_PI,
} from "../../src/trig/modeloTrig";
import {
  parsearBloqueTrig, evaluarAngulo, componenteNombrada, ANGULO_POR_DEFECTO,
} from "../../src/trig/bloqueTrig";
import {
  anguloDePuntero, deltaAngular, imantar, imanVigente, agarraCircunferencia, indiceMasCercano,
  rangoDeslizador, acotarARecorrido, pasoAnimacion,
} from "../../src/trig/interaccionTrig";
import {
  encuadreTrig, textoAngulo, textoGradosDe, colorComponente, COMPONENTES,
} from "../../src/trig/renderTrig";
import { fijarTemaPlano } from "../../src/motor/rendering/paleta";
import { t, fijarIdioma, idiomaActivo, IDIOMAS } from "../../src/i18n";
import {
  razonesExactas, puntoExactoTexto, radianesExactoLatex, fuenteSimbolica, PASO_NOTABLE,
} from "../../src/trig/exactosTrig";

const G = (grados: number) => aRadianes(grados);

describe("obs-trig · unidades de entrada (la convención de LMath)", () => {
  test("un número DESNUDO son radianes, no grados", () => {
    // La trampa clásica: `30` no es 30°. Si esto cambia, `sin(30)` deja de significar lo mismo
    // dentro de obs-trig que dentro de obs-graph en la misma nota.
    aprox(evaluarAngulo("30") ?? NaN, 30, 1e-12, "30 desnudo:");
  });

  test("el símbolo ° es explícito y convierte a radianes", () => {
    aprox(evaluarAngulo("30°") ?? NaN, Math.PI / 6, 1e-12, "30°:");
    aprox(evaluarAngulo("-45°") ?? NaN, -Math.PI / 4, 1e-12, "−45°:");
  });

  test("acepta las formas LaTeX y simbólicas del resto del plugin", () => {
    aprox(evaluarAngulo("\\frac{\\pi}{6}") ?? NaN, Math.PI / 6, 1e-12, "\\frac{\\pi}{6}:");
    aprox(evaluarAngulo("pi/6") ?? NaN, Math.PI / 6, 1e-12, "pi/6:");
    aprox(evaluarAngulo("2\\pi") ?? NaN, DOS_PI, 1e-12, "2\\pi (producto implícito):");
  });

  test("lo que no da un número real se rechaza (no se inventa un ángulo)", () => {
    igual(evaluarAngulo("x"), null, "símbolo libre:");
    igual(evaluarAngulo(""), null, "vacío:");
    igual(evaluarAngulo("1/0"), null, "no finito:");
  });
});

describe("obs-trig · parser del bloque", () => {
  test("bloque VACÍO → un círculo funcional a 30°, sin avisos", () => {
    const b = parsearBloqueTrig("");
    igual(b.angulos.length, 1, "nº de ángulos:");
    aprox(b.angulos[0].radianes, ANGULO_POR_DEFECTO, 1e-12, "ángulo por defecto:");
    igual(b.avisos.length, 0, "avisos:");
  });

  test("la etiqueta es lo que hay a la izquierda del =; sin = se llama θ", () => {
    const b = parsearBloqueTrig("\\alpha = 30°\n150°");
    igual(b.angulos.length, 2, "nº de ángulos:");
    igual(b.angulos[0].etiqueta, "\\alpha", "etiqueta escrita:");
    igual(b.angulos[1].etiqueta, "θ", "etiqueta por defecto:");
    aprox(b.angulos[1].radianes, G(150), 1e-12, "150°:");
  });

  test("varios ángulos, uno por línea", () => {
    const b = parsearBloqueTrig("α = 30°\nβ = 150°\nγ = 210°\nδ = 330°");
    igual(b.angulos.length, 4, "nº de ángulos:");
    igual(b.avisos.length, 0, "avisos:");
  });

  test("el bloque NO se configura: cualquier línea es un ángulo o un aviso", () => {
    // Esta es la regla que impide que obs-trig vuelva a crecer: sin sintaxis de opciones no hay
    // dónde colgar la siguiente. Se comprueba sobre las claves que EXISTIERON en algún momento del
    // desarrollo —modos, capas, unidad, imán, velocidad—, que son justo las que alguien podría
    // reintroducir sin darse cuenta. Todas caen por el mismo sitio: no son un ángulo.
    for (const clave of ["unit", "snap", "speed", "unidad", "iman", "modo", "mostrar", "capas"]) {
      const b = parsearBloqueTrig(`${clave}: 45°`);
      igual(b.avisos.length, 1, `${clave} avisa:`);
      igual(b.avisos[0].tipo, "anguloNoValido", `${clave} tipo:`);
      igual(b.angulos.length, 1, `${clave} no deja ángulos legibles:`);
      aprox(b.angulos[0].radianes, ANGULO_POR_DEFECTO, 1e-12, `${clave} cae al defecto:`);
    }
  });

  test("un `=` con nombre a la izquierda NO se confunde con una clave", () => {
    // La única sintaxis que sobrevive es `nombre = ángulo`, y tiene que seguir funcionando con
    // nombres que se parecen a una opción.
    const b = parsearBloqueTrig("unit = 45°");
    igual(b.avisos.length, 0, "avisos:");
    igual(b.angulos[0].etiqueta, "unit", "etiqueta:");
    aprox(b.angulos[0].radianes, G(45), 1e-12, "radianes:");
  });

  test("una expresión que no es un ángulo avisa, y las demás líneas sobreviven", () => {
    const b = parsearBloqueTrig("30°\nθ = x\n60°");
    igual(b.angulos.length, 2, "ángulos legibles:");
    igual(b.avisos.length, 1, "avisos:");
    igual(b.avisos[0].tipo, "anguloNoValido", "tipo:");
  });
});

describe("obs-trig · la componente que el bloque NOMBRA", () => {
  test("una llamada exacta a sin, cos o tan enciende su componente", () => {
    igual(componenteNombrada("sin(30)"), "seno", "sin(30):");
    igual(componenteNombrada("cos(45)"), "coseno", "cos(45):");
    igual(componenteNombrada("tan(45)"), "tangente", "tan(45):");
  });

  test("da igual CÓMO se escriba la llamada: se mira ya normalizada", () => {
    // Las cuatro son la misma llamada para el parser del plugin, así que tienen que serlo
    // también aquí. Comprobarlo sobre el texto crudo habría exigido una regla por grafía.
    for (const expr of ["\\sin{30}", "\\sin 30", "\\sin(30)", "sin(30°)"]) {
      igual(componenteNombrada(expr), "seno", `${expr}:`);
    }
    igual(componenteNombrada("\\tan{\\frac{\\pi}{4}}"), "tangente", "\\tan{\\frac{\\pi}{4}}:");
    igual(componenteNombrada("cos(\\frac{\\pi}{3})"), "coseno", "cos(π/3):");
  });

  test("NO enciende nada si la llamada no es la expresión ENTERA", () => {
    // `sin(30)+cos(30)` empieza por `sin(` y acaba en `)`: solo emparejar niveles de paréntesis
    // descubre que ese cierre final no es el de la llamada. Una regex glotona lo daba por bueno.
    for (const expr of ["2sin(30)", "-sin(30)", "sin(30)*2", "sin(30)+cos(30)", "sin(30)-0"]) {
      igual(componenteNombrada(expr), null, `${expr}:`);
    }
  });

  test("las funciones que SE PARECEN no cuentan", () => {
    // Ninguna de estas tiene trazo en la figura, y las tres primeras además empiezan por el
    // nombre de una que sí lo tiene.
    for (const expr of ["asin(0.5)", "arcsin(0.5)", "sinh(1)", "tanh(1)", "cot(30)", "sec(30)"]) {
      igual(componenteNombrada(expr), null, `${expr}:`);
    }
  });

  test("el ángulo tiene que ser CONSTANTE", () => {
    igual(componenteNombrada("sin(x)"), null, "sin(x):");
    igual(componenteNombrada("sin()"), null, "sin():");
    igual(componenteNombrada("sin(30"), null, "paréntesis sin cerrar:");
  });

  test("un ángulo corriente no nombra ninguna componente", () => {
    for (const expr of ["30°", "\\frac{\\pi}{6}", "750°", "0.5", ""]) {
      igual(componenteNombrada(expr), null, `${expr}:`);
    }
  });

  test("nombrar la componente NO cambia el ángulo", () => {
    // La regla que sostiene todo lo demás: esto elige un TRAZO, no reinterpreta la fuente.
    // `sin(30)` sigue valiendo 0,5 —el literal de una trigonométrica son grados en todo LMath—
    // y esos 0,5 son los radianes del bloque, exactamente como antes de existir esta función.
    const b = parsearBloqueTrig("θ = sin(30)");
    igual(b.angulos[0].componente, "seno", "componente:");
    aprox(b.angulos[0].radianes, 0.5, 1e-12, "el ángulo sigue siendo el valor evaluado:");
    igual(b.avisos.length, 0, "avisos:");
  });

  test("el bloque por defecto y las líneas ilegibles no encienden nada", () => {
    igual(parsearBloqueTrig("").angulos[0].componente, null, "bloque vacío:");
    igual(parsearBloqueTrig("basura!!").angulos[0].componente, null, "caída al defecto:");
  });

  test("cada ángulo lleva la suya, para que el activo decida", () => {
    const b = parsearBloqueTrig("α = sin(30)\nβ = 45°\nγ = tan(60)");
    igual(b.angulos[0].componente, "seno", "α:");
    igual(b.angulos[1].componente, null, "β:");
    igual(b.angulos[2].componente, "tangente", "γ:");
  });

  test("la componente nombrada es una de las tres DIBUJABLES", () => {
    // Si alguien añadiera una función a la tabla sin trazo que la respalde, el bloque intentaría
    // encender algo que el renderizador no sabe pintar.
    for (const expr of ["sin(30)", "cos(30)", "tan(30)"]) {
      const c = componenteNombrada(expr);
      assert(c !== null && COMPONENTES.includes(c), `${expr} es dibujable`);
    }
  });
});

describe("obs-trig · posición del lado terminal", () => {
  test("los cuatro cuadrantes", () => {
    igual(posicionDe(G(30)), "I", "30°:");
    igual(posicionDe(G(150)), "II", "150°:");
    igual(posicionDe(G(210)), "III", "210°:");
    igual(posicionDe(G(330)), "IV", "330°:");
  });

  test("los ángulos de EJE no caen en ningún cuadrante", () => {
    // El error que esto previene: `Math.cos(Math.PI/2)` es 6.1e-17 —positivo—, así que
    // clasificar por el signo del coseno metía 90° en el primer cuadrante.
    igual(posicionDe(G(0)), "ejeX+", "0°:");
    igual(posicionDe(G(90)), "ejeY+", "90°:");
    igual(posicionDe(G(180)), "ejeX-", "180°:");
    igual(posicionDe(G(270)), "ejeY-", "270°:");
  });

  test("un ángulo a un pelo del eje SIGUE en su cuadrante", () => {
    // La tolerancia de eje es 1e-12 rad: no debe tragarse ángulos escritos a mano.
    igual(posicionDe(G(89.9999)), "I", "89,9999°:");
  });

  test("ángulo de referencia: agudo con el eje X, y degenerado sobre los ejes", () => {
    aprox(referenciaDe(G(150)), G(30), 1e-12, "150°:");
    aprox(referenciaDe(G(210)), G(30), 1e-12, "210°:");
    aprox(referenciaDe(G(330)), G(30), 1e-12, "330°:");
    aprox(referenciaDe(G(180)), 0, 1e-12, "180° (horizontal):");
    aprox(referenciaDe(G(90)), Math.PI / 2, 1e-12, "90° (vertical):");
  });
});

describe("obs-trig · vueltas, coterminales y signo", () => {
  test("un ángulo negativo conserva su signo y da su coterminal aparte", () => {
    const m = modeloDeAngulo(G(-45));
    aprox(m.grados, -45, 1e-9, "grados:");
    aprox(m.coterminal, G(315), 1e-12, "coterminal:");
    igual(m.posicion, "IV", "posición:");
    igual(m.vueltas, 0, "vueltas:");
  });

  test("750° son dos vueltas y un coterminal de 30°", () => {
    const m = modeloDeAngulo(G(750));
    igual(m.vueltas, 2, "vueltas:");
    aprox(m.coterminal, G(30), 1e-12, "coterminal:");
  });

  test("−400° es UNA vuelta hacia atrás (no dos)", () => {
    // `Math.floor` daría −2 aquí: las vueltas de un ángulo negativo se cuentan con `trunc`.
    igual(modeloDeAngulo(G(-400)).vueltas, -1, "vueltas:");
  });

  test("720° cierra en el eje X positivo, sin residuo", () => {
    const m = modeloDeAngulo(G(720));
    igual(m.coterminal, 0, "coterminal:");
    igual(m.posicion, "ejeX+", "posición:");
  });

  test("arco y sector se leen del ángulo, no del dibujo", () => {
    const m = modeloDeAngulo(G(-45));
    aprox(m.arco, Math.PI / 4, 1e-12, "arco = |θ|:");
    aprox(m.sector, Math.PI / 8, 1e-12, "sector = |θ|/2:");
  });
});

describe("obs-trig · las seis razones y sus casos límite", () => {
  test("valores correctos en un ángulo cualquiera", () => {
    const r = modeloDeAngulo(G(30)).razones;
    aprox(r.sin, 0.5, 1e-12, "sin 30°:");
    aprox(r.cos, Math.sqrt(3) / 2, 1e-12, "cos 30°:");
    aprox(r.tan ?? NaN, 1 / Math.sqrt(3), 1e-12, "tan 30°:");
    aprox(r.csc ?? NaN, 2, 1e-12, "csc 30°:");
    aprox(r.sec ?? NaN, 2 / Math.sqrt(3), 1e-12, "sec 30°:");
    aprox(r.cot ?? NaN, Math.sqrt(3), 1e-12, "cot 30°:");
  });

  test("tan y sec NO existen en 90° y 270°", () => {
    for (const g of [90, 270]) {
      const r = modeloDeAngulo(G(g)).razones;
      igual(r.tan, null, `tan ${g}°:`);
      igual(r.sec, null, `sec ${g}°:`);
      assert(r.csc !== null && r.cot !== null, `csc/cot sí existen en ${g}°`);
    }
  });

  test("cot y csc NO existen en 0° y 180°", () => {
    for (const g of [0, 180]) {
      const r = modeloDeAngulo(G(g)).razones;
      igual(r.csc, null, `csc ${g}°:`);
      igual(r.cot, null, `cot ${g}°:`);
      assert(r.tan !== null && r.sec !== null, `tan/sec sí existen en ${g}°`);
    }
  });

  test("sobre los ejes, seno y coseno son EXACTOS (0 y ±1, no 6e-17)", () => {
    igual(modeloDeAngulo(G(90)).razones.cos, 0, "cos 90°:");
    igual(modeloDeAngulo(G(90)).razones.sin, 1, "sin 90°:");
    igual(modeloDeAngulo(G(180)).razones.sin, 0, "sin 180°:");
    igual(modeloDeAngulo(G(180)).razones.cos, -1, "cos 180°:");
  });

  test("el punto está sobre la circunferencia unidad en todo el giro", () => {
    for (let g = 0; g < 360; g += 7) {
      const p = modeloDeAngulo(G(g)).punto;
      aprox(Math.hypot(p.x, p.y), 1, 1e-12, `|P| en ${g}°:`);
    }
  });

  test("la identidad pitagórica se cumple numéricamente en todo el giro", () => {
    // Es la comprobación que el panel ⓘ muestra: numérica, sin álgebra simbólica detrás.
    for (let g = 0; g < 360; g += 11) {
      const r = modeloDeAngulo(G(g)).razones;
      aprox(r.sin * r.sin + r.cos * r.cos, 1, 1e-12, `sin²+cos² en ${g}°:`);
    }
  });

  test("coterminalPrincipal siempre cae en [0, 2π)", () => {
    for (const g of [-720, -400, -45, 0, 45, 359, 360, 750, 3600]) {
      const c = coterminalPrincipal(G(g));
      assert(c >= 0 && c < DOS_PI, `coterminal de ${g}° fuera de rango: ${c}`);
    }
  });
});

describe("obs-trig · aritmética del arrastre", () => {
  const E = encuadreTrig(300, 300);   // centro (150,150), R = 111

  test("el ángulo del puntero invierte la Y del lienzo", () => {
    // Sin invertir, arrastrar hacia arriba BAJARÍA el ángulo: el eje Y del canvas crece hacia
    // abajo y el del plano hacia arriba.
    aprox(anguloDePuntero(E, 150 + 50, 150), 0, 1e-12, "a la derecha:");
    aprox(anguloDePuntero(E, 150, 150 - 50), Math.PI / 2, 1e-12, "arriba:");
    aprox(anguloDePuntero(E, 150, 150 + 50), -Math.PI / 2, 1e-12, "abajo:");
  });

  test("el giro se ACUMULA: cruzar el 0 sigue sumando", () => {
    // Es lo que permite dar vueltas completas arrastrando (y que la espiral signifique algo).
    aprox(deltaAngular(G(350), G(10)), G(20), 1e-12, "350°→10°:");
    aprox(deltaAngular(G(10), G(350)), G(-20), 1e-12, "10°→350°:");
    aprox(deltaAngular(G(0), G(90)), G(90), 1e-12, "0°→90°:");
  });

  test("el imán se pega a los múltiplos de 15° y respeta lo que está lejos", () => {
    aprox(imantar(G(32)), G(30), 1e-12, "32° → 30°:");
    aprox(imantar(G(43)), G(45), 1e-12, "43° → 45°:");
    aprox(imantar(G(37)), G(37), 1e-12, "37° se queda (a 7° del notable):");
  });

  test("el imán conserva las VUELTAS (no devuelve al primer giro)", () => {
    aprox(imantar(G(733)), G(735), 1e-12, "733° → 735°, no → 15°:");
  });

  test("Alt suspende el imán mientras se mantiene, y solo lo suspende", () => {
    // La vía de escape que promete la descripción del ajuste: colocar el punto en un ángulo
    // cualquiera sin ir a apagar el imán y volver a encenderlo.
    igual(imanVigente(true, false), true, "ajuste on, sin Alt:");
    igual(imanVigente(true, true), false, "ajuste on, con Alt:");
    // Con el ajuste apagado no hay imán que suspender: Alt no puede ENCENDERLO.
    igual(imanVigente(false, false), false, "ajuste off, sin Alt:");
    igual(imanVigente(false, true), false, "ajuste off, con Alt:");
  });

  test("solo se agarra cerca de la circunferencia", () => {
    assert(agarraCircunferencia(E, 150 + E.R, 150, 20), "sobre la circunferencia");
    assert(agarraCircunferencia(E, 150 + E.R - 15, 150, 20), "un poco por dentro");
    assert(!agarraCircunferencia(E, 150, 150, 20), "el centro NO se agarra");
    assert(!agarraCircunferencia(E, 150 + E.R + 40, 150, 20), "muy por fuera tampoco");
  });

  test("con varios ángulos se agarra el más cercano en distancia ANGULAR", () => {
    const angulos = [G(30), G(150), G(210), G(330)];
    igual(indiceMasCercano(angulos, G(40)), 0, "cerca de 30°:");
    igual(indiceMasCercano(angulos, G(160)), 1, "cerca de 150°:");
    igual(indiceMasCercano(angulos, G(340)), 3, "cerca de 330°:");
    // Cruzando el 0: 350° está más cerca de 330° que de 30°, por 20° contra 40°.
    igual(indiceMasCercano(angulos, G(350)), 3, "cruzando el origen:");
  });
});

describe("obs-trig · tabla de exactos (verificada contra Math)", () => {
  // La tabla se evalúa con el PROPIO pipeline del plugin: si una casilla tiene un LaTeX mal
  // escrito, o el valor equivocado, esto lo caza. Es lo que convierte "confía en la tabla" en
  // "está probado", y de paso comprueba que KaTeX recibirá algo que el parser entiende.
  const evaluar = (tex: string): number => {
    const v = evaluarAngulo(tex);
    if (v === null) throw new Error(`LaTeX no evaluable: ${tex}`);
    return v;
  };

  test("las 24 posiciones notables coinciden con Math a 1e-12", () => {
    for (let k = 0; k < 24; k++) {
      const rad = k * PASO_NOTABLE;
      const ex = razonesExactas(rad);
      // `throw` y no `assert`: el runner no declara sus aserciones como `asserts`, así que
      // TypeScript no estrecha el tipo a partir de ellas y `ex` seguiría siendo anulable.
      if (ex === null) throw new Error(`sin exactos en k=${k}`);
      const num = modeloDeAngulo(rad).razones;
      const pares: Array<[string, { tex: string } | null, number | null]> = [
        ["sin", ex.sin, num.sin], ["cos", ex.cos, num.cos], ["tan", ex.tan, num.tan],
        ["csc", ex.csc, num.csc], ["sec", ex.sec, num.sec], ["cot", ex.cot, num.cot],
      ];
      for (const [nombre, exacto, valor] of pares) {
        if (valor === null) {
          igual(exacto, null, `${nombre} en ${k * 15}° debería ser indefinida:`);
          continue;
        }
        if (exacto === null) throw new Error(`${nombre} en ${k * 15}°: falta el exacto`);
        aprox(evaluar(exacto.tex), valor, 1e-12, `${nombre} en ${k * 15}°:`);
      }
    }
  });

  test("la reducción es coherente entre cuadrantes (no hay erratas por casilla)", () => {
    // sin 150° tiene que ser EXACTAMENTE el mismo texto que sin 30°, y cos 150° su opuesto.
    igual(razonesExactas(G(150))?.sin.tex, razonesExactas(G(30))?.sin.tex, "sin 150° vs sin 30°:");
    igual(razonesExactas(G(150))?.cos.tex, `-${razonesExactas(G(30))?.cos.tex}`, "cos 150°:");
    igual(razonesExactas(G(210))?.sin.tex, `-${razonesExactas(G(30))?.sin.tex}`, "sin 210°:");
    igual(razonesExactas(G(330))?.cos.tex, razonesExactas(G(30))?.cos.tex, "cos 330°:");
  });

  test("el cero exacto no se escribe con signo", () => {
    igual(razonesExactas(G(180))?.sin.txt, "0", "sin 180°:");
    igual(razonesExactas(G(270))?.cos.txt, "0", "cos 270°:");
  });

  test("un ángulo NO notable no tiene exactos", () => {
    igual(razonesExactas(G(37)), null, "37°:");
    igual(razonesExactas(1), null, "1 rad:");
  });

  test("las coordenadas exactas del punto", () => {
    igual(puntoExactoTexto(G(30)), "(√3/2, 1/2)", "30°:");
    igual(puntoExactoTexto(G(135)), "(−√2/2, √2/2)", "135°:");
    igual(puntoExactoTexto(G(37)), null, "37° (no notable):");
  });

  test("el ángulo en radianes como múltiplo exacto de π", () => {
    igual(radianesExactoLatex(0), "0", "0:");
    igual(radianesExactoLatex(G(30)), "\\frac{\\pi}{6}", "30°:");
    igual(radianesExactoLatex(G(180)), "\\pi", "180°:");
    igual(radianesExactoLatex(G(270)), "\\frac{3\\pi}{2}", "270°:");
    igual(radianesExactoLatex(G(360)), "2\\pi", "360°:");
    igual(radianesExactoLatex(G(-45)), "-\\frac{\\pi}{4}", "−45°:");
    igual(radianesExactoLatex(G(37)), null, "37°:");
  });
});

describe("obs-trig · el derecho a un valor exacto", () => {
  test("un DECIMAL nunca lo tiene, por cerca que pase de un notable", () => {
    // 0.5236 se parece muchísimo a π/6, pero no lo es: enseñar 1/2 como su seno sería mentir.
    igual(fuenteSimbolica("0.5236"), false, "0.5236:");
    igual(fuenteSimbolica("0.5235987755982988"), false, "π/6 tecleado en decimal:");
    igual(fuenteSimbolica("1.5"), false, "1.5:");
  });

  test("grados y π sí lo dan", () => {
    igual(fuenteSimbolica("30°"), true, "30°:");
    igual(fuenteSimbolica("\\frac{\\pi}{6}"), true, "\\frac{\\pi}{6}:");
    igual(fuenteSimbolica("pi/6"), true, "pi/6:");
    igual(fuenteSimbolica("2\\pi"), true, "2\\pi:");
  });

  test("ser simbólico no basta: hay que caer en un notable", () => {
    // `pi/7` está escrito en términos exactos pero no es múltiplo de 15°: no hay entrada.
    assert(fuenteSimbolica("pi/7"), "pi/7 es simbólico");
    igual(razonesExactas(Math.PI / 7), null, "pi/7 no tiene exactos:");
  });
});

describe("obs-trig · unidad de PRESENTACIÓN", () => {
  test("el mismo ángulo se rotula en grados o en radianes, sin cambiar de valor", () => {
    // El chip °/rad es presentación pura: conmutarlo no puede mover el ángulo. Lo que cambia es
    // el texto; el modelo que lo produce es exactamente el mismo objeto.
    const m = modeloDeAngulo(G(30));
    igual(textoAngulo(m, "degrees"), "30°", "grados:");
    igual(textoAngulo(m, "radians"), `${String.fromCharCode(960)}/6 rad`, "radianes:");
  });

  test("un ángulo NO notable se rotula en decimal, no como fracción inventada de pi", () => {
    const m = modeloDeAngulo(1);
    igual(textoAngulo(m, "radians"), "1.0000 rad", "1 rad:");
  });

  test("los grados se escriben IGUAL en todas partes", () => {
    // La lectura del panel y las filas del panel ⓘ son el mismo número a un centímetro de
    // distancia, así que tienen que salir de la misma función. Cuando el ⓘ redondeaba por su
    // cuenta a dos decimales, 2 rad se leía `114.6°` arriba y `114.59°` abajo, a la vez.
    igual(textoGradosDe(2), "114.6°", "2 rad:");
    igual(textoAngulo(modeloDeAngulo(2), "degrees"), textoGradosDe(2), "panel = ⓘ:");
  });

  test("un ángulo entero en grados no arrastra decimales", () => {
    // Todo lo escrito con `°` cae aquí, que es la inmensa mayoría de los bloques.
    igual(textoGradosDe(G(30)), "30°", "30°:");
    igual(textoGradosDe(G(-45)), "-45°", "−45°:");
    igual(textoGradosDe(0), "0°", "0:");
    igual(textoGradosDe(G(750)), "750°", "750°:");
  });

  test("gradianes: la vuelta son 400 y el ángulo recto 100", () => {
    // Es la definición de la unidad y de donde le viene el nombre. Si esto se rompe, el gradián
    // deja de ser un gradián y el chip enseña un número que no significa nada.
    for (const [grados, esperado] of [[0, "0"], [45, "50"], [90, "100"], [360, "400"]] as const) {
      igual(textoAngulo(modeloDeAngulo(G(grados)), "gradians"), `${esperado} gon`, `${grados}°:`);
    }
  });

  test("gradianes: los múltiplos de 30° NO son redondos, y se escriben como son", () => {
    // 30° son 33,33ᵍ. No hay forma exacta que rescatar —los gradianes están hechos para que el
    // ángulo recto sea 100, no para que lo sean los tercios—, así que se muestra el decimal
    // recortado en vez de inventar una fracción o redondear a 33.
    igual(textoAngulo(modeloDeAngulo(G(30)), "gradians"), "33.33 gon", "30°:");
    igual(textoAngulo(modeloDeAngulo(G(60)), "gradians"), "66.67 gon", "60°:");
  });

  test("las tres unidades tienen etiqueta en los DOS idiomas", () => {
    // El chip construye su tooltip buscando la etiqueta de la unidad activa: olvidar una cadena
    // no daría error de compilación, daría un tooltip a medias.
    const previo = idiomaActivo();
    for (const idioma of IDIOMAS) {
      fijarIdioma(idioma);
      const o = t().ajustes.trig;
      for (const [clave, rotulo] of Object.entries({
        grados: o.opcionGrados, radianes: o.opcionRadianes, gradianes: o.opcionGradianes,
      })) {
        assert(rotulo.trim().length > 0, `falta la etiqueta de ${clave} en ${idioma}`);
      }
    }
    fijarIdioma(previo);
  });
});

describe("obs-trig · la animación no cuenta vueltas", () => {
  const VEL = aRadianes(60);   // 60°/s, el defecto

  test("al completar la vuelta vuelve a 0, no sigue a 361°", () => {
    // 359° + 60°/s durante 1/30 s = 361°, que es el punto de 1°. Es la regla entera del cambio:
    // dos números distintos para la misma posición confunden más de lo que informan.
    const siguiente = pasoAnimacion(G(359), VEL, 1 / 30);
    aprox(aGrados(siguiente), 1, 1e-9, "359° + 2°:");
  });

  test("nunca se sale de [0, 360) por mucho que gire", () => {
    let a = G(30);
    for (let i = 0; i < 600; i++) {
      a = pasoAnimacion(a, VEL, 1 / 30);
      assert(a >= 0 && a < DOS_PI, `se salió del intervalo en el paso ${i}: ${aGrados(a)}°`);
    }
    // 600 pasos de 2° son diez vueltas y media: sin la reducción esto valdría 3630°.
    aprox(aGrados(a), 150, 1e-9, "tras diez vueltas y media:");
  });

  test("un ángulo multivuelta se reduce en el primer paso SIN mover el punto", () => {
    // Es la única consecuencia visible: el número pasa de 750° a 30°, pero 750° y 30° son la
    // misma posición, así que el dibujo no se inmuta.
    const siguiente = pasoAnimacion(G(750), VEL, 0);
    aprox(aGrados(siguiente), 30, 1e-9, "750° reducido:");
    const m1 = modeloDeAngulo(G(750));
    const m2 = modeloDeAngulo(siguiente);
    aprox(m2.punto.x, m1.punto.x, 1e-12, "misma x:");
    aprox(m2.punto.y, m1.punto.y, 1e-12, "misma y:");
  });

  test("el ARRASTRE sigue acumulando: la asimetría es deliberada", () => {
    // Girar con el dedo es una intención (quiero otra vuelta); girar solo es tiempo transcurrido.
    // Si esto cambia, el contador de vueltas del ⓘ deja de significar nada.
    const trasArrastre = G(350) + deltaAngular(G(350), G(10));
    aprox(aGrados(trasArrastre), 370, 1e-9, "350° → 10° arrastrando:");
  });
});

describe("obs-trig · recorrido del deslizador", () => {
  test("un bloque normal recorre una vuelta a CADA lado", () => {
    const r = rangoDeslizador([30]);
    igual(`${r.min}..${r.max}`, "-360..360", "30°:");
  });

  test("el 0 queda SIEMPRE en el centro", () => {
    // Es la razón de ser del recorrido simétrico: el punto de referencia se encuentra sin leer el
    // número. Se comprueba en los casos que más tientan a ensanchar por un solo lado.
    for (const caso of [[30], [-45], [750], [-400, 500], [123.4], [0]]) {
      const r = rangoDeslizador(caso);
      igual(r.min + r.max, 0, `centro con [${caso.join(", ")}]:`);
    }
  });

  test("se ENSANCHA hasta contener lo que dice el bloque", () => {
    // Un mando que no alcanza el ángulo escrito es un mando roto: al montarse pondría la manija
    // en otro valor y el dibujo cambiaría solo por existir el deslizador.
    igual(`${rangoDeslizador([750]).max}`, "1080", "750° (dos vueltas y pico):");
    igual(`${rangoDeslizador([-45]).min}`, "-360", "−45°:");
    const ambos = rangoDeslizador([-400, 500]);
    igual(`${ambos.min}..${ambos.max}`, "-720..720", "de −400° a 500°:");
  });

  test("con varios ángulos los contiene a TODOS, no solo al activo", () => {
    // El activo cambia con Tab o al agarrar otro punto; un recorrido que baila bajo el dedo no
    // se puede usar.
    const r = rangoDeslizador([30, 150, 400]);
    igual(`${r.min}..${r.max}`, "-720..720", "tres ángulos:");
  });

  test("los extremos caen en vueltas enteras", () => {
    const r = rangoDeslizador([123.4]);
    igual(`${r.min}..${r.max}`, "-360..360", "no se recorta al ángulo:");
  });
});

describe("obs-trig · el arrastre no acumula sin techo", () => {
  test("por muchas vueltas que se den, el ángulo se queda en el recorrido", () => {
    // El caso real que lo motivó: dando vueltas con el dedo, la lectura llegó a 12270° mientras la
    // manija del deslizador estaba clavada en el extremo. Dos mandos escribiendo el mismo número y
    // uno incapaz de decir lo que decía el otro.
    const r = rangoDeslizador([30]);
    let crudo = G(30);
    for (let i = 0; i < 200; i++) crudo = acotarARecorrido(crudo + G(17), r);
    aprox(aGrados(crudo), 360, 1e-9, "girando siempre hacia delante:");
    for (let i = 0; i < 400; i++) crudo = acotarARecorrido(crudo - G(17), r);
    aprox(aGrados(crudo), -360, 1e-9, "y luego siempre hacia atrás:");
  });

  test("invertir el gesto en el tope responde AL INSTANTE", () => {
    // Se acota el valor crudo, no solo el mostrado. Si por debajo se guardara el acumulado, habría
    // que deshacer 11910° antes de que el punto se moviera un pelo.
    const r = rangoDeslizador([30]);
    const enTope = acotarARecorrido(G(9000), r);
    aprox(aGrados(enTope), 360, 1e-9, "el crudo se queda EN el tope:");
    aprox(aGrados(acotarARecorrido(enTope - G(5), r)), 355, 1e-9, "un paso atrás:");
  });

  test("un ángulo ESCRITO de varias vueltas sigue siendo alcanzable", () => {
    // El techo es el recorrido, y el recorrido ya se ensancha por lo que dice el bloque: acotar no
    // puede volver inalcanzable un ángulo que el propio texto declara.
    const r = rangoDeslizador([750]);
    aprox(aGrados(acotarARecorrido(G(750), r)), 750, 1e-9, "750° no se toca:");
  });

  test("la ANIMACIÓN cae siempre dentro del recorrido", () => {
    // Envuelve a [0, 2π) por su cuenta y por eso no pasa por el acotado. Si algún día dejara de
    // envolver, esta prueba avisa antes de que las dos reglas se peleen.
    const r = rangoDeslizador([30]);
    let a = G(30);
    for (let i = 0; i < 500; i++) {
      a = pasoAnimacion(a, G(60), 0.1);
      assert(a >= 0 && a < DOS_PI, `paso ${i} fuera de [0, 2π): ${a}`);
      aprox(acotarARecorrido(a, r), a, 1e-12, `paso ${i} acotado:`);
    }
  });
});

describe("obs-trig · componentes dibujables", () => {
  test("son tres y en el orden del menú", () => {
    igual(COMPONENTES.join(","), "seno,coseno,tangente", "componentes:");
  });

  test("cada una tiene rótulo en los DOS idiomas", () => {
    // El menú se construye recorriendo `COMPONENTES` y buscando su texto por clave. Añadir una
    // componente y olvidar su cadena no da error de compilación —el índice existe en el tipo—,
    // da una fila vacía en el menú. Esta prueba es lo único que lo detecta.
    const previo = idiomaActivo();
    for (const idioma of IDIOMAS) {
      fijarIdioma(idioma);
      for (const c of COMPONENTES) {
        const rotulo = t().trig.componentes[c];
        assert(
          typeof rotulo === "string" && rotulo.trim().length > 0,
          `falta el rótulo de ${c} en ${idioma}`
        );
      }
      assert(t().trig.componentes.chip.trim().length > 0, `falta el tooltip en ${idioma}`);
    }
    fijarIdioma(previo);
  });

  test("cada una tiene un color DISTINTO, en los dos temas", () => {
    // Las tres pueden estar encendidas a la vez, así que el color es lo único que empareja cada
    // trazo del plano con su fila del panel. Dos componentes del mismo tono romperían esa
    // correspondencia sin romper nada más: no fallaría ninguna otra prueba y el bloque seguiría
    // dibujando. Por eso hay que comprobarlo aquí, y en las DOS paletas —consolidarlas a un tono
    // fue una decisión real de este bloque, y volvió a deshacerse—.
    for (const oscuro of [true, false]) {
      fijarTemaPlano(oscuro);
      const colores = COMPONENTES.map((c) => colorComponente(c));
      const tema = oscuro ? "oscuro" : "claro";
      for (const c of colores) assert(c.trim().length > 0, `color vacío en tema ${tema}`);
      igual(new Set(colores).size, 3, `colores distintos en tema ${tema}:`);
    }
    fijarTemaPlano(true);
  });
});
