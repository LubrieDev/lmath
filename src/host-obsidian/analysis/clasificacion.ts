// ─────────────────────────────────────────────
// host-obsidian · analysis · Clasificación formal del bloque
// ─────────────────────────────────────────────
//
// Decide qué ETIQUETA formal (el «velo») merece un bloque antes de graficarlo, y qué f(x)
// tiene un obs-graph explícito. Es lógica PURA: no toca el DOM, ni la API de Obsidian, ni
// el estado del adaptador —solo lee lo escrito y devuelve texto o `null`—, así que se puede
// ejercitar desde las pruebas sin montar un bloque.
//
// Vivía dentro de `MotorExperimental` como métodos privados. Lo que la ataba a la clase eran
// tres rasgos del modo (`sistema`/`derivada`/`integral`), que ahora entran como parámetro
// (`RasgosBloque`) en lugar de leerse de `this`. El reparto es el mismo de antes; lo único
// que cambia es de dónde vienen esos tres booleanos.

import { t } from "../../i18n";
import { normalizarEntrada, contieneYLibre, comandosNoSoportados } from "../../parser";
import { compilarFuncion } from "../../evaluador";
import { clasificarDegenerada, type FuncionDegenerada } from "../../degeneradas";
import { etiquetaIntegral } from "../../integral";
import { construirObjeto } from "../../core/parsing/construirObjeto";
import { insertarProductoImplicito } from "../../core/parsing/productoImplicito";
import { funcionDelParametro, renombrarParametroAX } from "../../core/parsing/componentesParametricas";
import {
  sinRestricciones, separarRestriccion, lineasDeEcuacion,
} from "../../core/parsing/restriccionDominio";

/**
 * Los tres rasgos del bloque que la clasificación necesita consultar. En el adaptador son
 * getters derivados del modo (`modo === "system"`, …); aquí llegan ya resueltos para que
 * este módulo no dependa de la clase ni del tipo `ModoBloque` (evita el import circular).
 */
export interface RasgosBloque {
  sistema: boolean;
  derivada: boolean;
  integral: boolean;
}

/**
 * Etiqueta formal del bloque, o null si es graficable: bloque VACÍO → "Sin
 * función"; forma explícita clásica (expr suelta o y=expr) sin ningún valor real
 * → clasificación del GraphEngine (Indeterminada / Indefinida / No definida en ℝ,
 * con el MISMO evaluador compartido, que preserva los valores complejos). Las
 * demás formas (implícitas, paramétricas, polares, sistemas) no se clasifican:
 * el motor grafica lo que pueda.
 */
