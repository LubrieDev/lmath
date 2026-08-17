// ─────────────────────────────────────────────
// mate · Resolver un sistema de dos ecuaciones (PURO)
// ─────────────────────────────────────────────
//
// Dadas dos ecuaciones escritas, dónde se cortan sus curvas. **Sin mirar el plano**: la respuesta
// depende solo de las ecuaciones, así que es la misma con cualquier zoom y con cualquier paneo.
//
// Ese «sin mirar el plano» es todo el motivo de este módulo. Hasta ahora las soluciones salían de
// cruzar las polilíneas YA TRAZADAS (`motor/analysis/interseccionesRamas.ts`), recortadas además
// a la vista, y eso tenía dos consecuencias que no son matices:
//
//   • el VALOR dependía del trazado —la solución (0,0) de `y=x` ∩ `y=x²` se leía (8.4e-6, 8.4e-6)
//     después de mover el plano, porque el vértice de la polilínea caía donde caía—;
//   • y CUÁLES aparecían dependía de la ventana: una solución fuera de la vista no existía.
//
// Aquí no hay ni una cosa ni la otra. La solución de ese sistema es x=0 y x=A, exactas, para
// siempre.
//
// ── El procedimiento, en cuatro pasos ─────────────────────────────────────────────────────
//  1. **Leer** las dos ecuaciones como polinomios exactos (`extraer.ts`). Si alguna no lo es, este
//     camino se declara incompetente y devuelve `noResoluble`: no aproxima a escondidas.
//  2. **Eliminar** una variable —sustituyendo si una curva es explícita, con la resultante si no—
//     hasta dejar una sola ecuación en x.
//  3. **Resolver** esa ecuación con Sturm, que encuentra todas sus raíces reales y ninguna de
//     más.
//  4. **Verificar** cada candidato. Este paso NO es una precaución rutinaria: la eliminación
//     produce de verdad candidatos falsos —la resultante trabaja sobre los complejos, y limpiar
//     denominadores inventa soluciones donde la curva no existe—, y sin este filtro el panel
//     enseñaría puntos donde no se cruza nada.
//
// ── Los cuatro escalones de `resolverBloque` ──────────────────────────────────────────────
// Ese procedimiento es el PRIMER escalón. Cuando se declara incompetente hay tres más, y el
// orden entre ellos es parte del contrato:
//
//   1. **Exacto directo** (este archivo). Completo sobre ℝ, y con la forma cerrada de cada
//      coordenada cuando existe (`simbolico/`): `(7−√13)/2`, no `1.6972243622680054`.
//   2. **Numérico directo** (`numerico.ts`, `y = f(x)` contra `y = g(x)`). Completo solo dentro
//      del intervalo declarado.
//   3. **Por RAMAS** (`ramas.ts` + `resolverPorRamas`, abajo). Se despeja cada ecuación, se
//      expande su ±, se separan sus guardas, y cada pareja de ramas vuelve a intentar 1 y 2.
//   4. **Numérico SIMÉTRICO** (`numerico.ts` con `simetrico`). Admite las curvas tumbadas
//      (`x = g(y)`) y las mixtas, componiendo.
//
// El orden no es una preferencia, y cada frontera está medida:
//
//   • 3 va detrás de 1 porque `x²+y²=25` se despeja a `y = ±√(25−x²)`, que NO es polinómico:
//     con las ramas delante, un sistema que hoy se resuelve exacto caería al numérico.
//   • 4 va detrás de 3 por lo mismo, un escalón más abajo: `|y| = x` tiene la x despejada, así
//     que el barrido simétrico sabría resolverlo… en decimales, mientras que las ramas lo
//     resuelven exacto. Se comprobó rompiéndolo: al ampliar el escalón 2 con esos modos, dos
//     sistemas exactos pasaron a ser aproximados.
//
// Cada escalón solo puede AÑADIR respuestas donde el anterior no tenía ninguna.

import { parse } from "mathjs";

import {
  type Racional, aNumero, esCero, rac,
} from "./racional";
import {
  type Polinomio, esNulo, evaluarNum as evaluarNumPol, grado, mcdPol, raicesReales, normalizar,
} from "./polinomio";
import {
  type Polinomio2, compartenComponente, esNulo2, evaluarNum2, gradoY, normalizar2, resultanteY,
  sustituirX, sustituirY,
} from "./polinomio2";
import { ecuacionAPolinomio } from "./extraer";
import { resolverNumerico } from "./numerico";
import { ramasDe, type RamaEcuacion } from "./ramas";
import {
  type ValorExacto, aNumeroE, exacto as exactoDe, racionalDe,
} from "./simbolico/valorExacto";
import { raicesConForma } from "./simbolico/raicesSimbolicas";
import { evaluarExacto } from "./simbolico/polinomioExacto";
import {
  dentro, separarRestriccion, type RestriccionDominio,
} from "../core/parsing/restriccionDominio";
import { evaluadorDe } from "../despeje/verificacion";
import { normalizarEntrada } from "../parser";
import { insertarProductoImplicito } from "../core/parsing/productoImplicito";
import { tieneDobleSigno, expandirDobleSigno } from "../core/parsing/dobleSigno";
import type { Nodo } from "../formatoExpr";

