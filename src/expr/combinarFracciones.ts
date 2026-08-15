// ─────────────────────────────────────────────
// expr · Combinación de fracciones (ratsimp casero, para la derivada)
// ─────────────────────────────────────────────

import { parse } from "mathjs";

import {
  contieneFuncion, strFactorSeguro, valorConstanteFactor, type Nodo,
} from "./nodo";
import { mcd, fraccionExacta, racionalizarFracciones } from "./fracciones";
import { rationalizeSeguro } from "./expansion";
import { combinarYordenar, formatearCanonico } from "../formatoExpr";

//
// `derivative` (mathjs) produce fracciones ANIDADAS con factores repetidos
// (d/dx atan(√(x+1)/(x²+1)) → cuatro niveles de división) y ni `simplify` ni
// `rationalize` las combinan: simplify no reescribe fracciones compuestas y
// rationalize directamente se CUELGA con fracciones racionales anidadas (>60 s).
// Aquí se hace la combinación estructural: toda la expresión se lleva a UNA
// fracción (numerador/denominador como listas de factores con exponente entero),
// las sumas se pasan a común denominador, los factores IDÉNTICOS (clave = string)
// se cancelan entre num y den, y las sumas polinómicas pequeñas del resultado se
// expanden con rationalize (seguro: polinomio puro y tamaño acotado). NO garantiza
// equivalencia de dominio (cancelar √u/√u lo extiende): el LLAMADOR debe validar
// numéricamente contra la expresión original antes de adoptar el resultado
// (ver `derivar.simplificarDerivada`).

/** Factor con exponente entero (>0). num/den de una fracción estructural. */
interface FactorPot { nodo: Nodo; exp: number }
interface FraccionPot { num: FactorPot[]; den: FactorPot[] }

const clavePot = (f: FactorPot): string => f.nodo.toString();

/** Descompone un nodo en fracción de listas de factores. Atraviesa * / − unario,
 *  potencias de exponente entero y sumas (a común denominador). Las FUNCIONES son
 *  átomos (no se entra en sus argumentos). */
function aFraccionPot(n: Nodo): FraccionPot {
  if (n.type === "ParenthesisNode") return aFraccionPot(n.content);
  if (n.type === "OperatorNode") {
    const [a, b] = (n.args ?? []) as [Nodo, Nodo];
    if (n.op === "*" && n.args.length === 2) {
      const A = aFraccionPot(a), B = aFraccionPot(b);
      return { num: [...A.num, ...B.num], den: [...A.den, ...B.den] };
    }
    if (n.op === "/" && n.args.length === 2) {
      const A = aFraccionPot(a), B = aFraccionPot(b);
      return { num: [...A.num, ...B.den], den: [...A.den, ...B.num] };
    }
    if (n.op === "-" && n.args.length === 1) {
      const A = aFraccionPot(a);
      return { num: [...A.num, { nodo: parse("-1") as unknown as Nodo, exp: 1 }], den: A.den };
    }
    if ((n.op === "+" || n.op === "-") && n.args.length === 2) {
      const A = aFraccionPot(a), B = aFraccionPot(b);
      // Común denominador: unión por clave con el exponente MÁXIMO; cada término se
      // multiplica por el complemento que le falta y se suma como nodo. El sustraendo
      // de una resta sí necesita paréntesis (podría ser una suma o llevar signo).
      const denU = unionPot(A.den, B.den);
      const tA = renderFactoresPot([...A.num, ...restaPot(denU, A.den)]);
      const tB = renderFactoresPot([...B.num, ...restaPot(denU, B.den)]);
      const suma = n.op === "+" ? `${tA} + ${tB}` : `${tA} - (${tB})`;
      return { num: [{ nodo: parse(suma) as unknown as Nodo, exp: 1 }], den: denU };
    }
    // Exponente entero: `valorConstanteFactor` (no `b.type === "ConstantNode"`) porque la
    // entrada `x^{-1}` normaliza a `x^(-1)`, cuyo exponente mathjs deja como PARÉNTESIS
    // sobre un menos unario, no como ConstantNode(−1). Sin desenvolverlo, un factor con
    // exponente negativo no se reconocía como DENOMINADOR: `1/(1−|x|^{-1})` quedaba con
    // `|x|^{-1}` de átomo opaco y no se combinaba a `|x|/(|x|−1)`.
    if (n.op === "^") {
      const k0 = valorConstanteFactor(b);
      if (k0 !== null && Number.isInteger(k0) && k0 !== 0) {
        const A = aFraccionPot(a), k = Math.abs(k0);
        const pot = (fs: FactorPot[]) => fs.map((f) => ({ nodo: f.nodo, exp: f.exp * k }));
        return k0 > 0
          ? { num: pot(A.num), den: pot(A.den) }
          : { num: pot(A.den), den: pot(A.num) };
      }
    }
  }
  return { num: [{ nodo: n, exp: 1 }], den: [] };
}

/** Agrupa una lista de factores por clave sumando exponentes. */
function agruparPot(fs: FactorPot[]): Map<string, FactorPot> {
  const m = new Map<string, FactorPot>();
  for (const f of fs) {
    const k = clavePot(f), prev = m.get(k);
    if (prev) prev.exp += f.exp;
    else m.set(k, { nodo: f.nodo, exp: f.exp });
  }
  return m;
}

/** Unión por clave con exponente máximo (común denominador de una suma). */
function unionPot(a: FactorPot[], b: FactorPot[]): FactorPot[] {
  const ma = agruparPot(a), mb = agruparPot(b), out: FactorPot[] = [];
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const fa = ma.get(k), fb = mb.get(k);
    out.push({ nodo: (fa ?? fb)!.nodo, exp: Math.max(fa?.exp ?? 0, fb?.exp ?? 0) });
  }
  return out;
}

