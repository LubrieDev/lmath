// ─────────────────────────────────────────────
// números · Algebraicos reales: (polinomio, intervalo aislante) (PURO)
// ─────────────────────────────────────────────
//
// La planta que le faltaba a la torre. Hasta ahora una cantidad exacta era un racional o, como
// mucho, un `a + b√d`; todo lo demás salía como decimal. `y = x³ − 2 ∩ y = 0` imprimía
// `1.2599210498948732` en vez de `∛2`, y no porque el motor no supiera calcularlo —lo calcula
// exacto, con Sturm— sino porque **no había ningún tipo en el que ∛2 pudiera viajar de vuelta**.
//
// ── La representación, y por qué es ESTA ─────────────────────────────────────────────────
// Un número algebraico real es la raíz de un polinomio de coeficientes racionales, y queda
// determinado sin ambigüedad por ese polinomio MÁS un intervalo que lo separe de las demás
// raíces. Nada de radicales anidados, nada de árboles de expresiones: un polinomio y un
// intervalo.
//
// La ventaja no es la elegancia, es que **la igualdad se puede decidir**. Con un árbol de
// radicales, «¿son iguales √(3+2√2) y 1+√2?» es una pregunta abierta; aquí es un cálculo con
// respuesta (ver `igualesA`). Un tipo cuya igualdad no se sabe decidir no sirve para deduplicar
// soluciones, ni para simplificar, ni para nada de lo que un CAS necesita hacer con un número.
//
// ── Lo que se REUTILIZA, que es casi todo ────────────────────────────────────────────────
// Este archivo no trae ni un algoritmo nuevo. Todo lo que hace ya estaba en el motor:
//
//   • `raicesReales` (polinomio.ts) YA devuelve intervalos aislantes por Sturm. Un `Algebraico`
//     es literalmente lo que ese algoritmo produce, dejado de ser un `double`.
//   • `raicesEnIntervalo` (Sturm) cuenta raíces en un intervalo, exacto. Con eso se refina y se
//     decide la igualdad.
//   • `mcdPol` da el máximo común divisor de dos polinomios, que es lo que convierte la igualdad
//     en una comprobación y no en una comparación de decimales.
//   • `resultanteY` (polinomio2.ts) es lo que permite SUMAR y MULTIPLICAR algebraicos: la suma
//     de dos algebraicos es raíz de `Res_y(P(y), Q(x−y))`, y el producto de `Res_y(P(y), yᵐQ(x/y))`.
//
// ── Dónde está la honestidad ─────────────────────────────────────────────────────────────
// Ni una operación pasa por coma flotante. Los intervalos tienen extremos RACIONALES exactos, el
// aislamiento cuenta raíces con Sturm y la elección de cuál de las raíces del resultante es la
// buena se hace por INCLUSIÓN de intervalos exactos, no por proximidad de decimales —que es por
// donde se cuela el error en las implementaciones ingenuas: dos raíces más juntas que un `double`
// harían elegir la equivocada, con toda la confianza del mundo—.

import {
  type Polinomio, type RaizReal,
  cotaCauchy, derivada, esNulo, evaluar, grado, libreDeCuadrados, mcdPol, normalizar,
  raicesEnIntervalo, raicesReales,
} from "../../math/polinomio";
import {
  type Polinomio2, NULO2, X2, Y2, constante2, potencia2, producto2, resta2, resultanteY, suma2,
} from "../../math/polinomio2";
import {
  type Racional, CERO, UNO, aNumero, comparar as compararRac, cociente, esCero,
  iguales as igualesRac, negado, producto, rac, resta, suma,
} from "../../math/racional";

/**
 * Un número algebraico real: la ÚNICA raíz de `polinomio` dentro de `(a, b]`.
 *
 * `polinomio` no tiene por qué ser el polinomio mínimo —factorizar sobre ℚ es caro y no hace
 * falta—: basta con que sea libre de cuadrados y que el intervalo aísle. Todas las operaciones
 * de aquí están escritas para no depender de la irreducibilidad, que es lo que permite no
 * pagarla.
 */
export interface Algebraico {
  readonly polinomio: Polinomio;
  readonly a: Racional;
  readonly b: Racional;
}

const DOS = rac(2n);
const medio = (a: Racional, b: Racional): Racional => cociente(suma(a, b), DOS);
const ancho = (v: Algebraico): Racional => resta(v.b, v.a);

// ─────────────────────────────────────────────
// Construcción
// ─────────────────────────────────────────────

