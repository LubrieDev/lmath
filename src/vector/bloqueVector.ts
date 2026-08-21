// ─────────────────────────────────────────────
// vector · Parser del bloque obs-vector (PURO)
// ─────────────────────────────────────────────
//
// **Una línea = una expresión = una tarjeta.** El bloque no se configura: no tiene claves, ni
// modos, ni capas que encender —la misma ausencia que sostiene a `obs-trig`, y por la misma
// razón: sin sintaxis de opciones no hay dónde colgar la siguiente.
//
// Lo único que este parser decide es QUÉ ES cada línea, y lo decide por la forma en que está
// escrita, no por una palabra clave:
//
//   v = (3, 2)        · minúscula          → VECTOR   → se pinta `\vec{v}` y se dibuja desde el origen
//   A = (1, 2)        · MAYÚSCULA          → PUNTO    → se pinta `A` y se dibuja como una marca
//   F(x,y) = (-y, x)  · con argumentos     → CAMPO    → se pinta tal cual; no se dibuja (aún)
//   AB                · dos puntos suyos   → el vector que va de A a B
//   ∇f(x,y)           · cualquier otra cosa → se pinta y ya está
//
// La convención mayúscula/minúscula no es un capricho de este bloque: es la que usan los libros
// de texto (los puntos son A, B, P; los vectores u, v, w) y la que el usuario ya escribe sin
// pensar. Elegirla evita la alternativa —una sintaxis explícita tipo `punto A = …`— que habría
// obligado a declarar en cada línea algo que la propia letra ya dice.
//
// No pasa por `dividirEcuaciones`, que parte por `=` para separar los dos lados de una ECUACIÓN:
// aquí el `=` no separa una igualdad, DECLARA un nombre. Lo que sí se reutiliza es el pipeline de
// entrada del plugin (`normalizarEntrada` + `insertarProductoImplicito` + `compilarExpresion`),
// así que una componente acepta exactamente lo mismo que cualquier otro bloque de LMath:
// `\frac{1}{2}`, `2\pi`, `\sqrt{2}`, `-3`.

import { evaluarConstante } from "../CAS/api-legado";
import { numeroATexto } from "../core/analysis/formatoNumero";

/**
 * QUÉ es una línea con nombre. Se deduce de cómo está escrito el nombre (ver la cabecera), no de
 * ninguna marca que el usuario tenga que poner.
 */
export type Genero = "vector" | "punto" | "campo";

/** Un par ordenado tal y como se escribió, más su valor si resultó ser numérico. */
export interface Par {
  /** Las dos componentes, CRUDAS: es lo que se tipografía (`-y`, `\frac{1}{2}`). */
  readonly x: string;
  readonly y: string;
  /**
   * Las dos componentes ya evaluadas, o `null` si alguna no da un número real (una componente
   * de un campo, un símbolo libre). Es exactamente la frontera entre lo que se puede DIBUJAR y
   * lo que solo se puede ESCRIBIR: sin número no hay punta de flecha que colocar.
   */
  readonly valor: readonly [number, number] | null;
}

/** Una línea del bloque, ya interpretada. */
export type Entrada =
  | {
      readonly tipo: "declaracion";
      readonly genero: Genero;
      /** El nombre tal cual se escribió (`v`, `A`, `v_1`, `F`). */
      readonly nombre: string;
      /** Argumentos de un campo (`["x","y"]`); vacío en vectores y puntos. */
      readonly parametros: readonly string[];
      readonly par: Par;
    }
  | {
      /** El vector que va de un punto a otro, escrito `AB`, `A->B` o `\vec{AB}`. */
      readonly tipo: "diferencia";
      readonly desde: string;
      readonly hasta: string;
      readonly par: Par;
    }
  | {
      /** Cualquier otra cosa. Se tipografía y ya está: el bloque no la interpreta. */
      readonly tipo: "libre";
      readonly texto: string;
    };

export interface BloqueVector {
  readonly entradas: readonly Entrada[];
}

// ── Léxico ────────────────────────────────────────────────────────────────────────────────
//
// Un NOMBRE es una letra seguida de letras o dígitos, con un subíndice opcional (`v_1`, `v_{12}`)
// y las primas que hagan falta (`u'`, `A''`). Es deliberadamente estrecho: todo lo que no encaje
// cae a línea libre, que se pinta igual de bien y no obliga a inventar reglas para cada caso.
const NOMBRE = /^[A-Za-z][A-Za-z0-9]*(?:_(?:\{[A-Za-z0-9+-]*\}|[A-Za-z0-9]))?'*$/;

/** Los dos pares de delimitadores con los que se escribe un par ordenado. */
const DELIMITADORES: ReadonlyArray<readonly [string, string]> = [["(", ")"], ["[", "]"]];

