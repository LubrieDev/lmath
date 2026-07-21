// ─────────────────────────────────────────────
// tests · Fuzzer DIFERENCIAL del despejador (línea base pre-keystone)
// ─────────────────────────────────────────────
//
// NO modifica el plugin. Genera ecuaciones aleatorias DENTRO de las familias que hoy
// soporta `despejar`, ejecuta el despeje y verifica NUMÉRICAMENTE que toda respuesta
// marcada `completo: true` es CORRECTA en sentido de SOUNDNESS: cada valor de y que la
// forma despejada afirma debe satisfacer la ecuación ORIGINAL. Si algún (x, y) da un
// D = lhs−rhs real, finito y ≠ 0, la despejada asegura un punto que NO está en la curva
// → fallo duro, con la ecuación (mínima que se generó) y la estrategia responsable.
//
// Cada generador está ETIQUETADO con la estrategia que pretende ejercitar, así el reporte
// nombra al culpable sin instrumentar el plugin (que no se toca). Semilla determinista:
// el mismo `seed` reproduce exactamente el mismo lote.
//
// Expansión de centinelas IDÉNTICA a la del plugin: `fam(k,·)`/`famN` comparten un único
// k∈ℤ/ℕ (se enumera un rango); `pm`/`mp` se resuelven con `expandirDobleSigno` (dos ramas
// CORRELACIONADAS, la convención de LaTeX). Se evalúa con `compilarExpresion` (mismo scope:
// acot/asec/acsc, floor/ceil rápidas, pm=+u).

import { despejarEcuaciones, despejarY } from "../src/despejar";
import { normalizarEntrada } from "../src/parser";
import { insertarProductoImplicito } from "../src/motor/parsing/productoImplicito";
import { expandirDobleSigno } from "../src/motor/parsing/dobleSigno";
import { compilarExpresion } from "../src/evaluador";

declare const process: { argv: string[]; exit(code: number): never; exitCode?: number };

// ── RNG determinista (mulberry32) ────────────────────────────────────────────
function crearRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.argv[2] ?? 12345);
const POR_FAMILIA = Number(process.argv[3] ?? 500);
const R = crearRng(SEED);

const ri = (a: number, b: number): number => a + Math.floor(R() * (b - a + 1));
const nz = (a: number, b: number): number => { const v = ri(a, b); return v === 0 ? 1 : v; };
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)];
const sgn = (): string => (R() < 0.5 ? "+" : "-");

/** Polinomio pequeño en x (string mathjs), a veces con signo líder negativo. */
function px(): string {
  switch (ri(0, 6)) {
    case 0: return `${nz(-4, 4)}`;
    case 1: return `${nz(-3, 3)}*x`;
    case 2: return `x^2 ${sgn()} ${ri(1, 4)}`;
    case 3: return `${nz(-2, 2)}*x^2 ${sgn()} ${ri(1, 3)}*x ${sgn()} ${ri(1, 4)}`;
    case 4: return `${nz(-3, 3)}*x ${sgn()} ${ri(1, 5)}`;
    case 5: return `x^3 ${sgn()} ${ri(1, 3)}`;
    default: return `${ri(1, 5)} - x^2`;
  }
}

// ── Generadores por familia ──────────────────────────────────────────────────

interface Caso { familia: string; lhs: string; rhs: string; }
const mk = (familia: string, lhs: string, rhs: string): Caso => ({ familia, lhs, rhs });

