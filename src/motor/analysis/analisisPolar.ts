// ─────────────────────────────────────────────
// analysis · Propiedades geométricas de una curva polar r = g(θ)
// ─────────────────────────────────────────────
//
// El panel ⓘ nació para y=f(x) y sus categorías son cartesianas: intersección con Y,
// raíces en x, vértices. Sobre una polar eso no es solo poco útil, es engañoso —"corta
// el eje Y en 1,1" no dice NADA de una rosa—. Este módulo produce, en su lugar, las
// propiedades con las que de verdad se describe una curva polar.
//
// Todo se calcula sobre la MISMA r(θ) compilada que grafica el motor, así que el panel
// no puede contradecir al dibujo. La forma cerrada (periodo) viene del análisis
// simbólico de `periodoPolar`; el resto es numérico sobre un muestreo denso, refinado
// donde la precisión importa (los extremos se pulen con búsqueda ternaria y los pasos
// por el polo con bisección, para que el número que se enseña no sea el de la rejilla).
//
// Tres decisiones que conviene no revisar sin leer esto:
//
//  • ÁREA. Se publica como área BARRIDA, ½∫r²dθ sobre el intervalo que traza la curva,
//    y no como "área encerrada". No es lo mismo: cuando la curva se re-recorre, la
//    integral cuenta dos veces. La rosa r=cos(3θ) sobre [0,2π] da π/2 y el área real de
//    sus tres pétalos es π/4, exactamente el doble, porque cada pétalo se traza dos
//    veces. Llamarla "encerrada" sería un error en la familia de curvas más típica del
//    bloque, así que se dice lo que se calcula.
//
//  • SIMETRÍAS. Los tests clásicos son condiciones SUFICIENTES, no necesarias: una
//    curva puede ser simétrica y fallar el test, porque (r,θ) y (−r,θ+π) son el mismo
//    punto y la prueba depende de la parametrización elegida. Por eso este módulo
//    devuelve las simetrías que ENCUENTRA y nunca afirma que no hay ninguna; el panel
//    debe callar cuando la lista está vacía, no escribir "sin simetrías".
//
//    Y se comprueban sobre el DOMINIO TRAZADO, no sobre ℝ: la espiral r=θ cumple el test
//    de θ=π/2 gracias a puntos con θ<0 que el bloque no dibuja. Detalle en
//    `simetriaValida`, que es donde se paga.
//
//  • r NEGATIVO. El motor pinta (r·cosθ, r·sinθ) sin valor absoluto, así que un r<0
//    refleja el punto por el origen. Cuando r cambia de signo, el intervalo [rMin,rMax]
//    deja de leerse como "distancias al polo": se marca con `cambiaSigno` para que el
//    panel lo advierta en vez de dar un rango que se malinterpreta.

import { compilarFuncion } from "../../evaluador";
import { dominioPolar, periodoDeR } from "../parsing/periodoPolar";

const DOS_PI = 2 * Math.PI;

/** Muestras del barrido base. Potencia de dos y densa: de aquí salen el rango radial,
 *  los candidatos a extremo y los cruces por el polo, y su coste es una evaluación de
 *  una función ya compilada (el panel se abre una vez, no por fotograma). */
const MUESTRAS = 4096;

/** Tolerancia relativa de los tests de simetría e igualdad de amplitudes. Es holgada a
 *  propósito: compara valores de r evaluados, no coeficientes exactos. */
const TOL_REL = 1e-6;

/** Tope de ángulos listados al pasar por el polo. Más allá, la lista deja de ser
 *  información y pasa a ser ruido (mismo criterio que "demasiadas" en el ⓘ clásico). */
const MAX_ANGULOS_POLO = 12;

/** Simetrías detectables por los tests clásicos. `polo` = respecto al origen;
 *  `ejePolar` = respecto al eje x (θ=0); `vertical` = respecto a la recta θ=π/2. */
export type SimetriaPolar = "polo" | "ejePolar" | "vertical";

