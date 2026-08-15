// ─────────────────────────────────────────────
// Formato algebraico compartido (términos con signo)
// ─────────────────────────────────────────────
//
// Utilidades comunes a `despejar` y `simplificar`: aplanar los términos aditivos de
// una expresión con su signo y volverlos a serializar. Dos convenciones de orden:
//   • `renderTerminos` — POSITIVOS PRIMERO (`2 - x`, nunca `-x + 2`). Para expresiones
//     dentro de raíces/funciones y donde importa no arrancar con signo negativo.
//   • `renderCanonico` — VARIABLES ANTES QUE CONSTANTES en lo polinómico (`-2x + 6`,
//     `-x + 8`, forma `mx+b`), pero cae a "positivos primero" si hay una función
//     transcendental (sin/tan/√…) para conservar `2 - tan(x)` (evita el doble signo).
// Ambas son IDEMPOTENTES en formato → permiten detectar de forma fiable "no cambia nada"
// y que Simplificar tras Despejar (que comparten `renderCanonico`) sea un no-op.
//
// ── Qué vive aquí y qué se mudó ────────────────────────────────────────────────────────
//
// Este archivo era seis subsistemas en uno (1 077 líneas). Se quedó con LO QUE SU NOMBRE
// PROMETE —serializar y ordenar— y el resto se mudó a `src/expr/`, cada pieza con su
// propia responsabilidad:
//
//   • `expr/nodo.ts`        el tipo `Nodo`, los constructores y las consultas estructurales
//   • `expr/signos.ts`      la interpretación abstracta de signos sobre el AST
//   • `expr/expansion.ts`   la cuarentena de `rationalize`
//   • `expr/fracciones.ts`  recuperar las fracciones exactas que mathjs decimaliza
//   • `expr/combinarFracciones.ts`  llevar las fracciones anidadas a una sola
//   • `expr/radicales.ts`   radicales y re-simbolización de constantes irracionales
//
// El módulo SIGUE REEXPORTÁNDOLO TODO, así que los once archivos que importan de
// `formatoExpr` no cambian ni una línea. Quien escriba código nuevo puede importar del
// módulo concreto; quien mantenga el viejo no tiene que enterarse.

import { parse } from "mathjs";

import {
  terminos, factores, contieneFuncion, esConstante, valorConstanteFactor,
  opNodo, strFactorSeguro,
  type Nodo, type Termino,
} from "./expr/nodo";
import { mcd, fraccionExacta } from "./expr/fracciones";

// ── Reexportación: la superficie pública de `formatoExpr` no cambia ────────────────────
export type { Nodo, Termino, Factor } from "./expr/nodo";
export {
  opNodo, constNodo, simboloNodo, funcNodo,
  contieneVariable, terminos, factores, valorConstanteFactor,
} from "./expr/nodo";
export { SIG_NEG, SIG_CERO, SIG_POS, SIG_TODO, signoDe, esNoNegativo, esSiempreNegativo } from "./expr/signos";
export { LIMITE_EXPANSION, costeExpansion, rationalizeSeguro } from "./expr/expansion";
export { racionalizarFracciones } from "./expr/fracciones";
export { combinarFracciones, profundidadFraccion } from "./expr/combinarFracciones";
export { reducirRadicales, resimbolizarConstantes } from "./expr/radicales";

/** La expresión sin sus FACTORES constantes de magnitud (`x/2` → `x`, `-4x` → `-x`), que no
 *  cambian el conjunto `{R ≥ 0}`. El SIGNO se conserva (dividir por |c|, no por c), así que
 *  la condición almacenada sigue significando exactamente lo mismo. Simplifica a la vez lo que
 *  el motor EVALÚA y lo que el panel PINTA, sin que sean dos reglas distintas. */
export function sinFactoresConstantes(n: Nodo): Nodo {
  let nodo = n;
  for (let i = 0; i < 16; i++) {
    if (nodo.type === "ParenthesisNode") { nodo = nodo.content; continue; }
    if (nodo.type === "OperatorNode" && (nodo.op === "*" || nodo.op === "/") && nodo.args.length === 2) {
      const der = valorConstanteFactor(nodo.args[1]);
      if (der !== null && der !== 0) {
        nodo = der < 0 ? opNodo("-", "unaryMinus", [nodo.args[0]]) : nodo.args[0];
        continue;
      }
      // Solo en el PRODUCTO puede estar la constante a la izquierda: en `c/R` es el dividendo
      // y R el divisor, que puede anularse o cambiar de signo → no es un reescalado.
      const izq = nodo.op === "*" ? valorConstanteFactor(nodo.args[0]) : null;
      if (izq !== null && izq !== 0) {
        nodo = izq < 0 ? opNodo("-", "unaryMinus", [nodo.args[1]]) : nodo.args[1];
        continue;
      }
    }
    break;
  }
  return nodo;
}

