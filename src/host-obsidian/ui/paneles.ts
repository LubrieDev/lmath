// ─────────────────────────────────────────────
// host-obsidian · ui/paneles — el panel izquierdo y sus vistas
// ─────────────────────────────────────────────
//
// Los cuatro montajes del panel de fórmula: el de tres vistas de los operadores, el de
// obs-graph/obs-system con su desplegable de opciones, y los dos que los envuelven para
// obs-derivate y obs-integral. Comparten el scroller y el armazón del menú; lo único que
// los distingue es QUÉ opciones ofrecen, que es justo lo que cada uno escribe.

import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";

import type { Motor } from "../contexto";
import { alCambiarReparto, type Reparto } from "./reparto";
import { crearScrollerLatex } from "./scrollerLatex";
import { crearMenuDesplegable, cerrarMenuAlPulsarFuera } from "./menu";
import { estiloBotonPanel, estiloBotonOpciones } from "./estilos";
import { ponerTooltip, crearBotonOpciones, iconoBotonOpciones, montarEtiquetaMath } from "./controles";
import { montarCajaMandos } from "./deslizador";
import { montarIcono } from "./controles";
import { baseAutomatica } from "../analysis/transformaciones";
import {
  derivadaOperadorLatex, derivadaOperadorSimplificadoLatex, derivadaLatex,
} from "../../CAS/api-legado";
import {
  integralOperadorLatex, integralValorLatex, integralPrimitivaLatex,
} from "../../CAS/api-legado";
import { cuerpoAreaLatexExacto } from "../analysis/areaIntegral";
import { despejarEcuaciones } from "../../CAS/api-legado";
import { bloqueALatex } from "../../CAS/api-legado";
import { t } from "../../i18n";
import type { Parametro } from "../../core/parsing/parametros";

/**
 * Panel izquierdo de los bloques de OPERADOR (obs-derivate, obs-integral): el scroller de
 * fórmula + una barra de toggle de TRES vistas —el OPERADOR sin evaluar (la forma de
 * partida, vista por defecto), el RESULTADO evaluado, y AMBAS apiladas—. No cambia lo
 * graficado: el plano ya grafica lo suyo (la derivada, el integrando); esto solo alterna la
 * fórmula MOSTRADA, con el mismo lenguaje visual que el toggle de obs-graph.
 *
 * Los dos bloques comparten esta maquinaria ENTERA y se distinguen solo por sus textos: qué
 * fórmulas hay (`operador`/`resultado`), qué glifo lleva el botón principal y qué opciones
 * cuelgan del menú. Nada de eso justifica dos copias del mismo toggle.
 */