/**
 * Las raíces reales de `p` como algebraicos, en orden creciente. Es el punto de entrada normal:
 * quien tenga un polinomio y quiera sus raíces exactas, las pide aquí.
 */
export function raicesAlgebraicas(p: Polinomio): Algebraico[] {
  const libre = libreDeCuadrados(p);
  if (grado(libre) < 1) return [];
  return raicesReales(libre).map((r: RaizReal) =>
    // Cuando `raicesReales` ya ha demostrado que la raíz es RACIONAL —lo hace por el teorema de
    // la raíz racional, exacto—, se guarda con su polinomio mínimo `x − q` en vez de con el
    // polinomio entero. Así el número se reconoce como racional aguas abajo (`racionalDe`) y
    // `x⁴ = 16` sale como `2` y no como `⁴√16`, que es el mismo número dicho peor.
    r.exacto !== null ? desdeRacional(r.exacto) : { polinomio: libre, a: r.a, b: r.b }
  );
}

/** El algebraico que representa un racional: raíz de `x − q`, en un intervalo que lo encierra. */
export function desdeRacional(q: Racional): Algebraico {
  return { polinomio: [negado(q), UNO], a: resta(q, UNO), b: q };
}

/** Si el algebraico es en realidad un racional, cuál. `null` si es irracional. */
export function racionalDe(v: Algebraico): Racional | null {
  // Un racional r es raíz de `polinomio` si `p(r) = 0`. Se busca entre las raíces racionales
  // dentro del intervalo, que son finitas y se calculan exactas.
  if (grado(v.polinomio) === 1) {
    const p = normalizar(v.polinomio);
    return cociente(negado(p[0]), p[1]);
  }
  return null;
}

// ─────────────────────────────────────────────
// Refinamiento
// ─────────────────────────────────────────────

/**
 * Estrecha el intervalo a la mitad, quedándose con la mitad donde vive la raíz. La decisión la
 * toma Sturm contando raíces, no el signo de una evaluación: un signo puede mentir cerca de una
 * raíz doble, y el conteo no.
 */
export function refinar(v: Algebraico): Algebraico {
  const m = medio(v.a, v.b);
  if (igualesRac(m, v.a) || igualesRac(m, v.b)) return v;      // ya no se puede partir más
  return raicesEnIntervalo(v.polinomio, v.a, m) === 1
    ? { polinomio: v.polinomio, a: v.a, b: m }
    : { polinomio: v.polinomio, a: m, b: v.b };
}

/** Refina hasta que el intervalo sea más estrecho que `eps`, o hasta agotar el presupuesto. */
export function refinarHasta(v: Algebraico, eps: Racional, maximo = 200): Algebraico {
  let r = v;
  for (let i = 0; i < maximo && compararRac(ancho(r), eps) > 0; i++) r = refinar(r);
  return r;
}

/** LA FRONTERA: el valor en coma flotante. Refina hasta el límite de un `double` y devuelve el
 *  centro. Es el único sitio de este archivo donde se pierde exactitud. */
export function aproximarA(v: Algebraico): number {
  const escala = Math.max(1, Math.abs(aNumero(v.a)), Math.abs(aNumero(v.b)));
  const eps = cociente(rac(BigInt(Math.ceil(escala))), rac(10n ** 18n));
  const r = refinarHasta(v, eps);
  return aNumero(medio(r.a, r.b));
}

// ─────────────────────────────────────────────
// Igualdad y orden
// ─────────────────────────────────────────────

/** La intersección de los dos intervalos, o `null` si no se solapan. */
function interseccion(u: Algebraico, v: Algebraico): { a: Racional; b: Racional } | null {
  const a = compararRac(u.a, v.a) >= 0 ? u.a : v.a;
  const b = compararRac(u.b, v.b) <= 0 ? u.b : v.b;
  return compararRac(a, b) < 0 ? { a, b } : null;
}

/**
 * ¿Son el mismo número? EXACTO, sin refinar y sin comparar decimales.
 *
 * El argumento cabe en tres líneas y es lo que hace que este tipo sirva para algo:
 *
 *   • sea `g = mcd(P, Q)`. Cualquier raíz común de P y Q es raíz de g, y al revés.
 *   • si g tiene una raíz r en la INTERSECCIÓN de los dos intervalos: como `g | P` y el intervalo
 *     de u aísla a u entre las raíces de P, esa r **es** u. Por lo mismo, r es v. Luego u = v.
 *   • y si u = v, ese valor común es raíz de g y está en los dos intervalos, luego en la
 *     intersección.
 *
 * Es una equivalencia, así que contar las raíces de g en la intersección —que Sturm hace exacto—
 * decide la pregunta. No hay tolerancia, no hay épsilon y no hay ningún caso en el que haya que
 * rendirse.
 */