/** Una solución del sistema: el punto, y su forma exacta cuando la tiene. */
export interface Solucion {
  readonly x: number;
  readonly y: number;
  /**
   * El valor exacto de cada coordenada, o `null` cuando el motor no sabe escribirlo.
   *
   * Es un `ValorExacto` y no un `Racional`: cubre `0` y `3/2`, pero también `(7 − √13)/2` y
   * `√2/2`, que antes se degradaban a decimal por no tener dónde guardarlos. `null` significa
   * ahora lo que siempre debió significar —«no hay forma cerrada al alcance», no «es feo»— y
   * quien llama enseña el decimal solo entonces.
   */
  readonly exactoX: ValorExacto | null;
  readonly exactoY: ValorExacto | null;
}

export type ResultadoSistema =
  /** Las soluciones, todas, ordenadas por x y luego por y. */
  | { readonly tipo: "puntos"; readonly puntos: readonly Solucion[] }
  /** Las dos curvas coinciden en un tramo: las soluciones no son una lista, son una curva. */
  | { readonly tipo: "solape" }
  /** Este camino no sabe resolverlo (no es polinómico, o el grado se dispara). Quien llama debe
   *  ir por el camino numérico. NO significa «sin solución». */
  | { readonly tipo: "noResoluble" };

/** Tolerancia RELATIVA con la que se acepta que un candidato satisface una ecuación. Relativa
 *  porque el residuo de un polinomio escala con sus coeficientes: un umbral fijo rechazaría
 *  soluciones buenas de curvas grandes y aceptaría basura de curvas pequeñas. */
const TOL_REL = 1e-9;

/** Derivada parcial respecto de x. */
function dX(p: Polinomio2): Polinomio2 {
  return normalizar2(p.map((c) => {
    const out: Racional[] = [];
    for (let i = 1; i < c.length; i++) out.push({ n: c[i].n * BigInt(i), d: c[i].d });
    return normalizar(out);
  }));
}

/** Derivada parcial respecto de y. */
function dY(p: Polinomio2): Polinomio2 {
  const P = normalizar2(p);
  const out: Polinomio[] = [];
  for (let j = 1; j < P.length; j++)
    out.push(normalizar(P[j].map((c) => ({ n: c.n * BigInt(j), d: c.d }))));
  return normalizar2(out);
}

/**
 * Pule un punto con Newton en dos variables sobre el sistema exacto.
 *
 * Hace falta porque una raíz IRRACIONAL solo se conoce como un intervalo, y la `y` que sale de
 * sustituir su extremo arrastra el error de esa sustitución. Newton, partiendo de un punto que ya
 * está cerquísima, lo lleva al límite de lo que un `double` puede representar en dos o tres
 * pasos. Si el jacobiano es singular (curvas tangentes) se devuelve el punto de partida sin
 * tocarlo: ahí Newton no converge, y el punto de partida ya es bueno.
 */
function pulirNewton(
  p: Polinomio2, q: Polinomio2, x0: number, y0: number
): { x: number; y: number } {
  const px = dX(p), py = dY(p), qx = dX(q), qy = dY(q);
  let x = x0, y = y0;
  for (let i = 0; i < 12; i++) {
    const fp = evaluarNum2(p, x, y), fq = evaluarNum2(q, x, y);
    if (!Number.isFinite(fp) || !Number.isFinite(fq)) return { x: x0, y: y0 };
    if (fp === 0 && fq === 0) break;
    const a = evaluarNum2(px, x, y), b = evaluarNum2(py, x, y);
    const c = evaluarNum2(qx, x, y), d = evaluarNum2(qy, x, y);
    const det = a * d - b * c;
    if (!Number.isFinite(det) || det === 0) break;
    const nx = x - (fp * d - fq * b) / det;
    const ny = y - (a * fq - c * fp) / det;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) break;
    if (nx === x && ny === y) break;
    x = nx; y = ny;
  }
  // Newton puede alejarse si el punto de partida no era tan bueno: se acepta solo si mejora.
  const antes = Math.abs(evaluarNum2(p, x0, y0)) + Math.abs(evaluarNum2(q, x0, y0));
  const ahora = Math.abs(evaluarNum2(p, x, y)) + Math.abs(evaluarNum2(q, x, y));
  return ahora <= antes ? { x, y } : { x: x0, y: y0 };
}

/** Escala de magnitud de un polinomio en un punto, para volver relativa la tolerancia. */
function escala(p: Polinomio2, x: number, y: number): number {
  let s = 1;
  for (const c of p) for (const k of c) s = Math.max(s, Math.abs(aNumero(k)));
  const m = Math.max(1, Math.abs(x), Math.abs(y));
  return s * m ** Math.max(1, gradoY(p) + 1);
}

