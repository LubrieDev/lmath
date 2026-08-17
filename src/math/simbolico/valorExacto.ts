// ─────────────────────────────────────────────
// simbólico · Números algebraicos de grado ≤ 2 (PURO)
// ─────────────────────────────────────────────
//
// El tipo con el que el motor deja de tirar información. Hasta ahora una coordenada exacta era
// un `Racional` o nada: `x = 0` y `x = 3/2` se escribían como lo que son, y `x = (7−√13)/2` se
// escribía `1.6972243622680054`. Ese decimal no es una respuesta peor por tener menos cifras: es
// una respuesta de otra clase. El número exacto se puede sumar, comparar y reconocer; el decimal
// solo se puede mirar.
//
// ── Por qué EXACTAMENTE este alcance ──────────────────────────────────────────────────────
// Se representa `a + b√d` con a, b ∈ ℚ y d entero libre de cuadrados. Ni menos ni más, y las
// dos fronteras están elegidas:
//
//   • **Ni menos.** Es el conjunto de las raíces de las ecuaciones de segundo grado con
//     coeficientes racionales, que es de lejos lo que más aparece: la sección áurea (1+√5)/2,
//     las diagonales √2, los cortes de una recta con una cónica, y toda raíz irracional que un
//     sistema polinómico produzca cuando su polinomio eliminado tiene un factor cuadrático.
//   • **Ni más.** ℚ(√d) es un CUERPO: cerrado para +, −, × y ÷, con igualdad decidible y forma
//     canónica única. Un tipo más ambicioso (un árbol de radicales anidados, √2+√3, una raíz
//     cúbica) deja de tener forma canónica, y entonces «¿son iguales estos dos valores?» pasa a
//     ser un problema abierto en vez de una comparación. El motor prefiere una frontera nítida
//     que sabe defender a una promesa que no sabría cumplir.
//
// Fuera de esa frontera se devuelve `null`, que quiere decir «este valor no lo sé escribir
// exactamente», y quien llama enseña el decimal. Nunca se finge.
//
// ── La forma canónica ─────────────────────────────────────────────────────────────────────
// Un valor está en forma canónica cuando `d` es libre de cuadrados y mayor que 1, o cuando
// `b = 0` y `d = 1` (el caso racional). De ahí salen solas las reescrituras que un CAS debe
// hacer y que aquí no son casos especiales sino consecuencia de construir el valor:
//
//     √8       → 2√2          (se extrae el factor cuadrado del radicando)
//     1/√2     → √2/2         (se racionaliza el denominador al dividir)
//     √9       → 3            (deja de ser irracional y `b` cae a 0)
//     √(4/9)   → 2/3          (el radicando racional se lleva a entero y se reduce)
//
// ── Igualdad ──────────────────────────────────────────────────────────────────────────────
// Con la forma canónica, dos valores son iguales si y solo si sus tres campos coinciden. No hace
// falta comparar decimales, que es justo lo que permite deduplicar soluciones sin tolerancia.

import {
  type Racional, CERO, UNO, aNumero, aTexto, cociente, esCero, iguales, negado, producto, rac,
  resta, signo, suma,
} from "../racional";

/**
 * `a + b·√d`, con `d` entero libre de cuadrados.
 *
 * INVARIANTE (lo garantizan los constructores, no hay otra forma de crear uno): o bien `b = 0`
 * y `d = 1` —el valor es racional—, o bien `b ≠ 0` y `d > 1` libre de cuadrados —el valor es
 * irracional—. Nunca `d = 0`, nunca `d` negativo (sería complejo), nunca `√4`.
 */
export interface ValorExacto {
  readonly a: Racional;
  readonly b: Racional;
  readonly d: bigint;
}

/** Radicando máximo que se intenta reducir. Extraer los factores cuadrados de un entero exige
 *  tantearlo hasta su raíz; por encima de esto el tanteo dejaría de ser instantáneo y el valor
 *  se declara no representable, que es preferible a un panel que se para. */
const RADICANDO_MAXIMO = 1n << 40n;

/** Raíz entera de un bigint no negativo (Newton sobre enteros), o `null` si no es un cuadrado
 *  perfecto. Se necesita en enteros y no en coma flotante: con 15 dígitos, `Math.sqrt` ya no
 *  distingue un cuadrado perfecto de su vecino. */
export function raizEntera(n: bigint): bigint | null {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x * x === n ? x : null;
}

/** El mayor `k` tal que `k²` divide a `n`, y el resto libre de cuadrados. `√48 = 4√3` sale de
 *  aquí como `{ fuera: 4n, dentro: 3n }`. */
function extraerCuadrado(n: bigint): { fuera: bigint; dentro: bigint } {
  let dentro = n, fuera = 1n;
  // Los cuadrados perfectos se resuelven de un golpe (el caso más común: √4, √9, √144).
  const r = raizEntera(dentro);
  if (r !== null) return { fuera: r, dentro: 1n };
  for (let k = 2n; k * k <= dentro; k++) {
    const k2 = k * k;
    while (dentro % k2 === 0n) { dentro /= k2; fuera *= k; }
  }
  return { fuera, dentro };
}