/** a − b como multiconjunto por clave (exponentes que le sobran a `a`). */
function restaPot(a: FactorPot[], b: FactorPot[]): FactorPot[] {
  const mb = agruparPot(b), out: FactorPot[] = [];
  for (const [k, f] of agruparPot(a)) {
    const exp = f.exp - (mb.get(k)?.exp ?? 0);
    if (exp > 0) out.push({ nodo: f.nodo, exp });
  }
  return out;
}

/** ¿El factor tiene una SUMA en el nivel superior? (para ordenarlas al final). */
function esSuma(n: Nodo): boolean {
  if (n.type === "ParenthesisNode") return esSuma(n.content);
  return n.type === "OperatorNode" && (n.op === "+" || n.op === "-") && n.args.length === 2;
}

/** ¿El nodo es atómico como operando de `*` / base de `^`? (símbolo, constante,
 *  llamada a función: no necesita paréntesis). */
function esAtomo(n: Nodo): boolean {
  if (n.type === "ParenthesisNode") return esAtomo(n.content);
  return n.type === "SymbolNode" || n.type === "ConstantNode" || n.type === "FunctionNode";
}

/** Serializa factores como producto mathjs: coeficiente racional plegado al frente,
 *  luego factores sin suma, luego los factores-suma (leen mejor al final). "1" si vacío.
 *  Paréntesis solo donde hacen falta (átomos y potencias van desnudos). */
function renderFactoresPot(fs: FactorPot[]): string {
  let coefN = 1, coefD = 1;
  const resto: FactorPot[] = [];
  for (const f of fs) {
    const v = valorConstanteFactor(f.nodo);
    const fr = v !== null ? fraccionExacta(v) : null;
    if (fr) { coefN *= Math.pow(fr.n, f.exp); coefD *= Math.pow(fr.d, f.exp); }
    else resto.push(f);
  }
  let signo = 1;
  if (coefN < 0) { signo = -signo; coefN = -coefN; }
  const g = mcd(coefN, coefD) || 1; coefN /= g; coefD /= g;
  const orden = [...resto.filter((f) => !esSuma(f.nodo)), ...resto.filter((f) => esSuma(f.nodo))];
  const cuerpo = orden.map((f) => {
    const base = esAtomo(f.nodo) ? f.nodo.toString() : `(${f.nodo.toString()})`;
    return f.exp === 1 ? (esAtomo(f.nodo) ? base : strFactorSeguro(f.nodo)) : `${base}^${f.exp}`;
  });
  const partes = [
    ...(coefN !== 1 || cuerpo.length === 0 ? [String(coefN)] : []),
    ...cuerpo,
  ];
  let out = partes.join(" * ");
  if (coefD !== 1) out = `(${out}) / ${coefD}`;
  return signo === 1 ? out : `-(${out})`;
}

/** Expande una suma POLINÓMICA pequeña (sin funciones, tamaño acotado) con
 *  rationalize + orden canónico. Intacta si no aplica. El tope de LONGITUD no basta
 *  como salvaguarda (`(x+1)^12` son 9 caracteres y no termina nunca): el presupuesto
 *  real es `rationalizeSeguro` (nº de monomios de la expansión). */
function expandirSumaPolinomica(n: Nodo): Nodo {
  if (!esSuma(n) || contieneFuncion(n)) return n;
  const s = n.toString();
  if (s.length > 240) return n;
  const r0 = rationalizeSeguro(s);
  if (!r0) return n;
  try {
    const r = combinarYordenar(r0);
    return parse(formatearCanonico(racionalizarFracciones(r))) as unknown as Nodo;
  } catch { return n; }
}

/**
 * Combina TODA la expresión en una sola fracción: sumas a común denominador,
 * factores idénticos cancelados (num vs den, por clave y exponente) y numeradores
 * polinómicos expandidos. Devuelve un nodo re-parseado; puede AMPLIAR el dominio
 * (cancelaciones tipo √u/√u): validar numéricamente en el llamador.
 */
export function combinarFracciones(n: Nodo): Nodo {
  const fr = aFraccionPot(n);
  const num = restaPot(fr.num, fr.den).map((f) => ({ ...f, nodo: expandirSumaPolinomica(f.nodo) }));
  const den = restaPot(fr.den, fr.num);
  const numS = renderFactoresPot(num);
  if (den.length === 0) return parse(numS) as unknown as Nodo;
  return parse(`(${numS}) / (${renderFactoresPot(den)})`) as unknown as Nodo;
}

/** Profundidad de ANIDAMIENTO de fracciones de un árbol: 0 sin división; 1 = fracción
 *  plana `a/b`; 2 = una fracción DENTRO del numerador/denominador de otra (fracción de
 *  fracciones), etc. Métrica de legibilidad compartida: menos anidamiento se lee mejor.
 *  La usan la derivada (`simplificarDerivada`) y Simplificar para elegir la forma plana. */
export function profundidadFraccion(n: Nodo): number {
  let max = 0;
  const rec = (node: Nodo, d: number): void => {
    if (!node || typeof node !== "object") return;
    const nd = node.type === "OperatorNode" && node.op === "/" ? d + 1 : d;
    if (nd > max) max = nd;
    if (node.content) rec(node.content, nd);
    for (const a of (node.args ?? [])) rec(a, nd);
  };
  rec(n, 0);
  return max;
}
