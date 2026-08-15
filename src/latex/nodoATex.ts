// ─────────────────────────────────────────────
// latex · Cómo se dibuja UN NODO (handler de mathjs + normalizaciones)
// ─────────────────────────────────────────────
//
// La capa de abajo del pipeline tipográfico: qué LaTeX emite cada nodo del AST. Incluye el
// handler que mathjs consulta al serializar (`OPCIONES_TEX`), las normalizaciones previas que
// convierten potencias racionales en radicales dibujables, y la limpieza del LaTeX resultante.
//
// Es la parte ESTABLE del módulo. Lo que crece cada vez que aparece un tipo de bloque es el
// ENSAMBLADO de ecuaciones, que se quedó en `latex.ts`.

import { opNodo, constNodo, simboloNodo, funcNodo, type Nodo } from "../formatoExpr";
import { CENTINELAS_SIGNO } from "../core/parsing/dobleSigno";

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
export const NOMBRE_FUNCION_TEX: Record<string, string> = {
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
export const PAREN_DESNUDA = "parenDesnuda";

// Topes de legibilidad del radical (ver `radicalDeExponente`). Con potencia dentro se
// admiten los índices que aún se nombran y se leen de corrido —cuadrada, cúbica, cuarta,
// quinta—; una raíz PURA aguanta algo más porque no tiene exponente que leer encima.
//
// El 5 no es arbitrario ni el 4 era peor: es que `y^{2.5}=x` ⇒ `⁵√(x²)` lo añadió la 1.3.1
// a propósito, y con el tope en 4 esa forma se perdía. El criterio de legibilidad no
// llegaba a distinguirlas, así que manda no regresar lo que ya se decidió.
export const INDICE_MAX_CON_POTENCIA = 5;
export const INDICE_MAX_RAIZ_PURA = 8;

/** Quita los paréntesis explícitos que envuelven a un nodo (`((u))` → `u`). */
export function pelar(n: Nodo): Nodo {
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
export function normalizarPotenciasRacionales(node: Nodo): Nodo {
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
