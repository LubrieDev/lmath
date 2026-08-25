// ─────────────────────────────────────────────
// Clasificación de funciones degeneradas (no graficables)
// ─────────────────────────────────────────────

import { restriccionesDe, fueraDeDominio, puntosDeQuiebre, condicionesVioladas } from "./math/dominio";

export interface FuncionDegenerada { etiqueta: string; detalle: string }

/**
 * Detecta funciones que NO son graficables en ℝ porque no toman ningún valor
 * real, y las clasifica formalmente. Muestrea un rango amplio (para no marcar
 * por error una función definida sólo lejos del origen, p.ej. sqrt(x-500)) más
 * un tramo fino central. Si aparece algún valor real → es graficable (null).
 *
 * Sin valores reales, se distingue por qué:
 *   - algún ±∞ (división por cero, p.ej. log en base 1: ln(x)/ln(1)) → Indefinida
 *   - algún valor complejo (p.ej. sqrt(-1))                          → No definida en ℝ
 *   - sólo NaN (forma indeterminada, p.ej. 0/0)                      → Indeterminada
 *
 * Bonus: evita el motor de curva en estos casos, que de otro modo dibujaba
 * asíntotas falsas (las transiciones a ±∞ de log en base 1 se tomaban por polos).
 */
export function clasificarDegenerada(
  evaluar: (x: number) => unknown
): FuncionDegenerada | null {
  let reales = 0, infinitos = 0, complejos = 0; // (los NaN son el resto)

  const muestra = (x: number) => {
    const v = evaluar(x);
    if (typeof v === "number") {
      if (Number.isFinite(v)) reales++;
      else if (v === Infinity || v === -Infinity) infinitos++;
      // NaN: no se cuenta (es el caso por defecto)
    } else if (v && typeof v === "object" && typeof (v as { im?: unknown }).im === "number") {
      complejos++;
    }
  };

  for (let i = 0; i <= 500; i++) muestra(-1000 + (2000 * i) / 500); // rango amplio
  for (let i = 0; i <= 200; i++) muestra(-10 + (20 * i) / 200);     // detalle central

  if (reales > 0) return null; // graficable

  if (infinitos > 0)
    return {
      etiqueta: "Indefinida",
      detalle: "La expresión no está definida en ℝ.",
    };
  if (complejos > 0)
    return {
      etiqueta: "No definida en ℝ",
      detalle: "La expresión produce valores complejos y no puede representarse en el plano real.",
    };
  return {
    etiqueta: "Indeterminada",
    detalle: "La expresión produce una forma indeterminada.",
  };
}

// ── El agujero que no es un polo (BUG-001) ──────────────────────────────────────────────────
//
// El muestreo de arriba ve funciones que no existen EN NINGUNA parte. Se le escapaba la otra
// familia: la que existe en TODAS menos en un punto, donde la sustitución de un parámetro
// fabricó una forma rota. `Ax^{A-1}` con `A = 0` es `0·x^{-1}` —cero en todo su dominio, y
// sin dominio en x=0—: la muestra da valores reales (ceros) y la función se da por graficable,
// así que el bloque dibujaba una recta `y=0` que atraviesa el origen afirmando un valor que no
// existe. Lo mismo `Ax^{A}` con `A = 0`: `0·x^0`, la forma indeterminada 0^0 pisando el origen.
//
// La pregunta que esta función responde es: ¿es la expresión UNA CONSTANTE sobre su dominio,
// con el dominio roto en algún punto suelto? Esa curva no se dibuja —sería una recta con
// agujeros invisibles diciendo lo que la expresión no dice—: se vela, con la etiqueta que
// dice POR QUÉ se rompió (cociente anulado → «Indefinida», 0^0 → «Indeterminada»).
//
// Lo que se conserva a propósito:
//   · `1/x`, `tan x`, `A/(x−A)`: el punto roto es un POLO (la curva se va a ±∞) → hay dibujo.
//     Se distingue sondeando a los dos lados del punto: si algo se dispara, es asíntota.
//   · `(x²−1)/(x−1)`: agujero removable pero la función NO es constante (vale x+1) → dibujo.
//   · `sqrt(x)`, `asin(x)`: su dominio se corta en un INTERVALO y en la frontera la función
//     SÍ existe → ninguna condición se incumple en los puntos de quiebre → dibujo.

/** Cuán lejos se deja estar un sondeo antes de llamarlo polo. */
const UMBRAL_POLO = 1e8;
/** Distancias del sondeo a los dos lados del punto roto. */
const SONDEOS = [1e-3, 1e-6, 1e-9];
/** Tolerancia (relativa) con la que dos valores finitos cuentan como la misma constante. */
const EPS_CONSTANTE = 1e-9;

export function degeneradaPorSingularidad(
  exprNorm: string,
  evaluar: (x: number) => unknown
): FuncionDegenerada | null {
  const condiciones = restriccionesDe(exprNorm);
  if (!condiciones || condiciones.length === 0) return null;

  // Los puntos donde el dominio puede estar roto, y solo los que de verdad lo están: en la
  // frontera de una raíz o un arco la función existe, y ahí no hay nada que decir.
  const rotos = puntosDeQuiebre(exprNorm, "x").filter((q) =>
    fueraDeDominio(exprNorm, { x: q })
  );
  if (rotos.length === 0) return null;

  // Un polo manda: donde la curva se va a ±∞ hay asíntota y dibujo, no velo. Se sondea a los
  // dos lados de CADA punto roto; basta uno que se dispare para que la expresión entera se
  // grafique (la alternativa —velar una expresión con asíntotas— escondía curvas de verdad).
  const esPolo = (q: number): boolean =>
    SONDEOS.some((d) =>
      [q + d, q - d].some((p) => {
        const v = evaluar(p);
        return typeof v === "number" && (!Number.isFinite(v) || Math.abs(v) > UMBRAL_POLO);
      })
    );
  if (rotos.some(esPolo)) return null;

  // ¿Constante sobre su dominio? Se muestrea como `clasificarDegenerada` y se comparan los
  // valores FINITOS entre sí: los NaN son justo los agujeros, no pruebas de variación.
  let valor: number | null = null;
  const constante = (): boolean => {
    const chequear = (x: number): boolean => {
      const v = evaluar(x);
      if (typeof v !== "number" || !Number.isFinite(v)) return true;
      if (valor === null) { valor = v; return true; }
      return Math.abs(v - valor) <= EPS_CONSTANTE * (1 + Math.abs(valor));
    };
    for (let i = 0; i <= 500; i++) if (!chequear(-1000 + (2000 * i) / 500)) return false;
    for (let i = 0; i <= 200; i++) if (!chequear(-10 + (20 * i) / 200)) return false;
    return valor !== null;
  };
  if (!constante()) return null;

  // La etiqueta la pone la condición rota, no el número: un cociente anulado (o su forma de
  // exponente negativo) es «Indefinida»; la forma indeterminada 0^0 es «Indeterminada». Si
  // conviven —no hay caso conocido, pero la regla es total— gana el cociente.
  const formas = new Set(
    rotos.flatMap((q) =>
      condicionesVioladas(exprNorm, { x: q }).flatMap((r) => (r.forma ? [r.forma] : []))
    )
  );
  const indeterminada = formas.size > 0 && [...formas].every((f) => f === "potenciaCero");
  return indeterminada
    ? { etiqueta: "Indeterminada", detalle: "La expresión produce una forma indeterminada." }
    : { etiqueta: "Indefinida", detalle: "La expresión no está definida en ℝ." };
}