/** ¿El punto satisface de verdad las dos ecuaciones y está donde las curvas existen? */
function verificar(
  p: Polinomio2, q: Polinomio2, denP: Polinomio2, denQ: Polinomio2, x: number, y: number
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const rp = Math.abs(evaluarNum2(p, x, y)), rq = Math.abs(evaluarNum2(q, x, y));
  if (!(rp <= TOL_REL * escala(p, x, y)) || !(rq <= TOL_REL * escala(q, x, y))) return false;
  // Los denominadores que se limpiaron al construir la ecuación: si se anulan aquí, la curva no
  // existe en este punto y la «solución» la inventó la limpieza (`1/x = 1/x` en el origen).
  for (const d of [denP, denQ]) {
    if (esNulo2(d)) return false;
    const v = Math.abs(evaluarNum2(d, x, y));
    if (v <= 1e-12 * escala(d, x, y)) return false;
  }
  return true;
}

/** Una ordenada candidata, con su forma cerrada cuando la hay. */
interface Ordenada {
  readonly y: number;
  readonly exacta: ValorExacto | null;
}

/**
 * Las `y` que corresponden a una `x` candidata.
 *
 * Con la x RACIONAL se sustituye exactamente en las dos ecuaciones y se toma el máximo común
 * divisor de los dos polinomios en y: sus raíces son, por definición, las y comunes. Es la
 * respuesta con demostración, y de ahí salen las coordenadas exactas del panel —incluidas las
 * irracionales de grado 2, porque las raíces de ese mcd se leen con `raicesConForma`—.
 *
 * Con la x IRRACIONAL solo se dispone de un intervalo racional que la encierra; se sustituye su
 * extremo (que aproxima la x hasta la última cifra del `double`) y se emparejan las raíces de
 * cada ecuación que coinciden. El mcd no sirve ahí: los dos polinomios están mínimamente
 * perturbados y su mcd exacto sería 1 aunque compartan una raíz de facto. La forma cerrada de
 * esas ordenadas la recupera después `ordenadaExacta`, por otro camino.
 */
function ordenadasDe(
  p: Polinomio2, q: Polinomio2, xRacional: Racional | null, xr: Racional,
  explicita: Polinomio | null, xValor: number
): Ordenada[] {
  // ── Atajo con relación EXPLÍCITA ────────────────────────────────────────────────────────
  // Si una de las dos curvas es `y = f(x)`, toda solución cumple esa igualdad: la ordenada es
  // `f(x)` y no hay nada que buscar. Con la abscisa RACIONAL se sigue por el camino largo, que
  // ahí da la forma exacta por el mcd; con la irracional, el camino largo sustituía una
  // aproximación de 17 dígitos de denominador en la ecuación y volvía a resolverla, y eso en
  // grado 8 costaba 2,3 s POR RAÍZ —el panel tardaba cuatro segundos y medio en abrirse—.
  // Evaluar f es exacto por definición y cuesta microsegundos.
  if (xRacional === null && explicita !== null)
    return [{ y: evaluarNumPol(explicita, xValor), exacta: null }];
  return ordenadasPorEliminacion(p, q, xRacional, xr);
}

function ordenadasPorEliminacion(
  p: Polinomio2, q: Polinomio2, xRacional: Racional | null, xr: Racional
): Ordenada[] {
  const py = sustituirX(p, xr);
  const qy = sustituirX(q, xr);
  // Las dos ecuaciones se anulan enteras en esta abscisa: toda la vertical es solución. Es un
  // solape, no una lista de puntos, y quien llama ya lo trata como tal.
  if (esNulo(py) && esNulo(qy)) return [];

  const conForma = (pol: Polinomio): Ordenada[] =>
    raicesConForma(pol).map((r) => ({ y: r.raiz.valor, exacta: r.exacto }));

  if (xRacional !== null) {
    // Una de las dos no depende de y en esta abscisa: si es idénticamente nula, manda la otra.
    if (esNulo(py)) return conForma(qy);
    if (esNulo(qy)) return conForma(py);
    const g = mcdPol(py, qy);
    if (grado(g) < 1) return [];
    return conForma(g);
  }

  // ── Abscisa IRRACIONAL ────────────────────────────────────────────────────────────────
  // Aquí solo se calculan VALORES. Una forma cerrada leída de estos polinomios sería la de una
  // raíz del polinomio PERTURBADO (se sustituyó un racional que aproxima la abscisa, no la
  // abscisa), y presentarla como exacta sería exactamente la mentira que este motor no comete.
  // La forma cerrada de la ordenada la recupera después `ordenadaExacta`, evaluando la relación
  // explícita en el cuerpo de la abscisa, que sí es exacto.
  const soloValores = (pol: Polinomio): Ordenada[] =>
    raicesReales(pol).map((r) => ({ y: r.valor, exacta: null }));

  // Una ecuación SIN y (`x² = 2`, una recta vertical) no dice nada sobre la ordenada: solo
  // restringe la abscisa, y las y salen de la otra sola. Sin esto, sustituir la abscisa
  // irracional dejaba en su sitio una constante no nula, el emparejado no encontraba pareja y
  // el sistema `x² = 2` ∩ `y = x` se quedaba SIN SOLUCIONES teniendo dos —que es el peor error
  // posible: no es no saber, es afirmar que no hay—.
  if (gradoY(p) === 0) return soloValores(qy);
  if (gradoY(q) === 0) return soloValores(py);

  const rp = raicesReales(py), rq = raicesReales(qy);
  const out: Ordenada[] = [];
  for (const a of rp) {
    for (const b of rq) {
      const tol = 1e-6 * Math.max(1, Math.abs(a.valor));
      if (Math.abs(a.valor - b.valor) <= tol) out.push({ y: (a.valor + b.valor) / 2, exacta: null });
    }
  }
  return out;
}

