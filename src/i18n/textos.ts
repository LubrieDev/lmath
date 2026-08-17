// ─────────────────────────────────────────────
// i18n · Contrato de los textos
// ─────────────────────────────────────────────
//
// La FORMA que toda tabla de idioma debe cumplir, sin ninguna traducción dentro. Vive
// aparte de `index.ts` porque las tres tablas la importan y ninguna debe importar a otra:
// añadir un idioma es añadir un archivo que implementa este contrato, y el compilador
// señala exactamente qué entradas faltan.

/** Etiqueta + detalle de una tarjeta del velo (misma forma que `FuncionDegenerada`). */
export interface EtiquetaVelo { etiqueta: string; detalle: string }

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
      opcionPt: string;
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
    parametros: string;
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
  /**
   * Panel de soluciones de obs-system. Desde que las soluciones las calcula el motor matemático
   * (`src/math/`) y no el trazado, estas cadenas ya NO hablan de la vista: la respuesta es la
   * misma con cualquier zoom, así que decir «en la vista actual» sería falso además de inútil.
   *
   * Lo que sí queda es un matiz HONESTO —`enIntervalo`—, y solo cuando de verdad aplica: un
   * sistema no polinómico se resuelve explorando un intervalo declarado, y ahí la lista es
   * completa dentro de él y no se puede prometer más. Un sistema polinómico no lleva matiz
   * ninguno porque no lo necesita: sus soluciones son todas las que hay sobre ℝ.
   */
  solucion: {
    sinSistema: string;
    sistemaIncompleto: string;
    infinitasCoinciden: string;
    infinitasPeriodico: string;
    sinSolucion: string;
    unaSolucion: string;
    nSoluciones: (n: number) => string;
    yMas: (n: number) => string;
    /** El intervalo explorado por el camino numérico, con sus dos extremos y la VARIABLE que
     *  se barrió: el barrido puede ir en x o en y, y decir siempre «x» sería afirmar algo que
     *  no se ha comprobado. */
    enIntervalo: (min: string, max: string, variable: string) => string;
    /** Ni el camino exacto ni el numérico saben con este sistema. */
    noResoluble: string;
    /**
     * Alguna pareja de curvas del bloque no se pudo enumerar, pero otras sí. La lista es
     * verdadera y puede estar INCOMPLETA, que no es lo mismo que «no hay más»: sin esto, un
     * bloque con una pareja fuera de alcance presentaba su lista parcial como si fuera toda.
     */
    parcial: string;
    /** Ninguna pareja dio soluciones y alguna quedó sin enumerar: no se puede decir «no se
     *  cortan», porque de esa parte no se sabe nada. */
    sinSolucionParcial: string;
  };
  /**
   * Resumen cartesiano del ⓘ (obs-graph): intersección con Y, raíces y vértices.
   *
   * CONTRATO DE ESTAS LÍNEAS, y de las de `polar`, `parametrica`, `integral` y `derivada`:
   * lo que se interpola es **LaTeX**, no texto, y es CADA MENSAJE quien decide dónde van los
   * `$…$`. La razón de que la frontera la ponga el idioma y no el código es que solo el texto
   * sabe dónde acaba la matemática: en «Raíces: …» es la lista, en «Máximo en θ = …» es la
   * igualdad entera, y en «Vértice: …» es el par con sus paréntesis. Lo pinta
   * `pintarLineaPanel`, que compone con KaTeX lo que va entre `$` y deja el resto en la fuente
   * del panel.
   *
   * Dos consecuencias para quien traduzca: el símbolo va en su forma LaTeX (`\\pi`, `\\le`,
   * `\\theta`) cuando está DENTRO de los `$`, y una línea sin `$` es prosa pura y se pinta sin
   * pasar por el renderizador.
   */
  resumen: {
    interseccionesYInfinitas: string;
    interseccionesYDemasiadas: string;
    /** El par ENTERO llega compuesto (`\\left(0,\\ \\frac{\\pi}{2}\\right)`), no sus dos
     *  coordenadas por separado: los paréntesis son de la expresión y tienen que crecer con
     *  ella, y la coma que separa el par no es la de un decimal. */
    interseccionY: (punto: string) => string;
    noCortaY: string;
    raicesInfinitas: string;
    raicesDemasiadas: string;
    raicesPrefijo: string;
    noRaices: string;
    verticesInfinitos: string;
    verticesDemasiados: string;
    noVertices: string;
    vertice: (punto: string) => string;
    identicamenteCero: string;
    interseccionYNoDefinida: string;
    verticeMin: (punto: string) => string;
    verticeMax: (punto: string) => string;
    /**
     * Algún grupo de puntos notables no se ha podido determinar (el sistema se le escapa al
     * motor, o se resolvió solo en parte). Sustituye al viejo «En la vista actual»: aquel decía
     * que la respuesta dependía del encuadre —y por eso se ha ido, porque ya no depende—; este
     * dice que hay una pregunta sin responder, que es lo único que queda por matizar.
     *
     * Va SOLO cuando de verdad pasa. Una curva polinómica se resuelve entera y su resumen es
     * completo sobre ℝ: ahí no lleva pie ninguno.
     */
    sinDeterminar: string;
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
  /** Los mandos de los parámetros declarados (`A = 1`) de un obs-graph / obs-system. */
  parametros: {
    /** Nombre accesible del deslizador; `nombre` es el del parámetro tal como se escribió. */
    mando: (nombre: string) => string;
  };
  velo: {
    simboloNoSoportado: string;
    simbolosNoSoportados: string;
    simboloDetalle: (lista: string) => string;
    restriccionAjena: (escrita: string, propia: string) => EtiquetaVelo;
    restriccionIlegible: (texto: string) => EtiquetaVelo;
    restriccionVacia: (variable: string, min: string, max: string) => EtiquetaVelo;
    integrandoNoValido: EtiquetaVelo;
    sinIntegral: EtiquetaVelo;
    sinSistema: EtiquetaVelo;
    sistemaIncompleto: EtiquetaVelo;
    sinFuncion: EtiquetaVelo;
    /**
     * Los dos velos de `obs-vector`, y son DOS porque dicen cosas distintas: uno es «no has
     * escrito nada» y el otro «lo que has escrito no es una flecha». Un plano vacío y callado
     * sería peor que cualquiera de los dos: parece un bloque roto y no dice por qué.
     */
    sinVector: EtiquetaVelo;
    nadaQueDibujar: EtiquetaVelo;
  };
  /**
   * Contenido del panel ⓘ de obs-vector. El bloque en sí no tiene interfaz —ni opciones, ni
   * chips, ni avisos—, así que estas son sus ÚNICAS cadenas: las de un panel que describe lo
   * que se deduce de lo escrito. Los nombres (`v`, `AB`) no se traducen, claro: los escribe el
   * autor de la nota.
   */
  vector: {
    /**
     * Barra de vistas del panel, que solo existe cuando el bloque declara puntos Y pide el
     * vector entre ellos: el botón principal enseña lo ESCRITO (una tarjeta por línea
     * declarada) y el menú lleva al vector DEDUCIDO. Misma frontera que el panel ⓘ.
     */
    vistas: {
      escrito: string;
      entrePuntos: string;
      opciones: string;
    };
    info: {
      chip: string;
      /** Título de la sección de una pareja: «Entre u y v». */
      entre: (a: string, b: string) => string;
      modulo: string;
      direccion: string;
      posicion: string;
      unitario: string;
      escalar: string;
      angulo: string;
      determinante: string;
      areaParalelogramo: string;
      areaTriangulo: string;
      perpendiculares: string;
      paralelos: string;
      distancia: string;
      puntoMedio: string;
    };
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
