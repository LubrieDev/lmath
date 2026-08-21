// ─────────────────────────────────────────────
// registro · El catálogo de funciones del motor
// ─────────────────────────────────────────────
//
// Una entrada por función. Es la lista completa de lo que LMath sabe nombrar, y sustituye a las
// siete tablas repartidas que hoy contestan cada una a una parte de la pregunta.
//
// ── Sobre ℝ y solo sobre ℝ ───────────────────────────────────────────────────────────────
// Todas las evaluaciones devuelven NaN fuera del dominio REAL, nunca un complejo. mathjs
// devuelve un `Complex` para `sqrt(-4)` o `log(-1)`, y ese complejo, si arriba hay un `abs`,
// vuelve a ser un real: el motor «encontraba» curva donde no la hay. Lo que LMath dibuja es ℝ,
// así que aquí se razona sobre ℝ. Es el mismo criterio que ya aplica el oráculo de la batería.
//
// ── Qué está relleno y qué no ────────────────────────────────────────────────────────────
// Están rellenos los campos que esta etapa necesita y puede afirmar con certeza: aridad,
// evaluación real, dominio natural, paridad y signo. `derivada`, `primitiva`, `inversa` y
// `valoresExactos` se rellenan en las etapas de cálculo y resolución; sus huecos ya están
// declarados en la ficha, así que rellenarlos no obliga a tocar nada de aquí.
//
// ── Los centinelas NO están ──────────────────────────────────────────────────────────────
// `pm`, `mp`, `pm2`, `mp2`, `dom`, `fam` y `famN` no son funciones y no tienen ficha. Son
// `Rama`, `Condicionado` y `Familia` en el núcleo, y los nombres viejos existen únicamente
// dentro de `puente/mathjs.ts` como formato de compatibilidad hacia el motor de dibujo.

import { type Condicion, type Expresion, UNO_E, resta } from "../nucleo/expresion";
import { type FichaFuncion, catalogoDe } from "./ficha";

// ── Ayudas para escribir las condiciones de dominio ──────────────────────────

const noNegativo = (expr: Expresion): Condicion => ({ tipo: "noNegativo", expr });
const positivo = (expr: Expresion): Condicion => ({ tipo: "positivo", expr });
const noCero = (expr: Expresion): Condicion => ({ tipo: "noCero", expr });
const acotado = (expr: Expresion): Condicion => ({ tipo: "acotado", expr });

const sinDominio = (): readonly Condicion[] => [];

// ── Ayudas numéricas, con la semántica REAL del motor ────────────────────────

const real = (v: number): number => (Number.isFinite(v) ? v : NaN);
/** Recíproca de una trigonométrica: NaN donde la base se anula, en vez de ±Infinity. */
const reciproca = (f: (x: number) => number) => (x: number): number => {
  const v = f(x);
  return v === 0 ? NaN : 1 / v;
};
/** Corrección epsilon de mathjs para floor/ceil: `0.1*30 = 2.9999999999999996` debe dar piso 3. */
const enteroCercano = (x: number): number | null => {
  const r = Math.round(x);
  return Math.abs(x - r) <= 1e-12 * Math.max(1, Math.abs(x)) ? r : null;
};

const f1 = (
  id: string,
  evaluar: (x: number) => number,
  extra: Partial<FichaFuncion> = {}
): FichaFuncion => ({ id, aridad: 1, evaluar: (a) => evaluar(a[0]), ...extra });

// ─────────────────────────────────────────────
// El catálogo
// ─────────────────────────────────────────────

