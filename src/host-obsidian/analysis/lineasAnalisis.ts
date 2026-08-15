// ─────────────────────────────────────────────
// host-obsidian · analysis · Las líneas de los paneles ⓘ
// ─────────────────────────────────────────────
//
// Convierte el ANÁLISIS de una curva (polar, paramétrica, derivada, integral) en las líneas
// de texto que el cuadro ⓘ enseña. Es lógica PURA: recibe el análisis ya calculado y devuelve
// strings; no crea un solo nodo del DOM ni sabe que existe un popover. El montaje del botón y
// del cuadro sigue en `MotorExperimental`, que es quien toca Obsidian.
//
// La separación importa porque son dos decisiones distintas y cambian por motivos distintos:
// QUÉ se cuenta de una curva (y en qué orden, y cuándo se calla) es criterio matemático y
// editorial; DÓNDE se pinta es interfaz. Aquí vive lo primero.
//
// Las reglas de redacción que comparten los cuatro paneles:
//   • Cada línea aparece SOLO si hay algo que decir; una ausencia no se rellena con "no tiene".
//   • Las simetrías se AFIRMAN pero nunca se niegan: los tests son condiciones suficientes.
//   • Los números pasan por `numeroATexto`, que devuelve π donde toca y quita el ruido del
//     último dígito de los cálculos numéricos.

import { t } from "../../i18n";
import { estadoGrupo } from "../../analisis";
import { cuerpoAreaLatexExacto } from "../../integral";
import { numeroATexto, numeroALatex } from "../../core/analysis/formatoNumero";
import type { AnalisisPolar, PatronPolar } from "../../core/analysis/analisisPolar";
import type { AnalisisParametrico, FamiliaParametrica } from "../../core/analysis/analisisParametrico";
import type { AnalisisDerivada, TipoCritico } from "../../core/analysis/analisisDerivada";
import type { AnalisisIntegral } from "../../core/analysis/analisisIntegral";

/**
 * Cuántos puntos críticos (o inflexiones) llega a enumerar el panel ⓘ de obs-derivate
 * antes de resumirlos. Es un límite de LECTURA, no de análisis: `estadoGrupo` ya resume los
 * grupos verdaderamente numerosos (>20) y los periódicos, pero seis líneas de "x = … (…)"
 * son ya media altura del cuadro, y una lista que hay que desplazar no se lee de un vistazo.
 */
const MAX_LISTA_DERIVADA = 6;

/** Nombre traducido de la familia clásica reconocida. */
export function nombrePatron(p: PatronPolar): string {
  const P = t().polar.patron;
  switch (p.tipo) {
    case "circunferenciaCentrada": return P.circunferenciaCentrada;
    case "circunferenciaPorPolo": return P.circunferenciaPorPolo;
    case "rosa": return P.rosa(String(p.petalos));
    case "cardioide": return P.cardioide;
    case "limaconLazo": return P.limaconLazo;
    case "limaconHoyuelo": return P.limaconHoyuelo;
    case "limaconConvexo": return P.limaconConvexo;
  }
}

/**
 * Las líneas del panel ⓘ de una curva POLAR, en orden de prioridad: qué es, cada
 * cuánto se repite, sus simetrías, hasta dónde llega el radio, dónde están sus
 * extremos, si toca el origen y cuánta área barre.
 *
 * Cada línea aparece SOLO si hay algo que decir. Dos ausencias son deliberadas:
 *   • Sin simetrías detectadas no se escribe nada. Los tests son condiciones
 *     suficientes (ver `analisisPolar`), así que "no tiene simetrías" sería una
 *     afirmación que el análisis no respalda.
 *   • Con radio constante se omiten los extremos: en una circunferencia centrada el
 *     máximo y el mínimo son el mismo número que ya se ha dicho, en todo θ.
 *
 * Los números pasan por `numeroATexto`, que devuelve π donde toca (θ = π/16) en vez
 * del decimal, y quita el ruido del último dígito de los cálculos numéricos.
 */
