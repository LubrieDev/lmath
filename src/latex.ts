// ─────────────────────────────────────────────
// LaTeX · Ensamblado de ecuaciones y bloques
// ─────────────────────────────────────────────
//
// La capa de ARRIBA del pipeline tipográfico: cómo se monta una ecuación completa (sus dos
// lados, sus coletillas de dominio, rango y restricción) y cómo se monta un bloque de varias.
// Es la parte que crece cada vez que aparece un tipo de bloque nuevo.
//
// Cómo se dibuja un NODO —el handler de mathjs, las normalizaciones de potencias y radicales,
// la limpieza del LaTeX— vive en `src/latex/`:
//
//   • `latex/nodoATex.ts`        el handler `OPCIONES_TEX`, las normalizaciones y `limpiarTex`
//   • `latex/ordenPolinomio.ts`  orden descendente de grado
//   • `latex/agrupaciones.ts`    funciones desnudas y radicales fusionados en un producto
//
// El módulo REEXPORTA lo público de esas tres piezas, así que quien importe de `./latex` no
// cambia ni una línea.
//
// `GraphEngine` era la excepción: imprimía por su cuenta con `parse(...).toTex(...)`, y por
// tanto no recibía ninguna mejora tipográfica hecha aquí. Desde E3.5 usa `exprALatex` como
// todos, así que este archivo es el ÚNICO impresor del plugin —que es la condición para que
// sustituirlo más adelante sea una operación con un solo punto de cambio—.

import { parse } from "mathjs";

import { esNoNegativo, type Nodo } from "./formatoExpr";
import { normalizarEntrada, contieneYLibre } from "./parser";
import { parametrosDeFamilia } from "./despejeInverso";
import { simplificarCondiciones, type ExtremoCond, type ResultadoCond } from "./condiciones";
import { insertarProductoImplicito } from "./core/parsing/productoImplicito";
import { funcionDelParametro } from "./core/parsing/componentesParametricas";
import { separarRestriccion, type RestriccionDominio } from "./core/parsing/restriccionDominio";
import { OPCIONES_TEX, limpiarTex, normalizarPotenciasRacionales } from "./latex/nodoATex";
import { ordenarPolinomioDescendente } from "./latex/ordenPolinomio";
import {
  agruparFuncionesDesnudasEnProducto, fusionarRadicalesEnProducto,
  sinParentesisDeMenosUnario,
} from "./latex/agrupaciones";

export { OPCIONES_TEX, limpiarTex, quitarLlavesExternas } from "./latex/nodoATex";




function ladoALatex(lado: string): string {
  // MISMO preprocesado que grafica el motor: normalizar + INSERTAR el producto implícito.
  // Sin este último, un factor pegado a una función (`2x\sqrt{x}` → `2xsqrt(x)`, `x\sin x`
  // → `xsin(x)`) se parsea como UN identificador/función (`xsqrt`, `xsin`) y toTex lo pinta
  // `\mathrm{xsqrt}\left(x\right)` en vez de `2x\sqrt{x}`. El resto del pipeline (despejar,
  // derivar, simplificar, construirObjeto) ya inserta el `*`; el panel debe hacer lo mismo.
  const norm = insertarProductoImplicito(normalizarEntrada(lado.trim()));
  // Lado vacío ("y=" a medio escribir): parse("") de mathjs devuelve el nodo
  // "undefined" (toTex → "undefined"), que KaTeX pintaría como u·n·d·e·f… en
  // cursiva. Se muestra el marcador de "sin expresión".
  if (norm === "") return "\\text{[...]}";
  try {
    // Antes de pintar, dos retoques puramente tipográficos (no cambian lo que grafica el
    // motor): las funciones desnudas de cada producto se agrupan y parentizan al final
    // (`cos(x)·e^x` → `e^x\left(\cos x\right)`, evita que `\cos x` parezca tragarse el factor
    // siguiente) y luego la suma polinómica de nivel superior a grado descendente
    // (`2x + x^2` → `x^2 + 2x`).
    // El orden importa: primero se saca la parte entera de cada potencia racional (deja los
    // `^{1/q}` sueltos y a la vista), luego se funden los radicales del mismo índice, y solo
    // entonces se agrupan las funciones desnudas y se ordena el polinomio.
    const arbol = ordenarPolinomioDescendente(
      sinParentesisDeMenosUnario(
        agruparFuncionesDesnudasEnProducto(
          fusionarRadicalesEnProducto(
            normalizarPotenciasRacionales(parse(norm) as unknown as Nodo)))));
    return limpiarTex(arbol.toTex(OPCIONES_TEX));
  } catch {
    return norm;
  }
}

