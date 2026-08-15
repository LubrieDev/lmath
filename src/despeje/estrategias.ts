// ─────────────────────────────────────────────
// despeje · estrategias — cómo se aísla y de UN término
// ─────────────────────────────────────────────
//
// El catálogo de despejes que trabajan sobre el término que contiene y: potencia, raíz,
// raíz de potencia, valor absoluto, trigonométrica inversa, producto, recíproco y trig
// igualada a cero. Cada uno devuelve la ecuación despejada o `null` si no le toca, y
// `despejar()` los prueba en orden.
//
// Es un LEER del término, no un algoritmo global: nada de aquí conoce la ecuación entera.
// Por eso salieron de `despejar.ts`, donde eran un tercio del archivo sin serlo.
//
// Dos de ellos —el recíproco y la trig igualada a cero— terminan volviendo a despejar una
// ecuación más simple. Esa recursión ENTRA POR LA FIRMA (`resolver`) en vez de por un import
// de vuelta a `despejar.ts`: el ciclo existiría igual, pero escondido.

import { parse } from "mathjs";

import {
  contieneVariable, factores, flip, renderTerminos, renderCanonico, formatearCanonico,
  valorConstanteFactor, esNoNegativo, esSiempreNegativo, racionalizarFracciones,
  combinarFracciones, sinFactoresConstantes, type Termino, type Factor, type Nodo,
} from "../formatoExpr";
import { trigDeY, inversionTrig, familiaPeriodica } from "../despejeInverso";
import { ramaDoble } from "../core/parsing/dobleSigno";
import { normalizarEntrada } from "../parser";
import { insertarProductoImplicito } from "../core/parsing/productoImplicito";
import { simplificarExpr } from "../simplificar";
import { type ResultadoDespeje } from "./contrato";
import { fraccionSencilla, normalizarFraccion } from "./aritmetica";

/** El propio `despejar()`, inyectado. Ver la nota de cabecera. */
export type Resolvedor = (ecuacion: string) => ResultadoDespeje | null;

export const contieneY = (n: Nodo): boolean => contieneVariable(n, "y");

/** ¿El factor es exactamente `y` (posiblemente con menos unarios/paréntesis alrededor)?
 *  Devuelve el signo acumulado (+1 / −1) o null si no es la y desnuda. Así `-y` cuenta como
 *  y-lineal con signo −1 (el `-y/2` que mathjs parsea como `(-y)/2`). */
function factorEsY(n: Nodo): 1 | -1 | null {
  if (n.type === "ParenthesisNode") return factorEsY(n.content);
  if (n.type === "SymbolNode" && n.name === "y") return 1;
  if (n.type === "OperatorNode" && n.op === "-" && n.args.length === 1) {
    const s = factorEsY(n.args[0]);
    return s === null ? null : (-s as 1 | -1);
  }
  return null;
}

/** Si el término es LINEAL en y —exactamente un factor `y` (el símbolo desnudo, exp +1,
 *  quizá con un menos) y el resto libre de y— devuelve el signo efectivo y los factores
 *  libres (el "coeficiente" como producto/cociente); si no (y², √y, tan(y), y en varios
 *  factores…), null. Usa `factores`, así reconoce `c·y`, `y/c` (÷ = factor exp −1) y `-y`. */
export function linealEnY(t: Termino): { signo: 1 | -1; libres: Factor[] } | null {
  const fs = factores(t.nodo);
  const conYf = fs.filter((f) => contieneY(f.nodo));
  if (conYf.length !== 1 || conYf[0].exp !== 1) return null;
  const s = factorEsY(conYf[0].nodo);
  if (s === null) return null;
  return { signo: (t.signo * s) as 1 | -1, libres: fs.filter((f) => !contieneY(f.nodo)) };
}

/** Limpia el lado derecho de un despeje lineal con coeficiente ≠ 1: reduce fracciones
 *  (`2x/4`→`x/2`), invierte la división por una fracción (`y/2=x`→`y=2x`, no `y=x·2`),
 *  ordena canónicamente y recupera las fracciones exactas (mismo pipeline que Simplificar,
 *  que sobre un cociente lineal solo distribuye/reduce, no expande de más). */
export function limpiarRHS(rhs: string): string {
  const n = simplificarExpr(rhs);
  return n ? formatearCanonico(racionalizarFracciones(n)) : rhs;
}

/** Serializa una lista de factores como producto mathjs (numerador/denominador). */
export function renderProducto(fs: Factor[]): string {
  const env = (f: Factor) => `(${f.nodo.toString()})`;
  const num = fs.filter((f) => f.exp === 1).map(env);
  const den = fs.filter((f) => f.exp === -1).map(env);
  const n = num.length ? num.join("*") : "1";
  return den.length ? `(${n})/(${den.join("*")})` : n;
}