export function lineasPolar(a: AnalisisPolar): string[] {
  const T = t().polar;
  const lineas: string[] = [];

  const familia = a.patron ? nombrePatron(a.patron) : null;
  lineas.push(familia ? `${T.titulo} · ${familia}` : T.titulo);

  // Un periodo de exactamente 2π sin repetición interna no se anuncia: TODA polar se
  // cierra al dar la vuelta, así que "se repite cada 2π" no distingue esta curva de
  // ninguna otra y gasta una línea del cuadro. Solo se dice cuando la figura se repite
  // VARIAS veces por vuelta (hay orden rotacional) o cuando tarda MÁS de una vuelta en
  // cerrarse (r=sin(θ/10) necesita 20π), que son los dos casos que sorprenden.
  const periodoInformativo = a.periodoR !== null &&
    (a.ordenRotacional !== null || a.periodoR > 2 * Math.PI + 1e-6);
  if (periodoInformativo && a.periodoR !== null) {
    const trozos = [T.periodo(numeroATexto(a.periodoR))];
    if (a.ordenRotacional !== null)
      trozos.push(T.ordenRotacional(String(a.ordenRotacional)));
    lineas.push(trozos.join(" · "));
  }

  if (a.simetrias.length > 0) {
    const nombres = a.simetrias.map((s) =>
      s === "polo" ? T.simetriaPolo :
      s === "ejePolar" ? T.simetriaEjePolar : T.simetriaVertical);
    lineas.push(T.simetriasPrefijo + nombres.join(", "));
  }

  const radioConstante = Math.abs(a.rMax - a.rMin) < 1e-9;
  if (radioConstante) {
    lineas.push(T.radioConstante(numeroATexto(a.rMax)));
  } else {
    lineas.push(T.rangoRadial(numeroATexto(a.rMin), numeroATexto(a.rMax)));
    if (a.cambiaSigno) lineas.push(T.cambiaSigno);

    // Los extremos van en UNA línea y solo con su ÁNGULO: el valor de r ya lo acaba de
    // dar el rango, y en un cuadro de 260×200 repetirlo cuesta dos líneas que no
    // añaden nada. Lo que el rango no dice es DÓNDE ocurren, y eso es esto.
    //
    // El "(+ k·P)" solo se añade cuando la figura se repite VARIAS veces por vuelta: en
    // una cardioide (un único máximo por vuelta, en θ=0) escribir "+ k·2π" es ruido,
    // porque no hay más extremos que señalar dentro del recorrido.
    const extremos = T.extremosEn(
      numeroATexto(a.thetaRMax), numeroATexto(a.thetaRMin));
    lineas.push(
      a.ordenRotacional !== null && a.periodoR !== null
        ? T.masMultiplos(extremos, numeroATexto(a.periodoR))
        : extremos);
  }

  if (a.angulosPolo === null) lineas.push(T.poloDemasiados);
  else if (a.angulosPolo.length === 0) lineas.push(T.noPasaPorPolo);
  else lineas.push(T.pasaPorPolo(a.angulosPolo.map(numeroATexto).join(", ")));

  if (a.areaBarrida !== null)
    lineas.push(T.areaBarrida(
      numeroATexto(a.areaBarrida), numeroATexto(a.intervaloArea)));

  return lineas;
}

/** Nombre traducido de la familia paramétrica reconocida. */
export function nombreFamilia(f: FamiliaParametrica): string {
  const F = t().parametrica.familia;
  switch (f.tipo) {
    case "circunferencia": return F.circunferencia;
    case "elipse": return F.elipse;
    case "lissajous":
      return F.lissajous(String(f.a), String(f.b), numeroATexto(f.desfase));
  }
}