/**
 * Evalúa UNA componente a número, o `null` si no lo es.
 *
 * Es `evaluarConstante` con el nombre que tiene sentido aquí: un par ordenado no tiene «ángulos»
 * ni «cotas», tiene componentes. El ámbito VACÍO que aquella usa es justo lo que este bloque
 * necesita —la `-y` de un campo sale NaN, que es la respuesta correcta: no es un número, es una
 * regla—, y es lo que decide que esa entrada no se dibuje.
 */
export const evaluarComponente = evaluarConstante;

/**
 * Divide `(a, b)` en sus dos componentes, o `null` si el texto no es un par ordenado.
 *
 * La coma se busca a NIVEL 0 y contando profundidad, no con una expresión regular: `(f(1,2), 3)`
 * tiene tres comas y solo una de ellas separa las componentes del par. Y el delimitador de
 * apertura tiene que envolver TODO el texto, para que `(1,2)+(3,4)` —que empieza y acaba como
 * haría falta— no se cuele como si fuera un par.
 */
export function separarPar(texto: string): readonly [string, string] | null {
  // `\left(`/`\right)` es tipografía, no estructura: se retira antes de mirar los delimitadores
  // para que un par copiado de una fórmula LaTeX se lea igual que uno escrito a mano.
  const s = texto.replace(/\\left|\\right/g, "").trim();
  const par = DELIMITADORES.find(([a, b]) => s.startsWith(a) && s.endsWith(b));
  if (!par || s.length < 4) return null;

  let prof = 0;
  let coma = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") prof++;
    else if (c === ")" || c === "]" || c === "}") {
      // El delimitador inicial se cerró antes del final: no envuelve todo el texto.
      if (--prof === 0 && i < s.length - 1) return null;
    } else if (c === "," && prof === 1) {
      if (coma !== -1) return null;      // tres componentes o más: no es un par del plano
      coma = i;
    }
  }
  if (coma === -1) return null;
  const x = s.slice(1, coma).trim();
  const y = s.slice(coma + 1, -1).trim();
  return x && y ? [x, y] : null;
}

/** El par con sus componentes ya evaluadas (`valor` null si alguna no es un número). */
function construirPar(x: string, y: string): Par {
  const vx = evaluarComponente(x);
  const vy = evaluarComponente(y);
  return { x, y, valor: vx !== null && vy !== null ? [vx, vy] : null };
}

/** Género de un nombre SIN argumentos: la caja de la primera letra, y nada más. */
function generoDeNombre(nombre: string): Genero {
  return /^[A-Z]/.test(nombre) ? "punto" : "vector";
}

/**
 * La decoración de flecha alrededor de un nombre (`\vec{v}`, `\overrightarrow{AB}`), retirada.
 *
 * Se retira en vez de rechazarse porque quien la escribe está diciendo exactamente lo que el
 * bloque ya deduce: que eso es un vector. Es la misma convergencia que hace `leerExtremos` con
 * `AB` / `A->B` / `\vec{AB}` —una sola idea, varias formas de teclearla—, y evita el peor
 * resultado posible: que escribir la notación CORRECTA a mano sea justo lo que apague el bloque.
 */
const desnudarFlecha = (s: string): string =>
  s.replace(/^\\(?:vec|overrightarrow)\s*\{([^{}]*)\}$/, "$1").trim();

/**
 * Lee el lado izquierdo de una declaración: `v`, `v_1`, `F(x,y)`, `\vec{v}`. Devuelve el nombre y
 * sus argumentos, o `null` si no es una declaración válida —y entonces la línea entera pasa a ser
 * libre, que es siempre la salida segura—.
 */
function leerNombre(
  lhs: string
): { nombre: string; parametros: string[]; conFlecha: boolean } | null {
  const crudo = lhs.trim();
  const s = desnudarFlecha(crudo);
  // Una flecha ESCRITA a mano manda sobre la convención de mayúsculas: quien teclea `\vec{A}`
  // ya ha dicho que eso es un vector, y responderle con un punto sería corregirle.
  const conFlecha = s !== crudo;
  const abre = s.indexOf("(");
  if (abre === -1) return NOMBRE.test(s) ? { nombre: s, parametros: [], conFlecha } : null;
  if (!s.endsWith(")")) return null;
  const nombre = s.slice(0, abre).trim();
  if (!NOMBRE.test(nombre)) return null;
  const parametros = s.slice(abre + 1, -1).split(",").map((p) => p.trim());
  // Un argumento vacío (`F()`, `F(x,)`) no es una firma: es un paréntesis a medio escribir.
  if (parametros.some((p) => p === "" || !NOMBRE.test(p))) return null;
  return { nombre, parametros, conFlecha };
}

