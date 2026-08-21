// ─────────────────────────────────────────────
// dominio · ¿Está esta expresión definida en TODAS partes? (PURO)
// ─────────────────────────────────────────────
//
// Una pregunta pequeña de la que depende que la normalización sea correcta.
//
// ── Por qué hace falta ───────────────────────────────────────────────────────────────────
// Casi todas las reglas que uno escribiría sin pensar cambian el dominio en algún punto:
//
//     0 · u  →  0        falso si u no está definida: `0·(1/x)` no vale 0 en x=0
//     u − u  →  0        falso por lo mismo: `1/x − 1/x` no vale 0 en x=0
//     u/u    →  1        falso en los ceros de u
//
// El motor actual convive con esto comprobando a posteriori, con una muestra numérica, si la
// transformación conservó la función (`mismaFuncion`). Funciona, y es un remiendo: la muestra no
// puede saber dónde mirar, y por eso hubo que enseñárselo con los puntos de quiebre.
//
// Aquí la corrección va por delante: una regla que podría cambiar el dominio **no se aplica**
// salvo que se pueda demostrar que en este caso no lo cambia. Esa demostración es esta función.
//
// ── Qué contesta, y qué no ───────────────────────────────────────────────────────────────
// `true` significa «esta expresión está definida en todo ℝ para cualquier valor de sus
// variables, con certeza». `false` significa «no lo sé», no «tiene agujeros». Es conservadora
// por diseño y su fallo posible es «no normalizo», nunca «normalizo mal» — que es exactamente el
// mismo criterio con el que está escrito el guardián actual, y el correcto para una pieza de la
// que dependen otras.

import { type Expresion } from "../nucleo/expresion";
import { enteroDe } from "../nucleo/numero";
import { fichaDe } from "../registro/catalogo";

/**
 * ¿Está `e` definida para cualquier valor real de sus variables?
 *
 * Los tres casos que dan `true` son los tres que se pueden afirmar sin más información: un
 * átomo, una combinación de cosas siempre definidas por operaciones totales, y una función cuyo
 * registro DECLARA que no necesita ninguna condición.
 */
export function siempreDefinida(e: Expresion): boolean {
  switch (e.clase) {
    case "literal":
    case "simbolo":
    case "constante":
      return true;

    case "suma":
      return e.sumandos.every(siempreDefinida);
    case "producto":
      return e.factores.every(siempreDefinida);

    case "potencia": {
      // Solo el exponente ENTERO NO NEGATIVO es una operación total. Uno negativo es una
      // división (polo en los ceros de la base) y uno fraccionario es una raíz (índice par:
      // negativo fuera). Un exponente que no sea un literal no se sabe qué es.
      if (e.exponente.clase !== "literal") return false;
      const k = enteroDe(e.exponente.numero);
      return k !== null && k >= 0n && siempreDefinida(e.base);
    }

    case "aplicacion": {
      const ficha = fichaDe(e.funcion);
      // Sin ficha, o sin dominio declarado, no se afirma nada. Que `tan` no declare sus polos
      // —son un retículo infinito, no la anulación de un subárbol— la deja aquí en el lado
      // seguro: no se puede demostrar que esté siempre definida, así que se contesta `false`.
      if (ficha?.dominioNatural === undefined) return false;
      return ficha.dominioNatural(e.args).length === 0 && e.args.every(siempreDefinida);
    }

    // Una rama son dos curvas, una condición es una restricción explícita y una familia es un
    // conjunto infinito de valores. Ninguna de las tres es «una función definida en todo ℝ», y
    // fingir que sí lo es abriría la puerta a que la normalización las aplastara.
    case "rama":
    case "condicionado":
    case "familia":
      return false;
  }
}
