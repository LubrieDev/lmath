// ─────────────────────────────────────────────
// io/leer · El analizador: de los tokens a `Expresion` (PURO)
// ─────────────────────────────────────────────
//
// La segunda mitad del lector propio. Análisis por PRECEDENCIAS (descenso recursivo), que es la
// forma estándar de leer notación matemática y la que hace que la gramática esté escrita en un
// sitio en vez de repartida entre 49 reescrituras de texto cuyo orden importa sin que nada lo
// diga.
//
// ── Qué gana el motor con esto ───────────────────────────────────────────────────────────
// Sale una `Expresion` DIRECTAMENTE. Hoy el camino es
//
//     texto → 49 regex → cadena mathjs → parse → árbol de mathjs → deMathjs → Expresion
//
// con dos representaciones intermedias y una cadena de por medio. Aquí es texto → Expresion.
// Eso es lo que corta la arista más grande del grafo de dependencias del proyecto (39
// importaciones del CAS al parser, con 27 llamadas a `normalizarEntrada` repartidas por sus
// etapas) y lo que permite que las etapas siguientes reciban expresiones y no cadenas.
//
// ── Estado: NO está en producción ────────────────────────────────────────────────────────
// Se construye al lado y se compara contra el lector histórico sobre todo el corpus
// (`tests/modules/lector.test.ts`). Mientras haya una sola divergencia, el que lee de verdad
// sigue siendo el de siempre. Cambiar quién lee las notas de la gente es de las cosas más
// arriesgadas que se pueden hacer en este plugin —una nota que dibujaba una curva pasaría a
// dibujar otra— y no se hace con una suite verde: se hace con la divergencia en cero.
//
// ── Las convenciones son las MEDIDAS, no las razonables ──────────────────────────────────
// `\sin 2x` es `sin(2x)` y `\sin x^2` es `(sin x)^2`. No es lo que uno escribiría de cero, pero
// es lo que el motor hace hoy, y el objetivo de esta etapa es leer igual, no leer mejor.

import {
  type Expresion, UNO_E, aplicacion, cociente, constante, entero, literal,
  opuesto, potencia, producto, rama, resta, simbolo, suma,
} from "../../nucleo/expresion";
import { type Racional } from "../../../math/racional";
import { desdeTexto } from "../../nucleo/numero";
import { normalizar } from "../../normal/canonica";
import { conocida } from "../../registro/catalogo";
import { type Token, tokenizar } from "./lexico";
import {
  ALIAS_PLANOS, COMANDOS_IGNORADOS, CONSTANTE_POR_NOMBRE, FUNCION_POR_COMANDO,
  GRADO, GRADOS_POR_COMANDO, GRIEGAS, INVERSA_DE, OPERADOR_POR_COMANDO, TRIG_DIRECTAS,
} from "./notacion";

/** Marca interna del logaritmo natural: `\ln u` es `log(u, e)`. */
const LN = "__ln";

/** Comandos que CIERRAN algo. Nunca empiezan un factor: sin esta lista, el producto implícito
 *  se tragaba el `floor` de `\lfloor xfloor` como si fuera un símbolo más. */
const CIERRES = ["rfloor", "rceil", "rvert", "rVert", "right", "|"];

/** Comandos cuya llave contiene un NOMBRE, no una expresión: `\operatorname{arccot}`. */
const ENVOLTURAS_DE_NOMBRE = ["operatorname", "mathrm", "mathit", "text", "textrm"];

/** El factor que convierte un grado en radianes. Se construye una vez. */
const ENGRADOS: Expresion = cociente(constante("pi"), entero(180));

/**
 * El valor racional de una expresión, si lo tiene. `{1/3}` no llega como el literal 1/3 sino
 * como el producto `1 · 3⁻¹`, así que hay que plegarlo, y quien sabe plegar aritmética exacta
 * es el normalizador: preguntárselo a él en vez de repetir aquí la aritmética es lo que evita
 * que el lector tenga su propia versión —y su propia deriva— de una operación que ya existe.
 * `null` cuando no es un número, que incluye todo lo que lleve un símbolo dentro.
 */
