// ─────────────────────────────────────────────
// i18n · Deutsch
// ─────────────────────────────────────────────

import type { EtiquetaVelo, Textos } from "./textos";

export const DE: Textos = {
  aviso: { cargado: "LMath wurde erfolgreich geladen!" },
  ajustes: {
    transformaciones: "Umformungen",
    despejarAuto: {
      etiqueta: "Automatisch nach y auflösen",
      detalle:
        "Beim Rendern einer Gleichung wird das nach y aufgelöste Ergebnis (y = f(x)) direkt angezeigt, ohne «Auflösen» zu drücken. Die Schaltfläche «Auflösen» wird im Panel ausgeblendet.",
    },
    plano: "Ebene",
    puntosNotables: {
      etiqueta: "Besondere Punkte anzeigen",
      detalle:
        "Zeigt auf der Ebene Markierungen für Nullstellen, Scheitelpunkte, y-Achsenabschnitte und die Lösungen (Schnittpunkte) von Gleichungssystemen. Wenn diese Option deaktiviert ist, bleibt die Ebene übersichtlich: Die ⓘ-Zusammenfassung führt sie weiterhin auf; Fadenkreuz und Kurvenmodus ändern sich nicht.",
    },
    encuadreAuto: {
      etiqueta: "Automatischer Bildausschnitt",
      detalle:
        "Vergrößert die Anfangsansicht, wenn die Kurve beschränkt ist und viel leere Ebene lässt (Herz, Lemniskate, Astroide …). Sie vergrößert nur, nie verkleinert sie: Erreicht die Kurve den Rand, bleibt die übliche Ansicht erhalten. Die Ansicht bleibt auf den Ursprung zentriert und wird mit der Wiederherstellen-Taste zurückgesetzt.",
    },
    trig: {
      seccion: "Trigonometrischer Kreis",
      unidad: {
        etiqueta: "Winkeleinheit",
        detalle:
          "Einheit, mit der Winkel in obs-trig-Blöcken beschriftet werden (Markierungen, Anzeige und Panel) sowie im ⓘ-Panel von obs-vector, das kein eigenes Symbol besitzt. Sie betrifft nur die Darstellung: Ein nackter Wert wird immer als Bogenmaß gelesen und ° bleibt ausdrücklich, daher ändert ein Wechsel nie die Bedeutung eines bereits geschriebenen Ausdrucks.",
      },
      opcionGrados: "Grad",
      opcionRadianes: "Bogenmaß",
      opcionGradianes: "Gon",
      iman: {
        etiqueta: "An markanten Winkeln einrasten",
        detalle:
          "Beim Ziehen des Punkts auf dem Kreis rastet er an markanten Winkeln (Vielfachen von 15°) ein. Halte Alt gedrückt, um frei zu ziehen, ohne die Option auszuschalten.",
      },
    },
    idioma: {
      seccion: "Sprache",
      nombre: "Sprache",
      desc: "Sprache der Plugin-Oberfläche (Beschriftungen, Schaltflächen und Meldungen). Alle Einstellungen auf dieser Seite werden sofort angewendet: Bereits sichtbare Blöcke werden neu aufgebaut; dadurch kehren Zoom und Ansicht zum Ausgangspunkt zurück.",
      opcionEn: "English",
      opcionEs: "Español",
      opcionPt: "Português",
      opcionDe: "Deutsch",
    },
  },
  canvasNoDisponible: "Fehler: Canvas 2D ist nicht verfügbar",
  botones: {
    vistaInicial: "Anfangsansicht (Zoom und Verschiebung zurücksetzen)",
    acercar: "Vergrößern (+)",
    alejar: "Verkleinern (−)",
    carril:
      "Kurvenverfolgung: Mit A/D der Kurve folgen, mit W/S zoomen (Umschalt = präzise)",
    seleccionarEcuacion: (n) => `Gleichung ${n} auswählen`,
    solucionesSistema: "Lösungen des Gleichungssystems",
    resumenNotables: "Zusammenfassung besonderer Punkte",
    parametros: "Parameterschieberegler",
    resumenIntegral: "Über dieses Integral",
    resumenDerivada: "Was die Ableitung über f aussagt",
    original: "Original",
    verFormula: "Formel anzeigen",
    verPlano: "Ebene anzeigen",
    verCirculo: "Kreis anzeigen",
    cerrarFormula: "Formel ausblenden",
    editarBloque: "Block bearbeiten",
    transformaciones: "Umformungen",
    cerrarMenu: "Menü schließen",
    reproducir: "Abspielen (den Kreis durchlaufen)",
    pausar: "Pausieren",
    despejarY: "Nach y auflösen",
    operador: "Operator",
    derivadaEvaluada: "Ausgewertete Ableitung",
    derivada: "Ableitung",
    operadorYDerivada: "Operator und Ableitung",
    primitivaEvaluada: "Ausgewertete Stammfunktion",
    primitiva: "Stammfunktion",
    operadorYPrimitiva: "Operator und Stammfunktion",
  },
  solucion: {
    sinSistema:
      "Es gibt kein Gleichungssystem. Schreibe mindestens zwei Gleichungen (eine pro Zeile).",
    sistemaIncompleto:
      "Unvollständiges Gleichungssystem: Mindestens eine Gleichung fehlt. Ein System braucht mindestens zwei Gleichungen und zwei Unbekannte.",
    infinitasCoinciden:
      "Unendlich viele Lösungen: Die Kurven fallen auf einem Abschnitt zusammen (sie sind gleich).",
    infinitasPeriodico:
      "Unendlich viele Lösungen: Das System ist periodisch (die Lösungen wiederholen sich endlos).",
    sinSolucion: "Die Kurven schneiden sich nicht.",
    unaSolucion: "Lösung:",
    nSoluciones: (n) => `Lösungen (${n}):`,
    yMas: (n) => `… und ${n} weitere`,
    enIntervalo: (min, max, variable) =>
      `Gesucht in ${min} ≤ ${variable} ≤ ${max}.`,
    noResoluble:
      "Dieses System kann nicht exakt gelöst werden; es werden keine Lösungen aufgeführt.",
    parcial:
      "Ein Kurvenpaar konnte nicht gelöst werden: Es kann weitere Lösungen geben.",
    sinSolucionParcial:
      "Es wurden keine Lösungen gefunden, aber ein Kurvenpaar konnte nicht gelöst werden: Nicht aufgeführt bedeutet nicht, dass keine existieren.",
  },
  resumen: {
    interseccionesYInfinitas: "Schnittpunkte mit der y-Achse: unendlich viele",
    interseccionesYDemasiadas:
      "Schnittpunkte mit der y-Achse: zu viele zum Anzeigen",
    interseccionY: (punto) => `y-Achsenabschnitt: $${punto}$`,
    noCortaY: "Schneidet die y-Achse nicht",
    raicesInfinitas: "Nullstellen: unendlich viele",
    raicesDemasiadas: "Nullstellen: zu viele zum Anzeigen",
    raicesPrefijo: "Nullstellen: ",
    noRaices: "Keine reellen Nullstellen",
    verticesInfinitos: "Scheitelpunkte: unendlich viele",
    verticesDemasiados: "Scheitelpunkte: zu viele zum Anzeigen",
    noVertices: "Keine Scheitelpunkte",
    vertice: (punto) => `Scheitelpunkt: $${punto}$`,
    identicamenteCero:
      "Jeder Wert von x ist eine Nullstelle (identisch verschwindende Funktion).",
    interseccionYNoDefinida:
      "y-Achsenabschnitt: nicht definiert (Unstetigkeit bei $x = 0$)",
    verticeMin: (punto) => `Minimaler Scheitelpunkt: $${punto}$`,
    verticeMax: (punto) => `Maximaler Scheitelpunkt: $${punto}$`,
    sinDeterminar: "Einige besondere Punkte konnten nicht bestimmt werden.",
  },
  polar: {
    titulo: "Polarkurve",
    periodo: (p) => `Wiederholt sich alle $${p}$`,
    ordenRotacional: (n) => `${n}-fache Drehsymmetrie`,
    simetriasPrefijo: "Symmetrie: ",
    simetriaPolo: "bezüglich des Pols",
    simetriaEjePolar: "bezüglich der Polarachse",
    simetriaVertical: "bezüglich $\\theta = \\frac{\\pi}{2}$",
    rangoRadial: (min, max) => `Radius: $${min} \\le r \\le ${max}$`,
    radioConstante: (r) => `Konstanter Radius $r = ${r}$`,
    cambiaSigno:
      "r wechselt das Vorzeichen: Die Kurve wechselt auf die gegenüberliegende Seite des Pols",
    extremosEn: (thetaMax, thetaMin) =>
      `Maximum bei $\\theta = ${thetaMax}$, Minimum bei $\\theta = ${thetaMin}$`,
    masMultiplos: (texto, periodo) =>
      `${texto} $\\left(+\\,k\\cdot ${periodo}\\right)$`,
    pasaPorPolo: (angulos) => `Geht durch den Pol bei $\\theta = ${angulos}$`,
    noPasaPorPolo: "Geht nicht durch den Pol",
    poloDemasiados: "Geht oft durch den Pol",
    areaBarrida: (area, intervalo) =>
      `Überstrichene Fläche auf $${intervalo}$: $${area}$`,
    patron: {
      circunferenciaCentrada: "Kreis mit Mittelpunkt im Pol",
      circunferenciaPorPolo: "Kreis durch den Pol",
      rosa: (petalos) => `Rose mit ${petalos} Blättern`,
      cardioide: "Kardioide",
      limaconLazo: "Limaçon mit innerer Schleife",
      limaconHoyuelo: "eingedellte Limaçon",
      limaconConvexo: "konvexe Limaçon",
    },
  },
  parametrica: {
    titulo: "Parametrische Kurve",
    intervalo: (a, b) => `$${a} \\le t \\le ${b}$`,
    cerrada: "geschlossen",
    periodo: (p) => `Periode $${p}$`,
    periodoExcede: (p) =>
      `Periode $${p}$: Nur ein Teil der Kurve wird gezeichnet`,
    caja: (xMin, xMax, yMin, yMax) =>
      `$${xMin} \\le x \\le ${xMax}$,  $${yMin} \\le y \\le ${yMax}$`,
    pasaPorOrigen: "Geht durch den Ursprung",
    simetriasPrefijo: "Symmetrie: ",
    simetriaOrigen: "bezüglich des Ursprungs",
    simetriaEjeX: "bezüglich der x-Achse",
    simetriaEjeY: "bezüglich der y-Achse",
    autointersecciones: (n) => `Selbstschnittpunkte: ${n}`,
    sinAutointersecciones: "Hat keine Selbstschnitte",
    longitud: (l) => `Länge: $${l}$`,
    areaAlgebraica: (a) => `Algebraische Fläche: $${a}$`,
    familia: {
      lissajous: (a, b, desfase) => `Lissajous ${a}:${b}, Phase $${desfase}$`,
      elipse: "Ellipse",
      circunferencia: "Kreis",
    },
  },
  integral: {
    titulo: "Bestimmtes Integral",
    impropia: (variable, x) =>
      `uneigentlich bei $${variable} = ${x}$, konvergiert`,
    intervalo: (a, b, variable) => `$${a} \\le ${variable} \\le ${b}$`,
    intervaloVacio: "Leeres Intervall: Das Integral ist definitionsgemäß 0",
    limitesInvertidos:
      "Die Grenzen sind in umgekehrter Reihenfolge geschrieben: Der Wert wechselt das Vorzeichen",
    valorPrefijo: "Wert: ",
    valorEsArea: "die Fläche unter der Kurve",
    valorBajoEje: "die Kurve liegt unter der Achse, daher ist der Wert negativ",
    valorFirmado:
      "vorzeichenbehaftete Fläche: Die Teile unter der Achse werden abgezogen",
    integrandoNulo: "Der Integrand ist im ganzen Intervall null",
    cruces: (variable, lista) =>
      `Schneidet die Achse bei $${variable} = ${lista}$`,
    crucesMuchos: "Schneidet die Achse oft",
    areaPositiva: (area) => `Positive Fläche: $${area}$`,
    areaNegativa: (area) => `Negative Fläche: $${area}$`,
    promedio: (v) => `Mittelwert: $${v}$`,
  },
  derivada: {
    titulo: "Ableitung",
    pendienteEn0: (m) => `Steigung bei $x = 0$: $${m}$`,
    criticoUno: (item) => `Kritischer Punkt: ${item}`,
    criticosPrefijo: "Kritische Punkte:",
    criticoItem: (x, tipo) => `$x = ${x}$ (${tipo})`,
    tipo: {
      maximo: "lokales Maximum",
      minimo: "lokales Minimum",
      estacionario: "stationärer Punkt",
      esquina: "Knickpunkt",
      cuspide: "Spitze",
      tangenteVertical: "vertikale Tangente",
    },
    criticosInfinitos: "Unendlich viele kritische Punkte (periodisch)",
    criticosDemasiados: "Zu viele kritische Punkte zum Aufführen",
    creciente: (intervalo) => `Wachsend auf $${intervalo}$`,
    decreciente: (intervalo) => `Fallend auf $${intervalo}$`,
    inflexionUna: (x) => `Wendepunkt: $x = ${x}$`,
    inflexionesPrefijo: "Wendepunkte:",
    inflexionesInfinitas: "Unendlich viele Wendepunkte (periodisch)",
    inflexionesDemasiadas: "Zu viele Wendepunkte zum Aufführen",
    noDerivableUno: (x) => `Nicht differenzierbar bei $x = ${x}$`,
    noDerivablesPrefijo: "Nicht differenzierbar bei:",
    punto: (x) => `$x = ${x}$`,
    rangoAnalisis: (a, b) => `Analysiert auf $${a} \\le x \\le ${b}$`,
  },
  parametros: { mando: (nombre) => `Wert von ${nombre}` },
  velo: {
    simboloNoSoportado: "Nicht unterstütztes Symbol",
    simbolosNoSoportados: "Nicht unterstützte Symbole",
    simboloDetalle: (lista) =>
      `Die Engine erkennt ${lista} nicht. Schreibe den Ausdruck ohne dieses Symbol neu (oder verwende das Äquivalent: \\cdot, \\times, \\div, \\pm, \\sqrt, \\frac…).`,
    restriccionAjena: (escrita, propia) => ({
      etiqueta: "Einschränkung einer anderen Variablen",
      detalle: `Die Definitionsbereichseinschränkung begrenzt ${escrita}, aber dieser Block wird in ${propia} gezeichnet. Schreibe das Intervall in ${propia}, sonst bleibt nichts zum Zeichnen.`,
    }),
    restriccionIlegible: (texto) => ({
      etiqueta: "Unlesbare Definitionsbereichseinschränkung",
      detalle: `${texto} ist kein Intervall, das dieser Block lesen kann. Schreibe es als {a ≤ x ≤ b}, {x ≥ a} oder {x ≤ b}, mit Zahlen oder benannten Konstanten (\\pi, e, \\infty) an den Grenzen.`,
    }),
    restriccionVacia: (variable, min, max) => ({
      etiqueta: "Leeres Intervall",
      detalle: `Die Einschränkung fordert gleichzeitig ${variable} ≥ ${min} und ${variable} ≤ ${max}; daher erfüllt kein Punkt sie. Vertausche die Grenzen, falls du die andere Reihenfolge meintest.`,
    }),
    integrandoNoValido: {
      etiqueta: "Ungültiger Integrand",
      detalle:
        "Der Integrand muss eine Funktion von x sein. Eine Gleichung (implizite Kurve mit `=` oder `y`) wird nicht integriert: Zeichne sie in einem obs-graph-Block.",
    },
    sinIntegral: {
      etiqueta: "Kein Integral",
      detalle:
        "Schreibe ein bestimmtes Integral in LaTeX, z. B. \\int_{a}^{b} f(x)\\,dx.",
    },
    sinSistema: {
      etiqueta: "Kein Gleichungssystem",
      detalle:
        "Schreibe ein Gleichungssystem, eine Gleichung pro Zeile (mindestens zwei).",
    },
    sistemaIncompleto: {
      etiqueta: "Unvollständiges Gleichungssystem",
      detalle:
        "Mindestens eine Gleichung fehlt: Ein System braucht mindestens zwei Gleichungen und zwei Unbekannte.",
    },
    sinFuncion: {
      etiqueta: "Keine Funktion",
      detalle: "Schreibe einen mathematischen Ausdruck zum Zeichnen.",
    },
    sinVector: {
      etiqueta: "Kein Vektor",
      detalle: "Schreibe einen Vektor pro Zeile, zum Beispiel v = (3, 2).",
    },
    nadaQueDibujar: {
      etiqueta: "Nichts zu zeichnen",
      detalle:
        "Das Geschriebene wird oben gesetzt. Zum Zeichnen eines Pfeils braucht ein Vektor numerische Komponenten, etwa v = (3, 2).",
    },
  },
  vector: {
    vistas: {
      escrito: "Was der Block deklariert",
      entrePuntos: "Vektor zwischen den Punkten",
      opciones: "Vektor zwischen den Punkten",
    },
    info: {
      chip: "Vektordetails",
      entre: (a, b) => `Zwischen ${a} und ${b}`,
      modulo: "Betrag",
      direccion: "Richtung",
      posicion: "Lage",
      unitario: "Einheitsvektor",
      escalar: "Skalarprodukt",
      angulo: "Winkel",
      determinante: "Determinante",
      areaParalelogramo: "Parallelogrammfläche",
      areaTriangulo: "Dreiecksfläche",
      perpendiculares: "Senkrecht",
      paralelos: "Parallel",
      distancia: "Abstand",
      puntoMedio: "Mittelpunkt",
    },
  },
  trig: {
    anguloNoValido: (expr) => `Kein gültiger Winkel: „${expr}“`,
    componentes: {
      chip: "Komponenten",
      seno: "sin (y)",
      coseno: "cos (x)",
      tangente: "tan",
    },
    info: {
      chip: "Winkeldetails",
      seccionRazones: "Die sechs trigonometrischen Verhältnisse",
      seccionMedida: "Winkelmaß",
      seccionPosicion: "Position auf dem Kreis",
      seccionRelacionados: "Verwandte Winkel",
      grados: "Grad",
      radianes: "Bogenmaß",
      ladoTerminal: "Endseite",
      posicion: {
        I: "I. Quadrant",
        II: "II. Quadrant",
        III: "III. Quadrant",
        IV: "IV. Quadrant",
        "ejeX+": "Positive x-Achse",
        "ejeX-": "Negative x-Achse",
        "ejeY+": "Positive y-Achse",
        "ejeY-": "Negative y-Achse",
      },
      referencia: "Referenzwinkel",
      vueltas: "Volle Umdrehungen",
      coterminal: "Hauptwinkel",
      arco: "Bogenlänge",
      sector: "Sektorfläche",
      complementario: "Komplementärwinkel",
      suplementario: "Supplementwinkel",
      opuesto: "Gegenwinkel",
      antipoda: "Antipodenwinkel",
      pitagorica: "sin²θ + cos²θ",
      pitagoricaNota: "numerisch geprüft",
      noDefinida: "nicht definiert",
    },
  },
};

export const VELO_NUCLEO_DE: Record<string, EtiquetaVelo> = {
  Indefinida: {
    etiqueta: "Nicht definiert",
    detalle: "Der Ausdruck ist über ℝ nicht definiert.",
  },
  "No definida en ℝ": {
    etiqueta: "Über ℝ nicht definiert",
    detalle:
      "Der Ausdruck erzeugt komplexe Werte und kann nicht auf der reellen Ebene dargestellt werden.",
  },
  Indeterminada: {
    etiqueta: "Unbestimmt",
    detalle: "Der Ausdruck erzeugt eine unbestimmte Form.",
  },
  "Integral divergente": {
    etiqueta: "Divergentes Integral",
    detalle:
      "Das Integral konvergiert nicht: Die Funktion ist auf dem Intervall unbeschränkt.",
  },
  "Fuera de dominio": {
    etiqueta: "Außerhalb des Definitionsbereichs",
    detalle:
      "Das Integrationsintervall liegt außerhalb des reellen Definitionsbereichs der Funktion.",
  },
  "Límites no numéricos": {
    etiqueta: "Nichtnumerische Grenzen",
    detalle: "Die Integrationsgrenzen ergeben keine reelle Zahl.",
  },
};
