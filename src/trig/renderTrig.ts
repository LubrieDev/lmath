// ─────────────────────────────────────────────
// trig · Renderizador propio del círculo (Canvas 2D)
// ─────────────────────────────────────────────
//
// `obs-trig` NO pasa por `ProveedorGeometria` ni por la `Escena`. Ese contrato existe para
// desacoplar ESTRATEGIAS DE TRAZADO de curvas —muestreo adaptativo, continuación, marching
// squares— y aquí no hay ninguna: una circunferencia es un `arc()` del canvas, y forzarla a
// entrar como polilínea muestreada la dibujaría PEOR de lo que la dibuja el navegador. Lo que sí
// se comparte con el resto del plugin es el lienzo, la paleta y el host.
//
// El encuadre es FIJO: el círculo unidad siempre centrado y siempre entero. No hay cámara, ni
// zoom, ni paneo, así que tampoco hay viewport que mantener sincronizado — solo un centro y un
// radio en píxeles, recalculados cuando cambia la caja.
//
// ── LAS DOS REJILLAS ──────────────────────────────────────────────────────────────────────────
//
// El fondo lleva rejilla cartesiana 1:1 Y radios cada 15°, y no es indecisión: cada una mide una
// cosa que la otra no sabe medir.
//
//   • La CARTESIANA mide longitudes verticales y horizontales, que es lo que son el seno y el
//     coseno. «Este cateto mide medio» se COMPRUEBA contando celdas de un cuarto; sin ella hay
//     que creerse el número del panel.
//   • Los RADIOS miden el ángulo, y caen exactamente sobre los 24 notables, así que cada rótulo
//     del borde tiene una línea que lo ancla a su punto de la circunferencia.
//
// Lo que NO hay son anillos concéntricos, que es lo que completaría una rejilla polar de libro.
// Dos motivos: aquí el dibujo entero es r = 1 —los anillos habría que inventarlos a 0,25, no
// salen de la figura—, y sobre todo compiten con la protagonista: rodeada de círculos, la
// circunferencia unidad pasa a ser uno de los aros en vez de EL círculo.

import { paletaPlano } from "../core/rendering/paleta";
import type { UnidadTrig } from "./bloqueTrig";
import type { ModeloTrig } from "./modeloTrig";
import { DOS_PI, aGrados } from "./modeloTrig";
import { puntoExactoTexto, radianesExactoTexto } from "./exactosTrig";

/** Centro y radio en píxeles CSS. Todo el dibujo se deriva de estos tres números. */
export interface EncuadreTrig {
  readonly cx: number;
  readonly cy: number;
  /** Radio de la circunferencia unidad, en píxeles. */
  readonly R: number;
}

/**
 * Familia tipográfica del lienzo.
 *
 * `ctx.font` NO es CSS completo: es la abreviatura `font` de CSS, parseada por el canvas, y ahí no
 * hay sustitución de variables. Un `11px var(--font-interface)` es inválido, y la propiedad
 * **descarta en silencio** lo que no entiende: no lanza, se queda con la fuente anterior. El
 * resultado era que ningún tamaño ni ningún peso de este renderizador llegaba a aplicarse y todo
 * se pintaba con el `10px sans-serif` por defecto del contexto. Con una familia genérica válida,
 * cada rótulo sale del tamaño con el que se dibujó la figura.
 */
const FUENTE = "sans-serif";

/**
 * Fracción del semilado más corto que ocupa el radio. El resto es margen, y no es decorativo: ahí
 * viven los rótulos de los notables (dos líneas: grados y radianes) y ahí asoma el de las
 * coordenadas de P. Con el círculo pegado al lienzo, ese texto quedaría fuera.
 */
const FRACCION_RADIO = 0.7;

/** Un radio cada 15°: los 24 ángulos para los que el bloque tiene valor exacto. */
const PASO_RADIO_GRADOS = 15;

