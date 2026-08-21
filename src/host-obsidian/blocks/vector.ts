// ─────────────────────────────────────────────
// host-obsidian · blocks/vector — el bloque obs-vector
// ─────────────────────────────────────────────
//
// La notación vectorial: UNA TARJETA POR LÍNEA (no una fórmula por bloque) y un plano solo
// si hay algo que dibujar. Tampoco usa el motor de curvas —un vector es un segmento, no una
// curva que muestrear—, pero sí `Camara` y `Navegacion`: el plano se recorre y se acerca
// igual que el de obs-graph, con el mismo cursor de puntería.
//
// Incluye su cuadro ⓘ, que deduce norma, dirección, cuadrante y relaciones entre vectores.

import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";

import { Camara } from "../../core/interaction/Camara";
import { Navegacion } from "../../core/interaction/Navegacion";
import { numeroATexto } from "../../core/analysis/formatoNumero";
import type { Viewport } from "../../core/contracts";
// Capa PURA del adaptador (`./analysis/`): clasificación formal del bloque y redacción de
// los paneles ⓘ. Vivían aquí dentro como métodos privados; no tocan el DOM, así que salieron
// a su propio módulo y ahora se pueden probar sin montar un bloque.
import {
  SEMI_Y_VECTOR, ANCHO_MINIMO_COLUMNAS, PROPORCION_PLANO_FLOTANTE, altoPanelPorTarjetas,
  ladoChip, ladoIcono, huecoChips, aplicarCajaPanel, avisarCambioDeReparto, esTemaOscuro,
  type Reparto,
} from "../ui/reparto";
// El chip ✎ y el salto al código de la nota: el mismo cromo táctil que monta obs-graph.
import { montarChipEditar } from "../ui/edicionBloque";
// Y su botón f(x), la puerta al panel cuando el bloque es estrecho.
import { montarBotonFormula } from "../ui/botonFormula";
// Capa de INTERFAZ del adaptador (`./ui/`): cromo, controles y el panel de fórmula. Eran
// métodos privados de esta clase y ninguno usaba `this` más que para llegar al plugin, así
// que son funciones libres: se leen sin la clase delante y se reutilizan desde los bloques.
import { estiloChipInfo, estiloPopoverInfo } from "../ui/estilos";
import { ponerTooltip, montarIcono, montarEtiquetaMath } from "../ui/controles";
import { crearScrollerLatex } from "../ui/scrollerLatex";
import { esTactil, esMovilVertical } from "../plataforma";
import { t } from "../../i18n";
import { Crosshair } from "../../core/rendering/Crosshair";
import { fijarTemaPlano } from "../../core/rendering/paleta";
import { modeloDeAngulo } from "../../trig/modeloTrig";
import { textoAngulo } from "../../trig/renderTrig";
import {
  parsearBloqueVector, dibujoDeBloque, hayDibujo, type DibujoVector,
} from "../../vector/bloqueVector";
import { bloqueVectorALatex, rotuloALatex } from "../../vector/latexVector";
import { dibujarVectores, encuadreDeDibujo, rotulosDeDibujo } from "../../vector/renderVector";
import { analizarDibujo, type Medida } from "../../vector/analisisVector";
// Motor MATEMÁTICO (`src/math/`): resuelve el sistema a partir de las ecuaciones escritas, sin
// mirar la vista. Ver la nota larga en `refrescarSolucion`.

import type { Motor } from "../contexto";
import type { FilaInfo } from "../info/contratos";
import { montarPanelVistas } from "../ui/paneles";

/**
 * Bloque obs-vector: notación vectorial.
 *
 * Es el bloque más pequeño del plugin, y a propósito. Dos diferencias con los demás explican
 * casi todo su código:
 *
 *  1. **Una tarjeta por LÍNEA.** En obs-graph el bloque entero es UNA fórmula (`f(x)=…`); aquí
 *     cada línea declara una cosa distinta —un vector, un punto, un campo— y apilarlas en una
 *     sola tarjeta las convertiría en un sistema de ecuaciones, que es otra afirmación. El
 *     scroller compartido ya sabe pintar varias tarjetas (la vista "ambas" de obs-derivate);
 *     lo único que hace falta es pedirle el alto que necesitan (`altoPanelPorTarjetas`).
 *  2. **El plano es CONDICIONAL.** Un bloque que solo escribe `F(x,y)=(-y,x)` o `∇f(x,y)` no
 *     tiene nada que dibujar, y un plano vacío al lado no es neutro: promete un dibujo que no
 *     llega. En ese caso el panel se queda el bloque entero y aquí se acaba el trabajo.
 *
 * Cámara, chips de zoom y panel ⓘ SÍ tiene, desde la 1.4.0: un vector largo junto a uno corto
 * no se puede mirar sin acercarse, que es la queja que abrió aquello. Lo que sigue sin tener es
 * OPCIONES, igual que obs-trig: sin sintaxis donde declararlas no hay dónde colgar la primera.
 */
