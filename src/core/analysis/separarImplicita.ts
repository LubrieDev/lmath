// ─────────────────────────────────────────────
// analysis · Separación algebraica de implícitas en ramas explícitas
// ─────────────────────────────────────────────
//
// AGNÓSTICO y NUMÉRICO (Ring 1): opera SOLO sobre el oráculo `CampoEscalar`, sin
// mathjs ni símbolos. Detecta dos formas SEPARABLES de F(x,y)=0:
//   (A) LINEAL en y      F = a·y + c(x)        → 1 rama   y = −c(x)/a
//   (B) CUADRÁTICA PAR    F = a·y² + c(x)       → 2 ramas  y = ±√(−c(x)/a)
// con a constante (verificado en varios puntos) y c(x)=F(x,0). Si no es ninguna,
// devuelve null (la implícita va al trazador por continuación, lo general).
//
// POR QUÉ: una curva separable CON POLOS (p.ej. tan x + y² = 2 ⇒ y=±√(2−tan x)) es
// una astilla casi vertical pegada a cada asíntota que la continuación por gradiente
// numérico no resuelve de forma fiable al alejar el zoom (cruza el polo y conecta
// cálices vecinos). Pero como 1–2 funciones explícitas, el sampler 1D la traza
// perfecto a cualquier zoom (corta limpio en los polos). Es el "reutilizar el mejor
// algoritmo" del proyecto. El composition root solo deriva a esta ruta cuando F ES
// separable Y `tienePolos` (las cónicas suaves siguen por continuación → lazos cerrados).

import type { CampoEscalar, FuncionReal } from "../contracts";

/**
 * Campo TRANSPUESTO: Ft(x,y) = F(y,x). Permite reutilizar `despejarRamas`/`tienePolos`/
 * `localizarPolos` para las implícitas separables en X (F = a·xⁿ + c(y), p.ej.
 * tan(y)+x=5 ⇒ x = 5−tan y): se despeja la transpuesta como y=g(x) y el proveedor
 * gira el resultado (ver ProveedorImplicitoSeparable con `transpuesta=true`).
 */
export function campoTranspuesto(F: CampoEscalar): CampoEscalar {
  return { eval: (x, y) => F.eval(y, x) };
}

const XS = [0.37, 1.13, -0.91, 2.07, -1.6];   // puntos de prueba en x
const YS = [0.41, -0.72, 2.33, 1.05, -0.3];   // puntos de prueba en y (sin ceros)
const TOL_REL = 1e-6;
const A_MIN = 1e-9;

const N_MAX = 6; // grado máximo en y que se intenta despejar

/**
 * Devuelve las ramas explícitas y=f(x) de una implícita separable de la forma
 * F(x,y) = a·yⁿ + c(x) (UN solo monomio en y), o null. Cubre lineal (n=1, 1 rama),
 * cuadrática par (n=2, 2 ramas ±√), cúbica (n=3, 1 rama ∛), y en general:
 *   • n IMPAR → 1 rama   y = signo(g)·|g|^(1/n)   (real para todo g = −c/a)
 *   • n PAR   → 2 ramas  y = ±|g|^(1/n)  donde g ≥ 0  (NaN si g < 0)
 * Detección: para cada n se comprueba que a = (F(x,y)−F(x,0))/yⁿ es la MISMA constante
 * en todos los puntos de prueba (distintos x Y distintos y) — eso descarta a la vez las
 * mezclas de potencias (p.ej. y³−3xy del folium → a varía → null) y lo no polinómico.
 */
export function despejarRamas(F: CampoEscalar): FuncionReal[] | null {
  for (let n = 1; n <= N_MAX; n++) {
    let a0: number | null = null;
    let ok = true;
    for (let i = 0; i < XS.length; i++) {
      const x = XS[i], y = YS[i];                  // YS no tiene ceros
      const f0 = F.eval(x, 0), fy = F.eval(x, y);
      if (!Number.isFinite(f0) || !Number.isFinite(fy)) { ok = false; break; }
      const yn = Math.pow(y, n);
      if (Math.abs(yn) < 1e-12) { ok = false; break; }
      const a = (fy - f0) / yn;
      if (a0 === null) a0 = a;
      else if (Math.abs(a - a0) > TOL_REL * (1 + Math.abs(a0))) { ok = false; break; }
    }
    if (ok && a0 !== null && Math.abs(a0) >= A_MIN) return ramasMonomio(F, n, a0);
  }
  return null;
}

