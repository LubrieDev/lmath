// ─────────────────────────────────────────────
// trig · Modelo matemático del ángulo (PURO)
// ─────────────────────────────────────────────
//
// Todo lo que se puede decir de un ángulo, calculado UNA vez y leído por el resto del bloque:
// el punto sobre la circunferencia, dónde cae, su ángulo de referencia, cuántas vueltas lleva y
// las seis razones. Sin DOM, sin canvas, sin i18n y sin decidir nada de presentación: los sitios
// se nombran con claves (`"II"`, `"ejeY-"`), no con texto traducido, y las razones que no existen
// son `null`, no `Infinity` ni un número gigante. Quien pinta y quien rotula ya decidirán cómo se
// dice eso en cada idioma (misma separación que `analysis/analisisDerivada.ts` con su host).

export const DOS_PI = Math.PI * 2;

/**
 * Margen para decidir que un ángulo cae EXACTAMENTE sobre un eje (múltiplo de π/2).
 *
 * No es reconocimiento de valores "cercanos" —eso está prohibido para los exactos—: es la
 * tolerancia con la que se lee un flotante que YA venía de un múltiplo de π/2. `90°` llega como
 * `90*(π/180)` y `\frac{\pi}{2}` como `π/2`; ambas dan el mismo double, pero el camino aritmético
 * no garantiza el bit exacto en todas las formas de escribirlo. 1e-12 rad son 6e-11 grados: ningún
 * ángulo escrito a mano cae ahí por accidente, y `θ = 1.5707963` (siete decimales, que NO es π/2)
 * queda fuera y conserva su tangente enorme pero definida, como debe ser.
 */
const EPS_EJE = 1e-12;

/** Dónde cae el lado terminal: un cuadrante, o uno de los cuatro semiejes. */
export type PosicionAngular =
  | "I" | "II" | "III" | "IV"
  | "ejeX+" | "ejeX-" | "ejeY+" | "ejeY-";

/**
 * Las seis razones. `null` = NO DEFINIDA, que es distinto de "muy grande": tan 90° no vale
 * 1.6e16 (lo que devuelve `Math.tan` por el redondeo de π/2), no vale nada. El panel escribe
 * "no definida" y el plano no dibuja ese segmento.
 */
export interface RazonesTrig {
  readonly sin: number;
  readonly cos: number;
  readonly tan: number | null;
  readonly csc: number | null;
  readonly sec: number | null;
  readonly cot: number | null;
}

export interface ModeloTrig {
  /** El ángulo tal cual se escribió, en radianes y CON su signo (−45° sigue siendo −45°). */
  readonly radianes: number;
  readonly grados: number;
  /** El punto sobre la circunferencia unidad: (cos θ, sin θ). */
  readonly punto: { readonly x: number; readonly y: number };
  readonly posicion: PosicionAngular;
  /** ¿Cae sobre un eje? (atajo de `posicion`, que es lo que preguntan los dibujos). */
  readonly enEje: boolean;
  /** Ángulo agudo con el eje X más cercano, en radianes: [0, π/2]. */
  readonly referencia: number;
  /** Vueltas ENTERAS completadas, con signo: 750° → 2; −400° → −1; −45° → 0. */
  readonly vueltas: number;
  /** El coterminal principal en [0, 2π). */
  readonly coterminal: number;
  /** Longitud del arco recorrido sobre la circunferencia unidad: |θ|. */
  readonly arco: number;
  /** Área del sector barrido: |θ|/2. */
  readonly sector: number;
  readonly razones: RazonesTrig;
}

/** Grados ↔ radianes. La entrada del bloque ya llega en radianes (ver `bloqueTrig`). */
export const aGrados = (rad: number): number => (rad * 180) / Math.PI;
export const aRadianes = (grados: number): number => (grados * Math.PI) / 180;

/**
 * Coterminal principal en [0, 2π). Se ajusta al borde cuando el resto cae a un pelo de 0 o de
 * 2π: sin eso, un ángulo de 720° salía con un residuo de 1e-16 y dejaba de reconocerse como el
 * eje X positivo justo en el caso más redondo de todos.
 */