/**
 * Las líneas del panel ⓘ de una curva PARAMÉTRICA: qué es, sobre qué intervalo, dónde
 * cabe, si toca el origen, sus simetrías, cuántas veces se cruza, cuánto mide y cuánta
 * área barre. Mismas reglas que el polar —cada línea solo si hay algo que decir, y las
 * simetrías se afirman pero nunca se niegan (ver `analisisParametrico`)—.
 *
 * El área se rotula ALGEBRAICA a propósito: es ½∮(x dy − y dx), que cuenta el sentido de
 * giro. En una Lissajous los lóbulos recorridos en sentidos opuestos se cancelan y sale
 * 0; eso no es un fallo, es lo que mide esa integral, y llamarla "área encerrada" sí
 * sería un error. Solo aparece cuando la curva se cierra: en una abierta no significa nada.
 */
export function lineasParametricas(a: AnalisisParametrico): string[] {
  const T = t().parametrica;
  const lineas: string[] = [];

  const familia = a.familia ? nombreFamilia(a.familia) : null;
  lineas.push(familia ? `${T.titulo} · ${familia}` : T.titulo);

  // Intervalo, cierre y periodo en una sola línea: son la misma pregunta —cuánta curva
  // hay y cuándo se repite— y por separado gastan tres de las siete que caben.
  const trozos = [T.intervalo(numeroATexto(a.tMin), numeroATexto(a.tMax))];
  if (a.cerrada) trozos.push(T.cerrada);
  if (a.periodo !== null) {
    trozos.push(a.periodoExcedeDominio
      ? T.periodoExcede(numeroATexto(a.periodo))
      : T.periodo(numeroATexto(a.periodo)));
  }
  lineas.push(trozos.join(" · "));

  lineas.push(T.caja(
    numeroATexto(a.xMin), numeroATexto(a.xMax),
    numeroATexto(a.yMin), numeroATexto(a.yMax)));

  if (a.pasaPorOrigen) lineas.push(T.pasaPorOrigen);

  if (a.simetrias.length > 0) {
    const nombres = a.simetrias.map((s) =>
      s === "origen" ? T.simetriaOrigen :
      s === "ejeX" ? T.simetriaEjeX : T.simetriaEjeY);
    lineas.push(T.simetriasPrefijo + nombres.join(", "));
  }

  // El conteo solo se enseña si es fiable; con demasiados cruces se calla, que es
  // preferible a un número en el que no se puede confiar.
  if (a.autointersecciones !== null) {
    lineas.push(a.autointersecciones === 0
      ? T.sinAutointersecciones
      : T.autointersecciones(String(a.autointersecciones)));
  }

  const cierre: string[] = [];
  if (a.longitud !== null) cierre.push(T.longitud(numeroATexto(a.longitud)));
  if (a.areaAlgebraica !== null)
    cierre.push(T.areaAlgebraica(numeroATexto(a.areaAlgebraica)));
  if (cierre.length > 0) lineas.push(cierre.join(" · "));

  return lineas;
}

/** Intervalo en texto plano, con ∞ donde toca: `(-∞, -1)`, `(0, ∞)`. */
export function intervaloATexto(a: number, b: number): string {
  const n = (v: number): string =>
    v === Infinity ? "∞" : v === -Infinity ? "-∞" : numeroATexto(v);
  return `(${n(a)}, ${n(b)})`;
}

/**
 * Las líneas del panel ⓘ de una DERIVADA: qué hace f, leído en f′. Pendiente en el
 * origen, puntos críticos clasificados, crecimiento, inflexiones y puntos angulosos.
 *
 * Nada de esto es nuevo en el fondo —la intersección Y, las raíces y los vértices de f′
 * ya se calculaban— salvo la clasificación de cada crítico, los tramos y los puntos no
 * derivables. Lo que cambia es que se dicen con el nombre que tienen para f, que es la
 * función de la que trata el bloque.
 *
 * Los grupos numerosos se resumen con la MISMA política que el resumen cartesiano
 * (`estadoGrupo`): una trigonométrica tiene infinitos críticos, y media lista de ellos no
 * es información. Y si un tramo muere en el borde del muestreo sin poder llegar a ±∞, se
 * anuncia el rango analizado: es la señal de que hay críticos ahí fuera sin listar.
 */
