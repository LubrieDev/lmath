import { Plugin, Notice, MarkdownRenderer, MarkdownRenderChild } from "obsidian";
import { evaluate, simplify, parse } from "mathjs";

// ─────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────

const FUNCIONES_TRIG = ["sin", "cos", "tan", "sec", "csc", "cot"] as const;
const FUNCIONES_LATEX = "sin|cos|tan|sec|csc|cot|log|ln";

// Trigonométricas inversas que MathJS NO trae nativas. Se inyectan en el scope
// de evaluación como wrappers de dominio real:
//   acsc(x)=asin(1/x)   asec(x)=acos(1/x)   acot(x)=pi/2 - atan(x)
// acsc/asec usan Math.* para devolver NaN —no un complejo— fuera del dominio,
// que es lo que el motor de curvas ya filtra con Number.isFinite.
// acot usa la convención CONTINUA de rango (0, π) —la de Desmos/cálculo—, no
// atan(1/x): esta última salta de +π/2 a −π/2 en x=0. pi/2-atan(x) decrece sin
// cortes de π (en −∞) a 0 (en +∞), pasando por π/2 en x=0.
const FUNCIONES_INVERSAS_EXTRA = {
  acsc: (x: number) => Math.asin(1 / x),
  asec: (x: number) => Math.acos(1 / x),
  acot: (x: number) => Math.PI / 2 - Math.atan(x),
};

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
 * Si el argumento es un literal numérico puro lo convierte a radianes
 * añadiendo `*pi/180`; en caso contrario lo devuelve sin cambios.
 */
function argumentoTrigonometrico(arg: string): string {
  return /^[+-]?\d+(\.\d+)?$/.test(arg.trim()) ? arg.trim() + "*pi/180" : arg.trim();
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
  expr = expr.replace(new RegExp(`(${t})\\s*\\^\\{?\\s*-\\s*1\\s*\\}?`, "g"), "a$1");
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

/** Convierte sintaxis LaTeX/Unicode a sintaxis que MathJS pueda evaluar. */
function normalizarEntrada(raw: string): string {
  let expr = raw;

  // — Unicode y operadores simbólicos —
  expr = expr.replace(/π/g, "pi");
  expr = expr.replace(/√/g, "sqrt");
  expr = expr.replace(/[·×]/g, "*");
  expr = expr.replace(/÷/g, "/");
  expr = expr.replace(/²/g, "^2");
  expr = expr.replace(/³/g, "^3");
  expr = expr.replace(/∞/g, "Infinity");

  // — Delimitadores LaTeX —
  expr = expr.replace(/\\left/g, "");
  expr = expr.replace(/\\right/g, "");

  // — Valor absoluto |…| → abs(…) (tras quitar \left/\right, antes de \frac) —
  expr = convertirValorAbsoluto(expr);

  // — Trigonométricas inversas (arcsin / sin⁻¹ / sin^{-1} → asin, …) —
  expr = normalizarFuncionesInversas(expr);

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
  expr = expr.replace(
    /([a-zA-Z][a-zA-Z0-9._]*|\d+(?:\.\d+)?|\([^()]+\))\^\{\s*\(?\s*(\d+)\s*\)?\s*\/\s*\(?\s*(\d+)\s*\)?\s*\}/g,
    (_, base, m, n) => {
      const radicando = m === "1" ? base : `${base}^${m}`;
      return n === "2" ? `sqrt(${radicando})` : `nthRoot(${radicando},${n})`;
    }
  );

  // — Exponentes con llaves (incluye anidados como x^{3^{\pi}}) —
  expr = convertirExponentes(expr);

  // — Logaritmos y logaritmo natural —
  expr = expr.replace(/\\log_\{([^{}]+)\}\s*\{([^{}]+)\}/g, "log($2,$1)");
  expr = expr.replace(/\\log_\{([^{}]+)\}\s*\(([^()]+)\)/g, "log($2,$1)");
  expr = expr.replace(/\\log_([a-zA-Z0-9.]+)\s*\{([^{}]+)\}/g, "log($2,$1)");
  expr = expr.replace(/\\log_([a-zA-Z0-9.]+)\s*\(([^()]+)\)/g, "log($2,$1)");
  expr = expr.replace(/\\ln\s*\{([^{}]+)\}/g, "log($1)");
  expr = expr.replace(/\\ln\s*\(([^()]+)\)/g, "log($1)");
  expr = expr.replace(/\\log\s*\{([^{}]+)\}/g, "log($1)");
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
  expr = expr.replace(
    new RegExp(`\\\\(${TRIG_PATRON})\\s+([+-]?\\d+(\\.\\d+)?)`, "g"),
    "$1($2)"
  );

  // — Miscelánea LaTeX —
  // Raíz n-ésima: \sqrt[3]{8} → nthRoot(8,3). El corchete es el índice (índice 3
  // = raíz cúbica). Debe ir ANTES de \sqrt{…}. El radicando usa [^}]+ porque las
  // llaves internas (exponentes, fracciones) ya se convirtieron arriba; nthRoot
  // da además la raíz real para índices impares con radicando negativo (∛-8=-2).
  expr = expr.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, "nthRoot($2,$1)");
  expr = expr.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");
  expr = expr.replace(/\\cdot/g, "*");
  expr = expr.replace(/\\([a-zA-Z]+)/g, "$1"); // comandos LaTeX residuales

  // — Radianes para literales numéricos en trig —
  expr = normalizarTrigonometria(expr);

  return expr;
}

// ─────────────────────────────────────────────
// LaTeX → presentación
// ─────────────────────────────────────────────

/**
 * Reescribe el LaTeX que mathjs genera para las inversas (`\sin^{-1}`, …) a la
 * notación pedida: arcsin/arccos/arctan como comandos `\arc…` y las menos
 * comunes como `\text{arc…}` (KaTeX no tiene comando propio para ellas).
 */
function embellecerInversasLatex(tex: string): string {
  return tex
    .replace(/\\sin\s*\^\{-1\}/g, "\\arcsin")
    .replace(/\\cos\s*\^\{-1\}/g, "\\arccos")
    .replace(/\\tan\s*\^\{-1\}/g, "\\arctan")
    .replace(/\\csc\s*\^\{-1\}/g, "\\text{arccsc}")
    .replace(/\\sec\s*\^\{-1\}/g, "\\text{arcsec}")
    .replace(/\\cot\s*\^\{-1\}/g, "\\text{arccot}");
}

/** Elimina artefactos de espaciado que mathjs introduce en el LaTeX generado. */
function limpiarTex(tex: string): string {
  let resultado = embellecerInversasLatex(tex);
  resultado = resultado.replace(/~\s*/g, "");
  // Colapsa SÓLO grupos `{x}` sueltos (artefactos de mathjs). No toca los que
  // son argumento de un comando (`\sqrt{x}`) ni de un sub/superíndice (`_{x}`,
  // `^{x}`) ni de una raíz n-ésima (`\sqrt[3]{x}`, llave tras `]`): si se
  // quitaran, `\sqrt{x}` se volvería `\sqrtx` (comando inválido → KaTeX lo pinta
  // en rojo) y `\frac{x}{2}` se rompería.
  resultado = resultado.replace(/(^|[^a-zA-Z\\^_}\]])\{\s*([a-zA-Z0-9])\s*\}/g, "$1$2");
  resultado = resultado.replace(/(\d)\s+([a-zA-Z\\])/g, "$1$2");
  return resultado.trim();
}

/**
 * Asegura que las funciones matemáticas en LaTeX lleven `\left(…\right)`.
 * Limitación conocida: los patrones de `\frac` son planos y no capturan
 * fracciones anidadas; en ese caso el renderizador de KaTeX lo resuelve igual.
 */
function agregarParentesisFuncionesLatex(tex: string): string {
  let resultado = tex;
  const fn = FUNCIONES_LATEX;

  // \sin{\frac{...}{...}} → \sin\left(\frac{...}{...}\right)
  resultado = resultado.replace(
    new RegExp(`\\\\(${fn})\\s*\\{(\\\\frac\\{[^{}]+\\}\\{[^{}]+\\})\\}`, "g"),
    "\\$1\\left($2\\right)"
  );

  // \sin{arg} → \sin\left(arg\right)
  resultado = resultado.replace(
    new RegExp(`\\\\(${fn})\\s*\\{([^{}]+)\\}`, "g"),
    "\\$1\\left($2\\right)"
  );

  // \operatorname{sin}\frac{...}{...} → \operatorname{sin}\left(\frac{...}{...}\right)
  resultado = resultado.replace(
    new RegExp(
      `\\\\operatorname\\{(${fn})\\}\\s*(\\\\frac\\{[^{}]+\\}\\{[^{}]+\\})`,
      "g"
    ),
    "\\operatorname{$1}\\left($2\\right)"
  );

  // \operatorname{sin} arg → \operatorname{sin}\left(arg\right)
  resultado = resultado.replace(
    new RegExp(`\\\\operatorname\\{(${fn})\\}\\s*([a-zA-Z0-9]+)`, "g"),
    "\\operatorname{$1}\\left($2\\right)"
  );

  // \sin \frac{...}{...} → \sin\left(\frac{...}{...}\right)
  resultado = resultado.replace(
    new RegExp(`\\\\(${fn})\\s*(\\\\frac\\{[^{}]+\\}\\{[^{}]+\\})`, "g"),
    "\\$1\\left($2\\right)"
  );

  // \sin arg → \sin\left(arg\right)
  resultado = resultado.replace(
    new RegExp(`\\\\(${fn})\\s+([a-zA-Z0-9]+)`, "g"),
    "\\$1\\left($2\\right)"
  );

  return resultado;
}

/** Quita llaves externas redundantes de una cadena LaTeX. */
function quitarLlavesExternas(texto: string): string {
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

/** Convierte una ecuación de texto a LaTeX (opcionalmente con `&=` para alineación). */
function ecuacionALatex(ecuacion: string, alineada = false): string {
  try {
    const partes = ecuacion.split("=");
    if (partes.length !== 2) return ecuacion;

    const lhsNorm = normalizarEntrada(partes[0].trim());
    const rhsOriginal = partes[1].trim();
    const rhsNorm = normalizarEntrada(rhsOriginal);

    const texLhs = agregarParentesisFuncionesLatex(
      limpiarTex(parse(lhsNorm).toTex({ parenthesis: "keep" }))
    );

    // Si el RHS ya contiene LaTeX lo usamos directamente para evitar doble conversión.
    const texRhs = rhsOriginal.includes("\\")
      ? agregarParentesisFuncionesLatex(rhsOriginal.trim())
      : agregarParentesisFuncionesLatex(
          limpiarTex(parse(rhsNorm).toTex({ parenthesis: "keep" }))
        );

    const signo = alineada ? "&=" : "=";
    return texLhs + signo + texRhs;
  } catch {
    return ecuacion;
  }
}

// ─────────────────────────────────────────────
// Sistemas de ecuaciones — LaTeX
// ─────────────────────────────────────────────

interface SistemaParseado {
  ecuaciones: string[];
  espacios: string[];
  usaCases: boolean;
}

function parsearSistemaCases(source: string): SistemaParseado {
  const texto = source.trim();
  const matchCases = texto.match(/^\\begin\{cases\}([\s\S]*)\\end\{cases\}$/);

  if (!matchCases) {
    return {
      ecuaciones: texto.split("\n").map(l => l.trim()).filter(Boolean),
      espacios: [],
      usaCases: false,
    };
  }

  const partes = matchCases[1].trim().split(/\\\\(?:\s*\[([^\]]+)\])?/g);
  const ecuaciones: string[] = [];
  const espacios: string[] = [];

  for (let i = 0; i < partes.length; i += 2) {
    const ecuacion = quitarLlavesExternas(partes[i]);
    if (!ecuacion) continue;

    ecuaciones.push(ecuacion);

    if (i + 1 < partes.length) {
      const espacio = partes[i + 1]?.trim();
      espacios.push(espacio ? `[${espacio}]` : "[1.5ex]");
    }
  }

  return { ecuaciones, espacios, usaCases: true };
}

function sistemaCasesALatex(ecuaciones: string[], espacios: string[]): string {
  const lineas = ecuaciones.map(ec => ecuacionALatex(ec, true));
  const contenido = lineas
    .map((linea, i) =>
      i < lineas.length - 1 ? linea + "\\\\" + (espacios[i] ?? "[1.5ex]") : linea
    )
    .join("");

  return `\\begin{cases}\\begin{aligned}${contenido}\\end{aligned}\\end{cases}`;
}

