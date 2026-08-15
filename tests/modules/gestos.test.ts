// ─────────────────────────────────────────────
// tests · Gestos de puntero sobre el plano (Camara)
// ─────────────────────────────────────────────
//
// La cámara traduce gestos a vista: un dedo desplaza, dos pellizcan. Se prueba
// disparando a mano los manejadores que `Camara` registra en el lienzo, con un canvas de
// mentira que los guarda —el mismo truco que usa carril.test.ts para el teclado—. No hace
// falta DOM: los manejadores solo leen `pointerId`, `offsetX` y `offsetY`.
//
// Lo que se protege aquí, y por qué:
//
//   • Con UN puntero, la vista resultante debe ser la de siempre. El mapa de punteros se
//     introdujo para soportar dos dedos; si de paso cambiara el arrastre de toda la vida,
//     habríamos arreglado el móvil rompiendo el escritorio.
//   • El PUNTO DEL MUNDO BAJO EL ANCLA no se mueve. Es la invariante de todo zoom anclado
//     (rueda y pellizco comparten `escalarEn`), y es justo la que se rompe al despistarse
//     con un signo o con el eje Y invertido, sin que ninguna otra prueba lo note.
//   • Levantar un dedo no da SALTO. Era el fallo real de un solo `ultimo` compartido.
//   • `pointercancel` deja el estado limpio. El sistema puede quitarnos un dedo cuando
//     quiera; sin tratarlo, ese dedo se quedaba "apoyado" para siempre.

import { describe, test, aprox, assert } from "../runner";
import { Camara } from "../../src/core/interaction/Camara";

// Lienzo de mentira: guarda los manejadores para poder invocarlos.
function lienzoFalso() {
  const handlers: Record<string, (e: unknown) => void> = {};
  return {
    handlers,
    style: {} as Record<string, string>,
    setCssStyles(s: Record<string, string>) { Object.assign(this.style, s); },
    addEventListener(tipo: string, fn: (e: unknown) => void) { handlers[tipo] = fn; },
    removeEventListener() { /* la suite no desmonta */ },
    setPointerCapture() { /* sin captura real */ },
    hasPointerCapture() { return true; },
    releasePointerCapture() { /* sin captura real */ },
  };
}

const ANCHO = 300, ALTO = 130;

function camaraDePrueba() {
  const g = globalThis as Record<string, unknown>;
  if (!g.window) g.window = { devicePixelRatio: 1 };
  const lienzo = lienzoFalso();
  const camara = new Camara(lienzo as unknown as HTMLCanvasElement, ALTO,
    { onViewport: () => { /* sin repintado */ }, onCursor: () => { /* sin repintado */ } });
  camara.redimensionar(ANCHO, ALTO, 1);
  const evento = (tipo: string, id: number, x: number, y: number) =>
    lienzo.handlers[tipo]?.({ pointerId: id, offsetX: x, offsetY: y });
  return { camara, evento };
}

/** Punto del MUNDO que hay bajo un punto de pantalla, según la vista actual. */
function mundoEn(camara: Camara, px: number, py: number): { x: number; y: number } {
  const vp = camara.viewport();
  return {
    x: vp.domX[0] + (px / vp.anchoPx) * (vp.domX[1] - vp.domX[0]),
    y: vp.domY[1] - (py / vp.altoPx) * (vp.domY[1] - vp.domY[0]),
  };
}

const semiancho = (camara: Camara) => {
  const vp = camara.viewport();
  return (vp.domX[1] - vp.domX[0]) / 2;
};