// Umbrales de rotulación del borde. Un rótulo que no cabe no es información de menos: es una
// mancha encima del dibujo, así que cada nivel tiene el radio mínimo a partir del cual aporta.
/** Por debajo de esto no se rotula ningún notable: solo quedan los radios y sus marcas. */
const RADIO_PARA_ROTULOS = 64;
/** A partir de aquí se rotulan los 16 clásicos (múltiplos de 30° y 45°); por debajo, los 4 ejes. */
const RADIO_PARA_LOS_DIECISEIS = 84;
/** Y a partir de aquí cada rótulo lleva sus DOS unidades, una debajo de la otra. */
const RADIO_PARA_DOBLE_UNIDAD = 96;

export function encuadreTrig(anchoPx: number, altoPx: number): EncuadreTrig {
  return {
    cx: anchoPx / 2,
    cy: altoPx / 2,
    // El menor de los dos semilados: así el círculo entra entero sea cual sea la forma de la
    // caja, y sigue siendo REDONDO (mismo factor en los dos ejes, sin aspecto que corregir).
    R: Math.max(8, (Math.min(anchoPx, altoPx) / 2) * FRACCION_RADIO),
  };
}

/** Mundo → pantalla. La Y se invierte: en el plano crece hacia arriba, en el lienzo hacia abajo. */
const px = (e: EncuadreTrig, x: number): number => e.cx + x * e.R;
const py = (e: EncuadreTrig, y: number): number => e.cy - y * e.R;

/**
 * Las razones que se pueden DIBUJAR sobre la figura, cada una como el segmento que es.
 *
 * Se encienden por SEPARADO y pueden estar las tres a la vez. Que seno y coseno puedan verse
 * juntos no es un detalle: juntos SON el triángulo rectángulo inscrito, que es la figura que
 * explica de dónde salen las dos razones, y ninguna de las dos por su cuenta la enseña.
 */
export type ComponenteTrig = "seno" | "coseno" | "tangente";

/** Las tres, en el orden en que se ofrecen en el selector. */
export const COMPONENTES: readonly ComponenteTrig[] = ["seno", "coseno", "tangente"];

/**
 * Tono de cada componente, de la paleta VIVA. Lo consulta también el host para las muestras de
 * color del selector: la casilla tiene que enseñar exactamente el color con el que va a aparecer
 * el trazo, y eso solo se cumple si sale del mismo sitio.
 */
export function colorComponente(c: ComponenteTrig): string {
  const p = paletaPlano();
  return c === "seno" ? p.trigSeno : c === "coseno" ? p.trigCoseno : p.trigTangente;
}

interface OpcionesDibujo {
  /** Índice del ángulo ACTIVO: el que gobierna el arco, las componentes y el panel ⓘ. */
  readonly activo: number;
  /** Componentes encendidas. Vacío es el estado en que abre el bloque: la figura sola. */
  readonly componentes: ReadonlySet<ComponenteTrig>;
  /** Color por ángulo (rol de la paleta), para cuando hay varios en el bloque. */
  readonly colorDe: (indice: number) => string;
  /**
   * ¿El ángulo activo tiene DERECHO a valores exactos? (entrada simbólica o imán). Lo decide el
   * host, que es quien conoce la procedencia del número; el renderizador solo obedece. Sin este
   * permiso, el punto se queda sin etiqueta antes que rotular una aproximación disfrazada.
   */
  readonly puedeExacto: boolean;
  /**
   * Unidad con la que se ROTULAN los ángulos: el arco y el borde. Es presentación pura: no toca
   * ni el modelo ni la lectura de la fuente —la entrada son radianes siempre—, solo cómo se
   * escribe. Con el plano ancho el borde enseña las DOS unidades y esta manda en el arco.
   */
  readonly unidad: UnidadTrig;
}

/** El ángulo escrito en la unidad de presentación activa. */
export function textoAngulo(m: ModeloTrig, unidad: UnidadTrig): string {
  if (unidad === "degrees") return textoGrados(m);
  if (unidad === "gradians") return `${textoGradianes(aGrados(m.radianes))} gon`;
  // En radianes, un notable se escribe como fracción de π —que es su forma útil— y lo demás en
  // decimal: "0.6109 rad" dice más que una fracción inventada.
  const exacto = radianesExactoTexto(m.radianes);
  return exacto !== null ? `${exacto} rad` : `${m.radianes.toFixed(4)} rad`;
}

