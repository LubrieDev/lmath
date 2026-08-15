// ─────────────────────────────────────────────
// i18n · Textos de la interfaz (internacionalización)
// ─────────────────────────────────────────────
//
// Módulo AGNÓSTICO del framework (no toca Obsidian ni el DOM): solo tablas de textos y
// un puntero al idioma activo. El host (host-obsidian/*) fija el idioma al cargar el
// plugin y en cada cambio de la pestaña de ajustes, y consume `t()` para pintar.
//
// El MOTOR (src/motor, degeneradas.ts, integral.ts…) NO depende de este módulo: sigue
// devolviendo sus etiquetas canónicas en español (las fijan los tests). Esas —y solo
// esas— se traducen en la frontera del host con `localizarVelo`, un mapa es→en de las
// etiquetas del velo. Por eso el idioma por defecto es inglés pero el núcleo no cambia.

export type Idioma = "en" | "es" | "pt";

export const IDIOMAS: readonly Idioma[] = ["en", "es", "pt"];
export const IDIOMA_POR_DEFECTO: Idioma = "en";

import { EN, VELO_NUCLEO_EN } from "./en";
import { ES } from "./es";
import { PT, VELO_NUCLEO_PT } from "./pt";
import type { EtiquetaVelo, Textos } from "./textos";

// El contrato se reexporta desde aquí: `import { t, type Textos } from "../i18n"` sigue
// siendo la única puerta del módulo, y quien solo consume textos no necesita saber que
// las tablas viven en un archivo por idioma.
export type { EtiquetaVelo, Textos } from "./textos";

const RECURSOS: Record<Idioma, Textos> = { en: EN, es: ES, pt: PT };

let idiomaActual: Idioma = IDIOMA_POR_DEFECTO;

/** Fija el idioma activo (validado; un valor desconocido cae al idioma por defecto). */
export function fijarIdioma(id: string | undefined): void {
  idiomaActual = (IDIOMAS as readonly string[]).includes(id ?? "")
    ? (id as Idioma)
    : IDIOMA_POR_DEFECTO;
}

/** Idioma activo. */
export function idiomaActivo(): Idioma {
  return idiomaActual;
}

/** Textos del idioma activo. Uso: `t().botones.acercar`, `t().solucion.yMas(3)`. */
export function t(): Textos {
  return RECURSOS[idiomaActual];
}

/**
 * Localiza una etiqueta de velo PRODUCIDA POR EL NÚCLEO (español canónico) al idioma
 * activo. En español se devuelve intacta; en los demás idiomas se busca su traducción por
 * el texto canónico y, si no está mapeada, se conserva el original (nunca rompe el render).
 */
export function localizarVelo(velo: EtiquetaVelo): EtiquetaVelo {
  if (idiomaActual === "es") return velo;
  const mapa = idiomaActual === "pt" ? VELO_NUCLEO_PT : VELO_NUCLEO_EN;
  return mapa[velo.etiqueta] ?? velo;
}
