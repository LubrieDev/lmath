// ─────────────────────────────────────────────
// puente · La frontera con mathjs, y el ÚNICO sitio donde viven los centinelas
// ─────────────────────────────────────────────
//
// Traduce entre el AST de mathjs (`Nodo`) y `Expresion`. Mientras dure la transición, el motor
// histórico sigue haciendo su trabajo debajo y el núcleo nuevo entra y sale por aquí.
//
// ── Por qué es un archivo y no una capa ──────────────────────────────────────────────────
// Todo lo que el núcleo nuevo no quiere saber está confinado en este archivo:
//
//   • los nombres `pm`, `mp`, `pm2`, `mp2`, `dom`, `fam` y `famN`, que son funciones falsas;
//   • la asociatividad binaria del árbol de mathjs;
//   • los paréntesis como nodo;
//   • y la única heurística de toda la frontera (ver `numeroDeConstante`).
//
// El día que el trazador consuma `Expresion` directamente, se borra la mitad de este archivo y no
// hay nada más que tocar en todo el proyecto. Esa es la diferencia entre una deuda contenida y
// una deuda repartida, y es exactamente lo que se acordó al autorizar que los centinelas
// sobrevivieran «solo como formato de compatibilidad hacia core/».
//
// ── Las dos direcciones NO son simétricas, y hay que decirlo ─────────────────────────────
//
//   deMathjs(aMathjs(e)) ≡ e     EXACTA y estructural. Es la que importa y la que se exige en la
//                                suite: lo que sale del núcleo y vuelve, vuelve idéntico.
//
//   aMathjs(deMathjs(n)) ≡ n     SEMÁNTICA, no estructural, y no puede ser otra cosa: el árbol
//                                de mathjs es binario y con paréntesis, el nuestro es n-ario y
//                                sin ellos, así que `(a+b)+c` y `a+(b+c)` colapsan al MISMO
//                                nodo. Que colapsen es la señal de que el núcleo tiene forma
//                                canónica y el de mathjs no.
//
// ── `null` es lo que hace reversible la migración ────────────────────────────────────────
// Las dos direcciones pueden devolver `null`, y significa «esto no lo sé representar». Quien
// llama sigue entonces por el camino de siempre. Gracias a eso el núcleo puede entrar cubriendo
// una parte de los casos sin romper el resto, y la cobertura se MIDE (cuántos casos del corpus
// cruzan el puente) en vez de suponerse.

import {
  type Nodo, constNodo, funcNodo, opNodo, simboloNodo,
} from "../../expr/nodo";
import {
  type Condicion, type Expresion, type NombreConstante,
  aplicacion, condicionado, constante, entero, familia, literal, opuesto, potencia,
  producto, rama, simbolo, suma,
} from "../nucleo/expresion";
import {
  type Numero, aproximar, desdeTexto, enteroDe, esEnteroN, numFlotante, signoN,
} from "../nucleo/numero";
import { conocida, fichaDe } from "../registro/catalogo";
import { iguales } from "../nucleo/igualdad";
import { formaCerrada } from "../numeros/forma";
import { rac } from "../../math/racional";
// `ParenthesisNode` se importa AQUÍ y solo aquí: es el único nodo de mathjs que el núcleo no
// tiene (los paréntesis son del impresor) y que la serialización a cadena todavía necesita.
import { ParenthesisNode } from "mathjs";

// ─────────────────────────────────────────────
// Los centinelas: su tabla, y solo aquí
// ─────────────────────────────────────────────

/** Centinelas de doble signo: nombre → (eje, signo de la PRIMERA alternativa). `pm` y `mp`
 *  comparten eje y difieren en cuál de las dos ramas es la positiva; por eso son el mismo
 *  constructor `Rama` con las alternativas en distinto orden, y no dos casos. */
const CENTINELAS_RAMA: Readonly<Record<string, { eje: number; invertido: boolean }>> = {
  pm: { eje: 0, invertido: false },
  mp: { eje: 0, invertido: true },
  pm2: { eje: 1, invertido: false },
  mp2: { eje: 1, invertido: true },
};