export function clasificarBloque(
  ecuaciones: readonly string[], rasgos: RasgosBloque, source = ""
): FuncionDegenerada | null {
  // Comando LaTeX que el parser no sabe traducir (`\alpha`, `\ge`, `\sum`…). Se mira el
  // SOURCE escrito, no las ecuaciones graficadas (en derivate/integral estas ya son la
  // derivada/el integrando, en sintaxis mathjs). Va PRIMERO: sin esta etiqueta el comando
  // se degrada a símbolos libres y el bloque no dibuja nada SIN decir por qué —o peor, en
  // obs-derivate deriva esa basura y muestra una derivada falsa (ver parser.ts).
  // La restricción de dominio se retira ANTES de mirar los comandos: `\leq` no está en la
  // lista blanca, y con razón —`y \le x` es una región y este plugin no las dibuja—, pero
  // dentro de `{0 ≤ x ≤ 2π}` sí es notación soportada. Retirarla aquí es lo que permite que
  // el veto siga velando la región y deje pasar el intervalo. Lo que NO se entienda como
  // intervalo vuelve intacto de `sinRestricciones` y se vela como siempre.
  //
  // Y se retira SOLO donde la restricción significa algo. obs-derivate y obs-integral no la
  // soportan —la derivada de una función acotada y la relación entre el intervalo y los
  // límites de integración son otra cosa, no un matiz de esta—, así que ahí el `\leq` tiene
  // que seguir velando el bloque: sin este reparto, esos dos bloques dejarían de velarse y
  // enseñarían la restricción degradada por el barrido comodín (`*l*e*q`) como si fuera lo
  // que el autor escribió.
  const admiteRestriccion = !rasgos.derivada && !rasgos.integral;
  const noSoportados = comandosNoSoportados(
    admiteRestriccion ? sinRestricciones(source) : source
  );

  // Restricción sobre una variable que el bloque no tiene (`\sin x {0 ≤ t ≤ 3}`). El objeto se
  // ha construido VACÍO a propósito —ni se recorta por la variable que sea ni se ignora lo
  // escrito—, así que sin este velo el plano diría solo «no definida en ℝ», que es cierto pero
  // manda a buscar el error a los números del intervalo, que están bien. Va JUNTO al veto de
  // comandos porque es el mismo tipo de fallo: lo escrito no dice lo que el autor cree.
  if (admiteRestriccion) {
    // Intervalo que no se deja leer (`{0 ≤ x ≤ chorizo}`, `{}`). Va DELANTE del veto de
    // comandos porque los dos hablarían del mismo bloque y este dice la verdad: el veto
    // señalaría el `≤`, que dentro de las llaves está perfectamente soportado, y mandaría a
    // corregir lo único que estaba bien.
    const ilegible = restriccionIlegible(source);
    if (ilegible) return ilegible;
    const vacia = restriccionVacia(source);
    if (vacia) return vacia;
    const ajena = restriccionAjena(ecuaciones);
    if (ajena) return ajena;
  }
  if (noSoportados.length > 0) {
    return {
      etiqueta: noSoportados.length === 1 ? t().velo.simboloNoSoportado : t().velo.simbolosNoSoportados,
      detalle: t().velo.simboloDetalle(noSoportados.join(", ")),
    };
  }

  // Bloque obs-integral: sin integrando graficable (no se reconoció `\int_a^b f dx` o falta
  // un límite) → "Sin integral". Con integrando presente, se clasifica como una explícita
  // normal más abajo (0/0, √−1 sobre el INTEGRANDO → velo, Nivel 1); los fallos del VALOR
  // (divergente, límites no numéricos) NO oscurecen el plano: van al panel (Nivel 2).
  if (rasgos.integral && ecuaciones.length === 0) {
    // Se escribió una integral, pero su integrando no es una función de x (una ECUACIÓN:
    // `\int_0^1 (x²+y²−1)³=x²y³ dx`; ver `esIntegrandoValido`). Decirlo, y decir a dónde va
    // ese contenido: de una curva implícita no se integra nada, se GRAFICA (obs-graph).
    if (/\\int/.test(source)) {
      return { ...t().velo.integrandoNoValido };
    }
    return { ...t().velo.sinIntegral };
  }
  // Integral SIN valor: el integrando no toma valores reales (Nivel 1) o el número no existe
  // (Nivel 2: divergente, `\int_{-\infty}`, hueco del dominio). TODAS las etiquetas del bloque
  // salen aquí, sobre el plano: el panel LaTeX solo muestra la fórmula (ver montarPanelIntegral).
  if (rasgos.integral) {
    const etiqueta = etiquetaIntegral(source);
    if (etiqueta) return etiqueta;
  }

  // Bloque obs-system: un SISTEMA necesita ≥2 ecuaciones (y ≥2 incógnitas). Se
  // clasifica por número de ecuaciones; con 2+ no se clasifica (grafica normal).
  if (rasgos.sistema) {
    if (ecuaciones.length === 0) {
      return { ...t().velo.sinSistema };
    }
    if (ecuaciones.length === 1) {
      return { ...t().velo.sistemaIncompleto };
    }
    return null;
  }
  if (ecuaciones.length === 0) {
    return { ...t().velo.sinFuncion };
  }
  return degeneradaDeEcuacion(ecuaciones[0]);
}

/**
 * Clasificación formal de UNA ecuación explícita (`y=f(x)` o expresión suelta): la etiqueta
 * del velo (Indeterminada / Indefinida / No definida en ℝ), o null si es graficable o no es
 * una f(x). Extraída de `clasificarBloque` porque obs-derivate necesita clasificar la función
 * ESCRITA (no la derivada): `\frac{0}{0}` deriva a `0` y el bloque graficaba la recta y=0 con
 * su derivada "f'(x) = 0" — un resultado inventado sobre una función que no existe.
 */
