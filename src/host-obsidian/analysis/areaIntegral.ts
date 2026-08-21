// ─────────────────────────────────────────────
// panel · El VALOR del área de una integral definida
// ─────────────────────────────────────────────
//
// La mitad NUMÉRICA del bloque obs-integral: calcular ∫ₐᵇ f dx sobre la función compilada,
// reconocer su forma cerrada cuando la tiene, y escribirlo como lo quiere ver el panel.
//
// ── Por qué esto ya no está en `integral.ts` ─────────────────────────────────────────────
// Porque no es álgebra. `integral.ts` es un módulo del CAS —lee la notación y produce la
// primitiva simbólica— y esta mitad necesitaba `core/fields/`, `core/analysis/areaBajoRama` y
// `core/analysis/formatoNumero`: un módulo del núcleo importando la capa de dibujo, que es la
// dirección prohibida. No era un descuido, era que en un mismo archivo convivían tres cosas
// distintas y solo una de ellas era CAS.
//
// Separadas: la primitiva simbólica se queda en `integrar.ts`, la lectura de la notación en
// `integral.ts`, y el número con su tipografía viene aquí, junto al resto del análisis del panel.
//
// ── Qué garantiza esta mitad ─────────────────────────────────────────────────────────────
// Que el panel no afirme más de lo que sabe. `=` solo cuando Barrow aplica y el valor tiene forma
// cerrada reconocible; `pprox` cuando el número viene de una cuadratura; y la etiqueta formal
// (divergente, fuera de dominio) al plano y nunca al panel.

import { normalizarEntrada } from "../../CAS/api-legado";
import { insertarProductoImplicito } from "../../core/parsing/productoImplicito";
import { tieneDobleSigno } from "../../core/parsing/dobleSigno";
import { exprALatex } from "../../CAS/api-legado";
import { compilarFuncion } from "../../CAS/api-legado";
import { clasificarDegenerada, type FuncionDegenerada } from "../../CAS/api-legado";
import { crearFuncionReal } from "../../core/fields/funcionRealMathjs";
import { areaDefinida, type ResultadoArea } from "../../core/analysis/areaBajoRama";
import { numeroALatex } from "../../core/analysis/formatoNumero";
import { integrarExpr } from "../../CAS/api-legado";
import { extraerIntegral, evaluarLimite } from "../../CAS/api-legado";

export type { ResultadoArea };

/**
 * Evalúa el ÁREA del bloque (fachada del bloque obs-integral): parsea, evalúa los límites y
 * calcula ∫ₐᵇ f dx sobre la `FuncionReal` compilada (`areaDefinida`). Devuelve el
 * `ResultadoArea` (valor con signo o etiqueta del Nivel 2), o null si no hay integral que
 * evaluar. Límites simbólicos/∞ → `ETIQUETA_LIMITES` (vía `areaDefinida`, que recibe NaN).
 */
export function evaluarArea(source: string): ResultadoArea | null {
  const it = extraerIntegral(source);
  if (!it) return null;
  const a = evaluarLimite(it.a), b = evaluarLimite(it.b);
  const f = crearFuncionReal(insertarProductoImplicito(normalizarEntrada(it.integrando)));
  // a/b no numéricos → NaN → areaDefinida devuelve ETIQUETA_LIMITES (sin recalcular aquí).
  return areaDefinida(f, a ?? NaN, b ?? NaN);
}

/** Formatea un área a un número legible en LaTeX: entero si lo es, si no 4 decimales sin
 *  ceros sobrantes (`8/3` → `2.6667`). No intenta recuperar la fracción exacta. */
function formatearArea(v: number): string {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9) return String(r);
  return parseFloat(v.toFixed(4)).toString();
}

/**
 * Cuerpo LaTeX del valor para el panel a partir de un `ResultadoArea`: el número (o una
 * etiqueta del Nivel 2 como `\text{Integral divergente}`) y el conector adecuado
 * (`\approx` si la integral es impropia convergente, `=` si es exacta).
 */
