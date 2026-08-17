// ─────────────────────────────────────────────
// i18n · Inglés (idioma por defecto)
// ─────────────────────────────────────────────

import type { EtiquetaVelo, Textos } from "./textos";

// ── Inglés (idioma por defecto) ──────────────────────────────────────────────
export const EN: Textos = {
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
        "the ⓘ summary still lists them, and the crosshair and rail mode do not change.",
    },
    encuadreAuto: {
      etiqueta: "Automatic framing",
      detalle:
        "Zooms the initial view in when the curve is bounded and leaves a lot of empty " +
        "plane (heart, lemniscate, astroid…). It only zooms in, never out: if the curve " +
        "reaches the edge of the view the usual framing is kept. The view stays centered " +
        "on the origin and is the one the restore key returns to.",
    },
    trig: {
      seccion: "Trigonometric circle",
      unidad: {
        etiqueta: "Angle unit",
        detalle:
          "Unit used to LABEL angles in obs-trig blocks (marks, readout and panel), and in the " +
          "ⓘ panel of obs-vector, which has no chip of its own. It is presentation only: what " +
          "you write in a block is always read the same way — a bare number is radians and ° " +
          "is explicit — so switching this never changes the meaning of an expression you " +
          "already wrote.",
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
        "Language of the plugin interface (labels, buttons and messages). Every setting on " +
        "this tab applies immediately: blocks already on screen rebuild themselves, which " +
        "returns their zoom and their view to the starting point.",
      opcionEn: "English",
      opcionEs: "Español",
      opcionPt: "Português",
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
    parametros: "Parameter sliders",
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
    sinSolucion: "The curves do not meet.",
    unaSolucion: "Solution:",
    nSoluciones: (n) => `Solutions (${n}):`,
    yMas: (n) => `… and ${n} more`,
    enIntervalo: (min, max, variable) => `Searched over ${min} ≤ ${variable} ≤ ${max}.`,
    noResoluble: "This system cannot be solved exactly; no solutions are listed.",
    parcial: "Some pair of curves could not be solved: there may be more solutions.",
    sinSolucionParcial:
      "No solutions were found, but some pair of curves could not be solved: not being listed does not mean they do not exist.",
  },
  resumen: {
    interseccionesYInfinitas: "Y-axis intercepts: infinitely many",
    interseccionesYDemasiadas: "Y-axis intercepts: too many to show",
    interseccionY: (punto) => `Y-intercept: $${punto}$`,
    noCortaY: "Does not cross the Y axis",
    raicesInfinitas: "Roots: infinitely many",
    raicesDemasiadas: "Roots: too many to show",
    raicesPrefijo: "Roots: ",
    noRaices: "No real roots",
    verticesInfinitos: "Vertices: infinitely many",
    verticesDemasiados: "Vertices: too many to show",
    noVertices: "No vertices",
    vertice: (punto) => `Vertex: $${punto}$`,
    identicamenteCero: "Every value of x is a root (identically zero function).",
    interseccionYNoDefinida: "Y-intercept: undefined (discontinuity at $x = 0$)",
    verticeMin: (punto) => `Minimum vertex: $${punto}$`,
    verticeMax: (punto) => `Maximum vertex: $${punto}$`,
    sinDeterminar: "Some notable points could not be determined.",
  },
  polar: {
    titulo: "Polar curve",
    periodo: (p) => `Repeats every $${p}$`,
    ordenRotacional: (n) => `${n}-fold rotational symmetry`,
    simetriasPrefijo: "Symmetry: ",
    simetriaPolo: "about the pole",
    simetriaEjePolar: "about the polar axis",
    simetriaVertical: "about $\\theta = \\frac{\\pi}{2}$",
    rangoRadial: (min, max) => `Radius: $${min} \\le r \\le ${max}$`,
    radioConstante: (r) => `Constant radius $r = ${r}$`,
    cambiaSigno: "r changes sign: the curve crosses to the opposite side of the pole",
    extremosEn: (thetaMax, thetaMin) =>
      `Max at $\\theta = ${thetaMax}$, min at $\\theta = ${thetaMin}$`,
    masMultiplos: (texto, periodo) => `${texto} $\\left(+\\,k\\cdot ${periodo}\\right)$`,
    pasaPorPolo: (angulos) => `Passes through the pole at $\\theta = ${angulos}$`,
    noPasaPorPolo: "Does not pass through the pole",
    poloDemasiados: "Passes through the pole many times",
    areaBarrida: (area, intervalo) => `Swept area over $${intervalo}$: $${area}$`,
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
    intervalo: (a, b) => `$${a} \\le t \\le ${b}$`,
    cerrada: "closed",
    periodo: (p) => `period $${p}$`,
    periodoExcede: (p) => `period $${p}$: only part of the curve is drawn`,
    caja: (xMin, xMax, yMin, yMax) =>
      `$${xMin} \\le x \\le ${xMax}$,  $${yMin} \\le y \\le ${yMax}$`,
    pasaPorOrigen: "Passes through the origin",
    simetriasPrefijo: "Symmetry: ",
    simetriaOrigen: "about the origin",
    simetriaEjeX: "about the x axis",
    simetriaEjeY: "about the y axis",
    autointersecciones: (n) => `Self-intersections: ${n}`,
    sinAutointersecciones: "Does not cross itself",
    longitud: (l) => `Length: $${l}$`,
    areaAlgebraica: (a) => `Algebraic area: $${a}$`,
    familia: {
      lissajous: (a, b, desfase) => `Lissajous ${a}:${b}, phase $${desfase}$`,
      elipse: "ellipse",
      circunferencia: "circle",
    },
  },
  integral: {
    titulo: "Definite integral",
    impropia: (variable, x) => `improper at $${variable} = ${x}$, converges`,
    intervalo: (a, b, variable) => `$${a} \\le ${variable} \\le ${b}$`,
    intervaloVacio: "Empty interval: the integral is 0 by definition",
    limitesInvertidos: "Limits are written in reverse order: the value changes sign",
    valorPrefijo: "Value: ",
    valorEsArea: "the area under the curve",
    valorBajoEje: "the curve stays below the axis, so the value is negative",
    valorFirmado: "signed area: the parts below the axis subtract",
    integrandoNulo: "The integrand is zero throughout the interval",
    cruces: (variable, lista) => `Crosses the axis at $${variable} = ${lista}$`,
    crucesMuchos: "Crosses the axis many times",
    areaPositiva: (area) => `Positive area: $${area}$`,
    areaNegativa: (area) => `Negative area: $${area}$`,
    promedio: (v) => `Average value: $${v}$`,
  },
  derivada: {
    titulo: "Derivative",
    pendienteEn0: (m) => `Slope at $x = 0$: $${m}$`,
    criticoUno: (item) => `Critical point: ${item}`,
    criticosPrefijo: "Critical points:",
    criticoItem: (x, tipo) => `$x = ${x}$ (${tipo})`,
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
    creciente: (intervalo) => `Increasing on $${intervalo}$`,
    decreciente: (intervalo) => `Decreasing on $${intervalo}$`,
    inflexionUna: (x) => `Inflection point: $x = ${x}$`,
    inflexionesPrefijo: "Inflection points:",
    inflexionesInfinitas: "Infinitely many inflection points (periodic)",
    inflexionesDemasiadas: "Too many inflection points to list",
    noDerivableUno: (x) => `Not differentiable at $x = ${x}$`,
    noDerivablesPrefijo: "Not differentiable at:",
    punto: (x) => `$x = ${x}$`,
    rangoAnalisis: (a, b) => `Analysed on $${a} \\le x \\le ${b}$`,
  },
  parametros: {
    mando: (nombre) => `Value of ${nombre}`,
  },
  velo: {
    simboloNoSoportado: "Unsupported symbol",
    simbolosNoSoportados: "Unsupported symbols",
    simboloDetalle: (lista) =>
      `The engine does not recognize ${lista}. Rewrite the expression without that ` +
      "symbol (or use its equivalent: \\cdot, \\times, \\div, \\pm, \\sqrt, \\frac…).",
    // Se nombran las DOS variables —la escrita y la del bloque— porque el arreglo está en esa
    // diferencia, y decir solo «restricción no válida» dejaría al autor buscando el error en
    // los números del intervalo, que están bien.
    restriccionAjena: (escrita, propia) => ({
      etiqueta: "Restriction on another variable",
      detalle:
        `The domain restriction bounds ${escrita}, but this block is drawn in ${propia}. ` +
        `Write the interval in ${propia}, or nothing is left to draw.`,
    }),
    // Se cita el grupo TAL COMO SE ESCRIBIÓ: el fallo está en un extremo concreto y verlo entre
    // comillas es lo que lo señala. Decir solo «restricción no válida» dejaría al autor mirando
    // el comparador, que casi siempre está bien.
    restriccionIlegible: (texto) => ({
      etiqueta: "Unreadable domain restriction",
      detalle:
        `${texto} is not an interval this block can read. Write it as {a ≤ x ≤ b}, {x ≥ a} ` +
        "or {x ≤ b}, with numbers or named constants (\\pi, e, \\infty) at the ends.",
    }),
    // El intervalo se LEE bien: lo que no existe es su contenido. Se dicen los dos extremos en el
    // orden en que quedaron, porque el error casi siempre es haberlos escrito al revés.
    restriccionVacia: (variable, min, max) => ({
      etiqueta: "Empty interval",
      detalle:
        `The restriction asks for ${variable} ≥ ${min} and ${variable} ≤ ${max} at the same ` +
        "time, so no point qualifies. Swap the ends if you meant the other way round.",
    }),
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
    sinVector: {
      etiqueta: "No vector",
      detalle: "Write one vector per line, for example v = (3, 2).",
    },
    nadaQueDibujar: {
      etiqueta: "Nothing to draw",
      detalle:
        "What you wrote is typeset above. To draw an arrow, a vector needs numeric " +
        "components, like v = (3, 2).",
    },
  },
  vector: {
    vistas: {
      escrito: "What the block declares",
      entrePuntos: "Vector between the points",
      opciones: "Vector between the points",
    },
    info: {
      chip: "Vector details",
      entre: (a, b) => `Between ${a} and ${b}`,
      modulo: "Magnitude",
      direccion: "Direction",
      // No «Quadrant»: los mismos ocho valores cubren cuadrantes Y semiejes, igual que en el
      // círculo, de donde se toman ya traducidos.
      posicion: "Position",
      unitario: "Unit vector",
      escalar: "Dot product",
      angulo: "Angle",
      determinante: "Determinant",
      areaParalelogramo: "Parallelogram area",
      areaTriangulo: "Triangle area",
      perpendiculares: "Perpendicular",
      paralelos: "Parallel",
      distancia: "Distance",
      puntoMedio: "Midpoint",
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

// Traducciones al INGLÉS de las etiquetas del velo que produce el NÚCLEO (motor), keadas
// por su texto CANÓNICO en español (el que fijan los tests). En español se devuelven tal
// cual (el núcleo ya las produce en ese idioma), así que solo se necesita el mapa es→en.
export const VELO_NUCLEO_EN: Record<string, EtiquetaVelo> = {
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
