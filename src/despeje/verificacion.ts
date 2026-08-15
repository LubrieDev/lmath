// ─────────────────────────────────────────────
// despeje · Verificación NUMÉRICA de un despeje
// ─────────────────────────────────────────────
//
// El despejador trabaja simbólicamente, pero varias de sus estrategias solo son válidas si
// se COMPRUEBA el resultado: elevar al cuadrado introduce ramas extrañas, y una raíz de la
// cuadrática en u=y^g puede no dar ningún y real. Estas cuatro funciones son esa comprobación:
// muestrean la candidata y la contrastan contra la ecuación ORIGINAL.
//
// Están aparte porque son OTRO NIVEL DE ABSTRACCIÓN. El resto de `despejar.ts` manipula
// árboles; esto compila y evalúa números. Mezclados en un archivo, la frontera entre «lo que
// el álgebra demuestra» y «lo que la muestra no ha desmentido» quedaba invisible, y esa
// frontera es justo la que decide si un despeje es sound.
//
// No dependen de ningún helper simbólico del despejador: su única entrada es un string y un
// evaluador de la diferencia D(x,y).

import { parse } from "mathjs";

import { compilarFuncion } from "../evaluador";
import { expandirDobleSigno } from "../core/parsing/dobleSigno";
import type { Nodo } from "../formatoExpr";

/** ¿La rama `u(x)` (una raíz de la cuadrática en u=y^g) da y REAL que cumple la ecuación original
 *  `evalD(x,y)=0` en la muestra? Rechaza (false) si algún punto viable falla; exige ≥2 puntos
 *  viables (para no aceptar por vacuidad una rama que nunca es real). Para g par, y=±u^{1/g} exige
 *  u≥0; para g impar, y es la raíz real con signo. */
export function ramaReal(uStr: string, g: number, evalD: (x: number, y: number) => number): boolean {
  let fu: (x: number) => unknown;
  try { const c = parse(uStr).compile(); fu = (x) => c.evaluate({ x }); }
  catch { return false; }
  // Muestra con valores PEQUEÑOS además de los grandes: hay curvas cuyo dominio en x es
  // estrecho (`x·y²+y+x=0` solo existe para |x|≤½) y con una muestra toda "ancha" no se
  // alcanzaban los 2 puntos viables que exige la validación → una rama CORRECTA se
  // descartaba y el despeje salía parcial.
  const muestras = [-2.3, -1.1, -0.4, -0.15, 0.15, 0.35, 0.7, 1.6, 3.2];
  let viables = 0;
  for (const x of muestras) {
    let u: unknown;
    try { u = fu(x); } catch { continue; }
    if (typeof u !== "number" || !Number.isFinite(u)) continue;
    const escala = 1 + x * x * x * x;
    if (g % 2 === 0) {
      if (u < -1e-9) continue;
      const y = Math.pow(Math.max(u, 0), 1 / g);
      for (const yy of [y, -y]) {
        const d = evalD(x, yy);
        if (!Number.isFinite(d) || Math.abs(d) > 1e-6 * (escala + y * y * y * y)) return false;
      }
    } else {
      const y = Math.sign(u) * Math.pow(Math.abs(u), 1 / g);
      const d = evalD(x, y);
      if (!Number.isFinite(d) || Math.abs(d) > 1e-6 * (escala + y * y * y * y)) return false;
    }
    viables++;
  }
  return viables >= 2;
}

/** ¿La solución `y = f(x)` cumple la ecuación ORIGINAL allí donde sus guardas se cumplen? Los x
 *  fuera del dominio (guarda falsa → `dom` evalúa NaN) no son fallos: ahí la fórmula no afirma
 *  nada. Exige ≥2 puntos válidos para no aceptar por vacuidad una fórmula que nunca existe. */
export function solucionValida(rhs: string, evalD: (x: number, y: number) => number): boolean {
  // Cada rama del ± por separado: `expandirDobleSigno` es quien las enumera para graficar, así
  // que validar sobre ellas comprueba EXACTAMENTE lo que el motor va a dibujar (evaluar el `pm`
  // a secas solo mediría la rama principal y la otra entraría sin comprobar).
  //
  // Ninguna rama puede CONTRADECIR la ecuación; que una quede VACÍA no es un fallo (su guarda de
  // dominio la anula en todo x, que es justo lo que le toca a la rama extraña que introduce el
  // elevar al cuadrado). Basta con que entre todas haya curva.
  let total = 0;
  for (const rama of expandirDobleSigno(rhs)) {
    const n = puntosValidos(rama, evalD);
    if (n === null) return false;
    total += n;
  }
  return total >= 2;
}

/** Evaluador numérico de una diferencia `D(x,y)` (NaN donde no esté definida). */
export function evaluadorDe(D: Nodo): ((x: number, y: number) => number) | null {
  try {
    const c = D.compile();
    return (x, y) => { try { return c.evaluate({ x, y }); } catch { return NaN; } };
  } catch { return null; }
}

/** Puntos de la rama que cumplen la ecuación original, o null si alguno la CONTRADICE. */
export function puntosValidos(rhs: string, evalD: (x: number, y: number) => number): number | null {
  // Con el scope del motor: el RHS lleva centinelas `dom`, que NO son funciones de mathjs sino
  // del evaluador —compilarlo a pelo daría símbolo libre y descartaría la solución entera.
  let f: (x: number) => unknown;
  try { f = compilarFuncion(rhs, "x"); }
  catch { return null; }
  let validos = 0;
  for (let i = 0; i <= 120; i++) {
    const x = -6 + (i * 12) / 120;
    let y: unknown;
    try { y = f(x); } catch { continue; }
    if (typeof y !== "number" || !Number.isFinite(y)) continue;
    const d = evalD(x, y);
    if (!Number.isFinite(d) || Math.abs(d) > 1e-6 * (1 + x * x * x * x + y * y * y * y)) return null;
    validos++;
  }
  return validos;
}
