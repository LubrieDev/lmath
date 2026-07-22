// ─────────────────────────────────────────────
// fields · Oráculo CampoEscalar sobre mathjs (CUARENTENA de mathjs)
// ─────────────────────────────────────────────
//
// Convierte la expresión diferencia F(x,y) = (lhs)-(rhs) de una ecuación
// implícita en un `CampoEscalar` evaluable. REUTILIZA `compilarExpresion` del
// motor antiguo (mismas funciones que obs-graph/obs-system). Coacciona cualquier
// no-número (Complex de mathjs) a NaN = "fuera del dominio real", igual que el
// oráculo explícito. No provee gradiente analítico: el descubridor y el trazador
// usan diferencias finitas (el contrato lo permite).

import { compilarCampo } from "../../evaluador";
import type { CampoEscalar } from "../contracts";

export function crearCampoEscalar(exprDiferencia: string): CampoEscalar {
  try {
    // `compilarCampo` intenta primero el compilador NATIVO (ver compiladorNativo.ts) y cae
    // a mathjs si no puede garantizar la equivalencia. Aquí importa especialmente: el
    // descubrimiento por rejilla, la continuación (4 evaluaciones por gradiente), la sonda
    // de alta frecuencia y el marching squares se apoyan TODOS en este oráculo.
    const g = compilarCampo(exprDiferencia);
    return {
      eval: (x: number, y: number): number => {
        const v = g(x, y);
        return typeof v === "number" ? v : NaN;
      },
    };
  } catch {
    return { eval: () => NaN };
  }
}
