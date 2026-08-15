// ─────────────────────────────────────────────
// expr · Radicales y re-simbolización de constantes irracionales
// ─────────────────────────────────────────────

import { parse } from "mathjs";

import { factores, strFactorSeguro, opNodo, type Nodo } from "./nodo";

//
// `derivative` y `simplify` (mathjs) EVALÚAN a decimal las constantes irracionales que
// aparecen al operar: `d/dx 3^x` → `1.0986… · 3^x` (era `\ln 3 · 3^x`), y `simplify(\ln 3)`,
// `atan(1)`… igual. Ese decimal, además de perder la forma exacta, ROMPE el LaTeX: `\ln 3`
// junto al siguiente número se pega (`1.0986…3^{x}` → `\ln 33^{x}`). Aquí se RECUPERA la
// forma simbólica: se reconoce el valor decimal contra `\ln k`, `1/\ln k`, `\pi`, `\sqrt k`
// (tolerancia estrecha 1e-9: un decimal cualquiera no cae por azar en `\ln k`) y se sustituye
// el nodo por su forma exacta. Como `\ln k` renderiza `\ln k` (sin paréntesis) y se PEGA al
// factor siguiente, además se mueve el factor con logaritmo al FINAL de su producto
// (`\ln 3 · 3^x` → `3^x · \ln 3`, que sí renderiza bien). La usan `derivar` e `integrar`.

/** Forma simbólica (string mathjs) de un decimal que es una constante irracional conocida,
 *  o null. Reconoce `\ln k` y su recíproco `1/\ln k` (coeficiente típico de `∫a^x`), `π`, `e`
 *  y `√k`, con su signo. Tolerancia estrecha: solo el decimal EXACTO de la constante casa. */
function formaSimbolica(v: number): string | null {
  if (!Number.isFinite(v) || Number.isInteger(v)) return null;
  const cerca = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * (1 + Math.abs(b));
  if (cerca(Math.abs(v), Math.PI)) return v < 0 ? "-pi" : "pi";
  if (cerca(Math.abs(v), Math.E)) return v < 0 ? "-e" : "e";
  for (let k = 2; k <= 100; k++) {
    const lk = Math.log(k);
    if (cerca(v, lk)) return `log(${k}, e)`;
    if (cerca(v, -lk)) return `-log(${k}, e)`;
    if (cerca(v, 1 / lk)) return `1/log(${k}, e)`;
    if (cerca(v, -1 / lk)) return `-1/log(${k}, e)`;
  }
  const signo = (s: string) => (v < 0 ? `-(${s})` : s);
  // √k, 1/√k y ∛k por ARITMÉTICA, no por catálogo. Antes esto era una tabla `k = 2..40`, y
  // todo lo que caía fuera llegaba decimalizado al panel: `√50`→`7.0710678118654755`,
  // `√300`, `√20+√5` (que es `√45`) y cualquier raíz cúbica, porque no había ninguna. Un
  // catálogo no puede cubrir un conjunto infinito; elevar al cuadrado sí.
  const k2 = radicandoEntero(Math.abs(v), 2);
  if (k2 !== null) return signo(strRadical(k2, 2));
  // Recíproco: se devuelve RACIONALIZADO —`1/√2` se escribe `√2/2`—, que además es la forma
  // que el usuario escribe. Antes se devolvía `1/√k` tal cual, así que una entrada correcta
  // como `√2/2` salía del panel convertida en `1/√2`: la simplificación iba hacia atrás.
  const kr = radicandoEntero(1 / Math.abs(v), 2);
  if (kr !== null) {
    const { a, b } = extraerFactorRadical(kr, 2) ?? { a: 1, b: kr };
    if (b !== 1) return signo(`sqrt(${b})/${a * b}`);
  }
  const k3 = radicandoEntero(Math.abs(v), 3);
  if (k3 !== null) return signo(strRadical(k3, 3));
  // Logaritmos DECIMAL y BINARIO. `log(2, 10)` sí lo pliega mathjs a `0.3010299956639812`
  // —sus dos argumentos son constantes, al contrario que `log(u, e)`, donde `e` es un
  // símbolo—, así que la forma exacta hay que recuperarla aquí, igual que se recupera `√2`
  // de `1.4142…`. Se busca por aritmética: elevar la base al valor y ver si sale un entero.
  for (const base of [10, 2]) {
    const p = Math.pow(base, Math.abs(v));
    const k = Math.round(p);
    if (k >= 2 && k <= 1e9 && Math.abs(p - k) <= 1e-9 * k && !Number.isInteger(Math.log(k) / Math.log(base)))
      return signo(`log(${k}, ${base})`);
  }
  return null;
}

