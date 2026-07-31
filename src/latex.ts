import { parse } from "mathjs";

import { opNodo, constNodo, simboloNodo, funcNodo, esNoNegativo, type Nodo } from "./formatoExpr";
import { normalizarEntrada, contieneYLibre } from "./parser";
import { parametrosDeFamilia } from "./despejeInverso";
import { simplificarCondiciones, type ExtremoCond, type ResultadoCond } from "./condiciones";
import { insertarProductoImplicito } from "./motor/parsing/productoImplicito";
import { funcionDelParametro } from "./motor/parsing/componentesParametricas";
import { CENTINELAS_SIGNO } from "./motor/parsing/dobleSigno";

// ─────────────────────────────────────────────
// LaTeX → presentación
// ─────────────────────────────────────────────

/**
 * Reescribe el LaTeX que mathjs genera para las inversas (`\sin^{-1}`, …) a la
 * notación pedida: arcsin/arccos/arctan como comandos `\arc…` y las menos comunes
 * como `\operatorname{arc…}` (no `\text{…}`: `\operatorname` usa la fuente de nombre
 * de función y añade el espaciado de operador ante el argumento, como `\sin`/`\log`).
 */
function embellecerInversasLatex(tex: string): string {
  return tex
    .replace(/\\sin\s*\^\{-1\}/g, "\\arcsin")
    .replace(/\\cos\s*\^\{-1\}/g, "\\arccos")
    .replace(/\\tan\s*\^\{-1\}/g, "\\arctan")
    .replace(/\\csc\s*\^\{-1\}/g, "\\operatorname{arccsc}")
    .replace(/\\sec\s*\^\{-1\}/g, "\\operatorname{arcsec}")
    .replace(/\\cot\s*\^\{-1\}/g, "\\operatorname{arccot}");
}

// Nombre LaTeX de cada función de "operador con nombre" a la que se le aplica la
// política tipográfica de paréntesis. Las inversas usan aquí el nombre arc…
// directamente (así no dependen de embellecerInversasLatex, que opera sobre el
// patrón `\sin^{-1}` que esta política ya no produce).
const NOMBRE_FUNCION_TEX: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan",
  sec: "\\sec", csc: "\\csc", cot: "\\cot",
  sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh", coth: "\\coth",
  log: "\\ln",            // en mathjs `log` (un argumento) es el logaritmo natural
  exp: "\\exp",
  asin: "\\arcsin", acos: "\\arccos", atan: "\\arctan",
  acsc: "\\operatorname{arccsc}", asec: "\\operatorname{arcsec}", acot: "\\operatorname{arccot}",
  // Inversas HIPERBÓLICAS: mismo criterio `arc…` que las circulares (mathjs las pintaría
  // `\sinh^{-1}`, que además se lee como un recíproco). Las emite el despeje por inversión
  // estructural al invertir `sinh(y)=x` / `tanh(y)=x`.
  asinh: "\\operatorname{arcsinh}", acosh: "\\operatorname{arccosh}", atanh: "\\operatorname{arctanh}",
};

/**
 * Handler de `toTex` que aplica una política de paréntesis basada en el AST:
 * para las funciones de NOMBRE_FUNCION_TEX con UN argumento, omite los paréntesis
 * si el argumento es un átomo (SymbolNode = variable/constante con nombre como
 * x, θ, π, e; o ConstantNode = literal numérico) y los añade para cualquier otro
 * nodo (operador, función anidada, raíz, |x|, potencia…). Reproduce la tipografía
 * matemática usual: `\sin x`, `\ln x`, pero `\sin\left(x+1\right)`, `\exp\left(x^2\right)`.
 *
 * POTENCIA de función: `pow(sin(x), n)` se renderiza `\sin^{n} x` (exponente SOBRE la
 * función), NO `{\sin x}^{n}` (que mathjs pinta como `\sin x^n`, leído como `sin(xⁿ)`).
 * Es la notación estándar `\tan^{2}(x)` y desambigua de la función compuesta. No aplica a
 * exponente negativo constante (`\sin^{-1}` se leería como la inversa).
 *
 * Devuelve `undefined` para el resto de nodos (incl. funciones de 2 argumentos
 * como `log(x,2)` → `\log_{2}` y raíces/abs), dejando el render por defecto de
 * mathjs. Recurre con `arg.toTex(options)` para que la política se propague a
 * funciones anidadas.
 */
// Centinela de "parentizar SIEMPRE": mathjs, con `parenthesis:"auto"`, descarta un
// ParenthesisNode que juzga redundante ante un producto —así que no se puede forzar
// `\left(\cos x\right)` con paréntesis reales—. En su lugar, `agruparFuncionesDesnudasEnProducto`
// envuelve el factor en `parenDesnuda(u)` (un FunctionNode con este nombre) y el handler lo
// pinta como `\left(<u>\right)`: un nodo de función SIEMPRE se renderiza, mathjs no lo poda.
const PAREN_DESNUDA = "parenDesnuda";

// Topes de legibilidad del radical (ver `radicalDeExponente`). Con potencia dentro se
// admiten los índices que aún se nombran y se leen de corrido —cuadrada, cúbica, cuarta,
// quinta—; una raíz PURA aguanta algo más porque no tiene exponente que leer encima.
//
// El 5 no es arbitrario ni el 4 era peor: es que `y^{2.5}=x` ⇒ `⁵√(x²)` lo añadió la 1.3.1
// a propósito, y con el tope en 4 esa forma se perdía. El criterio de legibilidad no
// llegaba a distinguirlas, así que manda no regresar lo que ya se decidió.
const INDICE_MAX_CON_POTENCIA = 5;
const INDICE_MAX_RAIZ_PURA = 8;

/** Quita los paréntesis explícitos que envuelven a un nodo (`((u))` → `u`). */
function pelar(n: Nodo): Nodo {
  let r = n;
  while (r.type === "ParenthesisNode") r = r.content;
  return r;
}

