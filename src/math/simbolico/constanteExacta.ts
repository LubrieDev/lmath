// ─────────────────────────────────────────────
// simbólico · Constantes que resultan ser racionales EXACTOS (PURO)
// ─────────────────────────────────────────────
//
// `nthRoot(64, 3)` es 4. `√(16/9)` es 4/3. `8^(2/3)` es 4. Son racionales escritos con radicales,
// y el lector de polinomios los rechazaba a todos por la forma en que están escritos: veía un
// `FunctionNode` y devolvía `null`, así que `y^{3/2} = 8` —cuyo despeje es exactamente
// `y = nthRoot(8², 3)`— salía del motor como `3.9999999999999996` en vez de como `4`.
//
// Este módulo cierra esa fuga con una regla general y no con una lista de casos: **un subárbol
// SIN VARIABLES se intenta evaluar en ℚ**, y si se consigue, el resultado es un coeficiente más.
//
// ── Dónde está la honestidad ──────────────────────────────────────────────────────────────
// Toda la evaluación es aritmética exacta sobre enteros grandes; no interviene ni un `double`.
// Una raíz solo se acepta cuando la raíz entera EXISTE de verdad (se comprueba elevando y
// comparando), así que `√2` no se convierte en 1.41…: se declara no representable y la expresión
// entera vuelve a ser `null`, exactamente como antes. Este módulo solo puede convertir `null` en
// un valor exacto; nunca al revés, y nunca en uno aproximado.
//
// ── Alcance ──────────────────────────────────────────────────────────────────────────────
// Las cuatro operaciones, el opuesto, el valor absoluto, potencias de exponente entero y raíces
// de índice entero (`sqrt`, `cbrt`, `nthRoot`, y `^(p/q)` como raíz q-ésima de la potencia p).
// `pi` y `e` quedan fuera a propósito: son irracionales y no hay ningún racional que los
// represente, así que devolver `null` es la única respuesta cierta.

import {
  type Racional, cociente, desdeDecimal, desdeNumero, esCero, negado, potencia,
  producto, rac, resta, signo, suma,
} from "../racional";
import type { Nodo } from "../../expr/nodo";

/** Índice y exponente máximos que se intentan. Más allá, los enteros crecen sin que el resultado
 *  gane nada: nadie escribe una raíz 65-ésima esperando verla simplificada. */
const GRADO_MAXIMO = 64;

/** Numerador/denominador máximos que se aceptan al buscar una raíz entera. Acota el coste del
 *  tanteo binario, que es logarítmico pero sobre enteros que pueden ser enormes. */
const ENTERO_MAXIMO = 1n << 256n;

/** La raíz k-ésima entera EXACTA de n (n ≥ 0, k ≥ 1), o `null` si no existe.
 *  Búsqueda binaria sobre enteros: sin coma flotante, así que no hay ningún cuadrado perfecto
 *  que se escape por el redondeo del último bit. */
export function raizEnteraK(n: bigint, k: number): bigint | null {
  if (n < 0n || k < 1) return null;
  if (n < 2n) return n;
  let lo = 1n, hi = 2n;
  while (hi ** BigInt(k) <= n) hi *= 2n;
  while (lo < hi) {
    const medio = (lo + hi + 1n) / 2n;
    if (medio ** BigInt(k) <= n) lo = medio; else hi = medio - 1n;
  }
  return lo ** BigInt(k) === n ? lo : null;
}

/** La raíz k-ésima EXACTA de un racional, o `null`. El signo solo se admite negativo con índice
 *  impar, que es donde la raíz real existe (`∛−8 = −2`, `√−4` no es real). */
function raizRacional(v: Racional, k: number): Racional | null {
  if (k < 1 || k > GRADO_MAXIMO) return null;
  const negativo = signo(v) < 0;
  if (negativo && k % 2 === 0) return null;
  const n = negativo ? -v.n : v.n;
  if (n > ENTERO_MAXIMO || v.d > ENTERO_MAXIMO) return null;
  const rn = raizEnteraK(n, k);
  const rd = raizEnteraK(v.d, k);
  if (rn === null || rd === null) return null;
  return rac(negativo ? -rn : rn, rd);
}

