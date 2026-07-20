import { FUNCIONES_TRIG } from "./constantes";

// ─────────────────────────────────────────────
// Utilidades de texto / parsing
// ─────────────────────────────────────────────

/** Devuelve el índice del ')' que cierra el '(' en `inicio`. -1 si no se encuentra. */
function encontrarParentesisCierre(texto: string, inicio: number): number {
  let profundidad = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === "(") profundidad++;
    else if (texto[i] === ")") {
      profundidad--;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

/** Como encontrarParentesisCierre pero para llaves `{` `}`. -1 si no cierra. */
function encontrarLlaveCierre(texto: string, inicio: number): number {
  let profundidad = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === "{") profundidad++;
    else if (texto[i] === "}") {
      profundidad--;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

/**
 * Convierte `\frac{NUM}{DEN}` a `(NUM)/(DEN)` respetando llaves balanceadas y
 * fracciones/exponentes anidados. La versión anterior usaba una regex plana
 * `\\frac\{([^}]+)\}\{([^}]+)\}` que cortaba el numerador en la primera `}`
 * interna (p.ej. la del exponente en `\frac{x^{2}-1}{x-1}`), dejaba `\frac` sin
 * convertir y mathjs fallaba con "Unexpected operator {".
 *
 * Produce paréntesis SIMPLES `(NUM)/(DEN)` (no `((NUM)/(DEN))`) a propósito: la
 * regex de exponentes-fraccionarios que corre justo después espera ese formato
 * para reconocer `x^{\frac{1}{2}}` → `x^{(1)/(2)}` como raíz.
 */
function convertirFracciones(expr: string): string {
  let idx = expr.indexOf("\\frac{");
  while (idx !== -1) {
    const inicioNum = idx + 5;               // la '{' del numerador (\frac = 5 chars)
    const finNum = encontrarLlaveCierre(expr, inicioNum);
    if (finNum === -1) break;                // sin cierre: se deja igual
    if (expr[finNum + 1] !== "{") {          // denominador no contiguo: no es \frac válido
      idx = expr.indexOf("\\frac{", idx + 1);
      continue;
    }
    const inicioDen = finNum + 1;
    const finDen = encontrarLlaveCierre(expr, inicioDen);
    if (finDen === -1) break;

    const num = convertirFracciones(expr.slice(inicioNum + 1, finNum));
    const den = convertirFracciones(expr.slice(inicioDen + 1, finDen));
    expr = expr.slice(0, idx) + `(${num})/(${den})` + expr.slice(finDen + 1);
    idx = expr.indexOf("\\frac{", idx);
  }
  return expr;
}

/**
 * Si el argumento es un NÚMERO puro lo convierte a radianes añadiendo `*pi/180`;
 * en caso contrario lo devuelve sin cambios. "Número" incluye la FRACCIÓN de
 * literales (`\sin(\frac{45}{2})` llega como `(45)/(2)` = 22.5°): expresa el mismo
 * número que su decimal, que SÍ convertía — sin esta rama, `\sin(22.5)` era grados
 * pero `\sin(\frac{45}{2})` radianes. Un símbolo (pi, x) lo descarta.
 */
function argumentoTrigonometrico(arg: string): string {
  const NUM = "[+-]?\\(?[+-]?\\d+(\\.\\d+)?\\)?";
  return new RegExp(`^${NUM}(/${NUM})?$`).test(arg.trim())
    ? arg.trim() + "*pi/180"
    : arg.trim();
}

/** Reescribe los argumentos numéricos de funciones trigonométricas a radianes. */
function normalizarTrigonometria(expr: string): string {
  let resultado = expr;

  for (const fn of FUNCIONES_TRIG) {
    let desde = 0;
    while (desde < resultado.length) {
      const idx = resultado.indexOf(fn + "(", desde);
      if (idx === -1) break;

      // Evita casar `sin(` DENTRO de `asin(`, `cos(` dentro de `acos(`, etc.: el
      // argumento de una inversa es un cociente, no grados, y no debe pasar a
      // radianes. Si hay una letra justo antes, no es una llamada trig directa.
      if (idx > 0 && /[a-zA-Z]/.test(resultado[idx - 1])) {
        desde = idx + fn.length + 1;
        continue;
      }

      const inicioArg = idx + fn.length;
      const finArg = encontrarParentesisCierre(resultado, inicioArg);
      if (finArg === -1) break; // paréntesis no balanceado; se detiene sin lanzar

      const arg = resultado.slice(inicioArg + 1, finArg);
      const argNorm = argumentoTrigonometrico(arg);
      resultado =
        resultado.slice(0, inicioArg + 1) + argNorm + resultado.slice(finArg);
      desde = inicioArg + argNorm.length + 2;
    }
  }

  return resultado;
}

/**
 * Convierte exponentes `^{...}` a `^(...)` respetando llaves balanceadas y
 * exponentes anidados (p.ej. `x^{3^{\pi}}` → `x^(3^(\pi))`). La versión anterior
 * usaba una regex plana `\^\{([^}]+)\}` que cortaba en la primera `}` y dejaba
 * llaves descuadradas (`x^(3^{pi)}`), que mathjs interpretaba como objeto.
 */
function convertirExponentes(expr: string): string {
  let out = "";
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "^" && expr[i + 1] === "{") {
      let profundidad = 0;
      let j = i + 1;
      for (; j < expr.length; j++) {
        if (expr[j] === "{") profundidad++;
        else if (expr[j] === "}") {
          profundidad--;
          if (profundidad === 0) break;
        }
      }
      if (profundidad !== 0) { out += expr[i]; continue; } // sin cierre: se deja igual
      out += "^(" + convertirExponentes(expr.slice(i + 2, j)) + ")";
      i = j; // salta hasta la `}` de cierre
    } else {
      out += expr[i];
    }
  }
  return out;
}

/**
 * Convierte cada `\comando{ARG}` en `envolver(ARG)` respetando llaves
 * balanceadas, de modo que ARG pueda contener llaves anidadas (otro comando, un
 * exponente `^{…}`, una raíz, etc.). Sustituye a la regex plana
 * `\\comando\{([^{}]+)\}`, que cortaba ARG en la primera `}` interna y dejaba el
 * comando a medio convertir (mathjs fallaba con "Unexpected operator {" o
 * "Parenthesis ) expected"). Usado por `\ln{…}` y `\log{…}`.
 */
