import { Plugin, Notice, MarkdownRenderer } from "obsidian";
import { evaluate, simplify, parse } from "mathjs";

function normalizarEntrada(expr: string): string {
  let e = expr;
  e = e.replace(/\^\{([^}]+)\}/g, (_, exp) => {
    return /^-?[a-zA-Z0-9]+$/.test(exp.trim()) ? "^" + exp.trim() : "^(" + exp.trim() + ")";
  });
  e = e.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");
  e = e.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");
  e = e.replace(/\\cdot/g, "*");
  e = e.replace(/\\([a-zA-Z]+)/g, "$1");
  return e;
}

function parsearEcuacionLineal(ecuacion: string): { vars: Record<string, number>; rhs: number } | null {
  try {
    const partes = ecuacion.split("=");
    if (partes.length !== 2) return null;
    const lhsRaw = normalizarEntrada(partes[0].trim());
const rhsRaw = normalizarEntrada(partes[1].trim());
let rhs: number;
try {
  rhs = evaluate(rhsRaw);
} catch {
  return null;
}
if (!isFinite(rhs)) return null;
const lhs = lhsRaw;
    const vars: Record<string, number> = {};

    const lhsNormalizado = lhs.replace(/^\s*([^+-])/, "+$1");
    const terminos = lhsNormalizado.match(/[+-][^+-]+/g);
    if (!terminos) return null;

    for (const termino of terminos) {
      const t = termino.trim();
      const matchVar = t.match(/^([+-]?\s*\d*\.?\d*)\s*([a-zA-Z])$/);
      if (matchVar) {
        let coefStr = matchVar[1].replace(/\s/g, "");
        const variable = matchVar[2];
        let coef: number;
        if (coefStr === "" || coefStr === "+") coef = 1;
        else if (coefStr === "-") coef = -1;
        else coef = parseFloat(coefStr);
        if (isNaN(coef)) coef = 1;
        vars[variable] = (vars[variable] || 0) + coef;
      }
    }

    if (Object.keys(vars).length === 0) return null;
    return { vars, rhs };
  } catch {
    return null;
  }
}

function resolverSistema(ecuaciones: string[]): Record<string, number> | string {
  const parseadas = ecuaciones.map(parsearEcuacionLineal);
  if (parseadas.some(p => p === null)) return "No se pudo parsear una o mas ecuaciones";

  const conjuntoVars = new Set<string>();
  for (const p of parseadas) for (const v of Object.keys(p!.vars)) conjuntoVars.add(v);
  const variables = Array.from(conjuntoVars).sort();
  const n = variables.length;

  if (parseadas.length < n) return "Sistema subdeterminado: hay mas variables que ecuaciones";

  const matriz: number[][] = parseadas.slice(0, n).map(p => {
    const fila = variables.map(v => p!.vars[v] || 0);
    fila.push(p!.rhs);
    return fila;
  });

  for (let col = 0; col < n; col++) {
    let maxFila = col;
    for (let fila = col + 1; fila < n; fila++) {
      if (Math.abs(matriz[fila][col]) > Math.abs(matriz[maxFila][col])) maxFila = fila;
    }
    [matriz[col], matriz[maxFila]] = [matriz[maxFila], matriz[col]];

    if (Math.abs(matriz[col][col]) < 1e-10) return "El sistema no tiene solucion unica";

    for (let fila = col + 1; fila < n; fila++) {
      const factor = matriz[fila][col] / matriz[col][col];
      for (let j = col; j <= n; j++) matriz[fila][j] -= factor * matriz[col][j];
    }
  }

  const solucion: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    solucion[i] = matriz[i][n];
    for (let j = i + 1; j < n; j++) solucion[i] -= matriz[i][j] * solucion[j];
    solucion[i] /= matriz[i][i];
  }

  const resultado: Record<string, number> = {};
  for (let i = 0; i < n; i++) resultado[variables[i]] = solucion[i];
  return resultado;
}

function limpiarTex(tex: string): string {
  let t = tex;
  t = t.replace(/~\s*/g, "");
  t = t.replace(/\{\s*([a-zA-Z0-9])\s*\}/g, "$1");
  t = t.replace(/(\d)\s+([a-zA-Z\\])/g, "$1$2");
  // Elimina espacio al inicio del tex generado
  t = t.trim();
  return t;
}

function ecuacionALatex(ecuacion: string): string {
  try {
    const partes = ecuacion.split("=");
    if (partes.length !== 2) return ecuacion;

    const lhs = normalizarEntrada(partes[0].trim());
    const rhs = partes[1].trim();

    const nodoLhs = parse(lhs);
    const texLhs = limpiarTex((nodoLhs as any).toTex({ parenthesis: "keep" }));

    const nodoRhs = parse(rhs);
    const texRhs = limpiarTex((nodoRhs as any).toTex({ parenthesis: "keep" }));

    return texLhs + "=" + texRhs;
  } catch {
    return ecuacion;
  }
}

