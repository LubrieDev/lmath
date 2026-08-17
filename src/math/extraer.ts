// ─────────────────────────────────────────────
// mate · De la ecuación ESCRITA al polinomio exacto (PURO)
// ─────────────────────────────────────────────
//
// La frontera entre lo que el usuario teclea y el motor matemático. Recorre el árbol que produce
// mathjs y devuelve un polinomio con coeficientes racionales EXACTOS, o `null` si la expresión no
// es polinómica.
//
// ── `null` es una respuesta, no un fallo ──────────────────────────────────────────────────
// Este módulo no intenta ser listo. Ante un `sin x`, un `log`, un exponente fraccionario o un
// símbolo que no sea x ni y, devuelve `null` y se acabó: ese sistema se resuelve por el camino
// numérico (`numerico.ts`), que da menos garantías pero las da honestamente. Forzar aquí una
// aproximación —convertir `sin x` en su polinomio de Taylor, redondear un exponente— metería en
// la vía exacta un error que luego nadie podría distinguir de un resultado bueno, y toda la
// utilidad de la vía exacta es precisamente que se puede confiar en ella sin comprobarla.
//
// ── Por qué se trabaja con FRACCIONES de polinomios ───────────────────────────────────────
// `y = 1/x` es una hipérbola de manual y no es un polinomio, pero SÍ es una fracción de
// polinomios; y `y = 1/x` contra `y = x` tiene dos soluciones exactas (±1) que sería absurdo
// dejar escapar. Así que cada expresión se lleva como el par (numerador, denominador) y la
// ecuación final se limpia de denominadores multiplicando en cruz.
//
// Eso introduce un peligro conocido y hay que decirlo aquí porque el remedio vive en otro
// módulo: multiplicar en cruz puede INVENTAR soluciones donde el denominador se anula (`1/x = 1/x`
// se convertiría en `x = x`, cierto en el origen, donde ninguna de las dos curvas existe). Por
// eso `resolverSistema` verifica cada solución contra los denominadores antes de darla por buena.

import { parse } from "mathjs";
import { type Nodo } from "../formatoExpr";
import { normalizarEntrada } from "../parser";
import { insertarProductoImplicito } from "../core/parsing/productoImplicito";
import { desdeDecimal, desdeNumero, type Racional } from "./racional";
import {
  type Polinomio2, X2, Y2, constante2, esNulo2, gradoX, gradoY, negado2, potencia2,
  producto2, resta2, suma2,
} from "./polinomio2";
import { UNO } from "./racional";
import { constanteExacta } from "./simbolico/constanteExacta";

/** Una expresión como cociente de dos polinomios. `den` nunca es el polinomio nulo. */
interface Fraccion {
  readonly num: Polinomio2;
  readonly den: Polinomio2;
}

const entera = (p: Polinomio2): Fraccion => ({ num: p, den: constante2(UNO) });

/** Grado total máximo que se acepta. Un sistema de grado 12 produce resultantes cuyos
 *  coeficientes tienen miles de dígitos: el cálculo sigue siendo exacto, pero deja de ser
 *  instantáneo, y un panel que tarda tres segundos en abrirse es un panel roto. Por encima de
 *  este grado se cae al camino numérico, que no se inmuta. */
const GRADO_MAXIMO = 8;

/** El nodo sin sus paréntesis envolventes (`y^{3}` normaliza a `y^(3)`, cuyo exponente es un
 *  ParenthesisNode y no un ConstantNode). Mismo desenvuelto que usa el despejador. */
function desParen(n: Nodo): Nodo {
  return n.type === "ParenthesisNode" ? desParen(n.content) : n;
}

/**
 * El racional exacto de un nodo constante.
 *
 * Se lee el TEXTO del número y no su valor en coma flotante: quien escribe `0.1` quiere el
 * décimo que ha escrito, no la fracción binaria que un `double` guarda con ese nombre. Es una
 * distinción que solo se nota en la última cifra, pero este módulo existe justamente para que
 * la última cifra sea de fiar.
 */
function constanteDe(n: Nodo): Racional | null {
  if (n.type !== "ConstantNode") return null;
  const v = n.value;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return desdeDecimal(String(v)) ?? desdeNumero(v);
}

/** Exponente entero no negativo de un nodo, o `null`. */
function exponenteEntero(n: Nodo): number | null {
  const e = desParen(n);
  if (e.type === "ConstantNode" && Number.isInteger(e.value)) return e.value;
  // `x^(-2)` llega como menos unario sobre la constante, no como una constante negativa.
  if (e.type === "OperatorNode" && e.op === "-" && e.args.length === 1) {
    const dentro = desParen(e.args[0]);
    if (dentro.type === "ConstantNode" && Number.isInteger(dentro.value)) return -dentro.value;
  }
  return null;
}

/**
 * Recorre el árbol y construye la fracción de polinomios, o `null` en cuanto aparece algo que no
 * lo es. Las variables son `x` e `y`; cualquier otro símbolo (incluidos `pi` y `e`) devuelve
 * `null`: son irracionales y no caben en ℚ, así que su sistema es del camino numérico.
 */