/** Lado derecho tras pasar los factores LIBRES de y de `t` al otro lado: divide los
 *  del denominador (exp +1) y multiplica los del numerador (−1) sobre `derecha` (con el
 *  signo del término absorbido). `render` elige el orden del numerador: `renderTerminos`
 *  (positivos primero) dentro de una raíz; `renderCanonico` (variables primero) a nivel
 *  superior. String mathjs re-parseable (mathjs normaliza paréntesis). */
function ladoDerecho(
  t: Termino, derecha: Termino[], libres: Factor[],
  render: (ts: Termino[]) => string = renderTerminos
): string {
  const numTs = t.signo === 1 ? derecha : flip(derecha);
  const numStr = render(numTs);
  let rhs = numTs.length > 1 ? `(${numStr})` : numStr; // paréntesis si hay suma
  const suben = libres.filter((f) => f.exp === -1).map((f) => `(${f.nodo.toString()})`);
  const bajan = libres.filter((f) => f.exp === 1).map((f) => `(${f.nodo.toString()})`);
  if (suben.length) rhs = [rhs, ...suben].join("*");
  if (bajan.length) rhs = `(${rhs})/(${bajan.join("*")})`;
  return rhs;
}

/** Quita los ParenthesisNode envolventes (la entrada LaTeX `y^{3}` normaliza a
 *  `y^(3)`, cuyo exponente es un ParenthesisNode, no un ConstantNode directo). */
export function desParen(n: Nodo): Nodo {
  return n.type === "ParenthesisNode" ? desParen(n.content) : n;
}

/** Exponente entero n≥2 si el nodo es `y^n` (base exactamente y), o null. */
export function exponenteY(n: Nodo): number | null {
  const nodo = desParen(n);
  if (nodo.type === "OperatorNode" && nodo.op === "^" && nodo.args.length === 2) {
    const base = desParen(nodo.args[0]);
    const exp = desParen(nodo.args[1]);
    if (base.type === "SymbolNode" && base.name === "y" &&
        exp.type === "ConstantNode" && Number.isInteger(exp.value) && exp.value >= 2)
      return exp.value;
  }
  return null;
}

/** Exponente INVERSO ya escrito, si el nodo es `y^e` con `e` constante NO entera y positiva:
 *  `y^{1/2}`→`"2"`, `y^{3/2}`→`"2/3"`, `y^{0.5637}`→`"1/0.5637"`. null en cualquier otro caso
 *  (el entero es asunto de `exponenteY`).
 *
 *  Se conserva el exponente TAL COMO SE ESCRIBIÓ en el caso decimal (`1/0.5637`, no su
 *  expansión racional) porque es exacto en coma flotante y no inventa una fracción que el
 *  usuario no puso. */
function inversoExponenteFraccionarioY(n: Nodo): string | null {
  const nodo = desParen(n);
  if (nodo.type !== "OperatorNode" || nodo.op !== "^" || nodo.args.length !== 2) return null;
  const base = desParen(nodo.args[0]);
  if (base.type !== "SymbolNode" || base.name !== "y") return null;
  const exp = desParen(nodo.args[1]);
  const r = racionalConstante(exp);
  if (r !== null) {
    if (r.den === 1 || r.num <= 0) return null;
    return r.num === 1 ? `${r.den}` : `${r.den}/${r.num}`;
  }
  const v = valorConstanteFactor(exp);
  if (v === null || !Number.isFinite(v) || Number.isInteger(v) || v <= 0) return null;
  // Un decimal que ES una fracción sencilla se invierte COMO fracción: así `y^{0.5}=R` y
  // `√y=R` —la misma ecuación escrita de dos formas— dan la misma despejada `R²`, en vez de
  // `R^{1/0.5}`. Por encima del listón (`0.5637`) se conserva el decimal tal cual se escribió.
  const f = fraccionSencilla(v);
  if (f !== null) return f.num === 1 ? `${f.den}` : `${f.den}/${f.num}`;
  return `1/${v}`;
}

/** Único término-y de la forma (libres)·yⁿ (n entero ≥2): divide los libres y saca la
 *  raíz n-ésima. IMPAR → `y = ∛(rhs)` (raíz real única). PAR → `y = ±ⁿ√(rhs)`: las DOS
 *  ramas, con el centinela `pm(·)` para el ± (ver abajo). Ambos completos. null si la
 *  parte con y no es un `y^n` puro. */
