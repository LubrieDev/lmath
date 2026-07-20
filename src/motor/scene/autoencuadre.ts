// ─────────────────────────────────────────────
// scene · Autoencuadre (la vista inicial se ajusta a la curva, solo ACERCANDO)
// ─────────────────────────────────────────────
//
// La vista por defecto ([-7,7] en Y) es un compromiso: a una curva ACOTADA y pequeña
// —el corazón, la lemniscata, la astroide, un círculo de radio 1— le sobra plano por
// todas partes y se ve como un garabato en el centro. Este módulo mira la geometría YA
// TRAZADA con la vista por defecto y decide si merece la pena acercar.
//
// TRES decisiones de diseño, y las tres son la razón de que esto sea seguro:
//
//  1. `semiYAutoencuadre` SOLO ACERCA, NUNCA ALEJA. Si la curva TOCA cualquier borde de la
//     vista, no se toca nada: fuera del cuadro puede continuar indefinidamente (una recta, una
//     parábola, tan x) y "encuadrarla" sería perseguir un infinito. El disparo exige contención
//     ESTRICTA, con un colchón de unos píxeles. Su COMPLEMENTO `semiYAcotado` sí puede ALEJAR,
//     pero solo tras confirmar —con un SONDEO en una vista grande— que la curva es ACOTADA
//     (contenida en el sondeo): así se encuadra la astroide de radio 8 (que se sale de [-7,7])
//     sin arriesgarse a perseguir el infinito de una ilimitada.
//  2. CENTRO EN EL ORIGEN. Solo se escala; no se traslada. Los ejes siguen siempre en
//     cuadro, que es lo que uno espera de un plano cartesiano (una circunferencia lejos
//     del origen no deja la gráfica sin ejes de referencia).
//  3. SEMIRRANGO CUANTIZADO a mantisa {1, 2, 2.5, 5}×10ᵏ, redondeando HACIA ARRIBA.
//     Con el centro en el origen, un semirrango redondo deja ticks simétricos y limpios
//     (±1, ±2, ±5); el redondeo hacia arriba solo añade aire, nunca recorta la curva.
//
// Es una función PURA de (ramas, viewport): quien la llama (Escena/host) decide CUÁNDO
// —una sola vez, en el primer render— y qué hacer con el número.

import type { Rama, Viewport } from "../contracts";

/** Dispara solo si el encuadre que pide la curva es < esta fracción del actual. */
export const FRACCION_DISPARO = 0.6;

/**
 * Fracción del semirrango de la vista que puede llegar a ocupar la curva. NO es un "margen"
 * (curva + un poco de aire): un margen porcentual pequeño encuadra la curva PEGADA a los bordes
 * —la lemniscata salía tocando los dos lados del plano, sin sitio para leerla— porque el aire que
 * hace falta no es proporcional a la curva, es el que necesita el OJO para verla como un objeto
 * dentro de un plano. Con 0.6 la curva usa el 60% del cuadro y el 40% restante es respiración,
 * que es el aire que dejan GeoGebra/Desmos al encuadrar.
 */
export const OCUPACION_MAXIMA = 0.6;

/** Colchón de contención, en px: una rama a menos de esto del borde cuenta como que lo TOCA. */
const COLCHON_PX = 2;

/** Tamaño en mundo por debajo del cual la "curva" es un punto degenerado: no se encuadra. */
const TAMANO_MINIMO = 1e-9;

/**
 * Mantisas admitidas del semirrango cuantizado (ver cabecera). Todas dan ticks limpios con el
 * centro en el origen (subdivisiones de 0.5 o de 1 en su década). La tabla es FINA a propósito:
 * con solo {1, 2, 2.5, 5}, saltar de 1 a 2 DUPLICA la vista, y el redondeo hacia arriba tira por
 * la borda hasta la mitad del encuadre calculado (la lemniscata pedía 1.29 y aterrizaba en 2).
 */
const MANTISAS = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];

/**
 * Redondea `v` HACIA ARRIBA al siguiente valor de mantisa {1, 2, 2.5, 5}×10ᵏ. Nunca
 * devuelve menos que `v` → el aire solo puede sobrar, la curva nunca se recorta.
 */
export function cuantizarSemirrango(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return v;
  const k = Math.floor(Math.log10(v));
  const base = 10 ** k;
  const m = v / base;
  // El error de log10/potencia puede dejar m fuera de [1,10) por un ULP: la última
  // mantisa (10) lo absorbe sin salirse de la tabla.
  for (const cand of MANTISAS) if (m <= cand * (1 + 1e-12)) return cand * base;
  return 10 * base;
}

/** Caja envolvente (mundo) de todos los puntos FINITOS de las ramas, o null si no hay ninguno. */
interface Caja { x0: number; x1: number; y0: number; y1: number; }
function bboxDeRamas(ramas: readonly Rama[]): Caja | null {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of ramas) {
    const p = r.puntos;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], y = p[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return Number.isFinite(x0) && Number.isFinite(y0) ? { x0, x1, y0, y1 } : null;
}

/** ¿La caja TOCA (o casi) algún borde del viewport? El colchón (COLCHON_PX) se mide en px
 *  y se traduce a mundo por eje. Una curva que toca el borde se asume que continúa fuera. */
