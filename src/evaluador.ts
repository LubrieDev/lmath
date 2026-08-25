import { parse, FunctionNode, OperatorNode, type MathNode } from "mathjs";

import {
  FUNCIONES_INVERSAS_EXTRA, FUNCIONES_ESCALON_RAPIDAS, FUNCIONES_SIGNO, FUNCIONES_DOMINIO,
  FUNCIONES_TRIG_GUARDADAS,
} from "./constantes";
import { compilarNativo, potenciaReal } from "./compiladorNativo";
import { normalizarEntrada } from "./parser";
import { insertarProductoImplicito } from "./core/parsing/productoImplicito";

// ─────────────────────────────────────────────
// Evaluador (compartido por obs-graph y obs-system)
// ─────────────────────────────────────────────

/**
 * El nombre interno de la potencia del motor. `^` de mathjs resuelve a SU `pow` —que da
 * `0^0 = 1`—, así que antes de compilar se reescribe cada `a ^ b` como `powg(a, b)` y el
 * scope inyecta `powg` con la semántica del motor (`potenciaReal`: 0^0 es la forma
 * indeterminada, NaN). Es la mitad mathjs del arreglo del BUG-001; la nativa vive en
 * `compiladorNativo.potenciaReal`, y las dos tienen que coincidir punto a punto porque el
 * validador diferencial compara una contra la otra.
 */
const NOMBRE_POTENCIA = "powg";

/**
 * Lo mismo para las trigonométricas directas: `tan` de mathjs en su polo da el residuo
 * flotante (`1.63e16` en pi/2), no infinito. Cada `tan(u)` se reescribe a `tanG(u)` —y las
 * cinco hermanas— con la implementación guardada de `FUNCIONES_TRIG_GUARDADAS` (BUG-001,
 * familia de `tan(A)` con `A = 90`).
 */
const SUFIJO_TRIG = "G";
const ES_TRIG_GUARDADA = (nombre: string): nombre is keyof typeof FUNCIONES_TRIG_GUARDADAS =>
  Object.prototype.hasOwnProperty.call(FUNCIONES_TRIG_GUARDADAS, nombre);

/** Reescritura `^ → powg` y `tan/sec/csc/cot/sin/cos → *G` sobre el árbol, antes de compilar. */
function reescribirNodos(nodo: MathNode): MathNode {
  return nodo.transform((n: MathNode) => {
    if (n instanceof OperatorNode && n.op === "^" && n.args.length === 2) {
      return new FunctionNode(NOMBRE_POTENCIA, n.args);
    }
    if (n instanceof FunctionNode && n.args.length === 1) {
      const nombre = (n.fn as { name?: string } | undefined)?.name ?? "";
      if (ES_TRIG_GUARDADA(nombre)) return new FunctionNode(nombre + SUFIJO_TRIG, n.args);
    }
    return n;
  });
}

/** Las guardas trigonométricas con el sufijo que les pone la reescritura (`tan` → `tanG`). */
const FUNCIONES_TRIG_REESCRITAS = Object.fromEntries(
  Object.entries(FUNCIONES_TRIG_GUARDADAS).map(([nombre, fn]) => [nombre + SUFIJO_TRIG, fn])
);