export function despejePotencia(t: Termino, derecha: Termino[]): ResultadoDespeje | null {
  const fs = factores(t.nodo);
  const conYf = fs.filter((f) => contieneY(f.nodo));
  const libres = fs.filter((f) => !contieneY(f.nodo));
  if (conYf.length !== 1 || conYf[0].exp !== 1) return null;
  const n = exponenteY(conYf[0].nodo);
  if (n === null) {
    // Exponente NO ENTERO (`y^{0.5}`, `y^{3/2}`, `y^{0.5637}`). Antes ni se intentaba, y el
    // resultado dependía de cómo se hubiera ESCRITO la misma ecuación: `√y = x−3` se despejaba
    // y `y^{0.5} = x−3` se quedaba parcial.
    //
    // `y^e` con e no entero solo está definida para y≥0 —el motor evalúa con `Math.pow`, y
    // `Math.pow(-8, 1/3)` es NaN—, y ahí la potencia es estrictamente creciente: es INYECTIVA,
    // así que la inversa `y = R^{1/e}` es única y no hay rama doble que añadir. Como `y^e ≥ 0`
    // en todo ese dominio, la igualdad exige R≥0, que es la misma guarda que ya lleva `√y = R`
    // (por eso ambas escrituras dan ahora exactamente la misma despejada).
    const inv = inversoExponenteFraccionarioY(conYf[0].nodo);
    if (inv === null) return null;
    const Rf = ladoDerecho(t, derecha, libres, renderCanonico);
    const cuerpo = conDominio(`(${Rf})^(${inv})`, Rf);
    return cuerpo === null ? null : { ecuacion: `y = ${cuerpo}`, completo: true };
  }

  // El radicando va con POSITIVOS primero (renderTerminos, el render por defecto de
  // `ladoDerecho`) → `16 - x²`, no `-x² + 16`. Igual para impar y par.
  const rad = ladoDerecho(t, derecha, libres);
  // IMPAR → raíz real única: `y = ∛(9−x³)`.
  if (n % 2 === 1)
    return { ecuacion: `y = nthRoot(${rad}, ${n})`, completo: true };
  // PAR → y = ±ⁿ√(rhs): la potencia par tiene DOS raíces reales. El ± se representa con el
  // centinela unario `pm(·)`, una función que el pipeline reconoce (registrada en
  // productoImplicito) y que `toTex` pinta como `\pm` (ver latex.ts). Así el string sigue
  // siendo re-parseable y encadenable, igual que `nthRoot`. n=2 usa `sqrt` (→ `\sqrt`, sin
  // índice); n≥4 usa `nthRoot(…, n)` (→ `\sqrt[n]`).
  const raiz = n === 2 ? `sqrt(${rad})` : `nthRoot(${rad}, ${n})`;
  const doble = ramaDoble(raiz, rad);   // presupuesto de ramas: ver dobleSigno.ramaDoble
  return doble === null ? null : { ecuacion: `y = ${doble}`, completo: true };
}

/** Índice n de la raíz si el nodo es una RAÍZ de base exacta `y`: `sqrt(y)`→2,
 *  `cbrt(y)`→3, `nthRoot(y, n)`→n (n entero ≥2). null si no lo es. Ve a través de los
 *  ParenthesisNode (misma normalización que `exponenteY`). */
function raizY(n: Nodo): number | null {
  const nodo = desParen(n);
  if (nodo.type !== "FunctionNode") return null;
  const nombre = nodo.fn?.name;
  const arg0 = nodo.args[0] && desParen(nodo.args[0]);
  if (!arg0 || arg0.type !== "SymbolNode" || arg0.name !== "y") return null;
  if (nombre === "sqrt" && nodo.args.length === 1) return 2;
  if (nombre === "cbrt" && nodo.args.length === 1) return 3;
  if (nombre === "nthRoot" && nodo.args.length === 2) {
    const k = desParen(nodo.args[1]);
    if (k.type === "ConstantNode" && Number.isInteger(k.value) && k.value >= 2) return k.value;
  }
  return null;
}

/** Envuelve el cuerpo de un despeje con la GUARDA DE DOMINIO `cond ≥ 0` (centinela `dom`): la
 *  inversión de una raíz PAR o de un valor absoluto solo vale donde el otro lado es no negativo.
 *  ÚNICO punto del motor que decide qué pasa con una condición de dominio; toda la matemática
 *  de la decisión vive en el análisis de signo (`signoDe`, formatoExpr), no aquí:
 *   • condición demostrablemente ≥0 (`x²+1`, `|x|+3`, `2|x|`, `√x+|x|`, `pi`) → el cuerpo TAL
 *     CUAL: la guarda sería siempre cierta y la coletilla, ruido;
 *   • condición demostrablemente <0 (`-x²-1`, `pi-4`) → null: la ecuación NO tiene solución
 *     real y no se fuerza un despeje inventado; queda la forma parcial;
 *   • en otro caso `dom(cuerpo, cond)`, con la condición ya REDUCIDA de factores constantes
 *     (`x/2` → `x`): así el motor evalúa y el panel pinta exactamente la misma condición. */
export function conDominio(cuerpo: string, cond: string): string | null {
  let c: Nodo;
  try { c = parse(cond) as unknown as Nodo; } catch { return `dom(${cuerpo}, ${cond})`; }
  if (esNoNegativo(c)) return cuerpo;
  if (esSiempreNegativo(c)) return null;
  return `dom(${cuerpo}, ${sinFactoresConstantes(c).toString()})`;
}

/** Único término-y de la forma (libres)·ⁿ√y: divide los libres y ELEVA a la n para
 *  invertir la raíz. `x−√y=27` → `y = (x−27)²` (completo). El elevar es el inverso de
 *  la raíz principal; formalmente añade la rama del radicando negativo (misma licencia
 *  que el elevar al cuadrado toma en un despeje de manual), pero deja y aislada. El rhs
 *  es la BASE de una potencia a nivel superior → orden canónico. null si la parte con y
 *  no es una raíz pura de y. */
