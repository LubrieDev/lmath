// ─────────────────────────────────────────────
// host-obsidian · info/plano — los dos cuadros ⓘ que dependen de la VISTA
// ─────────────────────────────────────────────
//
// Los ⓘ de `info/botones.ts` describen una fórmula y se escriben una vez. Estos dos no:
// leen lo que hay en el plano AHORA —las soluciones del sistema con el valor vivo de cada
// parámetro, los puntos notables de la vista actual— y por eso devuelven un refrescador que
// `process()` vuelve a llamar en cada pasada final.
//
// `escena` se REASIGNA cuando se mueve un mando, y `camara` se construye después de
// declararse, así que ambas entran como ACCESORES y no como valores: capturarlas dejaría el
// cuadro describiendo la escena de antes de tocar el deslizador.

import type { ExclusionPopover } from "./contratos";
import { estiloChipInfo, estiloPopoverInfo } from "../ui/estilos";
import { ponerTooltip, montarIcono } from "../ui/controles";
import { lineasPolar, lineasParametricas } from "../analysis/lineasAnalisis";
import { t } from "../../i18n";
import { normalizarEntrada } from "../../parser";
import { tieneTrigonometria, estadoGrupo } from "../../analisis";
import { insertarProductoImplicito } from "../../core/parsing/productoImplicito";
import { construirObjeto, expresionPolar, expresionesParametricas } from "../../core/parsing/construirObjeto";
import { analizarPolar } from "../../core/analysis/analisisPolar";
import { analizarParametrico, type AnalisisParametrico } from "../../core/analysis/analisisParametrico";
import { numeroATexto } from "../../core/analysis/formatoNumero";
import { formatearNumero } from "../../core/rendering/overlay/Overlay";
import type { Parametro } from "../../core/parsing/parametros";
import type { Camara } from "../../core/interaction/Camara";
import type { crearMotor } from "../../core/app/composicion";
import { resolverBloque } from "../../math/resolverSistema";
import { DOMINIO_X } from "../../math/numerico";
import { aTexto as racionalATexto } from "../../math/racional";

// La escena es la MISMA que compone `process()`; el tipo se deriva de su fábrica en vez de
// reescribirse aquí, para que no pueda quedarse desfasado. `crearMotorSistema` devuelve este
// mismo tipo —las dos componen la misma escena, con proveedores distintos—, así que basta una.
type Escena = ReturnType<typeof crearMotor>;

/**
 * ⓘ de obs-system: las intersecciones que el motor matemático deduce de las ecuaciones
 * ESCRITAS (no de la geometría trazada). Devuelve el refrescador para las pasadas finales.
 */
export function montarInfoSistema(
  wrap: HTMLElement,
  lado: number,
  iconoChip: number,
  exclusion: ExclusionPopover,
  visibles: readonly string[],
  paraMotor: (s: string) => string
): () => void {
const btnSolucion = wrap.createDiv();
ponerTooltip(btnSolucion, t().botones.solucionesSistema);
btnSolucion.style.cssText = estiloChipInfo(lado);
montarIcono(btnSolucion, "info", iconoChip);

const popSolucion = wrap.createDiv();
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
// Nº de soluciones halladas EN EL INTERVALO EXPLORADO a partir del cual se concluye que el
// sistema las repite sin fin. Ya no cuenta las de la vista: la vista no entra en esto.
const MIN_PERIODICO = 3;

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
  // Infinitas por PERIODICIDAD. Solo puede pasar por el camino numérico: un sistema
  // polinómico no es periódico, así que sus soluciones son finitas y ya están todas.
  if (r.aproximado && sistemaPeriodico && pts.length >= MIN_PERIODICO) {
    popSolucion.createDiv({ text: t().solucion.infinitasPeriodico });
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
    // La forma EXACTA cuando la hay (`0`, `3/2`), y el decimal cuando no. Es lo que
    // distingue este panel del anterior: `0` en vez de `8.4e-6`.
    const x = p.exactoX !== null ? racionalATexto(p.exactoX) : formatearNumero(p.x);
    const y = p.exactoY !== null ? racionalATexto(p.exactoY) : formatearNumero(p.y);
    popSolucion.createDiv({ text: `(${x}, ${y})` });
  }
  if (pts.length > MAX_LISTA) {
    popSolucion.createDiv({
      text: t().solucion.yMas(pts.length - MAX_LISTA),
      attr: { style: "opacity:0.6;" },
    });
  }
  // El pie solo aparece cuando de verdad hay algo que matizar. Un sistema polinómico no
  // lleva ninguno: su lista es completa sobre ℝ y añadirle una coletilla sugeriría una
  // limitación que no tiene.
  if (r.aproximado) {
    popSolucion.createDiv({
      text: t().solucion.enIntervalo(String(DOMINIO_X[0]), String(DOMINIO_X[1])),
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
 * ⓘ geométrico de obs-graph para las curvas que NO son y=f(x) (implícitas, polares,
 * paramétricas): el resumen sale de la geometría cacheada, o del análisis propio de r(θ)
 * y de (x(t), y(t)) cuando la curva tiene uno. Devuelve el refrescador.
 */
export function montarInfoGeometrico(
  wrap: HTMLElement,
  lado: number,
  iconoChip: number,
  exclusion: ExclusionPopover,
  graficadas: readonly string[],
  parametros: readonly Parametro[],
  escenaViva: () => Escena,
  camaraViva: () => Camara
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

const btnInfo = wrap.createDiv();
ponerTooltip(btnInfo, t().botones.resumenNotables);
btnInfo.style.cssText = estiloChipInfo(lado);
montarIcono(btnInfo, "info", iconoChip);

const pop = wrap.createDiv();
pop.style.cssText = estiloPopoverInfo(lado);
exclusion.registrar(() => pop.setCssStyles({ display: "none" }));

const refrescarInfo = () => {
  pop.empty();

  // Ramas propias (polar y paramétrica): resumen intrínseco de la curva, sin el pie
  // "en la vista actual" —no lo está: describen la curva entera sobre su intervalo—.
  if (infoPolar) {
    for (const linea of lineasPolar(infoPolar)) pop.createDiv({ text: linea });
    return;
  }
  const param = analisisParametrico();
  if (param) {
    for (const linea of lineasParametricas(param)) pop.createDiv({ text: linea });
    return;
  }

  const r = escenaViva().resumenNotables(camaraViva().viewport());
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