/** Construye las ramas y = (−c/a)^(1/n) (g=−c/a = yⁿ). Impar: 1 rama; par: 2 (±). */
function ramasMonomio(F: CampoEscalar, n: number, a: number): FuncionReal[] {
  const g = (x: number): number => -F.eval(x, 0) / a;           // yⁿ = g(x)
  if (n % 2 === 1) {
    // Raíz impar: real para todo g (incluido negativo).
    return [{ eval: (x: number) => { const v = g(x); return Math.sign(v) * Math.pow(Math.abs(v), 1 / n); } }];
  }
  // Raíz par: dos ramas, solo donde g ≥ 0.
  return [
    { eval: (x: number) => { const v = g(x); return v >= 0 ? Math.pow(v, 1 / n) : NaN; } },
    { eval: (x: number) => { const v = g(x); return v >= 0 ? -Math.pow(v, 1 / n) : NaN; } },
  ];
}

// ─── Separación TRIGONOMÉTRICA en y (periódica) ──────────────────────────────
//
// Detecta la forma F(x,y) = a(x)·T(y) + c(x) con T una trig PERIÓDICA de y (tan,
// cot, sin, cos, sec, csc) y a(x) NO constante en general (a diferencia de
// despejarRamas, que exige a constante). Entonces T(y) = g(x) = −c(x)/a(x) y la
// curva son INFINITAS ramas explícitas y = T⁻¹(g(x)) + k·período — que la
// continuación pierde al alejar el zoom (el grid de semillas no las ve todas),
// p.ej. tan(y)·(x²+1)=√(x+1). Es la "misma filosofía" de las separables con polos
// (Etapa 7/12) en HORIZONTAL: reducir a funciones explícitas y usar el sampler 1D.
//
// Detección NUMÉRICA (sin símbolos): para cada x de prueba se resuelven a(x), c(x)
// con dos y de referencia y se VERIFICA la afinidad en el resto de ys. Cualquier
// dependencia extra en y (y·tan y, tan²y, y+tan y…) rompe la afinidad → null.

export type TrigY = "tan" | "cot" | "sin" | "cos" | "sec" | "csc";
export interface SeparacionTrigY {
  tipo: TrigY;
  /** g(x) = −c(x)/a(x): el valor que debe tomar T(y) sobre la curva. */
  g: (x: number) => number;
}

const TRIGS: ReadonlyArray<{ tipo: TrigY; T: (y: number) => number }> = [
  { tipo: "tan", T: Math.tan },
  { tipo: "cot", T: (y) => 1 / Math.tan(y) },
  { tipo: "sin", T: Math.sin },
  { tipo: "cos", T: Math.cos },
  { tipo: "sec", T: (y) => 1 / Math.cos(y) },
  { tipo: "csc", T: (y) => 1 / Math.sin(y) },
];

/**
 * Devuelve la separación trigonométrica en y de F, o null. y₁,y₂ resuelven el
 * sistema lineal {F = a·Tᵢ + c}; los demás ys verifican. Los x donde F no es
 * finita (dominios parciales tipo √(x+1)) se saltan; se exigen ≥3 x válidos y
 * que a(x) no sea ~0 en todos (si no, F no depende de y por esta vía).
 */
