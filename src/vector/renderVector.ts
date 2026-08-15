// ─────────────────────────────────────────────
// vector · Renderizador del plano de obs-vector (PURO)
// ─────────────────────────────────────────────
//
// Dibuja lo que `dibujoDeBloque` haya resuelto: flechas y marcas, sobre la misma rejilla y los
// mismos ejes que cualquier otro bloque de LMath (`Overlay`, que es agnóstico de la matemática).
// No sabe de sintaxis, ni de nombres de puntos, ni de campos: recibe segmentos en coordenadas de
// MUNDO y los pinta.
//
// La punta de flecha es un TRIÁNGULO RELLENO, y va aquí y no en la geometría: el motor de curvas
// mantiene la regla de que el renderizador solo conoce polilíneas, y una punta de flecha es
// exactamente eso —cómo se ve el final de un trazo—, no un trozo más de curva. Se compone con la
// misma receta que las puntas de los ejes de obs-trig (`moveTo` al vértice + dos lados + `fill`),
// para que las flechas del plugin sean todas la misma flecha.
//
// Lo que este módulo NO pinta son los NOMBRES. Un nombre de vector es una variable matemática y
// se escribe como tal (`\vec{v}`, no una `v` cursiva cualquiera), y la única tipografía que sabe
// hacerlo es la misma que compone las tarjetas del panel: KaTeX, que es DOM. Así que aquí se
// calcula DÓNDE va cada rótulo (`rotulosDeDibujo`) y es el host quien lo coloca sobre el lienzo.
// Repartido así, la `v` del plano y la `v` de su tarjeta son la misma letra por construcción.

import type { Viewport } from "../core/contracts";
import { aPantallaX, aPantallaY } from "../core/scene/viewport-utils";
import { Overlay } from "../core/rendering/overlay/Overlay";
import { colorCurva, type ColorRGBA } from "../core/rendering/paleta";
import type { DibujoVector, Flecha, Marca } from "./bloqueVector";

/** Grosor del trazo de una flecha. Un punto por encima del de una curva: son pocas, y lo que
 *  se mira de un vector es su dirección, no su forma. */
const GROSOR_PX = 2.5;
/** Largo de la punta, y su medio ancho. Proporción ~2:1, la del rotulado a mano. */
const PUNTA_PX = 11;
const PUNTA_ANCHO_PX = 4.5;
/** Radio del disco con el que se marca un punto. */
const RADIO_MARCA_PX = 3.5;
/** Separación del rótulo respecto del trazo (flechas) o del disco (marcas). */
const ROTULO_PX = 12;

/** Recorte de coordenadas de pantalla: Canvas2D no maneja valores astronómicos, y un vector con
 *  una componente de 1e12 sigue siendo una línea que sale del lienzo por donde debe. */
const LIM_PX = 1e6;
const acotar = (v: number): number => (v < -LIM_PX ? -LIM_PX : v > LIM_PX ? LIM_PX : v);

const css = (c: ColorRGBA): string =>
  `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3]})`;

/** Mundo → pantalla, ya acotado. */
function aPantalla(vp: Viewport, p: readonly [number, number]): readonly [number, number] {
  return [acotar(aPantallaX(vp, p[0])), acotar(aPantallaY(vp, p[1]))];
}

/**
 * Geometría de pantalla de una flecha: los dos extremos, la dirección y la NORMAL sobre la que
 * se aparta el rótulo. La comparten el dibujo y el rotulado —la punta necesita la normal para su
 * ancho, y el rótulo para separarse del trazo—, y con dos copias de esta cuenta el nombre
 * acabaría flotando en un sitio que la flecha ya no ocupa.
 *
 * La normal apunta SIEMPRE hacia arriba en pantalla (`ny ≤ 0`): así los rótulos de todas las
 * flechas quedan del mismo lado y no bailan según el cuadrante en el que caiga el vector.
 *
 * Con la flecha de longitud casi nula la dirección no existe: se devuelven ceros, y quien llama
 * ya distingue ese caso por `largo`.
 */
interface GeometriaFlecha {
  readonly x0: number; readonly y0: number;
  readonly x1: number; readonly y1: number;
  readonly largo: number;
  readonly ux: number; readonly uy: number;
  readonly nx: number; readonly ny: number;
}

