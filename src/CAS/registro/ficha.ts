// ─────────────────────────────────────────────
// registro · La FICHA de una función: todo lo que se sabe de ella, en un sitio
// ─────────────────────────────────────────────
//
// El contrato que responde a «que se puedan añadir algoritmos sin rehacer el núcleo».
//
// ── El problema que resuelve ─────────────────────────────────────────────────────────────
// Hoy, lo que el motor sabe de una función está repartido en SIETE sitios: la lista de átomos
// del parser (`productoImplicito.ts`), tres o cuatro tablas de `constantes.ts`
// (`FUNCIONES_TRIG`, `FUNCIONES_LATEX`, `FUNCIONES_INVERSAS_EXTRA`, `FUNCIONES_SIGNO`,
// `FUNCIONES_DOMINIO`, `FUNCIONES_ESCALON_RAPIDAS`), la tabla de dominio de `math/dominio.ts`,
// el emisor de LaTeX, el compilador nativo, y —si mathjs no la sabe derivar— también `derivar`.
//
// Añadir `erf` significa hoy siete ediciones en siete archivos, con siete oportunidades de
// olvidarse de una. Con esto significa **un registro**.
//
// ── Por qué los campos opcionales no son código muerto ───────────────────────────────────
// `derivada`, `primitiva`, `inversa` y `valoresExactos` están declarados aquí y en su mayoría
// todavía sin rellenar: los rellenan las etapas de cálculo y de resolución. Declarar el hueco
// ahora es lo que hace que rellenarlo después no obligue a cambiar la interfaz ni a tocar a los
// consumidores; es diseño, no adelanto de trabajo.
//
// ── Lambert W y las funciones especiales ─────────────────────────────────────────────────
// La forma de esta ficha está elegida para que `W` quepa sin ningún caso especial. `W` tiene:
// dos ramas reales (`W₀` y `W₋₁`), que caben en `Rama`; un dominio `x ≥ −1/e`, que cabe en
// `dominioNatural` y es una expresión exacta; una derivada conocida, que cabe en `derivada`; y
// una relación inversa —`u·e^u ↦ W`— que cabe en `inversaDe`. El día que se registre, el
// resolvedor podrá producir `x·eˣ = a → x = W(a)` por el MISMO mecanismo con el que hoy invierte
// `sin` con `asin`, y no por una rama nueva escrita para el caso.

import { type Condicion, type Expresion } from "../nucleo/expresion";

/** Qué se puede afirmar del signo de una función sobre su dominio. */
export type SignoConocido = "positivo" | "noNegativo" | "negativo" | "noPositivo" | "cualquiera";

/**
 * Una relación inversa: qué función deshace qué PATRÓN.
 *
 * No es «la inversa de f», que sería suficiente para `sin`/`asin` e insuficiente para casi todo
 * lo demás. Es «el patrón `u·e^u` se invierte con `W`», «el patrón `sin(u)` se invierte con
 * `asin` más una familia periódica»: la unidad que el resolvedor necesita para trabajar sobre
 * FORMAS canónicas y no sobre nombres sueltos.
 */
export interface Inversa {
  /** Id de la ficha que deshace el patrón. */
  readonly funcion: string;
  /** Si la inversión abre ramas (`cos y = x` → dos por período), cuántas. 1 = rama única. */
  readonly ramas: 1 | 2;
  /** Período de la familia de soluciones, si la hay (`sin` → 2π). Ausente = no es periódica. */
  readonly periodo?: Expresion;
}

/**
 * Todo lo que el motor sabe de una función.
 *
 * `id` es la clave estable con la que la referencian los nodos `Aplicacion`, y es también la que
 * ordena (ver `orden.ts`): NO es un índice en un array, precisamente para que añadir funciones al
 * catálogo no reordene las expresiones que ya existen.
 */
export interface FichaFuncion {
  readonly id: string;
  /** Número de argumentos. `null` = variádica (`min`, `max`). */
  readonly aridad: number | null;
  /** Nombre con el que la escribe mathjs, si difiere del id. Lo usa el puente. */
  readonly enMathjs?: string;

  /** Evaluación numérica sobre ℝ. Fuera del dominio real devuelve NaN, nunca un complejo: lo
   *  que este motor dibuja es ℝ, y un complejo colándose se acaba leyendo como una curva. */
  readonly evaluar: (args: readonly number[]) => number;

  /** Las condiciones que sus argumentos deben cumplir para que exista. `[]` = ninguna. */
  readonly dominioNatural?: (args: readonly Expresion[]) => readonly Condicion[];

  /** Qué se puede afirmar del signo de su resultado. */
  readonly signo?: SignoConocido;

  /** ¿Es par (f(−u) = f(u)) o impar (f(−u) = −f(u))? Lo aprovechan la normalización y el
   *  cálculo; declararlo aquí evita que cada uno lleve su propia lista. */
  readonly paridad?: "par" | "impar";

  /** Derivada respecto del argumento `i`, ya como expresión. La rellena la etapa de cálculo. */
  readonly derivada?: (args: readonly Expresion[], i: number) => Expresion;

  /** Primitiva elemental respecto de su argumento, si existe y se conoce. `null` = no la hay o
   *  no se sabe, que en este motor es una respuesta y no un fallo. */
  readonly primitiva?: (args: readonly Expresion[]) => Expresion | null;

  /** Cómo se deshace esta función al despejar. */
  readonly inversa?: Inversa;

  /** Valores exactos en puntos notables, indexados por la forma canónica del argumento. Es el
   *  hueco donde entra la tabla que hoy vive encerrada en el bloque de trigonometría
   *  (`trig/exactosTrig.ts`) y que el CAS no ve. */
  readonly valoresExactos?: ReadonlyMap<string, Expresion>;
}

/** Un catálogo: fichas indexadas por id. */
export type Catalogo = ReadonlyMap<string, FichaFuncion>;

/** Construye un catálogo a partir de una lista, comprobando que no haya ids repetidos. Un id
 *  duplicado sería una función que tapa a otra en silencio, y eso no puede pasar inadvertido. */
export function catalogoDe(fichas: readonly FichaFuncion[]): Catalogo {
  const mapa = new Map<string, FichaFuncion>();
  for (const f of fichas) {
    if (mapa.has(f.id)) throw new Error(`ficha duplicada en el catálogo: ${f.id}`);
    mapa.set(f.id, f);
  }
  return mapa;
}