export function separarTrigY(F: CampoEscalar): SeparacionTrigY | null {
  const [y1, y2, ...resto] = YS;
  for (const { tipo, T } of TRIGS) {
    const T1 = T(y1), T2 = T(y2);
    let validos = 0, maxA = 0, ok = true;
    for (const x of XS) {
      const F1 = F.eval(x, y1), F2 = F.eval(x, y2);
      if (!Number.isFinite(F1) || !Number.isFinite(F2)) continue;
      const a = (F1 - F2) / (T1 - T2);
      const c = F1 - a * T1;
      let escala = 1 + Math.abs(a) + Math.abs(c);
      let valido = true;
      for (const y of resto) {
        const real = F.eval(x, y);
        if (!Number.isFinite(real)) { valido = false; break; }
        escala = Math.max(escala, 1 + Math.abs(real));
        if (Math.abs(a * T(y) + c - real) > TOL_REL * escala) { ok = false; break; }
      }
      if (!ok) break;
      if (!valido) continue;
      validos++;
      maxA = Math.max(maxA, Math.abs(a));
    }
    if (ok && validos >= 3 && maxA >= A_MIN) {
      const g = (x: number): number => {
        const F1 = F.eval(x, y1), F2 = F.eval(x, y2);
        const a = (F1 - F2) / (T1 - T2);
        return -(F1 - a * T1) / a;
      };
      return { tipo, g };
    }
  }
  return null;
}

// ─── Separación por MONOMIO recíproco/absoluto en y ──────────────────────────
//
// Detecta F(x,y) = a(x)·M(y) + c(x) con M un monomio de y RECÍPROCO o ABSOLUTO
// (1/|y|, 1/y, 1/y², |y|). Entonces M(y) = g(x) = −c(x)/a(x) y la curva son 1–2
// ramas explícitas y = M⁻¹(g(x)), que el sampler 1D traza a cualquier zoom.
//
// POR QUÉ (no lo cubre `despejarRamas`): esa ancla c(x) en F(x,0), y un monomio
// RECÍPROCO hace F(x,0) INFINITA (1/|y| → ∞ en y=0) → su detección aborta; y el
// monomio ABSOLUTO rompe el test de a constante (a·|y|/y cambia de signo con y).
// Ambas familias caían al descubrimiento por rejilla, que las PIERDE al alejar el
// zoom: la curva se pega a su asíntota (1/|x|+1/|y|=1 tiende a |y|=1) y el cambio de
// signo de F queda DENTRO de una celda —además, la fila y=0 de la rejilla es un polo
// (F no finita) y se descarta—, así que no se siembra ninguna semilla y las ramas
// DESAPARECEN. Como funciones explícitas y=±|x|/(|x|−1), el sampler 1D las clava.
//
// Detección NUMÉRICA (misma estructura que `separarTrigY`): a(x), c(x) se resuelven
// con dos y de referencia y se VERIFICA la afinidad en el resto. La verificación es
// lo que discrimina las bases entre sí (una F en 1/y no pasa el test con base 1/|y|,
// ni un polinomio con ninguna) → sin falsos positivos.

interface MonomioY {
  nombre: string;
  /** El monomio M(y). */
  M: (y: number) => number;
  /** Las y con M(y)=g: 2 (monomio PAR: ± ), 1 (IMPAR) o 0 (sin solución real). */
  inversa: (g: number) => number[];
  /** Nº de ramas explícitas que produce (2 par / 1 impar). */
  nRamas: number;
}

