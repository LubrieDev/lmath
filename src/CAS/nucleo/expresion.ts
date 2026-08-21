// ─────────────────────────────────────────────
// núcleo · `Expresion`: el árbol propio, cerrado, inmutable y con hash (PURO)
// ─────────────────────────────────────────────
//
// El tipo que sustituye al AST de mathjs mirado a través de `Nodo`. No es «lo mismo con otros
// nombres»: la mitad del valor de este archivo está en lo que DEJA DE EXISTIR.
//
// ── Lo que desaparece, y por qué ─────────────────────────────────────────────────────────
// No hay resta, ni división, ni menos unario, ni paréntesis.
//
//     a − b   es   Suma[a, Producto[−1, b]]
//     a / b   es   Producto[a, Potencia(b, −1)]
//     −a      es   Producto[−1, a]
//
// No es taquigrafía: es que la resta y la división **no son operaciones del álgebra**, son
// notación para sumar el opuesto y multiplicar por el inverso. Modelarlas como operaciones es lo
// que obliga a que cada consumidor las vuelva a aplanar, y de ahí salían los cuatro aplanadores
// distintos que hoy conviven (`terminos`, `factores`, `factoresProducto`, `cadenaProducto`), el
// `Termino { signo: 1 | -1 }` con su `flip()`, el `Factor { exp: 1 | -1 }` y el coste
// `profundidadFraccion` para medir fracciones anidadas —que en forma canónica no pueden existir,
// porque no hay ninguna barra de fracción que anidar—.
//
// Los paréntesis tampoco están: son del IMPRESOR. Un `ParenthesisNode` en el árbol significa que
// dos expresiones matemáticamente idénticas son datos distintos según cómo se escribieran.
//
// ── Suma y Producto son n-arios ──────────────────────────────────────────────────────────
// `a+b+c` es UNA suma de tres sumandos, no dos sumas de dos. Con árboles binarios, la
// asociatividad no está representada y hay que reconstruirla en cada uso; con n-arios ordenados,
// asociatividad y conmutatividad salen gratis y la forma canónica pasa a ser estructural.
//
// ── Ramas, condiciones y familias son DATOS ──────────────────────────────────────────────
// `Rama`, `Condicionado` y `Familia` ocupan el sitio de los centinelas `pm`/`mp`/`pm2`/`mp2`,
// `dom` y `fam`/`famN`, que hoy son funciones falsas reconocidas por su nombre y que siete
// módulos distintos tienen que conocer. Aquí son constructores del tipo: el compilador obliga a
// tratarlos y no hay ninguna cadena de por medio. Los nombres viejos sobreviven ÚNICAMENTE en
// `CAS/puente/mathjs.ts`, como formato de compatibilidad hacia el motor de dibujo.
//
// ── El hash ──────────────────────────────────────────────────────────────────────────────
// Cada nodo lleva el suyo, calculado al construirlo (son inmutables, así que se calcula una vez).
// Sirve para descartar rápido y para memoizar. **Nunca decide una igualdad**: eso lo hace
// `igualdad.ts` comparando estructuras, y el hash solo se usa como filtro previo. Una colisión
// que hiciera al motor afirmar que dos expresiones distintas son la misma sería el peor fallo
// posible en la pieza cuya razón de ser es la corrección.

import { type Numero, RANGO_NUMERO, numEntero, numRacional } from "./numero";
import { type Racional } from "../../math/racional";

// ─────────────────────────────────────────────
// El tipo
// ─────────────────────────────────────────────

/** Constantes matemáticas con nombre. Son ÁTOMOS con propiedades conocidas, no símbolos que
 *  casualmente se llaman «pi»: hoy `esConstante()` responde que π no es constante —porque es un
 *  `SymbolNode`— y hay un parche (`CONSTANTES_CON_NOMBRE`) para que el orden no se confunda. */
export type NombreConstante = "pi" | "e" | "tau" | "phi";

/** El conjunto del que toma valores el parámetro de una familia periódica. */
export type ConjuntoIndice = "enteros" | "naturales";

export interface Literal { readonly clase: "literal"; readonly hash: number; readonly numero: Numero }
export interface Simbolo { readonly clase: "simbolo"; readonly hash: number; readonly nombre: string }
export interface Constante { readonly clase: "constante"; readonly hash: number; readonly nombre: NombreConstante }

