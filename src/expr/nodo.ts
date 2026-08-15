// ─────────────────────────────────────────────
// expr · El AST de mathjs como vista plana (`Nodo`) y sus primitivas
// ─────────────────────────────────────────────
//
// El SUELO del CAS: el tipo `Nodo`, los constructores que encapsulan la frontera con
// mathjs, y las consultas estructurales que todo el resto da por supuestas (aplanar
// términos y factores, mirar si hay una variable, leer un coeficiente constante).
//
// Vivía en `formatoExpr.ts`, que había crecido hasta ser seis subsistemas en un archivo.
// Esto es lo que los seis comparten, así que es lo único que puede estar debajo de todos
// sin crear un ciclo.

import {
  parse,
  OperatorNode, ConstantNode, SymbolNode, FunctionNode,
  type MathNode,
} from "mathjs";

/**
 * AST de mathjs con acceso estructural directo. mathjs expone `type` + métodos en el
 * nodo base (`MathNode`) y reparte `args`/`op`/`fn`/`name`/`value`/`content` entre los
 * subtipos (OperatorNode, ConstantNode, …), lo que obliga a un `narrowing` que este
 * motor no hace: el código comprueba `.type` a mano y accede a la prop directamente.
 * Este tipo lo modela como una vista PLANA (todas las props de subtipo presentes) con
 * métodos de recorrido AUTORREFERENCIALES (operan y devuelven `Nodo`, no `MathNode`), de
 * modo que las lecturas (`.op`, `.args[0]`) y los callbacks (`.map(sustituir)`,
 * `.filter((n: Nodo) => …)`) quedan naturales. El `.type` es el discriminante que
 * garantiza en runtime que la prop leída existe. Reemplaza al viejo `= any`, que
 * propagaba `no-unsafe-*` por todo el motor. No es asignable a `MathNode` (los métodos
 * autorreferenciales lo impiden por varianza), así que en la FRONTERA con mathjs se
 * castea: `mathjs → Nodo` con `as Nodo`, y `Nodo → mathjs` mediante los ayudantes de
 * construcción de nodos (`opNodo`, `funcNodo`, …) que encapsulan el cast inverso.
 */
export interface Nodo {
  type: string;
  op: string;
  fn: Nodo;
  name: string;
  value: number;
  args: Nodo[];
  content: Nodo;
  implicit?: boolean;
  isConstantNode?: boolean;
  isSymbolNode?: boolean;
  isOperatorNode?: boolean;
  isFunctionNode?: boolean;
  isParenthesisNode?: boolean;
  toString(options?: object): string;
  toTex(options?: object): string;
  filter(cb: (n: Nodo, path: string, parent: Nodo) => boolean): Nodo[];
  forEach(cb: (n: Nodo, path: string, parent: Nodo) => void): void;
  map(cb: (n: Nodo, path: string, parent: Nodo) => Nodo): Nodo;
  transform(cb: (n: Nodo, path: string, parent: Nodo) => Nodo): Nodo;
  traverse(cb: (n: Nodo, path: string, parent: Nodo) => void): void;
  compile(): { evaluate(scope?: Record<string, number>): number };
  evaluate(scope?: Record<string, number>): number;
  clone(): Nodo;
  cloneDeep(): Nodo;
}
export interface Termino { signo: 1 | -1; nodo: Nodo }
/** Factor de un producto; `exp` = +1 numerador, −1 denominador. */
export interface Factor { exp: 1 | -1; nodo: Nodo }

// ─────────────────────────────────────────────
// Construcción de nodos (frontera con mathjs)
// ─────────────────────────────────────────────
// Los constructores de mathjs devuelven subtipos de `MathNode` y exigen `MathNode[]` en
// los hijos, no `Nodo`. Estos ayudantes encapsulan ese doble cast de frontera en un solo
// sitio: aceptan/devuelven `Nodo` y el motor no vuelve a ver `MathNode` ni `any`.

/** `OperatorNode`: `op` = símbolo (`+`, `*`, `/`…), `fn` = nombre mathjs (`add`, `multiply`…). */
export const opNodo = (op: string, fn: string, args: Nodo[], implicit?: boolean): Nodo =>
  new OperatorNode(op as never, fn as never, args as unknown as MathNode[], implicit) as unknown as Nodo;
/** `ConstantNode`: literal numérico. */
export const constNodo = (value: number): Nodo =>
  new ConstantNode(value) as unknown as Nodo;
/** `SymbolNode`: variable/constante con nombre (`x`, `pi`, centinelas…). */
export const simboloNodo = (name: string): Nodo =>
  new SymbolNode(name) as unknown as Nodo;
