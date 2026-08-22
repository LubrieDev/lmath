// ─────────────────────────────────────────────
// i18n · Portugués
// ─────────────────────────────────────────────

import type { EtiquetaVelo, Textos } from "./textos";

// ── Portugués ────────────────────────────────────────────────────────────────
export const PT: Textos = {
  aviso: { cargado: "LMath foi carregado corretamente!" },
  ajustes: {
    transformaciones: "Transformações",
    despejarAuto: {
      etiqueta: "Isolar automaticamente",
      detalle:
        "Ao renderizar uma equação, mostra diretamente o resultado isolado " +
        "(y = f(x)) sem premir «Isolar». O botão «Isolar» fica oculto no painel.",
    },
    plano: "Plano",
    puntosNotables: {
      etiqueta: "Mostrar pontos notáveis",
      detalle:
        "Desenha no plano os marcadores de raízes, vértices, interseções com Y e as " +
        "soluções (cruzamentos) dos sistemas. Ao desativar, o plano fica limpo: " +
        "o resumo ⓘ continua a listá-los, e a mira e o modo carril não mudam.",
    },
    encuadreAuto: {
      etiqueta: "Enquadramento automático",
      detalle:
        "Aproxima a vista inicial quando a curva é limitada e deixa muito plano vazio " +
        "(coração, lemniscata, astroide…). Só aproxima, nunca afasta: se a curva chegar à " +
        "borda da vista, mantém-se o enquadramento de sempre. A vista fica centrada na " +
        "origem e é a ela que volta a tecla de restaurar.",
    },
    trig: {
      seccion: "Círculo trigonométrico",
      unidad: {
        etiqueta: "Unidade dos ângulos",
        detalle:
          "Unidade com que os ângulos são ROTULADOS nos blocos obs-trig (marcas, leitura " +
          "e painel), e no painel ⓘ de obs-vector, que não tem chip próprio. É apenas " +
          "apresentação: o que escreves num bloco lê-se sempre igual —um número nu " +
          "são radianos e o ° é explícito—, por isso mudar isto nunca altera o significado " +
          "de uma expressão já escrita.",
      },
      opcionGrados: "Graus",
      opcionRadianes: "Radianos",
      opcionGradianes: "Grados centesimais",
      iman: {
        etiqueta: "Íman para os ângulos notáveis",
        detalle:
          "Ao arrastar o ponto pela circunferência, ele cola-se aos ângulos notáveis " +
          "(múltiplos de 15°). Mantendo Alt arrasta-se livremente sem ter de o desativar.",
      },
    },
    idioma: {
      seccion: "Idioma",
      nombre: "Idioma",
      desc:
        "Idioma da interface do plugin (rótulos, botões e mensagens). Todas as definições " +
        "deste separador aplicam-se de imediato: os blocos à vista são refeitos, " +
        "e isso devolve o zoom e a vista ao ponto de partida.",
      opcionEn: "English",
      opcionEs: "Español",
      opcionPt: "Português",
      opcionDe: "Deutsch",
    },
  },
  canvasNoDisponible: "Erro: Canvas 2D não disponível",
  botones: {
    vistaInicial: "Vista inicial (desfaz zoom e deslocamento)",
    acercar: "Aproximar (zoom +)",
    alejar: "Afastar (zoom −)",
    carril: "Seguimento da curva: percorre a curva com A/D, zoom com W/S (Shift = precisão)",
    seleccionarEcuacion: (n) => `Selecionar equação ${n}`,
    solucionesSistema: "Soluções do sistema",
    resumenNotables: "Resumo dos pontos notáveis",
    parametros: "Cursores de parâmetros",
    resumenIntegral: "Sobre esta integral",
    resumenDerivada: "O que diz a derivada de f",
    original: "Original",
    verFormula: "Ver a fórmula",
    verPlano: "Ver o plano",
    verCirculo: "Ver o círculo",
    cerrarFormula: "Ocultar a fórmula",
    editarBloque: "Editar o bloco",
    transformaciones: "Transformações",
    cerrarMenu: "Fechar menu",
    reproducir: "Reproduzir (percorrer o círculo)",
    pausar: "Pausar",
    despejarY: "Isolar y",
    operador: "Operador",
    derivadaEvaluada: "Derivada avaliada",
    derivada: "Derivada",
    operadorYDerivada: "Operador e derivada",
    primitivaEvaluada: "Primitiva avaliada",
    primitiva: "Primitiva",
    operadorYPrimitiva: "Operador e primitiva",
  },
  solucion: {
    sinSistema: "Não há nenhum sistema. Escreve pelo menos duas equações (uma por linha).",
    sistemaIncompleto:
      "Sistema incompleto: falta pelo menos uma equação. Um sistema precisa de, no " +
      "mínimo, duas equações e duas incógnitas.",
    infinitasCoinciden:
      "Infinitas soluções: as curvas coincidem num troço (são a mesma).",
    infinitasPeriodico:
      "Infinitas soluções: o sistema é periódico (as soluções repetem-se sem fim).",
    sinSolucion: "As curvas não se intersetam.",
    unaSolucion: "Solução:",
    nSoluciones: (n) => `Soluções (${n}):`,
    yMas: (n) => `… e mais ${n}`,
    enIntervalo: (min, max, variable) => `Procuradas em ${min} ≤ ${variable} ≤ ${max}.`,
    noResoluble: "Este sistema não pode ser resolvido de forma exata; não se enumeram soluções.",
    parcial: "Algum par de curvas não pôde ser resolvido: pode haver mais soluções.",
    sinSolucionParcial:
      "Não se encontraram soluções, mas algum par de curvas não pôde ser resolvido: não estarem listadas não significa que não existam.",
  },
  resumen: {
    interseccionesYInfinitas: "Interseções com o eixo y: infinitas",
    interseccionesYDemasiadas: "Interseções com o eixo y: demasiadas para mostrar",
    interseccionY: (punto) => `Interseção com o eixo y: $${punto}$`,
    noCortaY: "Não interseta o eixo y",
    raicesInfinitas: "Raízes: infinitas",
    raicesDemasiadas: "Raízes: demasiadas para mostrar",
    raicesPrefijo: "Raízes: ",
    noRaices: "Não há raízes reais",
    verticesInfinitos: "Vértices: infinitos",
    verticesDemasiados: "Vértices: demasiados para mostrar",
    noVertices: "Não há vértices",
    vertice: (punto) => `Vértice: $${punto}$`,
    identicamenteCero: "Todos os valores de x são raízes (função identicamente nula).",
    interseccionYNoDefinida: "Interseção Y: não definida (descontinuidade em $x = 0$)",
    verticeMin: (punto) => `Vértice mínimo: $${punto}$`,
    verticeMax: (punto) => `Vértice máximo: $${punto}$`,
    sinDeterminar: "Há pontos notáveis que o motor não conseguiu determinar.",
  },
  polar: {
    titulo: "Curva polar",
    periodo: (p) => `Repete-se a cada $${p}$`,
    ordenRotacional: (n) => `Simetria rotacional de ordem ${n}`,
    simetriasPrefijo: "Simetria: ",
    simetriaPolo: "em relação ao polo",
    simetriaEjePolar: "em relação ao eixo polar",
    simetriaVertical: "em relação a $\\theta = \\frac{\\pi}{2}$",
    rangoRadial: (min, max) => `Raio: $${min} \\le r \\le ${max}$`,
    radioConstante: (r) => `Raio constante $r = ${r}$`,
    cambiaSigno: "r muda de sinal: a curva passa para o lado oposto do polo",
    extremosEn: (thetaMax, thetaMin) =>
      `Máximo em $\\theta = ${thetaMax}$, mínimo em $\\theta = ${thetaMin}$`,
    masMultiplos: (texto, periodo) => `${texto} $\\left(+\\,k\\cdot ${periodo}\\right)$`,
    pasaPorPolo: (angulos) => `Passa pelo polo em $\\theta = ${angulos}$`,
    noPasaPorPolo: "Não passa pelo polo",
    poloDemasiados: "Passa pelo polo muitas vezes",
    areaBarrida: (area, intervalo) => `Área varrida em $${intervalo}$: $${area}$`,
    patron: {
      circunferenciaCentrada: "circunferência centrada no polo",
      circunferenciaPorPolo: "circunferência que passa pelo polo",
      rosa: (petalos) => `rosácea de ${petalos} pétalas`,
      cardioide: "cardioide",
      limaconLazo: "limaçon com laço interior",
      limaconHoyuelo: "limaçon com covinha",
      limaconConvexo: "limaçon convexo",
    },
  },
  parametrica: {
    titulo: "Curva paramétrica",
    intervalo: (a, b) => `$${a} \\le t \\le ${b}$`,
    cerrada: "fechada",
    periodo: (p) => `período $${p}$`,
    periodoExcede: (p) => `período $${p}$: só se desenha uma parte da curva`,
    caja: (xMin, xMax, yMin, yMax) =>
      `$${xMin} \\le x \\le ${xMax}$,  $${yMin} \\le y \\le ${yMax}$`,
    pasaPorOrigen: "Passa pela origem",
    simetriasPrefijo: "Simetria: ",
    simetriaOrigen: "em relação à origem",
    simetriaEjeX: "em relação ao eixo x",
    simetriaEjeY: "em relação ao eixo y",
    autointersecciones: (n) => `Autointerseções: ${n}`,
    sinAutointersecciones: "Não apresenta autointerseções",
    longitud: (l) => `Comprimento: $${l}$`,
    areaAlgebraica: (a) => `Área algébrica: $${a}$`,
    familia: {
      lissajous: (a, b, desfase) => `Lissajous ${a}:${b}, desfasamento $${desfase}$`,
      elipse: "elipse",
      circunferencia: "circunferência",
    },
  },
  integral: {
    titulo: "Integral definida",
    impropia: (variable, x) => `imprópria em $${variable} = ${x}$, converge`,
    intervalo: (a, b, variable) => `$${a} \\le ${variable} \\le ${b}$`,
    intervaloVacio: "Intervalo vazio: a integral é 0 por definição",
    limitesInvertidos: "Os limites estão escritos ao contrário: o valor muda de sinal",
    valorPrefijo: "Valor: ",
    valorEsArea: "a área sob a curva",
    valorBajoEje: "a curva fica abaixo do eixo, por isso o valor é negativo",
    valorFirmado: "área com sinal: o que fica abaixo do eixo subtrai",
    integrandoNulo: "O integrando é nulo em todo o intervalo",
    cruces: (variable, lista) => `Interseta o eixo em $${variable} = ${lista}$`,
    crucesMuchos: "Interseta o eixo muitas vezes",
    areaPositiva: (area) => `Área positiva: $${area}$`,
    areaNegativa: (area) => `Área negativa: $${area}$`,
    promedio: (v) => `Valor médio: $${v}$`,
  },
  derivada: {
    titulo: "Derivada",
    pendienteEn0: (m) => `Declive em $x = 0$: $${m}$`,
    criticoUno: (item) => `Ponto crítico: ${item}`,
    criticosPrefijo: "Pontos críticos:",
    criticoItem: (x, tipo) => `$x = ${x}$ (${tipo})`,
    tipo: {
      maximo: "máximo local",
      minimo: "mínimo local",
      estacionario: "ponto estacionário",
      esquina: "ponto angular",
      cuspide: "cúspide",
      tangenteVertical: "tangente vertical",
    },
    criticosInfinitos: "Infinitos pontos críticos (periódica)",
    criticosDemasiados: "Demasiados pontos críticos para listar",
    creciente: (intervalo) => `Crescente em $${intervalo}$`,
    decreciente: (intervalo) => `Decrescente em $${intervalo}$`,
    inflexionUna: (x) => `Ponto de inflexão: $x = ${x}$`,
    inflexionesPrefijo: "Pontos de inflexão:",
    inflexionesInfinitas: "Infinitos pontos de inflexão (periódica)",
    inflexionesDemasiadas: "Demasiados pontos de inflexão para listar",
    noDerivableUno: (x) => `Não derivável em $x = ${x}$`,
    noDerivablesPrefijo: "Não derivável em:",
    punto: (x) => `$x = ${x}$`,
    rangoAnalisis: (a, b) => `Analisado em $${a} \\le x \\le ${b}$`,
  },
  parametros: {
    mando: (nombre) => `Valor de ${nombre}`,
  },
  velo: {
    simboloNoSoportado: "Símbolo não suportado",
    simbolosNoSoportados: "Símbolos não suportados",
    simboloDetalle: (lista) =>
      `O motor não reconhece ${lista}. Reescreve a expressão sem esse símbolo ` +
      "(ou usa o equivalente: \\cdot, \\times, \\div, \\pm, \\sqrt, \\frac…).",
    restriccionAjena: (escrita, propia) => ({
      etiqueta: "Restrição sobre outra variável",
      detalle:
        `A restrição de domínio limita ${escrita}, mas este bloco é desenhado em ${propia}. ` +
        `Escreve o intervalo em ${propia}, ou não fica nada para desenhar.`,
    }),
    restriccionIlegible: (texto) => ({
      etiqueta: "Restrição de domínio ilegível",
      detalle:
        `${texto} não é um intervalo que este bloco saiba ler. Escreve-o como {a ≤ x ≤ b}, ` +
        "{x ≥ a} ou {x ≤ b}, com números ou constantes com nome (\\pi, e, \\infty) nos extremos.",
    }),
    restriccionVacia: (variable, min, max) => ({
      etiqueta: "Intervalo vazio",
      detalle:
        `A restrição pede ${variable} ≥ ${min} e ${variable} ≤ ${max} ao mesmo tempo, por isso não ` +
        "fica nenhum ponto. Se os extremos estão trocados, inverte-os.",
    }),
    integrandoNoValido: {
      etiqueta: "Integrando não válido",
      detalle:
        "O integrando deve ser uma função de x. Uma equação (curva implícita, " +
        "com `=` ou com `y`) não se integra: representa-a num bloco obs-graph.",
    },
    sinIntegral: {
      etiqueta: "Sem integral",
      detalle: "Escreve uma integral definida em LaTeX, p. ex. \\int_{a}^{b} f(x)\\,dx.",
    },
    sinSistema: {
      etiqueta: "Sem sistema",
      detalle: "Escreve um sistema de equações, uma por linha (mínimo duas).",
    },
    sistemaIncompleto: {
      etiqueta: "Sistema incompleto",
      detalle:
        "Falta pelo menos uma equação: um sistema precisa de, no mínimo, duas equações " +
        "e duas incógnitas.",
    },
    sinFuncion: {
      etiqueta: "Sem função",
      detalle: "Escreve uma expressão matemática para representar.",
    },
    sinVector: {
      etiqueta: "Sem vetor",
      detalle: "Escreve um vetor por linha, por exemplo v = (3, 2).",
    },
    nadaQueDibujar: {
      etiqueta: "Nada para desenhar",
      detalle:
        "O que escreveste é tipografado acima. Para desenhar uma seta é preciso um " +
        "vetor com componentes numéricas, como v = (3, 2).",
    },
  },
  vector: {
    vistas: {
      escrito: "O que o bloco declara",
      entrePuntos: "Vetor entre os pontos",
      opciones: "Vetor entre os pontos",
    },
    info: {
      chip: "Detalhes dos vetores",
      entre: (a, b) => `Entre ${a} e ${b}`,
      modulo: "Norma",
      direccion: "Direção",
      // Não «Quadrante»: os mesmos oito valores cobrem quadrantes E semieixos, tal como no
      // círculo, de onde são tomados já traduzidos.
      posicion: "Posição",
      unitario: "Vetor unitário",
      escalar: "Produto escalar",
      angulo: "Ângulo",
      determinante: "Determinante",
      areaParalelogramo: "Área do paralelogramo",
      areaTriangulo: "Área do triângulo",
      perpendiculares: "Perpendiculares",
      paralelos: "Paralelos",
      distancia: "Distância",
      puntoMedio: "Ponto médio",
    },
  },
  trig: {
    anguloNoValido: (expr) => `Não é um ângulo válido: «${expr}»`,
    // As abreviaturas NÃO se traduzem: `sin`, `cos` e `tan` são as mesmas nos três idiomas e
    // são as que aparecem na tabela, no painel ⓘ e em qualquer livro.
    componentes: {
      chip: "Componentes", seno: "sin (y)", coseno: "cos (x)", tangente: "tan",
    },
    info: {
      chip: "Detalhes do ângulo",
      seccionRazones: "As seis razões trigonométricas",
      seccionMedida: "Medida do ângulo",
      seccionPosicion: "Posição na circunferência",
      seccionRelacionados: "Ângulos relacionados",
      grados: "Graus",
      radianes: "Radianos",
      ladoTerminal: "Lado terminal",
      posicion: {
        "I": "Quadrante I",
        "II": "Quadrante II",
        "III": "Quadrante III",
        "IV": "Quadrante IV",
        "ejeX+": "Eixo X positivo",
        "ejeX-": "Eixo X negativo",
        "ejeY+": "Eixo Y positivo",
        "ejeY-": "Eixo Y negativo",
      },
      referencia: "Ângulo de referência",
      vueltas: "Voltas completas",
      coterminal: "Ângulo coterminal principal",
      arco: "Comprimento de arco",
      sector: "Área do setor",
      complementario: "Complementar",
      suplementario: "Suplementar",
      opuesto: "Oposto",
      antipoda: "Antípoda",
      pitagorica: "sin²θ + cos²θ",
      pitagoricaNota: "verificação numérica",
      noDefinida: "não definida",
    },
  },
};

// Traducciones al PORTUGUÉS de esas mismas etiquetas del núcleo, con la misma clave canónica.
export const VELO_NUCLEO_PT: Record<string, EtiquetaVelo> = {
  "Indefinida": {
    etiqueta: "Indefinida",
    detalle: "A expressão não está definida em ℝ.",
  },
  "No definida en ℝ": {
    etiqueta: "Não definida em ℝ",
    detalle: "A expressão produz valores complexos e não pode ser representada no plano real.",
  },
  "Indeterminada": {
    etiqueta: "Indeterminada",
    detalle: "A expressão produz uma forma indeterminada.",
  },
  "Integral divergente": {
    etiqueta: "Integral divergente",
    detalle: "A integral não converge: a função não é limitada no intervalo.",
  },
  "Fuera de dominio": {
    etiqueta: "Fora do domínio",
    detalle: "O intervalo de integração cai fora do domínio real da função.",
  },
  "Límites no numéricos": {
    etiqueta: "Limites não numéricos",
    detalle: "Os limites de integração não avaliam para um número real.",
  },
};
