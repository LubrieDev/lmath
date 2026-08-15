// ─────────────────────────────────────────────
// parsing · Entrada del usuario → ObjetoMatematico (explícita/implícita/paramétrica/polar)
// ─────────────────────────────────────────────
//
// Clasificador mínimo + constructor. Convención (la del usuario, estilo Desmos):
//   • "(X(t), Y(t))"   (tupla con UNA coma de nivel 0)  → PARAMÉTRICA  p(t)
//   • "r = expr(θ)"    (un lado normaliza a "r")        → POLAR        r=g(θ)
//   • "y = expr"  o  "expr = y"  o  un solo lado sin "="  → EXPLÍCITA   y=f(x)
//     (salvo que el lado suelto contenga `y` LIBRE → IMPLÍCITA expr=0)
//   • cualquier otro "lhs = rhs"                          → IMPLÍCITA   F=(lhs)-(rhs)=0
//
// El orden importa: la PARAMÉTRICA se detecta ANTES del split por "=" (su tupla no
// lleva "="), y la POLAR dentro del caso "lhs=rhs". Explícita/implícita quedan
// EXACTAMENTE igual que antes (sin regresión). Reutiliza `normalizarEntrada` (texto
// puro) y delega la compilación numérica a `fields` (única con mathjs).
//
// Dominio del parámetro: paramétricas por defecto [0, 2π] (constante); las POLARES lo
// calculan por su PERIODO real (`dominioPolar`: `sin(θ/10)`→[0,20π], antes se cortaba a
// 1/10). El dominio a medida por el usuario (sintaxis para fijar el rango de t/θ) sigue
// siendo una extensión de UX PENDIENTE.

import { normalizarEntrada, contieneYLibre } from "../../parser";
import { insertarProductoImplicito } from "./productoImplicito";
import { crearFuncionReal } from "../fields/funcionRealMathjs";
import { crearCampoEscalar } from "../fields/campoEscalarMathjs";
import {
  crearParametrizacionCartesiana,
  crearParametrizacionPolar,
} from "../fields/parametrizacionMathjs";
import { dominioPolar } from "./periodoPolar";
import { funcionDelParametro, renombrarParametroAX } from "./componentesParametricas";
import { separarRestriccion, dentro, type RestriccionDominio } from "./restriccionDominio";
import type { CampoEscalar, FuncionReal, Parametrizacion } from "../contracts/oraculos";
import type { ObjetoExplicito, ObjetoMatematico } from "../contracts";

const DOMINIO_DEFECTO: readonly [number, number] = [0, 2 * Math.PI];

/**
 * Normaliza una pieza de expresión: convierte LaTeX/Unicode (parser compartido) y
 * luego inserta la multiplicación implícita propia del motor nuevo (3xy → 3*x*y).
 */
const norm = (s: string): string => insertarProductoImplicito(normalizarEntrada(s));