/**
 * La ordenada EXACTA de una solución cuya abscisa es irracional.
 *
 * Cuando el sistema tiene una curva explícita `y = f(x)` con f de coeficientes racionales, toda
 * solución cumple `y = f(x)`, así que basta con evaluar f en la abscisa exacta dentro de su
 * cuerpo cuadrático. Es lo que convierte `x = (7−√13)/2` en `y = (7−√13)/2` en vez de dejar la
 * ordenada en decimal por el camino del emparejado numérico.
 *
 * El resultado se contrasta con la ordenada que ya se tenía: si no coinciden, la relación
 * explícita no era la que corresponde a este candidato y no se afirma nada.
 */
function ordenadaExacta(
  explicita: Polinomio | null, xExacta: ValorExacto | null, yNumerica: number
): ValorExacto | null {
  if (explicita === null) return null;
  // Una relación CONSTANTE (`y = 0`, `y = 3/2`) fija la ordenada sin mirar la abscisa, así que
  // vale aunque la abscisa no se sepa escribir: en `x³ = 2` ∩ `y = 0` la x es ∛2 —fuera de
  // alcance— y la y es cero, exactamente cero, y tirarlo por lo que pasa con la otra coordenada
  // sería perder información que sí se tiene.
  if (xExacta === null && grado(explicita) > 0) return null;
  const valor = evaluarExacto(explicita, xExacta ?? exactoDe(rac(0n)));
  if (valor === null) return null;
  const escala = Math.max(1, Math.abs(yNumerica));
  return Math.abs(aNumeroE(valor) - yNumerica) <= 1e-6 * escala ? valor : null;
}

/** ¿Cuántas coordenadas de esta solución se saben escribir exactamente? Decide cuál de dos
 *  duplicados se conserva. */
const riqueza = (s: Solucion): number => (s.exactoX ? 1 : 0) + (s.exactoY ? 1 : 0);

/**
 * Ordena y quita repetidos.
 *
 * Dos soluciones más juntas que la tolerancia son la misma contada dos veces (una tangencia que
 * la eliminación devuelve por duplicado, o un punto que dos ramas comparten). De las dos se
 * conserva la que traiga MÁS forma exacta: el mismo punto puede llegar por un camino que sabe
 * escribirlo y por otro que solo tiene su decimal, y quedarse con el segundo tiraría información
 * que ya se tenía.
 */
function ordenarYUnificar(puntos: Solucion[]): Solucion[] {
  const orden = [...puntos].sort((a, b) => a.x - b.x || a.y - b.y);
  const out: Solucion[] = [];
  for (const s of orden) {
    const iguales = out.findIndex((o) => {
      const escalaXY = Math.max(1, Math.abs(o.x), Math.abs(o.y));
      return Math.abs(o.x - s.x) <= 1e-9 * escalaXY && Math.abs(o.y - s.y) <= 1e-9 * escalaXY;
    });
    if (iguales < 0) out.push(s);
    else if (riqueza(s) > riqueza(out[iguales])) out[iguales] = s;
  }
  return out;
}

/**
 * Resuelve el sistema formado por dos ecuaciones escritas.
 *
 * Devuelve `noResoluble` cuando no es polinómico, que NO es lo mismo que «sin solución»: es este
 * camino declarando que no le toca. Quien llama debe entonces probar el camino numérico.
 */
