// ─────────────────────────────────────────────
// núcleo · La torre numérica (PURA)
// ─────────────────────────────────────────────
//
// Qué puede ser un número dentro de una expresión. Es la pieza que decide si el motor conserva
// la información matemática o la va perdiendo por el camino, así que las fronteras están
// elegidas y no heredadas.
//
// ── El invariante ────────────────────────────────────────────────────────────────────────
// **Un número es EXACTO salvo que el usuario haya escrito un decimal.** Nada de lo que hace el
// motor —simplificar, derivar, resolver— puede convertir un exacto en un flotante. Esa
// conversión ocurre en un solo sitio con nombre (`aproximar`), llamado cuando de verdad hace
// falta un `number` para dibujar o medir.
//
// Es lo contrario de lo que pasa hoy: `rationalize`/`simplify` de mathjs decimalizan `√2` a
// 1.4142…, y luego `resimbolizarConstantes` intenta adivinar de vuelta que aquello era un √2.
// Adivinar de vuelta funciona a menudo, y «a menudo» no es una propiedad de un CAS.
//
// ── Por qué el flotante está MARCADO y es CONTAGIOSO ─────────────────────────────────────
// Si `0.1` y `1/3` fueran la misma clase de cosa, un solo decimal del usuario contaminaría
// silenciosamente todo el cálculo y nadie sabría, al mirar el resultado, si es exacto. Con la
// marca, la respuesta a «¿esto es exacto?» es una consulta al dato y no una conjetura, y el
// impresor puede decirlo.
//
// ── Las tres plantas ─────────────────────────────────────────────────────────────────────
// `racional` es el suelo; `algebraico` (E3) es la planta que hace que `∛2` sea `∛2` y no
// 1.2599210498948732; `flotante` es el desván marcado donde va lo que ya venía aproximado.
//
// La planta algebraica entró AMPLIANDO la unión, y la unión es cerrada: el compilador señaló uno
// a uno todos los sitios que tenían que enterarse. Eso es exactamente lo que se compra al elegir
// una unión discriminada cerrada en vez de un `any` con forma.

import {
  type Racional, CERO, UNO, aNumero, aTexto, comparar as compararRac, desdeDecimal,
  cociente as cocienteRac, esCero, esEntero, iguales as igualesRac,
  potencia as potenciaRac, producto as productoRac,
  rac, suma as sumaRac,
} from "../../math/racional";
import {
  type Algebraico, aproximarA, compararA, comoRadical, desdeRacional, igualesA,
  productoA, racionalDe as racionalDeA, signoA, sumaA,
} from "../numeros/algebraico";

/**
 * Un número dentro de una expresión.
 *
 * `racional` es el caso normal y el que se conserva: ℚ con numerador y denominador `bigint`,
 * reducido, reutilizando `math/racional.ts` sin duplicar ni una línea de su aritmética.
 *
 * `flotante` es la excepción declarada: solo aparece cuando la entrada trae un decimal que no es
 * exactamente un racional pequeño, y una vez dentro CONTAMINA todo lo que toca, para que la
 * respuesta a «¿queda algo exacto aquí?» sea siempre verificable.
 */
export type Numero =
  | { readonly clase: "racional"; readonly valor: Racional }
  | { readonly clase: "algebraico"; readonly valor: Algebraico }
  | { readonly clase: "flotante"; readonly valor: number };

/** Rango de la clase para el orden total. Se amplía SOLO por el final (ver `orden.ts`). */
export const RANGO_NUMERO: Readonly<Record<Numero["clase"], number>> = {
  racional: 0,
  algebraico: 1,
  flotante: 2,
};

// ─────────────────────────────────────────────
// Construcción
// ─────────────────────────────────────────────

export const numRacional = (valor: Racional): Numero => ({ clase: "racional", valor });
export const numEntero = (n: bigint | number): Numero =>
  numRacional(rac(typeof n === "bigint" ? n : BigInt(Math.trunc(n))));
export const numFlotante = (valor: number): Numero => ({ clase: "flotante", valor });