function tocaBorde(c: Caja, vp: Viewport): boolean {
  const holguraX = ((vp.domX[1] - vp.domX[0]) / vp.anchoPx) * COLCHON_PX;
  const holguraY = ((vp.domY[1] - vp.domY[0]) / vp.altoPx) * COLCHON_PX;
  return c.x0 <= vp.domX[0] + holguraX || c.x1 >= vp.domX[1] - holguraX ||
         c.y0 <= vp.domY[0] + holguraY || c.y1 >= vp.domY[1] - holguraY;
}

/** Semirrango Y (centro en el origen, celdas 1:1) al que la caja ocupa la fracción `ocup` del
 *  cuadro. Cubre la extensión vertical Y TAMBIÉN la horizontal (semiX = semiY·ancho/alto), así
 *  que una curva ANCHA y plana (la lemniscata) la gobierna la X. */
function semiParaCaja(c: Caja, vp: Viewport, ocup: number): number {
  const maxAbsY = Math.max(Math.abs(c.y0), Math.abs(c.y1));
  const maxAbsX = Math.max(Math.abs(c.x0), Math.abs(c.x1));
  return Math.max(maxAbsY, (maxAbsX * vp.altoPx) / vp.anchoPx) / ocup;
}

/**
 * Semirrango vertical al que debería ir la vista para encuadrar estas ramas, o `null`
 * si no procede (curva que toca un borde, curva que ya llena la vista, sin geometría,
 * curva degenerada a un punto). El llamador debe pasar las ramas YA PODADAS de vértices
 * sintéticos de polo (`podarVerticesDePolo`): esos vértices viven fuera de la vista a
 * propósito y harían fallar la contención de cualquier función con asíntota.
 */
export function semiYAutoencuadre(ramas: readonly Rama[], vp: Viewport): number | null {
  const c = bboxDeRamas(ramas);
  if (c === null) return null; // sin geometría
  if (c.x1 - c.x0 < TAMANO_MINIMO && c.y1 - c.y0 < TAMANO_MINIMO) return null; // punto degenerado
  // Contención ESTRICTA: si la curva llega al borde (o casi), asumimos que continúa fuera.
  if (tocaBorde(c, vp)) return null;

  const semiNecesario = semiParaCaja(c, vp, OCUPACION_MAXIMA);
  if (!Number.isFinite(semiNecesario) || semiNecesario <= 0) return null;

  const semiActual = (vp.domY[1] - vp.domY[0]) / 2;
  if (semiNecesario >= semiActual * FRACCION_DISPARO) return null; // no sobra tanto espacio

  const semi = cuantizarSemirrango(semiNecesario);
  // La cuantización hacia arriba puede devolvernos al encuadre actual (o pasarse): en ese
  // caso no hay nada que ganar y se deja la vista por defecto.
  return semi < semiActual ? semi : null;
}

/** Ocupación de la curva ACOTADA que se ALEJA para encuadrar. Más llena que el zoom-in (0.6):
 *  al alejar para que la curva quepa entera se quiere que OCUPE la vista, no que quede pequeña. */
export const OCUPACION_ACOTADA = 0.8;

/** Factor del SONDEO: la vista grande (× la por defecto) en la que se traza para averiguar si
 *  una curva que se sale es ACOTADA (contenida en el sondeo) o ilimitada (toca su borde). */
export const FACTOR_SONDEO = 8;

/**
 * Semirrango Y para encuadrar una curva ACOTADA que SE SALE de la vista por defecto y queda
 * recortada (la astroide `x^{2/3}+y^{2/3}=4`, de radio 8, con la vista [-7,7]). Complementa a
 * `semiYAutoencuadre` —que SOLO acerca curvas pequeñas—: aquí se puede ALEJAR. Las ramas vienen
 * de un SONDEO en una vista GRANDE (`vpSondeo` = FACTOR_SONDEO × la por defecto): si ahí la
 * curva está CONTENIDA es acotada y se encuadra a su extensión; si toca el borde del sondeo es
 * ilimitada (recta, parábola) y se deja la vista por defecto (null). Solo dispara si la curva
 * EXCEDE la vista por defecto (`semiYDefecto`); si cabe, la gobiernan el zoom-in o la vista base.
 */
export function semiYAcotado(
  ramas: readonly Rama[], vpSondeo: Viewport, semiYDefecto: number
): number | null {
  const c = bboxDeRamas(ramas);
  if (c === null) return null;
  if (c.x1 - c.x0 < TAMANO_MINIMO && c.y1 - c.y0 < TAMANO_MINIMO) return null;
  if (tocaBorde(c, vpSondeo)) return null; // toca el borde del SONDEO → ilimitada, no encuadrar

  // Solo reencuadrar si la curva SE SALE de la vista por defecto (si cabe, no tocar nada: lo
  // pequeño ya lo gobiernan `semiYAutoencuadre` o la propia vista base).
  const maxAbsY = Math.max(Math.abs(c.y0), Math.abs(c.y1));
  const maxAbsX = Math.max(Math.abs(c.x0), Math.abs(c.x1));
  const semiXDefecto = (semiYDefecto * vpSondeo.anchoPx) / vpSondeo.altoPx;
  if (maxAbsY <= semiYDefecto && maxAbsX <= semiXDefecto) return null;

  const semiNecesario = semiParaCaja(c, vpSondeo, OCUPACION_ACOTADA);
  if (!Number.isFinite(semiNecesario) || semiNecesario <= 0) return null;
  const semi = cuantizarSemirrango(semiNecesario);
  return semi > semiYDefecto ? semi : null; // debe ALEJAR (si no, nada que ganar)
}