export interface Potencia {
  readonly clase: "potencia"; readonly hash: number;
  readonly base: Expresion;
  /** Es una EXPRESION, no un número: `x^n`, `x^(1/2)` y `x^(x+1)` son el mismo constructor. */
  readonly exponente: Expresion;
}

export interface Producto {
  readonly clase: "producto"; readonly hash: number;
  readonly factores: readonly Expresion[];
}

export interface Suma {
  readonly clase: "suma"; readonly hash: number;
  readonly sumandos: readonly Expresion[];
}

export interface Aplicacion {
  readonly clase: "aplicacion"; readonly hash: number;
  /** Id ESTABLE de una ficha del registro, no un nombre suelto que alguien despache con un
   *  `switch`. Es lo que permite que añadir `erf` o `W` sea añadir un registro y no tocar
   *  código repartido. */
  readonly funcion: string;
  readonly args: readonly Expresion[];
}

/**
 * Las dos ramas de un doble signo. `eje` las CORRELACIONA: dos `Rama` del mismo eje resuelven a
 * la vez (`pm(u)` y `mp(v)` sobre el eje 0 son `+u` con `−v`, o `−u` con `+v`, nunca las cuatro
 * combinaciones), y ejes distintos son independientes (dos ± sueltos son cuatro curvas).
 *
 * `alternativas[0]` es el valor cuando el eje toma el signo +, `[1]` cuando toma el −. Con eso,
 * `pm(u) = Rama(eje, [u, −u])` y `mp(u) = Rama(eje, [−u, u])`: el mismo constructor, sin ningún
 * caso especial que distinga uno de otro.
 */
export interface Rama {
  readonly clase: "rama"; readonly hash: number;
  readonly eje: number;
  readonly alternativas: readonly [Expresion, Expresion];
}

/** Una expresión válida SOLO donde se cumple su condición. Ocupa el sitio de `dom(cuerpo, R)`. */
export interface Condicionado {
  readonly clase: "condicionado"; readonly hash: number;
  readonly cuerpo: Expresion;
  readonly condicion: Condicion;
}

/**
 * Una familia indexada por un entero: `k·paso` con k ∈ ℤ (o ℕ). Ocupa el sitio de `fam`/`famN`.
 *
 * Es el caso de rama con INFINITAS alternativas, y merece ser un constructor y no un apaño
 * porque es la forma en la que se escriben las soluciones de toda ecuación periódica
 * (`sin y = x → y = asin x + 2kπ`). Un CAS que quiera resolver trascendentes lo necesita de
 * primera clase; tenerlo desde ahora evita que llegue después como un centinela más.
 */
export interface Familia {
  readonly clase: "familia"; readonly hash: number;
  readonly parametro: string;
  readonly conjunto: ConjuntoIndice;
  readonly paso: Expresion;
}

export type Expresion =
  | Literal | Simbolo | Constante | Potencia | Producto | Suma
  | Aplicacion | Rama | Condicionado | Familia;

/**
 * Una condición de dominio. Los cuatro tipos atómicos son los mismos que ya lee
 * `math/dominio.ts` (`noCero`, `noNegativo`, `positivo`, `acotado`), para que las dos piezas
 * hablen del mismo vocabulario y no haya que traducir; la conjunción es lo que permite que un
 * despeje de varios pasos acumule sus guardas sin aplastarlas.
 */
export type Condicion =
  | { readonly tipo: "noCero"; readonly expr: Expresion }
  | { readonly tipo: "noNegativo"; readonly expr: Expresion }
  | { readonly tipo: "positivo"; readonly expr: Expresion }
  | { readonly tipo: "acotado"; readonly expr: Expresion }
  | { readonly tipo: "y"; readonly partes: readonly Condicion[] };

/**
 * Rango de cada clase para el orden total. **Se amplía SOLO por el final**: si estos números
 * cambiaran, cambiaría la forma canónica de todo el corpus y todos los dorados se moverían sin
 * que nadie hubiera tocado una regla de álgebra.
 */