/** Un racional como valor exacto. */
export function exacto(r: Racional): ValorExacto {
  return { a: r, b: CERO, d: 1n };
}

export const CERO_E = exacto(CERO);

/** `a + b·√(radicando)`, ya en forma canónica, o `null` si no es un real representable.
 *
 *  El radicando llega como RACIONAL porque de ahí lo saca la fórmula cuadrática (`b²−4ac` con
 *  coeficientes fraccionarios): `√(p/q) = √(pq)/q` lo lleva a entero sin perder nada. */
export function raizDe(a: Racional, b: Racional, radicando: Racional): ValorExacto | null {
  if (signo(radicando) < 0) return null;               // complejo: no es un punto del plano
  if (esCero(radicando) || esCero(b)) return exacto(a);

  // √(p/q) = √(p·q)/q  (con q > 0, que es el invariante de `rac`).
  const p = radicando.n * radicando.d;
  const q = radicando.d;
  if (p > RADICANDO_MAXIMO) return null;

  const { fuera, dentro } = extraerCuadrado(p);
  const coef = producto(b, rac(fuera, q));
  if (dentro === 1n) return exacto(suma(a, coef));      // el radical se ha ido: era racional
  if (esCero(coef)) return exacto(a);
  return { a, b: coef, d: dentro };
}

/** `√(radicando)` como valor exacto, o `null`. */
export const raizCuadrada = (radicando: Racional): ValorExacto | null =>
  raizDe(CERO, UNO, radicando);

export const esRacionalE = (v: ValorExacto): boolean => esCero(v.b);

/** El racional que es este valor, o `null` si de verdad es irracional. */
export const racionalDe = (v: ValorExacto): Racional | null => (esCero(v.b) ? v.a : null);

export const aNumeroE = (v: ValorExacto): number =>
  aNumero(v.a) + (esCero(v.b) ? 0 : aNumero(v.b) * Math.sqrt(Number(v.d)));

/** Igualdad EXACTA (no numérica): la forma canónica la hace una comparación de campos. */
export const igualesE = (u: ValorExacto, v: ValorExacto): boolean =>
  iguales(u.a, v.a) && iguales(u.b, v.b) && (esCero(u.b) || u.d === v.d);

// ─────────────────────────────────────────────
// Aritmética del cuerpo ℚ(√d)
// ─────────────────────────────────────────────
//
// Todas las operaciones devuelven `null` cuando el resultado se saldría del alcance, y hay
// exactamente una manera de salirse: mezclar DOS radicales distintos (√2 · √3 = √6 sería
// representable, pero √2 + √3 no lo es, y admitir uno sin el otro rompería la clausura que hace
// fiable a este tipo). Un operando racional convive con cualquier radical, que es lo que permite
// evaluar un polinomio de coeficientes racionales en un irracional.

/** El radicando común de dos valores, o `null` si son dos radicales distintos. */
function radicandoComun(u: ValorExacto, v: ValorExacto): bigint | null {
  if (esCero(u.b)) return v.d;
  if (esCero(v.b)) return u.d;
  return u.d === v.d ? u.d : null;
}

export function sumaE(u: ValorExacto, v: ValorExacto): ValorExacto | null {
  const d = radicandoComun(u, v);
  if (d === null) return null;
  const b = suma(u.b, v.b);
  return esCero(b) ? exacto(suma(u.a, v.a)) : { a: suma(u.a, v.a), b, d };
}

const negadoE = (v: ValorExacto): ValorExacto =>
  esCero(v.b) ? exacto(negado(v.a)) : { a: negado(v.a), b: negado(v.b), d: v.d };

export const restaE = (u: ValorExacto, v: ValorExacto): ValorExacto | null => sumaE(u, negadoE(v));

export function productoE(u: ValorExacto, v: ValorExacto): ValorExacto | null {
  const d = radicandoComun(u, v);
  if (d === null) return null;
  // (a₁ + b₁√d)(a₂ + b₂√d) = (a₁a₂ + b₁b₂·d) + (a₁b₂ + b₁a₂)√d
  const a = suma(producto(u.a, v.a), producto(producto(u.b, v.b), rac(d)));
  const b = suma(producto(u.a, v.b), producto(u.b, v.a));
  return esCero(b) ? exacto(a) : { a, b, d };
}

/**
 * `u / v`, racionalizando el denominador con el CONJUGADO.
 *
 * `1/(a+b√d) = (a−b√d)/(a²−b²d)`: el denominador se vuelve racional y el resultado vuelve a
 * estar en forma canónica. Es lo que hace que `1/√2` se muestre como `√2/2` sin ninguna regla
 * dedicada a ese caso: es la definición de dividir en este cuerpo.
 */