export function lineasDerivada(
  A: AnalisisDerivada, esTrig: boolean
): { texto: string; sangrado?: boolean }[] {
  const T = t().derivada;
  const lineas: { texto: string; sangrado?: boolean }[] = [{ texto: T.titulo }];
  const push = (texto: string, sangrado?: boolean) => lineas.push({ texto, sangrado });

  if (A.pendienteEn0 !== null)
    push(T.pendienteEn0(numeroATexto(A.pendienteEn0)));

  const nombreTipo = (tipo: TipoCritico): string => T.tipo[tipo];
  const estCriticos = estadoGrupo(A.criticos.length, esTrig);
  if (estCriticos === "infinitas") push(T.criticosInfinitos);
  else if (estCriticos === "demasiadas" || A.criticos.length > MAX_LISTA_DERIVADA) {
    if (A.criticos.length > 0) push(T.criticosDemasiados);
  } else if (A.criticos.length === 1) {
    push(T.criticoUno(
      T.criticoItem(numeroATexto(A.criticos[0].x), nombreTipo(A.criticos[0].tipo))));
  } else if (A.criticos.length > 1) {
    push(T.criticosPrefijo);
    for (const c of A.criticos)
      push(T.criticoItem(numeroATexto(c.x), nombreTipo(c.tipo)), true);
  }

  if (A.monotonia !== null)
    for (const tramo of A.monotonia)
      push((tramo.creciente ? T.creciente : T.decreciente)(
        intervaloATexto(tramo.a, tramo.b)));

  const estInflex = estadoGrupo(A.inflexiones.length, esTrig);
  if (estInflex === "infinitas") push(T.inflexionesInfinitas);
  else if (estInflex === "demasiadas" || A.inflexiones.length > MAX_LISTA_DERIVADA) {
    if (A.inflexiones.length > 0) push(T.inflexionesDemasiadas);
  } else if (A.inflexiones.length === 1) {
    push(T.inflexionUna(numeroATexto(A.inflexiones[0])));
  } else if (A.inflexiones.length > 1) {
    push(T.inflexionesPrefijo);
    for (const x of A.inflexiones) push(T.punto(numeroATexto(x)), true);
  }

  // Los puntos no derivables ya aparecen arriba como críticos CON SU FORMA (esquina,
  // cúspide). Repetirlos aquí no es redundante: allí se dice qué le pasa a f, aquí que f′
  // no existe, y son dos hechos distintos que el lector puede querer por separado. Con la
  // lista de críticos resumida ("infinitos"), esta es además la única que los nombra.
  if (A.noDerivables !== null && A.noDerivables.length > 0) {
    if (A.noDerivables.length === 1)
      push(T.noDerivableUno(numeroATexto(A.noDerivables[0])));
    else {
      push(T.noDerivablesPrefijo);
      for (const x of A.noDerivables) push(T.punto(numeroATexto(x)), true);
    }
  }

  if (A.acotadoPorRango)
    push(T.rangoAnalisis(numeroATexto(A.rango[0]), numeroATexto(A.rango[1])));

  return lineas;
}

/**
 * Las líneas del panel ⓘ de una INTEGRAL definida: qué región se mide, cuánto vale ese
 * número, QUÉ es ese número (un área, o una diferencia de áreas) y el valor medio.
 *
 * El criterio de las categorías es el mismo que en polar y paramétricas —solo se afirma
 * lo que la operación define—, aplicado aquí a la diferencia entre el VALOR y el ÁREA:
 *
 *   • Si el integrando no cruza el eje, valor y área son el mismo número y decirlos por
 *     separado sería llenar dos líneas con lo mismo. Se dice UNO, rotulado con lo que es.
 *   • Si lo cruza, ya no coinciden: el valor es la SUMA CON SIGNO, y ahí sí aportan las
 *     dos áreas por separado —son lo que el valor esconde—. Solo aparecen cuando los
 *     trozos reconstruyen el total (ver `descomponer`); si no, se calla.
 *
 * El VALOR va en KaTeX, no en texto: es el único número del cuadro que puede tener forma
 * cerrada (8/3, π/2, ln 3) y se toma del MISMO reconocedor que el panel de la fórmula
 * (`cuerpoAreaLatexExacto`), para que los dos sitios donde el bloque enseña su resultado
 * no puedan discrepar. El resto son números sueltos y van por `numeroATexto`, como en los
 * otros paneles.
 */