export function igualesA(u: Algebraico, v: Algebraico): boolean {
  const inter = interseccion(u, v);
  if (inter === null) return false;
  const g = mcdPol(u.polinomio, v.polinomio);
  if (grado(g) < 1) return false;
  return raicesEnIntervalo(g, inter.a, inter.b) >= 1;
}

/**
 * Orden total sobre los algebraicos: −1, 0 o 1.
 *
 * Si no son iguales, los intervalos se refinan hasta separarse. Termina siempre porque dos
 * algebraicos distintos están a una distancia positiva, y cada refinamiento divide el ancho por
 * dos: en unos pocos cientos de pasos la separación se alcanza con muchísimo margen.
 */
export function compararA(u: Algebraico, v: Algebraico): -1 | 0 | 1 {
  if (igualesA(u, v)) return 0;
  let p = u, q = v;
  for (let i = 0; i < 400; i++) {
    if (compararRac(p.b, q.a) <= 0) return -1;
    if (compararRac(q.b, p.a) <= 0) return 1;
    p = refinar(p); q = refinar(q);
  }
  // Inalcanzable en la práctica; si se llegara, comparar los centros es lo más honesto que queda
  // y no puede afirmar una igualdad (que ya se ha descartado arriba).
  return compararRac(medio(p.a, p.b), medio(q.a, q.b)) < 0 ? -1 : 1;
}

// ─────────────────────────────────────────────
// Aritmética por resultantes
// ─────────────────────────────────────────────
//
// La suma y el producto de dos algebraicos son algebraicos, y el polinomio que los anula sale de
// una resultante. La parte delicada no es esa —es un teorema— sino ELEGIR cuál de las raíces del
// resultante es la que buscamos, porque el resultante tiene muchas más. Se hace con aritmética de
// intervalos EXACTOS: se calcula un intervalo que contiene con certeza al resultado, y se refinan
// los operandos hasta que ese intervalo contenga UNA sola raíz del resultante. Nunca se compara
// un decimal con otro.

/** `p(y)` visto como polinomio en (x, y): los coeficientes en x son constantes. */
const enY = (p: Polinomio): Polinomio2 => normalizar(p).map((c) => (esCero(c) ? [] : [c]));

/** `p(x − y)`, como polinomio en (x, y). */
function enXmenosY(p: Polinomio): Polinomio2 {
  const base = resta2(X2, Y2);
  let acc: Polinomio2 = NULO2;
  normalizar(p).forEach((c, k) => {
    if (esCero(c)) return;
    acc = suma2(acc, producto2(constante2(c), potencia2(base, k)));
  });
  return acc;
}

/** `yᵐ · p(x/y)` con m = grado(p), como polinomio en (x, y). Es `p` «homogeneizado», y es lo que
 *  convierte el producto de raíces en una resultante. */
function homogeneo(p: Polinomio): Polinomio2 {
  const q = normalizar(p);
  const m = q.length - 1;
  let acc: Polinomio2 = NULO2;
  q.forEach((c, k) => {
    if (esCero(c)) return;
    // término c·x^k·y^(m−k)
    acc = suma2(acc, producto2(constante2(c), producto2(potencia2(X2, k), potencia2(Y2, m - k))));
  });
  return acc;
}

/** Los cuatro productos de los extremos, para acotar un producto de intervalos. */
function intervaloProducto(u: Algebraico, v: Algebraico): { a: Racional; b: Racional } {
  const ps = [producto(u.a, v.a), producto(u.a, v.b), producto(u.b, v.a), producto(u.b, v.b)];
  let min = ps[0], max = ps[0];
  for (const p of ps) {
    if (compararRac(p, min) < 0) min = p;
    if (compararRac(p, max) > 0) max = p;
  }
  return { a: min, b: max };
}

/**
 * El algebraico que vive en `intervalo` y es raíz de `R`, refinando los operandos hasta que el
 * intervalo aísle una sola raíz. `null` si `R` es nulo o no se consigue aislar.
 */