const GENERADORES: Record<string, () => Caso> = {
  lineal: () => {
    const coef = R() < 0.3 ? `y/${nz(2, 4)}` : `${nz(-4, 4)}*y`;
    return mk("lineal", `${coef} + (${px()})`, px());
  },
  potencia: () => mk("potencia", `${nz(-3, 3)}*y^${ri(2, 5)} + (${px()})`, px()),
  raiz: () => {
    const raiz = pick(["sqrt(y)", "cbrt(y)", `nthRoot(y, ${ri(2, 4)})`]);
    return mk("raiz", `${nz(-3, 3)}*${raiz} + (${px()})`, px());
  },
  raizDePotencia: () => {
    const m = ri(2, 4);
    const raiz = pick([`sqrt(y^${m})`, `cbrt(y^${m})`, `nthRoot(y^${m}, ${ri(2, 3)})`]);
    return mk("raizDePotencia", raiz, px());
  },
  absoluto: () => {
    const forma = pick(["abs(y)", `abs(y)^${ri(2, 3)}`, "sqrt(abs(y))", "1/abs(y)"]);
    return mk("absoluto", `${nz(-3, 3)}*${forma} + (${px()})`, px());
  },
  trigInverso: () => {
    const T = pick(["sin", "cos", "tan", "cot", "sec", "csc"]);
    return mk("trigInverso", `${nz(-3, 3)}*${T}(y) + (${px()})`, px());
  },
  reciproco: () => {
    const E = pick(["y", "x*y", "x^2+y^2", "y+x", "x^2*y"]);
    return mk("reciproco", `1/(${E})`, px());
  },
  trigCero: () => {
    const u = pick(["1/(x^2+y^2)", "x^2+y^2", "x^2+y^2-1", "y^2+x"]);
    const T = pick(["sin", "tan", "cos", "cot"]);
    return mk("trigCero", `${T}(${u})`, "0");
  },
  cuadratico: () => {
    switch (ri(0, 3)) {
      case 0: return mk("cuadratico", `(${px()})*y^2 + (${px()})*y + (${px()})`, "0");
      case 1: return mk("cuadratico(bi)", `(${px()})*y^4 + (${px()})*y^2 + (${px()})`, "0");
      case 2: return mk("cuadratico(circ)", "x^2 + y^2", `${ri(1, 25)}`);
      default: return mk("cuadratico(mix)", "x^2*y^2 + x^2 + y^2", `${ri(1, 9)}`);
    }
  },
  raizImpar: () => {
    const n = pick([3, 5]);
    const A = pick(["x^2", "x^2-1", "x^2+1"]);
    const B = pick(["x^2", "x^3", "1"]);
    return mk("raizImpar", `(${A} + y^2)^${n}`, `(${B})*y^${n}`);
  },
  trigCuad: () => {
    const a = ri(1, 3), b = ri(1, 3);
    return mk("trigCuad", `${a}*cos(2*y) + ${b}*cos(x) + cos(x+y) + cos(x-y)`, `${ri(0, 3)}`);
  },

  // ── Familias de HUECO que el inversor estructural (keystone) debe cerrar ──────
  // Todas con y en UNA sola posición; inversas INYECTIVAS → deben salir sound (0 fantasmas).
  inv_log: () => mk("inv:log", `log(y) + (${px()})`, px()),
  inv_exp: () => {
    const base = pick(["e", "2", "3"]);
    return mk("inv:exp", `${base}^y + (${px()})`, px());   // y en el exponente
  },
  inv_hiperbolica: () => {
    const T = pick(["sinh", "tanh", "asinh", "atanh"]);
    return mk("inv:hiperbolica", `${T}(y) + (${px()})`, px());
  },
  inv_trigCompuesta: () => {
    const T = pick(["sin", "cos", "tan"]);
    const arg = pick(["2*y", "y + 1", "3*y - 2", "x + y"]);
    return mk("inv:trigComp", `${T}(${arg}) + (${px()})`, px());
  },
  inv_baseCompuesta: () => {
    const n = pick([3, 5]);   // exponente IMPAR (par sería rango restringido)
    const b = pick(["y + 1", "y - 2", "2*y + 1"]);
    return mk("inv:baseImpar", `(${b})^${n}`, px());
  },
  inv_anidada: () => {
    const n = pick([3, 5]);
    return mk("inv:anidada", `exp(y^${n}) + (${px()})`, px());   // e^(y^impar) = … ⇒ y = ⁿ√(ln …)
  },

  // ── Capas de RANGO RESTRINGIDO bajo composición (guarda `dom` + `pm`) ────────
  // Ya no se rinden: la inversa es exacta bajo `t ≥ 0`. Son las familias donde un fallo
  // de la guarda se vería como rama FANTASMA (y afirmada que no está en la original),
  // así que son las que de verdad ejercitan el `dom` emitido a media torre.
  inv_raizPar: () => {
    const u = pick(["tan(y) + 1", "2*y + 1", "y^3 - 2", "log(y)", "sinh(y)"]);
    const raiz = R() < 0.5 ? `sqrt(${u})` : `nthRoot(${u}, ${pick([2, 4])})`;
    return mk("inv:raizPar", raiz, px());
  },
  inv_potenciaPar: () => {
    const b = pick(["y + 1", "2*y - 3", "y^3", "log(y)", "tan(y)"]);
    return mk("inv:potPar", `(${b})^${pick([2, 4])}`, px());
  },
  inv_expPar: () => mk("inv:expPar", `exp(y^${pick([2, 4])})`, px()),
  inv_absComp: () => {
    const u = pick(["2*y + 1", "y^3", "y - 4", "sinh(y)"]);
    return mk("inv:absComp", `abs(${u})`, px());
  },
};

// ── Normalización y evaluación de la ecuación ORIGINAL ────────────────────────