describe("Gestos: un dedo desplaza, dos pellizcan", () => {
  test("un puntero: la vista se desplaza justo el mundo equivalente a los px recorridos", () => {
    const { camara, evento } = camaraDePrueba();
    const antes = camara.viewport();
    const unidadesPorPx = (antes.domX[1] - antes.domX[0]) / ANCHO;

    evento("pointerdown", 1, 100, 60);
    evento("pointermove", 1, 130, 40);   // +30px a la derecha, −20px hacia arriba

    const ahora = camara.viewport();
    // Arrastrar a la DERECHA trae mundo de la izquierda: el dominio se desplaza al negativo.
    aprox(ahora.domX[0], antes.domX[0] - 30 * unidadesPorPx, 1e-9, "domX tras arrastrar");
    // El eje Y de pantalla crece hacia abajo: subir el dedo (−20px) sube la vista.
    const unidadesPorPxY = (antes.domY[1] - antes.domY[0]) / ALTO;
    aprox(ahora.domY[0], antes.domY[0] + -20 * unidadesPorPxY, 1e-9, "domY tras arrastrar");
    // Un arrastre no escala: la vista abarca exactamente lo mismo.
    aprox(ahora.domX[1] - ahora.domX[0], antes.domX[1] - antes.domX[0], 1e-9, "sin zoom");
  });

  test("separar los dedos ACERCA, y en la razón exacta de sus separaciones", () => {
    const { camara, evento } = camaraDePrueba();
    const antes = semiancho(camara);

    // Dos dedos a 60px, separados hasta 120px SIN mover el punto medio (150, 65).
    evento("pointerdown", 1, 120, 65);
    evento("pointerdown", 2, 180, 65);
    evento("pointermove", 1, 120, 65);   // primer evento: solo toma referencia
    evento("pointermove", 2, 180, 65);
    evento("pointermove", 1, 90, 65);
    evento("pointermove", 2, 210, 65);

    // Separación ×2 ⇒ la vista abarca la MITAD de mundo (acercar).
    aprox(semiancho(camara), antes / 2, 1e-9, "semiancho tras separar los dedos");
  });

  test("juntar los dedos ALEJA: es el inverso exacto de separarlos", () => {
    const { camara, evento } = camaraDePrueba();
    const antes = semiancho(camara);

    evento("pointerdown", 1, 90, 65);
    evento("pointerdown", 2, 210, 65);
    evento("pointermove", 1, 90, 65);
    evento("pointermove", 2, 210, 65);
    evento("pointermove", 1, 120, 65);
    evento("pointermove", 2, 180, 65);

    aprox(semiancho(camara), antes * 2, 1e-9, "semiancho tras juntar los dedos");
  });

  test("el punto del mundo bajo el punto medio no se mueve al pellizcar", () => {
    const { camara, evento } = camaraDePrueba();
    // Punto medio DESCENTRADO a propósito: anclar mal (al centro de la vista, p.ej.) pasa
    // desapercibido si el ancla coincide con el centro.
    const cx = 200, cy = 40;
    const antes = mundoEn(camara, cx, cy);

    evento("pointerdown", 1, cx - 40, cy);
    evento("pointerdown", 2, cx + 40, cy);
    evento("pointermove", 1, cx - 40, cy);
    evento("pointermove", 2, cx + 40, cy);
    evento("pointermove", 1, cx - 70, cy);
    evento("pointermove", 2, cx + 70, cy);

    const despues = mundoEn(camara, cx, cy);
    aprox(despues.x, antes.x, 1e-9, "x del mundo bajo el ancla");
    aprox(despues.y, antes.y, 1e-9, "y del mundo bajo el ancla");
  });

  test("mover los dos dedos juntos desplaza como uno solo, sin escalar", () => {
    const { camara, evento } = camaraDePrueba();
    const antes = camara.viewport();
    const unidadesPorPx = (antes.domX[1] - antes.domX[0]) / ANCHO;

    evento("pointerdown", 1, 120, 65);
    evento("pointerdown", 2, 180, 65);
    evento("pointermove", 1, 120, 65);
    evento("pointermove", 2, 180, 65);
    evento("pointermove", 1, 145, 65);   // los dos +25px, sin cambiar su separación
    evento("pointermove", 2, 205, 65);

    const ahora = camara.viewport();
    aprox(ahora.domX[0], antes.domX[0] - 25 * unidadesPorPx, 1e-9, "desplazamiento del par");
    aprox(ahora.domX[1] - ahora.domX[0], antes.domX[1] - antes.domX[0], 1e-9, "sin zoom");
  });

  test("levantar un dedo no da salto: el que queda sigue desde donde estaba", () => {
    const { camara, evento } = camaraDePrueba();

    evento("pointerdown", 1, 100, 65);
    evento("pointerdown", 2, 200, 65);
    evento("pointermove", 1, 100, 65);
    evento("pointermove", 2, 200, 65);
    evento("pointerup", 2, 200, 65);      // se va el segundo dedo

    const antes = camara.viewport();
    const unidadesPorPx = (antes.domX[1] - antes.domX[0]) / ANCHO;
    evento("pointermove", 1, 110, 65);    // el que queda avanza 10px desde SU posición

    const ahora = camara.viewport();
    // Si el dedo que queda hubiera "heredado" la posición del que se fue (200), el delta
    // habría sido −90px en vez de +10: el salto que se busca evitar.
    aprox(ahora.domX[0], antes.domX[0] - 10 * unidadesPorPx, 1e-9, "sin salto al soltar");
  });

  test("pointercancel suelta el dedo: sus movimientos ya no mueven la vista", () => {
    const { camara, evento } = camaraDePrueba();

    evento("pointerdown", 1, 100, 65);
    evento("pointercancel", 1, 100, 65);  // el sistema nos quita el dedo
    const antes = camara.viewport();
    evento("pointermove", 1, 250, 20);    // movimiento fantasma del dedo cancelado

    const ahora = camara.viewport();
    aprox(ahora.domX[0], antes.domX[0], 1e-12, "la vista no se movió tras el cancel");
    aprox(ahora.domY[0], antes.domY[0], 1e-12, "la vista no se movió tras el cancel");
  });

  test("con los dedos casi juntos no se escala (la razón se dispararía)", () => {
    const { camara, evento } = camaraDePrueba();
    const antes = semiancho(camara);

    // Separación de 10px, por debajo del mínimo: el gesto solo desplaza.
    evento("pointerdown", 1, 145, 65);
    evento("pointerdown", 2, 155, 65);
    evento("pointermove", 1, 145, 65);
    evento("pointermove", 2, 155, 65);
    evento("pointermove", 1, 144, 65);
    evento("pointermove", 2, 156, 65);

    aprox(semiancho(camara), antes, 1e-9, "sin escala por debajo del mínimo");
  });

  test("el cursor no se registra durante un gesto (la cruz se oculta al tocar)", () => {
    const { camara, evento } = camaraDePrueba();
    evento("pointermove", 9, 50, 50);           // ratón sin botón: sí hay cursor
    assert(camara.cursorPx() === 50, "el cursor debería seguirse sin gesto");
    evento("pointerdown", 9, 50, 50);
    assert(camara.cursorPx() === null, "el cursor debe ocultarse al empezar el gesto");
  });
});
