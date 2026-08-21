// ─────────────────────────────────────────────
// oro · El volcado: la salida literal del CAS sobre todo el corpus
// ─────────────────────────────────────────────
//
// Interroga al CAS actual en varios PUNTOS DE OBSERVACIÓN por caso y escribe la respuesta tal
// cual, sin juzgarla. El resultado es el fichero dorado: la fotografía del comportamiento de hoy,
// contra la que se compara el de mañana.
//
// ── Por qué un volcado y no más aserciones ───────────────────────────────────────────────
// Una aserción dice «esto debe valer aquello», y hay que escribirla a mano una por una. El
// volcado dice «esto vale esto otro», y sale entero de recorrer el corpus. Para una migración es
// lo que hace falta: no queremos declarar cuál es la salida correcta (todavía no lo sabemos en
// muchos casos), queremos DARNOS CUENTA de cuál cambia.
//
// Y no sustituye a las pruebas: las ~870 aserciones exactas siguen ahí, diciendo lo que alguien
// decidió a conciencia. El volcado cubre el resto, que es casi todo.
//
// ── El formato ───────────────────────────────────────────────────────────────────────────
// Una línea por observación, `clave` y `valor` separados por dos espacios, bajo la cabecera del
// caso. Es un formato orientado a LÍNEA a propósito: así un `diff` señala exactamente qué
// observación de qué caso se movió, y el clasificador puede juzgar cada una por separado.
//
// El determinismo está comprobado: tres generaciones seguidas dan ficheros byte-idénticos.
// Es la condición sin la cual todo esto no serviría de nada.

import { simplificarEcuaciones } from "../../src/simplificar";
import { despejarEcuaciones } from "../../src/despejar";
import { derivarExpr } from "../../src/derivar";
import { integrarExpr } from "../../src/integrar";
import { bloqueALatex, exprALatex } from "../../src/latex";
import { normalizarEntrada } from "../../src/parser";
import { insertarProductoImplicito } from "../../src/core/parsing/productoImplicito";
import { expandirDobleSigno } from "../../src/core/parsing/dobleSigno";
import { ECUACIONES, EXPRESIONES } from "./corpus";
import { VACIO } from "./oraculo";

/** Una observación del volcado: qué caso, qué se le preguntó y qué contestó. */
export interface Registro {
  readonly caso: string;
  readonly clave: string;
  readonly valor: string;
}

/**
 * Ejecuta `f` y devuelve su resultado como texto. Un `null`/`undefined` es `∅` —«no lo sé», que
 * es una respuesta del CAS y no un fallo— y una excepción es `⚠ mensaje`. Los dos se FIJAN en el
 * dorado igual que cualquier otro valor: el día que un `∅` se convierta en un resultado, el
 * clasificador lo señalará como una ampliación de alcance, que casi siempre será una buena
 * noticia, pero siempre a la vista.
 */
function seguro(f: () => unknown): string {
  try {
    const v = f();
    return v === null || v === undefined ? VACIO : String(v);
  } catch (e) {
    return `⚠ ${(e as Error).message}`;
  }
}

/** Los puntos de observación de una ECUACIÓN: el camino completo de obs-graph. */
function observarEcuacion(ec: string): Registro[] {
  const r = (clave: string, f: () => unknown): Registro => ({ caso: ec, clave, valor: seguro(f) });
  const despeje = seguro(() => despejarEcuaciones([ec])[0]);
  return [
    r("norm", () => insertarProductoImplicito(normalizarEntrada(ec))),
    r("simplif", () => simplificarEcuaciones([ec])[0]),
    r("despeje", () => despeje),
    r("ramas", () => JSON.stringify(expandirDobleSigno(despeje))),
    r("latex", () => bloqueALatex([ec])),
    r("latexDesp", () => bloqueALatex(despejarEcuaciones([ec]))),
  ];
}

/** Los puntos de observación de una EXPRESIÓN f(x): los caminos de cálculo, que el corpus de
 *  ecuaciones apenas ejercita porque casi todo él son implícitas. */
function observarExpresion(expr: string): Registro[] {
  const r = (clave: string, f: () => unknown): Registro => ({ caso: expr, clave, valor: seguro(f) });
  return [
    r("norm", () => insertarProductoImplicito(normalizarEntrada(expr))),
    r("simplif", () => simplificarEcuaciones([expr])[0]),
    r("deriv", () => derivarExpr(expr)),
    r("integ", () => integrarExpr(expr)),
    r("latex", () => exprALatex(expr)),
    r("latexSimp", () => exprALatex(simplificarEcuaciones([expr])[0])),
  ];
}

/** El volcado de las ecuaciones del corpus graduado. */
export const volcarEcuaciones = (): Registro[] => ECUACIONES.flatMap(observarEcuacion);

/** El volcado de las expresiones f(x). */
export const volcarExpresiones = (): Registro[] => EXPRESIONES.flatMap(observarExpresion);

// ─────────────────────────────────────────────
// Serialización (ida y vuelta)
// ─────────────────────────────────────────────

const CABECERA = "── ";
const SANGRIA = "  ";

/** Registros → texto del fichero dorado. */
export function serializar(regs: readonly Registro[]): string {
  const lineas: string[] = [];
  let casoActual: string | null = null;
  for (const reg of regs) {
    if (reg.caso !== casoActual) {
      if (casoActual !== null) lineas.push("");
      lineas.push(CABECERA + reg.caso);
      casoActual = reg.caso;
    }
    // Un valor con salto de línea rompería el formato de una línea por observación. No los hay
    // hoy; si algún día los hubiera, se escapan aquí en vez de corromper el fichero en silencio.
    lineas.push(`${SANGRIA}${reg.clave}  ${reg.valor.replace(/\n/g, "\\n")}`);
  }
  return lineas.join("\n") + "\n";
}

/** Texto del fichero dorado → registros. Inverso exacto de `serializar`. */
export function deserializar(texto: string): Registro[] {
  const out: Registro[] = [];
  let caso = "";
  for (const linea of texto.split("\n")) {
    if (linea.startsWith(CABECERA)) { caso = linea.slice(CABECERA.length); continue; }
    if (!linea.startsWith(SANGRIA)) continue;
    const cuerpo = linea.slice(SANGRIA.length);
    const corte = cuerpo.indexOf("  ");
    if (corte < 0) continue;
    out.push({ caso, clave: cuerpo.slice(0, corte), valor: cuerpo.slice(corte + 2) });
  }
  return out;
}