function aislarEn(
  R: Polinomio, u: Algebraico, v: Algebraico,
  intervaloDe: (u: Algebraico, v: Algebraico) => { a: Racional; b: Racional }
): Algebraico | null {
  if (esNulo(R) || grado(R) < 1) return null;
  const libre = libreDeCuadrados(R);
  let p = u, q = v;
  for (let i = 0; i < 200; i++) {
    const iv = intervaloDe(p, q);
    // Se ensancha un pelo por la izquierda: `raicesEnIntervalo` cuenta en (a, b], y el resultado
    // podría caer justo en el extremo izquierdo del intervalo calculado.
    const a = resta(iv.a, cociente(UNO, rac(1n << 40n)));
    if (raicesEnIntervalo(libre, a, iv.b) === 1) return { polinomio: libre, a, b: iv.b };
    p = refinar(p); q = refinar(q);
  }
  return null;
}

/** `u + v`, exacto. `null` si no se consigue aislar (no debería ocurrir con entradas sanas). */
export function sumaA(u: Algebraico, v: Algebraico): Algebraico | null {
  const R = resultanteY(enY(u.polinomio), enXmenosY(v.polinomio));
  return aislarEn(R, u, v, (p, q) => ({ a: suma(p.a, q.a), b: suma(p.b, q.b) }));
}

/** `u · v`, exacto. */
export function productoA(u: Algebraico, v: Algebraico): Algebraico | null {
  const R = resultanteY(enY(u.polinomio), homogeneo(v.polinomio));
  return aislarEn(R, u, v, intervaloProducto);
}

/** `−u`, exacto y sin resultantes: si `p(x)` anula a u, `p(−x)` anula a −u. */
export function negadoA(u: Algebraico): Algebraico {
  const p = normalizar(u.polinomio).map((c, k) => (k % 2 === 0 ? c : negado(c)));
  return { polinomio: p, a: negado(u.b), b: negado(u.a) };
}

/** El signo del número: −1, 0 o 1, decidido con el intervalo y con Sturm, sin decimales. */
export function signoA(u: Algebraico): -1 | 0 | 1 {
  if (esCero(evaluar(u.polinomio, CERO)) && raicesEnIntervalo(u.polinomio, u.a, u.b) === 1) {
    // El 0 podría ser LA raíz aislada: solo lo es si está dentro del intervalo.
    if (compararRac(u.a, CERO) < 0 && compararRac(CERO, u.b) <= 0) {
      const izq = raicesEnIntervalo(u.polinomio, u.a, CERO);
      if (izq === 1) return 0;
    }
  }
  let r = u;
  for (let i = 0; i < 400; i++) {
    if (compararRac(r.a, CERO) >= 0) return 1;
    if (compararRac(r.b, CERO) <= 0) return -1;
    r = refinar(r);
  }
  return 0;
}

// ─────────────────────────────────────────────
// Forma cerrada
// ─────────────────────────────────────────────

/**
 * Si el algebraico es una raíz n-ésima de un racional (`∛2`, `√5`, `⁵√7`), devuelve el par
 * (radicando, índice) y el signo. `null` si su polinomio no es de la forma `xⁿ − c`.
 *
 * No es un caso especial disfrazado: es la familia entera de los polinomios binomios, que es
 * exactamente la que tiene forma cerrada con un solo radical. Lo que quede fuera se queda sin
 * forma cerrada, y eso es una respuesta —el número sigue siendo exacto y operable, solo que se
 * escribe como lo que es: la raíz de un polinomio—.
 */
export function comoRadical(v: Algebraico): { radicando: Racional; indice: number; signo: -1 | 1 } | null {
  const p = normalizar(v.polinomio);
  const n = p.length - 1;
  if (n < 2) return null;
  for (let i = 1; i < n; i++) if (!esCero(p[i])) return null;
  if (esCero(p[n]) || esCero(p[0])) return null;
  const radicando = cociente(negado(p[0]), p[n]);
  const signo = signoA(v);
  if (signo === 0) return null;
  return { radicando, indice: n, signo };
}

/** Cota superior del valor absoluto, útil para quien tenga que reservar espacio o decidir si un
 *  número es «enorme» sin evaluarlo. */
export const cotaDe = (v: Algebraico): Racional => cotaCauchy(v.polinomio);

/** Verificación interna: ¿el intervalo aísla de verdad UNA raíz? Lo usan las pruebas para
 *  comprobar que ninguna operación devuelve un algebraico mal formado. */
export const bienFormado = (v: Algebraico): boolean =>
  compararRac(v.a, v.b) < 0 &&
  grado(v.polinomio) >= 1 &&
  raicesEnIntervalo(v.polinomio, v.a, v.b) === 1 &&
  !esNulo(derivada(v.polinomio));
