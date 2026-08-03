// ─────────────────────────────────────────────
// trig · Valores exactos de los ángulos notables (PURO)
// ─────────────────────────────────────────────
//
// El diferenciador del bloque: donde otros muestran `0.866`, aquí se lee `√3/2`. No hay CAS
// detrás — es una TABLA canónica más una reducción al primer cuadrante.
//
// ── La regla dura ────────────────────────────────────────────────────────────────────────
// La exactitud viene del ORIGEN del ángulo, nunca de aproximar un decimal. Solo hay dos
// caminos por los que un ángulo llega con derecho a valores exactos:
//
//   1. ENTRADA SIMBÓLICA: está escrito en grados o en términos de π (`30°`, `\frac{\pi}{6}`).
//   2. IMÁN: el arrastre aterrizó sobre un notable, así que sabemos de dónde salió el número.
//
// `θ = 0.5236` NO entra por ninguno de los dos, aunque se parezca muchísimo a π/6, y se presenta
// solo en decimal. La alternativa sería enseñar `1/2` como seno de un ángulo cuyo seno no es 1/2,
// y una exactitud que miente es peor que ninguna.
//
// ── Por qué solo el primer cuadrante ─────────────────────────────────────────────────────
// Se tabulan 7 ángulos (0…90°) y los otros 17 se derivan por reducción más el signo del
// cuadrante. Con las 24 entradas escritas a mano, una errata en una sola produciría una
// incoherencia entre cuadrantes —sin 150° distinto de sin 30°— que nadie detecta a simple vista.
// Derivándolos, eso es imposible por construcción.

/** Un valor exacto en sus dos formatos: LaTeX para el panel, texto plano para el lienzo. */
export interface ValorExacto {
  /** Para KaTeX (panel ⓘ). */
  readonly tex: string;
  /** Para `fillText` sobre el canvas, que no renderiza LaTeX. */
  readonly txt: string;
  /**
   * ¿Es una SUMA en su nivel más externo (`2+\sqrt{3}`, `\sqrt{6}-\sqrt{2}`)? Entonces negarlo
   * pegando un menos delante lo rompe: `-2+\sqrt{3}` no es `-(2+\sqrt{3})`, es otro número
   * —y de hecho era el valor de la razón CONTRARIA, así que el error pasaba por plausible—.
   * Los valores marcados así se envuelven en paréntesis al cambiarles el signo.
   */
  readonly compuesto?: boolean;
}

/** Las seis razones en forma exacta. `null` = no definida (misma convención que el modelo). */
export interface RazonesExactas {
  readonly sin: ValorExacto;
  readonly cos: ValorExacto;
  readonly tan: ValorExacto | null;
  readonly csc: ValorExacto | null;
  readonly sec: ValorExacto | null;
  readonly cot: ValorExacto | null;
}

// Los valores, nombrados una sola vez. Escribirlos aquí y referenciarlos en la tabla evita la
// otra fuente de erratas: el mismo radical tecleado seis veces en seis casillas distintas.
const V = {
  cero: { tex: "0", txt: "0" },
  uno: { tex: "1", txt: "1" },
  dos: { tex: "2", txt: "2" },
  medio: { tex: "\\frac{1}{2}", txt: "1/2" },
  r2_2: { tex: "\\frac{\\sqrt{2}}{2}", txt: "√2/2" },
  r3_2: { tex: "\\frac{\\sqrt{3}}{2}", txt: "√3/2" },
  r3_3: { tex: "\\frac{\\sqrt{3}}{3}", txt: "√3/3" },
  r2: { tex: "\\sqrt{2}", txt: "√2" },
  r3: { tex: "\\sqrt{3}", txt: "√3" },
  dosR3_3: { tex: "\\frac{2\\sqrt{3}}{3}", txt: "2√3/3" },
  // Los de 15° y 75°, que son los que dan prestigio a la tabla.
  r6menosR2_4: { tex: "\\frac{\\sqrt{6}-\\sqrt{2}}{4}", txt: "(√6−√2)/4" },
  r6masR2_4: { tex: "\\frac{\\sqrt{6}+\\sqrt{2}}{4}", txt: "(√6+√2)/4" },
  r6menosR2: { tex: "\\sqrt{6}-\\sqrt{2}", txt: "√6−√2", compuesto: true },
  r6masR2: { tex: "\\sqrt{6}+\\sqrt{2}", txt: "√6+√2", compuesto: true },
  dosMenosR3: { tex: "2-\\sqrt{3}", txt: "2−√3", compuesto: true },
  dosMasR3: { tex: "2+\\sqrt{3}", txt: "2+√3", compuesto: true },
} as const;