// ─────────────────────────────────────────────
// Sistemas de ecuaciones — Álgebra lineal
// ─────────────────────────────────────────────

interface EcuacionLineal {
  vars: Record<string, number>;
  rhs: number;
}

function parsearEcuacionLineal(ecuacion: string): EcuacionLineal | null {
  try {
    const partes = ecuacion.split("=");
    if (partes.length !== 2) return null;

    const lhs = normalizarEntrada(partes[0].trim());
    const rhs = normalizarEntrada(partes[1].trim());
    const exprDiferencia = `(${lhs})-(${rhs})`;
    const nodo = parse(exprDiferencia);

    // Recolectar variables simbólicas (las que no son constantes de MathJS)
    const variables = new Set<string>();
    (nodo as any).traverse((n: any) => {
      if (n.type !== "SymbolNode") return;
      try { evaluate(n.name); } catch { variables.add(n.name); }
    });

    const nombresVars = Array.from(variables).sort();
    const scopeCero: Record<string, number> = Object.fromEntries(
      nombresVars.map((v: string) => [v, 0])
    );

    const constante = evaluate(exprDiferencia, scopeCero);
    if (!isFinite(constante)) return null;

    const coefs: Record<string, number> = {};
    for (const v of nombresVars) {
      const valorConUno = evaluate(exprDiferencia, { ...scopeCero, [v as string]: 1 });
      if (!isFinite(valorConUno)) return null;
      const coef = valorConUno - constante;
      if (Math.abs(coef) > 1e-10) coefs[v] = coef;
    }

    // Verificar linealidad con valor=2
    for (const v of nombresVars) {
      const valorConDos = evaluate(exprDiferencia, { ...scopeCero, [v as string]: 2 });
      const esperado = constante + 2 * (coefs[v] ?? 0);
      if (!isFinite(valorConDos) || Math.abs(valorConDos - esperado) > 1e-8) return null;
    }

    return { vars: coefs, rhs: -constante };
  } catch {
    return null;
  }
}

/** Calcula el rango de una matriz mediante eliminación gaussiana con pivoteo parcial. */
function rangoMatriz(matrizOriginal: number[][]): number {
  const m = matrizOriginal.map(fila => fila.slice());
  const filas = m.length;
  const cols = m[0]?.length ?? 0;
  let rango = 0;

  for (let col = 0; col < cols && rango < filas; col++) {
    // Pivoteo parcial
    let maxFila = rango;
    for (let f = rango + 1; f < filas; f++) {
      if (Math.abs(m[f][col]) > Math.abs(m[maxFila][col])) maxFila = f;
    }
    if (Math.abs(m[maxFila][col]) < 1e-10) continue;

    [m[rango], m[maxFila]] = [m[maxFila], m[rango]];
    const pivote = m[rango][col];
    for (let j = col; j < cols; j++) m[rango][j] /= pivote;

    for (let f = 0; f < filas; f++) {
      if (f === rango) continue;
      const factor = m[f][col];
      for (let j = col; j < cols; j++) m[f][j] -= factor * m[rango][j];
    }
    rango++;
  }

  return rango;
}

type ResultadoSistema = Record<string, number> | string;

function resolverSistema(ecuaciones: string[]): ResultadoSistema {
  const parseadas = ecuaciones.map(parsearEcuacionLineal);
  if (parseadas.some(p => p === null))
    return "No se pudo parsear una o mas ecuaciones";

  // Unión de todas las variables
  const todasVars = Array.from(
    new Set(parseadas.flatMap((p: EcuacionLineal | null) => Object.keys(p!.vars)))
  ).sort();
  const numVars = todasVars.length;

  // Construir matriz aumentada
  const matrizAumentada = parseadas.map((p: EcuacionLineal | null) => [
    ...todasVars.map(v => p!.vars[v as string] ?? 0),
    p!.rhs,
  ]);

  const matrizCoefs = matrizAumentada.map(fila => fila.slice(0, numVars));
  const rangoCoefs = rangoMatriz(matrizCoefs);
  const rangoAumentada = rangoMatriz(matrizAumentada);

  if (rangoAumentada > rangoCoefs)
    return "Sistema inconsistente: no tiene solucion";
  if (numVars === 0)
    return "Sistema consistente y dependiente: todas las ecuaciones son identidades; hay infinitas soluciones";
  if (rangoCoefs < numVars)
    return "Sistema consistente y dependiente: infinitas soluciones";

  // Seleccionar filas linealmente independientes
  const filasIndep: number[][] = [];
  for (const p of parseadas) {
    const fila = [...todasVars.map(v => p!.vars[v as string] ?? 0), p!.rhs];
    const candidato = [...filasIndep.map(f => f.slice(0, numVars)), fila.slice(0, numVars)];
    if (rangoMatriz(candidato) > filasIndep.length) filasIndep.push(fila);
    if (filasIndep.length === numVars) break;
  }

  // Eliminación gaussiana in-place sobre las filas independientes
  const m = filasIndep;
  for (let col = 0; col < numVars; col++) {
    let maxFila = col;
    for (let f = col + 1; f < numVars; f++) {
      if (Math.abs(m[f][col]) > Math.abs(m[maxFila][col])) maxFila = f;
    }
    [m[col], m[maxFila]] = [m[maxFila], m[col]];

    if (Math.abs(m[col][col]) < 1e-10) return "El sistema no tiene solucion unica";

    for (let f = col + 1; f < numVars; f++) {
      const factor = m[f][col] / m[col][col];
      for (let j = col; j <= numVars; j++) m[f][j] -= factor * m[col][j];
    }
  }

  // Sustitución hacia atrás
  const solucion = new Array<number>(numVars).fill(0);
  for (let i = numVars - 1; i >= 0; i--) {
    solucion[i] = m[i][numVars];
    for (let j = i + 1; j < numVars; j++) solucion[i] -= m[i][j] * solucion[j];
    solucion[i] /= m[i][i];
  }

  return Object.fromEntries(todasVars.map((v: string, i: number) => [v, solucion[i]]));
}

// ─────────────────────────────────────────────
// Análisis numérico de f(x) — helpers
// ─────────────────────────────────────────────

// pasos: resolución del muestreo. Más fino que antes (era 200) para no perder
// raíces juntas en funciones oscilantes (p.ej. tan, sin de alta frecuencia).
const RANGO_X = { min: -10, max: 10, pasos: 1000 };
const UMBRAL_PENDIENTE = 50;

// Por encima de este número de raíces (o de vértices), la función se considera
// con "demasiados" puntos notables (p.ej. sin/cos/tan, oscilantes): no se dibujan
// marcadores individuales de ese grupo y el panel muestra un resumen en su lugar.
const LIMITE_PUNTOS_NOTABLES = 20;

// Tolerancia (en coords de mundo) para FUSIONAR dos puntos notables en un único
// marcador. Solo deben fusionarse los que son REALMENTE el mismo punto: una raíz
// doble que coincide con su vértice (parábola tangente al eje), o un vértice en el
// origen que también es la intersección Y. Esos casos coinciden hasta el paso de
// muestreo (delta = 20/1000 = 0.02), así que basta un margen de unas pocas
// muestras. El valor anterior (0.15) era ~7× el paso y se "tragaba" mínimos reales:
// p.ej. en 2/(2x+1)+(x³−3)/π la curva apenas cruza el eje, baja a un mínimo y vuelve
// a subir; el vértice (≈0.79, −0.02) quedaba a 0.13 de la raíz en 0.93 y desaparecía.
const TOLERANCIA_FUSION = 0.05;

interface Vertice { x: number; y: number; tipo: "min" | "max" }

/**
 * Localiza con precisión la raíz dentro de [a, b] (donde f cambia de signo) por
 * bisección, y DISTINGUE una raíz real de un polo (asíntota vertical como en
 * tan x o 1/x, que también cambian de signo entre dos muestras).
 *
 * Criterio: en una raíz real f→0 al estrechar el intervalo; en un polo f se
 * dispara (±∞ o magnitud enorme) o se vuelve no-finita. Tras refinar:
 *   - valor no-finito en el camino           → polo  (null)
 *   - |f| sigue siendo grande al converger   → polo  (null)
 *   - |f| ≈ 0                                 → raíz  (devuelve x)
 */
function refinarRaiz(
  evaluar: (x: number) => number,
  a: number, fa: number,
  b: number
): number | null {
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    const fm = evaluar(m);
    if (!Number.isFinite(fm)) return null;     // discontinuidad/polo
    if (fm === 0) return m;
    if (fa * fm < 0) { b = m; }
    else { a = m; fa = fm; }
  }
  const m = (a + b) / 2;
  const fm = evaluar(m);
  // En la raíz, el intervalo es ínfimo y |f| ha colapsado a ~0; en un polo el
  // valor sigue siendo grande aunque el cambio de signo "engañe".
  return Number.isFinite(fm) && Math.abs(fm) < 1e-3 ? m : null;
}

/** Raíces reales en [min, max]: todos los cruces del eje X, excluyendo polos. */
function detectarRaices(
  evaluar: (x: number) => number,
  xs: number[], ys: number[]
): number[] {
  const raices: number[] = [];
  const agregar = (x: number) => {
    if (!raices.some(r => Math.abs(r - x) < 1e-4)) raices.push(x);
  };

  // Función idénticamente nula (f(x)=0): TODA muestra sería "raíz". No son raíces
  // aisladas, así que no se devuelve ninguna; el caso se representa con un único
  // marcador en la intersección Y (0,0), no con miles solapados sobre el eje.
  let finitos = 0, ceros = 0;
  for (const y of ys) {
    if (!Number.isFinite(y)) continue;
    finitos++;
    if (y === 0) ceros++;
  }
  if (finitos > 0 && ceros === finitos) return [];

  for (let i = 0; i < xs.length - 1; i++) {
    const ya = ys[i], yb = ys[i + 1];
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue;
    if (ya === 0) { agregar(xs[i]); continue; }
    if (ya * yb < 0) {
      const r = refinarRaiz(evaluar, xs[i], ya, xs[i + 1]);
      if (r !== null) agregar(r);
    }
  }
  const n = xs.length - 1;
  if (Number.isFinite(ys[n]) && ys[n] === 0) agregar(xs[n]);

  return raices.sort((p, q) => p - q);
}

/**
 * Vértices locales (min/max) por cambio de signo de la pendiente discreta,
 * DISTINGUIENDO extremos reales de picos de asíntota (tan, sec, csc, cot…).
 *
 * Clave: en un extremo real la curva "se da la vuelta" con pendiente ~0 a AMBOS
 * lados, mientras que en una asíntota la rama dispara hacia ±∞ y al menos un lado
 * es muy empinado. El filtro anterior usaba la pendiente COMBINADA (yNext-yPrev),
 * que se cancela en un pico simétrico junto a un polo y dejaba pasar un falso
 * extremo justo en la punta de la asíntota. Aquí exigimos que CADA lado sea suave
 * (|pendiente| < umbral) y que no haya un polo en el vecindario inmediato (alguna
 * muestra no finita a ±2 pasos), lo que descarta las cercanías de asíntotas.
 */
