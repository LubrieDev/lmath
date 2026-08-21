// ─────────────────────────────────────────────
// oro · El oráculo semántico: ¿siguen siendo la misma matemática?
// ─────────────────────────────────────────────
//
// La pieza que la suite no tenía. Las ~870 aserciones de igualdad exacta del proyecto responden
// «¿ha cambiado el texto?»; ninguna responde «¿sigue siendo la misma función?». Para una suite de
// regresión la primera pregunta basta. Para una MIGRACIÓN no: cuando la forma canónica mejore,
// decenas de salidas cambiarán de escritura sin cambiar de matemática, y sin esta pieza no habría
// manera de distinguir esa mejora de una rotura.
//
// Medido en el árbol de trabajo: 64 aserciones de los módulos del CAS congelan hoy un artefacto
// tipográfico de mathjs (p. ej. `igual(despLatex("x + y = 8"), "y=- x+8")` exige el espacio de
// `- x`, y el propio mensaje de esa prueba dice `y=-x+8`). Ese es el problema que resuelve este
// archivo.
//
// ── Tres valores, no dos ─────────────────────────────────────────────────────────────────
// `mismaFuncion` (src/math/dominio.ts) devuelve `false` tanto cuando dos formas son distintas
// como cuando no ha podido decidirlo: es CONSERVADOR por diseño, y para lo que hace (adoptar o no
// una simplificación) está bien, porque su fallo posible es «no simplifico».
//
// Aquí eso no vale: confundir «distintas» con «no lo sé» convertiría cada duda en una alarma, y
// una suite que alarma sin motivo se acaba ignorando. Por eso el veredicto tiene TRES valores y
// `indecidible` es una respuesta de primera clase. Fingir una decisión donde no la hay es
// exactamente el defecto que esta reforma le quita al motor; el andamio no puede cometerlo.
//
// ── Orden de las vías, de la más fuerte a la más débil ───────────────────────────────────
//   1. IDÉNTICA      — el mismo texto. Trivial y frecuentísima.
//   2. RACIONAL      — identidad EXACTA en ℚ(x,y), reutilizando `extraer.ts` + `polinomio2.ts`.
//                      Es una DECISIÓN, no una estimación: `a·den_b − b·den_a ≡ 0` como polinomio.
//   3. DOMINIO       — dos formas con el mismo valor pueden no ser la misma función. `x²/x` y `x`
//                      son idénticas como funciones racionales y difieren en x=0. La vía 2 SOLA
//                      diría «igual», que es el error clásico; por eso nunca se usa sola.
//   4. MUESTREO      — para lo no racional (sin, log, radicales). En los PUNTOS DE QUIEBRE de
//                      ambas más una muestra anodina, comparando valor Y pertenencia al dominio.
//                      Solo puede concluir `igual` con testigos suficientes; si no, `indecidible`.
//
// ── Lo que este oráculo NO puede ver, y hay que decirlo ──────────────────────────────────
// No distingue `nthRoot(2,3)` de `1.2599210498948732`. Coinciden en cada punto donde se les
// pregunte, porque coinciden hasta el último bit de un `double`. Eso NO es un defecto del
// oráculo: es que la pérdida de exactitud no es una diferencia de FUNCIÓN, es una diferencia de
// REPRESENTACIÓN, y se mide con otra regla. Vive en `clasificar.ts` como una dimensión aparte
// (`exactitud`), declarada heurística, y no se disfraza de veredicto.

import { normalizarEntrada } from "../../src/parser";
import { insertarProductoImplicito } from "../../src/core/parsing/productoImplicito";
import { expandirDobleSigno } from "../../src/core/parsing/dobleSigno";
import { compilarExpresion } from "../../src/evaluador";
import {
  fueraDeDominio, puntosDeQuiebre, restriccionesDe, variablesLibresDe,
} from "../../src/math/dominio";
import { ecuacionAPolinomio } from "../../src/math/extraer";
import { type Polinomio2, esNulo2, normalizar2 } from "../../src/math/polinomio2";
import { type Racional, cociente, esCero, iguales, producto } from "../../src/math/racional";
import { parse } from "mathjs";
import { type Nodo } from "../../src/expr/nodo";
import { deMathjs } from "../../src/CAS/puente/mathjs";
import { normalizar } from "../../src/CAS/normal/canonica";
import { iguales as igualesE } from "../../src/CAS/nucleo/igualdad";