const MONOMIOS: readonly MonomioY[] = [
  // 1/|y| (par): 1/|x|+1/|y|=1 ⇒ |y| = 1/g ⇒ y = ±1/g, solo donde g>0.
  { nombre: "1/|y|", M: (y) => 1 / Math.abs(y), nRamas: 2,
    inversa: (g) => (g > 0 ? [1 / g, -1 / g] : []) },
  // √|y| (par): √|y|+tan x=π ⇒ |y| = g² ⇒ y = ±g², solo donde g≥0. Sin esta base,
  // la ecuación caía a la continuación por rejilla, que pierde las astillas junto a
  // los polos de tan al alejar el zoom (mismo mal que motivó toda esta familia).
  { nombre: "√|y|", M: (y) => Math.sqrt(Math.abs(y)), nRamas: 2,
    inversa: (g) => (g >= 0 ? [g * g, -g * g] : []) },
  // 1/y (impar): 1/x+1/y=1 ⇒ y = 1/g (real para todo g≠0).
  { nombre: "1/y", M: (y) => 1 / y, nRamas: 1,
    inversa: (g) => (g !== 0 && Number.isFinite(g) ? [1 / g] : []) },
  // 1/y² (par): 1/x²+1/y²=1 ⇒ y = ±1/√g, solo donde g>0.
  { nombre: "1/y^2", M: (y) => 1 / (y * y), nRamas: 2,
    inversa: (g) => (g > 0 ? [1 / Math.sqrt(g), -1 / Math.sqrt(g)] : []) },
  // |y| (par): |x|+|y|=1 (rombo) ⇒ y = ±g, solo donde g≥0.
  { nombre: "|y|", M: (y) => Math.abs(y), nRamas: 2,
    inversa: (g) => (g >= 0 ? [g, -g] : []) },
];

/**
 * Ramas explícitas y=f(x) de una implícita AFÍN en un monomio recíproco/absoluto de y
 * (F = a(x)·M(y) + c(x)), o null si no encaja en ninguna base. 2 ramas si M es par
 * (±), 1 si es impar. Fuera del dominio (g sin solución real) la rama devuelve NaN →
 * el sampler la parte, como con cualquier función explícita.
 */
export function ramasMonomioY(F: CampoEscalar): FuncionReal[] | null {
  const [y1, y2, ...resto] = YS;
  for (const m of MONOMIOS) {
    const M1 = m.M(y1), M2 = m.M(y2);
    if (!Number.isFinite(M1) || !Number.isFinite(M2) || Math.abs(M1 - M2) < 1e-12) continue;

    let validos = 0, maxA = 0, ok = true;
    for (const x of XS) {
      const F1 = F.eval(x, y1), F2 = F.eval(x, y2);
      if (!Number.isFinite(F1) || !Number.isFinite(F2)) continue;
      const a = (F1 - F2) / (M1 - M2);
      const c = F1 - a * M1;
      let escala = 1 + Math.abs(a) + Math.abs(c);
      let valido = true;
      for (const y of resto) {
        const real = F.eval(x, y);
        if (!Number.isFinite(real)) { valido = false; break; }
        escala = Math.max(escala, 1 + Math.abs(real));
        if (Math.abs(a * m.M(y) + c - real) > TOL_REL * escala) { ok = false; break; }
      }
      if (!ok) break;
      if (!valido) continue;
      validos++;
      maxA = Math.max(maxA, Math.abs(a));
    }
    if (!ok || validos < 3 || maxA < A_MIN) continue;

    // g(x) = −c(x)/a(x): el valor que M(y) debe tomar sobre la curva (a y c se re-resuelven
    // en cada x, así que a(x) NO tiene que ser constante —a diferencia de `despejarRamas`).
    const g = (x: number): number => {
      const F1 = F.eval(x, y1), F2 = F.eval(x, y2);
      const a = (F1 - F2) / (M1 - M2);
      return -(F1 - a * M1) / a;
    };
    // Una FuncionReal por rama: la k-ésima solución de M(y)=g(x), o NaN fuera del dominio.
    return Array.from({ length: m.nRamas }, (_, k): FuncionReal => ({
      eval: (x: number) => {
        const ys = m.inversa(g(x));
        return k < ys.length ? ys[k] : NaN;
      },
    }));
  }
  return null;
}

/**
 * ¿|F(x,0)| DIVERGE a ∞ hacia un polo dentro de (xa,xb)? Localiza el máximo de |F| por
 * búsqueda ternaria y comprueba que la magnitud ACELERA sin cota al acercarse: a distancia
 * ε/100 crece MÁS de lo que creció de ε a ε/10 ((m3−m2) ≥ (m2−m1)). Un polo real (−3x⁻²)
 * explota sin cota; un pico suave FINITO (el |x²−9| de una cónica, máximo acotado en su
 * vértice) DESACELERA hacia su valor límite → false. Esa aceleración —no la mera magnitud— es
 * lo que separa la singularidad de un bache alto pero finito (misma idea que
 * `detectarAsintotasMismaRama` del sampler explícito).
 */