function detectarVertices(xs: number[], ys: number[], delta: number): Vertice[] {
  const vertices: Vertice[] = [];
  for (let i = 1; i < xs.length - 1; i++) {
    const yPrev = ys[i - 1], yCurr = ys[i], yNext = ys[i + 1];
    if (!Number.isFinite(yPrev) || !Number.isFinite(yCurr) || !Number.isFinite(yNext)) continue;

    // Ambos lados deben ser suaves: en un extremo real la pendiente cruza 0; en
    // una asíntota uno de los lados se dispara.
    if (Math.abs((yCurr - yPrev) / delta) >= UMBRAL_PENDIENTE) continue;
    if (Math.abs((yNext - yCurr) / delta) >= UMBRAL_PENDIENTE) continue;

    // Polo cercano: una muestra no finita a ±2 pasos delata una asíntota próxima.
    if (
      !Number.isFinite(ys[i - 2] ?? 0) || !Number.isFinite(ys[i + 2] ?? 0)
    ) continue;

    const dAntes = yCurr - yPrev;
    const dDespues = yNext - yCurr;
    const tipo: "min" | "max" | null =
      dAntes < 0 && dDespues > 0 ? "min" :
      dAntes > 0 && dDespues < 0 ? "max" : null;
    if (tipo === null) continue;

    // Refinamiento parabólico: la muestra `i` solo es la MÁS cercana al extremo,
    // no el extremo en sí (puede estar a ±delta/2). Ajustamos la parábola que pasa
    // por (yPrev, yCurr, yNext) y tomamos su vértice. Sin esto el marcador caía en
    // la rejilla de muestreo (p.ej. x=0.80 en vez del mínimo real x=0.792) y, en
    // dips poco profundos entre dos raíces juntas, ni siquiera quedaba centrado.
    const denom = yPrev - 2 * yCurr + yNext; // curvatura · delta²; >0 en min, <0 en max
    let xVert = xs[i], yVert = yCurr;
    if (Number.isFinite(denom) && Math.abs(denom) > 1e-12) {
      const t = (yPrev - yNext) / (2 * denom); // desplazamiento en pasos, |t|≤0.5 normalmente
      if (Math.abs(t) <= 1) {
        xVert = xs[i] + t * delta;
        yVert = yCurr - ((yPrev - yNext) * (yPrev - yNext)) / (8 * denom);
      }
    }
    vertices.push({ x: xVert, y: yVert, tipo });
  }
  return vertices;
}

function analizarFuncion(
  evaluar: (x: number) => number
): { raices: number[]; vertices: Vertice[] } {
  const { min, max, pasos } = RANGO_X;
  const delta = (max - min) / pasos;

  // Muestreo uniforme único, reutilizado por raíces y vértices.
  const xs: number[] = new Array(pasos + 1);
  const ys: number[] = new Array(pasos + 1);
  for (let i = 0; i <= pasos; i++) {
    const x = min + i * delta;
    xs[i] = x;
    ys[i] = evaluar(x);
  }

  return {
    raices: detectarRaices(evaluar, xs, ys),
    vertices: detectarVertices(xs, ys, delta),
  };
}

/**
 * ¿La expresión contiene una función trigonométrica (sin, cos, tan, sec, csc,
 * cot) como LLAMADA? Estas funciones son periódicas: si su curva toca el eje X
 * lo hace infinitas veces, y si oscila tiene infinitos extremos. Es una prueba
 * léxica sobre la expresión ya normalizada (no álgebra simbólica). El borde de
 * palabra `\b` evita falsos positivos con inversas/hiperbólicas (asin, sinh…),
 * que NO son periódicas; y `\s*\(` exige que sea una llamada, no un identificador.
 */
const TRIG_LLAMADA = /\b(sin|cos|tan|sec|csc|cot)\s*\(/;
function tieneTrigonometria(expr: string): boolean {
  return TRIG_LLAMADA.test(expr);
}

// A partir de cuántas raíces/vértices una función trigonométrica se considera
// que OSCILA de verdad (periódica → infinitos), y no que solo ondula cruzando
// una vez. Distingue sin(x) (≈7 raíces) de x+sin(x) (monótona, 1 sola raíz).
const MIN_PUNTOS_PERIODICO = 3;

// Estado de un grupo de puntos notables (raíces o vértices):
//   normal     → se dibujan y se listan
//   infinitas  → trig que oscila (≥ umbral periódico): no se dibujan, se resumen
//   demasiadas → no-trig con demasiados (> umbral): no se dibujan, se resumen
type EstadoGrupo = "normal" | "infinitas" | "demasiadas";

function estadoGrupo(cantidad: number, esTrig: boolean): EstadoGrupo {
  // Trigonométrica que cruza/oscila VARIAS veces (≥ umbral): infinitos. Una sola
  // raíz/extremo (p.ej. x+sin(x), monótona salvo ondulación, o sin(x)+2 que flota
  // sin tocar el eje) NO es periódica → cae a normal y se lista/oculta como tal.
  if (esTrig && cantidad >= MIN_PUNTOS_PERIODICO) return "infinitas";
  // No-trig: solo se resume cuando hay demasiados; si no, comportamiento normal.
  if (cantidad > LIMITE_PUNTOS_NOTABLES) return "demasiadas";
  return "normal";
}

interface PuntoNotable {
  x: number;
  y: number;
  tipo: "raiz" | "min" | "max" | "interseccion-y";
}

/**
 * Reúne raíces, vértices e intersección con Y en una sola lista de puntos
 * notables para dibujarlos sobre el plano. Fusiona los que coinciden en posición
 * (p.ej. una raíz que cae sobre un vértice, o un vértice en el origen que también
 * es la intersección Y) para que se muestre UN único marcador. La tolerancia de
 * fusión es en coordenadas de mundo (independiente del zoom), del orden del paso
 * de muestreo de analizarFuncion, de modo que absorbe el ruido numérico.
 */
function construirPuntosNotables(
  analisis: { raices: number[]; vertices: Vertice[] },
  interseccionY: number,
  estadoRaices: EstadoGrupo,
  estadoVertices: EstadoGrupo
): PuntoNotable[] {
  const puntos: PuntoNotable[] = [];
  // Cada grupo (raíces / vértices) solo aporta marcadores si su estado es normal;
  // si es periódico ("infinitas") o excesivo ("demasiadas"), no se dibujan sus
  // marcadores y se resumen en el botón ⓘ. La intersección Y se muestra siempre:
  // es un único punto.
  if (estadoRaices === "normal")
    for (const x of analisis.raices) puntos.push({ x, y: 0, tipo: "raiz" });
  if (estadoVertices === "normal")
    for (const v of analisis.vertices) puntos.push({ x: v.x, y: v.y, tipo: v.tipo });
  if (Number.isFinite(interseccionY))
    puntos.push({ x: 0, y: interseccionY, tipo: "interseccion-y" });

  const fusionados: PuntoNotable[] = [];
  for (const p of puntos) {
    const coincide = fusionados.some(
      q => Math.abs(q.x - p.x) < TOLERANCIA_FUSION &&
           Math.abs(q.y - p.y) < TOLERANCIA_FUSION
    );
    if (!coincide) fusionados.push(p);
  }
  return fusionados;
}

// ─────────────────────────────────────────────
// Clasificación de funciones degeneradas (no graficables)
// ─────────────────────────────────────────────

interface FuncionDegenerada { etiqueta: string; detalle: string }

/**
 * Detecta funciones que NO son graficables en ℝ porque no toman ningún valor
 * real, y las clasifica formalmente. Muestrea un rango amplio (para no marcar
 * por error una función definida sólo lejos del origen, p.ej. sqrt(x-500)) más
 * un tramo fino central. Si aparece algún valor real → es graficable (null).
 *
 * Sin valores reales, se distingue por qué:
 *   - algún ±∞ (división por cero, p.ej. log en base 1: ln(x)/ln(1)) → Indefinida
 *   - algún valor complejo (p.ej. sqrt(-1))                          → No definida en ℝ
 *   - sólo NaN (forma indeterminada, p.ej. 0/0)                      → Indeterminada
 *
 * Bonus: evita el motor de curva en estos casos, que de otro modo dibujaba
 * asíntotas falsas (las transiciones a ±∞ de log en base 1 se tomaban por polos).
 */
function clasificarDegenerada(
  evaluar: (x: number) => unknown
): FuncionDegenerada | null {
  let reales = 0, infinitos = 0, complejos = 0; // (los NaN son el resto)

  const muestra = (x: number) => {
    const v = evaluar(x);
    if (typeof v === "number") {
      if (Number.isFinite(v)) reales++;
      else if (v === Infinity || v === -Infinity) infinitos++;
      // NaN: no se cuenta (es el caso por defecto)
    } else if (v && typeof v === "object" && typeof (v as any).im === "number") {
      complejos++;
    }
  };

  for (let i = 0; i <= 500; i++) muestra(-1000 + (2000 * i) / 500); // rango amplio
  for (let i = 0; i <= 200; i++) muestra(-10 + (20 * i) / 200);     // detalle central

  if (reales > 0) return null; // graficable

  if (infinitos > 0)
    return {
      etiqueta: "Indefinida",
      detalle: "La expresión no está definida en ℝ.",
    };
  if (complejos > 0)
    return {
      etiqueta: "No definida en ℝ",
      detalle: "La expresión produce valores complejos y no puede representarse en el plano real.",
    };
  return {
    etiqueta: "Indeterminada",
    detalle: "La expresión produce una forma indeterminada.",
  };
}

// ─────────────────────────────────────────────
// Plugin principal
// ─────────────────────────────────────────────

function crearShader(gl: WebGLRenderingContext, tipo: number, fuente: string): WebGLShader {
  const shader = gl.createShader(tipo)!;
  gl.shaderSource(shader, fuente);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error("Shader: " + gl.getShaderInfoLog(shader));
  return shader;
}

function crearPrograma(gl: WebGLRenderingContext): WebGLProgram {
  const vert = crearShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `);
  const frag = crearShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec4 u_color;
    void main() { gl_FragColor = u_color; }
  `);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error("Programa WebGL: " + gl.getProgramInfoLog(prog));
  return prog;
}

// Convierte una lista de puntos en clip space a tira de quads con grosor dado
function construirQuadStrip(puntos: number[], grosorClip: number): Float32Array {
  const verts: number[] = [];
  const n = puntos.length / 2;
  if (n < 2) return new Float32Array(0);

  for (let i = 0; i < n - 1; i++) {
    const x0 = puntos[i * 2], y0 = puntos[i * 2 + 1];
    const x1 = puntos[(i + 1) * 2], y1 = puntos[(i + 1) * 2 + 1];

    // Vector perpendicular normalizado
    let dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) continue;
    dx /= len; dy /= len;
    const nx = -dy * grosorClip, ny = dx * grosorClip;

    // Dos triángulos formando un quad
    verts.push(
      x0 + nx, y0 + ny,
      x0 - nx, y0 - ny,
      x1 + nx, y1 + ny,
      x1 - nx, y1 - ny,
      x1 + nx, y1 + ny,
      x0 - nx, y0 - ny
    );
  }
  return new Float32Array(verts);
}

export default class ObsiMathPlugin extends Plugin {
  // Flag temporal: pon en `true` para reactivar el bloque obs-system.
  private readonly OBS_SISTEMA_HABILITADO = false;