export function construirObjeto(source: string, id: string): ObjetoMatematico {
  // La restricción de dominio se separa ANTES de clasificar: `{0 ≤ x ≤ 2π}` es una llave más
  // para todo lo que hay debajo (el `=` de la clasificación, el producto implícito, mathjs), y
  // dejarla puesta rompería la expresión entera. El `fuente` del objeto conserva el source
  // COMPLETO: es lo que se escribió, y el panel lo necesita para pintar la coletilla.
  const { expr, restriccion } = separarRestriccion(source);
  const s = expr.trim();

  // 1) Paramétrica: (X(t), Y(t)) — tupla entre paréntesis envolventes con 1 coma de nivel 0.
  const par = intentarParametrica(s);
  if (par) return parametrica(id, source, par[0], par[1], restriccion);

  // 1b) UNA sola componente (`x(t)=…`, `y(t)=…`) o una expresión suelta en `t`: es la función
  // t ↦ expr, o sea la explícita de siempre con la variable independiente llamada `t` (se
  // renombra a x y la grafica el ProveedorExplicito; ver componentesParametricas.ts). El NOMBRE
  // dice en qué eje cae el VALOR: `y(t)` → ordenada (curva de pie, la gráfica clásica);
  // `x(t)` → ABSCISA, así que el parámetro sube por el eje vertical y la curva sale TUMBADA
  // (`salida:"x"`). No es una convención de Desmos: es lo que la componente SIGNIFICA —el punto
  // de parámetro t tiene esa x—. Sin esto, `x(t)` normaliza al producto `x*t` (implícita basura
  // con una `t` fantasma) y la expresión suelta en `t` se compila contra `x` → NaN en todo el eje.
  const comp = funcionDelParametro(s);
  if (comp) {
    // Aquí la variable independiente se LLAMA `t` aunque se grafique como x, así que la
    // restricción se acepta con cualquiera de los dos nombres: quien escribe `y(t)=t^2` acota
    // en `t`, que es lo único que ha escrito.
    const f = explicita(id, source, renombrarParametroAX(norm(comp.expr)), restriccion, ["x", "t"]);
    return comp.eje === "x" ? { ...f, salida: "x" } : f;
  }

  const partes = s.split("=");
  if (partes.length === 2) {
    const lhs = norm(partes[0].trim());
    const rhs = norm(partes[1].trim());
    if (lhs === "y") return explicita(id, source, rhs, restriccion);
    if (rhs === "y") return explicita(id, source, lhs, restriccion);
    // 2) Polar: r = g(θ)  (o  g(θ) = r). El ángulo es `theta` (también \theta y θ).
    if (lhs === "r") return polar(id, source, partes[1], restriccion);
    if (rhs === "r") return polar(id, source, partes[0], restriccion);
    // Implícita: F(x,y) = (lhs) - (rhs) = 0.
    return implicita(id, source, `(${lhs})-(${rhs})`, restriccion);
  }

  // Expresión suelta. Si contiene `y` LIBRE no puede ser y=f(x) (evaluarla solo con x
  // daría NaN en todo el eje → plano vacío + falso "Indeterminada"): se toma como
  // IMPLÍCITA expr = 0 (p. ej. `tan(y)(x²+1)-√(x+1)` ≡ `tan(y)(x²+1)=√(x+1)`).
  const suelta = norm(partes[0].trim());
  if (contieneYLibre(suelta)) return implicita(id, source, suelta, restriccion);
  return explicita(id, source, suelta, restriccion);
}

// ── Detección de tupla paramétrica ───────────────────────────────────────────
/** Si `s` es "(X, Y)" (paréntesis envolventes + 1 coma de nivel 0), devuelve [normX, normY]. */
function intentarParametrica(s: string): [string, string] | null {
  if (s.length < 2 || s[0] !== "(") return null;
  if (cierreParentesis(s, 0) !== s.length - 1) return null; // el paréntesis debe envolver TODO
  const interior = s.slice(1, -1);
  const coma = comaNivel0(interior);
  if (coma === -1) return null;
  // Debe haber EXACTAMENTE una coma de nivel 0 (es un par, no una terna).
  if (comaNivel0(interior.slice(coma + 1)) !== -1) return null;
  const xs = interior.slice(0, coma).trim();
  const ys = interior.slice(coma + 1).trim();
  if (!xs || !ys) return null;
  return [norm(xs), norm(ys)];
}

/** Índice del ')' que cierra el '(' en `inicio`, o -1. */
function cierreParentesis(texto: string, inicio: number): number {
  let prof = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === "(") prof++;
    else if (texto[i] === ")" && --prof === 0) return i;
  }
  return -1;
}

/** Índice de la primera coma de nivel 0 (fuera de (), [], {}), o -1. */
function comaNivel0(texto: string): number {
  let prof = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "(" || c === "[" || c === "{") prof++;
    else if (c === ")" || c === "]" || c === "}") prof--;
    else if (c === "," && prof === 0) return i;
  }
  return -1;
}

// ── La restricción de dominio, aplicada ──────────────────────────────────────
//
// El recorte no necesita motor nuevo: el contrato dice que un valor NO FINITO es «fuera del
// dominio» (`contracts/oraculos.ts`), y el descubridor, el trazador, los puntos notables y el
// autoencuadre ya lo tratan como ausencia de curva. Acotar es, literalmente, devolver NaN fuera
// del intervalo. En paramétricas y polares ni eso hace falta: ahí el intervalo ES el dominio del
// parámetro, que ya era un dato del objeto.
//
// La restricción tiene que nombrar la variable del bloque. Si nombra otra —`\sin x {0 ≤ t ≤ 3}`,
// que es un despiste, no una figura— NO se aplica callando: se recorta a un dominio VACÍO, con
// lo que el plano se vela y el autor ve que algo no cuadra. Aplicarla sobre la variable
// equivocada, o ignorarla, sería dibujar una curva que él no ha pedido.