export async function procesarVector(
  motor: Motor,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): Promise<void> {
  const contenedor = el.createDiv({ cls: "lmath-container" });
  const limpieza = new MarkdownRenderChild(contenedor);
  ctx.addChild(limpieza);
  motor.registrarRecarga(limpieza, source, el, ctx);

  // Mismo montaje oculto que el resto de bloques: el panel pasa por KaTeX y hay que esperarlo,
  // y en ese hueco el navegador pintaría un bloque a medias. Ver la nota larga en `process`.
  const revelar = () => contenedor.setCssStyles({ visibility: "visible" });
  contenedor.setCssStyles({ visibility: "hidden" });
  const redDeSeguridad = window.setTimeout(revelar, 2000);
  limpieza.register(() => window.clearTimeout(redDeSeguridad));

  const bloque = parsearBloqueVector(source);
  const formulas = bloqueVectorALatex(bloque);
  const dibujo = dibujoDeBloque(bloque);
  const conPlano = hayDibujo(dibujo);

  // ── Dos vistas cuando el bloque DEDUCE algo ──────────────────────────────────────────
  // Una línea como `AB` no es del mismo orden que `A=(1,2)`: la segunda declara y la primera
  // pide un resultado. Cuando conviven, el panel las separa como ya hacen obs-derivate y
  // obs-integral —el botón principal enseña lo declarado y el menú lleva al resultado— y de
  // paso resuelve un problema de sitio: apiladas, las tres tarjetas se reparten la columna a
  // partes iguales y `\overrightarrow{AB}`, que es más alto que un nombre desnudo, era el
  // único que se quedaba con barra de scroll. Sola en su vista, la tarjeta CRECE con su
  // contenido (`ALTO_TARJETA_MAX`) y deja de estrecharse.
  const esDiferencia = (i: number) => bloque.entradas[i]?.tipo === "diferencia";
  const declaradas = formulas.filter((_, i) => !esDiferencia(i));
  const deducidas = formulas.filter((_, i) => esDiferencia(i));
  const conVistas = declaradas.length > 0 && deducidas.length > 0;

  const tactil = esTactil();
  // El panel se dimensiona para la vista MÁS LLENA: al alternar no puede cambiar de alto, o
  // el bloque daría un salto y movería el resto de la nota.
  const alto = altoPanelPorTarjetas(
    conVistas ? Math.max(declaradas.length, deducidas.length) : formulas.length
  );
  const reparto: Reparto = {
    estrecho: false, abierto: false, panel: null, ladoChip: ladoChip(tactil),
    alto,
    // En estrecho el bloque tiene DOS MODOS —el plano o las tarjetas—, igual que obs-graph.
    panelCompleto: true,
  };
  /**
   * El panel: con dos vistas, la barra de toggle compartida con obs-derivate y obs-integral;
   * sin ellas, las tarjetas de siempre y ninguna interfaz —que sigue siendo el caso normal—.
   *
   * El glifo del botón principal es la LÍNEA CANÓNICA del bloque, `\vec{v}=(x, y)`, como
   * `f(x)` lo es de obs-graph: no nombra a ningún vector concreto porque la vista los tiene
   * todos. El del menú sí es concreto —`\overrightarrow{AB}`—, porque `A` y `B` son los
   * nombres de manual de dos puntos y esa es exactamente la notación que se va a ver.
   */
  const montarPanel = async (): Promise<void> => {
    if (conVistas) {
      await montarPanelVistas(motor, contenedor, ctx, limpieza, reparto, {
        operador: declaradas,
        resultado: deducidas,
        glifoOperador: "\\vec{v}=(x,\\ y)",
        tooltipOperador: t().vector.vistas.escrito,
        tooltipOpciones: t().vector.vistas.opciones,
        opciones: [
          {
            etiqueta: t().vector.vistas.entrePuntos,
            tex: "\\overrightarrow{AB}",
            vista: "resultado",
          },
        ],
      });
      return;
    }
    const { renderLatex } = crearScrollerLatex(motor.plugin, contenedor, ctx, limpieza, reparto);
    await renderLatex(formulas);
  };

  await montarPanel();

  const wrap = contenedor.createDiv({ cls: "lmath-grafica" });
  wrap.style.cssText = `position:relative; width:100%; height:${alto}px;`;

  // ── Reparto por ancho, igual que el resto de bloques ──────────────────────────────────
  // La asigna el botón f(x) al montarse, más abajo; hasta entonces no hay nada que sincronizar.
  let sincronizarBotonFormula: () => void = () => { /* aún no hay botón */ };
  let anchoAplicado = -1;
  const aplicarReparto = () => {
    const ancho = contenedor.clientWidth;
    if (ancho <= 0) return;
    // Mismos dos disparadores que en obs-graph: el ancho, y el móvil en vertical aunque pase del
    // umbral (ver `esMovilVertical`).
    const estrecho = ancho < ANCHO_MINIMO_COLUMNAS || esMovilVertical();
    if (estrecho === reparto.estrecho && ancho === anchoAplicado) return;
    anchoAplicado = ancho;
    reparto.estrecho = estrecho;
    if (!estrecho) reparto.abierto = false;
    contenedor.toggleClass("lmath-estrecho", estrecho);
    aplicarCajaPanel(reparto);
    avisarCambioDeReparto(reparto);   // lo escucha el panel de vistas (ver `ui/reparto`)
    sincronizarBotonFormula();
    wrap.style.height = estrecho
      ? `${Math.round(ancho * PROPORCION_PLANO_FLOTANTE)}px`
      : `${alto}px`;
  };
  aplicarReparto();

  const canvas = wrap.createEl("canvas");
  canvas.setCssStyles({
    position: "absolute", top: "0", left: "0", width: "100%", height: "100%",
    // Mismo trato que el plano de obs-graph: con ratón se oculta el cursor del sistema y el
    // motor pinta el suyo (`Crosshair.dibujarCursorCruz`); con el dedo no hay cursor que
    // sustituir, así que se deja el de siempre. Ver la nota larga en `process`.
    cursor: tactil ? "default" : "none",
    // El dedo mueve el PLANO, en los dos ejes, y dos dedos hacen zoom: el navegador no se queda
    // ningún gesto que empiece aquí. Faltaba desde la 1.4.0, que es la versión que le dio cámara
    // a este bloque: sin esto el navegador se quedaba TODOS los toques para desplazar la nota, y
    // ni el paneo ni el pellizco llegaban nunca a la cámara. Va SOLO en el lienzo, no en el
    // bloque: los toques que empiezan en los márgenes o sobre el panel de la fórmula siguen
    // desplazando la nota con normalidad.
    touchAction: "none",
  });
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) {
    wrap.createEl("p", { text: t().canvasNoDisponible });
    revelar();
    return;
  }
  const crosshair = new Crosshair(ctx2d);

  // ── La vista: una CÁMARA, igual que en los demás bloques ──────────────────────────────
  // Hasta ahora este plano era una imagen fija: el encuadre se derivaba del dibujo y de la
  // caja, y no había forma de acercarse ni de moverse. Eso lo hacía el único plano del plugin
  // con el que no se podía interactuar —ni rueda, ni arrastre, ni cursor propio—, y con un
  // vector largo junto a uno corto no quedaba manera de mirar el pequeño.
  //
  // La cámara es la MISMA pieza que usa obs-graph (`Camara`), así que el paneo, el zoom con
  // rueda, el pellizco de dos dedos y la animación de las transiciones se comportan igual sin
  // una segunda implementación que mantener. Lo que NO trae es el modo carril: un vector no es
  // una curva que recorrer, así que no se monta el botón ⌖ y el lector de curva va vacío.
  //
  // El encuadre del dibujo (`encuadreDeDibujo`) deja de fijar la vista para pasar a fijar la
  // vista BASE: es a la que se vuelve con 🏠︎, y sigue siendo la de partida.
  let W = 0, Hcss = 0, dprPrev = 0;
  let camara: Camara;
  const vpActual = (): Viewport => camara.viewport();

  // ── Los NOMBRES, sobre el lienzo pero fuera de él ─────────────────────────────────────
  // Un nombre de vector es una variable matemática y se escribe como tal: `\vec{v}`, con la
  // flecha de KaTeX, la misma letra que hay en su tarjeta. Eso no lo puede pintar `fillText`
  // —que solo sabe poner una cursiva del sistema—, así que los rótulos son DOM y viven en una
  // capa sobre el lienzo. El renderizador dice dónde va cada uno; aquí se crean UNA vez (KaTeX
  // es asíncrono y volver a montarlos en cada redimensionado los haría parpadear) y después
  // solo se recolocan, por lo que el orden de `rotulosDeDibujo` es el que empareja cada
  // elemento con su entrada.
  const capaRotulos = wrap.createDiv({ cls: "lmath-rotulos" });
  const nodosRotulo: HTMLElement[] = [];
  const colocarRotulos = () => {
    rotulosDeDibujo(vpActual(), dibujo).forEach((r, i) => {
      let nodo = nodosRotulo[i];
      if (!nodo) {
        nodo = capaRotulos.createSpan({ cls: "lmath-rotulo" });
        nodosRotulo[i] = nodo;
        const entrada = bloque.entradas[r.rol];
        const tex = entrada ? rotuloALatex(entrada) : null;
        if (tex !== null) montarEtiquetaMath(motor.plugin, nodo, tex, ctx);
      }
      // Posición y color llegan como propiedades porque dependen del encuadre y del tema; la
      // regla que las usa vive en la hoja de estilos.
      nodo.setCssProps({
        "--lmath-rotulo-x": `${r.x}px`,
        "--lmath-rotulo-y": `${r.y}px`,
        "--lmath-rotulo-color": r.color,
      });
    });
  };

  const pintar = () => {
    // El tema se lee VIVO en cada pintado, como en el resto del plugin: cambiarlo es un
    // repintado, no una reconstrucción.
    fijarTemaPlano(esTemaOscuro(wrap));
    dibujarVectores(ctx2d, vpActual(), dibujo);
    // Los rótulos van en el mismo paso: su color sale de la misma paleta que las flechas, así
    // que un cambio de tema tiene que alcanzarlos a la vez que al lienzo.
    colocarRotulos();
    // La cruz del cursor va la ÚLTIMA, encima de todo. En táctil `cursorPx` es siempre null
    // (la cámara no registra hover), así que la guarda apaga el icono sin condicionales
    // repartidos: el mismo interruptor en el origen que en obs-graph.
    const mx = camara.cursorPx(), my = camara.cursorPy();
    if (mx !== null && my !== null) crosshair.dibujarCursorCruz(mx, my);
  };

  // Un solo repintado por frame aunque lleguen varios eventos de cámara seguidos (la rueda y
  // el arrastre emiten muchos): el dibujo de un puñado de flechas es barato, pero repintarlo
  // tres veces en el mismo frame no lo hace más correcto y sí más caro.
  let framePendiente = 0;
  const programarPintado = () => {
    if (framePendiente) return;
    framePendiente = window.requestAnimationFrame(() => { framePendiente = 0; pintar(); });
  };
  limpieza.register(() => { if (framePendiente) window.cancelAnimationFrame(framePendiente); });

  camara = new Camara(canvas, alto, {
    onViewport: () => programarPintado(),
    onCursor: () => programarPintado(),
  }, { seguirCursor: !tactil });
  limpieza.register(() => camara.destruir());

  // Teclado (WASD / flechas para panear, W/S para el zoom en carril). Aquí el carril nunca se
  // enciende —no hay botón ⌖ ni curva que recorrer—, así que el lector va vacío: `Navegacion`
  // solo lo consulta dentro del modo carril, y en paneo libre no lo toca. En táctil no se
  // monta, por lo mismo que en obs-graph: hace del canvas un elemento enfocable y no hay
  // teclado que lo justifique.
  if (!tactil) {
    const nav = new Navegacion(canvas, camara, {
      y: () => null,
      avanzarArco: () => null,
      hayVecina: () => false,
      tieneAsintotasVerticales: () => false,
    }, () => pintar());
    limpieza.register(() => nav.destruir());
  }

  const redimensionar = () => {
    const caja = canvas.getBoundingClientRect();
    const ancho = Math.max(1, Math.round(caja.width || wrap.clientWidth || 320));
    const altoPx = Math.max(1, Math.round(caja.height || alto));
    const dpr = Math.ceil(window.devicePixelRatio || 1);
    if (ancho === W && altoPx === Hcss && dpr === dprPrev) return;
    const primera = W === 0;
    W = ancho; Hcss = altoPx; dprPrev = dpr;
    camara.redimensionar(ancho, altoPx, dpr);
    // `Camara.redimensionar` solo actualiza el ESTADO de la cámara (su tamaño y el domX que se
    // deriva del aspecto): no toca el lienzo. El respaldo físico y la transformación del
    // contexto los pone el host, igual que en `process`. Sin estas tres líneas el canvas se
    // queda con su tamaño por defecto (300×150) y el dibujo sale desplazado y a otra escala.
    canvas.width = ancho * dpr;
    canvas.height = altoPx * dpr;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

    // El encuadre del dibujo fija la vista BASE (la de 🏠︎), y SOLO en el primer dimensionado.
    // `fijarEncuadreBase` restaura la vista por dentro, así que llamarlo en cada redimensionado
    // le robaría al usuario el zoom y el paneo cada vez que cambia el ancho de la nota o se
    // abre la barra lateral. El aspecto influye en el encuadre ideal, sí, pero menos que
    // perder la vista que uno acaba de ajustar a mano.
    if (primera) {
      // El cromo se descuenta SOLO en táctil, que es donde los chips miden 30px y de verdad se
      // comen el plano; con ratón miden 22 y el encuadre se queda exactamente como estaba (el
      // `undefined` hace que el cálculo no cambie ni un decimal).
      const semiY = encuadreDeDibujo(dibujo, SEMI_Y_VECTOR, ancho / altoPx,
        tactil ? { margenPx: huecoChips(reparto.ladoChip), altoPx } : undefined)
        ?? SEMI_Y_VECTOR;
      camara.fijarEncuadreBase(semiY);
    }
    pintar();
  };
  redimensionar();

  const observador = new ResizeObserver(() => redimensionar());
  observador.observe(wrap);
  limpieza.register(() => observador.disconnect());
  const observadorReparto = new ResizeObserver(() => aplicarReparto());
  observadorReparto.observe(contenedor);
  limpieza.register(() => observadorReparto.disconnect());
  // El zoom de la app puede cambiar SOLO el dpr (misma caja CSS): el ResizeObserver no se
  // entera, pero `resize` de la ventana sí llega.
  window.addEventListener("resize", redimensionar);
  limpieza.register(() => window.removeEventListener("resize", redimensionar));

  const refTema = motor.plugin.app.workspace.on("css-change", () => pintar());
  limpieza.register(() => motor.plugin.app.workspace.offref(refTema));

  // ── Chips 🏠︎ / + / − ──────────────────────────────────────────────────────────────────
  // Los mismos tres que obs-graph y con el mismo comportamiento: + y − equivalen a una muesca
  // de rueda anclada al CENTRO de la vista (no al cursor), y 🏠︎ deshace zoom y paneo hasta la
  // vista base del bloque. Están porque sin rueda —trackpad, tableta— el zoom no tendría
  // ninguna otra puerta, que es justo la queja que abrió esto.
  const ladoV = reparto.ladoChip;
  const iconoChipV = ladoIcono(ladoV);
  const escalonV = ladoV + 4;
  const estiloZoomV = (arriba: number) =>
    `position:absolute; right:8px; top:${arriba}px; width:${ladoV}px; height:${ladoV}px; ` +
    "display:flex; align-items:center; justify-content:center; " +
    "line-height:1; border-radius:50%; cursor:pointer; user-select:none; z-index:5; " +
    "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
    "border:1px solid var(--lmath-borde);";
  const btnInicioV = wrap.createDiv();
  ponerTooltip(btnInicioV, t().botones.vistaInicial);
  btnInicioV.style.cssText = estiloZoomV(6);
  montarIcono(btnInicioV, "inicio", iconoChipV);
  const btnMasV = wrap.createDiv();
  ponerTooltip(btnMasV, t().botones.acercar);
  btnMasV.style.cssText = estiloZoomV(6 + escalonV);
  montarIcono(btnMasV, "acercar", iconoChipV);
  const btnMenosV = wrap.createDiv();
  ponerTooltip(btnMenosV, t().botones.alejar);
  btnMenosV.style.cssText = estiloZoomV(6 + 2 * escalonV);
  montarIcono(btnMenosV, "alejar", iconoChipV);
  btnInicioV.addEventListener("click", () => camara.volverAVistaBase());
  // Pulsar hace UNA muesca; mantener la repite a cadencia fija hasta soltar. Mismo esquema que
  // en `process` (pointer capture para no perder el `pointerup` fuera del botón).
  const CADENCIA_ZOOM_MS_V = 100;
  const zoomMantenidoV = (btn: HTMLElement, acercar: boolean) => {
    let timer: number | null = null;
    const parar = () => { if (timer !== null) { window.clearInterval(timer); timer = null; } };
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      btn.setPointerCapture(e.pointerId);
      camara.zoomCentrado(acercar);
      parar();
      timer = window.setInterval(() => camara.zoomCentrado(acercar), CADENCIA_ZOOM_MS_V);
    });
    btn.addEventListener("pointerup", parar);
    btn.addEventListener("pointercancel", parar);
    limpieza.register(parar);
  };
  zoomMantenidoV(btnMasV, true);
  zoomMantenidoV(btnMenosV, false);

  // El ⓘ se monta más abajo, pero el botón f(x) necesita poder cerrarlo: los dos cuadros se
  // abren sobre el mismo plano y son excluyentes, como en el resto de los bloques.
  let cerrarInfo: () => void = () => { /* aún no hay panel ⓘ */ };
  // Y al revés: el ⓘ tiene que poder cerrar la fórmula. La rellena el botón f(x) al montarse.
  let cerrarFormula: () => void = () => { /* aún no hay panel flotante */ };

  // ── Sin nada que dibujar: el plano se vela y DICE por qué ────────────────────────────
  // El plano está siempre, incluso cuando no hay ninguna flecha que poner en él. La
  // alternativa —esconderlo y dejar las tarjetas a todo lo ancho— tenía dos problemas: hacía
  // que un obs-vector se viera de dos formas distintas según lo escrito, y sobre todo callaba.
  // Un plano vacío y mudo parece un bloque roto; velado y con su motivo, enseña la frontera del
  // bloque (un campo no es una flecha) en el sitio donde el usuario la está buscando.
  //
  // Es lo mismo que hace obs-graph, que nunca deja un plano vacío sin explicación: si algo no
  // se puede graficar, lo dice.
  if (!conPlano) {
    const etiqueta = bloque.entradas.length === 0
      ? t().velo.sinVector          // no hay nada escrito
      : t().velo.nadaQueDibujar;    // hay algo escrito, pero ninguna flecha que colocar
    const velo = wrap.createDiv({ cls: "lmath-velo-vector" });
    const msg = wrap.createDiv({ cls: "lmath-velo-mensaje" });
    msg.createDiv({ text: etiqueta.etiqueta, cls: "lmath-velo-titulo" });
    msg.createDiv({ text: etiqueta.detalle, cls: "lmath-velo-detalle" });
    // El velo NO impide el repintado del lienzo (rejilla y ejes siguen debajo): es una capa
    // encima, igual que en obs-graph, para que el plano se reconozca como plano.
    velo.setCssProps({ "--lmath-velo-z": "4" });
  }

  // ── Panel ⓘ: lo que se DEDUCE de lo escrito ──────────────────────────────────────────
  cerrarInfo = montarBotonInfoVector(motor, wrap, dibujo, reparto.ladoChip, () => {
    // Abrir el ⓘ cierra la fórmula flotante: comparten sitio y atención sobre el mismo plano.
    cerrarFormula();
  });

  // ── Botón f(x): la única puerta al panel cuando el bloque es ESTRECHO ─────────────────
  // El mismo de obs-graph, pieza incluida (`ui/botonFormula`): abajo a la derecha, a la
  // izquierda del ⓘ, con la `f(x)` compuesta por KaTeX y convirtiéndose en ✕ mientras el panel
  // está abierto. Hasta ahora este bloque tenía el suyo —a la izquierda, en texto plano y sin
  // cambiar de glifo—, así que el mismo control se comportaba de dos maneras según el bloque.
  //
  // Se monta DESPUÉS del ⓘ porque su posición depende de si hay chip al que apartarse. Con el
  // bloque sin dibujo (`!conPlano`) no hay ⓘ —`analizarDibujo` devuelve null exactamente en el
  // mismo caso en que `hayDibujo` dice que no— y el botón ocupa la esquina él solo.
  {
    // Abrir y cerrar la fórmula es SIEMPRE esto: el botón f(x), el ⓘ al abrirse y el toque
    // limpio sobre el plano pasan por aquí, así que no hay tres sitios que puedan discrepar
    // sobre qué significa cerrarla.
    const alternarFormula = (abrir: boolean) => {
      if (reparto.abierto === abrir) return;
      reparto.abierto = abrir;
      if (abrir) cerrarInfo();
      aplicarCajaPanel(reparto);
      sincronizarBotonFormula();
      // La tarjeta flotante se dibuja ENCIMA del lienzo, y el navegador no repinta el canvas
      // al descubrirlo: hay que repintarlo nosotros para que no quede un rectángulo viejo.
      pintar();
    };
    // El botón lleva puesto el apagado del plano (la clase `lmath-modo-formula`), así que aquí
    // no queda ninguna lista de chips que esconder a mano: los apaga la hoja de estilos.
    sincronizarBotonFormula = montarBotonFormula(
      motor.plugin, wrap, ctx, reparto, () => alternarFormula(!reparto.abierto));
    sincronizarBotonFormula();
    cerrarFormula = () => alternarFormula(false);
  }

  // ── Chip de EDITAR (solo táctil) ─────────────────────────────────────────────────────
  // El porqué, el sitio y el salto al editor viven en `ui/edicionBloque`, compartidos con
  // obs-graph: el `</>` de Obsidian necesita hover y el lienzo se queda los toques, así que sin
  // este chip un obs-vector renderizado en el teléfono no tenía ninguna puerta a su fuente.
  // Es el ÚNICO chip que acompaña a la fórmula en el modo fórmula: ahí no hay plano, pero sigue
  // habiendo un bloque escrito, y corregirlo es justo lo que se puede querer hacer mirándolo.
  if (tactil) montarChipEditar(motor.plugin, wrap, contenedor, ctx, reparto.ladoChip);

  revelar();
}