export function cuerpoAreaLatex(r: ResultadoArea): { cuerpo: string; conector: string } {
  if (r.tipo === "etiqueta") return { cuerpo: `\\text{${r.etiqueta}}`, conector: "=" };
  return { cuerpo: formatearArea(r.valor), conector: r.impropia ? "\\approx" : "=" };
}

// ─────────────────────────────────────────────
// Valor EXACTO del área (Barrow) — reconocimiento simbólico
// ─────────────────────────────────────────────
//
// Con la primitiva simbólica F, el valor de ∫ₐᵇ es F(b)−F(a), y ese número (evaluado a
// precisión de máquina) suele ser una forma cerrada: una fracción `8/3`, un múltiplo de π,
// un radical, un logaritmo. `valorExactoLatex` lo RECONOCE por aproximación racional de alta
// precisión (fracciones continuas): si el valor —o su cociente por π/e/√k/ln k— es un racional
// de denominador PEQUEÑO dentro de 1e-9, se representa EXACTO; si no lo es (irracional sin
// forma cerrada reconocible), el panel usa `\approx <decimal>`. Es exactamente lo pedido:
// representación exacta cuando existe, aproximación honesta cuando no.

/** Mejor aproximación racional `p/q` de `v` (fracciones continuas), con denominador ≤ `qmax`
 *  y error ≤ `tol`, o null. El denominador PEQUEÑO es la clave: un irracional necesita `q`
 *  enorme para acercarse, así que no se confunde con un racional legítimo (`8/3`, `1/2`). */
function racionalDe(v: number, tol = 1e-9, qmax = 1000): { p: number; q: number } | null {
  if (!Number.isFinite(v)) return null;
  const signo = v < 0 ? -1 : 1;
  let x = Math.abs(v);
  let hm1 = 1, hm2 = 0, km1 = 0, km2 = 1; // convergentes h/k (numerador/denominador)
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x);
    const h = a * hm1 + hm2, k = a * km1 + km2;
    if (k > qmax) break;
    if (Math.abs((signo * h) / k - v) <= tol * (1 + Math.abs(v))) return { p: signo * h, q: k };
    hm2 = hm1; hm1 = h; km2 = km1; km1 = k;
    const frac = x - a;
    if (frac < 1e-15) break;
    x = 1 / frac;
  }
  return null;
}

/** String mathjs de `p/q` (entero si q=1). */
const racionalStr = (r: { p: number; q: number }): string => (r.q === 1 ? String(r.p) : `${r.p}/${r.q}`);

/** String mathjs de `(p/q)·símbolo` con paréntesis y signo mínimos (`pi/2` → `(pi)/2`). */
function multSimbolo(r: { p: number; q: number }, sym: string): string {
  const signo = r.p < 0 ? "-" : "";
  const ap = Math.abs(r.p);
  const num = ap === 1 ? sym : `${ap}*${sym}`;
  return r.q === 1 ? `${signo}${num}` : `${signo}(${num})/${r.q}`;
}

/** Forma cerrada (string mathjs) de un valor: racional, o racional × {π, e, √k, ln k}, o null. */
function valorExactoExpr(v: number): string | null {
  if (!Number.isFinite(v)) return null;
  const r = racionalDe(v);
  if (r) return racionalStr(r);
  const consts: [number, string][] = [[Math.PI, "pi"], [Math.E, "e"]];
  for (let k = 2; k <= 50; k++) { const s = Math.sqrt(k); if (!Number.isInteger(s)) consts.push([s, `sqrt(${k})`]); }
  // Base EXPLÍCITA: esta cadena vuelve a pasar por `normalizarEntrada`, y allí un `log` sin
  // base es el decimal que escribe el usuario. Sin la `e`, `∫₁³dx/x` se anunciaba como
  // `\log_{10} 3` —un número distinto del que vale la integral—. El panel lo pinta `\ln 3`.
  for (let k = 2; k <= 50; k++) consts.push([Math.log(k), `log(${k}, e)`]);
  for (const [c, sym] of consts) {
    const rr = racionalDe(v / c);
    if (rr) return multSimbolo(rr, sym);
  }
  return null;
}

