// ─────────────────────────────────────────────
// io/leer · Qué significa cada cosa que se puede escribir (PURO: solo tablas)
// ─────────────────────────────────────────────
//
// El diccionario del lector: de la notación que teclea una persona a los conceptos del núcleo.
// Solo datos, ninguna decisión —las decisiones son del analizador—, y por eso es el archivo que
// se toca al añadir una notación nueva.
//
// ── Por qué esto es una tabla y antes eran 49 expresiones regulares ──────────────────────
// El lector histórico (`parser.ts`) reescribe el texto 49 veces hasta convertirlo en algo que
// mathjs entienda. Cada notación nueva es una regex más que puede interactuar con las 48
// anteriores, y el orden entre ellas es significativo sin que nada lo declare. Aquí, añadir
// `\erf` es añadir una fila.
//
// ── Una decisión: no se admite lo que no está en el catálogo ─────────────────────────────
// Si un nombre no tiene ficha en `registro/catalogo.ts`, el lector lo trata como un SÍMBOLO, no
// como una función. Es lo que hace que `xy` sea un producto y `sin x` no lo sea, sin ninguna
// lista paralela que mantener: el catálogo es la única fuente de qué nombres son funciones.

/** Comandos LaTeX que nombran una función del catálogo. La clave va sin la barra. */
export const FUNCION_POR_COMANDO: Readonly<Record<string, string>> = {
  sin: "sin", cos: "cos", tan: "tan", sec: "sec", csc: "csc", cot: "cot",
  sinh: "sinh", cosh: "cosh", tanh: "tanh", sech: "sech", csch: "csch", coth: "coth",
  arcsin: "asin", arccos: "acos", arctan: "atan",
  arcsec: "asec", arccsc: "acsc", arccot: "acot",
  arcsinh: "asinh", arccosh: "acosh", arctanh: "atanh",
  arsinh: "asinh", arcosh: "acosh", artanh: "atanh",
  exp: "exp", abs: "abs", sign: "sign", gamma: "gamma",
  min: "min", max: "max", gcd: "gcd", lcm: "lcm", mod: "mod",
  floor: "floor", ceil: "ceil", round: "round",
};

/** Nombres que se escriben SIN barra y aun así son funciones (`sin(x)`, `nthRoot(u,3)`). Se
 *  resuelven contra el catálogo, así que esta tabla solo recoge los alias que no coinciden con
 *  su id. */
export const ALIAS_PLANOS: Readonly<Record<string, string>> = {
  arcsin: "asin", arccos: "acos", arctan: "atan",
  arcsec: "asec", arccsc: "acsc", arccot: "acot",
  arcsinh: "asinh", arccosh: "acosh", arctanh: "atanh",
  ln: "__ln", logNat: "__ln",
};

/** Constantes con nombre. Van al átomo `Constante`, no a un símbolo que casualmente se llama π:
 *  es lo que permite que el orden canónico las trate como lo que son. */
export const CONSTANTE_POR_NOMBRE: Readonly<Record<string, "pi" | "e" | "tau" | "phi">> = {
  pi: "pi", Pi: "pi", tau: "tau", phi: "phi", varphi: "phi",
  e: "e",
};

/** Letras griegas que son NOMBRES de variable o de parámetro, no constantes. Sin esta tabla,
 *  `\alpha` se partiría en `a·l·p·h·a` —cinco variables inexistentes—, que es exactamente el
 *  defecto que tenía el motor al declarar un parámetro griego. */
export const GRIEGAS: readonly string[] = [
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta",
  "theta", "vartheta", "iota", "kappa", "lambda", "mu", "nu", "xi",
  "rho", "varrho", "sigma", "varsigma", "upsilon", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Sigma", "Upsilon", "Phi", "Psi", "Omega",
];

/** Un solo carácter Unicode que vale por un nombre entero. */
export const UNICODE_A_NOMBRE: Readonly<Record<string, string>> = {
  "π": "pi", "τ": "tau", "φ": "phi", "ϕ": "phi", "θ": "theta", "ϑ": "theta",
  "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon",
  "λ": "lambda", "μ": "mu", "σ": "sigma", "ω": "omega", "Ω": "Omega",
  "ρ": "rho", "ψ": "psi", "χ": "chi", "η": "eta", "ξ": "xi",
};

/** Las seis trigonométricas DIRECTAS. Un argumento puramente numérico suyo se lee en GRADOS
 *  (`sin(45)` es el seno de 45°, no de 45 radianes). No es una convención que yo elegiría, pero
 *  es la que lleva el motor desde siempre y hay notas escritas contra ella.
 *
 *  La lista deja fuera a propósito las inversas —el argumento de `arcsin` no es un ángulo— y a
 *  las hiperbólicas —`sinh(30)` es 30, no 30°—. Es la misma frontera que traza
 *  `FUNCIONES_TRIG` en `src/constantes.ts`, de donde está copiada la regla. */
export const TRIG_DIRECTAS: readonly string[] = ["sin", "cos", "tan", "sec", "csc", "cot"];

/** Comandos que escriben el símbolo de grado. El carácter `°` lo emite el tokenizador con este
 *  mismo texto, así que aquí basta con los que se escriben como comando. */
export const GRADOS_POR_COMANDO: readonly string[] = ["degree", "deg"];

/** El símbolo de grado, tal y como lo emite el tokenizador. */
export const GRADO = "°";

/** Comandos que son un OPERADOR disfrazado. */
export const OPERADOR_POR_COMANDO: Readonly<Record<string, string>> = {
  cdot: "*", times: "*", div: "/", ast: "*",
  le: "<=", ge: ">=", leq: "<=", geq: ">=", ne: "!=", neq: "!=",
};

/** Comandos puramente tipográficos: no significan nada y se descartan al leer. Que la lista
 *  exista y esté aquí es la diferencia entre ignorarlos a propósito e ignorarlos por accidente. */
// OJO: las envolturas de NOMBRE (`\operatorname`, `\mathrm`, `\text`) NO están aquí, y no es un
// olvido. Se saltaban antes de llegar al analizador, y con ellas se saltaba el nombre que
// envuelven: `\operatorname{sech}(x)` se leía como seis símbolos sueltos multiplicados.
export const COMANDOS_IGNORADOS: readonly string[] = [
  "left", "right", "displaystyle", "textstyle", "limits", "nolimits",
  "quad", "qquad", "," , ";", ":", "!", " ", "\\",
  "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr",
];

/** Superíndices Unicode, para `x²` y `sin⁻¹`. */
export const SUPERINDICES: Readonly<Record<string, string>> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-", "⁺": "+",
};

/** Fracciones Unicode escritas como un solo carácter. */
export const FRACCIONES_UNICODE: Readonly<Record<string, [number, number]>> = {
  "½": [1, 2], "⅓": [1, 3], "⅔": [2, 3], "¼": [1, 4], "¾": [3, 4],
  "⅕": [1, 5], "⅖": [2, 5], "⅗": [3, 5], "⅘": [4, 5], "⅙": [1, 6], "⅚": [5, 6],
  "⅐": [1, 7], "⅛": [1, 8], "⅜": [3, 8], "⅝": [5, 8], "⅞": [7, 8], "⅑": [1, 9], "⅒": [1, 10],
};

/** La inversa de una trigonométrica, para `sin^{-1}` y `sin⁻¹`. `null` si esa función no tiene
 *  una inversa que se escriba así. */
export const INVERSA_DE: Readonly<Record<string, string>> = {
  sin: "asin", cos: "acos", tan: "atan", sec: "asec", csc: "acsc", cot: "acot",
  sinh: "asinh", cosh: "acosh", tanh: "atanh",
};
