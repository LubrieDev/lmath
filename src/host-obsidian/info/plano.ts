// ─────────────────────────────────────────────
// host-obsidian · info/plano — los dos cuadros ⓘ que se REFRESCAN
// ─────────────────────────────────────────────
//
// Los ⓘ de `info/botones.ts` describen una fórmula y se escriben una vez. Estos dos no: lo que
// dicen depende del valor VIVO de cada parámetro, así que devuelven un refrescador que
// `process()` vuelve a llamar en cada pasada final, y las ecuaciones entran como ACCESORES y no
// como valores —capturarlas dejaría el cuadro describiendo la curva de antes de tocar el mando—.
//
// Lo que ya NO depende es la VISTA. Los dos cuadros responden desde las ecuaciones escritas:
// el del sistema desde que las soluciones las calcula `src/math/`, y el geométrico desde que
// los puntos notables de una implícita salen de resolver tres sistemas (`notablesDeImplicita`)
// en vez de mirar la polilínea trazada dentro del encuadre. Por eso ninguno de los dos recibe
// ya la cámara, y por eso el segundo ha dejado de terminar en «En la vista actual».

import type {
  MarkdownRenderChild, MarkdownPostProcessorContext,
} from "obsidian";

import type { ExclusionPopover } from "./contratos";
import { estiloChipInfo, estiloPopoverInfo, CLASE_POPOVER_INFO } from "../ui/estilos";
import { ponerTooltip, montarIcono, pintarMathEnLinea, pintarLineaPanel } from "../ui/controles";
import type { PluginConAjustes } from "../ajustes";
import { lineasPolar, lineasParametricas, lineasImplicita } from "../analysis/lineasAnalisis";
import { notablesDeImplicita, type NotablesImplicita } from "../../math/notablesImplicita";
import { t } from "../../i18n";
import { normalizarEntrada } from "../../parser";
import { tieneTrigonometria } from "../../analisis";
import { insertarProductoImplicito } from "../../core/parsing/productoImplicito";
import { construirObjeto, expresionPolar, expresionesParametricas } from "../../core/parsing/construirObjeto";
import { analizarPolar } from "../../core/analysis/analisisPolar";
import { analizarParametrico, type AnalisisParametrico } from "../../core/analysis/analisisParametrico";
import type { Parametro } from "../../core/parsing/parametros";
import { resolverBloque } from "../../math/resolverSistema";
import { DOMINIO_X } from "../../math/numerico";
import { infinitasPorPeriodicidad } from "./infinitasPeriodicas";
import { solucionALatex, solucionATexto } from "./latexSolucion";

/**
 * ⓘ de obs-system: las intersecciones que el motor matemático deduce de las ecuaciones
 * ESCRITAS (no de la geometría trazada). Devuelve el refrescador para las pasadas finales.
 */