function fraccionDe(n: Nodo): Fraccion | null {
  const nodo = desParen(n);

  /**
   * Último intento antes de rendirse: un subárbol SIN VARIABLES que resulta ser un racional
   * exacto es un coeficiente como cualquier otro, esté escrito como esté (`nthRoot(64, 3)` es 4).
   * Rechazarlo por llevar un radical delante sacaba del carril exacto a sistemas que sí son
   * polinómicos.
   *
   * Se llama SOLO donde el recorrido normal iba a devolver `null`, y no en cada nodo: como
   * recorre el subárbol entero, hacerlo en todos convertiría el lector en cuadrático sin
   * reconocer ni una expresión más.
   */
  const comoConstante = (): Fraccion | null => {
    const k = constanteExacta(nodo);
    return k === null ? null : entera(constante2(k));
  };

  switch (nodo.type) {
    case "ConstantNode": {
      const k = constanteDe(nodo);
      return k === null ? null : entera(constante2(k));
    }
    case "SymbolNode":
      if (nodo.name === "x") return entera(X2);
      if (nodo.name === "y") return entera(Y2);
      return null;
    case "OperatorNode": {
      // Menos unario.
      if (nodo.op === "-" && nodo.args.length === 1) {
        const a = fraccionDe(nodo.args[0]);
        return a === null ? null : { num: negado2(a.num), den: a.den };
      }
      if (nodo.args.length !== 2) return null;
      const a = fraccionDe(nodo.args[0]);
      if (a === null) return null;
      if (nodo.op === "^") {
        // La base puede ser cualquier cosa, pero el exponente tiene que ser un entero: `x^y` y
        // `x^(1/2)` no son polinomios y aquí no se aproximan.
        const k = exponenteEntero(nodo.args[1]);
        if (k === null) return comoConstante();   // `8^(2/3)` es 4: constante, aunque no entera
        if (k >= 0) return { num: potencia2(a.num, k), den: potencia2(a.den, k) };
        if (esNulo2(a.num)) return null;                    // 0 elevado a negativo
        return { num: potencia2(a.den, -k), den: potencia2(a.num, -k) };
      }
      const b = fraccionDe(nodo.args[1]);
      if (b === null) return null;
      switch (nodo.op) {
        case "+":
          return { num: suma2(producto2(a.num, b.den), producto2(b.num, a.den)),
                   den: producto2(a.den, b.den) };
        case "-":
          return { num: resta2(producto2(a.num, b.den), producto2(b.num, a.den)),
                   den: producto2(a.den, b.den) };
        case "*":
          return { num: producto2(a.num, b.num), den: producto2(a.den, b.den) };
        case "/":
          if (esNulo2(b.num)) return null;                  // división por cero literal
          return { num: producto2(a.num, b.den), den: producto2(a.den, b.num) };
        default:
          return null;
      }
    }
    default:
      // FunctionNode (sin, log, sqrt, abs…) y todo lo demás: no es polinómico… salvo que sea
      // una CONSTANTE disfrazada (`sqrt(16)`, `nthRoot(64,3)`, `abs(-3)`).
      return comoConstante();
  }
}

/** Una ecuación ya convertida a «esto vale cero», más el denominador que se limpió al hacerlo. */
export interface EcuacionPolinomica {
  /** p(x,y) = 0 es la ecuación. */
  readonly p: Polinomio2;
  /**
   * El denominador que se multiplicó para llegar a `p`. Sus ceros son los puntos donde la
   * ecuación original NO está definida, así que una solución que lo anule es una solución
   * inventada por la limpieza y hay que descartarla. Es `1` en el caso normal.
   */
  readonly denominador: Polinomio2;
}

/**
 * La ecuación escrita, como polinomio igualado a cero, o `null` si no es polinómica.
 *
 * Acepta las dos formas que produce el plugin: con `=` (los dos lados, y se resta el derecho del
 * izquierdo) y sin él (una expresión suelta, que en obs-graph significa `y = expr`).
 *
 * La entrada pasa por el MISMO preprocesado que el resto de LMath (`normalizarEntrada` +
 * `insertarProductoImplicito`), y no por un lector propio: así `2x`, `\frac{1}{2}` y `x^{2}`
 * significan aquí exactamente lo que significan en el plano de al lado. Un motor que leyera la
 * entrada a su manera acabaría resolviendo una ecuación distinta de la dibujada, que es el peor
 * fallo posible en un plugin cuyo trabajo es que las dos cosas coincidan.
 */
export function ecuacionAPolinomio(ecuacion: string): EcuacionPolinomica | null {
  const partes = ecuacion.split("=");
  if (partes.length > 2) return null;

  const preparar = (s: string): Nodo | null => {
    const limpio = s.trim();
    if (limpio === "") return null;
    try {
      return parse(insertarProductoImplicito(normalizarEntrada(limpio))) as unknown as Nodo;
    } catch {
      return null;
    }
  };

  let izquierda: Fraccion | null;
  let derecha: Fraccion | null;
  if (partes.length === 2) {
    const a = preparar(partes[0]), b = preparar(partes[1]);
    if (!a || !b) return null;
    izquierda = fraccionDe(a);
    derecha = fraccionDe(b);
  } else {
    // Expresión suelta: en obs-graph significa `y = expr`.
    const a = preparar(partes[0]);
    if (!a) return null;
    izquierda = entera(Y2);
    derecha = fraccionDe(a);
  }
  if (!izquierda || !derecha) return null;

  // izq/denIzq = der/denDer  ⇔  izq·denDer − der·denIzq = 0
  const p = resta2(producto2(izquierda.num, derecha.den), producto2(derecha.num, izquierda.den));
  const denominador = producto2(izquierda.den, derecha.den);
  if (esNulo2(p)) {
    // 0 = 0: la ecuación no dice nada (`y = y`). No es un sistema resoluble.
    return null;
  }
  if (Math.max(gradoX(p), gradoY(p)) > GRADO_MAXIMO) return null;
  return { p, denominador };
}
