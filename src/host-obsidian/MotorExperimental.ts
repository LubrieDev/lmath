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
  MarkdownView,
  type MarkdownPostProcessorContext,
} from "obsidian";

import { Camara } from "../core/interaction/Camara";
import { Navegacion } from "../core/interaction/Navegacion";
import { crearMotor, crearMotorSistema } from "../core/app/composicion";
import { dividirEcuaciones } from "../core/parsing/dividirEcuaciones";
import { separarParametros, sustituirParametros } from "../core/parsing/parametros";
import { aPantallaX } from "../core/scene/viewport-utils";
import { FACTOR_SONDEO } from "../core/scene/autoencuadre";
import { extraerFuncion, derivarEcuacion } from "../derivar";
import { extraerIntegral, evaluarLimite } from "../integral";
import {
  AJUSTES_POR_DEFECTO, type AjustesTransformaciones, type PluginConAjustes,
} from "./ajustes";
// Capa PURA del adaptador (`./analysis/`): clasificación formal del bloque y redacción de
// los paneles ⓘ. Vivían aquí dentro como métodos privados; no tocan el DOM, así que salieron
// a su propio módulo y ahora se pueden probar sin montar un bloque.
import {
  clasificarBloque, degeneradaDeEcuacion, exprExplicita,
} from "./analysis/clasificacion";
import {
  ALTO_PANEL, ANCHO_MINIMO_COLUMNAS, PROPORCION_PLANO_FLOTANTE, MARGEN_FLOTANTE, ladoChip,
  ladoIcono, aplicarCajaPanel, esTemaOscuro, type Reparto,
} from "./ui/reparto";
import { montarPanelLatex, montarPanelDerivada, montarPanelIntegral } from "./ui/paneles";
import { montarBotonInfo, montarBotonInfoDerivada, montarBotonInfoIntegral } from "./info/botones";
import type { ExclusionPopover } from "./info/contratos";
import { montarInfoSistema, montarInfoGeometrico } from "./info/plano";
import { procesarTrig } from "./blocks/trig";
import { procesarVector } from "./blocks/vector";
// El contrato que consumen los módulos extraídos. `ModoBloque` se reexporta desde aquí
// porque este archivo sigue siendo la puerta pública del adaptador.
import type { Motor, ModoBloque } from "./contexto";
export type { ModoBloque } from "./contexto";
// Capa de INTERFAZ del adaptador (`./ui/`): cromo, controles y el panel de fórmula. Eran
// métodos privados de esta clase y ninguno usaba `this` más que para llegar al plugin, así
// que son funciones libres: se leen sin la clase delante y se reutilizan desde los bloques.
import { ponerTooltip, montarIcono, montarEtiquetaMath } from "./ui/controles";
import { esTactil } from "./plataforma";
import { t, localizarVelo } from "../i18n";
import { fijarTemaPlano } from "../core/rendering/paleta";

export class MotorExperimental implements Motor {
  // `obtenerAjustes`: getter de las preferencias VIVAS del plugin (no una foto), para que
  // un cambio en la pestaña de configuración afecte a los bloques que se re-rendericen.
  // Por defecto, sin transformaciones automáticas (comportamiento clásico).
  constructor(
    readonly plugin: PluginConAjustes,
    readonly modo: ModoBloque,
    readonly obtenerAjustes: () => AjustesTransformaciones = () => AJUSTES_POR_DEFECTO
  ) {}

  /**
   * Ata un bloque YA MONTADO a los cambios de ajustes: cuando cambia cualquiera, el bloque se
   * desmonta y se vuelve a montar desde su fuente.
   *
   * Rehacerlo entero, y no repintar lo que se pueda, es deliberado. Un ajuste puede cambiar
   * cualquier cosa —el idioma de cada rótulo, la unidad de los ángulos, si el panel muestra la
   * ecuación despejada, si el plano pinta los puntos notables, si la vista se acerca sola—, y
   * varias de ellas no son presentación sino resultado: `despejarAuto` cambia la fórmula que se
   * compone y `encuadreAuto` la vista con la que nace el bloque. Una ruta "aplicar en vivo" por
   * cada ajuste serían seis caminos que mantener y que se olvidarían uno a uno; el remontaje es
   * UNO y no puede quedarse a medias. Lo que cuesta es el estado interactivo: el zoom, el
   * encuadre movido a mano y el ángulo que se estuviera arrastrando vuelven a su punto de
   * partida, igual que si se hubiera vuelto a abrir la nota.
   *
   * El orden importa: primero la BAJA (este montaje deja de existir, y sin ella el bloque nuevo
   * y el viejo estarían los dos suscritos), después `unload()` —que corre TODAS las limpiezas
   * registradas: observadores de tamaño, oyentes del documento, referencias del workspace, y sin
   * él cada cambio de ajustes dejaría un juego más de fugas— y solo entonces se vuelve a montar.
   */
  registrarRecarga(
    limpieza: MarkdownRenderChild,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    const baja = this.plugin.alCambiarAjustes(() => {
      baja();
      limpieza.unload();
      el.empty();
      void this.process(source, el, ctx);
    });
    // Y si el bloque muere por su cuenta (se cierra la nota), la baja va con él.
    limpieza.register(baja);
  }

