// ─────────────────────────────────────────────
// migracion · Modal de migración (la interfaz del botón)
// ─────────────────────────────────────────────
//
// Tres estados en un mismo modal: escaneando → resumen → resultado. Es deliberadamente aburrido:
// una operación que reescribe notas ajenas no debe tener ni animaciones ni sorpresas, y el botón
// que la dispara no se pinta hasta que hay una cifra concreta que enseñar al lado.
//
// Nada de estilos en el código: las clases `.lmath-mig-*` viven en el `styles.css` de la raíz, en
// una sección marcada como TEMPORAL —Obsidian solo carga ese archivo— porque la regla
// `obsidianmd/no-static-styles-assignment` de la review tumbó una release por esto exacto.
// Nada de `innerHTML` tampoco: se construye con `createEl`, que además escapa el texto solo —y
// aquí se pintan rutas de notas del usuario, que son texto arbitrario.

import { Modal, type App } from "obsidian";

import { RENOMBRES } from "./nombres";
import { aplicar, escanear, type Plan } from "./vault";
import { tm } from "./textos";

export class ModalMigracion extends Modal {
  /** Se avisa al cerrar para que los ajustes puedan refrescar su descripción (y para marcar el
   *  aviso como visto sin que este modal tenga que saber nada de la persistencia). */
  private readonly alCerrar: (() => void) | undefined;

  constructor(app: App, alCerrar?: () => void) {
    super(app);
    this.alCerrar = alCerrar;
  }

  onOpen(): void {
    const txt = tm();
    this.titleEl.setText(txt.modalTitulo);
    this.contentEl.addClass("lmath-mig");

    this.pintarCabecera();

    const zona = this.contentEl.createDiv({ cls: "lmath-mig-zona" });
    zona.createEl("p", { text: txt.escaneando, cls: "lmath-mig-estado" });

    // El escaneo es asíncrono y puede tardar en un vault grande; el modal ya está en pantalla
    // con la tabla de nombres, así que la espera se lee como contexto y no como un cuelgue.
    void escanear(this.app).then(
      (plan) => { this.pintarResumen(zona, plan); },
      () => { zona.empty(); zona.createEl("p", { text: txt.nadaQueHacer, cls: "lmath-mig-estado" }); }
    );
  }

  onClose(): void {
    this.contentEl.empty();
    this.alCerrar?.();
  }

  /** La tabla de renombrado y la nota de compatibilidad: lo que no cambia entre estados. */
  private pintarCabecera(): void {
    const txt = tm();
    this.contentEl.createEl("p", { text: txt.modalIntro });

    const tabla = this.contentEl.createEl("table", { cls: "lmath-mig-tabla" });
    const cabecera = tabla.createEl("thead").createEl("tr");
    cabecera.createEl("th", { text: txt.columnaAntes });
    cabecera.createEl("th", { text: "→" , cls: "lmath-mig-flecha" });
    cabecera.createEl("th", { text: txt.columnaAhora });

    const cuerpo = tabla.createEl("tbody");
    for (const r of RENOMBRES) {
      const fila = cuerpo.createEl("tr");
      fila.createEl("td").createEl("code", { text: r.viejo });
      fila.createEl("td", { text: "→", cls: "lmath-mig-flecha" });
      fila.createEl("td").createEl("code", { text: r.nuevo, cls: "lmath-mig-nuevo" });
    }

    this.contentEl.createEl("p", { text: txt.compatibilidad, cls: "lmath-mig-calma" });
  }

  /** Estado 2: lo encontrado, y el botón que lo aplica. */
  private pintarResumen(zona: HTMLElement, plan: Plan): void {
    const txt = tm();
    zona.empty();

    if (plan.bloques === 0) {
      zona.createEl("p", { text: txt.nadaQueHacer, cls: "lmath-mig-estado" });
      this.pintarBotones(zona, [{ etiqueta: txt.cerrar, principal: true, accion: () => { this.close(); } }]);
      return;
    }

    zona.createEl("p", {
      text: txt.resumen(plan.bloques, plan.notas.length),
      cls: "lmath-mig-resumen",
    });

    const lista = zona.createDiv({ cls: "lmath-mig-lista" });
    for (const nota of plan.notas) {
      const fila = lista.createDiv({ cls: "lmath-mig-fila" });
      fila.createSpan({ text: nota.archivo.path, cls: "lmath-mig-ruta" });
      fila.createSpan({
        text: txt.bloquesEnNota(nota.hallazgos.length),
        cls: "lmath-mig-cuenta",
      });
    }

    zona.createEl("p", { text: txt.advertencia, cls: "lmath-mig-aviso" });

    this.pintarBotones(zona, [
      { etiqueta: txt.cancelar, principal: false, accion: () => { this.close(); } },
      {
        etiqueta: `${txt.confirmar} (${plan.bloques})`,
        principal: true,
        accion: () => { void this.ejecutar(zona, plan); },
      },
    ]);
  }

  /** Estado 3: se aplica y se informa. */
  private async ejecutar(zona: HTMLElement, plan: Plan): Promise<void> {
    const txt = tm();
    zona.empty();
    zona.createEl("p", { text: txt.escaneando, cls: "lmath-mig-estado" });

    const resultado = await aplicar(this.app, plan);

    zona.empty();
    zona.createEl("p", {
      text: txt.hecho(resultado.bloquesCambiados, resultado.notasCambiadas),
      cls: "lmath-mig-resumen",
    });

    if (resultado.fallos.length > 0) {
      zona.createEl("p", { text: txt.fallos(resultado.fallos.length), cls: "lmath-mig-aviso" });
      const lista = zona.createDiv({ cls: "lmath-mig-lista" });
      for (const fallo of resultado.fallos) {
        lista.createDiv({ cls: "lmath-mig-fila" }).createSpan({
          text: fallo.ruta,
          cls: "lmath-mig-ruta",
        });
      }
    }

    this.pintarBotones(zona, [
      { etiqueta: txt.cerrar, principal: true, accion: () => { this.close(); } },
    ]);
  }

  private pintarBotones(
    zona: HTMLElement,
    botones: readonly { etiqueta: string; principal: boolean; accion: () => void }[]
  ): void {
    const barra = zona.createDiv({ cls: "lmath-mig-botones" });
    for (const b of botones) {
      const boton = barra.createEl("button", { text: b.etiqueta });
      if (b.principal) boton.addClass("mod-cta");
      boton.addEventListener("click", b.accion);
    }
  }
}