export function resolverSistema(ecuacionA: string, ecuacionB: string): ResultadoSistema {
  const A = ecuacionAPolinomio(ecuacionA);
  const B = ecuacionAPolinomio(ecuacionB);
  if (!A || !B) return { tipo: "noResoluble" };

  const p = A.p, q = B.p;
  if (compartenComponente(p, q)) return { tipo: "solape" };

  // ── Eliminación ─────────────────────────────────────────────────────────────────────────
  // Si una de las dos es EXPLÍCITA en y (grado 1 en y y con coeficiente constante), sustituirla
  // en la otra es más barato y más limpio que la resultante: los coeficientes no crecen. La
  // resultante queda para cuando no hay nada que despejar (dos implícitas).
  const explicita = despejarY(p) ?? despejarY(q);
  const otra = despejarY(p) !== null ? q : p;
  const enX: Polinomio = explicita !== null
    ? sustituirY(otra, explicita)
    : resultanteY(p, q);

  if (esNulo(enX)) return { tipo: "solape" };

  const puntos: Solucion[] = [];
  for (const { raiz: r, exacto: xExacta } of raicesConForma(enX)) {
    // La sustitución exacta solo vale si la abscisa es RACIONAL; una abscisa irracional, aunque
    // tenga forma cerrada, no se puede meter en un `Polinomio2` de coeficientes racionales. Con
    // ella se sustituye un racional que la aproxima hasta la última cifra del doble, que es lo
    // más cerca que se puede estar de ella sin salirse de ℚ.
    const xRacional = xExacta === null ? null : racionalDe(xExacta);
    const xr = xRacional ?? r.b;
    for (const cand of ordenadasDe(p, q, xRacional, xr, explicita, r.valor)) {
      const pulido = xRacional !== null && cand.exacta !== null
        ? { x: r.valor, y: cand.y }            // ya es exacto: pulir solo lo estropearía
        : pulirNewton(p, q, r.valor, cand.y);
      if (!verificar(p, q, A.denominador, B.denominador, pulido.x, pulido.y)) continue;
      puntos.push({
        x: pulido.x,
        y: pulido.y,
        exactoX: xExacta,
        // Con la abscisa irracional el emparejado numérico no da forma cerrada; la relación
        // explícita `y = f(x)`, evaluada en el cuerpo de la abscisa, sí.
        exactoY: cand.exacta ?? ordenadaExacta(explicita, xExacta, pulido.y),
      });
    }
  }

  return { tipo: "puntos", puntos: ordenarYUnificar(puntos) };
}

// ─────────────────────────────────────────────
// Tercer escalón: resolver por las RAMAS del despejador
// ─────────────────────────────────────────────

/** Tolerancia RELATIVA con la que un candidato tiene que satisfacer la ecuación ORIGINAL. Es
 *  el filtro que no depende del despeje: 1e-6 acepta de sobra lo que sale del camino numérico
 *  (residuos del orden de 1e-16) y rechaza por varios órdenes de magnitud una raíz extraña de
 *  una elevación al cuadrado (residuo 4.6 en el caso que motivó esto). */
const TOL_ORIGINAL = 1e-6;

/** Holgura con la que se acepta `R ≥ 0` en una guarda. Relativa al punto: una solución que cae
 *  JUSTO en el borde del dominio (la guarda vale 0) es una solución legítima, y el `0` que sale
 *  de un cálculo en coma flotante puede ser 1e-17 por el lado de fuera. */
const TOL_GUARDA = 1e-9;

/** Lo que devuelve el escalón de ramas. `null` (fuera de este tipo) = no le toca. */
type ResultadoRamas =
  | {
      readonly tipo: "puntos";
      readonly puntos: readonly Solucion[];
      readonly aproximado: boolean;
      /** Alguna rama quedó sin resolver: la lista puede no ser toda. */
      readonly parcial: boolean;
      /** Variables barridas por el camino numérico dentro de este escalón. */
      readonly exploradas: readonly ("x" | "y")[];
    }
  | { readonly tipo: "solape" };

/**
 * Evaluador de `lhs − rhs` de la ecuación tal como se ESCRIBIÓ.
 *
 * La verificación final se hace contra esto y no contra las ramas, y esa distinción es el
 * seguro de todo el escalón: las ramas salen de un despeje que eleva al cuadrado, y un
 * candidato que satisface la rama puede no satisfacer el sistema. Las guardas son la defensa
 * de diseño; esto es la red que se pone debajo por si alguna estrategia del despejador emitiera
 * una guarda incompleta.
 */
function verificadorDe(ecuacion: string): ((x: number, y: number) => number) | null {
  const norm = (s: string): string => insertarProductoImplicito(normalizarEntrada(s.trim()));
  const partes = ecuacion.split("=");
  if (partes.length > 2) return null;
  try {
    // Sin `=`: expresión suelta, que en obs-graph significa `y = expr` (misma convención que
    // `ecuacionAPolinomio`).
    const D = partes.length === 2
      ? parse(`(${norm(partes[0])}) - (${norm(partes[1])})`)
      : parse(`y - (${norm(partes[0])})`);
    return evaluadorDe(D as unknown as Nodo);
  } catch {
    return null;
  }
}

/** ¿El candidato satisface de verdad la ecuación original? */
function satisface(D: (x: number, y: number) => number, s: Solucion): boolean {
  const d = D(s.x, s.y);
  return Number.isFinite(d) && Math.abs(d) <= TOL_ORIGINAL * (1 + s.x * s.x + s.y * s.y);
}

/** Las guardas de una pareja de ramas, compiladas; `null` si alguna no se deja leer (entonces
 *  la pareja se descarta entera: sin poder comprobar la condición, sus candidatos no se pueden
 *  afirmar). */
function compilarGuardas(
  guardas: readonly string[]
): Array<(x: number, y: number) => number> | null {
  const out: Array<(x: number, y: number) => number> = [];
  for (const g of new Set(guardas)) {
    let f: ((x: number, y: number) => number) | null;
    try { f = evaluadorDe(parse(g) as unknown as Nodo); }
    catch { return null; }
    if (!f) return null;
    out.push(f);
  }
  return out;
}

