// ─────────────────────────────────────────────
// analysis · Propiedades de una integral definida (bloque obs-integral)
// ─────────────────────────────────────────────
//
// El panel ⓘ nació para y=f(x), así que sobre un bloque obs-integral describía el
// INTEGRANDO como si fuera una curva suelta: "corta el eje Y en 0", "raíces: 0", "sin
// vértices". Nada de eso habla de la integral —son propiedades de f, no de ∫ₐᵇf—, y la
// pregunta que trae quien abre el cuadro es otra: qué región se está midiendo, cuánto
// vale, y si ese número es un área o una diferencia de áreas.
//
// Este módulo produce esas propiedades. Es numérico y trabaja sobre la MISMA `FuncionReal`
// que grafica el motor, así que el panel no puede contradecir al sombreado del plano.
//
// Cuatro decisiones que conviene no revisar sin leer esto:
//
//  • EL VALOR NO SE RECALCULA. Se pide a `areaDefinida`, el mismo cómputo que alimenta el
//    panel de la fórmula. Dos cuadraturas distintas para el mismo bloque acabarían dando
//    dos números que se contradicen a la vista, y el que ya existe es el bueno.
//
//  • SIN VALOR NO HAY ANÁLISIS. Divergente, límites no numéricos o hueco del dominio →
//    `null`. Esos casos ya llevan velo sobre el plano (`etiquetaIntegral`), que es el sitio
//    ÚNICO del diagnóstico; repetirlos aquí sería decir dos veces lo mismo, y peor, en un
//    cuadro que en esos bloques ni siquiera se monta.
//
//  • LA DESCOMPOSICIÓN EN ÁREAS ES OPCIONAL. Solo se publica si el integrando cruza el eje
//    (si no cruza, el "área positiva" ES el valor y repetirlo no informa de nada) y solo si
//    los trozos SUMAN el total dentro de tolerancia. Esa comprobación no es ceremonia: los
//    cruces salen de un muestreo, y uno que se escape parte mal el intervalo y produce dos
//    números plausibles y falsos. Antes que eso, se calla.
//
//  • EL SIGNO DEL INTEGRANDO SE AFIRMA, NO SE NIEGA. `signo` sale del mismo barrido que los
//    cruces: con 1024 muestras un lóbulo más estrecho que (b−a)/1024 se pierde. Por eso
//    "no cruza" es una afirmación del barrido, no un teorema, y el panel la usa para
//    rotular el valor ("es el área bajo la curva"), nunca para negar otra cosa.

import type { FuncionReal } from "../contracts";
import { areaDefinida } from "./areaBajoRama";

/** Muestras del barrido de signos sobre [a,b]. Mismo orden de magnitud que el escaneo de
 *  polos de `areaBajoRama` (512): basta para los integrandos que se escriben a mano. */
const MUESTRAS = 1024;

/** Cruces del eje por encima de los cuales el panel deja de enumerarlos. Con más de seis
 *  la lista ya no cabe en el cuadro ni se lee; y una oscilante (sin(1/x)) tiene infinitos,
 *  así que un número concreto sería mentira. */
const MAX_CRUCES = 6;

/** Pasos de bisección para pulir un cruce. 60 lleva el intervalo al épsilon de máquina. */
const ITERS_BISECCION = 60;

/** Análisis de ∫ₐᵇ f dx. Todo lo opcional es `null` cuando no se puede afirmar. */
export interface AnalisisIntegral {
  /** Límites TAL COMO se escribieron (a puede ser mayor que b). */
  readonly a: number;
  readonly b: number;
  /** Valor con signo de ∫ₐᵇ f dx (el de `areaDefinida`, no uno nuevo). */
  readonly valor: number;
  /** Hubo singularidad en un extremo y la integral converge: el valor es aproximado. */
  readonly impropia: boolean;
  /** Extremos del intervalo donde f no toma un valor finito (solo si `impropia`). */
  readonly singularidades: readonly number[];
  /** a > b: el intervalo está escrito al revés y ∫ₐᵇ = −∫ᵦᵃ. */
  readonly invertido: boolean;
  /** Signo del integrando en el intervalo: +1 nunca baja del eje, −1 nunca sube, 0
   *  idénticamente nulo, null si cruza (entonces `cruces` dice dónde). */
  readonly signo: 1 | -1 | 0 | null;
  /** Puntos del interior donde f cambia de signo, ordenados. `null` = demasiados. */
  readonly cruces: readonly number[] | null;
  /** Área GEOMÉTRICA por encima del eje (≥ 0), medida sobre [min(a,b), max(a,b)]. Null si
   *  no procede (el integrando no cruza el eje) o si la descomposición no reconstruyó el
   *  total. No lleva la orientación de la escritura: con los límites en orden suma con
   *  `areaNegativa` el valor de la integral, y con los límites al revés, su opuesto. */
  readonly areaPositiva: number | null;
  /** Ídem por debajo del eje, con su signo (≤ 0). */
  readonly areaNegativa: number | null;
  /** Valor medio de f en el intervalo, ∫ₐᵇf/(b−a). Null si a = b. */
  readonly promedio: number | null;
}

/** Bisección hacia la raíz entre dos muestras de signo opuesto (sin polos: `areaDefinida`
 *  ya rechazó el intervalo si los hubiera, así que aquí un cambio de signo ES una raíz). */