/**
 * Un algebraico como número de la torre. Si resulta ser racional se GUARDA como racional: dos
 * representaciones del mismo número serían dos datos distintos, y entonces `3/2` escrito y `3/2`
 * salido de resolver una ecuación no compararían iguales.
 */
export function numAlgebraico(valor: Algebraico): Numero {
  const r = racionalDeA(valor);
  return r === null ? { clase: "algebraico", valor } : numRacional(r);
}

export const CERO_N = numRacional(CERO);
export const UNO_N = numRacional(UNO);
export const MENOS_UNO_N = numRacional(rac(-1n));

/**
 * Un decimal ESCRITO, como número de la torre. `"0.1"` → 1/10 exacto, `"1.25"` → 5/4.
 *
 * Un decimal que alguien ha tecleado **es** un racional exacto, y guardarlo como tal es la única
 * lectura fiel: `0.5637` es 5637/10000, ni más ni menos. Que luego se IMPRIMA como `0.5637` y no
 * como una fracción de cuatro cifras es una decisión del impresor, no de la representación —y
 * confundir las dos cosas es justo el defecto que esta reforma elimina.
 *
 * Lee los DÍGITOS y no los bits (`desdeDecimal`, no `desdeNumero`): `0.1` entra como el décimo
 * que la persona quiso decir y no como la fracción binaria que el `double` guarda.
 *
 * Si el texto no es un decimal legible, se marca como flotante en vez de inventarse un exacto.
 */
export function desdeTexto(texto: string): Numero {
  const r = desdeDecimal(texto);
  if (r !== null) return numRacional(r);
  const x = Number(texto);
  return numFlotante(x);
}

/**
 * Un `double` que viene de un CÁLCULO, no de la escritura de nadie. Siempre flotante.
 *
 * Es la mitad que hace honesta a la otra: `1/3` calculado en coma flotante es
 * `0.3333333333333333`, y llamarlo 3333333333333333/10000000000000000 sería convertir una
 * aproximación en un exacto, que es exactamente lo que el motor tiene prohibido hacer. Quien
 * sabe si un número viene de un texto o de una cuenta es quien llama, así que la decisión es
 * suya y está en el nombre de la función que elige.
 */
export const desdeCalculo = (x: number): Numero => numFlotante(x);

// ─────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────

export const esExacto = (n: Numero): boolean => n.clase !== "flotante";
export const esCeroN = (n: Numero): boolean =>
  n.clase === "racional" ? esCero(n.valor)
  : n.clase === "algebraico" ? signoA(n.valor) === 0
  : n.valor === 0;
export const esUnoN = (n: Numero): boolean =>
  n.clase === "racional" ? igualesRac(n.valor, UNO)
  : n.clase === "algebraico" ? igualesA(n.valor, desdeRacional(UNO))
  : n.valor === 1;
export const esEnteroN = (n: Numero): boolean =>
  n.clase === "racional" ? esEntero(n.valor)
  : n.clase === "algebraico" ? false      // un algebraico entero ya se habría guardado racional
  : Number.isInteger(n.valor);

/** El entero que representa, o `null` si no representa uno. Lo piden los exponentes. */
export function enteroDe(n: Numero): bigint | null {
  if (n.clase === "racional") return esEntero(n.valor) ? n.valor.n : null;
  if (n.clase === "algebraico") return null;   // si fuera entero, sería racional (ver numAlgebraico)
  return Number.isInteger(n.valor) ? BigInt(n.valor) : null;
}

/** El signo del número: −1, 0 o 1. */
export function signoN(n: Numero): -1 | 0 | 1 {
  if (n.clase === "racional") return n.valor.n < 0n ? -1 : n.valor.n > 0n ? 1 : 0;
  if (n.clase === "algebraico") return signoA(n.valor);
  return n.valor < 0 ? -1 : n.valor > 0 ? 1 : 0;
}

/**
 * LA FRONTERA. El único sitio de todo el núcleo donde un número exacto se convierte en un
 * `double`, con la pérdida que eso supone. Se llama para dibujar y para medir, nunca dentro de
 * una transformación algebraica.
 */