export function despejeRaiz(t: Termino, derecha: Termino[]): ResultadoDespeje | null {
  const fs = factores(t.nodo);
  const conYf = fs.filter((f) => contieneY(f.nodo));
  const libres = fs.filter((f) => !contieneY(f.nodo));
  if (conYf.length !== 1 || conYf[0].exp !== 1) return null;
  const n = raizY(conYf[0].nodo);
  if (n === null) return null;
  const R = ladoDerecho(t, derecha, libres, renderCanonico);
  // Índice IMPAR (∛y…): x↦xⁿ es biyección en ℝ, elevar es EXACTO → sin guarda. Índice PAR
  // (√y…): `√y=R` exige R≥0; elevar a R² dibujaría la rama fantasma R<0 → guarda de dominio.
  if (n % 2 === 1) return { ecuacion: `y = (${R})^${n}`, completo: true };
  const cuerpo = conDominio(`(${R})^${n}`, R);
  return cuerpo === null ? null : { ecuacion: `y = ${cuerpo}`, completo: true };
}

/** Índice de raíz `n` y potencia `m` si el nodo es `ⁿ√(y^m)` —una raíz (sqrt/cbrt/nthRoot)
 *  cuyo radicando es una POTENCIA de y (base exactamente y, m entero ≥2)—: `∛(y²)`→{n:3,m:2}.
 *  La raíz de la y DESNUDA (m=1) es asunto de `despejeRaiz`; aquí solo m≥2. null si no encaja. */
function raizDePotenciaY(n0: Nodo): { n: number; m: number } | null {
  const nodo = desParen(n0);
  if (nodo.type !== "FunctionNode") return null;
  const nombre = nodo.fn?.name;
  let n: number | null = null;
  let rad: Nodo | undefined;
  if (nombre === "sqrt" && nodo.args.length === 1) { n = 2; rad = nodo.args[0]; }
  else if (nombre === "cbrt" && nodo.args.length === 1) { n = 3; rad = nodo.args[0]; }
  else if (nombre === "nthRoot" && nodo.args.length === 2) {
    const k = desParen(nodo.args[1]);
    if (k.type === "ConstantNode" && Number.isInteger(k.value) && k.value >= 2) { n = k.value; rad = nodo.args[0]; }
  }
  if (n === null || rad === undefined) return null;
  const m = exponenteY(rad); // `y^m` con base exactamente y, m entero ≥2
  return m === null ? null : { n, m };
}

/** Único término-y de la forma (libres)·ⁿ√(y^m): pasa los libres al otro lado, ELEVA a n
 *  para invertir la raíz (`y^m = Rⁿ`) y saca la raíz m-ésima para aislar y. El astroide
 *  `∛(y²)=1−∛(x²)` → `y² = (1−∛(x²))³` → `y = ±√((1−∛(x²))³)`. m PAR → las DOS ramas (centinela
 *  `pm`); m IMPAR → raíz real única. Como `∛(y²)≥0` obliga a R≥0, elevar no añade soluciones
 *  espurias: donde R<0 (fuera del dominio) el radicando sale negativo y la raíz par es NaN, es
 *  decir sin curva —igual que la original—. Completo. null si el factor con y no es `ⁿ√(y^m)`. */
export function despejeRaizDePotencia(t: Termino, derecha: Termino[]): ResultadoDespeje | null {
  const fs = factores(t.nodo);
  const conYf = fs.filter((f) => contieneY(f.nodo));
  const libres = fs.filter((f) => !contieneY(f.nodo));
  if (conYf.length !== 1 || conYf[0].exp !== 1) return null;
  const info = raizDePotenciaY(conYf[0].nodo);
  if (info === null) return null;
  const { n, m } = info;
  // ⁿ√(y^m) = R (libres al otro lado, radicando con positivos primero) ⇒ y^m = Rⁿ.
  const R = ladoDerecho(t, derecha, libres);
  const base = `(${R})^${n}`;
  const cuerpo = m % 2 === 1
    ? `nthRoot(${base}, ${m})`
    : ramaDoble(m === 2 ? `sqrt(${base})` : `nthRoot(${base}, ${m})`, R);
  if (cuerpo === null) return null;   // presupuesto de ramas agotado → parcial honesto
  // Índice externo IMPAR: Rⁿ preserva el signo, así que donde R<0 el radicando sale negativo
  // y la raíz par da NaN (sin fantasma) → fiel sin guarda. Índice externo PAR: Rⁿ≥0 SIEMPRE
  // (borra el signo de R) y `ⁿ√(yᵐ)=R` exige R≥0 → guarda de dominio (era el bug: `√(y⁴)=−3`
  // salía con curva inventada).
  if (n % 2 === 1) return { ecuacion: `y = ${cuerpo}`, completo: true };
  const guardado = conDominio(cuerpo, R);
  return guardado === null ? null : { ecuacion: `y = ${guardado}`, completo: true };
}

