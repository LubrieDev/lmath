// ─────────────────────────────────────────────
// tracing/explicit · Régimen de ALTA FRECUENCIA para explícitas (envolvente estable)
// ─────────────────────────────────────────────
//
// EL PROBLEMA. Donde y=f(x) oscila más rápido que un píxel, NINGÚN muestreo la resuelve:
// entre dos muestras consecutivas caben varias oscilaciones enteras, así que lo que se
// dibuja es un subconjunto ARBITRARIO de una banda densa — y cuál subconjunto depende del
// número de muestras. Como la pasada interactiva y la final usan densidades distintas
// (MUESTRAS 1000–2000 vs 2000–8000), cada una elige hebras distintas y la curva CAMBIA al
// soltar el gesto. Medido en `sin(1/x)` con semiY=0.001: 122 ramas en la pasada
// interactiva contra 38 en la final, 31% de los píxeles distintos. Eso es el parpadeo.
//
// Y es, además, geometría INVENTADA: esas hebras concretas no significan nada. La imagen
// correcta de `sin(1/x)` junto a x=0 es una BANDA LLENA, porque la función toma todos los
// valores de [−1,1] infinitas veces en cualquier entorno del origen.
//
// LA SOLUCIÓN. Detectar ese régimen y, donde se dé, dejar de fingir que hay una curva
// trazable: emitir la ENVOLVENTE (mínimo y máximo de f por columna de píxel), que es lo
// único que está determinado a esa resolución. Se dibuja como una banda y es:
//   • ESTABLE — la rejilla de columnas está clavada a los PÍXELES y el número de muestras
//     por columna es FIJO, idéntico en ambas pasadas ⇒ las dos calculan exactamente lo
//     mismo ⇒ cero parpadeo. Es lo que el contrato de `ProveedorGeometria` ya exigía: la
//     geometría depende solo de (región, resolución), y aquí no se cumplía.
//   • HONESTA — se marca `calidad: "incierta"`, el valor del contrato `CalidadRama` que
//     existía desde el principio y no se emitía nunca.
//   • ACOTADA — coste fijo O(columnas), en lugar del refinado que se disparaba a 200k
//     evaluaciones intentando resolver lo irresoluble.
//
// SIMETRÍA CON LAS IMPLÍCITAS. `ProveedorImplicitoRasterizado.esAltaFrecuencia` ya hacía
// exactamente esto para F(x,y)=0: sondear la frecuencia y cambiar de estrategia cuando la
// continuación no puede. Las explícitas no tenían equivalente. Esto lo cierra.
//
// LO QUE NO TOCA. Si ninguna columna resulta irresoluble —el caso de TODAS las curvas
// normales— este módulo no altera nada: el trazador sigue su camino de siempre, byte a
// byte. El régimen es la excepción, no la regla.

import type { FuncionReal, Viewport, Rama } from "../../contracts";