/** ¿El punto cae donde las dos ramas existen? */
function dentroDeGuardas(
  guardas: ReadonlyArray<(x: number, y: number) => number>, s: Solucion
): boolean {
  for (const g of guardas) {
    const v = g(s.x, s.y);
    if (!Number.isFinite(v)) return false;
    if (v < -TOL_GUARDA * Math.max(1, Math.abs(s.x), Math.abs(s.y))) return false;
  }
  return true;
}

/**
 * Resuelve el sistema cruzando las RAMAS que produce el despejador.
 *
 * Cada ecuación se convierte en las N ecuaciones que de verdad representa (`ramas.ts`) y se
 * cruzan todas las parejas, cada una por el camino exacto y, si no, por el numérico. De cada
 * candidato se exige lo mismo que a cualquier otro: caer donde las guardas de sus dos ramas se
 * cumplen, y satisfacer las ecuaciones ORIGINALES.
 *
 * Devuelve `null` cuando no hay nada que aportar (alguna ecuación no da ramas, o ninguna pareja
 * se deja resolver), y entonces el sistema sigue siendo `noResoluble` como antes. Este escalón
 * no puede quitar respuestas: solo se llega hasta aquí cuando no había ninguna.
 *
 * El coste está acotado por construcción: ≤4 ramas por ecuación (dos ejes de signo, ver
 * `dobleSigno.ts`), así que ≤16 parejas, y solo se pagan cuando hoy se contestaba «no se puede».
 */
function resolverPorRamas(ecuacionA: string, ecuacionB: string): ResultadoRamas | null {
  const ramasA = ramasDe(ecuacionA);
  const ramasB = ramasDe(ecuacionB);
  if (!ramasA || !ramasB) return null;
  const verifA = verificadorDe(ecuacionA);
  const verifB = verificadorDe(ecuacionB);
  // Sin poder contrastar contra el original no se entrega nada: la red de seguridad no es
  // opcional (ver `verificadorDe`).
  if (!verifA || !verifB) return null;

  const puntos: Solucion[] = [];
  const exploradas = new Set<"x" | "y">();
  let algunaResuelta = false;
  let aproximado = false;
  let parcial = false;

  for (const ra of ramasA) {
    for (const rb of ramasB) {
      const guardas = compilarGuardas([...ra.guardas, ...rb.guardas]);
      // Una guarda ilegible deja esta rama SIN COMPROBAR, así que sus candidatos no se pueden
      // afirmar; pero las demás ramas sí se enumeran, y lo que sale es una lista parcial.
      if (guardas === null) { parcial = true; continue; }

      const candidatos = resolverPareja(ra, rb);
      // Dos ramas que coinciden en un tramo son un solape del sistema: las soluciones no son
      // una lista. Se propaga tal cual, igual que en el camino directo.
      if (candidatos === "solape") return { tipo: "solape" };
      if (candidatos === null) { parcial = true; continue; }

      algunaResuelta = true;
      if (candidatos.aproximado) aproximado = true;
      if (candidatos.variable) exploradas.add(candidatos.variable);
      for (const s of candidatos.puntos)
        if (dentroDeGuardas(guardas, s) && satisface(verifA, s) && satisface(verifB, s))
          puntos.push(s);
    }
  }

  if (!algunaResuelta) return null;
  return {
    tipo: "puntos", puntos: ordenarYUnificar(puntos), aproximado, parcial,
    exploradas: [...exploradas],
  };
}

/**
 * Una pareja de ramas, por el camino exacto y si no por el numérico. MISMO orden que arriba y
 * por el mismo motivo: la rama `y = (3−x)²` de `x + √|y| = 3` es polinómica, y resolverla exacta
 * da la lista completa sobre ℝ en vez de la lista de un intervalo.
 */
function resolverPareja(
  ra: RamaEcuacion, rb: RamaEcuacion
): {
  puntos: readonly Solucion[];
  aproximado: boolean;
  variable: "x" | "y" | null;
} | "solape" | null {
  const exacto = resolverSistema(ra.ecuacion, rb.ecuacion);
  if (exacto.tipo === "solape") return "solape";
  if (exacto.tipo === "puntos")
    return { puntos: exacto.puntos, aproximado: false, variable: null };

  // Simétrico: dentro de una pareja de ramas el camino exacto ya ha tenido su oportunidad, así
  // que admitir las ramas tumbadas (las que salen de una ecuación escrita en x) solo suma.
  const num = resolverNumerico(ra.ecuacion, rb.ecuacion, { simetrico: true });
  if (num.tipo === "noResoluble") return null;
  // Aunque esta pareja no aporte ningún punto, la lista pasa a estar limitada al intervalo
  // explorado: es una afirmación sobre la ENUMERACIÓN, no sobre los puntos hallados.
  return {
    puntos: num.puntos.map((p) => ({ x: p.x, y: p.y, exactoX: null, exactoY: null })),
    aproximado: true,
    variable: num.variable,
  };
}