export const RANGO_CLASE: Readonly<Record<Expresion["clase"], number>> = {
  literal: 0,
  constante: 1,
  simbolo: 2,
  potencia: 3,
  producto: 4,
  suma: 5,
  aplicacion: 6,
  rama: 7,
  condicionado: 8,
  familia: 9,
};

// ─────────────────────────────────────────────
// El hash
// ─────────────────────────────────────────────
//
// FNV-1a de 32 bits con `Math.imul`, que es la multiplicación entera de JavaScript: da avalancha
// real sin salirse de los enteros exactos. Tres propiedades exigidas, y las tres comprobadas en
// `tests/modules/nucleo.test.ts`:
//
//   1. DETERMINISTA entre procesos y plataformas. Nada de identidad de objeto, orden de
//      inserción de un `Map`, contadores globales ni fechas.
//   2. ESTABLE frente a la ampliación: el hash de `sin(x)` no cambia porque se añada `erf` al
//      catálogo. Por eso la clase entra por su RANGO (tabla que solo crece por el final) y la
//      función por su id, no por su índice en un array.
//   3. SENSIBLE al orden y a la clase: `f(a,b)` y `f(b,a)` no comparten hash, y `Suma[a,b]` no
//      lo comparte con `Producto[a,b]`.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const mezclar = (h: number, v: number): number => Math.imul(h ^ (v >>> 0), FNV_PRIME) >>> 0;

function hashTexto(s: string, h: number = FNV_OFFSET): number {
  for (let i = 0; i < s.length; i++) h = mezclar(h, s.charCodeAt(i));
  return h;
}

/** Un `bigint` en trozos de 32 bits, de menos a más significativo, con su signo delante.
 *  No pasa por `String`: es más rápido y, sobre todo, no depende de cómo imprima la plataforma. */
function hashBigInt(n: bigint, h: number): number {
  h = mezclar(h, n < 0n ? 1 : 0);
  let v = n < 0n ? -n : n;
  if (v === 0n) return mezclar(h, 0);
  while (v > 0n) { h = mezclar(h, Number(v & 0xffffffffn)); v >>= 32n; }
  return h;
}

function hashNumero(n: Numero, h: number): number {
  h = mezclar(h, RANGO_NUMERO[n.clase]);
  if (n.clase === "racional") return hashBigInt(n.valor.d, hashBigInt(n.valor.n, h));
  if (n.clase === "algebraico") {
    // Un algebraico se identifica por su polinomio y su intervalo. OJO: dos algebraicos IGUALES
    // pueden llevar polinomios distintos (uno reducible y otro no) y por tanto hashes distintos.
    // No es un fallo del hash: es que el hash FILTRA y la igualdad la decide `igualesA`, con
    // Sturm. Aquí solo hace falta que sea determinista y estable, y lo es.
    let acc = h;
    for (const c of n.valor.polinomio) acc = hashBigInt(c.d, hashBigInt(c.n, acc));
    acc = hashBigInt(n.valor.a.d, hashBigInt(n.valor.a.n, acc));
    return hashBigInt(n.valor.b.d, hashBigInt(n.valor.b.n, acc));
  }
  // Un `double` se mezcla por sus bits, que es la única lectura que no depende del formateo.
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, n.valor);
  return mezclar(mezclar(h, buf.getUint32(0)), buf.getUint32(4));
}

function hashCondicion(c: Condicion, h: number): number {
  h = hashTexto(c.tipo, h);
  return c.tipo === "y"
    ? c.partes.reduce((acc, p) => hashCondicion(p, acc), h)
    : mezclar(h, c.expr.hash);
}

/**
 * Un nodo sin su hash: lo que recibe el constructor antes de sellarlo.
 *
 * `Omit` se distribuye a mano sobre la unión (`T extends unknown ? … : never`) porque el `Omit`
 * corriente aplasta una unión discriminada a sus claves comunes —que aquí son solo `clase`— y el
 * `switch` de abajo dejaría de estrechar nada.
 */
type SinHash<T> = T extends unknown ? Omit<T, "hash"> : never;
export type ExpresionSinHash = SinHash<Expresion>;