export function montarInfoSistema(
  plugin: PluginConAjustes,
  wrap: HTMLElement,
  lado: number,
  iconoChip: number,
  exclusion: ExclusionPopover,
  visibles: readonly string[],
  paraMotor: (s: string) => string,
  ctx: MarkdownPostProcessorContext,
  limpieza: MarkdownRenderChild
): () => void {
const btnSolucion = wrap.createDiv();
ponerTooltip(btnSolucion, t().botones.solucionesSistema);
btnSolucion.style.cssText = estiloChipInfo(lado);
montarIcono(btnSolucion, "info", iconoChip);

const popSolucion = wrap.createDiv({ cls: CLASE_POPOVER_INFO });
popSolucion.style.cssText = estiloPopoverInfo(lado);
exclusion.registrar(() => popSolucion.setCssStyles({ display: "none" }));

// ¿El sistema es PERIÓDICO? (alguna ecuación usa una función trig como sin/
// cos/tan…). Un sistema periódico repite sus soluciones sin fin → si además
// hay varias en la vista, son INFINITAS (discretas, pero ilimitadas), que es
// distinto del solape continuo y de la mera saturación del cap. Mismo criterio
// que el motor antiguo para las raíces de una trig (ver analisis.estadoGrupo).
const sistemaPeriodico = visibles.some((ec) =>
  ec.split("=").some((lado) =>
    tieneTrigonometria(insertarProductoImplicito(normalizarEntrada(lado.trim())))));

const MAX_LISTA = 20; // cap visual; los marcadores del plano no se capan
/**
 * Las soluciones las calcula el MOTOR MATEMÁTICO (`src/math/`) a partir de las ecuaciones
 * escritas, no de la geometría trazada.
 *
 * Es el cambio de fondo de este panel, y conviene dejar dicho de qué se sale: antes las
 * soluciones eran los cruces de las POLILÍNEAS, recortadas además a la vista. Eso tenía dos
 * consecuencias que no eran matices. El valor dependía del trazado —la solución (0,0) de
 * `y=x` ∩ `y=x²` se leía (8.4e-6, 8.4e-6) después de mover el plano, porque el vértice de la
 * polilínea caía donde caía—, y CUÁLES aparecían dependía de la ventana, así que una
 * solución fuera de la vista sencillamente no existía.
 *
 * Ahora la respuesta sale de los coeficientes: es la misma con cualquier zoom y con
 * cualquier paneo, y en un sistema polinómico es EXACTA (el 0 es el 0) y completa sobre ℝ.
 *
 * Los MARCADORES del plano siguen viniendo de la geometría: son un punto sobre un trazo, y
 * ahí la diferencia es de millonésimas de píxel. Lo que se leía mal era la lista.
 */
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
  // Con los parámetros ya SUSTITUIDOS por su valor vivo: `y = Ax` no es una ecuación que el
  // motor pueda resolver —`A` es un símbolo libre—, pero `y = (1)x` sí. Y se sustituye aquí
  // dentro, en cada refresco, para que mover un deslizador cambie también las soluciones;
  // capturarlas fuera dejaría el panel describiendo una recta que ya no está en el plano.
  const r = resolverBloque(visibles.map(paraMotor));
  // Infinitas por SOLAPE: las curvas coinciden en un tramo. Va primero porque no es «muchas
  // soluciones», es una solución continua, y enumerarla no tendría sentido. Lo decide el
  // motor (factor común entre los polinomios), no el aspecto del dibujo.
  if (r.tipo === "solape") {
    popSolucion.createDiv({ text: t().solucion.infinitasCoinciden });
    return;
  }
  if (r.tipo === "noResoluble") {
    popSolucion.createDiv({ text: t().solucion.noResoluble });
    return;
  }
  const pts = r.puntos;
  // Infinitas por PERIODICIDAD, con el criterio de `infinitasPeriodicas.ts`: no basta con que
  // haya una trigonométrica —`y = sin x` ∩ `y = x/2` tiene exactamente tres soluciones y se
  // anunciaban como infinitas—, las soluciones tienen que seguir apareciendo hasta el borde de
  // lo explorado.
  if (infinitasPorPeriodicidad(r, sistemaPeriodico)) {
    popSolucion.createDiv({ text: t().solucion.infinitasPeriodico });
    return;
  }
  if (pts.length === 0) {
    // «No se cortan» es una AFIRMACIÓN, y solo se puede hacer si se ha mirado en todas partes.
    // Con alguna pareja sin resolver, la lista vacía no dice que no haya soluciones: dice que no
    // se han encontrado, que es otra cosa.
    popSolucion.createDiv({
      text: r.parcial ? t().solucion.sinSolucionParcial : t().solucion.sinSolucion,
    });
    return;
  }
  popSolucion.createDiv({
    text: pts.length === 1 ? t().solucion.unaSolucion : t().solucion.nSoluciones(pts.length),
    attr: { style: "font-weight:600; margin-bottom:4px;" },
  });
  for (const p of pts.slice(0, MAX_LISTA)) {
    // La forma EXACTA cuando la hay, y el decimal solo cuando no la hay. Es lo que distingue
    // este panel del anterior: `0` en vez de `8.4e-6`, y `(7 - √13)/2` en vez de `1.697`. El
    // decimal deja de ser la respuesta y pasa a ser el último recurso.
    //
    // Y se pinta como MATEMÁTICA, no como texto: en cuanto la coordenada es una fracción con
    // un radical dentro, el texto plano obliga a contar paréntesis para saber dónde acaba el
    // numerador y cuál es la coma que separa el par. La raya de fracción lo dice sola.
    // Sin tamaño propio: el cuadro de soluciones se lee como los otros cuatro ⓘ, y el tamaño
    // de su matemática es el que ya tenían las líneas compuestas de aquellos.
    const linea = popSolucion.createDiv({ attr: { style: "margin:2px 0;" } });
    pintarMathEnLinea(
      plugin, linea, solucionALatex(p), ctx.sourcePath, limpieza, solucionATexto(p));
  }
  if (pts.length > MAX_LISTA) {
    popSolucion.createDiv({
      text: t().solucion.yMas(pts.length - MAX_LISTA),
      attr: { style: "opacity:0.6;" },
    });
  }
  // Los pies solo aparecen cuando de verdad hay algo que matizar, y son DOS cosas distintas:
  // de dónde salen los valores (`aproximado`, con su intervalo) y si se enumeró todo
  // (`parcial`). Un sistema polinómico resuelto entero no lleva ninguno: su lista es completa
  // sobre ℝ y añadirle una coletilla sugeriría una limitación que no tiene.
  if (r.aproximado) {
    // La variable que de verdad se barrió: el camino numérico recorre x cuando las curvas son
    // `y = f(x)` y recorre y cuando están tumbadas (`x = g(y)`). Escribir siempre «x» sería
    // prometer un intervalo que no se ha explorado.
    const exploradas = r.exploradas.length > 0 ? r.exploradas.join(", ") : "x";
    popSolucion.createDiv({
      text: t().solucion.enIntervalo(String(DOMINIO_X[0]), String(DOMINIO_X[1]), exploradas),
      attr: { style: "margin-top:4px; opacity:0.6;" },
    });
  }
  if (r.parcial) {
    popSolucion.createDiv({
      text: t().solucion.parcial,
      attr: { style: "margin-top:4px; opacity:0.6;" },
    });
  }
};
// Si el popover está abierto cuando aterriza una pasada final, se refresca.
const alRecalcularFinal = () => {
  if (popSolucion.style.display !== "none") refrescarSolucion();
};
btnSolucion.addEventListener("click", (e) => {
  e.stopPropagation();
  const abierto = popSolucion.style.display !== "none";
  if (!abierto) { exclusion.alAbrir(); refrescarSolucion(); }
  popSolucion.setCssStyles({ display: abierto ? "none" : "block" });
});
  return alRecalcularFinal;
}

