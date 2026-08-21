// ─────────────────────────────────────────────
// host-obsidian · info/latexSolucion — un punto solución, escrito como se escribe a mano
// ─────────────────────────────────────────────
//
// El ⓘ de obs-system enseñaba sus soluciones en TEXTO PLANO, y en cuanto la coordenada dejó
// de ser un decimal eso se volvió ambiguo: `((7 - √13)/2, (7 - √13)/2)` obliga a contar
// paréntesis para saber dónde acaba el numerador y dónde empieza el segundo miembro del par,
// y la barra `/` no distingue «dividir» de «separar». Escrito como fracción no hay nada que
// desambiguar: la raya dice hasta dónde llega el numerador, y la coma solo separa.
//
// Este módulo es PURO —de un punto sale un string LaTeX— para poder afirmarlo en las pruebas
// sin montar un bloque ni pedirle nada a Obsidian. Quien lo pinta es `info/plano.ts`.

import type { Solucion } from "../../CAS/api-legado";
import { aLatexE, aTextoE } from "../../CAS/api-legado";
import { formatearNumero } from "../../core/rendering/overlay/Overlay";

/**
 * El decimal, en LaTeX. Los dígitos son EXACTAMENTE los que ya enseñaba el panel
 * (`formatearNumero`, el mismo redondeo que las etiquetas de los ejes): esto no cambia
 * cuánta precisión se muestra, solo cómo se compone.
 *
 * Lo único que se reescribe es la notación científica: `1.7e-5` es una cadena de programador
 * —y dentro de un par ordenado, con la `e` en cursiva pegada al número, se lee como si fuera
 * el número e—, así que sale como la potencia de diez que es.
 */
export function decimalALatex(v: number): string {
  const s = formatearNumero(v);
  const m = /^(-?\d+(?:\.\d+)?)e([+-])(\d+)$/.exec(s);
  if (m === null) return s;
  const exponente = `${m[2] === "-" ? "-" : ""}${Number(m[3])}`;
  return `${m[1]}\\cdot 10^{${exponente}}`;
}

/** Una coordenada: su forma exacta cuando la hay, y el decimal solo cuando no la hay. */
const coordenadaALatex = (exacto: Solucion["exactoX"], valor: number): string =>
  exacto !== null ? aLatexE(exacto) : decimalALatex(valor);

/**
 * El par ordenado completo: `\left(…,\ …\right)`.
 *
 * Los paréntesis son ESCALABLES (`\left(…\right)`) porque el contenido puede ser una fracción
 * de dos pisos y unos paréntesis de altura fija se quedarían a media asta. El espacio tras la
 * coma (`\ `) es el que separa dos elementos de un par; sin él, LaTeX pega el segundo al
 * primero y vuelve la ambigüedad que se quería quitar.
 */
export function solucionALatex(p: Solucion): string {
  const x = coordenadaALatex(p.exactoX, p.x);
  const y = coordenadaALatex(p.exactoY, p.y);
  return `\\left(${x},\\ ${y}\\right)`;
}

/**
 * El MISMO punto en texto plano. No es una duplicación decorativa: es lo que se enseña si el
 * renderizado matemático no llega a completarse, para que el panel no se quede mudo. Era la
 * única forma del panel hasta ahora, así que como respaldo está probada por el uso.
 */
export function solucionATexto(p: Solucion): string {
  const x = p.exactoX !== null ? aTextoE(p.exactoX) : formatearNumero(p.x);
  const y = p.exactoY !== null ? aTextoE(p.exactoY) : formatearNumero(p.y);
  return `(${x}, ${y})`;
}