/**
 * Potencia de exponente RACIONAL → RADICAL: `x^{φ/2}` se pinta `\sqrt{x^{φ}}`, no
 * `x^{\frac{φ}{2}}`.
 *
 * El plugin YA pintaba como radical la potencia fraccionaria —`x^{1/2}`→`\sqrt{x}`,
 * `x^{2/3}`→`\sqrt[3]{x^{2}}`—, pero esa reescritura es de `simplify` (mathjs) y solo
 * reconoce el exponente escrito como cociente de ENTEROS LITERALES. Por eso la MISMA
 * función salía de dos formas distintas según cómo se hubiera escrito: `x^{1/2}` daba
 * `\sqrt{x}` y `x^{0.5}` daba `x^{\frac{1}{2}}` (el decimal se convierte en fracción
 * DESPUÉS de simplify, que ya no vuelve a mirar), y `x^{0.5φ}` daba `x^{\frac{φ}{2}}`
 * porque el numerador no es un dígito. Decidirlo aquí —en el emisor, por donde pasan
 * todas las formas— hace que la tipografía dependa de la EXPRESIÓN y no de la etapa que
 * la tocó primero.
 *
 * Condiciones (conservadoras, para no reescribir lo que ya se lee mejor tal cual):
 *   • denominador entero ≥2 (el índice del radical);
 *   • numerador ENTERO no negativo — o sea, exponente RACIONAL. Ver abajo;
 *   • y el radical tiene que SER MÁS LEGIBLE que la potencia — ver más abajo.
 *
 * Lo de exigir numerador entero merece explicación porque antes no se exigía: `x^{π/2}` se
 * pintaba `\sqrt{x^{π}}`. Es cierto, pero nadie lo escribe así. El radical es la notación
 * canónica de un exponente RACIONAL —`p/q` significa literalmente "raíz q-ésima de la
 * potencia p-ésima"—, y π/2 no es un racional: el `/2` de ahí es una división corriente,
 * no un índice. `x^{π/2}` ya es corto, familiar y se reconoce de un vistazo; convertirlo
 * en raíz lo vuelve más mecánico, no más claro. Mismo trato para `φ/2`, `e/3` y `τ/4`.
 * El cuerpo se compone reconstruyendo `base^numerador` y dejando que mathjs lo pinte, así
 * hereda su política de paréntesis: `(x+1)^{φ/2}` → `\sqrt{\left(x+1\right)^{\phi}}`.
 *
 * Que exista una fracción exacta NO es razón suficiente para pintar un radical, y esta es
 * la condición que faltaba. `x^{5/64}` salía `\sqrt[64]{x^{5}}`: equivalente, ilegible, y
 * —lo peor— INESTABLE, porque el aspecto de la expresión pasaba a depender de si el
 * racionalizador encontró o no una fracción, que es un detalle interno. Dos topes lo
 * cierran, y por debajo de ellos nada cambia:
 *
 *   • índice ≤ 4 con cualquier numerador. Son los radicales que se leen de un vistazo
 *     porque tienen glifo propio en la notación que se enseña: √, ∛ y ⁴√.
 *   • índice ≤ 8 solo si el numerador es 1, es decir una raíz PURA (`\sqrt[8]{x}`). Con
 *     numerador el mismo índice ya no compensa: `\sqrt[8]{x^{7}}` se lee peor que
 *     `x^{7/8}`, que es exactamente el trato que se quiere evitar.
 *
 * Además se EXTRAE la parte entera, que es como se escribe a mano: `x^{3/2}` es `x√x` y no
 * `\sqrt{x^{3}}`, y `x^{11/4}` es `x^{2}\sqrt[4]{x^{3}}`. La identidad
 * `x^{k+p/q} = x^{k}·x^{p/q}` es exacta y no mueve el dominio —una potencia no entera ya
 * exige base ≥0 (el motor evalúa con `Math.pow`, que da NaN en negativos), y el factor
 * entero está definido en todas partes—, así que la curva no se toca. Y el tope se aplica
 * DESPUÉS de extraer: lo que se juzga es el radical que se va a pintar de verdad.
 */
/** Exponente `±p/q` con p y q enteros y q≥2, o `null` si no lo es. `p` es el valor
 *  ABSOLUTO; el signo va aparte porque decide la forma (radical o su recíproco). */
interface ExponenteRacional { p: number; q: number; negativo: boolean }

function fraccionDelExponente(exp: Nodo): ExponenteRacional | null {
  const e = pelar(exp);
  if (e.type !== "OperatorNode" || e.op !== "/" || e.args?.length !== 2) return null;
  const den = pelar(e.args[1]);
  if (den.type !== "ConstantNode" || typeof den.value !== "number") return null;
  if (!Number.isInteger(den.value) || den.value < 2) return null;

  // El numerador llega como constante (posiblemente negativa) o como menos unario.
  let num = pelar(e.args[0]);
  let negativo = false;
  if (num.type === "OperatorNode" && num.op === "-" && num.args?.length === 1) {
    negativo = true;
    num = pelar(num.args[0]);
  }
  // Numerador ENTERO: es lo que hace del exponente un racional y del radical su notación
  // canónica. Deja fuera `x^{π/2}` (ver la cabecera) y `e^{x/2}`, que no es un número.
  if (num.type !== "ConstantNode" || typeof num.value !== "number") return null;
  if (!Number.isInteger(num.value) || num.value === 0) return null;
  if (num.value < 0) negativo = !negativo;
  return { p: Math.abs(num.value), q: den.value, negativo };
}

/** ¿Merece la pena pintar `\sqrt[q]{u^p}` en vez de la potencia? (los dos topes). */
function radicalDibujable(p: number, q: number): boolean {
  return q <= (p === 1 ? INDICE_MAX_RAIZ_PURA : INDICE_MAX_CON_POTENCIA);
}

/**
 * Pinta `base^(p/q)` con 0<p<q como radical. La parte entera y el signo ya no llegan aquí:
 * los resuelve `normalizarPotenciasRacionales` ANTES, sobre el árbol, para que el resultado
 * sean nodos que las demás pasadas puedan seguir tratando (que es lo que permite fundir
 * `√2·√x` en `√(2x)`; ver `fusionarRadicalesEnProducto`).
 */
function radicalDeExponente(base: Nodo, exp: Nodo, options: object): string | undefined {
  const f = fraccionDelExponente(exp);
  if (f === null || f.negativo) return undefined;
  const { p, q } = f;
  if (p >= q) return undefined;          // sin extraer: no es asunto del emisor
  if (!radicalDibujable(p, q)) return undefined;

  const cuerpo = p === 1
    ? pelar(base).toTex(options)
    : opNodo("^", "pow", [base, constNodo(p)]).toTex(options);
  return q === 2 ? `\\sqrt{${cuerpo}}` : `\\sqrt[${q}]{${cuerpo}}`;
}

/** Nodo de la raíz q-ésima de `u` (`sqrt` cuando q=2, que es como lo escribe el emisor). */
const raizNodo = (u: Nodo, q: number): Nodo =>
  q === 2 ? funcNodo(simboloNodo("sqrt"), [u]) : funcNodo(simboloNodo("nthRoot"), [u, constNodo(q)]);

