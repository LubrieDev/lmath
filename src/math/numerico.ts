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
  | {
      readonly tipo: "puntos";
      readonly puntos: readonly SolucionNumerica[];
      /** Sobre qué variable se hizo el barrido. El panel lo dice: el intervalo declarado acota
       *  ESA, y prometer la otra sería una afirmación que no se ha comprobado. */
      readonly variable: "x" | "y";
    }
  /** Ninguna de las dos ecuaciones se deja despejar: este camino tampoco puede. */
  | { readonly tipo: "noResoluble" };

/** Qué modos de barrido se autorizan. Ver `resolverNumerico`. */
export interface OpcionesNumerico {
  /**
   * ¿Se admiten los sistemas TUMBADOS (`x = g(y)`) y los MIXTOS? Por defecto NO, y el motivo es
   * el orden de los escalones del solucionador: este camino va ANTES que el de ramas, y las
   * ramas resuelven de forma exacta varios de los sistemas que estos dos modos resolverían
   * aproximados. Se activan detrás de aquel, no delante.
   */
  readonly simetrico?: boolean;
}

/** Una ecuación con una variable AISLADA: `y = f(x)` o `x = g(y)`. */
interface FormaExplicita {
  /** La variable que quedó sola a un lado. */
  readonly aislada: "x" | "y";
  /** La función de la OTRA variable. */
  readonly f: (t: number) => number;
}

/**
 * La ecuación como una variable aislada igual a una función de la otra, o `null`.
 *
 * Acepta las CUATRO escrituras (`y = f(x)`, `f(x) = y`, `x = g(y)`, `g(y) = x`), y esa simetría
 * no es un adorno: sin ella, `x = g(y)` —una curva perfectamente explícita, solo que tumbada—
 * quedaba fuera del camino numérico entero, y el sistema se declaraba irresoluble por la
 * ORIENTACIÓN de lo escrito. Es la misma clase de fuga que el escalón de ramas vino a cerrar.
 */