export function aproximar(n: Numero): number {
  switch (n.clase) {
    case "racional": return aNumero(n.valor);
    case "algebraico": return aproximarA(n.valor);
    case "flotante": return n.valor;
  }
}

/** Texto canónico y re-leíble. Los racionales como `n/d`, los flotantes tal cual. */
export function textoN(n: Numero): string {
  switch (n.clase) {
    case "racional": return aTexto(n.valor);
    case "flotante": return String(n.valor);
    case "algebraico": {
      // Si tiene forma de radical se escribe como tal —`nthRoot(2, 3)` es re-leíble—; si no, se
      // describe por lo que ES: la raíz de un polinomio dentro de un intervalo. Nunca su decimal:
      // este texto lo leen las pruebas, y un decimal ahí escondería justo lo que se quiere ver.
      const r = comoRadical(n.valor);
      if (r === null) return `raiz(${aTexto(n.valor.a)}, ${aTexto(n.valor.b)})`;
      const cuerpo = `nthRoot(${aTexto(r.radicando)}, ${r.indice})`;
      return r.signo < 0 ? `-${cuerpo}` : cuerpo;
    }
  }
}

// ─────────────────────────────────────────────
// Aritmética
// ─────────────────────────────────────────────
//
// Exacta mientras los dos operandos lo sean; en cuanto entra un flotante, el resultado es
// flotante. Ese contagio es lo que hace que `esExacta` signifique algo: si una expresión dice
// que es exacta, es que ni un solo paso del cálculo pasó por coma flotante.
//
// La aritmética exacta NO se reimplementa: es la de `math/racional.ts`, con sus `bigint` y sus
// invariantes, que llevan versiones funcionando y probadas.

const ambosRacionales = (a: Numero, b: Numero): boolean =>
  a.clase === "racional" && b.clase === "racional";

/** Un exacto visto como algebraico, para poder operarlo con otro algebraico. `null` si no lo es. */
function comoAlgebraico(n: Numero): Algebraico | null {
  if (n.clase === "algebraico") return n.valor;
  return n.clase === "racional" ? desdeRacional(n.valor) : null;
}

/**
 * Operación exacta de dos números, con degradación HONESTA:
 *   ℚ con ℚ            → ℚ, por `math/racional.ts`
 *   exacto con exacto  → algebraico, por resultantes
 *   cualquier flotante → flotante, y la marca se propaga
 * Si la vía algebraica no consigue aislar el resultado, se cae a flotante en vez de devolver algo
 * exacto que no se ha podido comprobar.
 */
function operar(
  a: Numero, b: Numero,
  enQ: (x: Racional, y: Racional) => Racional,
  enA: (x: Algebraico, y: Algebraico) => Algebraico | null,
  enR: (x: number, y: number) => number
): Numero {
  if (ambosRacionales(a, b)) {
    return numRacional(enQ((a as { valor: Racional }).valor, (b as { valor: Racional }).valor));
  }
  const xa = comoAlgebraico(a), xb = comoAlgebraico(b);
  if (xa !== null && xb !== null) {
    const r = enA(xa, xb);
    if (r !== null) return numAlgebraico(r);
  }
  return numFlotante(enR(aproximar(a), aproximar(b)));
}

export const sumaN = (a: Numero, b: Numero): Numero =>
  operar(a, b, sumaRac, sumaA, (x, y) => x + y);

export const productoN = (a: Numero, b: Numero): Numero =>
  operar(a, b, productoRac, productoA, (x, y) => x * y);

/**
 * `a^k` con k ENTERO. Solo entero: `2^(1/2)` no es un racional y devolver su decimal sería
 * fabricar una aproximación donde hay un irracional. `null` significa «esto no es un número de
 * esta torre», y quien llama deja la potencia sin evaluar —que es la respuesta correcta hasta
 * que la torre tenga su planta algebraica—.
 */
