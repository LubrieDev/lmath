// ─────────────────────────────────────────────
// host-obsidian · Los nombres bajo los que responde cada bloque
// ─────────────────────────────────────────────
//
// Vivía en `migracion/nombres.ts`, junto al escáner y al reescritor que convertían las notas de
// `obs-*` a `_*`. Aquella campaña terminó con la 2.0.0 y su código se retiró del árbol publicado
// (está guardado en `.dev/migracion/`), pero ESTA tabla no era migración: es lo que `main.ts`
// necesita para registrar los seis bloques, y se queda.
//
// La razón de retirar el resto no fue la limpieza. `migracion/vault.ts` llamaba a
// `vault.getMarkdownFiles()`, y la revisión automática de Obsidian marca eso como *Vault
// Enumeration* —«da al plugin acceso a la ruta de todos los archivos del vault»—. Es un análisis
// ESTÁTICO: ve la llamada, no si se puede llegar a ella, así que apagar la herramienta con una
// bandera no bastaba. Mientras `ajustes.ts` importara el modal, el aviso seguía saliendo. LMath no
// lee el vault: recorrerlo era exclusivamente de la conversión, y sin conversión no hay motivo.
//
// ── Por qué el guion bajo, y no un nombre pelado ni un signo ─────────────────────────────
// El identificador de un bloque es una clave GLOBAL compartida por todos los plugins instalados:
// `graph` a secas es de los nombres más fáciles de que otro plugin ya haya tomado, y quien pierde
// el sorteo deja de renderizar sin avisar a nadie. Hacía falta un prefijo que distinguiera.
//
// El primer intento fue `graph*`, y no rindió: Obsidian no conserva el asterisco de la cadena de
// información del cercado, así que la clave registrada nunca casaba con lo escrito en la nota. El
// guion bajo no tiene ese problema —es un carácter de palabra, del juego que Obsidian sí admite en
// un identificador— y a la vez sigue marcando el bloque como nuestro de un vistazo.
//
// Aun así el registro va dentro de un try/catch (ver `registrarBloque` en main.ts): si algún día
// otro plugin toma uno de estos nombres, se pierde ese nombre y NO el plugin entero.

/** Un bloque y sus dos nombres. `motor` es el identificador interno que ya usaba
 *  `new MotorExperimental(this, …)`, y que no cambia: el renombrado fue solo de cara al usuario. */
export interface RenombreBloque {
  /** Identificador publicado hasta la 1.4.0 (el que hay escrito en las notas antiguas). */
  readonly viejo: string;
  /** Identificador vigente. */
  readonly nuevo: string;
  /** Identificador interno del motor. Ni se renombra ni se escribe en ninguna nota. */
  readonly motor: string;
}

/** Los seis bloques. El orden es el de main.ts y el de la documentación. */
export const RENOMBRES: readonly RenombreBloque[] = [
  { viejo: "obs-graph", nuevo: "_graph", motor: "graph" },
  { viejo: "obs-system", nuevo: "_system", motor: "system" },
  { viejo: "obs-derivate", nuevo: "_derivate", motor: "derivate" },
  { viejo: "obs-integral", nuevo: "_integral", motor: "integral" },
  { viejo: "obs-trig", nuevo: "_trig", motor: "trig" },
  { viejo: "obs-vector", nuevo: "_vector", motor: "vector" },
];

/**
 * Los nombres bajo los que responde un bloque. Desde la 2.0.0, UNO: el nuevo.
 *
 * Durante la 1.5.0 devolvía los dos —el viejo delante, para que un fallo al registrar el nuevo no
 * se llevara por delante las notas que ya existían— porque esa versión tenía que rendir las dos
 * sintaxis a la vez mientras la gente convertía sus notas. La 2.0.0 es la que lo anunció como
 * final: `obs-graph` ya no se registra, así que una nota escrita así deja de renderizar y Obsidian
 * la muestra como el bloque de código que es.
 *
 * Devuelve una LISTA aunque hoy tenga un solo elemento, y no es inercia: `registrarBloque` la
 * recorre, así que volver a admitir dos nombres —o admitir un alias nuevo— es tocar esta función y
 * nada más.
 *
 * El nombre viejo se queda en la tabla a propósito. No es nostalgia: es lo que permite reconocer
 * una nota antigua si algún día hay que decir algo sobre ella. Lo que se retiró es el REGISTRO, no
 * la memoria de cómo se llamaban.
 */
export function nombresDe(viejo: string): readonly string[] {
  const fila = RENOMBRES.find((r) => r.viejo === viejo);
  return fila ? [fila.nuevo] : [viejo];
}
