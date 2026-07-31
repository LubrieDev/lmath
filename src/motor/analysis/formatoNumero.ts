// ─────────────────────────────────────────────
// analysis · Números "bonitos" para el panel ⓘ (entero, múltiplo de π, decimal)
// ─────────────────────────────────────────────
//
// El panel venía imprimiendo `v.toFixed(4)` a pelo, y eso produce tres fealdades
// distintas que conviene no confundir porque solo una es de formato:
//
//   1. RELLENO: un valor exacto se escribe con ceros muertos (`1` → "1.0000").
//      Puramente cosmético.
//   2. RUIDO: los puntos notables salen de un cálculo NUMÉRICO (bisección para las
//      raíces, ajuste parabólico para los vértices), así que el último dígito de los
//      4 que se muestran suele ser basura: un vértice real en 3 aterriza en 2.99994
//      y `toFixed(4)` lo imprime fielmente como "2.9999". Aquí no sobra un dígito:
//      el valor ya venía con error, y ningún formateo por dígitos lo arregla.
//   3. SIMBÓLICO: el máximo de sin(x) está en π/2 y se leía "1.5708". El número es
//      correcto y aun así es la peor respuesta posible: quien mira una trigonométrica
//      quiere π, no su desarrollo decimal.
//
// Este módulo ataca los tres con la misma herramienta: buscar la forma CERRADA más
// simple que explique el valor dentro de una tolerancia, y caer al decimal si no hay
// ninguna. El orden (entero → múltiplo racional de π → decimal) va de lo más simple a
// lo más específico, que es también el orden en que un humano los reconocería.
//
// Sobre la TOLERANCIA: `TOL_SNAP` es deliberadamente 1e-4, del orden del error real de
// los estimadores de arriba y del último dígito que el panel llega a enseñar. Es un
// ajuste HONESTO —no un maquillaje— porque solo puede mover la cifra que ya era ruido:
// por debajo de esa escala el panel no distingue 3 de 2.99994, así que escribir "3" no
// afirma nada que el número no dijera. Y los falsos positivos son despreciables: que un
// valor sin relación caiga a menos de 1e-4 de p·π/q con q ≤ 16 es un accidente de
// probabilidad ~1e-3, y cuando ocurre el error introducido sigue siendo invisible.

/** Ajuste máximo que se permite para reconocer una forma cerrada. Ver cabecera. */
const TOL_SNAP = 1e-4;

/** Denominador máximo al buscar v = p·π/q. 16 cubre π/2, π/3, π/4, π/6, π/8, π/12 y
 *  π/16 —los ángulos que de verdad aparecen— sin abrir la puerta a coincidencias
 *  fortuitas con denominadores grandes, que ya no son "forma cerrada reconocible". */
const DEN_MAX_PI = 16;

/** Múltiplo máximo de π. Más allá de 64π el símbolo deja de ayudar a leer. */
const NUM_MAX_PI = 64;

/** Decimales del último recurso, cuando no hay forma cerrada. */
const DECIMALES = 4;

/** Fracción p/q ya reducida. */
interface Fraccion { p: number; q: number }

/**
 * Forma cerrada reconocida en un número. `decimal` es el caso "no hay nada mejor";
 * los otros dos llevan el valor exacto que se ha decidido que el número representa.
 */
export type FormaNumero =
  | { tipo: "entero"; n: number }
  | { tipo: "pi"; f: Fraccion }   // valor = (p/q)·π
  | { tipo: "decimal"; v: number };

const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b));

/** ¿`v` está a menos de la tolerancia de `objetivo`? Escala con la magnitud para que
 *  la tolerancia siga siendo "el último dígito visible" también en valores grandes. */
function cerca(v: number, objetivo: number): boolean {
  return Math.abs(v - objetivo) <= TOL_SNAP * Math.max(1, Math.abs(objetivo));
}

/**
 * La forma cerrada más simple que explica `v`, o `decimal` si no hay ninguna.
 * No lanza: un valor no finito sale como decimal y el llamador decide qué hacer.
 */
export function formaDe(v: number): FormaNumero {
  if (!Number.isFinite(v)) return { tipo: "decimal", v };

  // Cero y enteros primero: son la forma más simple y hacen de guarda para el resto
  // (sin esto, 0 entraría en la búsqueda de π con p=0 y saldría un "0·π" absurdo).
  const n = Math.round(v);
  if (cerca(v, n)) return { tipo: "entero", n: n === 0 ? 0 : n }; // evita el -0

  // Múltiplo racional de π. Se prueba q creciente y se acepta el PRIMERO que encaje,
  // que por construcción es el de denominador más pequeño (π/2 antes que 2π/4).
  const ratio = v / Math.PI;
  for (let q = 1; q <= DEN_MAX_PI; q++) {
    const p = Math.round(ratio * q);
    if (p === 0 || Math.abs(p) > NUM_MAX_PI) continue;
    if (mcd(Math.abs(p), q) !== 1) continue;       // no reducida: ya se probó con q menor
    if (cerca(v, (p * Math.PI) / q)) return { tipo: "pi", f: { p, q } };
  }

  return { tipo: "decimal", v };
}

/** Decimal compacto: hasta 4 cifras y SIN ceros de relleno (1.5 no "1.5000"). */
function decimalCompacto(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "-∞";
  const r = parseFloat(v.toFixed(DECIMALES));
  return Object.is(r, -0) ? "0" : String(r);
}

/**
 * Texto plano del número, para las líneas del panel que no pasan por KaTeX.
 * Usa el símbolo π literal (la fuente del panel lo tiene) en vez de `\pi`.
 */
export function numeroATexto(v: number): string {
  const f = formaDe(v);
  if (f.tipo === "entero") return String(f.n);
  if (f.tipo === "decimal") return decimalCompacto(f.v);

  const { p, q } = f.f;
  const signo = p < 0 ? "-" : "";
  const mag = Math.abs(p);
  const numerador = mag === 1 ? "π" : `${mag}π`;
  return q === 1 ? `${signo}${numerador}` : `${signo}${numerador}/${q}`;
}

/**
 * LaTeX del número, para las líneas que sí se renderizan con KaTeX. El signo va
 * FUERA de la fracción (`-\frac{\pi}{4}`, no `\frac{-\pi}{4}`): es como se escribe a
 * mano y como lo compone KaTeX en el resto del plugin.
 */
export function numeroALatex(v: number): string {
  const f = formaDe(v);
  if (f.tipo === "entero") return String(f.n);
  if (f.tipo === "decimal") {
    if (!Number.isFinite(f.v)) return f.v > 0 ? "\\infty" : "-\\infty";
    return decimalCompacto(f.v);
  }

  const { p, q } = f.f;
  const signo = p < 0 ? "-" : "";
  const mag = Math.abs(p);
  const numerador = mag === 1 ? "\\pi" : `${mag}\\pi`;
  return q === 1 ? `${signo}${numerador}` : `${signo}\\frac{${numerador}}{${q}}`;
}

/**
 * Par ordenado ya formateado, `(x, y)`, en texto plano. Es el formato que usan casi
 * todas las líneas del panel cartesiano.
 */
export function puntoATexto(x: number, y: number): string {
  return `(${numeroATexto(x)}, ${numeroATexto(y)})`;
}
