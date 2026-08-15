// ─────────────────────────────────────────────
// analysis · Comportamiento de f leído en su derivada (bloque obs-derivate)
// ─────────────────────────────────────────────
//
// El bloque obs-derivate grafica f′, así que el panel ⓘ heredado describía f′ como una
// curva cualquiera: "corta el eje Y en 0", "raíces: −1, 1", "vértice mínimo en (0,−3)".
// Los NÚMEROS eran los correctos —son los que hay que dar— pero con los nombres de otra
// función: quien escribe una derivada no pregunta dónde corta f′ al eje, pregunta qué hace
// f. Y resulta que la traducción es directa:
//
//     intersección Y de f′  →  pendiente de f en x = 0
//     raíces de f′          →  puntos CRÍTICOS de f
//     vértices de f′        →  puntos de INFLEXIÓN de f
//
// Por eso este módulo se apoya en `analizarFuncion` (la misma detección de raíces y
// vértices que ya usaba el panel, con su refinado por bisección y su rechazo de polos) y
// añade lo que esa lectura no da: clasificar cada crítico por el CAMBIO DE SIGNO de f′,
// los tramos de monotonía, y los puntos donde f existe pero f′ no.
//
// Cuatro decisiones que conviene no revisar sin leer esto:
//
//  • TODO SE ENMASCARA POR EL DOMINIO DE f. f′ puede evaluarse donde f no existe: la
//    derivada de ln x es 1/x, que da −0,5 en x = −2, donde ln x no está definida. Sin la
//    máscara el panel anunciaría "decreciente en (−∞,0)" de una función que ahí no existe.
//    Se filtra por `Number.isFinite(f(x))`, no por el dominio de f′.
//
//  • NO DERIVABLE ES UN PUNTO AISLADO, NUNCA UNA REGIÓN. Si f′ no evalúa en todo un lado
//    —`x^(2/3)` tiene f′=(2/3)x^(−1/3), que en este motor es NaN para x<0— eso no es una
//    cúspide detectada: es que no hay con qué mirar ese lado. Se exige que f′ exista a
//    ambos lados para clasificar, y si no, se calla. El precio conocido es que la cúspide
//    de x^(2/3) no se reporta; la alternativa era inventarse un punto por cada muestra.
//
//  • LOS EXTREMOS ±∞ SE SONDEAN, NO SE SUPONEN. El muestreo vive en [−10,10]: escribir
//    "creciente en (1,∞)" desde ahí es una extrapolación. Solo se escribe ∞ si el signo de
//    f′ aguanta hasta 1e16 (mismo recurso que `tramoHastaInfinito` en analisis.ts).
//
//  • ANTES CALLAR QUE MAREAR. Con más críticos o más tramos de los que caben en el cuadro,
//    el grupo entero se anula (null) en vez de recortarse: media lista de puntos críticos
//    de sin(x) no es información, es una lista arbitraria.

import { analizarFuncion } from "../../analisis";

/** Mismo rango y paso que `analizarFuncion`: el panel no puede describir tramos que la
 *  detección de críticos no ha mirado. */
const RANGO = { min: -10, max: 10, pasos: 1000 };

/** Tramos de monotonía legibles de un vistazo. Cinco ya son un párrafo. */
const MAX_TRAMOS = 4;

/** Candidatos a punto anguloso que se examinan antes de rendirse. Una oscilante rápida
 *  (sin(100x)) dispara la sospecha en casi cada celda: se comprueban unos cuantos y, si
 *  siguen saliendo, se concluye que no hay forma fiable de decidirlo. */
const MAX_CANDIDATOS = 40;

/** Salto relativo de f′ entre dos muestras contiguas que despierta la sospecha de esquina.
 *  Es solo un filtro barato: quien decide es la comprobación por límites laterales. */
const SALTO_RELATIVO = 0.5;

/** Las dos distancias a las que se miden los límites laterales. Que sean DOS es lo que
 *  distingue una esquina de una pendiente empinada; ver `clasificarQuiebre`. */
const H_LEJOS = 1e-3;
const H_CERCA = 1e-5;

/** Fracción del salto lejano que debe conservar el cercano para ser una esquina. */
const PERSISTENCIA = 0.3;

/** Qué le pasa a f en un punto crítico. Los tres primeros salen del cambio de signo de f′;
 *  los tres últimos, de la forma en que f′ deja de existir. */
export type TipoCritico =
  | "maximo" | "minimo" | "estacionario"
  | "esquina" | "cuspide" | "tangenteVertical";

