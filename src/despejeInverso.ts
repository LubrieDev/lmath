// ─────────────────────────────────────────────
// Despeje por INVERSIÓN de la función externa: T(y) = g(x) ⇒ y = T⁻¹(g) + familia
// ─────────────────────────────────────────────
//
// Conocimiento de INVERSIÓN aislado de la manipulación de términos (que vive en
// despejar.ts): aquí están la tabla de inversas trigonométricas, sus períodos y la
// forma simbólica de la solución GENERAL. Una trig periódica no tiene UNA inversa:
// `tan(y) = g` tiene infinitas soluciones y = arctan(g) + kπ con k∈ℤ. Esa familia
// DISCRETA se representa con el centinela binario `fam(k, período)` —el análogo
// periódico del `pm(·)` del doble signo—: el string sigue siendo mathjs re-parseable
// y encadenable, `toTex` lo pinta `k\pi`/`2k\pi` y la ecuación gana la coletilla
// `, k∈ℤ` (ambos en latex.ts). Es la información matemática completa: sin el k∈ℤ,
// `+kπ` se leería como una constante y la familia se perdería.
//
// A diferencia de `pm`, `fam` NO se expande para graficar (no se pueden enumerar
// infinitas ramas): el despeje es PRESENTACIÓN. Lo graficado es siempre la ecuación
// ORIGINAL, que la vía numérica ya traza con esta misma matemática en forma de
// geometría (separarTrigY → ProveedorImplicitoPeriodico, cuya tabla INVERSAS es el
// espejo numérico de la de aquí: mismos períodos, mismas ramas base). Por lo mismo,
// `fam` tampoco se evalúa (su `k` es un símbolo libre): no se registra en
// constantes.ts; quien evalúe una expresión con `fam` obtiene el error de símbolo
// libre y los consumidores ya lo capturan (todos evalúan en try/catch).
//
// Formas emitidas (solución general de manual). Las de período 2π tienen DOS ramas
// base que se funden en UN `±` (un solo `pm` → la correlación de signos del doble
// signo no afecta):
//   tan(y)=g ⇒ y = arctan(g) + kπ          cot(y)=g ⇒ y = arccot(g) + kπ
//   cos(y)=g ⇒ y = ±arccos(g) + 2kπ        sec(y)=g ⇒ y = ±arcsec(g) + 2kπ
//   sin(y)=g ⇒ y = π/2 ± arccos(g) + 2kπ   csc(y)=g ⇒ y = π/2 ± arcsec(g) + 2kπ
// (sin: π/2−arccos g = arcsin g y π/2+arccos g = π−arcsin g, las dos bases clásicas
// en una sola expresión; csc y sec invierten vía 1/g: asec(g)=acos(1/g), constantes.ts.)

import { parse } from "mathjs";

import {
  contieneVariable, terminos, factores, valorConstanteFactor, rationalizeSeguro,
  type Termino, type Nodo,
} from "./formatoExpr";

const contieneY = (n: Nodo): boolean => contieneVariable(n, "y");

/** Trig de y invertible aquí: las seis periódicas con inversa de manual. */
export type TrigInvertible = "tan" | "cot" | "sin" | "cos" | "sec" | "csc";

const TRIGS: ReadonlySet<string> = new Set<TrigInvertible>(
  ["tan", "cot", "sin", "cos", "sec", "csc"]
);

/** Solución general de T(y) = g como string mathjs (el RHS de `y = …`). El argumento
 *  de una función no necesita paréntesis extra; el `+` de la familia queda a nivel
 *  superior, que es donde latex.ts pinta `… + k\pi`. */
const INVERSAS: Record<TrigInvertible, (g: string) => string> = {
  tan: (g) => `atan(${g}) + fam(k, pi)`,
  cot: (g) => `acot(${g}) + fam(k, pi)`,
  cos: (g) => `pm(acos(${g})) + fam(k, 2*pi)`,
  sec: (g) => `pm(asec(${g})) + fam(k, 2*pi)`,
  sin: (g) => `pi/2 + pm(acos(${g})) + fam(k, 2*pi)`,
  csc: (g) => `pi/2 + pm(asec(${g})) + fam(k, 2*pi)`,
};

/** Quita los ParenthesisNode envolventes (misma normalización que despejar.ts; copia
 *  local mínima para no importar de despejar.ts —que importa este módulo— y evitar
 *  el ciclo). */