function racionalDe(e: Expresion): Racional | null {
  const n = normalizar(e);
  return n.clase === "literal" && n.numero.clase === "racional" ? n.numero.valor : null;
}

/** ¿Es un número, sin ningún símbolo, constante ni función dentro? Es la pregunta que decide si
 *  el argumento de una trigonométrica está en grados. Se contesta por la ESTRUCTURA y no por
 *  una forma concreta: `45`, `−45`, `45/2` y `(45)/(2)` son el mismo caso y ninguno necesita su
 *  propia rama. */
function esNumeroPuro(e: Expresion): boolean {
  switch (e.clase) {
    case "literal": return true;
    case "suma": return e.sumandos.every(esNumeroPuro);
    case "producto": return e.factores.every(esNumeroPuro);
    case "potencia": return esNumeroPuro(e.base) && esNumeroPuro(e.exponente);
    default: return false;
  }
}

export class ErrorDeLectura extends Error {
  constructor(mensaje: string, readonly posicion: number) {
    super(`${mensaje} (columna ${posicion + 1})`);
    this.name = "ErrorDeLectura";
  }
}

class Analizador {
  private i = 0;
  /** Barras de valor absoluto abiertas. Ver `empiezaFactor`. */
  private barrasAbiertas = 0;
  constructor(private readonly ts: readonly Token[]) {}

  private get act(): Token { return this.ts[this.i]; }
  private avanzar(): Token { return this.ts[this.i++]; }
  private es(tipo: Token["tipo"], texto?: string): boolean {
    const t = this.act;
    return t.tipo === tipo && (texto === undefined || t.texto === texto);
  }
  private comer(tipo: Token["tipo"], texto?: string): boolean {
    if (!this.es(tipo, texto)) return false;
    this.i++;
    return true;
  }
  private exigir(tipo: Token["tipo"], texto?: string): Token {
    if (!this.es(tipo, texto)) {
      throw new ErrorDeLectura(`se esperaba ${texto ?? tipo} y hay «${this.act.texto}»`, this.act.desde);
    }
    return this.avanzar();
  }

  /** ¿Toca un cierre ahora mismo? Va en un método porque `act` es un captador y TypeScript no
   *  puede saber que una llamada intermedia movió el cursor: leerlo en línea deja un estrechado
   *  de tipo caducado y el compilador declara imposible una comparación que sí puede darse. */
  private cierraAhora(): boolean { return this.ts[this.i].tipo === "cierra"; }

  /** Los comandos que no significan nada se saltan aquí, en un solo sitio. */
  private saltarRuido(): void {
    while (this.act.tipo === "comando" && COMANDOS_IGNORADOS.includes(this.act.texto)) this.i++;
  }

  // ── Niveles de precedencia ─────────────────────────────────────────────────

  /** El nivel más externo que este lector maneja: una suma. Las comparaciones (`=`, `≤`) las
   *  parte quien llama, porque una ecuación no es una expresión. */
  analizarExpresion(): Expresion {
    return this.analizarSuma();
  }

  private analizarSuma(): Expresion {
    let izq = this.analizarProducto();
    for (;;) {
      this.saltarRuido();
      if (this.comer("operador", "+")) izq = suma([izq, this.analizarProducto()]);
      else if (this.comer("operador", "-")) izq = resta(izq, this.analizarProducto());
      else return izq;
    }
  }

  private analizarProducto(): Expresion {
    let izq = this.factor();
    for (;;) {
      this.saltarRuido();
      if (this.comer("operador", "*")) { izq = producto([izq, this.factor()]); continue; }
      if (this.comer("operador", "/")) { izq = cociente(izq, this.factor()); continue; }
      // Operadores escritos como comando: `\cdot`, `\times`, `\div`, `\ast`.
      const comoOperador = this.act.tipo === "comando" ? OPERADOR_POR_COMANDO[this.act.texto] : undefined;
      if (comoOperador === "*") { this.avanzar(); izq = producto([izq, this.factor()]); continue; }
      if (comoOperador === "/") { this.avanzar(); izq = cociente(izq, this.factor()); continue; }
      // Producto IMPLÍCITO: no hay operador, pero lo que viene puede empezar un factor.
      // Es la regla que en el motor de hoy vive en `insertarProductoImplicito`, un paso aparte
      // sobre la cadena; aquí es una decisión del analizador, que es donde se puede tomar
      // sabiendo qué se acaba de leer.
      if (this.empiezaFactor()) { izq = producto([izq, this.factor()]); continue; }
      return izq;
    }
  }