// ─────────────────────────────────────────────
// Contrato
// ─────────────────────────────────────────────

export type Veredicto = "igual" | "distinta" | "indecidible";

/** Por qué vía se llegó al veredicto. Se informa siempre: un `igual` por muestreo no vale lo
 *  mismo que un `igual` por identidad exacta, y quien lee el informe tiene derecho a saberlo. */
export type Via =
  | "identica"      // el mismo texto
  | "normalizada"   // el mismo texto tras normalizar la entrada
  | "canonica"      // la misma FORMA CANÓNICA del núcleo: decisión estructural, sin muestrear
  | "racional"      // identidad exacta en ℚ(x,y) + dominios compatibles
  | "dominio"       // mismo valor, DISTINTO dominio
  | "muestreo"      // valor y dominio comprobados punto a punto
  | "ramas"         // comparadas como conjuntos de ramas
  | "vacio"         // una de las dos no produjo resultado
  | "sin-lectura";  // no se pudo leer alguna de las dos

export interface Diagnostico {
  readonly veredicto: Veredicto;
  readonly via: Via;
  readonly detalle: string;
}

const di = (veredicto: Veredicto, via: Via, detalle = ""): Diagnostico => ({ veredicto, via, detalle });

/** Marcador de «sin resultado» en los volcados. */
export const VACIO = "∅";

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────

const norm = (s: string): string => insertarProductoImplicito(normalizarEntrada(s.trim()));

/** Muestra anodina: no entera, de los dos signos, cerca y lejos del origen. La misma que usa
 *  `dominio.ts`, y por el mismo motivo: está elegida para NO caer en raíces ni simetrías. */
const MUESTRA = [-7.3, -2.6, -1.2, -0.7, -0.3, 0.4, 1.1, 2.7, 5.8, 11.4];

/** Testigos evaluables mínimos para poder concluir `igual` por muestreo. Por debajo de esto la
 *  coincidencia no significa nada —dos funciones cualesquiera coinciden en dos puntos— y la
 *  respuesta honesta es `indecidible`. */
const TESTIGOS_MINIMOS = 5;

/** Tolerancia relativa al comparar dos valores. */
const TOL = 1e-8;

const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// ─────────────────────────────────────────────
// Vía 2 · Identidad exacta como funciones racionales
// ─────────────────────────────────────────────

/**
 * ¿`a` y `b` son la misma función racional? Se responde en ℚ[x,y], sin coma flotante: la ecuación
 * `(a) = (b)` se lleva a `p = 0` limpiando denominadores (que es lo que hace `extraer.ts`), y las
 * dos son la misma función racional si y solo si ese `p` es el polinomio NULO.
 *
 * `indecidible` cuando alguna de las dos no es racional (un `sin`, un radical, un logaritmo).
 * `distinta` es SÓLIDO: si `p` no es nulo, las dos difieren salvo en un conjunto finito de puntos,
 * así que no son la misma función.
 */
function identidadRacional(a: string, b: string): Veredicto {
  let eq: { p: Polinomio2 } | null;
  try { eq = ecuacionAPolinomio(`(${a}) = (${b})`); } catch { return "indecidible"; }
  if (eq === null) return "indecidible";
  return esNulo2(eq.p) ? "igual" : "distinta";
}

/**
 * ¿Tienen las dos la misma FORMA CANÓNICA del núcleo simbólico?
 *
 * `false` no significa «distintas»: la forma canónica no expande ni factoriza, así que `(x+1)²` y
 * `x²+2x+1` son la misma función y tienen formas canónicas distintas. Por eso esta vía solo
 * concluye en positivo, y cuando dice que no, el veredicto lo deciden las de abajo.
 */
function mismaFormaCanonica(a: string, b: string): boolean {
  try {
    const ea = deMathjs(parse(a) as unknown as Nodo);
    const eb = deMathjs(parse(b) as unknown as Nodo);
    if (ea === null || eb === null) return false;
    return igualesE(normalizar(ea), normalizar(eb));
  } catch { return false; }
}

