// ─────────────────────────────────────────────
// io/leer · El tokenizador (PURO)
// ─────────────────────────────────────────────
//
// Parte el texto escrito en piezas con nombre. Es la primera mitad del lector propio, y la que
// sustituye a la parte del `parser.ts` histórico que reescribe la cadena con expresiones
// regulares antes de dárselo a mathjs.
//
// ── Un tokenizador NO decide nada ────────────────────────────────────────────────────────
// Aquí no se sabe qué es un producto, ni qué precedencia tiene nada, ni si `sin` lleva
// paréntesis. Solo se dice «esto es un número, esto un comando, esto un paréntesis». Toda la
// interpretación es de `latex.ts`. Esa separación es la que hace que las dos mitades se puedan
// probar por separado, cosa que con 49 regex encadenadas no se podía.
//
// ── Las posiciones se conservan ──────────────────────────────────────────────────────────
// Cada token lleva dónde empezaba. Hoy no lo usa nadie; existe porque un error de lectura con
// posición (`«se esperaba una expresión en la columna 7»`) es una funcionalidad que el motor de
// hoy no puede dar —mathjs informa del error sobre la cadena ya reescrita, que no es la que el
// usuario escribió— y que ya no habrá que rehacer nada para tenerla.

import { FRACCIONES_UNICODE, GRADO, SUPERINDICES, UNICODE_A_NOMBRE } from "./notacion";

export type TipoToken =
  | "numero"      // 12, 3.5
  | "nombre"      // x, alpha, sin  (una letra, o un nombre completo)
  | "comando"     // \sin, \frac  (sin la barra)
  | "operador"    // + - * / ^ = < > _
  | "abre"        // ( [ {
  | "cierra"      // ) ] }
  | "barra"       // |  (valor absoluto: el analizador decide si abre o cierra)
  | "coma"
  | "fin";

export interface Token {
  readonly tipo: TipoToken;
  readonly texto: string;
  readonly desde: number;
}

/** ¿El carácter puede empezar un número? */
const esDigito = (c: string): boolean => c >= "0" && c <= "9";
/** ¿Es una letra ASCII? Las griegas llegan como comando o como carácter Unicode propio. */
const esLetra = (c: string): boolean =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

const ABRE = "([{";
const CIERRA = ")]}";
/** Operadores de un solo carácter. `_` entra porque `\log_2` lo usa como subíndice. */
const OPERADORES = "+-*/^=<>_";

/**
 * Parte `entrada` en tokens. No lanza nunca: un carácter que no reconoce se descarta, igual que
 * hace hoy el lector histórico con los comandos residuales. Lo que sí se conserva es la posición,
 * para que quien quiera dar un error pueda señalarlo.
 */
