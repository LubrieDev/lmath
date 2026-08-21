// ─────────────────────────────────────────────
// host-obsidian · ui · Geometría del bloque: quién ocupa qué
// ─────────────────────────────────────────────
//
// Las medidas del bloque y la decisión de si la fórmula va AL LADO del plano o FLOTANDO
// sobre él. Son números y reglas de colocación: no dependen de qué bloque sea, ni del motor,
// ni del contenido. Estaban al principio de `MotorExperimental.ts`, donde competían por la
// atención con la lógica de los seis bloques.

/** Estado del reparto y utilidades que lo aplican. Lo posee `process`. */

// ── REPARTO del bloque: quién ocupa qué ────────────────────────────────────────────
// Dos formas de repartir el sitio entre la fórmula y el plano:
//
//   • COLUMNAS (ancho): la fórmula a la izquierda y el plano a la derecha, como siempre.
//   • ESTRECHO: el bloque no da para las dos cosas a la vez, así que enseña UNA. Con
//     `panelCompleto` son dos MODOS (el plano, o la fórmula ocupando el bloque entero) y el
//     botón de la esquina cambia de uno a otro; sin él, la fórmula es una tarjeta que se
//     posa sobre el plano.
//
// Se entra en estrecho por DOS caminos independientes: que el contenedor no llegue a
// `ANCHO_MINIMO_COLUMNAS` —un panel lateral del escritorio sufre lo mismo que un teléfono—, o
// que sea un MÓVIL EN VERTICAL aunque pase del umbral (`esMovilVertical`, con el porqué). Lo
// que NO entra por aquí es lo que depende de cómo se señala (crosshair, carril, cruz del
// cursor): eso va por `plataforma.ts` y vale en cualquier orientación.
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
 *
 * Subió de 78 a 86 con el deslizador nuevo: la píldora mide 8px más que la línea fina que
 * sustituyó, y sin ese hueco la franja recortaba el mando justo en el móvil, que es donde el
 * deslizador existe para no tener que arrastrar el punto sobre un círculo de 300px.
 */
export const ALTO_CONTROLES_TRIG = 86;

/**
 * Semirrango vertical de la vista de `obs-vector` cuando el dibujo no pide otra cosa.
 *
 * Es el mismo `[-7, 7]` con el que arranca la cámara de los demás bloques, y no un número nuevo:
 * un vector `(3,2)` dibujado en un obs-vector tiene que verse EXACTAMENTE del mismo tamaño que
 * el punto (3,2) en el obs-graph de al lado, o los dos bloques dejan de hablar del mismo plano.
 */
export const SEMI_Y_VECTOR = 7;

/** Alto del bloque en el reparto por COLUMNAS (el de siempre). */
export const ALTO_PANEL = 261;

// ── Geometría del panel de fórmulas ────────────────────────────────────────────────────
// Vive a nivel de módulo, y no dentro de `crearScrollerLatex`, porque hay un segundo
// interesado: `obs-vector` apila UNA TARJETA POR LÍNEA y necesita saber cuánto alto pedir
// para que quepan. Copiar los números allí daría dos verdades para una sola medida.
/** px reservados arriba (bajo la barra de toggle) cuando las tarjetas llenan la columna. */
export const PAD_SUP_PANEL = 32;
/** px de hueco lateral e inferior del panel. */
export const PAD_LADO_PANEL = 8;
/** px entre tarjetas apiladas. */
export const HUECO_TARJETAS = 10;
/**
 * Alto de UNA ranura del par "ambas" = alto útil (con 2 cajas y su hueco) / 2. Es el alto
 * MÍNIMO (y por defecto) de la tarjeta: una fórmula que cabe se ve idéntica en todos los
 * bloques (=105,5px). Una tarjeta única con una fórmula que CABE se queda aquí (no crece);
 * solo si el contenido SUPERA este mínimo se ajusta hacia arriba (altura dinámica).
 */
export const ALTO_TARJETA = (ALTO_PANEL - PAD_SUP_PANEL - PAD_LADO_PANEL - HUECO_TARJETAS) / 2;
/**
 * Techo del alto DINÁMICO de la tarjeta única: una fórmula alta (un despeje con fracción y
 * raíz anidadas) CRECE hasta aquí en vez de quedar cortada. Deja simétrico el hueco de la
 * barra de toggle; si ni así cabe, el área gana su propio scroll VERTICAL.
 */
export const ALTO_TARJETA_MAX = ALTO_PANEL - 2 * PAD_SUP_PANEL;

/**
 * Alto que pide un panel de `n` tarjetas apiladas, para los bloques que muestran UNA POR
 * LÍNEA (hoy solo `obs-vector`).
 *
 * Con una o dos, el alto de siempre: así un bloque corto se ve exactamente igual de alto que
 * el obs-graph de al lado, que es lo que hace que una nota con varios bloques no parezca una
 * colección de widgets. A partir de tres el bloque CRECE, porque repartir 261px entre cuatro
 * tarjetas deja cada fórmula en 55px y a ese tamaño ya no se lee una fracción.
 *
 * El tope de 2× no es prudencia decorativa: un bloque con quince vectores no debería empujar
 * el resto de la nota fuera de la pantalla. Pasado el tope, las tarjetas vuelven a repartirse
 * lo que hay (cada una con su scroll propio, que es como el panel ya resuelve el exceso).
 */
