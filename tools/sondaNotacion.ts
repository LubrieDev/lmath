// ─────────────────────────────────────────────
// SONDA de NOTACIÓN · símbolos Unicode y funciones estándar
// ─────────────────────────────────────────────
//
// Comprueba VALOR, no solo que la entrada no reviente. Una notación que se acepta y evalúa
// otra cosa es peor que una que falla: el plano sale dibujado y nadie se entera.
//
// Cada caso trae el valor que DEBE dar en x = 2 (o el que se indique). Se marca:
//   ✓  evalúa y coincide
//   ✖  evalúa pero da OTRO número  ← el fallo grave
//   ∅  no evalúa (NaN) o no parsea ← se acepta como "no soportado" si así se declara
//
//   npm run notacion && node tools/.notacion.cjs [grupo]

import { normalizarEntrada } from "../src/parser";
import { insertarProductoImplicito } from "../src/core/parsing/productoImplicito";
import { compilarExpresion } from "../src/evaluador";
import { bloqueALatex } from "../src/latex";

declare const process: { argv: string[]; stdout: { write(s: string): void } };
const linea = (s = "") => process.stdout.write(`${s}\n`);

interface Caso {
  /** Lo que escribe el usuario. */
  ent: string;
  /** Valor esperado en x = `en` (por defecto 2). `null` = se espera NO soportado. */
  val: number | null;
  en?: number;
  nota?: string;
}

const G: Array<{ nombre: string; casos: Caso[] }> = [
  {
    nombre: "U1 · letras griegas",
    casos: [
      { ent: "π", val: Math.PI },
      { ent: "2π", val: 2 * Math.PI },
      { ent: "τ", val: 2 * Math.PI },
      { ent: "θ", val: NaN, nota: "variable libre: NaN sin scope es correcto" },
      { ent: "φ", val: (1 + Math.sqrt(5)) / 2 },
      { ent: "α+β", val: NaN, nota: "variables libres" },
      { ent: "λ", val: NaN, nota: "variable libre" },
      { ent: "Δ", val: NaN, nota: "variable libre" },
      { ent: "sin(π/2)", val: 1 },
      { ent: "eˣ", val: null, nota: "superíndice de letra: raro, probable no soportado" },
    ],
  },
  {
    nombre: "U2 · operadores",
    casos: [
      { ent: "3×4", val: 12 },
      { ent: "3·4", val: 12 },
      { ent: "12÷4", val: 3 },
      { ent: "5−3", val: 2, nota: "menos Unicode U+2212" },
      { ent: "5–3", val: 2, nota: "guion corto" },
      { ent: "5—3", val: 2, nota: "guion largo" },
      { ent: "∞", val: Infinity },
      { ent: "−x", val: -2 },
      { ent: "x≤3", val: 1, nota: "comparación: 2≤3 es verdadero" },
      { ent: "x≥3", val: 0 },
      { ent: "x≠3", val: 1 },
      { ent: "2⁻¹", val: 0.5 },
    ],
  },
  {
    nombre: "U3 · raíces y superíndices",
    casos: [
      { ent: "√4", val: 2 },
      { ent: "√x", val: Math.SQRT2 },
      { ent: "√(x+2)", val: 2 },
      { ent: "∛8", val: 2 },
      { ent: "∜16", val: 2 },
      { ent: "∛-8", val: -2 },
      { ent: "x²", val: 4 },
      { ent: "x³", val: 8 },
      { ent: "x⁴", val: 16 },
      { ent: "x⁻¹", val: 0.5 },
      { ent: "x⁻²", val: 0.25 },
      { ent: "√x²", val: 2 },
      { ent: "x^½", val: null, nota: "fracción Unicode como exponente" },
      { ent: "½", val: 0.5, nota: "fracción Unicode suelta" },
      { ent: "¼+¼", val: 0.5 },
    ],
  },
  {
    nombre: "U4 · delimitadores",
    casos: [
      { ent: "|x|", val: 2 },
      { ent: "|-x|", val: 2 },
      { ent: "⌊2.7⌋", val: 2 },
      { ent: "⌈2.1⌉", val: 3 },
      { ent: "⌊x⌋", val: 2 },
      { ent: "abs(-x)", val: 2 },
    ],
  },
  {
    nombre: "F1 · logaritmos (el punto caliente)",
    casos: [
      { ent: "log(2)", val: Math.log10(2), nota: "log SIN base = base 10 en notación estándar" },
      { ent: "log(100)", val: 2, nota: "el caso que lo delata" },
      { ent: "ln(2)", val: Math.LN2 },
      { ent: "ln(e)", val: 1 },
      { ent: "log(8,2)", val: 3, nota: "mathjs: log(valor, base)" },
      { ent: "log(100,10)", val: 2 },
      { ent: "\\log_{10}{100}", val: 2 },
      { ent: "\\log_2{8}", val: 3 },
      { ent: "log10(100)", val: 2 },
      { ent: "log2(8)", val: 3 },
      { ent: "\\ln{e}", val: 1 },
      { ent: "\\log{100}", val: 2, nota: "\\log de LaTeX = base 10" },
    ],
  },
  {
    nombre: "F2 · funciones estándar",
    casos: [
      { ent: "sqrt(x)", val: Math.SQRT2 },
      { ent: "cbrt(8)", val: 2 },
      { ent: "nthRoot(16,4)", val: 2 },
      { ent: "exp(0)", val: 1 },
      { ent: "abs(-3)", val: 3 },
      { ent: "sign(-3)", val: -1 },
      { ent: "floor(2.7)", val: 2 },
      { ent: "ceil(2.1)", val: 3 },
      { ent: "round(2.5)", val: 3 },
      { ent: "max(1,x)", val: 2 },
      { ent: "min(1,x)", val: 1 },
      { ent: "mod(7,3)", val: 1 },
      { ent: "gcd(12,18)", val: 6 },
      { ent: "hypot(3,4)", val: 5 },
      { ent: "sinh(0)", val: 0 },
      { ent: "atan2(1,1)", val: Math.PI / 4 },
      { ent: "asin(1)", val: Math.PI / 2 },
      { ent: "sec(0)", val: 1 },
      { ent: "x!", val: 2, nota: "factorial de 2" },
    ],
  },
];

