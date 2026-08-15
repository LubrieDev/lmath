// ─────────────────────────────────────────────
// mate · Polinomios de DOS variables sobre ℚ, y eliminación (PURO)
// ─────────────────────────────────────────────
//
// Un polinomio en x e y, guardado como sus coeficientes en y: `coefY[j]` es el polinomio en x
// que multiplica a `y^j`. Es decir, p(x,y) = Σⱼ coefY[j](x)·yʲ.
//
// La forma no es arbitraria: es la que hace baratas las DOS operaciones que necesita resolver un
// sistema, que son las dos maneras de eliminar una variable.
//
//   • **Sustituir** y = f(x) (una curva explícita en una implícita) es evaluar el polinomio en y
//     con f(x) dentro: Σⱼ coefY[j]·f(x)ʲ. Sale directamente de esta representación.
//   • **La RESULTANTE** respecto de y (dos curvas implícitas, donde no hay nada que sustituir)
//     necesita justamente los coeficientes en y para montar la matriz de Sylvester.
//
// ── Qué es eliminar, y por qué es lo correcto aquí ────────────────────────────────────────
// Un sistema de dos curvas es un sistema de dos ecuaciones con dos incógnitas. Eliminar y lo
// convierte en UNA ecuación con UNA incógnita, y eso ya se sabe resolver de forma exacta y
// completa (`polinomio.ts`). La resultante es el teorema que lo permite: `Res_y(p, q)` es un
// polinomio SOLO en x que se anula exactamente en las x donde p y q comparten alguna raíz en y.
//
// Es lo contrario de lo que hacía el motor hasta ahora. Cruzar las polilíneas trazadas es
// preguntarle al DIBUJO dónde se tocan las curvas, y el dibujo solo sabe de la ventana que está
// mirando. La resultante no mira ninguna ventana: sale de los coeficientes, así que las
// soluciones de un sistema son las mismas con cualquier zoom, que es la propiedad que se venía
// a arreglar.

import {
  type Racional, CERO, UNO, esCero, rac, negado, producto, suma,
} from "./racional";
import {
  type Polinomio, NULO, dividir, esNulo, grado, normalizar, potenciaPol, productoPol,
  restaPol, sumaPol,
} from "./polinomio";

/** p(x,y) = Σⱼ coefY[j](x)·yʲ. Sin coeficientes nulos a la cabeza; el nulo es el array vacío. */
export type Polinomio2 = readonly Polinomio[];

export const NULO2: Polinomio2 = [];

export function normalizar2(p: Polinomio2): Polinomio2 {
  let n = p.length;
  while (n > 0 && esNulo(p[n - 1])) n--;
  return (n === p.length ? p : p.slice(0, n)).map(normalizar);
}

/** Grado en y (−1 en el nulo). */
export const gradoY = (p: Polinomio2): number => normalizar2(p).length - 1;

/** Grado en x: el mayor de los grados de sus coeficientes. */
export function gradoX(p: Polinomio2): number {
  let g = -1;
  for (const c of normalizar2(p)) g = Math.max(g, grado(c));
  return g;
}

export const esNulo2 = (p: Polinomio2): boolean => normalizar2(p).length === 0;

/** El polinomio constante `k`. */
export const constante2 = (k: Racional): Polinomio2 => (esCero(k) ? NULO2 : [[k]]);

/** La variable x. */
export const X2: Polinomio2 = [[CERO, UNO]];
/** La variable y. */
export const Y2: Polinomio2 = [NULO, [UNO]];

/** Un polinomio en x solo, visto como polinomio en las dos variables. */
export const desdeX = (p: Polinomio): Polinomio2 => (esNulo(p) ? NULO2 : [normalizar(p)]);

export function suma2(a: Polinomio2, b: Polinomio2): Polinomio2 {
  const out: Polinomio[] = [];
  for (let j = 0; j < Math.max(a.length, b.length); j++)
    out.push(sumaPol(a[j] ?? NULO, b[j] ?? NULO));
  return normalizar2(out);
}

export function resta2(a: Polinomio2, b: Polinomio2): Polinomio2 {
  const out: Polinomio[] = [];
  for (let j = 0; j < Math.max(a.length, b.length); j++)
    out.push(restaPol(a[j] ?? NULO, b[j] ?? NULO));
  return normalizar2(out);
}

export function producto2(a: Polinomio2, b: Polinomio2): Polinomio2 {
  const A = normalizar2(a), B = normalizar2(b);
  if (A.length === 0 || B.length === 0) return NULO2;
  const out: Polinomio[] = new Array<Polinomio>(A.length + B.length - 1).fill(NULO);
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++)
      out[i + j] = sumaPol(out[i + j], productoPol(A[i], B[j]));
  return normalizar2(out);
}

