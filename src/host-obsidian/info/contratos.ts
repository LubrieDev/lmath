// ─────────────────────────────────────────────
// host-obsidian · info/contratos — los dos tipos del cuadro ⓘ
// ─────────────────────────────────────────────
//
// La fórmula flotante y el cuadro ⓘ se abren SOBRE el plano y compiten por el mismo sitio,
// así que son excluyentes. Se resuelve con este par —cada uno registra cómo se cierra y
// avisa de que se abre— y no con referencias cruzadas, porque los ⓘ posibles se montan en
// sitios distintos y ninguno debe conocer al resto.

/**
 * Los cuadros que se abren SOBRE el plano —el popover del ⓘ y la fórmula flotante— compiten
 * por el mismo sitio y por la misma atención, así que son EXCLUYENTES: abrir uno cierra el
 * otro. Se resuelve con este par en vez de con referencias cruzadas porque los tres ⓘ
 * posibles se montan en sitios distintos (dos en `process`, uno en `montarBotonInfo`) y
 * ninguno debe conocer al resto: cada uno registra cómo se cierra y avisa de que se abre.
 */
export interface ExclusionPopover {
/** Lo llama quien va a abrirse, para que se cierre lo que hubiera abierto. */
alAbrir: () => void;
/** Lo llama quien puede quedar abierto, para dejar dicho cómo se le cierra. */
registrar: (cerrar: () => void) => void;
}

/**
 * Una fila del panel ⓘ de `obs-trig`: rótulo a la izquierda, valor a la derecha.
 *
 * El tercer elemento la DESPEGA de la fila anterior con un filete. No es decoración: marca la
 * que no es un dato más de la lista sino su cierre —hoy, la identidad pitagórica al final de las
 * seis razones—. Es un separador dentro de la sección, no un título: si eso necesitara una
 * cabecera propia sería otra sección, y una sección de una sola fila no es una sección.
 */
export type FilaInfo = readonly [etiqueta: string, valor: string, separada?: boolean];