/** Familia clásica reconocida. Solo se emite cuando la curva ES una de ellas: una
 *  circunferencia rizada como 1+0,1·sin(8θ) no tiene nombre y devuelve `null`. */
export type PatronPolar =
  | { tipo: "circunferenciaCentrada" }
  | { tipo: "circunferenciaPorPolo" }
  | { tipo: "rosa"; petalos: number }
  | { tipo: "cardioide" }
  | { tipo: "limaconLazo" }
  | { tipo: "limaconHoyuelo" }
  | { tipo: "limaconConvexo" };

export interface AnalisisPolar {
  /** Periodo de r(θ) como función escalar (π/4 en 1+0,1·sin(8θ)); `null` si no tiene. */
  periodoR: number | null;
  /** 2π/periodoR cuando es un entero ≥2: el orden de la simetría rotacional. */
  ordenRotacional: number | null;
  simetrias: SimetriaPolar[];
  rMin: number;
  rMax: number;
  /** Un representante del ángulo donde se alcanza cada extremo (el menor θ ≥ 0). */
  thetaRMin: number;
  thetaRMax: number;
  /** ¿r toma valores de los dos signos? Ver la nota de cabecera. */
  cambiaSigno: boolean;
  /** Ángulos con r=0 (la curva pasa por el origen); `null` si hay demasiados. */
  angulosPolo: number[] | null;
  /** ½∫r²dθ sobre `intervaloArea`. `null` si r no es finita en todo el intervalo. */
  areaBarrida: number | null;
  intervaloArea: number;
  patron: PatronPolar | null;
}

/** Búsqueda ternaria del extremo de una función unimodal en [a,b]. 80 iteraciones
 *  reducen el intervalo por 1,5^80: el resultado es exacto a precisión de máquina, así
 *  que el ángulo que se muestra es el del extremo real y no el de la rejilla. */
function refinarExtremo(
  g: (t: number) => number, a: number, b: number, buscarMaximo: boolean
): { t: number; v: number } {
  let lo = a, hi = b;
  for (let i = 0; i < 80; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const v1 = g(m1), v2 = g(m2);
    // Un NaN en un sondeo no debe secuestrar la búsqueda: se descarta ese lado.
    const peor1 = !Number.isFinite(v1);
    const peor2 = !Number.isFinite(v2);
    if (peor1 && peor2) break;
    const mejor2 = peor1 || (!peor2 && (buscarMaximo ? v2 > v1 : v2 < v1));
    if (mejor2) lo = m1; else hi = m2;
  }
  const t = (lo + hi) / 2;
  return { t, v: g(t) };
}

/** Raíz de r en [a,b] con cambio de signo, por bisección. */
function refinarCero(g: (t: number) => number, a: number, b: number): number {
  let lo = a, hi = b;
  const fLo = g(lo);
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    const fm = g(m);
    if (!Number.isFinite(fm)) break;
    if (fm === 0) return m;
    if (fLo * fm < 0) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

/**
 * ¿La reflexión θ ↦ `reflejar(θ)`, con el radio multiplicado por `signo`, deja invariante
 * la curva DIBUJADA? Es la prueba clásica de simetría, con una precisión que no es un
 * detalle: se comprueba sobre el dominio que el motor traza, [0, P], y no sobre ℝ.
 *
 * La diferencia solo se nota en las curvas NO periódicas, y ahí lo cambia todo. La
 * espiral de Arquímedes r=θ cumple r(−θ) = −r(θ), así que por el test clásico "es
 * simétrica respecto a θ=π/2" — y lo es de verdad, la espiral COMPLETA sobre θ∈ℝ: el
 * espejo del punto de θ=π/4 está en θ=−π/4, con radio negativo. Pero el bloque dibuja
 * [0, 2π], donde ese espejo no existe, así que la curva que se ve NO es simétrica y
 * anunciarlo sería describir otra curva. El ángulo reflejado tiene que caer dentro de lo
 * que se pinta.
 *
 * Cuando la curva SÍ se repite con el periodo del dominio, un ángulo reflejado que se
 * sale se reduce módulo P y sigue siendo el mismo punto dibujado: ahí la reducción es
 * legítima y se aplica. Nótese que `periodica` se mide numéricamente en vez de leerse de
 * `periodoDeR`, porque una r CONSTANTE (r=2) no tiene periodo simbólico y aun así se
 * repite trivialmente — sin esto, la circunferencia perdería sus tres simetrías.
 *
 * Los θ donde algún lado no es finito se saltan (un polo no invalida una simetría), pero
 * se exige un mínimo de comprobaciones REALES para no dar por buena una simetría
 * "verificada" en los dos únicos puntos donde la función existía.
 */
function simetriaValida(
  g: (t: number) => number,
  P: number,
  periodica: boolean,
  reflejar: (t: number) => number,
  signo: 1 | -1,
  escala: number
): boolean {
  let comprobadas = 0;
  for (let i = 0; i < 64; i++) {
    const th = (i + 0.5) * (P / 64);
    let espejo = reflejar(th);
    if (periodica) espejo = ((espejo % P) + P) % P;
    else if (espejo < 0 || espejo > P) return false; // su reflejo no se dibuja

    const a = signo * g(th), b = g(espejo);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > TOL_REL * Math.max(1, escala)) return false;
    comprobadas++;
  }
  return comprobadas >= 16;
}