export function negado2(p: Polinomio2): Polinomio2 {
  return normalizar2(p.map((c) => c.map(negado)));
}

/** `p` elevado a un entero no negativo. */
export function potencia2(p: Polinomio2, k: number): Polinomio2 {
  let r: Polinomio2 = constante2(UNO);
  for (let i = 0; i < k; i++) r = producto2(r, p);
  return r;
}

/**
 * Sustituye y por un polinomio en x: devuelve p(x, f(x)), ya de una sola variable.
 *
 * Es el camino de una curva EXPLÍCITA contra cualquier otra: si una de las dos ecuaciones dice
 * y = f(x), meterla en la otra deja una ecuación en x sola, y ahí ya no hace falta la maquinaria
 * de la resultante. Sale más barato y —lo que importa más— más limpio: los coeficientes no
 * crecen como en un determinante.
 */
export function sustituirY(p: Polinomio2, f: Polinomio): Polinomio {
  const P = normalizar2(p);
  let acc: Polinomio = NULO;
  // Horner en y: menos productos y coeficientes más pequeños que expandir potencia a potencia.
  for (let j = P.length - 1; j >= 0; j--) acc = sumaPol(productoPol(acc, f), P[j]);
  return normalizar(acc);
}

/** Sustituye x por un valor racional: queda un polinomio en y (usado para recuperar las y de
 *  cada solución una vez conocida su x). */
export function sustituirX(p: Polinomio2, x: Racional): Polinomio {
  const P = normalizar2(p);
  const out: Racional[] = [];
  for (const c of P) {
    let acc = CERO;
    for (let i = c.length - 1; i >= 0; i--) acc = suma(producto(acc, x), c[i]);
    out.push(acc);
  }
  return normalizar(out);
}

/** Evaluación numérica en un punto, para verificar soluciones. */
export function evaluarNum2(p: Polinomio2, x: number, y: number): number {
  const P = normalizar2(p);
  let acc = 0;
  for (let j = P.length - 1; j >= 0; j--) {
    let cx = 0;
    const c = P[j];
    for (let i = c.length - 1; i >= 0; i--) cx = cx * x + Number(c[i].n) / Number(c[i].d);
    acc = acc * y + cx;
  }
  return acc;
}

// ── Resultante ────────────────────────────────────────────────────────────────────────────

/**
 * Resultante de `p` y `q` respecto de y: un polinomio SOLO en x que se anula exactamente en las
 * abscisas donde las dos curvas comparten un valor de y.
 *
 * Se calcula como el determinante de la matriz de SYLVESTER, cuyas entradas son polinomios en x.
 * El determinante se saca por **Bareiss** (eliminación sin fracciones) y no por Gauss: en Gauss
 * habría que dividir por el pivote en cada paso, y dividir polinomios generales deja restos —el
 * resultado dejaría de ser un polinomio a mitad de camino—. Bareiss está construido justo para
 * esto: cada división que hace está demostrado que es EXACTA dentro del anillo, así que todo el
 * cálculo se queda en ℚ[x] de principio a fin, sin aproximar en ningún paso.
 *
 * Devuelve el polinomio nulo cuando las dos curvas comparten un factor común (infinitas
 * soluciones: se tocan a lo largo de un tramo, no en puntos sueltos). Quien llama tiene que
 * distinguir ese caso, porque «resultante nula» no significa «ninguna solución» sino la
 * contraria.
 */
export function resultanteY(p: Polinomio2, q: Polinomio2): Polinomio {
  const A = normalizar2(p), B = normalizar2(q);
  const m = gradoY(A), n = gradoY(B);
  if (m < 0 || n < 0) return NULO;
  // Con alguno de grado 0 en y no hay nada que eliminar: la resultante es ese coeficiente
  // elevado al grado del otro (el convenio estándar, y el que hace que el caso degenerado
  // encaje con el general sin tratarlo aparte).
  if (m === 0) return potenciaPol(A[0], n);
  if (n === 0) return potenciaPol(B[0], m);

  // Matriz de Sylvester: n filas con los coeficientes de A desplazados, m filas con los de B.
  const dim = m + n;
  const M: Polinomio[][] = [];
  for (let i = 0; i < n; i++) {
    const fila: Polinomio[] = new Array<Polinomio>(dim).fill(NULO);
    for (let j = 0; j <= m; j++) fila[i + j] = A[m - j];
    M.push(fila);
  }
  for (let i = 0; i < m; i++) {
    const fila: Polinomio[] = new Array<Polinomio>(dim).fill(NULO);
    for (let j = 0; j <= n; j++) fila[i + j] = B[n - j];
    M.push(fila);
  }

  return determinanteBareiss(M, dim);
}