/**
 * Un radical que YA llega escrito como raíz de una potencia (`sqrt(u^m)`, `nthRoot(u^m,q)`),
 * leído como el exponente racional m/q que representa. Null si no lo es.
 *
 * Hace falta porque el parser convierte `x^{3/2}` en `sqrt(x^3)` ANTES de llegar aquí, y a
 * propósito: la raíz da el valor REAL con base negativa donde existe (`x^{2/3}` en x<0) y la
 * potencia daría NaN (ver parser.ts §exponentes fraccionarios). El efecto colateral era que
 * las reglas de tipografía de abajo —que miran nodos `^`— no veían nunca esa forma, así que
 * `x^{3/2}` se pintaba `√(x³)` y `x^{1.5}`, la misma función, `x√x`.
 */
function raizDePotencia(n: Nodo): { base: Nodo; m: number; q: number } | null {
  if (n.type !== "FunctionNode" || !n.args) return null;
  let q: number;
  if (n.fn?.name === "sqrt" && n.args.length === 1) q = 2;
  else if (n.fn?.name === "nthRoot" && n.args.length === 2) {
    const idx = pelar(n.args[1]);
    if (idx.type !== "ConstantNode" || typeof idx.value !== "number") return null;
    q = idx.value;
  } else return null;
  if (!Number.isInteger(q) || q < 2) return null;

  const radicando = pelar(n.args[0]);
  if (!(radicando.type === "OperatorNode" && radicando.op === "^" && radicando.args?.length === 2))
    return null;
  const m = pelar(radicando.args[1]);
  if (m.type !== "ConstantNode" || typeof m.value !== "number") return null;
  if (!Number.isInteger(m.value) || m.value < 1) return null;
  return { base: pelar(radicando.args[0]), m: m.value, q };
}

/**
 * La misma división euclídea de `normalizarPotenciasRacionales`, aplicada a la forma de RAÍZ:
 * `√(x³)` → `x√x`, `⁴√(x¹¹)` → `x²·⁴√(x³)`. El resultado se queda en nodos de raíz, no se pasa
 * a potencia, para no tocar el dominio.
 *
 * Dos guardas que son exactamente donde la identidad deja de valer:
 *
 *  • ÍNDICE PAR CON EXPONENTE PAR se deja intacto. `⁴√(x⁶)` está definida en todo ℝ y es
 *    positiva; el factor extraído, `x·⁴√(x²)`, es negativo en x<0. El valor absoluto que la
 *    raíz de índice par lleva dentro se perdería al sacar el factor. Con exponente IMPAR no
 *    hay caso: el radicando ya obliga a u ≥ 0. Con índice IMPAR tampoco: la raíz conserva el
 *    signo y los dos lados coinciden en todo ℝ.
 *  • SIN RADICAL QUE PINTAR (`⁶⁴√(x⁵)`, por encima de los topes) se pasa a potencia, pero
 *    SOLO con índice par, que es cuando raíz y potencia tienen el mismo dominio (u ≥ 0). Con
 *    índice impar la raíz vive en los negativos y la potencia no: pintarla `x^{5/9}` sería
 *    anunciar una curva más corta que la dibujada.
 */
function normalizarRaizDePotencia(n: Nodo): Nodo {
  const r = raizDePotencia(n);
  if (r === null) return n;
  const { base, m, q } = r;
  if (q % 2 === 0 && m % 2 === 0) return n;

  const k = Math.floor(m / q);
  const resto = m - k * q;
  if (resto === 0) return n;             // potencia entera disfrazada: no es asunto de aquí
  if (!radicalDibujable(resto, q)) {
    return q % 2 === 0
      ? opNodo("^", "pow", [base, opNodo("/", "divide", [constNodo(m), constNodo(q)])])
      : n;
  }
  if (k === 0) return n;                 // no hay parte entera que sacar

  const radical = raizNodo(resto === 1 ? base : opNodo("^", "pow", [base, constNodo(resto)]), q);
  return opNodo("*", "multiply",
    [k === 1 ? base : opNodo("^", "pow", [base, constNodo(k)]), radical]);
}

/**
 * `x^{11/4}` → `x^{2}·x^{3/4}`, y `x^{-1/2}` → `1/x^{1/2}`. Reescritura sobre el ÁRBOL, no
 * sobre el LaTeX, y ahí está toda la gracia:
 *
 *  • La división euclídea `m = q·k + r` es lo que escribe una persona (`x^{3/2}` es `x√x`),
 *    y hacerla en nodos deja `x^{1/2}` a la vista de la pasada que funde radicales. Por eso
 *    `(2x)^{5/2}` —que `simplify` reparte en `4·2^{1/2}·x^{5/2}`— acaba en `4x²√(2x)`: se
 *    parte en `4·2^{1/2}·x²·x^{1/2}` y entonces los dos `^{1/2}` se ven y se juntan. Hecha
 *    sobre el texto ya emitido, ese `√x` era una cadena y no se podía tocar.
 *  • El exponente NEGATIVO pasa a ser el recíproco del radical: `x^{-1/2}` es `1/√x`, que es
 *    como se escribe. Antes se dejaba como potencia y salía `x^{\frac{-1}{2}}`, con el signo
 *    dentro de la fracción, que no lo escribe nadie.
 *
 * Ambas identidades son exactas y NO mueven el dominio: una potencia de exponente
 * fraccionario ya exige base ≥0 (`Math.pow` da NaN en negativos) y el factor entero existe
 * en todas partes; el recíproco excluye además el 0, que la potencia negativa ya excluía.
 *
 * Solo se reescribe si el radical resultante se va a PINTAR: si no, `x^{15/8}` se partiría
 * en `x·x^{7/8}` —dos trozos y ninguna raíz— que es peor que dejarlo entero.
 */
function normalizarPotenciasRacionales(node: Nodo): Nodo {
  const n = node.map(normalizarPotenciasRacionales);
  // La MISMA regla sobre la forma de raíz, que es como llega lo escrito con llaves LaTeX.
  const comoRaiz = normalizarRaizDePotencia(n);
  if (comoRaiz !== n) return comoRaiz;
  if (!(n.type === "OperatorNode" && n.op === "^" && n.args?.length === 2)) return n;

  const f = fraccionDelExponente(n.args[1]);
  if (f === null) return n;
  const { p, q, negativo } = f;
  const k = Math.floor(p / q);
  const r = p - k * q;
  if (r === 0) return n;                 // potencia entera disfrazada: no es un radical
  if (!radicalDibujable(r, q)) return n;

  // Base PELADA: si se deja el `ParenthesisNode` del usuario, mathjs lo pinta con su propio
  // espacio interior (`\left( x+1\right)`) y la misma construcción salía de dos formas según
  // la base. Pelado, los paréntesis los pone mathjs por PRECEDENCIA, iguales para todas.
  const base = pelar(n.args[0]);
  const radical = opNodo("^", "pow", [base, opNodo("/", "divide", [constNodo(r), constNodo(q)])]);
  // `base^1` se pintaría `x^{1}`: con k=1 el factor entero es la base tal cual.
  const conEntero = k === 0
    ? radical
    : opNodo("*", "multiply",
        [k === 1 ? base : opNodo("^", "pow", [base, constNodo(k)]), radical]);

  return negativo ? opNodo("/", "divide", [constNodo(1), conEntero]) : conEntero;
}