  // Los tres rasgos que el cuerpo del adaptador consulta, DERIVADOS del modo en lugar de
  // almacenados: son preguntas sobre el bloque ("¿es un sistema?"), no estado, y como getters
  // no pueden desincronizarse del modo ni depender del orden de inicialización.
  get sistema(): boolean { return this.modo === "system"; }
  get derivada(): boolean { return this.modo === "derivate"; }
  get integral(): boolean { return this.modo === "integral"; }

  async process(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    // obs-trig y obs-vector salen por su propio camino ANTES de montar nada: no comparten con
    // los demás bloques ni la cámara, ni la escena, ni el ciclo de dos pasadas, así que meterlos
    // en el cuerpo de abajo sería sembrarlo de condicionales para saltarse casi todo.
    if (this.modo === "trig") return procesarTrig(this, source, el, ctx);
    if (this.modo === "vector") return procesarVector(this, source, el, ctx);

    const contenedor = el.createDiv({ cls: "lmath-container" });
    const limpieza = new MarkdownRenderChild(contenedor);
    ctx.addChild(limpieza);
    this.registrarRecarga(limpieza, source, el, ctx);

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

    // ── Parámetros declarados (`A = 1`), fuera antes de repartir ecuaciones ───────────────
    // Una línea `A = 1` no es una curva ni es basura: es un tercer tipo de cosa que el reparto
    // de líneas no conoce, y sin apartarla se clasifica como la implícita `A − 1 = 0` y se
    // convierte en LA curva del bloque. Es el mismo orden que sigue la restricción de dominio.
    //
    // El reparto que sale de aquí es el que gobierna todo lo demás: `escrito` es lo que ve el
    // PANEL —con sus nombres, que es lo que el autor quiere leer— y `paraMotor` lo que ve el
    // MOTOR, con los valores ya puestos. Que sean dos cadenas distintas es justo el punto.
    //
    // **Solo `obs-graph` y `obs-system`**, y no por prudencia genérica: en `obs-derivate` la
    // función ESCRITA se clasifica antes de derivarla —y una `A` libre la haría degenerada, así
    // que el bloque se velaría antes de que nadie sustituyera nada—, y en `obs-integral` el valor
    // de la integral saldría de una expresión con la `A` puesta, es decir mal y en silencio.
    // Las dos cosas tienen arreglo, pero es otro trabajo; hasta entonces esos dos bloques ven el
    // source tal cual y se comportan exactamente como antes.
    const admiteParametros = !this.derivada && !this.integral;
    const separado = admiteParametros
      ? separarParametros(source)
      : { parametros: [], source };
    const { parametros, source: escrito } = separado;
    // Los valores VIVOS, que arrancan en lo declarado y los mueven los mandos. `paraMotor` los
    // lee cada vez que se le llama, así que reconstruir la escena con él basta para que el plano
    // diga lo que dice el deslizador; no hay un segundo sitio donde el valor pueda quedarse viejo.
    const valores = new Map(parametros.map((p) => [p.nombre, p.valor] as const));
    const paraMotor = (s: string): string => sustituirParametros(s, parametros, valores);

    // Ecuaciones del bloque. obs-graph solo grafica la PRIMERA, así que su panel
    // LaTeX y su clasificación también miran solo esa (coherencia panel↔plano).
    const ecuaciones = dividirEcuaciones(escrito);
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
    const degeneradaOrigen = funcionEscrita ? degeneradaDeEcuacion(funcionEscrita) : null;
    const derivadaExpr = this.derivada && visibles.length && !degeneradaOrigen
      ? derivarEcuacion(visibles[0]) : null;

    // ── obs-integral: el plano grafica el INTEGRANDO f(x) de `\int_a^b f dx` (no lo escrito
    // como bloque). `integralDatos` descompone la notación; `graficadas`/`fuenteGrafico` son el
    // integrando que alimenta el motor, la clasificación y el sombreado. El VALOR ∫ₐᵇ y el
    // panel operador/valor los monta montarPanelIntegral. Si no hay integral válida → sin
    // ecuación graficada → etiqueta "Sin integral".
    const integralDatos = this.integral ? extraerIntegral(escrito) : null;

    // Lo que llega al motor lleva los parámetros SUSTITUIDOS por su valor. Se sustituye aquí, al
    // final del reparto, y no en el source de entrada, porque por el camino han pasado el panel y
    // la derivación simbólica, y los dos quieren ver los nombres: una derivada de `A\sin x` es
    // `A\cos x`, no `(1)\cos x`.
    // Las ecuaciones que se grafican, ANTES de sustituir. Se guardan porque hay quien las
    // necesita VIVAS: el ⓘ de una implícita vuelve a resolverlas en cada refresco, y con la
    // sustitución hecha de una vez seguiría describiendo la curva de antes de tocar el mando.
    const fuentesGrafico = this.integral
      ? (integralDatos ? [integralDatos.integrando] : [])
      : this.derivada ? (derivadaExpr ? [derivadaExpr] : []) : visibles;
    const graficadas = fuentesGrafico.map(paraMotor);
    // La fuente del plano en dos versiones: con los nombres (`fuenteEscrita`, que es la que hay
    // que volver a sustituir cada vez que un mando se mueve) y con los valores puestos.
    const fuenteEscrita = this.integral
      ? (integralDatos?.integrando ?? "")
      : this.derivada ? (derivadaExpr ?? "") : escrito;
    const fuenteGrafico = paraMotor(fuenteEscrita);

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

    // Mover un mando necesita la escena y la cámara, que se construyen mucho más abajo, así que
    // la acción se enlaza TARDE: el panel se monta ya con su botón, y lo que ese botón hace se
    // rellena cuando hay plano. Es el mismo patrón que usan el botón f(x) y los cierres de los ⓘ.
    let aplicarParametro: (nombre: string, valor: number) => void = () => { /* aún no hay plano */ };

    if (this.integral) await montarPanelIntegral(this, contenedor, escrito, ctx, limpieza, reparto);
    else if (this.derivada) await montarPanelDerivada(this, contenedor, visibles, ctx, limpieza, reparto);
    else {
      await montarPanelLatex(this, contenedor, visibles, ctx, limpieza, reparto, {
        parametros,
        alCambiar: (nombre, v) => aplicarParametro(nombre, v),
      });
    }

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
    // `let` y no `const` porque un parámetro que se mueve **reemplaza la escena entera**: la
    // geometría depende de la función, así que cambiar un valor invalida hasta la última caché.
    // Lo que NO se reemplaza es la cámara, y ese es justo el punto: reconstruir el bloque (lo que
    // hace un cambio de ajustes) devolvería la vista al inicio en cada tirón del mando, que es
    // exactamente cuando uno quiere que la vista se quede quieta.
    let escena = this.sistema
      ? crearMotorSistema(ctx2d, paraMotor(escrito))
      : crearMotor(ctx2d, fuenteGrafico);

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
    // El veto de comandos mira el source con los parámetros YA SUSTITUIDOS, por el mismo motivo
    // por el que mira el source sin sus restricciones: `\alpha` no está en la lista blanca —y con
    // razón, porque sin declarar no vale nada—, pero declarada es un número. Sustituida no queda
    // ningún comando que vetar, y el bloque del issue #1 deja de velarse.
    const degeneradaCruda = degeneradaOrigen
      ?? clasificarBloque(
        graficadas,
        { sistema: this.sistema, derivada: this.derivada, integral: this.integral },
        paraMotor(escrito));
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
    // Con PARÁMETROS no hay resumen ANALÍTICO. Ese panel se construye una vez con la expresión
    // del momento —raíces, vértices, periodicidad—, y en cuanto un mando se mueve estaría
    // describiendo una curva que ya no está en el plano. Devolver `null` aquí no deja al bloque
    // sin ⓘ: lo pasa al resumen GEOMÉTRICO, que lee la geometría cacheada y se recalcula en cada
    // pasada final, o sea que sigue vivo con el mando. Es mejor salida que callar, y por eso este
    // caso no se resuelve como el de la restricción de dominio, donde sí hay que callar.
    const exprGraph = parametros.length > 0 ? null : exprExplicita(graficadas, this.sistema);
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
      if (this.integral)
        hayChipInfo = montarBotonInfoIntegral(
          this, wrap, escrito, ctx, reparto.ladoChip, exclusion);
      // obs-derivate grafica f′, así que el resumen heredado describía f′ como una curva
      // suelta. Los números eran los buenos con el nombre de otra función: sus raíces son
      // los puntos CRÍTICOS de f y sus vértices, las INFLEXIONES. Su panel propio habla de
      // f, que es de quien trata el bloque (ver `analisisDerivada`).
      else if (this.derivada && funcionEscrita)
        hayChipInfo = montarBotonInfoDerivada(
          this, wrap, funcionEscrita, exprGraph, ctx, reparto.ladoChip, exclusion);
      else {
        montarBotonInfo(this, wrap, exprGraph, ctx, reparto.ladoChip, exclusion);
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

    // ── Qué hace un mando al moverse ──────────────────────────────────────────────────────
    // Se enlaza DESPUÉS del autoencuadre a propósito: el encuadre se decide una vez, sobre la
    // curva de los valores declarados, y mover un mando NO vuelve a encuadrar. Reencuadrar en
    // cada tirón sería que la vista persiguiera a la curva, y entonces no se vería moverse nada
    // —que es justo lo que un deslizador sirve para enseñar—.
    aplicarParametro = (nombre, v) => {
      valores.set(nombre, v);
      // Se REEMPLAZA la escena y el ciclo de siempre hace el resto: la pasada interactiva sale
      // por rAF mientras el dedo se mueve y la final entra 150 ms después de soltar. Es el
      // mismo contrato de dos pasadas que ya gobierna el pan y el zoom, así que no hace falta
      // inventar aquí ninguna degradación de calidad: la que hay ya está medida.
      escena = this.sistema
        ? crearMotorSistema(ctx2d, paraMotor(escrito))
        : crearMotor(ctx2d, paraMotor(fuenteEscrita));
      programarRedibujo();
      programarFinal();
    };

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
    ponerTooltip(btnInicio, t().botones.vistaInicial);
    btnInicio.style.cssText = estiloZoom(6);
    montarIcono(btnInicio, "inicio", iconoChip);
    const btnMas = wrap.createDiv();
    ponerTooltip(btnMas, t().botones.acercar);
    btnMas.style.cssText = estiloZoom(6 + escalonZoom);
    montarIcono(btnMas, "acercar", iconoChip);
    const btnMenos = wrap.createDiv();
    ponerTooltip(btnMenos, t().botones.alejar);
    btnMenos.style.cssText = estiloZoom(6 + 2 * escalonZoom);
    montarIcono(btnMenos, "alejar", iconoChip);
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
      ponerTooltip(btnCarril, t().botones.carril);
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
      montarIcono(btnCarril, "carril", iconoChip);
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
        ponerTooltip(b, t().botones.seleccionarEcuacion(i + 1));
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

    // ── Botón de solución (ⓘ): intersecciones del sistema ───────────────────
    // Las calcula el motor matemático a partir de las ecuaciones ESCRITAS, no de las Ramas
    // trazadas: ver la nota larga de `refrescarSolucion` en `info/plano.ts`, que es donde
    // está dicho de qué se sale y por qué. El refrescador vuelve en cada pasada final.
    if (this.sistema) {
      hayChipInfo = true;
      // `ctx` y `limpieza` van porque las soluciones se pintan en KaTeX y el cuadro se
      // REPINTA: el componente del bloque es el que sostiene esos renders (ver
      // `pintarMathEnLinea`), en vez de uno nuevo por refresco.
      alRecalcularFinal = montarInfoSistema(
        this.plugin, wrap, lado, iconoChip, exclusion, visibles, paraMotor, ctx, limpieza);
    }

    // ── Botón ⓘ GEOMÉTRICO (obs-graph, curva NO explícita) ──────────────────
    // El resumen clásico (`montarBotonInfo`) evalúa f(x) y solo existe para y=f(x). Para las
    // demás curvas de obs-graph —implícitas, trig periódicas, polares, paramétricas— el
    // resumen sale de la geometría cacheada o del análisis propio de la curva; el detalle
    // está en `montarInfoGeometrico` (`info/plano.ts`). La GUARDA se queda aquí porque es
    // lo que decide cuál de los dos ⓘ posibles se monta, y eso es cosa de este pipeline.
    if (!this.sistema && !degenerada && graficadas.length > 0 && !exprGraph) {
      hayChipInfo = true;
      alRecalcularFinal = montarInfoGeometrico(
        this.plugin, wrap, lado, iconoChip, exclusion, graficadas, parametros,
        // Accesor, no valor: la ecuación se sustituye en cada refresco, no una vez al montar,
        // para que mover un deslizador cambie también lo que dice el cuadro. Ya no se le pasa
        // ni la escena ni la cámara: este resumen sale de la ecuación (ver `info/plano.ts`).
        () => paraMotor(fuentesGrafico[0] ?? ""), ctx, limpieza);
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
      if (reparto.abierto) montarIcono(btnFormula, "cerrar", iconoChip);
      else montarEtiquetaMath(this.plugin, btnFormula, "f(x)", ctx);
      ponerTooltip(
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
      ponerTooltip(btnEditar, t().botones.editarBloque);
      btnEditar.style.cssText =
        `position:absolute; top:6px; left:${MARGEN_FLOTANTE}px; ` +
        `width:${lado}px; height:${lado}px; ` +
        "display:flex; align-items:center; justify-content:center; line-height:1; " +
        "border-radius:50%; cursor:pointer; user-select:none; z-index:7; " +
        "color:var(--lmath-texto-tenue); background:var(--lmath-chip); " +
        "border:1px solid var(--lmath-borde);";
      montarIcono(btnEditar, "editar", iconoChip);
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

}
