// ─────────────────────────────────────────────
// host-obsidian · MotorExperimental (adaptador Plugin → motor nuevo)
// ─────────────────────────────────────────────
//
// ADAPTADOR del host. Su única responsabilidad es traducir el ciclo de vida de
// Obsidian (process(source, el, ctx)) a la infraestructura del motor nuevo, sin
// modificar ni el plugin ni el motor. Es la ÚNICA pieza que toca la API de
// Obsidian (cuarentena del host); el resto del motor es agnóstico del framework.
//
// Reproduce la presentación del GraphEngine original: panel LaTeX a la izquierda
// (mismo pipeline tipográfico, scroll con fades) y gráfica a la derecha, con las
// etiquetas formales para bloques vacíos o funciones degeneradas (0/0, √−1…).

import {
  MarkdownRenderChild,
  MarkdownRenderer,
  MarkdownView,
  Plugin,
  setTooltip,
  type MarkdownPostProcessorContext,
} from "obsidian";

import { Camara } from "../motor/interaction/Camara";
import { Navegacion } from "../motor/interaction/Navegacion";
import { crearMotor, crearMotorSistema } from "../motor/app/composicion";
import { dividirEcuaciones } from "../motor/parsing/dividirEcuaciones";
import { construirObjeto, expresionPolar, expresionesParametricas } from "../motor/parsing/construirObjeto";
import { analizarPolar, type AnalisisPolar, type PatronPolar } from "../motor/analysis/analisisPolar";
import {
  analizarParametrico, type AnalisisParametrico, type FamiliaParametrica,
} from "../motor/analysis/analisisParametrico";
import { analizarIntegral, type AnalisisIntegral } from "../motor/analysis/analisisIntegral";
import {
  analizarDerivada, type AnalisisDerivada, type TipoCritico,
} from "../motor/analysis/analisisDerivada";
import { numeroATexto, numeroALatex } from "../motor/analysis/formatoNumero";
import { crearFuncionReal } from "../motor/fields/funcionRealMathjs";
import { insertarProductoImplicito } from "../motor/parsing/productoImplicito";
import { funcionDelParametro, renombrarParametroAX } from "../motor/parsing/componentesParametricas";
import { aPantallaX } from "../motor/scene/viewport-utils";
import { FACTOR_SONDEO } from "../motor/scene/autoencuadre";
import { formatearNumero } from "../motor/rendering/overlay/Overlay";
import { simplify } from "mathjs";
import { bloqueALatex } from "../latex";
import { despejarEcuaciones } from "../despejar";
import { simplificarEcuaciones } from "../simplificar";
import { extraerFuncion, derivarEcuacion, derivadaOperadorLatex, derivadaOperadorSimplificadoLatex, derivadaLatex } from "../derivar";
import {
  extraerIntegral, evaluarLimite, integralOperadorLatex, integralValorLatex,
  integralPrimitivaLatex, cuerpoAreaLatexExacto, etiquetaIntegral,
} from "../integral";
import { AJUSTES_POR_DEFECTO, type AjustesTransformaciones } from "./ajustes";
import { esTactil } from "./plataforma";
import { t, localizarVelo } from "../i18n";
import { normalizarEntrada, contieneYLibre, comandosNoSoportados } from "../parser";
import { compilarFuncion } from "../evaluador";
import { clasificarDegenerada, type FuncionDegenerada } from "../degeneradas";
import { analizarFuncion, tieneTrigonometria, estadoGrupo, raicesALatex } from "../analisis";
import { fijarTemaPlano, colorCurva } from "../motor/rendering/paleta";
import {
  parsearBloqueTrig, ETIQUETA_POR_DEFECTO, type AvisoTrig, type UnidadTrig,
} from "../trig/bloqueTrig";
import { modeloDeAngulo, aGrados, aRadianes } from "../trig/modeloTrig";
import { razonesExactas, radianesExactoTexto, puntoExactoTexto } from "../trig/exactosTrig";
import {
  dibujarTrig, encuadreTrig, colorComponente, textoAngulo, textoGradosDe, COMPONENTES,
  type ComponenteTrig,
} from "../trig/renderTrig";
import {
  anguloDePuntero, deltaAngular, imantar, imanVigente, agarraCircunferencia, indiceMasCercano,
  rangoDeslizador, acotarARecorrido, pasoAnimacion,
  PASO_IMAN, AGARRE_PX, AGARRE_PX_TACTIL,
} from "../trig/interaccionTrig";

// Estilo visual de una tarjeta de fórmula del panel izquierdo. Enum (no un booleano
// `alwaysFramed`) para que el catálogo de estilos crezca sin multiplicar banderas: hoy
// "enmarcado" (caja redondeada, la ÚNICA que usa el panel: regla "una expresión = una
// tarjeta") y "plano" (sin recuadro, llena el hueco), reservado para futuros paneles.
type EstiloTarjeta = "plano" | "enmarcado";

// ── REPARTO del bloque: quién ocupa qué ────────────────────────────────────────────
// Dos formas de repartir el sitio entre la fórmula y el plano, elegidas por el ANCHO DEL
// CONTENEDOR y por nada más:
//
//   • COLUMNAS (ancho): la fórmula a la izquierda y el plano a la derecha, como siempre.
//   • FLOTANTE (estrecho): el bloque ES el plano, y el panel de la fórmula pasa a una
//     tarjeta superpuesta sobre él, que se abre y se cierra con el botón f(x).
//
// El criterio es el ANCHO y NO el dispositivo, a propósito: el mismo teléfono en
// horizontal da ~700px y ahí el reparto en columnas se ve igual de bien que en el
// escritorio, mientras que un panel lateral estrecho en el escritorio sufre exactamente
// lo mismo que un teléfono en vertical. Lo que sí depende del dispositivo (crosshair,
// carril, cruz del cursor) va por otro camino: `plataforma.ts`.
//
// El panel NO cambia de padre al cruzar el umbral: sigue siendo hermano del plano y solo
// cambia su CAJA (de `width:50%` en el flujo a `position:absolute` fuera de él). Al salir
// del flujo, el plano —que ya pide `width:100%`— ocupa la fila entero él solo. Así rotar
// el teléfono es reescribir un estilo: KaTeX no se vuelve a renderizar, y el zoom y el
// desplazamiento de la vista sobreviven al giro.

/**
 * Alto de la franja de controles de obs-trig (selector de componente + deslizador). En reparto
 * ancho vive dentro del panel y este número no se usa; en estrecho se muda al pie del plano y
 * es lo que el lienzo cede y lo que el panel flotante no puede invadir.
 */
const ALTO_CONTROLES_TRIG = 78;

/** Alto del bloque en el reparto por COLUMNAS (el de siempre). */
const ALTO_PANEL = 261;

/**
 * Ancho de contenedor por debajo del cual se pasa al reparto FLOTANTE.
 *
 * No es un número redondo cualquiera: en columnas el plano se lleva ⅔ del bloque (el panel
 * pide 50% y el plano 100%), así que para que el plano no salga MÁS ALTO QUE ANCHO hace
 * falta ⅔·W ≥ 261 → W ≥ 392. Con 520 el plano nunca baja de 4:3, que es la forma mínima
 * en la que una gráfica se lee como una gráfica.
 */
const ANCHO_MINIMO_COLUMNAS = 520;

/** Alto del plano en FLOTANTE, como fracción de su ancho (16:13 ≈ el 4:3 largo del móvil). */
const PROPORCION_PLANO_FLOTANTE = 0.82;

/** Alto de la tarjeta flotante de la fórmula. */
const ALTO_PANEL_FLOTANTE = 180;
/** Margen de la tarjeta flotante contra el borde del plano, y hueco entre chips. */
const MARGEN_FLOTANTE = 8;

/**
 * Cuántos puntos críticos (o inflexiones) llega a enumerar el panel ⓘ de obs-derivate
 * antes de resumirlos. Es un límite de LECTURA, no de análisis: `estadoGrupo` ya resume los
 * grupos verdaderamente numerosos (>20) y los periódicos, pero seis líneas de "x = … (…)"
 * son ya media altura del cuadro, y una lista que hay que desplazar no se lee de un vistazo.
 */
const MAX_LISTA_DERIVADA = 6;

/**
 * Lado de los chips redondos del plano (🏠, +, −, ⌖, ⓘ).
 *
 * Con RATÓN, 22px: el puntero acierta un blanco de un píxel, y unos chips grandes solo
 * taparían gráfica. Con el DEDO son la mitad de lo que pide cualquier guía táctil (44px),
 * así que suben a 30. No a 44: sobre un plano de 321px de ancho, cuatro blancos de 44
 * ocuparían un tercio del alto y volveríamos a tener el problema que veníamos a resolver.
 * 30 es el punto en el que el chip se acierta sin mirar y sigue siendo cromo, no contenido.
 *
 * Depende de CÓMO SE SEÑALA, no del ancho: un teléfono en horizontal tiene sitio de sobra
 * para el reparto en columnas y sigue manejándose con el mismo dedo.
 */
function ladoChip(tactil: boolean): number {
  return tactil ? 30 : 22;
}

/** Lado del icono dentro de un chip: deja el mismo aire proporcional en ambos tamaños. */
function ladoIcono(lado: number): number {
  return Math.round(lado * 0.66);
}

/**
 * Hueco que la tarjeta flotante deja libre por debajo: exactamente la fila de chips de
 * abajo. No se pega al borde a propósito — ahí viven el ⓘ y el propio botón con el que se
 * cierra la fórmula, y un panel que tapa su botón de cerrar es una trampa.
 */
function huecoChips(lado: number): number {
  return MARGEN_FLOTANTE + lado + MARGEN_FLOTANTE;
}

/**
 * Estado del reparto, compartido entre el panel (que se crea antes) y el plano. Lo posee
 * `process`, lo registra `crearScrollerLatex` y lo consultan las tarjetas al recalcular su
 * alto, así que hay UNA sola respuesta a "¿estamos estrechos?" en todo el bloque.
 */
interface Reparto {
  /** ¿El contenedor no da para poner fórmula y plano lado a lado? */
  estrecho: boolean;
  /**
   * ¿Está desplegado el panel flotante? Solo significa algo en `estrecho`: en columnas la
   * fórmula está siempre a la vista y no hay nada que abrir. Vive aquí, y no en un booleano
   * suelto del botón, porque es `aplicarCajaPanel` quien escribe la caja del panel de una
   * sola vez —posición Y visibilidad—: repartirlo en dos sitios acabaría con un panel
   * colocado como flotante pero mostrado como columna, o al revés.
   */
  abierto: boolean;
  /** El panel de la fórmula, que registra `crearScrollerLatex` al crearlo. */
  panel: HTMLElement | null;
  /**
   * Lado de los chips del plano (`ladoChip`). Vive aquí porque la caja del panel flotante
   * depende de él: se apoya JUSTO encima de la fila de chips, así que si los chips crecen,
   * el panel sube con ellos. Es el único dato de densidad táctil que necesita el reparto.
   */
  ladoChip: number;
  /**
   * Píxeles reservados al pie del PLANO que el panel flotante no debe invadir. Solo `obs-trig`
   * lo usa (su franja de controles en estrecho); en los demás bloques queda sin fijar y la caja
   * del panel es exactamente la de siempre.
   */
  huecoInferior?: number;
}

/**
 * Los cuadros que se abren SOBRE el plano —el popover del ⓘ y la fórmula flotante— compiten
 * por el mismo sitio y por la misma atención, así que son EXCLUYENTES: abrir uno cierra el
 * otro. Se resuelve con este par en vez de con referencias cruzadas porque los tres ⓘ
 * posibles se montan en sitios distintos (dos en `process`, uno en `montarBotonInfo`) y
 * ninguno debe conocer al resto: cada uno registra cómo se cierra y avisa de que se abre.
 */
interface ExclusionPopover {
  /** Lo llama quien va a abrirse, para que se cierre lo que hubiera abierto. */
  alAbrir: () => void;
  /** Lo llama quien puede quedar abierto, para dejar dicho cómo se le cierra. */
  registrar: (cerrar: () => void) => void;
}

/**
 * Una fila del panel ⓘ de `obs-trig`: rótulo a la izquierda, valor a la derecha.
 *
 * El tercer elemento la DESPEGA de la fila anterior con un filete. No es decoración: marca la
 * que no es un dato más de la lista sino su cierre —hoy, la identidad pitagórica al final de las
 * seis razones—. Es un separador dentro de la sección, no un título: si eso necesitara una
 * cabecera propia sería otra sección, y una sección de una sola fila no es una sección.
 */
type FilaInfo = readonly [etiqueta: string, valor: string, separada?: boolean];

/**
 * Escribe la CAJA del panel según el reparto vigente. Es lo ÚNICO que cambia entre los dos
 * repartos: el panel no se mueve de sitio en el árbol, ni se vuelve a construir, ni pierde
 * su contenido; deja de ocupar la mitad izquierda del flujo y pasa a flotar sobre el plano.
 *
 * En FLOTANTE se apoya en `huecoChips(...)` en vez de pegarse al borde: la fila
 * de chips de abajo (ⓘ, y el botón f(x) que lo abrirá) tiene que seguir siendo alcanzable,
 * incluido el propio botón con el que se cierra. El color es de los tokens del marco
 * (`--lmath-*`), nunca literales: el panel flotante se ve igual de bien en tema claro.
 */
function aplicarCajaPanel(reparto: Reparto): void {
  const panel = reparto.panel;
  if (!panel) return;
  // `huecoInferior` lo usa solo obs-trig, que en estrecho saca sus controles del panel y los
  // deja en una franja al pie del plano: sin este margen, la tarjeta flotante caería encima del
  // deslizador. Vale 0 en los demás bloques, así que su caja no se mueve un píxel.
  const suelo = huecoChips(reparto.ladoChip) + (reparto.huecoInferior ?? 0);
  panel.style.cssText = reparto.estrecho
    ? "position:absolute; z-index:6; box-sizing:border-box; " +
      `display:${reparto.abierto ? "flex" : "none"}; ` +
      `left:${MARGEN_FLOTANTE}px; right:${MARGEN_FLOTANTE}px; ` +
      `bottom:${suelo}px; width:auto; height:${ALTO_PANEL_FLOTANTE}px; ` +
      "padding:0; overflow:hidden; background:var(--lmath-panel); " +
      "border:1px solid var(--lmath-borde); border-radius:12px; " +
      "box-shadow:var(--lmath-sombra-flotante);"
    : `position:relative; width:50%; height:${ALTO_PANEL}px; padding:0; overflow:hidden;`;
}

// Iconos del plano (Material Symbols de Google, viewBox 0 -960 960 960). Se pintan como
// <svg> inline con `fill:currentColor`: heredan el color del botón y siguen su resaltado
// activo/inactivo, igual que los glifos de texto a los que sustituyen.
/**
 * ¿El tema activo es oscuro? Es LO ÚNICO que se le pregunta al tema para elegir la paleta
 * del plano (ver `motor/rendering/paleta.ts`): Obsidian marca el documento con
 * `theme-dark`/`theme-light` sea cual sea el tema instalado, así que la respuesta vale
 * también para los de la comunidad. Se pregunta al DOCUMENTO DEL ELEMENTO (`el.doc`), no al
 * global: un bloque puede estar en una ventana desprendida, que tiene su propio `body`.
 */
function esTemaOscuro(el: HTMLElement): boolean {
  return el.doc.body.classList.contains("theme-dark");
}

const ICONO = {
  inicio: "M220-180h150v-250h220v250h150v-390L480-765 220-570v390Zm-60 60v-480l320-240 320 240v480H530v-250H430v250H160Zm320-353Z",
  acercar: "M450-450H200v-60h250v-250h60v250h250v60H510v250h-60v-250Z",
  alejar: "M200-450v-60h560v60H200Z",
  carril: "M450-42v-75q-137-14-228-105T117-450H42v-60h75q14-137 105-228t228-105v-75h60v75q137 14 228 105t105 228h75v60h-75q-14 137-105 228T510-117v75h-60Zm244.5-223.5Q784-355 784-480t-89.5-214.5Q605-784 480-784t-214.5 89.5Q176-605 176-480t89.5 214.5Q355-176 480-176t214.5-89.5Zm-321-108Q330-417 330-480t43.5-106.5Q417-630 480-630t106.5 43.5Q630-543 630-480t-43.5 106.5Q543-330 480-330t-106.5-43.5ZM544-416q26-26 26-64t-26-64q-26-26-64-26t-64 26q-26 26-26 64t26 64q26 26 64 26t64-26Zm-64-64Z",
  info: "M453-280h60v-240h-60v240Zm50.5-323.2q9.5-9.2 9.5-22.8 0-14.45-9.48-24.22-9.48-9.78-23.5-9.78t-23.52 9.78Q447-640.45 447-626q0 13.6 9.48 22.8 9.48 9.2 23.5 9.2t23.52-9.2ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.23-60Q622-140 721-239.5t99-241Q820-622 721.19-721T480-820q-141 0-240.5 98.81T140-480q0 141 99.5 240.5t241 99.5Zm-.5-340Z",
  menu: "M120-240v-60h720v60H120Zm0-210v-60h720v60H120Zm0-210v-60h720v60H120Z",
  reproducir: "M320-200v-560l440 280-440 280Z",
  pausar: "M520-200v-560h240v560H520Zm-320 0v-560h240v560H200Z",
  cerrar: "m249-207-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z",
  // Editar el bloque: en móvil no existe el botón `</>` de Obsidian —aparece al pasar el
  // ratón, y no hay ratón—, así que el bloque se queda sin puerta a su propio código.
  editar: "M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h405l-60 60H180v600h600v-348l60-60v408q0 24-18 42t-42 18H180Zm300-360ZM360-360v-170l382-382q9-9 20-13t22-4q11 0 22.32 4.5Q817.63-920 827-911l83 84q8.61 8.96 13.3 19.78 4.7 10.83 4.7 22.02 0 11.2-4.5 22.7T910-742L530-360H360Zm508-425-84-84 84 84ZM420-420h85l253-253-43-42-43-42-252 251v86Zm295-295-43-42 43 42 43 42-43-42Z",
} as const;

/**
 * Glifos de UNIDAD del chip °/rad de obs-trig: las palabras DEG, RAD y GRAD dibujadas, no texto.
 *
 * Van aparte de `ICONO` porque **no son cuadrados**. El resto del juego llena una caja de 960×960;
 * una palabra de tres o cuatro letras que tiene que caber a lo ancho ocupa una franja de 840×276,
 * así que dibujarla en un lienzo cuadrado la dejaría en un tercio del alto del chip e ilegible.
 * Cada glifo lleva su `viewBox` ajustado a la tinta, y el chip lo pinta a lo ancho.
 *
 * **Las cajas llevan 30 unidades de margen por lado**, y no es estética: ajustadas al píxel de la
 * tinta, el borde inferior de las letras cae exactamente sobre el límite del lienzo y a este
 * tamaño se queda con media cobertura de píxel — se ve comido por abajo. El margen le da al
 * rasterizador con qué trabajar.
 *
 * DEG y RAD comparten caja para que el chip no cambie de cuerpo al alternar entre ellas. GRAD
 * lleva una letra más y no cabe a ese cuerpo, así que su caja es más baja: se ve algo menor, que
 * es lo que le pasa a cualquier palabra larga en un ancho fijo.
 *
 * Los archivos fuente están en `assets/icons/unit_*.svg`.
 */
const GLIFO_UNIDAD = {
  degrees: {
    caja: "30 -648 900 336",
    d: "M94-342V-618H246Q274-618 294-598T315-549V-411Q315-382 294-362T246-342H94ZM163-393H246V-567H163V-393ZM372-342V-618H579V-567H441V-505H556V-455H441V-393H579V-342ZM866-618H705A69 69 0 0 0 636-549V-411A69 69 0 0 0 705-342H797A69 69 0 0 0 866-411V-505H751V-455H797V-393H705V-567H866Z",
  },
  radians: {
    caja: "30 -648 900 336",
    d: "M60-342V-618H214Q242-618 258-602T274-558V-495Q274-462 244-446L279-342H217L186-434H129V-342H60ZM129-485H214V-567H129V-485ZM337-342L443-618H516L622-342H555L535-397H424L404-342H337ZM443-448H516L481-551H478L443-448ZM679-342V-618H831Q860-618 880-598T900-549V-411Q900-382 880-362T831-342H679ZM748-393H831V-567H748V-393Z",
  },
  gradians: {
    caja: "30 -613 900 266",
    d: "M231-583H111A51 51 0 0 0 60-531V-429A51 51 0 0 0 111-377H180A51 51 0 0 0 231-429V-499H146V-461H180V-415H111V-545H231ZM274-377V-583H389Q409-583 421-571T433-538V-491Q433-466 411-454L438-377H391L368-446H325V-377H274ZM325-483H389V-545H325V-483ZM480-377L559-583H614L693-377H643L628-418H546L530-377H480ZM559-456H614L587-533H586L559-456ZM736-377V-583H849Q870-583 885-568T900-531V-429Q900-407 885-392T849-377H736ZM787-415H849V-545H787V-415Z",
  },
} as const satisfies Record<UnidadTrig, { caja: string; d: string }>;

/** Las tres unidades en el orden en que las recorre el chip. */
const CICLO_UNIDAD: readonly UnidadTrig[] = ["degrees", "radians", "gradians"];

/**
 * QUÉ BLOQUE es este adaptador. Un solo valor en vez de una bandera por bloque: las banderas
 * booleanas eran combinables sobre el papel (`sistema && integral`) sin que ninguna combinación
 * significara nada, y cada bloque nuevo añadía un parámetro más a un constructor posicional
 * donde `new MotorExperimental(this, false, false, ajustes, true)` ya no se leía. Con el modo,
 * los estados imposibles no se pueden ni escribir y añadir un bloque es añadir un miembro.
 *
 *   • `graph`    → obs-graph: UNA función/curva (la 1ª ecuación del bloque).
 *   • `system`   → obs-system: varias ecuaciones a la vez, cada una con su color.
 *   • `derivate` → obs-derivate: como `graph`, pero el plano grafica la DERIVADA f'(x) de lo
 *                  escrito y el panel alterna operador/derivada (ver `process`).
 *   • `integral` → obs-integral: como `graph`, pero el plano grafica el INTEGRANDO f(x) y
 *                  SOMBREA ∫ₐᵇ f dx; el panel alterna operador/primitiva.
 *   • `trig`     → obs-trig: el círculo trigonométrico. Es el único que NO usa el motor de
 *                  curvas —ni `Camara`, ni `Escena`, ni proveedores—: su geometría es analítica
 *                  cerrada y la pinta su propio renderizador (ver `procesarTrig`).
 */
export type ModoBloque = "graph" | "system" | "derivate" | "integral" | "trig";

export class MotorExperimental {
  // `obtenerAjustes`: getter de las preferencias VIVAS del plugin (no una foto), para que
  // un cambio en la pestaña de configuración afecte a los bloques que se re-rendericen.
  // Por defecto, sin transformaciones automáticas (comportamiento clásico).
  constructor(
    private readonly plugin: Plugin,
    private readonly modo: ModoBloque,
    private readonly obtenerAjustes: () => AjustesTransformaciones = () => AJUSTES_POR_DEFECTO
  ) {}

  // Los tres rasgos que el cuerpo del adaptador consulta, DERIVADOS del modo en lugar de
  // almacenados: son preguntas sobre el bloque ("¿es un sistema?"), no estado, y como getters
  // no pueden desincronizarse del modo ni depender del orden de inicialización.
  private get sistema(): boolean { return this.modo === "system"; }
  private get derivada(): boolean { return this.modo === "derivate"; }
  private get integral(): boolean { return this.modo === "integral"; }

