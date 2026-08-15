// ─────────────────────────────────────────────
// mate · Camino NUMÉRICO: sistemas que no son polinómicos (PURO)
// ─────────────────────────────────────────────
//
// Lo que resuelve `y = sin x` contra `y = x/2`: sistemas para los que no existe eliminación
// algebraica y por tanto tampoco una respuesta exacta. Aquí no se promete lo que allí: se
// promete **una cosa concreta y comprobable**, que es la que faltaba.
//
// ── La propiedad que se conserva ──────────────────────────────────────────────────────────
// El resultado **no depende de la vista**. Ni los valores ni cuáles aparecen. El intervalo que se
// explora es una constante de este módulo, la misma con cualquier zoom y con cualquier paneo, así
// que mover el plano no cambia la respuesta ni un dígito. Ese era el defecto que se venía a
// corregir, y aquí se corrige igual que en el camino exacto, aunque por otros medios.
//
// ── Lo que NO se promete, y por qué ───────────────────────────────────────────────────────
// **Completitud sobre todo ℝ.** No se promete porque no se puede: no existe algoritmo que
// enumere las soluciones de un sistema transcendental arbitrario sobre la recta entera, y un
// sistema periódico tiene infinitas. Así que se explora un intervalo declarado y se DICE cuál es
// —el panel escribe el intervalo, no un «en la vista actual» que cambiaba solo—. Un usuario puede
// comprobar esa afirmación; la anterior no significaba nada estable.
//
// Y dentro de ese intervalo se hace todo lo posible por no perder nada: el barrido es fino, cada
// cambio de signo se biseca, y cada raíz se pule con Newton. Lo que puede escapársele es una raíz
// doble (toca el eje sin cruzarlo) o dos más juntas que el paso: son las dos cosas que el camino
// exacto sí garantiza y este no, y por eso el exacto va siempre primero.

import { compilarFuncion } from "../evaluador";
import { normalizarEntrada } from "../parser";
import { insertarProductoImplicito } from "../core/parsing/productoImplicito";

/**
 * Intervalo que se explora, en x. **Es una constante, no la vista**: ahí está toda la gracia.
 *
 * ±100 y no ±10 (el rango del análisis de una f(x) suelta) porque un sistema puede cruzarse lejos
 * y perderlo en silencio sería el mismo tipo de fallo que se está corrigiendo. Y no ±10000
 * porque el barrido tiene que seguir siendo fino: con un paso grande se pierden cruces cercanos,
 * y perder una solución cerca del origen —donde está casi siempre lo que se mira— es mucho peor
 * que no ver una en x=5000.
 */
export const DOMINIO_X: readonly [number, number] = [-100, 100];

/** Muestras del barrido. 40000 sobre 200 unidades = un paso de 0.005: por debajo de la
 *  resolución de cualquier pantalla, y unos pocos milisegundos de una función compilada. */
const MUESTRAS = 40000;

/** Una solución numérica. Nunca trae forma exacta: si la tuviera, la habría resuelto el otro
 *  camino. */
export interface SolucionNumerica {
  readonly x: number;
  readonly y: number;
}

export type ResultadoNumerico =
  | { readonly tipo: "puntos"; readonly puntos: readonly SolucionNumerica[] }
  /** Ninguna de las dos ecuaciones se deja evaluar como y = f(x): este camino tampoco puede. */
  | { readonly tipo: "noResoluble" };

/** `f(x)` compilada a partir del lado derecho de `y = …`, o `null` si la ecuación no tiene esa
 *  forma. Es el único formato que este camino sabe manejar: sin una y despejada no hay una
 *  función de una variable que restar. */
function funcionExplicita(ecuacion: string): ((x: number) => number) | null {
  const partes = ecuacion.split("=");
  let derecha: string;
  if (partes.length === 1) derecha = partes[0];
  else if (partes.length === 2) {
    const izq = partes[0].trim();
    const der = partes[1].trim();
    if (izq === "y") derecha = der;
    else if (der === "y") derecha = izq;
    else return null;
  } else return null;
  try {
    const f = compilarFuncion(insertarProductoImplicito(normalizarEntrada(derecha)), "x");
    // `compilarFuncion` devuelve `unknown` porque el camino de mathjs puede dar un Complex; aquí
    // solo interesa la recta real, y lo que no sea un número finito se trata como hueco del
    // dominio (que es como lo trata el resto del motor).
    return (x: number) => {
      const v = f(x);
      return typeof v === "number" ? v : NaN;
    };
  } catch {
    return null;
  }
}

