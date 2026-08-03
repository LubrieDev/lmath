// ─────────────────────────────────────────────
// trig · Parser del bloque obs-trig (PURO)
// ─────────────────────────────────────────────
//
// **Una línea = un ángulo. No hay nada más.** El bloque no se configura: no tiene claves, ni
// modos, ni capas que encender. Escribes un ángulo —o varios— y los ves sobre la circunferencia
// unidad; todo lo que se puede DECIR de ellos vive en el panel, y todo lo que se puede elegir
// —la unidad, el imán— vive en los controles del bloque y en los ajustes del plugin, que es donde
// se elige una vez en vez de en cada nota.
//
// Esa ausencia es la regla que impide que el bloque vuelva a crecer: sin sintaxis de opciones no
// hay dónde colgar la siguiente. Cualquier línea que no evalúe a un número avisa, y ya está.
//
// No pasa por `dividirEcuaciones` —que parte por `=` para separar los dos lados de una ECUACIÓN—
// porque aquí el `=` no separa nada: solo pone nombre al ángulo. Lo que sí se reutiliza es el
// pipeline de entrada del plugin (`normalizarEntrada` + `insertarProductoImplicito` +
// `compilarExpresion`), y con él la convención de unidades de TODO LMath: un número desnudo son
// RADIANES y el `°` es explícito (el normalizador ya lo convierte a `*(pi/180)`). Así `sin(30)`
// significa lo mismo dentro de un obs-trig que dentro de un obs-graph de la misma nota.

import { normalizarEntrada } from "../parser";
import { insertarProductoImplicito } from "../motor/parsing/productoImplicito";
import { compilarExpresion } from "../evaluador";
import { aRadianes } from "./modeloTrig";
import { fuenteSimbolica } from "./exactosTrig";
// Solo el TIPO, que TypeScript borra al compilar: no crea dependencia en tiempo de ejecución del
// parser hacia el renderizador (mismo préstamo que hace `interaccionTrig` con `EncuadreTrig`). La
// componente se nombra en un único sitio y este módulo la cita.
import type { ComponenteTrig } from "./renderTrig";

/**
 * Unidad en la que se ESCRIBEN los ángulos. Es presentación pura: la entrada del bloque son
 * radianes siempre (un número desnudo son radianes, el `°` es explícito), así que cambiar esto no
 * reinterpreta nada de lo escrito ni mueve un solo punto del dibujo.
 *
 * No se elige desde el bloque: la gobiernan el chip DEG/RAD/GRAD y el ajuste del plugin.
 *
 * El gradián divide la vuelta en 400 en vez de en 360, así que el ángulo recto son 100ᵍ — que es
 * de donde le viene el nombre a la unidad y la razón por la que se usa en topografía.
 */
export type UnidadTrig = "degrees" | "radians" | "gradians";

/** Ángulo por defecto del bloque VACÍO: 30°, el que mejor enseña de un vistazo. */
export const ANGULO_POR_DEFECTO = aRadianes(30);
/** Etiqueta de un ángulo escrito sin nombre. */
export const ETIQUETA_POR_DEFECTO = "θ";

export interface AnguloTrig {
  /** Nombre a la izquierda del `=`, tal cual se escribió (se rotula con KaTeX). */
  readonly etiqueta: string;
  /** El ángulo YA en radianes y con su signo. */
  readonly radianes: number;
  /** La expresión escrita a la derecha del `=`, para diagnósticos y para el panel. */
  readonly fuente: string;
  /**
   * ¿Está escrito en términos exactos (grados o π) y por tanto tiene DERECHO a valores
   * exactos? Se decide del TEXTO, no del número: `0.5236` y `\frac{\pi}{6}` valen casi lo
   * mismo, pero solo el segundo dice π. Ver `exactosTrig.fuenteSimbolica`.
   */
  readonly simbolico: boolean;
  /**
   * La componente que la expresión NOMBRA (`sin(30)` → seno), o `null` si no nombra ninguna.
   * Es lo que decide qué trazo abre encendido. Ver `componenteNombrada`.
   */
  readonly componente: ComponenteTrig | null;
}

/**
 * Qué salió mal, sin traducir: el host lo redacta con `t()`.
 *
 * Un solo tipo, y no por falta de casos: es que sin opciones que escribir mal, lo único que puede
 * fallar en una línea es que no sea un ángulo. Se conserva la forma estructurada —tipo + fragmento
 * culpable— porque es lo que mantiene la traducción en un único sitio.
 */
export interface AvisoTrig {
  readonly tipo: "anguloNoValido";
  /** El fragmento que lo provocó. */
  readonly texto: string;
}

export interface BloqueTrig {
  readonly angulos: readonly AnguloTrig[];
  readonly avisos: readonly AvisoTrig[];
}

/**
 * Evalúa una expresión de ángulo a radianes, o `null` si no da un número real. Reutiliza el
 * pipeline de entrada del plugin, así que acepta lo mismo que cualquier otro bloque:
 * `30°`, `\frac{\pi}{6}`, `pi/6`, `2\pi`, `-45°`, `0.5236`.
 */