function divergeEnPolo(F: CampoEscalar, xa: number, xb: number): boolean {
  const absF = (x: number): number => {
    const w = F.eval(x, 0);
    return Number.isFinite(w) ? Math.abs(w) : Infinity;
  };
  let lo = xa, hi = xb;
  for (let k = 0; k < 50; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (absF(m1) < absF(m2)) lo = m1; else hi = m2;   // ternaria hacia el máximo de |F|
  }
  const xp = (lo + hi) / 2;
  const eps = Math.max(1e-9, Math.abs(xp) * 1e-6);
  const m1 = Math.max(absF(xp - eps), absF(xp + eps));
  const m2 = Math.max(absF(xp - eps / 10), absF(xp + eps / 10));
  const m3 = Math.max(absF(xp - eps / 100), absF(xp + eps / 100));
  return Number.isFinite(m1) && m3 > m2 && m2 > m1 && (m3 - m2) >= (m2 - m1) && m3 > 1e3;
}

/**
 * ¿F tiene POLOS (asíntotas verticales) en c(x)=F(x,0)? Dos firmas:
 *   • IMPAR: cambio de signo con |F| GRANDE a ambos lados (+∞↔−∞) — un cero real tiene |F|
 *     pequeño cerca. Distingue tan(x)−2 (poled) de x²−9 (no).
 *   • PAR: |F(x,0)|→∞ SIN cambio de signo (−3x⁻² diverge a −∞ por AMBOS lados). El escaneo de
 *     signo lo pierde; se busca un valor central no finito, o un máximo local de |F| enorme, con
 *     los flancos del MISMO signo, y se CONFIRMA con `divergeEnPolo` (que descarta el bache
 *     finito de una cónica por su desaceleración). Sin esta rama, `y=±√g` con g≈3/x² (la eq.
 *     `x²+3x+y²−3x⁻²=…`) caía a la continuación genérica, que pierde sus brazos asintóticos
 *     junto a x=0 al alejar el zoom, en vez de al sampler 1D que sí los dibuja a cualquier zoom.
 * El gate que decide continuación (cónica suave → lazos) vs ramas explícitas (separable con polos).
 */
export function tienePolos(F: CampoEscalar): boolean {
  const N = 2000, x0 = -50, x1 = 50;
  const paso = (x1 - x0) / N;
  const xs: number[] = [], v: number[] = [];
  for (let i = 0; i <= N; i++) { xs.push(x0 + i * paso); v.push(F.eval(xs[i], 0)); }

  // Polo IMPAR: cambio de signo con |F| grande a ambos lados.
  for (let i = 1; i <= N; i++)
    if (Number.isFinite(v[i - 1]) && Number.isFinite(v[i]) && v[i - 1] * v[i] < 0 &&
        Math.min(Math.abs(v[i - 1]), Math.abs(v[i])) > 1) return true;

  // Polo PAR: |F|→∞ sin cambio de signo. Candidato = flancos finitos del MISMO signo (a·c>0)
  // con el centro no finito o un máximo local de |F| enorme; se confirma con `divergeEnPolo`.
  for (let i = 1; i < N; i++) {
    const a = v[i - 1], b = v[i], c = v[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(c) || a * c <= 0) continue;
    const pico = !Number.isFinite(b) ||
      (Math.abs(b) > Math.abs(a) && Math.abs(b) > Math.abs(c) && Math.abs(b) > 1e3);
    if (pico && divergeEnPolo(F, xs[i - 1], xs[i + 1])) return true;
  }
  return false;
}

/**
 * Localiza las x de los POLOS de c(x)=F(x,0) dentro de [x0,x1] (asíntotas verticales
 * de las ramas despejadas). Detecta cada salto +∞↔−∞ (cambio de signo con |F| grande a
 * ambos lados) y lo bisecta hasta la asíntota. Lo usa el proveedor separable para CORTAR
 * las ramas en los polos que el sampler 1D no detecta cuando la raíz los comprime (p.ej.
 * ∛ aplana el polo: `cbrt(2−tan x)` no dispara el corte por |y|→∞ a muestreo grueso).
 */