function manejadorFuncionesTex(node: Nodo, options: object): string | undefined {
  // Centinela de parentización forzada: `parenDesnuda(u)` → `\left(<u>\right)`.
  if (node.type === "FunctionNode" && node.fn?.name === PAREN_DESNUDA && node.args.length === 1)
    return `\\left(${node.args[0].toTex(options)}\\right)`;

  // Argumento de una función trig: `\sin x` (átomo) o `\sin\left(x+1\right)` (compuesto).
  const argFuncion = (arg: Nodo, nombreTex: string): string => {
    // Un paréntesis EXPLÍCITO alrededor de un átomo es redundante: lo pone el despeje al
    // componer sus strings (`e^y=x` ⇒ `log((x))`), no el usuario. Se pela para que la
    // atomicidad se juzgue sobre el contenido y salga `\ln x`, como en el resto del panel,
    // y no `\ln\left(x\right)`. Mismo criterio que los centinelas pm/fam de más abajo.
    let raiz = arg;
    while (raiz.type === "ParenthesisNode") raiz = raiz.content;
    const atomico = raiz.type === "SymbolNode" || raiz.type === "ConstantNode";
    const argTex = (atomico ? raiz : arg).toTex(options);
    return atomico ? `${nombreTex} ${argTex.trim()}` : `${nombreTex}\\left(${argTex}\\right)`;
  };

  // Logaritmos con base: `log10(u)`, `log2(u)` y `log(u, b)` → `\log_{b} u`, con el MISMO
  // criterio de paréntesis que el resto del panel (átomo sin ellos, compuesto con ellos).
  // mathjs los parentiza siempre y encima deja un espacio dentro —`\log_{10}\left( x\right)`—,
  // que no es la tipografía con la que se pintan `\ln 2` ni `\sin x`.
  //
  // Y base `e` → `\ln`. Los módulos que PRODUCEN un logaritmo natural (el despeje de `e^y=x`,
  // la integral de `1/x`, la re-simbolización de `0.693…`) escriben la base explícita, porque
  // sus cadenas vuelven a pasar por `normalizarEntrada` y ahí un `log` sin base significa base
  // 10 —lo que escribe el usuario—. Esa `e` es un detalle interno, no algo que deba leerse.
  if (node.type === "FunctionNode") {
    const nombre = node.fn?.name;
    const base =
      nombre === "log10" && node.args.length === 1 ? "10"
      : nombre === "log2" && node.args.length === 1 ? "2"
      : nombre === "log" && node.args.length === 2 ? node.args[1].toTex(options).trim()
      : undefined;
    if (base !== undefined)
      return argFuncion(node.args[0], base === "e" ? "\\ln" : `\\log_{${base}}`);
  }

  // Centinela del ± del despeje (despejar.ts): `pm(u)` → `\pm <u>`. Una raíz o una
  // fracción se leen solas → sin paréntesis (NO se enruta por NOMBRE_FUNCION_TEX/argFuncion,
  // que envolvería en `\left(\right)`). Pero un argumento con SUMA/RESTA de nivel superior
  // SÍ los necesita: el despeje de |y| puede dar `pm(x-1)`, y `\pm x-1` se leería como
  // `(\pm x)-1` —el ± solo afectaría al primer término—, que es otra ecuación.
  // Todos los ejes de signo se pintan igual (`\pm`/`\mp`): dos ± independientes en una fórmula
  // se leen como tales en notación matemática (`±arccos((a ± √d)/2)`), el eje es interno.
  const SIGNO_TEX: Record<string, string> =
    Object.fromEntries(CENTINELAS_SIGNO.map(([n, s]) => [n, s === 1 ? "\\pm" : "\\mp"]));
  if (node.type === "FunctionNode" && SIGNO_TEX[node.fn?.name] && node.args.length === 1) {
    const arg = node.args[0];
    const raiz = arg.type === "ParenthesisNode" ? arg.content : arg;
    const aditivo = raiz.type === "OperatorNode" && (raiz.op === "+" || raiz.op === "-") &&
      raiz.args?.length === 2;
    const cuerpo = arg.toTex(options);
    const signo = SIGNO_TEX[node.fn.name];
    return aditivo ? `${signo}\\left(${cuerpo}\\right)` : `${signo} ${cuerpo}`;
  }

  // SUMA con el centinela ± a la derecha: `a + pm(b)` → `a \pm b` (NO `a + \pm b`). Es la
  // forma de la fórmula cuadrática `y = (-b ± √Δ)/(2a)`, donde el ± no está a nivel superior
  // (como en `y = ±√u`) sino DENTRO de un numerador, junto a otro término. Sin esta regla el
  // despeje cuadrático general no se podía pintar: por eso estaba fuera de alcance.
  if (node.type === "OperatorNode" && node.op === "+" && node.args?.length === 2 &&
      node.args[1].type === "FunctionNode" && SIGNO_TEX[node.args[1].fn?.name]) {
    return `${node.args[0].toTex(options)} ${node.args[1].toTex(options)}`;
  }

  // Centinela de FAMILIA PERIÓDICA (despejeInverso.ts): `fam(k, p)` es el término
  // `k·p` de una solución general trig (`y = arctan(g) + fam(k, pi)` = …+kπ, k∈ℤ; la
  // coletilla `, k∈ℤ` la añade ecuacionALatex a nivel de ecuación). El coeficiente
  // numérico del período va DELANTE del parámetro, como se escribe a mano:
  // `fam(k, pi)` → `k\pi`, `fam(k, 2*pi)` → `2k\pi`. Período no reconocido →
  // `k\left(p\right)` (paréntesis para que el producto no se lea mal).
  if (node.type === "FunctionNode" && (node.fn?.name === "fam" || node.fn?.name === "famN") &&
      node.args.length === 2) {
    const kTex = node.args[0].toTex(options).trim();
    let p = node.args[1];
    while (p.type === "ParenthesisNode") p = p.content;
    if (p.type === "SymbolNode" && p.name === "pi") return `${kTex}\\pi`;
    if (p.type === "OperatorNode" && p.op === "*" && p.args?.length === 2 &&
        p.args[0].type === "ConstantNode" && p.args[1].type === "SymbolNode" &&
        p.args[1].name === "pi") {
      return `${p.args[0].toTex(options)}${kTex}\\pi`;
    }
    return `${kTex}\\left(${p.toTex(options)}\\right)`;
  }

  // Centinela de CONDICIÓN DE DOMINIO (despejar.ts): `dom(cuerpo, R)` se pinta como el CUERPO
  // a secas; la condición `R≥0` la añade `ecuacionALatex` como coletilla a nivel de ecuación
  // (igual que `fam` añade `, k∈ℤ`). Así el RHS se lee limpio y el dominio va aparte.
  if (node.type === "FunctionNode" && node.fn?.name === "dom" && node.args.length === 2)
    return node.args[0].toTex(options);

  if (node.type === "FunctionNode" && node.args.length === 1) {
    const nombreTex = NOMBRE_FUNCION_TEX[node.fn?.name];
    if (nombreTex) return argFuncion(node.args[0], nombreTex);
  }
  // Potencia de función: (trig(arg))^n → `\trig^{n}(arg)`. La base suele venir envuelta
  // en un ParenthesisNode (`(tan(x))^2`); se desenvuelve para llegar al FunctionNode.
  if (node.type === "OperatorNode" && node.op === "^" && node.args.length === 2) {
    const [base, exp] = node.args;
    let b = base;
    while (b.type === "ParenthesisNode") b = b.content;
    const nombreTex = b.type === "FunctionNode" && b.args.length === 1
      ? NOMBRE_FUNCION_TEX[b.fn?.name] : undefined;
    const expNegativo = exp.type === "ConstantNode" && exp.value < 0;
    if (nombreTex && !expNegativo)
      return argFuncion(b.args[0], `${nombreTex}^{${exp.toTex(options)}}`);
    // Exponente racional → radical (`x^{φ/2}` → `\sqrt{x^{φ}}`). Va DESPUÉS de la potencia
    // de función para no robarle `\sin^{1/2}`… que de todos modos no llega aquí: esa regla
    // solo actúa con `nombreTex`, y entonces ya ha devuelto.
    const radical = radicalDeExponente(base, exp, options);
    if (radical) return radical;
  }
  return undefined;
}

