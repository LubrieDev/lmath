// ─────────────────────────────────────────────
// vector · Lo que se DEDUCE de un bloque obs-vector (PURO)
// ─────────────────────────────────────────────
//
// La regla del bloque es que escribe lo que escribiste y no resuelve nada: `w = u+v` se
// tipografía, no se calcula. Este módulo es la otra mitad de esa regla —lo que se DEDUCE de lo
// ya escrito—, que es exactamente lo que cabe en el panel ⓘ y no en la tarjeta: el módulo de un
// vector, su dirección, el ángulo entre dos, la distancia entre dos puntos.
//
// La frontera importa y es fina: aquí NO nace ningún vector nuevo. Un panel que dijera `u+v`
// estaría escribiendo en la nota algo que el autor no escribió, y esa es justo la línea que el
// bloque no cruza. Todo lo de aquí es una PROPIEDAD de lo que ya hay dibujado.
//
// ── La regla de exactitud ─────────────────────────────────────────────────────────────────
// Un valor sale en forma exacta (`√13`, `2√3`, `3/2`, `π/4`) solo cuando de verdad lo es, y eso
// aquí significa: cuando las componentes de las que sale son ENTERAS. Con `(3,2)` el módulo es
// √13, y decirlo así no es una floritura: ese ES el número, y 3.6055512 es una aproximación
// suya. Con `(0.5, 1.3)` no hay forma cerrada que ofrecer y se da el decimal. Es la misma
// disciplina de obs-trig —exacto solo si se ganó—, aplicada a la única procedencia que este
// bloque puede comprobar.
//
// Los ÁNGULOS son la excepción, y salen de aquí en radianes crudos a propósito: quien los
// escribe es `textoAngulo`, la misma función con la que obs-trig rotula los suyos, porque sigue
// la unidad que el usuario eligió en los ajustes y ya sabe cuándo un ángulo tiene forma exacta.
// Una tabla de notables propia en este módulo daría dos verdades para el mismo número —el error
// que el círculo ya cometió una vez, con `114.6°` en un sitio y `114.59°` a un centímetro—.
//
// Nada de esto se traduce ni se formatea para pantalla: aquí salen números y, cuando la hay, la
// forma exacta en texto plano. Los rótulos y el idioma son del host.

import { posicionDe, type PosicionAngular } from "../trig/modeloTrig";
import type { DibujoVector, Flecha, Marca } from "./bloqueVector";

const DOS_PI = 2 * Math.PI;

/**
 * Tolerancia RELATIVA con la que se decide que un producto es cero (perpendicularidad,
 * paralelismo). Relativa y no absoluta porque el producto escalar de dos vectores de módulo
 * 1000 acumula error a otra escala que el de dos de módulo 1: un umbral fijo llamaría
 * perpendiculares a dos vectores grandes que no lo son.
 */
const EPS_REL = 1e-12;

/** Un número y, si de verdad la tiene, su forma exacta en TEXTO PLANO (`√13`, `2√3`, `3/2`). */
export interface Medida {
  readonly valor: number;
  readonly exacto: string | null;
}

const entero = (v: number): boolean => Number.isFinite(v) && Number.isInteger(v);

const mcd = (a: number, b: number): number => (b === 0 ? (a || 1) : mcd(b, a % b));

/**
 * `√n` con el mayor cuadrado sacado del radicando: 12 → `2√3`, 16 → `4`, 13 → `√13`, 0 → `0`.
 *
 * Sacar el factor no es cosmética: `√12` y `2√3` son el mismo número, pero solo el segundo dice
 * de un vistazo que vale algo más de 3. Es la misma simplificación que ya hace el despeje al
 * escribir sus condiciones (`condiciones.ts`), aquí sobre un entero suelto.
 */
export function raizTexto(n: number): string | null {
  if (!entero(n) || n < 0) return null;
  if (n === 0) return "0";
  let fuera = 1, dentro = n;
  for (let k = 2; k * k <= dentro; k++) {
    while (dentro % (k * k) === 0) { dentro /= k * k; fuera *= k; }
  }
  if (dentro === 1) return String(fuera);
  return fuera === 1 ? `√${dentro}` : `${fuera}√${dentro}`;
}