function raizEntre(g: (x: number) => number, x1: number, x2: number): number {
  let lo = x1, hi = x2;
  let flo = g(lo);
  for (let i = 0; i < ITERS_BISECCION; i++) {
    const m = (lo + hi) / 2;
    const fm = g(m);
    if (fm === 0 || !Number.isFinite(fm)) return m;
    if ((fm > 0) === (flo > 0)) { lo = m; flo = fm; } else { hi = m; }
  }
  return (lo + hi) / 2;
}

/**
 * Barre [lo,hi] y devuelve los cruces del eje y el signo constante cuando no hay ninguno.
 * Las muestras no finitas se saltan (un extremo singular es legítimo en una impropia
 * convergente) y las nulas no rompen la racha: f=x con una muestra justo en 0 sigue
 * siendo UN cruce, no dos, porque se compara contra la última muestra NO nula.
 */
function barrerSignos(
  g: (x: number) => number, lo: number, hi: number
): { cruces: number[] | null; signo: 1 | -1 | 0 | null } {
  const paso = (hi - lo) / MUESTRAS;
  const cruces: number[] = [];
  let xPrev = NaN, sPrev = 0;      // última muestra con signo NO nulo
  let vioPositivo = false, vioNegativo = false;

  for (let i = 0; i <= MUESTRAS; i++) {
    const x = i === MUESTRAS ? hi : lo + paso * i;
    const v = g(x);
    if (!Number.isFinite(v) || v === 0) continue;
    const s: 1 | -1 = v > 0 ? 1 : -1;
    if (s > 0) vioPositivo = true; else vioNegativo = true;
    if (sPrev !== 0 && s !== sPrev) {
      cruces.push(raizEntre(g, xPrev, x));
      if (cruces.length > MAX_CRUCES) return { cruces: null, signo: null };
    }
    xPrev = x; sPrev = s;
  }

  if (cruces.length > 0) return { cruces, signo: null };
  // Sin cruces el signo es el que se haya visto; sin ninguna muestra no nula, f ≡ 0.
  const signo: 1 | -1 | 0 = vioPositivo ? 1 : vioNegativo ? -1 : 0;
  return { cruces, signo };
}

/**
 * Parte [lo,hi] por los cruces e integra cada trozo, acumulando por signo. Devuelve null
 * si algún trozo no da número (no debería, con el total ya validado, pero un subintervalo
 * puede topar con una singularidad interior que el escaneo global sí toleraba en el borde)
 * o si los trozos no reconstruyen el total: ahí la partición está mal y sus dos números
 * serían plausibles y falsos a la vez.
 */
function descomponer(
  f: FuncionReal, lo: number, hi: number, cruces: readonly number[],
  total: number, impropia: boolean
): { positiva: number; negativa: number } | null {
  const cortes = [lo, ...cruces, hi];
  let positiva = 0, negativa = 0;
  for (let i = 0; i + 1 < cortes.length; i++) {
    const r = areaDefinida(f, cortes[i], cortes[i + 1]);
    if (r.tipo !== "valor") return null;
    if (r.valor >= 0) positiva += r.valor; else negativa += r.valor;
  }
  // La impropia converge por encogimiento de ε (TOL_CONV = 1e-4 en areaBajoRama), así que
  // exigirle la tolerancia de la cuadratura ordinaria la descartaría siempre.
  const tol = impropia ? 1e-3 : 1e-6;
  if (Math.abs(positiva + negativa - total) > tol * (1 + Math.abs(total))) return null;
  return { positiva, negativa };
}

/**
 * Propiedades de ∫ₐᵇ f dx, o null si no hay un número que describir (divergente, límites
 * no numéricos, hueco del dominio: casos que el bloque ya etiqueta sobre el plano).
 */
export function analizarIntegral(f: FuncionReal, a: number, b: number): AnalisisIntegral | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const area = areaDefinida(f, a, b);
  if (area.tipo !== "valor") return null;

  const invertido = a > b;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const g = (x: number): number => f.eval(x);

  // Intervalo degenerado: la integral es 0 por definición y no hay región que describir.
  // Se devuelve igualmente (el panel dirá que el intervalo es vacío) en vez de null, que
  // significa "no hay número" y aquí sí lo hay.
  if (lo === hi) {
    return {
      a, b, valor: 0, impropia: false, singularidades: [], invertido,
      signo: null, cruces: [], areaPositiva: null, areaNegativa: null, promedio: null,
    };
  }

  const singularidades = area.impropia
    ? [lo, hi].filter((x) => !Number.isFinite(g(x)))
    : [];

  const { cruces, signo } = barrerSignos(g, lo, hi);

  // Las dos áreas son GEOMÉTRICAS: se miden sobre [lo,hi] y conservan el signo del lado del
  // eje en el que están, no el de la escritura. Aplicarles la orientación las haría sumar el
  // valor también con los límites al revés, pero al precio de rotular "área positiva" un
  // número negativo, que es peor: son un hecho del dibujo, y el dibujo no se invierte.
  let areaPositiva: number | null = null;
  let areaNegativa: number | null = null;
  if (cruces !== null && cruces.length > 0) {
    const partes = descomponer(f, lo, hi, cruces, invertido ? -area.valor : area.valor, area.impropia);
    if (partes) {
      areaPositiva = partes.positiva;
      areaNegativa = partes.negativa;
    }
  }

  return {
    a, b,
    valor: area.valor,
    impropia: area.impropia,
    singularidades,
    invertido,
    signo,
    cruces,
    areaPositiva,
    areaNegativa,
    // Valor medio: ∫ₐᵇf/(b−a). Con los límites al revés se invierten numerador y
    // denominador a la vez, así que el promedio sale igual (y correcto) sin caso aparte.
    promedio: area.valor / (b - a),
  };
}