/** El árbol sin ParenthesisNode EXPLÍCITOS.
 *
 *  Un ParenthesisNode es un paréntesis que alguien escribió o construyó; los que la NOTACIÓN
 *  necesita los pone mathjs al serializar, calculando la precedencia de cada operador. Por eso
 *  quitarlos todos no cambia el significado del string resultante —`(a+b)*c` se sigue
 *  imprimiendo `(a + b) * c`— pero sí elimina los que sobran.
 *
 *  Hace falta porque si no, el formato deja de ser CANÓNICO: un mismo árbol se serializa distinto
 *  según cómo se construyera (`combinarFracciones` emite `(3) / (y)` y `4 / (y ^ 2)` donde el
 *  parseo directo da `3 / y` y `4 / y ^ 2`). Y como el motor compara STRINGS para saber si una
 *  transformación cambió algo, eso rompía la idempotencia: Simplificar dos veces daba dos
 *  resultados distintos y el botón parecía seguir haciendo algo. */
export function sinParentesisRedundantes(n: Nodo): Nodo {
  return n.transform((m: Nodo) => {
    let x = m;
    while (x.type === "ParenthesisNode") x = x.content;
    return x;
  });
}

/** Invierte el signo de cada término. */
export const flip = (ts: Termino[]): Termino[] =>
  ts.map((t) => ({ signo: (-t.signo) as 1 | -1, nodo: t.nodo }));

/** Serializa una lista YA ORDENADA de términos a STRING mathjs (signo del 1º al frente,
 *  luego ` + ` / ` - `). */
function serializar(orden: Termino[]): string {
  let out = "";
  orden.forEach((t, i) => {
    const s = t.nodo.toString();
    if (i === 0) out = t.signo === 1 ? s : `-${s}`;
    else out += t.signo === 1 ? ` + ${s}` : ` - ${s}`;
  });
  return out;
}

/** Descarta los términos 0. */
const sinCeros = (ts: Termino[]): Termino[] =>
  ts.filter((t) => !(t.nodo.type === "ConstantNode" && t.nodo.value === 0));

/** Serializa términos con signo, POSITIVOS primero (no empieza con un signo negativo
 *  salvo que no haya positivos). Descarta los términos 0. */
export function renderTerminos(ts: Termino[]): string {
  const nz = sinCeros(ts);
  if (nz.length === 0) return "0";
  return serializar([...nz.filter((t) => t.signo === 1), ...nz.filter((t) => t.signo === -1)]);
}

/** Serializa términos con orden CANÓNICO: en lo polinómico, las variables antes que las
 *  constantes (`-2x + 6`, `-x + 8`), con el signo tal cual (admite negativo al frente).
 *  Si hay algún término con función transcendental cae a "positivos primero" (`2 - tan(x)`,
 *  para no dejar el doble signo). Descarta los términos 0. */
export function renderCanonico(ts: Termino[]): string {
  const nz = sinCeros(ts);
  if (nz.length === 0) return "0";
  if (nz.some((t) => contieneFuncion(t.nodo))) return renderTerminos(nz);
  return serializar([...nz.filter((t) => !esConstante(t.nodo)), ...nz.filter((t) => esConstante(t.nodo))]);
}

/** Aplana una CADENA de productos (solo `*`; la división y los paréntesis son átomos). */
function cadenaProducto(n: Nodo, out: Nodo[] = []): Nodo[] {
  if (n.type === "OperatorNode" && n.op === "*" && n.args.length === 2) {
    cadenaProducto(n.args[0], out); cadenaProducto(n.args[1], out);
  } else out.push(n);
  return out;
}

/**
 * Pone el COEFICIENTE NUMÉRICO al frente de cada producto del árbol, a cualquier profundidad
 * (incluido el interior de una función, donde `combinarYordenar` no entra por ser no polinómica).
 * `simplify` de mathjs deja el número DETRÁS del símbolo al racionalizar un decimal
 * (`sin(3.5·θ)` → `sin(θ·7/2)`), y su LaTeX sale como `\frac{\theta7}{2}`: número pegado tras la
 * letra, ilegible y matemáticamente confuso. Con el coeficiente delante → `\frac{7\theta}{2}`.
 * Estable (no altera el orden relativo de los factores simbólicos) y devuelve el nodo INTACTO
 * si ya está en orden → el resto del proyecto queda byte-idéntico.
 */