/** El hash de un nodo a partir de su clase y de los hashes ya calculados de sus hijos. */
function hashDe(e: ExpresionSinHash): number {
  let h = mezclar(FNV_OFFSET, RANGO_CLASE[e.clase]);
  switch (e.clase) {
    case "literal": return hashNumero(e.numero, h);
    case "simbolo": return hashTexto(e.nombre, h);
    case "constante": return hashTexto(e.nombre, h);
    case "potencia": return mezclar(mezclar(h, e.base.hash), e.exponente.hash);
    case "producto": return e.factores.reduce((acc, f) => mezclar(acc, f.hash), h);
    case "suma": return e.sumandos.reduce((acc, s) => mezclar(acc, s.hash), h);
    case "aplicacion":
      h = hashTexto(e.funcion, h);
      return e.args.reduce((acc, a) => mezclar(acc, a.hash), h);
    case "rama":
      h = mezclar(h, e.eje);
      return mezclar(mezclar(h, e.alternativas[0].hash), e.alternativas[1].hash);
    case "condicionado": return hashCondicion(e.condicion, mezclar(h, e.cuerpo.hash));
    case "familia":
      h = hashTexto(e.conjunto, hashTexto(e.parametro, h));
      return mezclar(h, e.paso.hash);
  }
}

// ─────────────────────────────────────────────
// Constructores
// ─────────────────────────────────────────────
//
// Son la ÚNICA vía de creación: el hash se calcula aquí y nadie fabrica un nodo a mano. Es
// también el sitio donde en su día encajaría el internado (hash-consing) sin tocar nada de fuera
// —el motivo por el que esa decisión se puede aplazar y la del hash no—.
//
// Estos constructores NO hacen álgebra: no ordenan, no combinan términos semejantes, no quitan
// factores neutros ni evalúan nada. Eso es trabajo de `normal/`, que es otra etapa.
//
// Sí imponen, en cambio, lo único que es propio de la REPRESENTACIÓN y no del álgebra: que la
// asociatividad no se guarde dos veces. Una `Suma` no puede tener otra `Suma` entre sus
// sumandos, y una suma de un solo sumando es ese sumando.
//
// No es una excepción a la regla de arriba: es la regla de que `Suma` es n-aria, cumplida. Si
// `suma([suma([a,b]), c])` fuera construible, `a+b+c` tendría varias representaciones distintas,
// con hashes distintos y comparando distinto — y entonces ni el hash, ni la igualdad estructural,
// ni la forma canónica significarían nada. La descubrió la prueba de ida y vuelta del puente,
// que es exactamente para lo que están las pruebas de propiedades.

const conHash = <T extends ExpresionSinHash>(e: T): T & { hash: number } =>
  ({ ...e, hash: hashDe(e) });

export const literal = (numero: Numero): Literal =>
  conHash({ clase: "literal", numero });
export const entero = (n: bigint | number): Literal => literal(numEntero(n));
export const racional = (r: Racional): Literal => literal(numRacional(r));

// Se definen AQUÍ, antes que `suma` y `producto`, porque esos dos los devuelven para la lista
// vacía: dejarlos más abajo funcionaría por casualidad (nadie los llama durante la carga del
// módulo) y se rompería en cuanto alguien añadiera una constante de módulo que sí lo hiciera.
export const CERO_E = entero(0);
export const UNO_E = entero(1);
export const MENOS_UNO_E = entero(-1);
export const simbolo = (nombre: string): Simbolo =>
  conHash({ clase: "simbolo", nombre });
export const constante = (nombre: NombreConstante): Constante =>
  conHash({ clase: "constante", nombre });
export const potencia = (base: Expresion, exponente: Expresion): Potencia =>
  conHash({ clase: "potencia", base, exponente });
/** Aplana los hijos de la misma clase: la asociatividad no se representa. */
const aplanar = <C extends "suma" | "producto">(
  es: readonly Expresion[], clase: C, sacar: (e: Expresion) => readonly Expresion[]
): Expresion[] => es.flatMap((e) => (e.clase === clase ? sacar(e) : [e]));

/**
 * Suma n-aria. Cero sumandos es 0 y uno solo es él mismo: no son simplificaciones, son la
 * lectura correcta de una lista (la suma vacía es el neutro, y sumar una cosa es esa cosa).
 */
