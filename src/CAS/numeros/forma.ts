// ─────────────────────────────────────────────
// números · EL CAMINO DE VUELTA: de un número exacto a una expresión (PURO)
// ─────────────────────────────────────────────
//
// La pieza que cierra la fuga que motivaba toda la reforma.
//
// ── La fuga ──────────────────────────────────────────────────────────────────────────────
// El motor tenía dos mitades. Una lee ecuaciones y las manipula; otra resuelve exacto con
// Sturm, resultantes y ℚ(√d). Los únicos puentes entre ellas —`extraer.ts` y `ramas.ts`— van
// SOLO en una dirección: de las expresiones a los números. **No había camino de vuelta.** Un
// resultado exacto no podía volver a ser una expresión que el resto del motor manipulara: salía
// directamente a LaTeX, y lo que no cabía en `ValorExacto` salía como decimal.
//
// Por eso `y = x³ − 2 ∩ y = 0` imprimía `1.2599210498948732`. No por falta de cálculo —el motor
// aísla esa raíz exactamente— sino por falta de un sitio donde ponerla.
//
// Este archivo es ese sitio.
//
// ── Las tres familias con forma cerrada ──────────────────────────────────────────────────
// No se intenta escribir cualquier algebraico con radicales: por Abel–Ruffini eso es imposible
// en general, y fingirlo sería el tipo de promesa que este motor no hace. Se cubren las tres
// familias que SÍ tienen forma cerrada, y cada una por una razón general, no por ser un caso:
//
//   1. RACIONAL           — `3/2`. Se detecta al construir el número, no aquí.
//   2. BINOMIO `xⁿ − c`   — `∛2`, `√5`, `⁵√7`. Es exactamente la familia de los polinomios
//                           binomios, y su raíz real es el radical, con el signo del intervalo.
//   3. GRADO 2            — `(1+√5)/2`. Sale de la fórmula general, y NO se reimplementa aquí:
//                           se le pide a `simbolico/raicesSimbolicas.ts`, que ya la tiene con su
//                           extracción del factor cuadrado (`√12 = 2√3`) y su forma canónica.
//
// Lo que quede fuera devuelve `null`, y eso NO es una pérdida: el número sigue siendo exacto,
// comparable y operable como `Algebraico`. Lo único que no tiene es una manera bonita de
// escribirse, y decirlo es mejor que aproximarlo.

import { type Expresion, aplicacion, entero, literal, opuesto, potencia, producto, racional, suma } from "../nucleo/expresion";
import { type Algebraico, comoRadical, racionalDe } from "./algebraico";
import { grado, normalizar } from "../../math/polinomio";
import { raicesConForma } from "../../math/simbolico/raicesSimbolicas";
import { type ValorExacto, esRacionalE, raizCuadrada } from "../../math/simbolico/valorExacto";
import { type Racional, comparar as compararRac, esCero, rac, signo } from "../../math/racional";

/** `a + b√d` como expresión. Reutiliza la forma canónica que `ValorExacto` ya garantiza (d libre
 *  de cuadrados, denominador racionalizado), así que aquí no hay ninguna decisión que tomar. */
function deValorExacto(v: ValorExacto): Expresion {
  const parteA = racional(v.a);
  if (esRacionalE(v)) return parteA;
  const raiz = aplicacion("sqrt", [racional(rac(v.d))]);
  const parteB = signo(v.b) === 1 && v.b.n === 1n && v.b.d === 1n
    ? raiz
    : producto([racional(v.b), raiz]);
  return esCero(v.a) ? parteB : suma([parteA, parteB]);
}

/**
 * El radical `ⁿ√c`, con `sqrt` cuando n = 2 porque es como se escribe.
 *
 * La raíz CUADRADA no se monta a mano: se le pide a `raizCuadrada` de `ValorExacto`, que ya
 * extrae el factor cuadrado del radicando (`√12 = 2√3`), racionaliza el denominador y devuelve
 * la forma canónica. Montarla aquí habría dado `√12`, que es correcto y está peor escrito —y
 * habría sido, además, una segunda implementación de algo que ya funciona—.
 */
function deRadical(radicando: Racional, indice: number, signoRaiz: -1 | 1): Expresion {
  let cuerpo: Expresion;
  if (indice === 2) {
    const canonico = raizCuadrada(radicando);
    cuerpo = canonico === null
      ? aplicacion("sqrt", [racional(radicando)])
      : deValorExacto(canonico);
  } else {
    cuerpo = aplicacion("nthRoot", [racional(radicando), entero(indice)]);
  }
  return signoRaiz < 0 ? opuesto(cuerpo) : cuerpo;
}

/**
 * La forma cerrada de un número algebraico como expresión, o `null` si no la tiene.
 *
 * El orden de los intentos va de lo más simple a lo más general, que aquí coincide con ir de lo
 * más legible a lo menos: `3/2` antes que `∛2`, y `∛2` antes que `(1+√5)/2`.
 */
export function formaCerrada(v: Algebraico): Expresion | null {
  // 1 · Racional.
  const q = racionalDe(v);
  if (q !== null) return racional(q);

  // 2 · Binomio: la familia `xⁿ − c`, cuya raíz real ES un radical.
  const r = comoRadical(v);
  if (r !== null) return deRadical(r.radicando, r.indice, r.signo);

  // 3 · Grado 2, por la fórmula general. No se reimplementa: se le pide a quien ya la tiene.
  const p = normalizar(v.polinomio);
  if (grado(p) === 2) {
    // Se empareja por SOLAPE de los intervalos aislantes, comparados en aritmética RACIONAL.
    //
    // La primera versión comparaba el valor del candidato con los extremos del intervalo en coma
    // flotante, y no funcionaba nunca: los intervalos que produce Sturm están refinados MUY por
    // debajo de lo que un `double` distingue, así que los dos extremos redondean al mismo número
    // y ninguna comparación estricta se cumple. Es un buen recordatorio de por qué la aritmética
    // exacta no es un lujo, ni siquiera para una comprobación auxiliar.
    //
    // El solape decide sin ambigüedad: los dos intervalos aíslan raíces del MISMO polinomio, y
    // las raíces de un polinomio están separadas, así que dos intervalos aislantes que se tocan
    // aíslan la misma raíz.
    for (const f of raicesConForma(p)) {
      if (f.exacto === null) continue;
      if (compararRac(v.a, f.raiz.b) < 0 && compararRac(f.raiz.a, v.b) < 0) {
        return deValorExacto(f.exacto);
      }
    }
  }

  // Fuera de las tres familias no hay forma cerrada, y decirlo es la respuesta correcta.
  return null;
}

/** ¿Se puede escribir este algebraico con radicales? Atajo para quien solo quiera preguntarlo. */
export const tieneFormaCerrada = (v: Algebraico): boolean => formaCerrada(v) !== null;

/** Un literal de expresión a partir de un algebraico: su forma cerrada si la tiene, y si no el
 *  número tal cual —que sigue siendo exacto, solo que sin manera bonita de escribirse—. */
export function comoExpresion(v: Algebraico): Expresion {
  return formaCerrada(v) ?? literal({ clase: "algebraico", valor: v });
}

/** Reservado para el impresor: la potencia n-ésima como exponente racional, para quien prefiera
 *  `2^(1/3)` a `nthRoot(2, 3)`. No lo usa nadie todavía; existe para que el día que el impresor
 *  quiera elegir, la elección esté en un sitio y no repartida. */
export const comoPotenciaRacional = (radicando: Racional, indice: number): Expresion =>
  potencia(racional(radicando), racional(rac(1n, BigInt(indice))));