  /**
   * Un factor con sus GRADOS, si los lleva. `°`, `\degree` y `\deg` son un operador pospuesto
   * que multiplica por π/180: `30°` es 30·π/180.
   *
   * Va en el nivel del PRODUCTO y no en el de la potencia, y eso importa: `x^2°` es `(x²)·π/180`
   * y no `x^(2·π/180)`. Es donde lo pone el lector histórico —que inserta el texto `*(pi/180)`,
   * con la precedencia del producto— y donde lo pondría uno de cero, porque el grado califica al
   * número ya formado.
   */
  private factor(): Expresion {
    let e = this.analizarUnario();
    for (;;) {
      this.saltarRuido();
      if (this.comer("operador", GRADO)) { e = producto([e, ENGRADOS]); continue; }
      if (this.act.tipo === "comando" && GRADOS_POR_COMANDO.includes(this.act.texto)) {
        this.avanzar();
        e = producto([e, ENGRADOS]);
        continue;
      }
      return e;
    }
  }

  /** ¿El token actual puede empezar un factor? Es lo que decide el producto implícito. */
  private empiezaFactor(): boolean {
    const t = this.act;
    // Dentro de un `|…|`, una barra CIERRA: no puede empezar un factor. Sin esta cuenta, `|x|`
    // se leía como `x` por un valor absoluto abierto que nunca se cerraba —la barra de cierre
    // se tomaba por el comienzo de otro—, y `a|b|c` no se leía en absoluto.
    if (t.tipo === "barra") return this.barrasAbiertas === 0;
    if (t.tipo === "numero" || t.tipo === "nombre") return true;
    if (t.tipo === "abre") return t.texto === "(" || t.texto === "[";
    if (t.tipo === "comando") {
      if (COMANDOS_IGNORADOS.includes(t.texto) || CIERRES.includes(t.texto)) return false;
      return OPERADOR_POR_COMANDO[t.texto] === undefined;
    }
    return false;
  }

  private analizarUnario(): Expresion {
    this.saltarRuido();
    if (this.comer("operador", "-")) return opuesto(this.analizarUnario());
    if (this.comer("operador", "+")) return this.analizarUnario();
    if (this.act.tipo === "comando" && (this.act.texto === "pm" || this.act.texto === "mp")) {
      const mp = this.avanzar().texto === "mp";
      const u = this.analizarUnario();
      // `Rama`, no un centinela: `alternativas[0]` es el valor con el eje en +, `[1]` con el −.
      // `pm(u)` y `mp(u)` son el MISMO constructor con las alternativas al revés.
      return mp ? rama(0, [opuesto(u), u]) : rama(0, [u, opuesto(u)]);
    }
    return this.analizarPotencia();
  }

  /** `^` es asociativo por la DERECHA y su exponente admite signo: `2^-1`, `x^{2}`. */
  private analizarPotencia(): Expresion {
    const base = this.analizarAtomo();
    this.saltarRuido();
    if (!this.comer("operador", "^")) return base;
    return this.elevar(base, this.analizarUnario());
  }

  /**
   * `base ^ exponente`, con una excepción: un exponente racional `p/q` de denominador IMPAR
   * —o par mayor que dos— se lee como la raíz q-ésima real, `nthRoot(base^p, q)`.
   *
   * No es cosmética. `x^(1/3)` evaluado como potencia es NaN en todo x < 0, mientras que la
   * raíz cúbica real vale −2 en x = −8: son funciones DISTINTAS, y la que quiere quien escribe
   * `x^{1/3}` es la segunda. El lector histórico ya toma esa decisión y esta la reproduce.
   *
   * El denominador 2 se deja fuera a propósito: ahí la potencia y la raíz ya son la misma
   * función —las dos son NaN en los negativos— y unificarlas es trabajo del normalizador, que
   * puede hacerlo sin condiciones. Meterlo aquí sería decidir dos veces lo mismo.
   */
  private elevar(base: Expresion, exponente: Expresion): Expresion {
    const r = racionalDe(exponente);
    if (r !== null && r.n > 0n && r.d >= 3n) {
      const radicando = r.n === 1n ? base : potencia(base, entero(r.n));
      return aplicacion("nthRoot", [radicando, entero(r.d)]);
    }
    return potencia(base, exponente);
  }