/** LaTeX de la forma cerrada EXACTA de un valor (por `exprALatex`), o null si es irracional
 *  sin forma reconocible (→ el panel usa `\approx`). */
function valorExactoLatex(v: number): string | null {
  const e = valorExactoExpr(v);
  if (!e) return null;
  try { return exprALatex(e); } catch { return null; }
}

/** Decimal legible para el conector `\approx` (4 cifras significativas sin ceros sobrantes). */
const formatearAprox = (v: number): string => parseFloat(v.toFixed(4)).toString();

/**
 * Cuerpo LaTeX del VALOR del área, prefiriendo la representación EXACTA vía Barrow. Si hay
 * primitiva simbólica y F(b)−F(a) es consistente con el área numérica (⇒ Barrow aplica: el
 * integrando es continuo en [a,b], no hay polo interior que haría divergente la integral aunque
 * F sea finita), se reconoce el valor exacto (`= \frac{8}{3}`, `= \frac{\pi}{2}`, `= \ln 3`…) o,
 * si es irracional sin forma cerrada, `\approx <decimal>`. Sin primitiva o con caso límite del
 * Nivel 2 (divergente, etc.), cae al comportamiento numérico de `cuerpoAreaLatex`.
 */
export function cuerpoAreaLatexExacto(source: string): { cuerpo: string | null; conector: string } {
  // SIN VALOR que mostrar: o el integrando es degenerado (Nivel 1: no hay curva) o el número no
  // existe (Nivel 2: divergente, límites no numéricos, hueco del dominio). En ambos casos el
  // panel NO lleva etiqueta: `cuerpo = null` y el panel se queda con la FÓRMULA (el operador, o
  // los corchetes de Barrow). La etiqueta formal va SIEMPRE al plano —es el sitio único de los
  // diagnósticos, igual que "Indeterminada"—; ver `etiquetaIntegral` y `clasificarBloque`.
  if (etiquetaIntegral(source)) return { cuerpo: null, conector: "=" };

  const r = cuerpoAreaExactoBase(source);
  // Integrando con DOBLE SIGNO (`\int_0^2 \pm x\,dx`): el área también lo tiene, porque
  // ∫(±f) = ±∫f. El número se calcula sobre la rama principal (pm(u)=+u; ver constantes.ts)
  // y aquí se le devuelve su ± —en magnitud: `\pm(−2)` y `\pm 2` son la misma pareja—. Sin
  // esto el panel afirmaría un solo valor de una familia de dos.
  const it = extraerIntegral(source);
  const doble = it && tieneDobleSigno(insertarProductoImplicito(normalizarEntrada(it.integrando)));
  if (!doble || r.cuerpo.startsWith("\\text{")) return r;
  return { cuerpo: `\\pm ${r.cuerpo.replace(/^-/, "")}`, conector: r.conector };
}

/**
 * La ETIQUETA FORMAL del bloque obs-integral, o null si la integral tiene un valor que mostrar.
 * Punto ÚNICO del diagnóstico, y el host la pinta SOBRE EL PLANO (como "Indeterminada"): el panel
 * LaTeX solo muestra la fórmula —la integral con sus límites, o los corchetes de Barrow—, nunca
 * un `= \text{Integral divergente}`. Cubre los dos niveles con la misma forma `{etiqueta, detalle}`:
 *   • Nivel 1 — el integrando no toma ningún valor real (0/0, √−1): `degeneradas.ts`.
 *   • Nivel 2 — la curva existe pero el número no: divergente, límites no numéricos (`\int_{-\infty}`),
 *     hueco del dominio dentro de [a,b] (`\int_{-1}^{1}\sqrt{x}`): las etiquetas de `areaBajoRama`.
 */