/** Los coeficientes no nulos de un `Polinomio2` como lista `(i, j, coef)`, en orden fijo. */
function soporte(p: Polinomio2): Array<{ i: number; j: number; c: Racional }> {
  const out: Array<{ i: number; j: number; c: Racional }> = [];
  normalizar2(p).forEach((enX, j) => {
    enX.forEach((c, i) => { if (!esCero(c)) out.push({ i, j, c }); });
  });
  return out;
}

/**
 * ¿`p` y `q` son proporcionales (q = k·p con k ≠ 0)? Es el criterio de que DOS ECUACIONES
 * definan la misma curva: `2y − 2x = 0` y `y − x = 0` son la misma recta escrita con otro
 * múltiplo, y una migración que cambie una por la otra es cosmética, no matemática.
 *
 * Suficiente, no necesario: dos ecuaciones pueden definir la misma curva sin ser proporcionales
 * (`x² = 0` y `x = 0` tienen el mismo conjunto de ceros). Por eso el «no» de esta función es
 * `indecidible` y no `distinta`.
 */
function proporcionales(p: Polinomio2, q: Polinomio2): Veredicto {
  const P = soporte(p), Q = soporte(q);
  if (P.length === 0 && Q.length === 0) return "igual";
  if (P.length !== Q.length || P.length === 0) return "indecidible";
  const k = cociente(Q[0].c, P[0].c);
  if (esCero(k)) return "indecidible";
  for (let n = 0; n < P.length; n++) {
    if (P[n].i !== Q[n].i || P[n].j !== Q[n].j) return "indecidible";
    if (!iguales(producto(P[n].c, k), Q[n].c)) return "indecidible";
  }
  return "igual";
}

// ─────────────────────────────────────────────
// Vías 3 y 4 · Dominio y muestreo
// ─────────────────────────────────────────────

/** Los escenarios donde se comparan dos formas: la muestra anodina, más un escenario por cada
 *  punto de quiebre de cualquiera de las dos, en la variable a la que pertenece. */
function escenarios(a: string, b: string, vars: readonly string[]): Array<Record<string, number>> {
  const base = (i: number): Record<string, number> => {
    const scope: Record<string, number> = {};
    vars.forEach((v, k) => { scope[v] = MUESTRA[(i + 3 * k) % MUESTRA.length]; });
    return scope;
  };
  const out = MUESTRA.map((_, i) => base(i));
  for (const v of vars) {
    let quiebres: number[] = [];
    try { quiebres = [...puntosDeQuiebre(a, v), ...puntosDeQuiebre(b, v)]; } catch { /* sin quiebres */ }
    for (const q of quiebres) out.push({ ...base(0), [v]: q });
  }
  return out;
}

/**
 * Compara valor Y dominio punto a punto. Devuelve `distinta` en cuanto encuentra un testigo, e
 * `igual` solo si hubo bastantes escenarios realmente evaluables.
 *
 * El dominio se pregunta a las CONDICIONES, no a los números, porque en coma flotante un dominio
 * que cambia en un punto no se delata: `1/x` en x=0 vale `Infinity`, así que `(1/x)^(-1)` vale 0
 * —finito y exactamente igual al de `x`— y comparando valores la transformación pasaría por buena.
 */