/**
 * El resultado de resolver un BLOQUE entero (que puede tener más de dos ecuaciones).
 *
 * Los dos indicadores son INDEPENDIENTES y responden a preguntas distintas, que antes se
 * confundían en una sola:
 *
 *   • `aproximado` — ¿de dónde salen los VALORES? Del camino numérico, luego la enumeración solo
 *     cubre el intervalo explorado.
 *   • `parcial`    — ¿se enumeró TODO lo que había que enumerar? Alguna pareja de curvas se quedó
 *     sin resolver, así que la lista es verdadera pero puede no estar entera.
 *
 * Las cuatro combinaciones son estados reales y el panel los dice distinto: exacta y completa
 * (sin coletilla), aproximada (con su intervalo), parcial (puede haber más), y `noResoluble`
 * (no se sabe nada). El caso peligroso es el que faltaba: una lista VACÍA y parcial no es «las
 * curvas no se cortan», es «no lo sé».
 */
export interface ResultadoBloque {
  readonly tipo: "puntos" | "solape" | "noResoluble";
  readonly puntos: readonly Solucion[];
  /**
   * ¿Alguna pareja se resolvió por el camino NUMÉRICO? Entonces la lista es completa solo dentro
   * del intervalo explorado, y el panel tiene que decirlo. Con todo resuelto por el camino
   * exacto es `false` y no hay nada que matizar: la lista es completa sobre ℝ.
   */
  readonly aproximado: boolean;
  /** ¿Alguna pareja quedó SIN enumerar mientras otras sí? La lista no se puede afirmar completa. */
  readonly parcial: boolean;
  /**
   * Las variables sobre las que barrió el camino numérico, para que el panel escriba el
   * intervalo de la que de verdad se recorrió. Vacío cuando no se barrió nada (todo exacto).
   */
  readonly exploradas: readonly ("x" | "y")[];
}

/**
 * Resuelve un bloque de dos o más ecuaciones.
 *
 * Con más de dos se cruzan TODAS LAS PAREJAS y se unen los resultados, que es la semántica que
 * el bloque ya tenía cuando las soluciones salían de la geometría: lo que se listaba eran los
 * cruces entre curvas distintas, no los puntos comunes a todas. Cambiar eso sería otra decisión,
 * y no la que se vino a tomar aquí —esto arregla de dónde salen los números, no qué significan—.
 *
 * Cada pareja baja por los CUATRO escalones en orden (exacto directo → numérico directo → ramas
 * del despejador → numérico simétrico; ver la cabecera del archivo) y se queda en el primero que
 * responda. Ese orden importa: el exacto encuentra raíces dobles y raíces pegadas que el numérico
 * no puede prometer, y además conserva la forma cerrada de las coordenadas, así que usarlo
 * siempre que se pueda no es una optimización, es más respuesta correcta.
 */