// Muestras por columna del SONDEO de detección. Con 8 hay resolución para contar hasta 4
// retornos dentro de una columna, que es lo que decide el régimen.
const MUESTRAS_DETECCION = 8;
// El sondeo corre en TODA curva, también en las suaves que nunca entrarán en el régimen, así que
// su coste es un impuesto permanente: a una columna por píxel eran ~6.900 evaluaciones por
// trazado, más del doble de lo que cuesta muestrear una curva normal entera (~2.800). Se sondea
// una columna de cada `PASO_COLUMNAS` y luego se EXPANDE la marca a las vecinas. No pierde
// detección porque una zona irresoluble nunca es una columna suelta: la de `sin(1/x)` junto al
// origen abarca decenas, y las que sí serían de una o dos columnas las descartaría de todos
// modos la limpieza de islas (ISLA_MIN_COLUMNAS).
const PASO_COLUMNAS = 3;
// Muestras por columna al construir la ENVOLVENTE. Más alto que el sondeo porque aquí sí
// importa la precisión del mín/máx: con pocas muestras la banda saldría más estrecha que
// la real. Solo se paga en las columnas ya marcadas.
const MUESTRAS_ENVOLVENTE = 64;
// Puntos de retorno (cambios de dirección) dentro de UNA columna a partir de los cuales se
// considera que hay oscilación no resoluble. Una curva suave tiene como mucho 1 (su extremo
// local dentro del píxel) y un POLO exactamente 2 (sube hacia +∞, salta a −∞, vuelve a subir:
// leído como secuencia eso es subida-bajada-subida). Exigir 4 —dos ciclos por píxel— deja los
// dos fuera por construcción, sin depender de ningún umbral de magnitud.
//
// Es la PRIMERA de las dos señales; la segunda (acotación, ver RAZON_POLO) hace falta porque
// con zoom-out extremo caben VARIOS polos en una columna y entonces los retornos se acumulan:
// `tan(y)+x=5` a ±2500 metía 4 o más y volvía a colarse. Ninguna de las dos basta sola.
const RETORNOS_MIN = 4;
// Un POLO NO ES UNA OSCILACIÓN, y hay que descartarlo explícitamente. En la columna que
// contiene un polo de `tan`, la función sube hacia +∞, SALTA a −∞ y vuelve a subir: leído como
// secuencia de valores eso es subida-bajada-subida, o sea 2 retornos — exactamente la firma de
// un ciclo. Sin descartarlo, toda función con polos entraba en el régimen y sus asíntotas se
// volvían bandas (8 pruebas de la suite lo cazaron), y en la ruta TRANSPUESTA (`tan(y)+x=5`)
// esas bandas, al girar la geometría, cruzaban el lienzo entero en horizontal.
//
// Subir el umbral de retornos no vale (con zoom-out extremo caben varios polos por columna) y
// mirar la forma del cambio de signo tampoco: los dos flancos de un polo difieren en órdenes
// de magnitud según dónde caiga la muestra, así que no hay listón fiable.
//
// El discriminador correcto es la ACOTACIÓN, que es literalmente lo que separa ambos casos: una
// oscilación tiene máximo FINITO, mientras que un polo crece SIN COTA (cada muestra más fina cae
// más cerca de la singularidad y encuentra un valor mayor).
//
// Y se mide comparando el MÁXIMO con la MEDIANA de |f| en la columna, que es lo único que no
// depende de dónde aterricen las muestras. En una oscilación acotada todos los valores son del
// mismo orden (un seno muestreado da mediana ≈ 0,7 de su amplitud), así que la razón máx/mediana
// es pequeña. Junto a un polo la inmensa mayoría de las muestras son moderadas y unas pocas se
// disparan, así que la razón explota.
//
// Se descartaron dos alternativas: comparar el máximo grueso contra uno refinado (en un polo
// simple |f|~1/d refinar k× multiplica el máximo justo ~k×, así que el umbral cae en la frontera
// y decide el azar del muestreo) y exigir que el máximo siga creciendo entre dos refinamientos
// (falla con VARIOS polos por columna —`tan(y)+x=5` con zoom-out extremo—: ambos refinamientos
// caen cerca de algún polo, el máximo no crece y la columna pasaba por oscilación acotada).
const REMUESTREO_POLO = 4;       // densidad del sondeo de divergencia (× MUESTRAS_DETECCION)
const RAZON_POLO = 20;           // máx/mediana por encima de esto ⇒ hay divergencia, no oscilación
// Y la misma prueba, aplicada a la vista ENTERA, decide si la función admite banda EN ABSOLUTO.
// La envolvente representa una oscilación ACOTADA (sin(1/x) vive en [−1,1]); una función
// ilimitada no tiene banda que dibujar, tiene asíntotas. Con muchísimos polos por columna las
// pruebas locales se quedan sin resolución —el muestreo cae "al azar" dentro de cada período y
// ni el recuento de retornos ni la razón local distinguen ya nada—, pero la razón GLOBAL sigue
// siendo nítida porque la no-acotación es una propiedad de la función, no del muestreo. Es lo
// que impide que `tan(y)+x=5` con zoom-out extremo se dibuje como una banda que, al girar la
// geometría de la ruta transpuesta, cruzaría el lienzo entero en horizontal.
const RAZON_ILIMITADA = 20;
// Altura mínima que debe abarcar la oscilación DENTRO de la columna, en píxeles, para que
// merezca una banda. Sin esto, `x·sin(1/x)` —que oscila igual de rápido pero con amplitud
// subpíxel junto al origen— se dibujaría como banda cuando en pantalla es un trazo fino.
// Medido: oscila 3,69 veces por píxel y NO parpadea, justo porque su amplitud es invisible.
const ALTURA_MIN_PX = 2;
// Columnas SUELTAS resolubles que quedan entre dos tramos densos: se absorben. En una zona
// oscilante, algunas columnas caen por poco bajo el umbral y la máscara sale a rayas
// (denso/resoluble/denso/resoluble…). Cada tramo resoluble se traza con una llamada COMPLETA al
// sampler, que tiene mínimos fijos (2000 muestras, 500 del escaneo de asíntotas) sin importar lo
// estrecho que sea el tramo: con ~100 tiras el trazado se disparaba a 3,2 MILLONES de
// evaluaciones y 709 ms — peor que el problema que se venía a resolver. Absorbiendo los huecos
// cortos quedan unos pocos tramos anchos. El criterio es visual: un hueco de menos de estas
// columnas está rodeado de banda por los dos lados y dibujarlo aparte no cambia lo que se ve.
const HUECO_MIN_COLUMNAS = 8;
// Y lo simétrico: una isla densa de una o dos columnas dentro de una zona resoluble es ruido del
// umbral, no una banda. Se descarta para no partir en tres una curva perfectamente trazable.
const ISLA_MIN_COLUMNAS = 3;

