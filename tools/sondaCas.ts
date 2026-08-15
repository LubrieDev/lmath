// ─────────────────────────────────────────────
// SONDA del CAS · radicales, exponentes no enteros y anidamiento
// ─────────────────────────────────────────────
//
// Diagnóstico, no prueba: interroga al simplificador y al despejador con casos que la
// batería no cubría (radicales numéricos reducibles, exponentes decimales, anidamiento) y
// vuelca lo que sale para poder mirarlo. No afirma nada; el juicio es de quien lo lee.
//
//   npm run sonda && node tools/.sonda.cjs [nivel]

import { simplificarEcuaciones } from "../src/simplificar";
import { despejarEcuaciones } from "../src/despejar";
import { bloqueALatex } from "../src/latex";
import { compilarExpresion } from "../src/evaluador";
import { normalizarEntrada } from "../src/parser";
import { insertarProductoImplicito } from "../src/core/parsing/productoImplicito";

declare const process: { argv: string[]; stdout: { write(s: string): void } };

interface Caso { ec: string; espera?: string; nota?: string }

const NIVELES: Array<{ nombre: string; casos: Caso[] }> = [
  {
    nombre: "N1 · radicales numéricos reducibles",
    casos: [
      { ec: "y = sqrt(4)",      espera: "2" },
      { ec: "y = sqrt(20)",     espera: "2 sqrt(5)" },
      { ec: "y = sqrt(8)",      espera: "2 sqrt(2)" },
      { ec: "y = sqrt(12)",     espera: "2 sqrt(3)" },
      { ec: "y = sqrt(18)",     espera: "3 sqrt(2)" },
      { ec: "y = sqrt(50)",     espera: "5 sqrt(2)" },
      { ec: "y = sqrt(72)",     espera: "6 sqrt(2)" },
      { ec: "y = sqrt(300)",    espera: "10 sqrt(3)" },
      { ec: "y = sqrt(1/4)",    espera: "1/2" },
      { ec: "y = sqrt(2)/2",    nota: "ya reducido: no debe empeorar" },
      { ec: "y = 1/sqrt(2)",    espera: "sqrt(2)/2" },
      { ec: "y = sqrt(20)/2",   espera: "sqrt(5)" },
      { ec: "y = sqrt(20) + sqrt(5)", espera: "3 sqrt(5)" },
      { ec: "y = nthRoot(54,3)", espera: "3 nthRoot(2,3)" },
      { ec: "y = nthRoot(16,4)", espera: "2" },
    ],
  },
  {
    nombre: "N2 · exponentes no enteros",
    casos: [
      { ec: "y = x^0.5",     espera: "sqrt(x)" },
      { ec: "y = x^0.5637",  nota: "irreducible: debe sobrevivir intacto y evaluar" },
      { ec: "y = x^2.5",     espera: "x^2 sqrt(x)  o  x^(5/2)" },
      { ec: "y = x^(1/3)" },
      { ec: "y = x^(3/2)" },
      { ec: "y = x^(-0.5)",  espera: "1/sqrt(x)" },
      { ec: "y = x^(-2.5)" },
      { ec: "y = (x^2)^0.5", nota: "TRAMPA: es |x|, no x" },
      { ec: "y = (x^0.5)^2", nota: "TRAMPA: es x solo para x>=0" },
      { ec: "y = 4^0.5",     espera: "2" },
      { ec: "y = 8^(1/3)",   espera: "2" },
      { ec: "y = x^1.0",     espera: "x" },
    ],
  },
  {
    nombre: "N3 · radicales con variable",
    casos: [
      { ec: "y = sqrt(20*x^2)",   espera: "2 sqrt(5) |x|" },
      { ec: "y = sqrt(4*x^2)",    espera: "2|x|" },
      { ec: "y = sqrt(x^2)",      nota: "TRAMPA: |x|" },
      { ec: "y = sqrt(20*x)",     espera: "2 sqrt(5x)" },
      { ec: "y = sqrt(8*x^3)",    espera: "2x sqrt(2x)" },
      { ec: "y = sqrt(20) * x",   nota: "coeficiente radical" },
      { ec: "y = sqrt(12*x + 27)", espera: "sqrt(3) sqrt(4x+9)" },
      { ec: "y = sqrt(x)*sqrt(x)", nota: "TRAMPA: dominio x>=0, no x" },
    ],
  },
  {
    nombre: "N4 · anidamiento",
    casos: [
      { ec: "y = sqrt(sqrt(x))" },
      { ec: "y = sqrt(x + sqrt(x))" },
      { ec: "y = ((x^2+1)^0.5 + 1)^0.5" },
      { ec: "y = sqrt(20*sqrt(20))" },
      { ec: "y = (x^0.5637)^2" },
      { ec: "y = sqrt(2)^sqrt(2)" },
      { ec: "y = ((x+1)^2)^0.5637" },
      { ec: "y = sqrt(1 + sqrt(1 + sqrt(x)))" },
    ],
  },
  {
    nombre: "N6 · logaritmos y exponenciales (donde el DOMINIO se mueve)",
    casos: [
      { ec: "y = log(x^2)",        nota: "TRAMPA: 2ln|x|, no 2ln x (x<0 sí existe)" },
      { ec: "y = log(x)+log(x)",   espera: "2 log(x)" },
      { ec: "y = log(x)*2",        espera: "2 log(x)" },
      { ec: "y = log(x*x)",        nota: "TRAMPA: igual que log(x^2)" },
      { ec: "y = log(2*x)",        nota: "log2+log x solo si x>0; dejar quieto es correcto" },
      { ec: "y = e^log(x)",        nota: "TRAMPA: = x solo para x>0" },
      { ec: "y = log(e^x)",        espera: "x (válido en todo R)" },
      { ec: "y = log(1)",          espera: "0" },
      { ec: "y = log(x)/log(10)",  nota: "cambio de base: log10(x)" },
      { ec: "y = e^x*e^x",         espera: "e^(2x)" },
      { ec: "y = (e^x)^2",         espera: "e^(2x)" },
      { ec: "y = e^(0)",           espera: "1" },
      { ec: "y = 2^x*2^(-x)",      espera: "1" },
    ],
  },
  {
    nombre: "N7 · trigonometría e identidades",
    casos: [
      { ec: "y = sin(x)^2 + cos(x)^2", espera: "1" },
      { ec: "y = sin(x)/cos(x)",    nota: "= tan x, pero cancelar cambia el dominio" },
      { ec: "y = 2*sin(x)*cos(x)",  nota: "= sin(2x): identidad válida en todo R" },
      { ec: "y = sin(-x)",          espera: "-sin(x)" },
      { ec: "y = cos(-x)",          espera: "cos(x)" },
      { ec: "y = sin(0)",           espera: "0" },
      { ec: "y = tan(x)*cos(x)",    nota: "= sin x salvo en los polos" },
      { ec: "y = asin(sin(x))",     nota: "TRAMPA: solo = x en [-pi/2, pi/2]" },
      { ec: "y = sin(x)^2",         nota: "forma: sin²x, no (sin x)^2" },
      { ec: "y = 1 - 2*sin(x)^2",   nota: "= cos(2x)" },
    ],
  },
  {
    nombre: "N8 · racionales y cancelación (fidelidad de dominio)",
    casos: [
      { ec: "y = (x^2-1)/(x-1)",    nota: "TRAMPA: hueco en x=1; NO debe dar x+1" },
      { ec: "y = (x^2+2*x+1)/(x+1)", nota: "TRAMPA: hueco en x=-1" },
      { ec: "y = x/x",              nota: "TRAMPA: hueco en x=0; NO debe dar 1" },
      { ec: "y = x*0",              espera: "0" },
      { ec: "y = x-x",              espera: "0" },
      { ec: "y = 1/(1/x)",          nota: "TRAMPA: hueco en x=0" },
      { ec: "y = (x+1)/(x+1)",      nota: "TRAMPA: hueco en x=-1" },
      { ec: "y = x/(x^2)",          espera: "1/x" },
      { ec: "y = (2*x+4)/2",        espera: "x+2" },
      { ec: "y = 1/(x-1) + 1/(x+1)", espera: "2x/(x^2-1)" },
      { ec: "y = (1/x)/(1/x)",      nota: "TRAMPA: hueco en x=0" },
    ],
  },
  {
    nombre: "N9 · degenerados y tamaño",
    casos: [
      { ec: "y = 0/0",              nota: "TRAMPA: indeterminado, NO debe dar 0" },
      { ec: "y = 1/0",              nota: "no finito" },
      { ec: "y = 0^0",              nota: "convenio; que no reviente" },
      { ec: "y = x^0",              nota: "TRAMPA: 1 salvo x=0" },
      { ec: "y = (x+1)^12",         nota: "expansión grande: no debe colgar" },
      { ec: "y = ((((x+1)*2)+3)*4+5)*6", espera: "48x + 174" },
      { ec: "y = 1e308*1e308",      nota: "desbordamiento" },
      { ec: "y = 0.1+0.2",          nota: "coma flotante: ¿0.30000000000000004?" },
      { ec: "y = x^(-0)",           nota: "cero negativo" },
    ],
  },
  {
    nombre: "N10 · despeje: y en sitios difíciles",
    casos: [
      { ec: "1/y = x" },
      { ec: "x/y = 2" },
      { ec: "y + 1/y = x",          nota: "cuadrática oculta: y²−xy+1=0" },
      { ec: "y*y = x" },
      { ec: "y = x*y + 1",          nota: "y en AMBOS lados" },
      { ec: "2*y - 3 = y + x",      nota: "y en ambos lados, lineal" },
      { ec: "abs(y) = x" },
      { ec: "abs(y - 1) = x" },
      { ec: "e^y = x" },
      { ec: "log(y) = x" },
      { ec: "2^y = x" },
      { ec: "y^y = x",              nota: "SIN forma cerrada: parcial es correcto" },
      { ec: "sqrt(y) + y = x",      nota: "cuadrática en √y" },
      { ec: "x^2 + y^2 = 25" },
      { ec: "(y-1)^2 = x" },
    ],
  },
  {
    nombre: "N5 · despeje con exponentes/radicales difíciles",
    casos: [
      { ec: "y^0.5637 = x" },
      { ec: "y^2.5 = x" },
      { ec: "sqrt(20)*y = x" },
      { ec: "y^(3/2) = x + 1" },
      { ec: "sqrt(y) + sqrt(20) = x" },
      { ec: "y^0.5 = x - 3" },
      { ec: "(y+1)^0.5637 = x" },
      { ec: "x^0.5637 + y^0.5637 = 1" },
    ],
  },
];