/**
 * TABLA CANÓNICA: los notables del primer cuadrante, indexados por múltiplos de 15°
 * (0 → 0°, 1 → 15°, … 6 → 90°). Verificada numéricamente en la suite de pruebas: cada casilla
 * se evalúa y se compara con `Math.sin/cos/tan` a 1e-12, así que "confía en la tabla" es
 * "está probado".
 */
const PRIMER_CUADRANTE: readonly RazonesExactas[] = [
  // 0°
  { sin: V.cero, cos: V.uno, tan: V.cero, csc: null, sec: V.uno, cot: null },
  // 15°
  {
    sin: V.r6menosR2_4, cos: V.r6masR2_4, tan: V.dosMenosR3,
    csc: V.r6masR2, sec: V.r6menosR2, cot: V.dosMasR3,
  },
  // 30°
  { sin: V.medio, cos: V.r3_2, tan: V.r3_3, csc: V.dos, sec: V.dosR3_3, cot: V.r3 },
  // 45°
  { sin: V.r2_2, cos: V.r2_2, tan: V.uno, csc: V.r2, sec: V.r2, cot: V.uno },
  // 60°
  { sin: V.r3_2, cos: V.medio, tan: V.r3, csc: V.dosR3_3, sec: V.dos, cot: V.r3_3 },
  // 75°
  {
    sin: V.r6masR2_4, cos: V.r6menosR2_4, tan: V.dosMasR3,
    csc: V.r6menosR2, sec: V.r6masR2, cot: V.dosMenosR3,
  },
  // 90°
  { sin: V.uno, cos: V.cero, tan: null, csc: V.uno, sec: null, cot: V.cero },
];

/** Un paso de la rejilla de notables, en radianes: 15°. */
export const PASO_NOTABLE = Math.PI / 12;

/**
 * Índice del notable (en pasos de 15°) al que corresponde este ángulo, o `null` si no cae en
 * ninguno. El margen es de RUIDO DE COMA FLOTANTE, no de reconocimiento: esta función solo se
 * llama con ángulos que YA tienen derecho a exacto por su origen (ver la regla dura arriba), y
 * sirve para absorber que `30*(π/180)` y `π/6` no tienen por qué dar el mismo bit.
 */
function indiceNotable(rad: number): number | null {
  const k = Math.round(rad / PASO_NOTABLE);
  return Math.abs(rad - k * PASO_NOTABLE) < 1e-9 ? k : null;
}

/**
 * Antepone el signo, salvo cuando el valor es cero (`-0` no es una forma de escribir nada). Los
 * valores COMPUESTOS se envuelven antes: sin los paréntesis, `-(2+\sqrt{3})` se escribiría
 * `-2+\sqrt{3}`, que vale −0,27 en vez de −3,73. El detalle traicionero es que ese número
 * equivocado ES la tangente del ángulo suplementario, así que el resultado parecía razonable.
 */
function conSigno(v: ValorExacto | null, signo: number): ValorExacto | null {
  if (v === null) return null;
  if (signo > 0 || v.txt === "0") return v;
  return v.compuesto
    ? { tex: `-\\left(${v.tex}\\right)`, txt: `−(${v.txt})` }
    : { tex: `-${v.tex}`, txt: `−${v.txt}` };
}

/**
 * Las seis razones exactas de un ángulo notable, o `null` si el ángulo no es notable.
 *
 * `rad` debe venir de una de las dos vías con derecho a exacto; esta función NO comprueba la
 * procedencia (no puede: solo ve un número). Quien la llama es responsable de haberla ganado.
 */