/** Valor ENTERO de un exponente. Usa `valorConstanteFactor` (compartido) porque la entrada
 *  `|y|^{-1}` normaliza a `abs(y)^(-1)`, cuyo exponente mathjs NO parsea como
 *  `ConstantNode(−1)` sino como paréntesis sobre un menos unario: sin desenvolverlo, el
 *  exponente negativo no se reconocía y el despeje se quedaba parcial. null si no es entero. */
export function exponenteEntero(n: Nodo): number | null {
  const v = valorConstanteFactor(n);
  return v !== null && Number.isInteger(v) ? v : null;
}

/** ¿El nodo es exactamente `abs(y)` (posibles paréntesis)? El valor absoluto de la y
 *  desnuda —no `abs(y+1)` ni `abs(2y)`, que exigirían despejar el interior. */
function esAbsDeY(n: Nodo): boolean {
  const nodo = desParen(n);
  if (nodo.type !== "FunctionNode" || nodo.fn?.name !== "abs" || nodo.args.length !== 1) return false;
  const arg = desParen(nodo.args[0]);
  return arg.type === "SymbolNode" && arg.name === "y";
}

/** Valor RACIONAL de un exponente constante como fracción num/den (num con signo). Va más
 *  allá de `exponenteEntero` para reconocer los exponentes fraccionarios `|y|^{1/2}` (que
 *  mathjs parsea como el `OperatorNode` `/`, no un ConstantNode). null si no es una fracción
 *  de enteros (un símbolo como `pi`, un decimal raro…). */
function racionalConstante(n: Nodo): { num: number; den: number } | null {
  const nodo = desParen(n);
  if (nodo.type === "OperatorNode" && nodo.op === "/" && nodo.args.length === 2) {
    const a = racionalConstante(nodo.args[0]);
    const b = racionalConstante(nodo.args[1]);
    if (a === null || b === null || b.num === 0) return null;
    return normalizarFraccion(a.num * b.den, a.den * b.num);
  }
  if (nodo.type === "OperatorNode" && nodo.op === "-" && nodo.args.length === 1) {
    const a = racionalConstante(nodo.args[0]);
    return a === null ? null : { num: -a.num, den: a.den };
  }
  const v = valorConstanteFactor(nodo);
  return v !== null && Number.isInteger(v) ? { num: v, den: 1 } : null;
}

/** Índice n y radicando de una RAÍZ (sqrt→2, cbrt→3, nthRoot(·,n)→n, n entero ≥2), o null.
 *  `√|y|` es `sqrt(abs(y))`, es decir `|y|^{1/2}`: la raíz es un exponente fraccionario más. */
function indiceRaiz(n: Nodo): { n: number; rad: Nodo } | null {
  const nodo = desParen(n);
  if (nodo.type !== "FunctionNode") return null;
  const nombre = nodo.fn?.name;
  if (nombre === "sqrt" && nodo.args.length === 1) return { n: 2, rad: nodo.args[0] };
  if (nombre === "cbrt" && nodo.args.length === 1) return { n: 3, rad: nodo.args[0] };
  if (nombre === "nthRoot" && nodo.args.length === 2) {
    const k = exponenteEntero(nodo.args[1]);
    if (k !== null && k >= 2) return { n: k, rad: nodo.args[0] };
  }
  return null;
}

/** Único término-y de la forma (libres)·abs(y)^e: exponente EFECTIVO `e = num/den` de abs(y)
 *  (RACIONAL, no solo entero) y los factores libres de y. null si el factor con y no es abs(y)
 *  puro. El exponente puede venir de: el signo del factor (±1, num/denominador de la fracción
 *  —`1/|y|` es abs(y)^(-1)—), una potencia explícita `|y|^{k}` con k racional (`|y|^{1/2}`), o
 *  una RAÍZ envolvente `ⁿ√|y|` (`√|y|` = `|y|^{1/2}`). Unifica también las dos formas de `1/|y|`:
 *  cruda `abs(y)^(-1)` (potencia) o simplificada `1/abs(y)` (factor en denominador, `exp=-1`). */
function absYExponente(t: Termino): { num: number; den: number; libres: Factor[] } | null {
  const fs = factores(t.nodo);
  const conYf = fs.filter((f) => contieneY(f.nodo));
  const libres = fs.filter((f) => !contieneY(f.nodo));
  if (conYf.length !== 1) return null;
  let num = conYf[0].exp, den = 1;              // ±1 según numerador/denominador
  let nucleo = desParen(conYf[0].nodo);
  // Potencia explícita `abs(y)^k` (k racional; la que `factores` no separa): acumula el k.
  if (nucleo.type === "OperatorNode" && nucleo.op === "^" && nucleo.args.length === 2) {
    const k = racionalConstante(nucleo.args[1]);
    if (k === null || k.num === 0) return null;
    num *= k.num; den *= k.den;
    nucleo = desParen(nucleo.args[0]);
  } else {
    // Raíz envolvente `ⁿ√(abs(y))` (√|y|, ∛|y|, ⁿ√|y|): un exponente 1/n más sobre abs(y).
    const r = indiceRaiz(nucleo);
    if (r !== null) { den *= r.n; nucleo = desParen(r.rad); }
  }
  if (!esAbsDeY(nucleo)) return null;
  const frac = normalizarFraccion(num, den);
  return frac === null ? null : { ...frac, libres };
}