/** El exponente como fracción exacta `p/q`, o `null`. Cubre `x^2`, `x^(1/3)`, `x^(2/3)` y el
 *  menos unario delante de cualquiera de ellos. */
function exponenteRacional(n: Nodo): Racional | null {
  return constanteExacta(n);
}

/** `v^(p/q)` exacto: primero la raíz q-ésima (que es donde se decide si existe) y luego la
 *  potencia p-ésima. En ese orden los enteros intermedios son mucho más pequeños. */
function potenciaRacionalExacta(base: Racional, e: Racional): Racional | null {
  if (e.d > BigInt(GRADO_MAXIMO)) return null;
  const raiz = e.d === 1n ? base : raizRacional(base, Number(e.d));
  if (raiz === null) return null;
  const p = e.n;
  if (p > BigInt(GRADO_MAXIMO) || p < -BigInt(GRADO_MAXIMO)) return null;
  if (p < 0n && esCero(raiz)) return null;                    // 0 elevado a negativo
  return potencia(raiz, Number(p));
}

/**
 * El racional EXACTO que vale este subárbol, o `null` si no lo hay.
 *
 * `null` cubre dos cosas distintas que aquí dan igual: que la expresión dependa de una variable,
 * y que su valor sea irracional. En los dos casos la respuesta correcta es la misma —no hay un
 * racional que poner en su lugar— y quien llama sigue por donde iba.
 */
export function constanteExacta(nodo: Nodo): Racional | null {
  switch (nodo.type) {
    case "ParenthesisNode":
      return constanteExacta(nodo.content);

    case "ConstantNode": {
      const v = nodo.value;
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      // El TEXTO del número, no su valor en coma flotante: quien escribe `0.1` quiere el décimo.
      return desdeDecimal(String(v)) ?? desdeNumero(v);
    }

    // Un símbolo es una variable (x, y) o una constante irracional (pi, e): ninguno es racional.
    case "SymbolNode":
      return null;

    case "OperatorNode": {
      if (nodo.op === "-" && nodo.args.length === 1) {
        const a = constanteExacta(nodo.args[0]);
        return a === null ? null : negado(a);
      }
      if (nodo.op === "+" && nodo.args.length === 1) return constanteExacta(nodo.args[0]);
      if (nodo.args.length !== 2) return null;
      const a = constanteExacta(nodo.args[0]);
      if (a === null) return null;
      if (nodo.op === "^") {
        const e = exponenteRacional(nodo.args[1]);
        return e === null ? null : potenciaRacionalExacta(a, e);
      }
      const b = constanteExacta(nodo.args[1]);
      if (b === null) return null;
      switch (nodo.op) {
        case "+": return suma(a, b);
        case "-": return resta(a, b);
        case "*": return producto(a, b);
        case "/": return esCero(b) ? null : cociente(a, b);
        default: return null;
      }
    }

    case "FunctionNode": {
      const nombre = nodo.fn?.name;
      const args = nodo.args;
      if (nombre === "sqrt" && args.length === 1) {
        const a = constanteExacta(args[0]);
        return a === null ? null : raizRacional(a, 2);
      }
      if (nombre === "cbrt" && args.length === 1) {
        const a = constanteExacta(args[0]);
        return a === null ? null : raizRacional(a, 3);
      }
      if (nombre === "nthRoot" && args.length === 2) {
        const a = constanteExacta(args[0]);
        const k = constanteExacta(args[1]);
        if (a === null || k === null || k.d !== 1n) return null;
        return raizRacional(a, Number(k.n));
      }
      if (nombre === "abs" && args.length === 1) {
        const a = constanteExacta(args[0]);
        return a === null ? null : (signo(a) < 0 ? negado(a) : a);
      }
      if (nombre === "unaryMinus" && args.length === 1) {
        const a = constanteExacta(args[0]);
        return a === null ? null : negado(a);
      }
      return null;
    }

    default:
      return null;
  }
}
