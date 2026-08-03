// ─────────────────────────────────────────────
// i18n · Textos de la interfaz (internacionalización)
// ─────────────────────────────────────────────
//
// Módulo AGNÓSTICO del framework (no toca Obsidian ni el DOM): solo tablas de textos y
// un puntero al idioma activo. El host (host-obsidian/*) fija el idioma al cargar el
// plugin y en cada cambio de la pestaña de ajustes, y consume `t()` para pintar.
//
// El MOTOR (src/motor, degeneradas.ts, integral.ts…) NO depende de este módulo: sigue
// devolviendo sus etiquetas canónicas en español (las fijan los tests). Esas —y solo
// esas— se traducen en la frontera del host con `localizarVelo`, un mapa es→en de las
// etiquetas del velo. Por eso el idioma por defecto es inglés pero el núcleo no cambia.

export type Idioma = "en" | "es";

export const IDIOMAS: readonly Idioma[] = ["en", "es"];
export const IDIOMA_POR_DEFECTO: Idioma = "en";

/** Etiqueta + detalle de una tarjeta del velo (misma forma que `FuncionDegenerada`). */
interface EtiquetaVelo { etiqueta: string; detalle: string }

/** Contrato de todos los textos de la interfaz. Las entradas con interpolación son
 *  funciones; el resto, strings. Ambos idiomas implementan esta MISMA forma. */