export const CATALOGO = catalogoDe([
  // ── Trigonométricas ────────────────────────────────────────────────────────
  f1("sin", Math.sin, { paridad: "impar", dominioNatural: sinDominio }),
  f1("cos", Math.cos, { paridad: "par", dominioNatural: sinDominio }),
  // Los polos de tan/cot/sec/csc son un retículo infinito de puntos, no la anulación de un
  // subárbol: no caben como condición en este lenguaje y NO se declaran. Es la misma frontera,
  // consciente, que ya tiene `math/dominio.ts`, y por el mismo motivo: afirmar de menos es
  // correcto; inventar una condición que no se sabe escribir, no.
  f1("tan", Math.tan, { paridad: "impar" }),
  f1("cot", reciproca(Math.tan), { paridad: "impar" }),
  f1("sec", reciproca(Math.cos), { paridad: "par" }),
  f1("csc", reciproca(Math.sin), { paridad: "impar" }),

  // ── Trigonométricas inversas ───────────────────────────────────────────────
  f1("asin", Math.asin, { paridad: "impar", dominioNatural: (a) => [acotado(a[0])] }),
  f1("acos", Math.acos, { dominioNatural: (a) => [acotado(a[0])] }),
  f1("atan", Math.atan, { paridad: "impar", dominioNatural: sinDominio }),
  // Las tres que mathjs no trae, con la MISMA definición que ya inyecta el evaluador
  // (`constantes.ts`): acot usa la convención continua de rango (0, π), no atan(1/x), que salta.
  f1("acsc", (x) => Math.asin(1 / x), { paridad: "impar" }),
  f1("asec", (x) => Math.acos(1 / x)),
  f1("acot", (x) => Math.PI / 2 - Math.atan(x), { dominioNatural: sinDominio }),
  {
    id: "atan2", aridad: 2,
    evaluar: (a) => Math.atan2(a[0], a[1]),
  },

  // ── Hiperbólicas ───────────────────────────────────────────────────────────
  f1("sinh", Math.sinh, { paridad: "impar", dominioNatural: sinDominio }),
  f1("cosh", Math.cosh, { paridad: "par", dominioNatural: sinDominio }),
  f1("tanh", Math.tanh, { paridad: "impar", dominioNatural: sinDominio }),
  f1("sech", reciproca(Math.cosh), { paridad: "par", dominioNatural: sinDominio }),
  f1("csch", reciproca(Math.sinh), { paridad: "impar" }),
  f1("coth", reciproca(Math.tanh), { paridad: "impar" }),
  f1("asinh", Math.asinh, { paridad: "impar", dominioNatural: sinDominio }),
  // acosh existe para u ≥ 1; atanh para |u| < 1. La primera se escribe como «u−1 ≥ 0» porque el
  // lenguaje de condiciones habla de expresiones comparadas con 0.
  f1("acosh", Math.acosh, { dominioNatural: (a) => [noNegativo(resta(a[0], UNO_E))] }),
  f1("atanh", Math.atanh, { paridad: "impar", dominioNatural: (a) => [acotado(a[0])] }),

  // ── Exponencial y logaritmo ────────────────────────────────────────────────
  f1("exp", Math.exp, { signo: "positivo", dominioNatural: sinDominio }),
  f1("expm1", Math.expm1, { dominioNatural: sinDominio }),
  {
    // FORMA CANÓNICA ÚNICA: el logaritmo lleva SIEMPRE su base escrita. Un `log` sin base es
    // decimal en la notación que se enseña y natural en la de los lenguajes de programación, y
    // esa ambigüedad ya costó un error de VALOR en este motor (`log(100)` valía 4,605). El
    // puente convierte el `log(u)` de mathjs en `log(u, e)` al entrar.
    id: "log", aridad: 2,
    evaluar: (a) => (a[0] > 0 && a[1] > 0 && a[1] !== 1 ? Math.log(a[0]) / Math.log(a[1]) : NaN),
    // Argumento > 0, base > 0 y base ≠ 1 (con base 1 el denominador `ln 1` se anula: es la
    // función degenerada que el motor ya sabe detectar, aquí dicha como condición).
    dominioNatural: (a) => [positivo(a[0]), positivo(a[1]), noCero(resta(a[1], UNO_E))],
  },

  // ── Raíces y potencias ─────────────────────────────────────────────────────
  f1("sqrt", (x) => (x >= 0 ? Math.sqrt(x) : NaN), {
    signo: "noNegativo", dominioNatural: (a) => [noNegativo(a[0])],
  }),
  f1("cbrt", Math.cbrt, { paridad: "impar", dominioNatural: sinDominio }),
  {
    // Índice PAR de un negativo no es real; índice impar sí. Es la misma regla que ya aplica el
    // oráculo de la batería, y la razón por la que no basta con `Math.pow(u, 1/n)`.
    id: "nthRoot", aridad: 2,
    evaluar: (a) => {
      const [u, n] = a;
      if (!Number.isFinite(u) || !Number.isFinite(n) || n === 0) return NaN;
      if (u >= 0) return Math.pow(u, 1 / n);
      return Math.abs(n % 2) === 1 ? -Math.pow(-u, 1 / n) : NaN;
    },
  },
  { id: "hypot", aridad: null, evaluar: (a) => real(Math.hypot(...a)), signo: "noNegativo" },

  // ── Valor absoluto, signo y escalones ──────────────────────────────────────
  f1("abs", Math.abs, { paridad: "par", signo: "noNegativo", dominioNatural: sinDominio }),
  f1("sign", Math.sign, { paridad: "impar", dominioNatural: sinDominio }),
  f1("floor", (x) => enteroCercano(x) ?? Math.floor(x), { dominioNatural: sinDominio }),
  f1("ceil", (x) => enteroCercano(x) ?? Math.ceil(x), { dominioNatural: sinDominio }),
  f1("round", Math.round, { dominioNatural: sinDominio }),
  f1("fix", Math.trunc, { paridad: "impar", dominioNatural: sinDominio }),

  // ── Aritmética discreta y especiales ───────────────────────────────────────
  { id: "min", aridad: null, evaluar: (a) => real(Math.min(...a)) },
  { id: "max", aridad: null, evaluar: (a) => real(Math.max(...a)) },
  { id: "mod", aridad: 2, evaluar: (a) => (a[1] === 0 ? NaN : ((a[0] % a[1]) + a[1]) % a[1]) },
  {
    id: "gcd", aridad: 2,
    evaluar: (a) => {
      let [p, q] = [Math.abs(Math.trunc(a[0])), Math.abs(Math.trunc(a[1]))];
      while (q) [p, q] = [q, p % q];
      return p;
    },
  },
  {
    id: "lcm", aridad: 2,
    evaluar: (a) => {
      const [p, q] = [Math.abs(Math.trunc(a[0])), Math.abs(Math.trunc(a[1]))];
      if (p === 0 || q === 0) return 0;
      let [u, v] = [p, q];
      while (v) [u, v] = [v, u % v];
      return (p / u) * q;
    },
  },
  // `gamma` y `factorial` se registran para que el motor sepa NOMBRARLAS —la batería tiene un
  // caso `gamma(y) = x` cuyo comportamiento correcto es quedarse sin resolver— aunque su
  // evaluación no sea asunto de esta etapa. Declararlas con `evaluar` a NaN sería mentir sobre
  // su valor; se evalúan con la aproximación de Lanczos, que es la que usa mathjs.
  f1("gamma", gammaLanczos, { dominioNatural: sinDominio }),
  f1("factorial", (x) => gammaLanczos(x + 1), { dominioNatural: sinDominio }),
]);

/**
 * Γ(x) por la aproximación de Lanczos, con la reflexión para x < 0.5. Es la misma familia de
 * aproximación que usa mathjs, así que el valor no cambia respecto de lo que el motor ya dibuja.
 */
function gammaLanczos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaLanczos(1 - x));
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const z = x - 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a;
}

/** La ficha de una función por su id, o `null` si el catálogo no la conoce. `null` es una
 *  respuesta: el puente lo usa para declararse incompetente en vez de inventarse una semántica. */
export const fichaDe = (id: string): FichaFuncion | null => CATALOGO.get(id) ?? null;

/** ¿Conoce el catálogo esta función? */
export const conocida = (id: string): boolean => CATALOGO.has(id);