const norm = (s: string): string => insertarProductoImplicito(normalizarEntrada(s.trim()));

/** Evaluador de D = lhs − rhs (la MISMA forma normalizada que ve `despejar`), o null. */
function evalOriginal(lhs: string, rhs: string): ((x: number, y: number) => number) | null {
  let f: (s: Record<string, number>) => unknown;
  try { f = compilarExpresion(`(${norm(lhs)}) - (${norm(rhs)})`); } catch { return null; }
  return (x, y) => { const v = f({ x, y }); return typeof v === "number" && Number.isFinite(v) ? v : NaN; };
}

// ── Expansión de centinelas fam/famN (mismo k para todos) ─────────────────────

function cierre(texto: string, inicio: number): number {
  let prof = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === "(") prof++;
    else if (texto[i] === ")" && --prof === 0) return i;
  }
  return -1;
}

/** Índice de la primera coma a profundidad 0 dentro de `s`, o −1. */
function comaTop(s: string): number {
  let prof = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") prof++;
    else if (s[i] === ")") prof--;
    else if (s[i] === "," && prof === 0) return i;
  }
  return -1;
}

/** Sustituye `fam(k, P)` y `famN(k, P)` por `(K*(P))` (todos con el MISMO K). */
function sustituirFam(expr: string, K: number): string {
  for (const nombre of ["famN", "fam"]) {
    const marca = new RegExp(`(?<![a-zA-Z0-9_])${nombre}\\s*\\(`);
    for (let m = marca.exec(expr); m; m = marca.exec(expr)) {
      const abre = m.index + m[0].length - 1;
      const cierra = cierre(expr, abre);
      if (cierra === -1) break;
      const dentro = expr.slice(abre + 1, cierra);
      const coma = comaTop(dentro);
      const periodo = coma >= 0 ? dentro.slice(coma + 1) : dentro;
      expr = expr.slice(0, m.index) + `(${K}*(${periodo}))` + expr.slice(cierra + 1);
    }
  }
  return expr;
}