// Opciones de toTex compartidas: paréntesis mínimos de operadores + política
// tipográfica de funciones (ver manejadorFuncionesTex).
export const OPCIONES_TEX = { parenthesis: "auto", handler: manejadorFuncionesTex } as const;

/** Elimina artefactos de espaciado que mathjs introduce en el LaTeX generado. */
export function limpiarTex(tex: string): string {
  let resultado = embellecerInversasLatex(tex);
  // Una VARIABLE de una sola letra se pinta en cursiva, como manda la tipografía matemática.
  // mathjs pinta con `\mathrm{}` (fuente recta, la de las UNIDADES) los símbolos cuyo nombre
  // coincide con una unidad suya: la `t` del parámetro paramétrico es la tonelada, así que
  // `(\cos t, \sin t)` salía como `\cos\mathrm{t}` — la única letra recta en toda la fórmula.
  // Solo se desenvuelven las de UNA letra: los nombres de función (`\mathrm{arccot}`) no se tocan.
  resultado = resultado.replace(/\\mathrm\{([a-zA-Z])\}/g, "$1");
  resultado = resultado.replace(/~\s*/g, "");
  // Un símbolo con NOMBRE (`\pi`, `\theta`, `\alpha`…) multiplicado por una VARIABLE no
  // puede yuxtaponerse pegando la letra al comando: `\pi\cdot x` → `\pix` es un comando
  // inexistente y KaTeX lo pinta en ROJO. Se protege la variable con llaves: `\pi\cdot x`
  // → `\pi{x}` (que KaTeX lee como π·x). Va ANTES del colapso general de `\cdot` —que es el
  // que produciría el pegado— y solo cuando el factor derecho es una letra suelta (si es
  // otro comando, `\pi\cdot\theta` → `\pi\theta`, el pegado es válido y lo hace el colapso).
  // Las llaves sobreviven al colapso posterior (va precedido de letra, no de artefacto).
  resultado = resultado.replace(/(\\[a-zA-Z]+)\s*\\cdot\s*([a-zA-Z])/g, "$1{$2}");
  // Multiplicación explícita → yuxtaposición: `2\cdot x` → `2x`, `x\cdot y` → `xy`
  // (tipografía usual). Se CONSERVA solo entre dos números (`2\cdot 3`; si no, se
  // fundiría en `23`). Va ANTES del colapso de llaves para que `3\cdot{x}` acabe en
  // `3x` y no en `3{x}`. Beneficia a todo el pipeline (panel, despeje, simplificación).
  resultado = resultado.replace(
    /([^\s])\s*\\cdot\s*(?=(\S))/g,
    (_m, antes: string, desp: string) =>
      /\d/.test(antes) && /\d/.test(desp) ? `${antes}\\cdot ` : `${antes}`
  );
  // mathjs abre sus llaves con un espacio sobrante (`{ x}`, `\sqrt{ x}`, `\frac{ x}{2}`).
  // El colapso de llaves sueltas lo tolera, pero las llaves que SÍ se conservan (argumento
  // de `\sqrt`/`\frac`/`^`, o la variable protegida tras `\pi`) lo arrastraban. Se quita
  // aquí: dentro de una llave el espacio es tipográficamente irrelevante.
  resultado = resultado.replace(/\{[ \t]+/g, "{");
  // Colapsa SÓLO grupos `{x}` sueltos (artefactos de mathjs). No toca los que
  // son argumento de un comando (`\sqrt{x}`) ni de un sub/superíndice (`_{x}`,
  // `^{x}`) ni de una raíz n-ésima (`\sqrt[3]{x}`, llave tras `]`): si se
  // quitaran, `\sqrt{x}` se volvería `\sqrtx` (comando inválido → KaTeX lo pinta
  // en rojo) y `\frac{x}{2}` se rompería.
  resultado = resultado.replace(/(^|[^a-zA-Z\\^_}\]])\{\s*([a-zA-Z0-9])\s*\}/g, "$1$2");
  resultado = resultado.replace(/(\d)\s+([a-zA-Z\\])/g, "$1$2");
  // Todos los paréntesis a la forma ESCALABLE `\left(…\right)` (crecen con su contenido:
  // fracciones, exponentes, raíces). Solo los que aún no lo son: el lookbehind evita
  // duplicar (`\left\left(`). El LaTeX generado siempre tiene los paréntesis balanceados,
  // así que `\left`/`\right` quedan emparejados.
  resultado = resultado
    .replace(/(?<!\\left)\(/g, "\\left(")
    .replace(/(?<!\\right)\)/g, "\\right)");
  return resultado.trim();
}