export interface PuntoCritico {
  readonly x: number;
  readonly tipo: TipoCritico;
}

/** Tramo maximal donde f′ conserva el signo. `a`/`b` pueden ser ±Infinity (sondeado). */
export interface TramoMonotono {
  readonly a: number;
  readonly b: number;
  readonly creciente: boolean;
}

export interface AnalisisDerivada {
  /** f′(0), o null si 0 no está en el dominio de f o f no es derivable ahí. */
  readonly pendienteEn0: number | null;
  /** Críticos ya clasificados, ordenados. Se devuelven TODOS los del rango de análisis: es
   *  el panel quien decide si son demasiados para listarlos, con la misma política que ya
   *  aplica a raíces y vértices (`estadoGrupo`: una trigonométrica tiene infinitos). */
  readonly criticos: readonly PuntoCritico[];
  /** Tramos de crecimiento/decrecimiento. `null` = demasiado fragmentado para leerlo. */
  readonly monotonia: readonly TramoMonotono[] | null;
  /** Cambios de concavidad (extremos de f′), con el mismo criterio que `criticos`. */
  readonly inflexiones: readonly number[];
  /** Puntos donde f es continua pero f′ no existe. `null` = no se puede decidir. */
  readonly noDerivables: readonly number[] | null;
  /** Un tramo de monotonía muere en el borde del muestreo sin poder extenderse a ±∞, o sea
   *  que f′ cambia de signo MÁS ALLÁ de [−10,10]: hay críticos que el panel no ha visto
   *  (x³−1000x los tiene en ±18,3). El panel lo dice en vez de dar por completa una lista
   *  que no lo está. */
  readonly acotadoPorRango: boolean;
  /** Extremos del rango analizado, para poder nombrarlo sin repetir la constante. */
  readonly rango: readonly [number, number];
}

/**
 * Qué clase de quiebre tiene f′ en `x`, o null si no hay ninguno que se pueda afirmar.
 *
 * La clave es medir el salto lateral a DOS distancias. En una esquina el salto es el mismo
 * mirando de cerca o de lejos (|x| salta 2 siempre). En una zona suave pero muy empinada
 * —f′ = −1/x² cerca del origen pasa de −2500 a −2497 entre dos muestras vecinas— el salto
 * se encoge al acercarse, porque ahí f′ es continua y solo tiene mucha pendiente. Sin esta
 * comparación, `1/x` producía dos "esquinas" a los lados de su polo.
 */
function clasificarQuiebre(
  df: (x: number) => number, x: number
): "esquina" | "cuspide" | "tangenteVertical" | null {
  const lLejos = df(x - H_LEJOS), rLejos = df(x + H_LEJOS);
  const lCerca = df(x - H_CERCA), rCerca = df(x + H_CERCA);
  // NaN a un lado no es "límite infinito": es que no hay con qué mirar ese lado (f′ de
  // x^(2/3) no evalúa en x<0). Sin valor a los dos lados, no se afirma nada.
  if ([lLejos, rLejos, lCerca, rCerca].some(Number.isNaN)) return null;

  // ¿El límite lateral DIVERGE? No basta con que |f′| sea grande: tiene que CRECER al
  // acercarse. En √|x| las pendientes van de 15,8 (h=1e−3) a 158 (h=1e−5) —divergen— y en
  // una esquina de pendiente empinada se quedan donde estaban. El "+1" evita que la
  // comparación se dispare con valores minúsculos, donde el cociente no significa nada.
  const diverge = (cerca: number, lejos: number): boolean =>
    !Number.isFinite(cerca) || Math.abs(cerca) > 3 * Math.abs(lejos) + 1;
  const divIzq = diverge(lCerca, lLejos), divDer = diverge(rCerca, rLejos);
  if (divIzq || divDer) {
    if (!divIzq || !divDer) return "cuspide";                    // un lado explota y el otro no
    return lCerca > 0 === rCerca > 0 ? "tangenteVertical" : "cuspide";
  }

  const lejos = Math.abs(lLejos - rLejos), cerca = Math.abs(lCerca - rCerca);
  const escala = 1 + Math.max(Math.abs(lCerca), Math.abs(rCerca));
  if (cerca < 1e-3 * escala) return null;          // los dos lados coinciden: es derivable
  if (cerca < PERSISTENCIA * lejos) return null;   // el salto se desvanece: pendiente, no esquina
  return "esquina";
}