const casi = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * (1 + Math.abs(b));

let graves = 0, nosop = 0, ok = 0;
const soloGrupo = process.argv[2];
for (const g of G) {
  if (soloGrupo && !g.nombre.startsWith(soloGrupo)) continue;
  linea(`\n${"═".repeat(92)}\n${g.nombre}\n${"═".repeat(92)}`);
  for (const c of g.casos) {
    const x = c.en ?? 2;
    let norm = "?", v: number = NaN, tex = "?";
    try { norm = insertarProductoImplicito(normalizarEntrada(c.ent)); } catch { norm = "EXC"; }
    try { v = compilarExpresion(norm)({ x }) as number; } catch { v = NaN; }
    try { tex = bloqueALatex([c.ent]); } catch { tex = "EXC"; }
    const esperadoNaN = c.val !== null && Number.isNaN(c.val);
    let marca: string;
    if (c.val === null) { marca = Number.isFinite(v) ? "!" : "∅"; nosop++; }
    else if (esperadoNaN) { marca = Number.isNaN(v) ? "✓" : "!"; if (Number.isNaN(v)) ok++; }
    else if (typeof v === "number" && (casi(v, c.val) || (v === c.val))) { marca = "✓"; ok++; }
    else if (!Number.isFinite(v) && !Number.isFinite(c.val)) { marca = "✓"; ok++; }
    else if (Number.isNaN(v)) { marca = "∅"; nosop++; }
    else { marca = "✖"; graves++; }
    linea(`  ${marca} ${c.ent.padEnd(16)} → ${norm.padEnd(30)} = ${String(v).padEnd(20)}` +
      (c.val === null || esperadoNaN ? "" : `esperado ${c.val}`));
    linea(`      latex  ${tex}${c.nota ? `   · ${c.nota}` : ""}`);
  }
}
linea(`\n  ✓ ${ok} correctos · ✖ ${graves} con VALOR distinto · ∅/! ${nosop} no soportados\n`);
