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
  type Setting,
  type SettingDefinitionItem,
} from "obsidian";

import { IDIOMA_POR_DEFECTO, IDIOMAS, fijarIdioma, t, type Idioma } from "../i18n";

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
  /** Idioma de la INTERFAZ del plugin (ver `IDIOMAS`). No es una transformación; se guarda en
   *  este mismo objeto porque comparte la maquinaria de persistencia (loadData/saveData). El
   *  idioma ACTIVO lo lleva el módulo i18n (`fijarIdioma`); esta clave es su copia persistida. */
  /** Unidad en la que obs-trig ROTULA los ángulos. Es presentación pura: la entrada de un
   *  bloque son radianes siempre (como en todo LMath) y cambiar esto NO reinterpreta nada de lo
   *  escrito. Era el último objetivo pendiente de la hoja de ruta original del README. */
  unidadAngulo: "degrees" | "radians" | "gradians";
  /** ¿El arrastre del círculo trigonométrico se pega a los ángulos notables (múltiplos de 15°)? */
  imanTrig: boolean;
  idioma: Idioma;
}

/** Valores por defecto (no despejar automáticamente; simplificar SIEMPRE se aplica;
 *  los puntos notables NO se pintan, para que el plano salga limpio de entrada —el resumen
 *  del ⓘ los sigue listando—; el idioma por defecto es inglés, ver i18n.IDIOMA_POR_DEFECTO). */