export async function montarPanelVistas(
  motor: Motor,
  contenedor: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  limpieza: MarkdownRenderChild,
  reparto: Reparto,
  config: {
    /**
     * La fórmula de PARTIDA (`d/dx(f)`, `∫ₐᵇ f dx`): vista por defecto. Puede ser VARIAS:
     * `obs-vector` pone aquí todas las líneas que declaran algo (una tarjeta por línea), y
     * entonces esta vista es un montón de tarjetas en vez de una.
     */
    readonly operador: string | readonly string[];
    /** La fórmula EVALUADA (`f'(x)=…`, `[F(x)]ₐᵇ = …`), o varias. */
    readonly resultado: string | readonly string[];
    /** Glifo matemático del botón principal (el que devuelve a la vista "operador"). */
    readonly glifoOperador: string;
    /** Tooltip del botón principal. */
    readonly tooltipOperador: string;
    /** Tooltip del botón de opciones CERRADO (lo que despliega). */
    readonly tooltipOpciones: string;
    readonly opciones: ReadonlyArray<{
      readonly etiqueta: string;
      readonly tex: string;
      readonly vista: "resultado" | "ambas";
    }>;
  }
): Promise<void> {
  const { panelLatex, renderLatex } = crearScrollerLatex(motor.plugin, contenedor, ctx, limpieza, reparto);
  // Cada vista es una LISTA de fórmulas, aunque casi siempre tenga una sola: así el mismo
  // toggle sirve para un bloque de operador (una fórmula por vista) y para `obs-vector` (una
  // tarjeta por línea declarada). `renderLatex` ya apila lo que le llegue.
  const enLista = (f: string | readonly string[]): readonly string[] =>
    typeof f === "string" ? [f] : f;
  const operador = enLista(config.operador);
  const resultado = enLista(config.resultado);

  // En "ambas" `latexDe` devuelve las dos vistas seguidas y `renderLatex` las apila, cada una
  // en su propia tarjeta con el mismo estilo que las vistas individuales.
  type Vista = "operador" | "resultado" | "ambas";
  const latexDe = (v: Vista): readonly string[] =>
    v === "operador" ? operador : v === "resultado" ? resultado : [...operador, ...resultado];
  // Firma comparable de una vista: las arrays no se comparan por identidad, así que se
  // colapsan a un string para decidir si una opción cambiaría lo mostrado (habilitarla).
  const firmaDe = (v: Vista): string => latexDe(v).join(" ");

  const { barra, menu, caja, itemEstilo } = crearMenuDesplegable(panelLatex);
  const btnOriginal = barra.createDiv();
  ponerTooltip(btnOriginal, config.tooltipOperador);
  montarEtiquetaMath(motor.plugin, btnOriginal, config.glifoOperador, ctx);
  const btnOpciones = crearBotonOpciones(barra, config.tooltipOpciones);

  const items = config.opciones.map((o) => {
    const el = caja.createDiv();
    ponerTooltip(el, o.etiqueta);
    montarEtiquetaMath(motor.plugin, el, o.tex, ctx);
    return el;
  });

  // "operador" (forma de partida) es la vista por defecto.
  let vista: Vista = "operador";
  let abierto = false;
  // ── La vista COMBINADA solo existe si hay sitio para las dos fórmulas ────────────────────
  // En el reparto por columnas el panel mide 261px y las dos tarjetas se reparten ~105 cada
  // una: se leen. En el FLOTANTE mide 180 y quedarían en ~72, que para una integral con sus
  // límites y un corchete de Barrow no es una fórmula pequeña sino una fórmula ilegible. Y no
  // hace falta: las dos vistas sueltas siguen ahí, y alternarlas es un toque.
  //
  // Depende del ANCHO y no del dispositivo, como todo lo que es reparto: una tablet en
  // horizontal tiene el mismo sitio que el escritorio y conserva la vista combinada, mientras
  // que un panel lateral estrecho en el escritorio sufre el mismo amontonamiento que el
  // teléfono y también la pierde. Ver la nota larga de `ui/reparto.ts`.
  const sobra = (v: Vista): boolean => reparto.estrecho && v === "ambas";
  // La opción está HABILITADA si aplicarla cambiaría la fórmula mostrada (su LaTeX difiere
  // del actual): así "Derivada" se apaga estando ya en la derivada evaluada.
  const sincronizar = () => {
    estiloBotonPanel(btnOriginal, vista === "operador");
    estiloBotonOpciones(btnOpciones, vista !== "operador" || abierto);
    iconoBotonOpciones(btnOpciones, abierto, config.tooltipOpciones);
    const actual = firmaDe(vista);
    items.forEach((el, i) => {
      const v = config.opciones[i].vista;
      itemEstilo(el, firmaDe(v) !== actual);
      // `itemEstilo` reescribe el `cssText` entero, así que el `display` va DESPUÉS o se
      // perdería en la siguiente sincronización.
      el.style.display = sobra(v) ? "none" : "";
    });
    menu.style.display = abierto ? "flex" : "none";
  };
  // Girar el teléfono a vertical con la vista combinada puesta la deja sin sitio: se vuelve al
  // operador, que es la forma de partida y la que el bloque enseña al abrirse. Al girar de nuevo
  // a horizontal la opción reaparece en el menú, pero la vista NO se restaura sola: recuperar
  // una vista que el usuario ya no está mirando es adivinar, y aquí basta con volver a elegirla.
  alCambiarReparto(reparto, () => {
    if (!sobra(vista)) { sincronizar(); return; }
    vista = "operador";
    void renderLatex(operador).then(sincronizar);
  });
  const aplicar = async (i: number) => {
    abierto = false;
    const v = config.opciones[i].vista;
    if (firmaDe(v) !== firmaDe(vista)) { vista = v; await renderLatex(latexDe(vista)); }
    sincronizar();
  };
  btnOriginal.addEventListener("click", () => void (async () => {
    abierto = false;
    if (vista !== "operador") { vista = "operador"; await renderLatex(operador); }
    sincronizar();
  })());
  btnOpciones.addEventListener("click", (e) => { e.stopPropagation(); abierto = !abierto; sincronizar(); });
  items.forEach((el, i) => el.addEventListener("click", () => void aplicar(i)));

  cerrarMenuAlPulsarFuera(barra, caja, limpieza, () => {
    if (!abierto) return;
    abierto = false;
    sincronizar();
  });

  sincronizar();
  await renderLatex(operador);
}

