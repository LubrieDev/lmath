// ─────────────────────────────────────────────
// migracion · Escáner y reescritor de cercados (LÓGICA PURA)
// ─────────────────────────────────────────────
//
// Esta pieza es la que decide qué se toca de una nota ajena, así que se escribió con una regla
// por encima de todas: **el resultado es byte a byte el original salvo los identificadores que
// cambian**. No se normalizan finales de línea (un vault de Windows está lleno de CRLF y
// reescribirlos ensuciaría el diff de cada nota), no se recorta espacio, no se reordena nada. Se
// calculan rangos [inicio, fin) sobre la cadena original y se empalma; todo lo demás sobrevive
// intacto por construcción, no por cuidado.
//
// Es un módulo puro (ni Obsidian ni DOM ni disco) precisamente para poder probarlo: ver
// `migracion/pruebas.ts`, que es donde se justifica cada decisión de las de abajo.
//
// Qué es un cercado, y por qué hay una máquina de estados en lugar de una expresión regular:
// dentro de un bloque de código TODO es literal, incluidas las líneas que parecen cercados. Una
// nota que DOCUMENTA la sintaxis (el README de LMath hace justo eso) envuelve el ejemplo en un
// cercado más largo:
//
//     ````
//     ```obs-graph
//     x^2
//     ```
//     ````
//
// Ese `obs-graph` de dentro es texto, no un bloque, y reescribirlo cambiaría el sentido de la
// nota. Una regex por líneas no puede distinguirlo; un recorrido con estado sí.

import { traducir, type Direccion } from "./nombres";

/** Un identificador de bloque encontrado y su reemplazo. Las posiciones son sobre el texto
 *  original: `linea` en base 1 (como la enseña el editor) y `columna` en base 0. */
export interface Hallazgo {
  readonly linea: number;
  readonly columna: number;
  readonly viejo: string;
  readonly nuevo: string;
}

export interface Reescritura {
  /** El texto ya reescrito. Idéntico al de entrada si `hallazgos` está vacío (la MISMA cadena). */
  readonly texto: string;
  readonly hallazgos: readonly Hallazgo[];
}

/** Un rango a sustituir, en offsets absolutos sobre el texto original. */
interface Reemplazo {
  readonly inicio: number;
  readonly fin: number;
  readonly hallazgo: Hallazgo;
}

/** Estado de cercado abierto: con qué carácter y con cuántos, que es lo que decide qué línea
 *  puede cerrarlo (CommonMark: el cierre lleva el mismo carácter y AL MENOS la misma cantidad). */
interface CercadoAbierto {
  readonly caracter: "`" | "~";
  readonly longitud: number;
}

/** Analiza el texto sin modificarlo. Es lo que alimenta la vista previa del modal: se puede
 *  enseñar qué se va a tocar, y en qué línea, antes de tocar nada. */
export function analizar(texto: string, direccion: Direccion = "adelante"): Hallazgo[] {
  return localizar(texto, direccion).map((r) => r.hallazgo);
}

/**
 * Reescribe los identificadores de bloque del texto.
 *
 * Si no hay nada que cambiar devuelve **la misma cadena** que entró (no una copia equivalente),
 * para que quien llame pueda saltarse la escritura a disco con una comparación por identidad y
 * no dejar la fecha de modificación tocada en notas que no cambiaron.
 */
export function reescribir(texto: string, direccion: Direccion = "adelante"): Reescritura {
  const reemplazos = localizar(texto, direccion);
  if (reemplazos.length === 0) return { texto, hallazgos: [] };

  // Se empalma en orden y de una pasada: entre reemplazo y reemplazo se copia el tramo original
  // tal cual, así que cuanto NO sea un identificador es literalmente la cadena de entrada.
  const trozos: string[] = [];
  let cursor = 0;
  for (const r of reemplazos) {
    trozos.push(texto.slice(cursor, r.inicio), r.hallazgo.nuevo);
    cursor = r.fin;
  }
  trozos.push(texto.slice(cursor));

  return { texto: trozos.join(""), hallazgos: reemplazos.map((r) => r.hallazgo) };
}