/**
 * Determinante de una matriz de polinomios por eliminación fraccionaria de Bareiss.
 *
 * El invariante del algoritmo es que tras el paso k todos los menores están divididos por el
 * pivote anterior, y esa división es exacta: por eso se usa `dividir(...).coc` sin mirar el
 * resto. Si alguna vez dejara resto, el resultado sería silenciosamente falso, así que la
 * división exacta no es una optimización sino la condición que sostiene el método.
 */
function determinanteBareiss(M: Polinomio[][], dim: number): Polinomio {
  let signoDet = 1;
  let anterior: Polinomio = [UNO];
  for (let k = 0; k < dim - 1; k++) {
    // Pivote nulo: se busca una fila por debajo con pivote no nulo. Sin ninguna, toda la columna
    // es cero y el determinante también.
    if (esNulo(M[k][k])) {
      let cambio = -1;
      for (let i = k + 1; i < dim; i++) if (!esNulo(M[i][k])) { cambio = i; break; }
      if (cambio === -1) return NULO;
      const t = M[k]; M[k] = M[cambio]; M[cambio] = t;
      signoDet = -signoDet;
    }
    for (let i = k + 1; i < dim; i++) {
      for (let j = k + 1; j < dim; j++) {
        const num = restaPol(productoPol(M[i][j], M[k][k]), productoPol(M[i][k], M[k][j]));
        M[i][j] = esNulo(anterior) ? num : dividir(num, anterior).coc;
      }
      M[i][k] = NULO;
    }
    anterior = M[k][k];
  }
  const det = M[dim - 1][dim - 1];
  return signoDet === 1 ? normalizar(det) : normalizar(det.map(negado));
}

/**
 * ¿Comparten `p` y `q` un factor no constante? Es la pregunta «¿se solapan en un tramo?», que es
 * un caso cualitativamente distinto de «se cruzan en varios puntos»: ahí las soluciones no son
 * una lista sino una curva entera, y enumerarlas no tiene sentido.
 *
 * Se responde por el contenido de la resultante: es nula exactamente cuando hay factor común
 * (con las dos curvas de grado ≥1 en y). El caso de dos curvas SIN y —dos rectas verticales, por
 * ejemplo— se mira aparte con el mcd en x, porque ahí la resultante no dice nada.
 */
export function compartenComponente(p: Polinomio2, q: Polinomio2): boolean {
  const A = normalizar2(p), B = normalizar2(q);
  if (esNulo2(A) || esNulo2(B)) return false;
  if (gradoY(A) === 0 && gradoY(B) === 0) {
    const { resto } = dividir(A[0], B[0]);
    return esNulo(resto) || esNulo(dividir(B[0], A[0]).resto);
  }
  if (gradoY(A) === 0 || gradoY(B) === 0) return false;
  return esNulo(resultanteY(A, B));
}

/** Texto plano, para pruebas y diagnóstico. */
export function aTexto2(p: Polinomio2): string {
  const P = normalizar2(p);
  if (P.length === 0) return "0";
  const partes: string[] = [];
  for (let j = P.length - 1; j >= 0; j--) {
    if (esNulo(P[j])) continue;
    const c = P[j].map((k) => (k.d === 1n ? String(k.n) : `${k.n}/${k.d}`));
    const enX = c.map((k, i) => (esCero(P[j][i]) ? "" : i === 0 ? k : i === 1 ? `${k}x` : `${k}x^${i}`))
      .filter((s) => s !== "").reverse().join(" + ");
    const envuelto = P[j].filter((k) => !esCero(k)).length > 1 ? `(${enX})` : enX;
    partes.push(j === 0 ? envuelto : j === 1 ? `${envuelto}y` : `${envuelto}y^${j}`);
  }
  return partes.join(" + ").replace(/\+ -/g, "- ");
}

/** Una entrada `y^j · x^i` con coeficiente, para construir polinomios en las pruebas. */
export function termino2(coef: Racional, i: number, j: number): Polinomio2 {
  if (esCero(coef)) return NULO2;
  const enX: Racional[] = new Array<Racional>(i + 1).fill(CERO);
  enX[i] = coef;
  const out: Polinomio[] = new Array<Polinomio>(j + 1).fill(NULO);
  out[j] = enX;
  return normalizar2(out);
}

export { rac as racional2, potencia2 as potenciaPolinomio2 };