  async onload() {
    let obsMathUpdateCount = 0;
    let obsSistemaUpdateCount = 0;
    console.log("Obsi Math: plugin cargado");
    new Notice("¡Obsi Math se ha cargado correctamente!");

    // ── Bloque obs-graph ───────────────────────
    this.registerMarkdownCodeBlockProcessor(
      "obs-graph",
      async (source, el, ctx) => {
        const contenedor = el.createDiv({ cls: "obsi-math-container" });

        // Obsidian re-renderiza el bloque (editar, scroll, cambiar de nota…)
        // creando un contenedor nuevo cada vez. Sin liberar el contexto WebGL
        // anterior se acumulan hasta "Too many active WebGL contexts". Este
        // MarkdownRenderChild ejecuta sus callbacks register() cuando el
        // elemento se quita del DOM, que es donde liberamos GL, observers y
        // listeners globales.
        const limpieza = new MarkdownRenderChild(contenedor);
        ctx.addChild(limpieza);

        try {
          const partes = source.trim().split("=");
          const exprRaw = partes.length > 1 ? partes[1].trim() : partes[0].trim();
          const expr = normalizarEntrada(exprRaw);

          // Renderizar LaTeX
          let latex = "f(x)=" + expr;
          try {
            // "auto": mathjs pone sólo los paréntesis necesarios. Con "keep"
            // conservaba los redundantes y x^{3^{\pi}} salía como
            // x^{\left(3^{\left(\pi\right)}\right)} en vez de x^{3^{\pi}}.
            const tex = limpiarTex(parse(expr).toTex({ parenthesis: "auto" }));
            // Con el bloque vacío, parse("") de mathjs devuelve el nodo "undefined"
            // (toTex → "undefined"), que KaTeX pintaría como u·n·d·e·f… en cursiva.
            // Lo mostramos como marcador de "sin función": \text{[...]}.
            latex = "f(x)=" + (tex === "undefined" ? "\\text{[...]}" : tex);
          } catch (e) {
            console.warn("ObsiMath: no se pudo generar LaTeX para", expr, e);
          }

          // Panel izquierdo: contenedor posicionado que aloja el área de scroll
          // de la fórmula y el overlay de fade. El overlay tiene que ser hermano
          // del área scrolleable (no hijo): un elemento absolute dentro de un
          // scroller se desplaza junto al contenido y el fade "viajaría".
          const panelLatex = contenedor.createDiv({ cls: "obsi-math-latex" });
          panelLatex.style.cssText =
            "position:relative; width:50%; height:261px; padding:0; overflow:hidden;";

          // Área scrolleable horizontal. Conserva la clase para heredar el
          // tamaño de fuente de KaTeX (no se reduce ni se escala el contenido).
          // `justify-content:safe center` centra la fórmula cuando cabe y la
          // alinea al inicio (totalmente scrolleable) cuando desborda.
          const contenedorLatex = panelLatex.createDiv({ cls: "obsi-math-latex" });
          // overflow-x lo gestiona actualizarFade(): arranca en `hidden` y sólo
          // pasa a `auto` cuando hay desbordamiento real (ver tolerancia abajo).
          contenedorLatex.style.cssText =
            "width:100%; height:100%; padding:24px; box-sizing:border-box; " +
            "display:flex; align-items:center; justify-content:safe center; " +
            "overflow-x:hidden; overflow-y:hidden;";
          // Barra de scroll discreta: delgada y en tonos oscuros del plugin.
          contenedorLatex.style.scrollbarWidth = "thin";
          contenedorLatex.style.scrollbarColor = "#3a3a3a #1e1e1e";

          await MarkdownRenderer.render(
            this.app, "$$" + latex + "$$", contenedorLatex, ctx.sourcePath, this
          );

          // Overlay de fade en los bordes (no intercepta el ratón). Dos
          // gradientes laterales de rgba(30,30,30,0.85) → transparente, ~32px.
          const fadeOverlay = panelLatex.createDiv();
          fadeOverlay.style.cssText = "position:absolute; inset:0; pointer-events:none;";
          const fadeColor = "rgba(30, 30, 30, 0.85)";
          const fadeIzq = fadeOverlay.createDiv();
          fadeIzq.style.cssText =
            "position:absolute; top:0; bottom:0; left:0; width:32px; opacity:0; " +
            "transition:opacity 0.15s ease; " +
            `background:linear-gradient(to right, ${fadeColor}, transparent);`;
          const fadeDer = fadeOverlay.createDiv();
          fadeDer.style.cssText =
            "position:absolute; top:0; bottom:0; right:0; width:32px; opacity:0; " +
            "transition:opacity 0.15s ease; " +
            `background:linear-gradient(to left, ${fadeColor}, transparent);`;

          // Visibilidad de los fades según la posición de scroll:
          //  - sin desbordar           → ninguno
          //  - scrollLeft = 0          → solo derecho
          //  - intermedio              → ambos
          //  - scrollLeft = máximo     → solo izquierdo
          // KaTeX puede dejar 1–2px de desbordamiento sub-pixel aunque la fórmula
          // quepa de sobra (p.ej. x^{1000}); con overflow-x:auto eso bastaba para
          // que apareciera una barra de scroll espuria. Sólo consideramos que
          // desborda (y activamos scroll + fades) por encima de esta tolerancia.
          const TOLERANCIA_SCROLL = 3;
          const actualizarFade = () => {
            const max = contenedorLatex.scrollWidth - contenedorLatex.clientWidth;
            const desborda = max > TOLERANCIA_SCROLL;
            // La barra horizontal consume alto, no ancho, así que alternar
            // overflow-x no altera clientWidth ni provoca oscilación.
            contenedorLatex.style.overflowX = desborda ? "auto" : "hidden";
            const sl = contenedorLatex.scrollLeft;
            fadeIzq.style.opacity = desborda && sl > 0 ? "1" : "0";
            fadeDer.style.opacity = desborda && sl < max - 1 ? "1" : "0";
          };
          contenedorLatex.addEventListener("scroll", actualizarFade);

          // Rueda del ratón sobre la fórmula → scroll horizontal directo.
          // Movemos scrollLeft exactamente lo que indica la rueda y se detiene,
          // igual que las flechas de la scrollbar nativa: sin inercia ni rAF.
          contenedorLatex.addEventListener(
            "wheel",
            (e: WheelEvent) => {
              if (contenedorLatex.scrollWidth - contenedorLatex.clientWidth <= TOLERANCIA_SCROLL) return;
              e.preventDefault();
              // e.deltaY varía mucho según el dispositivo, así que limitamos el
              // desplazamiento por tick a ±40px (≈ un clic en las flechas de la
              // scrollbar nativa), conservando la dirección.
              const desplazamiento = e.deltaY + e.deltaX;
              contenedorLatex.scrollLeft +=
                Math.max(-40, Math.min(40, desplazamiento));
            },
            { passive: false }
          );

          // El layout de KaTeX no está medido hasta el siguiente frame; además
          // recalculamos al cambiar el tamaño de la ventana.
          requestAnimationFrame(actualizarFade);
          window.addEventListener("resize", actualizarFade);
          limpieza.register(() => window.removeEventListener("resize", actualizarFade));

          // Las fuentes matemáticas de KaTeX cargan de forma asíncrona: tras la
          // primera medida la fórmula se reajusta y cambia de ancho. Sin volver a
          // medir, el estado de desbordamiento (barra fina + fades) quedaba
          // obsoleto. Un ResizeObserver sobre el contenedor recalcula en cuanto
          // el ancho real cambia.
          const observadorLatex = new ResizeObserver(() => actualizarFade());
          observadorLatex.observe(contenedorLatex);
          limpieza.register(() => observadorLatex.disconnect());

// ── Motor gráfico ─────────────────────────
          // W se mide del tamaño real en pantalla (ver redimensionar()); 768 es
          // solo un valor inicial de respaldo. H es la altura fija del panel.
          let W = 768; const H = 261;
          const dpr = Math.ceil(window.devicePixelRatio || 1);
          const wrapGrafica = contenedor.createDiv({ cls: "obsi-math-grafica" });
          wrapGrafica.style.cssText = `position:relative; width:100%; height:${H}px;`;

          const canvasGL = wrapGrafica.createEl("canvas");
          const canvas2D = wrapGrafica.createEl("canvas");
          // Canvas dedicado al crosshair: capa superior independiente para poder
          // borrar y redibujar la línea del cursor sin tocar el overlay (ejes,
          // grid, etiquetas, asíntotas), que vive en canvas2D.
          const canvasCross = wrapGrafica.createEl("canvas");

          // Canvas GL: resolución física
          canvasGL.width = W * dpr; canvasGL.height = H * dpr;
          canvasGL.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%;`;

          // Canvas 2D overlay: misma resolución física, transparente
          canvas2D.width = W * dpr; canvas2D.height = H * dpr;
          canvas2D.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;`;

          // Canvas crosshair: encima de todo, transparente a eventos
          canvasCross.width = W * dpr; canvasCross.height = H * dpr;
          canvasCross.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;`;

          const gl = canvasGL.getContext("webgl", { antialias: true });
          const ctx2d = canvas2D.getContext("2d");
          const ctxCross = canvasCross.getContext("2d");

          // Libera el contexto WebGL al desmontar el bloque. Sin esto cada
          // re-render deja un contexto vivo hasta agotar el límite del navegador.
          if (gl) {
            limpieza.register(() =>
              gl.getExtension("WEBGL_lose_context")?.loseContext()
            );
          }

          const exprCompilada = parse(expr).compile();
const evalX = (x: number) => {
  try { return exprCompilada.evaluate({ x, ...FUNCIONES_INVERSAS_EXTRA }); } catch { return NaN; }
};

          // Funciones que no toman ningún valor real (log en base 1, 0/0,
          // sqrt(-1)…) no se grafican: se muestra una etiqueta formal en su
          // lugar. Esto también evita el motor de curva, que dibujaba asíntotas
          // falsas en estos casos. Caso aparte: el bloque vacío (sin expresión)
          // no es una indeterminación, sino que aún no hay nada que graficar; se
          // intercepta antes para mostrar un mensaje propio en vez de "Indeterminada".
          const degenerada: FuncionDegenerada | null = expr.trim() === ""
            ? {
                etiqueta: "Sin función",
                detalle: "Escribe una expresión matemática para graficar.",
              }
            : clasificarDegenerada(evalX);

          // Puntos notables (raíces, vértices e intersección con Y): se calculan
          // UNA sola vez y se reutilizan tanto para dibujarlos sobre el plano como
          // para listarlos en el cuadro de información de abajo. En funciones no
          // graficables (degeneradas) no hay nada que analizar.
          const analisis = degenerada
            ? { raices: [] as number[], vertices: [] as Vertice[] }
            : analizarFuncion(evalX);
          const interseccionY = evalX(0);
          // Estado de cada grupo (normal / infinitas / demasiadas), calculado una
          // sola vez y reutilizado por la gráfica, el botón de resumen y el panel.
          // Las trigonométricas (sin/cos/tan/sec/csc/cot) con puntos notables se
          // consideran con infinitos; el resto se rige por el umbral de cantidad.
          const esTrig = tieneTrigonometria(expr);
          const estadoRaices = estadoGrupo(analisis.raices.length, esTrig);
          const estadoVertices = estadoGrupo(analisis.vertices.length, esTrig);
          const puntosNotables = construirPuntosNotables(
            analisis, interseccionY, estadoRaices, estadoVertices
          );

          if (!gl || !ctx2d || !ctxCross) {
            wrapGrafica.createEl("p", { text: "Error: WebGL no disponible" });
          } else {
            // La escala dpr del contexto 2D se aplica en redimensionar(), porque
            // cada vez que se reasigna canvas2D.width el transform se reinicia.

            let domX: [number, number] = [-7, 7];
            let domY: [number, number] = [-7, 7];

            // Posición del cursor en píxeles CSS dentro del canvas (null = fuera).
            // Se guardan X e Y: X mueve el crosshair vertical; (X,Y) sirve para
            // detectar cuándo el cursor pasa por encima/cerca de un punto notable
            // y mostrar entonces su etiqueta de coordenadas.
            let cursorPx: number | null = null;
            let cursorPy: number | null = null;

            const sx = (x: number) => ((x - domX[0]) / (domX[1] - domX[0])) * W;
            const sy = (y: number) => H - ((y - domY[0]) / (domY[1] - domY[0])) * H;

            // Genera ticks "bonitos" para un rango dado
            const generarTicks = (min: number, max: number, maxTicks = 10): number[] => {
              const rango = max - min;
              const paso = Math.pow(10, Math.floor(Math.log10(rango / maxTicks)));
              const pasos = [1, 2, 5, 10].map(m => m * paso);
              const pasoFinal = pasos.find(p => rango / p <= maxTicks) ?? pasos[pasos.length - 1];
              const ticks: number[] = [];
              const inicio = Math.ceil(min / pasoFinal) * pasoFinal;
              for (let t = inicio; t <= max + 1e-9; t += pasoFinal)
                ticks.push(parseFloat(t.toPrecision(10)));
              return ticks;
            };

            const formatearNumero = (n: number): string => {
              if (Math.abs(n) < 1e-9) return "0";
              if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0))
                return n.toExponential(1);
              return parseFloat(n.toPrecision(4)).toString();
            };

            // En `x`, evalX devolvió ±Infinity. ¿Es un DESBORDAMIENTO numérico
            // (la función vale un número finito pero mayor que el máximo de un
            // double, ~1.8·10³⁰⁸ —p.ej. x^10000 ≈ 10⁵⁸⁰⁶, que NO es infinito) o
            // una DIVERGENCIA real (polo: tan x, 1/(x-2), donde el límite sí es
            // ±∞)? Mismo criterio que el motor de curva: alejándose del origen
            // (hacia |x| mayor), un overflow de función creciente sigue infinito
            // hasta el borde; un polo vuelve a valores finitos pasada la
            // singularidad. Escaneamos sólo hacia afuera para no cruzar la zona
            // central finita (x^10000 es finita en |x|<1.08).
            const esDesbordamiento = (x: number): boolean => {
              const dir = Math.sign(x) || 1;
              const borde = dir > 0 ? domX[1] : domX[0];
              const PASOS = 14;
              const paso = (borde - x) / PASOS;
              if (Math.abs(paso) < 1e-12) return false;
              for (let k = 1; k <= PASOS; k++) {
                if (Number.isFinite(evalX(x + k * paso))) return false; // polo
              }
              return true; // infinito hasta el borde alejándose → overflow
            };

            // Marcador circular reutilizable: anillo exterior tenue + disco
            // interior de color. Lo comparten el crosshair (azul) y los puntos
            // notables (naranja). El radio es en PÍXELES, así que su tamaño visual
            // se mantiene constante con el zoom.
            const dibujarPuntoMarcador = (
              ctx: CanvasRenderingContext2D,
              px: number,
              py: number,
              color: string
            ) => {
              ctx.save();
              // Borde exterior tenue para dar profundidad
              ctx.beginPath();
              ctx.arc(px, py, 4.5, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
              ctx.fill();
              // Disco interior del color indicado
              ctx.beginPath();
              ctx.arc(px, py, 3, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.restore();
            };

            // Crosshair vertical que sigue al cursor. Se dibuja en su propio
            // canvas (canvasCross), por encima del overlay, de modo que limpiarlo
            // y redibujarlo no afecta ejes, grid, etiquetas ni asíntotas.
            const dibujarCrosshair = (cursorX: number | null) => {
              ctxCross.clearRect(0, 0, W, H);
              // Función no graficable: plano vacío, sin crosshair (no hay curva
              // que seguir). El zoom/pan sigue funcionando igual.
              if (degenerada || cursorX === null) return;

              ctxCross.save();

              // Línea vertical punteada de arriba a abajo
              ctxCross.setLineDash([4, 6]);
              ctxCross.strokeStyle = "rgba(100, 150, 255, 0.4)";
              ctxCross.lineWidth = 1;
              ctxCross.beginPath();
              ctxCross.moveTo(cursorX, 0);
              ctxCross.lineTo(cursorX, H);
              ctxCross.stroke();
              ctxCross.setLineDash([]);

              // Valor matemático de X y su imagen f(x)
              const xMath = domX[0] + (cursorX / W) * (domX[1] - domX[0]);
              const yMath = evalX(xMath);

              // Punto en la intersección de la línea con la curva
              if (Number.isFinite(yMath)) {
                const py = sy(yMath);
                if (py >= 0 && py <= H) {
                  // Mismo marcador que los puntos notables, en azul (color de la curva).
                  dibujarPuntoMarcador(ctxCross, cursorX, py, "rgba(80, 160, 255, 1.0)");
                }
              }

              // Texto a la derecha de la línea salvo cerca del borde derecho
              const aLaDerecha = cursorX < W * 0.75;
              ctxCross.textAlign = aLaDerecha ? "left" : "right";
              ctxCross.textBaseline = "top";
              ctxCross.font = "11px monospace";
              const tx = cursorX + (aLaDerecha ? 5 : -5);

              ctxCross.fillStyle = "rgba(200, 210, 255, 0.9)";
              ctxCross.fillText(`x = ${formatearNumero(xMath)}`, tx, 4);

              let textoY: string;
              if (Number.isFinite(yMath)) {
                textoY = `f(x) = ${formatearNumero(yMath)}`;
              } else if (yMath === Infinity || yMath === -Infinity) {
                // Distinguir overflow (valor finito fuera de rango) de divergencia.
                if (esDesbordamiento(xMath)) {
                  // Cota rigurosa: cualquier valor que desborda supera el máximo
                  // representable (≈1.8·10³⁰⁸ > 10³⁰⁸). NO es infinito: es finito
                  // pero demasiado grande para representarlo.
                  textoY = yMath < 0 ? "f(x) < -10³⁰⁸" : "f(x) > 10³⁰⁸";
                } else {
                  // Polo real: la notación de límite es lo formalmente correcto;
                  // la función no "vale" ∞, tiende a ±∞.
                  textoY = `f(x) → ${yMath < 0 ? "-∞" : "+∞"}`;
                }
              } else {
                textoY = "f(x) = indef.";
              }
              ctxCross.fillText(textoY, tx, 18);

              // Etiquetas de puntos notables SOLO al pasar el cursor por encima o
              // muy cerca. Se dibujan aquí (canvasCross) porque esta capa se
              // repinta en cada movimiento del ratón, a diferencia del overlay.
              if (cursorPy !== null) {
                const RADIO_HOVER = 16; // px de cercanía para "activar" la etiqueta
                const colocadas: RectEtiqueta[] = [];
                for (const p of puntosNotables) {
                  const px = sx(p.x);
                  const py = sy(p.y);
                  if (px < 0 || px > W || py < 0 || py > H) continue;
                  if (Math.hypot(px - cursorX, py - cursorPy) > RADIO_HOVER) continue;
                  dibujarEtiquetaPunto(
                    ctxCross, px, py,
                    `(${formatearNumero(p.x)}, ${formatearNumero(p.y)})`,
                    colocadas
                  );
                }
              }

              ctxCross.restore();
            };

            const COLOR_PUNTO_NOTABLE = "rgba(255, 160, 40, 1.0)";

            type RectEtiqueta = { x0: number; y0: number; x1: number; y1: number };
            const solapanRect = (a: RectEtiqueta, b: RectEtiqueta) =>
              !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);

            // Dibuja la etiqueta de coordenadas de un punto: prueba varias
            // posiciones candidatas y elige la primera que cabe en el plano y no
            // se solapa con otra etiqueta ya colocada (anti-superposición cuando
            // dos puntos quedan muy juntos). Si ninguna cabe, no dibuja nada.
            // Estética tipo Desmos: fondo oscuro semitransparente + texto naranja.
            const dibujarEtiquetaPunto = (
              ctx: CanvasRenderingContext2D,
              px: number, py: number, texto: string, colocadas: RectEtiqueta[]
            ) => {
              ctx.save();
              ctx.font = "11px monospace";
              ctx.textBaseline = "middle";
              const ancho = ctx.measureText(texto).width;
              const PAD = 3;
              const candidatos: { dx: number; dy: number; align: CanvasTextAlign }[] = [
                { dx: 9, dy: -9, align: "left" },
                { dx: 9, dy: 11, align: "left" },
                { dx: -9, dy: -9, align: "right" },
                { dx: -9, dy: 11, align: "right" },
              ];
              for (const c of candidatos) {
                const tx = px + c.dx;
                const ty = py + c.dy;
                const x0 = (c.align === "left" ? tx : tx - ancho) - PAD;
                const rect: RectEtiqueta = { x0, y0: ty - 8, x1: x0 + ancho + 2 * PAD, y1: ty + 8 };
                if (rect.x0 < 0 || rect.x1 > W || rect.y0 < 0 || rect.y1 > H) continue;
                if (colocadas.some(r => solapanRect(r, rect))) continue;
                colocadas.push(rect);
                ctx.fillStyle = "rgba(18, 18, 18, 0.7)";
                ctx.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
                ctx.textAlign = c.align;
                ctx.fillStyle = "rgba(255, 200, 130, 0.95)";
                ctx.fillText(texto, tx, ty);
                break;
              }
              ctx.restore();
            };

            // Marcadores de puntos notables (raíces, vértices e intersección Y)
            // sobre el plano, en el Canvas 2D (junto a ejes y grid). Respetan
            // pan/zoom vía sx/sy, mantienen tamaño constante (radio en píxeles) y
            // se omiten si caen fuera del viewport. SOLO el marcador: la etiqueta
            // de coordenadas se muestra al pasar el cursor cerca (ver crosshair).
            const dibujarPuntosNotables = () => {
              if (degenerada || puntosNotables.length === 0) return;
              for (const p of puntosNotables) {
                const px = sx(p.x);
                const py = sy(p.y);
                if (px < 0 || px > W || py < 0 || py > H) continue; // fuera del viewport
                dibujarPuntoMarcador(ctx2d, px, py, COLOR_PUNTO_NOTABLE);
              }
            };

            const dibujarOverlay = () => {
              ctx2d.clearRect(0, 0, W, H);

              const ticksX = generarTicks(domX[0], domX[1]);
              const ticksY = generarTicks(domY[0], domY[1]);

              // Grid tenue
              ctx2d.strokeStyle = "rgba(130,130,150,0.12)";
              ctx2d.lineWidth = 0.5;
              for (const x of ticksX) {
                ctx2d.beginPath(); ctx2d.moveTo(sx(x), 0); ctx2d.lineTo(sx(x), H); ctx2d.stroke();
              }
              for (const y of ticksY) {
                ctx2d.beginPath(); ctx2d.moveTo(0, sy(y)); ctx2d.lineTo(W, sy(y)); ctx2d.stroke();
              }

              // Ejes principales
              ctx2d.strokeStyle = "rgba(160,160,170,0.7)";
              ctx2d.lineWidth = 1;
              if (domY[0] <= 0 && domY[1] >= 0) {
                ctx2d.beginPath(); ctx2d.moveTo(0, sy(0)); ctx2d.lineTo(W, sy(0)); ctx2d.stroke();
              }
              if (domX[0] <= 0 && domX[1] >= 0) {
                ctx2d.beginPath(); ctx2d.moveTo(sx(0), 0); ctx2d.lineTo(sx(0), H); ctx2d.stroke();
              }

              // Etiquetas
              ctx2d.fillStyle = "rgba(160,160,170,0.85)";
              ctx2d.font = `${11}px monospace`;

              const ceroY = Math.max(4, Math.min(H - 4, sy(0)));
              const ceroX = Math.max(4, Math.min(W - 4, sx(0)));

              ctx2d.textAlign = "center";
              ctx2d.textBaseline = "top";
              for (const x of ticksX) {
                if (Math.abs(x) < 1e-9) continue;
                const px = sx(x);
                if (px < 10 || px > W - 10) continue;
                // tick mark
                ctx2d.strokeStyle = "rgba(160,160,170,0.5)";
                ctx2d.lineWidth = 0.75;
                ctx2d.beginPath(); ctx2d.moveTo(px, ceroY - 3); ctx2d.lineTo(px, ceroY + 3); ctx2d.stroke();
                ctx2d.fillText(formatearNumero(x), px, ceroY + 5);
              }

              ctx2d.textAlign = "right";
              ctx2d.textBaseline = "middle";
              for (const y of ticksY) {
                if (Math.abs(y) < 1e-9) continue;
                const py = sy(y);
                if (py < 10 || py > H - 10) continue;
                ctx2d.strokeStyle = "rgba(160,160,170,0.5)";
                ctx2d.lineWidth = 0.75;
                ctx2d.beginPath(); ctx2d.moveTo(ceroX - 3, py); ctx2d.lineTo(ceroX + 3, py); ctx2d.stroke();
                ctx2d.fillText(formatearNumero(y), ceroX - 6, py);
              }

              // Puntos notables encima de ejes/grid (en el mismo Canvas 2D).
              dibujarPuntosNotables();

              // Redibuja el crosshair tras cada repintado del overlay (zoom/pan/
              // resize) para que refleje el nuevo dominio si el cursor sigue dentro.
              dibujarCrosshair(cursorPx);
            };

            const programa = crearPrograma(gl);
            const aPos = gl.getAttribLocation(programa, "a_pos");
            const uColor = gl.getUniformLocation(programa, "u_color");
            const buffer = gl.createBuffer()!;

            const aspectoInicial = (domY[1] - domY[0]) / (domX[1] - domX[0]);

const dibujarCurvaGL = (motivo: "inicio" | "zoom" | "pan") => {
  obsMathUpdateCount++;
  console.log('Actualizaciones motor gráfico (obs-graph): ' + obsMathUpdateCount);
  gl.viewport(0, 0, W * dpr, H * dpr);
  gl.clearColor(0.118, 0.118, 0.118, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  // Función no graficable: plano vacío (sin curva ni asíntotas). El overlay de
  // ejes/grid sí se dibuja (dibujarOverlay) y el zoom/pan sigue activo.
  if (degenerada) return;
  gl.useProgram(programa);
  gl.uniform4f(uColor, 0.31, 0.62, 1.0, 1.0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const cx = (x: number) => ((x - domX[0]) / (domX[1] - domX[0])) * 2 - 1;
const cy = (y: number) => ((y - domY[0]) / (domY[1] - domY[0])) * 2 - 1;

const interactivo = (motivo === "pan" || motivo === "zoom");
const MUESTRAS = interactivo
  ? Math.min(2000, Math.max(1000, Math.floor((domX[1] - domX[0]) * 20)))
  : Math.min(8000, Math.max(2000, Math.floor((domX[1] - domX[0]) * 50)));
const dx = (domX[1] - domX[0]) / MUESTRAS;
const GROSOR_CLIP = 0.004;

const SALTO_PX_MAX = 8;   // si dos puntos saltan más de 8px en Y, refinamos
// En movimiento bisecamos poco (rápido, suficiente para que la línea no
// desaparezca); en la pasada final refinamos a fondo para precisión al pixel.
const PROF_MAX = interactivo ? 8 : 18;

let segmento: number[] = [];

const flush = () => {
  if (segmento.length < 4) { segmento = []; return; }
  const quads = construirQuadStrip(segmento, GROSOR_CLIP);
  if (quads.length === 0) { segmento = []; return; }
  gl.bufferData(gl.ARRAY_BUFFER, quads, gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, quads.length / 2);
  segmento = [];
};

// Emite un punto recortando valores extremos: deja que salga del viewport
// (para tocar el borde) pero sin generar geometría astronómica.
const emit = (x: number, y: number) => {
  // Recorta en CLIP SPACE, no en coordenadas de datos. El viewport visible es
  // clip-y ∈ [-1, 1]; recortar a ±3 tapa de sobra el borde y mantiene la
  // geometría numéricamente sana (sin esto, lejos del eje X los valores clip
  // se disparan a miles y construirQuadStrip degenera los quads).
  let cyVal = cy(y);
  if (!Number.isFinite(cyVal)) cyVal = y > 0 ? 3 : -3;
  cyVal = Math.max(-3, Math.min(3, cyVal));
  segmento.push(cx(x), cyVal);
};
// Emite un punto en el polo forzándolo al borde (±3 en clip) según hacia dónde
// dispara la rama. El signo de y da la dirección. Así la rama TREPA hasta el
// borde aunque la última muestra finita no sea enorme (bisección poco profunda
// o presupuesto bajo). Es la idea de function-plot, pero por signo en vez de
// por magnitud, para no depender de que `ya` ya sea gigantesco.
const emitPolo = (x: number, y: number) => {
  segmento.push(cx(x), y >= 0 ? 3 : -3);
};
const dibujarAsintota = (xa: number) => {
  const px = sx(xa);
  if (px < 0 || px > W) return;
  ctx2d.save();
  ctx2d.setLineDash([4, 6]);
  ctx2d.strokeStyle = "rgba(100, 150, 255, 0.3)";
  ctx2d.lineWidth = 1;
  ctx2d.beginPath(); ctx2d.moveTo(px, 0); ctx2d.lineTo(px, H); ctx2d.stroke();
  ctx2d.restore();
};

// Distingue un DESBORDAMIENTO numérico (overflow) de una asíntota vertical real.
// Funciones que crecen sin límite —x^1000, x^6000…— superan el máximo de un
// double (~1.8e308) y mathjs devuelve Infinity, pero NO tienen ningún polo: el
// valor es finito en todo punto, sólo que ya no cabe. Firma del overflow: una
// vez que la función se vuelve infinita hacia un lado, SIGUE infinita hasta el
// borde del dominio. Un polo real (1/(x-a), tan x…) vuelve a valores finitos
// pasada la singularidad. Escanea desde el extremo infinito hacia el borde; si
// reaparece un valor finito es un polo, si no, es overflow. Sólo se invoca en
// discontinuidades, así que el coste es marginal.
const esOverflowPersistente = (xInf: number, xFin: number): boolean => {
  const dir = Math.sign(xInf - xFin) || 1;
  const borde = dir > 0 ? domX[1] : domX[0];
  const PASOS = 16;
  const paso = (borde - xInf) / PASOS;
  if (Math.abs(paso) < 1e-12) return false;
  for (let k = 1; k <= PASOS; k++) {
    if (Number.isFinite(evalX(xInf + k * paso))) return false; // vuelve finita → polo real
  }
  return true; // infinita hasta el borde → overflow, sin asíntota
};

// Detecta asíntotas de la MISMA rama (ambos lados → +∞, o ambos → -∞: 1/x²,
// x^{-4}…). El motor de curva (`cruza`) solo capta polos de ramas OPUESTAS; los
// de la misma rama dependían de muestrear justo la singularidad y desaparecían al
// hacer pan/zoom. Aquí se detectan con un escaneo propio, INDEPENDIENTE del
// muestreo de la curva, por su firma topológica robusta: |f| tiene un MÁXIMO
// LOCAL que DIVERGE. Una función solo empinada (x^31) es monótona y nunca tiene
// ese máximo interior, así que no se confunde. La posición se afina buscando el
// máximo de |f| (búsqueda ternaria → el polo). Devuelve las x dentro del dominio.
const detectarAsintotasMismaRama = (): number[] => {
  const out: number[] = [];
  const N = 500;
  const paso = (domX[1] - domX[0]) / N;
  // El candidato debe estar FUERA de pantalla (mayor que el |y| visible). El
  // filtro fino (divergencia real) lo hace la confirmación de abajo.
  const UMBRAL = Math.max(Math.abs(domY[0]), Math.abs(domY[1]));

  // Afinar la posición del polo en [xIzq, xDer] (ternaria → máximo de |f|) y, si
  // realmente diverge, registrarlo. Un polo algebraico alcanza magnitudes
  // astronómicas (>1e10) en la muestra o en el máximo afinado; un pico acotado o
  // una parábola escalada normal no, así que no se confunden.
  const registrar = (xIzq: number, xDer: number, aRef: number) => {
    let lo = xIzq, hi = xDer;
    for (let k = 0; k < 60; k++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (Math.abs(evalX(m1)) < Math.abs(evalX(m2))) lo = m1; else hi = m2;
    }
    const xPolo = (lo + hi) / 2;
    const aPolo = Math.abs(evalX(xPolo));
    const diverge = !Number.isFinite(aPolo) || Math.max(aRef, aPolo) > 1e10;
    if (diverge && !out.some(p => Math.abs(p - xPolo) < paso)) out.push(xPolo);
  };

  let xA = domX[0], yA = evalX(xA);
  let xB = xA + paso, yB = evalX(xB);
  for (let i = 2; i <= N; i++) {
    const xC = domX[0] + i * paso;
    const yC = evalX(xC);

    if ((yB === Infinity || yB === -Infinity) &&
        Number.isFinite(yA) && Number.isFinite(yC) &&
        Math.sign(yA) === Math.sign(yC)) {
      // Una muestra cayó JUSTO en la singularidad (1/0 = ±Infinity). Misma rama
      // si ambos lados comparten signo. (NaN se ignora: borde de dominio, no polo.)
      registrar(xA, xC, Math.max(Math.abs(yA), Math.abs(yC)));
    } else if (Number.isFinite(yA) && Number.isFinite(yB) && Number.isFinite(yC)) {
      const aB = Math.abs(yB);
      // yB máximo local de |f|, mismo signo a ambos lados (misma rama) y fuera de
      // pantalla. Una función monótona (x^31) no tiene este máximo interior.
      const maxLocal =
        Math.abs(yA) <= aB && aB >= Math.abs(yC) && aB > UMBRAL &&
        Math.sign(yA) === Math.sign(yB) && Math.sign(yB) === Math.sign(yC);
      if (maxLocal) registrar(xA, xC, aB);
    }
    xA = xB; yA = yB; xB = xC; yB = yC;
  }
  return out;
};
const asintotasMismaRama = detectarAsintotasMismaRama();

// Procesa el intervalo (xa, xb]. NO emite (xa,ya): lo asume ya emitido.
// Subdivide donde la pendiente en píxeles es grande y CORTA al localizar un polo.
const tramo = (xa: number, ya: number, xb: number, yb: number, prof: number) => {
  const finA = Number.isFinite(ya), finB = Number.isFinite(yb);
  const pyA = finA ? sy(ya) : (ya > 0 ? -1e7 : 1e7);
  const pyB = finB ? sy(yb) : (yb > 0 ? -1e7 : 1e7);
  const saltoPx = Math.abs(pyB - pyA);

  // No subdividir cuando AMBOS extremos quedan fuera del MISMO lado del viewport
  // (ambos por encima del tope o ambos por debajo del piso): entre ellos la curva
  // no entra en la banda visible, así que refinar no aporta detalle y, para
  // funciones muy empinadas (p.ej. x^(3^pi) ≈ x^31.5), dispara una recursión
  // exponencial que congela Obsidian y desborda los arrays ("Invalid array
  // length"). Un POLO deja un extremo arriba y el otro abajo (caso `cruza`), que
  // NO cae aquí y se sigue refinando para localizarlo; y la zona de transición
  // (un extremo dentro, otro fuera) también se sigue refinando, de forma lineal.
  const fueraMismoLado =
    (ya > domY[1] && yb > domY[1]) || (ya < domY[0] && yb < domY[0]);

  // ¿Cae en este tramo una asíntota de la MISMA rama ya detectada (lista
  // precalculada robusta)? Si es así, hay que CORTAR la curva ahí aunque ambos
  // extremos estén fuera por el mismo lado. Refinar hacia ella la localiza para
  // que las dos ramas trepen pegadas al polo. La rama que NO contiene el polo no
  // cumple esta condición y deja de refinar (sin recursión desbocada en x^31).
  const poloAqui =
    fueraMismoLado &&
    asintotasMismaRama.some(p => p > Math.min(xa, xb) && p < Math.max(xa, xb));

  // Refinamos mientras el salto en pantalla sea grande y algún extremo entre en la
  // banda visible (!fueraMismoLado); o, aun fuera por el mismo lado, cuando hay una
  // asíntota de la misma rama que localizar (poloAqui). Refinar a ciegas con ambos
  // extremos fuera dispararía una recursión exponencial en funciones muy empinadas.
  const refinar =
    prof < PROF_MAX && (poloAqui || (saltoPx > SALTO_PX_MAX && !fueraMismoLado));
  if (refinar) {
    const xm = (xa + xb) / 2;
    const ym = evalX(xm);
    tramo(xa, ya, xm, ym, prof + 1);
    tramo(xm, ym, xb, yb, prof + 1);
    return;
  }

  // Caso base. Hay discontinuidad si un extremo es no-finito, si el tramo entra por
  // arriba del viewport y sale por abajo (o viceversa: `cruza`), o si contiene una
  // asíntota de la misma rama ya acotada por la recursión (`poloMismoLado`).
  const cruza = (ya > domY[1] && yb < domY[0]) || (ya < domY[0] && yb > domY[1]);
  const algunNoFinito = !finA || !finB;
  const poloMismoLado = poloAqui && finA && finB && !cruza;
  if (cruza || algunNoFinito || poloMismoLado) {
    // Distinguir un POLO real (asíntota vertical: la función DIVERGE, |f|→∞) de
    // un BORDE DE DOMINIO (f indefinida a un lado pero con límite finito, p.ej.
    // sqrt(x) o x^8.82 en x=0, que NO son asíntotas).
    //
    // `cruza` (ambos extremos finitos en lados opuestos del viewport) ya es un
    // polo claro. Si hay un lado indefinido (NaN/∞) y el otro finito, NO basta
    // con mirar si el lado finito quedó fuera del viewport: con la vista
    // desplazada del eje X un valor finito acotado (p.ej. 0) cae "fuera" sin que
    // la función diverja (este era el bug del falso polo con la vista subida).
    // Por eso, además de exigir que el lado finito esté fuera, SONDEAMOS un punto
    // más adentro de la rama definida: si al acercarse al borde |f| crece es polo;
    // si decrece (converge a un límite) es borde de dominio. El sondeo es barato
    // (sólo ocurre en discontinuidades) e independiente de dónde esté la vista.
    let esPolo = cruza || poloMismoLado;
    if (!esPolo && finA !== finB) {
      const xf = finA ? xa : xb;
      const yf = finA ? ya : yb;
      const xn = finA ? xb : xa;
      const fueraView = yf > domY[1] || yf < domY[0];
      if (fueraView) {
        const yp = evalX(xf + 8 * (xf - xn)); // más adentro de la rama definida
        esPolo = !Number.isFinite(yp) || Math.abs(yf) > Math.abs(yp);
      }
    }

    // Descarta el falso polo por desbordamiento numérico (x^1000, x^6000…). Sólo
    // aplica cuando el lado no-finito es Infinity (overflow de un valor real):
    // un NaN es un borde de dominio (log, sqrt) que SÍ puede tener asíntota
    // legítima (log x → -∞ en 0⁺), y esos se dejan intactos.
    if (esPolo && !cruza && finA !== finB) {
      const yInf = finA ? yb : ya;
      if (yInf === Infinity || yInf === -Infinity) {
        const xInf = finA ? xb : xa;
        const xFin = finA ? xa : xb;
        if (esOverflowPersistente(xInf, xFin)) esPolo = false;
      }
    }

    if (esPolo) {
      if (finA) { emit(xa, ya); emitPolo(xa, ya); }   // trepa hasta el borde por la izquierda
      // La asíntota de misma rama (poloMismoLado) se dibuja aparte con posición
      // precisa (lista precalculada); aquí solo se dibuja la de ramas opuestas.
      if (!poloMismoLado) dibujarAsintota((xa + xb) / 2);
      flush();                                        // CORTE: rompe la curva
      if (finB) { emitPolo(xb, yb); emit(xb, yb); }   // baja desde el borde por la derecha
    } else {
      // Borde de dominio o hueco acotado: corta la curva SIN dibujar asíntota,
      // dejando que la rama definida llegue hasta el borde.
      if (finA) emit(xa, ya);
      flush();
      if (finB) emit(xb, yb);
    }
  } else {
    emit(xb, yb);
  }
};

// Muestreo uniforme grueso + refinamiento adaptativo.
let x0 = domX[0];
let y0 = evalX(x0);
if (Number.isFinite(y0)) emit(x0, y0);
for (let i = 1; i <= MUESTRAS; i++) {
  const x1 = domX[0] + i * dx;
  const y1 = evalX(x1);
  tramo(x0, y0, x1, y1, 0);
  x0 = x1; y0 = y1;
}
flush();

// Asíntotas de la misma rama (posición precisa del escaneo dedicado). Estables
// en pan/zoom porque no dependen de que una muestra caiga sobre la singularidad.
for (const xp of asintotasMismaRama) dibujarAsintota(xp);
};

// Ajusta la resolución interna de ambos canvas al tamaño REAL que ocupan en
// pantalla. Sin esto, el bitmap (768px de ancho) se estira al ancho del panel y
// aplasta horizontalmente el texto y el plano. Se llama al inicio y cada vez que
// el panel cambia de tamaño.
let dibujado = false;
const redimensionar = () => {
  const ancho = Math.max(1, Math.round(wrapGrafica.clientWidth || W));
  if (dibujado && ancho === W) return;
  W = ancho;
  dibujado = true;
  canvasGL.width = W * dpr; canvasGL.height = H * dpr;
  canvas2D.width = W * dpr; canvas2D.height = H * dpr;
  canvasCross.width = W * dpr; canvasCross.height = H * dpr;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctxCross.setTransform(dpr, 0, 0, dpr, 0, 0);
  dibujarOverlay();
  dibujarCurvaGL("inicio");
};
redimensionar();
const observadorTamano = new ResizeObserver(() => redimensionar());
observadorTamano.observe(wrapGrafica);
limpieza.register(() => observadorTamano.disconnect());

// Función no graficable: el plano queda interactivo (zoom/pan) pero vacío y
// oscurecido, con la etiqueta formal flotando delante. Ambas capas no
// interceptan el ratón (pointer-events:none), así que la interacción con el
// plano sigue igual que siempre.
if (degenerada) {
  const velo = wrapGrafica.createDiv();
  velo.style.cssText =
    "position:absolute; inset:0; background:rgba(18,18,18,0.55); " +
    "pointer-events:none;";

  const msg = wrapGrafica.createDiv();
  msg.style.cssText =
    "position:absolute; inset:0; display:flex; flex-direction:column; " +
    "align-items:center; justify-content:center; text-align:center; " +
    "gap:8px; padding:24px; box-sizing:border-box; pointer-events:none;";
  const titulo = msg.createDiv({ text: degenerada.etiqueta });
  titulo.style.cssText =
    "font-size:20px; font-weight:600; color:rgba(200,210,255,0.95);";
  const detalle = msg.createDiv({ text: degenerada.detalle });
  detalle.style.cssText =
    "font-size:12px; line-height:1.4; max-width:320px; " +
    "color:rgba(190,195,210,0.85);";
}

          // ── Zoom / Pan ─────────────────────────
            let isDragging = false;
            let lastPointer = { x: 0, y: 0 };

            let rafPendiente = false;
let motivoPendiente: "zoom" | "pan" = "pan";

const programarRedibujo = (motivo: "zoom" | "pan") => {
  // zoom tiene prioridad sobre pan
  if (motivo === "zoom") motivoPendiente = "zoom";
  else if (!rafPendiente) motivoPendiente = "pan";
  
  if (!rafPendiente) {
    rafPendiente = true;
    requestAnimationFrame(() => {
      rafPendiente = false;
      dibujarOverlay();
      dibujarCurvaGL(motivoPendiente);
      motivoPendiente = "pan";
    });
  }
};

let timerFinal: number | null = null;
limpieza.register(() => { if (timerFinal !== null) clearTimeout(timerFinal); });
const programarFinal = () => {
  if (timerFinal !== null) clearTimeout(timerFinal);
  timerFinal = window.setTimeout(() => {
    timerFinal = null;
    dibujarOverlay();
    dibujarCurvaGL("inicio");   // pasada completa, máxima calidad
  }, 150);
};

canvasGL.addEventListener("pointerdown", e => {
  isDragging = true;
  lastPointer = { x: e.offsetX, y: e.offsetY };
  // Durante el arrastre el crosshair no se muestra: lo borramos al empezar.
  cursorPx = null;
  cursorPy = null;
  dibujarCrosshair(null);
  canvasGL.setPointerCapture(e.pointerId);
});

// Crosshair: sólo cuando no se está arrastrando (separado del pan).
canvasGL.addEventListener("pointermove", e => {
  if (isDragging) return;
  cursorPx = e.offsetX;
  cursorPy = e.offsetY;
  dibujarCrosshair(e.offsetX);
});

canvasGL.addEventListener("pointerleave", () => {
  cursorPx = null;
  cursorPy = null;
  dibujarCrosshair(null);
});

canvasGL.addEventListener("pointermove", e => {
  if (!isDragging) return;
  const dx = e.offsetX - lastPointer.x;
  const dy = e.offsetY - lastPointer.y;
  lastPointer = { x: e.offsetX, y: e.offsetY };
  const rx = (domX[1] - domX[0]) / W;
  const ry = (domY[1] - domY[0]) / H;
  domX = [domX[0] - dx * rx, domX[1] - dx * rx];
  domY = [domY[0] + dy * ry, domY[1] + dy * ry];
  programarRedibujo("pan");
});

canvasGL.addEventListener("pointerup", e => {
  isDragging = false;
  canvasGL.releasePointerCapture(e.pointerId);
  programarFinal();             // al soltar el arrastre, refina
});

canvasGL.addEventListener("wheel", e => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 1.05 : 0.95;
  const mx = domX[0] + (e.offsetX / W) * (domX[1] - domX[0]);
  const my = domY[1] - (e.offsetY / H) * (domY[1] - domY[0]);
  domX = [mx + (domX[0] - mx) * factor, mx + (domX[1] - mx) * factor];
  domY = [my + (domY[0] - my) * factor, my + (domY[1] - my) * factor];
  programarRedibujo("zoom");
  programarFinal();             // cada rueda reinicia el debounce; al parar, refina
}, { passive: false });
            // ── Fin zoom/pan ───────────────────────
          } // cierre del else (WebGL disponible)
          // ── Fin motor gráfico ──────────────────────

          // ── Botón de resumen de puntos notables ──
          // El panel inferior (.obsi-math-info) está oculto por CSS, así que
          // cuando un grupo (raíces o vértices) NO está en estado normal —periódico
          // ("infinitas") o excesivo ("demasiadas"), por lo que no se dibujan sus
          // marcadores para no saturar el plano— el resumen se ofrece en un pequeño
          // botón ⓘ sobre la gráfica. Al pulsarlo muestra/oculta un popover.
          const msgRaices =
            estadoRaices === "infinitas" ? "Raíces: infinitas"
            : estadoRaices === "demasiadas" ? "Raíces: demasiadas para mostrar"
            : null;
          const msgVertices =
            estadoVertices === "infinitas" ? "Vértices: infinitos"
            : estadoVertices === "demasiadas" ? "Vértices: demasiados para mostrar"
            : null;
          if (msgRaices || msgVertices) {
            const btnResumen = wrapGrafica.createDiv({ text: "ⓘ" });
            btnResumen.setAttribute("title", "Resumen de puntos notables");
            btnResumen.style.cssText =
              "position:absolute; bottom:8px; right:8px; width:22px; height:22px; " +
              "display:flex; align-items:center; justify-content:center; " +
              "font-size:14px; line-height:1; color:rgba(255,200,130,0.95); " +
              "background:rgba(30,30,30,0.85); border:1px solid rgba(255,160,40,0.5); " +
              "border-radius:50%; cursor:pointer; user-select:none; z-index:5;";

            const popResumen = wrapGrafica.createDiv();
            popResumen.style.cssText =
              "position:absolute; bottom:36px; right:8px; display:none; " +
              "max-width:230px; padding:8px 10px; box-sizing:border-box; " +
              "background:rgba(20,20,20,0.95); border:1px solid rgba(255,255,255,0.12); " +
              "border-radius:6px; font-size:11px; line-height:1.5; white-space:nowrap; " +
              "color:rgba(230,230,235,0.92); z-index:5; " +
              "box-shadow:0 4px 12px rgba(0,0,0,0.4);";

            if (msgRaices) popResumen.createEl("div", { text: msgRaices });
            if (msgVertices) popResumen.createEl("div", { text: msgVertices });

            btnResumen.addEventListener("click", e => {
              e.stopPropagation();
              popResumen.style.display = popResumen.style.display === "none" ? "block" : "none";
            });
          }

          // Análisis numérico - Cálculos
          const infoBox = contenedor.createDiv({ cls: "obsi-math-info" });

          let formaSimplificada = "";
          try { formaSimplificada = simplify(expr).toString(); }
          catch (e) { console.warn("ObsiMath: no se pudo simplificar", expr, e); }

          if (formaSimplificada === "0") {
            infoBox.createEl("p", { text: "Interseccion Y: (0, 0.0000)" });
            infoBox.createEl("p", { text: "Todos los valores de x son raices (funcion identicamente cero)" });
          } else {
            infoBox.createEl("p", {
              text: isFinite(interseccionY)
                ? `Interseccion Y: (0, ${interseccionY.toFixed(4)})`
                : "Interseccion Y: no definida (discontinuidad en x=0)",
            });

            if (estadoRaices === "infinitas") {
              infoBox.createEl("p", { text: "Raices: infinitas" });
            } else if (estadoRaices === "demasiadas") {
              infoBox.createEl("p", { text: "Raices: demasiadas para mostrar" });
            } else if (analisis.raices.length > 0) {
              infoBox.createEl("p", { text: "Raices: " + analisis.raices.map(r => r.toFixed(4)).join(", ") });
            } else {
              infoBox.createEl("p", { text: "No hay raices reales" });
            }

            if (estadoVertices === "infinitas") {
              infoBox.createEl("p", { text: "Vertices: infinitos" });
            } else if (estadoVertices === "demasiadas") {
              infoBox.createEl("p", { text: "Vertices: demasiados para mostrar" });
            } else {
              for (const v of analisis.vertices) {
                infoBox.createEl("p", {
                  text: `Vertice ${v.tipo}: (${v.x.toFixed(4)}, ${v.y.toFixed(4)})`,
                });
              }
            }
          }
        } catch (error) {
          contenedor.createEl("p", { text: "Error: " + (error as Error).message });
        }
      }
    );

    // ── Bloque obs-system ────────────────────
    this.registerMarkdownCodeBlockProcessor("obs-system", async (source, el, ctx) => {
  const contenedor = el.createDiv({ cls: "obsi-math-container" });
  if (!this.OBS_SISTEMA_HABILITADO) {
    contenedor.createEl("p", {
  text: "⚠️ obs-system está deshabilitado temporalmente.",
  cls: "obsi-math-aviso",
});
    return;
  }

  try {
    const { ecuaciones, espacios } = parsearSistemaCases(source);
    if (ecuaciones.length < 2) {
      contenedor.createEl("p", { text: "Error: se necesitan al menos 2 ecuaciones" });
      return;
    }

    // ── LaTeX izquierda ──────────────────────
    const infoBox = contenedor.createDiv({ cls: "obsi-math-latex" });
    const contenedorCases = infoBox.createDiv();
    await MarkdownRenderer.render(
      this.app,
      "$$" + sistemaCasesALatex(ecuaciones, espacios) + "$$",
      contenedorCases,
      ctx.sourcePath,
      this
    );

    // ── Motor gráfico ────────────────────────
    const W = 768, H = 261;
    const dpr = window.devicePixelRatio || 1;
    const wrapGrafica = contenedor.createDiv({ cls: "obsi-math-grafica" });
    wrapGrafica.style.cssText = `position:relative; width:100%; height:${H}px;`;

    const canvasGL = wrapGrafica.createEl("canvas");
    const canvas2D = wrapGrafica.createEl("canvas");

    canvasGL.width = W * dpr; canvasGL.height = H * dpr;
    canvasGL.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%;`;
    canvas2D.width = W * dpr; canvas2D.height = H * dpr;
    canvas2D.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;`;

    const gl = canvasGL.getContext("webgl", { antialias: true });
    const ctx2d = canvas2D.getContext("2d");

    if (!gl || !ctx2d) {
      wrapGrafica.createEl("p", { text: "Error: WebGL no disponible" });
      return;
    }

    ctx2d.scale(dpr, dpr);

    let domX: [number, number] = [-7, 7];
    let domY: [number, number] = [-7, 7];

    const sx = (x: number) => ((x - domX[0]) / (domX[1] - domX[0])) * W;
    const sy = (y: number) => H - ((y - domY[0]) / (domY[1] - domY[0])) * H;

    const generarTicks = (min: number, max: number, maxTicks = 10): number[] => {
      const rango = max - min;
      const paso = Math.pow(10, Math.floor(Math.log10(rango / maxTicks)));
      const pasos = [1, 2, 5, 10].map(m => m * paso);
      const pasoFinal = pasos.find(p => rango / p <= maxTicks) ?? pasos[pasos.length - 1];
      const ticks: number[] = [];
      const inicio = Math.ceil(min / pasoFinal) * pasoFinal;
      for (let t = inicio; t <= max + 1e-9; t += pasoFinal)
        ticks.push(parseFloat(t.toPrecision(10)));
      return ticks;
    };

    const formatearNumero = (n: number): string => {
      if (Math.abs(n) < 1e-9) return "0";
      if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) return n.toExponential(1);
      return parseFloat(n.toPrecision(4)).toString();
    };

    // Resolver sistema
    const resultado = resolverSistema(ecuaciones);

    // Convertir ecuaciones a funciones y(x)
    const evalEcuacion = (ec: string, x: number): number => {
      try {
        const partes = ec.split("=");
        if (partes.length !== 2) return NaN;
        const lhs = normalizarEntrada(partes[0].trim());
        const rhs = normalizarEntrada(partes[1].trim());
        // Despejar y: y = rhs - lhs + y_coef*y → resolver numéricamente
        const yCoef = evaluate(`(${lhs})-(${rhs})`, { x: 0, y: 1 }) - evaluate(`(${lhs})-(${rhs})`, { x: 0, y: 0 });
        if (Math.abs(yCoef) < 1e-10) return NaN; // no tiene y
        const constante = evaluate(`(${lhs})-(${rhs})`, { x, y: 0 });
        return -constante / yCoef;
      } catch { return NaN; }
    };

    const dibujarOverlay = () => {
      ctx2d.clearRect(0, 0, W, H);
      const ticksX = generarTicks(domX[0], domX[1]);
      const ticksY = generarTicks(domY[0], domY[1]);

      ctx2d.strokeStyle = "rgba(130,130,150,0.12)";
      ctx2d.lineWidth = 0.5;
      for (const x of ticksX) { ctx2d.beginPath(); ctx2d.moveTo(sx(x), 0); ctx2d.lineTo(sx(x), H); ctx2d.stroke(); }
      for (const y of ticksY) { ctx2d.beginPath(); ctx2d.moveTo(0, sy(y)); ctx2d.lineTo(W, sy(y)); ctx2d.stroke(); }

      ctx2d.strokeStyle = "rgba(160,160,170,0.7)";
      ctx2d.lineWidth = 1;
      if (domY[0] <= 0 && domY[1] >= 0) { ctx2d.beginPath(); ctx2d.moveTo(0, sy(0)); ctx2d.lineTo(W, sy(0)); ctx2d.stroke(); }
      if (domX[0] <= 0 && domX[1] >= 0) { ctx2d.beginPath(); ctx2d.moveTo(sx(0), 0); ctx2d.lineTo(sx(0), H); ctx2d.stroke(); }

      const ceroY = Math.max(4, Math.min(H - 4, sy(0)));
      const ceroX = Math.max(4, Math.min(W - 4, sx(0)));
      ctx2d.fillStyle = "rgba(160,160,170,0.85)";
      ctx2d.font = "11px monospace";

      ctx2d.textAlign = "center"; ctx2d.textBaseline = "top";
      for (const x of ticksX) {
        if (Math.abs(x) < 1e-9) continue;
        const px = sx(x);
        if (px < 10 || px > W - 10) continue;
        ctx2d.strokeStyle = "rgba(160,160,170,0.5)"; ctx2d.lineWidth = 0.75;
        ctx2d.beginPath(); ctx2d.moveTo(px, ceroY - 3); ctx2d.lineTo(px, ceroY + 3); ctx2d.stroke();
        ctx2d.fillStyle = "rgba(160,160,170,0.85)";
        ctx2d.fillText(formatearNumero(x), px, ceroY + 5);
      }

      ctx2d.textAlign = "right"; ctx2d.textBaseline = "middle";
      for (const y of ticksY) {
        if (Math.abs(y) < 1e-9) continue;
        const py = sy(y);
        if (py < 10 || py > H - 10) continue;
        ctx2d.strokeStyle = "rgba(160,160,170,0.5)"; ctx2d.lineWidth = 0.75;
        ctx2d.beginPath(); ctx2d.moveTo(ceroX - 3, py); ctx2d.lineTo(ceroX + 3, py); ctx2d.stroke();
        ctx2d.fillStyle = "rgba(160,160,170,0.85)";
        ctx2d.fillText(formatearNumero(y), ceroX - 6, py);
      }

      // Punto de intersección
      if (typeof resultado !== "string") {
        const vars = Object.keys(resultado);
        const xVar = vars.find(v => v === "x") ?? vars[0];
        const yVar = vars.find(v => v === "y") ?? vars[1];
        if (xVar && yVar) {
          const px = sx(resultado[xVar]);
          const py = sy(resultado[yVar]);
          if (px >= 0 && px <= W && py >= 0 && py <= H) {
            // Punto de alta calidad
            const r = 5 * dpr;
            ctx2d.save();
            ctx2d.scale(1 / dpr, 1 / dpr);
            // Sombra suave
            ctx2d.shadowColor = "rgba(255,255,255,0.4)";
            ctx2d.shadowBlur = 6;
            // Borde blanco
            ctx2d.beginPath();
            ctx2d.arc(px * dpr, py * dpr, r + 1.5, 0, Math.PI * 2);
            ctx2d.fillStyle = "white";
            ctx2d.fill();
            // Interior negro
            ctx2d.shadowBlur = 0;
            ctx2d.beginPath();
            ctx2d.arc(px * dpr, py * dpr, r - 1, 0, Math.PI * 2);
            ctx2d.fillStyle = "black";
            ctx2d.fill();
            ctx2d.restore();
          }
        }
      }
    };

    const programa = crearPrograma(gl);
    const aPos = gl.getAttribLocation(programa, "a_pos");
    const uColor = gl.getUniformLocation(programa, "u_color");
    const buffer = gl.createBuffer()!;

    const COLORES = [
      [0.31, 0.62, 1.0, 1.0],   // azul
      [1.0, 0.63, 0.20, 1.0],   // naranja
    ];

    const dibujarCurvas = () => {
      obsSistemaUpdateCount++;
      console.log('Actualizaciones motor gráfico (obs-system): ' + obsSistemaUpdateCount);
      gl.viewport(0, 0, W * dpr, H * dpr);
      gl.clearColor(0.118, 0.118, 0.118, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(programa);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const cx = (x: number) => ((x - domX[0]) / (domX[1] - domX[0])) * 2 - 1;
      const cy = (y: number) => ((y - domY[0]) / (domY[1] - domY[0])) * 2 - 1;
      const MUESTRAS = 2000;
      const rangoX = domX[1] - domX[0];
      const GROSOR_CLIP = Math.min(0.009, Math.max(0.003, 0.0055 * (10 / rangoX)));
      const dx = rangoX / MUESTRAS;

      for (let e = 0; e < Math.min(ecuaciones.length, 2); e++) {
        const color = COLORES[e] ?? COLORES[0];
        gl.uniform4f(uColor, color[0], color[1], color[2], color[3]);

        let segmento: number[] = [];
        const flushSegmento = () => {
          if (segmento.length < 4) { segmento = []; return; }
          const quads = construirQuadStrip(segmento, GROSOR_CLIP);
          if (quads.length === 0) { segmento = []; return; }
          gl.bufferData(gl.ARRAY_BUFFER, quads, gl.DYNAMIC_DRAW);
          gl.drawArrays(gl.TRIANGLES, 0, quads.length / 2);
          segmento = [];
        };

        let yPrev: number | null = null;
        for (let i = 0; i <= MUESTRAS; i++) {
          const x = domX[0] + i * dx;
          const y = evalEcuacion(ecuaciones[e], x);
          if (!isFinite(y) || Math.abs(y) > 1e15) { flushSegmento(); yPrev = null; continue; }
          segmento.push(cx(x), cy(y));
          yPrev = y;
        }
        flushSegmento();
      }
    };

    dibujarOverlay();
    dibujarCurvas();

    // ── Zoom / Pan ───────────────────────────
    let isDragging = false;
    let lastPointer = { x: 0, y: 0 };
    let rafPendiente = false;
    let motivoPendiente: "zoom" | "pan" = "pan";

    const programarRedibujo = (motivo: "zoom" | "pan") => {
      if (motivo === "zoom") motivoPendiente = "zoom";
      else if (!rafPendiente) motivoPendiente = "pan";
      if (!rafPendiente) {
        rafPendiente = true;
        requestAnimationFrame(() => {
          rafPendiente = false;
          dibujarOverlay();
          dibujarCurvas();
          motivoPendiente = "pan";
        });
      }
    };

    canvasGL.addEventListener("pointerdown", e => {
      isDragging = true;
      lastPointer = { x: e.offsetX, y: e.offsetY };
      canvasGL.setPointerCapture(e.pointerId);
    });
    canvasGL.addEventListener("pointermove", e => {
      if (!isDragging) return;
      const dx = e.offsetX - lastPointer.x;
      const dy = e.offsetY - lastPointer.y;
      lastPointer = { x: e.offsetX, y: e.offsetY };
      const rx = (domX[1] - domX[0]) / W;
      const ry = (domY[1] - domY[0]) / H;
      domX = [domX[0] - dx * rx, domX[1] - dx * rx];
      domY = [domY[0] + dy * ry, domY[1] + dy * ry];
      programarRedibujo("pan");
    });
    canvasGL.addEventListener("pointerup", e => {
      isDragging = false;
      canvasGL.releasePointerCapture(e.pointerId);
    });
    canvasGL.addEventListener("wheel", e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.05 : 0.95;
      const mx = domX[0] + (e.offsetX / W) * (domX[1] - domX[0]);
      const my = domY[1] - (e.offsetY / H) * (domY[1] - domY[0]);
      domX = [mx + (domX[0] - mx) * factor, mx + (domX[1] - mx) * factor];
      domY = [my + (domY[0] - my) * factor, my + (domY[1] - my) * factor];
      programarRedibujo("zoom");
    }, { passive: false });

  } catch (error) {
    contenedor.createEl("p", { text: "Error: " + (error as Error).message });
  }
});
  }

  onunload() {
    console.log("Obsi Math: plugin descargado:");
  }
}

// https://github.com/RughustDev/obsi-math