/* ── evaluación numérica: ¿la forma final sigue definiendo la misma función? ── */
const MUESTRA = [0.37, 0.9, 1.4, 2.6, 5.1, 9.3, -0.7, -2.3];
function lado(ec: string): string | null {
  const p = ec.split("=");
  return p.length === 2 ? p[1] : null;
}
function comparar(origEc: string, finalEc: string): string {
  const a = lado(origEc), b = lado(finalEc);
  if (a === null || b === null) return "";
  try {
    const fa = compilarExpresion(insertarProductoImplicito(normalizarEntrada(a)));
    const fb = compilarExpresion(insertarProductoImplicito(normalizarEntrada(b)));
    let dif = 0, nan = 0;
    for (const x of MUESTRA) {
      const va = fa({ x }) as number, vb = fb({ x }) as number;
      const fA = Number.isFinite(va), fB = Number.isFinite(vb);
      if (fA !== fB) { nan++; continue; }
      if (fA && Math.abs(va - vb) > 1e-9 * (1 + Math.abs(va))) dif++;
    }
    if (nan) return `  ⚠ DOMINIO difiere en ${nan}/${MUESTRA.length}`;
    if (dif) return `  ✖ VALOR difiere en ${dif}/${MUESTRA.length}`;
    return "";
  } catch (e) { return `  ⚠ no evaluable (${String(e).slice(0, 40)})`; }
}