// ── Vector entre dos puntos ───────────────────────────────────────────────────────────────
//
// Las tres formas en que se escribe lo mismo. `AB` es la que se usa a mano y la que el bloque
// espera; `A->B` y `\vec{AB}` existen porque son las que salen sin pensar cuando uno viene de
// escribir en un editor o de copiar de una fórmula, y rechazarlas no enseñaría nada.
const FLECHA_ENTRE = /^([A-Za-z][A-Za-z0-9]*)\s*(?:->|→|\\to)\s*([A-Za-z][A-Za-z0-9]*)$/;

/** Los dos extremos si la línea nombra un vector entre puntos, o `null`. */
function leerExtremos(linea: string): readonly [string, string] | null {
  // `\vec{AB}` y `\overrightarrow{AB}`: la decoración se retira y se vuelve a mirar el interior,
  // así las tres formas convergen en el mismo camino en vez de multiplicar las reglas.
  const desnudo = desnudarFlecha(linea);

  const flecha = FLECHA_ENTRE.exec(desnudo);
  if (flecha) return [flecha[1], flecha[2]];
  // Yuxtaposición: EXACTAMENTE dos letras mayúsculas. Se exigen mayúsculas porque son las que
  // nombran puntos; sin esa condición, `xy` —un producto de toda la vida— se leería como un
  // vector en cuanto la nota tuviera un punto llamado `x`.
  if (/^[A-Z][A-Z]$/.test(desnudo)) return [desnudo[0], desnudo[1]];
  return null;
}

/**
 * El par de un vector entre dos puntos. Con ambos extremos numéricos son NÚMEROS —que es lo que
 * el lector quiere ver: `\vec{AB} = (4, 2)`, no `(5-1, 4-2)`—; si alguno es simbólico se compone
 * la resta y se pinta tal cual, que sigue siendo cierta.
 *
 * El texto del número lo escribe `numeroATexto`, el mismo que redacta los paneles ⓘ: sin él,
 * `String(0.3-0.1)` dejaría `0.19999999999999998` a la vista de todo el mundo. El `valor` que se
 * dibuja sigue siendo la resta EXACTA en coma flotante; lo que se redondea es lo que se lee.
 */
function parDiferencia(desde: Par, hasta: Par): Par {
  if (desde.valor && hasta.valor) {
    const dx = hasta.valor[0] - desde.valor[0];
    const dy = hasta.valor[1] - desde.valor[1];
    return { x: numeroATexto(dx), y: numeroATexto(dy), valor: [dx, dy] };
  }
  return construirPar(`(${hasta.x})-(${desde.x})`, `(${hasta.y})-(${desde.y})`);
}

/**
 * Lee el bloque entero.
 *
 * Dos pasadas, y la segunda existe por una razón concreta: `AB` puede escribirse ANTES que los
 * puntos que nombra, y en un bloque de tres líneas obligar a un orden concreto sería una regla
 * que el usuario tendría que recordar sin que nada en pantalla se la recuerde. Con las
 * declaraciones ya recogidas, resolver los extremos no depende de dónde estén escritos.
 */
export function parsearBloqueVector(source: string): BloqueVector {
  const lineas = source.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");

  // ── 1ª pasada: las declaraciones (es lo único a lo que otra línea puede referirse) ──
  const puntos = new Map<string, Par>();
  const declarado: Array<{ indice: number; entrada: Entrada }> = [];
  for (let i = 0; i < lineas.length; i++) {
    const corte = lineas[i].indexOf("=");
    if (corte < 0) continue;
    const cabeza = leerNombre(lineas[i].slice(0, corte));
    if (!cabeza) continue;
    const componentes = separarPar(lineas[i].slice(corte + 1));
    if (!componentes) continue;

    const par = construirPar(componentes[0], componentes[1]);
    // Con argumentos es un CAMPO, tenga el nombre la caja que tenga: `F(x,y)` y `f(x,y)` son
    // los dos una regla que asigna un vector a cada punto, no un vector ni un punto. Sin
    // argumentos manda la flecha escrita, y si no la hay, la caja de la primera letra.
    const genero: Genero = cabeza.parametros.length > 0 ? "campo"
      : cabeza.conFlecha ? "vector"
      : generoDeNombre(cabeza.nombre);
    if (genero === "punto") puntos.set(cabeza.nombre, par);
    declarado.push({
      indice: i,
      entrada: { tipo: "declaracion", genero, nombre: cabeza.nombre, parametros: cabeza.parametros, par },
    });
  }

  // ── 2ª pasada: el resto, ya con los puntos a la vista ──
  const porIndice = new Map(declarado.map((d) => [d.indice, d.entrada]));
  const entradas: Entrada[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const yaLeida = porIndice.get(i);
    if (yaLeida) { entradas.push(yaLeida); continue; }

    const extremos = leerExtremos(lineas[i]);
    const desde = extremos ? puntos.get(extremos[0]) : undefined;
    const hasta = extremos ? puntos.get(extremos[1]) : undefined;
    // Solo es un vector entre puntos si los DOS están declarados en este bloque. `AB` con una `A`
    // que nadie ha definido no es un vector incompleto: es el producto `A·B`, y como tal se pinta.
    if (extremos && desde && hasta) {
      entradas.push({
        tipo: "diferencia", desde: extremos[0], hasta: extremos[1],
        par: parDiferencia(desde, hasta),
      });
      continue;
    }
    entradas.push({ tipo: "libre", texto: lineas[i] });
  }

  return { entradas };
}

