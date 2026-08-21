// ─────────────────────────────────────────────
// host-obsidian · blocks/trig — el bloque obs-trig
// ─────────────────────────────────────────────
//
// El círculo trigonométrico, de punta a punta: parseo del bloque, montaje del marco,
// interacción (arrastre, teclado, deslizador, animación, imán) y el cuadro ⓘ de las seis
// razones. Es el único bloque que NO usa el motor de curvas —ni `Camara`, ni `Escena`, ni
// proveedores—: su geometría es analítica cerrada y la pinta su propio renderizador.
//
// Vivía dentro de `MotorExperimental` y era casi un tercio del archivo, sin compartir con
// el resto más que el marco. Lo que necesita del adaptador está en `Motor` (seis miembros).

import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";

// Capa PURA del adaptador (`./analysis/`): clasificación formal del bloque y redacción de
// los paneles ⓘ. Vivían aquí dentro como métodos privados; no tocan el DOM, así que salieron
// a su propio módulo y ahora se pueden probar sin montar un bloque.
import {
  ALTO_CONTROLES_TRIG, ALTO_PANEL, ANCHO_MINIMO_COLUMNAS, ladoChip, ladoIcono, aplicarCajaPanel,
  esTemaOscuro, type Reparto,
} from "../ui/reparto";
import { CICLO_UNIDAD } from "../ui/iconos";
// Capa de INTERFAZ del adaptador (`./ui/`): cromo, controles y el panel de fórmula. Eran
// métodos privados de esta clase y ninguno usaba `this` más que para llegar al plugin, así
// que son funciones libres: se leen sin la clase delante y se reutilizan desde los bloques.
import { estiloChipInfo, estiloPopoverInfo, techoPopover } from "../ui/estilos";
// El chip ✎ y el salto al código de la nota: el mismo cromo táctil que montan los demás.
import { montarChipEditar } from "../ui/edicionBloque";
import {
  ponerTooltip, montarIcono, montarGlifoUnidad, montarEtiquetaMath, ponerEtiquetaAccesible,
} from "../ui/controles";
import { montarDeslizador } from "../ui/deslizador";
import { esTactil } from "../plataforma";
import { t } from "../../i18n";
import { fijarTemaPlano, colorCurva } from "../../core/rendering/paleta";
import {
  parsearBloqueTrig, ETIQUETA_POR_DEFECTO, type AvisoTrig, type UnidadTrig,
} from "../../trig/bloqueTrig";
import { modeloDeAngulo, aGrados, aRadianes } from "../../trig/modeloTrig";
import { razonesExactas, radianesExactoTexto, puntoExactoTexto } from "../../trig/exactosTrig";
import {
  dibujarTrig, encuadreTrig, colorComponente, textoAngulo, textoGradosDe, COMPONENTES,
  type ComponenteTrig,
} from "../../trig/renderTrig";
import {
  anguloDePuntero, deltaAngular, imantar, imanVigente, agarraCircunferencia, indiceMasCercano,
  rangoDeslizador, acotarARecorrido, pasoAnimacion,
  PASO_IMAN, AGARRE_PX, AGARRE_PX_TACTIL,
} from "../../trig/interaccionTrig";
// Motor MATEMÁTICO (`src/math/`): resuelve el sistema a partir de las ecuaciones escritas, sin
// mirar la vista. Ver la nota larga en `refrescarSolucion`.

import type { Motor } from "../contexto";
import type { FilaInfo } from "../info/contratos";

/**
 * Bloque obs-trig: el círculo trigonométrico. Camino propio y completo, sin `Camara`, sin
 * `Escena` y sin proveedores de geometría: aquí no hay curva que muestrear, sino una figura
 * analítica que se redibuja entera en cada cambio de caja (unas decenas de puntos: el bloque
 * más barato del plugin). Lo que sí comparte con los demás es el marco —contenedor, panel de
 * la fórmula con KaTeX, reparto en columnas o flotante, paleta y ciclo de vida—, que es
 * justamente lo que hace que se vea como parte de LMath y no como un widget aparte.
 */