export function evaluarAngulo(expr: string): number | null {
  const limpio = expr.trim();
  if (!limpio) return null;
  try {
    const valor = compilarExpresion(insertarProductoImplicito(normalizarEntrada(limpio)))({});
    return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Las tres funciones que TIENEN trazo en la figura, con la componente que enciende cada una. */
const FUNCION_COMPONENTE: ReadonlyArray<readonly [string, ComponenteTrig]> = [
  ["sin", "seno"], ["cos", "coseno"], ["tan", "tangente"],
];

/**
 * ¿El argumento es una CONSTANTE? Se pregunta evaluándolo con el ámbito VACÍO, que es la única
 * definición que no se queda corta: `x` y `2*x` salen `NaN` sin variable que los alimente, y una
 * expresión rota lanza. Cualquier cosa que dé un número real no depende de nada de fuera.
 *
 * El argumento llega YA normalizado —viene de la cadena que se va a compilar—, así que no se
 * vuelve a pasar por `normalizarEntrada`: hacerlo arriesgaría una segunda conversión a radianes
 * sobre un texto que ya la lleva.
 */
function argumentoConstante(arg: string): boolean {
  try {
    const v = compilarExpresion(arg)({});
    return typeof v === "number" && Number.isFinite(v);
  } catch {
    return false;
  }
}

/**
 * ¿La expresión es EXACTAMENTE una llamada a `sin`, `cos` o `tan` sobre un ángulo constante?
 * Devuelve la componente que nombra, o `null`.
 *
 * Sirve para que un bloque que se escribe `sin(30)` abra con el seno ya dibujado: quien nombra una
 * razón está diciendo cuál quiere ver, y obligarle a encenderla después es pedirle que repita algo
 * que ya dijo. **No cambia el ángulo**: `sin(30)` se sigue evaluando como en todo LMath —el literal
 * de una trigonométrica son grados, así que vale 0,5— y ese 0,5 son los radianes del bloque. Esto
 * elige un trazo, no reinterpreta la fuente.
 *
 * «Exactamente» es literal y se comprueba sobre la expresión YA NORMALIZADA, que es la que de
 * verdad se evalúa:
 *
 *   • El nombre abre la cadena, así que `2sin(30)` (`2*sin(...)`) y `-sin(30)` quedan fuera, y
 *     también `asin`, `arcsin` y `sinh`, que no empiezan por `sin(`.
 *   • El paréntesis que CIERRA esa llamada tiene que ser el último carácter. Se busca emparejando
 *     niveles y no con una expresión regular: `sin(30)+cos(30)` empieza y acaba como haría falta,
 *     y solo contar paréntesis descubre que ese `)` final no es el suyo.
 *   • El argumento tiene que ser constante, que es lo que separa «una razón concreta» de una curva.
 *
 * Lo que sí entra, porque es la misma llamada escrita de otra forma: `\sin{30}`, `\sin 30`,
 * `cos(45°)`, `\tan{\frac{\pi}{4}}`.
 */
export function componenteNombrada(expr: string): ComponenteTrig | null {
  const limpio = expr.trim();
  if (!limpio) return null;
  let norma: string;
  try {
    norma = insertarProductoImplicito(normalizarEntrada(limpio));
  } catch {
    return null;
  }
  for (const [fn, componente] of FUNCION_COMPONENTE) {
    if (!norma.startsWith(`${fn}(`)) continue;
    let nivel = 0;
    for (let i = fn.length; i < norma.length; i++) {
      if (norma[i] === "(") nivel++;
      else if (norma[i] === ")" && --nivel === 0) {
        // Cerró la llamada. Solo es «exactamente» esta llamada si aquí se acaba el texto.
        return i === norma.length - 1 && argumentoConstante(norma.slice(fn.length + 1, i))
          ? componente
          : null;
      }
    }
    // Paréntesis sin cerrar: no es una llamada, y el ángulo ya avisará por su cuenta.
    return null;
  }
  return null;
}

/** Lee el bloque entero: los ángulos y lo que no se entendió. */
export function parsearBloqueTrig(source: string): BloqueTrig {
  const angulos: AnguloTrig[] = [];
  const avisos: AvisoTrig[] = [];

  for (const cruda of source.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;

    // El `=` solo separa el NOMBRE del valor; si no lo hay, la línea entera es el ángulo.
    const corte = linea.indexOf("=");
    const etiqueta = corte >= 0 ? linea.slice(0, corte).trim() : "";
    const expr = corte >= 0 ? linea.slice(corte + 1).trim() : linea;
    const radianes = evaluarAngulo(expr);
    if (radianes === null) {
      avisos.push({ tipo: "anguloNoValido", texto: expr });
      continue;
    }
    angulos.push({
      etiqueta: etiqueta || ETIQUETA_POR_DEFECTO, radianes, fuente: expr,
      simbolico: fuenteSimbolica(expr), componente: componenteNombrada(expr),
    });
  }

  // Bloque VACÍO (o sin ningún ángulo legible) → el círculo unidad a 30°, funcional. No se vela
  // ni se avisa de nada: aquí no falta contenido, el círculo unidad ES el contenido.
  if (angulos.length === 0) {
    angulos.push({
      etiqueta: ETIQUETA_POR_DEFECTO, radianes: ANGULO_POR_DEFECTO, fuente: "30°",
      simbolico: true, componente: null,
    });
  }

  return { angulos, avisos };
}
