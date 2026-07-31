// ─────────────────────────────────────────────
// Banco de HUELLAS del trazado (terminal)
// ─────────────────────────────────────────────
//
// El criterio de aceptación de este proyecto para tocar el motor es "la imagen no
// cambia", y la suite en verde NO lo demuestra: ya ocurrió que un presupuesto de
// evaluaciones pasara las 345 pruebas mientras se comía dos tercios de las ramas.
// Esta herramienta comprueba justo eso, sobre el trazador REAL:
//
//   1. se registra la HUELLA del repertorio ANTES de tocar nada  (--registrar)
//   2. se hace el cambio
//   3. se comparan las huellas                                    (por defecto)
//
// La huella de cada caso es lo OBSERVABLE, no los vértices: el mapa de píxeles que
// pinta el renderer (polilíneas de 2 px opacas, el `grosorPx` real), el número de
// ramas y asíntotas, y los puntos notables. Dos trazados con vértices distintos pero
// misma huella son indistinguibles para quien mira el plano — que es la pregunta.
//
// Se bundlea con `npm run huella` y se ejecuta con node DIRECTO sobre el bundle:
//
//   node herramientas/.huella.cjs --registrar > herramientas/huella.json
//   Get-Content herramientas/huella.json | node herramientas/.huella.cjs
//
// La huella sale por stdout y entra por stdin (el progreso va por stderr): esta
// herramienta NO usa `fs` ni `path` porque el lint de Obsidian los prohíbe —no hay
// APIs de Node en móvil— y no permite silenciar esa regla ni en una herramienta de
// terminal. La redirección hace el mismo trabajo sin dejar un solo warning.
//
// NB Windows: `node`, no `npm run huella -- …` (cmd.exe corrompe ^ y paréntesis).

import { TrazadorExplicitoAdaptativo } from "../src/motor/tracing/explicit/TrazadorExplicitoAdaptativo";
import { crearFuncionReal } from "../src/motor/fields/funcionRealMathjs";
import { crearViewport } from "../src/motor/scene/viewport-utils";
import { analizarPuntosNotables } from "../src/motor/analysis/puntosNotablesDeRama";
import type { Rama, Viewport } from "../src/motor/contracts";

/** Grosor real del trazo (`composicion.ts`): fija cuántos píxeles marca cada segmento. */
const PLUMA = 2;

interface Caso {
  readonly nombre: string;
  readonly expr: string;
  readonly centroX: number;
  readonly semiX: number;
  readonly semiY?: number;
  readonly W?: number;
  readonly H?: number;
  readonly pasada?: "interactiva" | "final";
}

