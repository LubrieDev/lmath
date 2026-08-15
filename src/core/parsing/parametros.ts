// ─────────────────────────────────────────────
// parsing · Parámetros declarados antes de la fórmula (PURO)
// ─────────────────────────────────────────────
//
// La segunda mitad del issue #1, y la sintaxis de Desmos: se declaran valores en sus propias
// líneas y la fórmula los usa por su nombre.
//
//   A = 1
//   \alpha = 1
//   \phi = 0
//   B = 2
//   f(x) = A\sin(\alpha x + \phi) + B
//
// ── Por qué se separan ANTES de repartir ecuaciones ───────────────────────────────────────
// Porque una línea `A = 1` no es una curva ni es basura: es un tercer tipo de cosa, y el reparto
// de líneas solo conoce los dos primeros. Sin este paso, `A = 1` se clasifica como la IMPLÍCITA
// `A − 1 = 0` y, fuera de obs-system, se convierte en LA curva del bloque —la fórmula de debajo
// ni se mira—. Es el mismo orden que ya sigue la restricción de dominio: lo que no es la ecuación
// se aparta antes de que nadie intente leerla como tal (ver restriccionDominio.ts).
//
// ── Qué es una declaración, exactamente ───────────────────────────────────────────────────
// `nombre = constante`, y nada más. El lado derecho tiene que evaluarse con ÁMBITO VACÍO
// (`evaluarConstante`), lo cual decide dos cosas de una vez:
//
//   · `B = 2A` NO es una declaración. Un parámetro que depende de otro pide un grafo de
//     dependencias, y esa es la misma decisión que ya se tomó en obs-vector con `w = u+v`: se
//     escribe, no se resuelve. Al no serlo, la línea sigue su camino de siempre.
//   · `y = 2` NO es una declaración: `y` es una COORDENADA, y esa línea es la recta horizontal
//     de toda la vida. Igual `x`, y el `r`/`t`/`theta` de las polares y paramétricas.
//
// ── Un nombre declarado TAPA a la constante que se llame igual ────────────────────────────
// El issue declara `\phi = 0` como fase, y `phi` es a la vez la razón áurea de mathjs. Gana lo
// declarado: quien escribe `\phi = 0` en la línea de arriba no está pidiendo 1,618. La regla es
// general y no una lista de excepciones —cualquier nombre que se declare tapa lo que hubiera—,
// pero conviene saber que también alcanza a `e` si a alguien se le ocurre declararla, y entonces
// `e^x` de ese bloque deja de ser la exponencial. Renombrar el parámetro es la salida.
//
// ── Qué NO decide este módulo ─────────────────────────────────────────────────────────────
// El recorrido de los deslizadores, ni cuándo se retraza, ni dónde vive el mando. Aquí solo se
// leen las declaraciones y se sabe sustituirlas; todo lo demás es del host.

import { normalizarEntrada } from "../../parser";
import { evaluarConstante } from "../../evaluador";
import { partirEnAtomos } from "./productoImplicito";

/** Un parámetro declarado, con lo que hace falta para pintarlo y para sustituirlo. */
export interface Parametro {
  /** El nombre YA NORMALIZADO (`A`, `alpha`, `phi`): es como lo nombra el motor. */
  readonly nombre: string;
  /**
   * El nombre TAL COMO SE ESCRIBIÓ (`A`, `\alpha`). Es lo que hay que buscar en la fórmula para
   * sustituirlo, y lo que el mando enseña: un deslizador rotulado `alpha` junto a una fórmula que
   * dice `\alpha` no se reconoce como el mismo.
   */
  readonly escrito: string;
  /** El valor declarado, que es donde arranca el deslizador. */
  readonly valor: number;
}

export interface EntradaParametrizada {
  /** Los parámetros, en el orden en que se declararon. */
  readonly parametros: readonly Parametro[];
  /** El source SIN las líneas de declaración: lo que se reparte en ecuaciones. */
  readonly source: string;
}

