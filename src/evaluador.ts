import { parse } from "mathjs";

import { FUNCIONES_INVERSAS_EXTRA, FUNCIONES_ESCALON_RAPIDAS, FUNCIONES_SIGNO, FUNCIONES_DOMINIO } from "./constantes";
import { compilarNativo } from "./compiladorNativo";

// ─────────────────────────────────────────────
// Evaluador (compartido por obs-graph y obs-system)
// ─────────────────────────────────────────────

// Compila una expresión YA NORMALIZADA (ver normalizarEntrada) a una función que
// la evalúa en un scope dado. Inyecta SIEMPRE las trigonométricas inversas que
// mathjs no trae nativas (FUNCIONES_INVERSAS_EXTRA: acsc/asec/acot), de modo que
// obs-graph y obs-system reconozcan EXACTAMENTE las mismas funciones. Devuelve
// NaN ante cualquier error de evaluación (símbolo libre, fuera de dominio…). El
// nodo se compila UNA sola vez; la función devuelta reutiliza esa compilación.
export function compilarExpresion(
  expr: string
): (scope: Record<string, number>) => unknown {
  const compilada = parse(expr).compile();
  // FUNCIONES_ESCALON_RAPIDAS sombrea floor/ceil de mathjs (12× más caras por el
  // dispatch typed-function; ver constantes.ts) — mismo mecanismo que las inversas.
  return (scope) => {
    try {
      // FUNCIONES_SIGNO (pm/mp) da valor a la rama PRINCIPAL del doble signo: sin ellas
      // `±` sería un símbolo libre y toda la expresión evaluaría NaN (ver constantes.ts).
      // mathjs tipa `evaluate` como `any`; se acota a `unknown` para que el valor
      // (number | Complex | NaN…) obligue a los consumidores a estrecharlo.
      return compilada.evaluate({
        ...scope, ...FUNCIONES_INVERSAS_EXTRA, ...FUNCIONES_ESCALON_RAPIDAS, ...FUNCIONES_SIGNO, ...FUNCIONES_DOMINIO,
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