export function tokenizar(entrada: string): Token[] {
  const out: Token[] = [];
  const emitir = (tipo: TipoToken, texto: string, desde: number): void => {
    out.push({ tipo, texto, desde });
  };

  let i = 0;
  while (i < entrada.length) {
    const c = entrada[i];

    // Espacios: separan, no significan. (El producto implícito lo decide el analizador
    // mirando qué tokens quedan pegados, no los huecos: `2x` y `2 x` son lo mismo.)
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }

    // Comando LaTeX: barra invertida y el nombre que sigue. Un comando de un solo carácter no
    // alfabético (`\,`, `\;`, `\!`) también cuenta: son espaciados y el analizador los descarta.
    if (c === "\\") {
      const desde = i;
      i++;
      if (i < entrada.length && !esLetra(entrada[i])) {
        emitir("comando", entrada[i], desde);
        i++;
        continue;
      }
      let nombre = "";
      while (i < entrada.length && esLetra(entrada[i])) { nombre += entrada[i]; i++; }
      emitir("comando", nombre, desde);
      continue;
    }

    // Número: dígitos con una coma decimal opcional. El signo NO entra aquí —es un operador— para
    // que `2-3` sean tres tokens y no dos.
    if (esDigito(c) || (c === "." && esDigito(entrada[i + 1] ?? ""))) {
      const desde = i;
      let texto = "";
      while (i < entrada.length && esDigito(entrada[i])) { texto += entrada[i]; i++; }
      if (entrada[i] === "." && esDigito(entrada[i + 1] ?? "")) {
        texto += ".";
        i++;
        while (i < entrada.length && esDigito(entrada[i])) { texto += entrada[i]; i++; }
      }
      emitir("numero", texto, desde);
      continue;
    }

    // Letras. Se emite UNA a UNA: `xy` son dos nombres, y que `sin` sea una función lo decide el
    // analizador consultando el catálogo. Emitir aquí el nombre más largo obligaría al
    // tokenizador a conocer el catálogo, y entonces ya no sería un tokenizador.
    if (esLetra(c)) {
      emitir("nombre", c, i);
      i++;
      continue;
    }

    // Griegas y demás nombres de un solo carácter Unicode.
    const comoNombre = UNICODE_A_NOMBRE[c];
    if (comoNombre !== undefined) { emitir("nombre", comoNombre, i); i++; continue; }

    // Fracción Unicode: se emite ya partida, que es lo que significa.
    const frac = FRACCIONES_UNICODE[c];
    if (frac !== undefined) {
      emitir("abre", "(", i);
      emitir("numero", String(frac[0]), i);
      emitir("operador", "/", i);
      emitir("numero", String(frac[1]), i);
      emitir("cierra", ")", i);
      i++;
      continue;
    }

    // Superíndices Unicode: `x²` es `x^(2)`, `sin⁻¹` es `sin^(-1)`.
    const sup = SUPERINDICES[c];
    if (sup !== undefined) {
      const desde = i;
      let digitos = "";
      while (i < entrada.length && SUPERINDICES[entrada[i]] !== undefined) {
        digitos += SUPERINDICES[entrada[i]];
        i++;
      }
      emitir("operador", "^", desde);
      emitir("abre", "(", desde);
      if (digitos.startsWith("-") || digitos.startsWith("+")) {
        emitir("operador", digitos[0], desde);
        digitos = digitos.slice(1);
      }
      emitir("numero", digitos === "" ? "1" : digitos, desde);
      emitir("cierra", ")", desde);
      continue;
    }

    // El símbolo de grado es un operador POSPUESTO (`30°`). Se emite como tal en vez de
    // descartarse: antes caía en la papelera del final y `\sin(90°)` se leía como el seno de 90
    // RADIANES, que es una curva distinta dibujada en silencio.
    if (c === GRADO) { emitir("operador", GRADO, i); i++; continue; }

    // Símbolos que son operadores con otra cara.
    if (c === "·" || c === "×") { emitir("operador", "*", i); i++; continue; }
    if (c === "÷") { emitir("operador", "/", i); i++; continue; }
    if (c === "≤") { emitir("operador", "<=", i); i++; continue; }
    if (c === "≥") { emitir("operador", ">=", i); i++; continue; }
    if (c === "−") { emitir("operador", "-", i); i++; continue; }   // menos tipográfico

    if (ABRE.includes(c)) { emitir("abre", c, i); i++; continue; }
    if (CIERRA.includes(c)) { emitir("cierra", c, i); i++; continue; }
    if (c === "|") { emitir("barra", c, i); i++; continue; }
    if (c === ",") { emitir("coma", c, i); i++; continue; }

    if (OPERADORES.includes(c)) {
      // `<=` y `>=` escritos con dos caracteres.
      if ((c === "<" || c === ">") && entrada[i + 1] === "=") {
        emitir("operador", `${c}=`, i);
        i += 2;
        continue;
      }
      emitir("operador", c, i);
      i++;
      continue;
    }

    // Cualquier otra cosa: se descarta. Es el mismo criterio que el lector histórico aplica a
    // los comandos que no conoce, y mantenerlo evita que una nota con un carácter raro deje de
    // dibujarse por un error de lectura.
    i++;
  }

  emitir("fin", "", entrada.length);
  return out;
}