export default class ObsiMathPlugin extends Plugin {
  async onload() {
    console.log("Obsi Math: plugin cargado");
    new Notice("¡Obsi Math se ha cargado correctamente!");

    this.registerMarkdownCodeBlockProcessor("obs-math", async (source, el, ctx) => {
      const contenedor = el.createDiv({ cls: "obsi-math-container" });
      const textoOriginal = source.trim();

      try {
        const partes = textoOriginal.split("=");
        const expresion = normalizarEntrada(partes.length > 1 ? partes[1].trim() : partes[0].trim());

        let latex = "f(x)=" + expresion;
        try {
          const nodoParseado = parse(expresion);
          let tex = (nodoParseado as any).toTex({ parenthesis: "keep" });
          tex = limpiarTex(tex);
          latex = "f(x)=" + tex;
        } catch {}

        let formaSimplificada = "";
        try {
          const nodoSimplificado = simplify(expresion);
          formaSimplificada = nodoSimplificado.toString();
        } catch {}

        const contenedorLatex = contenedor.createDiv({ cls: "obsi-math-latex" });
        await MarkdownRenderer.render(this.app, "$$" + latex + "$$", contenedorLatex, ctx.sourcePath, this);

        const esConstanteCero = formaSimplificada === "0";
        const evaluarEnX = (valorX: number): number => evaluate(expresion, { x: valorX });
        const infoBox = contenedor.createDiv({ cls: "obsi-math-info" });

        if (esConstanteCero) {
          infoBox.createEl("p", { text: "Interseccion Y: (0, 0.0000)" });
          infoBox.createEl("p", { text: "Todos los valores de x son raices (funcion identicamente cero)" });
        } else {
          const interseccionY = evaluarEnX(0);
          const minX = -10;
          const maxX = 10;
          const pasos = 200;
          const delta = (maxX - minX) / pasos;
          const UMBRAL_PENDIENTE = 50;
          const raices: number[] = [];
          const vertices: { x: number; y: number; tipo: string }[] = [];

          let xAnterior = minX;
          let yAnterior = evaluarEnX(xAnterior);
          let xActualLoop = minX + delta;
          let yActualLoop = evaluarEnX(xActualLoop);

          for (let i = 2; i <= pasos; i++) {
            const xSiguiente = minX + i * delta;
            const ySiguiente = evaluarEnX(xSiguiente);

            if (isFinite(yAnterior) && isFinite(yActualLoop) && isFinite(ySiguiente)) {
              const pendiente = Math.abs((ySiguiente - yAnterior) / delta);
              const derivadaAntes = yActualLoop - yAnterior;
              const derivadaDespues = ySiguiente - yActualLoop;

              if (derivadaAntes < 0 && derivadaDespues > 0 && pendiente < UMBRAL_PENDIENTE) {
                vertices.push({ x: xActualLoop, y: yActualLoop, tipo: "Vertice min" });
              } else if (derivadaAntes > 0 && derivadaDespues < 0 && pendiente < UMBRAL_PENDIENTE) {
                vertices.push({ x: xActualLoop, y: yActualLoop, tipo: "Vertice max" });
              }

              if (yAnterior === 0) {
                raices.push(xAnterior);
              } else if (yAnterior * yActualLoop < 0 && pendiente < UMBRAL_PENDIENTE) {
                const raizAprox = xAnterior - yAnterior * (xActualLoop - xAnterior) / (yActualLoop - yAnterior);
                raices.push(raizAprox);
              }
            }

            xAnterior = xActualLoop;
            yAnterior = yActualLoop;
            xActualLoop = xSiguiente;
            yActualLoop = ySiguiente;
          }

          if (isFinite(interseccionY)) {
            infoBox.createEl("p", { text: "Interseccion Y: (0, " + interseccionY.toFixed(4) + ")" });
          } else {
            infoBox.createEl("p", { text: "Interseccion Y: no definida (discontinuidad en x=0)" });
          }

          if (raices.length > 0) {
            infoBox.createEl("p", { text: "Raices: " + raices.map(r => r.toFixed(4)).join(", ") });
          } else {
            infoBox.createEl("p", { text: "No hay raices reales" });
          }

          for (const v of vertices) {
            infoBox.createEl("p", { text: v.tipo + ": (" + v.x.toFixed(4) + ", " + v.y.toFixed(4) + ")" });
          }
        }
      } catch (error) {
        contenedor.createEl("p", { text: "Error: " + (error as Error).message });
      }
    });

    this.registerMarkdownCodeBlockProcessor("obs-sistema", async (source, el, ctx) => {
      const contenedor = el.createDiv({ cls: "obsi-math-container" });

      try {
        const ecuaciones = source.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);

        if (ecuaciones.length < 2) {
          contenedor.createEl("p", { text: "Error: se necesitan al menos 2 ecuaciones" });
          return;
        }

        const infoBox = contenedor.createDiv({ cls: "obsi-math-info" });

        // Mostrar cada ecuacion renderizada en la misma linea
        for (let i = 0; i < ecuaciones.length; i++) {
          const fila = infoBox.createDiv();
          fila.style.display = "flex";
          fila.style.alignItems = "center";
          fila.style.gap = "6px";
          fila.style.marginBottom = "4px";
          fila.createSpan({ text: "Ecuacion " + (i + 1) + ":" });
          const contenedorLatexEc = fila.createSpan();
          const latexEc = ecuacionALatex(ecuaciones[i]);
          await MarkdownRenderer.render(this.app, "$" + latexEc + "$", contenedorLatexEc, ctx.sourcePath, this);
        }

        infoBox.createEl("br");

        // Resolver y mostrar solucion
        const resultado = resolverSistema(ecuaciones);

        if (typeof resultado === "string") {
          infoBox.createEl("p", { text: "Error: " + resultado });
        } else {
          const filaSolucion = infoBox.createDiv();
          filaSolucion.style.display = "flex";
          filaSolucion.style.alignItems = "center";
          filaSolucion.style.gap = "6px";
          filaSolucion.createSpan({ text: "Solucion:" });
          const contenedorSolucion = filaSolucion.createSpan();
          const latexSolucion = Object.entries(resultado)
            .map(([v, val]: [string, number]) => v + "=" + val.toFixed(4))
            .join(",\\;");
          await MarkdownRenderer.render(this.app, "$" + latexSolucion + "$", contenedorSolucion, ctx.sourcePath, this);
        }
      } catch (error) {
        contenedor.createEl("p", { text: "Error: " + (error as Error).message });
      }
    });
  }

  onunload() {
    console.log("Obsi Math: plugin descargado");
  }
}