export function potenciaN(a: Numero, k: bigint): Numero | null {
  if (a.clase === "algebraico") {
    // Potencia entera de un algebraico: productos repetidos, que siguen siendo exactos. El tope
    // es bajo a propósito —cada producto pasa por una resultante y el grado se multiplica—, y
    // por encima se prefiere no responder a responder despacio y sin avisar.
    const n = Number(k);
    if (!Number.isSafeInteger(n) || n < 0 || n > 8) return null;
    if (n === 0) return signoA(a.valor) === 0 ? null : UNO_N;
    let acc = a.valor;
    for (let i = 1; i < n; i++) {
      const r = productoA(acc, a.valor);
      if (r === null) return null;
      acc = r;
    }
    return numAlgebraico(acc);
  }
  if (a.clase !== "racional") return numFlotante(Math.pow(a.valor, Number(k)));
  if (esCero(a.valor) && k < 0n) return null;                 // 1/0 no es un número
  const n = Number(k);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 4096) return null;  // no explotar la memoria
  // `potencia` de `math/racional.ts` está documentada para exponentes NO NEGATIVOS, y con uno
  // negativo devuelve 1 sin avisar. El exponente negativo se resuelve aquí invirtiendo, en vez
  // de cambiarle el contrato a un módulo compartido que lleva versiones estable.
  const positiva = numRacional(potenciaRac(a.valor, Math.abs(n)));
  if (n >= 0) return positiva;
  const p = (positiva as { valor: Racional }).valor;
  return esCero(p) ? null : numRacional(cocienteRac(UNO, p));
}

// ─────────────────────────────────────────────
// Comparación e igualdad
// ─────────────────────────────────────────────

/**
 * Igualdad ESTRUCTURAL: `1/2` racional y `0.5` flotante NO son iguales, aunque valgan lo mismo.
 * Es deliberado y es la razón de ser de la marca: si fueran iguales, la torre no serviría para
 * saber qué se ha perdido.
 */
export function igualesN(a: Numero, b: Numero): boolean {
  if (a.clase !== b.clase) return false;
  if (a.clase === "racional" && b.clase === "racional") return igualesRac(a.valor, b.valor);
  if (a.clase === "algebraico" && b.clase === "algebraico") return igualesA(a.valor, b.valor);
  return aproximar(a) === aproximar(b);
}

/**
 * Orden TOTAL sobre números. Primero por clase —para que la comparación sea total y no confunda
 * un exacto con su decimal— y dentro de cada clase por valor.
 *
 * Comparar entre clases por valor sería lo intuitivo y sería un error: dejaría de ser una
 * relación antisimétrica (dos números distintos compararían iguales) y la forma canónica dejaría
 * de estar bien definida.
 */
export function compararN(a: Numero, b: Numero): -1 | 0 | 1 {
  // Primero por VALOR, y exacto siempre que las dos plantas lo permitan: así la forma canónica
  // ordena los números como los ordenaría cualquiera. La clase solo decide el empate, que es lo
  // que mantiene el orden TOTAL sin confundir un exacto con su decimal (`1/2` y `0.5` valen lo
  // mismo, son datos distintos, y comparan en un orden fijo en vez de comparar iguales).
  if (a.clase === "racional" && b.clase === "racional") {
    const c = compararRac(a.valor, b.valor);
    if (c !== 0) return c;
  } else {
    const xa = comoAlgebraico(a), xb = comoAlgebraico(b);
    if (xa !== null && xb !== null) {
      const c = compararA(xa, xb);
      if (c !== 0) return c;
    } else {
      const x = aproximar(a), y = aproximar(b);
      // NaN no es comparable por `<`; se le da un sitio fijo para que el orden siga siendo total.
      if (Number.isNaN(x) || Number.isNaN(y)) {
        if (!Number.isNaN(x)) return -1;
        if (!Number.isNaN(y)) return 1;
      } else if (x !== y) {
        return x < y ? -1 : 1;
      }
    }
  }
  if (a.clase === b.clase) return 0;
  return RANGO_NUMERO[a.clase] < RANGO_NUMERO[b.clase] ? -1 : 1;
}