function geometriaFlecha(vp: Viewport, f: Flecha): GeometriaFlecha {
  const [x0, y0] = aPantalla(vp, f.desde);
  const [x1, y1] = aPantalla(vp, f.hasta);
  const dx = x1 - x0, dy = y1 - y0;
  const largo = Math.hypot(dx, dy);
  if (largo < 0.5) return { x0, y0, x1, y1, largo, ux: 0, uy: 0, nx: 0, ny: 0 };
  const ux = dx / largo, uy = dy / largo;
  const [nx, ny] = uy > 0 ? [uy, -ux] : [-uy, ux];
  return { x0, y0, x1, y1, largo, ux, uy, nx, ny };
}

/**
 * Una flecha: el trazo y su punta.
 *
 * El trazo se ACORTA la longitud de la punta antes de dibujarse. Con la línea entera por debajo
 * del triángulo el resultado es casi el mismo, pero solo casi: en una flecha corta el trazo
 * asoma por los lados del vértice y la punta deja de leerse como una punta. Acortando, el
 * vértice del triángulo cae EXACTAMENTE sobre el extremo del vector, que es donde el usuario va
 * a leer las coordenadas.
 *
 * Una flecha de longitud nula (`v = (0,0)`, o dos puntos que coinciden) no tiene dirección: no
 * hay punta que orientar, así que se marca el sitio con un disco. Es la respuesta honesta —el
 * vector nulo existe y tiene ese aspecto—, no un caso que se descarta.
 */
function dibujarFlecha(ctx: CanvasRenderingContext2D, vp: Viewport, f: Flecha): void {
  const color = css(colorCurva(f.rol));
  const g = geometriaFlecha(vp, f);

  if (g.largo < 0.5) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(g.x1, g.y1, RADIO_MARCA_PX, 0, 2 * Math.PI);
    ctx.fill();
    return;
  }

  // La punta no puede comerse la flecha: en un vector muy corto se recorta a la mitad del trazo.
  const punta = Math.min(PUNTA_PX, g.largo * 0.5);
  const bx = g.x1 - g.ux * punta, by = g.y1 - g.uy * punta;

  ctx.strokeStyle = color;
  ctx.lineWidth = GROSOR_PX;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(g.x0, g.y0);
  ctx.lineTo(bx, by);
  ctx.stroke();

  const ancho = (PUNTA_ANCHO_PX * punta) / PUNTA_PX;   // la punta encoge entera, no solo de largo
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(g.x1, g.y1);
  ctx.lineTo(bx + g.nx * ancho, by + g.ny * ancho);
  ctx.lineTo(bx - g.nx * ancho, by - g.ny * ancho);
  ctx.closePath();
  ctx.fill();
}

/** Un punto: el disco. Sin flecha desde el origen —un punto no es un vector de posición salvo
 *  que alguien lo escriba— y sin coordenadas rotuladas: ya están en su tarjeta. */
function dibujarMarca(ctx: CanvasRenderingContext2D, vp: Viewport, m: Marca): void {
  const [x, y] = aPantalla(vp, m.en);
  ctx.fillStyle = css(colorCurva(m.rol));
  ctx.beginPath();
  ctx.arc(x, y, RADIO_MARCA_PX, 0, 2 * Math.PI);
  ctx.fill();
}

/**
 * Un rótulo ya resuelto a coordenadas de PANTALLA: dónde va el nombre de una flecha o de una
 * marca, y de qué color. El texto no viaja aquí —es LaTeX y lo compone el host con KaTeX—, solo
 * el `rol`, que es el índice de la entrada en el bloque y con el que el host recupera las dos
 * cosas que le faltan: qué escribir y de quién es.
 */
export interface RotuloPlano {
  readonly rol: number;
  /** Centro del rótulo, en píxeles CSS del lienzo. */
  readonly x: number;
  readonly y: number;
  /** Color de la entrada, ya en CSS y ya con el tema vigente aplicado. */
  readonly color: string;
}

/**
 * Dónde va el nombre de cada cosa dibujada. Mismo orden que `dibujarVectores` —flechas primero,
 * marcas después—, y ese orden es parte del contrato: el host crea un elemento por rótulo la
 * primera vez y luego solo los recoloca, así que si el orden bailara, los nombres cambiarían de
 * dueño al redimensionar.
 *
 * El rótulo de una flecha va al MEDIO del trazo y apartado sobre él, no junto al extremo: en el
 * extremo se sale del lienzo en cuanto el vector apunta hacia un borde, que es la mitad de las
 * veces. El de una marca (y el de una flecha nula, que no tiene trazo del que apartarse) va en
 * diagonal sobre el disco.
 */
