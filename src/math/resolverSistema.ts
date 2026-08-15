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

import {
  type Racional, aNumero, esCero, rac,
} from "./racional";
import {
  type Polinomio, esNulo, grado, mcdPol, raicesReales, normalizar,
} from "./polinomio";
import {
  type Polinomio2, compartenComponente, esNulo2, evaluarNum2, gradoY, normalizar2, resultanteY,
  sustituirX, sustituirY,
} from "./polinomio2";
import { ecuacionAPolinomio } from "./extraer";
import { resolverNumerico } from "./numerico";
import {
  dentro, separarRestriccion, type RestriccionDominio,
} from "../core/parsing/restriccionDominio";

/** Una solución del sistema: el punto, y su forma exacta cuando la tiene. */
export interface Solucion {
  readonly x: number;
  readonly y: number;
  /** El valor exacto de cada coordenada, o `null` si es irracional. Lo usa el panel para
   *  escribir `0` y `3/2` en vez de `0.0000000` y `1.4999999`. */
  readonly exactoX: Racional | null;
  readonly exactoY: Racional | null;
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

/**
 * Las `y` que corresponden a una `x` candidata.
 *
 * Con la x EXACTA (racional) se sustituye exactamente en las dos ecuaciones y se toma el máximo
 * común divisor de los dos polinomios en y: sus raíces son, por definición, las y comunes. Es la
 * respuesta con demostración, y de ahí salen las coordenadas exactas del panel.
 *
 * Con la x IRRACIONAL solo se dispone de un intervalo racional que la encierra; se sustituye su
 * extremo (que aproxima la x hasta la última cifra del `double`) y se emparejan las raíces de
 * cada ecuación que coinciden. El mcd no sirve ahí: los dos polinomios están mínimamente
 * perturbados y su mcd exacto sería 1 aunque compartan una raíz de facto.
 */
function ordenadasDe(
  p: Polinomio2, q: Polinomio2, xExacta: Racional | null, xr: Racional
): Array<{ y: number; exacta: Racional | null }> {
  const py = sustituirX(p, xr);
  const qy = sustituirX(q, xr);
  // Las dos ecuaciones se anulan enteras en esta abscisa: toda la vertical es solución. Es un
  // solape, no una lista de puntos, y quien llama ya lo trata como tal.
  if (esNulo(py) && esNulo(qy)) return [];

  if (xExacta !== null) {
    // Una de las dos no depende de y en esta abscisa: si es idénticamente nula, manda la otra.
    if (esNulo(py)) return raicesReales(qy).map((r) => ({ y: r.valor, exacta: r.exacto }));
    if (esNulo(qy)) return raicesReales(py).map((r) => ({ y: r.valor, exacta: r.exacto }));
    const g = mcdPol(py, qy);
    if (grado(g) < 1) return [];
    return raicesReales(g).map((r) => ({ y: r.valor, exacta: r.exacto }));
  }

  const rp = raicesReales(py), rq = raicesReales(qy);
  const out: Array<{ y: number; exacta: Racional | null }> = [];
  for (const a of rp) {
    for (const b of rq) {
      const tol = 1e-6 * Math.max(1, Math.abs(a.valor));
      if (Math.abs(a.valor - b.valor) <= tol) out.push({ y: (a.valor + b.valor) / 2, exacta: null });
    }
  }
  return out;
}

/** Ordena y quita repetidos. Dos soluciones más juntas que esto son la misma contada dos veces
 *  (una tangencia que la eliminación devuelve por duplicado). */
function ordenarYUnificar(puntos: Solucion[]): Solucion[] {
  const orden = [...puntos].sort((a, b) => a.x - b.x || a.y - b.y);
  const out: Solucion[] = [];
  for (const s of orden) {
    const repetido = out.some((o) => {
      const escalaXY = Math.max(1, Math.abs(o.x), Math.abs(o.y));
      return Math.abs(o.x - s.x) <= 1e-9 * escalaXY && Math.abs(o.y - s.y) <= 1e-9 * escalaXY;
    });
    if (!repetido) out.push(s);
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

  const raices = raicesReales(enX);
  const puntos: Solucion[] = [];
  for (const r of raices) {
    // Con la raíz irracional se sustituye un racional que la aproxima hasta la última cifra del
    // doble: es lo más cerca que se puede estar de ella sin salirse de ℚ.
    const xr = r.exacto ?? r.b;
    for (const cand of ordenadasDe(p, q, r.exacto, xr)) {
      const pulido = r.exacto !== null && cand.exacta !== null
        ? { x: r.valor, y: cand.y }            // ya es exacto: pulir solo lo estropearía
        : pulirNewton(p, q, r.valor, cand.y);
      if (!verificar(p, q, A.denominador, B.denominador, pulido.x, pulido.y)) continue;
      puntos.push({
        x: pulido.x,
        y: pulido.y,
        exactoX: r.exacto,
        exactoY: cand.exacta,
      });
    }
  }

  return { tipo: "puntos", puntos: ordenarYUnificar(puntos) };
}

/** El resultado de resolver un BLOQUE entero (que puede tener más de dos ecuaciones). */
export interface ResultadoBloque {
  readonly tipo: "puntos" | "solape" | "noResoluble";
  readonly puntos: readonly Solucion[];
  /**
   * ¿Alguna pareja se resolvió por el camino NUMÉRICO? Entonces la lista es completa solo dentro
   * del intervalo explorado, y el panel tiene que decirlo. Con todo resuelto por el camino
   * exacto es `false` y no hay nada que matizar: la lista es completa sobre ℝ.
   */
  readonly aproximado: boolean;
}

/**
 * Resuelve un bloque de dos o más ecuaciones.
 *
 * Con más de dos se cruzan TODAS LAS PAREJAS y se unen los resultados, que es la semántica que
 * el bloque ya tenía cuando las soluciones salían de la geometría: lo que se listaba eran los
 * cruces entre curvas distintas, no los puntos comunes a todas. Cambiar eso sería otra decisión,
 * y no la que se vino a tomar aquí —esto arregla de dónde salen los números, no qué significan—.
 *
 * Cada pareja intenta primero el camino EXACTO y solo cae al numérico si aquel se declara
 * incompetente. Ese orden importa: el exacto encuentra raíces dobles y raíces pegadas que el
 * numérico no puede prometer, así que usarlo siempre que se pueda no es una optimización, es más
 * respuesta correcta.
 */
export function resolverBloque(ecuaciones: readonly string[]): ResultadoBloque {
  if (ecuaciones.length < 2) return { tipo: "noResoluble", puntos: [], aproximado: false };

  // La RESTRICCIÓN DE DOMINIO se separa antes de resolver y se aplica después. Las dos mitades
  // hacen falta: el motor no sabe leer `{0 ≤ x ≤ 2}` —no es parte de la ecuación, es un recorte
  // sobre ella—, y una solución fuera del recorte no es una solución del bloque, porque ahí la
  // curva ni siquiera se dibuja. Enumerar un cruce que el usuario no puede ver sería el error
  // simétrico del que se vino a corregir.
  const partes = ecuaciones.map((ec) => separarRestriccion(ec));

  const todos: Solucion[] = [];
  let aproximado = false;
  let algunaResuelta = false;
  for (let i = 0; i < partes.length; i++) {
    for (let j = i + 1; j < partes.length; j++) {
      const a = partes[i], b = partes[j];
      const recortes = [a.restriccion, b.restriccion];
      const admitir = (p: { x: number; y: number }) => enDominio(p, recortes);

      const exacto = resolverSistema(a.expr, b.expr);
      if (exacto.tipo === "solape") return { tipo: "solape", puntos: [], aproximado: false };
      if (exacto.tipo === "puntos") {
        algunaResuelta = true;
        todos.push(...exacto.puntos.filter(admitir));
        continue;
      }
      const numerico = resolverNumerico(a.expr, b.expr);
      if (numerico.tipo === "noResoluble") continue;
      algunaResuelta = true;
      aproximado = true;
      for (const p of numerico.puntos)
        if (admitir(p)) todos.push({ ...p, exactoX: null, exactoY: null });
    }
  }
  if (!algunaResuelta) return { tipo: "noResoluble", puntos: [], aproximado: false };
  return { tipo: "puntos", puntos: ordenarYUnificar(todos), aproximado };
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