/** Tramo [a,b] de x en coordenadas de mundo. */
export interface Intervalo {
  readonly a: number;
  readonly b: number;
}

export interface AnalisisFrecuencia {
  /** ¿Hay alguna columna irresoluble? Si es `false`, el trazador sigue su camino normal. */
  readonly hayRegimen: boolean;
  /** Tramos de x donde la curva SÍ se puede trazar como polilínea (a muestrear normal). */
  readonly resolubles: readonly Intervalo[];
  /** Tramos de x en régimen de alta frecuencia (a representar como envolvente). */
  readonly densos: readonly Intervalo[];
}

/**
 * Marca las columnas de píxel donde f oscila más rápido de lo que la columna puede mostrar.
 *
 * La rejilla es la de PÍXELES del viewport y el número de muestras por columna es una
 * constante: por eso el resultado es idéntico en la pasada interactiva y en la final, que
 * es justo lo que elimina el parpadeo. No se mira `tolerancia` a propósito.
 */
export function analizarFrecuencia(f: FuncionReal, vp: Viewport): AnalisisFrecuencia {
  const cols = Math.max(1, Math.floor(vp.anchoPx));
  const x0 = vp.domX[0];
  const anchoMundo = vp.domX[1] - x0;
  const dx = anchoMundo / cols;
  const altoMundo = vp.domY[1] - vp.domY[0];
  // Alto de un píxel en MUNDO: convierte la amplitud de la columna a píxeles.
  const pxAlto = altoMundo / Math.max(1, vp.altoPx);
  const alturaMinMundo = ALTURA_MIN_PX * pxAlto;

  const denso = new Uint8Array(cols);
  let alguno = false;
  // |f| de TODA la vista, para la prueba global de acotación (ver RAZON_ILIMITADA).
  const absGlobal: number[] = [];

  for (let c = 0; c < cols; c += PASO_COLUMNAS) {
    const xa = x0 + c * dx;
    // Se recogen primero todas las muestras: el listón que distingue un polo de un cruce por
    // cero (ver FRACCION_POLO) es una fracción de la AMPLITUD de la columna, que no se conoce
    // hasta haberlas visto todas.
    const vs: number[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k <= MUESTRAS_DETECCION; k++) {
      const v = f.eval(xa + (k / MUESTRAS_DETECCION) * dx);
      vs.push(v);
      if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; absGlobal.push(Math.abs(v)); }
    }
    if (lo > hi || hi - lo < alturaMinMundo) continue;   // sin amplitud dibujable

    let retornos = 0;
    let vPrev = NaN;
    let dirPrev = 0;
    for (const v of vs) {
      if (!Number.isFinite(v)) { vPrev = NaN; dirPrev = 0; continue; } // hueco de dominio
      if (Number.isFinite(vPrev)) {
        const dir = v > vPrev ? 1 : v < vPrev ? -1 : 0;
        if (dir !== 0 && dirPrev !== 0 && dir !== dirPrev) retornos++;
        if (dir !== 0) dirPrev = dir;
      }
      vPrev = v;
    }
    // Candidata por frecuencia; falta descartar que lo que hay dentro sea un POLO.
    if (retornos < RETORNOS_MIN) continue;
    if (divergeEnColumna(f, xa, dx)) continue;
    denso[c] = 1;
    alguno = true;
  }

  // Prueba GLOBAL de acotación: una función ilimitada (tan y compañía) no tiene banda que
  // dibujar por muchas columnas que se hayan marcado. Se comprueba al final, sobre las muestras
  // ya recogidas, y desactiva el régimen entero.
  const sinRegimen = { hayRegimen: false as const, resolubles: [{ a: vp.domX[0], b: vp.domX[1] }], densos: [] };
  if (!alguno) return sinRegimen;
  absGlobal.sort((a, b) => a - b);
  const medianaGlobal = absGlobal[absGlobal.length >> 1];
  const maxGlobal = absGlobal[absGlobal.length - 1];
  if (maxGlobal > RAZON_ILIMITADA * Math.max(medianaGlobal, 1e-300)) return sinRegimen;

  // El sondeo solo visitó una columna de cada PASO_COLUMNAS: se extiende su veredicto a las
  // vecinas que representa, para que la máscara vuelva a estar definida columna a columna.
  if (PASO_COLUMNAS > 1) {
    for (let c = 0; c < cols; c += PASO_COLUMNAS)
      if (denso[c] === 1)
        for (let k = c + 1; k < Math.min(cols, c + PASO_COLUMNAS); k++) denso[k] = 1;
  }

  // Limpieza de la máscara: quitar islas densas de ruido y absorber huecos cortos, para que el
  // trazado se reparta en unos pocos tramos anchos y no en decenas de tiras (ver las constantes).
  limpiarRachas(denso, 1, ISLA_MIN_COLUMNAS);   // islas densas cortas → resolubles
  limpiarRachas(denso, 0, HUECO_MIN_COLUMNAS);  // huecos resolubles cortos → densos
  if (!denso.some((v) => v === 1)) return sinRegimen;

  return {
    hayRegimen: true,
    densos: tramosDe(denso, 1, x0, dx),
    resolubles: tramosDe(denso, 0, x0, dx),
  };
}