function porMuestreo(a: string, b: string): Diagnostico {
  let fa: (s: Record<string, number>) => unknown;
  let fb: (s: Record<string, number>) => unknown;
  try { fa = compilarExpresion(a); fb = compilarExpresion(b); }
  catch { return di("indecidible", "sin-lectura", "no compila"); }

  // Si las condiciones de alguna de las dos no se pueden leer, `fueraDeDominio` respondería
  // «dentro» en todas partes y estaríamos comparando un dominio inventado con uno real. En ese
  // caso el dominio no se compara, y el veredicto se apoya solo en el valor (que sigue viendo
  // los NaN, así que no queda ciego: queda menos fino).
  const dominioLegible = restriccionesDe(a) !== null && restriccionesDe(b) !== null;

  const vars = [...new Set([...variablesLibresDe(a), ...variablesLibresDe(b)])];
  if (vars.length === 0) vars.push("x"); // constantes: un escenario cualquiera sirve

  let testigos = 0;
  for (const scope of escenarios(a, b, vars)) {
    if (dominioLegible) {
      const fueraA = fueraDeDominio(a, scope), fueraB = fueraDeDominio(b, scope);
      if (fueraA !== fueraB)
        return di("distinta", "dominio", `dominios distintos en ${JSON.stringify(scope)}`);
      if (fueraA) { testigos++; continue; }   // las dos fuera: coinciden, y no hay valor que mirar
    }
    const va = fa(scope), vb = fb(scope);
    if (finito(va) !== finito(vb))
      return di("distinta", "muestreo", `finitud distinta en ${JSON.stringify(scope)}`);
    // Las dos no finitas: coinciden. (Se vuelve a preguntar por cada una para que el estrechado
    // de tipo alcance a las DOS; la condición de arriba solo compara los booleanos.)
    if (!finito(va) || !finito(vb)) { testigos++; continue; }
    if (Math.abs(va - vb) > TOL * (1 + Math.abs(va)))
      return di("distinta", "muestreo", `${va} ≠ ${vb} en ${JSON.stringify(scope)}`);
    testigos++;
  }
  return testigos >= TESTIGOS_MINIMOS
    ? di("igual", "muestreo", `${testigos} testigos`)
    : di("indecidible", "muestreo", `solo ${testigos} testigos evaluables`);
}

// ─────────────────────────────────────────────
// El oráculo, para EXPRESIONES
// ─────────────────────────────────────────────

/**
 * ¿`a` y `b` son la misma función? Entrada: expresiones (sin `=`), tal como salen del CAS.
 *
 * El orden de las vías no es una optimización: cada una decide lo que la siguiente ya no podría.
 * La racional decide EXACTAMENTE pero es ciega al dominio; por eso su `igual` no se devuelve tal
 * cual, sino que pasa por la comprobación de dominio. Un `distinta` racional, en cambio, es
 * definitivo y se devuelve sin más.
 */
export function mismaExpresion(a: string, b: string): Diagnostico {
  if (a === b) return di("igual", "identica");
  if (a === VACIO || b === VACIO) return di("distinta", "vacio", "una de las dos no produjo resultado");
  if (a.startsWith("⚠") || b.startsWith("⚠")) return di("distinta", "vacio", "una de las dos lanzó");

  let na: string, nb: string;
  try { na = norm(a); nb = norm(b); } catch { return di("indecidible", "sin-lectura", "no normaliza"); }
  if (na === nb) return di("igual", "normalizada");

  // FORMA CANÓNICA del núcleo. Es la vía más fuerte después de la identidad literal: si las dos
  // expresiones tienen la misma forma canónica son la misma expresión, punto —normalizar conserva
  // valor y dominio SIN condiciones, así que la conclusión no necesita ni muestreo ni dominio
  // aparte—. Aquí es donde se paga la etapa E2: decisiones estructurales donde antes solo había
  // muestras. Un «no» por esta vía no concluye nada, porque la forma canónica no expande ni
  // factoriza: `(x+1)²` y `x²+2x+1` son la misma función con formas canónicas distintas.
  const canonica = mismaFormaCanonica(na, nb);
  if (canonica) return di("igual", "canonica", "misma forma canónica");

  const racional = identidadRacional(na, nb);
  if (racional === "distinta") return di("distinta", "racional", "difieren como funciones racionales");
  // `igual` racional NO basta: `x²/x` y `x` son la misma función racional y distinta función.
  // Se confirma (o se desmiente) con el muestreo, que es quien mira el dominio.
  const muestreo = porMuestreo(na, nb);
  if (racional === "igual" && muestreo.veredicto === "indecidible")
    return di("indecidible", "racional", "iguales en ℚ(x,y), dominio no comprobable");
  return muestreo;
}

// ─────────────────────────────────────────────
// El oráculo, para lo que de verdad hay en un volcado
// ─────────────────────────────────────────────

/** ¿Tiene la pinta de una lista JSON de ramas? */
const esLista = (s: string): boolean => s.startsWith("[") && s.endsWith("]");

/** ¿Lleva comandos LaTeX? */
const esLatex = (s: string): boolean => s.includes("\\");

