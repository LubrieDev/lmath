// ─────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────

import { CENTINELAS_SIGNO } from "./core/parsing/dobleSigno";

export const FUNCIONES_TRIG = ["sin", "cos", "tan", "sec", "csc", "cot"] as const;
export const FUNCIONES_LATEX = "sin|cos|tan|sec|csc|cot|log|ln";

// Trigonométricas inversas que MathJS NO trae nativas. Se inyectan en el scope
// de evaluación como wrappers de dominio real:
//   acsc(x)=asin(1/x)   asec(x)=acos(1/x)   acot(x)=pi/2 - atan(x)
// acsc/asec usan Math.* para devolver NaN —no un complejo— fuera del dominio,
// que es lo que el motor de curvas ya filtra con Number.isFinite.
// acot usa la convención CONTINUA de rango (0, π) —la de Desmos/cálculo—, no
// atan(1/x): esta última salta de +π/2 a −π/2 en x=0. pi/2-atan(x) decrece sin
// cortes de π (en −∞) a 0 (en +∞), pasando por π/2 en x=0.
export const FUNCIONES_INVERSAS_EXTRA = {
  acsc: (x: number) => Math.asin(1 / x),
  asec: (x: number) => Math.acos(1 / x),
  acot: (x: number) => Math.PI / 2 - Math.atan(x),
};

// Centinelas del DOBLE SIGNO (`±`, `∓`): funciones unarias que representan la rama
// PRINCIPAL de la familia (pm(u)=+u, mp(u)=−u). Existen para que una expresión con ±
// sea EVALUABLE en un solo valor allí donde el motor necesita uno —clasificación de
// degeneradas, crosshair, valor de la integral—; las DOS ramas reales las produce la
// expansión de `motor/parsing/dobleSigno.ts`, que es quien grafica la familia entera.
// Sin esto, `pm` era un símbolo libre: NaN en todo x (plano vacío, sin error).
// Un centinela por EJE de signo (`pm`/`mp` = eje 0, `pm2`/`mp2` = eje 1): dos ± independientes
// —`y = ±arccos((a ± √d)/2)`— son cuatro curvas reales, y con un solo eje se perdían dos. Los
// nombres y sus signos salen de dobleSigno.ts, que es quien define los ejes: así el scope de
// evaluación no puede quedarse corto si algún día se añade otro.
export const FUNCIONES_SIGNO: Record<string, (u: number) => number> =
  Object.fromEntries(CENTINELAS_SIGNO.map(([nombre, signo]) => [nombre, (u: number) => signo * u]));

// Centinela de CONDICIÓN DE DOMINIO del despeje: `dom(cuerpo, R)` vale `cuerpo` donde R≥0 y
// NaN donde R<0. Lo emite el despeje de las inversas de RANGO RESTRINGIDO (√ de índice par,
// |·|, ⁿ√(yᵐ) de índice par), que solo son válidas donde el otro lado es ≥0: sin la guarda,
// `√y=R ⇒ y=R²` dibujaría la rama fantasma R<0 que la curva original no tiene. Al evaluarse a
// NaN allí, esa rama no existe —igual que la original—; el LaTeX lo pinta como la coletilla
// `, R≥0` (latex.ts), la forma honesta de un despeje con dominio restringido. Como pm/mp,
// existe para que el despeje sea EVALUABLE (fidelidad numérica del panel y las pruebas).
export const FUNCIONES_DOMINIO = {
  dom: (cuerpo: number, cond: number) => (cond >= 0 ? cuerpo : NaN),
};