/**
 * Botón ⓘ + popover de `obs-vector`. Devuelve la función que lo cierra (la necesita el botón
 * f(x): los dos cuadros se abren sobre el mismo plano y son excluyentes).
 *
 * El contenido es ESTÁTICO —un conjunto de flechas no cambia, aquí no hay cámara ni arrastre—,
 * así que se calcula al abrir por primera vez y solo se reconstruye al plegar o desplegar una
 * sección. Los valores van en TEXTO PLANO con unicode (`√13`, `π/4`), como en el ⓘ del círculo:
 * a este tamaño se leen igual que en KaTeX y el cuadro no depende de un render asíncrono.
 *
 * Una sección por vector, y las de PAREJA solo cuando la pregunta tiene una única respuesta
 * (exactamente dos vectores, exactamente dos puntos). El porqué de esa regla está en
 * `analizarDibujo`, que es quien la aplica.
 */
export function montarBotonInfoVector(
  motor: Motor,
  wrap: HTMLElement,
  dibujo: DibujoVector,
  lado: number,
  alAbrir: () => void
): () => void {
  const A = analizarDibujo(dibujo);
  // Sin nada dibujado no hay nada que deducir, y un chip que abre un cuadro vacío es peor que
  // no tener chip. (Con este bloque no debería pasar: sin dibujo no se llega hasta aquí.)
  if (!A) return () => { /* no hay panel que cerrar */ };

  const btnInfo = wrap.createDiv();
  ponerTooltip(btnInfo, t().vector.info.chip);
  btnInfo.style.cssText = estiloChipInfo(lado);
  montarIcono(btnInfo, "info", ladoIcono(lado));

  const pop = wrap.createDiv();
  pop.style.cssText = estiloPopoverInfo(lado);

  let visible = false;
  const abiertas = new Set<number>([0]);

  const T = t().vector.info;
  // Los ángulos se escriben con la MISMA función que rotula los de obs-trig, así que siguen la
  // unidad elegida en los ajustes (grados, radianes o gradianes) y traen su forma exacta cuando
  // la tienen. Una tabla propia aquí daría dos lecturas distintas del mismo ángulo.
  const unidad = motor.obtenerAjustes().unidadAngulo;
  const angulo = (rad: number): string => textoAngulo(modeloDeAngulo(rad), unidad);
  // Un número con su forma exacta delante, cuando la tiene: `√13 ≈ 3.606`. El decimal no sobra
  // —es lo que dice de un vistazo cuánto mide—, y el exacto es el valor de verdad.
  const medida = (m: Medida): string =>
    m.exacto !== null && m.exacto !== numeroATexto(m.valor)
      ? `${m.exacto}  ≈ ${numeroATexto(m.valor)}`
      : m.exacto ?? numeroATexto(m.valor);
  const par = (x: number, y: number): string => `(${numeroATexto(x)}, ${numeroATexto(y)})`;

  const construir = () => {
    pop.empty();
    const secciones: Array<{ titulo: string; filas: FilaInfo[] }> = [];

    A.vectores.forEach((v, i) => {
      // El título es el NOMBRE que escribió el autor (`v`, `AB`): es lo que empareja la sección
      // con su flecha en el plano y con su tarjeta en el panel.
      //
      // Las COMPONENTES abren la sección aunque la tarjeta ya enseñe el par, y no es una
      // repetición: la tarjeta escribe `(4, 2)`, un par ordenado, y aquí cada número se lee con
      // su nombre —la x y la y de ESE vector—, que es de donde salen todas las filas de abajo.
      // En una flecha entre dos puntos, además, no es el par de ninguna tarjeta: es la resta.
      const filas: FilaInfo[] = [
        ["x", numeroATexto(v.componentes[0])],
        ["y", numeroATexto(v.componentes[1])],
        [T.modulo, medida(v.modulo)],
      ];
      if (v.direccion !== null) filas.push([T.direccion, angulo(v.direccion)]);
      if (v.posicion !== null) filas.push([T.posicion, t().trig.info.posicion[v.posicion]]);
      if (v.unitario) filas.push([T.unitario, par(v.unitario[0], v.unitario[1])]);
      secciones.push({ titulo: dibujo.flechas[i]?.etiqueta ?? "", filas });
    });

    if (A.par) {
      const a = dibujo.flechas.find((f) => f.rol === A.par?.rolA)?.etiqueta ?? "";
      const b = dibujo.flechas.find((f) => f.rol === A.par?.rolB)?.etiqueta ?? "";
      const filas: FilaInfo[] = [[T.escalar, medida(A.par.escalar)]];
      if (A.par.angulo !== null) filas.push([T.angulo, angulo(A.par.angulo)]);
      filas.push([T.determinante, medida(A.par.determinante)]);
      filas.push([T.areaParalelogramo, medida(A.par.areaParalelogramo)]);
      filas.push([T.areaTriangulo, medida(A.par.areaTriangulo)]);
      // La relación cierra la sección y va despegada: no es un dato más de la lista, es lo que
      // los cinco de arriba querían decir.
      if (A.par.relacion !== null) {
        filas.push([
          "", A.par.relacion === "perpendicular" ? T.perpendiculares : T.paralelos, true,
        ]);
      }
      secciones.push({ titulo: T.entre(a, b), filas });
    }

    if (A.puntos) {
      const a = dibujo.marcas.find((m) => m.rol === A.puntos?.rolA)?.etiqueta ?? "";
      const b = dibujo.marcas.find((m) => m.rol === A.puntos?.rolB)?.etiqueta ?? "";
      secciones.push({
        titulo: T.entre(a, b),
        filas: [
          [T.distancia, medida(A.puntos.distancia)],
          [
            T.puntoMedio,
            A.puntos.medioExacto
              ? `(${A.puntos.medioExacto[0]}, ${A.puntos.medioExacto[1]})`
              : par(A.puntos.medio[0], A.puntos.medio[1]),
          ],
        ],
      });
    }

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
          (separada
            ? " border-top:1px solid var(--lmath-borde); margin-top:5px; padding-top:5px;"
            : "");
        fila.createDiv({ text: etiqueta }).setCssStyles({ color: "var(--lmath-texto-tenue)" });
        fila.createDiv({ text: valor }).setCssStyles({ textAlign: "right" });
      }
    });
  };

  const cerrar = () => {
    visible = false;
    pop.setCssStyles({ display: "none" });
  };
  // El chip es lo ÚNICO que abre y cierra este cuadro; el `cerrar` que se devuelve es para el
  // botón f(x), que ocupa el mismo plano en un bloque estrecho. No hay listener de "clic
  // fuera": uno en `document` cerraba el panel al pulsar en cualquier sitio de la nota —el
  // propio plano incluido— y al abrir el ⓘ de otro bloque, porque todos escuchaban el mismo
  // documento. Los ⓘ de obs-graph, obs-integral y obs-derivate nunca lo tuvieron.
  btnInfo.addEventListener("click", (ev) => {
    ev.stopPropagation();
    visible = !visible;
    if (visible) { alAbrir(); construir(); }
    pop.setCssStyles({ display: visible ? "block" : "none" });
  });

  return cerrar;
}
