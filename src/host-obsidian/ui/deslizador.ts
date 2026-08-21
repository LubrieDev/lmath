// ─────────────────────────────────────────────
// host-obsidian · ui/deslizador — el mando de un parámetro
// ─────────────────────────────────────────────
//
// El control deslizante hecho a mano (ver la nota larga de `montarDeslizador`: el nativo
// se descartó dos veces por motivos estructurales) y la caja de mandos que monta uno por
// parámetro declarado. Vive aparte porque es la única pieza de interfaz del adaptador con
// teclado, semántica ARIA y estado propio, y mezclarla con el resto la escondía.

import type { MarkdownPostProcessorContext } from "obsidian";

import { recorridoDe, type Parametro } from "../../core/parsing/parametros";
import { ALTO_MANDO_PARAMETRO } from "./reparto";
import { montarEtiquetaMath, ponerEtiquetaAccesible } from "./controles";
import { t } from "../../i18n";
import type { PluginConAjustes } from "../ajustes";

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
export function montarDeslizador(
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
    /**
     * Decimales del valor, para anunciarlo y para limpiar la basura del redondeo. Sin fijar,
     * ENTERO: es lo que quiere el ángulo de obs-trig, que fue el primer mando. Un parámetro se
     * mueve de centésima en centésima, y anunciar `1` mientras la curva dice `1,4` es
     * exactamente lo que un lector de pantalla no debe hacer.
     */
    decimales?: number;
    /**
     * Alto de la píldora. Sin fijar, 22: el del ángulo de obs-trig, que va solo en su franja.
     * Los mandos de los parámetros se apilan de tres o cuatro en el panel y necesitan ser más
     * bajos para que quepan junto a la fórmula sin robarle sitio.
     */
    alto?: number;
    /** Se llama con el valor ya redondeado al paso. */
    alCambiar: (valor: number) => void;
  }
): { fijarValor: (valor: number) => void } {
  // Geometría del mando: una PÍLDORA que ocupa el alto entero y un DISCO que corre por dentro,
  // separado del borde por `MARGEN`. Los tres números viven aquí porque son los que hacen la
  // cuenta del recorrido, y viajan a la hoja de estilos como propiedades: escribirlos otra vez
  // en el CSS daría dos verdades para una sola medida (la lección de `ALTO_CONTROLES_TRIG`).
  // Las tres medidas guardan proporción entre sí: la manija deja el mismo aire arriba que a
  // los lados, así que fijando el alto salen las otras dos. Viajan a la hoja de estilos como
  // propiedades; escribirlas otra vez en el CSS daría dos verdades para una sola medida (la
  // lección de `ALTO_CONTROLES_TRIG`).
  const ALTO = op.alto ?? 22;          // alto de la píldora, y de la caja
  const MARGEN = Math.max(2, Math.round(ALTO * 3 / 22));  // aire entre manija y borde
  const LADO = ALTO - 2 * MARGEN;      // diámetro de la manija
  const raiz = padre.createDiv({ cls: "lmath-slider" });
  raiz.tabIndex = 0;
  raiz.setAttribute("role", "slider");
  ponerEtiquetaAccesible(raiz, op.etiqueta);
  raiz.setAttribute("aria-valuemin", String(op.min));
  raiz.setAttribute("aria-valuemax", String(op.max));
  raiz.setCssProps({
    "--lmath-slider-alto": `${ALTO}px`,
    "--lmath-slider-manija": `${LADO}px`,
  });

  raiz.createDiv({ cls: "lmath-slider-pista" });
  const manija = raiz.createDiv({ cls: "lmath-slider-manija" });

  let valor = op.valor;
  const acotar = (v: number) => Math.max(op.min, Math.min(op.max, v));

  /** Coloca la manija sin redondear: al arrastrar el círculo, el ángulo es fraccionario. */
  const fijarValor = (v: number) => {
    valor = acotar(v);
    const u = op.max === op.min ? 0 : (valor - op.min) / (op.max - op.min);
    // El recorrido útil es el ancho MENOS la manija y sus dos márgenes, así que en los extremos
    // el disco queda dentro de la píldora. Se escribe con `calc` para no tener que medir el
    // ancho en cada refresco.
    manija.setCssProps({
      "--lmath-slider-x": `calc(${MARGEN}px + ${u} * (100% - ${LADO + 2 * MARGEN}px))`,
    });
    raiz.setAttribute("aria-valuenow", valor.toFixed(op.decimales ?? 0));
  };
  fijarValor(op.valor);

  const emitir = (v: number) => {
    // El redondeo a la rejilla deja basura binaria (`0,1+0,2`): recortar a los decimales del
    // paso la quita de una vez, y así el número que se anuncia, el que se enseña y el que
    // llega a la fórmula son EL MISMO. Tres formas distintas del mismo valor serían tres
    // sitios donde la interfaz puede contradecirse.
    const rejilla = Math.round(acotar(v) / op.paso) * op.paso;
    const redondeado = Number(rejilla.toFixed(op.decimales ?? 0));
    fijarValor(redondeado);
    op.alCambiar(redondeado);
  };

  /** Valor bajo el puntero, midiendo sobre el mismo recorrido útil que usa `fijarValor`. */
  const valorEn = (clientX: number): number => {
    const caja = raiz.getBoundingClientRect();
    const util = Math.max(1, caja.width - LADO - 2 * MARGEN);
    const u = (clientX - caja.left - MARGEN - LADO / 2) / util;
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

  // ── Que el arrastre sea SOLO del deslizador ─────────────────────────────────────────
  // Hay DOS cosas que pueden quedarse con este gesto, y hacen falta dos remedios distintos:
  //
  //   • El NAVEGADOR, que lo usaría para desplazar la nota. Eso lo apaga `touch-action:none`
  //     en la hoja de estilos, y con eso bastaba en el escritorio.
  //   • OBSIDIAN, que en el móvil tiene gestos propios —deslizar abre la barra lateral—
  //     escritos en JavaScript. `touch-action` no le dice nada a un `addEventListener`: sus
  //     escuchas seguían recibiendo el arrastre, así que mover la manija sacaba el menú
  //     lateral por detrás. Es lo que se ve en la captura del usuario.
  //
  // Como esas escuchas están en un ANTECESOR nuestro, la cura es que el evento no suba hasta
  // ellas: se detiene aquí, en la raíz del propio deslizador. El dedo que empieza sobre la
  // píldora es del deslizador y de nadie más; el que empieza fuera sigue siendo de Obsidian y
  // abre su barra lateral como siempre.
  //
  // Se paran las DOS familias, táctiles y de puntero, porque no sabemos con cuál está escrito
  // su gesto —el navegador emite las dos por el mismo dedo— y detener solo una dejaría medio
  // problema en pie. El `preventDefault` del `touchmove` es el segundo cinturón: un gesto que
  // mire `defaultPrevented` antes de moverse se abstiene aunque haya visto el evento.
  //
  // No se toca el `click` ni los eventos de ratón sintetizados: siguen subiendo, así que tocar
  // un deslizador continúa cerrando el menú ☰ que hubiera abierto (`cerrarMenuAlPulsarFuera`).
  const soloMio = (ev: Event) => ev.stopPropagation();
  for (const tipo of ["pointerdown", "pointermove", "pointerup", "pointercancel",
    "touchstart", "touchend", "touchcancel"] as const) {
    raiz.addEventListener(tipo, soloMio);
  }
  raiz.addEventListener("touchmove", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
  }, { passive: false });

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

  // El anillo de foco lo pone `.lmath-slider:focus-visible` en la hoja de estilos. Antes lo
  // pintaban un `focus` y un `blur` a mano, y además de ser estilo estático escrito en línea,
  // aparecía también al hacer clic — que es cuando nadie lo necesita, porque el dedo ya sabe
  // dónde está el mando. `:focus-visible` es exactamente esa distinción, hecha por el
  // navegador y sin código.

  return { fijarValor };
}