  // ── Átomos ─────────────────────────────────────────────────────────────────

  private analizarAtomo(): Expresion {
    this.saltarRuido();
    const t = this.act;

    if (t.tipo === "numero") { this.avanzar(); return literal(desdeTexto(t.texto)); }

    if (t.tipo === "abre") {
      this.avanzar();
      // Grupo VACÍO: `x^{}` es un exponente a medio escribir. Se devuelve el neutro, que al
      // elevar deja la base intacta, que es lo que hace el motor de hoy.
      if (this.cierraAhora()) { this.avanzar(); return UNO_E; }
      const dentro = this.analizarSuma();
      // Se acepta cualquier cierre: `{x}` y `(x)` son el mismo agrupamiento, y el LaTeX del
      // usuario mezcla los dos sin que eso cambie nada de lo que significa.
      if (this.cierraAhora()) this.avanzar();
      return dentro;
    }

    if (t.tipo === "barra") {
      this.avanzar();
      this.barrasAbiertas++;
      const dentro = this.analizarSuma();
      this.barrasAbiertas--;
      this.exigir("barra");
      return aplicacion("abs", [dentro]);
    }

    if (t.tipo === "nombre") return this.analizarNombre();
    if (t.tipo === "comando") return this.analizarComando();

    throw new ErrorDeLectura(`no se esperaba «${t.texto}»`, t.desde);
  }

  /**
   * Un nombre escrito sin barra. Se toma la RACHA de letras pegadas y se busca el nombre más
   * largo que sea una función del catálogo o una constante; lo que no lo sea se parte letra a
   * letra, que es lo que hace que `xy` sea un producto y `sin` no.
   *
   * El catálogo es la única fuente de qué nombres son funciones: no hay ninguna lista paralela
   * que mantener, y añadir una función al catálogo la hace escribible aquí sin tocar nada.
   */
  private analizarNombre(): Expresion {
    const desde = this.ts[this.i].desde;

    // Se MIRA la racha de letras sin consumirla, se decide el nombre más largo que sea conocido,
    // y solo se consumen ESAS letras.
    //
    // Consumir la racha entera de golpe —que era lo primero que hice— rompe las funciones sin
    // paréntesis: en `sin x` el analizador se comía las cuatro letras y luego `sin` se quedaba
    // sin argumento que leer, porque su argumento ya estaba consumido. Es la clase de fallo que
    // solo aparece al probar, y por eso se prueba contra el lector de siempre y no contra lo que
    // a uno le parece.
    let n = 0;
    while (this.ts[this.i + n].tipo === "nombre") n++;
    if (n === 0) throw new ErrorDeLectura("se esperaba un nombre", desde);

    // Nombre de una sola pieza (viene de una griega Unicode o de un comando).
    if (n === 1 && this.ts[this.i].texto.length > 1) {
      return this.nombreSuelto(this.avanzar().texto, desde);
    }

    let largo = 0;
    let nombre = "";
    for (let k = n; k >= 1; k--) {
      let cand = "";
      for (let j = 0; j < k; j++) cand += this.ts[this.i + j].texto;
      if (this.esNombreConocido(cand)) { largo = k; nombre = cand; break; }
    }
    if (largo === 0) { nombre = this.ts[this.i].texto; largo = 1; }
    for (let j = 0; j < largo; j++) this.avanzar();
    return this.nombreSuelto(nombre, desde);
  }

  private esNombreConocido(n: string): boolean {
    return conocida(n) || ALIAS_PLANOS[n] !== undefined
      || CONSTANTE_POR_NOMBRE[n] !== undefined || GRIEGAS.includes(n) || n === "log"
      || n === "pm" || n === "mp" || n === "pm2" || n === "mp2";
  }

