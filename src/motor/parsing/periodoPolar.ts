// ─────────────────────────────────────────────
// parsing · Dominio de θ de una polar r=g(θ) por PERIODO (CUARENTENA de mathjs)
// ─────────────────────────────────────────────
//
// El trazador paramétrico recorre TODO el dominio del parámetro, así que una polar
// solo se dibuja entera si su dominio cubre un periodo completo de la curva. El
// defecto histórico `[0, 2π]` corta las curvas cuyo periodo es mayor: `r = sin(θ/10)`
// tiene periodo 20π (solo se veía 1/10, un arquito junto al origen).
//
// La curva (r·cosθ, r·sinθ) es periódica en θ con periodo LCM(P_r, 2π), donde P_r es
// el periodo de r(θ) como función escalar (el factor 2π viene de cosθ/sinθ). Para r
// compuesto de trig de argumento AFÍN en θ (`sin(aθ+b)`), P_r = LCM de los 2π/|a_i|.
// Combinando ambos: P = 2π·m, con m = LCM de los NUMERADORES de 1/|a_i| (en fracción
// reducida) — el LCM con 2π absorbe los denominadores. Ejemplos:
//   • r=sin(θ/10):  a=1/10 → 1/a=10/1 → m=10 → 20π (10 lazos).
//   • r=sin(3θ):    a=3    → 1/a=1/3  → m=1  → 2π  (la rosa se retraza, pero entera).
//   • r=sin(θ/10)+cos(θ/4): m=LCM(10,4)=20 → 40π.
// Sin trig de θ (círculo r=2, espiral r=θ) → sin periodo detectable → `[0, 2π]`.
//
// El resultado se VERIFICA numéricamente (r(θ+P)≈r(θ)); si la dependencia en θ no es
// realmente periódica (r=θ+sinθ) cae al defecto. mathjs vive confinado aquí (parsing).

import { parse } from "mathjs";
import { compilarFuncion } from "../../evaluador";
import type { Nodo } from "../../formatoExpr";

const DOS_PI = 2 * Math.PI;
export const DOMINIO_POLAR_DEFECTO: readonly [number, number] = [0, DOS_PI];

// Solo las trig CIRCULARES son periódicas (las hiperbólicas no).
const TRIG = new Set(["sin", "cos", "tan", "cot", "sec", "csc"]);
// Cota del multiplicador: evita dominios/presupuestos desmedidos (r=sin(θ/1000)).
const MULT_MAX = 60;

const aNumero = (v: unknown): number => (typeof v === "number" ? v : NaN);
const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b));
const mcm = (a: number, b: number): number => (a / mcd(a, b)) * b;

/** Fracción reducida p/q ≈ x (x>0) por fracciones continuas (denominador ≤ maxDen). */
export interface Fraccion { p: number; q: number }

function fraccionReducida(x: number, maxDen = 1000): Fraccion | null {
  if (!Number.isFinite(x) || x <= 0) return null;
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(h1 / k1 - x) < 1e-9) break;
    const frac = b - a;
    if (frac < 1e-12) break;
    b = 1 / frac;
  }
  return h1 > 0 && k1 > 0 ? { p: h1, q: k1 } : null;
}

/** ¿El subárbol referencia la variable del parámetro? */
function contieneParametro(n: Nodo, variable: string): boolean {
  return n.filter((nn: Nodo) => nn.type === "SymbolNode" && nn.name === variable).length > 0;
}

/** Pendiente a de un argumento AFÍN en la variable (arg = a·v + b), o null si no lo es. */
function pendienteLineal(arg: Nodo, variable: string): number | null {
  let g: (v: number) => unknown;
  try { g = compilarFuncion(arg.toString(), variable); } catch { return null; }
  const y0 = aNumero(g(0.3)), y1 = aNumero(g(1.3)), y2 = aNumero(g(2.3));
  if (![y0, y1, y2].every(Number.isFinite)) return null;
  const a1 = y1 - y0, a2 = y2 - y1;
  if (Math.abs(a1 - a2) > 1e-7) return null; // curvatura → no afín
  return a1;
}

/** Verifica numéricamente que f(v+P) ≈ f(v) en varios v (≥2 comprobados finitos). */
function periodoValido(expr: string, P: number, variable: string): boolean {
  let g: (v: number) => unknown;
  try { g = compilarFuncion(expr, variable); } catch { return false; }
  let ok = 0;
  for (const th of [0.1, 0.9, 1.7, 2.6, 3.9, 5.1]) {
    const a = aNumero(g(th)), b = aNumero(g(th + P));
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > 1e-6 * (1 + Math.abs(a))) return false;
    ok++;
  }
  return ok >= 2;
}