/** Aplana la expresión de |y| a una sola fracción legible (`1/(1−1/|x|)` → `|x|/(|x|−1)`):
 *  combina fracciones anidadas y recupera fracciones exactas. Sin la guarda de dominio de
 *  Simplificar (que rechazaría la cancelación por diferir en x=0): aquí el ± ya cambia el
 *  dominio a propósito. String mathjs re-parseable. */
function limpiarAbsoluto(s: string): string {
  try { return formatearCanonico(racionalizarFracciones(combinarFracciones(parse(s) as unknown as Nodo))); }
  catch { return s; }
}

/** Único término-y de la forma (libres)·abs(y)^e (e RACIONAL): aísla |y| y saca las DOS ramas
 *  del absoluto. `1/|x|+1/|y|=1` → `|y| = |x|/(|x|−1)` → `y = ±|x|/(|x|−1)`; `√|y|+tan x=2` →
 *  `|y| = (2−tan x)²` → `y = ±(2−tan x)²`. Se pasan los libres al otro lado (`abs(y)^e = R`) y
 *  se INVIERTE el exponente para aislar `|y| = R^{1/e}`; con `e = num/den`, `1/e = den/num` es la
 *  fracción `a/b` (a=den, b=|num|, con el signo de num haciendo el recíproco). Como el despeje de
 *  raíz, añade formalmente la rama del signo opuesto (licencia de "álgebra de manual"); deja y
 *  aislada → completo. null si la parte con y no es un abs(y) puro.
 *
 *  El radicando/base va en orden CANÓNICO (`renderCanonico`, como en `despejeRaiz`): es la base
 *  de una potencia de nivel superior, así `(2−x²)` sale `-x^2 + 2`, no `2 - x^2`. */
export function despejeAbsoluto(t: Termino, derecha: Termino[]): ResultadoDespeje | null {
  const info = absYExponente(t);
  if (!info) return null;
  const { num, den, libres } = info;
  // abs(y)^e = R (los factores libres pasan dividiendo/multiplicando al otro lado).
  const R = ladoDerecho(t, derecha, libres, renderCanonico);
  // |y| = R^{1/e} = R^{a/b}, con a=den, b=|num|; num<0 hace el recíproco. Una raíz b-ésima
  // usa `sqrt` (b=2, → `\sqrt` sin índice) o `nthRoot` (b≥3, → `\sqrt[b]`), la MISMA convención
  // que `despejePotencia`; una potencia entera (b=1, a≥2) se ELEVA literalmente, como el inverso
  // de la raíz en `despejeRaiz` (`|y|^{1/2}=R` ⇒ `|y|=R²`).
  const a = den, b = Math.abs(num), neg = num < 0;
  const raizDe = (r: string, n: number) => (n === 2 ? `sqrt(${r})` : `nthRoot((${r}), ${n})`);
  let mag: string;
  let esPotencia = false;   // ¿|y| es una BASE elevada a un entero? → no aplanar (expandiría)
  if (b === 1) {
    if (a === 1) mag = R;                             // |y| = R
    else { mag = `(${R})^${a}`; esPotencia = true; } // |y| = Rᵃ
  } else if (a === 1) {
    mag = raizDe(R, b);                              // |y| = ᵇ√R
  } else {
    mag = `nthRoot((${R})^${a}, ${b})`;             // |y| = ᵇ√(Rᵃ)
    esPotencia = true;
  }
  const aby = neg ? `1/(${mag})` : mag;
  // Las formas con potencia se dejan literales (como `despejeRaiz`): `limpiarAbsoluto` EXPANDIRÍA
  // `(-x²+2)²`. El resto (recíprocos, raíces, e=1) sí se aplanan a una fracción legible.
  const cuerpo = esPotencia ? aby : limpiarAbsoluto(aby);
  const doble = ramaDoble(cuerpo, R);   // presupuesto de ramas: ver dobleSigno.ramaDoble
  if (doble === null) return null;
  // GUARDA DE DOMINIO: como `abs(y)^e ≥ 0` (e racional), la ecuación `abs(y)^e = R` exige R≥0
  // —donde R<0 no hay y—. La condición es R (el lado derecho), NO la magnitud `R^{1/e}` (que
  // al invertir el exponente PAR ya es ≥0 y no captaría la restricción: `√|y|=1−x` ⇒ |y|=(1−x)²
  // parece libre, pero solo vale x≤1). Constante <0 → sin solución → parcial.
  const guardado = conDominio(doble, R);
  return guardado === null ? null : { ecuacion: `y = ${guardado}`, completo: true };
}

