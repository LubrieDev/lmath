// ─────────────────────────────────────────────
// despeje · El contrato que devuelve cada estrategia
// ─────────────────────────────────────────────
//
// Toda estrategia del despejador responde lo mismo: la ecuación resultante y si el despeje
// quedó COMPLETO (aislado del todo) o solo parcial; o `null` si esa estrategia no aplica.
//
// Estaba escrito a mano, idéntico, en quince firmas. Cualquier cambio en lo que el despejador
// devuelve era una edición en quince sitios, y bastaba olvidar uno para que el tipo dejara de
// decir la verdad en silencio.
export interface ResultadoDespeje {
  /** La ecuación ya transformada, como string mathjs re-parseable. */
  ecuacion: string;
  /** ¿Quedó `y` aislada del todo? `false` = se avanzó, pero sigue habiendo `y` a la derecha. */
  completo: boolean;
}
