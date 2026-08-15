// ─────────────────────────────────────────────
// host-obsidian · contexto — lo que un bloque necesita del adaptador
// ─────────────────────────────────────────────
//
// Seis miembros. Eso es TODO lo que `MotorExperimental` guarda: el plugin, qué bloque es,
// sus ajustes vivos y cómo volver a montarse. El resto de la clase eran funciones que no
// tocaban ese estado, y por eso han podido salir a `ui/`, `analysis/` y `blocks/`.
//
// Se declara aparte de la clase para que los módulos extraídos dependan del CONTRATO y no
// de la clase: `blocks/trig.ts` importa este archivo, `MotorExperimental.ts` importa
// `blocks/trig.ts`, y no hay ciclo. El tipo se borra al compilar, así que no cuesta nada.

import type { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";

import type { AjustesTransformaciones, PluginConAjustes } from "./ajustes";

/**
 * QUÉ BLOQUE es este adaptador. Un solo valor en vez de una bandera por bloque: las banderas
 * booleanas eran combinables sobre el papel (`sistema && integral`) sin que ninguna combinación
 * significara nada, y cada bloque nuevo añadía un parámetro más a un constructor posicional
 * donde `new MotorExperimental(this, false, false, ajustes, true)` ya no se leía. Con el modo,
 * los estados imposibles no se pueden ni escribir y añadir un bloque es añadir un miembro.
 *
 *   • `graph`    → obs-graph: UNA función/curva (la 1ª ecuación del bloque).
 *   • `system`   → obs-system: varias ecuaciones a la vez, cada una con su color.
 *   • `derivate` → obs-derivate: como `graph`, pero el plano grafica la DERIVADA f'(x) de lo
 *                  escrito y el panel alterna operador/derivada (ver `process`).
 *   • `integral` → obs-integral: como `graph`, pero el plano grafica el INTEGRANDO f(x) y
 *                  SOMBREA ∫ₐᵇ f dx; el panel alterna operador/primitiva.
 *   • `trig`     → obs-trig: el círculo trigonométrico. Es el único que NO usa el motor de
 *                  curvas —ni `Camara`, ni `Escena`, ni proveedores—: su geometría es analítica
 *                  cerrada y la pinta su propio renderizador (ver `procesarTrig`).
 *   • `vector`   → obs-vector: notación vectorial. UNA TARJETA POR LÍNEA (no una fórmula por
 *                  bloque), y un plano SOLO si hay algo que dibujar. Tampoco usa el motor de
 *                  curvas: un vector es un segmento, no una curva que muestrear (ver
 *                  `procesarVector`).
 */
export type ModoBloque = "graph" | "system" | "derivate" | "integral" | "trig" | "vector";

/**
 * El adaptador visto por los módulos que montan un bloque. `MotorExperimental` es su
 * única implementación; se pasa `this` tal cual.
 */
export interface Motor {
  /** El plugin, para `app` (KaTeX, workspace) y para suscribirse a los ajustes. */
  readonly plugin: PluginConAjustes;
  /** Qué bloque se está montando. */
  readonly modo: ModoBloque;
  /** Preferencias VIVAS (no una foto): un cambio en la pestaña afecta al remontaje. */
  readonly obtenerAjustes: () => AjustesTransformaciones;
  /** Los tres rasgos derivados del modo que consulta el cuerpo del adaptador. */
  readonly sistema: boolean;
  readonly derivada: boolean;
  readonly integral: boolean;
  /** Ata el bloque montado a los cambios de ajustes (lo desmonta y lo rehace). */
  registrarRecarga(
    limpieza: MarkdownRenderChild,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void;
}
