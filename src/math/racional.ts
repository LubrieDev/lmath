// ─────────────────────────────────────────────
// mate · Aritmética racional EXACTA (PURA)
// ─────────────────────────────────────────────
//
// Un número racional con numerador y denominador `bigint`, siempre reducido y con el signo en
// el numerador. Es el suelo sobre el que se apoya todo el motor matemático: sin él, «exacto»
// sería una manera de hablar.
//
// ── Por qué no bastan los `number` ────────────────────────────────────────────────────────
// La coma flotante no es capaz de decir que 0 es 0. Al resolver `y = Ax` contra `y = x²` en
// doble precisión, el 0 que sale de la eliminación es un 0 con historia: arrastra el error de
// cada resta que lo produjo, y ese error depende del CAMINO, no del problema. Es literalmente
// el bug que motivó este módulo —una solución que valía (0, 0) y pasaba a valer
// (8.4e-6, 8.4e-6) al mover el plano—: no es que el cálculo fuera impreciso, es que el
// resultado dependía de por dónde se había pasado antes de llegar.
//
// Con racionales exactos ese 0 es el 0, hoy y con cualquier zoom, porque no hay redondeo en
// ninguno de los pasos. `bigint` y no `number` porque los coeficientes CRECEN al eliminar: una
// resultante de dos cónicas multiplica coeficientes cuatro veces, y con enteros de 53 bits el
// desbordamiento silencioso devolvería un polinomio equivocado con toda la confianza del mundo.
//
// ── Dónde termina lo exacto ───────────────────────────────────────────────────────────────
// Aquí solo viven los RACIONALES. Una raíz irracional (√2, el número áureo) no cabe en este
// tipo y no se finge que quepa: el aislamiento de raíces devuelve intervalos racionales tan
// estrechos como haga falta, y solo al final se convierte a `number` para pintar. La frontera
// es explícita a propósito —`aNumero` es el único sitio donde se pierde exactitud— en vez de
// diluirse en redondeos repartidos por todo el motor.

/**
 * Un racional exacto. INVARIANTES, que todo constructor de este módulo garantiza:
 *   • `d > 0n` (el signo vive en `n`),
 *   • `gcd(|n|, d) === 1n` (siempre reducido).
 *
 * Los dos juntos hacen que la igualdad sea comparación de campos: dos racionales iguales tienen
 * la misma representación, y `esCero` es mirar `n`. Sin la forma canónica habría que reducir en
 * cada comparación, que es justo el trabajo que se ahorra reduciendo al construir.
 */
export interface Racional {
  readonly n: bigint;
  readonly d: bigint;
}

/** Máximo común divisor de dos enteros no negativos (Euclides). */
function mcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) { const t = x % y; x = y; y = t; }
  return x;
}

/**
 * El racional `n/d`, reducido y con el signo en el numerador.
 *
 * Denominador cero LANZA en vez de devolver un infinito: aquí no hay ±∞ ni NaN a propósito. Un
 * racional no finito no es un número de este cuerpo, y dejarlo entrar obligaría a cada operación
 * de más abajo a preguntarse si sus dos argumentos son de verdad números. Quien pueda dividir
 * por cero (la eliminación, al normalizar por el coeficiente principal) comprueba antes.
 */
export function rac(n: bigint, d: bigint = 1n): Racional {
  if (d === 0n) throw new Error("racional con denominador cero");
  let nn = n, dd = d;
  if (dd < 0n) { nn = -nn; dd = -dd; }
  const g = mcd(nn, dd);
  if (g > 1n) { nn /= g; dd /= g; }
  return { n: nn, d: dd };
}

export const CERO: Racional = { n: 0n, d: 1n };
export const UNO: Racional = { n: 1n, d: 1n };

export const esCero = (a: Racional): boolean => a.n === 0n;
export const signo = (a: Racional): -1 | 0 | 1 => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0);

export const suma = (a: Racional, b: Racional): Racional => rac(a.n * b.d + b.n * a.d, a.d * b.d);
export const resta = (a: Racional, b: Racional): Racional => rac(a.n * b.d - b.n * a.d, a.d * b.d);
export const producto = (a: Racional, b: Racional): Racional => rac(a.n * b.n, a.d * b.d);
export const negado = (a: Racional): Racional => ({ n: -a.n, d: a.d });