  /** Un nombre ya resuelto: constante, rama, función (con su argumento) o símbolo. */
  private nombreSuelto(nombre: string, desde: number): Expresion {
    const cte = CONSTANTE_POR_NOMBRE[nombre];
    if (cte !== undefined) return constante(cte);

    // `pm(u)` / `mp(u)` / `pm2` / `mp2` escritos como una llamada. Es la ORTOGRAFÍA de
    // compatibilidad del doble signo: el motor de hoy la emite al despejar, y por tanto acaba
    // pegada en notas de gente que copió el resultado del panel. Se lee como lo que significa
    // —una `Rama`—, no como una función: el núcleo no tiene centinelas y este lector tampoco
    // los introduce, solo reconoce cómo se escribieron.
    const eje = nombre === "pm" || nombre === "mp" ? 0 : nombre === "pm2" || nombre === "mp2" ? 1 : -1;
    if (eje >= 0) {
      const u = this.argumentosDeFuncion(desde)[0];
      const invertida = nombre === "mp" || nombre === "mp2";
      return invertida ? rama(eje, [opuesto(u), u]) : rama(eje, [u, opuesto(u)]);
    }

    const id = ALIAS_PLANOS[nombre] ?? nombre;
    if (id === LN) return this.aplicarFuncion(LN, desde);
    if (nombre === "log") return this.aplicarFuncion("log", desde);
    if (conocida(id)) return this.aplicarFuncion(id, desde);

    return simbolo(nombre);
  }

  private analizarComando(): Expresion {
    const t = this.avanzar();
    const c = t.texto;

    // `\operatorname{arccot}`, `\mathrm{sen}`, `\text{…}`: la envoltura es tipográfica, pero lo
    // de DENTRO es un nombre y hay que leerlo como tal. Tratarlo como un grupo cualquiera
    // partiría `arccot` en seis símbolos, que es lo que pasaba.
    if (ENVOLTURAS_DE_NOMBRE.includes(c)) {
      const nombre = this.nombreEntreLlaves();
      return nombre === null ? this.analizarAtomo() : this.nombreSuelto(nombre, t.desde);
    }
    if (COMANDOS_IGNORADOS.includes(c)) return this.analizarAtomo();

    if (c === "infty") return simbolo("Infinity");
    if (c === "lvert" || c === "rvert" || c === "vert" || c === "|") {
      const dentro = this.analizarSuma();
      if (this.act.tipo === "comando"
        && (this.act.texto === "rvert" || this.act.texto === "vert" || this.act.texto === "|")) {
        this.avanzar();
      } else this.comer("barra");
      return aplicacion("abs", [dentro]);
    }

    if (c === "frac" || c === "dfrac" || c === "tfrac") {
      return cociente(this.grupo(), this.grupo());
    }
    if (c === "sqrt") {
      // `\sqrt[n]{u}` es la raíz n-ésima; sin corchete, la cuadrada.
      if (this.comer("abre", "[")) {
        const indice = this.analizarSuma();
        this.comer("cierra", "]");
        return aplicacion("nthRoot", [this.grupo(), indice]);
      }
      return aplicacion("sqrt", [this.grupo()]);
    }
    if (c === "cbrt") return aplicacion("cbrt", [this.grupo()]);
    if (c === "ln") return this.aplicarFuncion(LN, t.desde);
    if (c === "log") return this.aplicarFuncion("log", t.desde);
    if (c === "lfloor") return this.hastaCierre("rfloor", "floor");
    if (c === "lceil") return this.hastaCierre("rceil", "ceil");

    const cte = CONSTANTE_POR_NOMBRE[c];
    if (cte !== undefined) return constante(cte);

    const fn = FUNCION_POR_COMANDO[c];
    if (fn !== undefined) return this.aplicarFuncion(fn, t.desde);

    if (GRIEGAS.includes(c)) return simbolo(c);

    // Comando desconocido: se lee como un símbolo con su nombre, que es lo que hace hoy la
    // última regex del lector histórico. Es preferible a fallar: una nota con un comando raro
    // sigue dibujándose.
    return simbolo(c);
  }