function formaExplicita(ecuacion: string): FormaExplicita | null {
  const partes = ecuacion.split("=");
  let aislada: "x" | "y";
  let otra: string;
  if (partes.length === 1) {
    // Expresión suelta: en obs-graph significa `y = expr`.
    aislada = "y";
    otra = partes[0];
  } else if (partes.length === 2) {
    const izq = partes[0].trim(), der = partes[1].trim();
    if (izq === "y") { aislada = "y"; otra = der; }
    else if (der === "y") { aislada = "y"; otra = izq; }
    else if (izq === "x") { aislada = "x"; otra = der; }
    else if (der === "x") { aislada = "x"; otra = izq; }
    else return null;
  } else return null;

  const variableLibre = aislada === "y" ? "x" : "y";
  try {
    const f = compilarFuncion(insertarProductoImplicito(normalizarEntrada(otra)), variableLibre);
    // `compilarFuncion` devuelve `unknown` porque el camino de mathjs puede dar un Complex; aquí
    // solo interesa la recta real, y lo que no sea un número finito se trata como hueco del
    // dominio (que es como lo trata el resto del motor).
    return {
      aislada,
      f: (t: number) => {
        const v = f(t);
        return typeof v === "number" ? v : NaN;
      },
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
 * Las raíces de `h` en el intervalo declarado, con el mismo barrido fino de siempre.
 *
 * Se extrajo del cuerpo de `resolverNumerico` cuando este dejó de barrer solo en x: los tres
 * modos (barrer x, barrer y, y el mixto) resuelven UNA ecuación de una variable y solo se
 * diferencian en cuál es esa variable y en cómo se reconstruye el punto. Compartir el barrido
 * hace que las tres tengan exactamente las mismas garantías.
 */
function raicesDe(h: (t: number) => number): number[] {
  const [t0, t1] = DOMINIO_X;
  const paso = (t1 - t0) / MUESTRAS;

  const crudas: number[] = [];
  let tPrev = t0;
  let hPrev = h(tPrev);
  for (let i = 1; i <= MUESTRAS; i++) {
    const t = t0 + i * paso;
    const ht = h(t);
    if (Number.isFinite(hPrev) && Number.isFinite(ht)) {
      if (ht === 0) crudas.push(t);
      else if (hPrev * ht < 0) {
        const r = bisecar(h, tPrev, t);
        if (r !== null) crudas.push(r);
      }
    }
    tPrev = t; hPrev = ht;
  }

  const out: number[] = [];
  for (const cruda of crudas) {
    const t = pulir(h, cruda);
    if (!Number.isFinite(t)) continue;
    // Deduplicado: dos cruces separados por menos que el paso son el mismo punto encontrado dos
    // veces (una tangencia que roza el eje y vuelve).
    if (out.some((p) => Math.abs(p - t) <= 10 * paso)) continue;
    out.push(t);
  }
  return out;
}

/**
 * Resuelve numéricamente el sistema, sobre el intervalo declarado.
 *
 * Exige que las dos ecuaciones tengan una variable DESPEJADA, y admite las tres combinaciones,
 * porque las tres se reducen a una ecuación de una variable:
 *
 *   • `y = f(x)` con `y = g(x)`   →  `f(x) − g(x) = 0`, se barre x.
 *   • `x = f(y)` con `x = g(y)`   →  lo mismo tumbado, se barre y.
 *   • `y = f(x)` con `x = g(y)`   →  `f(g(y)) − y = 0` por COMPOSICIÓN, se barre y.
 *
 * El tercero es el que faltaba y el que más se notaba: una recta vertical (`x = 0`) contra
 * cualquier curva explícita se declaraba irresoluble, porque el barrido solo sabía moverse en x
 * y una vertical no es una función de x. No era una frontera matemática, era la del bucle.
 *
 * Con las dos implícitas de verdad (ninguna despejada) sigue diciendo `noResoluble`: ahí haría
 * falta un barrido en dos dimensiones, y ese sí volvería a depender de una ventana —es
 * exactamente la puerta por la que entró el problema que este módulo cerró—.
 */
export function resolverNumerico(
  ecuacionA: string, ecuacionB: string, opciones: OpcionesNumerico = {}
): ResultadoNumerico {
  const a = formaExplicita(ecuacionA);
  const b = formaExplicita(ecuacionB);
  if (!a || !b) return { tipo: "noResoluble" };
  // Los modos TUMBADO y MIXTO solo se abren cuando quien llama los pide. No es timidez: son
  // capaces de resolver sistemas que el escalón de RAMAS resuelve de forma EXACTA (`|y| = x`
  // tiene la x despejada, y aquí se barrería), y adelantarse a él cambiaría una respuesta
  // exacta por una aproximada. Quien los pide es quien ya sabe que las ramas no han podido.
  if (!opciones.simetrico && (a.aislada !== "y" || b.aislada !== "y"))
    return { tipo: "noResoluble" };

  // Las dos despejan la MISMA variable: se barre la otra y el punto se reconstruye evaluando.
  if (a.aislada === b.aislada) {
    const h = (t: number): number => a.f(t) - b.f(t);
    const variable = a.aislada === "y" ? "x" : "y";
    const puntos: SolucionNumerica[] = [];
    for (const t of raicesDe(h)) {
      const otro = a.f(t);
      if (!Number.isFinite(otro)) continue;
      puntos.push(a.aislada === "y" ? { x: t, y: otro } : { x: otro, y: t });
    }
    puntos.sort((p, q) => p.x - q.x || p.y - q.y);
    return { tipo: "puntos", puntos, variable };
  }

  // MIXTO: una da `y = f(x)` y la otra `x = g(y)`. Sustituyendo la segunda en la primera queda
  // `y = f(g(y))`, una ecuación en y sola. Se barre y, y la abscisa sale de `g`.
  const explY = a.aislada === "y" ? a : b;      // y = f(x)
  const explX = a.aislada === "x" ? a : b;      // x = g(y)
  const h = (y: number): number => explY.f(explX.f(y)) - y;
  const puntos: SolucionNumerica[] = [];
  for (const y of raicesDe(h)) {
    const x = explX.f(y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    puntos.push({ x, y });
  }
  puntos.sort((p, q) => p.x - q.x || p.y - q.y);
  return { tipo: "puntos", puntos, variable: "y" };
}