/**
 * Panel izquierdo de obs-graph / obs-system: el scroller de fórmula + la barra de
 * toggle de transformaciones ([Original] [Opciones ▾] con Simplificar / Despejar y).
 */
export async function montarPanelLatex(
  motor: Motor,
  contenedor: HTMLElement,
  ecuaciones: readonly string[],
  ctx: MarkdownPostProcessorContext,
  limpieza: MarkdownRenderChild,
  reparto: Reparto,
  /** Parámetros declarados y qué hacer al mover uno; sin ellos no hay vista de mandos. */
  mandos?: {
    parametros: readonly Parametro[];
    alCambiar: (nombre: string, valor: number) => void;
  }
): Promise<void> {
  const { panelLatex, zona, renderLatex } =
    crearScrollerLatex(motor.plugin, contenedor, ctx, limpieza, reparto);

  // ── Vista de MANDOS ─────────────────────────────────────────────────────────
  // Ocupa la misma caja que las tarjetas y se alterna con ellas desde la barra, igual que
  // obs-vector alterna entre lo declarado y el vector deducido. Se construye aquí, antes de
  // la barra, porque la barra necesita saber si existe para ofrecer su botón.
  const cajaMandos = mandos && mandos.parametros.length > 0
    ? montarCajaMandos(motor.plugin, panelLatex, mandos.parametros, ctx, mandos.alCambiar)
    : null;

  // ── Toggle de transformaciones del panel ────────────────────────────────────
  // Botones centrados arriba del panel para alternar la fórmula MOSTRADA (no cambia
  // lo graficado): [Original] [Opciones ▾]. La SIMPLIFICACIÓN es automática e
  // incondicional (siempre aplicada en `base`, sin botón: `x+x+x`→`3x`, `x/2` intacto).
  // La única transformación de MENÚ es Despejar y, para implícitas (`x³+y³=9`→`y=∛(9−x³)`),
  // y solo si no está en automático; se deshabilita si no cambiaría lo mostrado. La
  // `variable` de la etiqueta se renderiza en MATEMÁTICA (KaTeX), no con Lora: "Despejar $y$",
  // nombrando la variable explícitamente de cara a soportar despejar otras. Botones/menú
  // redondeados; el texto de interfaz usa Lora.
  // Base MOSTRADA por defecto: el panel arranca ya SIMPLIFICADO (y despejado si `despejarAuto`
  // está activo; orden formal despejar → simplificar), no en lo escrito; "Original" revierte a
  // ESA base. La transformación automática (despejar) se RETIRA del menú.
  const ajustes = motor.obtenerAjustes();
  const base = baseAutomatica(ecuaciones, ajustes);
  const original = bloqueALatex(base, motor.sistema);
  // Simplificar YA NO es una opción de menú: es automática e incondicional (aplicada en
  // `base`). La única transformación manual posible es Despejar y (para implícitas), y solo
  // si no está en automático. Sin ninguna manual no hay nada que alternar → se omite la barra.
  const todas: ReadonlyArray<{
    etiqueta: string; tex: string; auto: boolean; fn: (e: readonly string[]) => string[];
  }> = [
    // `etiqueta` = título accesible; `tex` = glifo matemático RENDERIZADO en el botón.
    { etiqueta: t().botones.despejarY, tex: "y=f(x)", auto: ajustes.despejarAuto, fn: despejarEcuaciones },
  ];
  const transformaciones = todas.filter((t) => !t.auto);

  // La barra existe si hay algo que alternar: una transformación manual, o la vista de
  // mandos. Antes solo lo primero, de ahí que una explícita sin despeje no tuviera barra.
  const hayTransformaciones = ecuaciones.length > 0 && transformaciones.length > 0;
  if (hayTransformaciones || cajaMandos) {
    // ESTADO encadenable: la expresión actual (strings re-parseables). Las
    // transformaciones se aplican sobre el estado ACTUAL (parte de la base mostrada).
    let estado: readonly string[] = base;

    const { barra, menu, caja, itemEstilo } = crearMenuDesplegable(panelLatex);
    const estiloBoton = (b: HTMLElement, activo: boolean) => estiloBotonPanel(b, activo);
    // "Original" ahora es un GLIFO matemático: `f(x)` en obs-graph; el sistema
    // `\scriptscriptstyle\begin{cases}~\\[1.1ex]~\end{cases}` (filas vacías) en obs-system. Título accesible aparte.
    const btnOriginal = barra.createDiv();
    ponerTooltip(btnOriginal, t().botones.original);
    montarEtiquetaMath(motor.plugin, 
      btnOriginal,
      motor.sistema ? "\\scriptscriptstyle\\begin{cases}~\\\\[1.1ex]~\\end{cases}" : "f(x)",
      ctx
    );
    // El botón de los MANDOS: mismo sitio y mismo trato que el resto de la barra, pero con
    // ICONO en vez de glifo matemático, porque lo que enseña no es otra forma de la fórmula
    // sino otra cosa. Se alterna con `display`: la vista de mandos ocupa la caja de las
    // tarjetas y la apaga mientras dura.
    const btnMandos = cajaMandos ? barra.createDiv() : null;
    if (btnMandos) {
      ponerTooltip(btnMandos, t().botones.parametros);
      montarIcono(btnMandos, "deslizadores", 16);
    }
    let enMandos = false;
    const verMandos = (si: boolean) => {
      enMandos = si;
      zona.setCssStyles({ display: si ? "none" : "flex" });
      cajaMandos?.setCssStyles({ display: si ? "flex" : "none" });
    };

    const btnOpciones = hayTransformaciones
      ? crearBotonOpciones(barra, t().botones.transformaciones) : null;

    // Cada opción es un div cuyo contenido es el GLIFO matemático de la transformación
    // (`y=f(x)` para Despejar), renderizado con KaTeX; el `etiqueta` queda como título
    // accesible. El estilo (habilitado/no) lo pone itemEstilo en cada sincronización.
    const items = transformaciones.map((t) => {
      const el = caja.createDiv();
      ponerTooltip(el, t.etiqueta);
      montarEtiquetaMath(motor.plugin, el, t.tex, ctx);
      return el;
    });

    let abierto = false;
    const esOriginal = () => bloqueALatex(estado) === original;
    // Una transformación está HABILITADA si aplicada al estado ACTUAL cambiaría la
    // expresión mostrada (se compara el LaTeX resultante con el actual).
    const sincronizar = () => {
      // El botón de la fórmula está ACTIVO cuando se está viendo la fórmula sin transformar;
      // estando en los mandos, ninguno de los dos lo está: son vistas hermanas.
      estiloBoton(btnOriginal, !enMandos && esOriginal());
      // Estilo del botón-ICONO (el mismo del ☰), no el de los botones de texto: un glifo
      // suelto dentro de una caja pensada para una palabra sale descentrado.
      if (btnMandos) estiloBotonOpciones(btnMandos, enMandos);
      if (btnOpciones) {
        estiloBotonOpciones(btnOpciones, (!enMandos && !esOriginal()) || abierto);
        iconoBotonOpciones(btnOpciones, abierto, t().botones.transformaciones);
      }
      const actual = bloqueALatex(estado);
      items.forEach((el, i) => itemEstilo(el, bloqueALatex(transformaciones[i].fn(estado)) !== actual));
      menu.style.display = abierto ? "flex" : "none";
    };
    const aplicar = async (i: number) => {
      abierto = false;
      verMandos(false);   // transformar es hablar de la fórmula: se vuelve a ella
      const nuevo = transformaciones[i].fn(estado);
      if (bloqueALatex(nuevo) !== bloqueALatex(estado)) { estado = nuevo; await renderLatex(bloqueALatex(estado)); }
      sincronizar();
    };
    btnOriginal.addEventListener("click", () => void (async () => {
      abierto = false;
      verMandos(false);
      if (!esOriginal()) { estado = base; await renderLatex(original); }
      sincronizar();
    })());
    btnMandos?.addEventListener("click", () => {
      abierto = false;
      verMandos(!enMandos);   // el mismo botón lleva y trae, como el f(x) del plano
      sincronizar();
    });
    btnOpciones?.addEventListener("click", (e) => { e.stopPropagation(); abierto = !abierto; sincronizar(); });
    items.forEach((el, i) => el.addEventListener("click", () => void aplicar(i)));

    // Clic fuera de la barra/menú → cerrar el desplegable.
    cerrarMenuAlPulsarFuera(barra, caja, limpieza, () => {
      if (!abierto) return;
      abierto = false;
      sincronizar();
    });

    sincronizar();
  }

  await renderLatex(original);
}