/** ¿La restricción habla de la variable de este objeto? */
const suVariable = (r: RestriccionDominio, nombres: readonly string[]): boolean =>
  nombres.includes(r.variable);

/** La misma función, NaN fuera del intervalo. */
function restringirFuncion(f: FuncionReal, r: RestriccionDominio): FuncionReal {
  return { eval: (x: number): number => (dentro(r, x) ? f.eval(x) : NaN) };
}

/**
 * El mismo campo, NaN fuera del intervalo, sobre el eje que la restricción nombra.
 *
 * El GRADIENTE se envuelve igual y no se descarta: dejarlo pasar diría que el campo crece hacia
 * un lado justo donde el campo ya no existe, y quitarlo del todo penalizaría la continuación
 * dentro del intervalo, que es donde sí hay curva.
 */
function restringirCampo(F: CampoEscalar, r: RestriccionDominio, eje: "x" | "y"): CampoEscalar {
  const vale = (x: number, y: number): boolean => dentro(r, eje === "x" ? x : y);
  const gradiente = F.gradiente?.bind(F);
  const recortado: CampoEscalar = {
    eval: (x: number, y: number): number => (vale(x, y) ? F.eval(x, y) : NaN),
  };
  if (!gradiente) return recortado;
  return {
    ...recortado,
    gradiente: (x: number, y: number) => (vale(x, y) ? gradiente(x, y) : [NaN, NaN] as const),
  };
}

/**
 * El dominio del parámetro con la restricción aplicada. Un lado sin cota conserva el de por
 * defecto —`{t ≥ 0}` no dice nada del final del recorrido—, y un lado con cota MANDA aunque
 * ensanche: quien escribe `{0 ≤ t ≤ 10}` quiere diez, no los 2π de siempre.
 */
function dominioRestringido(
  base: readonly [number, number], r: RestriccionDominio
): readonly [number, number] {
  return [
    Number.isFinite(r.min) ? r.min : base[0],
    Number.isFinite(r.max) ? r.max : base[1],
  ];
}

/** El intervalo vacío con el que se recorta lo que nombra una variable ajena (ver arriba). */
const VACIA: RestriccionDominio = {
  variable: "", min: NaN, max: NaN, texto: "", piezas: [], signos: [],
};

/**
 * La marca de «esta restricción habla de otra variable», para que el host pueda decirlo. Sale
 * como campo opcional y no como excepción porque el objeto SÍ se construye: existe, es válido y
 * simplemente no tiene ningún punto, que es lo que el autor ha escrito sin querer.
 */
const avisoDe = (
  r: RestriccionDominio | null, nombres: readonly string[]
): { avisoRestriccion?: "variableAjena" } =>
  r !== null && !suVariable(r, nombres) ? { avisoRestriccion: "variableAjena" } : {};

// ── Constructores por tipo ───────────────────────────────────────────────────
function explicita(
  id: string,
  source: string,
  expr: string,
  r: RestriccionDominio | null = null,
  nombres: readonly string[] = ["x"]
): ObjetoExplicito {
  const f = crearFuncionReal(expr);
  return {
    id, tipo: "explicita", fuente: source, variables: ["x"], ...avisoDe(r, nombres),
    f: r === null ? f : restringirFuncion(f, suVariable(r, nombres) ? r : VACIA),
  };
}

function implicita(
  id: string, source: string, exprDiferencia: string, r: RestriccionDominio | null = null
): ObjetoMatematico {
  const F = crearCampoEscalar(exprDiferencia);
  // Una implícita tiene DOS variables, así que aquí la restricción puede acotar cualquiera de
  // las dos: `{0 ≤ x ≤ 2}` recorta en horizontal y `{0 ≤ y ≤ 2}` en vertical.
  const eje = r?.variable === "y" ? "y" : "x";
  return {
    id, tipo: "implicita", fuente: source, variables: ["x", "y"], ...avisoDe(r, ["x", "y"]),
    F: r === null ? F : restringirCampo(F, suVariable(r, ["x", "y"]) ? r : VACIA, eje),
  };
}

