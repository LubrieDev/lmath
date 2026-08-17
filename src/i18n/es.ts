// ─────────────────────────────────────────────
// i18n · Español
// ─────────────────────────────────────────────

import type { Textos } from "./textos";

// ── Español ──────────────────────────────────────────────────────────────────
export const ES: Textos = {
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
        "el resumen ⓘ los sigue listando, y el crosshair y el modo carril no cambian.",
    },
    encuadreAuto: {
      etiqueta: "Encuadre automático",
      detalle:
        "Acerca la vista inicial cuando la curva es acotada y deja mucho plano vacío " +
        "(corazón, lemniscata, astroide…). Solo acerca, nunca aleja: si la curva llega al " +
        "borde de la vista se deja el encuadre de siempre. La vista queda centrada en el " +
        "origen y es a la que vuelve la tecla de restaurar.",
    },
    trig: {
      seccion: "Círculo trigonométrico",
      unidad: {
        etiqueta: "Unidad de los ángulos",
        detalle:
          "Unidad con la que se ROTULAN los ángulos en los bloques obs-trig (marcas, lectura " +
          "y panel), y en el panel ⓘ de obs-vector, que no tiene chip propio. Es solo " +
          "presentación: lo que escribes en un bloque se lee siempre igual —un número desnudo " +
          "son radianes y el ° es explícito—, así que cambiar esto nunca altera el significado " +
          "de una expresión ya escrita.",
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
        "Idioma de la interfaz del plugin (etiquetas, botones y mensajes). Todos los ajustes " +
        "de esta pestaña se aplican al momento: los bloques que estén a la vista se rehacen, " +
        "y eso devuelve su zoom y su vista al punto de partida.",
      opcionEn: "English",
      opcionEs: "Español",
      opcionPt: "Português",
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
    parametros: "Deslizadores de parámetros",
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
    sinSolucion: "Las curvas no se cortan.",
    unaSolucion: "Solución:",
    nSoluciones: (n) => `Soluciones (${n}):`,
    yMas: (n) => `… y ${n} más`,
    enIntervalo: (min, max, variable) => `Buscadas en ${min} ≤ ${variable} ≤ ${max}.`,
    noResoluble: "Este sistema no se puede resolver de forma exacta; no se enumeran soluciones.",
    parcial: "Alguna pareja de curvas no se ha podido resolver: puede haber más soluciones.",
    sinSolucionParcial:
      "No se han encontrado soluciones, pero alguna pareja de curvas no se ha podido resolver: que no se listen no significa que no existan.",
  },
  resumen: {
    interseccionesYInfinitas: "Intersecciones con el eje Y: infinitas",
    interseccionesYDemasiadas: "Intersecciones con el eje Y: demasiadas para mostrar",
    interseccionY: (punto) => `Intersección Y: $${punto}$`,
    noCortaY: "No corta el eje Y",
    raicesInfinitas: "Raíces: infinitas",
    raicesDemasiadas: "Raíces: demasiadas para mostrar",
    raicesPrefijo: "Raíces: ",
    noRaices: "No hay raíces reales",
    verticesInfinitos: "Vértices: infinitos",
    verticesDemasiados: "Vértices: demasiados para mostrar",
    noVertices: "No hay vértices",
    vertice: (punto) => `Vértice: $${punto}$`,
    identicamenteCero: "Todos los valores de x son raíces (función idénticamente cero).",
    interseccionYNoDefinida: "Intersección Y: no definida (discontinuidad en $x = 0$)",
    verticeMin: (punto) => `Vértice mínimo: $${punto}$`,
    verticeMax: (punto) => `Vértice máximo: $${punto}$`,
    sinDeterminar: "Hay puntos notables que el motor no ha podido determinar.",
  },
  polar: {
    titulo: "Curva polar",
    periodo: (p) => `Se repite cada $${p}$`,
    ordenRotacional: (n) => `Simetría rotacional de orden ${n}`,
    simetriasPrefijo: "Simetría: ",
    simetriaPolo: "respecto al polo",
    simetriaEjePolar: "respecto al eje polar",
    simetriaVertical: "respecto a $\\theta = \\frac{\\pi}{2}$",
    rangoRadial: (min, max) => `Radio: $${min} \\le r \\le ${max}$`,
    radioConstante: (r) => `Radio constante $r = ${r}$`,
    cambiaSigno: "r cambia de signo: la curva pasa al lado opuesto del polo",
    extremosEn: (thetaMax, thetaMin) =>
      `Máximo en $\\theta = ${thetaMax}$, mínimo en $\\theta = ${thetaMin}$`,
    masMultiplos: (texto, periodo) => `${texto} $\\left(+\\,k\\cdot ${periodo}\\right)$`,
    pasaPorPolo: (angulos) => `Pasa por el polo en $\\theta = ${angulos}$`,
    noPasaPorPolo: "No pasa por el polo",
    poloDemasiados: "Pasa por el polo muchas veces",
    areaBarrida: (area, intervalo) => `Área barrida en $${intervalo}$: $${area}$`,
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
    intervalo: (a, b) => `$${a} \\le t \\le ${b}$`,
    cerrada: "cerrada",
    periodo: (p) => `periodo $${p}$`,
    periodoExcede: (p) => `periodo $${p}$: solo se dibuja una parte de la curva`,
    caja: (xMin, xMax, yMin, yMax) =>
      `$${xMin} \\le x \\le ${xMax}$,  $${yMin} \\le y \\le ${yMax}$`,
    pasaPorOrigen: "Pasa por el origen",
    simetriasPrefijo: "Simetría: ",
    simetriaOrigen: "respecto al origen",
    simetriaEjeX: "respecto al eje x",
    simetriaEjeY: "respecto al eje y",
    autointersecciones: (n) => `Autointersecciones: ${n}`,
    sinAutointersecciones: "No se corta a sí misma",
    longitud: (l) => `Longitud: $${l}$`,
    areaAlgebraica: (a) => `Área algebraica: $${a}$`,
    familia: {
      lissajous: (a, b, desfase) => `Lissajous ${a}:${b}, desfase $${desfase}$`,
      elipse: "elipse",
      circunferencia: "circunferencia",
    },
  },
  integral: {
    titulo: "Integral definida",
    impropia: (variable, x) => `impropia en $${variable} = ${x}$, converge`,
    intervalo: (a, b, variable) => `$${a} \\le ${variable} \\le ${b}$`,
    intervaloVacio: "Intervalo vacío: la integral es 0 por definición",
    limitesInvertidos: "Los límites están escritos al revés: el valor cambia de signo",
    valorPrefijo: "Valor: ",
    valorEsArea: "el área bajo la curva",
    valorBajoEje: "la curva se queda bajo el eje, así que el valor es negativo",
    valorFirmado: "área con signo: lo que queda bajo el eje resta",
    integrandoNulo: "El integrando es nulo en todo el intervalo",
    cruces: (variable, lista) => `Cruza el eje en $${variable} = ${lista}$`,
    crucesMuchos: "Cruza el eje muchas veces",
    areaPositiva: (area) => `Área positiva: $${area}$`,
    areaNegativa: (area) => `Área negativa: $${area}$`,
    promedio: (v) => `Valor medio: $${v}$`,
  },
  derivada: {
    titulo: "Derivada",
    pendienteEn0: (m) => `Pendiente en $x = 0$: $${m}$`,
    criticoUno: (item) => `Punto crítico: ${item}`,
    criticosPrefijo: "Puntos críticos:",
    criticoItem: (x, tipo) => `$x = ${x}$ (${tipo})`,
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
    creciente: (intervalo) => `Creciente en $${intervalo}$`,
    decreciente: (intervalo) => `Decreciente en $${intervalo}$`,
    inflexionUna: (x) => `Punto de inflexión: $x = ${x}$`,
    inflexionesPrefijo: "Puntos de inflexión:",
    inflexionesInfinitas: "Infinitos puntos de inflexión (periódica)",
    inflexionesDemasiadas: "Demasiados puntos de inflexión para listarlos",
    noDerivableUno: (x) => `No derivable en $x = ${x}$`,
    noDerivablesPrefijo: "No derivable en:",
    punto: (x) => `$x = ${x}$`,
    rangoAnalisis: (a, b) => `Analizado en $${a} \\le x \\le ${b}$`,
  },
  parametros: {
    mando: (nombre) => `Valor de ${nombre}`,
  },
  velo: {
    simboloNoSoportado: "Símbolo no soportado",
    simbolosNoSoportados: "Símbolos no soportados",
    simboloDetalle: (lista) =>
      `El motor no reconoce ${lista}. Reescribe la expresión sin ese símbolo ` +
      "(o usa su equivalente: \\cdot, \\times, \\div, \\pm, \\sqrt, \\frac…).",
    restriccionAjena: (escrita, propia) => ({
      etiqueta: "Restricción sobre otra variable",
      detalle:
        `La restricción de dominio acota ${escrita}, pero este bloque se dibuja en ${propia}. ` +
        `Escribe el intervalo en ${propia}, o no queda nada que dibujar.`,
    }),
    restriccionIlegible: (texto) => ({
      etiqueta: "Restricción de dominio ilegible",
      detalle:
        `${texto} no es un intervalo que este bloque sepa leer. Escríbelo como {a ≤ x ≤ b}, ` +
        "{x ≥ a} o {x ≤ b}, con números o constantes con nombre (\\pi, e, \\infty) en los extremos.",
    }),
    restriccionVacia: (variable, min, max) => ({
      etiqueta: "Intervalo vacío",
      detalle:
        `La restricción pide ${variable} ≥ ${min} y ${variable} ≤ ${max} a la vez, así que no ` +
        "queda ningún punto. Si los extremos están al revés, intercámbialos.",
    }),
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
    sinVector: {
      etiqueta: "Sin vector",
      detalle: "Escribe un vector por línea, por ejemplo v = (3, 2).",
    },
    nadaQueDibujar: {
      etiqueta: "Nada que dibujar",
      detalle:
        "Lo que has escrito se tipografía arriba. Para dibujar una flecha hace falta un " +
        "vector con componentes numéricas, como v = (3, 2).",
    },
  },
  vector: {
    vistas: {
      escrito: "Lo que declara el bloque",
      entrePuntos: "Vector entre los puntos",
      opciones: "Vector entre los puntos",
    },
    info: {
      chip: "Detalles de los vectores",
      entre: (a, b) => `Entre ${a} y ${b}`,
      modulo: "Módulo",
      direccion: "Dirección",
      // No «Cuadrante»: los mismos ocho valores cubren cuadrantes Y semiejes, igual que en el
      // círculo, de donde se toman ya traducidos.
      posicion: "Posición",
      unitario: "Vector unitario",
      escalar: "Producto escalar",
      angulo: "Ángulo",
      determinante: "Determinante",
      areaParalelogramo: "Área del paralelogramo",
      areaTriangulo: "Área del triángulo",
      perpendiculares: "Perpendiculares",
      paralelos: "Paralelos",
      distancia: "Distancia",
      puntoMedio: "Punto medio",
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