export function degeneradaDeEcuacion(ec: string): FuncionDegenerada | null {
  // Función del parámetro (`x(t)=…`, o una expresión suelta en `t`): el motor la grafica como
  // explícita con la abscisa renombrada a x, así que se clasifica sobre ESA (compilar la `t`
  // contra `x` daría NaN en todo el eje → falso "Indeterminada" sobre una curva bien dibujada).
  const comp = funcionDelParametro(ec);
  if (comp) {
    const enX = renombrarParametroAX(insertarProductoImplicito(normalizarEntrada(comp.expr.trim())));
    try {
      return clasificarDegenerada(compilarFuncion(enX, "x"));
    } catch {
      return null;
    }
  }

  const partes = ec.split("=");
  let expr: string | null = null;
  if (partes.length === 1) expr = partes[0];
  else if (partes.length === 2) {
    if (normalizarEntrada(partes[0].trim()) === "y") expr = partes[1];
    else if (normalizarEntrada(partes[1].trim()) === "y") expr = partes[0];
  }
  if (expr === null) return null; // no es y=f(x): sin clasificación
  if (expr.trim() === "") {
    // "y=" a medio escribir: no es una indeterminación, aún no hay expresión.
    return { ...t().velo.sinFuncion };
  }
  try {
    // MISMA normalización que grafica el motor (`construirObjeto.norm`): incluye el
    // producto implícito. Sin él, `\pi(2x+4)` quedaba como `pi(2x+4)`, que mathjs lee
    // como LLAMADA a `pi` (no es función) → NaN en todo x → falso "Indeterminada".
    const norm = insertarProductoImplicito(normalizarEntrada(expr.trim()));
    // Expresión suelta con `y` libre: NO es f(x) — el motor la grafica como implícita
    // expr=0 (`construirObjeto`); compilarla solo con x daría NaN en todo el eje y un
    // falso "Indeterminada" sobre una curva bien dibujada.
    if (contieneYLibre(norm)) return null;
    const evalX = compilarFuncion(norm, "x");
    return clasificarDegenerada(evalX);
  } catch {
    return null; // no compila: el motor ya no dibuja nada; sin etiqueta formal
  }
}

/**
 * El velo de una restricción que acota una variable AJENA al bloque, o `null`.
 *
 * Quien decide si la variable es ajena es `construirObjeto` (marca `avisoRestriccion`), no
 * esta función: la regla de qué variable admite cada tipo —`t` en una paramétrica, `theta` en
 * una polar, y también `t` en una componente `y(t)=…` aunque se grafique en x— vive junto a
 * la clasificación, y una segunda copia aquí se desincronizaría con solo añadir un tipo.
 * Aquí solo se PONE EL TEXTO, que es lo que el modelo no puede saber.
 */
export function restriccionAjena(ecuaciones: readonly string[]): FuncionDegenerada | null {
  for (const ec of ecuaciones) {
    const r = separarRestriccion(ec).restriccion;
    if (!r) continue;
    let objeto;
    try { objeto = construirObjeto(ec, "aviso"); } catch { continue; }
    if (objeto.avisoRestriccion !== "variableAjena") continue;
    // La variable del bloque se nombra en singular y con la que el autor reconocerá: una
    // implícita se dibuja en dos, y decir «x o y» es más útil que elegir una.
    const propia = objeto.variables.join(" / ");
    return t().velo.restriccionAjena(r.variable, propia);
  }
  return null;
}

/**
 * El velo de un intervalo que no se deja leer, o `null`.
 *
 * Se mira el SOURCE línea a línea y no las ecuaciones ya repartidas: si el grupo no se
 * entiende, `separarRestriccion` devuelve la línea intacta y el intervalo sigue pegado a la
 * fórmula, así que a estas alturas ya no hay nada que separar aguas abajo.
 *
 * Sin este velo el fallo era MUDO en los dos casos que no dejan un `\comando` que vetar: el
 * comparador tecleado en Unicode y las llaves vacías. Un plano en blanco sin una palabra es lo
 * peor que puede hacer el bloque, porque no distingue «lo escribiste mal» de «aquí no hay
 * curva».
 */
export function restriccionIlegible(source: string): FuncionDegenerada | null {
  for (const linea of lineasDeEcuacion(source)) {
    const texto = separarRestriccion(linea).ilegible;
    if (texto) return t().velo.restriccionIlegible(texto);
  }
  return null;
}

/**
 * El velo de un intervalo que se lee bien pero **no contiene nada** (`{5 ≤ x ≤ 2}`), o `null`.
 *
 * Va aparte del ilegible porque el fallo es distinto y el consejo también: aquí la sintaxis
 * está bien y lo que falla son los extremos, casi siempre por haberlos escrito al revés. Se
 * dicen con las piezas TAL COMO SE ESCRIBIERON, igual que la coletilla del panel, para que el
 * autor reconozca sus propios números.
 *
 * Un intervalo de un solo punto (`{2 ≤ x ≤ 2}`) NO entra aquí: contiene algo, y que ese algo no
 * llene un píxel es problema del dibujo, no de lo escrito.
 */