export function rotulosDeDibujo(vp: Viewport, dibujo: DibujoVector): readonly RotuloPlano[] {
  const rotulos: RotuloPlano[] = [];
  for (const f of dibujo.flechas) {
    const g = geometriaFlecha(vp, f);
    const [x, y] = g.largo < 0.5
      ? [g.x1 + ROTULO_PX, g.y1 - ROTULO_PX]
      : [(g.x0 + g.x1) / 2 + g.nx * ROTULO_PX, (g.y0 + g.y1) / 2 + g.ny * ROTULO_PX];
    rotulos.push({ rol: f.rol, x, y, color: css(colorCurva(f.rol)) });
  }
  for (const m of dibujo.marcas) {
    const [x, y] = aPantalla(vp, m.en);
    rotulos.push({ rol: m.rol, x: x + ROTULO_PX, y: y - ROTULO_PX, color: css(colorCurva(m.rol)) });
  }
  return rotulos;
}

/**
 * Pinta el plano entero: rejilla y ejes (`Overlay`, el mismo de todos los bloques) y encima las
 * flechas y las marcas. Las marcas van DESPUÉS de las flechas para que el extremo de una flecha
 * que llega a un punto no tape el disco de ese punto.
 *
 * Los NOMBRES no salen de aquí: son DOM sobre el lienzo y el host los coloca con
 * `rotulosDeDibujo`.
 */
export function dibujarVectores(
  ctx: CanvasRenderingContext2D, vp: Viewport, dibujo: DibujoVector
): void {
  new Overlay(ctx).dibujar(vp);
  ctx.save();
  ctx.lineJoin = "round";
  for (const f of dibujo.flechas) dibujarFlecha(ctx, vp, f);
  for (const m of dibujo.marcas) dibujarMarca(ctx, vp, m);
  ctx.restore();
}

/**
 * Semirrango vertical con el que la vista deja TODO el dibujo dentro, o `null` si la vista por
 * defecto ya lo consigue.
 *
 * El criterio es el mismo del autoencuadre de las curvas —solo se toca la escala, el centro se
 * queda en el origen y los ejes siguen en cuadro—, pero aquí puede ACERCAR y ALEJAR, no solo
 * acercar. Con curvas, alejar es peligroso: lo que toca un borde puede continuar fuera y no hay
 * forma de saberlo. Un conjunto de flechas, en cambio, es finito y se conoce entero, así que un
 * vector de componente 40 se puede encuadrar sin adivinar nada.
 *
 * `null` cuando no hay nada que encuadrar o cuando el dibujo cabe holgado en la vista de siempre:
 * dos vectores pequeños no deberían dejar el bloque con un zoom distinto del de la nota de al
 * lado solo porque midan 1,5 en vez de 2.
 */
export function encuadreDeDibujo(
  dibujo: DibujoVector, semiYDefecto: number, aspecto: number
): number | null {
  let maxX = 0, maxY = 0;
  const mirar = (p: readonly [number, number]) => {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    maxX = Math.max(maxX, Math.abs(p[0]));
    maxY = Math.max(maxY, Math.abs(p[1]));
  };
  for (const f of dibujo.flechas) { mirar(f.desde); mirar(f.hasta); }
  for (const m of dibujo.marcas) mirar(m.en);
  if (maxX === 0 && maxY === 0) return null;

  // Margen del 25 %: los rótulos viven fuera del trazo y un encuadre ajustado al vértice los
  // dejaría medio cortados contra el borde.
  const MARGEN = 1.25;
  // El semirrango vertical que hace falta para que quepan las dos extensiones. La horizontal se
  // convierte a vertical por el aspecto porque la cámara deriva domX de domY (celdas 1:1): pedir
  // "que quepa maxX" es pedir un semirrango vertical de maxX/aspecto.
  const necesario = Math.max(maxY, maxX / Math.max(aspecto, 1e-6)) * MARGEN;
  if (!Number.isFinite(necesario) || necesario <= 0) return null;
  // Ya cabe holgado en la vista de siempre y no llena menos de un tercio: no se toca nada.
  if (necesario <= semiYDefecto && necesario >= semiYDefecto / 3) return null;
  return necesario;
}