export function coeficientesAlFrente(n: Nodo): Nodo {
  const rec = (m: Nodo): Nodo => {
    const t = m.map(rec);
    if (!(t.type === "OperatorNode" && t.op === "*" && t.args.length === 2)) return t;
    const fs = cadenaProducto(t);
    const nums = fs.filter((f) => valorConstanteFactor(f) !== null);
    const resto = fs.filter((f) => valorConstanteFactor(f) === null);
    if (nums.length === 0 || nums.length === fs.length) return t;
    // Coeficiente de magnitud 1 → NO se emite como factor: `simplify` deja `pi*(-1)/6`
    // dentro de una función y sacarlo al frente daba el literal `-1*pi/6` (LaTeX
    // `\frac{-1\pi}{6}`, que se lee "menos uno por π"). Se colapsa al signo: `-pi/6`.
    const val = nums.reduce((a, f) => a * (valorConstanteFactor(f) as number), 1);
    if (Math.abs(val) === 1) {
      const cuerpo = resto.reduce((a, b) => opNodo("*", "multiply", [a, b]));
      return val === 1 ? cuerpo : opNodo("-", "unaryMinus", [cuerpo]);
    }
    const orden = [...nums, ...resto];
    if (orden.every((f, i) => f === fs[i])) return t;          // ya estaban delante
    return orden.reduce((a, b) => opNodo("*", "multiply", [a, b]));
  };
  return rec(n);
}

/** Reordena los términos aditivos de nivel superior de un nodo a "positivos primero"
 *  y lo devuelve como string mathjs (no expande ni combina más de lo que ya está). */
export function formatearPositivosPrimero(n: Nodo): string {
  return renderTerminos(terminos(coeficientesAlFrente(n)));
}

/** Igual que `formatearPositivosPrimero` pero con orden CANÓNICO (variables antes que
 *  constantes en lo polinómico). Lo usa Simplificar para coincidir con Despejar. */
export function formatearCanonico(n: Nodo): string {
  return renderCanonico(terminos(coeficientesAlFrente(n)));
}

// ─────────────────────────────────────────────
// Orden de factores (constantes con nombre delante) + combinación de semejantes
// ─────────────────────────────────────────────
//
// `rationalize` (mathjs) NO combina términos semejantes cuando interviene una constante con
// NOMBRE como π: `(x²+5x−x)·π` queda `x²·π + 5·π·x − x·π` (ni junta 5πx−πx=4πx, ni mantiene
// π del mismo lado). Aquí, SOLO en lo polinómico, se reordenan los factores de cada término
// poniendo las constantes con nombre (π, e…) DELANTE de las variables —como coeficiente
// simbólico: `\pi x`, no `x\pi`— y se SUMAN los términos con los mismos símbolos. Devuelve el
// nodo INTACTO si no hay nada que reordenar ni combinar (los casos ya correctos quedan
// byte-idénticos aguas abajo: no altera el resto del proyecto).

/** Constantes matemáticas con NOMBRE (símbolos, no números): van delante de las variables. */
const CONSTANTES_CON_NOMBRE = new Set(["pi", "e", "tau", "phi"]);

/** Nombre base de un factor para ordenar/agrupar: la variable/constante subyacente (`x` de
 *  `x^2`), o su string si no es símbolo ni potencia de símbolo. */
function baseFactor(nodo: Nodo): string {
  if (nodo.type === "SymbolNode") return nodo.name;
  if (nodo.type === "OperatorNode" && nodo.op === "^" && nodo.args?.[0]?.type === "SymbolNode")
    return nodo.args[0].name;
  return nodo.toString();
}

/** Clave de orden de un factor: (0 constante-con-nombre / 1 variable, base, string). */
function claveFactor(nodo: Nodo): string {
  const base = baseFactor(nodo);
  return `${CONSTANTES_CON_NOMBRE.has(base) ? 0 : 1}|${base}|${nodo.toString()}`;
}

/**
 * Reordena factores (constantes con nombre delante) y combina términos semejantes en una
 * expresión POLINÓMICA. Nodo intacto si hay funciones transcendentales, si algún término no
 * es un producto de símbolos por un coeficiente racional limpio, o si no hay nada que cambiar.
 */
