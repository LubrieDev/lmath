// ─────────────────────────────────────────────
// despeje · presentacion — el retoque final de la ecuación despejada
// ─────────────────────────────────────────────
//
// Cuando el despeje ya es correcto queda escribirlo bien: `y = 2x/4` es la misma recta
// que `y = x/2`, pero solo una de las dos se lee. Esto reduce las fracciones enteras y
// entra dentro de los centinelas de doble signo para hacerlo también ahí.
//
// Va SOLO por la vía del panel. `despejeExplicito`, que alimenta al trazador, no pasa por
// aquí: al trazador le da igual cómo se escriba y cada retoque es una ocasión de romperlo.

import { parse } from "mathjs";

import { terminos, factores, resimbolizarConstantes, type Nodo } from "../formatoExpr";
import { desParen } from "./estrategias";
import { mcdEnteros } from "./aritmetica";

/** Centinelas de doble signo: al reducir hay que entrar DENTRO de ellos (`pm(2√x)/2` es
 *  `pm(√x)`), no tratarlos como un factor opaco. */
const SENTINELAS_SIGNO = new Set(["pm", "mp"]);

/** Coeficiente entero y resto simbólico de un término: `2*sqrt(x)` → `{coef:2, resto:"sqrt(x)"}`,
 *  `6` → `{coef:6, resto:""}`, `x` → `{coef:1, resto:"x"}`. null si algún factor no es entero o
 *  hay un denominador dentro (ahí reducir dejaría de ser una división limpia). */
function coefYresto(n: Nodo): { coef: number; resto: string } | null {
  let coef = 1;
  const resto: string[] = [];
  for (const f of factores(n)) {
    if (f.exp !== 1) return null;
    if (f.nodo.type === "ConstantNode") {
      const v = Number(f.nodo.value);
      if (!Number.isInteger(v)) return null;
      coef *= v;
    } else resto.push(f.nodo.toString());
  }
  return { coef, resto: resto.join(" * ") };
}

/** Divide numerador y denominador por su mayor factor entero común: `(2 ± 2√x)/2` → `1 ± √x`,
 *  `(6 ± 2√x)/2` → `3 ± √x`.
 *
 *  La fórmula cuadrática las produce sin reducir, y como `(y−1)²=x` se EXPANDE a `y²−2y+1=x`
 *  antes de despejar, el caso de manual más común del mundo —una parábola desplazada— salía del
 *  panel como `(2 ± 2√x)/2`. Ninguna pasada de formato lo tocaba: todas tratan `pm(·)` como una
 *  función opaca y no se atreven a entrar. Aquí sí se entra, porque sabemos qué es.
 *
 *  Solo factores POSITIVOS: dividir por uno negativo intercambiaría `pm` y `mp` y rompería el
 *  emparejamiento de los signos cuando aparecen los dos en la misma expresión. */
function reducirFraccionEntera(rhs: string): string {
  let n: Nodo;
  try { n = parse(rhs) as unknown as Nodo; } catch { return rhs; }
  const raiz = desParen(n);
  if (raiz.type !== "OperatorNode" || raiz.op !== "/" || raiz.args.length !== 2) return rhs;
  const den = desParen(raiz.args[1]);
  if (den.type !== "ConstantNode") return rhs;
  const d = Number(den.value);
  if (!Number.isInteger(d) || d < 2) return rhs;

  const ts = terminos(desParen(raiz.args[0]));
  if (ts.length === 0) return rhs;
  const partes: Array<{ signo: number; coef: number; resto: string; envoltura: string | null }> = [];
  for (const t of ts) {
    const nodo = desParen(t.nodo);
    const sentinela = nodo.type === "FunctionNode" && nodo.args.length === 1 &&
      nodo.fn?.name !== undefined && SENTINELAS_SIGNO.has(nodo.fn.name) ? nodo.fn.name : null;
    const cr = coefYresto(sentinela === null ? nodo : nodo.args[0]);
    if (cr === null) return rhs;
    partes.push({ signo: t.signo, ...cr, envoltura: sentinela });
  }
  let g = d;
  for (const p of partes) g = mcdEnteros(g, Math.abs(p.coef));
  if (g < 2) return rhs;

  let out = "";
  partes.forEach((p, i) => {
    const c = p.coef / g;
    const nucleo = p.resto === "" ? String(c) : c === 1 ? p.resto : `${c} * ${p.resto}`;
    const cuerpo = p.envoltura ? `${p.envoltura}(${nucleo})` : nucleo;
    if (i === 0) out = p.signo === 1 ? cuerpo : `-${cuerpo}`;
    else out += p.signo === 1 ? ` + ${cuerpo}` : ` - ${cuerpo}`;
  });
  return d / g === 1 ? out : `(${out}) / (${d / g})`;
}

/** Recupera la forma EXACTA de las constantes irracionales que el despeje decimalizó al
 *  dividir: `√20·y = x` daba `y = 0.22360679774997896·x`, que es correcto y a la vez ilegible.
 *  Es el mismo paso que ya cerraba Simplificar, Derivar e Integrar; el despeje era el único
 *  de los cuatro paneles que no lo hacía.
 *
 *  Va SOLO en esta vía —la del panel—. `despejeExplicito`, que es la que alimenta al trazador,
 *  llama a `despejar` directamente y no pasa por aquí: lo que se dibuja no cambia ni un píxel
 *  por un cambio de tipografía. Ante cualquier fallo se devuelve la cadena intacta. */
export function embellecerConstantes(ec: string): string {
  try {
    const partes = ec.split("=");
    if (partes.length !== 2) return ec;
    const original = parse(partes[1]) as unknown as Nodo;
    const rhs = reducirFraccionEntera(resimbolizarConstantes(original).toString());
    // Si no había ninguna constante que recuperar, se devuelve la cadena TAL CUAL. Re-serializar
    // por mathjs cambia el espaciado (`^2`→`^ 2`, `2*pi`→`2 * pi`) y esta salida es el string
    // canónico que el resto del proyecto encadena y compara: sin esta guarda, todo despeje
    // ajeno al cambio se reescribía por un motivo puramente tipográfico.
    if (rhs === original.toString()) return ec;
    return `${partes[0].trim()} = ${rhs}`;
  } catch { return ec; }
}