  async process(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    // obs-trig sale por su propio camino ANTES de montar nada: no comparte con los demás
    // bloques ni la cámara, ni la escena, ni el ciclo de dos pasadas, así que meterlo en el
    // cuerpo de abajo sería sembrarlo de condicionales para saltarse casi todo.
    if (this.modo === "trig") return this.procesarTrig(source, el, ctx);

    const contenedor = el.createDiv({ cls: "lmath-container" });
    const limpieza = new MarkdownRenderChild(contenedor);
    ctx.addChild(limpieza);

    // ── El bloque se monta OCULTO y se revela ya pintado ──────────────────────────────
    // El montaje tiene un punto de espera inevitable: el panel de la fórmula pasa por
    // MarkdownRenderer (KaTeX) y hay que AGUARDARLO antes de construir el plano. En ese
    // hueco el navegador pinta lo que haya, que es un bloque con la fórmula y NINGUNA
    // gráfica —el estado intermedio que se veía al salir del editor en el móvil, donde ese
    // render es lento de verdad—. Después salta al bloque terminado: un parpadeo.
    //
    // `visibility` y no `display:none`: el bloque tiene que seguir OCUPANDO su sitio y
    // midiendo de verdad, porque el reparto se decide con `clientWidth` y el lienzo se
    // dimensiona con la caja real. Oculto sigue habiendo layout; sin caja, no habría nada
    // que medir y el plano arrancaría con métricas falsas.
    const revelar = () => contenedor.setCssStyles({ visibility: "visible" });
    contenedor.setCssStyles({ visibility: "hidden" });
    // Red de seguridad: si algo lanza entre medias, el bloque no puede quedarse invisible
    // para siempre. Revelar dos veces no cuesta nada; no revelar, cuesta el bloque entero.
    const redDeSeguridad = window.setTimeout(revelar, 2000);
    limpieza.register(() => window.clearTimeout(redDeSeguridad));

    // Ecuaciones del bloque. obs-graph solo grafica la PRIMERA, así que su panel
    // LaTeX y su clasificación también miran solo esa (coherencia panel↔plano).
    const ecuaciones = dividirEcuaciones(source);
    const visibles = this.sistema ? ecuaciones : ecuaciones.slice(0, 1);

    // ── obs-derivate: el plano grafica la DERIVADA f'(x) de la 1ª función, no lo
    // escrito. `graficadas`/`fuenteGrafico` son la ecuación derivada que alimenta al
    // motor, la clasificación de bloque y el ⓘ; el panel (montarPanelDerivada) muestra
    // el operador/derivada a partir de lo ORIGINAL (`visibles`). Si no se puede derivar
    // (o el bloque está vacío) → sin ecuación graficada: cae a la etiqueta "Sin función".
    // La función ESCRITA, clasificada antes de derivar: si no toma ningún valor real (0/0,
    // √−1, log base 1) NO hay nada que derivar. Sin esta guarda, mathjs derivaba la forma
    // indeterminada como si fuera álgebra (`d/dx(0/0)` → `0`) y el bloque mostraba una
    // derivada inventada —"f'(x) = 0"— y graficaba la recta y=0, sin velo ni aviso: la
    // clasificación miraba la DERIVADA (ya reducida a `0`, perfectamente sana), no la función.
    // OJO: se clasifica la FUNCIÓN EXTRAÍDA (`extraerFuncion`), no la ecuación escrita. Si el
    // usuario escribe el propio operador (`\frac{d}{dx}x^{2}`), la ecuación cruda normaliza a
    // `(d)/(d*x)*x^2` —con `d` como símbolo libre → NaN en todo x— y el bloque se velaba como
    // "Indeterminada" pese a ser una derivada perfectamente válida. `extraerFuncion` es quien
    // sabe quitar el operador (§6.4); a partir de ahí clasificamos la f(x) de verdad.
    const funcionEscrita = this.derivada && visibles.length ? extraerFuncion(visibles[0]) : null;
    const degeneradaOrigen = funcionEscrita ? this.degeneradaDeEcuacion(funcionEscrita) : null;
    const derivadaExpr = this.derivada && visibles.length && !degeneradaOrigen
      ? derivarEcuacion(visibles[0]) : null;

    // ── obs-integral: el plano grafica el INTEGRANDO f(x) de `\int_a^b f dx` (no lo escrito
    // como bloque). `integralDatos` descompone la notación; `graficadas`/`fuenteGrafico` son el
    // integrando que alimenta el motor, la clasificación y el sombreado. El VALOR ∫ₐᵇ y el
    // panel operador/valor los monta montarPanelIntegral. Si no hay integral válida → sin
    // ecuación graficada → etiqueta "Sin integral".
    const integralDatos = this.integral ? extraerIntegral(source) : null;

    const graficadas = this.integral
      ? (integralDatos ? [integralDatos.integrando] : [])
      : this.derivada ? (derivadaExpr ? [derivadaExpr] : []) : visibles;
    const fuenteGrafico = this.integral
      ? (integralDatos?.integrando ?? "")
      : this.derivada ? (derivadaExpr ?? "") : source;

    // ── Panel LaTeX (mitad izquierda), mismo pipeline y UX que el GraphEngine ──
    // ¿Se señala con el dedo? Decide TODO lo que depende del puntero (crosshair, cruz del
    // cursor, carril, el cursor oculto del canvas) y el TAMAÑO de los controles, y NADA del
    // reparto del bloque, que se mide del ancho. Ver host-obsidian/plataforma.ts.
    const tactil = esTactil();

    // Reparto del bloque (columnas o panel flotante). Se crea ANTES que el panel porque el
    // panel se registra en él al construirse; el valor definitivo lo fija `aplicarReparto`
    // en cuanto hay una medida real del contenedor, más abajo.
    const reparto: Reparto = {
      estrecho: false, abierto: false, panel: null, ladoChip: ladoChip(tactil),
    };

    if (this.integral) await this.montarPanelIntegral(contenedor, source, ctx, limpieza, reparto);
    else if (this.derivada) await this.montarPanelDerivada(contenedor, visibles, ctx, limpieza, reparto);
    else await this.montarPanelLatex(contenedor, visibles, ctx, limpieza, reparto);

    // ── Gráfica (derecha). MISMO layout que el motor original: el panel LaTeX
    // pide width:50% y la gráfica width:100% inline; en el flex row del contenedor
    // eso reparte ⅓ para la fórmula y ⅔ para el plano (50 : 100).
    const H = ALTO_PANEL;
    const wrap = contenedor.createDiv({ cls: "lmath-grafica" });
    wrap.style.cssText = `position:relative; width:100%; height:${H}px;`;

    // ── Reparto: columnas o panel flotante, según el ANCHO del contenedor ─────────────
    // Se aplica aquí, ANTES del primer dimensionado del canvas y del autoencuadre, para que
    // la vista base se calcule ya sobre la caja definitiva: encuadrar con 261px de alto para
    // reencuadrar dos frames después sería un salto visible en cada carga.
    //
    // En flotante el plano deja de tener alto FIJO y lo deriva de su ancho: clavar otra
    // constante devolvería un plano vertical en cuanto el ancho no fuese el del teléfono de
    // referencia (una tablet, una nota estrecha, una ventana desprendida).
    // La asigna el botón f(x) cuando se monta, más abajo (los chips se crean después que
    // esto). Hasta entonces es un no-op: el primer reparto se aplica sin él.
    let sincronizarBotonFormula: () => void = () => { /* aún no hay botón */ };
    // Exclusión mutua entre los cuadros que se abren sobre el plano. `cerrarFormula` lo
    // rellena el botón f(x) al montarse; los ⓘ registran aquí el suyo según se crean.
    let cerrarFormula: () => void = () => { /* aún no hay panel flotante */ };
    const cierresInfo: Array<() => void> = [];
    const exclusion: ExclusionPopover = {
      alAbrir: () => cerrarFormula(),
      registrar: (cerrar) => cierresInfo.push(cerrar),
    };
    let anchoAplicado = -1;
    const aplicarReparto = () => {
      const ancho = contenedor.clientWidth;
      if (ancho <= 0) return;            // aún sin layout: ya llegará el observador
      const estrecho = ancho < ANCHO_MINIMO_COLUMNAS;
      // Con el reparto YA aplicado y el mismo ancho no hay nada que hacer. El ancho entra en
      // la comparación porque en flotante el ALTO del plano depende de él: cambiar de ancho
      // sin cruzar el umbral (girar entre dos tamaños estrechos) también obliga a recalcular.
      if (estrecho === reparto.estrecho && ancho === anchoAplicado) return;
      anchoAplicado = ancho;
      reparto.estrecho = estrecho;
      // Al ensancharse, la fórmula vuelve a su columna y "abierto" deja de significar nada;
      // se pone a false para que un regreso a estrecho (girar y desgirar) empiece cerrado, y
      // no con un panel tapando el plano que nadie pidió abrir.
      if (!estrecho) reparto.abierto = false;
      contenedor.toggleClass("lmath-estrecho", estrecho);
      aplicarCajaPanel(reparto);
      sincronizarBotonFormula();
      wrap.style.height = estrecho
        ? `${Math.round(ancho * PROPORCION_PLANO_FLOTANTE)}px`
        : `${H}px`;
      // El canvas no se toca aquí: el ResizeObserver de `wrap` ya llama a `redimensionar`,
      // que remide la caja real, rehace el búfer y repinta con el zoom intacto.
    };
    aplicarReparto();

    const canvas = wrap.createEl("canvas");
    // cursor:none oculta el cursor del sistema SOLO sobre el área del plano (los
    // botones, con su propio cursor:pointer, no se ven afectados). En su lugar el
    // motor dibuja su propio icono de cursor (Crosshair.dibujarCursorCruz).
    // En TÁCTIL no se oculta nada: la cruz dibujada no existe (la cámara no sigue
    // cursor), así que ocultar el puntero dejaría sin ninguno a una tablet con ratón.
    canvas.setCssStyles({
      position: "absolute", top: "0", left: "0", width: "100%", height: "100%",
      cursor: tactil ? "default" : "none",
      // El dedo mueve el PLANO, en los dos ejes, y dos dedos hacen zoom: el navegador no se
      // queda ningún gesto que empiece aquí. Va SOLO en el lienzo, no en el bloque: los toques
      // que empiezan en los márgenes, encima, debajo o sobre el panel de la fórmula —180 de
      // los 263px cuando está abierto— siguen desplazando la nota con normalidad, así que el
      // bloque nunca atrapa el desplazamiento. Y los gestos del sistema (deslizar desde el
      // borde para la barra lateral) empiezan fuera del lienzo, así que tampoco sufren.
      touchAction: "none",
    });

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      wrap.createEl("p", { text: t().canvasNoDisponible });
      revelar();   // sin lienzo no habrá primer render que revele el bloque
      return;
    }

    // Composición del motor (composition root) + cámara (interacción). obs-graph
    // grafica UNA función; obs-system grafica el SISTEMA (varias ecuaciones/colores).
    const escena = this.sistema ? crearMotorSistema(ctx2d, source) : crearMotor(ctx2d, fuenteGrafico);

    // obs-integral: si los límites evalúan a número, marca la escena para SOMBREAR ∫ₐᵇ
    // (el recorte del integrando lo hace la escena en `actualizar`). Con límites simbólicos/∞
    // no hay franja concreta → no se sombrea (el panel muestra la etiqueta "Límites no numéricos").
    if (this.integral && integralDatos) {
      const a = evaluarLimite(integralDatos.a), b = evaluarLimite(integralDatos.b);
      if (a !== null && b !== null) escena.fijarIntegral(a, b);
    }

    // Bloque vacío o función degenerada (0/0, log base 1, √−1…): el plano queda
    // interactivo (zoom/pan) pero oscurecido, con la etiqueta formal flotando
    // delante (mismas capas pointer-events:none que el GraphEngine original).
    // `clasificarBloque`/`degeneradaOrigen` pueden traer etiquetas del NÚCLEO en español
    // canónico (degeneradas.ts / integral.ts); `localizarVelo` las pasa al idioma activo
    // (las del propio host ya salen traducidas por `t()`, y las deja intactas).
    const degeneradaCruda = degeneradaOrigen ?? this.clasificarBloque(graficadas, source);
    const degenerada = degeneradaCruda ? localizarVelo(degeneradaCruda) : null;
    if (degenerada) {
      const velo = wrap.createDiv();
      velo.style.cssText =
        "position:absolute; inset:0; background:var(--lmath-velo); " +
        "pointer-events:none;";
      const msg = wrap.createDiv();
      msg.style.cssText =
        "position:absolute; inset:0; display:flex; flex-direction:column; " +
        "align-items:center; justify-content:center; text-align:center; " +
        "gap:8px; padding:24px; box-sizing:border-box; pointer-events:none;";
      const titulo = msg.createDiv({ text: degenerada.etiqueta });
      titulo.setCssStyles({ fontSize: "20px", fontWeight: "600", color: "var(--lmath-texto)" });
      const detalle = msg.createDiv({ text: degenerada.detalle });
      detalle.style.cssText =
        "font-size:12px; line-height:1.4; max-width:320px; " +
        "color:var(--lmath-texto-tenue);";
    }

    // Botón ⓘ de obs-graph: resumen de puntos notables de la función (intersección
    // Y, raíces, vértices), con los estados "infinitas"/"demasiadas" del análisis.
    // Solo para una función explícita graficable (no en sistemas ni en degeneradas).
    const exprGraph = this.exprExplicita(graficadas);
    // ¿Hay un chip en la esquina inferior derecha? Los tres ⓘ posibles (resumen de una
    // explícita, resumen geométrico y soluciones del sistema) se excluyen entre sí y ocupan
    // el mismo sitio; el botón f(x) se coloca A SU IZQUIERDA cuando existe alguno y en su
    // lugar cuando no. Se anota al montarlos en vez de recalcular sus condiciones: una copia
    // de esa lógica se desincronizaría en cuanto cambiara una de las tres.
    let hayChipInfo = false;
    if (exprGraph && !degenerada) {
      // obs-integral grafica el INTEGRANDO, así que sin este desvío el ⓘ describía a f como
      // una curva suelta —"corta el eje Y en 0", "raíces: 0", "sin vértices"— y no decía
      // nada de la integral, que es lo único que ese bloque afirma. Su panel propio habla
      // de la OPERACIÓN (intervalo, valor, qué mide ese número, valor medio).
      if (this.integral) hayChipInfo = this.montarBotonInfoIntegral(wrap, source, ctx, reparto.ladoChip, exclusion);
      // obs-derivate grafica f′, así que el resumen heredado describía f′ como una curva
      // suelta. Los números eran los buenos con el nombre de otra función: sus raíces son
      // los puntos CRÍTICOS de f y sus vértices, las INFLEXIONES. Su panel propio habla de
      // f, que es de quien trata el bloque (ver `analisisDerivada`).
      else if (this.derivada && funcionEscrita)
        hayChipInfo = this.montarBotonInfoDerivada(wrap, funcionEscrita, exprGraph, reparto.ladoChip, exclusion);
      else {
        this.montarBotonInfo(wrap, exprGraph, ctx, reparto.ladoChip, exclusion);
        hayChipInfo = true;
      }
    }

    // La cámara emite dos eventos: onViewport (recomputar geometría + pintar) y
    // onCursor (solo pintar el crosshair). `pintar` reusa la geometría cacheada.
    // En modo carril, el crosshair se ancla en railX (no en el ratón).
    let camara!: Camara;
    // null en táctil: sin teclado no hay ni carril ni paneo con WASD (ver más abajo).
    let navegacion: Navegacion | null = null;
    const pintar = () => {
      const vp = camara.viewport();
      // Tema del PLANO, leído vivo en cada pintado (una comprobación de clase es gratis, y
      // el color se consulta al pintar, no al construir la escena): así el bloque cambia de
      // paleta con el tema sin rehacer geometría ni perder el zoom. El MARCO no pasa por
      // aquí —sus colores son variables CSS y los recalcula el navegador solo—.
      fijarTemaPlano(esTemaOscuro(wrap));
      // Preferencia de marcadores, leída VIVA en cada pintado (asignar un booleano es
      // gratis): así apagar el ajuste se ve en el siguiente repintado del bloque —basta
      // pasar el ratón por el plano— sin recargar el plugin.
      escena.mostrarNotables(this.obtenerAjustes().puntosNotables);
      // Posición REAL del ratón para la cruz del cursor (en ambos modos).
      // En táctil son SIEMPRE null (la cámara no sigue cursor): las guardas de
      // `Escena.pintar` omiten por sí solas el crosshair y la cruz del cursor.
      const mx = camara.cursorPx();
      const my = camara.cursorPy();
      if (navegacion?.railOn) {
        // Crosshair matemático anclado en railX con railY explícito (mismo valor
        // que centró la cámara) → punto centrado, nunca sale del viewport. La cruz
        // del cursor, en cambio, sigue al ratón.
        escena.pintar(vp, aPantallaX(vp, navegacion.railX), true, navegacion.railY, mx, my);
      } else {
        escena.pintar(vp, mx, false, undefined, mx, my);
      }
    };
    // ── Renderizado progresivo en dos pasadas (portado de GraphEngine) ──────────
    // Pasada INTERACTIVA (rápida): durante pan/zoom/carril. Coalescida por rAF
    // (a lo sumo un redibujo por frame); muestreo ligero y SIN puntos notables ni
    // asíntotas (las omite el proveedor en pasada "interactiva").
    // Pasada FINAL (máxima calidad): 150ms después de que la cámara deja de
    // moverse; muestreo denso + puntos notables + asíntotas.