export function combinarYordenar(n: Nodo): Nodo {
  const ts = terminos(n);
  if (ts.length === 0 || ts.some((t) => contieneFuncion(t.nodo))) return n;

  interface Desc { signo: 1 | -1; n: number; d: number; num: Nodo[]; den: Nodo[]; reord: boolean }
  const descs: (Desc | null)[] = ts.map((t) => {
    let num1 = 1, den1 = 1;
    const num: Nodo[] = [], den: Nodo[] = [];
    // Un coeficiente numérico que NO es un `ConstantNode` limpio (p. ej. el menos unario
    // `-2` de `pi * -2 * x`) exige re-emitir el término aunque los símbolos ya estén en
    // orden: al reconstruirlo lo sacamos al frente como signo+valor canónico (`-2*pi*x`).
    let coefSucio = false;
    for (const f of factores(t.nodo)) {
      const val = valorConstanteFactor(f.nodo);
      if (val !== null) {
        const fr = fraccionExacta(val);
        if (!fr) return null;                    // coeficiente no racional limpio → no combinar
        if (f.nodo.type !== "ConstantNode") coefSucio = true;
        if (f.exp === 1) { num1 *= fr.n; den1 *= fr.d; } else { num1 *= fr.d; den1 *= fr.n; }
      } else (f.exp === 1 ? num : den).push(f.nodo);
    }
    let signo = t.signo;
    if (num1 < 0) { signo = -signo as 1 | -1; num1 = -num1; }
    if (den1 < 0) { signo = -signo as 1 | -1; den1 = -den1; }
    const g = mcd(num1, den1) || 1; num1 /= g; den1 /= g;
    const orden = (xs: Nodo[]) => [...xs].sort((a, b) => (claveFactor(a) < claveFactor(b) ? -1 : claveFactor(a) > claveFactor(b) ? 1 : 0));
    const numS = orden(num), denS = orden(den);
    const reord = coefSucio || num.some((x, i) => x !== numS[i]) || den.some((x, i) => x !== denS[i]);
    return { signo, n: num1, d: den1, num: numS, den: denS, reord };
  });
  if (descs.some((x) => x === null)) return n;
  const ds = descs as Desc[];

  // Agrupa por firma de símbolos (num/den ya ordenados) sumando coeficientes (fracciones).
  const firma = (t: Desc) => `${t.num.map((s) => s.toString()).join("*")}/${t.den.map((s) => s.toString()).join("*")}`;
  const grupos = new Map<string, { n: number; d: number; num: string[]; den: string[] }>();
  for (const t of ds) {
    const sn = t.signo * t.n;
    const g = grupos.get(firma(t));
    if (!g) grupos.set(firma(t), { n: sn, d: t.d, num: t.num.map(strFactorSeguro), den: t.den.map(strFactorSeguro) });
    else {
      const nn = g.n * t.d + sn * g.d, dd = g.d * t.d, s = nn < 0 ? -1 : 1, an = Math.abs(nn), gg = mcd(an, dd) || 1;
      g.n = (s * an) / gg; g.d = dd / gg;
    }
  }
  // Nada que cambiar (ni se combinó ni se reordenó) → nodo intacto.
  if (grupos.size === ds.length && !ds.some((t) => t.reord)) return n;

  // Emisión: no-constantes en orden de aparición, la constante (firma "/") al final; ceros fuera.
  const entradas = [...grupos.entries()].filter(([, g]) => g.n !== 0);
  const grps = [...entradas.filter(([k]) => k !== "/"), ...entradas.filter(([k]) => k === "/")].map(([, g]) => g);
  if (grps.length === 0) return parse("0") as unknown as Nodo;
  let out = "";
  grps.forEach((g, i) => {
    const signo = g.n < 0 ? -1 : 1, valN = Math.abs(g.n);
    const numStr = [...(valN !== 1 || g.num.length === 0 ? [String(valN)] : []), ...g.num].join("*");
    const denPartes = [...(g.d !== 1 ? [String(g.d)] : []), ...g.den];
    const cuerpo = (numerador: string) => (denPartes.length ? `(${numerador})/(${denPartes.join("*")})` : numerador);
    if (i === 0) out = signo === 1 ? cuerpo(numStr) : cuerpo(`-${numStr}`);
    else out += signo === 1 ? ` + ${cuerpo(numStr)}` : ` - ${cuerpo(numStr)}`;
  });
  try { return parse(out) as unknown as Nodo; } catch { return n; }
}