const CENTINELA_DOMINIO = "dom";
const CENTINELAS_FAMILIA: Readonly<Record<string, "enteros" | "naturales">> = {
  fam: "enteros",
  famN: "naturales",
};

const CONSTANTES: readonly NombreConstante[] = ["pi", "e", "tau", "phi"];
const esConstanteConNombre = (n: string): n is NombreConstante =>
  (CONSTANTES as readonly string[]).includes(n);

// ─────────────────────────────────────────────
// mathjs → Expresion
// ─────────────────────────────────────────────

/**
 * LA ÚNICA HEURÍSTICA DE TODO EL PUENTE, y está aquí porque este es el sitio sucio: el borde con
 * un mundo que ya ha perdido información.
 *
 * Un `ConstantNode` de mathjs es un `double`, y no dice de dónde viene. Si lo escribió una
 * persona (`0.5`, `2.5`, `0.125`) es un racional exacto y hay que conservarlo como tal. Si lo
 * produjo `rationalize` al decimalizar un irracional (`1.4142135623730951`), llamarlo exacto
 * sería convertir una aproximación en un valor exacto, que es justo lo que el motor tiene
 * prohibido hacer.
 *
 * Se separan por el número de cifras significativas, que es lo único observable: los decimales
 * que la gente escribe tienen unas pocas; la expansión de un irracional en doble precisión tiene
 * diecisiete. El umbral es generoso a propósito —marcar de más solo hace que algo exacto viaje
 * como flotante, que es conservador; marcar de menos fabricaría exactitud falsa—.
 *
 * Es una heurística, se llama heurística, y vive en la frontera. La torre numérica no la conoce.
 */
const CIFRAS_DE_LO_ESCRITO = 12;

function numeroDeConstante(valor: number): Numero {
  if (!Number.isFinite(valor)) return numFlotante(valor);
  if (Number.isInteger(valor) && Math.abs(valor) <= Number.MAX_SAFE_INTEGER) {
    return desdeTexto(String(valor));
  }
  const texto = String(valor);
  if (/e/i.test(texto)) return numFlotante(valor);           // notación científica: no es escritura
  const cifras = texto.replace(/[-.]/g, "").replace(/^0+/, "").length;
  return cifras > CIFRAS_DE_LO_ESCRITO ? numFlotante(valor) : desdeTexto(texto);
}

/** El nodo sin sus paréntesis: en el núcleo no existen. */
function desParen(n: Nodo): Nodo {
  return n.type === "ParenthesisNode" ? desParen(n.content) : n;
}

/** ¿Es un `ConstantNode` (quizá entre paréntesis)? Devuelve su valor o null. */
function valorConstante(n: Nodo): number | null {
  const d = desParen(n);
  return d.type === "ConstantNode" && typeof d.value === "number" ? d.value : null;
}

/**
 * Un cociente de dos literales ENTEROS es un racional, no una división.
 *
 * En el núcleo no hay ningún nodo «división de dos enteros»: `1/2` es el número un medio. Sin
 * este plegado, `aMathjs(literal(1/2))` produciría `1/2` y `deMathjs` lo devolvería como un
 * producto por una potencia de exponente −1, y el viaje de ida y vuelta —que es la garantía
 * fuerte del puente— dejaría de ser exacto.
 */
function racionalDeCociente(a: Nodo, b: Nodo): Expresion | null {
  const na = valorConstante(a), nb = valorConstante(b);
  if (na === null || nb === null) return null;
  if (!Number.isInteger(na) || !Number.isInteger(nb) || nb === 0) return null;
  if (Math.abs(na) > Number.MAX_SAFE_INTEGER || Math.abs(nb) > Number.MAX_SAFE_INTEGER) return null;
  return literal({ clase: "racional", valor: rac(BigInt(na), BigInt(nb)) });
}