/** Único término-y de la forma (libres)·T(y) con T trig PERIÓDICA de la y desnuda:
 *  pasa los libres al otro lado e invierte con la solución GENERAL —una FAMILIA
 *  discreta infinita, no una función—: `tan(y)+x=2` → `y = atan(2 - x) + fam(k, pi)`
 *  (= arctan(2−x)+kπ, k∈ℤ). La tabla de inversas y la semántica del centinela `fam`
 *  viven en despejeInverso.ts; aquí solo la manipulación de términos. Completo. */
export function despejeTrigInverso(t: Termino, derecha: Termino[]): ResultadoDespeje | null {
  const fs = factores(t.nodo);
  const conYf = fs.filter((f) => contieneY(f.nodo));
  const libres = fs.filter((f) => !contieneY(f.nodo));
  if (conYf.length !== 1 || conYf[0].exp !== 1) return null;
  const tipo = trigDeY(conYf[0].nodo);
  if (tipo === null) return null;
  const rhs = inversionTrig(tipo, ladoDerecho(t, derecha, libres));
  return rhs === null ? null : { ecuacion: `y = ${rhs}`, completo: true };
}

/** Un único término-y que es un PRODUCTO: divide los factores libres de y al otro
 *  lado. `tan(y)·(x²+1) = √(x+1)` → `tan(y) = √(x+1)/(x²+1)`. null si no hay factores
 *  libres que separar (todo el término contiene y). El string es re-parseable: mathjs
 *  normaliza los paréntesis redundantes y produce el `\frac` al pasar por el pipeline. */
export function despejeMultiplicativo(t: Termino, derecha: Termino[]): string | null {
  const fs = factores(t.nodo);
  const conYf = fs.filter((f) => contieneY(f.nodo));
  const libres = fs.filter((f) => !contieneY(f.nodo));
  if (libres.length === 0 || conYf.length === 0) return null;
  return `${renderProducto(conYf)} = ${ladoDerecho(t, derecha, libres)}`;
}

/** Único término-y de la forma (libres)·E⁻¹ con E conteniendo y (y en el DENOMINADOR):
 *  invierte el recíproco —E sube, `derecha` baja— y RECURRE para aislar y de E, que ninguna
 *  otra estrategia toca (todas exigen la y en el NUMERADOR, exp +1). `1/y=x` → `y=1/x`;
 *  `x/y=2` → `y=x/2`; `1/(x²+y²)=kπ` → `x²+y²=1/(kπ)` → `y=±√(1/(kπ)−x²)`. Es EXACTO: un
 *  recíproco `1/E` nunca vale 0, y donde `derecha=0` ambas formas quedan indefinidas (mismo
 *  dominio). Solo se acepta si la recursión COMPLETA el despeje; si no, null → forma parcial de
 *  siempre. La recursión es de un nivel: tras invertir, la y de E queda en el numerador. */
export function despejeReciproco(
  t: Termino, derecha: Termino[], resolver: Resolvedor
): ResultadoDespeje | null {
  const fs = factores(t.nodo);
  const conYf = fs.filter((f) => contieneY(f.nodo));
  const libres = fs.filter((f) => !contieneY(f.nodo));
  if (conYf.length !== 1 || conYf[0].exp !== -1) return null;
  if (derecha.length === 0) return null; // `1/E = 0`: sin solución (el recíproco nunca es 0)
  const E = conYf[0].nodo.toString();
  const numFree = libres.filter((f) => f.exp === 1).map((f) => `(${f.nodo.toString()})`);
  const denFree = libres.filter((f) => f.exp === -1).map((f) => `(${f.nodo.toString()})`);
  // signo·numFree·E⁻¹ / denFree = derecha  ⇒  E = signo·numFree / (derecha·denFree).
  const arriba = (t.signo === -1 ? "-" : "") + (numFree.length ? numFree.join("*") : "1");
  // Los factores libres del denominador van DELANTE del valor de `derecha` (coeficiente
  // numérico primero: `5/(2y)=x` → `y=5/(2x)`, no `5/(x2)` —`x·2` se pinta pegado y al revés).
  const abajo = [...denFree, `(${renderTerminos(derecha)})`].join("*");
  const rec = resolver(`${E} = (${arriba})/(${abajo})`);
  return rec && rec.completo ? rec : null;
}

/** Familia de `T(u) = 0` (RHS de `u = …`): dónde se anula cada trig. `sin`/`tan` → kπ;
 *  `cos`/`cot` → π/2 + kπ; `sec`/`csc` NUNCA se anulan (sin solución). */
const TRIG_CERO: Record<string, { periodo: string; base: string | null } | null | undefined> = {
  sin: { periodo: "pi", base: null }, tan: { periodo: "pi", base: null },
  cos: { periodo: "pi", base: "pi/2" }, cot: { periodo: "pi", base: "pi/2" },
  sec: null, csc: null,
};