function reemplazarComandoLlaves(
  expr: string,
  comando: string,
  envolver: (arg: string) => string,
): string {
  const marca = `\\${comando}{`;
  let idx = expr.indexOf(marca);
  while (idx !== -1) {
    const inicioLlave = idx + marca.length - 1; // posición de la '{'
    const fin = encontrarLlaveCierre(expr, inicioLlave);
    if (fin === -1) break;                       // sin cierre: se deja igual
    const reemplazo = envolver(expr.slice(inicioLlave + 1, fin));
    expr = expr.slice(0, idx) + reemplazo + expr.slice(fin + 1);
    idx = expr.indexOf(marca, idx + reemplazo.length);
  }
  return expr;
}

// Envoltorios TIPOGRÁFICOS de LaTeX: no aportan matemática, solo cómo se ve el texto.
// `\operatorname{sech}`/`\mathrm{e}` se desenvuelven (su contenido SÍ es matemática: un
// nombre de función o una constante); `\text{…}` es prosa y se BORRA con su contenido.
// Sin esto, el barrido residual de comandos los degradaba a sopa de letras: `\mathrm{e}`
// → `m*a*t*h*r*m{e}` → símbolos libres → NaN en todo x (una gráfica vacía, en silencio).
const ENVOLTORIOS_DESENVUELVEN = ["operatorname", "mathrm", "mathbf", "mathit", "mathsf", "boldsymbol"];
const ENVOLTORIOS_BORRAN = ["text", "textrm", "textit", "mbox", "label"];

function quitarEnvoltoriosTipograficos(expr: string): string {
  for (const cmd of ENVOLTORIOS_DESENVUELVEN) expr = reemplazarComandoLlaves(expr, cmd, (a) => a);
  for (const cmd of ENVOLTORIOS_BORRAN) expr = reemplazarComandoLlaves(expr, cmd, () => "");
  return expr;
}

// Símbolos LaTeX/Unicode con equivalente DIRECTO en mathjs. Se resuelven antes del barrido
// residual de comandos (`\\cmd` → `cmd`), que de otro modo los convierte en identificadores
// que el producto implícito parte letra a letra (`\times` → `t*i*m*e*s`): la expresión
// evalúa NaN en todo x y el plano sale vacío SIN error. Los guiones tipográficos (−, –, —)
// son el caso más insidioso: se cuelan al copiar de Word/Wikipedia y parecen un menos.
const SIMBOLOS_DIRECTOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[−‒–—]/g, "-"],           // − – — (menos y guiones tipográficos)
  [/\\times|\\ast|\\star|\\bullet/g, "*"],
  [/\\div/g, "/"],
  [/\\infty/g, "Infinity"],                        // el Unicode ∞ ya se traduce aparte
  [/°|\\degree|\\deg/g, "*(pi/180)"],              // grados → radianes (30° = 30·π/180)
  [/\\lvert|\\rvert|\\vert|\\mid/g, "|"],          // valor absoluto en su forma con comando
  [/\\,|\\;|\\:|\\!|\\quad|\\qquad|\\ /g, " "],    // espaciados: no son matemática
  [/\\displaystyle|\\textstyle|\\limits|\\nolimits/g, ""], // directivas de composición
];

/**
 * Convierte `\sqrt[n]{ARG}` → `nthRoot(ARG,n)` y `\sqrt{ARG}` → `sqrt(ARG)`
 * respetando llaves balanceadas, de modo que el radicando ARG pueda contener
 * llaves anidadas (otra raíz, un `\log{…}` ya convertido, un exponente, etc.).
 * La versión anterior usaba regex planas `\{([^}]+)\}` que cortaban el radicando
 * en la primera `}` interna y producían paréntesis descuadrados (mathjs fallaba
 * con "Parenthesis ) expected"). Recursiva para raíces anidadas. Para índices
 * impares con radicando negativo nthRoot da la raíz real (∛-8 = -2).
 */
function convertirRaices(expr: string): string {
  let idx = expr.indexOf("\\sqrt");
  while (idx !== -1) {
    let i = idx + 5;                 // posición tras "\sqrt"
    let indice: string | null = null;
    if (expr[i] === "[") {           // índice n del radical: \sqrt[n]{…}
      const cierre = expr.indexOf("]", i);
      if (cierre === -1) break;
      indice = expr.slice(i + 1, cierre).trim();
      i = cierre + 1;
    }
    if (expr[i] !== "{") {           // \sqrt sin radicando en llaves: se omite
      idx = expr.indexOf("\\sqrt", i);
      continue;
    }
    const fin = encontrarLlaveCierre(expr, i);
    if (fin === -1) break;           // sin cierre: se deja igual
    const arg = convertirRaices(expr.slice(i + 1, fin)); // raíces anidadas
    const reemplazo =
      indice === null ? `sqrt(${arg})` : `nthRoot(${arg},${indice})`;
    expr = expr.slice(0, idx) + reemplazo + expr.slice(fin + 1);
    idx = expr.indexOf("\\sqrt", idx + reemplazo.length);
  }
  return expr;
}

/**
 * Convierte un PAR de delimitadores LaTeX a una llamada de función mathjs:
 * `\lfloor …\rfloor` → `floor(…)` y `\lceil …\rceil` → `ceil(…)`. Cada apertura
 * casa con SU cierre contando profundidad (los pares se anidan: ⌊x+⌊y⌋⌋), y el
 * interior se reprocesa con `convertirPisoTecho` para resolver pisos dentro de
 * techos y viceversa. Un delimitador sin pareja deja la expresión intacta (la
 * entrada ya era inválida; no se intenta adivinar).
 */
function convertirParDelimitado(
  expr: string,
  abre: string,
  cierra: string,
  fn: string,
): string {
  let idx = expr.indexOf(abre);
  while (idx !== -1) {
    let profundidad = 0;
    let j = idx;
    let fin = -1;
    while (j < expr.length) {
      if (expr.startsWith(abre, j)) { profundidad++; j += abre.length; continue; }
      if (expr.startsWith(cierra, j)) {
        profundidad--;
        if (profundidad === 0) { fin = j; break; }
        j += cierra.length;
        continue;
      }
      j++;
    }
    if (fin === -1) break; // sin cierre: se deja igual
    const arg = convertirPisoTecho(expr.slice(idx + abre.length, fin));
    const reemplazo = `${fn}(${arg})`;
    expr = expr.slice(0, idx) + reemplazo + expr.slice(fin + cierra.length);
    idx = expr.indexOf(abre, idx + reemplazo.length);
  }
  return expr;
}