/**
 * Panel izquierdo de obs-derivate: las dos fórmulas del bloque —el operador sin evaluar
 * `\frac{d}{dx}\left(f\right)` y la derivada evaluada `f'\left(x\right) = …`— servidas al
 * toggle común (`montarPanelVistas`), que arranca en el OPERADOR: es la forma de partida,
 * análoga al `f(x)` de obs-graph. No transforma lo graficado —el plano SIEMPRE grafica la
 * derivada, ver `process`—: solo alterna la fórmula MOSTRADA.
 */
export async function montarPanelDerivada(
  motor: Motor,
  contenedor: HTMLElement,
  ecuaciones: readonly string[],
  ctx: MarkdownPostProcessorContext,
  limpieza: MarkdownRenderChild,
  reparto: Reparto
): Promise<void> {
  // Las DOS representaciones que puede mostrar el panel: el OPERADOR sin evaluar YA con la
  // función SIMPLIFICADA (`d/dx(6x)`, la vista "Original"/por defecto, análoga a `f(x)` de
  // obs-graph: la forma de PARTIDA) y la DERIVADA evaluada (`f'(x)=…`, la opción del menú:
  // el RESULTADO). El operador NO cambia la derivada evaluada: solo muestra lo que se deriva.
  const operadorSimp = derivadaOperadorSimplificadoLatex(ecuaciones); // null si no es explícito
  // El operador con la función simplificada; si el bloque no es explícito (no hay forma
  // simplificable), cae al operador crudo `d/dx(f)`.
  const operador = operadorSimp ?? derivadaOperadorLatex(ecuaciones);

  await montarPanelVistas(motor, contenedor, ctx, limpieza, reparto, {
    operador,
    resultado: derivadaLatex(ecuaciones),
    glifoOperador: "\\frac{d}{dx}\\left(f(x)\\right)",
    tooltipOperador: t().botones.operador,
    tooltipOpciones: t().botones.derivadaEvaluada,
    opciones: [
      { etiqueta: t().botones.derivada, tex: "f'(x)", vista: "resultado" },
      // Vista combinada: su glifo APILA el operador sobre la derivada (representa que
      // muestra ambas expresiones a la vez, una debajo de la otra).
      {
        etiqueta: t().botones.operadorYDerivada,
        tex: "\\begin{matrix}\\frac{d}{dx}\\left(f(x)\\right)\\\\ f'\\left(x\\right)\\end{matrix}",
        vista: "ambas",
      },
    ],
  });
}

