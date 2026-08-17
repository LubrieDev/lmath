// ─────────────────────────────────────────────
// mate · De la ecuación ESCRITA a sus RAMAS resolubles (PURO)
// ─────────────────────────────────────────────
//
// La costura que faltaba entre el despejador y el solucionador de sistemas.
//
// ── El problema que resuelve ──────────────────────────────────────────────────────────────
// El TRAZADOR consume las ecuaciones ya despejadas y expandidas en ramas (`composicion.ts`
// llama a `expandirDobleSigno` y `ProveedorUnion` las presenta como un objeto). El
// SOLUCIONADOR las consumía tal como se escriben. Esa asimetría hacía que la respuesta
// dependiera de la FORMA SINTÁCTICA y no de la matemática:
//
//     y = √x         ∩  y = 3 − x   →  se resolvía
//     x + √y = 3     ∩  x − y = 0   →  «no se puede resolver de forma exacta»
//
// Son el MISMO sistema y la MISMA solución. Lo único que cambiaba era cómo estaba escrito, y
// eso no es una frontera del CAS: es una fuga. El plano ya sabía que `x + |y|^{1/2} = 3` son
// dos ramas; el solucionador no se había enterado.
//
// ── Qué hace ──────────────────────────────────────────────────────────────────────────────
// Despeja la ecuación —transponiendo x↔y cuando la incógnita despejable es la otra—, expande el
// ± en las ecuaciones que de verdad representa y separa las guardas de dominio (`dom`) que el
// despeje fue dejando por el camino. El resultado son N ecuaciones CADA UNA con la condición
// bajo la que vale, que es lo que el solucionador sabe cruzar. Nada de esto es nuevo: son piezas
// que ya existían (`despejeAbsoluto`, `despejeRaiz`, `despejeRaizDePotencia`, los radicales
// repartidos, `expandirDobleSigno`, el centinela `dom`), conectadas.
//
// ── Lo que NO hace, a propósito ───────────────────────────────────────────────────────────
// **Despeje INCOMPLETO → `null`.** Si `y` no queda aislada (`sin y + y² = x`), la ecuación
// resultante no es más resoluble que la original —ni es polinómica ni tiene la forma `y = f(x)`
// que pide el camino numérico—, así que enumerar por ahí no ganaría una sola solución y sí
// costaría la promesa: una lista salida de un despeje parcial no se puede afirmar completa.
// Es la misma regla que ya aplica `despejeExplicito` para alimentar al trazador.
//
// **Familias periódicas (`fam`/`famN`) → `null`.** `tan y = x` despeja a `y = atan x + kπ`:
// infinitas ramas. Enumerar cuatro de ellas y callarse las demás sería peor que no enumerar.
//
// ── Las guardas no son decoración ─────────────────────────────────────────────────────────
// Cada elevación al cuadrado del despeje introduce soluciones extrañas. En `x + √|y| = 3` ∩
// `x = y` la rama `y = (3−x)²` da x = (7±√13)/2, y la segunda NO es solución del sistema
// escrito (su residuo vale 4.6). Quien la mata es la guarda `x ≤ 3`. Por eso salen de aquí
// junto a la ecuación y no incrustadas en ella: el solucionador las necesita como PREDICADO
// sobre el candidato, igual que ya trata la restricción `{a ≤ x ≤ b}` que escribe el usuario.

import { parse } from "mathjs";

import { despejar } from "../despejar";
import { evaluarConstante } from "../evaluador";
import { normalizarEntrada, contieneYLibre } from "../parser";
import { expandirDobleSigno, tieneDobleSigno } from "../core/parsing/dobleSigno";
import { insertarProductoImplicito } from "../core/parsing/productoImplicito";
import type { ResultadoDespeje } from "../despeje/contrato";
import { simboloNodo, type Nodo } from "../expr/nodo";

/** Una de las ecuaciones que representa la original, con la condición bajo la que vale. */
export interface RamaEcuacion {
  /** Ecuación re-parseable, ya sin centinelas (`pm` resuelto, `dom` extraído). */
  readonly ecuacion: string;
  /** Expresiones `R` que deben cumplir `R ≥ 0` para que esta rama exista. */
  readonly guardas: readonly string[];
}