/**
 * Familia clásica de la curva por ANÁLISIS ARMÓNICO de r(θ). En vez de casar la
 * expresión escrita (frágil: `1+cos θ`, `cos θ+1` y `2cos²(θ/2)` son la misma
 * cardioide), se proyecta r sobre la base de Fourier y se clasifica por sus
 * coeficientes, que es lo que define la familia:
 *
 *   r = a₀                    → circunferencia centrada en el polo
 *   r = A·cos(n(θ−φ))         → rosa (n pétalos si n es impar, 2n si es par),
 *                               salvo n=1, que es una circunferencia que pasa por el polo
 *   r = a₀ + A·cos(θ−φ)       → limaçon; |a₀|=A cardioide, |a₀|<A con lazo interior,
 *                               A<|a₀|<2A con hoyuelo, |a₀|≥2A convexo
 *
 * Si queda residuo apreciable fuera de esos términos la curva no es de ninguna familia
 * y se devuelve `null` — que es la respuesta correcta para, por ejemplo, 1+0,1·sin(8θ):
 * una circunferencia rizada no tiene nombre clásico, y decir "figura de 8 lóbulos" solo
 * repetiría la simetría rotacional que el panel ya muestra.
 */
function clasificarPatron(g: (t: number) => number): PatronPolar | null {
  const N = 512;
  const KMAX = 24;
  const rs: number[] = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const v = g((i * DOS_PI) / N);
    if (!Number.isFinite(v)) return null; // con polos no hay familia clásica que valga
    rs[i] = v;
  }

  const a0 = rs.reduce((s, v) => s + v, 0) / N;
  let energia = rs.reduce((s, v) => s + (v - a0) * (v - a0), 0) / N;

  // Armónico dominante.
  let mejorK = 0, mejorAmp = 0;
  for (let k = 1; k <= KMAX; k++) {
    let A = 0, B = 0;
    for (let i = 0; i < N; i++) {
      const th = (i * DOS_PI) / N;
      A += rs[i] * Math.cos(k * th);
      B += rs[i] * Math.sin(k * th);
    }
    const amp = (2 / N) * Math.hypot(A, B);
    if (amp > mejorAmp) { mejorAmp = amp; mejorK = k; }
  }

  const escala = Math.max(Math.abs(a0), mejorAmp);
  if (escala < 1e-9) return null; // r ≡ 0: no hay curva que clasificar

  // Residuo tras quitar el término constante y el armónico dominante.
  energia -= mejorAmp * mejorAmp / 2;
  const residuo = Math.sqrt(Math.max(0, energia)) / escala;
  if (residuo > 0.01) return null; // hay más armónicos: no es una familia clásica

  const casiCero = (v: number) => Math.abs(v) < 0.01 * escala;
  if (casiCero(mejorAmp)) return { tipo: "circunferenciaCentrada" };

  if (casiCero(a0)) {
    if (mejorK === 1) return { tipo: "circunferenciaPorPolo" };
    return { tipo: "rosa", petalos: mejorK % 2 === 1 ? mejorK : 2 * mejorK };
  }

  // Con término constante Y armónico, solo el primer armónico da familia con nombre.
  if (mejorK !== 1) return null;
  const a = Math.abs(a0);
  if (Math.abs(a - mejorAmp) < 0.01 * escala) return { tipo: "cardioide" };
  if (a < mejorAmp) return { tipo: "limaconLazo" };
  if (a < 2 * mejorAmp) return { tipo: "limaconHoyuelo" };
  return { tipo: "limaconConvexo" };
}