  /** `\lfloor u \rfloor` y compañía: todo hasta el comando de cierre. */
  private hastaCierre(cierre: string, funcion: string): Expresion {
    const dentro = this.analizarSuma();
    if (this.act.tipo === "comando" && this.act.texto === cierre) this.avanzar();
    return aplicacion(funcion, [dentro]);
  }

  /** El NOMBRE que hay dentro de unas llaves (`{arccot}`), pegando las letras sueltas que el
   *  tokenizador emitió una a una. `null` si lo que hay no es un nombre. */
  private nombreEntreLlaves(): string | null {
    if (!this.comer("abre", "{")) return null;
    let nombre = "";
    while (this.act.tipo === "nombre" || this.act.tipo === "numero") nombre += this.avanzar().texto;
    this.comer("cierra", "}");
    return nombre === "" ? null : nombre;
  }

  /** Un grupo `{…}` (o lo que haya, si el usuario no puso llaves). */
  private grupo(): Expresion {
    this.saltarRuido();
    if (this.comer("abre", "{")) {
      // `x^{}` es lo que queda de un exponente a medio escribir. El motor de hoy lo borra y
      // deja la base; aquí se devuelve el neutro, que produce lo mismo al elevar.
      if (this.comer("cierra", "}")) return UNO_E;
      const dentro = this.analizarSuma();
      this.comer("cierra", "}");
      return dentro;
    }
    return this.analizarAtomo();
  }

  /**
   * La aplicación de una función ya nombrada, con las tres formas que admite la notación:
   *
   *   `\sin(x+1)`     con paréntesis: el argumento es lo de dentro.
   *   `\sin x`        desnuda: el argumento es la cadena de factores implícitos que siga.
   *   `\sin^2 x`      con exponente entre el nombre y el argumento: la potencia va FUERA,
   *                   salvo el `-1`, que es la inversa (`\sin^{-1} x` = `asin x`).
   */
  private aplicarFuncion(id: string, desde: number): Expresion {
    this.saltarRuido();

    // Subíndice: la base del logaritmo (`\log_2 8`, `\log_{10} x`).
    let base: Expresion | null = null;
    if (this.comer("operador", "_")) base = this.grupo();

    // Exponente pegado al nombre.
    let exponente: Expresion | null = null;
    if (this.comer("operador", "^")) exponente = this.grupo();

    const inversa = exponente !== null && this.esMenosUno(exponente) ? INVERSA_DE[id] : undefined;
    const idFinal = inversa ?? id;

    const args = this.enGradosSiToca(idFinal, this.argumentosDeFuncion(desde));
    let e: Expresion;
    if (idFinal === LN) e = aplicacion("log", [args[0], constante("e")]);
    else if (idFinal === "log") {
      // `log(u, b)` trae su base escrita; `\log_b u` la trae en el subíndice; sin ninguna de las
      // dos, la base es 10 —que es lo que hace el motor de hoy, medido, y no lo que uno
      // esperaría de un `log` a secas—.
      e = args.length > 1 ? aplicacion("log", [args[0], args[1]])
        : aplicacion("log", [args[0], base ?? entero(10)]);
    } else e = aplicacion(idFinal, args);

    if (exponente !== null && inversa === undefined) e = potencia(e, exponente);
    return e;
  }

  /**
   * El argumento numérico DESNUDO de una trigonométrica directa está en GRADOS: `sin(45)` es el
   * seno de 45°, no de 45 radianes.
   *
   * No es una convención que uno elegiría de cero, pero es la que lleva el motor desde siempre
   * —`normalizarTrigonometria` en `src/parser.ts`— y hay notas escritas contra ella: un lector
   * que no la reprodujera cambiaría en silencio la curva que dibuja cada nota que escribió
   * `\sin(30)`. Es exactamente el riesgo que esta etapa existe para no correr.
   *
   * La frontera es la del motor de hoy: solo las seis DIRECTAS —el argumento de `arcsin` no es
   * un ángulo, y `sinh(30)` es 30, no 30°—, y solo si el argumento es un número puro. Basta que
   * aparezca un símbolo o una constante para que no se toque, y por eso `\sin(90°)` no se
   * convierte dos veces: sus grados ya metieron un π dentro.
   */
  private enGradosSiToca(id: string, args: Expresion[]): Expresion[] {
    if (args.length !== 1 || !TRIG_DIRECTAS.includes(id)) return args;
    return esNumeroPuro(args[0]) ? [producto([args[0], ENGRADOS])] : args;
  }