/**
 * Alto del mando de un parámetro, más bajo que el del ángulo de obs-trig (22px) porque aquí se
 * apilan tres o cuatro dentro de un cuadro que no debe comerse el plano.
 */
export const ALTO_MANDO_PARAMETRO = 18;

export function altoPanelPorTarjetas(n: number): number {
  const pedido = PAD_SUP_PANEL + n * ALTO_TARJETA + (n - 1) * HUECO_TARJETAS + PAD_LADO_PANEL;
  return Math.max(ALTO_PANEL, Math.min(2 * ALTO_PANEL, pedido));
}

/**
 * Ancho de contenedor por debajo del cual se pasa al reparto ESTRECHO.
 *
 * No es un número redondo cualquiera: en columnas el plano se lleva ⅔ del bloque (el panel
 * pide 50% y el plano 100%), así que para que el plano no salga MÁS ALTO QUE ANCHO hace
 * falta ⅔·W ≥ 261 → W ≥ 392. Con 520 el plano nunca baja de 4:3, que es la forma mínima
 * en la que una gráfica se lee como una gráfica.
 *
 * Ojo con lo que este número NO dice. Está calibrado sobre la forma del PLANO, así que solo
 * responde «¿la gráfica sigue pareciendo una gráfica?». Un móvil en vertical con 560px de
 * contenedor la pasa —y deja la fórmula en una tira de 200px donde no cabe una integral—, y por
 * eso la orientación es un segundo disparador y no un ajuste de este número: subirlo hasta
 * cubrir ese teléfono se llevaría por delante paneles laterales del escritorio que hoy se ven
 * perfectamente en columnas.
 */
export const ANCHO_MINIMO_COLUMNAS = 520;

/** Alto del plano en FLOTANTE, como fracción de su ancho (16:13 ≈ el 4:3 largo del móvil). */
export const PROPORCION_PLANO_FLOTANTE = 0.82;

/** Alto de la tarjeta flotante de la fórmula. */
export const ALTO_PANEL_FLOTANTE = 180;
/** Margen de la tarjeta flotante contra el borde del plano, y hueco entre chips. */
export const MARGEN_FLOTANTE = 8;

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
export function ladoChip(tactil: boolean): number {
  return tactil ? 30 : 22;
}

/** Lado del icono dentro de un chip: deja el mismo aire proporcional en ambos tamaños. */
export function ladoIcono(lado: number): number {
  return Math.round(lado * 0.66);
}

/**
 * Hueco que la tarjeta flotante deja libre por debajo: exactamente la fila de chips de
 * abajo. No se pega al borde a propósito — ahí viven el ⓘ y el propio botón con el que se
 * cierra la fórmula, y un panel que tapa su botón de cerrar es una trampa.
 */
export function huecoChips(lado: number): number {
  return MARGEN_FLOTANTE + lado + MARGEN_FLOTANTE;
}

/**
 * Estado del reparto, compartido entre el panel (que se crea antes) y el plano. Lo posee
 * `process`, lo registra `crearScrollerLatex` y lo consultan las tarjetas al recalcular su
 * alto, así que hay UNA sola respuesta a "¿estamos estrechos?" en todo el bloque.
 */
export interface Reparto {
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
  /**
   * Alto del panel en el reparto por COLUMNAS. Sin fijar vale `ALTO_PANEL`, que es lo que piden
   * todos los bloques cuyo panel muestra UNA fórmula. `obs-vector` apila una tarjeta por línea,
   * así que su alto depende de cuántas haya (`altoPanelPorTarjetas`).
   */
  alto?: number;
  /**
   * En estrecho, ¿el panel ocupa el BLOQUE ENTERO en vez de ser una tarjeta flotante?
   *
   * Con él, el bloque estrecho tiene DOS MODOS excluyentes —el plano o la fórmula—, y el botón
   * de la esquina cambia de uno a otro. Sin él, el de siempre: una tarjeta de 180px posada
   * sobre un plano que se sigue viendo alrededor.
   *
   * Es un modo y no un ajuste: lo fija el bloque al construirse y no cambia en toda su vida. Lo
   * piden `obs-graph` y familia, `obs-vector` y —desde que el panel respeta `huecoInferior`—
   * también `obs-trig`, cuyos controles al pie del plano se quedan a la vista en los dos modos.
   */
  panelCompleto?: boolean;
  /**
   * Quién quiere enterarse de que el reparto ha CAMBIADO. Lo llena `alCambiarReparto` y lo
   * recorre `avisarCambioDeReparto`; vive en el propio reparto, y no en una lista suelta del
   * bloque, porque quien se apunta (el panel) se construye antes que quien avisa (el plano) y el
   * reparto es lo único que los dos tienen ya en la mano cuando se conocen.
   */
  oyentes?: Array<() => void>;
}