/** Entero `k` del que `v` es la raíz `indice`-ésima, o null. Sustituye a la tabla de raíces
 *  que había antes: cubre TODO k en vez de los cuarenta primeros. La tolerancia es la misma
 *  de siempre (1e-9 relativo), así que un decimal cualquiera no cae aquí por azar: `0.5637`
 *  al cuadrado es `0.3178`, que no se parece a ningún entero. */
function radicandoEntero(v: number, indice: number): number | null {
  if (!Number.isFinite(v) || v <= 0) return null;
  const q = Math.pow(v, indice);
  const k = Math.round(q);
  if (k < 2 || k > 1e9) return null;
  if (Math.abs(q - k) > 1e-9 * k) return null;
  // Raíz EXACTA (`√4`, `∛8`): es un entero, no una constante irracional; no es asunto nuestro.
  const r = Math.round(Math.pow(k, 1 / indice));
  return Math.pow(r, indice) === k ? null : k;
}

/** Mayor `a` con `a^indice` divisor de `k`, y el resto `b = k/a^indice`: `(20,2)`→`{a:2,b:5}`
 *  porque `√20 = 2√5`; `(54,3)`→`{a:3,b:2}` porque `∛54 = 3∛2`. null si no hay nada que
 *  extraer. Acotado por arriba para que el bucle no se dispare con radicandos enormes. */
function extraerFactorRadical(k: number, indice: number): { a: number; b: number } | null {
  if (!Number.isInteger(k) || k < 2 || k > 1e9 || indice < 2 || indice > 12) return null;
  let a = 1, b = k;
  for (let p = 2; Math.pow(p, indice) <= b; p++) {
    const pe = Math.pow(p, indice);
    while (b % pe === 0) { b /= pe; a *= p; }
  }
  return a === 1 ? null : { a, b };
}

/** Forma escrita de `ⁿ√k` ya reducida: `20,2`→`2*sqrt(5)`, `54,3`→`3*nthRoot(2,3)`. */
function strRadical(k: number, indice: number): string {
  const raiz = (r: number) => (indice === 2 ? `sqrt(${r})` : `nthRoot(${r}, ${indice})`);
  const f = extraerFactorRadical(k, indice);
  if (f === null) return raiz(k);
  return f.b === 1 ? `${f.a}` : `${f.a}*${raiz(f.b)}`;
}

/** Saca del radical el mayor factor entero que salga exacto: `√20`→`2√5`, `√(20x)`→`2√(5x)`,
 *  `∛54`→`3∛2`, `√4`→`2`. Es una identidad EXACTA —`√(a²b) = a√b` con `a>0`— y no mueve el
 *  dominio: `20x ≥ 0` y `5x ≥ 0` son la misma condición, así que la curva no cambia.
 *
 *  Solo se toca el factor NUMÉRICO del radicando. `√(12x+27)` se deja intacto: extraer el 3
 *  de una suma exige factorizarla, que es otra decisión y otro riesgo. */