/**
 * Nombres que NO pueden ser un parámetro porque el plugin los necesita para otra cosa: son las
 * coordenadas y los parámetros de curva en los que se dibuja. `y = 2` tiene que seguir siendo la
 * recta horizontal, no la declaración de un parámetro llamado `y` que además nadie usaría.
 *
 * La lista es corta a propósito. Todo lo demás —incluidas las constantes con nombre— se puede
 * declarar, y declararlo lo tapa (ver la cabecera).
 */
const COORDENADAS = new Set(["x", "y", "r", "t", "theta"]);

/**
 * Una declaración: nombre a la izquierda, todo lo demás a la derecha. El nombre es un comando
 * LaTeX (`\alpha`) o un identificador corriente (`A`, `omega`, `Vmax`); el `;` final del issue se
 * admite y se tira, porque separar líneas con punto y coma es lo que sale al venir de otro sitio.
 */
const DECLARACION = /^\s*(\\[a-zA-Z]+|[a-zA-Z][a-zA-Z0-9]*)\s*=([^=]+?);?\s*$/;

/**
 * Lee una línea como declaración de parámetro, o devuelve `null`.
 *
 * El `[^=]` del lado derecho no es cosmética: descarta de entrada cualquier línea con un segundo
 * `=` (`x = y = 2`), que no es una declaración de nada.
 */
function leerDeclaracion(linea: string): Parametro | null {
  const m = DECLARACION.exec(linea);
  if (!m) return null;
  const escrito = m[1];
  const nombre = normalizarEntrada(escrito).trim();
  // El nombre normalizado tiene que seguir siendo UN identificador: `\left` normaliza a `(` y
  // `\pm` a un centinela, y ninguno de los dos es un nombre que se pueda declarar.
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(nombre) || COORDENADAS.has(nombre)) return null;
  const valor = evaluarConstante(m[2]);
  return valor === null ? null : { nombre, escrito, valor };
}

/**
 * Parte un source en «los parámetros» y «lo que se grafica».
 *
 * Una línea que no sea declaración vuelve intacta y en su sitio, así que un bloque sin parámetros
 * atraviesa esta función sin enterarse. Si el mismo nombre se declara dos veces gana la ÚLTIMA,
 * que es como se lee un cuaderno de arriba abajo.
 */
export function separarParametros(source: string): EntradaParametrizada {
  const lineas = source.split(/\r?\n/);
  const porNombre = new Map<string, Parametro>();
  const resto: string[] = [];

  for (const linea of lineas) {
    const p = leerDeclaracion(linea);
    if (p) porNombre.set(p.nombre, p);
    else resto.push(linea);
  }
  return { parametros: [...porNombre.values()], source: resto.join("\n") };
}

/** El recorrido del mando de un parámetro: por dónde se mueve y con qué finura. */
export interface Recorrido {
  readonly min: number;
  readonly max: number;
  /** Salto de una flecha del teclado, y la rejilla a la que se redondea el arrastre. */
  readonly paso: number;
  /** Salto de Shift+flecha. */
  readonly pasoGrande: number;
  /** Decimales con los que se ESCRIBE el valor, deducidos del paso. */
  readonly decimales: number;
}

/**
 * El recorrido de un parámetro a partir de su valor declarado. **No hay sintaxis para
 * declararlo**, y eso es deliberado: el issue no la pidió, y una sintaxis de rango es una
 * decisión que conviene tomar viendo cómo se usa esto, no antes.
 *
 * `−10..10` por defecto, que es lo que hace Desmos y cubre casi todo lo que uno teclea. Si el
 * valor declarado se sale de ahí, el recorrido crece hasta contenerlo: un mando que arranca
 * pegado a su tope no sirve de nada, y peor aún sería recortar en silencio el valor que el autor
 * escribió.
 *
 * El paso sale del tamaño del recorrido y no de un número fijo: mil posiciones dan una finura
 * cómoda al arrastrar sea cual sea la escala, y en el caso corriente (`R = 10`) cae en `0,01`,
 * que es lo que uno espera teclear.
 */
export function recorridoDe(valor: number): Recorrido {
  const r = Math.max(10, Math.ceil(Math.abs(valor)));
  const paso = r / 1000;
  return {
    min: -r, max: r, paso, pasoGrande: r / 10,
    decimales: Math.max(0, Math.ceil(-Math.log10(paso))),
  };
}