  /** ¿Vale −1? Se pregunta por la ESTRUCTURA y no por la identidad del objeto: `{-1}` llega
   *  como `(−1)·1` —el menos unario multiplica— y comparar con `===` contra la constante del
   *  módulo fallaba siempre, porque el literal lo acaba de construir el lector. */
  private esMenosUno(e: Expresion): boolean {
    if (e.clase === "literal") return e.numero.clase === "racional"
      && e.numero.valor.n === -1n && e.numero.valor.d === 1n;
    if (e.clase === "producto") {
      const noNeutros = e.factores.filter((f) => !this.esUno(f));
      if (noNeutros.length === 1) return this.esMenosUno(noNeutros[0]);
      return false;
    }
    return false;
  }

  private esUno(e: Expresion): boolean {
    return e.clase === "literal" && e.numero.clase === "racional"
      && e.numero.valor.n === 1n && e.numero.valor.d === 1n;
  }

  /**
   * El argumento de una función desnuda. Se toma la cadena de factores implícitos —`\sin 2x` es
   * `sin(2x)`, medido sobre el motor de hoy— pero se PARA antes de un `^`, porque `\sin x^2` es
   * `(sin x)^2` y no `sin(x^2)`. Las dos cosas son convenciones del motor actual y esta etapa
   * las reproduce en vez de mejorarlas: cambiar cómo se lee lo ya escrito es otra decisión.
   */
  private argumentosDeFuncion(desde: number): Expresion[] {
    this.saltarRuido();
    if (this.comer("abre", "(")) {
      // Con paréntesis puede haber VARIOS argumentos: `nthRoot(u, 3)`, `log(u, b)`,
      // `atan2(y, x)`. La coma solo separa argumentos aquí; en cualquier otro sitio el
      // tokenizador la emite y nadie la reclama, así que se descarta sin ruido.
      const args = [this.analizarSuma()];
      while (this.comer("coma")) args.push(this.analizarSuma());
      this.comer("cierra", ")");
      return args;
    }
    if (this.act.tipo === "abre" && this.act.texto === "{") return [this.grupo()];
    if (!this.empiezaFactor()) {
      throw new ErrorDeLectura("la función se quedó sin argumento", desde);
    }
    let arg = this.analizarAtomo();
    while (this.empiezaFactor()) arg = producto([arg, this.analizarAtomo()]);
    return [arg];
  }

  /** ¿Se ha consumido todo? */
  get terminado(): boolean { return this.act.tipo === "fin"; }
  get restante(): Token { return this.act; }
}

// ─────────────────────────────────────────────
// La puerta
// ─────────────────────────────────────────────

/**
 * Lee una EXPRESIÓN escrita (sin `=`) y devuelve la `Expresion` que significa.
 * `null` si no se puede leer, que es una respuesta y no un fallo.
 */
export function leerExpresionLatex(texto: string): Expresion | null {
  const limpio = texto.trim();
  if (limpio === "") return null;
  try {
    const a = new Analizador(tokenizar(limpio));
    const e = a.analizarExpresion();
    return a.terminado ? e : null;
  } catch {
    return null;
  }
}

/** Los dos lados de una ecuación escrita. Sin `=`, se lee como `y = expr`. */
export function leerEcuacionLatex(texto: string): { izq: Expresion; der: Expresion } | null {
  const partes = texto.split("=");
  if (partes.length > 2) return null;
  if (partes.length === 1) {
    const der = leerExpresionLatex(partes[0]);
    return der === null ? null : { izq: simbolo("y"), der };
  }
  const izq = leerExpresionLatex(partes[0]);
  if (izq === null) return null;
  const der = leerExpresionLatex(partes[1]);
  return der === null ? null : { izq, der };
}