/**
 * El recorrido. Devuelve los rangos a sustituir, en orden de aparición.
 *
 * Sobre la indentación del cercado de apertura: CommonMark admite hasta 3 espacios, y con 4 la
 * línea sería un bloque indentado. Aquí se acepta CUALQUIER indentación, porque dentro de una
 * lista anidada un cercado perfectamente normal puede ir con 4, 6 u 8 espacios y Obsidian lo
 * renderiza como bloque. El precio es que un `    ```obs-graph` escrito a propósito como texto
 * indentado también se reescribiría; se aceptó porque el daño de ese falso positivo (cambiar un
 * ejemplo literal) es menor y reversible, y el de la alternativa (saltarse bloques REALES de
 * quien usa listas) deja la migración incompleta y al usuario con bloques rotos.
 */
function localizar(texto: string, direccion: Direccion): Reemplazo[] {
  const reemplazos: Reemplazo[] = [];
  let abierto: CercadoAbierto | null = null;

  let linea = 1;
  let inicioLinea = 0;

  while (inicioLinea <= texto.length) {
    const salto = texto.indexOf("\n", inicioLinea);
    const finLinea = salto === -1 ? texto.length : salto;
    // El `\r` de un CRLF no forma parte del contenido de la línea, pero SÍ sigue en el texto: se
    // excluye del análisis y nadie lo toca, que es justo lo que preserva el final de línea.
    const finContenido =
      finLinea > inicioLinea && texto[finLinea - 1] === "\r" ? finLinea - 1 : finLinea;
    const contenido = texto.slice(inicioLinea, finContenido);

    if (abierto) {
      if (esCierre(contenido, abierto)) abierto = null;
    } else {
      const apertura = leerApertura(contenido);
      if (apertura) {
        abierto = { caracter: apertura.caracter, longitud: apertura.longitud };
        const nuevo = apertura.id ? traducir(apertura.id, direccion) : undefined;
        if (apertura.id && nuevo) {
          const inicio = inicioLinea + apertura.columnaId;
          reemplazos.push({
            inicio,
            fin: inicio + apertura.id.length,
            hallazgo: { linea, columna: apertura.columnaId, viejo: apertura.id, nuevo },
          });
        }
      }
    }

    if (salto === -1) break;
    inicioLinea = salto + 1;
    linea++;
  }

  return reemplazos;
}

interface Apertura {
  readonly caracter: "`" | "~";
  readonly longitud: number;
  /** Primer token de la cadena de información (el lenguaje), o "" si el cercado va desnudo. */
  readonly id: string;
  readonly columnaId: number;
}

/** ¿Es esta línea la apertura de un cercado? Devuelve sus datos, o `null`. */
function leerApertura(contenido: string): Apertura | null {
  const m = /^[ \t]*(`{3,}|~{3,})/.exec(contenido);
  if (!m) return null;

  const valla = m[1];
  const caracter = valla[0] as "`" | "~";
  const resto = contenido.slice(m[0].length);

  // CommonMark: la cadena de información de un cercado de acentos graves NO puede contener un
  // acento grave (si no, `` `a` `` en un párrafo abriría bloques por todas partes). Con esa línea
  // no se abre nada, así que ni siquiera es un cercado.
  if (caracter === "`" && resto.includes("`")) return null;

  const espacios = /^[ \t]*/.exec(resto)?.[0].length ?? 0;
  const id = /^[^ \t]*/.exec(resto.slice(espacios))?.[0] ?? "";

  return { caracter, longitud: valla.length, id, columnaId: m[0].length + espacios };
}

/** ¿Cierra esta línea el cercado abierto? Mismo carácter, al menos tantos, y nada más detrás. */
function esCierre(contenido: string, abierto: CercadoAbierto): boolean {
  const patron = abierto.caracter === "`" ? /^[ \t]*(`{3,})[ \t]*$/ : /^[ \t]*(~{3,})[ \t]*$/;
  const m = patron.exec(contenido);
  return m !== null && m[1].length >= abierto.longitud;
}