/**
 * La VISTA de mandos del panel: una fila por parámetro con su nombre, su valor y su
 * deslizador. La devuelve escondida; quien la enciende es la barra de vistas.
 *
 * Vive en el PANEL y no sobre el plano porque un mando pertenece a la fórmula: gobierna una de
 * sus letras. Y es una vista del panel —como el `\overrightarrow{AB}` de obs-vector o la
 * derivada evaluada de obs-derivate— y no una franja permanente: el panel es sitio dedicado a
 * UNA cosa a la vez, y partirlo en dos dejaría la fórmula a media altura para siempre.
 *
 * El nombre se pinta en LaTeX (`\alpha`, no `alpha`) por el mismo motivo por el que la
 * coletilla de una restricción se compone con las piezas escritas: un rótulo que no se parece
 * a lo que uno tecleó no se reconoce como suyo.
 */
export function montarCajaMandos(
  plugin: PluginConAjustes,
  panelLatex: HTMLElement,
  parametros: readonly Parametro[],
  ctx: MarkdownPostProcessorContext,
  alCambiar: (nombre: string, valor: number) => void
): HTMLElement {
  // Ocupa la misma caja que la zona de tarjetas y se alternan por `display`: son las dos
  // VISTAS del mismo panel, no dos cosas que compiten por el sitio. Construida una vez y
  // escondida, no reconstruida en cada cambio de vista: los mandos tienen estado (dónde está
  // cada manija) y rehacerlos lo perdería en cada ida y vuelta.
  const caja = panelLatex.createDiv({ cls: "lmath-parametros" });

  for (const p of parametros) {
    const fila = caja.createDiv({ cls: "lmath-parametro" });
    // El nombre va tal como se escribió; si lleva barra ya es LaTeX, y si no lo es igual
    // (una letra suelta es una fórmula válida). Mismo pipeline KaTeX que el panel.
    const nombre = fila.createDiv({ cls: "lmath-parametro-nombre" });
    montarEtiquetaMath(plugin, nombre, p.escrito, ctx);
    const r = recorridoDe(p.valor);
    const lectura = fila.createDiv({ cls: "lmath-parametro-valor" });
    lectura.setText(p.valor.toFixed(r.decimales));
    montarDeslizador(fila, {
      min: r.min, max: r.max, valor: p.valor,
      etiqueta: t().parametros.mando(p.escrito),
      paso: r.paso, pasoGrande: r.pasoGrande,
      decimales: r.decimales,
      alto: ALTO_MANDO_PARAMETRO,
      alCambiar: (v) => {
        lectura.setText(v.toFixed(r.decimales));
        alCambiar(p.nombre, v);
      },
    });
  }

  return caja;
}