export interface Textos {
  aviso: { cargado: string };
  ajustes: {
    transformaciones: string;
    despejarAuto: EtiquetaVelo;
    plano: string;
    puntosNotables: EtiquetaVelo;
    encuadreAuto: EtiquetaVelo;
    /** Círculo trigonométrico (obs-trig). */
    trig: {
      seccion: string;
      unidad: EtiquetaVelo;
      opcionGrados: string;
      opcionRadianes: string;
      opcionGradianes: string;
      iman: EtiquetaVelo;
    };
    idioma: {
      seccion: string;
      nombre: string;
      desc: string;
      opcionEn: string;
      opcionEs: string;
    };
  };
  canvasNoDisponible: string;
  botones: {
    vistaInicial: string;
    acercar: string;
    alejar: string;
    carril: string;
    seleccionarEcuacion: (n: number) => string;
    solucionesSistema: string;
    resumenNotables: string;
    /** Chip ⓘ de obs-integral: su cuadro describe la OPERACIÓN, no puntos notables. */
    resumenIntegral: string;
    /** Chip ⓘ de obs-derivate: su cuadro describe a f, no la curva f′ que se dibuja. */
    resumenDerivada: string;
    original: string;
    /** Botón flotante del plano que despliega el panel de la fórmula (bloque estrecho). */
    verFormula: string;
    /** El mismo botón con el panel ya abierto: lo cierra. */
    cerrarFormula: string;
    /** Chip táctil que lleva al código del bloque (sustituye al `</>` de escritorio). */
    editarBloque: string;
    transformaciones: string;
    cerrarMenu: string;
    reproducir: string;
    pausar: string;
    despejarY: string;
    operador: string;
    derivadaEvaluada: string;
    derivada: string;
    operadorYDerivada: string;
    primitivaEvaluada: string;
    primitiva: string;
    operadorYPrimitiva: string;
  };
  solucion: {
    sinSistema: string;
    sistemaIncompleto: string;
    infinitasCoinciden: string;
    infinitasPeriodico: string;
    demasiadas: string;
    sinSolucion: string;
    unaSolucion: string;
    nSoluciones: (n: number) => string;
    yMas: (n: number) => string;
    enVista: string;
  };
  resumen: {
    interseccionesYInfinitas: string;
    interseccionesYDemasiadas: string;
    interseccionY: (y: string) => string;
    noCortaY: string;
    raicesInfinitas: string;
    raicesDemasiadas: string;
    raicesPrefijo: string;
    noRaices: string;
    verticesInfinitos: string;
    verticesDemasiados: string;
    noVertices: string;
    vertice: (x: string, y: string) => string;
    interseccionYCero: string;
    identicamenteCero: string;
    interseccionYNoDefinida: string;
    verticeMin: (x: string, y: string) => string;
    verticeMax: (x: string, y: string) => string;
    enVista: string;
  };
  /** Panel ⓘ de una curva POLAR. No comparte cadenas con `resumen` a propósito: son
   *  otras categorías (nada de intersecciones ni vértices), no otra traducción. */
  polar: {
    titulo: string;
    periodo: (p: string) => string;
    ordenRotacional: (n: string) => string;
    simetriasPrefijo: string;
    simetriaPolo: string;
    simetriaEjePolar: string;
    simetriaVertical: string;
    rangoRadial: (min: string, max: string) => string;
    radioConstante: (r: string) => string;
    cambiaSigno: string;
    extremosEn: (thetaMax: string, thetaMin: string) => string;
    masMultiplos: (texto: string, periodo: string) => string;
    pasaPorPolo: (angulos: string) => string;
    noPasaPorPolo: string;
    poloDemasiados: string;
    areaBarrida: (area: string, intervalo: string) => string;
    patron: {
      circunferenciaCentrada: string;
      circunferenciaPorPolo: string;
      rosa: (petalos: string) => string;
      cardioide: string;
      limaconLazo: string;
      limaconHoyuelo: string;
      limaconConvexo: string;
    };
  };
  /** Panel ⓘ de una curva PARAMÉTRICA. Mismo criterio que `polar`: categorías propias de
   *  la representación, nada heredado de y=f(x). */
  parametrica: {
    titulo: string;
    intervalo: (a: string, b: string) => string;
    cerrada: string;
    periodo: (p: string) => string;
    periodoExcede: (p: string) => string;
    caja: (xMin: string, xMax: string, yMin: string, yMax: string) => string;
    pasaPorOrigen: string;
    simetriasPrefijo: string;
    simetriaOrigen: string;
    simetriaEjeX: string;
    simetriaEjeY: string;
    autointersecciones: (n: string) => string;
    sinAutointersecciones: string;
    longitud: (l: string) => string;
    areaAlgebraica: (a: string) => string;
    familia: {
      lissajous: (a: string, b: string, desfase: string) => string;
      elipse: string;
      circunferencia: string;
    };
  };
  /** Panel ⓘ de una INTEGRAL definida (obs-integral). Describe la operación —qué región se
   *  mide, cuánto vale, si el número es un área o una diferencia de áreas—, no la curva del
   *  integrando: para eso está `resumen`, y aplicado aquí no dice nada de la integral. */
  integral: {
    titulo: string;
    impropia: (variable: string, x: string) => string;
    intervalo: (a: string, b: string, variable: string) => string;
    intervaloVacio: string;
    limitesInvertidos: string;
    valorPrefijo: string;
    valorEsArea: string;
    valorBajoEje: string;
    valorFirmado: string;
    integrandoNulo: string;
    cruces: (variable: string, lista: string) => string;
    crucesMuchos: string;
    areaPositiva: (area: string) => string;
    areaNegativa: (area: string) => string;
    promedio: (v: string) => string;
  };
  /** Panel ⓘ de una DERIVADA (obs-derivate). Describe el comportamiento de f —dónde crece,
   *  dónde tiene extremos, dónde no es derivable—, no la curva de f′ que se dibuja: los
   *  números son los mismos que daba `resumen`, pero con el nombre que les corresponde. */
  derivada: {
    titulo: string;
    pendienteEn0: (m: string) => string;
    criticoUno: (item: string) => string;
    criticosPrefijo: string;
    criticoItem: (x: string, tipo: string) => string;
    tipo: {
      maximo: string;
      minimo: string;
      estacionario: string;
      esquina: string;
      cuspide: string;
      tangenteVertical: string;
    };
    criticosInfinitos: string;
    criticosDemasiados: string;
    creciente: (intervalo: string) => string;
    decreciente: (intervalo: string) => string;
    inflexionUna: (x: string) => string;
    inflexionesPrefijo: string;
    inflexionesInfinitas: string;
    inflexionesDemasiadas: string;
    noDerivableUno: (x: string) => string;
    noDerivablesPrefijo: string;
    punto: (x: string) => string;
    rangoAnalisis: (a: string, b: string) => string;
  };
  velo: {
    simboloNoSoportado: string;
    simbolosNoSoportados: string;
    simboloDetalle: (lista: string) => string;
    integrandoNoValido: EtiquetaVelo;
    sinIntegral: EtiquetaVelo;
    sinSistema: EtiquetaVelo;
    sistemaIncompleto: EtiquetaVelo;
    sinFuncion: EtiquetaVelo;
  };
  /** Avisos del bloque obs-trig. El parser los produce SIN traducir (tipo + fragmento
   *  culpable) y el host los redacta aquí, que es donde vive el idioma. */
  trig: {
    anguloNoValido: (expr: string) => string;
    /** Casillas del panel: qué razones se dibujan sobre la figura (ninguna, alguna o las tres). */
    componentes: {
      chip: string;
      seno: string;
      coseno: string;
      tangente: string;
    };
    /** Contenido del panel ⓘ. Las secciones son plegables y solo la 1ª abre por defecto. */
    info: {
      chip: string;
      seccionRazones: string;
      seccionMedida: string;
      seccionPosicion: string;
      seccionRelacionados: string;
      grados: string;
      radianes: string;
      /** Rótulo de la fila que sitúa el lado terminal. NO es «cuadrante»: los mismos ocho
       *  valores cubren los cuatro cuadrantes y los cuatro semiejes. */
      ladoTerminal: string;
      posicion: Record<
        "I" | "II" | "III" | "IV" | "ejeX+" | "ejeX-" | "ejeY+" | "ejeY-", string
      >;
      referencia: string;
      vueltas: string;
      coterminal: string;
      arco: string;
      sector: string;
      complementario: string;
      suplementario: string;
      opuesto: string;
      antipoda: string;
      pitagorica: string;
      pitagoricaNota: string;
      noDefinida: string;
    };
  };
}

