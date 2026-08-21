// ─────────────────────────────────────────────
// CAS · La fachada del MOTOR HISTÓRICO (transitoria)
// ─────────────────────────────────────────────
//
// Todo lo que el plugin le pide hoy al CAS y que todavía hace el motor de antes de la reforma.
// Se reexporta tal cual, sin cambiar una coma de comportamiento.
//
// ── Para qué sirve una fachada de lo que va a desaparecer ────────────────────────────────
// Para que desaparezca sin que nadie se entere. Los consumidores —paneles, bloques, el motor de
// dibujo— importan de aquí; cuando una capacidad se traslade al núcleo, se cambia la línea de
// este archivo y no las quince de los que la usaban.
//
// ── Es el marcador de progreso ───────────────────────────────────────────────────────────
// Este archivo solo puede encoger. Cada etapa de la migración le quita exportaciones; cuando se
// quede vacío, la transición habrá terminado y el archivo se borra. Si alguna vez CRECE, es que
// algo se está construyendo en el sitio equivocado.
//
// ── La deuda que declara ─────────────────────────────────────────────────────────────────
// Debajo de esto hay mathjs, hay cadenas viajando entre etapas, hay centinelas `pm`/`dom`/`fam` y
// hay un impresor de LaTeX post-procesado con expresiones regulares. Nada de eso asoma al núcleo:
// vive aquí y en `puente/`, que son los dos sitios donde está permitido.

// ── Lectura de la notación escrita ───────────────────────────────────────────
export { normalizarEntrada, contieneYLibre, comandosNoSoportados } from "../parser";

// ── Escritura: expresión → LaTeX ─────────────────────────────────────────────
export { exprALatex, ecuacionALatex, bloqueALatex } from "../latex";

// ── Transformaciones algebraicas ─────────────────────────────────────────────
export { simplificarExpr, simplificarEcuaciones, simplificarBloqueLatex } from "../simplificar";
export {
  despejar, despejarEcuaciones, despejarBloqueLatex, despejarY, despejeExplicito,
} from "../despejar";
export { type ResultadoDespeje } from "../despeje/contrato";

// ── Cálculo ──────────────────────────────────────────────────────────────────
export {
  derivarExpr, derivarEcuacion, derivadaLatex, derivadaOperadorLatex,
  derivadaOperadorSimplificadoLatex, extraerFuncion,
} from "../derivar";
export { integrarExpr } from "../integrar";
// `evaluarArea` y compañía YA NO ESTÁN aquí: el área numérica y su tipografía se fueron a
// `host-obsidian/analysis/areaIntegral.ts` al partir `integral.ts`. No es una omisión —es que
// dejaron de ser CAS, y una fachada del CAS que siguiera ofreciéndolas volvería a mezclar lo que
// acabamos de separar.
export {
  type Integral, extraerIntegral, evaluarLimite,
  integralOperadorLatex, integralPrimitivaLatex, integralValorLatex,
} from "../integral";

// ── Resolución exacta ────────────────────────────────────────────────────────
export {
  type Solucion, type ResultadoSistema, type ResultadoBloque,
  resolverSistema, resolverBloque,
} from "../math/resolverSistema";
export { type RamaEcuacion, ramasDe } from "../math/ramas";
export { type NotablesImplicita, notablesDeImplicita } from "../math/notablesImplicita";
export { DOMINIO_X } from "../math/numerico";

// ── Dominio y condiciones ────────────────────────────────────────────────────
export {
  type Restriccion, type TipoRestriccion,
  restriccionesDe, fueraDeDominio, puntosDeQuiebre, variablesLibresDe, mismaFuncion,
} from "../math/dominio";
export {
  type ResultadoCond, type RangoCond, type ExtremoCond, simplificarCondiciones,
} from "../condiciones";

// ── Evaluación numérica (la frontera donde se pierde la exactitud) ───────────
export { compilarExpresion, compilarFuncion, compilarCampo, evaluarConstante } from "../evaluador";
export { type FuncionDegenerada, clasificarDegenerada } from "../degeneradas";

// ── Números y polinomios exactos ─────────────────────────────────────────────
export { type Racional, rac, aNumero as racionalANumero, aTexto as racionalATexto } from "../math/racional";
export { type Polinomio, type RaizReal, raicesReales } from "../math/polinomio";
export {
  type ValorExacto, aTextoE, aLatexE, aNumeroE, esRacionalE,
} from "../math/simbolico/valorExacto";
export { type RaizConForma, raicesConForma } from "../math/simbolico/raicesSimbolicas";
