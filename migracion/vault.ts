// ─────────────────────────────────────────────
// migracion · Recorrido del vault (la parte que habla con Obsidian)
// ─────────────────────────────────────────────
//
// Dos operaciones y una garantía.
//
//   `escanear` lee y no escribe. Usa `cachedRead`, que es la lectura barata de Obsidian: recorrer
//   un vault grande entero es la operación más cara de todo esto y no hay motivo para forzar
//   disco cuando el resultado solo alimenta una vista previa.
//
//   `aplicar` escribe con `vault.process`, que es lectura-modificación-escritura ATÓMICA. Y no
//   reescribe el texto que vio el escaneo: vuelve a pasar el reescritor sobre el contenido ACTUAL
//   de la nota, dentro de la propia transacción. Esa es la garantía: entre que se abre el modal y
//   se pulsa el botón, el usuario puede haber editado esas notas, y un plan calculado hace treinta
//   segundos podría escribir encima de lo que acaba de teclear. Aquí el plan solo decide QUÉ
//   ARCHIVOS se tocan; qué se cambia dentro se decide en el momento de escribir.
//
// Nada de esto se ejecuta solo: lo dispara el botón del modal (`ModalMigracion`).

import type { App, TFile } from "obsidian";

import { analizar, reescribir, type Hallazgo } from "./escaner";
import type { Direccion } from "./nombres";

/** Una nota con al menos un bloque de sintaxis antigua. */
export interface NotaConBloques {
  readonly archivo: TFile;
  readonly hallazgos: readonly Hallazgo[];
}

/** Lo encontrado en todo el vault, ordenado por número de bloques (las notas más afectadas
 *  primero: son las que el usuario quiere reconocer de un vistazo en la lista del modal). */
export interface Plan {
  readonly notas: readonly NotaConBloques[];
  readonly bloques: number;
}

export interface Resultado {
  readonly notasCambiadas: number;
  readonly bloquesCambiados: number;
  /** Notas que no se pudieron escribir, con el motivo. Un fallo NO aborta el resto: es mejor
   *  migrar 40 de 41 notas y decir cuál falló que dejarlo todo a medias sin explicar nada. */
  readonly fallos: readonly { readonly ruta: string; readonly error: string }[];
}

/** Recorre las notas markdown del vault buscando bloques con el identificador antiguo. */
export async function escanear(app: App, direccion: Direccion = "adelante"): Promise<Plan> {
  const notas: NotaConBloques[] = [];
  let bloques = 0;

  for (const archivo of app.vault.getMarkdownFiles()) {
    let contenido: string;
    try {
      contenido = await app.vault.cachedRead(archivo);
    } catch {
      // Una nota ilegible (permisos, un archivo que acaba de desaparecer) no debe tumbar el
      // escaneo entero: se omite y el resto del vault se sigue revisando.
      continue;
    }
    const hallazgos = analizar(contenido, direccion);
    if (hallazgos.length > 0) {
      notas.push({ archivo, hallazgos });
      bloques += hallazgos.length;
    }
  }

  notas.sort((a, b) => b.hallazgos.length - a.hallazgos.length);
  return { notas, bloques };
}

/** Aplica la reescritura a las notas del plan. Ver la nota de cabecera sobre por qué se vuelve a
 *  analizar dentro de `process` en lugar de confiar en lo que vio el escaneo. */
export async function aplicar(
  app: App,
  plan: Plan,
  direccion: Direccion = "adelante"
): Promise<Resultado> {
  let notasCambiadas = 0;
  let bloquesCambiados = 0;
  const fallos: { ruta: string; error: string }[] = [];

  for (const nota of plan.notas) {
    try {
      let cambiadosAqui = 0;
      await app.vault.process(nota.archivo, (datos) => {
        const { texto, hallazgos } = reescribir(datos, direccion);
        cambiadosAqui = hallazgos.length;
        return texto;
      });
      if (cambiadosAqui > 0) {
        notasCambiadas++;
        bloquesCambiados += cambiadosAqui;
      }
    } catch (e) {
      // Sin asumir que lo lanzado sea un Error: `(e as Error).message` sobre algo que no lo es
      // da `undefined`, y esto se PINTA en el modal. El fallo de escritura ya es bastante malo
      // como para además enseñar la palabra «undefined» donde debería ir el motivo.
      fallos.push({
        ruta: nota.archivo.path,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { notasCambiadas, bloquesCambiados, fallos };
}