// Repertorio: las curvas normales primero (donde NADA puede cambiar nunca) y las
// patológicas después (donde los cambios de motor se notan). Los casos densos son
// los que han roto cosas históricamente: tan(x²) al alejar, tan(e^x) en la vista por
// defecto (la congelación de 1.2.9) y tan(x) a ±3000 (aliasing bajo Nyquist).
const REPERTORIO: readonly Caso[] = [
  { nombre: "1/x ±8", expr: "1/x", centroX: 0, semiX: 8 },
  { nombre: "1/x^2 ±8", expr: "1/x^2", centroX: 0, semiX: 8 },
  { nombre: "x^2/8 ±8", expr: "x^2/8", centroX: 0, semiX: 8 },
  { nombre: "sin(x) ±10", expr: "sin(x)", centroX: 0, semiX: 10 },
  { nombre: "sin(1/x) ±3", expr: "sin(1/x)", centroX: 0, semiX: 3 },
  { nombre: "sin(1/x) ±0.05", expr: "sin(1/x)", centroX: 0, semiX: 0.05 },
  { nombre: "sqrt(x) ±8", expr: "sqrt(x)", centroX: 0, semiX: 8 },
  { nombre: "x^(1/3) ±8", expr: "x^(1/3)", centroX: 0, semiX: 8 },
  { nombre: "ln(x) ±8", expr: "ln(x)", centroX: 0, semiX: 8 },
  { nombre: "e^x ±8", expr: "e^x", centroX: 0, semiX: 8 },
  { nombre: "abs(x) ±8", expr: "abs(x)", centroX: 0, semiX: 8 },
  { nombre: "floor(x) ±8", expr: "floor(x)", centroX: 0, semiX: 8 },
  { nombre: "floor(x)*100 ±8", expr: "floor(x)*100", centroX: 0, semiX: 8 },
  { nombre: "(1-x^4)^(1/4)", expr: "(1-x^4)^(1/4)", centroX: 0, semiX: 2 },
  { nombre: "x^2*sin(1/x) ±2", expr: "x^2*sin(1/x)", centroX: 0, semiX: 2 },
  { nombre: "5*tanh(10^7*x)", expr: "5*tanh(10^7*x)", centroX: 0, semiX: 8 },
  { nombre: "e^x*(cos x-sin x)", expr: "e^x*(cos(x)-sin(x))", centroX: 0, semiX: 20 },
  { nombre: "tan(x) ±10", expr: "tan(x)", centroX: 0, semiX: 10 },
  { nombre: "ln|tan(x)| ±10", expr: "ln(abs(tan(x)))", centroX: 0, semiX: 10 },
  { nombre: "tan(x) ±3000", expr: "tan(x)", centroX: 0, semiX: 3000 },
  { nombre: "sin(x^2) ±40", expr: "sin(x^2)", centroX: 0, semiX: 40 },
  { nombre: "tan(x^2) ±10", expr: "tan(x^2)", centroX: 0, semiX: 10 },
  { nombre: "tan(x^2) ±40", expr: "tan(x^2)", centroX: 0, semiX: 40 },
  { nombre: "tan(x^2) ±120", expr: "tan(x^2)", centroX: 0, semiX: 120 },
  { nombre: "tan(x^2) ±300", expr: "tan(x^2)", centroX: 0, semiX: 300 },
  { nombre: "tan(x^2) 66±4", expr: "tan(x^2)", centroX: 66, semiX: 4 },
  { nombre: "tan(x^2) 66±1", expr: "tan(x^2)", centroX: 66, semiX: 1 },
  { nombre: "tan(e^x) defecto", expr: "tan(e^x)", centroX: 0, semiX: 20.6, W: 768, H: 261 },
  { nombre: "tan(e^x) ±8", expr: "tan(e^x)", centroX: 0, semiX: 8 },
  // Pasada interactiva: distinto presupuesto de muestreo y de profundidad.
  { nombre: "1/x ±8 [int]", expr: "1/x", centroX: 0, semiX: 8, pasada: "interactiva" },
  { nombre: "tan(x) ±3000 [int]", expr: "tan(x)", centroX: 0, semiX: 3000, pasada: "interactiva" },
  { nombre: "tan(x^2) ±120 [int]", expr: "tan(x^2)", centroX: 0, semiX: 120, pasada: "interactiva" },
  { nombre: "tan(e^x) def [int]", expr: "tan(e^x)", centroX: 0, semiX: 20.6, W: 768, H: 261,
    pasada: "interactiva" },
  // Móvil: el lienzo estrecho de 1.3.0, donde el presupuesto por columna escala solo.
  { nombre: "tan(x^2) ±120 [movil]", expr: "tan(x^2)", centroX: 0, semiX: 120, W: 321, H: 264 },
];

/** Píxeles que pinta el renderer: polilíneas de PLUMA px, opacas. Máscara binaria. */
function rasterizar(ramas: readonly Rama[], vp: Viewport): Uint8Array {
  const W = Math.round(vp.anchoPx), H = Math.round(vp.altoPx);
  const bits = new Uint8Array(W * H);
  const kx = W / (vp.domX[1] - vp.domX[0]);
  const ky = H / (vp.domY[1] - vp.domY[0]);
  const R = PLUMA / 2;

  // Recorte Liang–Barsky con la orla del grosor: sin él, un polo con y=±1e15 haría
  // recorrer millones de pasos fuera del lienzo.
  const recortar = (x0: number, y0: number, x1: number, y1: number): number[] | null => {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 + R, W + R - x0, y0 + R, H + R - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  };

  const marcar = (x: number, y: number) => {
    const c0 = Math.floor(x - R), c1 = Math.floor(x + R);
    const r0 = Math.floor(y - R), r1 = Math.floor(y + R);
    for (let r = r0; r <= r1; r++) {
      if (r < 0 || r >= H) continue;
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= W) continue;
        bits[r * W + c] = 1;
      }
    }
  };

  for (const rama of ramas) {
    const pts = rama.puntos;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const c = recortar(
        (pts[i] - vp.domX[0]) * kx, H - (pts[i + 1] - vp.domY[0]) * ky,
        (pts[i + 2] - vp.domX[0]) * kx, H - (pts[i + 3] - vp.domY[0]) * ky
      );
      if (!c) continue;
      const dx = c[2] - c[0], dy = c[3] - c[1];
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.25));
      for (let k = 0; k <= n; k++) marcar(c[0] + (dx * k) / n, c[1] + (dy * k) / n);
    }
  }
  return bits;
}