// ── Inglés (idioma por defecto) ──────────────────────────────────────────────
const EN: Textos = {
  aviso: { cargado: "LMath loaded successfully!" },
  ajustes: {
    transformaciones: "Transformations",
    despejarAuto: {
      etiqueta: "Solve automatically",
      detalle:
        "When rendering an equation, show the solved result (y = f(x)) directly " +
        "without pressing «Solve». The «Solve» button is hidden from the panel.",
    },
    plano: "Plane",
    puntosNotables: {
      etiqueta: "Show notable points",
      detalle:
        "Draws the markers for roots, vertices, Y-intercepts and the solutions " +
        "(crossings) of systems on the plane. When disabled the plane stays clean: " +
        "the ⓘ summary still lists them, and the crosshair and rail mode do not change. " +
        "Applies when the block is re-rendered.",
    },
    encuadreAuto: {
      etiqueta: "Automatic framing",
      detalle:
        "Zooms the initial view in when the curve is bounded and leaves a lot of empty " +
        "plane (heart, lemniscate, astroid…). It only zooms in, never out: if the curve " +
        "reaches the edge of the view the usual framing is kept. The view stays centered " +
        "on the origin and is the one the restore key returns to. Applies when the block is re-rendered.",
    },
    trig: {
      seccion: "Trigonometric circle",
      unidad: {
        etiqueta: "Angle unit",
        detalle:
          "Unit used to LABEL angles in obs-trig blocks (marks, readout and panel). It is " +
          "presentation only: what you write in a block is always read the same way — a bare " +
          "number is radians and ° is explicit — so switching this never changes the meaning " +
          "of an expression you already wrote.",
      },
      opcionGrados: "Degrees",
      opcionRadianes: "Radians",
      opcionGradianes: "Gradians",
      iman: {
        etiqueta: "Snap to notable angles",
        detalle:
          "While dragging the point around the circle, snap to notable angles (multiples of " +
          "15°). Hold Alt to drag freely without turning it off.",
      },
    },
    idioma: {
      seccion: "Language",
      nombre: "Language",
      desc:
        "Language of the plugin interface (labels, buttons and messages). Applies " +
        "immediately to the settings; open blocks update when they are re-rendered.",
      opcionEn: "English",
      opcionEs: "Español",
    },
  },
  canvasNoDisponible: "Error: Canvas 2D not available",
  botones: {
    vistaInicial: "Initial view (undo zoom and pan)",
    acercar: "Zoom in (+)",
    alejar: "Zoom out (−)",
    carril: "Rail: follow the curve with A/D, zoom with W/S (Shift = precision)",
    seleccionarEcuacion: (n) => `Select equation ${n}`,
    solucionesSistema: "System solutions",
    resumenNotables: "Notable points summary",
    resumenIntegral: "About this integral",
    resumenDerivada: "What the derivative says about f",
    original: "Original",
    verFormula: "Show the formula",
    cerrarFormula: "Hide the formula",
    editarBloque: "Edit the block",
    transformaciones: "Transformations",
    cerrarMenu: "Close menu",
    reproducir: "Play (sweep the circle)",
    pausar: "Pause",
    despejarY: "Solve for y",
    operador: "Operator",
    derivadaEvaluada: "Evaluated derivative",
    derivada: "Derivative",
    operadorYDerivada: "Operator and derivative",
    primitivaEvaluada: "Evaluated antiderivative",
    primitiva: "Antiderivative",
    operadorYPrimitiva: "Operator and antiderivative",
  },
  solucion: {
    sinSistema: "There is no system. Write at least two equations (one per line).",
    sistemaIncompleto:
      "Incomplete system: at least one equation is missing. A system needs at least " +
      "two equations and two unknowns.",
    infinitasCoinciden:
      "Infinitely many solutions: the curves coincide over a stretch (they are the same).",
    infinitasPeriodico:
      "Infinitely many solutions: the system is periodic (the solutions repeat endlessly).",
    demasiadas: "Too many solutions in this view to list; zoom in.",
    sinSolucion: "No solution in the current view.",
    unaSolucion: "Solution:",
    nSoluciones: (n) => `Solutions (${n}):`,
    yMas: (n) => `… and ${n} more`,
    enVista: "In the current view.",
  },
  resumen: {
    interseccionesYInfinitas: "Y-axis intercepts: infinitely many",
    interseccionesYDemasiadas: "Y-axis intercepts: too many to show",
    interseccionY: (y) => `Y-intercept: (0, ${y})`,
    noCortaY: "Does not cross the Y axis",
    raicesInfinitas: "Roots: infinitely many",
    raicesDemasiadas: "Roots: too many to show",
    raicesPrefijo: "Roots: ",
    noRaices: "No real roots",
    verticesInfinitos: "Vertices: infinitely many",
    verticesDemasiados: "Vertices: too many to show",
    noVertices: "No vertices",
    vertice: (x, y) => `Vertex: (${x}, ${y})`,
    interseccionYCero: "Y-intercept: (0, 0)",
    identicamenteCero: "Every value of x is a root (identically zero function).",
    interseccionYNoDefinida: "Y-intercept: undefined (discontinuity at x=0)",
    verticeMin: (x, y) => `Minimum vertex: (${x}, ${y})`,
    verticeMax: (x, y) => `Maximum vertex: (${x}, ${y})`,
    enVista: "In the current view.",
  },
  polar: {
    titulo: "Polar curve",
    periodo: (p) => `Repeats every ${p}`,
    ordenRotacional: (n) => `${n}-fold rotational symmetry`,
    simetriasPrefijo: "Symmetry: ",
    simetriaPolo: "about the pole",
    simetriaEjePolar: "about the polar axis",
    simetriaVertical: "about θ = π/2",
    rangoRadial: (min, max) => `Radius: ${min} ≤ r ≤ ${max}`,
    radioConstante: (r) => `Constant radius r = ${r}`,
    cambiaSigno: "r changes sign: the curve crosses to the opposite side of the pole",
    extremosEn: (thetaMax, thetaMin) => `Max at θ = ${thetaMax}, min at θ = ${thetaMin}`,
    masMultiplos: (texto, periodo) => `${texto} (+ k·${periodo})`,
    pasaPorPolo: (angulos) => `Passes through the pole at θ = ${angulos}`,
    noPasaPorPolo: "Does not pass through the pole",
    poloDemasiados: "Passes through the pole many times",
    areaBarrida: (area, intervalo) => `Swept area over ${intervalo}: ${area}`,
    patron: {
      circunferenciaCentrada: "circle centred on the pole",
      circunferenciaPorPolo: "circle through the pole",
      rosa: (petalos) => `rose, ${petalos} petals`,
      cardioide: "cardioid",
      limaconLazo: "limaçon with an inner loop",
      limaconHoyuelo: "dimpled limaçon",
      limaconConvexo: "convex limaçon",
    },
  },
  parametrica: {
    titulo: "Parametric curve",
    intervalo: (a, b) => `${a} ≤ t ≤ ${b}`,
    cerrada: "closed",
    periodo: (p) => `period ${p}`,
    periodoExcede: (p) => `period ${p}: only part of the curve is drawn`,
    caja: (xMin, xMax, yMin, yMax) => `${xMin} ≤ x ≤ ${xMax},  ${yMin} ≤ y ≤ ${yMax}`,
    pasaPorOrigen: "Passes through the origin",
    simetriasPrefijo: "Symmetry: ",
    simetriaOrigen: "about the origin",
    simetriaEjeX: "about the x axis",
    simetriaEjeY: "about the y axis",
    autointersecciones: (n) => `Self-intersections: ${n}`,
    sinAutointersecciones: "Does not cross itself",
    longitud: (l) => `Length: ${l}`,
    areaAlgebraica: (a) => `Algebraic area: ${a}`,
    familia: {
      lissajous: (a, b, desfase) => `Lissajous ${a}:${b}, phase ${desfase}`,
      elipse: "ellipse",
      circunferencia: "circle",
    },
  },
  integral: {
    titulo: "Definite integral",
    impropia: (variable, x) => `improper at ${variable} = ${x}, converges`,
    intervalo: (a, b, variable) => `${a} ≤ ${variable} ≤ ${b}`,
    intervaloVacio: "Empty interval: the integral is 0 by definition",
    limitesInvertidos: "Limits are written in reverse order: the value changes sign",
    valorPrefijo: "Value: ",
    valorEsArea: "the area under the curve",
    valorBajoEje: "the curve stays below the axis, so the value is negative",
    valorFirmado: "signed area: the parts below the axis subtract",
    integrandoNulo: "The integrand is zero throughout the interval",
    cruces: (variable, lista) => `Crosses the axis at ${variable} = ${lista}`,
    crucesMuchos: "Crosses the axis many times",
    areaPositiva: (area) => `Positive area: ${area}`,
    areaNegativa: (area) => `Negative area: ${area}`,
    promedio: (v) => `Average value: ${v}`,
  },
  derivada: {
    titulo: "Derivative",
    pendienteEn0: (m) => `Slope at x = 0: ${m}`,
    criticoUno: (item) => `Critical point: ${item}`,
    criticosPrefijo: "Critical points:",
    criticoItem: (x, tipo) => `x = ${x} (${tipo})`,
    tipo: {
      maximo: "local maximum",
      minimo: "local minimum",
      estacionario: "stationary point",
      esquina: "corner",
      cuspide: "cusp",
      tangenteVertical: "vertical tangent",
    },
    criticosInfinitos: "Infinitely many critical points (periodic)",
    criticosDemasiados: "Too many critical points to list",
    creciente: (intervalo) => `Increasing on ${intervalo}`,
    decreciente: (intervalo) => `Decreasing on ${intervalo}`,
    inflexionUna: (x) => `Inflection point: x = ${x}`,
    inflexionesPrefijo: "Inflection points:",
    inflexionesInfinitas: "Infinitely many inflection points (periodic)",
    inflexionesDemasiadas: "Too many inflection points to list",
    noDerivableUno: (x) => `Not differentiable at x = ${x}`,
    noDerivablesPrefijo: "Not differentiable at:",
    punto: (x) => `x = ${x}`,
    rangoAnalisis: (a, b) => `Analysed on ${a} ≤ x ≤ ${b}`,
  },
  velo: {
    simboloNoSoportado: "Unsupported symbol",
    simbolosNoSoportados: "Unsupported symbols",
    simboloDetalle: (lista) =>
      `The engine does not recognize ${lista}. Rewrite the expression without that ` +
      "symbol (or use its equivalent: \\cdot, \\times, \\div, \\pm, \\sqrt, \\frac…).",
    integrandoNoValido: {
      etiqueta: "Invalid integrand",
      detalle:
        "The integrand must be a function of x. An equation (implicit curve, with `=` " +
        "or with `y`) is not integrated: graph it in an obs-graph block.",
    },
    sinIntegral: {
      etiqueta: "No integral",
      detalle: "Write a definite integral in LaTeX, e.g. \\int_{a}^{b} f(x)\\,dx.",
    },
    sinSistema: {
      etiqueta: "No system",
      detalle: "Write a system of equations, one per line (at least two).",
    },
    sistemaIncompleto: {
      etiqueta: "Incomplete system",
      detalle:
        "At least one equation is missing: a system needs at least two equations " +
        "and two unknowns.",
    },
    sinFuncion: {
      etiqueta: "No function",
      detalle: "Write a math expression to graph.",
    },
  },
  trig: {
    anguloNoValido: (expr) => `Not a valid angle: “${expr}”`,
    // Abreviadas, y en minúscula: son las mismas tres palabras que encabezan la tabla de la
    // lectura, justo encima. Escritas distinto (`Sine` arriba, `sin` abajo) parecerían dos cosas.
    // El eje entre paréntesis es lo único que la casilla añade sobre el nombre: dice DÓNDE se lee
    // esa razón en el plano, que es la mitad de lo que el dibujo enseña.
    componentes: {
      chip: "Components", seno: "sin (y)", coseno: "cos (x)", tangente: "tan",
    },
    info: {
      chip: "Angle details",
      seccionRazones: "The six ratios",
      seccionMedida: "Angle measure",
      seccionPosicion: "Position on the circle",
      seccionRelacionados: "Related angles",
      grados: "Degrees",
      radianes: "Radians",
      ladoTerminal: "Terminal side",
      posicion: {
        "I": "Quadrant I",
        "II": "Quadrant II",
        "III": "Quadrant III",
        "IV": "Quadrant IV",
        "ejeX+": "Positive x-axis",
        "ejeX-": "Negative x-axis",
        "ejeY+": "Positive y-axis",
        "ejeY-": "Negative y-axis",
      },
      referencia: "Reference angle",
      vueltas: "Complete turns",
      coterminal: "Principal coterminal",
      arco: "Arc length",
      sector: "Sector area",
      complementario: "Complementary",
      suplementario: "Supplementary",
      opuesto: "Opposite",
      antipoda: "Antipodal",
      pitagorica: "sin²θ + cos²θ",
      pitagoricaNota: "checked numerically",
      noDefinida: "undefined",
    },
  },
};