/**
 * Piso y techo LaTeX → funciones mathjs (`floor`/`ceil`, que mathjs evalúa
 * nativas). Debe correr DESPUÉS de eliminar `\left`/`\right` (así
 * `\left\lfloor …\right\rfloor` ya llegó como `\lfloor …\rfloor`) y ANTES del
 * barrido de comandos residuales (que degradaría `\lfloor` a un identificador
 * `lfloor` sin sentido).
 */
function convertirPisoTecho(expr: string): string {
  expr = convertirParDelimitado(expr, "\\lfloor", "\\rfloor", "floor");
  expr = convertirParDelimitado(expr, "\\lceil", "\\rceil", "ceil");
  return expr;
}

/** Último carácter no-espacio de `s`, o "" si no hay ninguno. */
function ultimoNoEspacio(s: string): string {
  for (let i = s.length - 1; i >= 0; i--) if (s[i] !== " ") return s[i];
  return "";
}

/**
 * Convierte barras de valor absoluto `|…|` a `abs(…)`. Las barras son ambiguas
 * (la misma `|` abre y cierra), así que NO se usan regex: se recorre la cadena
 * llevando una pila de `abs(` abiertos. Una `|` CIERRA cuando hay uno abierto y
 * el carácter significativo previo termina un operando (letra, dígito, `)`, `]`,
 * `}`, `.`); en cualquier otro caso ABRE. Esto resuelve casos con paréntesis,
 * fracciones internas e incluso anidados como `||x|-1|` → `abs(abs(x)-1)`.
 *
 * Debe ejecutarse DESPUÉS de eliminar `\left`/`\right` (así `\left|…\right|` ya
 * llegó como `|…|`) y ANTES de convertir fracciones (el cierre se apoya en la
 * `}` de `\frac{…}{…}`). Si las barras quedan desbalanceadas la entrada es
 * ambigua y se devuelve sin tocar para no corromperla.
 */
function convertirValorAbsoluto(expr: string): string {
  if (!expr.includes("|")) return expr;
  const totalBarras = (expr.match(/\|/g) || []).length;
  if (totalBarras % 2 !== 0) return expr;

  let out = "";
  const pila: number[] = [];
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c !== "|") { out += c; continue; }
    const prev = ultimoNoEspacio(out);
    const cierraOperando = prev !== "" && /[A-Za-z0-9.)\]}]/.test(prev);
    if (pila.length > 0 && cierraOperando) { pila.pop(); out += ")"; }
    else { pila.push(i); out += "abs("; }
  }
  return pila.length === 0 ? out : expr;
}

/**
 * Normaliza las seis trigonométricas inversas a los nombres internos que MathJS
 * (o los wrappers de FUNCIONES_INVERSAS_EXTRA) entienden:
 *   arcsin / sin⁻¹ / sin^{-1} → asin   (idem cos, tan, csc, sec, cot)
 * Cubre la forma `arc…`, el superíndice Unicode `⁻¹` y el `^{-1}`/`^-1` de LaTeX.
 * Debe correr ANTES de normalizarTrigonometria (radianes) y del barrido de
 * comandos LaTeX residuales, que convierte `\arcsin`→`arcsin`→`asin`.
 */
function normalizarFuncionesInversas(expr: string): string {
  const t = "sin|cos|tan|csc|sec|cot";
  expr = expr.replace(new RegExp(`(${t})\\s*⁻¹`, "g"), "a$1");
  // `-1` en cualquier grafía de exponente: `^{-1}`, `^-1`, `^(-1)` (esta última la produce
  // convertirSuperindices al pasar el `⁻¹` de `sin⁻¹` a ASCII antes de llegar aquí).
  expr = expr.replace(new RegExp(`(${t})\\s*\\^\\(?\\{?\\s*-\\s*1\\s*\\}?\\)?`, "g"), "a$1");
  expr = expr.replace(new RegExp(`\\barc(${t})\\b`, "g"), "a$1");
  // Argumento en llaves LaTeX: `\arctan{x}` ya quedó como `\atan{x}`; aquí su
  // `{…}` pasa a `(…)`. Las trig DIRECTAS tienen su propia regla más abajo, pero
  // las inversas no entran en ese patrón, así que sin esto MathJS veía `atan{x}`
  // y fallaba ("Unexpected operator {"). Usa llaves balanceadas para no cortar un
  // `\frac` interno; convertirFracciones lo resuelve después.
  for (const fn of ["asin", "acos", "atan", "acsc", "asec", "acot"]) {
    let desde = 0;
    let idx: number;
    while ((idx = expr.indexOf(fn + "{", desde)) !== -1) {
      const prev = idx > 0 ? expr[idx - 1] : "";
      if (/[A-Za-z0-9]/.test(prev)) { desde = idx + fn.length; continue; } // sufijo de otro id
      const inicioLlave = idx + fn.length;
      const fin = encontrarLlaveCierre(expr, inicioLlave);
      if (fin === -1) break; // sin cierre: se deja igual
      expr =
        expr.slice(0, inicioLlave) + "(" + expr.slice(inicioLlave + 1, fin) +
        ")" + expr.slice(fin + 1);
      desde = fin + 1;
    }
  }
  return expr;
}

// Nombres de función a los que aplica `func^n(arg)` → `(func(arg))^n`. Longest-first
// para casar `sinh` antes que `sin`, `cosh` antes que `cos`, etc.
const FUNCIONES_POTENCIA = [
  "sinh", "cosh", "tanh", "coth", "sech", "csch",
  "sin", "cos", "tan", "sec", "csc", "cot", "log", "ln",
];

/**
 * Intenta casar `\?func ^ exp (arg)` empezando en `expr[i]`. Devuelve las partes y el
 * índice tras el `)` del argumento, o null. El argumento DEBE ir agrupado en `(…)`
 * (las trig exigen agrupación clara), así se distingue `tan^n(x)` de `tan(x^n)`.
 */