/**
 * ⓘ de obs-graph para las curvas que NO son y=f(x): el análisis propio de r(θ) y de
 * (x(t), y(t)) cuando la curva tiene uno, y para una implícita, lo que se deduce de su
 * ECUACIÓN. Devuelve el refrescador.
 *
 * Ya no recibe la escena ni la cámara, y esa ausencia es el cambio: mientras las tuvo, el
 * resumen de una implícita salía de la polilínea trazada y recortada al encuadre, así que la
 * respuesta cambiaba al mover el plano y el cuadro tenía que terminar diciendo «En la vista
 * actual». Sin esa puerta no se puede volver a hacer sin querer.
 */
export function montarInfoGeometrico(
  plugin: PluginConAjustes,
  wrap: HTMLElement,
  lado: number,
  iconoChip: number,
  exclusion: ExclusionPopover,
  graficadas: readonly string[],
  parametros: readonly Parametro[],
  ecuacionViva: () => string,
  ctx: MarkdownPostProcessorContext,
  limpieza: MarkdownRenderChild
): () => void {
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
// Con parámetros, tampoco el análisis de r(θ): se calcula UNA vez porque describe la curva
// entera y no lo que se ve, así que un mando lo dejaría hablando de la rosa de antes. Sin
// él, el panel cae al resumen geométrico, que sí se recalcula.
const exprPolar = tipo === "polar" && parametros.length === 0
  ? expresionPolar(graficadas[0]) : null;
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

// Caché del análisis de la implícita, indexado por la ecuación CON los parámetros puestos
// (ver el uso, más abajo).
let ecuacionCache: string | null = null;
let notablesCache: NotablesImplicita | null = null;

const btnInfo = wrap.createDiv();
ponerTooltip(btnInfo, t().botones.resumenNotables);
btnInfo.style.cssText = estiloChipInfo(lado);
montarIcono(btnInfo, "info", iconoChip);

const pop = wrap.createDiv({ cls: CLASE_POPOVER_INFO });
pop.style.cssText = estiloPopoverInfo(lado);
exclusion.registrar(() => pop.setCssStyles({ display: "none" }));

// Las líneas de este cuadro llevan la matemática marcada entre `$…$` y se componen con
// KaTeX; el componente que sostiene esos renders es el del BLOQUE, porque el cuadro se
// repinta en cada pasada final (ver `pintarLineaPanel`).
const pintar = (linea: string, estilo?: string) =>
  pintarLineaPanel(
    plugin, pop.createDiv(estilo ? { attr: { style: estilo } } : undefined),
    linea, ctx.sourcePath, limpieza);

const refrescarInfo = () => {
  pop.empty();

  // Ramas propias (polar y paramétrica): resumen intrínseco de la curva, sin el pie
  // "en la vista actual" —no lo está: describen la curva entera sobre su intervalo—.
  if (infoPolar) {
    for (const linea of lineasPolar(infoPolar)) pintar(linea);
    return;
  }
  const param = analisisParametrico();
  if (param) {
    for (const linea of lineasParametricas(param)) pintar(linea);
    return;
  }

  // El resumen de una IMPLÍCITA sale de su ECUACIÓN, no del trazado ni del encuadre: son tres
  // sistemas que el motor matemático ya sabe resolver (ver `notablesDeImplicita`). Por eso este
  // cuadro ya no termina en «En la vista actual»: no describe una vista.
  //
  // Se cachea por la ecuación con los parámetros ya puestos. El refrescador se llama en cada
  // pasada final, y resolver tres sistemas por pasada para volver a escribir lo mismo sería
  // tirar el trabajo; mover un deslizador cambia esa cadena y el caché se renueva solo.
  const ecuacion = ecuacionViva();
  if (ecuacion !== ecuacionCache) {
    ecuacionCache = ecuacion;
    notablesCache = notablesDeImplicita(ecuacion);
  }
  const lineas = notablesCache === null
    // Ni siquiera es una ecuación de dos lados: no hay curva de la que afirmar nada, y
    // callar es la única respuesta honesta.
    ? [t().resumen.sinDeterminar]
    : lineasImplicita(notablesCache, esTrig);

  for (const linea of lineas) pintar(linea);
};
const alRecalcularFinal = () => {
  if (pop.style.display !== "none") refrescarInfo();
};
btnInfo.addEventListener("click", (e) => {
  e.stopPropagation();
  const abierto = pop.style.display !== "none";
  if (!abierto) { exclusion.alAbrir(); refrescarInfo(); }
  pop.setCssStyles({ display: abierto ? "none" : "block" });
});
  return alRecalcularFinal;
}