    let rafId: number | null = null;
    let pendienteRecomputar = false;
    const ejecutarFrame = () => {
      rafId = null;
      if (pendienteRecomputar) {
        escena.actualizar(camara.viewport(), "interactiva");
        pendienteRecomputar = false;
      }
      pintar();
    };
    const programarRedibujo = () => {   // pan/zoom/carril → recomputar (ligero) + pintar
      pendienteRecomputar = true;
      if (rafId === null) rafId = window.requestAnimationFrame(ejecutarFrame);
    };
    const programarPintado = () => {    // solo cursor → repintar, sin recomputar
      if (rafId === null) rafId = window.requestAnimationFrame(ejecutarFrame);
    };
    let timerFinal: number | null = null;
    // Aviso al panel de solución (ⓘ, solo sistemas) de que hay pasada final nueva:
    // las intersecciones pudieron cambiar. Se asigna al crear el panel, más abajo.
    let alRecalcularFinal: (() => void) | null = null;
    const programarFinal = () => {      // al detenerse la cámara → pasada de máxima calidad
      if (timerFinal !== null) window.clearTimeout(timerFinal);
      timerFinal = window.setTimeout(() => {
        timerFinal = null;
        escena.actualizar(camara.viewport(), "final");
        pintar();
        alRecalcularFinal?.();
      }, 150);
    };
    limpieza.register(() => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (timerFinal !== null) window.clearTimeout(timerFinal);
    });

    // Cambio de tema (o de snippet CSS) → repintar. El marco se recolorea solo, porque son
    // variables CSS; el plano no, porque es un lienzo: hay que volver a pintarlo para que
    // `pintar` relea la paleta. Es un REPINTADO, no un recálculo: la geometría cacheada
    // sirve igual y el zoom/desplazamiento del usuario se conservan.
    const refTema = this.plugin.app.workspace.on("css-change", () => programarPintado());
    limpieza.register(() => this.plugin.app.workspace.offref(refTema));

    camara = new Camara(canvas, H, {
      // pan/zoom: pasada interactiva mientras dura el gesto + programa la final
      // (cada evento reinicia el debounce → la final se dispara al parar).
      onViewport: () => { programarRedibujo(); programarFinal(); },
      onCursor: () => programarPintado(),
    }, {
      // Con el dedo no hay hover: la cámara no registra posición de cursor y, por las
      // guardas de `Escena.pintar`, se apagan de una vez el crosshair matemático y la
      // cruz del cursor. Un solo interruptor, en el origen.
      seguirCursor: !tactil,
    });

    // Carril (teclado): misma estrategia. Su bucle llama a este callback en cada
    // frame de movimiento (pasada interactiva) y una vez más al soltar las teclas;
    // como cada llamada reinicia programarFinal, la pasada final se dispara al parar.
    //
    // En TÁCTIL no se monta. `Navegacion` es TODO teclado (WASD/flechas para el paneo
    // libre y para recorrer la curva), y además hace del canvas un elemento enfocable
    // con contorno de foco. Nada de eso tiene sentido con el dedo. Se acepta a cambio
    // que una tablet con teclado Bluetooth pierda la navegación por teclado: es la
    // única pérdida real, y no hay forma de detectar ese teclado hasta que se pulsa.
    if (!tactil) {
      navegacion = new Navegacion(canvas, camara, {
        y: (x) => escena.yEnCurva(x),
        avanzarArco: (x, y, deltaPx, vp, recortar) => escena.avanzarArcoEnCurva(x, y, deltaPx, vp, recortar),
        hayVecina: (x, y, dir, vp) => escena.hayRamaVecinaCarril(x, y, dir, vp),
        tieneAsintotasVerticales: () => escena.tieneAsintotasVerticales(),
      }, () => {
        escena.actualizar(camara.viewport(), "interactiva");
        pintar();
        programarFinal();
      });
      const nav = navegacion;
      limpieza.register(() => nav.destruir());
    }

    // Ajuste de la resolución física del canvas al tamaño real en pantalla, y
    // primer render (calcular + pintar). Mismo patrón de ciclo de vida que el
    // motor antiguo (host).
    // La métrica se MIDE del canvas (su caja CSS real), no se asume: el alto nominal H
    // y el dpr del primer render caducan. Ctrl+rueda (zoom de la app) cambia el
    // devicePixelRatio, y un tema que exprese el ancho de nota en rem/em
    // (--file-line-width) reflowa el bloque al cambiar la fuente. Si el búfer del canvas
    // conserva una métrica vieja, el navegador estira ese mapa de bits hasta la caja CSS
    // nueva: la gráfica sale DEFORMADA (celdas rectangulares en vez de cuadradas).
    let W = 0, Hcss = 0, dprPrev = 0;
    const redimensionar = () => {
      const caja = canvas.getBoundingClientRect();
      const ancho = Math.max(1, Math.round(caja.width || wrap.clientWidth || 768));
      const alto = Math.max(1, Math.round(caja.height || H));
      const dpr = Math.ceil(window.devicePixelRatio || 1);
      if (ancho === W && alto === Hcss && dpr === dprPrev) return;
      W = ancho; Hcss = alto; dprPrev = dpr;
      camara.redimensionar(ancho, alto, dpr);
      canvas.width = ancho * dpr;
      canvas.height = alto * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      escena.actualizar(camara.viewport());
      pintar();
    };
    redimensionar();

    // AUTOENCUADRE (ajuste `encuadreAuto`): la vista por defecto ([-7,7]) le queda enorme a una
    // curva ACOTADA y pequeña (corazón, lemniscata, astroide, círculo unidad), que sale como un
    // garabato en el centro. Se decide UNA SOLA VEZ, aquí, sobre la geometría que `redimensionar()`
    // acaba de trazar con la vista por defecto: solo ACERCA (si la curva toca un borde puede
    // continuar fuera → no se toca nada) y solo escala (centro en el origen: los ejes siguen en
    // cuadro). No puede vivir en el callback de la cámara: reencuadrar en cada pan/zoom impediría
    // al usuario alejarse de la curva. Acercar solo MEJORA el descubrimiento (más semillas por
    // curva), así que la geometría de la segunda pasada nunca es peor que la de la primera.
    if (this.obtenerAjustes().encuadreAuto) {
      const semiY = escena.encuadreAutomatico(camara.viewport());
      if (semiY !== null) {
        camara.fijarEncuadreBase(semiY);
        escena.actualizar(camara.viewport());
        pintar();
      } else {
        // La curva TOCA un borde de la vista por defecto: puede ser ILIMITADA (recta, parábola)
        // o ACOTADA pero MAYOR que la vista (la astroide de radio 8 con [-7,7], que sale
        // recortada por arriba). Se traza un SONDEO en una vista FACTOR_SONDEO× más grande (pasada
        // interactiva: barata y sin tocar los latches de asíntota/intersección de la final): si
        // ahí la curva está CONTENIDA es acotada y se encuadra a su extensión (puede ALEJAR); si
        // sigue tocando el borde del sondeo es ilimitada y se deja la vista por defecto.
        const vp = camara.viewport();
        const semiYDefecto = (vp.domY[1] - vp.domY[0]) / 2;
        const sondeo = {
          ...vp,
          domX: [vp.domX[0] * FACTOR_SONDEO, vp.domX[1] * FACTOR_SONDEO] as [number, number],
          domY: [vp.domY[0] * FACTOR_SONDEO, vp.domY[1] * FACTOR_SONDEO] as [number, number],
        };
        escena.actualizar(sondeo, "interactiva");
        const semiAcotado = escena.encuadreAcotado(sondeo, semiYDefecto);
        if (semiAcotado !== null) camara.fijarEncuadreBase(semiAcotado);
        escena.actualizar(camara.viewport());
        pintar();
      }
    }

    const observador = new ResizeObserver(() => redimensionar());
    observador.observe(wrap);
    limpieza.register(() => observador.disconnect());

    // Reparto: se revisa con el ancho del CONTENEDOR, que cambia al girar el teléfono, al
    // arrastrar el divisor de un panel o al cambiar el ancho de nota del tema. Observa al
    // contenedor y no a la ventana: un bloque puede estrecharse sin que la ventana se mueva.
    // No se realimenta —lo único que `aplicarReparto` cambia es el alto, y aun así sale por
    // la guarda de "mismo ancho, mismo reparto"—.
    const observadorReparto = new ResizeObserver(() => aplicarReparto());
    observadorReparto.observe(contenedor);
    limpieza.register(() => observadorReparto.disconnect());
    // El zoom de la app puede cambiar SOLO el dpr (misma caja CSS): el ResizeObserver
    // no se entera, pero `resize` de la ventana sí llega. Sin esto, el búfer se queda a
    // la resolución vieja (gráfica borrosa) tras un Ctrl+rueda que no reflowe el bloque.
    window.addEventListener("resize", redimensionar);
    limpieza.register(() => window.removeEventListener("resize", redimensionar));
    limpieza.register(() => camara.destruir());

    // ── Botones 🏠︎ (vista base) y + / − (zoom centrado en la vista) ───────────────
    // Zoom y reencuadre sin rueda ni teclado (portátiles con trackpad, táctil), al estilo de
    // GeoGebra/Desmos: cada clic de + / − equivale a UNA muesca de rueda, pero anclada al CENTRO
    // de la vista en vez de al cursor (Camara.zoomCentrado) → lo que estás mirando sigue en el
    // sitio; 🏠︎ deshace zoom Y pan y devuelve la vista base del bloque (la del autoencuadre, si
    // lo hubo). Los tres animan la vista (rAF, perfil exponencial: rápido y frenando hasta clavar
    // el destino) y emiten onViewport por frame, así que el redibujo lo pide la cámara misma.
    // Apilados en la esquina superior derecha, empezando en `top:6px`.
    // Lado del chip y del icono, y la escalera de la columna: el hueco entre chips es fijo
    // (4px) y el paso lo pone el propio lado, así que la columna se recoloca sola al pasar de
    // ratón (22) a dedo (30) sin tres constantes que mantener a mano.
    const lado = reparto.ladoChip;
    const iconoChip = ladoIcono(lado);
    const escalonZoom = lado + 4;
    const estiloZoom = (arriba: number) =>
      `position:absolute; right:8px; top:${arriba}px; width:${lado}px; height:${lado}px; ` +
      "display:flex; align-items:center; justify-content:center; " +
      "line-height:1; border-radius:50%; cursor:pointer; user-select:none; z-index:5; " +
      "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
      "border:1px solid var(--lmath-borde);";
    const btnInicio = wrap.createDiv();
    this.ponerTooltip(btnInicio, t().botones.vistaInicial);
    btnInicio.style.cssText = estiloZoom(6);
    this.montarIcono(btnInicio, "inicio", iconoChip);
    const btnMas = wrap.createDiv();
    this.ponerTooltip(btnMas, t().botones.acercar);
    btnMas.style.cssText = estiloZoom(6 + escalonZoom);
    this.montarIcono(btnMas, "acercar", iconoChip);
    const btnMenos = wrap.createDiv();
    this.ponerTooltip(btnMenos, t().botones.alejar);
    btnMenos.style.cssText = estiloZoom(6 + 2 * escalonZoom);
    this.montarIcono(btnMenos, "alejar", iconoChip);
    // Los tres se retiran juntos mientras el panel flotante está abierto: la tarjeta llega
    // hasta arriba y quedarían debajo de ella. Ver `sincronizarBotonFormula`.
    const columnaZoom = [btnInicio, btnMas, btnMenos];
    btnInicio.addEventListener("click", () => camara.volverAVistaBase());
    // Zoom por PULSACIÓN o por MANTENER: un toque hace UNA muesca; mantener pulsado la repite a
    // cadencia fija (zoomCentrado ya las acumula y suaviza → zoom continuo) hasta soltar. El
    // pointer capture garantiza recibir el `pointerup` aunque el cursor salga del botón; el
    // `pointerdown` ya hace la primera muesca, así que NO se añade un listener de `click` (sería
    // una muesca doble). `limpieza` corta el timer si el bloque se desmonta con el botón pulsado.
    const CADENCIA_ZOOM_MS = 100;
    const zoomMantenido = (btn: HTMLElement, acercar: boolean) => {
      let timer: number | null = null;
      const parar = () => { if (timer !== null) { window.clearInterval(timer); timer = null; } };
      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return; // solo el botón primario / toque
        btn.setPointerCapture(e.pointerId);
        camara.zoomCentrado(acercar);
        parar();
        timer = window.setInterval(() => camara.zoomCentrado(acercar), CADENCIA_ZOOM_MS);
      });
      btn.addEventListener("pointerup", parar);
      btn.addEventListener("pointercancel", parar);
      limpieza.register(parar);
    };
    zoomMantenido(btnMas, true);
    zoomMantenido(btnMenos, false);

    // ── Botón ⌖ (carril) + botones de SELECCIÓN de línea ────────────────────────
    // El crosshair y el carril siguen UNA curva (la seleccionada en la Escena). Con
    // varias ecuaciones (obs-system) hay un botón de color por curva para elegir cuál;
    // el ⌖ solo se muestra si la curva seleccionada es RECORRIBLE como y=f(x) (círculo,
    // separable transpuesta tan y=x o paramétrica → no; el crosshair ya se auto-oculta
    // al no haber y). `redimensionar()` ya corrió una pasada, así que la recorribilidad
    // (propiedad del TIPO de curva, no del zoom) es estable aquí.
    //
    // En TÁCTIL no se monta ninguno de los dos: el carril se conduce con A/D y W/S y su
    // punto se lee con el crosshair, y ni el teclado ni el crosshair existen con el dedo,
    // así que el ⌖ solo sería un botón que no lleva a ningún sitio. `sincronizarCarril`
    // queda en no-op para que el resto de la sincronización de controles no se entere.
    let sincronizarCarril: () => void = () => { /* sin carril en táctil */ };
    if (!tactil) {
      const btnCarril = wrap.createDiv();
      this.ponerTooltip(btnCarril, t().botones.carril);
      // Mismo formato EXACTO que el botón ⌖ (btnFijar) de obs-graph/GraphEngine.
      const estiloBtn = (activo: boolean) => {
        btnCarril.style.cssText =
          `position:absolute; bottom:8px; left:8px; width:${lado}px; height:${lado}px; ` +
          "display:flex; align-items:center; justify-content:center; " +
          "line-height:1; border-radius:50%; cursor:pointer; user-select:none; z-index:5; " +
          (activo
            ? "color:var(--lmath-acento-contraste); background:var(--lmath-acento); " +
              "border:1px solid var(--lmath-acento);"
            : "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
              "border:1px solid var(--lmath-acento-borde);");
      };
      estiloBtn(false);
      // El icono persiste como hijo <svg> aunque estiloBtn reescriba el cssText del div en
      // cada toggle; hereda el color vía currentColor, así sigue el resaltado activo/inactivo.
      this.montarIcono(btnCarril, "carril", iconoChip);
      btnCarril.addEventListener("click", () => {
        if (!navegacion) return;
        navegacion.alternarCarril();
        estiloBtn(navegacion.railOn);
      });

      // Muestra/oculta el ⌖ según la curva SELECCIONADA sea recorrible como y=f(x); si
      // deja de serlo con el carril activo, lo apaga.
      sincronizarCarril = () => {
        const recorrible = escena.curvaRecorrible();
        if (!recorrible && navegacion?.railOn) { navegacion.alternarCarril(); estiloBtn(false); }
        btnCarril.style.display = recorrible ? "flex" : "none";
      };
    }

    // Selección de línea: un botón de color por ecuación (solo si hay ≥2). El botón
    // seleccionado lleva borde blanco; al pulsarlo, crosshair y carril pasan a seguir
    // esa curva (Escena.seleccionar) y se resincroniza la visibilidad del ⌖.
    const colores = escena.colores();
    const estilosSel: Array<(sel: boolean) => void> = [];
    if (colores.length >= 2) {
      // Los puntos de color van en la misma fila que el ⌖ y comparten su densidad: algo más
      // pequeños que un chip (son marcas de estado, no controles de navegación), centrados
      // contra él, y arrancando DONDE ACABA el ⌖ —o pegados al borde cuando no hay ⌖, que es
      // justo el caso táctil—.
      const ladoSel = tactil ? 24 : 18;
      const bajoSel = 8 + Math.round((lado - ladoSel) / 2);
      const inicioSel = tactil ? 8 : 8 + lado + 8;
      colores.forEach((c, i) => {
        const b = wrap.createDiv();
        this.ponerTooltip(b, t().botones.seleccionarEcuacion(i + 1));
        const rgb = `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
        const estilo = (sel: boolean) => {
          b.style.cssText =
            `position:absolute; bottom:${bajoSel}px; left:${inicioSel + i * (ladoSel + 6)}px; ` +
            `width:${ladoSel}px; height:${ladoSel}px; ` +
            "border-radius:50%; cursor:pointer; user-select:none; z-index:5; box-sizing:border-box; " +
            `background:${rgb}; ` +
            (sel ? "border:2px solid var(--lmath-texto);" : "border:2px solid var(--lmath-borde);");
        };
        estilo(i === escena.seleccionActual());
        b.addEventListener("click", () => {
          escena.seleccionar(i);
          sincronizarControles();
          pintar();
        });
        estilosSel.push(estilo);
      });
    }

    // Resalta la curva elegida y pone al día el ⌖ (que en táctil no existe: ver arriba).
    const sincronizarControles = () => {
      const sel = escena.seleccionActual();
      estilosSel.forEach((estilo, i) => estilo(i === sel));
      sincronizarCarril();
    };
    sincronizarControles();

    // ── Botón de solución (ⓘ) + popover: intersecciones del sistema ─────────
    // Reincorpora el panel de solución del obs-system original (retirado en la
    // Etapa 10 con el SystemEngine), ahora derivado de la geometría: lista las
    // intersecciones que la Escena calculó sobre las Ramas trazadas (las de la
    // vista actual, en la última pasada final). Mismos estilos que el original.
    if (this.sistema) {
      hayChipInfo = true;
      const btnSolucion = wrap.createDiv();
      this.ponerTooltip(btnSolucion, t().botones.solucionesSistema);
      btnSolucion.style.cssText = this.estiloChipInfo(lado);
      this.montarIcono(btnSolucion, "info", iconoChip);

      const popSolucion = wrap.createDiv();
      popSolucion.style.cssText = this.estiloPopoverInfo(lado);
      exclusion.registrar(() => popSolucion.setCssStyles({ display: "none" }));

      // ¿El sistema es PERIÓDICO? (alguna ecuación usa una función trig como sin/
      // cos/tan…). Un sistema periódico repite sus soluciones sin fin → si además
      // hay varias en la vista, son INFINITAS (discretas, pero ilimitadas), que es
      // distinto del solape continuo y de la mera saturación del cap. Mismo criterio
      // que el motor antiguo para las raíces de una trig (ver analisis.estadoGrupo).
      const sistemaPeriodico = visibles.some((ec) =>
        ec.split("=").some((lado) =>
          tieneTrigonometria(insertarProductoImplicito(normalizarEntrada(lado.trim())))));
      const MIN_PERIODICO = 3; // nº de soluciones en vista a partir del cual "repite"

      const MAX_LISTA = 20; // cap visual; los marcadores del plano no se capan
      const refrescarSolucion = () => {
        popSolucion.empty();
        // Un sistema necesita ≥2 ecuaciones: sin ellas no hay soluciones que buscar.
        if (visibles.length === 0) {
          popSolucion.createDiv({ text: t().solucion.sinSistema });
          return;
        }
        if (visibles.length === 1) {
          popSolucion.createDiv({ text: t().solucion.sistemaIncompleto });
          return;
        }
        // Infinitas (curvas que coinciden en un tramo) ANTES que la saturación: son
        // cosas distintas —una solución continua, no "muchos puntos aislados".
        if (escena.solucionesInfinitas()) {
          popSolucion.createDiv({ text: t().solucion.infinitasCoinciden });
          return;
        }
        const pts = escena.intersecciones();
        // Infinitas por PERIODICIDAD: un sistema con función trig que muestra varias
        // soluciones (o satura el cap) las repite sin fin. Va ANTES de "demasiadas":
        // esto es infinito de verdad, no solo muchas finitas por estar muy alejado.
        if (sistemaPeriodico && (escena.interseccionesSaturadas() || pts.length >= MIN_PERIODICO)) {
          popSolucion.createDiv({ text: t().solucion.infinitasPeriodico });
          return;
        }
        if (escena.interseccionesSaturadas()) {
          popSolucion.createDiv({ text: t().solucion.demasiadas });
          return;
        }
        if (pts.length === 0) {
          popSolucion.createDiv({ text: t().solucion.sinSolucion });
          return;
        }
        popSolucion.createDiv({
          text: pts.length === 1 ? t().solucion.unaSolucion : t().solucion.nSoluciones(pts.length),
          attr: { style: "font-weight:600; margin-bottom:4px;" },
        });
        for (const p of pts.slice(0, MAX_LISTA)) {
          popSolucion.createDiv({
            text: `(${formatearNumero(p.x)}, ${formatearNumero(p.y)})`,
          });
        }
        if (pts.length > MAX_LISTA) {
          popSolucion.createDiv({
            text: t().solucion.yMas(pts.length - MAX_LISTA),
            attr: { style: "opacity:0.6;" },
          });
        }
        popSolucion.createDiv({
          text: t().solucion.enVista,
          attr: { style: "margin-top:4px; opacity:0.6;" },
        });
      };
      // Si el popover está abierto cuando aterriza una pasada final, se refresca.
      alRecalcularFinal = () => {
        if (popSolucion.style.display !== "none") refrescarSolucion();
      };
      btnSolucion.addEventListener("click", (e) => {
        e.stopPropagation();
        const abierto = popSolucion.style.display !== "none";
        if (!abierto) { exclusion.alAbrir(); refrescarSolucion(); }
        popSolucion.setCssStyles({ display: abierto ? "none" : "block" });
      });
    }

    // ── Botón ⓘ GEOMÉTRICO (obs-graph, curva NO explícita) ──────────────────
    // El resumen clásico (montarBotonInfo) evalúa f(x) y solo existe para y=f(x).
    // Para las demás curvas de obs-graph (implícitas, trig periódicas: tan(y)=x,
    // tan(y)·(x²+1)=√(x+1)…) el resumen se deriva de la GEOMETRÍA cacheada
    // (filosofía del motor: la interacción lee la Rama), con los mismos estados
    // "infinitas"/"demasiadas" (estadoGrupo + presencia de trig en la ecuación).
    // Se recalcula al abrir el popover y en cada pasada final con él abierto.
    if (!this.sistema && !degenerada && graficadas.length > 0 && !exprGraph) {
      hayChipInfo = true;
      // ¿La curva está ACOTADA por su período? Las paramétricas/polares se trazan
      // sobre UN período (dominio [0, 2π] por defecto): son un conjunto acotado, así
      // que sus puntos notables son FINITOS por construcción —la periodicidad en t/θ
      // hace que la curva se RE-RECORRA, no que sume cruces nuevos (una Lissajous
      // (sin 2t, sin 3t) cruza cada eje un nº fijo de veces por período)—. La
      // heurística "trig ⇒ infinitas" (estadoGrupo) SOLO vale para dominios NO
      // acotados en x (y=f(x), implícitas sobre x∈ℝ), donde una trig sí oscila sin
      // fin. Para las acotadas se cuentan los eventos de un período y se DEDUPLICAN
      // por posición (lo hace resumenPuntosNotables, tolerancia periódica espacial) →
      // nunca "infinitas": conteos finitos, o "demasiadas" si de verdad hay muchos.
      let tipo: string;
      try { tipo = construirObjeto(graficadas[0], "info").tipo; } catch { tipo = ""; }
      const acotadaPorPeriodo = tipo === "parametrica" || tipo === "polar";

      // Una POLAR no se resume con categorías cartesianas: "corta el eje Y en 1,1" no
      // dice nada de una rosa. Se analiza r(θ) por su cuenta (periodo, simetrías, rango
      // radial, extremos, paso por el polo, área) y ese resumen sustituye al clásico.
      // No depende de la vista —es la curva entera, no lo que se ve—, así que se calcula
      // UNA vez aquí y no en cada apertura del popover. Si el análisis falla, `null`
      // deja caer el panel al resumen geométrico de siempre en vez de quedarse mudo.
      const exprPolar = tipo === "polar" ? expresionPolar(graficadas[0]) : null;
      const infoPolar = exprPolar ? analizarPolar(exprPolar) : null;

      // Lo mismo para una PARAMÉTRICA, y por lo mismo: "intersección con Y" es ambiguo en
      // una Lissajous que cruza el eje una docena de veces, "raíz" no dice si es x(t)=0 o
      // y(t)=0, y "vértice" no está definido fuera de familias concretas. Ninguna de las
      // tres es una propiedad intrínseca de la curva.
      //
      // A diferencia del polar, este análisis se calcula PEREZOSAMENTE al abrir el cuadro
      // y se cachea: el conteo de autointersecciones recorre las parejas de segmentos y
      // llega a los 100 ms, que da igual en un clic pero se notaría al montar el bloque.
      const compsParam = tipo === "parametrica" ? expresionesParametricas(graficadas[0]) : null;
      let infoParam: AnalisisParametrico | null = null;
      let paramCalculado = false;
      const analisisParametrico = (): AnalisisParametrico | null => {
        if (paramCalculado || !compsParam) return infoParam;
        paramCalculado = true;
        // El intervalo del parámetro es el del OBJETO, no una constante repetida aquí: si
        // algún día el bloque admite fijarlo, el panel lo sigue solo.
        let dominio: readonly [number, number] = [0, 2 * Math.PI];
        try {
          const obj = construirObjeto(graficadas[0], "info");
          if (obj.tipo === "parametrica") dominio = obj.p.dominio;
        } catch { /* se queda el intervalo por defecto */ }
        infoParam = analizarParametrico(
          compsParam[0], compsParam[1], dominio[0], dominio[1]);
        return infoParam;
      };

      const esTrig = !acotadaPorPeriodo && graficadas[0].split("=").some((lado) =>
        tieneTrigonometria(insertarProductoImplicito(normalizarEntrada(lado.trim()))));

      const btnInfo = wrap.createDiv();
      this.ponerTooltip(btnInfo, t().botones.resumenNotables);
      btnInfo.style.cssText = this.estiloChipInfo(lado);
      this.montarIcono(btnInfo, "info", iconoChip);

      const pop = wrap.createDiv();
      pop.style.cssText = this.estiloPopoverInfo(lado);
      exclusion.registrar(() => pop.setCssStyles({ display: "none" }));

      const refrescarInfo = () => {
        pop.empty();

        // Ramas propias (polar y paramétrica): resumen intrínseco de la curva, sin el pie
        // "en la vista actual" —no lo está: describen la curva entera sobre su intervalo—.
        if (infoPolar) {
          for (const linea of this.lineasPolar(infoPolar)) pop.createDiv({ text: linea });
          return;
        }
        const param = analisisParametrico();
        if (param) {
          for (const linea of this.lineasParametricas(param)) pop.createDiv({ text: linea });
          return;
        }

        const r = escena.resumenNotables(camara.viewport());
        const lineas: string[] = [];

        const T = t().resumen;
        const estIY = estadoGrupo(r.interseccionesY.length, esTrig);
        if (estIY === "infinitas") lineas.push(T.interseccionesYInfinitas);
        else if (estIY === "demasiadas") lineas.push(T.interseccionesYDemasiadas);
        else if (r.interseccionesY.length > 0)
          for (const p of r.interseccionesY)
            lineas.push(T.interseccionY(numeroATexto(p.punto.y)));
        else lineas.push(T.noCortaY);

        const estR = estadoGrupo(r.raices.length, esTrig);
        if (estR === "infinitas") lineas.push(T.raicesInfinitas);
        else if (estR === "demasiadas") lineas.push(T.raicesDemasiadas);
        else if (r.raices.length > 0)
          lineas.push(T.raicesPrefijo + r.raices.map((p) => numeroATexto(p.punto.x)).join(", "));
        else lineas.push(T.noRaices);

        const estV = estadoGrupo(r.vertices.length, esTrig);
        if (estV === "infinitas") lineas.push(T.verticesInfinitos);
        else if (estV === "demasiadas") lineas.push(T.verticesDemasiados);
        else if (r.vertices.length > 0)
          for (const v of r.vertices)
            lineas.push(T.vertice(numeroATexto(v.punto.x), numeroATexto(v.punto.y)));
        else lineas.push(T.noVertices);

        for (const linea of lineas) pop.createDiv({ text: linea });
        pop.createDiv({
          text: T.enVista,
          attr: { style: "margin-top:4px; opacity:0.6;" },
        });
      };
      alRecalcularFinal = () => {
        if (pop.style.display !== "none") refrescarInfo();
      };
      btnInfo.addEventListener("click", (e) => {
        e.stopPropagation();
        const abierto = pop.style.display !== "none";
        if (!abierto) { exclusion.alAbrir(); refrescarInfo(); }
        pop.setCssStyles({ display: abierto ? "none" : "block" });
      });
    }

    // ── Botón f(x): despliega la fórmula SOBRE el plano (solo en bloque estrecho) ──────
    // En el reparto flotante el bloque es el plano, así que la fórmula necesita una puerta.
    // Va abajo a la derecha, a la izquierda del ⓘ cuando lo hay: son los dos controles que
    // ABREN algo, frente a los de arriba, que mueven la vista. Y como el ⓘ, se queda fuera
    // del área que tapa el panel, para que su propio cierre nunca quede debajo.
    //
    // Sigue la regla de 1.2.9 del menú ☰: el botón muestra lo que hace AHORA —f(x) cuando
    // abrirá, ✕ cuando cerrará—, con el tooltip y el resaltado a juego.
    const btnFormula = wrap.createDiv();
    // Se aparta del ⓘ cuando lo hay, en vez de llevar su posición escrita.
    const derechaFormula = MARGEN_FLOTANTE + (hayChipInfo ? lado + MARGEN_FLOTANTE : 0);
    const estiloBotonFormula = () => {
      btnFormula.style.cssText =
        `position:absolute; bottom:${MARGEN_FLOTANTE}px; right:${derechaFormula}px; ` +
        `height:${lado}px; min-width:${lado}px; padding:0 8px; box-sizing:border-box; ` +
        // El `display` va aquí y no en una llamada aparte: esta función escribe TODO el
        // estilo del botón de una vez, y una visibilidad puesta desde fuera se perdería en
        // el siguiente repintado del estado.
        `display:${reparto.estrecho ? "flex" : "none"}; ` +
        "align-items:center; justify-content:center; font-size:11px; line-height:1; " +
        "border-radius:8px; cursor:pointer; user-select:none; z-index:7; " +
        (reparto.abierto
          ? "color:var(--lmath-texto); background:var(--lmath-chip-activo); " +
            "border:1px solid var(--lmath-borde-activo);"
          : "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
            "border:1px solid var(--lmath-borde);");
    };
    // El glifo solo se repinta cuando CAMBIA (`dataset`): la etiqueta matemática pasa por
    // MarkdownRenderer, que no es gratis, y esto se llama en cada sincronización.
    const pintarGlifoFormula = () => {
      const nombre = reparto.abierto ? "cerrar" : "formula";
      if (btnFormula.dataset.glifo === nombre) return;
      btnFormula.dataset.glifo = nombre;
      btnFormula.empty();
      if (reparto.abierto) this.montarIcono(btnFormula, "cerrar", iconoChip);
      else this.montarEtiquetaMath(btnFormula, "f(x)", ctx);
      this.ponerTooltip(
        btnFormula, reparto.abierto ? t().botones.cerrarFormula : t().botones.verFormula
      );
    };
    // Lo crea el bloque de más abajo (solo en táctil); hasta entonces, null.
    let btnEditar: HTMLElement | null = null;
    sincronizarBotonFormula = () => {
      estiloBotonFormula();
      pintarGlifoFormula();
      // El ✎ se retira con la fórmula abierta: quien ha desplegado el panel ya está en el
      // flujo de la fórmula, así que el botón no lleva a ningún sitio nuevo y solo compite por
      // la atención con lo que se ha venido a leer. Vuelve solo al cerrar.
      btnEditar?.setCssStyles({ display: reparto.abierto ? "none" : "flex" });
      // La tarjeta llega casi hasta arriba: con ella abierta, la columna de zoom quedaría
      // por debajo. Se retira mientras dura la lectura y vuelve al cerrar. Es el precio de
      // un panel grande, y el correcto: con la fórmula delante no se está navegando.
      for (const b of columnaZoom) b.setCssStyles({ display: reparto.abierto ? "none" : "flex" });
    };
    sincronizarBotonFormula();

    const alternarFormula = (abrir: boolean) => {
      if (reparto.abierto === abrir) return;
      reparto.abierto = abrir;
      // La fórmula y el popover del ⓘ se solapan casi por completo sobre un plano de móvil:
      // abrir uno cierra el otro, en vez de dejar uno tapado detrás.
      if (abrir) for (const cerrar of cierresInfo) cerrar();
      aplicarCajaPanel(reparto);   // una sola función escribe caja Y visibilidad del panel
      sincronizarBotonFormula();
    };
    cerrarFormula = () => alternarFormula(false);
    btnFormula.addEventListener("click", (e) => {
      e.stopPropagation();
      alternarFormula(!reparto.abierto);
    });

    // Tocar el PLANO cierra la fórmula. Pero solo un toque LIMPIO: un arrastre para
    // desplazar la vista acaba emitiendo `click` igual que un toque, y cerrar el panel cada
    // vez que se mueve el plano lo haría inservible. El panel NO cuelga del plano (es
    // hermano suyo), así que tocar dentro de la fórmula no llega hasta aquí.
    const TOQUE_QUIETO_PX = 8;
    const TOQUE_MAX_MS = 500;
    let toqueX = 0, toqueY = 0, toqueMs = 0;
    wrap.addEventListener("pointerdown", (e) => {
      toqueX = e.clientX; toqueY = e.clientY; toqueMs = e.timeStamp;
    });
    wrap.addEventListener("click", (e) => {
      if (!reparto.abierto) return;
      const quieto = Math.hypot(e.clientX - toqueX, e.clientY - toqueY) <= TOQUE_QUIETO_PX;
      if (quieto && e.timeStamp - toqueMs <= TOQUE_MAX_MS) alternarFormula(false);
    });

    // ── Chip de EDITAR (solo táctil) ──────────────────────────────────────────────────
    // Obsidian ofrece su botón `</>` para ver el código de un bloque renderizado, pero
    // aparece AL PASAR EL RATÓN: en el móvil no existe. Y nuestro lienzo se queda los toques
    // (`touch-action:none`), así que el bloque se quedaba sin ninguna puerta a su fuente.
    // Este chip la devuelve, y solo donde hace falta: con ratón el `</>` de Obsidian sigue
    // siendo el camino, y no le añadimos un botón de más al plano.
    //
    // Va SOLO en la esquina superior izquierda, apartado de la fila de abajo. No es un control
    // del plano como los demás: los de abajo a la derecha abren algo DENTRO del bloque y los de
    // arriba a la derecha mueven la vista, mientras que este SALE del bloque, al código de la
    // nota. Además es la única esquina que queda despejada con la fórmula abierta —el panel
    // empieza justo por debajo—, y alinea con el 🏠 al otro lado.
    if (tactil) {
      btnEditar = wrap.createDiv();
      this.ponerTooltip(btnEditar, t().botones.editarBloque);
      btnEditar.style.cssText =
        `position:absolute; top:6px; left:${MARGEN_FLOTANTE}px; ` +
        `width:${lado}px; height:${lado}px; ` +
        "display:flex; align-items:center; justify-content:center; line-height:1; " +
        "border-radius:50%; cursor:pointer; user-select:none; z-index:7; " +
        "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
        "border:1px solid var(--lmath-borde);";
      this.montarIcono(btnEditar, "editar", iconoChip);
      btnEditar.addEventListener("click", (e) => {
        e.stopPropagation();
        this.editarBloque(contenedor, ctx);
      });
    }

    // Bloque terminado: reparto decidido, lienzo dimensionado, geometría trazada y pintada
    // (`redimensionar` → `pintar`, más el autoencuadre), y los controles ya colocados. Desde
    // la última espera hasta aquí no se ha cedido el hilo ni una vez, así que el navegador
    // no ha tenido ocasión de pintar nada a medias: el primer fotograma que se ve del bloque
    // es el definitivo, con la curva ya dentro.
    revelar();
  }

  /**
   * Lleva el cursor al CÓDIGO de este bloque, que es lo que hace el `</>` de Obsidian en
   * escritorio. Tres pasos, y ninguno se puede dar por hecho:
   *
   *  1. QUÉ LÍNEAS ocupa el bloque en el fichero: `getSectionInfo`. Devuelve null cuando el
   *     bloque no vive en un fichero editable (una vista previa, un embebido, un canvas);
   *     ahí no hay nada que editar y se sale sin hacer ruido.
   *  2. QUÉ VISTA lo contiene: la activa, comprobando que sea del MISMO fichero. Sin esa
   *     comprobación, tocar el chip de un bloque embebido movería el cursor de otra nota.
   *  3. En LECTURA no hay cursor donde ponerlo, así que primero se pasa la vista a edición.
   *     El salto se hace después, cuando el editor ya existe.
   *
   * El cursor cae DENTRO del cuerpo —nunca en las vallas ```—, así que en Live Preview el
   * bloque se abre mostrando su fuente, que es lo que se venía a hacer. Y cae al FINAL del
   * contenido, no al principio: se pulsa "editar" para seguir escribiendo, no para insertar
   * algo por delante de lo que ya hay.
   */
  private editarBloque(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const seccion = ctx.getSectionInfo(el);
    if (!seccion) return;

    const vista = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!vista || vista.file?.path !== ctx.sourcePath) return;

    /**
     * Final del CUERPO del bloque. `lineEnd` es la valla de cierre, así que la última línea
     * escribible es la anterior; se comprueba que de verdad sea una valla en vez de darlo por
     * hecho. Con el bloque VACÍO no hay ninguna línea de cuerpo (la valla de cierre va pegada
     * a la de apertura) y se cae al comienzo del hueco: es lo único que se puede hacer sin
     * inventarse una línea que el usuario no ha escrito.
     */
    const finDelCuerpo = (): { line: number; ch: number } => {
      const editor = vista.editor;
      const esValla = (n: number) => editor.getLine(n)?.trimStart().startsWith("```") ?? false;
      const ultima = esValla(seccion.lineEnd) ? seccion.lineEnd - 1 : seccion.lineEnd;
      if (ultima <= seccion.lineStart) return { line: seccion.lineStart + 1, ch: 0 };
      return { line: ultima, ch: editor.getLine(ultima).length };
    };

    const irAlBloque = () => {
      const destino = finDelCuerpo();
      vista.editor.setCursor(destino);
      // Tras cambiar de modo el bloque puede haber quedado fuera de pantalla, y en el móvil
      // además sube el teclado: sin esto, el cursor acaba donde no se ve.
      vista.editor.scrollIntoView({ from: destino, to: destino }, true);
      vista.editor.focus();
    };

    if (vista.getMode() === "preview") {
      // `setState` con el modo de edición; el editor no está listo hasta que la vista se
      // reconstruye, así que el salto va en el `then`, no a continuación.
      void vista.setState({ ...vista.getState(), mode: "source" }, { history: false })
        .then(irAlBloque);
    } else {
      irAlBloque();
    }
  }

  /**
   * Crea el "scroller" del panel izquierdo (portado del GraphEngine): contenedor
   * posicionado que aloja una o varias ÁREAS de scroll horizontal, cada una con su
   * overlay de fade en los bordes. El overlay tiene que ser HERMANO del área
   * scrolleable (no hijo): un elemento absolute dentro de un scroller se desplaza
   * junto al contenido y el fade "viajaría". Devuelve `panelLatex` (para colgar la
   * barra de toggle encima) y `renderLatex` (pinta uno o varios LaTeX).
   *
   * Regla de presentación UNIFICADA (todos los bloques): **una expresión = una
   * tarjeta**. `renderLatex` crea un área INDEPENDIENTE por fórmula —cada una con su
   * PROPIA scrollbar, fades, centrado, rueda y observador de tamaño—, enmarcada en una
   * caja redondeada un punto más oscura que el panel. Con una fórmula, esa única
   * tarjeta ocupa el panel (obs-graph, obs-system, y los operadores/valores simples de
   * obs-derivate/obs-integral); con varias (vistas "ambas"), se apilan en columna y se
   * desplaza una sin mover la otra. No depende del NÚMERO de fórmulas: el estilo de
   * tarjeta es fijo ("enmarcado"). Común a `montarPanelLatex` (toggle
   * Original/Opciones), `montarPanelDerivada` y `montarPanelIntegral`.
   */
  private crearScrollerLatex(
    contenedor: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    limpieza: MarkdownRenderChild,
    reparto: Reparto
  ): { panelLatex: HTMLElement; renderLatex: (latex: string | readonly string[]) => Promise<void> } {
    // Constantes de layout del panel izquierdo. Se derivan entre sí para que el alto de
    // una tarjeta única case EXACTO con el de una ranura del par "ambas".
    const PAD_SUP = 32;       // px reservados arriba (bajo la barra de toggle) en "ambas"
    const PAD_LADO = 8;       // px de hueco lateral e inferior
    const HUECO = 10;         // px entre tarjetas apiladas ("ambas")
    // Alto de UNA ranura del par "ambas" = alto útil (con 2 cajas y su hueco) / 2. Es el
    // alto MÍNIMO (y por defecto) de la tarjeta: una fórmula que cabe se ve idéntica en todos
    // los bloques (=105.5px). Una tarjeta única con una fórmula que CABE se queda aquí (no
    // crece); solo si el contenido SUPERA este mínimo se ajusta hacia arriba (altura dinámica).
    const ALTO_TARJETA = (ALTO_PANEL - PAD_SUP - PAD_LADO - HUECO) / 2;
    // Techo del alto DINÁMICO de la tarjeta única: una fórmula alta (un despeje con fracción y
    // raíz anidadas) CRECE hasta aquí en vez de quedar cortada. Deja simétrico el hueco de la
    // barra de toggle; si ni así cabe, el área gana su propio scroll VERTICAL.
    const ALTO_TARJETA_MAX = ALTO_PANEL - 2 * PAD_SUP;

    const panelLatex = contenedor.createDiv({ cls: "lmath-latex" });
    reparto.panel = panelLatex;
    aplicarCajaPanel(reparto);

    // Zona persistente que aloja las áreas de scroll; `renderLatex` la reconstruye en
    // cada cambio de vista. Es HERMANA de la barra de toggle (que se cuelga después
    // sobre `panelLatex`), por eso vaciarla no borra la barra. Columna: en "ambas"
    // apila los dos sub-paneles; con una sola fórmula, su única área la llena.
    const zona = panelLatex.createDiv();
    // Sin overflow propio: cada tarjeta tiene alto FIJO y su PROPIO scroll vertical interno
    // (barra INDEPENDIENTE por fórmula); la `zona` solo las apila.
    zona.setCssStyles({
      position: "absolute", inset: "0", display: "flex", flexDirection: "column", boxSizing: "border-box",
    });

    // KaTeX puede dejar 1–2px de desbordamiento sub-pixel aunque la fórmula quepa de
    // sobra; solo se considera que desborda (scroll + fades) por encima de esto.
    const TOLERANCIA_SCROLL = 3;

    // ── Geometría de la zona y de las tarjetas según el REPARTO ──────────────────────
    // En el panel FLOTANTE la tarjeta LLENA la columna en vez de quedarse en el alto de
    // ranura: el panel es sitio dedicado a la fórmula y no hay razón para dejarlo medio
    // vacío —al contrario que en columnas, donde el alto de ranura mantiene idéntica la
    // presentación de una fórmula entre los cuatro bloques—. "Llenar" es exactamente lo que
    // ya hace el reparto de la vista "ambas" (`flex:1 1 0`), así que el modo estrecho reusa
    // ese mecanismo sin inventar otro: una sola tarjeta que reparte la columna se la queda
    // entera. Y como es una FUNCIÓN y no un valor capturado, el giro del teléfono lo
    // resuelve el siguiente refresco: no hay que reconstruir ninguna tarjeta.
    let formulasVisibles = 1;
    const tarjetasLlenan = () => formulasVisibles > 1 || reparto.estrecho;
    // La zona reserva arriba para la barra de toggle siempre que las tarjetas llenan (si no,
    // la primera correría por debajo de los botones); con una sola tarjeta en columnas, el
    // alto de ranura ya la mantiene lejos de la barra y los márgenes quedan simétricos.
    const aplicarGeometriaZona = () => {
      const llenan = tarjetasLlenan();
      zona.style.padding = llenan
        ? `${PAD_SUP}px ${PAD_LADO}px ${PAD_LADO}px ${PAD_LADO}px`
        : `${PAD_LADO}px`;
      zona.style.gap = `${HUECO}px`;
      zona.style.justifyContent = llenan ? "flex-start" : "center";
    };
    aplicarGeometriaZona();
    // La zona está a `inset:0`, así que cambia de tamaño EXACTAMENTE cuando lo hace el panel:
    // es la señal de que el reparto pudo cambiar. Su padding no altera su propia caja, así
    // que reaplicarlo aquí no se realimenta.
    const observadorZona = new ResizeObserver(() => aplicarGeometriaZona());
    observadorZona.observe(zona);
    limpieza.register(() => observadorZona.disconnect());

    // Construye un ÁREA de scroll horizontal AUTÓNOMA dentro de `padre`: su propio
    // desbordamiento, fades laterales, rueda y observador de tamaño. El `estilo` fija
    // solo su aspecto: "enmarcado" la envuelve en una caja redondeada y algo más oscura
    // que el panel (`--lmath-superficie`, la primaria del tema sobre la secundaria del
    // panel: el mismo escalón de material que usa Obsidian para sus tarjetas, y el mismo
    // color con el que degradan los fades laterales); "plano" la deja sin recuadro
    // llenando el hueco (reservado a futuros
    // paneles; el panel actual usa siempre "enmarcado"). `compartirAlto` es un eje
    // ORTOGONAL al estilo (layout, no aspecto): true → la tarjeta reparte a partes iguales la
    // altura de la columna (varias tarjetas de la vista "ambas", cada una = ALTO_TARJETA, sin
    // crecer); false → una sola tarjeta arranca en ese mínimo y CRECE con el contenido si lo
    // supera (`ajustarAlto`, hasta `ALTO_TARJETA_MAX`), con la `zona` centrándola en vertical.
    // Devuelve el área donde pintar, su `actualizarFade` (para recalcular tras el render)
    // y un `soltar` que retira sus listeners globales (evita fugas al alternar de vista).
    const crearArea = (
      padre: HTMLElement,
      estilo: EstiloTarjeta,
      compartirAlto: boolean
    ): { area: HTMLElement; actualizarFade: () => void; soltar: () => void } => {
      const enmarcado = estilo === "enmarcado";
      // ¿Esta tarjeta REPARTE la columna (y por tanto la llena) o arranca en el alto de
      // ranura y crece con su contenido? Lo primero cuando hay varias ("ambas") y SIEMPRE en
      // el panel flotante. Es una función: se reevalúa en cada refresco, así que cruzar el
      // umbral de ancho —girar el teléfono— cambia el comportamiento sin reconstruir nada.
      const llenar = () => compartirAlto || reparto.estrecho;
      // Alto del marco. Repartiendo (`flex:1 1 0`) cada una se queda con su parte, sin crecer;
      // una fórmula alta gana su scroll propio. Si no reparte, arranca en el mínimo
      // (`flex:0 0 auto; height:ALTO_TARJETA`) y `ajustarAlto` la CRECE si el contenido lo
      // supera; la `zona` la centra en vertical (se ve como una del par).
      const flexMarco = llenar()
        ? "flex:1 1 0;"
        : `flex:0 0 auto; height:${ALTO_TARJETA}px;`;
      const marco = padre.createDiv();
      marco.style.cssText =
        "position:relative; overflow:hidden; min-height:0; " + flexMarco +
        (enmarcado
          ? " border:1px solid var(--lmath-borde); border-radius:12px; " +
            "background:var(--lmath-superficie);"
          : "");

      // Área scrolleable (hereda el tamaño de fuente KaTeX por la clase). Centra la
      // fórmula si cabe y la vuelve totalmente scrolleable si desborda (`safe center`).
      // En caja enmarcada se recorta el padding vertical para dejar más alto útil. Llena
      // el marco (`height:100%`): el marco tiene siempre alto DEFINIDO (flex o `calc`),
      // así el interior —padding, centrado, scroll— es idéntico con una o varias tarjetas.
      const area = marco.createDiv({ cls: "lmath-latex" });
      // `safe center` TAMBIÉN en vertical: si la fórmula desborda a lo alto (gana
      // scroll-Y), el inicio queda alcanzable en vez de recortado por el centrado.
      area.style.cssText =
        "width:100%; height:100%; box-sizing:border-box; " +
        `padding:${enmarcado ? "8px 24px" : "24px"}; ` +
        "display:flex; align-items:safe center; justify-content:safe center; " +
        "overflow-x:hidden; overflow-y:hidden;";
      area.setCssStyles({ scrollbarWidth: "thin", scrollbarColor: "var(--lmath-borde) transparent" });

      // Overlay de fade: HERMANO del área (un absolute dentro del scroller viajaría con
      // el contenido). Se ciñe al marco redondeado con el mismo recorte.
      const fadeOverlay = marco.createDiv();
      fadeOverlay.style.cssText =
        "position:absolute; inset:0; pointer-events:none; overflow:hidden; " +
        (enmarcado ? "border-radius:12px;" : "");
      const fadeColor = "var(--lmath-superficie)";
      const fadeIzq = fadeOverlay.createDiv();
      fadeIzq.style.cssText =
        "position:absolute; top:0; bottom:0; left:0; width:32px; opacity:0; " +
        "transition:opacity 0.15s ease; " +
        `background:linear-gradient(to right, ${fadeColor}, transparent);`;
      const fadeDer = fadeOverlay.createDiv();
      fadeDer.style.cssText =
        "position:absolute; top:0; bottom:0; right:0; width:32px; opacity:0; " +
        "transition:opacity 0.15s ease; " +
        `background:linear-gradient(to left, ${fadeColor}, transparent);`;

      // Visibilidad de los fades según la posición de scroll (sin desbordar → ninguno;
      // scrollLeft 0 → solo derecho; intermedio → ambos; máximo → solo izquierdo).
      const actualizarFade = () => {
        const max = area.scrollWidth - area.clientWidth;
        const desborda = max > TOLERANCIA_SCROLL;
        // La barra horizontal consume alto, no ancho: alternar overflow-x no altera
        // clientWidth ni provoca oscilación.
        area.style.overflowX = desborda ? "auto" : "hidden";
        const sl = area.scrollLeft;
        fadeIzq.style.opacity = desborda && sl > 0 ? "1" : "0";
        fadeDer.style.opacity = desborda && sl < max - 1 ? "1" : "0";
      };
      area.addEventListener("scroll", actualizarFade);

      // Alto de la tarjeta ÚNICA con UMBRAL: mientras la fórmula CABE en el mínimo (una
      // integral, una derivada, un despeje corto) la tarjeta se queda en `ALTO_TARJETA` —no se
      // agranda ni saca barra—; solo cuando el contenido SUPERA ese mínimo se ajusta hacia
      // arriba (crece con el contenido hasta `ALTO_TARJETA_MAX`). Si ni el techo alcanza, el
      // área gana su propio scroll vertical, con el contenido centrado (`safe center`). Las
      // tarjetas del par "ambas" NO crecen (reparten la columna): solo su scroll independiente.
      const ajustarAlto = () => {
        if (llenar()) {
          // Reparte la columna: el alto lo pone el flex, no nosotros. Se BORRA el alto en
          // línea que hubiera puesto la rama de abajo, o al girar a flotante la tarjeta se
          // quedaría clavada en el alto de ranura dentro de un panel de otra medida.
          marco.setCssStyles({ flex: "1 1 0", height: "" });
        } else {
          marco.setCssStyles({ flex: "0 0 auto" });
          // Se mide el alto INTRÍNSECO del CONTENIDO (el hijo renderizado), NO `area.scrollHeight`.
          // `scrollHeight` nunca baja de `clientHeight`, así que al fijar el alto del marco —que
          // agranda el área— la siguiente medición salía mayor y realimentaba: el marco se disparaba
          // hasta el techo y quedaba ATASCADO ahí (el bug al reactivar el plugin: KaTeX medía alto
          // con la fuente de reserva, cruzaba el umbral y arrancaba el bucle, sin volver atrás). El
          // hijo NO se estira (`safe center`, no `stretch`): su alto es el del contenido, INDEPENDIENTE
          // del de la tarjeta, así que la medición es estable y el crecimiento, reversible.
          const hijo = area.firstElementChild as HTMLElement | null;
          const padV = enmarcado ? 16 : 48;          // padding vertical del área (8+8 / 24+24)
          const necesario = (hijo?.scrollHeight ?? 0) + padV + 2;   // + padding y bordes del marco
          const alto = necesario > ALTO_TARJETA + TOLERANCIA_SCROLL
            ? Math.min(ALTO_TARJETA_MAX, necesario)   // supera el mínimo → altura dinámica
            : ALTO_TARJETA;                           // cabe → se queda en el mínimo
          marco.style.height = `${alto}px`;
        }
        area.style.overflowY =
          area.scrollHeight - area.clientHeight > TOLERANCIA_SCROLL ? "auto" : "hidden";
      };
      // Refresco completo (alto + fades): para el render inicial, el resize y el
      // ResizeObserver. El listener de scroll queda SOLO con los fades (recalcular el
      // alto en cada tick de scroll forzaría reflow sin necesidad: el tamaño no cambia).
      const refrescar = () => { ajustarAlto(); actualizarFade(); };

      // Rueda del ratón sobre la fórmula → scroll horizontal directo, limitado a ±40px
      // por tick (≈ un clic en las flechas de la scrollbar nativa).
      const onWheel = (e: WheelEvent) => {
        if (area.scrollWidth - area.clientWidth <= TOLERANCIA_SCROLL) return;
        e.preventDefault();
        const desplazamiento = e.deltaY + e.deltaX;
        area.scrollLeft += Math.max(-40, Math.min(40, desplazamiento));
      };
      area.addEventListener("wheel", onWheel, { passive: false });

      // El layout de KaTeX no está medido hasta el siguiente frame; se recalcula al
      // cambiar el tamaño de la ventana y cuando las fuentes asíncronas de KaTeX
      // reajustan el ancho real (ResizeObserver).
      window.addEventListener("resize", refrescar);
      const observador = new ResizeObserver(() => refrescar());
      observador.observe(area);
      const soltar = () => {
        window.removeEventListener("resize", refrescar);
        observador.disconnect();
      };
      return { area, actualizarFade: refrescar, soltar };
    };

    // Áreas de la vista actual y su liberación diferida (se sueltan al re-renderizar
    // o al destruir el bloque). Arranca como no-op: el primer render no tiene qué soltar.
    let soltarAreas: () => void = () => {};
    limpieza.register(() => soltarAreas());

    // Renderiza uno o varios LaTeX: suelta las áreas previas, limpia la zona y crea una
    // TARJETA enmarcada por fórmula (regla "una expresión = una tarjeta", igual con una o
    // con varias). La zona reserva SIEMPRE los mismos márgenes —el borde superior para la
    // barra de toggle (evita que la primera tarjeta corra por detrás) y un hueco lateral
    // e inferior para que las cajas floten dentro del panel—, así una sola fórmula queda
    // colocada IGUAL en todos los bloques (consistencia visual) y varias ("ambas") se
    // separan con `gap`. La barra de toggle es opcional: sin ella (obs-graph sin
    // transformaciones) el margen superior es solo aire uniforme, coherente con el resto.
    // VARIAS tarjetas se reparten la altura (`compartirAlto`, sin crecer, con scroll propio si
    // no caben); una sola arranca en el alto de ranura y CRECE con su contenido cuando lo supera
    // (altura dinámica hasta `ALTO_TARJETA_MAX`; una fórmula que cabe se queda en el mínimo).
    const renderLatex = async (latex: string | readonly string[]) => {
      soltarAreas();
      zona.empty();
      const formulas = typeof latex === "string" ? [latex] : latex;
      const compartirAlto = formulas.length > 1;
      // La geometría de la zona (márgenes y alineación) depende de si las tarjetas llenan la
      // columna, y eso lo deciden DOS cosas: cuántas fórmulas hay —que se sabe aquí— y el
      // reparto vigente —que puede cambiar después, al girar—. Se anota lo primero y se
      // delega en la función común, que es también la que vuelve a correr al cambiar el panel.
      formulasVisibles = formulas.length;
      aplicarGeometriaZona();

      const areas: Array<{ area: HTMLElement; actualizarFade: () => void }> = [];
      const disposers: Array<() => void> = [];
      for (const formula of formulas) {
        const a = crearArea(zona, "enmarcado", compartirAlto);
        areas.push(a);
        disposers.push(a.soltar);
        await MarkdownRenderer.render(
          this.plugin.app, "$$" + formula + "$$", a.area, ctx.sourcePath, limpieza
        );
        a.area.scrollLeft = 0;
      }
      soltarAreas = () => disposers.forEach((d) => d());
      // Tras medir el layout (rAF): recalcula alto/fades y CENTRA el scroll vertical. Si la
      // fórmula desborda (una tarjeta del par "ambas" con un operador alto), el thumb queda a
      // media altura —el contenido se ve centrado y se sube/baja por igual— en vez de arrancar
      // pegado arriba (`scrollTop = 0`). El horizontal ya arranca en 0 (lectura de izq. a der.).
      window.requestAnimationFrame(() =>
        areas.forEach((a) => {
          a.actualizarFade();
          const maxY = a.area.scrollHeight - a.area.clientHeight;
          if (maxY > TOLERANCIA_SCROLL) a.area.scrollTop = maxY / 2;
        })
      );
    };

    return { panelLatex, renderLatex };
  }

  /** Resaltado compartido (color, fondo, borde, sombra) de los botones de la barra del
   *  panel según estén ACTIVOS (resaltado) o no (atenuado). Lo comparten el botón de
   *  texto (`estiloBotonPanel`) y el botón-icono de opciones (`estiloBotonOpciones`). */
  private chromeBotonPanel(activo: boolean): string {
    return activo
      ? "color:var(--lmath-texto); background:var(--lmath-chip-activo); " +
        "border:1px solid var(--lmath-borde-activo); box-shadow:var(--lmath-sombra);"
      : "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
        "border:1px solid var(--lmath-borde); box-shadow:var(--lmath-sombra);";
  }

  /** Estilo compartido de los botones de TEXTO de la barra (Original, Derivada): activo =
   *  resaltado; inactivo = atenuado. Texto en Lora. */
  private estiloBotonPanel(b: HTMLElement, activo: boolean): void {
    b.style.cssText =
      "pointer-events:auto; padding:3px 10px; font-size:11px; line-height:1.15; " +
      "cursor:pointer; user-select:none; border-radius:8px; white-space:nowrap; " +
      "font-family:\"Lora\", var(--font-interface); " +
      "transition:background 0.12s ease, color 0.12s ease; " +
      this.chromeBotonPanel(activo);
  }

  /** Estilo del botón-icono de menú que abre las opciones: CUADRADO de esquinas suaves,
   *  mismo resaltado activo/inactivo que los de texto. El icono usa `fill:currentColor`, así
   *  que sigue el color del botón (se aviva al activarse). */
  private estiloBotonOpciones(b: HTMLElement, activo: boolean): void {
    b.style.cssText =
      "pointer-events:auto; box-sizing:border-box; width:26px; height:22px; " +
      "display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; " +
      "cursor:pointer; user-select:none; border-radius:7px; " +
      "transition:background 0.12s ease, color 0.12s ease; " +
      this.chromeBotonPanel(activo);
  }

  /**
   * Chip ⓘ de la esquina inferior derecha del plano. Los tres bloques que lo tienen (resumen
   * de una explícita, resumen geométrico y soluciones del sistema) son excluyentes entre sí y
   * comparten sitio, tamaño y acento: un único estilo evita que se separen al retocar uno.
   */
  private estiloChipInfo(lado: number): string {
    return `position:absolute; bottom:8px; right:8px; width:${lado}px; height:${lado}px; ` +
      "display:flex; align-items:center; justify-content:center; line-height:1; " +
      "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
      "border:1px solid var(--lmath-acento-borde); border-radius:50%; cursor:pointer; " +
      "user-select:none; z-index:5;";
  }

  /**
   * Popover del ⓘ: se abre HACIA ARRIBA desde su chip, así que su borde inferior sube con la
   * fila de chips. Los topes son relativos al PLANO (`min(...)` contra el 100%): en el móvil
   * el plano mide ~321×263 y un cuadro de 260×200 anclado abajo se saldría por arriba en
   * cuanto el chip creciera; en escritorio el plano es mayor y los topes fijos siguen mandando.
   */
  private estiloPopoverInfo(lado: number): string {
    const bajo = 8 + lado + 6;
    return `position:absolute; bottom:${bajo}px; right:8px; display:none; ` +
      "max-width:min(260px, calc(100% - 16px)); " +
      `max-height:min(200px, calc(100% - ${bajo + 8}px)); ` +
      "overflow-y:auto; padding:8px 10px; box-sizing:border-box; " +
      "background:var(--lmath-panel); border:1px solid var(--lmath-borde); " +
      "border-radius:6px; font-size:11px; line-height:1.5; " +
      "color:var(--lmath-texto); z-index:5; box-shadow:var(--lmath-sombra-flotante);";
  }

  /**
   * Deslizador propio, hecho con dos `div` en vez de un `<input type="range">`.
   *
   * Se intentó dos veces con el control nativo y las dos se quedó la manija descolocada. El
   * motivo es estructural, no un descuido: la manija y la pista de un `range` son
   * PSEUDOELEMENTOS (`::-webkit-slider-thumb`), no nodos del DOM, así que no se pueden estilar en
   * línea y hay que ganarle la especificidad a `app.css` de Obsidian desde una hoja que además
   * solo se relee al recargar el plugin. Y encima WebKit alinea la manija con el borde SUPERIOR
   * de la pista, de modo que centrarla exige un `margin-top` calculado a partir de un alto de
   * pista que cualquiera puede cambiar por debajo.
   *
   * Con dos divs no hay nada que negociar: `top:50%` + `translateY(-50%)` centra por definición,
   * el estilo va en línea y gana siempre, y de paso el control queda a la misma altura que el
   * resto del cromo de este motor, que también se estila así.
   *
   * Lo que el control nativo daba gratis y aquí hay que poner a mano —y se pone— es el teclado y
   * la semántica: `role="slider"`, `aria-valuemin/max/now`, foco visible y las flechas. Un mando
   * que solo responde al ratón no es un mando, es un adorno.
   */
  private montarDeslizador(
    padre: HTMLElement,
    op: {
      min: number;
      max: number;
      valor: number;
      /** Nombre accesible (el del ángulo que gobierna). */
      etiqueta: string;
      /** Salto de las flechas, y de Shift+flecha. En las unidades de `min`/`max`. */
      paso: number;
      pasoGrande: number;
      /** Se llama con el valor ya redondeado al paso. */
      alCambiar: (valor: number) => void;
    }
  ): { fijarValor: (valor: number) => void } {
    const LADO = 14;   // diámetro de la manija y alto de la caja
    const raiz = padre.createDiv();
    raiz.tabIndex = 0;
    raiz.setAttribute("role", "slider");
    raiz.setAttribute("aria-label", op.etiqueta);
    raiz.setAttribute("aria-valuemin", String(op.min));
    raiz.setAttribute("aria-valuemax", String(op.max));
    raiz.style.cssText =
      `position:relative; width:100%; height:${LADO}px; flex:0 0 auto; ` +
      // El dedo sobre el deslizador lo mueve; sin esto, el navegador se queda el gesto para
      // desplazar la nota y el mando no responde en el móvil, que es donde más se usa.
      "touch-action:none; cursor:pointer; outline:none; user-select:none;";

    const linea = raiz.createDiv();
    linea.style.cssText =
      "position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); " +
      "height:4px; border-radius:3px; background:var(--lmath-borde); pointer-events:none;";

    const manija = raiz.createDiv();
    manija.style.cssText =
      `position:absolute; top:50%; transform:translateY(-50%); width:${LADO}px; ` +
      `height:${LADO}px; border-radius:50%; background:var(--lmath-acento); ` +
      "pointer-events:none;";

    let valor = op.valor;
    const acotar = (v: number) => Math.max(op.min, Math.min(op.max, v));

    /** Coloca la manija sin redondear: al arrastrar el círculo, el ángulo es fraccionario. */
    const fijarValor = (v: number) => {
      valor = acotar(v);
      const u = op.max === op.min ? 0 : (valor - op.min) / (op.max - op.min);
      // El recorrido útil es el ancho MENOS la manija, así que en los extremos no se sale de la
      // caja. Se escribe con `calc` para no tener que medir el ancho en cada refresco.
      manija.style.left = `calc(${u * 100}% - ${u * LADO}px)`;
      raiz.setAttribute("aria-valuenow", String(Math.round(valor)));
    };
    fijarValor(op.valor);

    const emitir = (v: number) => {
      const redondeado = Math.round(acotar(v) / op.paso) * op.paso;
      fijarValor(redondeado);
      op.alCambiar(redondeado);
    };

    /** Valor bajo el puntero, midiendo sobre el mismo recorrido útil que usa `fijarValor`. */
    const valorEn = (clientX: number): number => {
      const caja = raiz.getBoundingClientRect();
      const util = Math.max(1, caja.width - LADO);
      const u = (clientX - caja.left - LADO / 2) / util;
      return op.min + Math.max(0, Math.min(1, u)) * (op.max - op.min);
    };

    let arrastrando = false;
    raiz.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      arrastrando = true;
      raiz.setPointerCapture(ev.pointerId);
      raiz.focus();
      emitir(valorEn(ev.clientX));
    });
    raiz.addEventListener("pointermove", (ev) => {
      if (arrastrando) emitir(valorEn(ev.clientX));
    });
    const soltar = (ev: PointerEvent) => {
      if (!arrastrando) return;
      arrastrando = false;
      if (raiz.hasPointerCapture?.(ev.pointerId)) raiz.releasePointerCapture(ev.pointerId);
    };
    raiz.addEventListener("pointerup", soltar);
    raiz.addEventListener("pointercancel", soltar);

    raiz.addEventListener("keydown", (ev) => {
      const salto = ev.shiftKey ? op.pasoGrande : op.paso;
      let nuevo: number | null = null;
      if (ev.key === "ArrowRight" || ev.key === "ArrowUp") nuevo = valor + salto;
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") nuevo = valor - salto;
      else if (ev.key === "Home") nuevo = op.min;
      else if (ev.key === "End") nuevo = op.max;
      if (nuevo === null) return;
      ev.preventDefault();
      emitir(nuevo);
    });

    // Anillo de foco en línea, como todo lo demás: si dependiera de la hoja de estilos, un
    // control que solo se puede usar con el teclado se quedaría sin la única pista de dónde está.
    raiz.addEventListener("focus", () => {
      raiz.style.outline = "2px solid var(--lmath-acento)";
      raiz.style.outlineOffset = "3px";
    });
    raiz.addEventListener("blur", () => { raiz.style.outline = "none"; });

    return { fijarValor };
  }

  /** Tooltip ÚNICO y consistente para los controles del motor: el de Obsidian (oscuro),
   *  anclado ARRIBA para que el cursor no lo tape. Usa `setTooltip` (API de Obsidian), que NO
   *  pone `title` → sin el tooltip NATIVO del navegador que antes lo duplicaba. */
  private ponerTooltip(el: HTMLElement, texto: string): void {
    setTooltip(el, texto, { placement: "top" });
  }

  /** Crea el botón-icono de opciones dentro de la barra dada y lo devuelve. Reemplaza al
   *  antiguo "Opciones ▾"; común a los tres bloques. `titulo` es su tooltip CERRADO (lo que
   *  despliega, distinto en cada bloque). El icono (☰/✕) lo pone `iconoBotonOpciones`; el
   *  resaltado, `estiloBotonOpciones` (ambos en cada `sincronizar`). */
  private crearBotonOpciones(barra: HTMLElement, titulo: string): HTMLElement {
    const b = barra.createDiv();
    this.iconoBotonOpciones(b, false, titulo);
    return b;
  }

  /** Pone en el botón de opciones el glifo que corresponde a su estado: ☰ cuando el menú
   *  está CERRADO (pulsar abre) y ✕ cuando está ABIERTO (pulsar cierra), con el tooltip
   *  describiendo esa acción —`titulo` es el del estado cerrado—. `sincronizar` lo llama en
   *  cada clic, así que solo repinta cuando el glifo CAMBIA (`dataset.icono` = el actual). */
  private iconoBotonOpciones(b: HTMLElement, abierto: boolean, titulo: string): void {
    const nombre = abierto ? "cerrar" : "menu";
    if (b.dataset.icono === nombre) return;
    b.dataset.icono = nombre;
    b.empty();
    this.montarIcono(b, nombre, 18);
    this.ponerTooltip(b, abierto ? t().botones.cerrarMenu : titulo);
  }

  /** Pinta un icono de `ICONO` (lado `px`) como <svg> hijo de `el`, heredando el color vía
   *  `fill:currentColor`. Sin `innerHTML`: usa la API DOM de Obsidian (createSvg). */
  private montarIcono(el: HTMLElement, nombre: keyof typeof ICONO, px: number): void {
    const svg = el.createSvg("svg", {
      attr: { viewBox: "0 -960 960 960", width: px, height: px, fill: "currentColor" },
    });
    svg.createSvg("path", { attr: { d: ICONO[nombre] } });
  }

  /**
   * Pinta el glifo de una unidad (DEG / RAD / GRAD) ajustado A LO ANCHO de `px`.
   *
   * No pasa por `montarIcono` porque estos glifos no son cuadrados: se les da el ancho y el alto
   * sale de su propia caja, así que la palabra ocupa todo el diámetro del chip en vez de dos
   * tercios. Es lo que la deja del mismo cuerpo que el texto que había antes en ese botón; con el
   * factor 0,66 del resto de iconos se quedaría en cuatro píxeles de alto.
   */
  private montarGlifoUnidad(el: HTMLElement, unidad: UnidadTrig, px: number): void {
    const { caja, d } = GLIFO_UNIDAD[unidad];
    const [, , ancho, alto] = caja.split(" ").map(Number);
    const svg = el.createSvg("svg", {
      attr: {
        viewBox: caja, width: px, height: Math.round((px * alto) / ancho), fill: "currentColor",
      },
    });
    svg.createSvg("path", { attr: { d } });
  }

  /** Renderiza LaTeX INLINE como ETIQUETA de un botón/opción del toggle (glifo matemático
   *  en vez de texto): limpia `el`, pinta `$tex$` con KaTeX (mismo pipeline que el panel) y
   *  desenvuelve el `<p>` para que quede en línea. El color lo hereda del botón (KaTeX no
   *  fuerza color), así sigue el resaltado activo/inactivo. Async (no bloquea el montaje). */
  private montarEtiquetaMath(
    el: HTMLElement, tex: string, ctx: MarkdownPostProcessorContext
  ): void {
    el.empty();
    // Lifecycle propio atado al bloque (via ctx): NUNCA el plugin como componente
    // (su vida es demasiado larga → fuga). Obsidian lo descarga al quitar el bloque.
    const hijo = new MarkdownRenderChild(el);
    ctx.addChild(hijo);
    void MarkdownRenderer.render(this.plugin.app, `$${tex}$`, el, ctx.sourcePath, hijo)
      .then(() => {
        const p = el.querySelector("p");
        if (p) { while (p.firstChild) el.appendChild(p.firstChild); p.remove(); }
      });
  }

  /**
   * Aplica las transformaciones AUTOMÁTICAS activas (ajustes del plugin) al bloque, en el
   * orden formal despejar → simplificar, y devuelve el resultado que el panel muestra por
   * defecto. Reutiliza el MISMO pipeline que los botones (despejarEcuaciones/
   * simplificarEcuaciones): sin lógica duplicada. Si una transformación FALLA (lanza), se
   * conserva el resultado anterior —nunca rompe el render—.
   */
  private baseAutomatica(
    ecuaciones: readonly string[],
    ajustes: AjustesTransformaciones
  ): readonly string[] {
    let base: readonly string[] = ecuaciones;
    if (ajustes.despejarAuto) {
      try { base = despejarEcuaciones(base); } catch { /* conserva el resultado anterior */ }
    }
    // La simplificación es SIEMPRE automática (no configurable): todo bloque se muestra ya
    // simplificado/expandido, sin botón. Va tras el despeje (orden formal despejar → simplificar).
    try { base = simplificarEcuaciones(base); } catch { /* conserva el resultado anterior */ }
    return base;
  }

  /**
   * Bloque obs-trig: el círculo trigonométrico. Camino propio y completo, sin `Camara`, sin
   * `Escena` y sin proveedores de geometría: aquí no hay curva que muestrear, sino una figura
   * analítica que se redibuja entera en cada cambio de caja (unas decenas de puntos: el bloque
   * más barato del plugin). Lo que sí comparte con los demás es el marco —contenedor, panel de
   * la fórmula con KaTeX, reparto en columnas o flotante, paleta y ciclo de vida—, que es
   * justamente lo que hace que se vea como parte de LMath y no como un widget aparte.
   */
  private async procesarTrig(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    const contenedor = el.createDiv({ cls: "lmath-container" });
    const limpieza = new MarkdownRenderChild(contenedor);
    ctx.addChild(limpieza);

    // Mismo montaje oculto que el resto de bloques: el panel pasa por KaTeX y hay que esperarlo,
    // y en ese hueco el navegador pintaría un bloque a medias. Ver la nota larga en `process`.
    const revelar = () => contenedor.setCssStyles({ visibility: "visible" });
    contenedor.setCssStyles({ visibility: "hidden" });
    const redDeSeguridad = window.setTimeout(revelar, 2000);
    limpieza.register(() => window.clearTimeout(redDeSeguridad));

    const bloque = parsearBloqueTrig(source);
    // ── Estado del ángulo: CRUDO vs MOSTRADO ─────────────────────────────────────────────
    // El arrastre acumula sobre el crudo y el imán se aplica al mostrarlo. Si el imán escribiera
    // sobre el mismo número que acumula, el punto se quedaría PEGADO al notable: cada
    // movimiento partiría del valor ya imantado y el pequeño avance del dedo volvería a caer
    // dentro de la tolerancia. Con dos números, el dedo sigue avanzando por debajo y el punto
    // se despega en cuanto sale del radio del imán.
    const crudos = bloque.angulos.map((a) => a.radianes);
    const mostrados = [...crudos];
    const modelos = mostrados.map((r) => modeloDeAngulo(r));
    let activo = 0;
    // El bloque NO se configura: solo lleva ángulos. Todo lo elegible sale de los ajustes del
    // plugin —que es donde se elige una vez, y no en cada nota— y de los controles del propio
    // bloque.
    const ajustesTrig = this.obtenerAjustes();
    const imanActivo = ajustesTrig.imanTrig;
    // Unidad de PRESENTACIÓN. Mutable porque el chip DEG/RAD/GRAD la recorre en vivo; lo que nunca
    // cambia es cómo se leyó la fuente, que ya está resuelta en `crudos`.
    let unidad: UnidadTrig = ajustesTrig.unidadAngulo;
    // DERECHO a valores exactos, por ángulo. Al leer el bloque lo da la forma ESCRITA; a partir
    // de ahí lo dan los controles del propio bloque, porque de un ángulo que hemos calculado
    // nosotros —el imán, un paso de teclado— sabemos exactamente de dónde sale su número. Lo
    // único que nunca lo gana es un decimal tecleado a mano, que es justo lo que la regla
    // protege: `0.5236` no puede presumir de seno 1/2.
    const derechoExacto = bloque.angulos.map((a) => a.simbolico);

    // ── El DOMINIO del ángulo, uno solo para los tres mandos ──────────────────────────────
    // El arrastre, el teclado y el deslizador escriben el MISMO número, así que tienen que poder
    // representar los mismos valores. Antes no era así: el deslizador iba de −360 a 360 y el
    // arrastre acumulaba sin techo, de modo que unas cuantas vueltas con el dedo dejaban la
    // manija clavada en el extremo mientras la lectura decía 12270°. Dos mandos para un número,
    // y uno incapaz de decir lo que decía el otro.
    //
    // El techo lo pone el recorrido del deslizador —una vuelta a cada lado, ensanchada si el
    // bloque ESCRIBE algo mayor—, así que un `θ = 750°` sigue siendo alcanzable con el dedo. Lo
    // que ya no se puede es girar indefinidamente: una vuelta entera en cada sentido es lo que
    // hace falta para enseñar que 390° y 30° son el mismo punto, y treinta y cuatro no enseñan
    // nada que no enseñe una. La regla vive en `interaccionTrig.acotarARecorrido`, junto a la
    // función que define el recorrido.
    const gradosEscritos = bloque.angulos.map((a) => aGrados(a.radianes));
    const recorrido = rangoDeslizador(gradosEscritos);

    /** Fija el ángulo del activo: acumula en el crudo, acotado, y deriva el mostrado. */
    const fijarAngulo = (crudo: number, conIman: boolean): void => {
      const acotado = acotarARecorrido(crudo, recorrido);
      crudos[activo] = acotado;
      mostrados[activo] = conIman ? imantar(acotado) : acotado;
      modelos[activo] = modeloDeAngulo(mostrados[activo]);
      derechoExacto[activo] = true;
    };
    const tactil = esTactil();
    const reparto: Reparto = {
      estrecho: false, abierto: false, panel: null, ladoChip: ladoChip(tactil),
    };

    // ── Panel de CONTROL ──────────────────────────────────────────────────────────────────
    // obs-trig NO usa `crearScrollerLatex`, el panel de fórmula de los otros cuatro bloques. Allí
    // la tarjeta muestra el CONTENIDO del bloque —`y = x²` no está escrito en ningún otro sitio—;
    // aquí el contenido es un ángulo, y ese número ya sale en la esquina del plano. Una tarjeta
    // que repite el dato más visible del bloque no se gana el sitio.
    //
    // Así que el panel deja de ser un escaparate y pasa a ser la superficie de control, en tres
    // franjas: la ECUACIÓN de la figura (fija, y lo único que de verdad pide tipografía
    // matemática), la LECTURA de valores (viva) y el MANDO del ángulo (el deslizador). Se
    // construye aparte a propósito: tocar el scroller compartido pondría en riesgo cuatro
    // bloques ya publicados para arreglar uno que aún no lo está.
    const panelTrig = contenedor.createDiv({ cls: "lmath-latex" });
    reparto.panel = panelTrig;
    reparto.huecoInferior = ALTO_CONTROLES_TRIG;
    aplicarCajaPanel(reparto);
    const columna = panelTrig.createDiv();
    columna.style.cssText =
      "position:absolute; inset:0; display:flex; flex-direction:column; gap:9px; " +
      "padding:13px 14px; box-sizing:border-box; overflow:hidden; " +
      // La clase `lmath-latex` fija 24px para que KaTeX escale la fórmula; aquí dentro manda
      // el texto de la interfaz y hay que devolverlo a un tamaño normal.
      "font-size:12px; line-height:1.45; color:var(--lmath-texto);";

    // ── Tarjeta: ANCLA + INSTANCIA ────────────────────────────────────────────────────────
    // Arriba la ley que define la figura, que no se mueve nunca; debajo el punto concreto que
    // la cumple ahora mismo. No son dos cosas apiladas: el punto de abajo es una solución de la
    // ecuación de arriba, y verlo recorrer la circunferencia mientras la ecuación no se inmuta
    // es lo que hay que enseñar de un lugar geométrico. Además, un renglón fijo encima de uno
    // vivo da al ojo la referencia contra la que percibir el cambio; si todo se mueve, nada
    // destaca.
    const tarjeta = columna.createDiv();
    tarjeta.style.cssText =
      "flex:0 0 auto; border:1px solid var(--lmath-borde); border-radius:12px; " +
      "background:var(--lmath-superficie); padding:9px 10px; text-align:center;";
    // La ecuación SÍ pasa por KaTeX: es lo único de este panel que no cambia, así que se
    // renderiza una vez y se queda. Lo vivo va en texto plano por debajo (ver `actualizarPanel`).
    this.montarEtiquetaMath(tarjeta.createDiv(), "x^2 + y^2 = 1", ctx);
    const puntoVivo = tarjeta.createDiv();
    puntoVivo.style.cssText =
      "margin-top:7px; padding-top:7px; border-top:1px solid var(--lmath-borde); " +
      "font-size:11.5px; line-height:1.35; color:var(--lmath-texto-tenue);";

    // ── Lectura: la tabla de las tres razones, o la elegida en grande ─────────────────────
    const lectura = columna.createDiv();
    lectura.style.cssText = "flex:1 1 auto; min-height:0; overflow:hidden;";

    // ── Controles ────────────────────────────────────────────────────────────────────────
    // Se crean aquí para que queden en el sitio correcto del árbol, y se RELLENAN más abajo,
    // cuando ya existe `pintar`. En estrecho se mudan al pie del plano (ver `aplicarReparto`):
    // el panel se esconde detrás del botón f(x), y dejar el deslizador ahí dentro lo escondería
    // justo en el dispositivo donde más falta hace, porque arrastrar con el dedo sobre un
    // círculo de 300px es impreciso.
    const controles = columna.createDiv();

    // Avisos del parser, redactados aquí: el parser los produce sin traducir (tipo + fragmento
    // culpable) y el idioma vive en el host. Van en el panel y no sobre el plano porque son un
    // problema de lo ESCRITO, y el panel es donde está lo escrito. Y van EN EL FLUJO, justo bajo
    // la tarjeta: flotando al pie caerían encima del deslizador, y un aviso que tapa un control
    // es peor que el error del que avisa.
    if (bloque.avisos.length > 0) {
      const tira = columna.createDiv();
      columna.insertBefore(tira, lectura);
      tira.style.cssText =
        "flex:0 0 auto; display:flex; flex-direction:column; gap:2px; " +
        "font-size:10px; line-height:1.3; text-align:center; color:var(--lmath-aviso);";
      const redactar = (a: AvisoTrig): string => t().trig.anguloNoValido(a.texto);
      // Tope de lectura: una lista que hay que desplazar no se lee de un vistazo, y el panel
      // tiene 261px. A partir de ahí se resume, igual que hacen las listas del ⓘ.
      const MAX = 3;
      for (const a of bloque.avisos.slice(0, MAX)) tira.createDiv({ text: redactar(a) });
      if (bloque.avisos.length > MAX) {
        tira.createDiv({ text: `+${bloque.avisos.length - MAX}` });
      }
    }
    const wrap = contenedor.createDiv({ cls: "lmath-grafica" });
    wrap.style.cssText = `position:relative; width:100%; height:${ALTO_PANEL}px;`;

    // Reparto por ancho, igual que el resto: en estrecho el panel flota sobre el plano y este se
    // queda la fila entera. Aquí el plano es CUADRADO en flotante —la figura es un círculo, y
    // darle una caja apaisada solo dejaría aire a los lados—.
    let anchoAplicado = -1;
    const aplicarReparto = () => {
      const ancho = contenedor.clientWidth;
      if (ancho <= 0) return;
      const estrecho = ancho < ANCHO_MINIMO_COLUMNAS;
      if (estrecho === reparto.estrecho && ancho === anchoAplicado) return;
      anchoAplicado = ancho;
      reparto.estrecho = estrecho;
      if (!estrecho) reparto.abierto = false;
      contenedor.toggleClass("lmath-estrecho", estrecho);
      aplicarCajaPanel(reparto);
      sincronizarBotonFormula();
      wrap.style.height = estrecho ? `${ancho}px` : `${ALTO_PANEL}px`;

      // Los CONTROLES cambian de padre al cruzar el umbral. Es la única parte del panel que no
      // puede esconderse detrás del botón f(x): en estrecho el panel está cerrado por defecto, y
      // un deslizador que hay que destapar no sirve de nada justo donde el arrastre es más
      // impreciso. Así que en estrecho se mudan al pie del plano, que ahí sí está siempre a la
      // vista, y el lienzo les cede su alto.
      if (estrecho) {
        wrap.append(controles);
        controles.style.cssText =
          `position:absolute; left:0; right:0; bottom:0; height:${ALTO_CONTROLES_TRIG}px; ` +
          "box-sizing:border-box; padding:9px 12px; z-index:5; " +
          "display:flex; flex-direction:column; gap:7px; " +
          "border-top:1px solid var(--lmath-borde); background:var(--lmath-superficie);";
      } else {
        columna.append(controles);
        controles.style.cssText =
          "margin-top:auto; flex:0 0 auto; display:flex; flex-direction:column; gap:7px;";
      }
      // El lienzo cede el alto de la franja, y los chips de abajo suben por encima de ella.
      if (lienzoColocado) lienzoColocado(estrecho);
    };
    // La asigna el botón f(x) al montarse, más abajo; hasta entonces no hay nada que sincronizar.
    let sincronizarBotonFormula: () => void = () => { /* aún no hay botón */ };
    // La asignan el lienzo y los chips inferiores en cuanto existen.
    let lienzoColocado: ((estrecho: boolean) => void) | null = null;
    aplicarReparto();

    const canvas = wrap.createEl("canvas");
    canvas.setCssStyles({
      position: "absolute", top: "0", left: "0", width: "100%", height: "100%",
      // El dedo sobre el lienzo mueve el ÁNGULO, así que el navegador no se queda ningún gesto
      // que empiece aquí. Igual que en los demás bloques: lo que empieza fuera del lienzo sigue
      // desplazando la nota con normalidad.
      touchAction: "none",
    });
    // Chips que viven pegados al borde INFERIOR del plano. En estrecho suben por encima de la
    // franja de controles; si no, el deslizador quedaría debajo de ellos y sería intocable.
    const anclajesAbajo: Array<{ el: HTMLElement; base: number }> = [];
    const chipsAbajo = {
      push: (el: HTMLElement) => anclajesAbajo.push({ el, base: 8 }),
    };
    /** Píxeles desde el borde inferior del plano hasta donde empieza el cromo. */
    const sueloChips = () => 8 + (reparto.estrecho ? ALTO_CONTROLES_TRIG : 0);
    lienzoColocado = (estrecho: boolean) => {
      canvas.style.height = estrecho ? `calc(100% - ${ALTO_CONTROLES_TRIG}px)` : "100%";
      const extra = estrecho ? ALTO_CONTROLES_TRIG : 0;
      for (const { el, base } of anclajesAbajo) el.style.bottom = `${base + extra}px`;
    };
    lienzoColocado(reparto.estrecho);
    // Enfocable para que el teclado pueda conducir el ángulo. `Navegacion` no se monta en este
    // bloque —es todo carril y WASD—, así que las flechas están libres.
    canvas.tabIndex = 0;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      wrap.createEl("p", { text: t().canvasNoDisponible });
      revelar();
      return;
    }

    const colorDe = (i: number): string => {
      const c = colorCurva(i);
      return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3]})`;
    };

    // Componentes DIBUJADAS del ángulo activo. Vive en memoria: encender el seno es mirar, no
    // editar la nota, así que no se escribe en el bloque (misma regla que el arrastre).
    //
    // Es un conjunto y no una sola: seno y coseno juntos son el triángulo rectángulo inscrito, y
    // esa figura —la que explica de dónde salen las dos razones— no se puede enseñar de una en
    // una. Con dos trazos posibles a la vez, el color de cada uno deja de ser redundante.
    //
    // Abre VACÍO —la figura sola, que es su forma canónica— salvo que el bloque NOMBRE una razón:
    // un `sin(30)` abre con el seno ya trazado, porque quien escribe el nombre de una razón ya ha
    // dicho cuál quiere ver y hacérselo pulsar es pedirle que lo repita. Se mira el ángulo que
    // abre ACTIVO y no todos: las componentes son del activo, y sembrarlas desde otra línea
    // encendería un trazo que no corresponde a lo que se está dibujando.
    //
    // Es solo la semilla. En cuanto se toca una casilla el conjunto es del lector, y cambiar de
    // ángulo activo con `Tab` no vuelve a sembrar: una selección que se deshace sola al navegar
    // sería el mismo error que reescribir la nota al arrastrar.
    const componentes = new Set<ComponenteTrig>();
    const nombrada = bloque.angulos[activo].componente;
    if (nombrada) componentes.add(nombrada);

    let W = 0, Hcss = 0, dprPrev = 0;
    /** El encuadre vigente: centro y radio del círculo para la caja actual. */
    const disposicion = () => encuadreTrig(W, Hcss);
    const pintar = () => {
      // El tema se lee VIVO en cada pintado, como en el resto del plugin: cambiarlo es un
      // repintado, no una reconstrucción.
      fijarTemaPlano(esTemaOscuro(wrap));
      dibujarTrig(ctx2d, disposicion(), modelos, W, Hcss, {
        activo, colorDe, puedeExacto: derechoExacto[activo], unidad, componentes,
      });
      refrescarInfo();
      actualizarPanel();
    };
    // La rellena el bloque de los controles, más abajo.
    let actualizarPanel: () => void = () => { /* aún no hay panel que refrescar */ };
    // La rellena el popover ⓘ al montarse; hasta entonces, pintar no tiene a quién avisar.
    let refrescarInfo: () => void = () => { /* aún no hay panel ⓘ */ };
    // ¿Está corriendo la animación? Lo consulta el botón de play para saber qué icono poner y el
    // arrastre para detenerla, así que vive aquí arriba aunque el bucle se monte más abajo.
    let animando = false;
    // La rellena el bloque de la animación; el arrastre la usa para detenerla al agarrar.
    let detenerAnimacion: () => void = () => { /* aún no hay animación */ };
    const redimensionar = () => {
      const caja = canvas.getBoundingClientRect();
      const ancho = Math.max(1, Math.round(caja.width || wrap.clientWidth || 320));
      const alto = Math.max(1, Math.round(caja.height || ALTO_PANEL));
      const dpr = Math.ceil(window.devicePixelRatio || 1);
      if (ancho === W && alto === Hcss && dpr === dprPrev) return;
      W = ancho; Hcss = alto; dprPrev = dpr;
      canvas.width = ancho * dpr;
      canvas.height = alto * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      pintar();
    };
    redimensionar();

    const observador = new ResizeObserver(() => redimensionar());
    observador.observe(wrap);
    limpieza.register(() => observador.disconnect());
    const observadorReparto = new ResizeObserver(() => aplicarReparto());
    observadorReparto.observe(contenedor);
    limpieza.register(() => observadorReparto.disconnect());
    window.addEventListener("resize", redimensionar);
    limpieza.register(() => window.removeEventListener("resize", redimensionar));

    const refTema = this.plugin.app.workspace.on("css-change", () => pintar());
    limpieza.register(() => this.plugin.app.workspace.offref(refTema));

    // ── Arrastre del punto sobre la circunferencia ────────────────────────────────────────
    // UN grado de libertad: el punto no puede salirse del círculo, así que el gesto entero se
    // reduce al ángulo del puntero. El giro se ACUMULA (`deltaAngular`) en vez de asignarse:
    // así cruzar el 0 sigue sumando —de 350° se pasa a 370°, no a 10°— y se pueden dar vueltas
    // completas, que es lo que hace que la espiral del arco signifique algo.
    const agarrePx = tactil ? AGARRE_PX_TACTIL : AGARRE_PX;
    let arrastrando = false;
    let anguloPrevio = 0;
    const repintar = () => window.requestAnimationFrame(pintar);

    canvas.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const e = disposicion();
      if (!agarraCircunferencia(e, ev.offsetX, ev.offsetY, agarrePx)) return;
      detenerAnimacion();
      const ap = anguloDePuntero(e, ev.offsetX, ev.offsetY);
      // Con varios ángulos se agarra el MÁS CERCANO, que pasa a ser el activo: es el que se
      // dibuja por encima y el que gobierna la lectura y el panel.
      activo = indiceMasCercano(mostrados, ap);
      arrastrando = true;
      anguloPrevio = ap;
      canvas.setPointerCapture(ev.pointerId);
      canvas.setCssStyles({ cursor: "pointer" });
      canvas.focus();
      repintar();
    });

    canvas.addEventListener("pointermove", (ev) => {
      const e = disposicion();
      if (!arrastrando) {
        // Sin arrastre, el cursor ANUNCIA dónde se puede agarrar. En táctil no hay hover, así
        // que esta rama no llega a ejecutarse y no cuesta nada.
        canvas.setCssStyles({
          cursor: agarraCircunferencia(e, ev.offsetX, ev.offsetY, agarrePx) ? "pointer" : "default",
        });
        return;
      }
      const ap = anguloDePuntero(e, ev.offsetX, ev.offsetY);
      // El imán se consulta EN CADA evento, no al agarrar: `Alt` lo suspende mientras se mantiene
      // (ver `imanVigente`), así que pulsarlo o soltarlo a mitad del arrastre se nota sin levantar
      // el dedo. El estado de la tecla viene en el propio evento de puntero; no hace falta
      // escuchar el teclado ni guardar nada.
      fijarAngulo(
        crudos[activo] + deltaAngular(anguloPrevio, ap), imanVigente(imanActivo, ev.altKey)
      );
      anguloPrevio = ap;
      repintar();
    });

    const soltar = (ev: PointerEvent) => {
      if (!arrastrando) return;
      arrastrando = false;
      if (canvas.hasPointerCapture?.(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
      canvas.setCssStyles({ cursor: "pointer" });
    };
    canvas.addEventListener("pointerup", soltar);
    // `pointercancel` entra por el mismo sitio: el sistema puede quitarnos el dedo a media
    // faena (un gesto del SO, una llamada) y sin tratarlo el bloque se quedaría "arrastrando"
    // para siempre, girando con cada movimiento posterior del puntero.
    canvas.addEventListener("pointercancel", soltar);

    // ── Teclado ──────────────────────────────────────────────────────────────────────────
    // Los pasos NO pasan por el imán: un paso de 1° con el imán puesto volvería al notable de
    // partida y la tecla no haría nada. Quien pulsa una flecha ya está diciendo cuánto quiere
    // moverse; el imán es una ayuda del gesto impreciso, no del preciso.
    canvas.addEventListener("keydown", (ev) => {
      const paso = ev.shiftKey ? PASO_IMAN : PASO_IMAN / 15;   // 15° con Shift, 1° sin él
      let nuevo: number | null = null;
      if (ev.key === "ArrowRight") nuevo = crudos[activo] + paso;
      else if (ev.key === "ArrowLeft") nuevo = crudos[activo] - paso;
      else if (ev.key === "PageUp") nuevo = (Math.floor(crudos[activo] / PASO_IMAN) + 1) * PASO_IMAN;
      else if (ev.key === "PageDown") nuevo = (Math.ceil(crudos[activo] / PASO_IMAN) - 1) * PASO_IMAN;
      else if (ev.key === "Home") nuevo = 0;
      else if (ev.key === "Tab" && mostrados.length > 1) {
        activo = (activo + 1) % mostrados.length;
        ev.preventDefault();
        repintar();
        return;
      }
      if (nuevo === null) return;
      ev.preventDefault();
      fijarAngulo(nuevo, false);
      repintar();
    });

    // ── Controles del panel: selector de componentes + deslizador ─────────────────────────
    // Tres casillas INDEPENDIENTES: cada una enciende y apaga su trazo, y se pueden tener las
    // tres a la vez. No hay botón «Ninguna» porque no hace falta — se llega apagando las que
    // estén, que es donde el dedo ya está.
    //
    // El deslizador NO sustituye al arrastre: los dos escriben el mismo número. El arrastre es
    // directo y rápido para saltar a un ángulo; el deslizador es preciso, se maneja con el dedo
    // sin tapar la figura y permite recorrer la vuelta entera sin soltar.
    {
      const fila = controles.createDiv();
      fila.style.cssText = "display:flex; gap:5px;";
      // Grupo con nombre accesible: las tres casillas son una sola pregunta ("¿qué se dibuja?"),
      // no tres ajustes sueltos.
      fila.setAttribute("role", "group");
      fila.setAttribute("aria-label", t().trig.componentes.chip);

      const botones = new Map<ComponenteTrig, HTMLElement>();
      const sincronizarBotones = () => {
        for (const [c, b] of botones) {
          const activo = componentes.has(c);
          b.setAttribute("aria-pressed", String(activo));
          // El borde de la casilla encendida es del COLOR DE SU COMPONENTE, no del acento del
          // marco: con tres encendidas a la vez, un borde común no diría cuál es cuál, y la
          // correspondencia casilla ↔ trazo es justo lo que el color existe para sostener.
          const color = colorComponente(c);
          b.style.cssText =
            "flex:1 1 0; display:flex; align-items:center; justify-content:center; gap:5px; " +
            "padding:5px 4px; font-size:11px; line-height:1.1; border-radius:7px; " +
            "cursor:pointer; user-select:none; white-space:nowrap; " +
            "transition:color 0.12s ease, background 0.12s ease, border-color 0.12s ease; " +
            (activo
              ? `color:var(--lmath-texto); background:var(--lmath-panel); border:1px solid ${color};`
              : "color:var(--lmath-texto-apagado); background:transparent; " +
                "border:1px solid var(--lmath-borde);");
          // La muestra lleva el color REAL con el que se dibuja el segmento (paleta viva, así
          // que sigue al tema): la casilla enseña lo que va a aparecer en el plano.
          const muestra = b.firstElementChild;
          if (muestra instanceof HTMLElement) {
            muestra.style.cssText =
              "width:11px; height:3px; border-radius:2px; flex:0 0 auto; " +
              `background:${color}; opacity:${activo ? "1" : "0.45"};`;
          }
        }
      };
      for (const c of COMPONENTES) {
        const b = fila.createDiv();
        b.createDiv();
        b.createSpan({ text: t().trig.componentes[c] });
        botones.set(c, b);
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (!componentes.delete(c)) componentes.add(c);
          sincronizarBotones();
          pintar();
        });
      }

      // Fila del valor: a la izquierda θ, a la derecha el ángulo vivo, grande, que es el número
      // que gobierna todo lo demás. La etiqueta es fija, así que se escribe una sola vez.
      const filaValor = controles.createDiv();
      filaValor.style.cssText =
        "display:flex; align-items:baseline; justify-content:space-between; gap:8px; " +
        "font-size:11px; line-height:1.1; color:var(--lmath-texto-tenue);";
      filaValor.createDiv({ text: ETIQUETA_POR_DEFECTO });
      const valorVivo = filaValor.createDiv();
      valorVivo.style.cssText =
        "font-size:14px; font-weight:600; color:var(--lmath-texto); font-variant-numeric:tabular-nums;";

      const { fijarValor } = this.montarDeslizador(controles, {
        min: recorrido.min, max: recorrido.max,
        valor: gradosEscritos[activo],
        etiqueta: ETIQUETA_POR_DEFECTO,
        paso: 1,
        pasoGrande: 15,
        alCambiar: (grados) => {
          detenerAnimacion();
          // Sin imán: quien mueve un deslizador de grado en grado ya está siendo preciso, y un
          // imán aquí haría que la manija y el dibujo dijeran cosas distintas.
          fijarAngulo(aRadianes(grados), false);
          pintar();
        },
      });

      // La lectura se construye UNA vez y luego solo se le cambian los textos. `actualizarPanel`
      // se llama desde `pintar`, o sea en cada frame del arrastre y de la animación: rehacer el
      // DOM sesenta veces por segundo para escribir tres números es basura que el recolector
      // acaba pagando, y en el móvil se nota.
      const tabla = lectura.createDiv();
      const celdas: Array<{ exacto: HTMLElement; aprox: HTMLElement }> = [];
      // Los nombres van en el COLOR de su componente y no en el gris del resto de rótulos: la
      // tabla es la leyenda del plano, así que `sin` morado aquí y el trazo morado allí son la
      // misma afirmación. Se guardan para repintarlos cuando cambie el tema.
      const nombresRazon: HTMLElement[] = [];
      for (const nombre of ["sin", "cos", "tan"]) {
        const f = tabla.createDiv();
        f.style.cssText =
          "display:flex; align-items:baseline; gap:8px; padding:2px 0; font-size:11.5px;";
        nombresRazon.push(f.createDiv({ text: nombre }));
        nombresRazon[nombresRazon.length - 1].setCssStyles({
          width: "26px", flex: "0 0 auto",
        });
        const exacto = f.createDiv();
        exacto.setCssStyles({ flex: "1 1 auto", textAlign: "right" });
        const aprox = f.createDiv();
        aprox.setCssStyles({
          color: "var(--lmath-texto-apagado)", width: "62px", flex: "0 0 auto", textAlign: "right",
        });
        celdas.push({ exacto, aprox });
      }

      const grande = lectura.createDiv();
      const grandeTitulo = grande.createDiv();
      grandeTitulo.setCssStyles({ color: "var(--lmath-texto-tenue)", fontSize: "11px" });
      const grandeValor = grande.createDiv();
      grandeValor.setCssStyles({
        fontSize: "21px", lineHeight: "1.35", color: "var(--lmath-texto)",
      });
      const grandeAprox = grande.createDiv();
      grandeAprox.setCssStyles({ color: "var(--lmath-texto-apagado)", fontSize: "11px" });

      const decimal = (v: number): string =>
        Math.abs(v - Math.round(v)) < 1e-12 ? String(Math.round(v))
          : Math.abs(v) >= 1e4 ? v.toExponential(2) : v.toFixed(4);

      actualizarPanel = () => {
        const m = modelos[activo];
        const ex = derechoExacto[activo] ? razonesExactas(mostrados[activo]) : null;
        const grados = aGrados(mostrados[activo]);
        // El ángulo se ESCRIBE en la unidad del chip, aquí y en la tarjeta: es lo único que hace
        // ese control, y si el panel se quedara siempre en grados no haría nada visible en un
        // bloque de escritorio. El deslizador sigue midiendo en grados por debajo — es un mando,
        // no una lectura.
        const textoAng = textoAngulo(m, unidad);
        const noDefinida = t().trig.info.noDefinida;

        // El deslizador sigue al ángulo aunque lo haya movido el arrastre, el teclado o la
        // animación: es un mando, no una fuente de verdad paralela. Sin redondear, porque el
        // arrastre da ángulos fraccionarios y la manija tiene que acompañarlos con suavidad.
        fijarValor(grados);
        valorVivo.setText(textoAng);

        // Renglón vivo de la tarjeta: el punto que cumple la ecuación de arriba.
        const punto = derechoExacto[activo] ? puntoExactoTexto(mostrados[activo]) : null;
        puntoVivo.setText(
          `P(${textoAng}) = ${punto ?? `(${decimal(m.punto.x)}, ${decimal(m.punto.y)})`}`
        );

        // Con UNA componente encendida, esa en grande: hay un solo segmento en el plano y el
        // panel lo acompaña con un solo número. Con ninguna o con varias, la tabla de las tres:
        // en cuanto hay más de un trazo el panel tiene que poder emparejarlos todos, y una
        // columna alineada es lo que compara bien.
        const unica = componentes.size === 1 ? [...componentes][0] : null;
        tabla.setCssStyles({ display: unica === null ? "block" : "none" });
        grande.setCssStyles({ display: unica === null ? "none" : "block" });

        if (unica === null) {
          const valores: Array<[number | null, { txt: string } | null]> = [
            [m.razones.sin, ex?.sin ?? null],
            [m.razones.cos, ex?.cos ?? null],
            [m.razones.tan, ex?.tan ?? null],
          ];
          valores.forEach(([valor, exacto], i) => {
            celdas[i].exacto.setText(
              valor === null ? noDefinida : exacto ? exacto.txt : decimal(valor)
            );
            celdas[i].aprox.setText(valor !== null && exacto ? `≈ ${decimal(valor)}` : "");
          });
        } else {
          const nombre = unica === "seno" ? "sin" : unica === "coseno" ? "cos" : "tan";
          const valor = unica === "seno" ? m.razones.sin
            : unica === "coseno" ? m.razones.cos : m.razones.tan;
          const exacto = ex === null ? null
            : unica === "seno" ? ex.sin : unica === "coseno" ? ex.cos : ex.tan;
          grandeTitulo.setText(`${nombre} ${textoAng}`);
          grandeTitulo.setCssStyles({ color: colorComponente(unica) });
          grandeValor.setText(valor === null ? noDefinida : exacto ? exacto.txt : decimal(valor));
          grandeAprox.setText(valor !== null && exacto ? `≈ ${decimal(valor)}` : "");
        }
      };

      // Las muestras del selector y los nombres de la tabla salen de la paleta VIVA, así que se
      // resincronizan juntos: son las dos mitades de la misma leyenda.
      const sincronizarColores = () => {
        sincronizarBotones();
        COMPONENTES.forEach((c, i) => nombresRazon[i].setCssStyles({ color: colorComponente(c) }));
      };
      sincronizarColores();
      const refTemaBotones = this.plugin.app.workspace.on("css-change", () => sincronizarColores());
      limpieza.register(() => this.plugin.app.workspace.offref(refTemaBotones));
    }

    // ── Chip de UNIDAD: DEG / RAD / GRAD ──────────────────────────────────────────────────
    // Tres estados que se recorren en ciclo, cada uno con su palabra DIBUJADA (`GLIFO_UNIDAD`).
    // Es un glifo y no texto porque con tres unidades hacía falta una tercera etiqueta corta y no
    // la hay: `°`, `rad` y `gon` no forman un juego —una es un símbolo, otra una abreviatura y la
    // tercera no la reconoce nadie—, mientras que DEG/RAD/GRAD se leen como lo que son, tres
    // opciones del mismo control.
    //
    // Cambia cómo se ESCRIBEN los ángulos (rótulos del plano y lectura del panel) y NADA MÁS: un
    // `θ = 2` sigue siendo 2 radianes con el chip en grados, y se escribe 114,59°. Si este chip
    // reinterpretara la fuente, pulsarlo movería el punto, que es justo lo que no puede hacer un
    // control de presentación.
    {
      const altoU = reparto.ladoChip;
      // PASTILLA, no círculo como los demás chips. Una palabra es ancha y baja: metida en un
      // círculo de 22 px solo le tocan 18 de ancho, y a esa escala «RAD» sale de 6 px de alto con
      // astas de un píxel — borroso, y con el borde inferior comido. Alargando el chip a 1,7 veces
      // su alto, la misma palabra pasa de 6 a casi 9 px sin que el chip crezca en vertical ni
      // invada nada: está solo en esa esquina. El resto de chips siguen redondos porque sus
      // iconos SÍ son cuadrados.
      const anchoU = Math.round(altoU * 1.7);
      const btnUnidad = wrap.createDiv();
      btnUnidad.style.cssText =
        `position:absolute; top:6px; right:8px; width:${anchoU}px; height:${altoU}px; ` +
        "display:flex; align-items:center; justify-content:center; " +
        `line-height:1; border-radius:${altoU / 2}px; cursor:pointer; user-select:none; z-index:5; ` +
        "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
        "border:1px solid var(--lmath-acento-borde);";
      const sincronizarUnidad = () => {
        btnUnidad.empty();
        // A lo ANCHO del chip, sin el 0,66 del resto de iconos: ver `montarGlifoUnidad`.
        this.montarGlifoUnidad(btnUnidad, unidad, anchoU - 8);
        const nombre = unidad === "degrees" ? t().ajustes.trig.opcionGrados
          : unidad === "radians" ? t().ajustes.trig.opcionRadianes
            : t().ajustes.trig.opcionGradianes;
        this.ponerTooltip(btnUnidad, `${t().ajustes.trig.unidad.etiqueta}: ${nombre}`);
      };
      sincronizarUnidad();
      btnUnidad.addEventListener("click", (ev) => {
        ev.stopPropagation();
        unidad = CICLO_UNIDAD[(CICLO_UNIDAD.indexOf(unidad) + 1) % CICLO_UNIDAD.length];
        sincronizarUnidad();
        pintar();
      });
      // El tooltip está traducido, así que hay que rehacerlo si cambia el idioma con el bloque
      // montado (el resto del cromo ya lo hace por el mismo canal).
      const refIdioma = this.plugin.app.workspace.on("css-change", () => sincronizarUnidad());
      limpieza.register(() => this.plugin.app.workspace.offref(refIdioma));
    }

    // ── Animación: el círculo se recorre solo ─────────────────────────────────────────────
    // El ángulo avanza a `velocidad` grados por segundo desde donde esté, sin parar hasta que se
    // pausa. El imán se ignora mientras dura: un giro continuo que se pegara a cada notable no
    // sería una animación, sería un tictac.
    {
      const ladoP = reparto.ladoChip;
      // 60°/s: una vuelta cada seis segundos. Fija, y no una opción del bloque — la velocidad a
      // la que gira una ilustración no es una propiedad del ángulo que se escribió.
      const velocidad = aRadianes(60);   // rad/s
      const btnPlay = wrap.createDiv();
      chipsAbajo.push(btnPlay);
      btnPlay.style.cssText =
        `position:absolute; bottom:8px; left:${8 + ladoP + 6}px; ` +
        `width:${ladoP}px; height:${ladoP}px; ` +
        "display:flex; align-items:center; justify-content:center; line-height:1; " +
        "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
        "border:1px solid var(--lmath-acento-borde); border-radius:50%; cursor:pointer; " +
        "user-select:none; z-index:5;";
      const sincronizarPlay = () => {
        btnPlay.empty();
        this.montarIcono(btnPlay, animando ? "pausar" : "reproducir", ladoIcono(ladoP));
        this.ponerTooltip(btnPlay, animando ? t().botones.pausar : t().botones.reproducir);
      };
      sincronizarPlay();

      let rafAnim: number | null = null;
      let tPrev = 0;
      // ¿El bloque está a la vista? Una nota con seis círculos girando fuera de la pantalla es
      // batería quemada en el móvil, así que el bucle se suspende al salir de vista y se retoma
      // al volver, conservando la INTENCIÓN de estar animando.
      let enPantalla = true;
      const marco = (t: number) => {
        rafAnim = null;
        if (!animando || !enPantalla) return;
        const dt = tPrev === 0 ? 0 : (t - tPrev) / 1000;
        tPrev = t;
        // El ángulo se mantiene dentro de la vuelta principal mientras gira: ver .
        fijarAngulo(pasoAnimacion(crudos[activo], velocidad, dt), false);
        pintar();
        rafAnim = window.requestAnimationFrame(marco);
      };
      const arrancarBucle = () => {
        if (rafAnim !== null) return;
        tPrev = 0;   // el primer marco no consume tiempo: evita el salto tras una pausa larga
        rafAnim = window.requestAnimationFrame(marco);
      };
      const pararBucle = () => {
        if (rafAnim !== null) window.cancelAnimationFrame(rafAnim);
        rafAnim = null;
      };
      // Lo usa el arrastre: coger el punto con la mano detiene la animación, porque si no
      // seguiría girando por debajo del dedo y el gesto pelearía contra ella.
      detenerAnimacion = () => {
        if (!animando) return;
        animando = false;
        pararBucle();
        sincronizarPlay();
      };
      btnPlay.addEventListener("click", (ev) => {
        ev.stopPropagation();
        animando = !animando;
        if (animando) arrancarBucle(); else pararBucle();
        sincronizarPlay();
        pintar();
      });

      const observadorVista = new IntersectionObserver((entradas) => {
        enPantalla = entradas.some((e) => e.isIntersecting);
        if (animando && enPantalla) arrancarBucle(); else if (!enPantalla) pararBucle();
      });
      observadorVista.observe(wrap);
      limpieza.register(() => observadorVista.disconnect());
      limpieza.register(pararBucle);
    }

    // ── Botón f(x): abre y cierra la fórmula cuando el panel está FLOTANTE ────────────────
    // En reparto ancho la fórmula está siempre a la vista y no hay nada que abrir, así que el
    // botón se esconde. En estrecho es la única puerta al panel: sin él, la fórmula existiría
    // pero no habría forma de verla.
    {
      const ladoF = reparto.ladoChip;
      const btnFormula = wrap.createDiv({ text: "f(x)" });
      this.ponerTooltip(btnFormula, t().botones.verFormula);
      const estiloFormula = () => {
        btnFormula.style.cssText =
          `position:absolute; bottom:${sueloChips()}px; left:8px; ` +
          `width:${ladoF}px; height:${ladoF}px; ` +
          "display:flex; align-items:center; justify-content:center; font-size:10px; " +
          "line-height:1; border-radius:50%; cursor:pointer; user-select:none; z-index:5; " +
          `font-family:"Lora", var(--font-interface); ` +
          (reparto.abierto
            ? "color:var(--lmath-acento-contraste); background:var(--lmath-acento); " +
              "border:1px solid var(--lmath-acento);"
            : "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
              "border:1px solid var(--lmath-acento-borde);") +
          (reparto.estrecho ? "" : "display:none;");
      };
      estiloFormula();
      sincronizarBotonFormula = estiloFormula;
      btnFormula.addEventListener("click", (ev) => {
        ev.stopPropagation();
        reparto.abierto = !reparto.abierto;
        aplicarCajaPanel(reparto);
        estiloFormula();
        // La tarjeta flotante se dibuja ENCIMA del lienzo, y el navegador no repinta el canvas
        // al descubrirlo: hay que repintarlo nosotros para que no quede un rectángulo viejo.
        pintar();
      });
    }

    // ── Panel ⓘ ──────────────────────────────────────────────────────────────────────────
    // Cinco secciones plegables con SOLO la primera abierta: el contenido completo no cabe de
    // una vez en un plano de 261px, y una lista que hay que desplazar no se lee de un vistazo
    // (el mismo límite que ya rige para las listas del ⓘ en los demás bloques).
    //
    // Los valores exactos se escriben en TEXTO PLANO (√3/2), no en KaTeX: el popover se
    // refresca en cada frame del arrastre, y renderizar seis fórmulas por frame con
    // MarkdownRenderer sería insostenible. El unicode se lee igual de bien a este tamaño.
    {
      const ladoI = reparto.ladoChip;
      const btnInfo = wrap.createDiv();
      chipsAbajo.push(btnInfo);
      this.ponerTooltip(btnInfo, t().trig.info.chip);
      btnInfo.style.cssText = this.estiloChipInfo(ladoI);
      this.montarIcono(btnInfo, "info", ladoIcono(ladoI));

      const pop = wrap.createDiv();
      pop.style.cssText = this.estiloPopoverInfo(ladoI);
      anclajesAbajo.push({ el: pop, base: 8 + ladoI + 6 });

      let visible = false;
      // Solo la primera abierta. El conjunto sobrevive a los refrescos: plegar una sección y
      // seguir arrastrando no debe volver a desplegarla en el siguiente frame.
      const abiertas = new Set<number>([0]);

      const dec = (v: number, n = 6): string => {
        // Un entero se escribe entero: "2" y no "2.000000". El resto, con decimales fijos para
        // que la columna no baile mientras se arrastra.
        return Math.abs(v - Math.round(v)) < 1e-12 ? String(Math.round(v)) : v.toFixed(n);
      };
      // Los grados NO se formatean aquí: se piden a `textoGradosDe`, la misma función que escribe
      // la lectura del panel. Con una copia propia (dos decimales) el mismo ángulo se leía
      // `114.6°` arriba y `114.59°` aquí, al mismo tiempo y a un centímetro.
      const grados = (rad: number): string => textoGradosDe(rad);

      const construir = () => {
        pop.empty();
        const m = modelos[activo];
        const T = t().trig.info;
        const ex = derechoExacto[activo] ? razonesExactas(mostrados[activo]) : null;
        const radExacto = derechoExacto[activo] ? radianesExactoTexto(mostrados[activo]) : null;
        // Una razón: su forma exacta si la hay, y si no el decimal. `null` = no definida.
        const razon = (
          valor: number | null, exacto: { txt: string } | null | undefined
        ): string => {
          if (valor === null) return T.noDefinida;
          return exacto ? `${exacto.txt}  ≈ ${dec(valor)}` : dec(valor);
        };

        // Cada sección responde a UNA pregunta y ninguna repite una fila de otra. La duplicación
        // entre hermanos de un acordeón no es solo ruido: si `sin` sale bajo el primer título,
        // «las seis razones» deja de predecir su contenido y la respuesta racional del lector es
        // abrirlo todo — justo lo que un acordeón existe para evitar. La tarjeta de la izquierda
        // sí puede repetir las tres principales: es otra superficie (resumen permanente), no un
        // hermano que compita por el mismo rótulo.
        const secciones: Array<{ titulo: string; filas: FilaInfo[] }> = [
          {
            // Primera, y por tanto la ABIERTA por defecto: es la única sección cuya mayoría
            // (csc, sec, cot) no aparece en ningún otro sitio de la interfaz.
            titulo: T.seccionRazones,
            filas: [
              // El orden empareja recíprocas por posición (1↔4, 2↔5, 3↔6) y es el mismo de la
              // tarjeta y del chip de componentes: el ojo aprende un orden, no dos.
              ["sin", razon(m.razones.sin, ex?.sin)],
              ["cos", razon(m.razones.cos, ex?.cos)],
              ["tan", razon(m.razones.tan, ex?.tan)],
              ["csc", razon(m.razones.csc, ex?.csc)],
              ["sec", razon(m.razones.sec, ex?.sec)],
              ["cot", razon(m.razones.cot, ex?.cot)],
              // Cierre de la sección, despegado del resto: no es una razón más, es la invariante
              // que las liga —y la ecuación de la propia circunferencia unidad—, así que vive con
              // sus operandos. Comprobación NUMÉRICA, y se dice que lo es: no hay álgebra detrás.
              [
                T.pitagorica,
                `${dec(m.razones.sin ** 2 + m.razones.cos ** 2)} (${T.pitagoricaNota})`,
                true,
              ],
            ],
          },
          {
            // Cadena de derivación: cada fila se calcula de la anterior. Que `Radianes` y
            // `Longitud de arco` salgan con el mismo número no es un descuido — es el hecho que
            // DEFINE el radián (r = 1 ⇒ s = θ), y solo se lee como tal si van seguidas. Separadas
            // por dos secciones, como estaban, la coincidencia parecía un error.
            titulo: T.seccionMedida,
            filas: [
              [T.grados, grados(m.radianes)],
              [T.radianes, radExacto ? `${radExacto}  ≈ ${dec(m.radianes)}` : dec(m.radianes)],
              [T.arco, dec(m.arco)],
              [T.sector, dec(m.sector)],
            ],
          },
          {
            // De grueso a fino: dónde cae el lado terminal da el SIGNO de las razones, el
            // coterminal y las vueltas reconstruyen θ = coterminal + n·2π leídos seguidos, y el
            // ángulo de referencia cierra dando su MAGNITUD. Es el método del ángulo de
            // referencia, en orden.
            titulo: T.seccionPosicion,
            filas: [
              // Con etiqueta, y esa: los ocho valores son cuadrantes Y semiejes, así que
              // «cuadrante» mentiría en la mitad de los casos.
              [T.ladoTerminal, T.posicion[m.posicion]],
              [T.coterminal, grados(m.coterminal)],
              [T.vueltas, String(m.vueltas)],
              [T.referencia, grados(m.referencia)],
            ],
          },
          {
            // Todas las filas son OTRO ángulo, ordenadas por la constante de la que salen
            // (0−θ, 90−θ, 180−θ, 180+θ): así cada par contiguo comparte estructura.
            titulo: T.seccionRelacionados,
            filas: [
              [T.opuesto, grados(-m.radianes)],
              [T.complementario, grados(Math.PI / 2 - m.radianes)],
              [T.suplementario, grados(Math.PI - m.radianes)],
              [T.antipoda, grados(m.radianes + Math.PI)],
            ],
          },
        ];

        secciones.forEach((s, i) => {
          const cab = pop.createDiv({ text: `${abiertas.has(i) ? "▾" : "▸"} ${s.titulo}` });
          cab.style.cssText =
            "cursor:pointer; user-select:none; font-weight:600; padding:3px 0; " +
            (i > 0 ? "border-top:1px solid var(--lmath-borde); margin-top:3px;" : "");
          cab.addEventListener("click", (ev) => {
            ev.stopPropagation();
            if (abiertas.has(i)) abiertas.delete(i); else abiertas.add(i);
            construir();
          });
          if (!abiertas.has(i)) return;
          for (const [etiqueta, valor, separada] of s.filas) {
            const fila = pop.createDiv();
            fila.style.cssText =
              "display:flex; justify-content:space-between; gap:10px; padding:1px 0;" +
              // El mismo filete que separa secciones, pero sin cabecera detrás y con el aire
              // repartido a los dos lados: se lee como un cierre DENTRO de la sección abierta,
              // no como el principio de otra.
              (separada
                ? " border-top:1px solid var(--lmath-borde); margin-top:5px; padding-top:5px;"
                : "");
            fila.createDiv({ text: etiqueta }).setCssStyles({ color: "var(--lmath-texto-tenue)" });
            fila.createDiv({ text: valor }).setCssStyles({ textAlign: "right" });
          }
        });
      };

      // Solo se reconstruye si está ABIERTO: durante un arrastre con el popover cerrado no hay
      // ninguna razón para calcular ni pintar nada de esto.
      refrescarInfo = () => { if (visible) construir(); };

      const cerrar = () => {
        visible = false;
        pop.setCssStyles({ display: "none" });
      };
      btnInfo.addEventListener("click", (ev) => {
        ev.stopPropagation();
        visible = !visible;
        if (visible) construir();
        pop.setCssStyles({ display: visible ? "block" : "none" });
      });
      // Un clic fuera lo cierra, como los demás popovers del plugin.
      const fuera = (ev: MouseEvent) => {
        if (visible && !pop.contains(ev.target as Node) && !btnInfo.contains(ev.target as Node)) {
          cerrar();
        }
      };
      document.addEventListener("mousedown", fuera);
      limpieza.register(() => document.removeEventListener("mousedown", fuera));
    }

    // Los chips de abajo se registran a medida que se montan, o sea DESPUÉS del primer
    // `aplicarReparto`. Una última colocación los pone donde toca si el bloque nació estrecho;
    // sin esto, en el móvil la primera pintura los dejaría debajo de la franja de controles.
    lienzoColocado(reparto.estrecho);
    redimensionar();
    pintar();
    revelar();
  }

  /**
   * Armazón del toggle del panel, COMÚN a los cuatro bloques: la barra de botones (arriba,
   * centrada, flotando sobre la fórmula) y el desplegable que cuelga de ella. Devuelve las
   * cajas vacías y el estilo de sus opciones; QUIÉN va dentro y qué hace al pulsarlo es cosa
   * de cada panel, que es lo único en lo que se diferencian.
   *
   * `barra` se crea antes que `menu` para que el desplegable quede por delante en el orden del
   * documento; ambos son absolutos dentro del panel, así que no participan en su flujo.
   */
  private crearMenuDesplegable(panelLatex: HTMLElement): {
    barra: HTMLElement;
    menu: HTMLElement;
    caja: HTMLElement;
    itemEstilo: (el: HTMLElement, habilitado: boolean) => void;
  } {
    const barra = panelLatex.createDiv();
    barra.style.cssText =
      "position:absolute; top:8px; left:0; right:0; z-index:6; display:flex; gap:6px; " +
      "justify-content:center; pointer-events:none;";

    const menu = panelLatex.createDiv();
    menu.style.cssText =
      "position:absolute; top:36px; left:0; right:0; z-index:7; display:none; " +
      "flex-direction:column; align-items:center; pointer-events:none;";
    const caja = menu.createDiv();
    caja.style.cssText =
      "pointer-events:auto; display:flex; flex-direction:column; gap:2px; padding:4px; " +
      "border-radius:10px; background:var(--lmath-panel); " +
      "border:1px solid var(--lmath-borde); box-shadow:var(--lmath-sombra-flotante); " +
      "font-family:\"Lora\", var(--font-interface);";

    // Estilo de cada opción según esté HABILITADA (produciría un cambio) o no
    // (oscurecida y sin poder clicar, vía pointer-events).
    const itemEstilo = (el: HTMLElement, habilitado: boolean) => {
      el.style.cssText =
        "padding:5px 14px; font-size:11px; line-height:1.15; user-select:none; " +
        "border-radius:6px; white-space:nowrap; text-align:center; " +
        "transition:background 0.12s ease, color 0.12s ease; " +
        (habilitado
          ? "color:var(--lmath-texto); cursor:pointer; pointer-events:auto;"
          : "color:var(--lmath-texto-apagado); cursor:default; pointer-events:none;");
    };

    return { barra, menu, caja, itemEstilo };
  }

  /**
   * Cierra el desplegable al pulsar FUERA de la barra y del menú. Se registra en la limpieza
   * del bloque: es un listener del documento y sobreviviría al bloque que lo puso.
   */
  private cerrarMenuAlPulsarFuera(
    barra: HTMLElement, caja: HTMLElement, limpieza: MarkdownRenderChild, cerrar: () => void
  ): void {
    const onDocDown = (e: MouseEvent) => {
      if (!barra.contains(e.target as Node) && !caja.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", onDocDown);
    limpieza.register(() => document.removeEventListener("mousedown", onDocDown));
  }

  /**
   * Panel izquierdo de los bloques de OPERADOR (obs-derivate, obs-integral): el scroller de
   * fórmula + una barra de toggle de TRES vistas —el OPERADOR sin evaluar (la forma de
   * partida, vista por defecto), el RESULTADO evaluado, y AMBAS apiladas—. No cambia lo
   * graficado: el plano ya grafica lo suyo (la derivada, el integrando); esto solo alterna la
   * fórmula MOSTRADA, con el mismo lenguaje visual que el toggle de obs-graph.
   *
   * Los dos bloques comparten esta maquinaria ENTERA y se distinguen solo por sus textos: qué
   * fórmulas hay (`operador`/`resultado`), qué glifo lleva el botón principal y qué opciones
   * cuelgan del menú. Nada de eso justifica dos copias del mismo toggle.
   */
  private async montarPanelVistas(
    contenedor: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    limpieza: MarkdownRenderChild,
    reparto: Reparto,
    config: {
      /** La fórmula de PARTIDA (`d/dx(f)`, `∫ₐᵇ f dx`): vista por defecto. */
      readonly operador: string;
      /** La fórmula EVALUADA (`f'(x)=…`, `[F(x)]ₐᵇ = …`). */
      readonly resultado: string;
      /** Glifo matemático del botón principal (el que devuelve a la vista "operador"). */
      readonly glifoOperador: string;
      /** Tooltip del botón de opciones CERRADO (lo que despliega). */
      readonly tooltipOpciones: string;
      readonly opciones: ReadonlyArray<{
        readonly etiqueta: string;
        readonly tex: string;
        readonly vista: "resultado" | "ambas";
      }>;
    }
  ): Promise<void> {
    const { panelLatex, renderLatex } = this.crearScrollerLatex(contenedor, ctx, limpieza, reparto);
    const { operador, resultado } = config;

    // En "ambas" `latexDe` devuelve las dos fórmulas y `renderLatex` las apila, cada una en su
    // propio contenedor con el mismo estilo que las vistas individuales.
    type Vista = "operador" | "resultado" | "ambas";
    const latexDe = (v: Vista): string | readonly string[] =>
      v === "operador" ? operador : v === "resultado" ? resultado : [operador, resultado];
    // Firma comparable de una vista: las arrays no se comparan por identidad, así que se
    // colapsan a un string para decidir si una opción cambiaría lo mostrado (habilitarla).
    const firmaDe = (v: Vista): string => {
      const l = latexDe(v);
      return typeof l === "string" ? l : l.join(" ");
    };

    const { barra, menu, caja, itemEstilo } = this.crearMenuDesplegable(panelLatex);
    const btnOriginal = barra.createDiv();
    this.ponerTooltip(btnOriginal, t().botones.operador);
    this.montarEtiquetaMath(btnOriginal, config.glifoOperador, ctx);
    const btnOpciones = this.crearBotonOpciones(barra, config.tooltipOpciones);

    const items = config.opciones.map((o) => {
      const el = caja.createDiv();
      this.ponerTooltip(el, o.etiqueta);
      this.montarEtiquetaMath(el, o.tex, ctx);
      return el;
    });

    // "operador" (forma de partida) es la vista por defecto.
    let vista: Vista = "operador";
    let abierto = false;
    // La opción está HABILITADA si aplicarla cambiaría la fórmula mostrada (su LaTeX difiere
    // del actual): así "Derivada" se apaga estando ya en la derivada evaluada.
    const sincronizar = () => {
      this.estiloBotonPanel(btnOriginal, vista === "operador");
      this.estiloBotonOpciones(btnOpciones, vista !== "operador" || abierto);
      this.iconoBotonOpciones(btnOpciones, abierto, config.tooltipOpciones);
      const actual = firmaDe(vista);
      items.forEach((el, i) => itemEstilo(el, firmaDe(config.opciones[i].vista) !== actual));
      menu.style.display = abierto ? "flex" : "none";
    };
    const aplicar = async (i: number) => {
      abierto = false;
      const v = config.opciones[i].vista;
      if (firmaDe(v) !== firmaDe(vista)) { vista = v; await renderLatex(latexDe(vista)); }
      sincronizar();
    };
    btnOriginal.addEventListener("click", () => void (async () => {
      abierto = false;
      if (vista !== "operador") { vista = "operador"; await renderLatex(operador); }
      sincronizar();
    })());
    btnOpciones.addEventListener("click", (e) => { e.stopPropagation(); abierto = !abierto; sincronizar(); });
    items.forEach((el, i) => el.addEventListener("click", () => void aplicar(i)));

    this.cerrarMenuAlPulsarFuera(barra, caja, limpieza, () => {
      if (!abierto) return;
      abierto = false;
      sincronizar();
    });

    sincronizar();
    await renderLatex(operador);
  }

  /**
   * Panel izquierdo de obs-graph / obs-system: el scroller de fórmula + la barra de
   * toggle de transformaciones ([Original] [Opciones ▾] con Simplificar / Despejar y).
   */
  private async montarPanelLatex(
    contenedor: HTMLElement,
    ecuaciones: readonly string[],
    ctx: MarkdownPostProcessorContext,
    limpieza: MarkdownRenderChild,
    reparto: Reparto
  ): Promise<void> {
    const { panelLatex, renderLatex } = this.crearScrollerLatex(contenedor, ctx, limpieza, reparto);

    // ── Toggle de transformaciones del panel ────────────────────────────────────
    // Botones centrados arriba del panel para alternar la fórmula MOSTRADA (no cambia
    // lo graficado): [Original] [Opciones ▾]. La SIMPLIFICACIÓN es automática e
    // incondicional (siempre aplicada en `base`, sin botón: `x+x+x`→`3x`, `x/2` intacto).
    // La única transformación de MENÚ es Despejar y, para implícitas (`x³+y³=9`→`y=∛(9−x³)`),
    // y solo si no está en automático; se deshabilita si no cambiaría lo mostrado. La
    // `variable` de la etiqueta se renderiza en MATEMÁTICA (KaTeX), no con Lora: "Despejar $y$",
    // nombrando la variable explícitamente de cara a soportar despejar otras. Botones/menú
    // redondeados; el texto de interfaz usa Lora.
    // Base MOSTRADA por defecto: el panel arranca ya SIMPLIFICADO (y despejado si `despejarAuto`
    // está activo; orden formal despejar → simplificar), no en lo escrito; "Original" revierte a
    // ESA base. La transformación automática (despejar) se RETIRA del menú.
    const ajustes = this.obtenerAjustes();
    const base = this.baseAutomatica(ecuaciones, ajustes);
    const original = bloqueALatex(base, this.sistema);
    // Simplificar YA NO es una opción de menú: es automática e incondicional (aplicada en
    // `base`). La única transformación manual posible es Despejar y (para implícitas), y solo
    // si no está en automático. Sin ninguna manual no hay nada que alternar → se omite la barra.
    const todas: ReadonlyArray<{
      etiqueta: string; tex: string; auto: boolean; fn: (e: readonly string[]) => string[];
    }> = [
      // `etiqueta` = título accesible; `tex` = glifo matemático RENDERIZADO en el botón.
      { etiqueta: t().botones.despejarY, tex: "y=f(x)", auto: ajustes.despejarAuto, fn: despejarEcuaciones },
    ];
    const transformaciones = todas.filter((t) => !t.auto);

    if (ecuaciones.length > 0 && transformaciones.length > 0) {
      // ESTADO encadenable: la expresión actual (strings re-parseables). Las
      // transformaciones se aplican sobre el estado ACTUAL (parte de la base mostrada).
      let estado: readonly string[] = base;

      const { barra, menu, caja, itemEstilo } = this.crearMenuDesplegable(panelLatex);
      const estiloBoton = (b: HTMLElement, activo: boolean) => this.estiloBotonPanel(b, activo);
      // "Original" ahora es un GLIFO matemático: `f(x)` en obs-graph; el sistema
      // `\scriptscriptstyle\begin{cases}~\\[1.1ex]~\end{cases}` (filas vacías) en obs-system. Título accesible aparte.
      const btnOriginal = barra.createDiv();
      this.ponerTooltip(btnOriginal, t().botones.original);
      this.montarEtiquetaMath(
        btnOriginal,
        this.sistema ? "\\scriptscriptstyle\\begin{cases}~\\\\[1.1ex]~\\end{cases}" : "f(x)",
        ctx
      );
      const btnOpciones = this.crearBotonOpciones(barra, t().botones.transformaciones);

      // Cada opción es un div cuyo contenido es el GLIFO matemático de la transformación
      // (`y=f(x)` para Despejar), renderizado con KaTeX; el `etiqueta` queda como título
      // accesible. El estilo (habilitado/no) lo pone itemEstilo en cada sincronización.
      const items = transformaciones.map((t) => {
        const el = caja.createDiv();
        this.ponerTooltip(el, t.etiqueta);
        this.montarEtiquetaMath(el, t.tex, ctx);
        return el;
      });

      let abierto = false;
      const esOriginal = () => bloqueALatex(estado) === original;
      // Una transformación está HABILITADA si aplicada al estado ACTUAL cambiaría la
      // expresión mostrada (se compara el LaTeX resultante con el actual).
      const sincronizar = () => {
        estiloBoton(btnOriginal, esOriginal());
        this.estiloBotonOpciones(btnOpciones, !esOriginal() || abierto);
        this.iconoBotonOpciones(btnOpciones, abierto, t().botones.transformaciones);
        const actual = bloqueALatex(estado);
        items.forEach((el, i) => itemEstilo(el, bloqueALatex(transformaciones[i].fn(estado)) !== actual));
        menu.style.display = abierto ? "flex" : "none";
      };
      const aplicar = async (i: number) => {
        abierto = false;
        const nuevo = transformaciones[i].fn(estado);
        if (bloqueALatex(nuevo) !== bloqueALatex(estado)) { estado = nuevo; await renderLatex(bloqueALatex(estado)); }
        sincronizar();
      };
      btnOriginal.addEventListener("click", () => void (async () => {
        abierto = false;
        if (!esOriginal()) { estado = base; await renderLatex(original); }
        sincronizar();
      })());
      btnOpciones.addEventListener("click", (e) => { e.stopPropagation(); abierto = !abierto; sincronizar(); });
      items.forEach((el, i) => el.addEventListener("click", () => void aplicar(i)));

      // Clic fuera de la barra/menú → cerrar el desplegable.
      this.cerrarMenuAlPulsarFuera(barra, caja, limpieza, () => {
        if (!abierto) return;
        abierto = false;
        sincronizar();
      });

      sincronizar();
    }

    await renderLatex(original);
  }

  /**
   * Panel izquierdo de obs-derivate: las dos fórmulas del bloque —el operador sin evaluar
   * `\frac{d}{dx}\left(f\right)` y la derivada evaluada `f'\left(x\right) = …`— servidas al
   * toggle común (`montarPanelVistas`), que arranca en el OPERADOR: es la forma de partida,
   * análoga al `f(x)` de obs-graph. No transforma lo graficado —el plano SIEMPRE grafica la
   * derivada, ver `process`—: solo alterna la fórmula MOSTRADA.
   */
  private async montarPanelDerivada(
    contenedor: HTMLElement,
    ecuaciones: readonly string[],
    ctx: MarkdownPostProcessorContext,
    limpieza: MarkdownRenderChild,
    reparto: Reparto
  ): Promise<void> {
    // Las DOS representaciones que puede mostrar el panel: el OPERADOR sin evaluar YA con la
    // función SIMPLIFICADA (`d/dx(6x)`, la vista "Original"/por defecto, análoga a `f(x)` de
    // obs-graph: la forma de PARTIDA) y la DERIVADA evaluada (`f'(x)=…`, la opción del menú:
    // el RESULTADO). El operador NO cambia la derivada evaluada: solo muestra lo que se deriva.
    const operadorSimp = derivadaOperadorSimplificadoLatex(ecuaciones); // null si no es explícito
    // El operador con la función simplificada; si el bloque no es explícito (no hay forma
    // simplificable), cae al operador crudo `d/dx(f)`.
    const operador = operadorSimp ?? derivadaOperadorLatex(ecuaciones);

    await this.montarPanelVistas(contenedor, ctx, limpieza, reparto, {
      operador,
      resultado: derivadaLatex(ecuaciones),
      glifoOperador: "\\frac{d}{dx}\\left(f(x)\\right)",
      tooltipOpciones: t().botones.derivadaEvaluada,
      opciones: [
        { etiqueta: t().botones.derivada, tex: "f'(x)", vista: "resultado" },
        // Vista combinada: su glifo APILA el operador sobre la derivada (representa que
        // muestra ambas expresiones a la vez, una debajo de la otra).
        {
          etiqueta: t().botones.operadorYDerivada,
          tex: "\\begin{matrix}\\frac{d}{dx}\\left(f(x)\\right)\\\\ f'\\left(x\\right)\\end{matrix}",
          vista: "ambas",
        },
      ],
    });
  }

  /**
   * Panel izquierdo de obs-integral: el scroller de fórmula + una barra de toggle de TRES
   * vistas, espejo EXACTO del panel de obs-derivate (§6.4):
   *   • [Operador] (por defecto): la integral sin evaluar `\int_a^b f\,dx` (forma de partida).
   *   • Primitiva: la regla de BARROW `\left[F(x)\right]_a^b = <valor>`, con F la antiderivada
   *     simbólica (`integralPrimitivaLatex` → `integrarExpr`) y el valor numérico ya presente.
   *     Es el análogo de la "derivada evaluada" (`f'(x)=…`). Si el integrador NO cubre este
   *     integrando, cae al VALOR sin corchete (`\int_a^b f\,dx = <área>`, la vista de siempre).
   *   • Operador y primitiva: ambas apiladas (operador arriba, primitiva debajo) — la forma
   *     del mockup del usuario.
   * No cambia lo graficado (el plano SIEMPRE grafica el integrando y sombrea la región): solo
   * alterna la fórmula MOSTRADA. El área se calcula UNA vez; si es un caso límite del Nivel 2,
   * el cuerpo es la etiqueta (`\text{Integral divergente}`).
   */
  private async montarPanelIntegral(
    contenedor: HTMLElement,
    source: string,
    ctx: MarkdownPostProcessorContext,
    limpieza: MarkdownRenderChild,
    reparto: Reparto
  ): Promise<void> {
    const operador = integralOperadorLatex(source);
    // El VALOR del área, en su representación EXACTA cuando existe (`\frac{8}{3}`, `\frac{\pi}{2}`,
    // `\ln 3`…) vía Barrow simbólico, y `\approx <decimal>` si es irracional sin forma cerrada.
    const { cuerpo, conector } = cuerpoAreaLatexExacto(source);
    // La PRIMITIVA en forma de Barrow, con el valor enganchado por el mismo conector
    // (`\left[F\right]_a^b = <valor exacto>`): muestra la antiderivada Y conserva el número. Si
    // `integralPrimitivaLatex` devuelve null (integrando fuera de alcance), la vista "resultado"
    // cae al valor sin corchete = la vista "Valor" de antes.
    const barrow = integralPrimitivaLatex(source);
    // SIN valor (`cuerpo === null`: integrando degenerado, integral divergente, límites no
    // numéricos…): el panel se queda con la FÓRMULA —los corchetes de Barrow, o el operador— y
    // NINGUNA etiqueta. El diagnóstico vive en un solo sitio, el PLANO (velo + etiqueta formal,
    // como "Indeterminada"); una etiqueta en el panel LaTeX lo repetía en el lugar equivocado:
    // el panel es la fórmula, no el veredicto.
    const resultado = cuerpo === null
      ? (barrow ?? operador)
      : barrow
        ? `${barrow} ${conector} ${cuerpo}`
        : integralValorLatex(source, cuerpo, conector);

    await this.montarPanelVistas(contenedor, ctx, limpieza, reparto, {
      operador,
      resultado,
      // Glifo del botón principal: el operador integral (`∫ₐᵇ f dx`), análogo al `d/dx(f(x))`
      // del botón "Operador" de obs-derivate.
      glifoOperador: "\\int_a^b f(x)\\,dx",
      tooltipOpciones: t().botones.primitivaEvaluada,
      opciones: [
        // La PRIMITIVA evaluada (glifo `[F(x)]_a^b`) y AMBAS (operador apilado sobre
        // primitiva). Espejo de "Derivada" / "Operador y derivada" de obs-derivate.
        { etiqueta: t().botones.primitiva, tex: "\\left[F(x)\\right]_a^b", vista: "resultado" },
        {
          etiqueta: t().botones.operadorYPrimitiva,
          tex: "\\begin{matrix}\\int_a^b f\\,dx\\\\ \\left[F(x)\\right]_a^b\\end{matrix}",
          vista: "ambas",
        },
      ],
    });
  }

  /**
   * Etiqueta formal del bloque, o null si es graficable: bloque VACÍO → "Sin
   * función"; forma explícita clásica (expr suelta o y=expr) sin ningún valor real
   * → clasificación del GraphEngine (Indeterminada / Indefinida / No definida en ℝ,
   * con el MISMO evaluador compartido, que preserva los valores complejos). Las
   * demás formas (implícitas, paramétricas, polares, sistemas) no se clasifican:
   * el motor grafica lo que pueda.
   */
  private clasificarBloque(ecuaciones: readonly string[], source = ""): FuncionDegenerada | null {
    // Comando LaTeX que el parser no sabe traducir (`\alpha`, `\ge`, `\sum`…). Se mira el
    // SOURCE escrito, no las ecuaciones graficadas (en derivate/integral estas ya son la
    // derivada/el integrando, en sintaxis mathjs). Va PRIMERO: sin esta etiqueta el comando
    // se degrada a símbolos libres y el bloque no dibuja nada SIN decir por qué —o peor, en
    // obs-derivate deriva esa basura y muestra una derivada falsa (ver parser.ts).
    const noSoportados = comandosNoSoportados(source);
    if (noSoportados.length > 0) {
      return {
        etiqueta: noSoportados.length === 1 ? t().velo.simboloNoSoportado : t().velo.simbolosNoSoportados,
        detalle: t().velo.simboloDetalle(noSoportados.join(", ")),
      };
    }

    // Bloque obs-integral: sin integrando graficable (no se reconoció `\int_a^b f dx` o falta
    // un límite) → "Sin integral". Con integrando presente, se clasifica como una explícita
    // normal más abajo (0/0, √−1 sobre el INTEGRANDO → velo, Nivel 1); los fallos del VALOR
    // (divergente, límites no numéricos) NO oscurecen el plano: van al panel (Nivel 2).
    if (this.integral && ecuaciones.length === 0) {
      // Se escribió una integral, pero su integrando no es una función de x (una ECUACIÓN:
      // `\int_0^1 (x²+y²−1)³=x²y³ dx`; ver `esIntegrandoValido`). Decirlo, y decir a dónde va
      // ese contenido: de una curva implícita no se integra nada, se GRAFICA (obs-graph).
      if (/\\int/.test(source)) {
        return { ...t().velo.integrandoNoValido };
      }
      return { ...t().velo.sinIntegral };
    }
    // Integral SIN valor: el integrando no toma valores reales (Nivel 1) o el número no existe
    // (Nivel 2: divergente, `\int_{-\infty}`, hueco del dominio). TODAS las etiquetas del bloque
    // salen aquí, sobre el plano: el panel LaTeX solo muestra la fórmula (ver montarPanelIntegral).
    if (this.integral) {
      const etiqueta = etiquetaIntegral(source);
      if (etiqueta) return etiqueta;
    }

    // Bloque obs-system: un SISTEMA necesita ≥2 ecuaciones (y ≥2 incógnitas). Se
    // clasifica por número de ecuaciones; con 2+ no se clasifica (grafica normal).
    if (this.sistema) {
      if (ecuaciones.length === 0) {
        return { ...t().velo.sinSistema };
      }
      if (ecuaciones.length === 1) {
        return { ...t().velo.sistemaIncompleto };
      }
      return null;
    }
    if (ecuaciones.length === 0) {
      return { ...t().velo.sinFuncion };
    }
    return this.degeneradaDeEcuacion(ecuaciones[0]);
  }

  /**
   * Clasificación formal de UNA ecuación explícita (`y=f(x)` o expresión suelta): la etiqueta
   * del velo (Indeterminada / Indefinida / No definida en ℝ), o null si es graficable o no es
   * una f(x). Extraída de `clasificarBloque` porque obs-derivate necesita clasificar la función
   * ESCRITA (no la derivada): `\frac{0}{0}` deriva a `0` y el bloque graficaba la recta y=0 con
   * su derivada "f'(x) = 0" — un resultado inventado sobre una función que no existe.
   */
  private degeneradaDeEcuacion(ec: string): FuncionDegenerada | null {
    // Función del parámetro (`x(t)=…`, o una expresión suelta en `t`): el motor la grafica como
    // explícita con la abscisa renombrada a x, así que se clasifica sobre ESA (compilar la `t`
    // contra `x` daría NaN en todo el eje → falso "Indeterminada" sobre una curva bien dibujada).
    const comp = funcionDelParametro(ec);
    if (comp) {
      const enX = renombrarParametroAX(insertarProductoImplicito(normalizarEntrada(comp.expr.trim())));
      try {
        return clasificarDegenerada(compilarFuncion(enX, "x"));
      } catch {
        return null;
      }
    }

    const partes = ec.split("=");
    let expr: string | null = null;
    if (partes.length === 1) expr = partes[0];
    else if (partes.length === 2) {
      if (normalizarEntrada(partes[0].trim()) === "y") expr = partes[1];
      else if (normalizarEntrada(partes[1].trim()) === "y") expr = partes[0];
    }
    if (expr === null) return null; // no es y=f(x): sin clasificación
    if (expr.trim() === "") {
      // "y=" a medio escribir: no es una indeterminación, aún no hay expresión.
      return { ...t().velo.sinFuncion };
    }
    try {
      // MISMA normalización que grafica el motor (`construirObjeto.norm`): incluye el
      // producto implícito. Sin él, `\pi(2x+4)` quedaba como `pi(2x+4)`, que mathjs lee
      // como LLAMADA a `pi` (no es función) → NaN en todo x → falso "Indeterminada".
      const norm = insertarProductoImplicito(normalizarEntrada(expr.trim()));
      // Expresión suelta con `y` libre: NO es f(x) — el motor la grafica como implícita
      // expr=0 (`construirObjeto`); compilarla solo con x daría NaN en todo el eje y un
      // falso "Indeterminada" sobre una curva bien dibujada.
      if (contieneYLibre(norm)) return null;
      const evalX = compilarFuncion(norm, "x");
      return clasificarDegenerada(evalX);
    } catch {
      return null; // no compila: el motor ya no dibuja nada; sin etiqueta formal
    }
  }

  /**
   * Expresión f(x) de un bloque obs-graph (la 1ª ecuación, si es explícita y=f(x)),
   * NORMALIZADA a sintaxis mathjs, o null si no aplica (sistema, vacío, implícita,
   * paramétrica…). Es la MISMA que grafica el motor, así que el resumen ⓘ coincide
   * con lo dibujado.
   */
  private exprExplicita(ecuaciones: readonly string[]): string | null {
    if (this.sistema || ecuaciones.length === 0) return null;
    // Solo las curvas EXPLÍCITAS (y=f(x) o expresión suelta) tienen un f(x) que
    // compilar. Las PARAMÉTRICAS `(X, Y)` (sin `=`, caían al caso "expresión suelta"),
    // implícitas y polares NO → null (el ⓘ geométrico las cubre). Sin este filtro,
    // `montarBotonInfo` compilaba la tupla como f(x) y `compilarFuncion` lanzaba
    // ("Parenthesis ) expected"), abortando el render del plano (bug de paramétricas).
    let tipo: string;
    try { tipo = construirObjeto(ecuaciones[0], "info").tipo; } catch { return null; }
    if (tipo !== "explicita") return null;
    // Función del parámetro. Con el valor en la ORDENADA (`y(t)=…`, o una expresión suelta en
    // `t`) el ⓘ vale tal cual: es la gráfica clásica, solo que la abscisa se llama `t` → se
    // analiza la MISMA f que grafica el motor (la renombrada t→x). Con el valor en la ABSCISA
    // (`x(t)=…`) la curva sale TUMBADA: las "raíces" y los "vértices" de f no son los del dibujo
    // (están en el otro eje) → sin ⓘ analítico, antes que describir una curva que no es esa.
    const comp = funcionDelParametro(ecuaciones[0]);
    if (comp) {
      if (comp.eje === "x") return null;
      const enX = renombrarParametroAX(insertarProductoImplicito(normalizarEntrada(comp.expr.trim())));
      return enX === "" ? null : enX;
    }
    const partes = ecuaciones[0].split("=");
    let expr: string | null = null;
    if (partes.length === 1) expr = partes[0];
    else if (partes.length === 2) {
      if (normalizarEntrada(partes[0].trim()) === "y") expr = partes[1];
      else if (normalizarEntrada(partes[1].trim()) === "y") expr = partes[0];
    }
    if (expr === null) return null;
    // MISMA normalización que grafica el motor (producto implícito incluido): el ⓘ
    // analiza EXACTAMENTE la f(x) dibujada (`\pi(2x+4)` → `pi*(2*x+4)`, no `pi(2x+4)`).
    const norm = insertarProductoImplicito(normalizarEntrada(expr.trim()));
    return norm === "" ? null : norm;
  }

  /** Nombre traducido de la familia clásica reconocida. */
  private nombrePatron(p: PatronPolar): string {
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
  private lineasPolar(a: AnalisisPolar): string[] {
    const T = t().polar;
    const lineas: string[] = [];

    const familia = a.patron ? this.nombrePatron(a.patron) : null;
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
  private nombreFamilia(f: FamiliaParametrica): string {
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
  private lineasParametricas(a: AnalisisParametrico): string[] {
    const T = t().parametrica;
    const lineas: string[] = [];

    const familia = a.familia ? this.nombreFamilia(a.familia) : null;
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
  private intervaloATexto(a: number, b: number): string {
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
  private lineasDerivada(
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
          this.intervaloATexto(tramo.a, tramo.b)));

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
   * Botón ⓘ + popover del bloque obs-derivate. Devuelve si llegó a montarse.
   *
   * `fExpr` es la función ESCRITA (cruda) y `dfExpr` la derivada ya normalizada que grafica
   * el motor: hacen falta las dos, porque todo se enmascara por el dominio de f (f′ = 1/x
   * evalúa en x<0, donde ln x no existe) y porque los puntos angulosos se buscan donde f es
   * continua pero f′ no. Perezoso y cacheado, como el de las integrales.
   */
  private montarBotonInfoDerivada(
    wrap: HTMLElement, fExpr: string, dfExpr: string,
    lado: number, exclusion: ExclusionPopover
  ): boolean {
    let f: (x: number) => number;
    let df: (x: number) => number;
    try {
      // mathjs puede devolver Complex (√−1): fuera del dominio real = NaN, el mismo
      // contrato que `crearFuncionReal` y que usa el resumen cartesiano.
      const fc = compilarFuncion(insertarProductoImplicito(normalizarEntrada(fExpr)), "x");
      const dc = compilarFuncion(dfExpr, "x");
      f = (x) => { const v = fc(x); return typeof v === "number" ? v : NaN; };
      df = (x) => { const v = dc(x); return typeof v === "number" ? v : NaN; };
    } catch { return false; }

    const btnInfo = wrap.createDiv();
    this.ponerTooltip(btnInfo, t().botones.resumenDerivada);
    btnInfo.style.cssText = this.estiloChipInfo(lado);
    this.montarIcono(btnInfo, "info", ladoIcono(lado));

    const pop = wrap.createDiv();
    pop.style.cssText = this.estiloPopoverInfo(lado);
    exclusion.registrar(() => pop.setCssStyles({ display: "none" }));

    const esTrig = tieneTrigonometria(dfExpr);
    let montado = false;
    const rellenar = () => {
      if (montado) return;
      montado = true;
      let A: AnalisisDerivada | null = null;
      try { A = analizarDerivada(f, df); } catch { /* sin panel, nunca una excepción */ }
      if (!A) return;
      for (const l of this.lineasDerivada(A, esTrig)) {
        const div = pop.createDiv({ text: l.texto });
        // Los ítems de una lista se sangran para que se lean como lo que son: el
        // desglose de la línea de arriba, no cinco afirmaciones sueltas seguidas.
        if (l.sangrado) div.setCssStyles({ paddingLeft: "10px" });
      }
    };

    btnInfo.addEventListener("click", (e) => {
      e.stopPropagation();
      const abierto = pop.style.display !== "none";
      if (!abierto) { exclusion.alAbrir(); rellenar(); }
      pop.setCssStyles({ display: abierto ? "none" : "block" });
    });
    return true;
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
  private lineasIntegral(
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

  /**
   * Botón ⓘ + popover del bloque obs-integral. Devuelve si llegó a montarse (el llamador
   * necesita saberlo para colocar el botón f(x): los chips comparten esquina).
   *
   * El análisis se calcula PEREZOSAMENTE al abrir el cuadro y se cachea, como el de las
   * paramétricas: descomponer la integral son hasta siete cuadraturas más, y el bloque ya
   * hace dos al montarse (la clasificación del velo y el valor del panel). En un clic no se
   * nota; al montar una nota con varios bloques, sí. El contenido NO depende de la vista
   * —una integral definida es propiedad de (f, a, b), no del encuadre—, así que una vez
   * calculado no hay nada que refrescar al mover la cámara.
   */
  private montarBotonInfoIntegral(
    wrap: HTMLElement, source: string, ctx: MarkdownPostProcessorContext,
    lado: number, exclusion: ExclusionPopover
  ): boolean {
    const it = extraerIntegral(source);
    if (!it) return false;
    const a = evaluarLimite(it.a), b = evaluarLimite(it.b);
    if (a === null || b === null) return false;   // límites simbólicos: el velo ya lo dice

    const btnInfo = wrap.createDiv();
    // Tooltip propio: este chip no resume "puntos notables" de ninguna curva.
    this.ponerTooltip(btnInfo, t().botones.resumenIntegral);
    btnInfo.style.cssText = this.estiloChipInfo(lado);
    this.montarIcono(btnInfo, "info", ladoIcono(lado));

    const pop = wrap.createDiv();
    pop.style.cssText = this.estiloPopoverInfo(lado);
    exclusion.registrar(() => pop.setCssStyles({ display: "none" }));

    let montado = false;
    const rellenar = () => {
      if (montado) return;
      montado = true;
      let A: AnalisisIntegral | null = null;
      try {
        A = analizarIntegral(
          crearFuncionReal(insertarProductoImplicito(normalizarEntrada(it.integrando))), a, b);
      } catch { /* integrando que no compila: sin panel, nunca una excepción al abrir */ }
      if (!A) return;
      for (const l of this.lineasIntegral(A, it.variable, source)) {
        const div = pop.createDiv({ text: l.texto });
        // La parte con forma cerrada (el valor) va en KaTeX dentro de la línea, por el
        // mismo helper que el resumen cartesiano; la cola vuelve a texto plano detrás.
        if (l.tex) this.montarEtiquetaMath(div.createSpan(), l.tex, ctx);
        if (l.cola) div.createSpan({ text: l.cola });
      }
    };

    btnInfo.addEventListener("click", (e) => {
      e.stopPropagation();
      const abierto = pop.style.display !== "none";
      if (!abierto) { exclusion.alAbrir(); rellenar(); }
      pop.setCssStyles({ display: abierto ? "none" : "block" });
    });
    return true;
  }

  /**
   * Botón ⓘ + popover con el resumen de puntos notables de la función (portado del
   * GraphEngine): intersección con Y, raíces y vértices. Los grupos periódicos
   * (trig que oscila → "infinitas") o excesivos ("demasiadas") se resumen en vez de
   * enumerarse. El análisis es sobre el rango fijo de `analizarFuncion` (agnóstico
   * de la vista actual), igual que en el motor original.
   */
  private montarBotonInfo(
    wrap: HTMLElement, expr: string, ctx: MarkdownPostProcessorContext,
    lado: number, exclusion: ExclusionPopover
  ): void {
    // Defensivo: si `expr` no compila como f(x) (p.ej. una tupla paramétrica que se
    // colara), NO lanzar —abortaría el render del plano—, simplemente no montar el ⓘ.
    let evalX: (x: number) => number;
    // mathjs puede devolver un Complex (sqrt(-1)…) → fuera del dominio real = NaN
    // (mismo contrato que `crearFuncionReal`); aquí solo se usa como f(x) numérica.
    try {
      const evalXRaw = compilarFuncion(expr, "x");
      evalX = (x) => { const v = evalXRaw(x); return typeof v === "number" ? v : NaN; };
    } catch { return; }
    const analisis = analizarFuncion(evalX);
    const interseccionY = evalX(0);
    const esTrig = tieneTrigonometria(expr);
    // Un TRAMO de raíces (x∈[0,1) de ⌊x⌋) cuenta como UN elemento del grupo, no como
    // sus infinitos puntos: sin esto, floor caía en "demasiadas para mostrar".
    const estadoRaices = estadoGrupo(
      analisis.raices.length + analisis.intervalosRaiz.length, esTrig);
    const estadoVertices = estadoGrupo(analisis.vertices.length, esTrig);

    // Función idénticamente cero (simplifica a "0"): TODO x es raíz y la intersección
    // Y es (0,0). Se detecta como en el GraphEngine, con simplify sobre la expresión.
    let idénticamenteCero = false;
    try { idénticamenteCero = simplify(expr).toString() === "0"; } catch { /* no simplificable */ }

    // Cada línea es texto plano (fuente Lora, heredada de `.lmath-grafica`); si
    // lleva `tex`, esa parte MATEMÁTICA se renderiza con KaTeX a continuación del
    // texto. Así el prefijo "Raíces:" queda como texto normal (Lora) y solo la
    // expresión del conjunto (`x∈(1,∞)`) va en LaTeX.
    const T = t().resumen;
    const lineas: { texto: string; tex?: string }[] = [];
    if (idénticamenteCero) {
      lineas.push({ texto: T.interseccionYCero });
      lineas.push({ texto: T.identicamenteCero });
    } else {
      lineas.push({
        texto: Number.isFinite(interseccionY)
          ? T.interseccionY(numeroATexto(interseccionY))
          : T.interseccionYNoDefinida,
      });
      if (estadoRaices === "infinitas") lineas.push({ texto: T.raicesInfinitas });
      else if (estadoRaices === "demasiadas") lineas.push({ texto: T.raicesDemasiadas });
      else if (analisis.intervalosRaiz.length > 0)
        // Raíces por TRAMOS (escalones): "Raíces:" como texto normal (Lora) y el
        // conjunto en notación de intervalos renderizado en KaTeX a continuación.
        lineas.push({ texto: T.raicesPrefijo, tex: raicesALatex(analisis.intervalosRaiz, analisis.raices) });
      else if (analisis.raices.length > 0)
        lineas.push({ texto: T.raicesPrefijo + analisis.raices.map(numeroATexto).join(", ") });
      else lineas.push({ texto: T.noRaices });

      if (estadoVertices === "infinitas") lineas.push({ texto: T.verticesInfinitos });
      else if (estadoVertices === "demasiadas") lineas.push({ texto: T.verticesDemasiados });
      else if (analisis.vertices.length > 0)
        for (const v of analisis.vertices)
          lineas.push({
            texto: (v.tipo === "min" ? T.verticeMin : T.verticeMax)(
              numeroATexto(v.x), numeroATexto(v.y)),
          });
      else lineas.push({ texto: T.noVertices });
    }

    const btnInfo = wrap.createDiv();
    this.ponerTooltip(btnInfo, t().botones.resumenNotables);
    btnInfo.style.cssText = this.estiloChipInfo(lado);
    this.montarIcono(btnInfo, "info", ladoIcono(lado));

    const pop = wrap.createDiv();
    pop.style.cssText = this.estiloPopoverInfo(lado);
    exclusion.registrar(() => pop.setCssStyles({ display: "none" }));
    for (const l of lineas) {
      const div = pop.createDiv({ text: l.texto });
      // La parte matemática (p. ej. `x\in[0,1)`) va renderizada con KaTeX en línea,
      // por el mismo helper que los glifos del toggle; hereda color y tamaño.
      if (l.tex) this.montarEtiquetaMath(div.createSpan(), l.tex, ctx);
    }

    btnInfo.addEventListener("click", (e) => {
      e.stopPropagation();
      const abierto = pop.style.display !== "none";
      if (!abierto) exclusion.alAbrir();   // la fórmula flotante y este cuadro no conviven
      pop.setCssStyles({ display: abierto ? "none" : "block" });
    });
  }
}