function operadorAExpresion(n: Nodo): Expresion | null {
  const args = n.args ?? [];
  const hijos = args.map(deMathjs);
  if (hijos.some((h) => h === null)) return null;
  const es = hijos as Expresion[];

  switch (n.op) {
    case "+":
      return es.length === 1 ? es[0] : suma(es);
    case "-":
      if (es.length === 1) return opuesto(es[0]);
      return es.length === 2 ? suma([es[0], opuesto(es[1])]) : null;
    case "*":
      return producto(es);
    case "/": {
      if (es.length !== 2) return null;
      const exacto = racionalDeCociente(args[0], args[1]);
      if (exacto !== null) return exacto;
      return producto([es[0], potencia(es[1], entero(-1))]);
    }
    case "^":
      return es.length === 2 ? potencia(es[0], es[1]) : null;
    default:
      // Comparaciones, módulo, factorial postfijo…: el núcleo no los modela todavía, y decirlo
      // es mejor que traducirlos a algo parecido.
      return null;
  }
}

function funcionAExpresion(n: Nodo): Expresion | null {
  const nombre = n.fn?.name ?? "";
  const args = n.args ?? [];

  // ── Centinelas: aquí es donde dejan de existir ──
  const marcaRama = CENTINELAS_RAMA[nombre];
  if (marcaRama !== undefined) {
    if (args.length !== 1) return null;
    const u = deMathjs(args[0]);
    if (u === null) return null;
    const positiva = u, negativa = opuesto(u);
    return rama(
      marcaRama.eje,
      marcaRama.invertido ? [negativa, positiva] : [positiva, negativa]
    );
  }

  if (nombre === CENTINELA_DOMINIO) {
    // `dom(cuerpo, R)` significa «cuerpo, donde R ≥ 0».
    if (args.length !== 2) return null;
    const cuerpo = deMathjs(args[0]), guarda = deMathjs(args[1]);
    if (cuerpo === null || guarda === null) return null;
    return condicionado(cuerpo, { tipo: "noNegativo", expr: guarda });
  }

  const conjunto = CENTINELAS_FAMILIA[nombre];
  if (conjunto !== undefined) {
    if (args.length !== 2) return null;
    const param = desParen(args[0]);
    if (param.type !== "SymbolNode") return null;
    const paso = deMathjs(args[1]);
    if (paso === null) return null;
    return familia(param.name, conjunto, paso);
  }

  // ── Funciones de verdad, las del catálogo ──
  const hijos = args.map(deMathjs);
  if (hijos.some((h) => h === null)) return null;
  const es = hijos as Expresion[];

  // El logaritmo se lleva a su forma canónica ÚNICA, con la base siempre escrita.
  if (nombre === "log" && es.length === 1) return aplicacion("log", [es[0], constante("e")]);
  if (nombre === "ln") return es.length === 1 ? aplicacion("log", [es[0], constante("e")]) : null;
  if (nombre === "log10" && es.length === 1) return aplicacion("log", [es[0], entero(10)]);
  if (nombre === "log2" && es.length === 1) return aplicacion("log", [es[0], entero(2)]);
  // `pow(a,b)` es una potencia, no una aplicación: en el núcleo hay un constructor para eso.
  if (nombre === "pow") return es.length === 2 ? potencia(es[0], es[1]) : null;

  const ficha = fichaDe(nombre);
  if (ficha === null) return null;
  if (ficha.aridad !== null && ficha.aridad !== es.length) return null;
  return aplicacion(ficha.id, es);
}

/**
 * AST de mathjs → `Expresion`, o `null` si hay algo que el núcleo todavía no modela.
 *
 * `null` no es un fallo: es la frontera de lo representable, dicha en voz alta. Quien llama se
 * queda con el camino de siempre, y por eso esta etapa no puede romper nada.
 */