/**
 * ¿La columna [xa, xa+dx] contiene una DIVERGENCIA (polo) en vez de una oscilación acotada?
 *
 * Razón entre el máximo y la MEDIANA de |f| sobre un sondeo denso de la columna: pequeña en una
 * oscilación acotada (todos los valores del mismo orden), enorme junto a una divergencia (unas
 * pocas muestras disparadas sobre un fondo moderado). Un valor no finito es un polo exacto.
 */
function divergeEnColumna(f: FuncionReal, xa: number, dx: number): boolean {
  const N = MUESTRAS_DETECCION * REMUESTREO_POLO;
  const abs: number[] = [];
  for (let k = 0; k <= N; k++) {
    const v = f.eval(xa + (k / N) * dx);
    if (!Number.isFinite(v)) return true;        // polo exacto sobre la muestra
    abs.push(Math.abs(v));
  }
  if (abs.length === 0) return false;
  abs.sort((a, b) => a - b);
  const mediana = abs[abs.length >> 1];
  const maximo = abs[abs.length - 1];
  return maximo > RAZON_POLO * Math.max(mediana, 1e-300);
}

/**
 * Voltea a `1-valor` las rachas de `valor` más cortas que `minimo` columnas. Las rachas de los
 * BORDES se respetan: no están rodeadas por el otro valor, así que no son ruido entre dos zonas
 * sino el principio o el final legítimo de la vista.
 */