/** Una línea por stdout. Como en `huellaTrazado`/`medirTrazado`: el lint de Obsidian prohíbe
 *  `console` —no hay consola en móvil— y no admite silenciarlo ni en una herramienta que
 *  nunca llega a un dispositivo. */
const linea = (s = "") => process.stdout.write(`${s}\n`);

const soloNivel = process.argv[2];
for (const niv of NIVELES) {
  if (soloNivel && !niv.nombre.startsWith(soloNivel)) continue;
  linea(`\n${"═".repeat(96)}\n${niv.nombre}\n${"═".repeat(96)}`);
  for (const c of niv.casos) {
    let simp = "?", tex = "?", desp = "?";
    try { simp = simplificarEcuaciones([c.ec])[0]; } catch (e) { simp = `EXCEPCIÓN ${String(e).slice(0, 60)}`; }
    try { tex = bloqueALatex([simp]); } catch (e) { tex = `EXCEPCIÓN ${String(e).slice(0, 60)}`; }
    try { desp = despejarEcuaciones([c.ec]).join(" ; "); } catch (e) { desp = `EXCEPCIÓN ${String(e).slice(0, 60)}`; }
    const aviso = simp.startsWith("EXCEPCIÓN") ? "" : comparar(c.ec, simp);
    linea(`\n  ${c.ec}`);
    if (c.espera) linea(`     espera   ${c.espera}`);
    if (c.nota)   linea(`     nota     ${c.nota}`);
    linea(`     simplif  ${simp}${aviso}`);
    linea(`     latex    ${tex}`);
    if (desp !== c.ec) linea(`     despeje  ${desp}`);
  }
}
linea();
