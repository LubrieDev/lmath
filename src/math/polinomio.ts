// ─────────────────────────────────────────────
// mate · Polinomios de UNA variable sobre ℚ (PURO)
// ─────────────────────────────────────────────
//
// Un polinomio es un array de coeficientes racionales EXACTOS, del término independiente hacia
// arriba: `[−2, 0, 1]` es x²−2. Sobre esa representación se construye lo único que este motor
// necesita de verdad: **contar y localizar las raíces reales sin equivocarse nunca**.
//
// ── Por qué Sturm y no «buscar cambios de signo» ──────────────────────────────────────────
// Muestrear y mirar dónde cambia el signo es rápido, es lo que hace `analisis.ts` para el panel
// de una f(x) cualquiera, y tiene un fallo que aquí no es aceptable: **no sabe lo que no ha
// visto**. Dos raíces más juntas que el paso de muestreo se pierden las dos (el signo entra y
// sale entre dos muestras), y una raíz doble no cambia el signo en absoluto, así que es
// invisible por construcción. El resultado no es «poco preciso»: es una respuesta segura y
// equivocada, que es peor.
//
// La sucesión de Sturm responde a otra pregunta, y la responde con una demostración detrás: el
// TEOREMA DE STURM dice que, para un polinomio sin raíces múltiples, el número de raíces reales
// en (a, b] es exactamente la diferencia de cambios de signo de la sucesión evaluada en a y en
// b. No una estimación: el número. Con eso, bisecar un intervalo hasta que contenga una sola
// raíz es un procedimiento que TERMINA y que no puede saltarse ninguna, por juntas que estén.
//
// Y funciona porque toda la sucesión se calcula en aritmética exacta: en coma flotante los
// restos sucesivos pierden dígitos y el conteo de cambios de signo —que es lo único que importa—
// empieza a mentir cerca de las raíces dobles, justo donde se le necesita.
//
// ── El reparto con el resto del motor ─────────────────────────────────────────────────────
// Aquí no se lee LaTeX ni se sabe qué es una ecuación: eso es `extraer.ts`. Aquí no se decide
// qué hacer con dos curvas: eso es `resolverSistema.ts`. Este módulo solo sabe de polinomios.

import {
  type Racional, CERO, UNO, rac, aNumero, absoluto, comparar, cociente, esCero, negado,
  potencia, producto, resta, signo, suma,
} from "./racional";

/** Coeficientes de menor a mayor grado; sin ceros a la cabeza salvo el polinomio nulo, que es
 *  el array vacío. `[]` = 0, `[3]` = 3, `[-2, 0, 1]` = x²−2. */
export type Polinomio = readonly Racional[];

export const NULO: Polinomio = [];

/** Retira los ceros de cabeza: es lo que mantiene «grado» bien definido y hace que dos
 *  polinomios iguales tengan la misma representación. */
export function normalizar(p: Polinomio): Polinomio {
  let n = p.length;
  while (n > 0 && esCero(p[n - 1])) n--;
  return n === p.length ? p : p.slice(0, n);
}

/** Grado, con −1 para el polinomio nulo (así `grado(a) < grado(b)` ordena bien con el nulo). */
export const grado = (p: Polinomio): number => normalizar(p).length - 1;

export const esNulo = (p: Polinomio): boolean => normalizar(p).length === 0;

/** Coeficiente principal, o cero en el polinomio nulo. */
export function principal(p: Polinomio): Racional {
  const q = normalizar(p);
  return q.length === 0 ? CERO : q[q.length - 1];
}

