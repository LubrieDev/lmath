// ─────────────────────────────────────────────
// math · Los puntos notables de una curva IMPLÍCITA, deducidos de su ecuación
// ─────────────────────────────────────────────
//
// El ⓘ de una curva no explícita (`x² + y² = 25`) leía sus puntos notables del TRAZADO y
// recortados a la vista: eran los vértices de la polilínea que hubiera dibujado el motor, con
// el encuadre de ese momento. Eso tenía dos consecuencias que no son matices. La respuesta
// cambiaba al mover el plano —una raíz fuera de la ventana sencillamente no existía, y por eso
// el cuadro terminaba en «En la vista actual.»—, y el valor era el del vértice de la polilínea,
// no el de la curva.
//
// Aquí las tres preguntas se le hacen a la ECUACIÓN, y las tres son sistemas que el motor ya
// sabe resolver (`resolverBloque`, con su forma exacta y sus estados honestos):
//
//   • Raíces          → F(x,y) = 0  ∩  y = 0
//   • Intersección Y  → F(x,y) = 0  ∩  x = 0
//   • Vértices        → F(x,y) = 0  ∩  ∂F/∂x = 0
//
// La tercera es la que no se ve de entrada. Por derivación implícita, dy/dx = −Fₓ/F_y: la
// tangente es horizontal donde Fₓ se anula y F_y no. La condición `F_y ≠ 0` no es un adorno:
// donde se anulan LAS DOS el punto es singular —la cúspide de `y² = x³` está en el origen, y
// ahí no hay tangente que valga— y llamarlo vértice sería falso. Por eso se filtra.
//
// Lo que este módulo NO hace es inventarse una respuesta cuando el sistema se le escapa:
// devuelve el estado que le dio el motor (`noResoluble`, `parcial`, `aproximado`) y es el panel
// quien decide cómo se dice. Una lista vacía de un sistema sin resolver no es «no hay».

import { derivative, parse } from "mathjs";

import { resolverBloque, type ResultadoBloque } from "./resolverSistema";
import { normalizarEntrada } from "../parser";
import { insertarProductoImplicito } from "../core/parsing/productoImplicito";
import { separarRestriccion } from "../core/parsing/restriccionDominio";

/**
 * Los tres grupos, cada uno con el estado con el que salió del motor. `vertices` es `null`
 * cuando la ecuación no se ha podido derivar respecto de x (una función que mathjs no sabe
 * derivar): es «no se ha preguntado», que no es lo mismo que «no hay».
 */
export interface NotablesImplicita {
  readonly raices: ResultadoBloque;
  readonly interseccionesY: ResultadoBloque;
  readonly vertices: ResultadoBloque | null;
}

/** Tolerancia con la que se decide que F_y NO se anula (ver la nota de cabecera). */
const TOL_FY = 1e-9;

/** `F` de una ecuación `izq = der`, en la sintaxis que entiende mathjs. */
function cuerpoF(ecuacion: string): string | null {
  // La restricción de dominio (`{0 ≤ x ≤ 4}`) no es parte de F: se la queda `resolverBloque`,
  // que es quien sabe aplicarla a las soluciones. Derivar con ella dentro no compilaría.
  const { expr } = separarRestriccion(ecuacion);
  const partes = expr.split("=");
  if (partes.length !== 2) return null;
  const lado = (s: string) => insertarProductoImplicito(normalizarEntrada(s.trim()));
  return `(${lado(partes[0])}) - (${lado(partes[1])})`;
}

/** La derivada parcial de `F` respecto de `variable`, o `null` si no se puede derivar. */
function parcial(F: string, variable: "x" | "y"): string | null {
  try {
    return derivative(parse(F), variable).toString();
  } catch {
    return null;   // mathjs no sabe derivar esto: se dirá que no se sabe, no otra cosa
  }
}

/** Evaluador de una expresión en (x, y); `null` si no compila. */
function evaluadorXY(expr: string): ((x: number, y: number) => number) | null {
  try {
    const c = parse(expr).compile();
    return (x, y) => {
      const v: unknown = c.evaluate({ x, y });
      return typeof v === "number" ? v : NaN;
    };
  } catch {
    return null;
  }
}

/**
 * Deja solo los puntos donde la tangente es de verdad horizontal: los que además cumplen
 * F_y ≠ 0. Sin `F_y` compilable no se filtra nada —no se puede decidir, y quitar puntos por
 * si acaso sería tan falso como dejarlos—.
 */
function soloTangenteHorizontal(r: ResultadoBloque, Fy: string | null): ResultadoBloque {
  if (r.tipo !== "puntos" || Fy === null) return r;
  const evaluar = evaluadorXY(Fy);
  if (evaluar === null) return r;
  return {
    ...r,
    puntos: r.puntos.filter((p) => {
      const v = evaluar(p.x, p.y);
      return Number.isFinite(v) && Math.abs(v) > TOL_FY;
    }),
  };
}

/**
 * Los puntos notables de la curva escrita, deducidos de la ecuación. `null` si lo escrito no
 * es una ecuación con dos lados (y entonces no hay curva implícita de la que hablar).
 *
 * Los parámetros tienen que venir ya SUSTITUIDOS por su valor: `y = Ax` no es una ecuación que
 * el motor pueda resolver, y quien llama ya tiene esa sustitución hecha para el plano.
 */
export function notablesDeImplicita(ecuacion: string): NotablesImplicita | null {
  const F = cuerpoF(ecuacion);
  if (F === null) return null;

  const raices = resolverBloque([ecuacion, "y = 0"]);
  const interseccionesY = resolverBloque([ecuacion, "x = 0"]);

  const Fx = parcial(F, "x");
  const vertices = Fx === null
    ? null
    : soloTangenteHorizontal(resolverBloque([ecuacion, `${Fx} = 0`]), parcial(F, "y"));

  return { raices, interseccionesY, vertices };
}