export async function procesarTrig(
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
  const ajustesTrig = motor.obtenerAjustes();
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
    // DOS CARAS en estrecho: el plano o la formula, nunca una tarjeta posada sobre la otra.
    // Puede pedirlo porque el panel respeta `huecoInferior`, asi que ocupa el rectangulo del
    // PLANO y deja al pie la franja de controles, que es mando y no contenido.
    panelCompleto: true,
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
  montarEtiquetaMath(motor.plugin, tarjeta.createDiv(), "x^2 + y^2 = 1", ctx);
  const puntoVivo = tarjeta.createDiv();
  puntoVivo.style.cssText =
    "margin-top:7px; padding-top:7px; border-top:1px solid var(--lmath-borde); " +
    "font-size:11.5px; line-height:1.35; color:var(--lmath-texto-tenue);";

  // ── Lectura: la tabla de las tres razones, o la elegida en grande ─────────────────────
  const lectura = columna.createDiv({ cls: "lmath-trig-lectura" });

  // ── Controles ────────────────────────────────────────────────────────────────────────
  // Se crean aquí para que queden en el sitio correcto del árbol, y se RELLENAN más abajo,
  // cuando ya existe `pintar`. En estrecho se mudan al pie del plano (ver `aplicarReparto`):
  // el panel se esconde detrás del botón f(x), y dejar el deslizador ahí dentro lo escondería
  // justo en el dispositivo donde más falta hace, porque arrastrar con el dedo sobre un
  // círculo de 300px es impreciso.
  const controles = columna.createDiv();
  // El alto de la franja lo reparte el host —el lienzo cede exactamente esos píxeles—, así que
  // el número vive en `ALTO_CONTROLES_TRIG` y viaja a la hoja de estilos como propiedad. Copiarlo
  // en el CSS daría dos verdades para una sola medida, y bastaría tocar una para descuadrar todo.
  controles.setCssProps({ "--lmath-trig-alto-controles": `${ALTO_CONTROLES_TRIG}px` });

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
    // Los dos estados son CLASES, no dos cadenas de estilo: así el cambio de reparto es
    // encender una y apagar la otra, y no queda estilo en línea del estado anterior que
    // haya que acordarse de limpiar.
    if (estrecho) wrap.append(controles); else columna.append(controles);
    controles.toggleClass("lmath-trig-controles-pie", estrecho);
    controles.toggleClass("lmath-trig-controles", !estrecho);
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
  // `techo` marca a los que además tienen un ALTO MÁXIMO que depende de dónde estén: un panel
  // no puede medir más que el hueco que le queda por encima, y ese hueco ENCOGE cuando el cromo
  // sube. Un chip no lo necesita —su lado es fijo—; un popover sí.
  const anclajesAbajo: Array<{ el: HTMLElement; base: number; techo?: boolean }> = [];
  const chipsAbajo = {
    push: (el: HTMLElement) => anclajesAbajo.push({ el, base: 8 }),
  };
  /** Píxeles desde el borde inferior del plano hasta donde empieza el cromo. */
  const sueloChips = () => 8 + (reparto.estrecho ? ALTO_CONTROLES_TRIG : 0);
  lienzoColocado = (estrecho: boolean) => {
    canvas.style.height = estrecho ? `calc(100% - ${ALTO_CONTROLES_TRIG}px)` : "100%";
    const extra = estrecho ? ALTO_CONTROLES_TRIG : 0;
    for (const { el, base, techo } of anclajesAbajo) {
      const bajo = base + extra;
      el.style.bottom = `${bajo}px`;
      // El techo se recalcula CON el `bottom`, no una sola vez al crear el elemento. Con el
      // plano en 261 px y un chip táctil, subir el cromo deja 123 px de hueco donde el estilo
      // inicial había presupuestado 209: el panel crecía hasta salirse del bloque y perdía su
      // primera fila por el `overflow:hidden` del contenedor. Ver `techoPopover`.
      if (techo) el.style.maxHeight = techoPopover(bajo);
    }
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
  // El cuadro ⓘ es lo UNICO que se retira al pasar a la formula: los demas mandos siguen a la
  // vista. Se cierra de verdad, no se esconde, para que al volver al circulo no reaparezca solo.
  let cerrarInfo: () => void = () => { /* aún no hay panel ⓘ */ };
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

  const refTema = motor.plugin.app.workspace.on("css-change", () => pintar());
  limpieza.register(() => motor.plugin.app.workspace.offref(refTema));

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
    const fila = controles.createDiv({ cls: "lmath-trig-componentes" });
    // Grupo con nombre accesible: las tres casillas son una sola pregunta ("¿qué se dibuja?"),
    // no tres ajustes sueltos.
    fila.setAttribute("role", "group");
    ponerEtiquetaAccesible(fila, t().trig.componentes.chip);

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
    const filaValor = controles.createDiv({ cls: "lmath-trig-valor" });
    filaValor.createDiv({ text: ETIQUETA_POR_DEFECTO });
    const valorVivo = filaValor.createDiv({ cls: "lmath-trig-valor-vivo" });

    const { fijarValor } = montarDeslizador(controles, {
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
      const f = tabla.createDiv({ cls: "lmath-trig-razon" });
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
    const refTemaBotones = motor.plugin.app.workspace.on("css-change", () => sincronizarColores());
    limpieza.register(() => motor.plugin.app.workspace.offref(refTemaBotones));
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
    // REDONDO, como el resto de los chips. Fue una pastilla mientras el glifo era la palabra
    // DEG/RAD/GRAD, que es ancha y baja: en un círculo le tocaban 18 px de ancho y salía de 6
    // de alto, borrosa. Con θ y su subíndice el glifo es prácticamente cuadrado (363×378), así
    // que esa razón desapareció y la pastilla solo dejaba aire a los lados.
    const anchoU = altoU;
    // `lmath-sobre-panel`: sobrevive al modo formula. La unidad del angulo se puede cambiar
    // con la formula delante, aunque el circulo no se este viendo.
    const btnUnidad = wrap.createDiv({ cls: "lmath-sobre-panel" });
    btnUnidad.style.cssText =
      `position:absolute; top:6px; right:8px; width:${anchoU}px; height:${altoU}px; ` +
      "display:flex; align-items:center; justify-content:center; " +
      // z-index 7: por ENCIMA del panel de la formula (6). Sobrevive al cambio de cara, asi
      // que tiene que estar delante de la cara nueva y no debajo.
      `line-height:1; border-radius:${altoU / 2}px; cursor:pointer; user-select:none; z-index:7; ` +
      "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
      "border:1px solid var(--lmath-acento-borde);";
    const sincronizarUnidad = () => {
      btnUnidad.empty();
      // Un pelo más grande que el 0,66 del resto de iconos: este glifo tiene un subíndice, y
      // a la escala de los demás esa letra pequeña se queda en dos píxeles.
      montarGlifoUnidad(btnUnidad, unidad, Math.round(altoU * 0.78));
      const nombre = unidad === "degrees" ? t().ajustes.trig.opcionGrados
        : unidad === "radians" ? t().ajustes.trig.opcionRadianes
          : t().ajustes.trig.opcionGradianes;
      ponerTooltip(btnUnidad, `${t().ajustes.trig.unidad.etiqueta}: ${nombre}`);
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
    const refIdioma = motor.plugin.app.workspace.on("css-change", () => sincronizarUnidad());
    limpieza.register(() => motor.plugin.app.workspace.offref(refIdioma));
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
    const btnPlay = wrap.createDiv({ cls: "lmath-sobre-panel" });
    chipsAbajo.push(btnPlay);
    btnPlay.style.cssText =
      `position:absolute; bottom:8px; left:${8 + ladoP + 6}px; ` +
      `width:${ladoP}px; height:${ladoP}px; ` +
      "display:flex; align-items:center; justify-content:center; line-height:1; " +
      "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
      // z-index 7: ver la nota del chip de unidad.
      "border:1px solid var(--lmath-acento-borde); border-radius:50%; cursor:pointer; " +
      "user-select:none; z-index:7;";
    const sincronizarPlay = () => {
      btnPlay.empty();
      montarIcono(btnPlay, animando ? "pausar" : "reproducir", ladoIcono(ladoP));
      ponerTooltip(btnPlay, animando ? t().botones.pausar : t().botones.reproducir);
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
    // `lmath-sobre-panel`: es el interruptor entre las dos caras, así que es justo lo único que
    // no puede desaparecer con una de ellas.
    const btnFormula = wrap.createDiv({ cls: "lmath-sobre-panel" });

    /** ¿Estamos EN la cara de la fórmula? */
    const enModoFormula = () => reparto.estrecho && reparto.abierto;

    /**
     * El glifo dice A DÓNDE LLEVA, no qué hay ahora.
     *
     * Con las dos caras no hay nada posado sobre nada: una ✕ diría que hay algo que quitar de
     * encima, y no lo hay. Así que enseña `f(x)` cuando llevará a la fórmula y el CÍRCULO
     * UNITARIO cuando devolverá al círculo — el mismo criterio con el que los demás bloques
     * enseñan el plano cartesiano, con el icono de esta familia.
     *
     * Solo se repinta cuando CAMBIA: esto se llama en cada sincronización del reparto.
     */
    const glifoFormula = () => {
      const nombre = enModoFormula() ? "circulo" : "formula";
      if (btnFormula.dataset.glifo === nombre) return;
      btnFormula.dataset.glifo = nombre;
      btnFormula.empty();
      if (nombre === "formula") btnFormula.setText("f(x)");
      else montarIcono(btnFormula, "unit_circle", ladoIcono(ladoF));
      ponerTooltip(btnFormula, nombre === "formula"
        ? t().botones.verFormula
        : t().botones.verCirculo);
    };

    const estiloFormula = () => {
      btnFormula.style.cssText =
        `position:absolute; bottom:${sueloChips()}px; left:8px; ` +
        `width:${ladoF}px; height:${ladoF}px; ` +
        "display:flex; align-items:center; justify-content:center; font-size:10px; " +
        // z-index 7: es el interruptor entre las dos caras, asi que va por encima de las dos.
        "line-height:1; border-radius:50%; cursor:pointer; user-select:none; z-index:7; " +
        `font-family:"Lora", var(--font-interface); ` +
        (reparto.abierto
          ? "color:var(--lmath-acento-contraste); background:var(--lmath-acento); " +
            "border:1px solid var(--lmath-acento);"
          : "color:var(--lmath-acento-suave); background:var(--lmath-chip); " +
            "border:1px solid var(--lmath-acento-borde);") +
        (reparto.estrecho ? "" : "display:none;");
    };
    /**
     * Todo lo que hay que rehacer cuando cambia la cara: el estilo del botón, su glifo y —lo
     * que de verdad hace el intercambio— la clase del plano.
     *
     * `lmath-modo-formula` apaga TODO el contenido del plano y deja solo lo marcado
     * `lmath-sobre-panel`. Es una regla de la hoja de estilos y no una lista de elementos que ir
     * escondiendo a mano: así un chip nuevo nace ya apagado en vez de aparecer flotando sobre la
     * fórmula, y decidir que sobreviva es una decisión explícita en su `createDiv`.
     */
    const sincronizarFormula = () => {
      estiloFormula();
      glifoFormula();
      wrap.toggleClass("lmath-modo-formula", enModoFormula());
    };
    sincronizarFormula();
    sincronizarBotonFormula = sincronizarFormula;
    btnFormula.addEventListener("click", (ev) => {
      ev.stopPropagation();
      reparto.abierto = !reparto.abierto;
      // El ⓘ es el único mando que NO sobrevive al cambio de cara, así que se cierra de verdad
      // en vez de quedarse abierto detrás: si no, al volver al círculo reaparecería solo, con
      // valores de un ángulo que quizá ya no es el que se estaba mirando.
      if (enModoFormula()) cerrarInfo();
      aplicarCajaPanel(reparto);
      sincronizarFormula();
      // El panel se dibuja ENCIMA del lienzo, y el navegador no repinta el canvas al
      // descubrirlo: hay que repintarlo nosotros para que no quede un rectángulo viejo.
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
    ponerTooltip(btnInfo, t().trig.info.chip);
    btnInfo.style.cssText = estiloChipInfo(ladoI);
    montarIcono(btnInfo, "info", ladoIcono(ladoI));

    const pop = wrap.createDiv();
    pop.style.cssText = estiloPopoverInfo(ladoI);
    anclajesAbajo.push({ el: pop, base: 8 + ladoI + 6, techo: true });

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
    cerrarInfo = () => {
      if (!visible) return;
      visible = false;
      pop.setCssStyles({ display: "none" });
    };

    // El chip es lo ÚNICO que abre y cierra este cuadro. No hay listener de "clic fuera": esto
    // no es un menú que estorbe hasta que se elige algo, sino una lectura que se consulta
    // mientras se trabaja con el plano. Uno en `document` cerraba el panel al arrastrar el
    // ángulo —justo lo que hace cambiar los valores que muestra— y al abrir el ⓘ de otro
    // bloque de la misma nota. Los ⓘ de obs-graph, obs-integral y obs-derivate nunca lo
    // tuvieron; esta es la regla común a los cinco.
    btnInfo.addEventListener("click", (ev) => {
      ev.stopPropagation();
      visible = !visible;
      if (visible) construir();
      pop.setCssStyles({ display: visible ? "block" : "none" });
    });
  }

  // ── Chip ✎: la puerta al CÓDIGO del bloque ───────────────────────────────────────────
  // Solo en táctil: con ratón el `</>` de Obsidian ya lleva a la fuente, y aparece al pasar por
  // encima. En el teléfono ese botón no existe, y el lienzo se queda los toques que empiezan
  // sobre él (`touch-action:none`, que es lo que permite mover el ángulo con el dedo), así que
  // sin este chip un `obs-trig` renderizado en el móvil no tenía NINGUNA puerta a lo que uno
  // escribió: se podía leer, pero no corregir.
  //
  // Es el último de los tres bloques en heredarlo, y llega con una línea porque el chip salió de
  // `MotorExperimental` a su propio módulo. Nació sin él en la 1.3.2 justo por lo contrario: era
  // un método privado de esa clase, y lo que no se comparte no se hereda.
  //
  // Sobrevive al modo fórmula (`lmath-sobre-panel`, dentro de `montarChipEditar`): ahí no hay
  // círculo, pero sigue habiendo un bloque escrito, y corregirlo es justo lo que se puede querer
  // hacer mirándolo. Va arriba a la IZQUIERDA, la única esquina que el panel deja despejada.
  if (tactil) montarChipEditar(motor.plugin, wrap, contenedor, ctx, reparto.ladoChip);

  // Los chips de abajo se registran a medida que se montan, o sea DESPUÉS del primer
  // `aplicarReparto`. Una última colocación los pone donde toca si el bloque nació estrecho;
  // sin esto, en el móvil la primera pintura los dejaría debajo de la franja de controles.
  lienzoColocado(reparto.estrecho);
  redimensionar();
  pintar();
  revelar();
}
