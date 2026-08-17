// ─────────────────────────────────────────────
// migracion · Tabla de renombrado de los bloques (ÚNICA fuente de verdad)
// ─────────────────────────────────────────────
//
// Todo el trabajo de migración (el registro en main.ts, el escáner, el reescritor, el modal y
// las pruebas) lee de esta tabla y de nada más. Si el identificador nuevo tiene que cambiar
// —porque el `*` no funcione en Obsidian, o porque prefieras otro sufijo— se cambia AQUÍ y el
// resto del sistema se entera solo. Ese es el motivo de que exista el archivo: la parte cara
// (recorrer el vault sin romper notas) no depende de cómo se llamen los bloques.
//
// Por qué el guion bajo, y no un nombre pelado ni un signo.
//
// El identificador de un bloque es una clave GLOBAL compartida por todos los plugins instalados:
// `graph` a secas es de los nombres más fáciles de que otro plugin ya haya tomado, y quien pierde
// el sorteo deja de renderizar sin avisar a nadie. Hacía falta un prefijo que distinguiera.
//
// El primer intento fue `graph*`, y no rindió: Obsidian no conserva el asterisco de la cadena de
// información del cercado, así que la clave registrada nunca casaba con lo escrito en la nota.
// El guion bajo no tiene ese problema —es un carácter de palabra, del juego que Obsidian sí
// admite en un identificador— y a la vez sigue marcando el bloque como nuestro de un vistazo.
//
// Aun así el registro va dentro de un try/catch (ver `registrarBloque` en main.ts): si algún día
// otro plugin toma uno de estos nombres, se pierde ese nombre y NO el plugin entero.

/** Un bloque y sus dos nombres. `motor` es el identificador interno que ya usaba
 *  `new MotorExperimental(this, …)`, y que no cambia: el renombrado es solo de cara al usuario. */
export interface RenombreBloque {
  /** Identificador publicado hasta la 1.4.0 (el que hay escrito en las notas de la gente). */
  readonly viejo: string;
  /** Identificador nuevo. */
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

/** Los dos nombres bajo los que debe responder un bloque durante la transición, viejo primero.
 *  El viejo va delante a propósito: si el nuevo resulta ser un identificador que Obsidian no
 *  acepta y su registro lanza, el viejo ya quedó registrado y las notas existentes siguen vivas.
 *  Ese orden es lo que hizo que el intento con `graph*` no rompiera nada. */
export function nombresDe(viejo: string): readonly string[] {
  const fila = RENOMBRES.find((r) => r.viejo === viejo);
  return fila ? [fila.viejo, fila.nuevo] : [viejo];
}

/** Mapa viejo→nuevo en minúsculas, para el escáner. Se construye una vez. */
const HACIA_ADELANTE = new Map(RENOMBRES.map((r) => [r.viejo.toLowerCase(), r.nuevo]));

/** Mapa nuevo→viejo, para deshacer una migración (ver `reescribir(texto, "atras")`). */
const HACIA_ATRAS = new Map(RENOMBRES.map((r) => [r.nuevo.toLowerCase(), r.viejo]));

/** Sentido de una reescritura. `atras` existe como red de seguridad: si el renombrado se
 *  revierte antes de publicarlo, las notas ya migradas se pueden devolver a `obs-*`. */
export type Direccion = "adelante" | "atras";

/**
 * Traducción de UN identificador de bloque, o `undefined` si no es de los nuestros.
 * La comparación ignora mayúsculas porque Obsidian tampoco distingue el lenguaje de un cercado;
 * el nombre devuelto es siempre el canónico de la tabla, no el que estuviera escrito.
 */
export function traducir(id: string, direccion: Direccion = "adelante"): string | undefined {
  const mapa = direccion === "adelante" ? HACIA_ADELANTE : HACIA_ATRAS;
  return mapa.get(id.toLowerCase());
}
