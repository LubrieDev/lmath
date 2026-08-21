// ─────────────────────────────────────────────
// núcleo · El orden TOTAL sobre expresiones (PURO)
// ─────────────────────────────────────────────
//
// La piedra angular. Con un orden total sobre expresiones:
//
//   • la forma canónica es «suma ordenada de productos ordenados», y por tanto ESTRUCTURAL;
//   • combinar términos semejantes es un barrido lineal sobre una lista ya ordenada;
//   • la igualdad se decide comparando estructuras, no imprimiendo y comparando texto.
//
// Ese último punto es el que cierra el problema de fondo del motor actual: hoy la forma canónica
// se decide AL IMPRIMIR (`renderCanonico` ordena y serializa a la vez), las claves de ordenación
// son cadenas (`claveFactor`) y la idempotencia se comprueba sobre el texto. Con esto, la
// tipografía se puede cambiar sin tocar el álgebra.
//
// ── Las cuatro exigencias, por orden de prioridad ────────────────────────────────────────
//  1. TOTAL. Dos expresiones cualesquiera comparan, y solo comparan iguales si son la misma
//     estructura. Sale por construcción: cada clase compara todos sus campos, así que un 0 solo
//     puede venir de una coincidencia campo a campo.
//  2. DETERMINISTA. No depende del historial de construcción ni del orden de ningún `Map`.
//  3. ESTABLE. Añadir una clase de nodo o una función al catálogo no reordena lo que ya había:
//     `RANGO_CLASE` solo crece por el final y las funciones ordenan por su id, no por su índice.
//  4. LEGIBLE. Que la forma canónica se parezca a lo que escribiría una persona.
//
// ── Una decisión que mejora la especificación ────────────────────────────────────────────
// El diseño preveía usar el hash como desempate final «para garantizar la totalidad». No hace
// falta, y por eso no se hace: la comparación campo a campo ya es total. Dejarlo fuera es
// estrictamente mejor, porque desacopla el orden del hash: cambiar la función de hash no puede
// reordenar ninguna expresión, y el hash queda reservado a lo suyo, que es filtrar.
//
// ── Orden canónico ≠ orden de presentación ───────────────────────────────────────────────
// Este orden sirve al ÁLGEBRA: pone juntos los términos semejantes y hace barata la comparación.
// No pretende ser bonito. El orden con el que se ESCRIBE una fórmula —grado descendente,
// constantes con nombre delante, positivos primero— es otro, es del impresor, y vive con él.
// Confundir los dos es lo que hoy hace que tocar la tipografía sea tocar el álgebra.

import {
  type Condicion, type Expresion, RANGO_CLASE, exprsDeCondicion,
} from "./expresion";
import { compararN } from "./numero";

/**
 * Variables promovidas al frente del orden, para que lo polinómico salga en la variable
 * principal (`x` antes que `y`, y las dos antes que un parámetro cualquiera). El resto va
 * detrás, en orden lexicográfico, que es total y no depende de nada.
 */
const VARIABLES_PROMOVIDAS = ["x", "y", "z", "t"];

/** Rango de las constantes con nombre. Fijo y solo ampliable por el final, igual que el de las
 *  clases: son átomos del catálogo, no cadenas que se comparen alfabéticamente. */
const RANGO_CONSTANTE = ["pi", "e", "tau", "phi"];

const signo = (n: number): -1 | 0 | 1 => (n < 0 ? -1 : n > 0 ? 1 : 0);

const compararTexto = (a: string, b: string): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);

function compararSimbolo(a: string, b: string): -1 | 0 | 1 {
  const ra = VARIABLES_PROMOVIDAS.indexOf(a), rb = VARIABLES_PROMOVIDAS.indexOf(b);
  const ia = ra < 0 ? VARIABLES_PROMOVIDAS.length : ra;
  const ib = rb < 0 ? VARIABLES_PROMOVIDAS.length : rb;
  return ia !== ib ? signo(ia - ib) : compararTexto(a, b);
}

/** Compara dos listas: elemento a elemento y, a igualdad de prefijo, la más corta primero. */
function compararListas(a: readonly Expresion[], b: readonly Expresion[]): -1 | 0 | 1 {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = comparar(a[i], b[i]);
    if (c !== 0) return c;
  }
  return signo(a.length - b.length);
}

const RANGO_CONDICION = ["noCero", "noNegativo", "positivo", "acotado", "y"];

function compararCondicion(a: Condicion, b: Condicion): -1 | 0 | 1 {
  const ra = RANGO_CONDICION.indexOf(a.tipo), rb = RANGO_CONDICION.indexOf(b.tipo);
  if (ra !== rb) return signo(ra - rb);
  if (a.tipo === "y" && b.tipo === "y") {
    const n = Math.min(a.partes.length, b.partes.length);
    for (let i = 0; i < n; i++) {
      const c = compararCondicion(a.partes[i], b.partes[i]);
      if (c !== 0) return c;
    }
    return signo(a.partes.length - b.partes.length);
  }
  return compararListas(exprsDeCondicion(a), exprsDeCondicion(b));
}

/**
 * El orden total. Devuelve −1, 0 o 1, y el 0 significa **estructuralmente idénticas**.
 *
 * Primero por clase (rango fijo), después por el contenido de esa clase. La recursión termina
 * porque las expresiones son árboles finitos e inmutables.
 */
export function comparar(a: Expresion, b: Expresion): -1 | 0 | 1 {
  if (a === b) return 0;                                   // mismo objeto: atajo, no criterio
  if (a.clase !== b.clase) return signo(RANGO_CLASE[a.clase] - RANGO_CLASE[b.clase]);

  switch (a.clase) {
    case "literal":
      return compararN(a.numero, (b as typeof a).numero);
    case "simbolo":
      return compararSimbolo(a.nombre, (b as typeof a).nombre);
    case "constante": {
      const nb = (b as typeof a).nombre;
      const ra = RANGO_CONSTANTE.indexOf(a.nombre), rb = RANGO_CONSTANTE.indexOf(nb);
      return ra !== rb ? signo(ra - rb) : compararTexto(a.nombre, nb);
    }
    case "potencia": {
      const o = b as typeof a;
      const c = comparar(a.base, o.base);
      return c !== 0 ? c : comparar(a.exponente, o.exponente);
    }
    case "producto":
      return compararListas(a.factores, (b as typeof a).factores);
    case "suma":
      return compararListas(a.sumandos, (b as typeof a).sumandos);
    case "aplicacion": {
      const o = b as typeof a;
      const c = compararTexto(a.funcion, o.funcion);
      return c !== 0 ? c : compararListas(a.args, o.args);
    }
    case "rama": {
      const o = b as typeof a;
      if (a.eje !== o.eje) return signo(a.eje - o.eje);
      return compararListas(a.alternativas, o.alternativas);
    }
    case "condicionado": {
      const o = b as typeof a;
      const c = comparar(a.cuerpo, o.cuerpo);
      return c !== 0 ? c : compararCondicion(a.condicion, o.condicion);
    }
    case "familia": {
      const o = b as typeof a;
      const c = compararTexto(a.parametro, o.parametro);
      if (c !== 0) return c;
      const d = compararTexto(a.conjunto, o.conjunto);
      return d !== 0 ? d : comparar(a.paso, o.paso);
    }
  }
}

/** Copia ordenada de una lista de expresiones. Estable por serlo `Array.sort` en ES2019, aunque
 *  la estabilidad no hace falta: el orden es total, así que no hay empates entre distintas. */
export const ordenar = (es: readonly Expresion[]): Expresion[] => [...es].sort(comparar);