export function deMathjs(n: Nodo): Expresion | null {
  switch (n.type) {
    case "ConstantNode":
      return typeof n.value === "number" ? literal(numeroDeConstante(n.value)) : null;
    case "SymbolNode":
      return esConstanteConNombre(n.name) ? constante(n.name) : simbolo(n.name);
    case "ParenthesisNode":
      return deMathjs(n.content);
    case "OperatorNode":
      return operadorAExpresion(n);
    case "FunctionNode":
      return funcionAExpresion(n);
    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// Expresion → mathjs
// ─────────────────────────────────────────────

/** Un literal como nodo de mathjs. Un racional no entero sale como cociente de dos enteros y NO
 *  como su decimal: decimalizarlo aquí sería tirar por la ventana toda la exactitud que el
 *  núcleo se ha molestado en conservar. */
function literalANodo(numero: Numero): Nodo | null {
  if (numero.clase === "flotante") return constNodo(numero.valor);
  if (numero.clase === "algebraico") {
    // Un algebraico solo puede cruzar al formato viejo si tiene FORMA CERRADA: mathjs no tiene
    // dónde guardar «la raíz de este polinomio en este intervalo». Cuando la tiene sale como el
    // radical que es (`nthRoot(2, 3)`), y cuando no, se declara inexpresable en vez de mandar su
    // decimal —que es precisamente lo que esta reforma vino a impedir—.
    const forma = formaCerrada(numero.valor);
    return forma === null ? null : aMathjs(forma);
  }
  const { n, d } = numero.valor;
  const cabe = (v: bigint): boolean =>
    v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER);
  if (!cabe(n) || !cabe(d)) return null;   // un entero enorme no cabe en un `double`: se dice
  if (d === 1n) return constNodo(Number(n));
  return opNodo("/", "divide", [constNodo(Number(n)), constNodo(Number(d))]);
}

/** La expresión de una condición que `dom` sabe expresar, o null. `dom(cuerpo, R)` solo puede
 *  decir «R ≥ 0»; las demás condiciones no tienen forma en el motor viejo, y decirlo es mejor
 *  que aplastarlas a la que más se le parezca. */
function condicionANodo(c: Condicion): Nodo | null {
  return c.tipo === "noNegativo" ? aMathjs(c.expr) : null;
}

/**
 * `Expresion` → AST de mathjs, o `null` si el formato viejo no sabe expresarlo.
 *
 * Que pueda devolver `null` es deliberado y es más honesto que una función total: una `Rama`
 * cuyas dos alternativas no sean opuestas, o un `Condicionado` con una condición que no sea
 * «≥ 0», no tienen representación con los centinelas. Fabricar una aproximada sería introducir
 * en el motor de dibujo una curva que nadie ha pedido.
 */
export function aMathjs(e: Expresion): Nodo | null {
  switch (e.clase) {
    case "literal":
      return literalANodo(e.numero);
    case "simbolo":
      return simboloNodo(e.nombre);
    case "constante":
      return simboloNodo(e.nombre);
    case "potencia": {
      const b = aMathjs(e.base), x = aMathjs(e.exponente);
      return b && x ? opNodo("^", "pow", [protegerBase(e.base, b), x]) : null;
    }
    case "producto": {
      if (e.factores.length === 0) return constNodo(1);
      const ns = e.factores.map(aMathjs);
      if (ns.some((n) => n === null)) return null;
      return (ns as Nodo[]).reduce((a, b) => opNodo("*", "multiply", [a, b]));
    }
    case "suma": {
      if (e.sumandos.length === 0) return constNodo(0);
      const ns = e.sumandos.map(aMathjs);
      if (ns.some((n) => n === null)) return null;
      return (ns as Nodo[]).reduce((a, b) => opNodo("+", "add", [a, b]));
    }
    case "aplicacion": {
      const ns = e.args.map(aMathjs);
      if (ns.some((n) => n === null)) return null;
      return funcNodo(simboloNodo(e.funcion), ns as Nodo[]);
    }
    case "rama": {
      // Solo hay centinela si las dos alternativas son opuestas. `pm` cuando la primera es la
      // positiva, `mp` cuando lo es la segunda: el mismo dato, leído por el nombre que le toca.
      const [a, b] = e.alternativas;
      const nombre = nombreDeRama(e.eje, a, b);
      if (nombre === null) return null;
      const cuerpo = aMathjs(nombre.cuerpo);
      return cuerpo ? funcNodo(simboloNodo(nombre.centinela), [cuerpo]) : null;
    }
    case "condicionado": {
      const cuerpo = aMathjs(e.cuerpo), guarda = condicionANodo(e.condicion);
      return cuerpo && guarda
        ? funcNodo(simboloNodo(CENTINELA_DOMINIO), [cuerpo, guarda])
        : null;
    }
    case "familia": {
      const paso = aMathjs(e.paso);
      if (!paso) return null;
      const centinela = e.conjunto === "naturales" ? "famN" : "fam";
      return funcNodo(simboloNodo(centinela), [simboloNodo(e.parametro), paso]);
    }
  }
}

/**
 * Parentetiza la base de una potencia cuando escribirla desnuda cambiaría lo que significa.
 *
 * En mathjs el `^` liga MÁS fuerte que el menos: `-1 ^ 0` se lee `-(1^0)` = −1, no `(−1)^0` = 1.
 * Y esto no es una manía tipográfica, porque el motor histórico intercambia sus expresiones como
 * CADENAS: un árbol que `toString()` no devuelve tal cual es un árbol que, al primer viaje por
 * el pipeline viejo, se convierte en otra función. Lo encontró la ley de conservación del valor
 * de `normal.test.ts`, con el testigo `(−1)^0`.
 *
 * La regla es deliberadamente amplia —se protege todo lo que no sea un átomo inequívoco— porque
 * la lista de construcciones peligrosas (`-1^2`, `-1*x^2`…) es más fácil de equivocar que de
 * cubrir de más: un paréntesis sobrante no cambia nada y uno que falta cambia la curva.
 */
function protegerBase(base: Expresion, nodo: Nodo): Nodo {
  const seguro =
    base.clase === "simbolo" ||
    base.clase === "constante" ||
    (base.clase === "literal" && signoN(base.numero) >= 0 && esEnteroN(base.numero));
  return seguro ? nodo : (new ParenthesisNode(nodo as never) as unknown as Nodo);
}

/** Qué centinela le corresponde a una rama, y sobre qué cuerpo, o `null` si no le corresponde
 *  ninguno porque sus alternativas no son opuestas. */
function nombreDeRama(
  eje: number, a: Expresion, b: Expresion
): { centinela: string; cuerpo: Expresion } | null {
  const sufijo = eje === 0 ? "" : eje === 1 ? "2" : null;
  if (sufijo === null) return null;                 // el motor viejo solo tiene dos ejes
  if (esOpuestoDe(b, a)) return { centinela: `pm${sufijo}`, cuerpo: a };
  if (esOpuestoDe(a, b)) return { centinela: `mp${sufijo}`, cuerpo: b };
  return null;
}

/** ¿Es `u` el opuesto ESTRUCTURAL de `v`? Se compara por hash y estructura (nunca solo por
 *  hash), reconociendo las dos escrituras que produce el núcleo: `(−1)·v` y el literal negado. */
function esOpuestoDe(u: Expresion, v: Expresion): boolean {
  if (u.clase === "literal" && v.clase === "literal") {
    return signoN(u.numero) === -signoN(v.numero) && aproximar(u.numero) === -aproximar(v.numero);
  }
  if (u.clase !== "producto") return false;
  const [primero, ...resto] = u.factores;
  if (primero === undefined || primero.clase !== "literal") return false;
  if (enteroDe(primero.numero) !== -1n) return false;
  const cuerpo = resto.length === 1 ? resto[0] : producto(resto);
  return iguales(cuerpo, v);
}

/** ¿Conoce el puente esta función de mathjs? Lo usan las medidas de cobertura. */
export const funcionSoportada = (nombre: string): boolean =>
  conocida(nombre) || nombre in CENTINELAS_RAMA || nombre in CENTINELAS_FAMILIA ||
  nombre === CENTINELA_DOMINIO || ["log", "ln", "log10", "log2", "pow"].includes(nombre);
