import { parse, simplify, type MathNode } from "mathjs";

import { normalizarEntrada } from "./parser";
import { insertarProductoImplicito } from "./core/parsing/productoImplicito";
import { componenteParametrica } from "./core/parsing/componentesParametricas";
import { transformarSinRestriccion } from "./core/parsing/restriccionDominio";
import { bloqueALatex } from "./latex";
import {
  formatearCanonico, racionalizarFracciones, combinarYordenar, combinarFracciones,
  profundidadFraccion, rationalizeSeguro, resimbolizarConstantes, sinParentesisRedundantes, type Nodo,
} from "./formatoExpr";
import { mismaFuncion } from "./math/dominio";

// ─────────────────────────────────────────────
// Simplificar y expandir
// ─────────────────────────────────────────────
//
// Reduce y DESARROLLA una expresión preservando la equivalencia, reutilizando mathjs:
//   • `rationalize` lleva un polinomio (o fracción de polinomios) a FORMA CANÓNICA:
//     expande potencias enteras y productos, reduce términos semejantes, evalúa
//     constantes, quita ×1/+0/^1 y dobles negativos, y combina fracciones.
//   • Para lo NO polinómico (sin, tan, log…) rationalize no aplica → `simplify` (reduce
//     lo que pueda; sin x + cos x se deja intacto). Así no se modifica lo irreducible.
//   • NO se hace `simplify(rationalize(...))`: simplify re-factoriza lo expandido.
//
// El resultado se reformatea con `formatearCanonico` (variables antes que constantes en
// lo polinómico: `-2x + 6`; "positivos primero" si hay funciones: `2 - tan(x)`) para (a)
// dar la MISMA forma que Despejar —así Simplificar tras Despejar es un no-op— y (b) ser
// IDEMPOTENTE en formato → detectar de forma fiable cuándo la transformación no cambia nada.
//
// Produce ecuaciones como STRING mathjs (encadenable); el LaTeX deriva por `bloqueALatex`.

// Reglas EXTRA sobre las de fábrica de `simplify`. Solo identidades válidas en TODO ℝ
// (no alteran el dominio de lo graficado, que es la expresión original):
//   • log(e^u) = u — cierto para todo u real (e^u > 0 siempre). mathjs no la trae y
//     dejaba `\ln(e^{3x})` sin reducir; con ella → `3x`.
// NO se añade la inversa e^(log u) = u: solo vale para u > 0 (cambiaría el dominio
// aparente respecto de la curva dibujada). Mismo criterio por el que (x²−1)/(x−1)
// NO se cancela a x+1 (difieren en x=1).
const REGLAS_SIMPLIFY: unknown[] = (simplify as unknown as { rules: unknown[] }).rules
  .concat([
    // `log(e^u) = u` vale en TODO ℝ (`e^u > 0` siempre). Se cubren las DOS escrituras del
    // logaritmo natural: la de mathjs (`log` de un argumento) y la que emiten nuestros
    // módulos con la base explícita (`log(u, e)`), necesaria desde que un `log` sin base
    // significa base 10 al releerse. La inversa `e^(log u) = u` NO se añade: solo vale para
    // u > 0 y cambiaría el dominio aparente respecto de la curva dibujada.
    "log(e^n1) -> n1", "log(e) -> 1",
    "log(e^n1, e) -> n1", "log(e, e) -> 1",
    // Identidades trigonométricas que mathjs tampoco trae. Las cinco valen en TODO ℝ, que es
    // el listón de esta lista: la pitagórica no tiene excepciones, y las tres paridades
    // conservan el dominio exacto (`tan(-x)` y `-tan(x)` tienen los mismos polos). Se dejan
    // FUERA las que mueven el dominio o solo valen en un intervalo (`asin(sin x) = x` no es
    // cierta fuera de [−π/2, π/2]) y las que no simplifican nada (`2 sin x cos x = sin 2x`
    // es un cambio de forma, no una reducción).
    "sin(n1)^2 + cos(n1)^2 -> 1",
    "cos(n1)^2 + sin(n1)^2 -> 1",
    "sin(-n1) -> -sin(n1)",
    "cos(-n1) -> cos(n1)",
    "tan(-n1) -> -tan(n1)",
    // La raíz par de un cuadrado es el VALOR ABSOLUTO, no la base. `√(u²) = u` es el error de
    // manual —falso para todo u<0— y por evitarlo el motor no reducía nada: dejaba `√(x²)` tal
    // cual, que es correcto pero es el radical de un cuadrado sin resolver. `|u|` sí es cierto
    // en TODO ℝ, y además es la forma canónica real de esa expresión.
    "sqrt(n1^2) -> abs(n1)",
    "nthRoot(n1^2, 2) -> abs(n1)",
    // Y al revés: elevar un módulo al cuadrado lo borra, porque el cuadrado ya es no negativo.
    // Las dos formas están definidas en todo ℝ y valen lo mismo, así que la igualdad no lleva
    // condición. Encadenadas, `√(|u|²)` acaba en `|u|`.
    "abs(n1)^2 -> n1^2",
    "abs(-n1) -> abs(n1)",
    "abs(abs(n1)) -> abs(n1)",
  ]);

