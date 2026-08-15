// ─────────────────────────────────────────────
// latex · Agrupaciones tipográficas dentro de un producto
// ─────────────────────────────────────────────

import { opNodo, constNodo, funcNodo, simboloNodo, esNoNegativo, type Nodo } from "../formatoExpr";
import {
  NOMBRE_FUNCION_TEX, PAREN_DESNUDA, INDICE_MAX_CON_POTENCIA, INDICE_MAX_RAIZ_PURA, pelar,
} from "./nodoATex";

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
export function agruparFuncionesDesnudasEnProducto(node: Nodo): Nodo {
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
export function fusionarRadicalesEnProducto(node: Nodo): Nodo {
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