/**
 * Afina una raíz de `h` dentro de [a, b] (donde cambia de signo) por bisección.
 *
 * Bisección y no Newton, por lo mismo que en el camino exacto: el intervalo ya encierra la raíz y
 * bisecar no puede salirse. Newton se usa DESPUÉS, para las últimas cifras, donde ya es seguro.
 */
function bisecar(h: (x: number) => number, a: number, b: number): number | null {
  let lo = a, hi = b;
  let flo = h(lo);
  if (!Number.isFinite(flo)) return null;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    const fm = h(m);
    if (!Number.isFinite(fm)) return null;
    if (fm === 0) return m;
    if (flo * fm < 0) { hi = m; } else { lo = m; flo = fm; }
    if (hi === lo || (hi - lo) <= Math.abs(m) * Number.EPSILON) break;
  }
  const m = (lo + hi) / 2;
  const fm = h(m);
  // Distinción raíz / POLO, con el mismo criterio que el análisis de una f(x): en una asíntota
  // vertical el signo también cambia, pero el valor no colapsa a cero. Sin esta comprobación,
  // `y = tan x` contra `y = 0` listaría cada asíntota como si fuera una solución.
  if (!Number.isFinite(fm)) return null;
  const escala = Math.max(1, Math.abs(h(m + 1e-6)), Math.abs(h(m - 1e-6)));
  return Math.abs(fm) < 1e-6 * escala || Math.abs(fm) < 1e-9 ? m : null;
}

/** Pule con Newton usando derivada por diferencias centradas: gana las últimas cifras que la
 *  bisección deja, sin necesitar la derivada simbólica de una expresión cualquiera. */
function pulir(h: (x: number) => number, x0: number): number {
  let x = x0;
  for (let i = 0; i < 6; i++) {
    const paso = Math.max(1e-10, Math.abs(x) * 1e-10);
    const d = (h(x + paso) - h(x - paso)) / (2 * paso);
    if (!Number.isFinite(d) || d === 0) break;
    const nx = x - h(x) / d;
    if (!Number.isFinite(nx) || Math.abs(nx - x) > Math.max(1, Math.abs(x))) break;
    if (nx === x) break;
    x = nx;
  }
  return Math.abs(h(x)) <= Math.abs(h(x0)) ? x : x0;
}

/**
 * Resuelve numéricamente el sistema, sobre el intervalo declarado.
 *
 * Exige que las DOS ecuaciones sean explícitas (`y = f(x)`): entonces el sistema es
 * `f(x) − g(x) = 0`, una ecuación de una variable, que es lo que se sabe hacer bien. Con una
 * implícita no explícita de por medio hace falta un barrido en dos dimensiones, y ese barrido sí
 * volvería a depender de una ventana —es exactamente la puerta por la que entró el problema que
 * se está cerrando—, así que se prefiere decir `noResoluble` y que el panel lo diga.
 */
export function resolverNumerico(ecuacionA: string, ecuacionB: string): ResultadoNumerico {
  const f = funcionExplicita(ecuacionA);
  const g = funcionExplicita(ecuacionB);
  if (!f || !g) return { tipo: "noResoluble" };

  const h = (x: number): number => f(x) - g(x);
  const [x0, x1] = DOMINIO_X;
  const paso = (x1 - x0) / MUESTRAS;

  const crudas: number[] = [];
  let xPrev = x0;
  let hPrev = h(xPrev);
  for (let i = 1; i <= MUESTRAS; i++) {
    const x = x0 + i * paso;
    const hx = h(x);
    if (Number.isFinite(hPrev) && Number.isFinite(hx)) {
      if (hx === 0) crudas.push(x);
      else if (hPrev * hx < 0) {
        const r = bisecar(h, xPrev, x);
        if (r !== null) crudas.push(r);
      }
    }
    xPrev = x; hPrev = hx;
  }

  const puntos: SolucionNumerica[] = [];
  for (const cruda of crudas) {
    const x = pulir(h, cruda);
    const y = f(x);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    // Deduplicado: dos cruces separados por menos que el paso son el mismo punto encontrado dos
    // veces (una tangencia que roza el eje y vuelve).
    if (puntos.some((p) => Math.abs(p.x - x) <= 10 * paso)) continue;
    puntos.push({ x, y });
  }

  puntos.sort((a, b) => a.x - b.x);
  return { tipo: "puntos", puntos };
}