export function reducirRadicales(n: Nodo): Nodo {
  return n.transform((node: Nodo) => {
    if (node.type !== "FunctionNode") return node;
    const nombre = node.fn?.name;
    const indice = nombre === "sqrt" ? 2 : nombre === "cbrt" ? 3
      : nombre === "nthRoot" && node.args?.length === 2 && node.args[1].type === "ConstantNode"
        ? Number(node.args[1].value) : 0;
    if (!Number.isInteger(indice) || indice < 2 || indice > 12) return node;
    const radicando = node.args?.[0];
    if (!radicando) return node;
    // El radicando es un entero literal, o un producto con un entero literal por factor.
    const fs = factores(radicando);
    let k = 1;
    const resto: string[] = [];
    for (const f of fs) {
      const val = f.nodo.type === "ConstantNode" ? Number(f.nodo.value) : NaN;
      if (f.exp === 1 && Number.isInteger(val) && val > 0) k *= val;
      else resto.push(f.exp === 1 ? strFactorSeguro(f.nodo) : `1/(${strFactorSeguro(f.nodo)})`);
    }
    const f = extraerFactorRadical(k, indice);
    if (f === null) return node;
    const raiz = (cuerpo: string) =>
      indice === 2 ? `sqrt(${cuerpo})` : `nthRoot(${cuerpo}, ${indice})`;
    const dentro = [...(f.b !== 1 || resto.length === 0 ? [String(f.b)] : []), ...resto].join("*");
    const fuera = dentro === "1" ? `${f.a}` : `${f.a}*${raiz(dentro)}`;
    try { return parse(fuera) as unknown as Nodo; } catch { return node; }
  });
}

/** ¿El subárbol contiene una llamada a `log` (natural)? Para reordenar el factor al final. */
function contieneLog(n: Nodo): boolean {
  return n.filter((x: Nodo) => x.type === "FunctionNode" && x.fn?.name === "log").length > 0;
}

/**
 * Recupera las constantes irracionales decimalizadas por mathjs (`\ln k`, `1/\ln k`, `π`, `√k`)
 * en un árbol y mueve el factor con logaritmo al FINAL de su producto (evita el pegado del
 * LaTeX `\ln k` con el número siguiente). Preserva el valor numérico EXACTO: solo cambia la
 * FORMA. Es el último paso de `derivarExpr`/`integrarExpr`; no re-simplifica después (simplify
 * volvería a decimalizar).
 */
export function resimbolizarConstantes(n: Nodo): Nodo {
  // `reducirRadicales` va ANTES: los radicales que ya venían escritos (`√20` de un despeje,
  // no decimalizado por nadie) también deben salir reducidos, no solo los que se recuperan
  // de un decimal. `formaSimbolica` ya devuelve su parte reducida, así que no se pisan.
  const resimbolizado = reducirRadicales(n).transform((node: Nodo) => {
    if (node.isConstantNode && typeof node.value === "number") {
      const s = formaSimbolica(node.value);
      if (s) return parse(s) as unknown as Nodo;
    }
    return node;
  });
  // `formaSimbolica` devuelve los recíprocos como `1/log(k)` o `1/√k`, y al multiplicarse
  // dejaban el 1 a la vista: `ln x/ln 10` salía del panel como `\frac{1\ln x}{\ln 10}`. Un
  // producto por un recíproco ES una división —mismo valor y mismo dominio, `b≠0` en las dos
  // formas—, así que se colapsa.
  const colapsarReciproco = (m: Nodo): Nodo => {
    const t = m.map(colapsarReciproco);
    if (t.type === "OperatorNode" && t.op === "*" && t.args.length === 2) {
      for (const [i, j] of [[0, 1], [1, 0]]) {
        const r = t.args[j];
        if (r.type === "OperatorNode" && r.op === "/" && r.args.length === 2 &&
            r.args[0].type === "ConstantNode" && Number(r.args[0].value) === 1)
          return opNodo("/", "divide", [t.args[i], r.args[1]]);
      }
    }
    return t;
  };
  const logAlFinal = (m: Nodo): Nodo => {
    const t = m.map(logAlFinal);
    if (t.type === "OperatorNode" && t.op === "*" && t.args.length === 2) {
      const [l, r] = t.args;
      const dep = (x: Nodo) => x.filter((y: Nodo) => y.isSymbolNode === true && y.name === "x").length > 0;
      // Constante con logaritmo × algo con la variable → variable primero, log al final.
      if (contieneLog(l) && !dep(l) && dep(r)) return opNodo("*", "multiply", [r, l]);
    }
    return t;
  };
  return colapsarReciproco(logAlFinal(resimbolizado));
}
