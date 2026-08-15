// ─────────────────────────────────────────────
// vector · LaTeX del bloque obs-vector (PURO)
// ─────────────────────────────────────────────
//
// Una entrada del bloque → una cadena LaTeX → una tarjeta del panel. Nada más: aquí no se
// decide qué es cada línea (eso es `bloqueVector.ts`) ni cómo se coloca la tarjeta (eso es el
// host); solo cómo se ESCRIBE lo ya interpretado.
//
// Dos reglas gobiernan todo el módulo:
//
//  1. **La flecha del vector es `\vec{}`.** No un `→` en superíndice, ni una flecha compuesta a
//     mano: `\vec` es el comando con el que KaTeX dibuja la flecha rellena sobre la letra, con
//     su peso y su posición, y cualquier imitación se nota al lado de una fórmula de verdad.
//  2. **Las componentes pasan por el MISMO pipeline tipográfico que el resto de LMath**
//     (`exprALatex`). Así `\frac{1}{2}` sale como fracción, `sqrt(2)` como radical y `-y` como
//     `-y`, exactamente igual que si estuvieran dentro de un obs-graph de la misma nota. Un
//     bloque que compusiera su propia tipografía sería un bloque que se ve distinto.

import { exprALatex, ecuacionALatex } from "../latex";
import { comandosNoSoportados } from "../parser";
import type { BloqueVector, Entrada, Par } from "./bloqueVector";

/** Marcador de "aquí no hay nada escrito", el mismo que usa el panel de obs-graph. */
const VACIO = "\\text{[...]}";

/**
 * Bloque VACÍO: la forma que se ESPERA, no un hueco. `\vec{v}=[...]` dice de un vistazo qué se
 * escribe aquí, igual que el `f(x)=[...]` de obs-graph dice que ahí va una función.
 */
export const PLANTILLA_VACIA = `\\vec{v}=${VACIO}`;

/**
 * Tipografía de UNA expresión suelta (una componente, una línea libre).
 *
 * El desvío por `comandosNoSoportados` es lo que permite que `∇f(x,y)` se vea bien. El pipeline
 * de LMath traduce LaTeX a sintaxis de mathjs, y ante un comando que no conoce hace un barrido
 * comodín (`\nabla` → `nabla` → `n·a·b·l·a`): el resultado es válido, evalúa NaN y —lo que
 * importa aquí— se PINTA como cinco letras en cursiva. Con la lista de comandos no soportados
 * ya escrita en el parser, la salida segura es no tocar nada: KaTeX sabe pintar `\nabla`
 * perfectamente, es el traductor el que no sabe leerlo. Así el bloque acepta notación que el
 * motor no evalúa —que es justamente lo que se le pide a un bloque que solo escribe—.
 */
export function trozoALatex(texto: string): string {
  const s = texto.trim();
  if (s === "") return VACIO;
  return comandosNoSoportados(s).length > 0 ? s : exprALatex(s);
}

/** `(x, y)` con las dos componentes ya tipografiadas. El hueco tras la coma es el mismo
 *  (`,\ `) con el que el panel escribe los pares paramétricos: un par ordenado se ve igual
 *  en todo el plugin venga de donde venga. */
function parALatex(par: Par): string {
  return `\\left(${trozoALatex(par.x)},\\ ${trozoALatex(par.y)}\\right)`;
}

/**
 * La flecha que le toca a un nombre, que NO es siempre la misma.
 *
 * `\vec` está hecho para una sola letra: es una flecha corta y centrada sobre el glifo. Encima de
 * dos o más se queda a medias —`\vec{AB}` parece la flecha de la `A`, con la `B` fuera— y la
 * notación de toda la vida para eso es `\overrightarrow`, que se estira sobre el nombre entero.
 * Es la diferencia entre escribir el vector AB y escribir el vector A multiplicado por B.
 *
 * El criterio es cuántas LETRAS tiene el nombre, no cuántos caracteres, y solo cuenta la BASE: un
 * subíndice o una prima decoran una única variable (`v_1`, `v_a`, `u'` siguen siendo `\vec`).
 */
function conFlecha(nombre: string): string {
  const base = nombre.split("_")[0] ?? nombre;
  const letras = (base.match(/[A-Za-z]/g) ?? []).length;
  return letras > 1 ? `\\overrightarrow{${nombre}}` : `\\vec{${nombre}}`;
}

/**
 * El NOMBRE, con la decoración que le toca por su género.
 *
 * Un punto y un campo van desnudos; solo el vector lleva flecha. Esa asimetría es la notación
 * estándar y además es la única señal visible de la convención mayúscula/minúscula del parser:
 * al escribir `A=(1,2)` y ver `A` sin flecha, el usuario descubre la regla sin leer nada.
 */
function nombreALatex(entrada: Extract<Entrada, { tipo: "declaracion" }>): string {
  if (entrada.genero === "campo")
    return `${entrada.nombre}\\left(${entrada.parametros.join(",")}\\right)`;
  return entrada.genero === "vector" ? conFlecha(entrada.nombre) : entrada.nombre;
}

/**
 * El nombre con el que una entrada se ROTULA EN EL PLANO, o `null` si no se dibuja.
 *
 * Es el mismo nombre de la tarjeta y con la misma decoración —la flecha del vector, el punto
 * desnudo—, pero sin el `=` ni las componentes: junto a la flecha ya se ve adónde llega, y
 * repetir el par ahí solo taparía el dibujo. Que salga de este módulo, y no de una cadena
 * compuesta en el renderizador, es lo que garantiza que la `v` del plano y la `v` de su tarjeta
 * sean la MISMA letra: las dos pasan por KaTeX con el mismo LaTeX.
 *
 * `null` para lo que el plano no dibuja (un campo, una línea libre), que es exactamente la misma
 * frontera que aplica `dibujoDeBloque`.
 */
export function rotuloALatex(entrada: Entrada): string | null {
  switch (entrada.tipo) {
    case "declaracion":
      return entrada.genero === "campo" ? null : nombreALatex(entrada);
    case "diferencia":
      return conFlecha(`${entrada.desde}${entrada.hasta}`);
    case "libre":
      return null;
  }
}

/** LaTeX de UNA entrada del bloque. */
export function entradaALatex(entrada: Entrada): string {
  switch (entrada.tipo) {
    case "declaracion":
      return `${nombreALatex(entrada)}=${parALatex(entrada.par)}`;
    case "diferencia":
      // La flecha cubre las DOS letras —el vector que va de A a B—, y no una letra ni una flecha
      // por letra: son siempre dos, así que aquí `conFlecha` sale siempre por `\overrightarrow`.
      return `${conFlecha(`${entrada.desde}${entrada.hasta}`)}=${parALatex(entrada.par)}`;
    case "libre": {
      // Una línea libre con un `=` es una igualdad, y `ecuacionALatex` es quien sabe pintar las
      // dos mitades con la misma tipografía. Sin ese desvío, `w=u+v` se pintaría como una única
      // expresión y el `=` saldría del barrido de caracteres, no de la composición.
      const s = entrada.texto;
      if (comandosNoSoportados(s).length === 0 && s.split("=").length === 2)
        return ecuacionALatex(s);
      return trozoALatex(s);
    }
  }
}

/** LaTeX de TODO el bloque: una cadena por tarjeta, en el orden en que están escritas. */
export function bloqueVectorALatex(bloque: BloqueVector): readonly string[] {
  if (bloque.entradas.length === 0) return [PLANTILLA_VACIA];
  return bloque.entradas.map(entradaALatex);
}