// `simplify` convierte TODO decimal a fracción exacta, y su tope de fábrica es un denominador
// de 10.000. Eso es más de lo que un lector puede leer como fracción: `x^{0.5637}` salía
// `x^{5637/10000}`, y el emisor de LaTeX —que pinta como radical cualquier exponente
// racional— lo remataba en `\sqrt[10000]{x^{5637}}`. Un denominador de cuatro cifras no es
// una fracción que nadie haya escrito: es la expansión decimal del número, disfrazada.
//
// Con el tope en 64 sobrevive todo lo que SÍ se escribe a mano —`0.5`→`1/2`, `2.5`→`5/2`,
// `0.125`→`1/8`, `1.75`→`7/4`, `0.0625`→`1/16`— y `0.5637` se queda como está, que es como
// se escribió. La regla queda del lado del que lee, no del de la aritmética exacta.
const OPCIONES_SIMPLIFY = { fractionsLimit: 64 };

/** Simplifica y expande una expresión YA NORMALIZADA (mathjs). Nodo equivalente, o null.
 *  La expansión pasa por `rationalizeSeguro`: si el polinomio desbordaría el presupuesto
 *  de monomios (el corazón `(x²+y²−1)³=x²y³` colgaba aquí el hilo de Obsidian, y con él
 *  la nota entera) se cae a `simplify`, que NO expande potencias y siempre termina. La
 *  fórmula se muestra entonces sin desarrollar: degradación honesta, no congelación. */
export function simplificarExpr(exprNorm: string): Nodo | null {
  let base: Nodo;
  try { base = parse(exprNorm) as unknown as Nodo; } catch { return null; }
  const r = rationalizeSeguro(base);
  if (r) return r;
  try {
    return simplify(
      base as unknown as MathNode, REGLAS_SIMPLIFY as never, {}, OPCIONES_SIMPLIFY
    ) as unknown as Nodo;
  } catch { return base; }
}

// El guardián de fidelidad (valor Y dominio) vive en `math/dominio`, con el análisis de
// condiciones del que depende, y lo comparte con `derivar`: los dos hacen la misma pregunta
// —«¿esta forma es la misma función que aquella?»— y tenían dos respuestas distintas, las dos
// ciegas al mismo punto.
const formasEquivalentes = mismaFuncion;

/** Formato final compartido: reordena factores/combina semejantes (`combinarYordenar`),
 *  recupera fracciones exactas de los decimales de `rationalize` (`0.5x`→`x/2`), RE-SIMBOLIZA
 *  las constantes irracionales que `rationalize`/`simplify` decimalizan (`sqrt(2)`→`1.4142…`,
 *  `\pi`, `\ln k`; mismo paso que cierra `derivar`/`integrar`) y ordena canónico (variables
 *  antes que constantes). Idempotente en formato. */
function formatear(n: Nodo): string {
  // `sinParentesisRedundantes` cierra el formato: sin él, un mismo árbol se serializaba distinto
  // según cómo se hubiera construido (`(3) / (y)` vs `3 / y`) y Simplificar no era idempotente.
  return formatearCanonico(sinParentesisRedundantes(
    resimbolizarConstantes(racionalizarFracciones(combinarYordenar(n)))));
}

const costo = (n: Nodo): [number, number] => [profundidadFraccion(n), n.toString().length];
const menor = (a: [number, number], b: [number, number]): boolean =>
  a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];

/** Simplifica un lado (o expresión suelta) y lo devuelve como string mathjs, en orden
 *  canónico (variables antes que constantes). Si no se puede, la forma normalizada. */
