// ─────────────────────────────────────────────
// host-obsidian · Ajustes del plugin (pestaña de configuración)
// ─────────────────────────────────────────────
//
// Cuarentena Obsidian: la ÚNICA pieza (con MotorExperimental y fuentes) que toca la API
// de Obsidian para la interfaz de configuración. Define las preferencias persistentes, sus
// valores por defecto y la pestaña oficial (PluginSettingTab) que aparece junto al
// interruptor del plugin en Ajustes → Complementos de la comunidad → LMath.
//
// Las preferencias las carga/guarda el plugin (loadData/saveData); esta pieza solo pinta la
// UI y escribe en el objeto de ajustes. El motor las CONSUME vía un getter (ver
// MotorExperimental): así un cambio en la pestaña se refleja en los bloques que se
// re-rendericen, sin recargar el plugin.

import {
  App,
  PluginSettingTab,
  type Plugin,
  type SettingDefinitionItem,
} from "obsidian";

import { IDIOMA_POR_DEFECTO, fijarIdioma, t, type Idioma } from "../i18n";

/** Preferencias persistentes del plugin. (La simplificación es SIEMPRE automática e
 *  incondicional, no es un ajuste: ver `baseAutomatica` en MotorExperimental.) */
export interface AjustesTransformaciones {
  /** Al renderizar, mostrar directamente el resultado DESPEJADO (y=f(x)); oculta el botón. */
  despejarAuto: boolean;
  /** ¿Pintar los MARCADORES de puntos notables (raíces, vértices, cortes Y) y las
   *  intersecciones del sistema? Preferencia de RENDER: el análisis se sigue haciendo (el ⓘ
   *  los lista igual) y el crosshair/carril —lectura interactiva, no marcadores— no cambian. */
  puntosNotables: boolean;
  /** ¿Acercar la vista inicial a las curvas ACOTADAS que dejan mucho plano vacío? (autoencuadre) */
  encuadreAuto: boolean;
  /** Idioma de la INTERFAZ del plugin ("en"|"es"). No es una transformación; se guarda en
   *  este mismo objeto porque comparte la maquinaria de persistencia (loadData/saveData). El
   *  idioma ACTIVO lo lleva el módulo i18n (`fijarIdioma`); esta clave es su copia persistida. */
  idioma: Idioma;
}

/** Valores por defecto (no despejar automáticamente; simplificar SIEMPRE se aplica;
 *  los puntos notables NO se pintan, para que el plano salga limpio de entrada —el resumen
 *  del ⓘ los sigue listando—; el idioma por defecto es inglés, ver i18n.IDIOMA_POR_DEFECTO). */
export const AJUSTES_POR_DEFECTO: AjustesTransformaciones = {
  despejarAuto: false,
  puntosNotables: false,
  encuadreAuto: true,
  idioma: IDIOMA_POR_DEFECTO,
};

/**
 * El plugin visto por la pestaña: un `Plugin` de Obsidian con el objeto de ajustes en
 * memoria y un método para persistirlos. Evita acoplar este módulo a la clase concreta
 * del plugin (main.ts) —solo depende de este contrato—.
 */
export interface PluginConAjustes extends Plugin {
  ajustes: AjustesTransformaciones;
  guardarAjustes(): Promise<void>;
}

/**
 * Pestaña de configuración oficial (API PluginSettingTab). Secciones idioma /
 * transformaciones / plano; cada cambio escribe en `plugin.ajustes` y persiste con
 * `plugin.guardarAjustes()` (loadData/saveData por debajo).
 *
 * La pestaña se declara SOLO de forma declarativa: `getSettingDefinitions()` describe las
 * secciones y sus controles, Obsidian las pinta e indexa sus ajustes en el buscador de
 * configuración, y lee/escribe vía `getControlValue`/`setControlValue`.
 *
 * Hasta la 1.3.1 convivía con un `display()` imperativo, el fallback obligado para Obsidian
 * 1.5–1.12, que no conoce esta API. Con `minAppVersion` en 1.13.0 ese camino ya no lo puede
 * recorrer nadie, así que se ha ido con él el único uso de un método deprecado que quedaba
 * en el plugin (la advertencia de la review de Obsidian).
 */
export class PestanaAjustesLMath extends PluginSettingTab {
  constructor(app: App, private readonly plugin: PluginConAjustes) {
    super(app, plugin);
  }

  /**
   * Definición declarativa de la pestaña. Los `key` son las propias claves de
   * `AjustesTransformaciones`, que `getControlValue`/`setControlValue` resuelven contra
   * `plugin.ajustes`.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const txt = t();
    return [
      // Idioma PRIMERO: cambiarlo repinta la pestaña (via update()) en el nuevo idioma.
      {
        type: "group",
        heading: txt.ajustes.idioma.seccion,
        items: [
          {
            name: txt.ajustes.idioma.nombre,
            desc: txt.ajustes.idioma.desc,
            control: {
              type: "dropdown",
              key: "idioma",
              options: {
                en: txt.ajustes.idioma.opcionEn,
                es: txt.ajustes.idioma.opcionEs,
              },
            },
          },
        ],
      },
      {
        type: "group",
        heading: txt.ajustes.transformaciones,
        items: [
          {
            name: txt.ajustes.despejarAuto.etiqueta,
            desc: txt.ajustes.despejarAuto.detalle,
            control: { type: "toggle", key: "despejarAuto" },
          },
        ],
      },
      {
        type: "group",
        heading: txt.ajustes.plano,
        items: [
          {
            name: txt.ajustes.puntosNotables.etiqueta,
            desc: txt.ajustes.puntosNotables.detalle,
            control: { type: "toggle", key: "puntosNotables" },
          },
          {
            name: txt.ajustes.encuadreAuto.etiqueta,
            desc: txt.ajustes.encuadreAuto.detalle,
            control: { type: "toggle", key: "encuadreAuto" },
          },
        ],
      },
    ];
  }

  /** Lee el valor actual de un control declarativo desde `plugin.ajustes`. */
  getControlValue(key: string): unknown {
    switch (key) {
      case "idioma":
        return this.plugin.ajustes.idioma;
      case "despejarAuto":
        return this.plugin.ajustes.despejarAuto;
      case "puntosNotables":
        return this.plugin.ajustes.puntosNotables;
      case "encuadreAuto":
        return this.plugin.ajustes.encuadreAuto;
      default:
        return undefined;
    }
  }

  /**
   * Persiste el cambio de un control declarativo: escribe en `plugin.ajustes` y guarda.
   * Para el idioma, además fija el idioma activo y REHACE las definiciones, que llevan los
   * textos ya traducidos dentro: sin esa llamada la pestaña se queda escrita en el idioma
   * anterior hasta que se cierra y se vuelve a abrir. `update()` es API de 1.13.0, así que
   * hasta esta versión (`minAppVersion` 1.12.7) referenciarla era `no-unsupported-api`.
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case "idioma": {
        const idioma: Idioma = value === "es" ? "es" : "en";
        this.plugin.ajustes.idioma = idioma;
        fijarIdioma(idioma);
        await this.plugin.guardarAjustes();
        this.update();
        return;
      }
      case "despejarAuto":
        this.plugin.ajustes.despejarAuto = value === true;
        break;
      case "puntosNotables":
        this.plugin.ajustes.puntosNotables = value === true;
        break;
      case "encuadreAuto":
        this.plugin.ajustes.encuadreAuto = value === true;
        break;
      default:
        return;
    }
    await this.plugin.guardarAjustes();
  }

}