export function suma(sumandos: readonly Expresion[]): Expresion {
  const planos = aplanar(sumandos, "suma", (e) => (e as Suma).sumandos);
  if (planos.length === 0) return CERO_E;
  if (planos.length === 1) return planos[0];
  return conHash({ clase: "suma", sumandos: planos });
}

/** Producto n-ario. Cero factores es 1, y uno solo es él mismo. */
export function producto(factores: readonly Expresion[]): Expresion {
  const planos = aplanar(factores, "producto", (e) => (e as Producto).factores);
  if (planos.length === 0) return UNO_E;
  if (planos.length === 1) return planos[0];
  return conHash({ clase: "producto", factores: planos });
}
export const aplicacion = (funcion: string, args: readonly Expresion[]): Aplicacion =>
  conHash({ clase: "aplicacion", funcion, args });
export const rama = (eje: number, alternativas: readonly [Expresion, Expresion]): Rama =>
  conHash({ clase: "rama", eje, alternativas });
export const condicionado = (cuerpo: Expresion, condicion: Condicion): Condicionado =>
  conHash({ clase: "condicionado", cuerpo, condicion });
export const familia = (parametro: string, conjunto: ConjuntoIndice, paso: Expresion): Familia =>
  conHash({ clase: "familia", parametro, conjunto, paso });

// ── Atajos de uso constante ──────────────────────────────────────────────────


/** `−e`, que es `(−1)·e`. No hay «menos unario»: no hace falta. */
export const opuesto = (e: Expresion): Expresion => producto([MENOS_UNO_E, e]);
/** `a − b`, que es `a + (−1)·b`. */
export const resta = (a: Expresion, b: Expresion): Expresion => suma([a, opuesto(b)]);
/** `1/e`, que es `e^(−1)`. */
export const inverso = (e: Expresion): Expresion => potencia(e, MENOS_UNO_E);
/** `a / b`, que es `a · b^(−1)`. */
export const cociente = (a: Expresion, b: Expresion): Expresion => producto([a, inverso(b)]);

// ─────────────────────────────────────────────
// Recorrido
// ─────────────────────────────────────────────

/** Los hijos DIRECTOS de un nodo, en orden estable. Lo usan el recorrido, la sustitución y la
 *  comparación, para no repetir el `switch` sobre las diez clases en cada uno. */
export function hijos(e: Expresion): readonly Expresion[] {
  switch (e.clase) {
    case "literal": case "simbolo": case "constante": return [];
    case "potencia": return [e.base, e.exponente];
    case "producto": return e.factores;
    case "suma": return e.sumandos;
    case "aplicacion": return e.args;
    case "rama": return e.alternativas;
    case "condicionado": return [e.cuerpo, ...exprsDeCondicion(e.condicion)];
    case "familia": return [e.paso];
  }
}

/** Las expresiones que aparecen dentro de una condición. */
export function exprsDeCondicion(c: Condicion): readonly Expresion[] {
  return c.tipo === "y" ? c.partes.flatMap(exprsDeCondicion) : [c.expr];
}

/** Recorre el árbol entero, raíz primero. */
export function recorrer(e: Expresion, visitar: (n: Expresion) => void): void {
  visitar(e);
  for (const h of hijos(e)) recorrer(h, visitar);
}

/** ¿Aparece el símbolo `nombre` en el subárbol? */
export function contieneSimbolo(e: Expresion, nombre: string): boolean {
  let hay = false;
  recorrer(e, (n) => { if (n.clase === "simbolo" && n.nombre === nombre) hay = true; });
  return hay;
}

/** Los símbolos libres del subárbol, sin repetir y en orden de aparición. */
export function simbolosDe(e: Expresion): string[] {
  const out: string[] = [];
  recorrer(e, (n) => {
    if (n.clase === "simbolo" && !out.includes(n.nombre)) out.push(n.nombre);
  });
  return out;
}

/** ¿La expresión es exacta de punta a punta (ningún flotante escondido)? Es la consulta que
 *  hace verificable el invariante de exactitud, en vez de dejarlo en una intención. */
export function esExacta(e: Expresion): boolean {
  let exacta = true;
  recorrer(e, (n) => { if (n.clase === "literal" && n.numero.clase === "flotante") exacta = false; });
  return exacta;
}