/**
 * LaTeX de UNA expresión suelta (un lado, sin `=`), por el pipeline compartido
 * (normalizarEntrada → parse → toTex → limpiarTex). Público para quien necesita
 * incrustar la tipografía de una expresión dentro de otra construcción LaTeX
 * (p. ej. `obs-derivate`: el cuerpo de `\frac{d}{dx}\left(…\right)`).
 */
export function exprALatex(expr: string): string {
  return ladoALatex(expr);
}

/** Separación entre la solución y su coletilla (condición de dominio, `k∈ℤ`): son DOS
 *  afirmaciones distintas, no un par de la misma expresión, y con el `\ ` de una coma normal
 *  quedaban tan pegadas que se leían como una sola. `\quad` es el hueco convencional en
 *  matemáticas para "…, sujeto a…". */
const SEPARADOR_COLETILLA = ",\\quad ";

/** Presentación de UNA condición `R ≥ 0`. La simplificación de CONJUNTO (quitar factores
 *  constantes, `x/2 ≥ 0 ⇔ x ≥ 0`) ya la hizo el despeje al emitir el centinela, de modo que el
 *  motor evalúa y el panel pinta exactamente lo mismo; aquí solo queda la parte TIPOGRÁFICA:
 *  una condición negada se lee mejor con el sentido invertido (`−x ≥ 0` → `x ≤ 0`) que con el
 *  menos delante. Cadena vacía si la condición resultó ser siempre cierta. */
function condicionLatex(cond: Nodo): string {
  let n = cond;
  while (n.type === "ParenthesisNode") n = n.content;
  if (esNoNegativo(n)) return "";   // `x²+1 ≥ 0`, `|x|+3 ≥ 0`: cierta siempre, es ruido
  const negada = n.type === "OperatorNode" && n.op === "-" && n.args.length === 1;
  const cuerpo = negada ? n.args[0] : n;
  return `${ladoALatex(cuerpo.toString())} ${negada ? "\\le" : "\\ge"} 0`;
}

/** Coletilla de CONDICIÓN DE DOMINIO: si el RHS lleva el centinela `dom(cuerpo, R)` (despeje
 *  de una inversa de rango restringido: √ par, |·|), la condición `R ≥ 0` —el despeje solo
 *  vale donde el radicando/argumento es no negativo—. Cadena vacía si no hay `dom`. Análoga a
 *  la coletilla `, k∈ℤ` de la familia periódica: la información de dominio va a nivel de
 *  ecuación, no incrustada en el RHS (que se lee limpio). Con VARIAS guardas (una torre de
 *  capas de rango restringido) se listan todas, cada una tras su `\quad`: son condiciones
 *  independientes y omitir cualquiera haría la fórmula más laxa que la curva. */