/** Quita llaves externas redundantes de una cadena LaTeX. */
export function quitarLlavesExternas(texto: string): string {
  let resultado = texto.trim();
  while (resultado.startsWith("{") && resultado.endsWith("}")) {
    let profundidad = 0;
    let envuelveTodo = true;

    for (let i = 0; i < resultado.length; i++) {
      if (resultado[i] === "{") profundidad++;
      else if (resultado[i] === "}") profundidad--;

      if (profundidad === 0 && i < resultado.length - 1) {
        envuelveTodo = false;
        break;
      }
    }

    if (!envuelveTodo) break;
    resultado = resultado.slice(1, -1).trim();
  }
  return resultado;
}

// ─────────────────────────────────────────────
// Orden descendente de grado (presentación polinómica)
// ─────────────────────────────────────────────
//
// Variable de graficación respecto de la que se mide el grado. mathjs entrega las
// derivadas y sumas ya simplificadas SIN orden canónico (`2x + x^2`); esta etapa las
// pinta como se leen a mano —grado descendente: `x^2 + 2x + …`— sin tocar el string
// que grafica el motor (es puramente tipográfica, en la salida LaTeX).
const VAR_ORDEN = "x";

/** ¿El subárbol contiene la variable de graficación en algún lugar? */
function contieneVarOrden(n: Nodo): boolean {
  return n.filter((s: Nodo) => s.type === "SymbolNode" && s.name === VAR_ORDEN).length > 0;
}

/**
 * Grado en x de un TÉRMINO (0 = constante o término sin x). Devuelve `null` si el
 * término NO es polinómico en x —x dentro de una función (`sin x`), en un denominador
 * (`1/x`) o con exponente no entero/negativo (`x^{1/2}`, `x^{-1}`)—: la política ante
 * cualquier término no polinómico es NO reordenar (ver `ordenarPolinomioDescendente`),
 * así que ese `null` propaga «no tocar». Producto suma grados; potencia multiplica por
 * el exponente entero; suma anidada (base de una potencia, p. ej. `(x+1)^2`) toma el
 * máximo de sus sumandos.
 */
function gradoEnX(n: Nodo): number | null {
  switch (n.type) {
    case "ParenthesisNode": return gradoEnX(n.content);
    case "ConstantNode": return 0;
    case "SymbolNode": return n.name === VAR_ORDEN ? 1 : 0;
    case "FunctionNode": return contieneVarOrden(n) ? null : 0;
    case "OperatorNode": {
      if (n.args.length === 1) return gradoEnX(n.args[0]); // unario ±u
      if (n.op === "*") {
        let g = 0;
        for (const a of n.args) { const ga = gradoEnX(a); if (ga === null) return null; g += ga; }
        return g;
      }
      if (n.op === "/") {
        const gd = gradoEnX(n.args[1]);
        if (gd !== 0) return null; // x en el denominador → racional, no polinómico
        return gradoEnX(n.args[0]);
      }
      if (n.op === "^") {
        const [base, exp] = n.args;
        if (exp.type !== "ConstantNode" || !Number.isInteger(exp.value) || exp.value < 0)
          return contieneVarOrden(n) ? null : 0; // exponente variable/no entero/negativo
        const gb = gradoEnX(base);
        return gb === null ? null : gb * exp.value;
      }
      if (n.op === "+" || n.op === "-") { // suma anidada: grado = máx de sus sumandos
        let g = 0;
        for (const a of n.args) { const ga = gradoEnX(a); if (ga === null) return null; g = Math.max(g, ga); }
        return g;
      }
      return contieneVarOrden(n) ? null : 0;
    }
    default: return contieneVarOrden(n) ? null : 0;
  }
}

/**
 * Reordena SOLO el nivel superior de una suma polinómica en grado descendente de x
 * (`2x + x^2` → `x^2 + 2x`; `3 - x^2` → `-x^2 + 3`). Actúa únicamente si el nodo es una
 * cadena aditiva de ≥2 términos y TODOS son polinómicos en x; si alguno no lo es
 * (función de x, x en denominador, exponente variable) se deja intacto, para no alterar
 * expresiones no polinómicas. Reordenación cosmética: la suma es conmutativa, así que NO
 * cambia el valor. ESTABLE (los términos de igual grado conservan su orden) y NO recursiva:
 * las subexpresiones anidadas (denominadores, bases de potencia) se pintan como las produce
 * mathjs (evita reordenar, p. ej., el denominador de una derivada de cociente).
 */
function ordenarPolinomioDescendente(node: Nodo): Nodo {
  // Aplana la cadena aditiva de nivel superior en términos con su signo (+/−).
  const terminos: { signo: number; nodo: Nodo }[] = [];
  const aplanar = (n: Nodo, signo: number): void => {
    if (n.type === "OperatorNode" && n.args.length === 2 && (n.op === "+" || n.op === "-")) {
      aplanar(n.args[0], signo);
      aplanar(n.args[1], n.op === "-" ? -signo : signo);
    } else terminos.push({ signo, nodo: n });
  };
  aplanar(node, 1);
  if (terminos.length < 2) return node; // no es una suma: nada que reordenar

  const grados = terminos.map((t) => gradoEnX(t.nodo));
  if (grados.some((g) => g === null)) return node; // algún término no polinómico: intacto

  // Índices ordenados de forma ESTABLE por grado descendente (no se reordena si ya lo está).
  const orden = terminos.map((_, i) => i).sort((a, b) => (grados[b] as number) - (grados[a] as number));
  if (orden.every((i, k) => i === k)) return node;

  // Reconstruye la suma en el nuevo orden respetando los signos (el primer término, si es
  // negativo, se envuelve en menos unario; los siguientes se encadenan con suma/resta).
  const primero = terminos[orden[0]];
  let acc: Nodo = primero.signo < 0 ? opNodo("-", "unaryMinus", [primero.nodo]) : primero.nodo;
  for (let k = 1; k < orden.length; k++) {
    const t = terminos[orden[k]];
    acc = t.signo < 0
      ? opNodo("-", "subtract", [acc, t.nodo])
      : opNodo("+", "add", [acc, t.nodo]);
  }
  return acc;
}