/** Familia periódica: infinitas ramas, fuera del alcance de una enumeración. */
const FAMILIA = /(?<![a-zA-Z0-9_])(fam|famN)\s*\(/;

/** Tope de pasadas al limpiar una torre de `dom`. `transform` no vuelve a entrar en el nodo que
 *  sustituye, así que las capas anidadas necesitan varias; el tope evita cualquier bucle. */
const PASADAS_DOM = 8;

/** ¿Es el centinela de guarda de dominio `dom(cuerpo, R)`? */
function esDom(n: Nodo): boolean {
  return n.type === "FunctionNode" && n.fn?.name === "dom" && n.args.length === 2;
}

/**
 * El nodo sin centinelas `dom`, y las guardas que llevaba.
 *
 * Una guarda puede llevar otra dentro (el despeje encadena capas: cada inversión de rango
 * restringido añade la suya sobre el cuerpo ya restringido), así que las guardas recogidas se
 * vuelven a limpiar hasta que no queda ninguna. Si se dejara una sin extraer, el evaluador
 * encontraría un `dom` que no es función de mathjs, daría NaN y descartaría la rama entera.
 */
function separarGuardas(n: Nodo): { limpio: Nodo; guardas: Nodo[] } {
  const guardas: Nodo[] = [];
  const limpiar = (m: Nodo): Nodo => {
    let out = m;
    for (let i = 0; i < PASADAS_DOM && out.filter(esDom).length > 0; i++) {
      out = out.transform((k: Nodo): Nodo => {
        if (!esDom(k)) return k;
        guardas.push(k.args[1]);
        return k.args[0];
      });
    }
    return out;
  };
  const limpio = limpiar(n);
  // La lista CRECE mientras se recorre (una guarda limpia puede aportar otra): `guardas.length`
  // se relee en cada vuelta a propósito.
  for (let i = 0; i < guardas.length; i++) guardas[i] = limpiar(guardas[i]);
  return { limpio, guardas };
}

/** Constantes que el motor sabe evaluar (`pi`, `e`, `phi`, `tau`), memorizadas: la consulta pasa
 *  por el pipeline de entrada entero y se repite por cada rama. */
const constantes = new Map<string, boolean>();
function esConstante(nombre: string): boolean {
  let conocida = constantes.get(nombre);
  if (conocida === undefined) {
    conocida = evaluarConstante(nombre) !== null;
    constantes.set(nombre, conocida);
  }
  return conocida;
}

/**
 * ¿La rama nombra solo `x`, `y` y constantes conocidas?
 *
 * Un símbolo libre (`x + a|y| = 3` con `a` sin declarar) no describe ninguna curva del plano, así
 * que cruzarla no puede dar ninguna solución. Y no es solo que no sirva: el barrido numérico
 * evaluaría 40 000 muestras que lanzan y se capturan una a una —casi un segundo por pareja—, y
 * este escalón puede intentar hasta dieciséis. Se descarta antes de empezar, mirando el árbol.
 *
 * El nombre de una FUNCIÓN también es un `SymbolNode` en mathjs; el camino `"fn"` lo distingue
 * del símbolo suelto (`sqrt(x)` nombra `sqrt`, y eso no es un símbolo libre).
 */
function soloVariablesYConstantes(n: Nodo): boolean {
  const libres = n.filter((m: Nodo, camino: string) =>
    m.type === "SymbolNode" && camino !== "fn" && m.name !== "x" && m.name !== "y");
  return libres.every((m) => esConstante(m.name));
}

/** Una rama ya expandida, con sus `dom` separados; `null` si no se deja leer o si no describe
 *  ninguna curva. */
function ramaLimpia(ec: string): RamaEcuacion | null {
  const partes = ec.split("=");
  if (partes.length > 2) return null;
  const lados: string[] = [];
  const guardas = new Set<string>();
  for (const parte of partes) {
    let n: Nodo;
    // El string viene del propio despejador (sintaxis mathjs), así que no se vuelve a
    // normalizar: sería reinterpretar lo que ya está interpretado.
    try { n = parse(parte) as unknown as Nodo; } catch { return null; }
    const { limpio, guardas: gs } = separarGuardas(n);
    if (!soloVariablesYConstantes(limpio)) return null;
    lados.push(limpio.toString());
    for (const g of gs) {
      if (!soloVariablesYConstantes(g)) return null;
      guardas.add(g.toString());
    }
  }
  return { ecuacion: lados.join(" = "), guardas: [...guardas] };
}

/** La expresión con `x` e `y` INTERCAMBIADAS. Sustitución simultánea sobre el árbol (no textual:
 *  un reemplazo en dos pasos convertiría las dos variables en la misma). */
function transponer(nodo: Nodo): Nodo {
  return nodo.transform((n: Nodo): Nodo => {
    if (n.type !== "SymbolNode") return n;
    if (n.name === "x") return simboloNodo("y");
    if (n.name === "y") return simboloNodo("x");
    return n;
  });
}

/**
 * Las ramas de una ecuación que NO tiene `y` (`x = 0`, `x² = 2`, `|x| = 2`).
 *
 * El despejador solo sabe aislar `y`, así que ante estas devuelve `null` —y con razón: no hay
 * ninguna `y` que aislar—. Pero eso dejaba fuera del escalón a toda ecuación escrita sobre la
 * otra variable, que es otra forma de que la ESCRITURA decida la capacidad: `|y| = 2` se
 * analizaba por casos y `|x| = 2` no, siendo la misma matemática girada 90°.
 *
 * La solución no es un despejador nuevo, es un cambio de coordenadas: se TRANSPONE la ecuación
 * (x↔y), se despeja con el despejador de siempre —que ahora ve su variable— y se transpone la
 * respuesta de vuelta. `|x| = 2` pasa por `|y| = 2` → `y = ±2` → `x = ±2`: dos ramas
 * polinómicas que el carril exacto resuelve. Es el mismo truco que el trazador usa para las
 * implícitas separables en x, aplicado aquí sobre el texto en vez de sobre el campo.
 *
 * Si la transposición no aporta nada (la ecuación ya está en su forma final, `x = 0`), se
 * devuelve tal cual: sigue siendo una rama perfectamente resoluble.
 */
function sinIncognitaY(ecuacion: string): ResultadoDespeje | null {
  const norm = insertarProductoImplicito(normalizarEntrada(ecuacion.trim()));
  if (norm === "" || contieneYLibre(norm)) return null;

  const partes = norm.split("=");
  if (partes.length === 2) {
    let girada: string;
    try {
      const izq = transponer(parse(partes[0]) as unknown as Nodo);
      const der = transponer(parse(partes[1]) as unknown as Nodo);
      girada = `${izq.toString()} = ${der.toString()}`;
    } catch { return { ecuacion: norm, completo: true }; }
    const desp = despejar(girada);
    if (desp && desp.completo) {
      // De vuelta a las coordenadas del usuario. La expansión del ± y la extracción de guardas
      // ocurren después, ya sobre esta forma, así que no hay nada especial que hacer con ellas.
      try {
        const vuelta = desp.ecuacion.split("=");
        if (vuelta.length === 2) {
          const izq = transponer(parse(vuelta[0]) as unknown as Nodo);
          const der = transponer(parse(vuelta[1]) as unknown as Nodo);
          return { ecuacion: `${izq.toString()} = ${der.toString()}`, completo: true };
        }
      } catch { /* la forma sin girar sigue siendo válida */ }
    }
  }
  return { ecuacion: norm, completo: true };
}

/**
 * Las ramas resolubles de una ecuación escrita, o `null` si no las tiene.
 *
 * `null` NO significa «sin soluciones»: significa que por aquí no se gana nada (ver cabecera).
 * Quien llama debe entonces quedarse con lo que ya tenía.
 *
 * La entrada llega SIN la restricción de dominio del usuario (`{a ≤ x ≤ b}`): la separa
 * `resolverBloque` antes de resolver y la aplica después, y meterla aquí la despejaría como si
 * fuera parte de la ecuación.
 */
export function ramasDe(ecuacion: string): readonly RamaEcuacion[] | null {
  const desp = despejar(ecuacion) ?? sinIncognitaY(ecuacion);
  if (!desp || !desp.completo) return null;
  if (FAMILIA.test(desp.ecuacion)) return null;

  const expandidas = tieneDobleSigno(desp.ecuacion)
    ? expandirDobleSigno(desp.ecuacion)
    : [desp.ecuacion];

  const out: RamaEcuacion[] = [];
  for (const e of expandidas) {
    const rama = ramaLimpia(e);
    // Una rama ilegible invalida la enumeración ENTERA: entregar las demás sería una lista a la
    // que le falta una curva sin decirlo, que es justo el fallo que este módulo viene a cerrar.
    if (!rama) return null;
    out.push(rama);
  }
  return out.length > 0 ? out : null;
}