// ── Español ──────────────────────────────────────────────────────────────────
const ES: Textos = {
  aviso: { cargado: "¡LMath se ha cargado correctamente!" },
  ajustes: {
    transformaciones: "Transformaciones",
    despejarAuto: {
      etiqueta: "Despejar automáticamente",
      detalle:
        "Al renderizar una ecuación, muestra directamente el resultado despejado " +
        "(y = f(x)) sin pulsar «Despejar». El botón «Despejar» se oculta del panel.",
    },
    plano: "Plano",
    puntosNotables: {
      etiqueta: "Mostrar puntos notables",
      detalle:
        "Pinta en el plano los marcadores de raíces, vértices, cortes con Y y las " +
        "soluciones (cruces) de los sistemas. Al desactivarlo el plano queda limpio: " +
        "el resumen ⓘ los sigue listando, y el crosshair y el modo carril no cambian. " +
        "Se aplica al volver a renderizar el bloque.",
    },
    encuadreAuto: {
      etiqueta: "Encuadre automático",
      detalle:
        "Acerca la vista inicial cuando la curva es acotada y deja mucho plano vacío " +
        "(corazón, lemniscata, astroide…). Solo acerca, nunca aleja: si la curva llega al " +
        "borde de la vista se deja el encuadre de siempre. La vista queda centrada en el " +
        "origen y es a la que vuelve la tecla de restaurar. Se aplica al volver a renderizar el bloque.",
    },
    trig: {
      seccion: "Círculo trigonométrico",
      unidad: {
        etiqueta: "Unidad de los ángulos",
        detalle:
          "Unidad con la que se ROTULAN los ángulos en los bloques obs-trig (marcas, lectura " +
          "y panel). Es solo presentación: lo que escribes en un bloque se lee siempre igual " +
          "—un número desnudo son radianes y el ° es explícito—, así que cambiar esto nunca " +
          "altera el significado de una expresión ya escrita.",
      },
      opcionGrados: "Grados",
      opcionRadianes: "Radianes",
      opcionGradianes: "Gradianes",
      iman: {
        etiqueta: "Imán a los ángulos notables",
        detalle:
          "Al arrastrar el punto por la circunferencia, se pega a los ángulos notables " +
          "(múltiplos de 15°). Manteniendo Alt se arrastra libre sin tener que desactivarlo.",
      },
    },
    idioma: {
      seccion: "Idioma",
      nombre: "Idioma",
      desc:
        "Idioma de la interfaz del plugin (etiquetas, botones y mensajes). Se aplica " +
        "de inmediato a los ajustes; los bloques abiertos se actualizan al volver a renderizarse.",
      opcionEn: "English",
      opcionEs: "Español",
    },
  },
  canvasNoDisponible: "Error: Canvas 2D no disponible",
  botones: {
    vistaInicial: "Vista inicial (deshace zoom y desplazamiento)",
    acercar: "Acercar (zoom +)",
    alejar: "Alejar (zoom −)",
    carril: "Carril: recorrer la curva con A/D, zoom con W/S (Shift = precisión)",
    seleccionarEcuacion: (n) => `Seleccionar ecuación ${n}`,
    solucionesSistema: "Soluciones del sistema",
    resumenNotables: "Resumen de puntos notables",
    resumenIntegral: "Sobre esta integral",
    resumenDerivada: "Qué dice la derivada de f",
    original: "Original",
    verFormula: "Ver la fórmula",
    cerrarFormula: "Ocultar la fórmula",
    editarBloque: "Editar el bloque",
    transformaciones: "Transformaciones",
    cerrarMenu: "Cerrar menú",
    reproducir: "Reproducir (recorrer el círculo)",
    pausar: "Pausar",
    despejarY: "Despejar y",
    operador: "Operador",
    derivadaEvaluada: "Derivada evaluada",
    derivada: "Derivada",
    operadorYDerivada: "Operador y derivada",
    primitivaEvaluada: "Primitiva evaluada",
    primitiva: "Primitiva",
    operadorYPrimitiva: "Operador y primitiva",
  },
  solucion: {
    sinSistema: "No hay ningún sistema. Escribe al menos dos ecuaciones (una por línea).",
    sistemaIncompleto:
      "Sistema incompleto: falta al menos una ecuación. Un sistema necesita como " +
      "mínimo dos ecuaciones y dos incógnitas.",
    infinitasCoinciden:
      "Infinitas soluciones: las curvas coinciden en un tramo (son la misma).",
    infinitasPeriodico:
      "Infinitas soluciones: el sistema es periódico (las soluciones se repiten sin fin).",
    demasiadas: "Demasiadas soluciones en esta vista para enumerarlas; acerca el zoom.",
    sinSolucion: "Sin solución en la vista actual.",
    unaSolucion: "Solución:",
    nSoluciones: (n) => `Soluciones (${n}):`,
    yMas: (n) => `… y ${n} más`,
    enVista: "En la vista actual.",
  },
  resumen: {
    interseccionesYInfinitas: "Intersecciones con el eje Y: infinitas",
    interseccionesYDemasiadas: "Intersecciones con el eje Y: demasiadas para mostrar",
    interseccionY: (y) => `Intersección Y: (0, ${y})`,
    noCortaY: "No corta el eje Y",
    raicesInfinitas: "Raíces: infinitas",
    raicesDemasiadas: "Raíces: demasiadas para mostrar",
    raicesPrefijo: "Raíces: ",
    noRaices: "No hay raíces reales",
    verticesInfinitos: "Vértices: infinitos",
    verticesDemasiados: "Vértices: demasiados para mostrar",
    noVertices: "No hay vértices",
    vertice: (x, y) => `Vértice: (${x}, ${y})`,
    interseccionYCero: "Intersección Y: (0, 0)",
    identicamenteCero: "Todos los valores de x son raíces (función idénticamente cero).",
    interseccionYNoDefinida: "Intersección Y: no definida (discontinuidad en x=0)",
    verticeMin: (x, y) => `Vértice mínimo: (${x}, ${y})`,
    verticeMax: (x, y) => `Vértice máximo: (${x}, ${y})`,
    enVista: "En la vista actual.",
  },
  polar: {
    titulo: "Curva polar",
    periodo: (p) => `Se repite cada ${p}`,
    ordenRotacional: (n) => `Simetría rotacional de orden ${n}`,
    simetriasPrefijo: "Simetría: ",
    simetriaPolo: "respecto al polo",
    simetriaEjePolar: "respecto al eje polar",
    simetriaVertical: "respecto a θ = π/2",
    rangoRadial: (min, max) => `Radio: ${min} ≤ r ≤ ${max}`,
    radioConstante: (r) => `Radio constante r = ${r}`,
    cambiaSigno: "r cambia de signo: la curva pasa al lado opuesto del polo",
    extremosEn: (thetaMax, thetaMin) => `Máximo en θ = ${thetaMax}, mínimo en θ = ${thetaMin}`,
    masMultiplos: (texto, periodo) => `${texto} (+ k·${periodo})`,
    pasaPorPolo: (angulos) => `Pasa por el polo en θ = ${angulos}`,
    noPasaPorPolo: "No pasa por el polo",
    poloDemasiados: "Pasa por el polo muchas veces",
    areaBarrida: (area, intervalo) => `Área barrida en ${intervalo}: ${area}`,
    patron: {
      circunferenciaCentrada: "circunferencia centrada en el polo",
      circunferenciaPorPolo: "circunferencia que pasa por el polo",
      rosa: (petalos) => `rosa de ${petalos} pétalos`,
      cardioide: "cardioide",
      limaconLazo: "limaçon con lazo interior",
      limaconHoyuelo: "limaçon con hoyuelo",
      limaconConvexo: "limaçon convexo",
    },
  },
  parametrica: {
    titulo: "Curva paramétrica",
    intervalo: (a, b) => `${a} ≤ t ≤ ${b}`,
    cerrada: "cerrada",
    periodo: (p) => `periodo ${p}`,
    periodoExcede: (p) => `periodo ${p}: solo se dibuja una parte de la curva`,
    caja: (xMin, xMax, yMin, yMax) => `${xMin} ≤ x ≤ ${xMax},  ${yMin} ≤ y ≤ ${yMax}`,
    pasaPorOrigen: "Pasa por el origen",
    simetriasPrefijo: "Simetría: ",
    simetriaOrigen: "respecto al origen",
    simetriaEjeX: "respecto al eje x",
    simetriaEjeY: "respecto al eje y",
    autointersecciones: (n) => `Autointersecciones: ${n}`,
    sinAutointersecciones: "No se corta a sí misma",
    longitud: (l) => `Longitud: ${l}`,
    areaAlgebraica: (a) => `Área algebraica: ${a}`,
    familia: {
      lissajous: (a, b, desfase) => `Lissajous ${a}:${b}, desfase ${desfase}`,
      elipse: "elipse",
      circunferencia: "circunferencia",
    },
  },
  integral: {
    titulo: "Integral definida",
    impropia: (variable, x) => `impropia en ${variable} = ${x}, converge`,
    intervalo: (a, b, variable) => `${a} ≤ ${variable} ≤ ${b}`,
    intervaloVacio: "Intervalo vacío: la integral es 0 por definición",
    limitesInvertidos: "Los límites están escritos al revés: el valor cambia de signo",
    valorPrefijo: "Valor: ",
    valorEsArea: "el área bajo la curva",
    valorBajoEje: "la curva se queda bajo el eje, así que el valor es negativo",
    valorFirmado: "área con signo: lo que queda bajo el eje resta",
    integrandoNulo: "El integrando es nulo en todo el intervalo",
    cruces: (variable, lista) => `Cruza el eje en ${variable} = ${lista}`,
    crucesMuchos: "Cruza el eje muchas veces",
    areaPositiva: (area) => `Área positiva: ${area}`,
    areaNegativa: (area) => `Área negativa: ${area}`,
    promedio: (v) => `Valor medio: ${v}`,
  },
  derivada: {
    titulo: "Derivada",
    pendienteEn0: (m) => `Pendiente en x = 0: ${m}`,
    criticoUno: (item) => `Punto crítico: ${item}`,
    criticosPrefijo: "Puntos críticos:",
    criticoItem: (x, tipo) => `x = ${x} (${tipo})`,
    tipo: {
      maximo: "máximo local",
      minimo: "mínimo local",
      estacionario: "punto estacionario",
      esquina: "esquina",
      cuspide: "cúspide",
      tangenteVertical: "tangente vertical",
    },
    criticosInfinitos: "Infinitos puntos críticos (periódica)",
    criticosDemasiados: "Demasiados puntos críticos para listarlos",
    creciente: (intervalo) => `Creciente en ${intervalo}`,
    decreciente: (intervalo) => `Decreciente en ${intervalo}`,
    inflexionUna: (x) => `Punto de inflexión: x = ${x}`,
    inflexionesPrefijo: "Puntos de inflexión:",
    inflexionesInfinitas: "Infinitos puntos de inflexión (periódica)",
    inflexionesDemasiadas: "Demasiados puntos de inflexión para listarlos",
    noDerivableUno: (x) => `No derivable en x = ${x}`,
    noDerivablesPrefijo: "No derivable en:",
    punto: (x) => `x = ${x}`,
    rangoAnalisis: (a, b) => `Analizado en ${a} ≤ x ≤ ${b}`,
  },
  velo: {
    simboloNoSoportado: "Símbolo no soportado",
    simbolosNoSoportados: "Símbolos no soportados",
    simboloDetalle: (lista) =>
      `El motor no reconoce ${lista}. Reescribe la expresión sin ese símbolo ` +
      "(o usa su equivalente: \\cdot, \\times, \\div, \\pm, \\sqrt, \\frac…).",
    integrandoNoValido: {
      etiqueta: "Integrando no válido",
      detalle:
        "El integrando debe ser una función de x. Una ecuación (curva implícita, " +
        "con `=` o con `y`) no se integra: grafícala en un bloque obs-graph.",
    },
    sinIntegral: {
      etiqueta: "Sin integral",
      detalle: "Escribe una integral definida en LaTeX, p. ej. \\int_{a}^{b} f(x)\\,dx.",
    },
    sinSistema: {
      etiqueta: "Sin sistema",
      detalle: "Escribe un sistema de ecuaciones, una por línea (mínimo dos).",
    },
    sistemaIncompleto: {
      etiqueta: "Sistema incompleto",
      detalle:
        "Falta al menos una ecuación: un sistema necesita como mínimo dos ecuaciones " +
        "y dos incógnitas.",
    },
    sinFuncion: {
      etiqueta: "Sin función",
      detalle: "Escribe una expresión matemática para graficar.",
    },
  },
  trig: {
    anguloNoValido: (expr) => `No es un ángulo válido: «${expr}»`,
    // Las abreviaturas NO se traducen: `sin`, `cos` y `tan` son las mismas en los dos idiomas y
    // son las que aparecen en la tabla, en el panel ⓘ y en cualquier libro.
    componentes: {
      chip: "Componentes", seno: "sin (y)", coseno: "cos (x)", tangente: "tan",
    },
    info: {
      chip: "Detalles del ángulo",
      seccionRazones: "Las seis razones",
      seccionMedida: "Medida del ángulo",
      seccionPosicion: "Posición en la circunferencia",
      seccionRelacionados: "Ángulos relacionados",
      grados: "Grados",
      radianes: "Radianes",
      ladoTerminal: "Lado terminal",
      posicion: {
        "I": "Cuadrante I",
        "II": "Cuadrante II",
        "III": "Cuadrante III",
        "IV": "Cuadrante IV",
        "ejeX+": "Eje X positivo",
        "ejeX-": "Eje X negativo",
        "ejeY+": "Eje Y positivo",
        "ejeY-": "Eje Y negativo",
      },
      referencia: "Ángulo de referencia",
      vueltas: "Vueltas completas",
      coterminal: "Coterminal principal",
      arco: "Longitud de arco",
      sector: "Área del sector",
      complementario: "Complementario",
      suplementario: "Suplementario",
      opuesto: "Opuesto",
      antipoda: "Antípoda",
      pitagorica: "sin²θ + cos²θ",
      pitagoricaNota: "comprobación numérica",
      noDefinida: "no definida",
    },
  },
};