/**
 * Una parametrización que no da ningún punto. Es cómo se recorta a la nada un recorrido cuya
 * restricción habla de otra variable: aquí no vale el intervalo vacío, porque el dominio es un
 * dato aparte del que evalúa —dejar el dominio de siempre dibujaría la curva ENTERA—.
 */
const parametrizacionVacia = (p: Parametrizacion): Parametrizacion => ({
  ...p,
  eval: () => ({ x: NaN, y: NaN }),
});

function parametrica(
  id: string, source: string, exprX: string, exprY: string, r: RestriccionDominio | null = null
): ObjetoMatematico {
  // Un recorrido recortado ya no se cierra: media circunferencia no es periódica, y decir que lo
  // es haría que el trazador uniera el último punto con el primero.
  const p = crearParametrizacionCartesiana(
    exprX, exprY,
    r !== null && suVariable(r, ["t"]) ? dominioRestringido(DOMINIO_DEFECTO, r) : DOMINIO_DEFECTO,
    r === null
  );
  return {
    id, tipo: "parametrica", fuente: source, variables: ["t"], ...avisoDe(r, ["t"]),
    p: r === null || suVariable(r, ["t"]) ? p : parametrizacionVacia(p),
  };
}

/** θ (Unicode) → theta; `\theta` lo resuelve normalizarEntrada (quita el backslash). */
const normPolar = (ladoExpr: string): string =>
  norm(ladoExpr.trim().replace(/θ/g, "theta"));

/**
 * La expresión r(θ) YA normalizada de un bloque polar, o `null` si `source` no lo es.
 * La necesita el panel ⓘ, que analiza r como función escalar (periodo, extremos, área)
 * y no puede sacarla del `ObjetoPolar`: ahí r ya viene envuelta en la parametrización
 * cartesiana. Comparte el reconocimiento con `construirObjeto` para que no pueda haber
 * dos ideas distintas de qué bloque es polar.
 */
export function expresionPolar(source: string): string | null {
  // Sin separar la restricción, `r = cos(θ) {0 ≤ θ ≤ π}` daría una `r(θ)` con las llaves dentro
  // y el panel analizaría una expresión que no compila. Mismo primer paso que `construirObjeto`.
  const partes = separarRestriccion(source).expr.split("=");
  if (partes.length !== 2) return null;
  const lhs = norm(partes[0].trim());
  const rhs = norm(partes[1].trim());
  if (lhs === "r") return normPolar(partes[1]);
  if (rhs === "r") return normPolar(partes[0]);
  return null;
}

/**
 * Las componentes `[x(t), y(t)]` YA normalizadas de un bloque paramétrico, o `null` si
 * `source` no lo es. Igual que `expresionPolar`, lo necesita el panel ⓘ: el
 * `ObjetoParametrico` solo guarda la parametrización compilada, y el análisis (periodo de
 * cada componente, familia, simetrías) trabaja sobre las expresiones.
 */
export function expresionesParametricas(source: string): [string, string] | null {
  return intentarParametrica(separarRestriccion(source).expr.trim());
}

function polar(
  id: string, source: string, ladoExpr: string, r: RestriccionDominio | null = null
): ObjetoMatematico {
  const expr = normPolar(ladoExpr);
  // Dominio por PERIODO real de la curva (`sin(θ/10)` necesita 20π, no 2π). Una restricción en
  // θ lo sustituye: es el mismo dato, dicho por el autor en vez de deducido.
  const base = dominioPolar(expr);
  const acotada = r !== null && suVariable(r, ["theta"]);
  const p = crearParametrizacionPolar(
    expr, acotada ? dominioRestringido(base, r) : base, r === null
  );
  return {
    id, tipo: "polar", fuente: source, variables: ["theta"], ...avisoDe(r, ["theta"]),
    p: r === null || acotada ? p : parametrizacionVacia(p),
  };
}