function limpiarRachas(mascara: Uint8Array, valor: number, minimo: number): void {
  let ini = -1;
  for (let c = 0; c <= mascara.length; c++) {
    const dentro = c < mascara.length && mascara[c] === valor;
    if (dentro && ini < 0) ini = c;
    else if (!dentro && ini >= 0) {
      const bordeIzq = ini === 0;
      const bordeDer = c === mascara.length;
      if (!bordeIzq && !bordeDer && c - ini < minimo)
        for (let k = ini; k < c; k++) mascara[k] = valor === 1 ? 0 : 1;
      ini = -1;
    }
  }
}

/** Agrupa columnas consecutivas con el mismo valor en tramos de mundo. */
function tramosDe(mascara: Uint8Array, valor: number, x0: number, dx: number): Intervalo[] {
  const out: Intervalo[] = [];
  let ini = -1;
  for (let c = 0; c <= mascara.length; c++) {
    const dentro = c < mascara.length && mascara[c] === valor;
    if (dentro && ini < 0) ini = c;
    else if (!dentro && ini >= 0) {
      out.push({ a: x0 + ini * dx, b: x0 + c * dx });
      ini = -1;
    }
  }
  return out;
}

/**
 * Construye la envolvente de un tramo denso: una polilínea en ZIGZAG que recorre, columna a
 * columna, del mínimo al máximo y del máximo al mínimo. Al estar las columnas a un píxel de
 * distancia, el trazo resultante se lee como una BANDA LLENA — que es la imagen correcta de
 * una oscilación no resoluble— y es UNA sola rama, no cientos de segmentos verticales
 * sueltos (el renderer hace un `stroke` por rama: cientos serían un cuello de botella).
 *
 * Los valores se recortan a la banda [yBot, yTop] (el mismo margen de una vista más allá del
 * borde que usa el resto del trazador) para no meter coordenadas astronómicas en el Canvas.
 */
export function envolvente(
  f: FuncionReal, vp: Viewport, tramo: Intervalo, objetoId: string, yBot: number, yTop: number
): Rama | null {
  const anchoMundo = vp.domX[1] - vp.domX[0];
  const dxCol = anchoMundo / Math.max(1, Math.floor(vp.anchoPx));
  const cols = Math.max(1, Math.round((tramo.b - tramo.a) / dxCol));

  const puntos: number[] = [];
  let arriba = false; // alterna el sentido del zigzag para no volver en vacío
  for (let c = 0; c < cols; c++) {
    const xa = tramo.a + c * dxCol;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k <= MUESTRAS_ENVOLVENTE; k++) {
      const v = f.eval(xa + (k / MUESTRAS_ENVOLVENTE) * dxCol);
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo > hi) continue; // columna entera fuera del dominio → hueco
    const loC = Math.max(yBot, Math.min(yTop, lo));
    const hiC = Math.max(yBot, Math.min(yTop, hi));
    const xm = xa + dxCol / 2;
    if (arriba) puntos.push(xm, hiC, xm, loC);
    else puntos.push(xm, loC, xm, hiC);
    arriba = !arriba;
  }
  if (puntos.length < 4) return null;

  // Sin `parametro`: una banda NO es una función de x recorrible (el crosshair y el carril
  // no tendrían una y única que leer), y omitirlo es exactamente cómo se declara eso.
  return {
    puntos: Float64Array.from(puntos),
    cerrada: false,
    calidad: "incierta",
    objetoId,
  };
}