// ─────────────────────────────────────────────
// Funciones "desnudas" agrupadas en el producto (desambiguación tipográfica)
// ─────────────────────────────────────────────
//
// Una función con nombre y argumento ATÓMICO se pinta SIN paréntesis (`\cos x`, política
// de manejadorFuncionesTex). Eso es correcto cuando la función es lo ÚLTIMO del producto
// (`e^x\cos x`), pero si le sigue OTRO factor su argumento parece tragárselo: `cos(x)·e^x`
// salía `\cos x{e}^{x}`, que se lee como cos(x·e^x). En un producto que MEZCLA funciones
// desnudas con factores no-función se aplican dos retoques puramente tipográficos (la
// multiplicación es CONMUTATIVA, así que NO cambia el string mathjs que grafica el motor):
//   1) SIEMPRE se REORDENA de forma estable llevando las funciones desnudas al FINAL, donde
//      su argumento sin paréntesis ya no puede tragarse el factor siguiente (`2\cos x`,
//      `x\sin x`, `e^x\cos x`).
//   2) SOLO si algún factor acompañante es una POTENCIA (`e^x`, `x^2`, `3^x` —algo con
//      superíndice, visualmente denso junto a la función) se PARENTIZA además la función
//      (`e^x\left(\cos x\right)`). Con un coeficiente numérico o una variable suelta se deja
//      limpio (`2\cos x`, no `2\left(\cos x\right)`). Los paréntesis reales no sirven (mathjs
//      los poda por redundantes ante un producto), así que se fuerzan con el centinela
//      PAREN_DESNUDA.
// Misma filosofía que ordenarPolinomioDescendente para las sumas.

/** Nombre mathjs de un factor que se pinta como `\nombre <átomo>` sin paréntesis (una
 *  función de NOMBRE_FUNCION_TEX con un único argumento atómico), o undefined. */
function nombreFuncionDesnuda(n: Nodo): string | undefined {
  // `log(u, e)` es la forma interna del logaritmo natural y se pinta `\ln u`: a efectos de
  // parentización es una función desnuda igual que las de un solo argumento. Sin esta rama,
  // `x²·ln x` volvía a salir `x^{2}\ln x`, donde la potencia parece tragarse el logaritmo.
  if (n.type === "FunctionNode" && n.fn?.name === "log" && n.args?.length === 2) {
    const arg = n.args[0];
    if (arg.type === "SymbolNode" || arg.type === "ConstantNode") return "log";
  }
  if (n.type === "FunctionNode" && n.args?.length === 1 && NOMBRE_FUNCION_TEX[n.fn?.name]) {
    const a = n.args[0];
    if (a.type === "SymbolNode" || a.type === "ConstantNode") return n.fn.name;
  }
  return undefined;
}

/** ¿El factor se pinta con un argumento atómico SIN paréntesis que un factor a su derecha
 *  podría parecer tragarse? Cubre `\cos x` y la potencia de función `\cos^{2} x` (exponente
 *  constante no negativo, la forma que emite manejadorFuncionesTex). */
function esFuncionDesnuda(n: Nodo): boolean {
  if (nombreFuncionDesnuda(n)) return true;
  if (n.type === "OperatorNode" && n.op === "^" && n.args.length === 2) {
    let base = n.args[0];
    while (base.type === "ParenthesisNode") base = base.content;
    const exp = n.args[1];
    return !!nombreFuncionDesnuda(base) &&
      exp.type === "ConstantNode" && typeof exp.value === "number" && exp.value >= 0;
  }
  return false;
}

/** ¿El factor es una POTENCIA (`e^x`, `x^2`, `3^x`)? Su superíndice lo hace visualmente denso
 *  junto a una función desnuda, y es el caso donde se prefieren los paréntesis. */
function esPotencia(n: Nodo): boolean {
  while (n.type === "ParenthesisNode") n = n.content;
  return n.type === "OperatorNode" && n.op === "^" && n.args.length === 2;
}

/**
 * Reescribe RECURSIVAMENTE cada cadena de productos `a*b*c…` de nivel superior que MEZCLE
 * funciones desnudas (ver `esFuncionDesnuda`) con factores no-función: las funciones se
 * llevan al final de forma ESTABLE y —solo si algún factor acompañante es una POTENCIA— se
 * envuelven en el centinela `parenDesnuda` para que el handler las parentice (`cos(x)·e^x` →
 * `e^x\left(\cos x\right)`, pero `2·cos x` → `2\cos x`). Si no hay mezcla, deja el nodo
 * intacto. Conmutatividad → no cambia el valor; puramente tipográfico.
 */
function agruparFuncionesDesnudasEnProducto(node: Nodo): Nodo {
  // Fuera de un producto: recurre a las subexpresiones (argumentos de función, denominadores…).
  if (!(node.type === "OperatorNode" && node.op === "*" && node.args.length === 2))
    return node.map(agruparFuncionesDesnudasEnProducto);

  // En el `*` MÁS EXTERNO se aplana TODA la cadena de una vez (no se recurre por los sub-`*`,
  // que son el mismo producto): así el reordenamiento se decide sobre todos los factores
  // juntos. Cada factor SÍ se procesa por dentro (su árbol interno puede tener más productos).
  const factores: Nodo[] = [];
  const aplanar = (n: Nodo): void => {
    if (n.type === "OperatorNode" && n.op === "*" && n.args.length === 2) {
      aplanar(n.args[0]); aplanar(n.args[1]);
    } else factores.push(agruparFuncionesDesnudasEnProducto(n));
  };
  aplanar(node);

  const funcs = factores.filter(esFuncionDesnuda);
  const resto = factores.filter((f) => !esFuncionDesnuda(f));
  // Sin mezcla (nada que reordenar): se preserva la ESTRUCTURA original del producto —con
  // sus flags de multiplicación implícita/explícita, de los que depende el espaciado que
  // limpiarTex protege (`\pi\cdot x` → `\pi{x}`)— recorriendo por `map` en vez de reconstruir.
  if (funcs.length === 0 || resto.length === 0) return node.map(agruparFuncionesDesnudasEnProducto);

  // Parentizar solo si algún factor acompañante es una potencia (si no, se deja limpio).
  const parentizar = resto.some(esPotencia);
  const alFinal = parentizar
    ? funcs.map((f) => funcNodo(simboloNodo(PAREN_DESNUDA), [f]))
    : funcs;
  // Reconstruye el producto (no-función primero, en orden estable; luego las funciones al
  // final) con `\cdot` explícito: limpiarTex lo colapsa a yuxtaposición donde corresponde y
  // lo CONSERVA entre dos números (evita fundir `2\cdot 3` en `23`).
  return [...resto, ...alFinal].reduce((acc, f) => opNodo("*", "multiply", [acc, f]));
}

