// ─────────────────────────────────────────────
// rendering · Crosshair (DIBUJA; no decide de dónde sale la y)
// ─────────────────────────────────────────────
//
// Cruz informativa que sigue al cursor. Recibe la `y` sobre la curva ya resuelta y se limita a
// pintarla: no la busca, no la interpola y no evalúa nada.
//
// Antes sí la buscaba —interpolaba la `Rama` trazada—, y esa era la decisión arquitectónica
// original: «la interacción se alimenta de la geometría», que es lo que permite que el carril y
// el picking funcionen igual sobre implícitas y paramétricas sin conocer la fórmula. Sigue
// valiendo para todas esas curvas, pero tenía un coste que no se había medido: en una explícita,
// interpolar entre vértices hace que el valor mostrado CAMBIE con el zoom, porque cambia la
// densidad de vértices. Una polilínea es para visualizar; en cuanto la expresión se puede
// evaluar, deja de ser una fuente de verdad aceptable.
//
// La elección —evaluar o interpolar— vive ahora en `Escena.lecturaEnCurva`, que es quien tiene el
// contexto para tomarla. Aquí llegan el número y su procedencia, y la procedencia decide cuántas
// cifras se pueden escribir sin escribir ruido.

import type { Viewport } from "../contracts";
import type { ItemDibujo } from "./RendererCanvas2D";
import { aPantallaY, aMundoX } from "../scene/viewport-utils";
import { formatearLectura } from "../analysis/formatoNumero";
import { paletaPlano, colorCurva } from "./paleta";

// Icono del cursor: Material Symbols "point_scan" (24dp, viewBox 0 -960 960 960). Solo la
// cadena del path; el Path2D se construye PEREZOSAMENTE en el primer dibujo (Path2D no
// existe en Node y el bundle de tests importa el motor, pero nunca pinta el cursor).
const CURSOR_ICONO =
  "M430.5-430.59q-20.5-20.59-20.5-49.5t20.59-49.41q20.59-20.5 49.5-20.5t49.41 20.59q20.5 20.59 20.5 49.5t-20.59 49.41q-20.59 20.5-49.5 20.5t-49.41-20.59ZM450-640v-200h60v200h-60Zm0 520v-200h60v200h-60Zm190-330v-60h200v60H640Zm-520 0v-60h200v60H120Z";

export class Crosshair {
  private cursorPath?: Path2D;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  /**
   * Icono del cursor (Material Symbols "point_scan"), centrado exactamente en (px, py)
   * del ratón. Sustituye al cursor del sistema (oculto con cursor:none en el canvas).
   * Blanco (~20px), independiente del crosshair matemático: se muestra siempre que el
   * puntero esté sobre el plano.
   */
  dibujarCursorCruz(px: number, py: number): void {
    const ctx = this.ctx;
    // Path2D perezoso: solo se crea la primera vez que un canvas real pinta el cursor
    // (nunca en los tests de Node, que no llegan a dibujar). Ver `CURSOR_ICONO`.
    if (!this.cursorPath) this.cursorPath = new Path2D(CURSOR_ICONO);
    const S = 20;             // lado del icono en px
    const escala = S / 960;   // el viewBox es 960×960
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(escala, escala);
    ctx.translate(-480, 480); // lleva el centro del viewBox (480,-480) a (px, py)
    ctx.fillStyle = paletaPlano().cursor;
    ctx.fill(this.cursorPath);
    ctx.restore();
  }

  /**
   * Dibuja la cruz en cursorPx (px CSS). Sigue la curva SELECCIONADA (`item`, que el
   * host elige con los botones de color); el marcador toma el color de esa curva.
   * `anclado` añade el anillo naranja del modo carril.
   *
   * La `y` llega YA RESUELTA. No se calcula aquí a propósito: de dónde sale ese número —de
   * evaluar la función o de interpolar la polilínea— es una decisión matemática, y este módulo
   * es un renderer. La toma `Escena.yEnCurva`, que es el único sitio donde vive.
   */
  dibujar(
    vp: Viewport,
    cursorPx: number,
    item: ItemDibujo | undefined,
    anclado: boolean,
    y: number | null,
    /** ¿La `y` se EVALUÓ (explícita) o se interpoló de la polilínea? Decide cuántas cifras se
     *  pueden enseñar sin enseñar ruido. Lo resuelve `Escena.lecturaEnCurva`. */
    yEvaluada = false
  ): void {
    const ctx = this.ctx;
    const W = vp.anchoPx;
    const H = vp.altoPx;

    const worldX = aMundoX(vp, cursorPx);

    // Sin y sobre la curva en este x (curva implícita cuyas ramas no llevan `parametro`, o x
    // fuera del dominio), el crosshair no tiene nada a lo que referirse: no se dibuja ni la
    // línea vertical ni las etiquetas, queda solo la cruz del cursor (que pinta Escena aparte).
    // Antes salía la línea con "y = —", inútil.
    if (y === null || !Number.isFinite(y)) return;

    const py = aPantallaY(vp, y);
    const yVisible = py >= 0 && py <= H;

    ctx.save();

    // Líneas de PUNTOS redondos (estilo referencia): dash corto + lineCap round
    // produce puntos circulares espaciados, en vez de guiones largos.
    ctx.lineCap = "round";
    ctx.setLineDash([1.5, 5]);
    ctx.strokeStyle = paletaPlano().guiaCrosshair;
    ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(cursorPx, 0); ctx.lineTo(cursorPx, H); ctx.stroke();
    if (yVisible) {
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineCap = "butt";

    // Marcador en el punto sobre la curva.
    if (yVisible) {
      ctx.beginPath();
      ctx.arc(cursorPx, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = paletaPlano().halo;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cursorPx, py, 3, 0, Math.PI * 2);
      // Disco del color de la curva seleccionada (coincide con su botón); azul si falta.
      const e = item?.estilo;
      const c = e ? (e.rol !== undefined ? colorCurva(e.rol) : e.color) : colorCurva(0);
      ctx.fillStyle =
        `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, 1)`;
      ctx.fill();
      // Modo carril: anillo naranja para distinguir el punto anclado.
      if (anclado) {
        ctx.strokeStyle = paletaPlano().anilloCarril;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cursorPx, py, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Etiquetas x / y a un lado de la línea (cambia de lado cerca del borde).
    const aLaDerecha = cursorPx < W * 0.75;
    ctx.textAlign = aLaDerecha ? "left" : "right";
    ctx.textBaseline = "top";
    ctx.font = "11px monospace";
    const tx = cursorPx + (aLaDerecha ? 5 : -5);
    ctx.fillStyle = paletaPlano().textoCrosshair;
    // El readout NO usa el formato de las etiquetas de eje. Una marca de eje es un número
    // REDONDO que eligió `pasoBonito`, y ahí lo que se quiere es que quepa; esto es un valor
    // MEDIDO arbitrario, y lo que se quiere es que se pueda leer y comparar. Con el formato de
    // eje, `1.4905` y `1.4899` se imprimían los dos `1.49`, y por encima de 1000 se caía a
    // `1.2e+3` —dos cifras significativas para una posición—.
    //
    // La `x` es SIEMPRE evaluada: es la coordenada del píxel del cursor pasada por la
    // transformación del viewport, exacta por construcción. La `y` depende de la curva.
    ctx.fillText(`x = ${formatearLectura(worldX)}`, tx, 4);
    ctx.fillText(`y = ${formatearLectura(y, yEvaluada ? "evaluado" : "medido")}`, tx, 18);

    ctx.restore();
  }
}