// Trigonométricas DIRECTAS con polos honestos. En coma flotante, evaluar una trigonométrica
// EXACTAMENTE en su polo no da infinito: da un residuo finito enorme (`Math.tan(pi/2)` es
// 1.633e16, `1/Math.sin(pi)` es 8.2e15) — un valor que no existe, presentado como número.
// Así graficaba el motor `tan(A)` con `A = 90`: una recta `y=1.63e16` fuera de la vista en
// vez del velo «Indefinida» que la expresión dice. Estas guardas devuelven lo que la función
// vale ahí: ±Infinity en el polo —que el clasificador de degeneradas ya traduce a la etiqueta
// «Indefinida», y el trazador a un corte limpio de asíntota—, y el cero EXACTO donde la
// función se anula (para que `1/cos(pi/2)` sea 1/0, no 1/6.1e-17).
//
// La detección es sobre el ARGUMENTO, no sobre el resultado: el polo de tan/sec está en
// pi/2+kpi y el de cot/csc en kpi; si el argumento cae a menos de 1e-12 vueltas de pi de él,
// ES el polo — el float de un polo exacto (90·pi/180, pi/2, 3pi/2…) cae a ~1e-16 de él, y
// nadie teclea ni desliza un punto a 3e-12 radianes del polo con intención de leer su valor,
// que ahí ya no tiene ni un dígito bueno. La ventana es MUY estrecha a propósito: el
// localizador de polos de las implícitas (`localizarPolos`) sondea a ±1e-9 del polo
// esperando valores FINITOS enormes de signos opuestos —asíntota verificada—, y una ventana
// ancha se comería esos sondeos. Un argumento legítimo cerca (`tan(89.99)` ≈ 5729,
// `tan(1.57)`) no se toca.
const CERCA_POLO = 1e-12;
/** ¿Es `u` el float de pi/2 + k·pi? Polos de tan y sec, ceros de cos. */
const enPoloMedioPi = (u: number): boolean => {
  const k = (u - Math.PI / 2) / Math.PI;
  return Math.abs(k - Math.round(k)) < CERCA_POLO;
};
/** ¿Es `u` el float de k·pi? Polos de cot y csc, ceros de sin y tan. */
const enPoloPi = (u: number): boolean => {
  const k = u / Math.PI;
  return Math.abs(k - Math.round(k)) < CERCA_POLO;
};

/**
 * Las seis directas, con la guarda. Las claves son los nombres DEL ÁRBOL (`tan`, `sin`…);
 * la ruta mathjs las consume reescritas a `tanG`/`sinG`… (ver evaluador.ts) y la nativa las
 * consulta por su nombre original. Fuera de polo y cero exactos, `Math.*` idéntica.
 */
export const FUNCIONES_TRIG_GUARDADAS: Readonly<Record<string, (u: number) => number>> = {
  tan: (u) => (enPoloMedioPi(u) ? Infinity : enPoloPi(u) ? 0 : Math.tan(u)),
  sec: (u) => (enPoloMedioPi(u) ? Infinity : 1 / Math.cos(u)),
  cot: (u) => (enPoloPi(u) ? Infinity : 1 / Math.tan(u)),
  csc: (u) => (enPoloPi(u) ? Infinity : 1 / Math.sin(u)),
  sin: (u) => (enPoloPi(u) ? 0 : Math.sin(u)),
  cos: (u) => (enPoloMedioPi(u) ? 0 : Math.cos(u)),
};

// floor/ceil RÁPIDAS para el scope de evaluación. Las nativas de mathjs pasan por
// typed-function + nearlyEqual con soporte BigNumber/Fraction: ~18 µs por llamada
// frente a ~1.5 µs de sin(x) (medido) — al muestrear miles de puntos por frame,
// floor(x) daba ~5× el coste de sin(x) en pan/zoom. En el scope se resuelven ANTES
// que las de mathjs (misma vía que las inversas extra) y trabajan solo en ℝ, que es
// lo único que grafica el motor (un no-número se degrada a NaN, que ya es "hueco").
// Se CONSERVA la corrección epsilon de mathjs (0.1·30=2.9999999999999996 debe dar
// piso 3, no 2): si x está a <1e-12 relativo de un entero, se redondea a él.
const enteroCercano = (x: number): number | null => {
  const r = Math.round(x);
  return Math.abs(x - r) <= 1e-12 * Math.max(1, Math.abs(x)) ? r : null;
};
export const FUNCIONES_ESCALON_RAPIDAS = {
  floor: (x: number) => (typeof x === "number" ? enteroCercano(x) ?? Math.floor(x) : NaN),
  ceil: (x: number) => (typeof x === "number" ? enteroCercano(x) ?? Math.ceil(x) : NaN),
};