/** ¿La expresión (aún con y sin aislar) es SIEMPRE > 0 sobre una malla del plano (x,y)?
 *  Decide si la familia `kπ` de `sin(u)=0`/`tan(u)=0` es ℕ (kπ debe ser > 0 para que exista
 *  curva: `u=1/(x²+y²)>0`) o ℤ. Conservador: cualquier valor ≤ 0 —o malla sin evidencia
 *  suficiente— → false (ℤ). Mismo espíritu numérico que `ramaReal`. */
function uSiemprePositivo(uStr: string): boolean {
  let f: (s: Record<string, number>) => unknown;
  try { const c = parse(insertarProductoImplicito(normalizarEntrada(uStr))).compile(); f = (s) => c.evaluate(s); }
  catch { return false; }
  const malla = [-8, -3.5, -1.5, -0.5, 0.3, 0.9, 2.2, 5.1];
  let vistos = 0;
  for (const x of malla) for (const y of malla) {
    let v: unknown;
    try { v = f({ x, y }); } catch { continue; }
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v <= 1e-9) return false;
    vistos++;
  }
  return vistos >= 8; // evidencia mínima: no declarar "positivo" por una malla casi toda NaN
}

/** `T(u) = 0` con T trig y u conteniendo y (NO desnuda) → invierte a la familia
 *  `u = base + k·período` y RECURRE para aislar y de u. `sin(1/(x²+y²))=0` → `1/(x²+y²)=kπ`
 *  → (recíproco + círculo) → `y = ±√(1/(kπ)−x²)`. Para `sin`/`tan` (familia kπ) el parámetro
 *  es ℕ si u>0 en todo el plano (kπ debe ser positivo para que haya curva) y ℤ si no; `cos`/
 *  `cot` (π/2+kπ) van a ℤ. Solo la forma pura `T(u)=0` sin factores libres —la del ejemplo—;
 *  `T(y)` desnuda es de `despejeTrigInverso`. null si no encaja o la recursión no completa. */
export function despejeTrigCero(
  t: Termino, derecha: Termino[], resolver: Resolvedor
): ResultadoDespeje | null {
  // Solo `T(u) = 0`: el lado libre de y debe ser 0 (el RHS `= 0` deja el término constante
  // `0` en `derecha`, que aquí se ignora; un `T(u) = c≠0` sí se descarta —otra estrategia—).
  const noNulos = derecha.filter((d) => {
    const n = desParen(d.nodo);
    return !(n.type === "ConstantNode" && n.value === 0);
  });
  if (noNulos.length !== 0) return null;
  const nodo = desParen(t.nodo);
  if (nodo.type !== "FunctionNode" || nodo.args?.length !== 1) return null;
  const info = TRIG_CERO[nodo.fn?.name ?? ""];
  if (!info) return null; // no es trig soportada, o sec/csc (nunca 0 → sin solución)
  const u = desParen(nodo.args[0]);
  if (!contieneY(u) || (u.type === "SymbolNode" && u.name === "y")) return null; // desnuda → otra vía
  const uStr = u.toString();
  // El parámetro se ASIGNA (no se fija en `k`): la recursión de abajo puede invertir otra
  // periódica y necesitar el suyo propio. `natural` = sin/tan con u>0 ⇒ kπ debe ser positivo.
  const cero = familiaPeriodica(info.periodo, uStr, info.base === null && uSiemprePositivo(uStr));
  if (cero === null) return null;
  const rhs = info.base ? `${info.base} + ${cero}` : cero;
  const rec = resolver(`${uStr} = ${rhs}`);
  return rec && rec.completo ? rec : null;
}

// ─────────────────────────────────────────────
// Despeje CUADRÁTICO en y^g (bicuadráticas y cuadráticas en y)
// ─────────────────────────────────────────────
//
// Las estrategias de arriba aíslan y cuando aparece en UN solo término manejable. Una
// ecuación como `(x²+y²)² − 2(x²−y²) = 0` (lemniscata) es, tras expandir, un POLINOMIO en y
// de grado 4 con SOLO potencias pares: `y⁴ + (2x²+2)y² + (x⁴−2x²) = 0`, es decir CUADRÁTICA en
// u = y². Se resuelve con la fórmula reducida (completar cuadrados) `u = −p ± √(p²−q)` con
// `p = B/2A`, `q = C/A`: así `p²−q` sale como POLINOMIO limpio (`4x²+1`) sin tener que factorizar
// un cuadrado perfecto del discriminante. Luego `y = ±√u` (g par) o `y = u` (g=1, cuadrática en y).
//
// La RAMA física se elige NUMÉRICAMENTE (`ramaReal`): de las dos raíces u₊, u₋, solo se muestran
// las que dan y real en la muestra (para la lemniscata, u₋ = −(x²+1)−√(4x²+1) < 0 siempre → se
// descarta, quedando `y = ±√(−(x²+1)+√(4x²+1))`). Y TODO el resultado se valida sustituyéndolo en
// la ecuación original: una rama que no la cumpla se descarta (corrección garantizada).