/** Semiventana CENTRAL fija (independiente del zoom/paneo) para DETECTAR el período de la
 *  retícula de polos: garantiza ≥2 polos aunque la vista esté lejísimos o su propio escaneo
 *  (paso acotado) salte los polos a zoom-out. tan/cot/sec/csc tienen período ≤π → ±40 sobra. */
const CENTRO_POLOS = 40;

/** Escanea [a,b] (paso ≤0.08, N acotado) y bisecta cada cambio de signo con |F| grande a ambos
 *  lados (polo +∞↔−∞) hasta la asíntota. Devuelve las x de los polos IMPARES hallados en [a,b]. */
function escanearPolos(F: CampoEscalar, a: number, b: number): number[] {
  const N = Math.min(20000, Math.max(1500, Math.ceil((b - a) / 0.08)));
  const paso = (b - a) / N;
  const polos: number[] = [];
  let xa = a, fa = F.eval(a, 0);
  for (let i = 1; i <= N; i++) {
    const xb = a + i * paso;
    const fb = F.eval(xb, 0);
    if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb < 0 &&
        Math.min(Math.abs(fa), Math.abs(fb)) > 1) {
      let lo = xa, hi = xb, flo = fa;
      for (let k = 0; k < 50; k++) {
        const m = (lo + hi) / 2, fm = F.eval(m, 0);
        if (!Number.isFinite(fm) || flo * fm < 0) hi = m; else { lo = m; flo = fm; }
      }
      polos.push((lo + hi) / 2);
    }
    xa = xb; fa = fb;
  }
  return polos;
}

/** Ordena y colapsa valores más cercanos que `tol` (une el mismo polo hallado por dos escaneos). */
function dedupOrdenado(xs: number[], tol: number): number[] {
  const s = [...xs].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of s) if (out.length === 0 || x - out[out.length - 1] > tol) out.push(x);
  return out;
}

/**
 * Localiza las x de los POLOS de c(x)=F(x,0) dentro de [x0,x1] (asíntotas verticales de las
 * ramas despejadas). El PERÍODO de la retícula se ancla a una ventana CENTRAL fija
 * (`CENTRO_POLOS`), NO a la vista: así, aunque a zoom-out el paso del escaneo de la vista supere
 * el espaciado de los polos —o el paneo aleje la vista del centro—, `extenderPolosPeriodicos`
 * siempre dispone de ≥2 polos para deducir el paso y GENERAR la retícula analíticamente sobre
 * [x0,x1] (verificando cada candidato con el sondeo a ±ε). Antes, con solo el escaneo de la
 * vista, los polos lejanos de tan(x) se perdían a zoom-out y las astillas parpadeaban.
 *
 * NB: no se reutiliza `detectarPeriodos` (periodicidadCampo) porque mide la periodicidad del
 * CAMPO —F(x+P,y)=F(x,y)—, y aquí el campo NO es periódico (x²+x+tan x) aunque sus POLOS sí lo
 * sean; el período correcto es el de la retícula de polos, que deduce `extenderPolosPeriodicos`.
 *
 * El escaneo de la VISTA se suma para el zoom-in (la ventana central no lo toca) y para
 * distribuciones de polos NO periódicas (tan(x²)), que la extensión deja intactas. Solo se
 * devuelven los polos dentro de [x0,x1] (los centrales fuera de rango sirven SOLO para el paso).
 */