function casarPotenciaFuncion(
  expr: string, i: number
): { func: string; exp: string; arg: string; fin: number } | null {
  const backslash = expr[i] === "\\";
  // Sin backslash: no empezar DENTRO de un identificador (evita casar el `tan` de `atan`).
  if (!backslash && i > 0 && /[A-Za-z0-9_]/.test(expr[i - 1])) return null;
  const j = backslash ? i + 1 : i;
  const func = FUNCIONES_POTENCIA.find(
    (n) => expr.startsWith(n, j) && !/[A-Za-z0-9_]/.test(expr[j + n.length] ?? "")
  );
  if (!func) return null;
  let k = j + func.length;
  while (expr[k] === " ") k++;
  if (expr[k] !== "^") return null;              // el `^` va ENTRE la función y el `(arg)`
  k++;
  while (expr[k] === " ") k++;
  // Exponente: `{…}` balanceado (se conserva; convertirExponentes lo pasa a `(…)`), o
  // un token suelto (número/símbolo, con signo opcional).
  let exp: string;
  if (expr[k] === "{") {
    const fin = encontrarLlaveCierre(expr, k);
    if (fin === -1) return null;
    exp = expr.slice(k, fin + 1);
    k = fin + 1;
  } else {
    const s = k;
    if (expr[k] === "+" || expr[k] === "-") k++;
    while (k < expr.length && /[A-Za-z0-9.]/.test(expr[k])) k++;
    if (k === s) return null;
    exp = expr.slice(s, k);
  }
  while (expr[k] === " ") k++;
  // Argumento AGRUPADO obligatorio (así se distingue `tan^n(x)` de `tan(x^n)`), en `(…)` o en
  // `{…}`: la agrupación con llaves es la que emite KaTeX/MathLive al escribir la potencia en el
  // editor (`\sin^{2}{\left(3\theta\right)}`). Sin la rama de llaves, el `{` frenaba el casado y
  // la expresión salía cruda (`sin^(2){(3*theta)}`) → basura que ni grafica ni pinta.
  if (expr[k] === "{") {
    const fin = encontrarLlaveCierre(expr, k);
    if (fin === -1) return null;
    return { func, exp, arg: expr.slice(k + 1, fin), fin: fin + 1 };
  }
  if (expr[k] === "(") {
    const fin = encontrarParentesisCierre(expr, k);
    if (fin === -1) return null;
    return { func, exp, arg: expr.slice(k + 1, fin), fin: fin + 1 };
  }
  // Argumento SIN agrupar: una LETRA suelta (`\sin^2 x`) o un comando griego (`\cos^2\theta`).
  // A diferencia de `tan^n(x)` vs `tan(x^n)`, aquí NO hay ambigüedad —el exponente ya quedó
  // fijado ANTES del argumento—, así que no se exige agrupación. La notación estándar
  // `\sin^2 x + \cos^2 x` (identidad pitagórica) dependía de esto: sin ella, el nombre quedaba
  // suelto (`sin^2 *x`) y `sin` se leía como variable libre. Solo una letra AISLADA (no una
  // corrida `xy`, ambigua entre (sin x)²·y y sin(xy)): esa se deja al resto del pipeline.
  const griego = /^\\(theta|pi|tau|phi)\b/.exec(expr.slice(k));
  if (griego) return { func, exp, arg: griego[1], fin: k + griego[0].length };
  if (/[a-zA-Z]/.test(expr[k] ?? "") && !/[a-zA-Z0-9]/.test(expr[k + 1] ?? ""))
    return { func, exp, arg: expr[k], fin: k + 1 };
  return null;
}

/**
 * Reescribe `func^n(arg)` (POTENCIA de una función) a `(func(arg))^n`, eliminando la
 * ambigüedad con `func(arg^n)` (función aplicada a una potencia):
 *   `\tan^{2}(x)` → `(tan(x))^{2}`  (AST: pow(tan(x), 2))
 *   `\tan(x^2)`   → intacto          (AST: tan(pow(x, 2)) — el `^` está DENTRO del `(…)`)
 * Debe correr DESPUÉS de normalizar las inversas (`\tan^{-1}` ya es `atan`, así el −1 no
 * se trata como potencia) y ANTES de convertirExponentes (que procesará el `^{n}` emitido).
 * El argumento se procesa recursivamente (potencias de función anidadas) y el backslash
 * de la función se descarta. Sin `(arg)` agrupado tras el exponente, no se reescribe.
 */
function convertirPotenciaFuncion(expr: string): string {
  let out = "";
  let i = 0;
  while (i < expr.length) {
    const m = casarPotenciaFuncion(expr, i);
    if (m) {
      out += `(${m.func}(${convertirPotenciaFuncion(m.arg)}))^${m.exp}`;
      i = m.fin;
    } else {
      out += expr[i];
      i++;
    }
  }
  return out;
}

// Raíces Unicode → su índice: √ cuadrada (sqrt), ∛ cúbica y ∜ cuarta (nthRoot para
// obtener la raíz REAL con radicando negativo en índice impar y renderizar `\sqrt[n]{}`).
const RAICES_UNICODE: Record<string, number> = { "√": 2, "∛": 3, "∜": 4 };

/**
 * Raíces Unicode (`√`, `∛`, `∜`) → `sqrt(...)` / `nthRoot(...,n)`. Si sigue un paréntesis
 * (`√(x+1)`) el radicando ya está agrupado; SIN paréntesis, el radical cubre el FACTOR
 * siguiente y hay que ENVOLVERLO: un reemplazo textual `√`→`sqrt` deja `√x`→`sqrtx`, y el
 * producto implícito (que reconoce `sqrt` como átomo) lo parte en `sqrt*x` (raíz POR x, no
 * raíz DE x). El factor es un número (`√2`, `√2.5`), una corrida de letras —variable o
 * constante `√pi`— o ese factor con su potencia inmediata (`√x²`, `√x^{3}`), de modo que
 * el exponente quede DENTRO del radical (`sqrt(x^2)`=|x|, no `sqrt(x)^2`). Se ejecuta tras
 * `π→pi` (así `√π` ve la constante ya como letras) y antes de la conversión de
 * superíndices y del producto implícito (los paréntesis insertados los protegen).
 */