function desParen(n: Nodo): Nodo {
  return n.type === "ParenthesisNode" ? desParen(n.content) : n;
}

/** ¿El nodo es exactamente T(y) —una trig periódica de la y DESNUDA—? Devuelve el
 *  nombre de T o null. `tan(2y)`, `tan(y+1)`, `tan(y)^2` → null (despejar el interior
 *  o la potencia es otro problema; se deja a las demás estrategias). */
export function trigDeY(n: Nodo): TrigInvertible | null {
  const nodo = desParen(n);
  if (nodo.type !== "FunctionNode" || nodo.args?.length !== 1) return null;
  const nombre = nodo.fn?.name ?? "";
  if (!TRIGS.has(nombre)) return null;
  const arg = desParen(nodo.args[0]);
  return arg.type === "SymbolNode" && arg.name === "y" ? (nombre as TrigInvertible) : null;
}

/** RHS de la solución general de T(y) = g (string mathjs re-parseable). */
export function inversionTrig(tipo: TrigInvertible, g: string): string {
  return INVERSAS[tipo](g);
}

/** ¿El string (mathjs) contiene el centinela de familia `fam(…)`? Mismo criterio de
 *  frontera que `tieneDobleSigno` (dobleSigno.ts) para no confundir un identificador
 *  que termine en "fam". */
