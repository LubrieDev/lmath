// ─────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────

import { CENTINELAS_SIGNO } from "./motor/parsing/dobleSigno";

export const FUNCIONES_TRIG = ["sin", "cos", "tan", "sec", "csc", "cot"] as const;
export const FUNCIONES_LATEX = "sin|cos|tan|sec|csc|cot|log|ln";

// Trigonométricas inversas que MathJS NO trae nativas. Se inyectan en el scope
// de evaluación como wrappers de dominio real:
//   acsc(x)=asin(1/x)   asec(x)=acos(1/x)   acot(x)=pi/2 - atan(x)
// acsc/asec usan Math.* para devolver NaN —no un complejo— fuera del dominio,
// que es lo que el motor de curvas ya filtra con Number.isFinite.
// acot usa la convención CONTINUA de rango (0, π) —la de Desmos/cálculo—, no
// atan(1/x): esta última salta de +π/2 a −π/2 en x=0. pi/2-atan(x) decrece sin
// cortes de π (en −∞) a 0 (en +∞), pasando por π/2 en x=0.
export const FUNCIONES_INVERSAS_EXTRA = {
  acsc: (x: number) => Math.asin(1 / x),
  asec: (x: number) => Math.acos(1 / x),
  acot: (x: number) => Math.PI / 2 - Math.atan(x),
};

// Centinelas del DOBLE SIGNO (`±`, `∓`): funciones unarias que representan la rama
// PRINCIPAL de la familia (pm(u)=+u, mp(u)=−u). Existen para que una expresión con ±
// sea EVALUABLE en un solo valor allí donde el motor necesita uno —clasificación de
// degeneradas, crosshair, valor de la integral—; las DOS ramas reales las produce la
// expansión de `motor/parsing/dobleSigno.ts`, que es quien grafica la familia entera.
// Sin esto, `pm` era un símbolo libre: NaN en todo x (plano vacío, sin error).
// Un centinela por EJE de signo (`pm`/`mp` = eje 0, `pm2`/`mp2` = eje 1): dos ± independientes
// —`y = ±arccos((a ± √d)/2)`— son cuatro curvas reales, y con un solo eje se perdían dos. Los
// nombres y sus signos salen de dobleSigno.ts, que es quien define los ejes: así el scope de
// evaluación no puede quedarse corto si algún día se añade otro.
export const FUNCIONES_SIGNO: Record<string, (u: number) => number> =
  Object.fromEntries(CENTINELAS_SIGNO.map(([nombre, signo]) => [nombre, (u: number) => signo * u]));

// Centinela de CONDICIÓN DE DOMINIO del despeje: `dom(cuerpo, R)` vale `cuerpo` donde R≥0 y
// NaN donde R<0. Lo emite el despeje de las inversas de RANGO RESTRINGIDO (√ de índice par,
// |·|, ⁿ√(yᵐ) de índice par), que solo son válidas donde el otro lado es ≥0: sin la guarda,
// `√y=R ⇒ y=R²` dibujaría la rama fantasma R<0 que la curva original no tiene. Al evaluarse a
// NaN allí, esa rama no existe —igual que la original—; el LaTeX lo pinta como la coletilla
// `, R≥0` (latex.ts), la forma honesta de un despeje con dominio restringido. Como pm/mp,
// existe para que el despeje sea EVALUABLE (fidelidad numérica del panel y las pruebas).
export const FUNCIONES_DOMINIO = {
  dom: (cuerpo: number, cond: number) => (cond >= 0 ? cuerpo : NaN),
};

// floor/ceil RÁPIDAS para el scope de evaluación. Las nativas de mathjs pasan por
// typed-function + nearlyEqual con soporte BigNumber/Fraction: ~18 µs por llamada
// frente a ~1.5 µs de sin(x) (medido) — al muestrear miles de puntos por frame,
// floor(x) daba ~5× el coste de sin(x) en pan/zoom. En el scope se resuelven ANTES
// que las de mathjs (misma vía que las inversas extra) y trabajan solo en ℝ, que es
// lo único que grafica el motor (un no-número se degrada a NaN, que ya es "hueco").
// Se CONSERVA la corrección epsilon de mathjs (0.1·30=2.9999999999999996 debe dar
// piso 3, no 2): si x está a <1e-12 relativo de un entero, se redondea a él.
const enteroCercano = (x: number): number | null => {
  const r = Math.round(x);
  return Math.abs(x - r) <= 1e-12 * Math.max(1, Math.abs(x)) ? r : null;
};
export const FUNCIONES_ESCALON_RAPIDAS = {
  floor: (x: number) => (typeof x === "number" ? enteroCercano(x) ?? Math.floor(x) : NaN),
  ceil: (x: number) => (typeof x === "number" ? enteroCercano(x) ?? Math.ceil(x) : NaN),
};