export function lineasIntegral(
  A: AnalisisIntegral, variable: string, source: string
): { texto: string; tex?: string; cola?: string }[] {
  const T = t().integral;
  const lineas: { texto: string; tex?: string; cola?: string }[] = [];

  // Cabecera: qué es, y si es IMPROPIA (singularidad en un extremo) también dónde y que
  // converge —el valor de una impropia es aproximado, y quien lo lee merece saberlo—.
  const cabecera = [T.titulo];
  if (A.impropia && A.singularidades.length > 0)
    cabecera.push(T.impropia(variable, A.singularidades.map(numeroATexto).join(", ")));
  lineas.push({ texto: cabecera.join(" · ") });

  // Intervalo NULO (a = b): la integral es 0 por definición y no hay región, ni signo, ni
  // valor medio (sería 0/0) que describir. Se dice eso y se acaba el cuadro.
  if (A.a === A.b) {
    lineas.push({ texto: T.intervaloVacio });
    return lineas;
  }

  lineas.push({
    texto: T.intervalo(
      numeroATexto(Math.min(A.a, A.b)), numeroATexto(Math.max(A.a, A.b)), variable),
  });
  // Límites al revés: el intervalo se enseña ordenado (es la región que se ve sombreada),
  // así que hay que decir que el número lleva el signo cambiado respecto a esa región.
  if (A.invertido) lineas.push({ texto: T.limitesInvertidos });

  // El cuerpo puede ser null solo si el bloque no tiene valor, y entonces lleva velo y
  // este panel no se monta; el `numeroALatex` es la red de seguridad, no un caso vivo.
  const { cuerpo, conector } = cuerpoAreaLatexExacto(source);
  const tex = cuerpo
    ? (conector === "=" ? cuerpo : `\\approx ${cuerpo}`)
    : numeroALatex(A.valor);
  // La nota dice QUÉ es el número, y las tres formas de decirlo dan por hecho que el signo
  // del valor es el del dibujo. Con los límites al revés eso deja de ser cierto —∫₂⁰x²dx es
  // negativa con la curva ENTERA por encima del eje—, así que ahí no se rotula: la línea de
  // límites invertidos ya explica el signo, y repetirlo mal sería peor que callarlo.
  const nota = A.invertido ? null :
    A.signo === 1 ? T.valorEsArea :
    A.signo === -1 ? T.valorBajoEje :
    A.signo === 0 ? T.integrandoNulo :
    T.valorFirmado;   // cruza el eje (o lo cruza demasiadas veces para enumerarlo)
  lineas.push({ texto: T.valorPrefijo, tex, cola: nota ? ` · ${nota}` : undefined });

  if (A.signo === null) {
    if (A.cruces === null) lineas.push({ texto: T.crucesMuchos });
    else if (A.cruces.length > 0)
      lineas.push({ texto: T.cruces(variable, A.cruces.map(numeroATexto).join(", ")) });
  }

  if (A.areaPositiva !== null && A.areaNegativa !== null) {
    lineas.push({ texto: T.areaPositiva(numeroATexto(A.areaPositiva)) });
    lineas.push({ texto: T.areaNegativa(numeroATexto(A.areaNegativa)) });
  }

  if (A.promedio !== null) lineas.push({ texto: T.promedio(numeroATexto(A.promedio)) });

  return lineas;
}