const RECURSOS: Record<Idioma, Textos> = { en: EN, es: ES };

// Traducciones al INGLÉS de las etiquetas del velo que produce el NÚCLEO (motor), keadas
// por su texto CANÓNICO en español (el que fijan los tests). En español se devuelven tal
// cual (el núcleo ya las produce en ese idioma), así que solo se necesita el mapa es→en.
const VELO_NUCLEO_EN: Record<string, EtiquetaVelo> = {
  "Indefinida": {
    etiqueta: "Undefined",
    detalle: "The expression is not defined over ℝ.",
  },
  "No definida en ℝ": {
    etiqueta: "Not defined over ℝ",
    detalle: "The expression produces complex values and cannot be represented on the real plane.",
  },
  "Indeterminada": {
    etiqueta: "Indeterminate",
    detalle: "The expression produces an indeterminate form.",
  },
  "Integral divergente": {
    etiqueta: "Divergent integral",
    detalle: "The integral does not converge: the function is unbounded on the interval.",
  },
  "Fuera de dominio": {
    etiqueta: "Out of domain",
    detalle: "The integration interval falls outside the function's real domain.",
  },
  "Límites no numéricos": {
    etiqueta: "Non-numeric limits",
    detalle: "The integration limits do not evaluate to a real number.",
  },
};

let idiomaActual: Idioma = IDIOMA_POR_DEFECTO;

/** Fija el idioma activo (validado; un valor desconocido cae al idioma por defecto). */
export function fijarIdioma(id: string | undefined): void {
  idiomaActual = (IDIOMAS as readonly string[]).includes(id ?? "")
    ? (id as Idioma)
    : IDIOMA_POR_DEFECTO;
}

/** Idioma activo. */
export function idiomaActivo(): Idioma {
  return idiomaActual;
}

/** Textos del idioma activo. Uso: `t().botones.acercar`, `t().solucion.yMas(3)`. */
export function t(): Textos {
  return RECURSOS[idiomaActual];
}

/**
 * Localiza una etiqueta de velo PRODUCIDA POR EL NÚCLEO (español canónico) al idioma
 * activo. En español se devuelve intacta; en inglés se busca su traducción por el texto
 * canónico y, si no está mapeada, se conserva el original (nunca rompe el render).
 */
export function localizarVelo(velo: EtiquetaVelo): EtiquetaVelo {
  if (idiomaActual === "es") return velo;
  return VELO_NUCLEO_EN[velo.etiqueta] ?? velo;
}