export function etiquetaIntegral(source: string): FuncionDegenerada | null {
  const it = extraerIntegral(source);
  if (!it) return null; // sin integral reconocible: eso lo etiqueta el host (Sin integral / no válido)
  const norm = insertarProductoImplicito(normalizarEntrada(it.integrando));
  try {
    const deg = clasificarDegenerada(compilarFuncion(norm, "x"));
    if (deg) return deg;
  } catch { /* no compila: sin etiqueta de Nivel 1 */ }
  const area = evaluarArea(source);
  return area && area.tipo === "etiqueta"
    ? { etiqueta: area.etiqueta, detalle: area.detalle }
    : null;
}

function cuerpoAreaExactoBase(source: string): { cuerpo: string; conector: string } {
  const area = evaluarArea(source);
  if (!area) return { cuerpo: "\\text{[...]}", conector: "=" };
  if (area.tipo === "etiqueta") return cuerpoAreaLatex(area); // divergente / fuera de dominio / límites

  const it = extraerIntegral(source);
  const primitiva = it ? integrarExpr(it.integrando) : null;
  const a = it ? evaluarLimite(it.a) : null, b = it ? evaluarLimite(it.b) : null;
  if (primitiva && a !== null && b !== null) {
    try {
      const F = crearFuncionReal(primitiva);
      const v = F.eval(b) - F.eval(a);
      // Consistencia con el área numérica: si NO coincide, Barrow no aplica (polo interior:
      // ∫₋₁¹1/x tiene F=ln|x| finita en los extremos pero diverge) → se respeta el numérico.
      //
      // La tolerancia se afloja en las IMPROPIAS porque su valor numérico no se calcula, se
      // aproxima: `areaBajoRama` encoge ε en el extremo singular y para cuando el cambio baja
      // de 1e-4 (TOL_CONV), así que exigirle 1e-5 rechazaba SIEMPRE la primitiva buena y
      // ∫₀¹dx/√x —que vale 2 exacto— se anunciaba como `≈ 1.9998`. Sigue siendo una guarda
      // fuerte: lo que detecta (un polo interior) desvía el valor en órdenes de magnitud, no
      // en la cuarta cifra.
      const tol = area.impropia ? 1e-3 : 1e-5;
      if (Number.isFinite(v) && Math.abs(v - area.valor) <= tol * (1 + Math.abs(area.valor))) {
        const exacto = valorExactoLatex(v);
        if (exacto) return { cuerpo: exacto, conector: "=" };
        return { cuerpo: formatearAprox(v), conector: "\\approx" };
      }
    } catch { /* cae al numérico */ }
  }

  // Sin primitiva utilizable: el valor es SOLO numérico (cuadratura de Simpson) → `\approx`,
  // salvo que sea un entero limpio (ahí el número es fiable). Es más honesto que afirmar `=`
  // sobre una aproximación.
  const ent = Math.round(area.valor);
  if (Math.abs(area.valor - ent) < 1e-9) return { cuerpo: String(ent), conector: "=" };
  // Una IMPROPIA no se calcula, se aproxima: `areaBajoRama` para de encoger ε cuando el
  // cambio baja de 1e-4, así que sus cuatro decimales son tres de número y uno de ruido, y
  // `∫₀⁴dx/√x` —que vale 4— se leía "≈ 3.9996". Se redondea a la forma cerrada más simple
  // que explique el valor DENTRO de esa precisión (`numeroALatex`: entero o múltiplo de π),
  // con el `\approx` intacto: "≈ 4" no afirma más que "≈ 3.9996", y dice la verdad mejor.
  // La cuadratura ordinaria NO pasa por aquí (su error es ~1e-11): ahí redondear a π un
  // valor a 1e-4 de π sí sería inventar.
  if (area.impropia) return { cuerpo: numeroALatex(area.valor), conector: "\\approx" };
  return { cuerpo: formatearAprox(area.valor), conector: "\\approx" };
}