function convertirRaicesUnicode(expr: string): string {
  const esLetra = (c: string): boolean => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
  const esDigito = (c: string): boolean => c >= "0" && c <= "9";
  // Grupo balanceado open…close desde p (incluidos los delimitadores) → [texto, finExcl].
  const grupo = (p: number, open: string, close: string): [string, number] => {
    let prof = 0, s = "";
    for (; p < expr.length; p++) {
      s += expr[p];
      if (expr[p] === open) prof++;
      else if (expr[p] === close && --prof === 0) return [s, p + 1];
    }
    return [s, p];
  };
  const raiz = (radicando: string, n: number): string =>
    n === 2 ? `sqrt(${radicando})` : `nthRoot(${radicando},${n})`;
  let out = "";
  let i = 0;
  while (i < expr.length) {
    const n = RAICES_UNICODE[expr[i]];
    if (n === undefined) { out += expr[i++]; continue; }
    i++;                                     // consume el símbolo de raíz
    while (expr[i] === " ") i++;
    // Signo del radicando SIN paréntesis (`∛-8`=−2): se consume solo si delante de un
    // operando real (número/letra/paréntesis), no de un operador suelto.
    let signo = "";
    if (expr[i] === "-" || expr[i] === "+") {
      let k = i + 1; while (expr[k] === " ") k++;
      if (expr[k] === "(" || esLetra(expr[k]) || esDigito(expr[k])) { signo = expr[i] === "-" ? "-" : ""; i = k; }
    }
    if (expr[i] === "(") {                    // radicando ya entre paréntesis
      let g: string; [g, i] = grupo(i, "(", ")");
      out += raiz(signo + g.slice(1, -1), n);
      continue;
    }
    // Base del radicando: número (con decimales) o corrida de letras.
    const inicio = i;
    if (esDigito(expr[i])) {
      while (i < expr.length && esDigito(expr[i])) i++;
      if (expr[i] === "." && esDigito(expr[i + 1])) { i++; while (i < expr.length && esDigito(expr[i])) i++; }
    } else if (esLetra(expr[i])) {
      while (i < expr.length && esLetra(expr[i])) i++;
    }
    if (i === inicio) { out += n === 2 ? "sqrt" : "cbrt"; continue; } // nada que envolver
    let radicando = signo + expr.slice(inicio, i);
    // Potencia inmediata DENTRO del radical: superíndice Unicode (`√x²`, `√x⁴`) o
    // `^{…}` / `^(…)` / `^token`, para que el exponente quede bajo el radical.
    if (SUPERINDICES[expr[i]] !== undefined) {
      while (i < expr.length && SUPERINDICES[expr[i]] !== undefined) { radicando += expr[i]; i++; }
    } else if (expr[i] === "^") {
      i++;
      let exp: string;
      if (expr[i] === "{") { [exp, i] = grupo(i, "{", "}"); }
      else if (expr[i] === "(") { [exp, i] = grupo(i, "(", ")"); }
      else { const s = i; while (i < expr.length && (esLetra(expr[i]) || esDigito(expr[i]) || expr[i] === ".")) i++; exp = expr.slice(s, i); }
      radicando += "^" + exp;
    }
    out += raiz(radicando, n);
  }
  return out;
}

// Superíndices Unicode → dígitos/signo ASCII para reconstruir el exponente `^(…)`.
const SUPERINDICES: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5",
  "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+",
};

/**
 * Superíndices Unicode → exponente ASCII: una corrida de `⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺` pasa a `^N`
 * (positivos, forma que ya usaban `²`→`^2` y `³`→`^3`) o `^(±N)` cuando lleva signo
 * (`x⁻¹`→`x^(-1)`, para que MathJS no tropiece con `^-1`). Cubre TODO el rango, no solo
 * ²/³: antes `x⁴`, `x⁵`, `x⁻¹`… quedaban sin convertir y MathJS fallaba. Corre antes de
 * las inversas trig, que consumen el `⁻¹` PEGADO a una trig (`sin⁻¹`) por su propia vía.
 */
function convertirSuperindices(expr: string): string {
  return expr.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (run) => {
    const ascii = [...run].map((c) => SUPERINDICES[c]).join("");
    return /^[0-9]+$/.test(ascii) ? `^${ascii}` : `^(${ascii})`;
  });
}

// Fracciones Unicode "vulgares" → su cociente entre paréntesis (`½`→`(1/2)`). Un número
// pegado delante las MULTIPLICA vía producto implícito (`3½`→`3*(1/2)`), no las mezcla.
const FRACCIONES_UNICODE: Record<string, string> = {
  "½": "(1/2)", "⅓": "(1/3)", "⅔": "(2/3)", "¼": "(1/4)", "¾": "(3/4)",
  "⅕": "(1/5)", "⅖": "(2/5)", "⅗": "(3/5)", "⅘": "(4/5)", "⅙": "(1/6)",
  "⅚": "(5/6)", "⅐": "(1/7)", "⅛": "(1/8)", "⅜": "(3/8)", "⅝": "(5/8)",
  "⅞": "(7/8)", "⅑": "(1/9)", "⅒": "(1/10)",
};

// ── Doble signo (± ∓) ────────────────────────────────────────────────────────
//
// `±` no es un valor: es una FAMILIA de dos expresiones (`y=±√(4−x²)` es la circunferencia
// entera, no media). Se representa con los centinelas unarios `pm(u)`/`mp(u)` —los mismos
// que ya emitía `despejar.ts` para pintar `\pm` (latex.ts)—, ahora con las tres piezas que
// les faltaban para ser de verdad: se EVALÚAN (rama principal: pm(u)=+u, mp(u)=−u; ver
// constantes.ts) y el motor los EXPANDE en las dos ramas reales (motor/parsing/dobleSigno).
// Los signos de una misma expresión están CORRELACIONADOS (convención de LaTeX): en la
// rama +, todo `±` es + y todo `∓` es −; en la rama −, al revés. Por eso son dos ramas, no 2ⁿ.

/** ¿El carácter no-espacio anterior a `i` deja el `+`/`-` de `i` en posición UNARIA? */
function anteriorNoEspacio(expr: string, i: number): string {
  let j = i - 1;
  while (j >= 0 && expr[j] === " ") j--;
  return j >= 0 ? expr[j] : "";
}

/**
 * Fin del OPERANDO de un `±` que empieza en `desde`. El `±` de LaTeX tiene la precedencia
 * del `+`: afecta al término entero que le sigue (`±2x` = ±(2·x)), no solo al primer factor,
 * y termina en el siguiente `+`/`-` BINARIO de nivel 0 (`±x+1` = (±x)+1). Los paréntesis y
 * llaves se saltan como bloque, así que un `-` interior (`±√(4-x²)`) no corta.
 */
function finDeOperandoSigno(expr: string, desde: number): number {
  let i = desde;
  while (i < expr.length && expr[i] === " ") i++;
  const inicio = i;
  let prof = 0;
  for (; i < expr.length; i++) {
    const c = expr[i];
    if (c === "(" || c === "{" || c === "[") { prof++; continue; }
    if (c === ")" || c === "}" || c === "]") { if (prof === 0) break; prof--; continue; }
    if (prof > 0) continue;
    if (c === "," || c === "=" || c === "<" || c === ">") break;
    if ((c === "+" || c === "-") && i > inicio) {
      // Binario (corta el operando) solo si NO viene tras otro operador (`x^-1`, `2*-3`).
      const ant = anteriorNoEspacio(expr, i);
      if (!"+-*/^(,".includes(ant)) break;
    }
  }
  return i;
}