function coletillaDominio(rhs: string): string {
  if (!/(?<![a-zA-Z0-9_])dom\s*\(/.test(rhs)) return "";
  let nodo: Nodo;
  try { nodo = parse(insertarProductoImplicito(normalizarEntrada(rhs.trim()))) as unknown as Nodo; }
  catch { return ""; }
  const doms = nodo.filter((n: Nodo) => n.type === "FunctionNode" && n.fn?.name === "dom" && n.args.length === 2);

  // Las guardas nacen de una en una (cada capa invertida, cada elevación al cuadrado añade la
  // suya), pero son un SISTEMA de desigualdades sobre la misma x: se resuelve entero antes de
  // pintarlo. `(x²+3)/(2x) ≥ 0` y `(x²−3)/(2x) ≥ 0` dicen juntas `x ≥ √3`, y así es como se lee.
  const resuelto = simplificarCondiciones(doms.map((d: Nodo) => d.args[1].toString()));
  if (resuelto !== null) return coletillaRango(resuelto);

  // Fuera del alcance del simplificador (una guarda con `tan x`, `|x|`, un polinomio que no se
  // deja factorizar): se listan tal cual, cada una tras su `\quad`. Son independientes y omitir
  // cualquiera haría la fórmula más laxa que la curva.
  const vistas = new Set<string>();
  let out = "";
  for (const d of doms) {
    const cond = condicionLatex(d.args[1]);
    if (cond === "" || vistas.has(cond)) continue;   // trivial, o repetida por la recursión
    vistas.add(cond);
    out += `${SEPARADOR_COLETILLA}${cond}`;
  }
  return out;
}

/** El rango resuelto como coletilla: `x ≥ a`, `x ≤ b`, `a ≤ x ≤ b` (con `<` donde el extremo no
 *  entra). Sin coletilla si se cumple siempre; tampoco la hay si es imposible —ese caso no debería
 *  llegar aquí (el despeje se descarta antes), y si llega, mejor callar que afirmar un dominio. */
function coletillaRango(r: NonNullable<ResultadoCond>): string {
  if (r.tipo !== "rango") return "";
  const { min, max } = r.rango;
  const x = "x";
  const lado = (e: ExtremoCond): string => ladoALatex(e.expr);
  // Intervalo degenerado (`x ≥ 0` y `x ≤ 0`): es un punto, y se lee como tal.
  if (min !== null && max !== null && min.expr === max.expr && min.cerrado && max.cerrado)
    return `${SEPARADOR_COLETILLA}${x} = ${lado(min)}`;
  if (min !== null && max !== null)
    return `${SEPARADOR_COLETILLA}${lado(min)} ${min.cerrado ? "\\le" : "<"} ${x} ${max.cerrado ? "\\le" : "<"} ${lado(max)}`;
  if (min !== null) return `${SEPARADOR_COLETILLA}${x} ${min.cerrado ? "\\ge" : ">"} ${lado(min)}`;
  if (max !== null) return `${SEPARADOR_COLETILLA}${x} ${max.cerrado ? "\\le" : "<"} ${lado(max)}`;
  return "";
}

/** Convierte una ecuación de texto a LaTeX (opcionalmente con `&=` para alineación). */
export function ecuacionALatex(ecuacion: string, alineada = false): string {
  const partes = ecuacion.split("=");
  if (partes.length !== 2) return ecuacion;
  // AMBOS lados por el pipeline compartido. Antes el RHS con LaTeX (`includes("\\")`)
  // se desviaba por una ruta de regex (agregarParentesisFuncionesLatex) que NO usaba
  // toTex, produciendo tipografía distinta a obs-graph e incluso cambiando el
  // significado (`\sin x^2` → `\sin\left(x\right)^2` = (sin x)² en vez de sin(x²)).
  // normalizarEntrada ya convierte el LaTeX de entrada a mathjs, así que esa ruta
  // sobraba: ahora obs-system y obs-graph comparten EXACTAMENTE el mismo pipeline.
  const signo = alineada ? "&=" : "=";
  // Coletilla de FAMILIA PERIÓDICA: una ecuación con el centinela `fam`/`famN` es una familia
  // discreta de soluciones (despeje trig inverso: `y = arctan(g)+kπ`), y el rango de `k` es
  // parte de la MATEMÁTICA, no un adorno —sin él, `+kπ` se leería como una constante—. `famN`
  // restringe a k∈ℕ (`sin(1/(x²+y²))=0` → `y=±√(1/(kπ)−x²), k∈ℕ`); `fam`, a k∈ℤ.
  // UNA coletilla por PARÁMETRO: una torre de dos inversiones periódicas (`sin(cos y)=x`) tiene
  // dos enteros independientes, y declarar solo `k∈ℤ` haría leer la fórmula como si fueran el
  // mismo —afirmando la diagonal, un subconjunto propio de las soluciones—.
  const coletilla = parametrosDeFamilia(ecuacion)
    .map((p) => `${SEPARADOR_COLETILLA}${p.nombre}\\in\\mathbb{${p.natural ? "N" : "Z"}}`)
    .join("");
  return ladoALatex(partes[0]) + signo + ladoALatex(partes[1]) + coletillaDominio(partes[1]) + coletilla;
}

/**
 * LaTeX de un BLOQUE completo (panel de fórmula de obs-graph/obs-system): cada
 * ecuación por el pipeline compartido. Reglas por línea:
 *   • "lhs = rhs"        → ecuación tal cual (ecuacionALatex)
 *   • "(X, Y)" (tupla)   → par ordenado paramétrico \left(X,\ Y\right)
 *   • expresión suelta   → "f(x) = expr" (obs-graph clásico)
 * Con 2+ ecuaciones (un SISTEMA) se usa el MISMO formato que el motor antiguo
 * (sistemaCasesALatex): \begin{cases} con \begin{aligned} anidado, `&=` alineados
 * y separación vertical [1ex] entre ecuaciones.
 * Bloque vacío → marcador \text{[...]} (parse("") de mathjs da el nodo "undefined",
 * que KaTeX pintaría como u·n·d·e·f… en cursiva). En un obs-system (`sistema`) el
 * marcador vacío conserva la llave del sistema (`\begin{cases}…[...]…\end{cases}`),
 * no la forma `f(x)=`, para que el panel anticipe que se espera un SISTEMA.
 */
export function bloqueALatex(ecuaciones: readonly string[], sistema = false): string {
  if (ecuaciones.length === 0) {
    return sistema
      ? "\\begin{cases}~\\\\\\text{[...]}\\\\~\\end{cases}"
      : "f(x)=\\text{[...]}";
  }
  const multi = ecuaciones.length >= 2;
  const lineas = ecuaciones.map((ec) => lineaALatex(ec, multi));
  return multi
    ? `\\begin{cases}\\begin{aligned}${lineas.join("\\\\[1ex]")}\\end{aligned}\\end{cases}`
    : lineas[0];
}

/**
 * La coletilla de una RESTRICCIÓN DE DOMINIO (`,\quad 0 \le x \le 2\pi`).
 *
 * Se compone de las piezas TAL COMO SE ESCRIBIERON, cada una por el mismo `ladoALatex` que
 * tipografía la fórmula: así `2\pi` sale `2\pi` y no `6.283185307179586`, que es el número que
 * el motor usa pero no lo que el autor dijo. El separador es el mismo `\quad` con el que ya se
 * escriben las condiciones de dominio del despeje —«…, sujeto a…»—, porque es exactamente lo
 * mismo: una segunda afirmación sobre la primera, no un factor suyo.
 *
 * El comparador se pinta siempre `\le`/`\ge`, escribiera el autor `<`, `<=` o `≤`: el motor no
 * distingue el extremo abierto del cerrado (ver `restriccionDominio.ts`), y pintar `<` afirmaría
 * una diferencia que el dibujo no tiene.
 */
function coletillaRestriccion(r: RestriccionDominio): string {
  const piezas = r.piezas.map((p) => ladoALatex(p));
  const partes = piezas.map(
    (p, i) => (i === 0 ? p : `${r.signos[i - 1] === "ge" ? "\\ge" : "\\le"} ${p}`)
  );
  return `${SEPARADOR_COLETILLA}${partes.join(" ")}`;
}

function lineaALatex(ec: string, alineada: boolean): string {
  // La restricción se separa antes de tipografiar: sus llaves no son una agrupación y su `\leq`
  // no es una función, así que pasarlas por el pipeline las convertiría en basura. Vuelve al
  // final como coletilla, que es lo que son —una condición sobre la fórmula, no parte de ella—.
  const { expr, restriccion } = separarRestriccion(ec);
  if (restriccion) return `${lineaALatex(expr, alineada)}${coletillaRestriccion(restriccion)}`;

  const s = ec.trim();
  const tupla = separarTupla(s);
  // Par ordenado paramétrico. Se DECLARA la dependencia —`\left(x(t),\ y(t)\right)=…`— igual
  // que en las explícitas (`f(x)=`) y las polares (`r(θ)=`): la tupla desnuda no decía de qué
  // variable dependen sus componentes, y es además la forma en que el usuario las escribe
  // (dos líneas `x(t)=…` / `y(t)=…`, que dividirEcuaciones fusiona en esta tupla).
  if (tupla) {
    const par = `\\left(x\\left(t\\right),\\ y\\left(t\\right)\\right)`;
    return `${par}${alineada ? "&=" : "="}\\left(${ladoALatex(tupla[0])},\\ ${ladoALatex(tupla[1])}\\right)`;
  }
  // Función del PARÁMETRO: una componente suelta (`x(t)=…`) o una expresión suelta en `t`
  // (`5\cos t-\cos 5t`). El motor la grafica como explícita con la abscisa renombrada a x, pero
  // el panel conserva la variable que el autor escribió: `x(t)=…`, no `f(x)=…` (que hablaría de
  // una x que no aparece) ni el producto `x·t` (que es lo que salía).
  const comp = funcionDelParametro(s);
  if (comp) return `${comp.eje}\\left(t\\right)${alineada ? "&=" : "="}${ladoALatex(comp.expr)}`;
  // POLAR antes del caso general "lhs=rhs": el motor la grafica como r=g(θ)
  // (construirObjeto), y el panel debe DECLARAR la dependencia igual que hace con
  // `f(x)=…` en las explícitas. Sin esto el LHS se pinta como la variable suelta `r`,
  // que no distingue una polar de una implícita en `r`.
  const g = ladoPolar(s);
  if (g !== null) return `r\\left(\\theta\\right)${alineada ? "&=" : "="}${ladoALatex(g)}`;
  if (s.split("=").length === 2) return ecuacionALatex(s, alineada);
  // Expresión suelta con `y` LIBRE: el motor la grafica como implícita expr=0
  // (construirObjeto), así que el panel muestra `expr = 0`, no un falso `f(x)=…`.
  if (s !== "" && contieneYLibre(normalizarEntrada(s)))
    return `${ladoALatex(s)}${alineada ? "&=" : "="}0`;
  return `f(x)${alineada ? "&=" : "="}${s === "" ? "\\text{[...]}" : ladoALatex(s)}`;
}

/** Si la línea es una POLAR ("r = g(θ)" o "g(θ) = r"), devuelve el lado g(θ); si no, null.
 *  MISMO criterio que `construirObjeto`: un lado NORMALIZADO (LaTeX/Unicode → mathjs)
 *  es exactamente `r`. Así el panel y el motor coinciden siempre en qué es una polar. */
function ladoPolar(s: string): string | null {
  const partes = s.split("=");
  if (partes.length !== 2) return null;
  const lhs = normalizarEntrada(partes[0].trim());
  const rhs = normalizarEntrada(partes[1].trim());
  if (lhs === "r" && rhs !== "r") return partes[1];
  if (rhs === "r" && lhs !== "r") return partes[0];
  return null;
}

/** "(X, Y)": paréntesis que envuelven TODO + una coma de nivel 0 → [X, Y], o null.
 *  (Mismo criterio que la detección paramétrica de parsing/construirObjeto.) */
function separarTupla(s: string): [string, string] | null {
  if (s.length < 2 || s[0] !== "(" || s[s.length - 1] !== ")") return null;
  let prof = 0, coma = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") prof++;
    else if (c === ")" || c === "]" || c === "}") {
      if (--prof === 0 && i < s.length - 1) return null; // el "(" inicial no envuelve todo
    } else if (c === "," && prof === 1) {
      if (coma !== -1) return null; // más de una coma: no es un par
      coma = i;
    }
  }
  if (coma === -1) return null;
  const x = s.slice(1, coma).trim(), y = s.slice(coma + 1, -1).trim();
  return x && y ? [x, y] : null;
}