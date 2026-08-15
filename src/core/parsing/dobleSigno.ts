// ─────────────────────────────────────────────
// parsing · Doble signo (±, ∓): una escritura, DOS ecuaciones
// ─────────────────────────────────────────────
//
// `y = ±√(4−x²)` no es una función: es la FAMILIA de dos funciones (`+√…` y `−√…`), que
// juntas son la circunferencia entera. Ningún proveedor de geometría puede trazar "las dos
// a la vez" desde una sola expresión —el sampler 1D devuelve UNA y por x—, así que el ±
// se resuelve donde debe: ANTES de construir el objeto, expandiendo la ecuación escrita en
// las dos ecuaciones que realmente representa. Cada una sigue el camino normal (explícita,
// implícita, paramétrica…) y `ProveedorUnion` las presenta como UN objeto (un color, un id).
//
// Los signos de un mismo EJE están CORRELACIONADOS, que es la convención de LaTeX: en la rama
// `+`, todo `±` de ese eje vale + y todo `∓` vale −; en la rama `−`, al revés. Por eso
// `y = ±x ∓ 1` son DOS rectas (`x−1` y `−x+1`), no las cuatro combinaciones.
//
// EJES INDEPENDIENTES. Esa correlación es la lectura correcta de UN ± repetido, pero hay
// despejes donde los ± son genuinamente independientes y las cuatro combinaciones son
// soluciones reales distintas: `y = ±arccos((a ± √d)/2)` (cuadrática en cos y) tiene dos
// valores de cos y, y cada uno aporta sus dos ángulos. Con un solo eje se dibujaban 2 de las
// 4 curvas y las otras dos DESAPARECÍAN en silencio (verificado numéricamente). Por eso el
// centinela lleva EJE: `pm`/`mp` (eje 0) y `pm2`/`mp2` (eje 1) se resuelven por separado y la
// expansión es el producto cartesiano de los ejes PRESENTES → 1, 2 o 4 ecuaciones.
//
// El presupuesto se corta en DOS ejes a propósito: cubre todo lo que el despejador sabe
// producir y mantiene el coste de trazado acotado (≤4 curvas por objeto, nunca 2ⁿ). Quien
// necesite un tercero recibe `null` de `ramaDoble` y se queda en forma parcial —honesta—.
//
// La entrada llega con los centinelas que produce `normalizarEntrada` (parser.ts) —tanto desde
// `\pm`/`±` escritos por el usuario (siempre eje 0) como desde el despeje—, así que aquí no se
// vuelve a mirar LaTeX: solo se sustituye el centinela por su signo. La sustitución es TEXTUAL
// sobre paréntesis balanceados (no por AST) porque la ecuación aún no es un AST: puede ser una
// tupla paramétrica `(t, ±t)` o llevar un `=`.

/** Ejes de signo INDEPENDIENTES: para cada uno, sus centinelas y el signo que toman en la
 *  rama `+` del eje. El orden es el de asignación (`ramaDoble` reparte de izquierda a derecha). */
const EJES: ReadonlyArray<ReadonlyArray<readonly [string, 1 | -1]>> = [
  [["pm", 1], ["mp", -1]],
  [["pm2", 1], ["mp2", -1]],
];

/** Nombre de centinela → `\pm` (+1) o `\mp` (−1), para el resto del motor (LaTeX, scope). */
export const CENTINELAS_SIGNO: ReadonlyArray<readonly [string, 1 | -1]> = EJES.flat();

/** ¿Aparece en la expresión algún centinela del eje `eje`? */
function ejePresente(exprNorm: string, eje: number): boolean {
  return EJES[eje].some(([nombre]) => marcaDe(nombre).test(exprNorm));
}

/** Regex del centinela `nombre` como llamada: frontera de identificador a la izquierda y `(`
 *  a la derecha, de modo que `pm(` y `pm2(` NUNCA se confunden entre sí. */
function marcaDe(nombre: string): RegExp {
  return new RegExp(`(?<![a-zA-Z0-9_])${nombre}\\s*\\(`);
}

