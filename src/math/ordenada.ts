// ─────────────────────────────────────────────
// mate · Lectura EXACTA de la ordenada de una curva (PURO)
// ─────────────────────────────────────────────
//
// «¿Cuánto vale y sobre esta curva en esta x?», respondido **evaluando la expresión** en vez de
// mirar el dibujo.
//
// ── La frontera que este módulo establece ─────────────────────────────────────────────────
// El viewport, la polilínea y el muestreo existen para **visualizar**. No son la fuente de verdad
// matemática, y no deben serlo cuando la expresión se puede evaluar directamente.
//
// Hasta ahora sí lo eran: el crosshair leía su `y` interpolando linealmente entre los vértices
// trazados (`lecturaRama.yEnRamas`), y como la densidad de vértices depende del zoom, el mismo
// punto de la misma curva daba números distintos según lo cerca que estuvieras. Medido sobre
// `y=exp(x)` en x=2,1: 8,16617 (correcto) a un zoom, 8,17678 a otro. No es ruido en la última
// cifra, se ve en la tercera.
//
// Es el mismo error de fondo que el de las soluciones de un sistema —preguntarle al dibujo algo
// que solo sabe la ecuación—, y se corrige del mismo modo: si hay forma de evaluar, se evalúa.
//
// ── Por qué SOLO las explícitas, y por qué eso no es media solución ───────────────────────
// Una curva `y = f(x)` tiene UNA ordenada por abscisa: preguntar «¿cuánto vale y en x?» tiene una
// respuesta y f la da. Una implícita puede tener varias (una circunferencia tiene dos y en casi
// toda x), una paramétrica y una polar ni siquiera están parametrizadas por x. Para esas, «la y
// en esta x» no es una pregunta con respuesta única, y la polilínea —que sí sabe por qué punto
// pasó el trazador— sigue siendo la fuente razonable. Devolver `null` aquí no es rendirse: es
// decir que la pregunta no le corresponde a este módulo.
//
// Este módulo NO decide qué se dibuja, ni conoce el viewport, ni sabe que existe un crosshair.
// Le dan un objeto matemático y devuelve una función, o `null`.

import type { ObjetoMatematico } from "../core/contracts/modelo";

/** Lee la ordenada de la curva en una abscisa de mundo. `null` donde la curva no está
 *  definida (fuera de su dominio, fuera de su restricción, en un polo). */
export type LectorOrdenada = (x: number) => number | null;

/**
 * El lector EXACTO de una curva, o `null` si esa curva no admite uno.
 *
 * Solo lo admite la explícita canónica `y = f(x)`. Se descarta a propósito la explícita
 * TRANSPUESTA (`salida: "x"`, que es una componente paramétrica `x(t)` dibujada tumbada): ahí la
 * f no da la ordenada sino la abscisa, y usarla como si diera la y respondería con seguridad un
 * número equivocado —que es peor que el número aproximado que se venía dando—.
 *
 * La `f` del objeto se usa TAL CUAL, y eso es deliberado: es la misma que traza la curva, así que
 * ya trae aplicado todo lo que el bloque decidió sobre ella —la restricción de dominio recorta
 * devolviendo NaN fuera del intervalo, los parámetros ya están sustituidos—. Reconstruirla aquí
 * a partir de la fórmula sería duplicar esa lógica y abrir la puerta a que el crosshair lea una
 * curva distinta de la dibujada, que es exactamente lo que este módulo viene a impedir.
 */
export function lectorExacto(objeto: ObjetoMatematico): LectorOrdenada | null {
  if (objeto.tipo !== "explicita") return null;
  if (objeto.salida === "x") return null;
  const f = objeto.f;
  return (x: number): number | null => {
    const y = f.eval(x);
    // NaN e infinito son la forma que tiene la curva de decir «aquí no estoy»: fuera del
    // dominio, fuera de la restricción, o en una asíntota. Se traducen al `null` del contrato
    // en vez de dejarlos salir, para que quien lo consuma no tenga que volver a comprobarlo.
    return typeof y === "number" && Number.isFinite(y) ? y : null;
  };
}