/**
 * Fracciones reducidas 1/|aᵢ| de cada trig de argumento afín en θ, en el orden en que
 * aparecen. `null` significa "no hay periodo fiable" (argumento no afín, o una
 * fracción que no converge): el llamador cae a su defecto. Lista vacía = sin trig de θ.
 *
 * Es el único punto que toca mathjs, y lo comparten el DOMINIO del trazador
 * (`dominioPolar`, periodo de la CURVA) y el periodo de r como función escalar
 * (`periodoDeR`, el que lee el panel ⓘ). Son dos números distintos —ver `periodoDeR`—
 * derivados del mismo análisis, así que el análisis se hace una vez.
 */
function pendientesTrigonometricas(expr: string, variable: string): Fraccion[] | null {
  const fracciones: Fraccion[] = [];
  try {
    const arbol = parse(expr) as unknown as Nodo;
    const trigs = arbol.filter(
      (n: Nodo) => n.type === "FunctionNode" && TRIG.has(n.fn.name)
    );
    for (const t of trigs) {
      const arg = t.args[0];
      if (!arg || !contieneParametro(arg, variable)) continue; // no aporta al periodo
      const a = pendienteLineal(arg, variable);
      if (a === null) return null;               // arg no afín → sin periodo fiable
      if (Math.abs(a) < 1e-9) continue;
      const f = fraccionReducida(1 / Math.abs(a));
      if (f === null) return null;
      fracciones.push(f);
    }
  } catch { return null; }
  return fracciones;
}

/** Dominio [0, P] de θ para trazar la polar r=g(θ) entera; `[0, 2π]` si no hay un
 *  periodo mayor detectable/verificable. `exprR` YA normalizada en la variable θ. */
export function dominioPolar(exprR: string): readonly [number, number] {
  const fracciones = pendientesTrigonometricas(exprR, "theta");
  if (fracciones === null || fracciones.length === 0) return DOMINIO_POLAR_DEFECTO;

  let m = 1;
  for (const f of fracciones) {
    m = mcm(m, f.p);
    if (m >= MULT_MAX) { m = MULT_MAX; break; }
  }

  const P = DOS_PI * m;
  return periodoValido(exprR, P, "theta") ? [0, P] : DOMINIO_POLAR_DEFECTO;
}

/**
 * Periodo de r(θ) como FUNCIÓN ESCALAR, o `null` si no lo tiene (r=2, r=θ) o no se
 * puede verificar. Ojo: NO es el periodo de la curva que devuelve `dominioPolar`.
 *
 * Para r=1+0,1·sin(8θ) este vale π/4 —cada cuánto se repite el rizo— y el de la curva
 * vale 2π —cuándo se cierra el trazo—. Ambos son correctos y responden a preguntas
 * distintas: el trazador necesita el segundo para dibujarla entera; el lector del panel
 * quiere el primero, porque es el que describe la FORMA (y equivale a decir que la
 * curva tiene simetría rotacional de orden 2π/P = 8).
 *
 * Cada trig aporta periodo 2π·pᵢ/qᵢ; el de la suma es su mínimo común múltiplo, que
 * para racionales es LCM(pᵢ)/GCD(qᵢ).
 */
export function periodoDeR(exprR: string): number | null {
  return periodoDeExpresion(exprR, "theta");
}

/**
 * Periodo de una expresión escalar en la variable dada, o `null` si no lo tiene o no se
 * puede verificar. Es `periodoDeR` sin la suposición de que el parámetro se llama θ: las
 * paramétricas lo necesitan sobre `t`, para cada componente por separado.
 */
export function periodoDeExpresion(expr: string, variable: string): number | null {
  const fracciones = pendientesTrigonometricas(expr, variable);
  if (fracciones === null || fracciones.length === 0) return null;

  let p = 1, q = 0;
  for (const f of fracciones) {
    p = mcm(p, f.p);
    q = q === 0 ? f.q : mcd(q, f.q);
    if (p >= MULT_MAX) return null; // periodo desmedido: no es información útil
  }

  const P = (DOS_PI * p) / q;
  return periodoValido(expr, P, variable) ? P : null;
}

/**
 * Periodo común de dos periodos que son múltiplos racionales de 2π (el mínimo común
 * múltiplo), o `null` si alguno no lo es o el resultado se dispara. Lo necesita una
 * paramétrica: la curva (x(t), y(t)) se repite cuando lo hacen SUS DOS componentes, así
 * que su periodo es el mcm de los dos —(cos 3t, sin 4t) se cierra en 2π, no en 2π/3—.
 */
export function periodoComun(a: number, b: number): number | null {
  const fa = fraccionReducida(a / DOS_PI);
  const fb = fraccionReducida(b / DOS_PI);
  if (fa === null || fb === null) return null;
  const p = mcm(fa.p, fb.p);
  const q = mcd(fa.q, fb.q);
  if (p / q >= MULT_MAX) return null;
  return (DOS_PI * p) / q;
}
