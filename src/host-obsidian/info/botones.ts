// ─────────────────────────────────────────────
// host-obsidian · info/botones — el chip ⓘ y su cuadro de lecturas
// ─────────────────────────────────────────────
//
// Los tres ⓘ de los bloques de curva: el resumen de puntos notables de una explícita, el
// de obs-derivate y el de obs-integral. Lo que REDACTAN vive en `analysis/lineasAnalisis`
// (sin DOM); aquí solo se monta el chip, se pinta el cuadro y se alterna.
//
// El chip es lo ÚNICO que abre y cierra el cuadro. Un panel de lecturas se consulta
// mientras se trabaja con el plano: no se cierra al pulsar fuera, al contrario que un menú.

import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";

import type { Motor } from "../contexto";
import type { ExclusionPopover } from "./contratos";
import { estiloChipInfo, estiloPopoverInfo, CLASE_POPOVER_INFO } from "../ui/estilos";
import { ponerTooltip, montarIcono, pintarLineaPanel } from "../ui/controles";
import { ladoIcono } from "../ui/reparto";
import { lineasResumen, lineasDerivada, lineasIntegral } from "../analysis/lineasAnalisis";
import { t } from "../../i18n";
import { simplify } from "mathjs";
import { normalizarEntrada } from "../../parser";
import { compilarFuncion } from "../../evaluador";
import { analizarFuncion, tieneTrigonometria } from "../../analisis";
import { extraerIntegral, evaluarLimite } from "../../integral";
import { analizarDerivada } from "../../core/analysis/analisisDerivada";
import { analizarIntegral } from "../../core/analysis/analisisIntegral";
import { crearFuncionReal } from "../../core/fields/funcionRealMathjs";
import { insertarProductoImplicito } from "../../core/parsing/productoImplicito";
import type { AnalisisDerivada } from "../../core/analysis/analisisDerivada";
import type { AnalisisIntegral } from "../../core/analysis/analisisIntegral";

/**
 * Botón ⓘ + popover del bloque obs-derivate. Devuelve si llegó a montarse.
 *
 * `fExpr` es la función ESCRITA (cruda) y `dfExpr` la derivada ya normalizada que grafica
 * el motor: hacen falta las dos, porque todo se enmascara por el dominio de f (f′ = 1/x
 * evalúa en x<0, donde ln x no existe) y porque los puntos angulosos se buscan donde f es
 * continua pero f′ no. Perezoso y cacheado, como el de las integrales.
 */
export function montarBotonInfoDerivada(
  motor: Motor,
  wrap: HTMLElement, fExpr: string, dfExpr: string, ctx: MarkdownPostProcessorContext,
  lado: number, exclusion: ExclusionPopover
): boolean {
  let f: (x: number) => number;
  let df: (x: number) => number;
  try {
    // mathjs puede devolver Complex (√−1): fuera del dominio real = NaN, el mismo
    // contrato que `crearFuncionReal` y que usa el resumen cartesiano.
    const fc = compilarFuncion(insertarProductoImplicito(normalizarEntrada(fExpr)), "x");
    const dc = compilarFuncion(dfExpr, "x");
    f = (x) => { const v = fc(x); return typeof v === "number" ? v : NaN; };
    df = (x) => { const v = dc(x); return typeof v === "number" ? v : NaN; };
  } catch { return false; }

  const btnInfo = wrap.createDiv();
  ponerTooltip(btnInfo, t().botones.resumenDerivada);
  btnInfo.style.cssText = estiloChipInfo(lado);
  montarIcono(btnInfo, "info", ladoIcono(lado));

  const pop = wrap.createDiv({ cls: CLASE_POPOVER_INFO });
  pop.style.cssText = estiloPopoverInfo(lado);
  exclusion.registrar(() => pop.setCssStyles({ display: "none" }));

  const esTrig = tieneTrigonometria(dfExpr);
  let montado = false;
  const rellenar = () => {
    if (montado) return;
    montado = true;
    let A: AnalisisDerivada | null = null;
    try { A = analizarDerivada(f, df); } catch { /* sin panel, nunca una excepción */ }
    if (!A) return;
    // UN componente para todo el cuadro, no uno por línea: el cuadro se rellena una sola vez
    // (`montado`), y su vida es la del bloque, que es quien lo descarga.
    const hijo = new MarkdownRenderChild(pop);
    ctx.addChild(hijo);
    for (const l of lineasDerivada(A, esTrig)) {
      const div = pop.createDiv();
      pintarLineaPanel(motor.plugin, div, l.texto, ctx.sourcePath, hijo);
      // Los ítems de una lista se sangran para que se lean como lo que son: el
      // desglose de la línea de arriba, no cinco afirmaciones sueltas seguidas.
      if (l.sangrado) div.setCssStyles({ paddingLeft: "10px" });
    }
  };

  btnInfo.addEventListener("click", (e) => {
    e.stopPropagation();
    const abierto = pop.style.display !== "none";
    if (!abierto) { exclusion.alAbrir(); rellenar(); }
    pop.setCssStyles({ display: abierto ? "none" : "block" });
  });
  return true;
}

/**
 * Botón ⓘ + popover del bloque obs-integral. Devuelve si llegó a montarse (el llamador
 * necesita saberlo para colocar el botón f(x): los chips comparten esquina).
 *
 * El análisis se calcula PEREZOSAMENTE al abrir el cuadro y se cachea, como el de las
 * paramétricas: descomponer la integral son hasta siete cuadraturas más, y el bloque ya
 * hace dos al montarse (la clasificación del velo y el valor del panel). En un clic no se
 * nota; al montar una nota con varios bloques, sí. El contenido NO depende de la vista
 * —una integral definida es propiedad de (f, a, b), no del encuadre—, así que una vez
 * calculado no hay nada que refrescar al mover la cámara.
 */