/**
 * Grados → gradianes (400 por vuelta en vez de 360).
 *
 * A diferencia de los otros dos, aquí NO hay forma exacta que rescatar ni la hace falta: los
 * gradianes existen justamente para que el ángulo recto sea 100, así que los múltiplos de 45° caen
 * redondos (50, 100, 150…) y los de 30° no (33,33). Se escriben con dos decimales como mucho y sin
 * ceros de relleno, que es lo que hace legible una columna donde conviven 100 y 33,33.
 */
function textoGradianes(grados: number): string {
  const g = (grados * 10) / 9;
  if (Math.abs(g - Math.round(g)) < 1e-9) return String(Math.round(g));
  return g.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Pinta el bloque entero. Los ángulos comparten el mismo dibujo —radio y punto, cada uno en su
 * color—; lo que distingue al ACTIVO es que se pinta el último (queda por encima cuando dos se
 * cruzan) y que es el que gobierna las componentes y el panel ⓘ.
 *
 * **No hay arco del ángulo.** Se dibujó —con su espiral multivuelta y el valor rotulado en la
 * bisectriz— y el usuario lo retiró entero: el ángulo vivo se lee en el panel de control, que
 * está siempre a la vista (y en pantalla estrecha, clavado al pie del plano). Sobre la figura era
 * el único trazo que dependía del ángulo concreto y no de la escala, y su rótulo caía justo en la
 * zona más apretada del dibujo, entre el origen y el lado terminal.
 */
export function dibujarTrig(
  ctx: CanvasRenderingContext2D,
  e: EncuadreTrig,
  modelos: readonly ModeloTrig[],
  anchoPx: number,
  altoPx: number,
  opciones: OpcionesDibujo
): void {
  const { activo } = opciones;
  ctx.clearRect(0, 0, anchoPx, altoPx);

  dibujarRejilla(ctx, e, anchoPx, altoPx);
  dibujarRadios(ctx, e);
  dibujarEjes(ctx, e, anchoPx, altoPx);
  dibujarCircunferencia(ctx, e);

  const m = modelos[activo];
  // El rótulo del borde que coincide con el ángulo activo se calla: ese hueco lo necesitan las
  // coordenadas de P, y dos etiquetas para el mismo punto no informan el doble, se estorban.
  dibujarNotables(ctx, e, opciones.unidad, m ? m.radianes : null);

  modelos.forEach((mi, i) => {
    if (i !== activo) dibujarAngulo(ctx, e, mi, opciones.colorDe(i), false);
  });
  if (m) {
    // Las componentes van DEBAJO del radio y del punto: son proyecciones suyas, y si se pintaran
    // encima taparían justo el elemento que están proyectando.
    dibujarComponentes(ctx, e, m, opciones.componentes);
    dibujarAngulo(ctx, e, m, paletaPlano().trigRadio, true);
    if (opciones.puedeExacto) dibujarPuntoExacto(ctx, e, m);
  }
}

/**
 * Las tres componentes del ángulo activo, cada una como el segmento que es:
 *
 *   • SENO: el cateto vertical, del pie de P hasta P. Su longitud ES |sin θ|.
 *   • COSENO: el cateto horizontal, del origen al pie de la vertical. Su longitud ES |cos θ|.
 *   • TANGENTE: sobre la recta x=1 —tangente a la circunferencia en (1,0)—, de (1,0) a (1, tan θ).
 *     De ahí le viene el nombre a la razón, y por eso se dibuja sobre esa recta y no en otro sitio.
 *
 * **Las tres se dibujan SIEMPRE.** El selector no las hace aparecer: las asciende de punteadas a
 * sólidas. La diferencia importa —una componente apagada que no existiera obligaría a encenderla
 * para descubrir siquiera dónde vive, y las tres punteadas de fondo enseñan de un vistazo que el
 * seno es vertical, el coseno horizontal y la tangente vive fuera del círculo, que es la mitad de
 * lo que hay que aprender aquí—. Punteadas van al 55 % y a 1,5 px: presentes, no protagonistas.
 *
 * Cada una en su tono también apagada: el color es lo que empareja el trazo con su fila del panel,
 * y si el punteado fuese gris habría que encender para saber cuál es cuál.
 *
 * Encendida, la componente añade su CONSTRUCCIÓN —la guía al eje del seno, y en la tangente la
 * recta auxiliar x=1 y el punto S—. Eso es lo que se pide al pulsar: no un color más fuerte, sino
 * de dónde sale el número.
 *
 * La excepción es la PROLONGACIÓN de la tangente, que se dibuja también de fondo: seno y coseno
 * tocan a P, así que se explican solos, pero la tangente vive fuera del círculo y sin esa unión
 * es una barra de color flotando.
 *
 * En 90° y 270° la tangente no existe, y el dibujo lo EXPLICA en vez de callarse: se traza la
 * prolongación del lado terminal saliéndose del plano, que es lo que hace cuando no llega a cortar
 * a x=1 nunca. Ver la rama correspondiente.
 */
function dibujarComponentes(
  ctx: CanvasRenderingContext2D,
  e: EncuadreTrig,
  m: ModeloTrig,
  encendidas: ReadonlySet<ComponenteTrig>
): void {
  const p = paletaPlano();
  const X = px(e, m.punto.x), Y = py(e, m.punto.y);

  /** Prepara el trazo de una componente según esté encendida o de fondo. */
  const pluma = (color: string, encendida: boolean): void => {
    ctx.strokeStyle = color;
    ctx.setLineDash(encendida ? [] : [3, 3]);
    ctx.lineWidth = encendida ? 3 : 1.5;
    ctx.globalAlpha = encendida ? 1 : 0.55;
  };

  // La tangente primero: es la construcción más grande y la que más lejos llega, así que el resto
  // se dibuja encima y no al revés.
  const tan = m.razones.tan;
  if (tan !== null) {
    const encendida = encendidas.has("tangente");
    const xT = px(e, 1);
    // Cerca del polo la tangente se dispara a millones y Canvas deja de dibujar con sentido: se
    // acota a un margen amplio fuera del lienzo, que visualmente es "sigue hacia allá". Punteada
    // y de fondo eso se lee bien: al acercarse a 90° el trazo verde se dispara fuera del plano,
    // que es exactamente lo que hace la tangente.
    const yT = Math.max(-1e5, Math.min(1e5, py(e, tan)));
    ctx.save();

    if (encendida) {
      // La recta x=1 sobre la que se apoya. Punteada y tenue: es andamio, no contenido, y por eso
      // es lo único de la tangente que aparece SOLO al encenderla.
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = p.trigNotable;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xT, 0); ctx.lineTo(xT, 1e4);
      ctx.stroke();
    }

    // PROLONGACIÓN del lado terminal hasta S = (1, tan θ), en los DOS estados. Es la pieza que
    // convierte el segmento vertical en una construcción: sin ella, la tangente es una barra de
    // color flotando fuera del círculo, sin relación visible con el ángulo que la produce. El
    // seno y el coseno no la necesitan porque tocan a P; la tangente vive lejos y hay que unirla.
    // Encendida va sólida y con el grosor del radio —es la hipotenusa del triángulo grande, el
    // que tiene la tangente por cateto—; de fondo, punteada como el resto de su componente.
    //
    // Dónde empieza depende del signo del coseno, y no por capricho: la tangente se construye
    // sobre la RECTA del lado terminal, no sobre su rayo. Con cos θ > 0, S cae del lado de P y la
    // prolongación arranca EN P, fuera de la circunferencia, sin repisar el radio. Con cos θ < 0,
    // S está en el rayo opuesto —la recta corta x=1 por el otro lado—, así que se traza desde el
    // origen, que también evita el solape y enseña que lo prolongado es la recta entera.
    const haciaP = m.punto.x > 0;
    pluma(p.trigTangente, encendida);
    if (encendida) ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(haciaP ? X : e.cx, haciaP ? Y : e.cy);
    ctx.lineTo(xT, yT);
    ctx.stroke();

    // El segmento que MIDE la tangente: de T(1,0) a S(1, tan θ).
    pluma(p.trigTangente, encendida);
    ctx.beginPath();
    ctx.moveTo(xT, e.cy); ctx.lineTo(xT, yT);
    ctx.stroke();

    if (encendida) {
      // S, donde se encuentran los dos. El punto es lo que remata la unión: deja claro que el
      // segmento vertical y la prolongación acaban en el MISMO sitio y no se cruzan de paso.
      ctx.beginPath();
      ctx.arc(xT, yT, 3.5, 0, DOS_PI);
      ctx.fillStyle = p.trigTangente;
      ctx.fill();
    }
    ctx.restore();
  } else {
    // 90° y 270° (y sus coterminales): la tangente NO existe, y el dibujo lo explica en vez de
    // callarse. Ahí el lado terminal es el eje Y, que es PARALELO a la recta x=1: la prolongación
    // no la corta nunca, así que se traza saliéndose del plano. Eso es exactamente lo que
    // significa «indefinida» — no que falte un valor, sino que el punto S se ha ido al infinito.
    //
    // Y evita el parpadeo: en 89° la vertical se sale por arriba, en 90° esto, en 91° se sale por
    // abajo. Sin esta rama, el trazo verde desaparecía justo en el ángulo más alto que había
    // alcanzado, que se lee como un fallo y no como una discontinuidad.
    //
    // No se dibuja ni el segmento sobre x=1 (sería infinito) ni el punto S (no hay dónde
    // ponerlo): solo el rayo. El resto de la construcción no existe en este ángulo.
    const LEJOS = 1e4;
    ctx.save();
    pluma(p.trigTangente, encendidas.has("tangente"));
    if (encendidas.has("tangente")) ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X + m.punto.x * LEJOS, Y - m.punto.y * LEJOS);
    ctx.stroke();
    ctx.restore();
  }

  // COSENO. Sin guía de P al eje X: esa vertical ES el segmento del seno, que ahora se dibuja
  // siempre. Repetirla punteada encima solo ensuciaría el trazo del seno.
  ctx.save();
  pluma(p.trigCoseno, encendidas.has("coseno"));
  ctx.beginPath();
  ctx.moveTo(e.cx, e.cy);
  ctx.lineTo(X, e.cy);
  ctx.stroke();
  ctx.restore();

  // SENO.
  const senoEncendido = encendidas.has("seno");
  ctx.save();
  pluma(p.trigSeno, senoEncendido);
  ctx.beginPath();
  ctx.moveTo(X, e.cy);
  ctx.lineTo(X, Y);
  ctx.stroke();
  if (senoEncendido) {
    // Guía de P al eje Y: la horizontal a la altura de P, que no coincide con ningún otro trazo
    // —el coseno vive sobre el eje X, no a esa altura—.
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(X, Y); ctx.lineTo(e.cx, Y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Coordenadas exactas de P junto al punto: `(√3/2, 1/2)` donde otros ponen `(0.866, 0.5)`. Es el
 * diferenciador del bloque puesto donde más se ve. Si el ángulo no es notable no se rotula nada:
 * el hueco vacío dice la verdad y un decimal disfrazado de forma cerrada, no.
 */
function dibujarPuntoExacto(
  ctx: CanvasRenderingContext2D, e: EncuadreTrig, m: ModeloTrig
): void {
  const texto = puntoExactoTexto(m.radianes);
  if (texto === null) return;
  const X = px(e, m.punto.x), Y = py(e, m.punto.y);
  // La etiqueta sale HACIA FUERA del círculo, en la dirección del radio, para no taparlo. Se
  // alinea al lado contrario según el semiplano: en la izquierda crece hacia la izquierda.
  const haciaDerecha = m.punto.x >= 0;
  ctx.save();
  ctx.fillStyle = paletaPlano().trigRadio;
  ctx.font = `11px ${FUENTE}`;
  ctx.textAlign = haciaDerecha ? "left" : "right";
  ctx.textBaseline = m.punto.y >= 0 ? "bottom" : "top";
  ctx.fillText(texto, X + (haciaDerecha ? 9 : -9), Y + (m.punto.y >= 0 ? -6 : 6));
  ctx.restore();
}

/**
 * Rejilla cartesiana 1:1, SIN números. Es la que da la escala de un vistazo —se ve que el radio
 * mide uno— y, sobre todo, la que permite MEDIR el seno y el coseno: sus segmentos son vertical y
 * horizontal, así que se cuentan en celdas. Los rótulos numéricos se omiten a propósito: los
 * números que este bloque quiere que leas son el ángulo y sus razones, y una retícula numerada
 * competiría con ellos por la atención en un plano de 261 px.
 *
 * La celda se mide en UNIDADES DE MUNDO, no en píxeles, para que siga siendo 1:1 y las líneas
 * caigan siempre sobre fracciones redondas del radio; solo se afloja a media unidad cuando el
 * círculo es tan pequeño que un cuarto de unidad quedaría por debajo de lo legible.
 */
function dibujarRejilla(
  ctx: CanvasRenderingContext2D, e: EncuadreTrig, anchoPx: number, altoPx: number
): void {
  const paso = e.R * 0.25 >= 14 ? 0.25 : 0.5;
  const celda = e.R * paso;
  ctx.save();
  ctx.strokeStyle = paletaPlano().rejilla;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Se cuenta desde el CENTRO hacia fuera (no desde el borde del lienzo): así la retícula está
  // anclada al origen y una línea cae exactamente sobre cada eje, sea cual sea el tamaño de la
  // caja. El medio píxel es para que una línea de 1px no salga difuminada entre dos columnas.
  const nx = Math.ceil(anchoPx / 2 / celda);
  for (let i = -nx; i <= nx; i++) {
    const x = Math.round(e.cx + i * celda) + 0.5;
    ctx.moveTo(x, 0); ctx.lineTo(x, altoPx);
  }
  const ny = Math.ceil(altoPx / 2 / celda);
  for (let j = -ny; j <= ny; j++) {
    const y = Math.round(e.cy + j * celda) + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(anchoPx, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Un radio punteado cada 15°, del origen a la circunferencia, con su marca sobre ella.
 *
 * Se paran EN la circunferencia y no siguen hasta el borde del lienzo por dos motivos: fuera del
 * círculo está el margen donde viven los rótulos, y un radio que llega hasta el punto y ahí se
 * acaba dice «este ángulo es uno de los notables» mucho más claro que una línea infinita.
 *
 * Punteados, y del mismo gris que la rejilla: los dos son fondo. Si compitieran con el trazo del
 * ángulo, la figura pasaría a ser la rejilla. Los múltiplos de 90° se saltan porque ahí ya está
 * el eje, y superponerle una línea punteada solo lo emborrona.
 */
function dibujarRadios(ctx: CanvasRenderingContext2D, e: EncuadreTrig): void {
  const p = paletaPlano();
  ctx.save();
  ctx.strokeStyle = p.rejilla;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  for (let g = 0; g < 360; g += PASO_RADIO_GRADOS) {
    if (g % 90 === 0) continue;
    const a = (g * Math.PI) / 180;
    ctx.moveTo(e.cx, e.cy);
    ctx.lineTo(e.cx + e.R * Math.cos(a), e.cy - e.R * Math.sin(a));
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Marca sobre la circunferencia, más gruesa en los 16 clásicos: es la misma jerarquía que
  // siguen los rótulos, así que a simple vista se ve cuáles llevan nombre y cuáles no.
  ctx.fillStyle = p.trigNotable;
  for (let g = 0; g < 360; g += PASO_RADIO_GRADOS) {
    const a = (g * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(e.cx + e.R * Math.cos(a), e.cy - e.R * Math.sin(a), esClasico(g) ? 2.2 : 1.5, 0, DOS_PI);
    ctx.fill();
  }
  ctx.restore();
}

/** Los 16 ángulos con nombre propio: múltiplos de 30° y de 45°. */
const esClasico = (grados: number): boolean => grados % 30 === 0 || grados % 45 === 0;

/**
 * Los notables rotulados por fuera de la circunferencia, en las DOS unidades: grados arriba y
 * fracción de π debajo. La correspondencia entre las dos escrituras es media lección del círculo
 * unidad, y enseñarlas juntas la da gratis — leer `120°` sobre `2π/3` en el mismo sitio hace el
 * trabajo que de otro modo hay que ir a buscar al panel.
 *
 * Por escalones, porque el texto no se encoge con el plano: los 16 en doble unidad cuando hay
 * sitio, los 16 en la unidad del chip cuando hay menos, los 4 de los ejes cuando hay poco y
 * ninguno cuando el círculo es diminuto. Un rótulo que no cabe no informa: mancha.
 *
 * `anguloActivo` se calla su propio rótulo: el arco ya dice cuánto vale ese ángulo, y el hueco
 * hace falta para las coordenadas de P.
 */
function dibujarNotables(
  ctx: CanvasRenderingContext2D,
  e: EncuadreTrig,
  unidad: UnidadTrig,
  anguloActivo: number | null
): void {
  if (e.R < RADIO_PARA_ROTULOS) return;
  const dieciseis = e.R >= RADIO_PARA_LOS_DIECISEIS;
  const doble = e.R >= RADIO_PARA_DOBLE_UNIDAD;
  // El activo se compara por su COTERMINAL: con θ = 750° el punto está en 30°, así que el rótulo
  // que estorba es el de 30°, no el de un ángulo que no está en el dibujo.
  const activoGrados = anguloActivo === null ? null
    : ((aGrados(anguloActivo) % 360) + 360) % 360;

  ctx.save();
  ctx.fillStyle = paletaPlano().etiqueta;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let g = 0; g < 360; g += PASO_RADIO_GRADOS) {
    if (!(dieciseis ? esClasico(g) : g % 90 === 0)) continue;
    // La diferencia se mide DANDO LA VUELTA (359,8° está a 0,2° de 0°, no a 359,8°): sin eso, un
    // arrastre que se pasa un pelo del cero recupera el rótulo de 0° justo encima del punto.
    if (activoGrados !== null && Math.min(
      Math.abs(g - activoGrados), 360 - Math.abs(g - activoGrados)
    ) < 0.5) continue;
    const a = (g * Math.PI) / 180;
    const x = e.cx + (e.R + 15) * Math.cos(a);
    const y = e.cy - (e.R + 15) * Math.sin(a);
    const rad = radianesExactoTexto(a) ?? "";
    if (doble) {
      // Las dos escrituras clásicas, una debajo de otra. El gradián NO entra aquí aunque sea la
      // unidad activa: `33.33` bajo `30°` no enseña ninguna correspondencia que valga la pena
      // memorizar, que es justo lo que esta línea doble existe para dar.
      ctx.font = `10px ${FUENTE}`;
      ctx.fillText(`${g}°`, x, y - 6);
      ctx.font = `9px ${FUENTE}`;
      ctx.fillText(rad, x, y + 6);
    } else {
      ctx.font = `10px ${FUENTE}`;
      const uno = unidad === "degrees" ? `${g}°`
        : unidad === "gradians" ? textoGradianes(g) : rad;
      ctx.fillText(uno, x, y);
    }
  }
  ctx.restore();
}

/**
 * Los dos ejes, con punta de flecha en los cuatro extremos y sin marcas de ±1: la escala ya la da
 * la rejilla —el radio mide exactamente cuatro celdas— y los cortes del círculo con los ejes caen
 * sobre líneas de la retícula, así que un tick ahí sería una tercera forma de decir lo mismo.
 */
function dibujarEjes(
  ctx: CanvasRenderingContext2D, e: EncuadreTrig, anchoPx: number, altoPx: number
): void {
  ctx.save();
  ctx.strokeStyle = paletaPlano().eje;
  ctx.fillStyle = paletaPlano().eje;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, e.cy); ctx.lineTo(anchoPx, e.cy);
  ctx.moveTo(e.cx, 0); ctx.lineTo(e.cx, altoPx);
  ctx.stroke();

  const L = 7, A = 3.5;
  const puntas: ReadonlyArray<readonly [number, number, number, number]> = [
    [anchoPx - 1, e.cy, -1, 0],   // →
    [1, e.cy, 1, 0],              // ←
    [e.cx, 1, 0, 1],              // ↑
    [e.cx, altoPx - 1, 0, -1],    // ↓
  ];
  for (const [x, y, dx, dy] of puntas) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx * L + dy * A, y + dy * L + dx * A);
    ctx.lineTo(x + dx * L - dy * A, y + dy * L - dx * A);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function dibujarCircunferencia(ctx: CanvasRenderingContext2D, e: EncuadreTrig): void {
  ctx.save();
  ctx.strokeStyle = paletaPlano().trigCircunferencia;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(e.cx, e.cy, e.R, 0, DOS_PI);
  ctx.stroke();
  ctx.restore();
}

/**
 * Un ángulo: el lado terminal desde el origen y su punto sobre la circunferencia. El activo se
 * dibuja con algo más de peso y con halo —para que se distinga de los demás cuando se cruzan—,
 * pero es la misma figura: aquí no hay un ángulo "explicado" y otros de adorno.
 */
function dibujarAngulo(
  ctx: CanvasRenderingContext2D,
  e: EncuadreTrig,
  m: ModeloTrig,
  color: string,
  activo: boolean
): void {
  const X = px(e, m.punto.x), Y = py(e, m.punto.y);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = activo ? 2 : 1.5;
  if (!activo) ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(e.cx, e.cy);
  ctx.lineTo(X, Y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (activo) {
    ctx.beginPath();
    ctx.arc(X, Y, 5.5, 0, DOS_PI);
    ctx.fillStyle = paletaPlano().halo;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(X, Y, activo ? 3.5 : 3, 0, DOS_PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Un ángulo escrito en GRADOS. Única forma de escribirlo en todo el bloque: la lectura del panel,
 * el punto P y las filas del panel ⓘ pasan todas por aquí.
 *
 * Que sea una sola función no es aseo, es la regla de no tener DOS VERDADES para el mismo número.
 * Cuando el ⓘ redondeaba por su cuenta a dos decimales, un mismo ángulo se leía `114.6°` en el
 * panel y `114.59°` en el ⓘ, a la vez y a un centímetro de distancia; quien lo viera tenía que
 * decidir cuál de los dos era el ángulo. Es el mismo defecto que ya se corrigió entre el plano y
 * el ⓘ con las vueltas de la animación (ver `pasoAnimacion`).
 *
 * Sin decimales cuando el ángulo es entero en grados —que es el caso de todo lo escrito con `°`—
 * y con UNO cuando no, para que un ángulo en radianes no salga como un número redondo que no es.
 * Uno y no dos porque este número se repinta en cada marco del arrastre: cada decimal de más es
 * una cifra más bailando en el sitio más visible del bloque, y la precisión que alguien pueda
 * necesitar de verdad ya está en la fila de radianes del ⓘ, con seis.
 */
export function textoGradosDe(radianes: number): string {
  const g = aGrados(radianes);
  return Math.abs(g - Math.round(g)) < 1e-9 ? `${Math.round(g)}°` : `${g.toFixed(1)}°`;
}

/** El ángulo de un modelo en grados. Atajo de `textoGradosDe` para quien ya tiene el modelo. */
function textoGrados(m: ModeloTrig): string {
  return textoGradosDe(m.radianes);
}