/** `a / b`. Lanza si `b` es cero, por el mismo motivo que `rac`. */
export function cociente(a: Racional, b: Racional): Racional {
  if (esCero(b)) throw new Error("división racional por cero");
  return rac(a.n * b.d, a.d * b.n);
}

/** `a^k` con exponente entero NO negativo (el motor no necesita potencias negativas). */
export function potencia(a: Racional, k: number): Racional {
  let r = UNO;
  for (let i = 0; i < k; i++) r = producto(r, a);
  return r;
}

export const iguales = (a: Racional, b: Racional): boolean => a.n === b.n && a.d === b.d;

/** Comparación exacta: −1, 0 o 1. Con denominadores positivos, comparar `a.n·b.d` con `b.n·a.d`
 *  conserva el sentido y no introduce ningún redondeo. */
export function comparar(a: Racional, b: Racional): -1 | 0 | 1 {
  const izq = a.n * b.d, der = b.n * a.d;
  return izq < der ? -1 : izq > der ? 1 : 0;
}

export const absoluto = (a: Racional): Racional => (a.n < 0n ? negado(a) : a);

/**
 * El racional como `number`. **Es el único punto del motor donde se pierde exactitud**, y por eso
 * está aquí solo y con nombre propio en vez de repartido por cada consumidor.
 *
 * La división se hace en coma flotante cuando los dos términos caben en un `double` sin perder
 * bits (el caso normal: coeficientes pequeños), y con un cociente entero previo cuando no caben
 * —`Number(n)/Number(d)` con enteros de 400 bits daría `Infinity/Infinity` = NaN, que es el peor
 * resultado posible: un número que existe y sale NaN—.
 */
export function aNumero(a: Racional): number {
  const n = Number(a.n), d = Number(a.d);
  if (Number.isFinite(n) && Number.isFinite(d)) return n / d;
  // Demasiado grande para el doble: se extrae el cociente entero (exacto en bigint) y el resto
  // se añade como fracción, que ya cabe. Conserva ~15 dígitos significativos, que es todo lo que
  // un `double` puede sostener de todas formas.
  const entero = a.n / a.d;
  const resto = a.n % a.d;
  return Number(entero) + Number(resto) / Number(a.d);
}

/**
 * El racional exacto que representa un `number` FINITO, sin aproximar.
 *
 * Un `double` ES un racional: mantisa por potencia de dos. Multiplicar por 2 hasta que la parte
 * fraccionaria desaparece recupera esa fracción EXACTA, así que `0.5` da 1/2 y `0.1` da la
 * fracción binaria que de verdad hay guardada, no 1/10. Esa distinción importa: fingir que `0.1`
 * es 1/10 metería en el motor exacto un error que el usuario no escribió.
 *
 * Para el caso corriente —un decimal corto tecleado por una persona— quien quiera 1/10 debe usar
 * `desdeDecimal`, que lee los dígitos como los escribió y no los bits.
 */
export function desdeNumero(x: number): Racional {
  if (!Number.isFinite(x)) throw new Error("racional desde un número no finito");
  if (Number.isInteger(x)) return rac(BigInt(x));
  let num = x, den = 1n;
  // Un double tiene a lo sumo 1074 bits de fracción; el tope corta cualquier patología.
  for (let i = 0; i < 1100 && !Number.isInteger(num); i++) { num *= 2; den *= 2n; }
  return rac(BigInt(num), den);
}

/**
 * El racional de un decimal ESCRITO (`"0.1"` → 1/10, `"1.25"` → 5/4), o `null` si el texto no es
 * un decimal. Lee los DÍGITOS, no los bits: es lo que hace que un `0.1` tecleado entre en el
 * motor como el décimo que la persona quiso decir.
 */
export function desdeDecimal(texto: string): Racional | null {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(texto.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const sig = m[1] === "-" ? -1n : 1n;
  const enteros = m[2] === "" ? "0" : m[2];
  const decimales = m[3] ?? "";
  let n = BigInt(enteros + decimales) * sig;
  let d = 10n ** BigInt(decimales.length);
  const exp = m[4] ? Number(m[4]) : 0;
  if (exp > 0) n *= 10n ** BigInt(exp);
  else if (exp < 0) d *= 10n ** BigInt(-exp);
  return rac(n, d);
}

/** ¿El racional es un entero? (denominador 1 tras reducir). */
export const esEntero = (a: Racional): boolean => a.d === 1n;

/** Texto plano del racional: `3`, `-1/2`. Para paneles y para las pruebas. */
export function aTexto(a: Racional): string {
  return a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
}