const tieneFam = (s: string): boolean => /(?<![a-zA-Z0-9_])fam\s*\(/.test(s);
const tieneFamN = (s: string): boolean => /(?<![a-zA-Z0-9_])famN\s*\(/.test(s);

/** Función x → conjunto de valores de y que la forma despejada AFIRMA. Enumera el
 *  parámetro de familia y ambas ramas del doble signo (correlacionadas), evaluando
 *  cada combinación; conserva solo los reales finitos. */
function candidatosY(rhs: string): (x: number) => number[] {
  const Ks = tieneFamN(rhs) ? [0, 1, 2, 3] : tieneFam(rhs) ? [-2, -1, 0, 1, 2] : [0];
  const compiladas: Array<(x: number) => number[]> = [];
  for (const K of Ks) {
    const sinFam = Ks.length > 1 || tieneFam(rhs) || tieneFamN(rhs) ? sustituirFam(rhs, K) : rhs;
    const fns = expandirDobleSigno(sinFam).map((rama) => {
      try { return compilarExpresion(rama); } catch { return null; }
    });
    compiladas.push((x: number) => {
      const out: number[] = [];
      for (const f of fns) {
        if (!f) continue;
        const v = f({ x });
        if (typeof v === "number" && Number.isFinite(v)) out.push(v);
      }
      return out;
    });
  }
  return (x: number) => compiladas.flatMap((c) => c(x));
}

// ── Verificación de un caso ───────────────────────────────────────────────────

const XS = [-5.3, -3.1, -2.2, -1.4, -0.8, -0.35, 0.3, 0.75, 1.6, 2.9, 4.4, 6.1];

type Estado = "ok" | "unsound" | "vacuo" | "no-completo" | "error";
interface Resultado {
  estado: Estado;
  viables: number;
  peor?: { x: number; y: number; d: number };
}

function comprobar(c: Caso): Resultado {
  const evalD = evalOriginal(c.lhs, c.rhs);
  if (!evalD) return { estado: "error", viables: 0 };
  const eq = `${c.lhs} = ${c.rhs}`;

  let completo = false, raw = "";
  try {
    completo = despejarY(eq)?.completo === true;
    raw = despejarEcuaciones([eq])[0];
  } catch { return { estado: "error", viables: 0 }; }
  if (!completo) return { estado: "no-completo", viables: 0 };

  const m = raw.match(/^\s*y\s*=([\s\S]*)$/);
  if (!m) return { estado: "no-completo", viables: 0 };

  const yDe = candidatosY(m[1]);
  let viables = 0;
  let peor: { x: number; y: number; d: number } | undefined;
  for (const x of XS) {
    let ys: number[];
    try { ys = yDe(x); } catch { continue; }
    for (const y of ys) {
      const d = evalD(x, y);
      if (!Number.isFinite(d)) continue;
      viables++;
      const tol = 1e-6 * (1 + x * x * x * x + y * y * y * y);
      // Guarda de CONDICIONAMIENTO: cuando la original es muy empinada en y (p. ej. atanh
      // cerca de |y|=1), el error de 1 ulp de y se AMPLIFICA por la pendiente y explica el
      // residual sin que haya fantasma. Se estima ese ruido por diferencia central y se
      // exige que |D| lo supere con holgura. Un fantasma real (raíz/valor absoluto) vive
      // donde la original es suave → pendiente pequeña → esta guarda no lo tapa.
      const dy = Math.max(Math.abs(y), 1) * 1e-8;
      const dp = evalD(x, y + dy), dm = evalD(x, y - dy);
      const pendiente = Number.isFinite(dp) && Number.isFinite(dm) ? Math.abs(dp - dm) / (2 * dy) : Infinity;
      const ruido = pendiente * Math.max(Math.abs(y), 1) * 1e-12;
      if (Math.abs(d) > tol + 100 * ruido && (!peor || Math.abs(d) > Math.abs(peor.d))) peor = { x, y, d };
    }
  }
  if (peor) return { estado: "unsound", viables, peor };
  if (viables < 2) return { estado: "vacuo", viables };
  return { estado: "ok", viables };
}

// ── Ejecución y reporte ────────────────────────────────────────────────────────

interface Stats {
  total: number; completo: number; ok: number; unsound: number; vacuo: number; error: number;
  ejemplos: Array<{ eq: string; peor: { x: number; y: number; d: number } }>;
}

function nuevo(): Stats {
  return { total: 0, completo: 0, ok: 0, unsound: 0, vacuo: 0, error: 0, ejemplos: [] };
}

console.log(`Fuzzer diferencial · seed=${SEED} · ${POR_FAMILIA} casos/familia\n`);

const porFamilia = new Map<string, Stats>();
for (const nombreGen of Object.keys(GENERADORES)) {
  for (let i = 0; i < POR_FAMILIA; i++) {
    const c = GENERADORES[nombreGen]();
    const r = comprobar(c);
    const clave = c.familia;
    if (!porFamilia.has(clave)) porFamilia.set(clave, nuevo());
    const s = porFamilia.get(clave)!;
    s.total++;
    if (r.estado === "error") { s.error++; continue; }
    if (r.estado === "no-completo") continue;
    s.completo++;
    if (r.estado === "ok") s.ok++;
    else if (r.estado === "vacuo") s.vacuo++;
    else if (r.estado === "unsound") {
      s.unsound++;
      if (r.peor) s.ejemplos.push({ eq: `${c.lhs} = ${c.rhs}`, peor: r.peor });
    }
  }
}

// Tabla resumen.
console.log("familia               total  completo   ok  UNSOUND  vacuo  error");
console.log("─".repeat(70));
let totalUnsound = 0;
for (const [fam, s] of porFamilia) {
  totalUnsound += s.unsound;
  const marca = s.unsound > 0 ? "  ⚠" : "";
  console.log(
    `${fam.padEnd(20)} ${String(s.total).padStart(6)} ${String(s.completo).padStart(9)} ` +
    `${String(s.ok).padStart(4)} ${String(s.unsound).padStart(8)} ${String(s.vacuo).padStart(6)} ` +
    `${String(s.error).padStart(6)}${marca}`
  );
}

// Detalle: por cada familia con fallos, la ecuación UNSOUND más corta + un (x,y,d).
console.log(`\n${"═".repeat(70)}`);
if (totalUnsound === 0) {
  console.log("Sin fallos de soundness: toda despejada `completo:true` satisface la original.");
} else {
  console.log(`FALLOS DE SOUNDNESS (${totalUnsound}). Reproductor más corto por familia:\n`);
  for (const [fam, s] of porFamilia) {
    if (s.unsound === 0) continue;
    const min = s.ejemplos.slice().sort((a, b) => a.eq.length - b.eq.length)[0];
    const p = min.peor;
    console.log(`▸ ${fam}  (${s.unsound}/${s.completo} despejes completos son unsound)`);
    console.log(`    ${min.eq}`);
    console.log(`    en x=${p.x}: y=${p.y.toFixed(4)} ⇒ D_original=${p.d.toFixed(4)} (debería ser 0)\n`);
  }
}

if (totalUnsound > 0) process.exitCode = 1;