export function cocienteE(u: ValorExacto, v: ValorExacto): ValorExacto | null {
  if (esCero(v.a) && esCero(v.b)) return null;         // división por cero
  const d = radicandoComun(u, v);
  if (d === null) return null;
  if (esCero(v.b)) {
    const a = cociente(u.a, v.a), b = cociente(u.b, v.a);
    return esCero(b) ? exacto(a) : { a, b, d: u.d };
  }
  const norma = resta(producto(v.a, v.a), producto(producto(v.b, v.b), rac(d)));
  if (esCero(norma)) return null;                      // no puede pasar con d libre de cuadrados
  const conjugado: ValorExacto = { a: v.a, b: negado(v.b), d };
  const num = productoE(u, conjugado);
  if (num === null) return null;
  const a = cociente(num.a, norma), b = cociente(num.b, norma);
  return esCero(b) ? exacto(a) : { a, b, d };
}

// ─────────────────────────────────────────────
// Presentación
// ─────────────────────────────────────────────
//
// El valor se escribe con UN solo trazo de fracción, no con dos: `(7 − √13)/2`, no
// `7/2 − √13/2`. Es la forma en que se escribe a mano y la que deja ver de un vistazo que las
// dos partes comparten denominador. Sale de llevar `a` y `b` a denominador común.

/** El monomio `b√d` (sin signo): `√13`, `2√3`, `√5/2`. */
function radicalATexto(b: Racional, d: bigint, raiz: string): string {
  const n = b.n < 0n ? -b.n : b.n;
  const cuerpo = n === 1n ? `${raiz}${d}` : `${n}${raiz}${d}`;
  return b.d === 1n ? cuerpo : `${cuerpo}/${b.d}`;
}

/** Texto plano del valor: `3/2`, `2√2`, `(7 - √13)/2`, `-√5/2`. */
export function aTextoE(v: ValorExacto): string {
  return escribir(v, "√", "-");
}

/** La fracción, con el signo FUERA: `-\frac{3}{2}`, nunca `\frac{-3}{2}`. */
function fraccionLatex(n: bigint, d: bigint): string {
  if (d === 1n) return String(n);
  return n < 0n ? `-\\frac{${-n}}{${d}}` : `\\frac{${n}}{${d}}`;
}

/**
 * LaTeX del valor: `\frac{7 - \sqrt{13}}{2}`, `-\frac{3\sqrt{2}}{2}`, `2\sqrt{2}`.
 *
 * El signo va SIEMPRE fuera de la fracción cuando puede salir —es decir, cuando el numerador
 * entero es negativo o cuando lo son sus dos términos—, que es la convención del resto del
 * plugin (`numeroALatex`, la derivada de `1/x` como `-\frac{1}{x^2}`) y como se escribe a
 * mano. Un `\frac{-7 - \sqrt{13}}{2}` es correcto y se lee peor.
 */
export function aLatexE(v: ValorExacto): string {
  if (esCero(v.b)) return fraccionLatex(v.a.n, v.a.d);
  const den = lcm(v.a.d, v.b.d);
  // Los DOS términos negativos → el menos no es de un sumando, es del valor entero: sale
  // delante y dentro queda una SUMA (`-(7 + √13)/2`), que es una resta menos que leer.
  const fuera = v.a.n <= 0n && v.b.n < 0n;
  const s = fuera ? -1n : 1n;
  const na = s * v.a.n * (den / v.a.d);
  const nb = s * v.b.n * (den / v.b.d);
  const abs = nb < 0n ? -nb : nb;
  const radical = abs === 1n ? `\\sqrt{${v.d}}` : `${abs}\\sqrt{${v.d}}`;

  // Con los signos ya repartidos quedan tres numeradores posibles, y el orden de los términos
  // se elige para que el primero NO sea negativo: `√13 - 7` en vez de `-7 + √13`, que empieza
  // por un menos que no es el signo del valor.
  // (Aquí `nb` ya no puede ser negativo con `na` ≤ 0: ese caso es justo el que sacó el signo.)
  const cuerpo = na === 0n ? radical
    : na < 0n ? `${radical} - ${-na}`
    : `${na} ${nb < 0n ? "-" : "+"} ${radical}`;

  const nucleo = den === 1n ? cuerpo : `\\frac{${cuerpo}}{${den}}`;
  return `${fuera ? "-" : ""}${nucleo}`;
}

const lcm = (a: bigint, b: bigint): bigint => (a / mcd(a, b)) * b;
function mcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a, y = b < 0n ? -b : b;
  while (y) { const t = x % y; x = y; y = t; }
  return x;
}

function escribir(v: ValorExacto, raiz: string, menos: string): string {
  if (esCero(v.b)) return aTexto(v.a).replace("-", menos);
  if (esCero(v.a)) {
    const cuerpo = radicalATexto(v.b, v.d, raiz);
    return v.b.n < 0n ? `${menos}${cuerpo}` : cuerpo;
  }
  // Denominador común: `(7 - √13)/2` en vez de `7/2 - √13/2`.
  const den = lcm(v.a.d, v.b.d);
  const na = v.a.n * (den / v.a.d);
  const nb = v.b.n * (den / v.b.d);
  const abs = nb < 0n ? -nb : nb;
  const radical = abs === 1n ? `${raiz}${v.d}` : `${abs}${raiz}${v.d}`;
  const cuerpo = `${na} ${nb < 0n ? menos : "+"} ${radical}`;
  return den === 1n ? cuerpo : `(${cuerpo})/${den}`;
}