/**
 * ¿f es continua en `x`? Distingue una esquina —donde f sigue siendo continua— de un polo
 * o un escalón, que no son puntos angulosos.
 *
 * Se comparan los dos LADOS entre sí y no contra f(x): en una cúspide la curva sube con
 * pendiente infinita, así que f(x±h) se aparta de f(x) mucho más que la tolerancia (√|x|
 * sube 0,0032 en h=1e−5) sin que la función deje de ser continua ni un instante. Los dos
 * lados, en cambio, siguen coincidiendo, que es lo que aquí se pregunta.
 */
function continuaEn(f: (x: number) => number, x: number): boolean {
  const izq = f(x - H_CERCA), der = f(x + H_CERCA);
  if (!Number.isFinite(izq) || !Number.isFinite(der) || !Number.isFinite(f(x))) return false;
  return Math.abs(izq - der) < 1e-3 * (1 + Math.max(Math.abs(izq), Math.abs(der)));
}

/**
 * Puntos donde f existe y es continua pero f′ no: esquinas (|x|), cúspides y tangentes
 * verticales. Es el único cómputo genuinamente nuevo del panel.
 *
 * La sospecha es barata (f′ se rompe o pega un salto entre dos muestras) y el veredicto
 * es caro pero seguro: se refina la posición por bisección y se exige que los DOS límites
 * laterales de f′ existan y discrepen, con f continua en medio. Todo lo que no pase ese
 * filtro se descarta, que es lo que hace que una oscilante rápida —donde f′ salta mucho
 * entre muestras pero es perfectamente derivable— no produzca puntos inventados.
 */
function detectarNoDerivables(
  f: (x: number) => number, df: (x: number) => number,
  xs: readonly number[], fv: readonly number[], dv: readonly number[]
): { x: number; tipo: "esquina" | "cuspide" | "tangenteVertical" }[] | null {
  const celdas: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    if (!Number.isFinite(fv[i]) || !Number.isFinite(fv[i + 1])) continue; // f no vive aquí
    const a = dv[i], b = dv[i + 1];
    const finA = Number.isFinite(a), finB = Number.isFinite(b);
    if (finA && finB) {
      const escala = 1 + Math.max(Math.abs(a), Math.abs(b));
      if (Math.abs(a - b) <= SALTO_RELATIVO * escala) continue;
    }
    if (!finA && !finB) continue;   // f′ no existe en TODO el tramo: no es un punto
    celdas.push([xs[i], xs[i + 1]]);
    if (celdas.length > MAX_CANDIDATOS) return null; // no hay forma fiable de decidirlo
  }

  const puntos: { x: number; tipo: "esquina" | "cuspide" | "tangenteVertical" }[] = [];
  for (const [x1, x2] of celdas) {
    // Bisección hacia el lado que CONSERVA la anomalía (f′ rota o con salto).
    let lo = x1, hi = x2;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2;
      const dm = df(m), dlo = df(lo);
      const rotoIzq = !Number.isFinite(dm) || !Number.isFinite(dlo) ||
        Math.abs(dm - dlo) > SALTO_RELATIVO * (1 + Math.max(Math.abs(dm), Math.abs(dlo)));
      if (rotoIzq) hi = m; else lo = m;
    }
    const x = (lo + hi) / 2;
    // Un punto "limpio" cerca (0 en vez de 1e-17) hace que los laterales se midan
    // simétricos; sin esto, |x| daba un lateral con h efectivo distinto en cada lado.
    const limpio = Math.abs(x) < 1e-9 ? 0 : Math.round(x * 1e9) / 1e9;
    if (puntos.some((p) => Math.abs(p.x - limpio) < 1e-4)) continue;
    if (!continuaEn(f, limpio)) continue;      // polo o escalón: no es un punto anguloso
    const tipo = clasificarQuiebre(df, limpio);
    if (!tipo) continue;
    puntos.push({ x: limpio, tipo });
  }
  return puntos.sort((p, q) => p.x - q.x);
}

/** Clasifica un cero de f′ por el signo de f′ a sus lados. `paso` acota cuánto se puede
 *  uno alejar sin pisar el crítico vecino. */