/** FNV-1a de 32 bits sobre la máscara: identifica el dibujo sin guardarlo entero. */
function hash(bits: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bits.length; i++) {
    h ^= bits[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

interface Huella {
  readonly hash: string;
  readonly pintados: number;
  readonly ramas: number;
  readonly vertices: number;
  readonly asintotas: number;
  readonly notables: number;
  readonly ms: number;
}

function huellaDe(c: Caso): Huella {
  const W = c.W ?? 470, H = c.H ?? 290, semiY = c.semiY ?? 7;
  const vp = crearViewport([c.centroX - c.semiX, c.centroX + c.semiX], [-semiY, semiY], W, H, 1);
  const f = crearFuncionReal(c.expr);
  const t0 = Date.now();
  const res = new TrazadorExplicitoAdaptativo().trazar(f, "m", vp, {
    desviacionMaxPx: 0.25, pasoMaxPx: 8, pasada: c.pasada ?? "final",
  });
  const ms = Date.now() - t0;

  const bits = rasterizar(res.ramas, vp);
  let pintados = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i]) pintados++;
  let vertices = 0;
  for (const r of res.ramas) vertices += r.puntos.length / 2;

  return {
    hash: hash(bits), pintados, ramas: res.ramas.length, vertices,
    asintotas: res.asintotas.length,
    notables: analizarPuntosNotables(res.ramas, "m", vp).length, ms,
  };
}

// La huella viaja por STDOUT y STDIN, no por `fs`: el lint de Obsidian prohíbe los
// módulos de Node —no existen en móvil— y no deja silenciar esa regla. La redirección
// hace el mismo trabajo y deja la herramienta sin un solo warning.
const USO =
  `  node herramientas/.huella.cjs --registrar > herramientas/huella.json\n` +
  `  Get-Content herramientas/huella.json | node herramientas/.huella.cjs\n`;

/** Lee la entrada estándar entera. Si nadie redirigió nada (terminal), devuelve "". */
async function leerStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  process.stdin.setEncoding("utf8");
  const trozos: string[] = [];
  for await (const t of process.stdin) trozos.push(t as string);
  return trozos.join("");
}

function registrar(): number {
  const out: Record<string, Huella> = {};
  for (const c of REPERTORIO) {
    out[c.nombre] = huellaDe(c);
    // El progreso va por stderr para no ensuciar el JSON que se redirige.
    process.stderr.write(`  ${c.nombre.padEnd(24)} ${out[c.nombre].hash}\n`);
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.stderr.write(`\nHuella de ${REPERTORIO.length} casos por stdout.\n`);
  return 0;
}

async function comparar(): Promise<number> {
  const crudo = await leerStdin();
  if (!crudo.trim()) {
    process.stdout.write(`No hay huella previa en la entrada:\n${USO}`);
    return 1;
  }
  const previa = JSON.parse(crudo) as Record<string, Huella>;
  let distintos = 0, msPrevio = 0, msAhora = 0;

  for (const c of REPERTORIO) {
    const a = previa[c.nombre];
    const b = huellaDe(c);
    msAhora += b.ms;
    if (!a) { process.stdout.write(`  NUEVO ${c.nombre}\n`); continue; }
    msPrevio += a.ms;

    // El DIBUJO es el criterio; lo demás se informa para localizar la causa.
    const igual = a.hash === b.hash;
    if (!igual) distintos++;
    const detalle = [
      a.pintados !== b.pintados ? `px ${a.pintados}→${b.pintados}` : "",
      a.ramas !== b.ramas ? `ramas ${a.ramas}→${b.ramas}` : "",
      a.asintotas !== b.asintotas ? `asint ${a.asintotas}→${b.asintotas}` : "",
      a.notables !== b.notables ? `notables ${a.notables}→${b.notables}` : "",
      a.vertices !== b.vertices
        ? `vert ${a.vertices}→${b.vertices} (${((1 - b.vertices / Math.max(1, a.vertices)) * 100).toFixed(0)}%)`
        : "",
    ].filter(Boolean).join(" · ");

    process.stdout.write(
      `  ${igual ? "=" : "≠"} ${c.nombre.padEnd(24)} ` +
      `${String(a.ms).padStart(5)}→${String(b.ms).padStart(5)} ms` +
      `${detalle ? "   " + detalle : ""}\n`);
  }

  process.stdout.write(
    `\n${distintos === 0 ? "DIBUJO IDÉNTICO" : distintos + " CASOS CON DIBUJO DISTINTO"}` +
    ` · trazado total ${msPrevio} → ${msAhora} ms\n`);
  return distintos === 0 ? 0 : 1;
}

if (process.argv.includes("--registrar")) process.exit(registrar());
else void comparar().then((c) => process.exit(c));