export function restriccionVacia(source: string): FuncionDegenerada | null {
  for (const linea of lineasDeEcuacion(source)) {
    const r = separarRestriccion(linea).restriccion;
    if (!r || r.min <= r.max) continue;
    // Solo la forma ENCADENADA puede quedar vacía: acotada por un lado, el otro extremo es
    // infinito y el intervalo nunca se cierra sobre sí mismo. Así que las cotas escritas son la
    // primera pieza y la última, con la variable en medio, y el sentido dice cuál es cuál.
    const [izq, , der] = r.piezas;
    const [a, b] = r.signos[0] === "le" ? [izq, der] : [der, izq];
    return t().velo.restriccionVacia(r.variable, a, b);
  }
  return null;
}

/**
 * Expresión f(x) de un bloque obs-graph (la 1ª ecuación, si es explícita y=f(x)),
 * NORMALIZADA a sintaxis mathjs, o null si no aplica (sistema, vacío, implícita,
 * paramétrica…). Es la MISMA que grafica el motor, así que el resumen ⓘ coincide
 * con lo dibujado.
 */
export function exprExplicita(ecuaciones: readonly string[], sistema: boolean): string | null {
  if (sistema || ecuaciones.length === 0) return null;
  // Con una RESTRICCIÓN DE DOMINIO no hay resumen analítico. Este ⓘ describe la función
  // símbolicamente —raíces, vértices, periodicidad—, y esas cuentas se hacen sobre f entera:
  // en `\sin x {0 ≤ x ≤ 2π}` listaría raíces que no están dibujadas y llamaría periódica a
  // una curva que empieza y acaba. Callar es peor que ser útil, pero mucho mejor que
  // describir una curva que no es la del plano. (El ⓘ GEOMÉTRICO no pasa por aquí: sale de
  // la geometría ya trazada, que sí está recortada.)
  if (separarRestriccion(ecuaciones[0]).restriccion !== null) return null;
  // Solo las curvas EXPLÍCITAS (y=f(x) o expresión suelta) tienen un f(x) que
  // compilar. Las PARAMÉTRICAS `(X, Y)` (sin `=`, caían al caso "expresión suelta"),
  // implícitas y polares NO → null (el ⓘ geométrico las cubre). Sin este filtro,
  // `montarBotonInfo` compilaba la tupla como f(x) y `compilarFuncion` lanzaba
  // ("Parenthesis ) expected"), abortando el render del plano (bug de paramétricas).
  let tipo: string;
  try { tipo = construirObjeto(ecuaciones[0], "info").tipo; } catch { return null; }
  if (tipo !== "explicita") return null;
  // Función del parámetro. Con el valor en la ORDENADA (`y(t)=…`, o una expresión suelta en
  // `t`) el ⓘ vale tal cual: es la gráfica clásica, solo que la abscisa se llama `t` → se
  // analiza la MISMA f que grafica el motor (la renombrada t→x). Con el valor en la ABSCISA
  // (`x(t)=…`) la curva sale TUMBADA: las "raíces" y los "vértices" de f no son los del dibujo
  // (están en el otro eje) → sin ⓘ analítico, antes que describir una curva que no es esa.
  const comp = funcionDelParametro(ecuaciones[0]);
  if (comp) {
    if (comp.eje === "x") return null;
    const enX = renombrarParametroAX(insertarProductoImplicito(normalizarEntrada(comp.expr.trim())));
    return enX === "" ? null : enX;
  }
  const partes = ecuaciones[0].split("=");
  let expr: string | null = null;
  if (partes.length === 1) expr = partes[0];
  else if (partes.length === 2) {
    if (normalizarEntrada(partes[0].trim()) === "y") expr = partes[1];
    else if (normalizarEntrada(partes[1].trim()) === "y") expr = partes[0];
  }
  if (expr === null) return null;
  // MISMA normalización que grafica el motor (producto implícito incluido): el ⓘ
  // analiza EXACTAMENTE la f(x) dibujada (`\pi(2x+4)` → `pi*(2*x+4)`, no `pi(2x+4)`).
  const norm = insertarProductoImplicito(normalizarEntrada(expr.trim()));
  return norm === "" ? null : norm;
}