export function coterminalPrincipal(rad: number): number {
  const c = ((rad % DOS_PI) + DOS_PI) % DOS_PI;
  if (c < EPS_EJE || DOS_PI - c < EPS_EJE) return 0;
  return c;
}

/**
 * Dónde cae el lado terminal. Se decide sobre el ÁNGULO, nunca sobre el signo de `Math.cos`/
 * `Math.sin`: `Math.cos(Math.PI/2)` vale 6.1e-17, que es positivo, así que preguntarle al coseno
 * situaría 90° en el primer cuadrante en vez de sobre el eje Y.
 */
export function posicionDe(coterminal: number): PosicionAngular {
  const cuarto = Math.round(coterminal / (Math.PI / 2));
  if (Math.abs(coterminal - cuarto * (Math.PI / 2)) < EPS_EJE) {
    return (["ejeX+", "ejeY+", "ejeX-", "ejeY-"] as const)[cuarto % 4];
  }
  if (coterminal < Math.PI / 2) return "I";
  if (coterminal < Math.PI) return "II";
  if (coterminal < 3 * (Math.PI / 2)) return "III";
  return "IV";
}

/**
 * Ángulo de referencia: el agudo que forma el lado terminal con el eje X más cercano. Sobre los
 * ejes degenera —0 en los horizontales, π/2 en los verticales— y así se rotula: es la lectura
 * correcta, no un caso a esconder.
 */
export function referenciaDe(coterminal: number): number {
  if (coterminal <= Math.PI / 2) return coterminal;
  if (coterminal <= Math.PI) return Math.PI - coterminal;
  if (coterminal <= 3 * (Math.PI / 2)) return coterminal - Math.PI;
  return DOS_PI - coterminal;
}

/**
 * Las seis razones a partir de la POSICIÓN (no de los flotantes): sobre un eje, seno y coseno
 * valen exactamente 0 y ±1 —no 6.1e-17—, y las dos razones que dividirían por ese cero salen
 * `null`. Fuera de los ejes se calculan con `Math` y todas existen.
 */
function razonesDe(coterminal: number, posicion: PosicionAngular): RazonesTrig {
  const exacto: Partial<Record<PosicionAngular, { sin: number; cos: number }>> = {
    "ejeX+": { sin: 0, cos: 1 },
    "ejeY+": { sin: 1, cos: 0 },
    "ejeX-": { sin: 0, cos: -1 },
    "ejeY-": { sin: -1, cos: 0 },
  };
  const eje = exacto[posicion];
  const sin = eje ? eje.sin : Math.sin(coterminal);
  const cos = eje ? eje.cos : Math.cos(coterminal);
  // Solo sobre los ejes hay divisiones imposibles, y ahí se sabe cuáles por la posición: en los
  // horizontales muere lo que divide por el seno (csc, cot); en los verticales, lo que divide
  // por el coseno (tan, sec). Fuera de los ejes ninguna de las dos es cero.
  const senoNulo = posicion === "ejeX+" || posicion === "ejeX-";
  const cosenoNulo = posicion === "ejeY+" || posicion === "ejeY-";
  return {
    sin, cos,
    tan: cosenoNulo ? null : sin / cos,
    sec: cosenoNulo ? null : 1 / cos,
    csc: senoNulo ? null : 1 / sin,
    cot: senoNulo ? null : cos / sin,
  };
}

/** Todo lo anterior, resuelto de una vez para un ángulo escrito (en radianes, con su signo). */
export function modeloDeAngulo(radianes: number): ModeloTrig {
  const coterminal = coterminalPrincipal(radianes);
  const posicion = posicionDe(coterminal);
  const razones = razonesDe(coterminal, posicion);
  return {
    radianes,
    grados: aGrados(radianes),
    punto: { x: razones.cos, y: razones.sin },
    posicion,
    enEje: posicion.startsWith("eje"),
    referencia: referenciaDe(coterminal),
    // `trunc` y no `floor`: las vueltas de un ángulo negativo se cuentan hacia atrás (−400° es
    // UNA vuelta en sentido horario, no dos), y `floor` daría −2 al redondear hacia abajo.
    vueltas: Math.trunc(radianes / DOS_PI),
    coterminal,
    arco: Math.abs(radianes),
    sector: Math.abs(radianes) / 2,
    razones,
  };
}
