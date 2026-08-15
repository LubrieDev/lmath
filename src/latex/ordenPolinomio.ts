// ─────────────────────────────────────────────
// latex · Orden descendente de grado (presentación polinómica)
// ─────────────────────────────────────────────

import { opNodo, type Nodo } from "../formatoExpr";

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
export function ordenarPolinomioDescendente(node: Nodo): Nodo {
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