/**
 * Panel izquierdo de obs-integral: el scroller de fórmula + una barra de toggle de TRES
 * vistas, espejo EXACTO del panel de obs-derivate (§6.4):
 *   • [Operador] (por defecto): la integral sin evaluar `\int_a^b f\,dx` (forma de partida).
 *   • Primitiva: la regla de BARROW `\left[F(x)\right]_a^b = <valor>`, con F la antiderivada
 *     simbólica (`integralPrimitivaLatex` → `integrarExpr`) y el valor numérico ya presente.
 *     Es el análogo de la "derivada evaluada" (`f'(x)=…`). Si el integrador NO cubre este
 *     integrando, cae al VALOR sin corchete (`\int_a^b f\,dx = <área>`, la vista de siempre).
 *   • Operador y primitiva: ambas apiladas (operador arriba, primitiva debajo) — la forma
 *     del mockup del usuario.
 * No cambia lo graficado (el plano SIEMPRE grafica el integrando y sombrea la región): solo
 * alterna la fórmula MOSTRADA. El área se calcula UNA vez; si es un caso límite del Nivel 2,
 * el cuerpo es la etiqueta (`\text{Integral divergente}`).
 */
export async function montarPanelIntegral(
  motor: Motor,
  contenedor: HTMLElement,
  source: string,
  ctx: MarkdownPostProcessorContext,
  limpieza: MarkdownRenderChild,
  reparto: Reparto
): Promise<void> {
  const operador = integralOperadorLatex(source);
  // El VALOR del área, en su representación EXACTA cuando existe (`\frac{8}{3}`, `\frac{\pi}{2}`,
  // `\ln 3`…) vía Barrow simbólico, y `\approx <decimal>` si es irracional sin forma cerrada.
  const { cuerpo, conector } = cuerpoAreaLatexExacto(source);
  // La PRIMITIVA en forma de Barrow, con el valor enganchado por el mismo conector
  // (`\left[F\right]_a^b = <valor exacto>`): muestra la antiderivada Y conserva el número. Si
  // `integralPrimitivaLatex` devuelve null (integrando fuera de alcance), la vista "resultado"
  // cae al valor sin corchete = la vista "Valor" de antes.
  const barrow = integralPrimitivaLatex(source);
  // SIN valor (`cuerpo === null`: integrando degenerado, integral divergente, límites no
  // numéricos…): el panel se queda con la FÓRMULA —los corchetes de Barrow, o el operador— y
  // NINGUNA etiqueta. El diagnóstico vive en un solo sitio, el PLANO (velo + etiqueta formal,
  // como "Indeterminada"); una etiqueta en el panel LaTeX lo repetía en el lugar equivocado:
  // el panel es la fórmula, no el veredicto.
  const resultado = cuerpo === null
    ? (barrow ?? operador)
    : barrow
      ? `${barrow} ${conector} ${cuerpo}`
      : integralValorLatex(source, cuerpo, conector);

  await montarPanelVistas(motor, contenedor, ctx, limpieza, reparto, {
    operador,
    resultado,
    // Glifo del botón principal: el operador integral (`∫ₐᵇ f dx`), análogo al `d/dx(f(x))`
    // del botón "Operador" de obs-derivate.
    glifoOperador: "\\int_a^b f(x)\\,dx",
    tooltipOperador: t().botones.operador,
    tooltipOpciones: t().botones.primitivaEvaluada,
    opciones: [
      // La PRIMITIVA evaluada (glifo `[F(x)]_a^b`) y AMBAS (operador apilado sobre
      // primitiva). Espejo de "Derivada" / "Operador y derivada" de obs-derivate.
      { etiqueta: t().botones.primitiva, tex: "\\left[F(x)\\right]_a^b", vista: "resultado" },
      {
        etiqueta: t().botones.operadorYPrimitiva,
        tex: "\\begin{matrix}\\int_a^b f\\,dx\\\\ \\left[F(x)\\right]_a^b\\end{matrix}",
        vista: "ambas",
      },
    ],
  });
}
