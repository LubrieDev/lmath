// ─────────────────────────────────────────────
// expr · Fracciones: recuperar las exactas y combinar las anidadas
// ─────────────────────────────────────────────
//
// Dos trabajos sobre el mismo material, que comparten `mcd` y `fraccionExacta`:
//
//   • RECUPERAR la fracción exacta de los coeficientes que `rationalize` serializa como
//     decimales (`0.5·x` → `x/2`), para que el panel pinte `\frac` y no un periódico.
//   • COMBINAR las fracciones ANIDADAS que produce `derivative` en UNA sola fracción.
//
// `mcd` y `fraccionExacta` se exportan porque también los usa el reordenamiento de
// `formatoExpr` y no tendría sentido una tercera copia.

import { parse, fraction } from "mathjs";

import {
  factores, terminos, strFactorSeguro, valorConstanteFactor, type Nodo,
} from "./nodo";

/** Máximo común divisor (enteros no negativos). */
export function mcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/** Fracción exacta n/d (d>0) de un número, si `fraction` la recupera con denominador
 *  razonable y reproduce el valor (evita convertir irracionales/ruido a fracciones
 *  monstruosas). Enteros → {n, d:1}. null si no es representable de forma limpia. */
export function fraccionExacta(v: number): { n: number; d: number } | null {
  if (!Number.isFinite(v)) return null;
  if (Number.isInteger(v)) return { n: v, d: 1 };
  try {
    const f = fraction(v);
    // Mismo listón que el resto del proyecto: por encima de 64, un denominador no es una
    // fracción que nadie haya escrito, es la expansión decimal de un irracional disfrazada.
    // Con el tope en 1e6, `log(2)+1` —o sea `1.30102999…`— salía del panel como
    // `\frac{4.23026\cdot 10^{+5}}{3.25147\cdot 10^{+5}}`, y además ese fraccionamiento
    // ocurría ANTES de la re-simbolización, que ya no llegaba a ver el decimal original.
    if (f.d > 64) return null;
    const val = (f.s * f.n) / f.d;
    return Math.abs(val - v) < 1e-9 ? { n: f.s * f.n, d: f.d } : null;
  } catch { return null; }
}

/** Reescribe UN término (nodo sin signo aditivo) a numerador/denominador con coeficiente
 *  RACIONAL: acumula todos los factores numéricos en una fracción n/d reducida y deja el
 *  resto como factores simbólicos. `0.5·x`→ num `x`, den `2`; `0.833·x`→ num `5*x`, den `6`;
 *  `0.5`→ num `1`, den `2`. Devuelve `num`/`den` (den null si es 1) SIEMPRE positivos y el
 *  signo aparte. null si no hay nada que racionalizar (todo entero, sin denominador) o si
 *  algún coeficiente no es fracción limpia. */
function terminoRacional(nodo: Nodo): { num: string; den: string | null; signo: 1 | -1 } | null {
  const fs = factores(nodo);
  let n = 1, d = 1;                          // fracción acumulada de los factores numéricos
  const simbNum: string[] = [], simbDen: string[] = [];
  let huboDecimal = false;
  for (const f of fs) {
    const val = valorConstanteFactor(f.nodo);
    if (val !== null) {
      const fr = fraccionExacta(val);
      if (!fr) return null;                  // coeficiente no reducible → no tocar el término
      if (!Number.isInteger(val)) huboDecimal = true;
      if (f.exp === 1) { n *= fr.n; d *= fr.d; } else { n *= fr.d; d *= fr.n; }
    } else {
      (f.exp === 1 ? simbNum : simbDen).push(strFactorSeguro(f.nodo));
    }
  }
  if (!huboDecimal && d === 1) return null;  // no hay fracción decimal que arreglar
  let signo: 1 | -1 = 1;
  if (n < 0) { signo = -signo as 1 | -1; n = -n; }
  if (d < 0) { signo = -signo as 1 | -1; d = -d; }
  const g = mcd(n, d) || 1; n /= g; d /= g;
  // Numerador: el coeficiente entero (si ≠1 o no hay símbolos) seguido de los símbolos.
  const num = [...(n !== 1 || simbNum.length === 0 ? [String(n)] : []), ...simbNum].join("*");
  const denPartes = [...(d !== 1 ? [String(d)] : []), ...simbDen];
  return { num, den: denPartes.length ? denPartes.join("*") : null, signo };
}

/** Devuelve un nodo equivalente con los coeficientes DECIMALES convertidos a fracciones
 *  exactas (`0.5x`→`x/2`, `0.333x`→`x/3`). Reescribe término a término y re-parsea; los
 *  términos que no se pueden racionalizar se conservan tal cual. Pensado para la salida de
 *  `rationalize`, que serializa los racionales como decimales. El signo negativo va DENTRO
 *  del numerador del término inicial (`-x/2`→`\frac{-x}{2}`) y como resta binaria en los
 *  siguientes (` - x/2`), evitando el feo `-\left(x/2\right)`. */
export function racionalizarFracciones(n: Nodo): Nodo {
  const ts = terminos(n);
  if (ts.length === 0) return n;
  const racs = ts.map((t) => terminoRacional(t.nodo));
  // Ningún término tiene fracción decimal que arreglar → nodo INTACTO (conserva la
  // tipografía nativa de mathjs, p. ej. el menos FUERA de la fracción en `-1/x²`).
  if (racs.every((r) => r === null)) return n;
  let out = "";
  ts.forEach((t, i) => {
    const rac = racs[i];
    // Término racionalizado: signo DENTRO del numerador (`\frac{-2x}{3}`, no
    // `-\left(\frac{2x}{3}\right)`). Término intacto: signo fuera, como lo da mathjs.
    if (rac) {
      const signo: 1 | -1 = (t.signo * rac.signo) as 1 | -1;
      const cuerpo = (numerador: string) => (rac.den ? `(${numerador})/(${rac.den})` : numerador);
      if (i === 0) out = signo === 1 ? cuerpo(rac.num) : cuerpo(`-${rac.num}`);
      else out += signo === 1 ? ` + ${cuerpo(rac.num)}` : ` - ${cuerpo(rac.num)}`;
    } else {
      const s = t.nodo.toString();
      if (i === 0) out = t.signo === 1 ? s : `-(${s})`;
      else out += t.signo === 1 ? ` + ${s}` : ` - ${s}`;
    }
  });
  try { return parse(out) as unknown as Nodo; } catch { return n; }
}