function tipoDeCero(
  df: (x: number) => number, x: number, paso: number
): "maximo" | "minimo" | "estacionario" {
  let izq = 0, der = 0;
  for (let h = paso; h > paso / 1000; h /= 10) {
    const a = df(x - h), b = df(x + h);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (izq === 0 && Math.abs(a) > 1e-12) izq = a > 0 ? 1 : -1;
    if (der === 0 && Math.abs(b) > 1e-12) der = b > 0 ? 1 : -1;
    if (izq !== 0 && der !== 0) break;
  }
  if (izq === 0 || der === 0 || izq === der) return "estacionario";
  return izq > 0 ? "maximo" : "minimo";
}

/**
 * ¿Nada contradice que el tramo siga hasta el infinito en el sentido `signo`? Sondea
 * magnitudes crecientes, como `tramoHastaInfinito` en analisis.ts.
 *
 * Solo VETAN dos cosas: que f se salga de los reales (NaN: ahí ya no hay función que
 * describir) y que f′ cambie de signo (x³−1000x parece decreciente en [−10,10] y da la
 * vuelta en ±18,3; el sondeo lo pilla). Un f′ que vale 0 o ±∞ en el sondeo NO veta: son
 * los límites del coma flotante, no de la función —e^x tiene f′>0 en todo ℝ y su f′
 * subdesborda a 0 antes de 1e−300—, y tomarlos por contraejemplos dejaba a la exponencial
 * "creciente en (−10, 10)", que es peor que el riesgo de extrapolar.
 */
function nadaContradiceInfinito(
  f: (x: number) => number, df: (x: number) => number, signo: 1 | -1, positivo: boolean
): boolean {
  let x = signo * 100;
  for (let i = 0; i < 15; i++) {
    const fv = f(x), dvv = df(x);
    if (Number.isNaN(fv)) return false;
    if (Number.isFinite(dvv) && dvv !== 0 && dvv > 0 !== positivo) return false;
    x *= 10;
  }
  return true;
}

/** Frontera entre dos muestras contiguas por bisección sobre un predicado monótono. */
function frontera(pred: (x: number) => boolean, xDentro: number, xFuera: number): number {
  let dentro = xDentro, fuera = xFuera;
  for (let i = 0; i < 60; i++) {
    const m = (dentro + fuera) / 2;
    if (pred(m)) dentro = m; else fuera = m;
  }
  return (dentro + fuera) / 2;
}

/**
 * Tramos maximales donde f′ conserva el signo, dentro del dominio de f. Los cortes se
 * refinan (el cambio de signo, por bisección; el borde del dominio, también) para que el
 * intervalo que se publica empiece donde de verdad empieza, no en la muestra anterior.
 */
function detectarMonotonia(
  f: (x: number) => number, df: (x: number) => number,
  xs: readonly number[], fv: readonly number[], dv: readonly number[]
): TramoMonotono[] | null {
  const tramos: TramoMonotono[] = [];
  let inicio = -1, signo = 0;      // índice de la primera muestra del tramo y su signo

  const cerrar = (i: number) => {
    if (inicio < 0 || signo === 0) return;
    tramos.push({ a: xs[inicio], b: xs[i], creciente: signo > 0 });
    inicio = -1; signo = 0;
  };

  for (let i = 0; i < xs.length; i++) {
    const vivo = Number.isFinite(fv[i]) && Number.isFinite(dv[i]);
    const s = vivo && dv[i] !== 0 ? (dv[i] > 0 ? 1 : -1) : 0;
    if (!vivo) { cerrar(i > 0 ? i - 1 : 0); continue; }
    if (s === 0) continue;                       // cero aislado: no rompe el tramo
    if (signo === 0) { inicio = i; signo = s; continue; }
    if (s !== signo) { cerrar(i - 1); inicio = i; signo = s; }
  }
  cerrar(xs.length - 1);
  if (tramos.length === 0 || tramos.length > MAX_TRAMOS) return tramos.length === 0 ? [] : null;

  // Refinado de los cortes interiores y de los bordes del dominio.
  const dentro = (x: number) => Number.isFinite(f(x)) && Number.isFinite(df(x));
  const paso = (RANGO.max - RANGO.min) / RANGO.pasos;
  const refinados = tramos.map((t) => {
    let a = t.a, b = t.b;
    const mismoSigno = (x: number) => dentro(x) && (df(x) > 0) === t.creciente;
    // Extremo izquierdo: o es el borde del muestreo, o hay algo justo antes que lo corta.
    if (a > RANGO.min + paso / 2) a = frontera(mismoSigno, a, a - paso);
    if (b < RANGO.max - paso / 2) b = frontera(mismoSigno, b, b + paso);
    return { a, b, creciente: t.creciente };
  });

  // ±∞ solo si el sondeo lo respalda; si no, el tramo se queda en el borde del muestreo.
  // Los dos extremos se leen del array en cada paso, no de una copia tomada antes: con UN
  // solo tramo (x³, creciente en todo ℝ) el primero y el último son el mismo, y guardarlos
  // aparte hacía que el segundo reemplazo pisara al primero → "creciente en (−10, ∞)".
  const ultimo = refinados.length - 1;
  if (refinados[0].a <= RANGO.min + paso / 2 &&
      nadaContradiceInfinito(f, df, -1, refinados[0].creciente))
    refinados[0] = { ...refinados[0], a: -Infinity };
  if (refinados[ultimo].b >= RANGO.max - paso / 2 &&
      nadaContradiceInfinito(f, df, 1, refinados[ultimo].creciente))
    refinados[ultimo] = { ...refinados[ultimo], b: Infinity };
  return refinados;
}