export function razonesExactas(rad: number): RazonesExactas | null {
  const k = indiceNotable(rad);
  if (k === null) return null;
  const kc = ((k % 24) + 24) % 24;                       // coterminal, en pasos de 15°
  // Reducción al primer cuadrante: el índice del ángulo de REFERENCIA.
  const kr = kc <= 6 ? kc : kc <= 12 ? 12 - kc : kc <= 18 ? kc - 12 : 24 - kc;
  const base = PRIMER_CUADRANTE[kr];

  // Signos por cuadrante. El seno es positivo en la mitad de arriba y el coseno en la de la
  // derecha; las otras cuatro razones heredan el signo de los factores que las componen, así
  // que no hay que recordar ninguna regla nemotécnica: sale de la definición.
  const sSin = kc < 12 ? 1 : -1;
  const sCos = kc < 6 || kc > 18 ? 1 : -1;
  return {
    // Seno y coseno nunca son `null`, así que la aserción es segura: `conSigno` solo devuelve
    // `null` cuando recibe `null`, y en la tabla ambos están siempre presentes.
    sin: conSigno(base.sin, sSin) as ValorExacto,
    cos: conSigno(base.cos, sCos) as ValorExacto,
    tan: conSigno(base.tan, sSin * sCos),
    csc: conSigno(base.csc, sSin),
    sec: conSigno(base.sec, sCos),
    cot: conSigno(base.cot, sSin * sCos),
  };
}

/**
 * Coordenadas exactas de P = (cos θ, sin θ) en texto plano, para rotularlas junto al punto.
 * `null` si el ángulo no es notable: el lienzo se queda sin etiqueta antes que enseñar una
 * aproximación disfrazada de valor exacto.
 */
export function puntoExactoTexto(rad: number): string | null {
  const r = razonesExactas(rad);
  return r ? `(${r.cos.txt}, ${r.sin.txt})` : null;
}

/**
 * El ángulo en radianes como múltiplo exacto de π, en LaTeX (`\frac{5\pi}{6}`, `-\frac{\pi}{4}`,
 * `2\pi`, `0`). Solo para notables; `null` en cualquier otro caso.
 */
export function radianesExactoLatex(rad: number): string | null {
  const f = fraccionDePi(rad);
  if (f === null) return null;
  if (f.num === 0) return "0";
  const cuerpo = f.num === 1 ? "\\pi" : `${f.num}\\pi`;
  return f.den === 1 ? `${f.signo}${cuerpo}` : `${f.signo}\\frac{${cuerpo}}{${f.den}}`;
}

/** Lo mismo en texto plano, para el lienzo y el panel ⓘ (`π/6`, `3π/2`, `2π`, `−π/4`). */
export function radianesExactoTexto(rad: number): string | null {
  const f = fraccionDePi(rad);
  if (f === null) return null;
  if (f.num === 0) return "0";
  const signo = f.signo === "-" ? "−" : "";
  const cuerpo = f.num === 1 ? "π" : `${f.num}π`;
  return f.den === 1 ? `${signo}${cuerpo}` : `${signo}${cuerpo}/${f.den}`;
}

/**
 * El ángulo como fracción irreducible de π, o `null` si no es notable. Una sola fuente para las
 * dos escrituras: si la simplificación viviera en cada formateador, acabarían discrepando.
 */
function fraccionDePi(rad: number): { signo: string; num: number; den: number } | null {
  const k = indiceNotable(rad);
  if (k === null) return null;
  if (k === 0) return { signo: "", num: 0, den: 1 };
  // k pasos de 15° son k·π/12; se simplifica la fracción por el máximo común divisor.
  let num = Math.abs(k);
  let den = 12;
  const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b));
  const g = mcd(num, den);
  num /= g;
  den /= g;
  return { signo: k < 0 ? "-" : "", num, den };
}

/**
 * ¿La expresión ESCRITA nombra el ángulo en términos exactos? Es la primera de las dos vías con
 * derecho a exacto (la otra es el imán).
 *
 * Se mira el TEXTO, no el número, y esa es toda la gracia: `0.5236` y `\frac{\pi}{6}` valen casi
 * lo mismo pero solo el segundo DICE π. Un decimal es una medida, y una medida no tiene forma
 * cerrada por muy cerca que pase de una.
 */
export function fuenteSimbolica(expr: string): boolean {
  // `pi` se busca con sus fronteras escritas a mano y no con `\b`, porque `\b` no ve frontera
  // entre el `2` y la `p` de `2pi` —ambos son caracteres de palabra— y ese producto implícito es
  // notación corriente en el plugin. Las fronteras aquí son "no es una letra".
  return /°|\\degree|\\deg|\\pi|(^|[^a-z])pi([^a-z]|$)/i.test(expr);
}