/**
 * Analiza r=g(θ). `exprR` YA normalizada en la variable `theta` (tal como la construye
 * `construirObjeto`). Devuelve `null` si la expresión no compila o no es evaluable —el
 * llamador simplemente no monta el panel, nunca aborta el render del plano—.
 */
export function analizarPolar(exprR: string): AnalisisPolar | null {
  let g: (t: number) => number;
  try {
    const crudo = compilarFuncion(exprR, "theta");
    g = (t) => { const v = crudo(t); return typeof v === "number" ? v : NaN; };
  } catch { return null; }

  // El intervalo de trabajo es el que TRAZA el motor: así el panel describe la curva
  // que se está viendo, no una porción distinta de ella.
  const [, periodoCurva] = dominioPolar(exprR);
  const periodoR = periodoDeR(exprR);

  const paso = periodoCurva / MUESTRAS;
  const ths: number[] = new Array<number>(MUESTRAS + 1);
  const rs: number[] = new Array<number>(MUESTRAS + 1);
  let finitas = 0;
  for (let i = 0; i <= MUESTRAS; i++) {
    ths[i] = i * paso;
    rs[i] = g(ths[i]);
    if (Number.isFinite(rs[i])) finitas++;
  }
  if (finitas < 8) return null; // no hay curva evaluable: nada que contar

  // ── Rango radial y extremos ──────────────────────────────────────────────
  // Se localiza la mejor MUESTRA y se refina sobre sus vecinas: el extremo real cae
  // dentro de ese intervalo, y sin refinar el ángulo publicado sería el de la rejilla
  // (que además impediría reconocerlo como π/16 y compañía).
  let iMin = -1, iMax = -1;
  for (let i = 0; i <= MUESTRAS; i++) {
    if (!Number.isFinite(rs[i])) continue;
    if (iMin < 0 || rs[i] < rs[iMin]) iMin = i;
    if (iMax < 0 || rs[i] > rs[iMax]) iMax = i;
  }
  const vecindad = (i: number): [number, number] => [
    ths[Math.max(0, i - 1)], ths[Math.min(MUESTRAS, i + 1)],
  ];
  const [aMin, bMin] = vecindad(iMin);
  const [aMax, bMax] = vecindad(iMax);
  const extMin = refinarExtremo(g, aMin, bMin, false);
  const extMax = refinarExtremo(g, aMax, bMax, true);
  // El refinado solo se acepta si mejora: en un extremo que cae en el borde del
  // intervalo la ternaria no tiene nada que buscar y podría devolver algo peor.
  const mejoraMin = Number.isFinite(extMin.v) && extMin.v < rs[iMin];
  const rMin = mejoraMin ? extMin.v : rs[iMin];
  const thetaRMin = mejoraMin ? extMin.t : ths[iMin];
  const mejoraMax = Number.isFinite(extMax.v) && extMax.v > rs[iMax];
  const rMax = mejoraMax ? extMax.v : rs[iMax];
  const thetaRMax = mejoraMax ? extMax.t : ths[iMax];

  const escala = Math.max(Math.abs(rMin), Math.abs(rMax));

  // ── Pasos por el polo (r=0) ──────────────────────────────────────────────
  // El análogo polar de las "raíces": dice si la curva toca el origen y dónde, que es
  // lo que distingue una rosa (pasa por el polo entre pétalo y pétalo) de un anillo.
  const cerosPolo: number[] = [];
  let demasiadosCeros = false;
  for (let i = 0; i < MUESTRAS && !demasiadosCeros; i++) {
    const a = rs[i], b = rs[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a !== 0 && a * b >= 0) continue;
    const raiz = a === 0 ? ths[i] : refinarCero(g, ths[i], ths[i + 1]);
    // Dedupe: el mismo ángulo puede llegar por dos vías (muestra exacta y cambio de
    // signo contiguo) y, si r se repite, por varios periodos.
    const repetido = cerosPolo.some(
      (t) => Math.abs(t - raiz) < paso || (periodoR !== null &&
        Math.abs(((raiz - t) % periodoR + periodoR) % periodoR) < paso)
    );
    if (!repetido) cerosPolo.push(raiz);
    if (cerosPolo.length > MAX_ANGULOS_POLO) demasiadosCeros = true;
  }
  const angulosPolo: number[] | null = demasiadosCeros ? null : cerosPolo;

  // ── Simetrías (tests clásicos, cada uno con su alternativo) ──────────────
  // ¿La curva se repite con el periodo del intervalo trazado? Decide si un ángulo
  // reflejado que se sale del dominio puede reducirse (mismo punto dibujado) o si
  // sencillamente no está dibujado. Ver `simetriaValida`.
  let periodicaEnDominio = true;
  for (let i = 0; i < 16 && periodicaEnDominio; i++) {
    const th = (i + 0.5) * (periodoCurva / 16);
    const a = g(th), b = g(th + periodoCurva);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > TOL_REL * Math.max(1, escala)) periodicaEnDominio = false;
  }

  // Cada simetría tiene DOS formas de comprobarse, porque el punto reflejado admite dos
  // representaciones polares —(r,θ) y (−r,θ+π)—; basta que pase una. El polo es la
  // excepción: su única prueba útil es r(θ+π)=r(θ), ya que la otra representación
  // degenera en −r(θ)=r(θ), cierta solo donde r se anula.
  const sim = (reflejar: (t: number) => number, signo: 1 | -1): boolean =>
    simetriaValida(g, periodoCurva, periodicaEnDominio, reflejar, signo, escala);

  const simetrias: SimetriaPolar[] = [];
  if (sim((t) => t + Math.PI, 1)) simetrias.push("polo");
  if (sim((t) => -t, 1) || sim((t) => Math.PI - t, -1)) simetrias.push("ejePolar");
  if (sim((t) => Math.PI - t, 1) || sim((t) => -t, -1)) simetrias.push("vertical");

  // ── Área barrida: ½∫r²dθ por Simpson sobre el intervalo trazado ──────────
  let areaBarrida: number | null = null;
  if (finitas === MUESTRAS + 1) {
    let suma = rs[0] * rs[0] + rs[MUESTRAS] * rs[MUESTRAS];
    for (let i = 1; i < MUESTRAS; i++) suma += (i % 2 === 1 ? 4 : 2) * rs[i] * rs[i];
    const integral = (suma * paso) / 3;
    if (Number.isFinite(integral)) areaBarrida = integral / 2;
  }

  // Orden rotacional: solo si 2π/P es un entero ≥2 (es lo que se puede enunciar como
  // "la figura se repite n veces al dar la vuelta").
  let ordenRotacional: number | null = null;
  if (periodoR !== null && periodoR > 0) {
    const n = DOS_PI / periodoR;
    const redondeado = Math.round(n);
    if (redondeado >= 2 && Math.abs(n - redondeado) < 1e-6) ordenRotacional = redondeado;
  }

  return {
    periodoR,
    ordenRotacional,
    simetrias,
    rMin, rMax, thetaRMin, thetaRMax,
    cambiaSigno: rMin < 0 && rMax > 0,
    angulosPolo,
    areaBarrida,
    intervaloArea: periodoCurva,
    patron: clasificarPatron(g),
  };
}
