// ─────────────────────────────────────────────
// núcleo · Igualdad estructural (PURA)
// ─────────────────────────────────────────────
//
// **El hash filtra; la estructura decide.** Es un invariante del núcleo, no una preferencia de
// implementación, y este archivo es donde se cumple.
//
// Un hash de 32 bits colisiona: con unas decenas de miles de expresiones distintas la
// probabilidad de que dos compartan hash deja de ser despreciable. Si el hash decidiera, el
// motor afirmaría que dos expresiones distintas son la misma —y eso, en la pieza cuya razón de
// ser es la corrección, es el peor fallo imaginable: no daría un resultado impreciso, daría un
// resultado FALSO con toda la confianza del mundo—.
//
// El coste de confirmar es despreciable justamente porque el filtro funciona: cuando dos
// expresiones son distintas, casi siempre lo dice el hash y no hay que recorrer nada; cuando el
// hash coincide, casi siempre es porque de verdad son iguales y el recorrido termina en un
// árbol que se comparte.
//
// `tests/modules/nucleo.test.ts` comprueba esto de la única manera que sirve: fabricando una
// colisión a mano y verificando que `iguales` NO se la traga.

import { type Expresion, recorrer } from "./expresion";
import { comparar } from "./orden";

/**
 * ¿Son la misma expresión? Filtro por hash y confirmación estructural.
 *
 * La confirmación se delega en `comparar`, que ya recorre todos los campos de todas las clases:
 * tener dos recorridos que se puedan desincronizar sería peor que uno un poco más general.
 */
export function iguales(a: Expresion, b: Expresion): boolean {
  if (a === b) return true;
  if (a.hash !== b.hash) return false;   // el filtro: barato y solo puede decir «distintas»
  return comparar(a, b) === 0;           // la decisión: estructural, y es la que manda
}

/** ¿Aparece `sub` (estructuralmente) en algún punto del árbol de `e`? */
export function contiene(e: Expresion, sub: Expresion): boolean {
  let hay = false;
  recorrer(e, (n) => { if (!hay && iguales(n, sub)) hay = true; });
  return hay;
}

/** Deduplica una lista de expresiones conservando el orden de aparición. */
export function sinRepetidas(es: readonly Expresion[]): Expresion[] {
  const out: Expresion[] = [];
  for (const e of es) if (!out.some((o) => iguales(o, e))) out.push(e);
  return out;
}