/** `num/den` reducido, o el entero cuando la división es exacta (`4/2` → `2`). */
export function racionalTexto(num: number, den: number): string | null {
  if (!entero(num) || !entero(den) || den === 0) return null;
  const g = mcd(Math.abs(num), Math.abs(den));
  const n = num / g, d = den / g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

/** Lo que se puede decir de UN vector dibujado. */
export interface AnalisisFlecha {
  /** Índice de su línea en el bloque: con él el host recupera el nombre y el color. */
  readonly rol: number;
  /** El vector en sí. Para una flecha entre dos puntos, `B − A`. */
  readonly componentes: readonly [number, number];
  readonly modulo: Medida;
  /** Dirección desde el semieje X positivo, en radianes [0, 2π). `null` en el vector nulo. */
  readonly direccion: number | null;
  /** Cuadrante o semieje, con el mismo vocabulario que el círculo. `null` en el vector nulo. */
  readonly posicion: PosicionAngular | null;
  /** El unitario, o `null` en el vector nulo: no hay dirección que normalizar. */
  readonly unitario: readonly [number, number] | null;
}

/** El vector que representa una flecha: para `AB`, la diferencia; para `v`, el par mismo. */
function componentesDe(f: Flecha): readonly [number, number] {
  return [f.hasta[0] - f.desde[0], f.hasta[1] - f.desde[1]];
}

function analizarFlecha(f: Flecha): AnalisisFlecha {
  const [x, y] = componentesDe(f);
  const valor = Math.hypot(x, y);
  const modulo: Medida = {
    valor,
    exacto: entero(x) && entero(y) ? raizTexto(x * x + y * y) : null,
  };
  // El vector NULO no tiene dirección, y eso no es un caso que esconder: es lo que lo hace
  // distinto de todos los demás. Se dice su módulo (0) y se calla el resto, en vez de inventar
  // un ángulo de 0° que sugeriría que apunta al este.
  if (!(valor > 0) || !Number.isFinite(valor)) {
    return {
      rol: f.rol, componentes: [x, y], modulo,
      direccion: null, posicion: null, unitario: null,
    };
  }
  const direccion = (Math.atan2(y, x) + DOS_PI) % DOS_PI;
  return {
    rol: f.rol,
    componentes: [x, y],
    modulo,
    direccion,
    posicion: posicionDe(direccion),
    unitario: [x / valor, y / valor],
  };
}

/** Lo que se puede decir de DOS vectores a la vez. */
export interface AnalisisPar {
  readonly rolA: number;
  readonly rolB: number;
  readonly escalar: Medida;
  readonly determinante: Medida;
  /** Ángulo entre ellos, en radianes [0, π]. `null` si alguno es el vector nulo. */
  readonly angulo: number | null;
  /** Área del paralelogramo que forman (|det|) y la del triángulo (la mitad). */
  readonly areaParalelogramo: Medida;
  readonly areaTriangulo: Medida;
  /**
   * La relación que salta a la vista, si la hay. `null` cuando no son ni una cosa ni la otra —y
   * también cuando alguno es el vector nulo, que es ortogonal y paralelo a todo a la vez: decir
   * cualquiera de las dos cosas ahí sería cierto y engañoso.
   */
  readonly relacion: "perpendicular" | "paralelo" | null;
}

function analizarPar(a: AnalisisFlecha, b: AnalisisFlecha): AnalisisPar {
  const [ax, ay] = a.componentes;
  const [bx, by] = b.componentes;
  const exacto = entero(ax) && entero(ay) && entero(bx) && entero(by);

  const escalarV = ax * bx + ay * by;
  const detV = ax * by - ay * bx;
  const producto = a.modulo.valor * b.modulo.valor;

  // El ángulo sale de `atan2(|det|, escalar)` y NO de `acos(escalar/(|u|·|v|))`, que es la
  // fórmula del libro. Cerca de 0 y de π la derivada del arcocoseno es infinita, así que el
  // error de redondeo del cociente se amplifica sin remedio: `u=(1,2)` y `v=(2,4)`, que son
  // paralelos de manual, daban un coseno de 0.9999999999999998 y con él un ángulo de 2·10⁻⁸ rad
  // —lo bastante lejos de 0 para que la tabla de notables ya no lo reconociera, y el panel
  // acababa dando un decimal para un ángulo nulo—. Con `atan2` el caso paralelo es
  // `atan2(0, +)` = 0 exacto y el perpendicular `atan2(+, 0)` = π/2 exacto, y los dos vuelven a
  // caer en la rejilla de 15°. Como `|det| ≥ 0`, el resultado ya está en [0, π].
  const angulo = producto > 0 ? Math.atan2(Math.abs(detV), escalarV) : null;

  return {
    rolA: a.rol,
    rolB: b.rol,
    escalar: { valor: escalarV, exacto: exacto ? String(escalarV) : null },
    determinante: { valor: detV, exacto: exacto ? String(detV) : null },
    angulo,
    areaParalelogramo: {
      valor: Math.abs(detV),
      exacto: exacto ? String(Math.abs(detV)) : null,
    },
    areaTriangulo: {
      valor: Math.abs(detV) / 2,
      exacto: exacto ? racionalTexto(Math.abs(detV), 2) : null,
    },
    relacion:
      producto === 0 ? null
        : Math.abs(escalarV) <= EPS_REL * producto ? "perpendicular"
        : Math.abs(detV) <= EPS_REL * producto ? "paralelo"
        : null,
  };
}

/** Lo que se puede decir de DOS puntos declarados. */
export interface AnalisisPuntos {
  readonly rolA: number;
  readonly rolB: number;
  readonly distancia: Medida;
  readonly medio: readonly [number, number];
  /** El punto medio en forma exacta (`3/2`), cuando los dos puntos son de coordenadas enteras. */
  readonly medioExacto: readonly [string, string] | null;
}

function analizarPuntos(a: Marca, b: Marca): AnalisisPuntos {
  const [ax, ay] = a.en;
  const [bx, by] = b.en;
  const dx = bx - ax, dy = by - ay;
  const exacto = entero(ax) && entero(ay) && entero(bx) && entero(by);
  const mx = racionalTexto(ax + bx, 2), my = racionalTexto(ay + by, 2);
  return {
    rolA: a.rol,
    rolB: b.rol,
    distancia: {
      valor: Math.hypot(dx, dy),
      exacto: exacto ? raizTexto(dx * dx + dy * dy) : null,
    },
    medio: [(ax + bx) / 2, (ay + by) / 2],
    medioExacto: exacto && mx !== null && my !== null ? [mx, my] : null,
  };
}

/** Todo lo que el panel ⓘ puede decir de un bloque. */
export interface AnalisisVector {
  readonly vectores: readonly AnalisisFlecha[];
  /** Solo con EXACTAMENTE dos vectores; ver `analizarDibujo`. */
  readonly par: AnalisisPar | null;
  /** Solo con EXACTAMENTE dos puntos. */
  readonly puntos: AnalisisPuntos | null;
}

/**
 * El análisis de lo que hay dibujado, o `null` si no hay nada (y entonces tampoco hay panel:
 * un bloque que solo escribe notación no tiene nada que deducir).
 *
 * Las secciones de PAREJA existen solo con exactamente dos vectores, y la de puntos solo con
 * exactamente dos puntos. No es una limitación técnica —los pares se calculan igual de bien—,
 * es que con cinco vectores hay diez parejas y el panel se convierte en una matriz que nadie
 * lee. Con dos, la pregunta "¿qué relación hay entre estos dos?" tiene UNA respuesta y merece
 * su sitio; con más, el bloque no puede saber cuáles dos te interesan y no se inventa una.
 */
export function analizarDibujo(dibujo: DibujoVector): AnalisisVector | null {
  if (dibujo.flechas.length === 0 && dibujo.marcas.length === 0) return null;
  const vectores = dibujo.flechas.map(analizarFlecha);
  const [v0, v1] = vectores;
  const [m0, m1] = dibujo.marcas;
  return {
    vectores,
    par: vectores.length === 2 && v0 && v1 ? analizarPar(v0, v1) : null,
    puntos: dibujo.marcas.length === 2 && m0 && m1 ? analizarPuntos(m0, m1) : null,
  };
}