/** `FunctionNode`: `fn` es el `SymbolNode` de la función (no un string). */
export const funcNodo = (fn: Nodo, args: Nodo[]): Nodo =>
  new FunctionNode(fn as unknown as SymbolNode, args as unknown as MathNode[]) as unknown as Nodo;

/** ¿El subárbol referencia el símbolo `nombre`? */
export function contieneVariable(n: Nodo, nombre: string): boolean {
  return n.filter((nn: Nodo) => nn.type === "SymbolNode" && nn.name === nombre).length > 0;
}


/** ¿El término es constante (sin ningún símbolo/variable)? Un literal numérico. */
export function esConstante(n: Nodo): boolean {
  return n.filter((nn: Nodo) => nn.type === "SymbolNode").length === 0;
}

/** ¿El subárbol contiene alguna FUNCIÓN (sin, cos, tan, sqrt, nthRoot…)? Marca los
 *  términos NO polinómicos, para los que no se aplica el orden canónico. */
export function contieneFuncion(n: Nodo): boolean {
  return n.filter((nn: Nodo) => nn.type === "FunctionNode").length > 0;
}

/** Aplana los términos aditivos de nivel superior con su signo (atraviesa paréntesis,
 *  sumas, restas y el menos unario; pliega constantes negativas). */
export function terminos(n: Nodo, signo: 1 | -1 = 1): Termino[] {
  if (n.type === "ParenthesisNode") return terminos(n.content, signo);
  if (n.type === "OperatorNode") {
    if (n.op === "+" && n.args.length === 2)
      return [...terminos(n.args[0], signo), ...terminos(n.args[1], signo)];
    if (n.op === "-" && n.args.length === 2)
      return [...terminos(n.args[0], signo), ...terminos(n.args[1], (-signo) as 1 | -1)];
    if (n.op === "-" && n.args.length === 1)
      return terminos(n.args[0], (-signo) as 1 | -1);
  }
  if (n.type === "ConstantNode" && typeof n.value === "number" && n.value < 0)
    return [{ signo: (-signo) as 1 | -1, nodo: parse(String(-n.value)) as unknown as Nodo }];
  return [{ signo, nodo: n }];
}

/** Aplana los factores multiplicativos de nivel superior con su exponente ±1
 *  (atraviesa paréntesis, productos y divisiones). `x·(y/z)` → [x⁺, y⁺, z⁻]. */
export function factores(n: Nodo, exp: 1 | -1 = 1): Factor[] {
  if (n.type === "ParenthesisNode") return factores(n.content, exp);
  if (n.type === "OperatorNode" && n.args.length === 2) {
    if (n.op === "*") return [...factores(n.args[0], exp), ...factores(n.args[1], exp)];
    if (n.op === "/") return [...factores(n.args[0], exp), ...factores(n.args[1], (-exp) as 1 | -1)];
  }
  return [{ exp, nodo: n }];
}

/** Valor numérico de un factor SIN símbolos, o null si no lo es. Reconoce la constante
 *  literal (`ConstantNode`) PERO TAMBIÉN el menos UNARIO que mathjs deja como coeficiente
 *  negativo dentro de un producto: al distribuir `-pi*(2x+4)` emite `pi * -2 * x`, donde el
 *  `-2` es un `OperatorNode` unario, no un `ConstantNode`. Sin desenvolverlo, ese `-2` se
 *  tomaba por factor SIMBÓLICO → el reordenamiento no juntaba el coeficiente y mathjs pintaba
 *  `\pi\cdot-2\cdot x`, que `limpiarTex` colapsaba a `\pi-2x` (bug: `f(x)=\pi-2x-4\pi`). */
export function valorConstanteFactor(nodo: Nodo): number | null {
  if (nodo.type === "ConstantNode" && typeof nodo.value === "number") return nodo.value;
  if (nodo.type === "ParenthesisNode") return valorConstanteFactor(nodo.content);
  if (nodo.type === "OperatorNode" && nodo.op === "-" && nodo.args.length === 1) {
    const v = valorConstanteFactor(nodo.args[0]);
    return v === null ? null : -v;
  }
  return null;
}

/** String de un factor SEGURO dentro de un producto: si el nodo tiene una suma/resta
 *  en el nivel superior se envuelve en paréntesis. `factores()` atraviesa los
 *  `ParenthesisNode`, así que un factor-suma llega DESNUDO: unirlo con `*` sin
 *  re-parentetizar rompería la precedencia (`a*(b+c)` ≠ `a*b+c`). */
export function strFactorSeguro(n: Nodo): string {
  const s = n.toString();
  const raiz = n.type === "ParenthesisNode" ? n.content : n;
  const esAditivo = raiz.type === "OperatorNode" && (raiz.op === "+" || raiz.op === "-");
  return esAditivo ? `(${s})` : s;
}