export function sumaPol(a: Polinomio, b: Polinomio): Polinomio {
  const out: Racional[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    out.push(suma(a[i] ?? CERO, b[i] ?? CERO));
  return normalizar(out);
}

export function restaPol(a: Polinomio, b: Polinomio): Polinomio {
  const out: Racional[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    out.push(resta(a[i] ?? CERO, b[i] ?? CERO));
  return normalizar(out);
}

export function productoPol(a: Polinomio, b: Polinomio): Polinomio {
  const A = normalizar(a), B = normalizar(b);
  if (A.length === 0 || B.length === 0) return NULO;
  const out: Racional[] = new Array<Racional>(A.length + B.length - 1).fill(CERO);
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++)
      out[i + j] = suma(out[i + j], producto(A[i], B[j]));
  return normalizar(out);
}

/** Multiplica por un escalar racional. */
export function escalarPol(p: Polinomio, k: Racional): Polinomio {
  if (esCero(k)) return NULO;
  return normalizar(p.map((c) => producto(c, k)));
}

/** Derivada formal. Exacta, como todo lo demás: es la que localiza raíces múltiples. */
export function derivada(p: Polinomio): Polinomio {
  const q = normalizar(p);
  if (q.length <= 1) return NULO;
  const out: Racional[] = [];
  for (let i = 1; i < q.length; i++) out.push(producto(q[i], rac(BigInt(i))));
  return normalizar(out);
}

/** Evaluación EXACTA en un racional, por Horner (menos operaciones y menos crecimiento de los
 *  denominadores que expandir potencia a potencia). */
export function evaluar(p: Polinomio, x: Racional): Racional {
  const q = normalizar(p);
  let acc = CERO;
  for (let i = q.length - 1; i >= 0; i--) acc = suma(producto(acc, x), q[i]);
  return acc;
}

/** Evaluación en coma flotante, para el refinado final y para verificar. */
export function evaluarNum(p: Polinomio, x: number): number {
  const q = normalizar(p);
  let acc = 0;
  for (let i = q.length - 1; i >= 0; i--) acc = acc * x + aNumero(q[i]);
  return acc;
}

/** División con resto: `a = cociente·b + resto`, con `grado(resto) < grado(b)`. Lanza con `b`
 *  nulo, que no es un divisor. */
export function dividir(a: Polinomio, b: Polinomio): { coc: Polinomio; resto: Polinomio } {
  const B = normalizar(b);
  if (B.length === 0) throw new Error("división polinómica por el polinomio nulo");
  let R = [...normalizar(a)];
  const gb = B.length - 1;
  const lb = B[gb];
  const coc: Racional[] = [];
  while (R.length - 1 >= gb && R.length > 0) {
    const gr = R.length - 1;
    const factor = cociente(R[gr], lb);
    coc[gr - gb] = factor;
    for (let i = 0; i <= gb; i++)
      R[gr - gb + i] = resta(R[gr - gb + i], producto(factor, B[i]));
    R = [...normalizar(R)];
  }
  for (let i = 0; i < coc.length; i++) coc[i] = coc[i] ?? CERO;
  return { coc: normalizar(coc), resto: normalizar(R) };
}

/**
 * Máximo común divisor MÓNICO (Euclides sobre polinomios).
 *
 * Se normaliza a mónico en cada paso, y no por elegancia: sin ello los coeficientes de los
 * restos sucesivos crecen de forma explosiva —es el fenómeno clásico de la «explosión de
 * coeficientes»—, y con bigint eso no da un resultado malo, da una espera larga.
 */
export function mcdPol(a: Polinomio, b: Polinomio): Polinomio {
  let A = normalizar(a), B = normalizar(b);
  while (B.length > 0) {
    const { resto } = dividir(A, B);
    A = B;
    B = normalizar(resto);
  }
  if (A.length === 0) return NULO;
  return monico(A);
}

/** El polinomio dividido por su coeficiente principal (coeficiente principal = 1). */
export function monico(p: Polinomio): Polinomio {
  const q = normalizar(p);
  if (q.length === 0) return NULO;
  const lc = q[q.length - 1];
  return q.map((c) => cociente(c, lc));
}

/**
 * La parte LIBRE DE CUADRADOS: el mismo polinomio con cada raíz una sola vez.
 *
 * `p / gcd(p, p')` es la receta clásica, y su razón de estar aquí es que Sturm EXIGE raíces
 * simples. Además arregla de paso el caso que más despista al muestreo: una raíz doble como la
 * de `(x−1)²` no cambia el signo de p, así que ningún barrido la ve; dividida por el gcd pasa a
 * ser simple y Sturm la cuenta como cualquier otra.
 */
export function libreDeCuadrados(p: Polinomio): Polinomio {
  const q = normalizar(p);
  if (q.length <= 1) return q;
  const g = mcdPol(q, derivada(q));
  if (grado(g) <= 0) return monico(q);
  return monico(dividir(q, g).coc);
}

// ── Sturm ─────────────────────────────────────────────────────────────────────────────────

/**
 * La sucesión de Sturm de un polinomio LIBRE DE CUADRADOS: p, p', y luego el NEGATIVO del resto
 * de cada división, hasta llegar a una constante.
 *
 * El signo cambiado del resto es lo que hace funcionar el teorema (convierte la sucesión en una
 * cadena cuyos cambios de signo solo pueden perderse al cruzar una raíz de p), y es también el
 * único detalle que se escribe mal con facilidad, así que queda dicho aquí.
 */
export function sucesionSturm(p: Polinomio): Polinomio[] {
  const p0 = normalizar(p);
  if (p0.length === 0) return [];
  const suc: Polinomio[] = [p0];
  const p1 = derivada(p0);
  if (esNulo(p1)) return suc;               // constante: no hay más cadena
  suc.push(p1);
  // Cota de seguridad: la cadena decrece en grado en cada paso, así que `grado+2` la cubre
  // entera. El tope existe para que un error aritmético no se convierta en un bucle infinito
  // dentro de Obsidian, que es un fallo mucho peor que devolver de menos.
  for (let k = 0; k < p0.length + 2; k++) {
    const a = suc[suc.length - 2], b = suc[suc.length - 1];
    if (grado(b) <= 0) break;
    const { resto } = dividir(a, b);
    if (esNulo(resto)) break;
    suc.push(normalizar(resto.map(negado)));
  }
  return suc;
}

/** Cambios de signo de la sucesión evaluada en `x` (los ceros no cuentan: se saltan). */
function cambiosDeSigno(suc: readonly Polinomio[], x: Racional): number {
  let previo = 0, cambios = 0;
  for (const q of suc) {
    const s = signo(evaluar(q, x));
    if (s === 0) continue;
    if (previo !== 0 && s !== previo) cambios++;
    previo = s;
  }
  return cambios;
}

/**
 * Número EXACTO de raíces reales distintas de `p` en el intervalo (a, b].
 *
 * «Exacto» aquí es literal y demostrado, no una manera de hablar: es el teorema de Sturm. De él
 * cuelga todo lo demás —el aislamiento biseca fiándose de este número—, así que si esta función
 * fuera aproximada, todo el módulo lo sería.
 */
export function raicesEnIntervalo(p: Polinomio, a: Racional, b: Racional): number {
  const q = libreDeCuadrados(p);
  if (grado(q) < 1) return 0;
  const suc = sucesionSturm(q);
  return Math.max(0, cambiosDeSigno(suc, a) - cambiosDeSigno(suc, b));
}

/**
 * Cota de Cauchy: TODA raíz real (y compleja) cumple |x| < 1 + max|aᵢ/aₙ|.
 *
 * Es lo que hace que este motor no dependa de ninguna ventana. El buscador de raíces por
 * muestreo tiene que elegir un rango —`analisis.ts` usa [−10, 10], y una raíz en x=12 sencillamente
 * no existe para él—; aquí el rango lo dicta el POLINOMIO. Fuera de esta cota está demostrado
 * que no hay nada, así que buscar dentro de ella es buscar en todo ℝ.
 */
export function cotaCauchy(p: Polinomio): Racional {
  const q = normalizar(p);
  if (q.length <= 1) return UNO;
  const lc = q[q.length - 1];
  let max = CERO;
  for (let i = 0; i < q.length - 1; i++) {
    const c = absoluto(cociente(q[i], lc));
    if (comparar(c, max) > 0) max = c;
  }
  return suma(UNO, max);
}

/** Una raíz real aislada: el intervalo racional que la contiene, y su valor ya refinado. */
export interface RaizReal {
  /** Extremos racionales exactos con UNA sola raíz dentro. */
  readonly a: Racional;
  readonly b: Racional;
  /** El valor en coma flotante, refinado hasta donde el doble da de sí. */
  readonly valor: number;
  /** El valor EXACTO, cuando la raíz resulta ser racional (`x=0`, `x=3/2`). `null` si es
   *  irracional: entonces el intervalo es toda la verdad que hay. */
  readonly exacto: Racional | null;
}

/** Cuántas bisecciones se hacen antes de dar por aislada una raíz. 200 bisecciones estrechan el
 *  intervalo por 2⁻²⁰⁰, muchísimo más de lo que un `double` distingue: el tope solo existe para
 *  que una patología no cuelgue la nota. */
const MAX_BISECCIONES = 200;

/**
 * Las raíces racionales EXACTAS, por el teorema de la raíz racional: si p/q es raíz de un
 * polinomio de coeficientes enteros, p divide al término independiente y q al principal.
 *
 * Existe para que `x = 0`, `x = 1` y `x = 3/2` salgan como lo que son y no como
 * `0.9999999999999998`. Es exactamente el defecto que se está corrigiendo: en el sistema
 * `y = Ax` ∩ `y = x²` las dos soluciones son racionales, y decirlas con un error de 1e-6 fue lo
 * que hizo que la solución cambiara al mover el plano.
 *
 * Se limita a polinomios con pocos divisores: enumerar los de un coeficiente enorme cuesta más
 * que bisecar, y el aislamiento numérico ya cubre ese caso sin equivocarse (solo sin poder
 * decir «esto es exactamente 3/2»).
 */
function raicesRacionales(p: Polinomio): Racional[] {
  const q = normalizar(p);
  if (q.length < 2) return [];
  // A coeficientes ENTEROS: se multiplica por el mcm de los denominadores. No cambia las raíces
  // y es lo que exige el teorema.
  let mcm = 1n;
  for (const c of q) mcm = (mcm * c.d) / mcdEnteros(mcm, c.d);
  const enteros = q.map((c) => (c.n * mcm) / c.d);
  const a0 = enteros[0] < 0n ? -enteros[0] : enteros[0];
  const an = enteros[enteros.length - 1] < 0n ? -enteros[enteros.length - 1] : enteros[enteros.length - 1];
  // Con el término independiente nulo, 0 ES raíz y el resto sale de dividir por x.
  if (a0 === 0n) {
    const sinX = normalizar(q.slice(1));
    return [CERO, ...raicesRacionales(sinX)];
  }
  const TOPE = 100000n;
  if (a0 > TOPE || an > TOPE) return [];
  const divisores = (n: bigint): bigint[] => {
    const out: bigint[] = [];
    for (let d = 1n; d * d <= n; d++) {
      if (n % d === 0n) { out.push(d); if (d * d !== n) out.push(n / d); }
    }
    return out;
  };
  const out: Racional[] = [];
  for (const dp of divisores(a0)) {
    for (const dq of divisores(an)) {
      for (const s of [1n, -1n]) {
        const cand = rac(s * dp, dq);
        if (esCero(evaluar(q, cand)) && !out.some((r) => comparar(r, cand) === 0)) out.push(cand);
      }
    }
  }
  return out;
}

function mcdEnteros(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a, y = b < 0n ? -b : b;
  while (y) { const t = x % y; x = y; y = t; }
  return x;
}

/**
 * TODAS las raíces reales de un polinomio, aisladas y ordenadas de menor a mayor.
 *
 * «Todas» es literal, y es la diferencia con cualquier método por muestreo: el intervalo de
 * partida es la cota de Cauchy (fuera no hay ninguna, demostrado) y la bisección se guía por el
 * conteo de Sturm (exacto), así que ninguna raíz puede quedar fuera por estar demasiado junta a
 * otra, ni por ser doble, ni por caer lejos del origen.
 */
export function raicesReales(p: Polinomio): RaizReal[] {
  const libre = libreDeCuadrados(p);
  if (grado(libre) < 1) return [];

  const exactas = raicesRacionales(libre);
  const suc = sucesionSturm(libre);
  const cota = cotaCauchy(libre);
  const total = Math.max(0, cambiosDeSigno(suc, negado(cota)) - cambiosDeSigno(suc, cota));
  if (total === 0) return [];

  // Bisección guiada por Sturm: un intervalo con más de una raíz se parte; con exactamente una,
  // se aísla. La cola se procesa entera, así que el orden de salida no depende del recorrido.
  const aislados: Array<{ a: Racional; b: Racional }> = [];
  const cola: Array<{ a: Racional; b: Racional; n: number }> = [
    { a: negado(cota), b: cota, n: total },
  ];
  let vueltas = 0;
  while (cola.length > 0 && vueltas++ < MAX_BISECCIONES * 8) {
    const it = cola.shift();
    if (!it) break;
    if (it.n === 0) continue;
    if (it.n === 1) { aislados.push({ a: it.a, b: it.b }); continue; }
    const m = cociente(suma(it.a, it.b), rac(2n));
    // El punto medio puede SER una raíz: Sturm cuenta sobre (a, b], así que una raíz justo en m
    // cae en la mitad izquierda y no se pierde ni se duplica.
    const cm = cambiosDeSigno(suc, m);
    const izq = Math.max(0, cambiosDeSigno(suc, it.a) - cm);
    const der = Math.max(0, cm - cambiosDeSigno(suc, it.b));
    if (izq === it.n && der === 0) { cola.push({ a: it.a, b: m, n: izq }); continue; }
    if (der === it.n && izq === 0) { cola.push({ a: m, b: it.b, n: der }); continue; }
    if (izq > 0) cola.push({ a: it.a, b: m, n: izq });
    if (der > 0) cola.push({ a: m, b: it.b, n: der });
  }

  const salida = aislados.map(({ a, b }) => {
    const exacto = exactas.find((e) => comparar(e, a) > 0 && comparar(e, b) <= 0) ?? null;
    if (exacto) return { a: exacto, b: exacto, valor: aNumero(exacto), exacto };
    // El intervalo que se DEVUELVE es el estrechado, no el de aislamiento. La diferencia importa
    // para quien llama: el de aislamiento solo promete contener una raíz —puede ser ancho—, y
    // sustituir su extremo en otra ecuación daría un resultado que no se parece al de la raíz.
    // El estrechado la encierra hasta la última cifra del doble, así que sus extremos SIRVEN
    // como aproximación racional de la raíz, que es justo lo que necesita el solver.
    const r = refinar(libre, a, b);
    return { a: r.a, b: r.b, valor: r.valor, exacto: null };
  });
  salida.sort((u, v) => u.valor - v.valor);
  return salida;
}

/**
 * Estrecha el intervalo aislado hasta la precisión del `double` y devuelve su centro.
 *
 * Bisección y no Newton: el intervalo ya contiene UNA raíz y sus extremos tienen signos
 * opuestos, así que bisecar no puede divergir ni salirse —Newton sí, y precisamente cerca de una
 * raíz de derivada pequeña, que es donde más falta hace acertar—. Sin garantía de convergencia
 * global no se gana nada yendo más rápido.
 */
function refinar(
  p: Polinomio, a0: Racional, b0: Racional
): { valor: number; a: Racional; b: Racional } {
  let a = a0, b = b0;
  const sa = signo(evaluar(p, a));
  // Un extremo que ya es raíz exacta: no hay nada que estrechar.
  if (sa === 0) return { valor: aNumero(a), a, b: a };
  if (signo(evaluar(p, b)) === 0) return { valor: aNumero(b), a: b, b };
  let signoA = sa;
  for (let i = 0; i < MAX_BISECCIONES; i++) {
    const m = cociente(suma(a, b), rac(2n));
    const sm = signo(evaluar(p, m));
    if (sm === 0) return { valor: aNumero(m), a: m, b: m };
    if (sm === signoA) { a = m; signoA = sm; } else { b = m; }
    // Se para cuando los dos extremos coinciden ya como `double`: seguir bisecando en exacto
    // afinaría un número que nadie puede representar.
    const na = aNumero(a), nb = aNumero(b);
    if (na === nb) return { valor: na, a, b };
  }
  return { valor: (aNumero(a) + aNumero(b)) / 2, a, b };
}

/** Texto plano del polinomio, para pruebas y diagnóstico (`x^2 - 2`). */
export function aTextoPol(p: Polinomio): string {
  const q = normalizar(p);
  if (q.length === 0) return "0";
  const partes: string[] = [];
  for (let i = q.length - 1; i >= 0; i--) {
    if (esCero(q[i])) continue;
    const c = q[i];
    const coef = c.d === 1n ? String(c.n) : `${c.n}/${c.d}`;
    // El coeficiente 1 no se escribe delante de la x (`x²`, no `1x²`), y el −1 deja solo el
    // signo. En el término independiente sí se escribe: ahí el 1 es el número entero.
    const visible = i > 0 && (coef === "1" ? "" : coef === "-1" ? "-" : coef);
    partes.push(i === 0 ? coef : i === 1 ? `${visible}x` : `${visible}x^${i}`);
  }
  return partes.length === 0 ? "0" : partes.join(" + ").replace(/\+ -/g, "- ");
}

/** Composición `p(q(x))`, que es como se sustituye una curva en otra al eliminar. */
export function componer(p: Polinomio, q: Polinomio): Polinomio {
  const P = normalizar(p);
  let acc: Polinomio = NULO;
  for (let i = P.length - 1; i >= 0; i--) acc = sumaPol(productoPol(acc, q), [P[i]]);
  return normalizar(acc);
}

/** `p` elevado a un entero no negativo. */
export function potenciaPol(p: Polinomio, k: number): Polinomio {
  let r: Polinomio = [UNO];
  for (let i = 0; i < k; i++) r = productoPol(r, p);
  return r;
}

export { potencia as potenciaRacional };