/** `\pm u` / `±u` → `pm(u)`, `\mp u` / `∓u` → `mp(u)`, con el operando delimitado por la
 *  precedencia del signo. Si el `±` sigue a un término (`1 \pm x`), se emite como SUMA del
 *  centinela (`1 + pm(x)`): es la forma que `latex.ts` vuelve a pintar como `1 \pm x`. */
function convertirDobleSigno(expr: string): string {
  const marca = /\\pm|\\mp|±|∓/;
  for (let m = marca.exec(expr); m; m = marca.exec(expr)) {
    const idx = m.index;
    const fn = m[0] === "\\pm" || m[0] === "±" ? "pm" : "mp";
    const fin = finDeOperandoSigno(expr, idx + m[0].length);
    const operando = expr.slice(idx + m[0].length, fin).trim() || "1"; // `±` suelto = ±1
    const ant = anteriorNoEspacio(expr, idx);
    const suma = ant !== "" && !"+-*/^(,=<>[{".includes(ant) ? "+" : "";
    expr = expr.slice(0, idx) + `${suma}${fn}(${operando})` + expr.slice(fin);
  }
  return expr;
}

/** Convierte sintaxis LaTeX/Unicode a sintaxis que MathJS pueda evaluar. */
export function normalizarEntrada(raw: string): string {
  let expr = raw;

  // — Unicode y operadores simbólicos —
  expr = expr.replace(/π/g, "pi");
  // θ Unicode → theta: la polar compila contra la variable `theta` (parametrizacionMathjs);
  // sin esta traducción, `r=sin(3θ)` dejaba una `θ` libre → NaN en todo θ → plano vacío.
  expr = expr.replace(/[θϑ]/g, "theta");
  expr = convertirRaicesUnicode(expr); // √x/∛x/∜x → sqrt/nthRoot(...) (envuelve el factor)
  expr = expr.replace(/[·×]/g, "*");
  expr = expr.replace(/÷/g, "/");
  // Fracciones vulgares (½, ⅓, ¼…) antes de los superíndices (no comparten glifos).
  expr = expr.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]/g, (c) => FRACCIONES_UNICODE[c]);
  // Superíndices Unicode → `^N` / `^(±N)`: cubre TODO el rango (antes solo ²/³; `x⁴`,
  // `x⁻¹`… fallaban). Las raíces ya consumieron el superíndice PEGADO a su radicando.
  expr = convertirSuperindices(expr);
  expr = expr.replace(/∞/g, "Infinity");
  // Piso y techo Unicode → sus comandos LaTeX (convertirPisoTecho los resuelve
  // en bloque, con el mismo emparejamiento anidado que la forma \lfloor…\rfloor).
  expr = expr.replace(/⌊/g, "\\lfloor ").replace(/⌋/g, "\\rfloor ");
  expr = expr.replace(/⌈/g, "\\lceil ").replace(/⌉/g, "\\rceil ");

  // — Símbolos con equivalente directo (\times, \div, \infty, menos tipográfico…) y
  //   envoltorios tipográficos (\operatorname{sech}, \mathrm{e}, \text{…}) —
  //   Antes del barrido residual de comandos, que si no los degrada a sopa de letras.
  for (const [re, a] of SIMBOLOS_DIRECTOS) expr = expr.replace(re, a);
  expr = quitarEnvoltoriosTipograficos(expr);

  // — Doble signo ± ∓ → centinelas pm(u)/mp(u) (dos ramas; ver convertirDobleSigno) —
  //   Aquí, con la expresión aún en LaTeX: los grupos `{}`/`()` siguen balanceados y el
  //   operando del signo (`\pm\frac{1}{2}`, `\pm\sqrt{4-x^2}`) se delimita entero.
  expr = convertirDobleSigno(expr);

  // — Delimitadores LaTeX —
  expr = expr.replace(/\\left/g, "");
  expr = expr.replace(/\\right/g, "");

  // — Piso y techo: \lfloor…\rfloor → floor(…), \lceil…\rceil → ceil(…) —
  //   (tras quitar \left/\right; antes del barrido residual de comandos)
  expr = convertirPisoTecho(expr);

  // — Valor absoluto |…| → abs(…) (tras quitar \left/\right, antes de \frac) —
  expr = convertirValorAbsoluto(expr);

  // — Trigonométricas inversas (arcsin / sin⁻¹ / sin^{-1} → asin, …) —
  expr = normalizarFuncionesInversas(expr);

  // — Potencia de función `func^n(arg)` → `(func(arg))^n` (tras las inversas, para no
  //   tomar el −1 como potencia; antes de convertirExponentes, que procesa el `^{n}`) —
  expr = convertirPotenciaFuncion(expr);

  // — Fracciones LaTeX (antes de otros reemplazos) —
  expr = expr.replace(
    /\(\s*\{\\frac\{([^}]+)\}\{([^}]+)\}\s*\}\s*\)/g,
    "(($1)/($2))"
  );
  expr = expr.replace(/\(\s*\{([^{}]+)\}\s*\)/g, "($1)");
  expr = convertirFracciones(expr);

  // — Exponentes fraccionarios como raíces: x^{m/n} → nthRoot(x^m, n) (= ⁿ√xᵐ).
  //   También cubre x^{\frac{m}{n}} (ya convertido a `(m)/(n)` arriba: por eso los
  //   paréntesis del índice y exponente son opcionales en la regex). Debe ir ANTES
  //   de convertirExponentes (que transforma `^{…}` en `^(…)`).
  //   Se usa nthRoot, no x^(m/n), para obtener la raíz REAL con base negativa
  //   donde está definida (p.ej. ∛x², x^{2/3} en x<0) en vez de un complejo/NaN,
  //   y para que se renderice como radical `\sqrt[n]{x^m}`. Casos:
  //     m=1 → radicando = base (sin `^1`);  n=2 → sqrt() para que salga `\sqrt{…}`
  //     sin el índice "2".
  // La base-paréntesis `(…)` lleva un lookbehind `(?<![a-zA-Z])`: sin él, en `x(x+1)^{1/2}`
  // (un producto implícito `x·(x+1)^{1/2}`) la alternativa casaría el `(x+1)` como base con la
  // `x` COLGANDO delante y perdería la multiplicación. Con el lookbehind, un `(…)` pegado a una
  // letra NO se toma por base aquí. La EXCEPCIÓN es una LLAMADA A FUNCIÓN real (`abs(y)`, tras
  // convertir `|y|`; `sin(x)`, `sqrt(u)`…): ahí el `(…)` sí es un argumento y toda la llamada es
  // la base, así que `|y|^{1/2}` → `sqrt(abs(y))` (`\sqrt{|y|}`) en vez de quedar como
  // `abs(y)^(1/2)` (`{|y|}^{1/2}`). La alternativa de función va PRIMERA (más específica) y se
  // restringe a nombres de función CONOCIDOS —nunca a `x(x+1)`, que es producto implícito—.
  const FUNC_BASE = "abs|sqrt|cbrt|sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|" +
    "asin|acos|atan|asec|acsc|acot|log|ln|exp";
  expr = expr.replace(
    new RegExp(
      `((?:${FUNC_BASE})\\([^()]+\\)|[a-zA-Z][a-zA-Z0-9._]*|\\d+(?:\\.\\d+)?|(?<![a-zA-Z])\\([^()]+\\))` +
      `\\^\\{\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*/\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*\\}`,
      "g"
    ),
    (_: string, base: string, m: string, n: string) => {
      const radicando = m === "1" ? base : `${base}^${m}`;
      return n === "2" ? `sqrt(${radicando})` : `nthRoot(${radicando},${n})`;
    }
  );

  // Exponente VACÍO `x^{}` (superíndice a medio escribir): KaTeX lo pinta como la
  // base sola, pero `convertirExponentes` lo dejaría en `x^()` y MathJS falla. Se borra
  // ANTES de convertir (así `e^{x^{}}` → `e^{x}` → `e^(x)`, no `e^(x^())`).
  expr = expr.replace(/\^\{\s*\}/g, "");

  // — Exponentes con llaves (incluye anidados como x^{3^{\pi}}) —
  expr = convertirExponentes(expr);

  // — Logaritmos y logaritmo natural —
  expr = expr.replace(/\\log_\{([^{}]+)\}\s*\{([^{}]+)\}/g, "log($2,$1)");
  expr = expr.replace(/\\log_\{([^{}]+)\}\s*\(([^()]+)\)/g, "log($2,$1)");
  expr = expr.replace(/\\log_([a-zA-Z0-9.]+)\s*\{([^{}]+)\}/g, "log($2,$1)");
  expr = expr.replace(/\\log_([a-zA-Z0-9.]+)\s*\(([^()]+)\)/g, "log($2,$1)");
  // Llaves balanceadas: el argumento puede contener otro comando con llaves
  // (`\ln{\sqrt{…}}`); una regex `[^{}]+` se cortaría en la primera `}` interna.
  expr = reemplazarComandoLlaves(expr, "ln", (a) => `log(${a})`);
  expr = reemplazarComandoLlaves(expr, "log", (a) => `log(${a})`);
  expr = expr.replace(/\\ln\s*\(([^()]+)\)/g, "log($1)");
  // `ln` SIN backslash: mathjs llama `log` al logaritmo natural (no conoce `ln`).
  // Va después de las reglas de `\ln` (que ya las convirtió) y como palabra
  // completa para no tocar identificadores que contengan esas letras.
  expr = expr.replace(/\bln\b/g, "log");

  // — Funciones trigonométricas con argumento LaTeX —
  const TRIG_PATRON = "sin|cos|tan|sec|csc|cot";
  expr = expr.replace(
    new RegExp(`\\\\(${TRIG_PATRON})\\s*\\{\\\\frac\\{([^}]+)\\}\\{([^}]+)\\}\\}`, "g"),
    "$1(($2)/($3))"
  );
  expr = expr.replace(
    new RegExp(`\\\\(${TRIG_PATRON})\\s*\\\\frac\\{([^}]+)\\}\\{([^}]+)\\}`, "g"),
    "$1(($2)/($3))"
  );
  expr = expr.replace(
    new RegExp(`\\\\(${TRIG_PATRON})\\s*\\{([^{}]+)\\}`, "g"),
    "$1($2)"
  );
  // Trig SIN backslash con argumento en llaves (`tan{x}` → `tan(x)`): notación informal
  // que MathJS no acepta (dejaría `tan{x}` → "Unexpected operator {"). La guarda inicial
  // —principio de cadena o carácter que NO es identificador ni `\`— evita casar el `tan`
  // de `atan{` (ya convertido por las inversas) y la forma con backslash (regla de arriba).
  expr = expr.replace(
    new RegExp(`(^|[^A-Za-z0-9\\\\])(${TRIG_PATRON})\\s*\\{([^{}]+)\\}`, "g"),
    "$1$2($3)"
  );
  // Solo si tras el número NO viene un símbolo (`\cos 5t`, `\sin 3\theta`): ahí el número
  // es el COEFICIENTE del argumento, no el argumento entero — lo resuelve la regla general
  // de argumento sin agrupar (abajo), que toma la corrida completa (`cos(5t)`). Sin el
  // lookahead, esta regla arrancaba el número solo (`cos(5)*t`) y encima lo pasaba a grados.
  expr = expr.replace(
    new RegExp(`\\\\(${TRIG_PATRON})\\s+([+-]?\\d+(\\.\\d+)?)(?![0-9.a-zA-Z\\\\])`, "g"),
    "$1($2)"
  );

  // — Función con argumento SIN agrupar (`\ln x`, `\cos x`, `\arctan x`, `\log_2 x`) —
  //   Notación estándar de las matemáticas escritas, y hasta ahora la única forma que
  //   NO se reconocía: sin paréntesis ni llaves, el nombre quedaba como un identificador
  //   suelto y el producto implícito lo multiplicaba por su argumento (`\ln x` → `log*x`,
  //   NaN en todo x → plano vacío). El nombre puede llevar aún su backslash (`\log x`, que
  //   el barrido residual limpia después) o no (`atan x`: las inversas ya lo quitaron).
  //   Los nombres LARGOS van primero en la alternancia: si no, `sin` se comería `sinh`.
  expr = expr.replace(/\\log_([a-zA-Z0-9.]+)\s+([a-zA-Z][a-zA-Z0-9]*|\d+(\.\d+)?)/g, "log($2,$1)");
  const FUNCIONES_ARG_SUELTO =
    "asinh|acosh|atanh|asech|acsch|acoth|arcsin|arccos|arctan|arcsec|arccsc|arccot|" +
    "sinh|cosh|tanh|sech|csch|coth|asin|acos|atan|asec|acsc|acot|" +
    "sin|cos|tan|sec|csc|cot|log|ln|exp|abs|sqrt|cbrt";
  //   El argumento puede llevar COEFICIENTE numérico (`\cos 5t`, `\cos 2x`, `\sin 3\theta`,
  //   `\sin 2\pi x`): número seguido de una corrida de símbolos —letra SUELTA (no corrida
  //   `xy`, que seguiría siendo producto de número) o comando griego de la lista blanca
  //   (no cualquier `\cmd`: `\cdot` aún no se ha convertido y un nombre de función NO es
  //   parte del argumento)—. Sin esta alternativa, el número se capturaba solo y
  //   `normalizarTrigonometria` lo pasaba a grados: `\cos 5t` → `cos(5·π/180)·t`.
  const SIMBOLO_ARG = `(?:\\\\(?:theta|pi|tau|phi)\\b|[a-zA-Z](?![a-zA-Z0-9]))`;
  expr = expr.replace(
    new RegExp(
      `\\\\?\\b(${FUNCIONES_ARG_SUELTO})\\s+` +
        `(\\d+(?:\\.\\d+)?(?:\\s*${SIMBOLO_ARG})+|[a-zA-Z][a-zA-Z0-9]*|\\d+(?:\\.\\d+)?)`,
      "g"
    ),
    "$1($2)"
  );
  //   Función seguida DIRECTAMENTE de un comando griego, sin espacio ni paréntesis:
  //   `\sin\theta`, `\ln\pi`, `\sqrt\pi` y —caso clave— la polar `r=\sin\theta`. La regla
  //   anterior exige `\s+` y un argumento que empiece por letra/dígito; un `\theta` pegado no
  //   casa, así que el nombre quedaba suelto y el producto implícito lo multiplicaba por el
  //   símbolo (`sin*theta`, NaN → nada se dibuja). Se restringe a los griegos de la lista
  //   blanca (los mismos que reconoce el resto del pipeline como átomo).
  expr = expr.replace(
    new RegExp(`\\\\?\\b(${FUNCIONES_ARG_SUELTO})\\s*\\\\(theta|pi|tau|phi)\\b`, "g"),
    "$1($2)"
  );

  // — Miscelánea LaTeX —
  // Raíces \sqrt[n]{…} → nthRoot(…,n) y \sqrt{…} → sqrt(…), con llaves
  // balanceadas para que el radicando pueda contener `\log{…}`, otra raíz, un
  // exponente, etc. (ver convertirRaices). Se hace tras convertir ln/log/trig
  // para que esos comandos del radicando ya estén en sintaxis mathjs.
  expr = convertirRaices(expr);
  expr = expr.replace(/\\cdot/g, "*");
  expr = expr.replace(/\\([a-zA-Z]+)/g, "$1"); // comandos LaTeX residuales

  // — Radianes para literales numéricos en trig —
  expr = normalizarTrigonometria(expr);

  // Los símbolos y directivas borrados dejan espacios sueltos en los bordes (`\displaystyle
  // y=x^2` → ` y=x^2`); un espacio inicial hacía que la ecuación NO se reconociera como
  // `y=…` y cayera a implícita. El interior sí se respeta (mathjs lo ignora).
  return expr.trim();
}