/**
 * Lo que la derivada dice de f: pendiente en el origen, puntos críticos clasificados,
 * tramos de monotonía, inflexiones y puntos no derivables. Cada grupo es `null` cuando no
 * se puede afirmar con fiabilidad, y el panel omite entonces esa sección.
 *
 * `f` y `df` son la función ESCRITA y la derivada que grafica el bloque, las dos por la
 * misma ruta de compilación que el motor: el panel describe exactamente lo dibujado.
 */
export function analizarDerivada(
  f: (x: number) => number, df: (x: number) => number
): AnalisisDerivada {
  const { min, max, pasos } = RANGO;
  const delta = (max - min) / pasos;
  const xs: number[] = new Array<number>(pasos + 1);
  const fv: number[] = new Array<number>(pasos + 1);
  const dv: number[] = new Array<number>(pasos + 1);
  for (let i = 0; i <= pasos; i++) {
    const x = min + i * delta;
    xs[i] = x; fv[i] = f(x); dv[i] = df(x);
  }

  // f′ RESTRINGIDA al dominio de f: es la que se analiza. Con la derivada a secas, ln x
  // heredaría los ceros y vértices de 1/x en x<0, donde ln x no existe.
  const dfDom = (x: number): number => (Number.isFinite(f(x)) ? df(x) : NaN);
  const analisis = analizarFuncion(dfDom);

  const quiebres = detectarNoDerivables(f, df, xs, fv, dv);

  // Críticos = ceros de f′ (clasificados por cambio de signo) + puntos no derivables
  // (clasificados por su forma). Los ceros que caen sobre un quiebre no se cuentan dos
  // veces: manda la forma (el 0 de |x| es una ESQUINA, no un mínimo suave).
  //
  // Si f′ se anula en TRAMOS enteros (f constante a trozos: |x|+x es plana en x<0) esos
  // ceros no son puntos y no se enumeran; los quiebres sí, que siguen siendo puntos.
  const ceros = analisis.intervalosRaiz.length > 0 ? [] : analisis.raices.filter(
    (x) => !(quiebres ?? []).some((p) => Math.abs(p.x - x) < 1e-4));
  const criticos: PuntoCritico[] = [
    ...ceros.map((x) => ({ x, tipo: tipoDeCero(df, x, delta) })),
    ...(quiebres ?? []).map((p) => ({ x: p.x, tipo: p.tipo })),
  ].sort((p, q) => p.x - q.x);

  // Inflexiones = extremos de f′ (cambia la monotonía de f′ ⇒ cambia la concavidad de f).
  const inflexiones = analisis.vertices.map((v) => v.x).sort((p, q) => p - q);

  const d0 = Number.isFinite(f(0)) ? df(0) : NaN;
  const monotonia = detectarMonotonia(f, df, xs, fv, dv);

  // Un tramo que muere en el borde SIN llegar a ±∞ delata que f′ cambia de signo fuera del
  // muestreo: la lista de críticos está incompleta y hay que decirlo.
  const acotadoPorRango = monotonia !== null && monotonia.length > 0 && (
    (monotonia[0].a <= min + delta / 2 && monotonia[0].a !== -Infinity) ||
    (monotonia[monotonia.length - 1].b >= max - delta / 2 &&
      monotonia[monotonia.length - 1].b !== Infinity));

  return {
    pendienteEn0: Number.isFinite(d0) ? d0 : null,
    criticos,
    monotonia,
    inflexiones,
    noDerivables: quiebres === null ? null : quiebres.map((p) => p.x),
    acotadoPorRango,
    rango: [min, max],
  };
}