/**
 * El patrón de un nombre escrito CON BARRA (`\alpha`). Un comando está delimitado por su propia
 * barra, así que basta con no dejar que case un prefijo de otro más largo (`\alpha` dentro de
 * `\alphaxyz`, que no existe, pero también `\pi` dentro de `\pity`).
 */
function patronDeComando(escrito: string): RegExp {
  return new RegExp(`${escrito.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}(?![a-zA-Z])`, "g");
}

/**
 * Toda secuencia de letras de la fórmula, con la barra que la preceda si la hay.
 *
 * Se mira la barra para poder SALTARSE los comandos: dentro de `\tan` no hay ninguna variable
 * que sustituir, y un parámetro llamado `t` o `a` no debe tocar esas letras.
 */
const RUN_DE_LETRAS = /(\\?)([a-zA-Z]+)/g;

/**
 * Sustituye cada parámetro por su valor ACTUAL, en el texto de la fórmula.
 *
 * **Por qué se sustituye en vez de pasar un ámbito.** El compilador nativo admite dos variables
 * como mucho; con los parámetros en el ámbito, una `f(x)` con dos de ellos tendría tres y caería
 * al camino de mathjs, que es entre 2,3 y 18 veces más lento — y justo en el caso que más veces
 * se recompila, porque cada movimiento del deslizador rehace la función. Sustituyendo, el motor
 * sigue viendo una función de una variable y conserva la ruta rápida. Recompilar cuesta
 * microsegundos al lado del retrazado.
 *
 * El valor va **entre paréntesis** por dos razones que se ven enseguida al quitarlos: un valor
 * negativo (`A = -2`) rompería `x^A`, y el producto implícito de `A\sin x` necesita que lo que
 * sustituye sea un factor y no dos.
 *
 * **Dónde está la dificultad.** En este plugin no existen los nombres de varias letras: `Ax` es
 * el producto `A·x` y `Ab` es `A·b`, porque el producto implícito parte toda secuencia de letras
 * en átomos. O sea que un parámetro `A` **sí** tiene que sustituirse dentro de `Ax` —que es la
 * forma más natural de escribirlo— pero **no** dentro de `tan`, `alpha` o `Pi`, que son átomos
 * enteros. Preguntar «¿va seguido de una letra?» respondía mal a las dos cosas a la vez; quien
 * sabe la respuesta es `partirEnAtomos`, y por eso se le pregunta a él.
 *
 * Dos pasadas, y en este orden:
 *   1. los nombres CON BARRA (`\alpha`), que son comandos y están delimitados por su barra;
 *   2. los demás, partiendo cada secuencia de letras en átomos y sustituyendo los que sean un
 *      parámetro. Las secuencias precedidas de barra se saltan enteras: son comandos.
 */
export function sustituirParametros(
  expr: string,
  parametros: readonly Parametro[],
  valores?: ReadonlyMap<string, number>,
): string {
  if (parametros.length === 0) return expr;
  const valorDe = (p: Parametro): string => `(${valores?.get(p.nombre) ?? p.valor})`;

  // 1. Los comandos, de más largo a más corto para que `\pi` no entre dentro de `\pixel`.
  const comandos = parametros
    .filter((p) => p.escrito.startsWith("\\"))
    .sort((a, b) => b.escrito.length - a.escrito.length);
  let s = expr;
  for (const p of comandos) s = s.replace(patronDeComando(p.escrito), valorDe(p));

  // 2. Los nombres desnudos, átomo a átomo.
  const desnudos = new Map(
    parametros.filter((p) => !p.escrito.startsWith("\\")).map((p) => [p.escrito, p] as const)
  );
  if (desnudos.size === 0) return s;
  return s.replace(RUN_DE_LETRAS, (todo, barra: string, run: string) => {
    if (barra) return todo;   // es un comando: o se trató arriba, o no es nuestro
    return partirEnAtomos(run)
      .map((a) => { const p = desnudos.get(a); return p ? valorDe(p) : a; })
      .join("");
  });
}