export function montarBotonInfoIntegral(
  motor: Motor,
  wrap: HTMLElement, source: string, ctx: MarkdownPostProcessorContext,
  lado: number, exclusion: ExclusionPopover
): boolean {
  const it = extraerIntegral(source);
  if (!it) return false;
  const a = evaluarLimite(it.a), b = evaluarLimite(it.b);
  if (a === null || b === null) return false;   // límites simbólicos: el velo ya lo dice

  const btnInfo = wrap.createDiv();
  // Tooltip propio: este chip no resume "puntos notables" de ninguna curva.
  ponerTooltip(btnInfo, t().botones.resumenIntegral);
  btnInfo.style.cssText = estiloChipInfo(lado);
  montarIcono(btnInfo, "info", ladoIcono(lado));

  const pop = wrap.createDiv({ cls: CLASE_POPOVER_INFO });
  pop.style.cssText = estiloPopoverInfo(lado);
  exclusion.registrar(() => pop.setCssStyles({ display: "none" }));

  let montado = false;
  const rellenar = () => {
    if (montado) return;
    montado = true;
    let A: AnalisisIntegral | null = null;
    try {
      A = analizarIntegral(
        crearFuncionReal(insertarProductoImplicito(normalizarEntrada(it.integrando))), a, b);
    } catch { /* integrando que no compila: sin panel, nunca una excepción al abrir */ }
    if (!A) return;
    // Un solo componente para el cuadro entero: se rellena una vez y lo descarga el bloque.
    const hijo = new MarkdownRenderChild(pop);
    ctx.addChild(hijo);
    // La línea del VALOR trae su forma cerrada marcada entre `$…$` —y la cola en prosa
    // detrás—, como cualquier otra línea de cualquier otro cuadro.
    for (const l of lineasIntegral(A, it.variable, source))
      pintarLineaPanel(motor.plugin, pop.createDiv(), l, ctx.sourcePath, hijo);
  };

  btnInfo.addEventListener("click", (e) => {
    e.stopPropagation();
    const abierto = pop.style.display !== "none";
    if (!abierto) { exclusion.alAbrir(); rellenar(); }
    pop.setCssStyles({ display: abierto ? "none" : "block" });
  });
  return true;
}

/**
 * Botón ⓘ + popover con el resumen de puntos notables de la función (portado del
 * GraphEngine): intersección con Y, raíces y vértices. Los grupos periódicos
 * (trig que oscila → "infinitas") o excesivos ("demasiadas") se resumen en vez de
 * enumerarse. El análisis es sobre el rango fijo de `analizarFuncion` (agnóstico
 * de la vista actual), igual que en el motor original.
 */
export function montarBotonInfo(
  motor: Motor,
  wrap: HTMLElement, expr: string, ctx: MarkdownPostProcessorContext,
  lado: number, exclusion: ExclusionPopover
): void {
  // Defensivo: si `expr` no compila como f(x) (p.ej. una tupla paramétrica que se
  // colara), NO lanzar —abortaría el render del plano—, simplemente no montar el ⓘ.
  let evalX: (x: number) => number;
  // mathjs puede devolver un Complex (sqrt(-1)…) → fuera del dominio real = NaN
  // (mismo contrato que `crearFuncionReal`); aquí solo se usa como f(x) numérica.
  try {
    const evalXRaw = compilarFuncion(expr, "x");
    evalX = (x) => { const v = evalXRaw(x); return typeof v === "number" ? v : NaN; };
  } catch { return; }
  // Función idénticamente cero (simplifica a "0"): TODO x es raíz y la intersección
  // Y es (0,0). Se detecta como en el GraphEngine, con simplify sobre la expresión.
  let idénticamenteCero = false;
  try { idénticamenteCero = simplify(expr).toString() === "0"; } catch { /* no simplificable */ }

  // La redacción vive con las otras cuatro, en `analysis/lineasAnalisis`: cada línea es PROSA
  // con la matemática marcada entre `$…$`. Un punto notable es una expresión matemática y en
  // texto plano se lee peor —`(0, π/2)` obliga a decidir si esa barra divide o separa—.
  const lineas = lineasResumen(
    analizarFuncion(evalX), evalX(0), tieneTrigonometria(expr), idénticamenteCero);

  const btnInfo = wrap.createDiv();
  ponerTooltip(btnInfo, t().botones.resumenNotables);
  btnInfo.style.cssText = estiloChipInfo(lado);
  montarIcono(btnInfo, "info", ladoIcono(lado));

  const pop = wrap.createDiv({ cls: CLASE_POPOVER_INFO });
  pop.style.cssText = estiloPopoverInfo(lado);
  exclusion.registrar(() => pop.setCssStyles({ display: "none" }));

  // Se rellena al ABRIRLO por primera vez, no al montar el bloque. Antes se pintaba en el
  // montaje porque eran divs de texto y no costaban nada; ahora cada línea con matemática
  // pasa por el compositor, y una nota con varios bloques pagaría ese trabajo por cuadros
  // que quizá nadie abre. Los otros dos ⓘ ya se rellenaban así.
  let montado = false;
  const rellenar = () => {
    if (montado) return;
    montado = true;
    const hijo = new MarkdownRenderChild(pop);
    ctx.addChild(hijo);
    for (const l of lineas)
      pintarLineaPanel(motor.plugin, pop.createDiv(), l, ctx.sourcePath, hijo);
  };

  btnInfo.addEventListener("click", (e) => {
    e.stopPropagation();
    const abierto = pop.style.display !== "none";
    if (!abierto) { exclusion.alAbrir(); rellenar(); }   // la fórmula flotante y este cuadro no conviven
    pop.setCssStyles({ display: abierto ? "none" : "block" });
  });
}