// Convierte UN lado de una ecuación a LaTeX por el MISMO pipeline que obs-graph:
// normalizarEntrada (texto o LaTeX → sintaxis mathjs) → parse → toTex(OPCIONES_TEX)
// → limpiarTex. Así la tipografía (exponentes, paréntesis mínimos, raíces, trig e
// inversas, logaritmos, funciones especiales) es IDÉNTICA a la de obs-graph. Si el
// lado no se puede parsear, cae al texto normalizado (KaTeX suele renderizarlo).
/**
 * Un factor que es una potencia de exponente racional, en cualquiera de sus TRES formas
 * (`u^(p/q)`, `sqrt(u)`, `nthRoot(u,q)`), reducido a base + exponente. `null` si no lo es.
 *
 * Las tres tienen que reconocerse porque el panel las recibe mezcladas: lo que escribe el
 * usuario llega como potencia, y lo que devuelve `simplify` llega como `sqrt(...)`. Sin la
 * forma de función, la fusión no veía nada que fusionar justo en el caso que la motivó.
 */
function factorRadical(n: Nodo): { clave: string; base: Nodo; exp: Nodo } | null {
  const conIndice = (base: Nodo, p: number, q: number) => {
    if (!Number.isInteger(p) || !Number.isInteger(q) || q < 2 || p < 1) return null;
    // Solo se fusiona si el resultado se va a PINTAR como radical: si no, dos raíces se
    // convertirían en una potencia fraccionaria, que es peor que de lo que se venía.
    if (q > (p === 1 ? INDICE_MAX_RAIZ_PURA : INDICE_MAX_CON_POTENCIA)) return null;
    return {
      clave: `${p}/${q}`,
      base,
      exp: opNodo("/", "divide", [constNodo(p), constNodo(q)]),
    };
  };

  if (n.type === "FunctionNode" && n.args?.length === 1 && n.fn?.name === "sqrt")
    return conIndice(pelar(n.args[0]), 1, 2);

  if (n.type === "FunctionNode" && n.args?.length === 2 && n.fn?.name === "nthRoot") {
    const q = pelar(n.args[1]);
    if (q.type !== "ConstantNode" || typeof q.value !== "number") return null;
    return conIndice(pelar(n.args[0]), 1, q.value);
  }

  if (n.type === "OperatorNode" && n.op === "^" && n.args?.length === 2) {
    const e = pelar(n.args[1]);
    if (e.type !== "OperatorNode" || e.op !== "/" || e.args?.length !== 2) return null;
    const num = pelar(e.args[0]);
    const den = pelar(e.args[1]);
    if (num.type !== "ConstantNode" || den.type !== "ConstantNode") return null;
    if (typeof num.value !== "number" || typeof den.value !== "number") return null;
    return conIndice(pelar(n.args[0]), num.value, den.value);
  }

  return null;
}

/**
 * `2^{1/2}·x^{1/2}` → `(2x)^{1/2}`, es decir `√2·√x` → `√(2x)`.
 *
 * `simplify` reparte una potencia sobre el producto de su base —`(2x)^{5/2}` se convierte
 * en `2^{5/2}·x^{5/2}`— y el panel acababa pintando `4√2·x²√x`, con DOS radicales sueltos,
 * cuando la forma que se escribe a mano es `4x²√(2x)`: un solo radical con dentro lo que no
 * sale. No es solo gusto, es coherencia interna: el proyecto ya extrae el factor perfecto y
 * deja el resto DENTRO (`√(20x)` → `2√(5x)`), y `√2·√x` contradecía esa misma convención
 * según cómo se hubiera escrito la expresión (`sqrt(20x)` no se repartía y `(2x)^{1/2}` sí).
 *
 * DOMINIO. `a^{1/n}·b^{1/n} = (ab)^{1/n}` NO es una identidad libre: con a y b ambos
 * negativos el lado izquierdo es NaN·NaN y el derecho puede ser real (`√(−1)·√(−1)` es NaN,
 * `√1` es 1). Basta con que UNO de los dos sea demostrablemente no negativo para que sea
 * segura: entonces `ab < 0` solo puede venir del otro, que ya hacía NaN por su cuenta, y
 * ambos lados coinciden. Esa es la guarda —`esNoNegativo`—, y por eso `√x·√y` con las dos
 * simbólicas se queda como está.
 */
function fusionarRadicalesEnProducto(node: Nodo): Nodo {
  if (!(node.type === "OperatorNode" && node.op === "*" && node.args.length === 2))
    return node.map(fusionarRadicalesEnProducto);

  // Se aplana la cadena entera del `*` más externo, igual que la agrupación de funciones
  // desnudas: la fusión se decide mirando todos los factores a la vez.
  const factores: Nodo[] = [];
  const aplanar = (n: Nodo): void => {
    if (n.type === "OperatorNode" && n.op === "*" && n.args.length === 2) {
      aplanar(n.args[0]); aplanar(n.args[1]);
    } else factores.push(fusionarRadicalesEnProducto(n));
  };
  aplanar(node);

  const salida: Nodo[] = [];
  const bases = new Map<string, { indice: number; base: Nodo; exp: Nodo }>();
  let fusionado = false;
  for (const f of factores) {
    const rad = factorRadical(f);
    const previo = rad === null ? undefined : bases.get(rad.clave);
    if (rad === null) { salida.push(f); continue; }
    if (previo === undefined) {
      bases.set(rad.clave, { indice: salida.length, base: rad.base, exp: rad.exp });
      salida.push(f);
      continue;
    }
    // Hay otro factor con el mismo exponente: se fusionan las bases si el dominio lo
    // permite (ver la cabecera). Si no, este factor sigue su camino sin tocar.
    if (!esNoNegativo(previo.base) && !esNoNegativo(rad.base)) { salida.push(f); continue; }
    const base = opNodo("*", "multiply", [previo.base, rad.base]);
    salida[previo.indice] = opNodo("^", "pow", [base, previo.exp]);
    bases.set(rad.clave, { ...previo, base });
    fusionado = true;
  }

  // Sin fusión no se reconstruye nada: rehacer el producto perdería los flags de
  // multiplicación implícita de los que depende el espaciado (misma cautela que la
  // agrupación de funciones desnudas de más abajo).
  if (!fusionado) return node.map(fusionarRadicalesEnProducto);

  // Al reconstruir, los radicales van al FINAL: `4x²√(2x)` y no `4√(2x)x²`. Es el orden en
  // que se escribe —coeficiente, parte polinómica, raíz— y el único momento en que se puede
  // imponer sin tocar productos que nadie ha fusionado.
  const raices = salida.filter((f) => factorRadical(f) !== null);
  const llanos = salida.filter((f) => factorRadical(f) === null);
  return [...llanos, ...raices].reduce((acc, f) => opNodo("*", "multiply", [acc, f]));
}

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
      agruparFuncionesDesnudasEnProducto(
        fusionarRadicalesEnProducto(
          normalizarPotenciasRacionales(parse(norm) as unknown as Nodo))));
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

function lineaALatex(ec: string, alineada: boolean): string {
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