function simplificarLado(lado: string): string {
  const norm = insertarProductoImplicito(normalizarEntrada(lado.trim()));
  const n = simplificarExpr(norm);
  if (!n) return norm;
  const actual = formatear(n);
  // GUARDIÁN DE FIDELIDAD sobre el resultado principal (antes solo se aplicaba a las
  // candidatas de más abajo). `simplify`/`rationalize` de mathjs son álgebra FORMAL: reducen
  // `0/0` a `0` —FABRICAN un valor donde no hay ninguno— y el panel acababa mostrando
  // `f(x)=0` sobre un plano velado con "Indeterminada" (y `\frac{d}{dx}(0)`, y `∫₀¹0\,dx`:
  // el mismo `simplificarEcuaciones` alimenta el panel de los cuatro bloques). Si la forma
  // simplificada NO coincide con la escrita —incluida la NO-FINITUD— se conserva la escrita:
  // el panel nunca puede afirmar algo que la función no dice.
  if (!formasEquivalentes(actual, norm)) return norm;
  // Solo intervenimos ante una FRACCIÓN DE FRACCIONES (anidamiento ≥2): con funciones,
  // `rationalize` se rinde y `simplify` a veces EMPEORA la forma (convierte una suma de
  // fracciones legible en una anidada, `arccot(x²)/(2√x) − 2x√x/(x⁴+1)` → `(…)/√x`). Todo lo
  // ya plano queda BYTE-IDÉNTICO a antes → idempotencia y tests intactos.
  let curNodo: Nodo;
  try { curNodo = parse(actual) as unknown as Nodo; } catch { return actual; }
  if (profundidadFraccion(curNodo) < 2) return actual;
  // Candidatas MÁS PLANAS (menos anidada, luego más corta):
  //  · la ENTRADA ORIGINAL formateada — si `simplify` la anidó de más, se RECUPERA la forma
  //    legible del usuario (`arccot(x²)/(2√x) − 2x√x/(x⁴+1)`, no su versión combinada);
  //  · `combinarFracciones` — aplana a UNA fracción (`(sin x/2 + cos x/3)/x` → `(3sin+2cos)/6x`).
  // Se adopta la de menor coste que sea numéricamente EQUIVALENTE al ORIGINAL (no cambiar el
  // dominio graficado: combinar puede cancelar √u/√u). Si ninguna mejora, se conserva `actual`.
  const candidatas: string[] = [];
  try { candidatas.push(formatear(parse(norm) as unknown as Nodo)); } catch { /* original no reparseable */ }
  try { candidatas.push(formatear(combinarFracciones(n))); } catch { /* estructura no soportada */ }
  let mejorStr = actual, mejorCosto = costo(curNodo);
  for (const s of candidatas) {
    try {
      const cost = costo(parse(s) as unknown as Nodo);
      if (menor(cost, mejorCosto) && formasEquivalentes(s, norm)) { mejorStr = s; mejorCosto = cost; }
    } catch { /* candidata inválida */ }
  }
  return mejorStr;
}

/** Simplifica y expande cada ecuación de un bloque (ambos lados). Devuelve strings
 *  re-parseables (para encadenar/comparar transformaciones). */
export function simplificarEcuaciones(ecuaciones: readonly string[]): string[] {
  return ecuaciones.map((entrada) => transformarSinRestriccion(entrada, (ec) => {
    // Componente paramétrica (`x(t)=…`): el LHS no es una expresión sino una DECLARACIÓN de
    // función del parámetro. Pasarlo por el pipeline lo leería como el producto `x·t` y el
    // panel acabaría mostrando `t·x = …` (una implícita inventada). Se simplifica el cuerpo y
    // se reconstruye la declaración.
    const comp = componenteParametrica(ec);
    if (comp) return `${comp.eje}(t) = ${simplificarLado(comp.expr)}`;
    const partes = ec.split("=");
    if (partes.length === 2) return `${simplificarLado(partes[0])} = ${simplificarLado(partes[1])}`;
    return simplificarLado(ec); // expresión suelta
  }));
}

/** LaTeX del bloque simplificado y expandido (deriva del string por el pipeline). */
export function simplificarBloqueLatex(ecuaciones: readonly string[]): string {
  return bloqueALatex(simplificarEcuaciones(ecuaciones));
}