/** Compara dos CONJUNTOS de valores: mismo tamaño y una correspondencia uno a uno. El orden no
 *  cuenta —dos ramas son las mismas dos ramas aunque salgan al revés—, pero la multiplicidad sí. */
function compararConjuntos(as: readonly string[], bs: readonly string[]): Diagnostico {
  if (as.length !== bs.length)
    return di("distinta", "ramas", `${as.length} ramas frente a ${bs.length}`);
  const libres = [...bs];
  for (const a of as) {
    const k = libres.findIndex((b) => compararValor(a, b).veredicto === "igual");
    if (k < 0) return di("distinta", "ramas", `sin pareja para «${a}»`);
    libres.splice(k, 1);
  }
  return di("igual", "ramas", `${as.length} ramas emparejadas`);
}

/** Compara dos ECUACIONES. Explícitas (`y = f`) por sus lados derechos; el resto, por
 *  proporcionalidad de sus polinomios, que es el criterio de «la misma curva» que sí se puede
 *  decidir en exacto. Lo que no cae en ninguno de los dos casos es `indecidible`, no un adivinado. */
function compararEcuacion(a: string, b: string): Diagnostico {
  const pa = a.split("="), pb = b.split("=");
  if (pa.length !== 2 || pb.length !== 2) return di("indecidible", "sin-lectura", "no es una ecuación simple");

  if (pa[0].trim() === "y" && pb[0].trim() === "y") return compararValor(pa[1].trim(), pb[1].trim());

  let ea, eb;
  try { ea = ecuacionAPolinomio(a); eb = ecuacionAPolinomio(b); }
  catch { return di("indecidible", "sin-lectura", "no legible como polinomio"); }
  if (ea === null || eb === null) return di("indecidible", "sin-lectura", "no polinómica");
  const v = proporcionales(ea.p, eb.p);
  return v === "igual"
    ? di("igual", "racional", "ecuaciones proporcionales")
    : di("indecidible", "racional", "no proporcionales (podrían aun así definir la misma curva)");
}

/**
 * El punto de entrada: compara dos valores de un volcado, sean lo que sean. Despacha por forma
 * —lista de ramas, LaTeX, ecuación o expresión— y aplica en cada caso el criterio más fuerte
 * disponible.
 *
 * El LaTeX se compara RELEYÉNDOLO: `normalizarEntrada` es el lector de LaTeX del propio plugin,
 * así que un LaTeX se convierte en expresión y se compara como tal. Cuando lleva coletillas que
 * no son expresión (`,\quad x \ge 0`) no hay lectura posible y la respuesta es `indecidible` —que
 * es la correcta: comparar solo el trozo legible sería afirmar sobre algo que no se ha mirado.
 */
export function compararValor(a: string, b: string): Diagnostico {
  if (a === b) return di("igual", "identica");
  if (a === VACIO || b === VACIO) return di("distinta", "vacio", "una de las dos no produjo resultado");
  if (a.startsWith("⚠") || b.startsWith("⚠")) return di("distinta", "vacio", "una de las dos lanzó");

  if (esLista(a) && esLista(b)) {
    try {
      return compararConjuntos(JSON.parse(a) as string[], JSON.parse(b) as string[]);
    } catch { return di("indecidible", "sin-lectura", "lista ilegible"); }
  }

  if (esLatex(a) || esLatex(b)) {
    // Una coletilla de dominio o de familia no es una expresión: sin lectura, no hay veredicto.
    if (/\\quad|\\text|\\ge|\\le|\\in|\\mathbb/.test(a + b))
      return di("indecidible", "sin-lectura", "LaTeX con coletillas no evaluables");
  }

  const conSigno = (s: string): boolean => /\b(pm|mp|pm2|mp2)\s*\(/.test(s);
  if ((conSigno(a) || conSigno(b)) && a.includes("=") && b.includes("=")) {
    try {
      return compararConjuntos(expandirDobleSigno(a), expandirDobleSigno(b));
    } catch { /* si no expande, se sigue por el camino normal */ }
  }

  if (a.includes("=") && b.includes("=")) return compararEcuacion(a, b);
  if (a.includes("=") !== b.includes("=")) return di("indecidible", "sin-lectura", "formas distintas");
  return mismaExpresion(a, b);
}
