// ─────────────────────────────────────────────
// mate · La FRONTERA: de la ecuación ESCRITA al polinomio exacto
// ─────────────────────────────────────────────
//
// Veinte líneas de trabajo real. Lee el texto, lo entrega al lector de polinomios
// (`extraerNodo.ts`) y devuelve lo que este produzca.
//
// ── Por qué esto está separado del algoritmo ─────────────────────────────────────────────
// Antes las dos mitades vivían en el mismo archivo, y eso hacía que **cualquiera que quisiera
// polinomios exactos se llevara el parser entero en su grafo de dependencias**: `parser.ts`,
// `formatoExpr.ts` y todo `expr/`. El núcleo de `CAS/` estaba entre ellos, así que su invariante
// —«entre etapas viajan expresiones, no cadenas»— era falso por una importación transitiva que
// ninguna prueba miraba.
//
// Partido en dos, la dependencia del texto está donde debe estar: en el borde, en un archivo
// cuyo nombre y cuya cabecera dicen que ese es su trabajo.
//
// ── La entrada pasa por el MISMO preprocesado que el resto de LMath ──────────────────────
// `normalizarEntrada` + `insertarProductoImplicito`, y no un lector propio: así `2x`,
// `\frac{1}{2}` y `x^{2}` significan aquí exactamente lo que significan en el plano de al lado.
// Un motor que leyera la entrada a su manera acabaría resolviendo una ecuación distinta de la
// dibujada, que es el peor fallo posible en un plugin cuyo trabajo es que las dos coincidan.

import { parse } from "mathjs";
import { type Nodo } from "../formatoExpr";
import { normalizarEntrada } from "../parser";
import { insertarProductoImplicito } from "../core/parsing/productoImplicito";
import { Y2 } from "./polinomio2";
import {
  type EcuacionPolinomica, type Fraccion, entera, fraccionDe, polinomicaDeFracciones,
} from "./extraerNodo";

export type { EcuacionPolinomica };

/**
 * La ecuación escrita, como polinomio igualado a cero, o `null` si no es polinómica.
 *
 * Acepta las dos formas que produce el plugin: con `=` (los dos lados, y se resta el derecho del
 * izquierdo) y sin él (una expresión suelta, que en obs-graph significa `y = expr`).
 */
export function ecuacionAPolinomio(ecuacion: string): EcuacionPolinomica | null {
  const partes = ecuacion.split("=");
  if (partes.length > 2) return null;

  const preparar = (s: string): Nodo | null => {
    const limpio = s.trim();
    if (limpio === "") return null;
    try {
      return parse(insertarProductoImplicito(normalizarEntrada(limpio))) as unknown as Nodo;
    } catch {
      return null;
    }
  };

  let izquierda: Fraccion | null;
  let derecha: Fraccion | null;
  if (partes.length === 2) {
    const a = preparar(partes[0]), b = preparar(partes[1]);
    if (!a || !b) return null;
    izquierda = fraccionDe(a);
    derecha = fraccionDe(b);
  } else {
    // Expresión suelta: en obs-graph significa `y = expr`.
    const a = preparar(partes[0]);
    if (!a) return null;
    izquierda = entera(Y2);
    derecha = fraccionDe(a);
  }
  if (!izquierda || !derecha) return null;
  return polinomicaDeFracciones(izquierda, derecha);
}