export function resolverBloque(ecuaciones: readonly string[]): ResultadoBloque {
  const nada = {
    tipo: "noResoluble", puntos: [], aproximado: false, parcial: false, exploradas: [],
  } as const;
  const solape = {
    tipo: "solape", puntos: [], aproximado: false, parcial: false, exploradas: [],
  } as const;
  if (ecuaciones.length < 2) return nada;

  // La RESTRICCIÓN DE DOMINIO se separa antes de resolver y se aplica después. Las dos mitades
  // hacen falta: el motor no sabe leer `{0 ≤ x ≤ 2}` —no es parte de la ecuación, es un recorte
  // sobre ella—, y una solución fuera del recorte no es una solución del bloque, porque ahí la
  // curva ni siquiera se dibuja. Enumerar un cruce que el usuario no puede ver sería el error
  // simétrico del que se vino a corregir.
  //
  // El DOBLE SIGNO se expande AQUÍ, y no es cosmética: `y = ±⁴√(1−x⁴)` no es una ecuación sino
  // la FAMILIA de dos, y solo se cruzaba una. Contra `y = ∛x` hay un corte en cada rama —en
  // x ≈ 0,7507 y en x ≈ −0,7508, porque las dos curvas son impares— y el panel listaba uno
  // solo. Es la misma expansión que ya hacía el dibujo (`parsing/dobleSigno`, por donde pasa
  // `composicion.ts`), que es justamente por lo que el plano SÍ enseñaba las dos ramas y el
  // cuadro ⓘ nombraba un punto: las dos mitades del motor no estaban de acuerdo sobre cuántas
  // curvas hay escritas.
  //
  // Las ramas se quedan AGRUPADAS por la ecuación de la que salen, y el cruce es grupo contra
  // grupo: una rama NUNCA se cruza con su hermana. Donde las dos mitades se tocan —el radicando
  // a cero— no hay un corte entre curvas distintas, sino la misma curva cerrándose sobre sí
  // misma, y enumerarlo sería inventar soluciones. Es la misma razón por la que el dibujo las
  // une en un `ProveedorUnion` en vez de tratarlas como dos objetos.
  const grupos = ecuaciones.map((ec) => {
    const { expr, restriccion } = separarRestriccion(ec);
    let ramas = [expr];
    try {
      const norm = normalizarEntrada(expr);
      if (tieneDobleSigno(norm)) ramas = expandirDobleSigno(norm);
    } catch { /* no normaliza: se cruza tal como se escribió, como hasta ahora */ }
    return { ramas, restriccion };
  });

  // Las parejas a cruzar, ya aplanadas: cada grupo contra cada OTRO grupo, y dentro de eso
  // cada rama contra cada rama. Se arman aparte para que el cuerpo de abajo —los cuatro
  // escalones— siga leyéndose a un solo nivel de sangrado en vez de al fondo de cuatro bucles.
  const parejas: Array<{
    a: string; b: string; recortes: ReadonlyArray<RestriccionDominio | null>;
  }> = [];
  for (let i = 0; i < grupos.length; i++)
    for (let j = i + 1; j < grupos.length; j++)
      for (const a of grupos[i].ramas)
        for (const b of grupos[j].ramas)
          parejas.push({ a, b, recortes: [grupos[i].restriccion, grupos[j].restriccion] });

  const todos: Solucion[] = [];
  const exploradas = new Set<"x" | "y">();
  let aproximado = false;
  let algunaResuelta = false;
  let parcial = false;
  for (const { a, b, recortes } of parejas) {
      const admitir = (p: { x: number; y: number }) => enDominio(p, recortes);

      const exacto = resolverSistema(a, b);
      if (exacto.tipo === "solape") return solape;
      if (exacto.tipo === "puntos") {
        algunaResuelta = true;
        todos.push(...exacto.puntos.filter(admitir));
        continue;
      }
      const numerico = resolverNumerico(a, b);
      if (numerico.tipo === "puntos") {
        algunaResuelta = true;
        aproximado = true;
        exploradas.add(numerico.variable);
        for (const p of numerico.puntos)
          if (admitir(p)) todos.push({ ...p, exactoX: null, exactoY: null });
        continue;
      }
      // Tercer escalón: las RAMAS del despejador. Aquí ya no hay nada que perder —los dos
      // caminos directos se han declarado incompetentes—, así que solo puede sumar.
      const porRamas = resolverPorRamas(a, b);
      if (porRamas === null) {
        // CUARTO escalón: el barrido numérico SIMÉTRICO sobre las ecuaciones originales, que
        // admite las curvas tumbadas (`x = g(y)`) y las mixtas. Va el último a propósito: sabe
        // resolver cosas que las ramas resuelven EXACTAS, y adelantarlo cambiaría respuestas
        // exactas por aproximadas. Aquí ya nadie ha podido, así que solo puede sumar.
        const tumbado = resolverNumerico(a, b, { simetrico: true });
        if (tumbado.tipo === "puntos") {
          algunaResuelta = true;
          aproximado = true;
          exploradas.add(tumbado.variable);
          for (const p of tumbado.puntos)
            if (admitir(p)) todos.push({ ...p, exactoX: null, exactoY: null });
          continue;
        }
        // Esta pareja no la sabe nadie. Si otra sí, la lista final será verdadera pero no
        // completa, y decirlo es la diferencia entre «no hay más» y «no sé si hay más».
        parcial = true;
        continue;
      }
      if (porRamas.tipo === "solape") return solape;
      algunaResuelta = true;
      if (porRamas.aproximado) aproximado = true;
      if (porRamas.parcial) parcial = true;
      for (const v of porRamas.exploradas) exploradas.add(v);
      todos.push(...porRamas.puntos.filter(admitir));
  }
  if (!algunaResuelta) return nada;
  return {
    tipo: "puntos", puntos: ordenarYUnificar(todos), aproximado, parcial,
    exploradas: [...exploradas],
  };
}

/**
 * ¿El punto cae dentro de todos los recortes que le apliquen?
 *
 * Solo se comprueban los que acotan `x` o `y`, que son las coordenadas que un punto del plano
 * tiene. Un recorte sobre `t` o `theta` pertenece a una curva paramétrica o polar, y esas no
 * llegan hasta aquí —no se dejan escribir como una ecuación en x e y—, así que no hay nada que
 * comprobar y tampoco nada que descartar en silencio.
 */
function enDominio(
  p: { x: number; y: number }, recortes: ReadonlyArray<RestriccionDominio | null>
): boolean {
  for (const r of recortes) {
    if (!r) continue;
    if (r.variable === "x" && !dentro(r, p.x)) return false;
    if (r.variable === "y" && !dentro(r, p.y)) return false;
  }
  return true;
}

/**
 * `f(x)` si el polinomio dice `y = f(x)`, o `null`.
 *
 * Solo cuenta cuando el coeficiente de y es una CONSTANTE: con `x·y = 1`, el grado en y también
 * es 1, pero despejar exigiría dividir por x y eso no es un polinomio (y además perdería la
 * rama x=0). Ahí manda la resultante, que no necesita despejar nada.
 */
function despejarY(p: Polinomio2): Polinomio | null {
  const P = normalizar2(p);
  if (gradoY(P) !== 1) return null;
  const coef = P[1];
  if (grado(coef) !== 0) return null;
  const k = coef[0];
  if (esCero(k)) return null;
  // y = −p₀(x)/k
  return normalizar(P[0].map((c) => ({ n: -c.n * k.d, d: c.d * k.n })).map((c) =>
    c.d < 0n ? { n: -c.n, d: -c.d } : c
  )).map((c) => rac(c.n, c.d));
}