export const AJUSTES_POR_DEFECTO: AjustesTransformaciones = {
  despejarAuto: false,
  puntosNotables: false,
  encuadreAuto: true,
  unidadAngulo: "radians",
  imanTrig: true,
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
  /**
   * Se suscribe a los cambios de ajustes y devuelve su BAJA. Lo usan los bloques ya montados
   * para enterarse en el momento, sin esperar a que la nota se vuelva a renderizar. La baja es
   * idempotente: llamarla dos veces (al rehacerse y al desmontarse) no es un error.
   */
  alCambiarAjustes(oyente: () => void): () => void;
  /** Avisa a todos los suscritos. La llama esta pestaña después de persistir cada cambio. */
  notificarCambioDeAjustes(): void;
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
  /** La fila del selector de idioma, mientras está montada. Ver la nota en su `render`. */
  private filaIdioma: Setting | null = null;

  constructor(app: App, private readonly plugin: PluginConAjustes) {
    super(app, plugin);
  }

  /** Escribe el rótulo y la descripción de la fila del idioma en el idioma ACTIVO. */
  private escribirFilaIdioma(): void {
    const T = t();
    this.filaIdioma?.setName(T.ajustes.idioma.nombre);
    this.filaIdioma?.setDesc(T.ajustes.idioma.desc);
  }

  /**
   * Definición declarativa de la pestaña. Los `key` son las propias claves de
   * `AjustesTransformaciones`, que `getControlValue`/`setControlValue` resuelven contra
   * `plugin.ajustes`.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const txt = t();
    return [
      // Idioma PRIMERO: cambiarlo reescribe el texto de TODA la pestaña, la suya incluida.
      //
      // Es la única fila que se monta de forma IMPERATIVA (`render`) en vez de declarativa, por
      // un motivo medido: Obsidian REUTILIZA la fila ya renderizada cuando su `name` no cambia,
      // y entonces no reescribe su `desc`. Con esta fila eso es un problema real, porque su
      // rótulo se traduce a sí mismo:
      //
      //     en → "Language"   ·   es → "Idioma"   ·   pt → "Idioma"
      //
      // Entre inglés y español el rótulo cambia, la fila se reconstruye y todo cuadra. Entre
      // español y portugués es BYTE A BYTE EL MISMO, así que la fila se reaprovechaba y la
      // descripción se quedaba en el idioma anterior. El síntoma parecía «el portugués no
      // funciona» cuando en realidad era «esta fila no se repinta si el rótulo coincide».
      //
      // Cambiar la palabra portuguesa lo habría tapado, pero por casualidad: volvería a romperse
      // con el próximo idioma que también diga «Idioma». Con `render` guardamos el `Setting` y le
      // reescribimos rótulo y descripción a mano en `setControlValue`, y deja de importar cómo
      // decida Obsidian reutilizar las filas.
      //
      // Se conservan `name` y `desc` en la definición porque son los que indexa el BUSCADOR de
      // ajustes; lo que pinta la fila es el `render`.
      {
        type: "group",
        heading: txt.ajustes.idioma.seccion,
        items: [
          {
            name: txt.ajustes.idioma.nombre,
            desc: txt.ajustes.idioma.desc,
            render: (setting) => {
              this.filaIdioma = setting;
              this.escribirFilaIdioma();
              setting.addDropdown((dd) => {
                const T = t();
                dd.addOption("en", T.ajustes.idioma.opcionEn);
                dd.addOption("es", T.ajustes.idioma.opcionEs);
                dd.addOption("pt", T.ajustes.idioma.opcionPt);
                dd.setValue(this.plugin.ajustes.idioma);
                dd.onChange((v) => { void this.setControlValue("idioma", v); });
              });
              return () => { this.filaIdioma = null; };
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
      {
        type: "group",
        heading: txt.ajustes.trig.seccion,
        items: [
          {
            name: txt.ajustes.trig.unidad.etiqueta,
            desc: txt.ajustes.trig.unidad.detalle,
            control: {
              type: "dropdown",
              key: "unidadAngulo",
              // Las CLAVES son lo que se guarda en data.json, así que van en inglés como el resto
              // de la superficie pública. Lo que se ve en el desplegable es el texto traducido.
              options: {
                degrees: txt.ajustes.trig.opcionGrados,
                radians: txt.ajustes.trig.opcionRadianes,
                gradians: txt.ajustes.trig.opcionGradianes,
              },
            },
          },
          {
            name: txt.ajustes.trig.iman.etiqueta,
            desc: txt.ajustes.trig.iman.detalle,
            control: { type: "toggle", key: "imanTrig" },
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
      case "unidadAngulo":
        return this.plugin.ajustes.unidadAngulo;
      case "imanTrig":
        return this.plugin.ajustes.imanTrig;
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
   *
   * Y al final, SIEMPRE, el aviso a los bloques. Es lo que hace que un ajuste se vea en el
   * momento: antes la pestaña se repintaba al instante pero los bloques ya renderizados se
   * quedaban con el idioma, la unidad y las transformaciones con las que nacieron, y había que
   * tocar la nota para verlos cambiar. Va aquí, en el único sitio por el que pasan todos los
   * controles, y no en cada `case`: un ajuste nuevo lo hereda sin que nadie se acuerde de él.
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case "idioma": {
        // Se valida contra el INVENTARIO de idiomas (`IDIOMAS`), no con una cadena de ternarios.
        // La versión anterior era `value === "es" ? "es" : "en"`: al añadir el portugués el
        // desplegable ya lo ofrecía, pero esta línea lo colapsaba a inglés y el idioma nuevo no
        // se aplicaba nunca. Contra el inventario, un cuarto idioma funciona sin tocar nada aquí.
        const idioma: Idioma = (IDIOMAS as readonly string[]).includes(value as string)
          ? (value as Idioma)
          : IDIOMA_POR_DEFECTO;
        this.plugin.ajustes.idioma = idioma;
        fijarIdioma(idioma);
        await this.plugin.guardarAjustes();
        // `update()` repinta el resto de la pestaña. La fila del PROPIO selector no se puede
        // dejar en sus manos: Obsidian la reutiliza cuando su `name` no cambia, y entre español
        // y portugués el rótulo es el mismo («Idioma»), así que su descripción se quedaría en el
        // idioma anterior. Se reescribe a mano sobre el `Setting` que guarda su `render`.
        this.update();
        this.escribirFilaIdioma();
        this.plugin.notificarCambioDeAjustes();
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
      case "unidadAngulo":
        this.plugin.ajustes.unidadAngulo =
          value === "radians" ? "radians" : value === "gradians" ? "gradians" : "degrees";
        break;
      case "imanTrig":
        this.plugin.ajustes.imanTrig = value === true;
        break;
      default:
        return;
    }
    await this.plugin.guardarAjustes();
    this.plugin.notificarCambioDeAjustes();
  }

}