/**
 * Apunta a alguien a los cambios de reparto. Lo usa el panel de vistas para retirar la vista
 * COMBINADA cuando el bloque se estrecha: esa decisión depende del ANCHO, que en el momento de
 * construir el panel todavía no se ha medido, y que cambia sola al girar el teléfono.
 *
 * Sin baja: los oyentes viven exactamente lo que el reparto, que es un objeto del bloque y se va
 * con él. Un `off` aquí solo daría a los bloques una obligación más que cumplir para nada.
 */
export function alCambiarReparto(reparto: Reparto, oyente: () => void): void {
  (reparto.oyentes ??= []).push(oyente);
}

/**
 * Avisa a los oyentes. La llaman los bloques con panel de fórmula desde su `aplicarReparto`, y
 * DESPUÉS de escribir la caja del panel: quien reacciona quiere leer el reparto ya vigente, no
 * uno a medio aplicar. `obs-trig` no la llama porque su panel es de control, no de vistas, y
 * nadie se apunta.
 */
export function avisarCambioDeReparto(reparto: Reparto): void {
  for (const oyente of reparto.oyentes ?? []) oyente();
}

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
export function aplicarCajaPanel(reparto: Reparto): void {
  const panel = reparto.panel;
  if (!panel) return;

  // OJO, y es la trampa de esta función: el panel lleva la clase `.lmath-latex`, y la hoja de
  // estilos le fija `width:50%` (es su reparto en columnas, que es el caso normal). Un estilo
  // en línea solo pisa las propiedades que ESCRIBE, así que toda rama de aquí abajo tiene que
  // declarar SU ancho y SU alto aunque «no los necesite»: callarlos no los deja libres, los
  // deja en el 50% de la hoja. Un panel a pantalla completa sin `width:auto` sale absoluto, de
  // alto completo y de media anchura —y encima con el `right:0` descartado por sobrerrestricción—.
  // Es el fallo que tuvo el modo fórmula al nacer.

  // COLUMNAS: la mitad izquierda del flujo, la de siempre.
  if (!reparto.estrecho) {
    panel.style.cssText =
      "position:relative; width:50%; " +
      `height:${reparto.alto ?? ALTO_PANEL}px; padding:0; overflow:hidden;`;
    return;
  }

  const visible = reparto.abierto ? "flex" : "none";

  // MODO FÓRMULA: el panel ES el bloque. Ni margen, ni borde, ni sombra: no es una tarjeta
  // posada encima de nada, es la otra cara del bloque, y el marco que se ve alrededor es el del
  // propio bloque (`.lmath-container`, que además lo recorta con su radio y su `overflow`).
  //
  // Sin `inset:0` a medias: ocupa la caja entera, así que el plano de debajo no asoma por
  // ningún borde y no hay que decidir qué trozo de gráfica se ve detrás de la fórmula.
  if (reparto.panelCompleto) {
    // El suelo lo pone `huecoInferior`, que vale 0 en todos los bloques menos en `obs-trig`.
    // Ahí el plano cede su franja de pie a los controles —las tres casillas, la lectura de θ y
    // el deslizador—, y esos NO son parte de la cara que se cambia: siguen a la vista en los
    // dos modos, porque son el mando del bloque y no su contenido. Así que el panel ocupa el
    // rectángulo del PLANO, no el del bloque.
    const suelo = reparto.huecoInferior ?? 0;
    panel.style.cssText =
      `position:absolute; top:0; left:0; right:0; bottom:${suelo}px; ` +
      "width:auto; height:auto; z-index:6; box-sizing:border-box; " +
      `display:${visible}; padding:0; overflow:hidden; background:var(--lmath-panel);`;
    return;
  }

  // TARJETA FLOTANTE: el panel se posa sobre un plano que se sigue viendo alrededor.
  // `huecoInferior` lo usa solo obs-trig, que en estrecho saca sus controles del panel y los
  // deja en una franja al pie del plano: sin este margen, la tarjeta flotante caería encima del
  // deslizador. Vale 0 en los demás bloques, así que su caja no se mueve un píxel.
  const suelo = huecoChips(reparto.ladoChip) + (reparto.huecoInferior ?? 0);
  panel.style.cssText =
    "position:absolute; z-index:6; box-sizing:border-box; " +
    `display:${visible}; ` +
    `left:${MARGEN_FLOTANTE}px; right:${MARGEN_FLOTANTE}px; ` +
    `bottom:${suelo}px; width:auto; height:${ALTO_PANEL_FLOTANTE}px; ` +
    "padding:0; overflow:hidden; background:var(--lmath-panel); " +
    "border:1px solid var(--lmath-borde); border-radius:12px; " +
    "box-shadow:var(--lmath-sombra-flotante);";
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
export function esTemaOscuro(el: HTMLElement): boolean {
  return el.doc.body.classList.contains("theme-dark");
}