export function tieneFamilia(expr: string): boolean {
  return /(?<![a-zA-Z0-9_])fam\s*\(/.test(expr);
}

// ── Clasificación de un despeje por sus centinelas ───────────────────────────
//
// La forma de la solución se DERIVA del string (los centinelas son detectables), sin
// ampliar el resultado `{ ecuacion, completo }` de despejar.ts ni tocar a sus
// consumidores: quien necesite distinguir, clasifica; quien no, ignora.
//   • "unica"             y = f(x)                     (sin centinelas)
//   • "ramas-finitas"     y = ±…                       (pm/mp: 2 ramas correlacionadas)
//   • "familia-periodica" y = … + k·período, k∈ℤ       (fam: familia discreta infinita,
//                          posiblemente con un ± dentro: ±arccos + 2kπ)

export type FormaDespeje = "unica" | "ramas-finitas" | "familia-periodica";

/** Forma de la solución que representa un despeje (string mathjs de despejar.ts). */
export function clasificarDespeje(ecuacion: string): FormaDespeje {
  if (tieneFamilia(ecuacion)) return "familia-periodica";
  if (/(?<![a-zA-Z0-9_])(pm|mp)\s*\(/.test(ecuacion)) return "ramas-finitas";
  return "unica";
}

// ─────────────────────────────────────────────
// Despeje CUADRÁTICO en cos(y): trig de argumentos COMPUESTOS
// ─────────────────────────────────────────────
//
// La vía de arriba exige que la trig de y sea UN factor de UN término. Una ecuación como
//   4(cos x + cos y) + 2cos(x+y) + 2cos(x−y) − 2cos 2x − 2cos 2y − 7 = 0
// tiene la y repartida en varios términos y DENTRO de argumentos compuestos. Pero es, tras
// expandir las identidades de adición y ángulo doble, un POLINOMIO en u = cos(y):
//   −4u² + (4+4cos x)·u + (−4cos²x + 4cos x − 3) = 0
// (los sin y de cos(x±y) se CANCELAN entre sí; cos 2y aporta el u²). Se resuelve la
// cuadrática en u y se invierte con la MISMA solución general del cos: y = ±arccos(u) + 2kπ.
//
// Pipeline (todo simbólico-EXACTO, con validación numérica final):
//   1. expandirTrig       sin/cos de sumas y múltiplos enteros → átomos sin(v)/cos(v).
//   2. sustituirAtomos    cos(y)→CY, sin(y)→SY; cada función SIN y → símbolo auxᵢ
//                         (cos(x)→aux0…). El resultado es un POLINOMIO puro.
//   3. rationalizeSeguro  distribuye los productos (con su presupuesto de monomios).
//   4. colectar           monomios con coeficiente NUMÉRICO exacto: aquí se cancelan los
//                         términos semejantes (±sin x·sin y) que rationalize deja sueltos.
//   5. eliminarSY         SY^par → (1−CY²)^m; si sobrevive un SY impar, no es polinomio
//                         en cos y → null (fuera de alcance; p.ej. sin y + cos y = x).
//   6. cuadraticaEnCY     A·CY² + B·CY + C con A,B,C polinomios en los auxᵢ (grado ≤2).
//   7. fórmula general    u = (−B ± √(B²−4AC))/2A, con la aritmética de polinomios de
//                         monomios (exacta): extracción del factor CUADRADO del
//                         discriminante (√(16d)=4√d), reducción de la fracción común y
//                         COMPLETAR EL CUADRADO del radicando (−3c²+6c−2 → 1−3(c−1)²).
//   8. validación         cada rama u(x) se comprueba contra la ecuación ORIGINAL en una
//                         muestra (|u|≤1 y F(x, arccos u)≈0); la que falla se descarta.
//   9. emisión            y = pm(acos(u)) + fam(k, 2π). El ± interno (dos raíces u) y el
//                         externo (arccos) son INDEPENDIENTES; como el despeje con `fam`
//                         es SOLO presentación (nunca se re-expande para graficar), la
//                         correlación de signos de dobleSigno.ts no los malinterpreta.
//
// La simetría y→−y está garantizada: toda la dependencia en y quedó en cos y y sin²y
// (ambas pares), así que si F(x, arccos u)=0 también F(x, −arccos u)=0 — el ± externo no
// necesita validación aparte.

// ── Expansión trigonométrica (adición y ángulo múltiple) ─────────────────────

const MAX_ANGULO = 8; // tope de k en sin/cos(k·v): más allá la expansión explota sin ganancia

/** Quita paréntesis y devuelve `{k, sym}` si el término es k·v (k entero, v símbolo). */
function multiploDeSimbolo(t: Termino): { k: number; sym: string } | null {
  let k: number = t.signo;
  let sym: string | null = null;
  for (const f of factores(t.nodo)) {
    const v = valorConstanteFactor(f.nodo);
    if (v !== null) { k *= f.exp === 1 ? v : 1 / v; continue; }
    const nodo = desParen(f.nodo);
    if (nodo.type === "SymbolNode" && f.exp === 1 && sym === null) { sym = nodo.name; continue; }
    return null;
  }
  return sym !== null && Number.isInteger(k) && Math.abs(k) <= MAX_ANGULO ? { k, sym } : null;
}

/** sin(k·v) / cos(k·v) como polinomio en sin(v), cos(v) (recursión de ángulo múltiple). */
function sinKv(k: number, v: string): string {
  if (k === 0) return "0";
  if (k < 0) return `(-(${sinKv(-k, v)}))`;
  if (k === 1) return `sin(${v})`;
  return `((${sinKv(k - 1, v)})*cos(${v}) + (${cosKv(k - 1, v)})*sin(${v}))`;
}
function cosKv(k: number, v: string): string {
  if (k === 0) return "1";
  if (k < 0) return cosKv(-k, v);
  if (k === 1) return `cos(${v})`;
  return `((${cosKv(k - 1, v)})*cos(${v}) - (${sinKv(k - 1, v)})*sin(${v}))`;
}

/** sin/cos de un argumento COMPUESTO reescrito con argumentos atómicos: fórmulas de
 *  ADICIÓN sobre los términos y de ÁNGULO MÚLTIPLE sobre cada k·v. null si algún
 *  término no es k·v (x·y, y², sin(y) anidado…). */
function sincosExpandido(fn: "sin" | "cos", arg: Nodo): string | null {
  const ts = terminos(arg);
  if (ts.length === 0) return fn === "sin" ? "0" : "1";
  if (ts.length === 1) {
    const m = multiploDeSimbolo(ts[0]);
    if (m === null) return null;
    return fn === "sin" ? sinKv(m.k, m.sym) : cosKv(m.k, m.sym);
  }
  // arg = A + B (A el primer término, B el resto): adición, recursivo sobre cada parte.
  let A: Nodo, B: Nodo;
  try {
    A = parse(renderTerminos1(ts[0]));
    B = parse(terminosAStr(ts.slice(1)));
  } catch { return null; }
  const sA = sincosExpandido("sin", A), cA = sincosExpandido("cos", A);
  const sB = sincosExpandido("sin", B), cB = sincosExpandido("cos", B);
  if (!sA || !cA || !sB || !cB) return null;
  return fn === "sin"
    ? `((${sA})*(${cB}) + (${cA})*(${sB}))`
    : `((${cA})*(${cB}) - (${sA})*(${sB}))`;
}
const renderTerminos1 = (t: Termino): string =>
  t.signo === 1 ? t.nodo.toString() : `-(${t.nodo.toString()})`;
const terminosAStr = (ts: Termino[]): string => ts.map(renderTerminos1).join(" + ");

/** El árbol con TODAS las sin/cos de argumento compuesto expandidas a átomos sin(v)/cos(v).
 *  Las irreducibles SIN y se dejan (serán átomos opacos); una irreducible CON y aborta
 *  (la y quedaría atrapada) → null. */
function expandirTrig(D: Nodo): Nodo | null {
  let fallo = false;
  let out: Nodo;
  try {
    out = D.transform((n: Nodo) => {
      if (fallo || n.type !== "FunctionNode" || n.args?.length !== 1) return n;
      const fn = n.fn?.name;
      if (fn !== "sin" && fn !== "cos") return n;
      const arg = desParen(n.args[0]);
      if (arg.type === "SymbolNode") return n; // ya atómico
      const s = sincosExpandido(fn, arg);
      if (s === null) { if (contieneY(n)) fallo = true; return n; }
      try { return parse(s); } catch { fallo = true; return n; }
    });
  } catch { return null; }
  return fallo ? null : out;
}

// ── Sustitución por símbolos (el problema pasa a ser POLINÓMICO) ─────────────

const RESERVADO = /^(CY|SY|aux\d+|sn\d+|cs\d+)$/;

/** Estado de la sustitución: mapa inverso (símbolo → función original), claves de las
 *  funciones opacas ya vistas y PARES sin/cos por argumento (para la reducción
 *  pitagórica sin²v → 1−cos²v, que es la que cancela los sin x del caso cos(x±y)). */
interface Sustitucion {
  inverso: Map<string, string>;
  porClave: Map<string, string>;
  pares: Map<string, { sn: string; cs: string }>;
}

/** cos(y)→CY, sin(y)→SY; sin(v)/cos(v) SIN y → par snᵢ/csᵢ (mismo argumento, mismo i);
 *  cualquier otra función sin y → símbolo auxᵢ opaco. null si queda y fuera de esos
 *  átomos (y desnuda, tan(y)…) o si la entrada ya usaba un nombre reservado. */
function sustituirAtomos(n: Nodo, st: Sustitucion): Nodo | null {
  if (n.type === "FunctionNode") {
    const fn = n.fn?.name;
    if (contieneY(n)) {
      const arg = n.args?.length === 1 ? desParen(n.args[0]) : null;
      if ((fn === "sin" || fn === "cos") && arg?.type === "SymbolNode" && arg.name === "y")
        return parse(fn === "cos" ? "CY" : "SY");
      return null; // función de y no reducida a sin(y)/cos(y)
    }
    // sin/cos sin y: PAR por argumento. Se registran AMBOS restauradores al crear el par:
    // la reducción pitagórica puede introducir el cos aunque la entrada solo tuviera el sin.
    if ((fn === "sin" || fn === "cos") && n.args?.length === 1) {
      const argS = n.args[0].toString();
      let par = st.pares.get(argS);
      if (!par) {
        par = { sn: `sn${st.pares.size}`, cs: `cs${st.pares.size}` };
        st.pares.set(argS, par);
        st.inverso.set(par.sn, `sin(${argS})`);
        st.inverso.set(par.cs, `cos(${argS})`);
      }
      return parse(fn === "sin" ? par.sn : par.cs);
    }
    const clave = n.toString();
    let sym = st.porClave.get(clave);
    if (sym === undefined) {
      sym = `aux${st.porClave.size}`;
      st.porClave.set(clave, sym);
      st.inverso.set(sym, clave);
    }
    return parse(sym);
  }
  if (n.type === "SymbolNode" && (n.name === "y" || RESERVADO.test(n.name))) return null;
  let fallo = false;
  const out = n.map((c: Nodo) => {
    const r = sustituirAtomos(c, st);
    if (r === null) { fallo = true; return c; }
    return r;
  });
  return fallo ? null : out;
}

/** Deshace la sustitución: cada símbolo auxᵢ vuelve a su función original. */
function restaurarAtomos(s: string, inverso: Map<string, string>): string {
  try {
    return parse(s).transform((n: Nodo) =>
      n.type === "SymbolNode" && inverso.has(n.name) ? parse(inverso.get(n.name)!) : n
    ).toString();
  } catch { return s; }
}

// ── Aritmética EXACTA de polinomios de monomios ──────────────────────────────
//
// rationalize distribuye pero NO junta términos semejantes entre varios símbolos
// (deja `2·s·SY − 2·s·SY` sin cancelar): la recolección es de aquí. Un monomio es
// coeficiente NUMÉRICO × potencias enteras de símbolos; el polinomio, un mapa por la
// firma de las potencias. Con eso la cancelación de los sin y, el discriminante
// B²−4AC y la extracción de factores comunes son aritmética exacta, sin CAS.

interface Monomio { coef: number; pot: Map<string, number> }
type Poli = Map<string, Monomio>;

const EPS = 1e-12;

function claveDe(pot: Map<string, number>): string {
  return [...pot.entries()].filter(([, k]) => k !== 0).sort().map(([s, k]) => `${s}^${k}`).join("*");
}

function agregar(p: Poli, m: Monomio): void {
  if (Math.abs(m.coef) < EPS) return;
  const pot = new Map([...m.pot].filter(([, k]) => k !== 0));
  const clave = claveDe(pot);
  const ya = p.get(clave);
  if (ya) {
    ya.coef += m.coef;
    if (Math.abs(ya.coef) < EPS) p.delete(clave);
  } else p.set(clave, { coef: m.coef, pot });
}

/** `s` o `s^k` (k entero ≥1) → {sym, k}; si no, null. */
function simboloPotencia(n0: Nodo): { sym: string; k: number } | null {
  const n = desParen(n0);
  if (n.type === "SymbolNode") return { sym: n.name, k: 1 };
  if (n.type === "OperatorNode" && n.op === "^" && n.args.length === 2) {
    const b = desParen(n.args[0]);
    const e = valorConstanteFactor(n.args[1]);
    if (b.type === "SymbolNode" && e !== null && Number.isInteger(e) && e >= 1)
      return { sym: b.name, k: e };
  }
  return null;
}

/** Nodo (ya distribuido por rationalize) → polinomio de monomios. null si algún término
 *  no es (constante)·(potencias de símbolos) — símbolo en denominador, función residual… */
function colectar(n: Nodo): Poli | null {
  const p: Poli = new Map();
  for (const t of terminos(n)) {
    let coef: number = t.signo;
    const pot = new Map<string, number>();
    for (const f of factores(t.nodo)) {
      const v = valorConstanteFactor(f.nodo);
      if (v !== null) { coef *= f.exp === 1 ? v : 1 / v; continue; }
      const sp = simboloPotencia(f.nodo);
      if (sp === null || f.exp !== 1) return null;
      pot.set(sp.sym, (pot.get(sp.sym) ?? 0) + sp.k);
    }
    agregar(p, { coef, pot });
  }
  return p;
}

function sumarPoli(a: Poli, b: Poli): Poli {
  const out: Poli = new Map();
  for (const m of a.values()) agregar(out, m);
  for (const m of b.values()) agregar(out, m);
  return out;
}
function escalarPoli(a: Poli, c: number): Poli {
  const out: Poli = new Map();
  for (const m of a.values()) agregar(out, { coef: m.coef * c, pot: m.pot });
  return out;
}
function multPoli(a: Poli, b: Poli): Poli {
  const out: Poli = new Map();
  for (const ma of a.values()) {
    for (const mb of b.values()) {
      const pot = new Map(ma.pot);
      for (const [s, k] of mb.pot) pot.set(s, (pot.get(s) ?? 0) + k);
      agregar(out, { coef: ma.coef * mb.coef, pot });
    }
  }
  return out;
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i;
  return r;
}

/** Reducción PITAGÓRICA del par (sn, cs): sn^{2m} → (1−cs²)^m (binomio); una potencia
 *  IMPAR conserva UN factor sn y reduce el resto. Con `impedirImpar` (el par de y) un
 *  sn impar superviviente —ya recolectado, es decir NO cancelado— aborta: la ecuación
 *  no es polinomio en cos y. Para los pares sin y el sn impar es un átomo legítimo. */
function reducirParSinCos(p: Poli, sn: string, cs: string, impedirImpar: boolean): Poli | null {
  const out: Poli = new Map();
  for (const m of p.values()) {
    const k = m.pot.get(sn) ?? 0;
    if (k <= (impedirImpar ? 0 : 1)) { agregar(out, m); continue; }
    if (k % 2 === 1 && impedirImpar) return null;
    const mm = Math.floor(k / 2);
    for (let i = 0; i <= mm; i++) {
      const pot = new Map(m.pot);
      if (k % 2 === 1) pot.set(sn, 1); else pot.delete(sn);
      pot.set(cs, (pot.get(cs) ?? 0) + 2 * i);
      agregar(out, { coef: m.coef * binom(mm, i) * (i % 2 === 0 ? 1 : -1), pot });
    }
  }
  return out;
}

/** Reparte el polinomio como A·CY² + B·CY + C (A,B,C sin CY). null si grado > 2. */
function cuadraticaEnCY(p: Poli): { A: Poli; B: Poli; C: Poli } | null {
  const A: Poli = new Map(), B: Poli = new Map(), C: Poli = new Map();
  for (const m of p.values()) {
    const k = m.pot.get("CY") ?? 0;
    if (k > 2) return null;
    const pot = new Map(m.pot);
    pot.delete("CY");
    agregar(k === 2 ? A : k === 1 ? B : C, { coef: m.coef, pot });
  }
  return { A, B, C };
}

// ── Render y aritmética auxiliar ─────────────────────────────────────────────

/** v como fracción exacta `p/q` (q ≤ 48) o null. Los coeficientes de este pipeline nacen
 *  enteros/racionales; si uno no lo es, mejor abortar que emitir un decimal impreciso. */
function fraccion(v: number): string | null {
  for (let q = 1; q <= 48; q++) {
    const pNum = Math.round(v * q);
    if (Math.abs(v * q - pNum) < 1e-9 * Math.max(1, Math.abs(pNum)))
      return q === 1 ? String(pNum) : `${pNum}/${q}`;
  }
  return null;
}

/** Polinomio → string mathjs: monomios con símbolos primero (grado desc.), constante al
 *  final; positivos antes que negativos (estilo de la casa). null si un coeficiente no
 *  es racional limpio. */
function renderPoli(p: Poli): string | null {
  if (p.size === 0) return "0";
  const ms = [...p.values()].sort((a, b) => {
    const ga = [...a.pot.values()].reduce((s, k) => s + k, 0);
    const gb = [...b.pot.values()].reduce((s, k) => s + k, 0);
    return gb - ga || claveDe(a.pot).localeCompare(claveDe(b.pot));
  });
  const piezas: Array<{ neg: boolean; s: string }> = [];
  for (const m of ms) {
    const abs = Math.abs(m.coef);
    const cstr = fraccion(abs);
    if (cstr === null) return null;
    const partes = [...m.pot.entries()].sort().map(([s, k]) => (k === 1 ? s : `${s}^${k}`));
    const cuerpo = partes.length === 0 ? cstr
      : Math.abs(abs - 1) < EPS ? partes.join("*")
      : `${cstr}*${partes.join("*")}`;
    piezas.push({ neg: m.coef < 0, s: cuerpo });
  }
  const orden = [...piezas.filter((z) => !z.neg), ...piezas.filter((z) => z.neg)];
  return orden.map((z, i) => (i === 0 ? (z.neg ? `-${z.s}` : z.s) : z.neg ? ` - ${z.s}` : ` + ${z.s}`)).join("");
}

const mcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : mcd(b, Math.abs(a % b)));

/** MCD de los coeficientes si TODOS son enteros; si no, 1. El polinomio VACÍO (el 0)
 *  devuelve 0: mcd(0, s) = s, así el 0 no bloquea la reducción de la fracción común. */
function contenidoEntero(p: Poli): number {
  let g = 0;
  for (const m of p.values()) {
    const r = Math.round(m.coef);
    if (Math.abs(m.coef - r) > 1e-9 * Math.max(1, Math.abs(r))) return 1;
    g = mcd(g, r);
  }
  return p.size === 0 ? 0 : (g === 0 ? 1 : g);
}

/** Mayor s con s² | g (para sacar el factor cuadrado del radicando: √(16d)=4√d). */
function mayorCuadrado(g: number): number {
  for (let s = Math.floor(Math.sqrt(g)); s >= 2; s--) if (g % (s * s) === 0) return s;
  return 1;
}

/** COMPLETAR EL CUADRADO del radicando si es cuadrática de UN símbolo con vértice
 *  racional: a·s² + b·s + c (a<0) → `v − |a|(s − h)²`, la forma que muestra el dominio
 *  (−3c²+6c−2 → 1 − 3(c−1)²). null si no aplica (se queda el polinomio expandido). */
function completarCuadrado(p: Poli): string | null {
  const syms = new Set<string>();
  for (const m of p.values()) for (const s of m.pot.keys()) syms.add(s);
  if (syms.size !== 1) return null;
  const sym = [...syms][0];
  let a = 0, b = 0, c = 0;
  for (const m of p.values()) {
    const k = m.pot.get(sym) ?? 0;
    if (k === 0) c = m.coef;
    else if (k === 1) b = m.coef;
    else if (k === 2) a = m.coef;
    else return null;
  }
  if (!(a < 0) || b === 0) return null;
  const h = -b / (2 * a);
  const v = c - (b * b) / (4 * a);
  const [aS, hS, vS] = [fraccion(-a), fraccion(Math.abs(h)), fraccion(v)];
  if (aS === null || hS === null || vS === null) return null;
  const factor = aS === "1" ? "" : `${aS}*`;
  const centro = `(${sym} ${h >= 0 ? "-" : "+"} ${hS})^2`;
  if (v === 0) return `-${factor}${centro}`;
  return `${vS} - ${factor}${centro}`;
}

// ── Validación numérica y despeje principal ──────────────────────────────────

/** ¿La rama u(x) da cos(y)=u REAL que cumple la ecuación original en la muestra? Los x
 *  con |u|>1 no son fallos (ahí la curva no existe); un x viable que falle, sí. Se exigen
 *  ≥2 viables. Muestra DENSA: hay ramas válidas solo en ventanas estrechas de x. */
function ramaCosValida(uStr: string, evalF: (x: number, y: number) => number): boolean {
  let fu: (x: number) => unknown;
  try { const c = parse(uStr).compile(); fu = (x) => c.evaluate({ x }); }
  catch { return false; }
  const N = 240, x0 = -6, x1 = 6;
  let viables = 0;
  for (let i = 0; i <= N; i++) {
    const x = x0 + (i * (x1 - x0)) / N;
    let u: unknown;
    try { u = fu(x); } catch { continue; }
    if (typeof u !== "number" || !Number.isFinite(u)) continue;
    if (Math.abs(u) > 1 + 1e-9) continue;
    const y = Math.acos(Math.max(-1, Math.min(1, u)));
    const d = evalF(x, y);
    if (!Number.isFinite(d) || Math.abs(d) > 1e-6 * (1 + x * x * x * x)) return false;
    viables++;
  }
  return viables >= 2;
}

/**
 * Despeje de una ecuación que, expandida, es CUADRÁTICA (o lineal) en u = cos(y):
 * u por la fórmula general y vuelta con y = ±arccos(u) + 2kπ. `D` es la diferencia
 * lhs−rhs; `DVal` la ecuación ORIGINAL contra la que se valida numéricamente. null si
 * no encaja (y fuera de sin/cos, sin y impar, grado >2, sin rama válida…).
 */
export function despejeTrigCuadratico(D: Nodo, DVal: Nodo): { ecuacion: string; completo: boolean } | null {
  // Pre-filtro barato: sin trig de y no hay nada que hacer por esta vía.
  try {
    if (D.filter((n: Nodo) =>
      n.type === "FunctionNode" && (n.fn?.name === "sin" || n.fn?.name === "cos") && contieneY(n)
    ).length === 0) return null;
  } catch { return null; }

  const exp = expandirTrig(D);
  if (exp === null) return null;
  const st: Sustitucion = { inverso: new Map(), porClave: new Map(), pares: new Map() };
  const sust = sustituirAtomos(exp, st);
  if (sust === null) return null;
  const inverso = st.inverso;

  const rac = rationalizeSeguro(sust);
  if (rac === null) return null;
  const pol0 = colectar(rac);
  if (pol0 === null) return null;
  // Reducción pitagórica: primero los pares SIN y (sin²x → 1−cos²x, la que junta el
  // radicando en un solo símbolo), después el par de y (donde el sin impar aborta).
  let pol: Poli | null = pol0;
  for (const par of st.pares.values()) {
    pol = reducirParSinCos(pol, par.sn, par.cs, false);
    if (pol === null) return null;
  }
  pol = reducirParSinCos(pol, "SY", "CY", true);
  if (pol === null) return null;
  const abc = cuadraticaEnCY(pol);
  if (abc === null) return null;
  let { A, B, C } = abc;
  if (A.size === 0 && B.size === 0) return null; // sin cos(y): no es de esta vía

  let evalF: (x: number, y: number) => number;
  try {
    const c = DVal.compile();
    evalF = (x, y) => { try { return c.evaluate({ x, y }) as number; } catch { return NaN; } };
  } catch { return null; }

  const emitir = (inner: string): { ecuacion: string; completo: boolean } =>
    ({ ecuacion: `y = pm(acos(${restaurarAtomos(inner, inverso)})) + fam(k, 2*pi)`, completo: true });

  // LINEAL en cos y (B·u + C = 0): u = −C/B. Si B es constante, la división es exacta.
  if (A.size === 0) {
    const unicoB = B.size === 1 ? [...B.values()][0] : null;
    let u: string | null;
    if (unicoB && unicoB.pot.size === 0) u = renderPoli(escalarPoli(C, -1 / unicoB.coef));
    else {
      const bS = renderPoli(B), cS = renderPoli(escalarPoli(C, -1));
      u = bS && cS ? `(${cS})/(${bS})` : null;
    }
    if (u === null) return null;
    if (!ramaCosValida(restaurarAtomos(u, inverso), evalF)) return null;
    return emitir(u);
  }

  // Normalización de signo: si A es la constante negativa, se niega todo (misma ecuación).
  const unicoA = A.size === 1 ? [...A.values()][0] : null;
  if (unicoA && unicoA.pot.size === 0 && unicoA.coef < 0) {
    A = escalarPoli(A, -1); B = escalarPoli(B, -1); C = escalarPoli(C, -1);
  }

  // u = (−B ± √(B²−4AC)) / 2A, todo en aritmética de monomios (exacta).
  let num = escalarPoli(B, -1);
  let den = escalarPoli(A, 2);
  const disc = sumarPoli(multPoli(B, B), escalarPoli(multPoli(A, C), -4));
  if (disc.size === 0) return null; // Δ≡0 (raíz doble): cos y = −B/2A, vía lineal ajena

  // Factor CUADRADO del discriminante fuera de la raíz: √(16d) = 4√d.
  let s = mayorCuadrado(contenidoEntero(disc));
  let discRed = escalarPoli(disc, 1 / (s * s));

  // Fracción común (num, s, den) cuando el denominador es constante: (4+4c ± 4√d)/8 → (1+c ± √d)/2.
  const unicoDen = den.size === 1 ? [...den.values()][0] : null;
  if (unicoDen && unicoDen.pot.size === 0 && Number.isInteger(unicoDen.coef)) {
    let d = unicoDen.coef;
    const r = mcd(mcd(contenidoEntero(num), s), Math.abs(d));
    if (r > 1) { num = escalarPoli(num, 1 / r); s = s / r; d = d / r; }
    if (d < 0) { num = escalarPoli(num, -1); d = -d; } // el ± absorbe el signo de la raíz
    den = new Map();
    agregar(den, { coef: d, pot: new Map() });
  }

  const radicando = completarCuadrado(discRed) ?? renderPoli(discRed);
  const numS = renderPoli(num);
  const denS = renderPoli(den);
  if (radicando === null || numS === null || denS === null) return null;
  const raiz = `${s === 1 ? "" : `${s}*`}sqrt(${radicando})`;

  // Validación de cada raíz u± contra la ecuación ORIGINAL (muestra densa).
  const uCon = (signo: "+" | "-"): string =>
    numS === "0"
      ? (denS === "1" ? `${signo === "-" ? "-" : ""}${raiz}` : `(${signo === "-" ? "-" : ""}${raiz})/(${denS})`)
      : (denS === "1" ? `${numS} ${signo} ${raiz}` : `((${numS}) ${signo} ${raiz})/(${denS})`);
  const validas = (["+", "-"] as const).filter((sg) =>
    ramaCosValida(restaurarAtomos(uCon(sg), inverso), evalF));
  if (validas.length === 0) return null;
  if (validas.length === 1) return emitir(uCon(validas[0]));

  // Ambas raíces reales → ± interno (independiente del ± del arccos: solo presentación).
  const inner = numS === "0"
    ? (denS === "1" ? `pm(${raiz})` : `(pm(${raiz}))/(${denS})`)
    : (denS === "1" ? `${numS} + pm(${raiz})` : `((${numS}) + pm(${raiz}))/(${denS})`);
  return emitir(inner);
}