// ── Comandos LaTeX que el pipeline NO entiende ───────────────────────────────
//
// El barrido residual (`\\cmd` → `cmd`) es un COMODÍN: convierte cualquier comando
// desconocido en un identificador que el producto implícito parte letra a letra
// (`\alpha` → `a*l*p*h*a`). El resultado es una expresión sintácticamente válida, de
// símbolos libres, que evalúa NaN en todo x: el bloque no protesta, simplemente no
// dibuja nada —y en obs-derivate llega a DERIVAR esa basura y mostrar una derivada
// plausible y falsa—. Detectarlos permite al host mostrar la etiqueta formal ("Símbolo
// no soportado") en vez de un plano vacío en silencio.
//
// La lista blanca es de comandos que el pipeline SÍ resuelve (aquí, en dividirEcuaciones
// o en extraerIntegral). Es una lista blanca —no negra— a propósito: lo que no se
// reconoce debe DECIRSE, no adivinarse; un comando nuevo que se soporte se añade aquí.
const COMANDOS_SOPORTADOS = new Set([
  "frac", "dfrac", "tfrac", "sqrt", "left", "right", "cdot", "times", "div", "ast", "star",
  "bullet", "pm", "mp", "infty", "degree", "deg", "quad", "qquad", "displaystyle", "textstyle",
  "limits", "nolimits", "operatorname", "mathrm", "mathbf", "mathit", "mathsf", "boldsymbol",
  "text", "textrm", "textit", "mbox", "label",
  "lvert", "rvert", "vert", "mid", "lfloor", "rfloor", "lceil", "rceil",
  "sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "sech", "csch", "coth",
  "arcsin", "arccos", "arctan", "arcsec", "arccsc", "arccot",
  "ln", "log", "exp", "abs", "max", "min", "pi", "tau", "theta", "e",
  "begin", "end", "cases", "aligned", "array", "int", "to",
]);