export function localizarPolos(F: CampoEscalar, x0: number, x1: number): number[] {
  const centrales = escanearPolos(F, -CENTRO_POLOS, CENTRO_POLOS);
  const enVista = escanearPolos(F, x0, x1);
  const todos = dedupOrdenado([...centrales, ...enVista], 1e-7);
  // Verificación FINAL de cada polo con el sondeo a ±ε (|c|→∞ y cambio de signo): el escaneo
  // (umbral |F|>1) también bracketea el CERO que se pega a cada polo (c=x²+x+tan x−C tiene uno
  // junto a cada asíntota) y lo reporta como polo ESPURIO —una x que varía con el paso del
  // escaneo (⇒ con el zoom) y que haría a `partirEnPolos` cortar la rama donde NO hay
  // discontinuidad—. Filtrar por `esPoloVerificado` deja SOLO los polos reales, un conjunto
  // determinista independiente de la vista: misma retícula a cualquier zoom/paneo.
  return extenderPolosPeriodicos(F, todos, x0, x1)
    .filter((p) => p >= x0 && p <= x1 && esPoloVerificado(F, p));
}

/** ¿Hay un polo de c(x)=F(x,0) EXACTAMENTE en px? Sondea a ±ε: salto ±∞↔∓∞ (enorme y de
 *  signos opuestos). Un cero empinado de c —que el escaneo confunde con polo— da valores
 *  pequeños al acercarse y responde false. */
function esPoloVerificado(F: CampoEscalar, px: number): boolean {
  const eps = Math.max(1e-9, Math.abs(px) * 1e-11);
  const a = F.eval(px - eps, 0), b = F.eval(px + eps, 0);
  return Number.isFinite(a) && Number.isFinite(b) && a * b < 0 &&
         Math.min(Math.abs(a), Math.abs(b)) > 1e3;
}

/**
 * Completa una retícula PERIÓDICA de polos que el escaneo solo ve cerca del centro.
 * En c(x) = x²+x+tan x−C, lejos del origen el CERO de c se pega al polo a ~1/x²: dentro
 * de un paso de escaneo c va de +grande a +grande pasando por ±∞ y por 0 —los extremos
 * tienen el MISMO signo— y ni el polo ni el cero dejan huella en NINGÚN muestreo regular.
 * Pero los polos de una c así son EXACTAMENTE periódicos aunque c no lo sea (c(x+π)−c(x)
 * es un polinomio): con ≥2 polos verificados cerca del centro se deduce el paso (mínimo
 * espaciado; los demás deben ser múltiplos enteros), se extiende la retícula k·paso a
 * todo [x0,x1] y se VERIFICA cada candidato con el sondeo a ±ε — un candidato falso
 * (polos no periódicos: tan(x²)) no pasa la verificación y no se inventa nada.
 */
function extenderPolosPeriodicos(F: CampoEscalar, polos: number[], x0: number, x1: number): number[] {
  const verificados = polos.filter((p) => esPoloVerificado(F, p));
  if (verificados.length < 2) return polos;
  // Paso base: espaciado MÍNIMO entre verificados; el resto debe ser múltiplo entero.
  let d = Infinity;
  for (let i = 1; i < verificados.length; i++) d = Math.min(d, verificados[i] - verificados[i - 1]);
  if (!(d > 1e-9)) return polos;
  for (let i = 1; i < verificados.length; i++) {
    const m = (verificados[i] - verificados[i - 1]) / d;
    if (Math.abs(m - Math.round(m)) > 1e-4) return polos;   // no periódicos → tal cual
  }
  // Afina d con la BASE más larga disponible (promedia el error de bisección).
  const span = verificados[verificados.length - 1] - verificados[0];
  d = span / Math.round(span / d);

  const MAX_CANDIDATOS = 4000;                               // más allá, son subpíxel seguro
  const p0 = verificados[0];
  const kLo = Math.ceil((x0 - p0) / d), kHi = Math.floor((x1 - p0) / d);
  if (kHi - kLo + 1 > MAX_CANDIDATOS) return polos;
  const salida = new Set<number>(polos);
  for (let k = kLo; k <= kHi; k++) {
    const cand = p0 + k * d;
    if (polos.some((q) => Math.abs(q - cand) < d / 4)) continue;  // ya lo tenía el escaneo
    if (esPoloVerificado(F, cand)) salida.add(cand);
  }
  return [...salida].sort((a, b) => a - b);
}
