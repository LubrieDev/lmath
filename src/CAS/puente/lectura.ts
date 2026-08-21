// ─────────────────────────────────────────────
// puente · Leer TEXTO como `Expresion` (transitorio, se retira en E4)
// ─────────────────────────────────────────────
//
// El único sitio del núcleo donde entra una cadena. Encadena lo que ya existe —el preprocesado de
// la notación de LMath, el parser de mathjs y el puente— para producir una `Expresion`:
//
//     texto  →  normalizarEntrada + insertarProductoImplicito  →  parse  →  deMathjs  →  Expresion
//
// ── Por qué está aquí y no en `nucleo/` ──────────────────────────────────────────────────
// Porque importa el parser, y el invariante del núcleo es justamente que no depende de cómo se
// escribió nada. Confinándolo a `puente/` —la carpeta donde vive, declarada, toda la deuda de la
// transición— el resto del núcleo conserva un cierre de dependencias limpio, y eso se puede
// comprobar en vez de prometerlo.
//
// ── Por qué existe ───────────────────────────────────────────────────────────────────────
// Hasta que E4 traiga el lector propio, todo lo que quiera hablar con el núcleo desde el mundo
// del texto tiene que pasar por algún sitio. Que ese sitio sea UNO, con nombre y con fecha de
// caducidad escrita en la cabecera, es la diferencia entre una deuda y un accidente.
//
// Cuando llegue E4, este archivo se sustituye por el lector de verdad y sus llamantes no se
// enteran: la firma es la misma.

import { parse } from "mathjs";
import { type Nodo } from "../../expr/nodo";
import { normalizarEntrada } from "../../parser";
import { insertarProductoImplicito } from "../../core/parsing/productoImplicito";
import { type Expresion, resta, simbolo } from "../nucleo/expresion";
import { deMathjs } from "./mathjs";

/** El árbol de mathjs de un texto ya preprocesado, o `null` si no se puede leer. */
function nodoDe(texto: string): Nodo | null {
  const limpio = texto.trim();
  if (limpio === "") return null;
  try {
    return parse(insertarProductoImplicito(normalizarEntrada(limpio))) as unknown as Nodo;
  } catch {
    return null;
  }
}

/**
 * Una expresión escrita, como `Expresion`. `null` si no se puede leer o si lleva algo que el
 * puente no sabe traducir —un centinela de familia, una función fuera del catálogo—.
 */
export function leerExpresion(texto: string): Expresion | null {
  const n = nodoDe(texto);
  return n === null ? null : deMathjs(n);
}

/** Los dos lados de una ecuación escrita. Sin `=`, se lee como `y = expr`, que es lo que
 *  significa una expresión suelta en obs-graph. */
export function leerEcuacion(texto: string): { izq: Expresion; der: Expresion } | null {
  const partes = texto.split("=");
  if (partes.length > 2) return null;
  if (partes.length === 1) {
    const der = leerExpresion(partes[0]);
    return der === null ? null : { izq: simbolo("y"), der };
  }
  const izq = leerExpresion(partes[0]);
  if (izq === null) return null;
  const der = leerExpresion(partes[1]);
  return der === null ? null : { izq, der };
}

/** `lhs − rhs` de una ecuación escrita: la forma «esto vale cero» que consume el álgebra. */
export function leerComoCero(texto: string): Expresion | null {
  const e = leerEcuacion(texto);
  return e === null ? null : resta(e.izq, e.der);
}