/** ¿La expresión (ya normalizada) contiene algún doble signo, de cualquier eje? */
export function tieneDobleSigno(exprNorm: string): boolean {
  return /(?<![a-zA-Z0-9_])(pm|mp)2?\s*\(/.test(exprNorm);
}

/**
 * ÚNICA vía de emisión del centinela `±` en todo el motor.
 *
 * `expandirDobleSigno` resuelve TODOS los centinelas de una expresión con el MISMO signo, así
 * que una fórmula representa exactamente DOS curvas, pase lo que pase. Esa es la convención de
 * la notación (`y = (−b ± √Δ)/2a` son dos soluciones, no cuatro) y de ella depende el coste del
 * trazado. Pero convierte el nº de centinelas en un INVARIANTE del sistema: dos `pm`
 * INDEPENDIENTES —uno del despeje y otro que ya venía en la expresión— necesitarían las cuatro
 * combinaciones de signo y solo se dibujarían dos, perdiendo soluciones reales en silencio.
 *
 * Cada estrategia de despeje que abría ramas emitía `pm(...)` por su cuenta y ninguna vigilaba
 * eso (`|y| = ±x` daba tres centinelas → 2 de 8 ramas → faltaba la recta `y = −x`). Centralizar
 * la emisión convierte el invariante en algo que NO SE PUEDE violar: si el contexto en el que
 * va a caer el ± ya lleva uno, se devuelve `null` y quien llama se queda en forma PARCIAL —
 * honesto— en vez de entregar un despeje al que le faltan curvas.
 *
 * @param cuerpo    expresión (string mathjs) que va bajo el ±.
 * @param contexto  string donde quedará embebido el ± (el otro lado, el radicando…): sus ejes
 *                  ya ocupados no se pueden reutilizar (serían el MISMO signo, no uno nuevo).
 */
export function ramaDoble(cuerpo: string, contexto: string): string | null {
  const libre = EJES.findIndex((_, i) => !ejePresente(contexto, i));
  return libre === -1 ? null : `${EJES[libre][0][0]}(${cuerpo})`;
}

/** Índice del ')' que cierra el '(' de `inicio`; -1 si no cierra. */
function cierreParentesis(texto: string, inicio: number): number {
  let prof = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === "(") prof++;
    else if (texto[i] === ")" && --prof === 0) return i;
  }
  return -1;
}

/**
 * La expresión con TODOS sus centinelas resueltos para la rama `rama` (+1 o −1):
 * `pm(u)` → `(+1*(u))` en la rama +, `(-1*(u))` en la −; `mp(u)` al revés. El factor
 * numérico explícito (en vez de un `+`/`-` prefijo) evita cualquier duda de precedencia:
 * `a + pm(b)` → `a + (-1*(b))` es exactamente `a − b` sin depender de dónde caiga el signo.
 */
function resolverCentinelas(exprNorm: string, eje: number, rama: 1 | -1): string {
  let expr = exprNorm;
  for (const [nombre, signoBase] of EJES[eje]) {
    const marca = marcaDe(nombre);
    for (let m = marca.exec(expr); m; m = marca.exec(expr)) {
      const abre = m.index + m[0].length - 1;
      const cierra = cierreParentesis(expr, abre);
      if (cierra === -1) break; // paréntesis sin cerrar: el parser lo rechazará después
      const cuerpo = expr.slice(abre + 1, cierra);
      const signo = signoBase * rama;
      expr = expr.slice(0, m.index) + `(${signo}*(${cuerpo}))` + expr.slice(cierra + 1);
    }
  }
  return expr;
}

/**
 * Las ecuaciones REALES que representa una ecuación escrita con ±/∓: el producto cartesiano
 * de los signos de cada EJE presente —1 (sin ±), 2 (un eje) o 4 (dos ejes independientes)—.
 * Devolver siempre una lista deja al llamador (composicion.ts) sin ramificación especial:
 * mapea y ya. El máximo es 4 por construcción (solo hay dos ejes), nunca 2ⁿ.
 */
export function expandirDobleSigno(exprNorm: string): string[] {
  let ramas = [exprNorm];
  for (let eje = 0; eje < EJES.length; eje++) {
    if (!ejePresente(exprNorm, eje)) continue;
    ramas = ramas.flatMap((e) => [resolverCentinelas(e, eje, 1), resolverCentinelas(e, eje, -1)]);
  }
  return ramas;
}