/**
 * Comandos LaTeX de `raw` que el pipeline no sabe traducir (sin repetir, con su `\`).
 * Vacío = todo lo escrito es traducible. Lo usa el host para clasificar el bloque.
 */
export function comandosNoSoportados(raw: string): string[] {
  // El `\\` de LaTeX es un SALTO DE LÍNEA, no un comando: en `\begin{cases}y=x\\y=2\end…`
  // su segunda barra se leería como el comando `\y` (y velaría todo obs-system). Se neutraliza
  // antes de buscar comandos (dividirEcuaciones ya lo trató como separador).
  const vistos = new Set<string>();
  for (const m of raw.replace(/\\\\/g, " ").matchAll(/\\([a-zA-Z]+)/g))
    if (!COMANDOS_SOPORTADOS.has(m[1])) vistos.add(`\\${m[1]}`);
  return [...vistos];
}

/** ¿La expresión NORMALIZADA contiene la variable `y` suelta? El lookaround descarta la
 *  `y` interior de identificadores (`hypot`); tras normalizar, las variables ya quedan
 *  separadas por `*`, así que una `y` sin letras/dígitos pegados es la variable. Decide
 *  si una expresión suelta puede ser y=f(x) (no) o va como implícita expr=0 (sí). */
export function contieneYLibre(exprNorm: string): boolean {
  return /(?<![a-zA-Z0-9_])y(?![a-zA-Z0-9_])/.test(exprNorm);
}