// ── Lo que el PLANO puede dibujar ─────────────────────────────────────────────────────────
//
// Se deriva aquí, junto al parser, y no en el renderizador: es una lectura del bloque (qué
// entradas tienen números), no una decisión de dibujo. El renderizador recibe segmentos y
// marcas ya resueltos y no necesita saber que existen los campos ni las líneas libres.

/** Una flecha: de dónde sale, adónde llega y con qué nombre se rotula. */
export interface Flecha {
  readonly desde: readonly [number, number];
  readonly hasta: readonly [number, number];
  readonly etiqueta: string;
  /** Papel en la paleta (`colorCurva`): el orden en que la entrada aparece en el bloque. */
  readonly rol: number;
}

/** Un punto suelto: un disco con su nombre al lado. */
export interface Marca {
  readonly en: readonly [number, number];
  readonly etiqueta: string;
  readonly rol: number;
}

export interface DibujoVector {
  readonly flechas: readonly Flecha[];
  readonly marcas: readonly Marca[];
}

const ORIGEN = [0, 0] as const;

/**
 * Las flechas y marcas de un bloque. Cada género se dibuja como lo que ES, y esa es toda la
 * regla:
 *
 *   • un VECTOR es una flecha desde el origen —no tiene posición, así que se le da la canónica—;
 *   • un PUNTO es una marca, no una flecha: dibujarlo como vector de posición diría algo que el
 *     usuario no ha escrito, y es justo la confusión que el bloque debería ayudar a deshacer;
 *   • `AB` es la flecha que va de A a B, que es lo que ese símbolo significa.
 *
 * Un CAMPO no aparece: `F(x,y)=(-y,x)` no es un vector, es infinitos, y dibujar uno solo sería
 * mentir sobre lo escrito. (Pintar la malla entera es un bloque más grande, no una línea más.)
 */
export function dibujoDeBloque(bloque: BloqueVector): DibujoVector {
  const flechas: Flecha[] = [];
  const marcas: Marca[] = [];
  bloque.entradas.forEach((e, rol) => {
    if (e.tipo === "libre") return;
    if (e.tipo === "diferencia") {
      // La flecha entre puntos necesita, además del vector, SU ORIGEN: es lo único que la
      // distingue de la misma flecha dibujada desde (0,0).
      const desde = puntoDeclarado(bloque, e.desde);
      const hasta = puntoDeclarado(bloque, e.hasta);
      if (desde && hasta) {
        flechas.push({ desde, hasta, etiqueta: `${e.desde}${e.hasta}`, rol });
      }
      return;
    }
    if (!e.par.valor) return;             // campo, o componentes que no son números
    if (e.genero === "vector") {
      flechas.push({ desde: ORIGEN, hasta: e.par.valor, etiqueta: e.nombre, rol });
    } else if (e.genero === "punto") {
      marcas.push({ en: e.par.valor, etiqueta: e.nombre, rol });
    }
  });
  return { flechas, marcas };
}

/** Coordenadas del punto declarado con ese nombre, o `null`. Con el nombre declarado DOS veces
 *  gana la última, que es la misma que usó el parser al resolver `AB`: si aquí ganara la
 *  primera, la tarjeta diría una resta y la flecha dibujaría otra. */
function puntoDeclarado(bloque: BloqueVector, nombre: string): readonly [number, number] | null {
  let ultimo: readonly [number, number] | null = null;
  for (const e of bloque.entradas) {
    if (e.tipo === "declaracion" && e.genero === "punto" && e.nombre === nombre && e.par.valor)
      ultimo = e.par.valor;
  }
  return ultimo;
}

/** ¿Hay algo que dibujar? Es lo que decide si el bloque enseña un plano o es solo la tarjeta. */
export function hayDibujo(d: DibujoVector): boolean {
  return d.flechas.length > 0 || d.marcas.length > 0;
}