// Compila una expresión YA NORMALIZADA (ver normalizarEntrada) a una función que
// la evalúa en un scope dado. Inyecta SIEMPRE las trigonométricas inversas que
// mathjs no trae nativas (FUNCIONES_INVERSAS_EXTRA: acsc/asec/acot), de modo que
// obs-graph y obs-system reconozcan EXACTAMENTE las mismas funciones. Devuelve
// NaN ante cualquier error de evaluación (símbolo libre, fuera de dominio…). El
// nodo se compila UNA sola vez; la función devuelta reutiliza esa compilación.
export function compilarExpresion(
  expr: string
): (scope: Record<string, number>) => unknown {
  const compilada = reescribirNodos(parse(expr)).compile();
  // FUNCIONES_ESCALON_RAPIDAS sombrea floor/ceil de mathjs (12× más caras por el
  // dispatch typed-function; ver constantes.ts) — mismo mecanismo que las inversas.
  return (scope) => {
    try {
      // FUNCIONES_SIGNO (pm/mp) da valor a la rama PRINCIPAL del doble signo: sin ellas
      // `±` sería un símbolo libre y toda la expresión evaluaría NaN (ver constantes.ts).
      // mathjs tipa `evaluate` como `any`; se acota a `unknown` para que el valor
      // (number | Complex | NaN…) obligue a los consumidores a estrecharlo.
      return compilada.evaluate({
        ...scope,
        [NOMBRE_POTENCIA]: potenciaReal,
        ...FUNCIONES_TRIG_REESCRITAS,
        ...FUNCIONES_INVERSAS_EXTRA, ...FUNCIONES_ESCALON_RAPIDAS, ...FUNCIONES_SIGNO, ...FUNCIONES_DOMINIO,
      }) as unknown;
    }
    catch { return NaN; }
  };
}

// Atajo para funciones de UNA variable (p.ej. la f(x) de obs-graph): compila la
// expresión y devuelve g(v) = expr evaluada con { [varName]: v }. Equivale a
// evaluar la expresión con esa única variable en el scope.
//
// ACELERACIÓN (compiladorNativo): antes de quedarse con el camino de mathjs se intenta
// GENERAR el JS equivalente, que evita el despacho de typed-function y la construcción
// del scope en cada muestra (medido: 2,3×–18× sobre el trazador completo, con geometría
// bit-idéntica). El compilador solo devuelve una función si supera su validación
// diferencial contra ESTE mismo `evaluar`; si no, se sigue por mathjs como siempre. El
// contrato de salida no cambia: `unknown`, porque el camino de mathjs puede devolver un
// Complex y los consumidores ya lo estrechan.
export function compilarFuncion(
  expr: string,
  varName: string
): (v: number) => unknown {
  const evaluar = compilarExpresion(expr);
  const nativa = compilarNativo(expr, [varName], ([v]) => evaluar({ [varName]: v }));
  if (nativa) return (v) => nativa(v);
  return (v) => evaluar({ [varName]: v });
}

// Variante de DOS variables para los campos escalares implícitos F(x,y) (misma
// aceleración y mismas garantías que `compilarFuncion`). Existe aparte porque
// `compilarExpresion` recibe un scope genérico y el compilador nativo necesita saber los
// nombres de las variables por adelantado.
export function compilarCampo(
  expr: string,
  varX = "x",
  varY = "y"
): (x: number, y: number) => unknown {
  const evaluar = compilarExpresion(expr);
  const nativa = compilarNativo(expr, [varX, varY], ([x, y]) => evaluar({ [varX]: x, [varY]: y }));
  if (nativa) return (x, y) => nativa(x, y);
  return (x, y) => evaluar({ [varX]: x, [varY]: y });
}

/**
 * Un número ESCRITO por el usuario, evaluado, o `null` si no es un número real.
 *
 * Es el atajo para los sitios donde una expresión no es una curva sino un VALOR suelto: el
 * extremo de un intervalo (`2\pi`), el ángulo de un obs-trig, la componente de un vector. Pasa
 * por el pipeline de entrada completo, así que acepta exactamente lo mismo que cualquier bloque
 * (`\frac{\pi}{6}`, `2\pi`, `-\sqrt{2}`, `30°`), y evalúa con el ámbito VACÍO, que es la
 * definición de constante que no se queda corta: lo que dependa de una variable sale NaN, y eso
 * es la respuesta correcta —no es un número, es una regla—.
 *
 * `null` y no NaN porque el consumidor tiene que DECIDIR qué hacer con la ausencia (rechazar la
 * restricción, velar el bloque, no dibujar), y un NaN que se propaga silenciosamente es
 * justamente lo que impide decidir.
 */
export function evaluarConstante(expr: string): number | null {
  const limpio = expr.trim();
  if (!limpio) return null;
  try {
    const valor = compilarExpresion(insertarProductoImplicito(normalizarEntrada(limpio)))({});
    return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
  } catch {
    return null;
  }
}
