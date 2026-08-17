// ─────────────────────────────────────────────
// host-obsidian · ui/scrollerLatex — el panel de fórmula con scroll y fades
// ─────────────────────────────────────────────
//
// Portado del GraphEngine y compartido por los cinco bloques que muestran una fórmula.
// Es la pieza de interfaz más grande del adaptador y no tiene nada que ver con graficar,
// así que tenerla dentro solo servía para hacerlo más largo.

import {
  MarkdownRenderChild,
  MarkdownRenderer,
  type MarkdownPostProcessorContext,
} from "obsidian";

import {
  PAD_SUP_PANEL, PAD_LADO_PANEL, HUECO_TARJETAS,
  ALTO_TARJETA, ALTO_TARJETA_MAX, aplicarCajaPanel,
  type Reparto,
} from "./reparto";
import type { PluginConAjustes } from "../ajustes";

// Estilo visual de una tarjeta de fórmula del panel izquierdo. Enum (no un booleano
// `alwaysFramed`) para que el catálogo de estilos crezca sin multiplicar banderas: hoy
// "enmarcado" (caja redondeada, la ÚNICA que usa el panel: regla "una expresión = una
// tarjeta") y "plano" (sin recuadro, llena el hueco), reservado para futuros paneles.
//
// Vive aquí, con el único módulo que lo consume, y no en el adaptador: el estilo de una
// tarjeta es asunto del panel que la pinta.
export type EstiloTarjeta = "plano" | "enmarcado";

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
export function crearScrollerLatex(
  plugin: PluginConAjustes,
  contenedor: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  limpieza: MarkdownRenderChild,
  reparto: Reparto
): {
  panelLatex: HTMLElement;
  /** La caja de las tarjetas. Se expone para poder APAGARLA cuando el panel enseña otra
   *  vista que no son fórmulas —hoy, los mandos de los parámetros—. */
  zona: HTMLElement;
  renderLatex: (latex: string | readonly string[]) => Promise<void>;
} {
  // Las constantes de layout del panel (`PAD_SUP_PANEL`, `PAD_LADO_PANEL`, `HUECO_TARJETAS`,
  // `ALTO_TARJETA`, `ALTO_TARJETA_MAX`) viven a nivel de módulo: se derivan entre sí para que
  // el alto de una tarjeta única case EXACTO con el de una ranura del par "ambas", y
  // `altoPanelPorTarjetas` —que es quien decide cuánto alto pide un obs-vector— tiene que leer
  // exactamente los mismos números.
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
      ? `${PAD_SUP_PANEL}px ${PAD_LADO_PANEL}px ${PAD_LADO_PANEL}px ${PAD_LADO_PANEL}px`
      : `${PAD_LADO_PANEL}px`;
    zona.style.gap = `${HUECO_TARJETAS}px`;
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
  // que el panel (`--lmath-tarjeta`, un escalón por debajo de `--lmath-panel`; ver el
  // token en styles.css, y ojo: es también el color con el que degradan los fades
  // laterales, así que los dos se mueven juntos o el borde del fade canta); "plano" la deja sin recuadro
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
          "background:var(--lmath-tarjeta);"
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
    const fadeColor = "var(--lmath-tarjeta)";
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
        plugin.app, "$$" + formula + "$$", a.area, ctx.sourcePath, limpieza
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

  return { panelLatex, zona, renderLatex };
}
