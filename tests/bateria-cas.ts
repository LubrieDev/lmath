// ─────────────────────────────────────────────
// tests · Batería de VERIFICACIÓN del CAS (despejador + simplificador)
// ─────────────────────────────────────────────
//
// Arnés de diagnóstico, reproducible y por NIVELES de dificultad. No modifica el plugin: lo
// interroga. Su razón de ser es cubrir lo que `fuzz-despeje.ts` NO puede ver.
//
// El fuzzer diferencial comprueba SOUNDNESS: que todo punto afirmado por la despejada está en
// la curva original (sin ramas fantasma). Eso deja tres agujeros grandes:
//
//   • COMPLETITUD — que no FALTEN ramas. Un despeje al que se le pierde media solución es
//     "sound" y el fuzzer lo aprueba. Aquí se resuelve la ecuación original NUMÉRICAMENTE en y
//     (barrido + bisección) y se exige que TODA raíz real quede cubierta por alguna rama.
//   • DOMINIO NO EXCESIVO — que la guarda `R ≥ 0` no recorte de más. Una guarda demasiado
//     estrecha también es "sound" (afirma menos de lo que hay) pero pierde curva.
//   • REPRESENTACIÓN — que el LaTeX del panel no filtre centinelas internos (`\mathrm{pm2}`,
//     `\mathrm{dom}`…) ni salga desbalanceado.
//
// Además verifica el SIMPLIFICADOR: preservación numérica del conjunto de puntos e idempotencia.
//
// Uso:  npx esbuild tests/bateria-cas.ts --bundle --platform=node --format=cjs \
//         --outfile=tests/.bundle.bateria.cjs && node tests/.bundle.bateria.cjs [--verboso]
// Salida: informe agrupado por NIVEL y por TIPO DE ERROR. Código de salida 1 si hay fallos.

import { despejarEcuaciones } from "../src/despejar";
import { simplificarEcuaciones } from "../src/simplificar";
import { bloqueALatex } from "../src/latex";
import { normalizarEntrada } from "../src/parser";
import { insertarProductoImplicito } from "../src/motor/parsing/productoImplicito";
import { expandirDobleSigno } from "../src/motor/parsing/dobleSigno";
import { compilarExpresion } from "../src/evaluador";

declare const process: { argv: string[]; exitCode?: number };

const VERBOSO = process.argv.includes("--verboso");

// ─────────────────────────────────────────────
// Catálogo de casos por nivel
// ─────────────────────────────────────────────

interface Caso {
  ec: string;
  /** Los del nivel 6: SIN forma cerrada. Que queden parciales es el comportamiento correcto. */
  imposible?: boolean;
  /** Ventana de y para la búsqueda de raíces (por defecto ±12). Se estrecha donde la curva
   *  es densa en y (periódicas con muchísimas raíces) para que el informe sea legible. */
  ventanaY?: [number, number];
  nota?: string;
}

const NIVELES: Array<{ nombre: string; casos: Caso[] }> = [
  {
    nombre: "Nivel 1 — básicos (lineal, producto, potencia, raíz, elementales)",
    casos: [
      { ec: "y = 3*x + 1" },
      { ec: "2*y + 3*x = 6" },
      { ec: "y/3 - x = 1" },
      { ec: "-y = x^2 - 4" },
      { ec: "5*y = 2*x - 7" },
      { ec: "x*y = 4" },
      { ec: "y/(x+1) = 2" },
      { ec: "x^2 + y^2 = 9" },
      { ec: "x^2 - y^2 = 4" },
      { ec: "y^3 = x + 1" },
      { ec: "y^4 = x^2" },
      { ec: "x - sqrt(y) = 2" },
      { ec: "sqrt(y) = x - 3" },
      { ec: "cbrt(y) = x" },
      { ec: "log(y) = x" },
      { ec: "e^y = x" },
      { ec: "2^y = x" },
      { ec: "sinh(y) = x" },
      { ec: "abs(y) = x^2" },
      { ec: "1/y = x" },
    ],
  },
  {
    nombre: "Nivel 2 — composiciones e inversas anidadas (con dominio)",
    casos: [
      { ec: "(y+1)^3 = x" },
      { ec: "(2*y - 3)^3 = x" },
      { ec: "exp(y^3) = x" },
      { ec: "e^(y^2) = x" },
      { ec: "log(y^3 + 1) = x" },
      { ec: "log(y)^2 = x" },
      { ec: "sqrt(y^3 - 2) = x" },
      { ec: "nthRoot(y^3 - 2, 4) = x" },
      { ec: "sqrt(log(y)) = x" },
      { ec: "exp(sqrt(y)) = x" },
      { ec: "(y^3 + 1)^2 = x" },
      { ec: "sinh(y^3) = x" },
      { ec: "atanh(y) = x" },
      { ec: "cbrt(y + 2) = x - 1" },
      { ec: "2*sqrt(y) = x" },
      { ec: "sqrt(y) = x/2" },
      { ec: "sqrt(y) = -x/3" },
      { ec: "sqrt(y) = x^2 + 1", nota: "guarda trivialmente cierta: NO debe salir coletilla" },
      { ec: "sqrt(y) = 2*abs(x)", nota: "guarda trivial tras quitar el factor" },
    ],
  },
  {
    nombre: "Nivel 3 — trigonometría, familias k, absolutos, radicales multi-rama",
    casos: [
      { ec: "tan(y) + x = 2", ventanaY: [-6, 6] },
      { ec: "sin(y) = x", ventanaY: [-6, 6] },
      { ec: "cos(y) = x", ventanaY: [-6, 6] },
      { ec: "cos(y)*2 = x", ventanaY: [-6, 6] },
      { ec: "sin(2*y) = x", ventanaY: [-4, 4] },
      { ec: "tan(2*y) + x = 2", ventanaY: [-3, 3] },
      { ec: "sin(x + y) = 0", ventanaY: [-6, 6] },
      { ec: "cot(y) = x", ventanaY: [-6, 6] },
      { ec: "abs(y) = x - 1" },
      { ec: "2*abs(y) = x" },
      { ec: "abs(y)^2 = x" },
      { ec: "abs(y) = x^2 - 2" },
      { ec: "sqrt(abs(y)) = x" },
      { ec: "1/abs(x) + 1/abs(y) = 1" },
      { ec: "1/(x^2 + y^2) = 3" },
      { ec: "x^2*y^2 + x^2 + y^2 = 4" },
      { ec: "y^4 + x^2 = 5" },
      { ec: "cbrt(y^2) = 1 - cbrt(x^2)", nota: "astroide" },
    ],
  },
  {
    nombre: "Nivel 4 — varias transformaciones, restricciones y EJES DE SIGNO",
    casos: [
      { ec: "abs(y) = pm(x)", nota: "± del usuario + ± del absoluto: dos ejes" },
      { ec: "y^2 = pm(x)", nota: "dos ejes" },
      { ec: "sqrt(abs(y)) = pm(x)", nota: "dos ejes" },
      { ec: "abs((y+1)^2 - 3) = x", nota: "dos ejes (absoluto + raíz)" },
      { ec: "abs(abs(y) - 3) = x", nota: "dos ejes (absoluto anidado)" },
      { ec: "cos(y)^2 - cos(y) = x", ventanaY: [-6, 6], nota: "cuadrática en cos y: dos ejes" },
      { ec: "sin(y)^2 = x", ventanaY: [-6, 6], nota: "dos ejes" },
      { ec: "3*y^2 + 2*x*y + x^2 - 4 = 0" },
      { ec: "y^2 - 2*x*y + x^2 - 9 = 0" },
      { ec: "x*y^2 + y + x = 0" },
      { ec: "(x^2 + y^2)^2 - 2*(x^2 - y^2) = 0", nota: "lemniscata" },
      { ec: "sin(1/(x^2 + y^2)) = 0", ventanaY: [-4, 4], nota: "familia k∈ℕ" },
      { ec: "sqrt(tan(y) + 1) = x", ventanaY: [-6, 6] },
      { ec: "cos(x + y) + cos(x - y) = 1", ventanaY: [-6, 6] },
      { ec: "sqrt(y) = (x+1)/(-2)", nota: "guarda con signo invertido" },
      { ec: "sqrt(y) = -x^2 - 1", nota: "guarda imposible: sin solución real" },
    ],
  },
  {
    nombre: "Nivel 5 — expresiones grandes y composiciones profundas",
    casos: [
      { ec: "(x^2 + y^2 - 1)^3 = x^2*y^3", nota: "corazón" },
      { ec: "exp(sqrt(log(y^3 + 2))) = x" },
      { ec: "log(exp(y^3) + 1) = x" },
      { ec: "sqrt(sqrt(y) + 1) = x" },
      { ec: "(3*(y+1)^3 - 2)^3 = x^2 + 1" },
      { ec: "2*sinh(3*y - 1) + 4 = x^2" },
      { ec: "nthRoot((y^5 + 1)^3, 3) = x", nota: "raíz impar de potencia impar" },
      { ec: "1/(1 + 1/(1 + y)) = x", nota: "fracción continua" },
      { ec: "atanh(tanh(y) ) = x - 1" },
      { ec: "(x^2+1)*y^3 + (x-2) = 0" },
      { ec: "4*(cos(x)+cos(y)) + 2*cos(x+y) + 2*cos(x-y) - 2*cos(2*x) - 2*cos(2*y) - 7 = 0",
        ventanaY: [-4, 4], nota: "corazón trigonométrico" },
      { ec: "sqrt(x^2 + y^2) = 3", nota: "norma euclídea" },
      { ec: "abs(y - x) + 0*y = 2", nota: "absoluto de una diferencia" },
    ],
  },
  {
    nombre: "Nivel 6 — LÍMITES MATEMÁTICOS (parcial = correcto)",
    casos: [
      { ec: "y^y = x", imposible: true, nota: "sin forma cerrada elemental" },
      { ec: "y + e^y = x", imposible: true, nota: "W de Lambert" },
      { ec: "y*e^y = x", imposible: true, nota: "W de Lambert (forma canónica)" },
      { ec: "log(y) + y = x", imposible: true, nota: "W de Lambert" },
      { ec: "sin(y) + y = x", imposible: true, nota: "ecuación de Kepler" },
      { ec: "tan(y) + y = x", imposible: true, nota: "trascendente mixta" },
      { ec: "y^5 + y = x", imposible: true, nota: "Abel–Ruffini" },
      { ec: "y^5 + x*y + 1 = 0", imposible: true, nota: "quíntica con coeficiente" },
      { ec: "y^7 - y^2 = x", imposible: true, nota: "grado 7" },
      { ec: "sin(y) + cos(2*y) + y = x", imposible: true, nota: "trascendente mixta" },
      { ec: "x^3 + y^3 = 3*x*y", imposible: true, nota: "folium: cúbica en y (Cardano)" },
      { ec: "abs(abs((y+1)^2 - 3) - 2) = x", imposible: true, nota: "tres ejes de signo" },
      { ec: "y^y + y = x", imposible: true, nota: "sin forma cerrada" },
      { ec: "gamma(y) = x", imposible: true, nota: "requiere función especial inversa" },
    ],
  },
];

// ─────────────────────────────────────────────
// Utilidades numéricas
// ─────────────────────────────────────────────

const norm = (s: string): string => insertarProductoImplicito(normalizarEntrada(s.trim()));

/** Scope que fuerza aritmética REAL. mathjs devuelve un COMPLEJO para `log(−1)`, `sqrt(−4)` o
 *  `nthRoot(−8, 4)`, y si por encima hay un `abs(·)` el módulo vuelve a ser un real: el buscador
 *  de raíces "encontraba" soluciones donde la curva real no existe (`|1/ln y| = cos x` en y<0).
 *  El plugin grafica sobre ℝ, así que el oráculo debe razonar sobre ℝ: fuera del dominio, NaN. */
const REAL: Record<string, unknown> = {
  log: (u: number, b?: number) =>
    typeof u === "number" && u > 0 ? (b === undefined ? Math.log(u) : Math.log(u) / Math.log(b)) : NaN,
  sqrt: (u: number) => (typeof u === "number" && u >= 0 ? Math.sqrt(u) : NaN),
  cbrt: (u: number) => (typeof u === "number" ? Math.cbrt(u) : NaN),
  nthRoot: (u: number, n: number) => {
    if (typeof u !== "number" || typeof n !== "number") return NaN;
    if (u >= 0) return Math.pow(u, 1 / n);
    return n % 2 === 1 ? -Math.pow(-u, 1 / n) : NaN;   // índice par de negativo: no es real
  },
};

/** Residuos D(x,y) = lhs − rhs de la ecuación ORIGINAL, UNO POR RAMA. Una original escrita con
 *  ±/∓ (`|y| = ±x`) no es una curva sino la UNIÓN de dos, así que colapsarla a la rama principal
 *  (que es lo que hace evaluarla sin expandir, pm(u)=+u) daría por "fuera de la curva" puntos
 *  que sí están en ella. Un punto pertenece a la original si anula ALGUNO de estos residuos. */
function residuosOriginal(ec: string): Array<(x: number, y: number) => number> {
  const partes = ec.split("=");
  if (partes.length !== 2) return [];
  const D = `(${norm(partes[0])}) - (${norm(partes[1])})`;
  const out: Array<(x: number, y: number) => number> = [];
  for (const rama of expandirDobleSigno(D)) {
    let f: (s: Record<string, number>) => unknown;
    try { f = compilarExpresion(rama); } catch { continue; }
    out.push((x, y) => {
      const v = f({ x, y, ...REAL });
      return typeof v === "number" && Number.isFinite(v) ? v : NaN;
    });
  }
  return out;
}

/** Sustituye cada `fam(p,P)`/`famN(p,P)` por `(K_p*(P))`, con un K POR PARÁMETRO. Los
 *  parámetros de dos inversiones periódicas anidadas son enteros INDEPENDIENTES: forzarles el
 *  mismo valor exploraría solo la diagonal y daría por perdidas ramas que la fórmula sí afirma. */
function sustituirFam(expr: string, valores: Record<string, number>): string {
  let out = expr;
  for (const nombre of ["famN", "fam"]) {
    const marca = new RegExp(`(?<![a-zA-Z0-9_])${nombre}\\s*\\(`);
    for (let m = marca.exec(out); m; m = marca.exec(out)) {
      const abre = m.index + m[0].length - 1;
      let prof = 0, cierra = -1;
      for (let i = abre; i < out.length; i++) {
        if (out[i] === "(") prof++;
        else if (out[i] === ")" && --prof === 0) { cierra = i; break; }
      }
      if (cierra === -1) break;
      const dentro = out.slice(abre + 1, cierra);
      let p = 0, coma = -1;
      for (let i = 0; i < dentro.length; i++) {
        if (dentro[i] === "(") p++;
        else if (dentro[i] === ")") p--;
        else if (dentro[i] === "," && p === 0) { coma = i; break; }
      }
      const param = (coma >= 0 ? dentro.slice(0, coma) : "k").trim();
      const periodo = coma >= 0 ? dentro.slice(coma + 1) : dentro;
      const K = valores[param] ?? 0;
      out = out.slice(0, m.index) + `(${K}*(${periodo}))` + out.slice(cierra + 1);
    }
  }
  return out;
}

/** Parámetros de familia presentes, con su conjunto (ℕ para famN). */
function parametrosFam(expr: string): Array<{ nombre: string; natural: boolean }> {
  const out: Array<{ nombre: string; natural: boolean }> = [];
  for (const m of expr.matchAll(/(?<![a-zA-Z0-9_])(famN?)\s*\(\s*([a-zA-Z][a-zA-Z0-9_]*)/g)) {
    if (out.some((q) => q.nombre === m[2])) continue;
    out.push({ nombre: m[2], natural: m[1] === "famN" });
  }
  return out;
}

/** Valores de y que la forma despejada AFIRMA en x: todas las ramas de doble signo × todos
 *  los k de la familia. Devuelve también si alguna rama llegó a estar DEFINIDA (para
 *  distinguir "guarda excesiva" de "rama perdida"). */
function afirmados(rhs: string, x: number): number[] {
  const params = parametrosFam(rhs);
  // El rango debe alcanzar toda la ventana de y (período mínimo pi), pero el coste es el
  // PRODUCTO sobre los parámetros: se estrecha al crecer su número.
  // Enumeración corta: cubre los casos normales. Los k enormes que produce una capa exterior
  // COMPRESIVA no se buscan aquí sino resolviendo (ver `cubiertaPorFamilia`), porque ningún
  // rango finito basta: `nthRoot(atan(·)+kπ, 5)` necesita k ≈ −10³ para y = −8, y una capa
  // exponencial pide k ≈ 10⁴ o más. Con varios parámetros el coste es el PRODUCTO.
  const tope = params.length <= 1 ? 30 : params.length === 2 ? 7 : 4;
  const rango = (p: { natural: boolean }): number[] =>
    p.natural ? Array.from({ length: tope + 1 }, (_, i) => i)
              : Array.from({ length: 2 * tope + 1 }, (_, i) => i - tope);
  let combos: Array<Record<string, number>> = [{}];
  for (const p of params)
    combos = combos.flatMap((c) => rango(p).map((K) => ({ ...c, [p.nombre]: K })));

  const out: number[] = [];
  for (const combo of combos) {
    const sinFam = params.length > 0 ? sustituirFam(rhs, combo) : rhs;
    for (const rama of expandirDobleSigno(sinFam)) {
      let v: unknown;
      try { v = compilarExpresion(rama)({ x, ...REAL }); } catch { continue; }
      if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/** ¿Alguna rama de la fórmula da el valor `r` para ALGÚN entero del parámetro de familia?
 *
 *  Enumerar k no escala: la capa exterior puede COMPRIMIRLO sin cota. `asinh(log(a + 2kπ))`
 *  necesita k ≈ 1500 para y = 3, y `⁵√(arctan a + kπ)` pide k ≈ −10³ para y = −8; con una capa
 *  exponencial el orden se dispara. Cualquier tope fijo acaba declarando "rama perdida" lo que
 *  solo es "no busqué bastante lejos". Aquí se RESUELVE: la rama es una función continua g(K)
 *  del parámetro tomado como real, se busca un intervalo que encierre `r` recorriendo una
 *  ESCALERA GEOMÉTRICA de K (±1, ±10, … ±10⁸ — así se alcanzan órdenes enormes con ~35
 *  evaluaciones), se bisecta y se prueban los enteros del borde. Solo se llama cuando una raíz
 *  quedó sin cubrir por la enumeración corta, así que el coste extra es raro. */
function cubiertaPorFamilia(rhs: string, x: number, r: number): boolean {
  const params = parametrosFam(rhs);
  if (params.length === 0 || params.length > 3) return false;
  // Con VARIOS parámetros se enumeran los demás en un rango modesto y se resuelve por bisección
  // SOLO el elegido, probando a turnarse cuál: basta con que uno de ellos sea el "comprimido"
  // para alcanzar órdenes que ninguna enumeración cubriría.
  // PRESUPUESTO. Enumerar los otros parámetros y bisecar el elegido es combinatorio, y una sola
  // ecuación puede tener decenas de raíces por cada x: sin tope, un caso patológico se lleva
  // minutos y bloquea el barrido. Se acota el nº de intentos; agotado, se responde "no cubierta"
  // y el informe lo señala —prefiero un aviso revisable a un arnés que no termina—.
  let presupuesto = 400;
  for (let elegido = 0; elegido < params.length && presupuesto > 0; elegido++) {
    const otros = params.filter((_, i) => i !== elegido);
    const t = params.length === 2 ? 25 : 8;
    const rangos = otros.map((p) =>
      p.natural ? Array.from({ length: t + 1 }, (_, i) => i)
                : Array.from({ length: 2 * t + 1 }, (_, i) => i - t));
    let combos: Array<Record<string, number>> = [{}];
    otros.forEach((p, i) => {
      combos = combos.flatMap((c) => rangos[i].map((v) => ({ ...c, [p.nombre]: v })));
    });
    for (const fijos of combos) {
      if (presupuesto-- <= 0) break;
      if (bisectaParametro(rhs, x, r, params[elegido], fijos)) return true;
    }
  }
  return false;
}

/** Resuelve `g(K) = r` para el parámetro `libre` (con los demás fijados), por escalera
 *  geométrica + bisección. Ver `cubiertaPorFamilia`. */
function bisectaParametro(rhs: string, x: number, r: number,
                          libre: { nombre: string; natural: boolean },
                          fijos: Record<string, number>): boolean {
  const { nombre, natural } = libre;
  const conK = sustituirFam(rhs, { ...fijos, [nombre]: NaN }).replace(/NaN/g, "(K)");
  const escalera: number[] = [];
  for (let e = 0; e <= 8; e++) { escalera.push(10 ** e); if (!natural) escalera.unshift(-(10 ** e)); }
  escalera.push(0); escalera.sort((a, b) => a - b);

  for (const rama of expandirDobleSigno(conK)) {
    let f: (s: Record<string, number>) => unknown;
    try { f = compilarExpresion(rama); } catch { continue; }
    const g = (K: number): number => {
      const v = f({ x, K, ...REAL });
      return typeof v === "number" && Number.isFinite(v) ? v - r : NaN;
    };
    const cerca = (K: number): boolean => {
      const d = g(Math.round(K));
      return Number.isFinite(d) && Math.abs(d) < 1e-4 * (1 + Math.abs(r));
    };
    for (let i = 0; i + 1 < escalera.length; i++) {
      let a = escalera[i], b = escalera[i + 1];
      const da = g(a), db = g(b);
      if (!Number.isFinite(da) || !Number.isFinite(db) || da * db > 0) continue;
      let fa = da;
      for (let it = 0; it < 90; it++) {
        const m = (a + b) / 2, dm = g(m);
        if (!Number.isFinite(dm)) break;
        if (fa * dm <= 0) b = m; else { a = m; fa = dm; }
      }
      if (cerca(a) || cerca(b) || cerca((a + b) / 2)) return true;
    }
  }
  return false;
}

/** Raíces reales de y ↦ D(x,y) en la ventana, por barrido + bisección. Rechaza los cruces por
 *  POLO (donde |D| explota en vez de anularse): tras bisecar se exige que el residuo sea
 *  realmente pequeño, cosa que un polo nunca cumple. */
function raicesEnY(D: (x: number, y: number) => number, x: number,
                   ventana: [number, number], pasos = 3000): number[] {
  const [y0, y1] = ventana;
  const h = (y1 - y0) / pasos;
  const raices: number[] = [];
  let yPrev = y0, dPrev = D(x, y0);
  for (let i = 1; i <= pasos; i++) {
    const y = y0 + i * h;
    const d = D(x, y);
    if (Number.isFinite(d) && Number.isFinite(dPrev)) {
      // Solo CRUCES de signo. Un `d === 0` suelto no basta: `tanh(16y) = −1` no tiene solución
      // real (tanh nunca alcanza −1), pero en coma flotante satura a −1 para |y| grande y D da
      // exactamente 0 sobre un intervalo entero. Aceptarlo convertía una ASÍNTOTA en raíz.
      if (dPrev * d < 0) {
        // Bisección sobre el cambio de signo.
        let a = yPrev, b = y, da = dPrev;
        for (let it = 0; it < 80; it++) {
          const m = (a + b) / 2, dm = D(x, m);
          if (!Number.isFinite(dm)) break;
          if (da * dm <= 0) b = m; else { a = m; da = dm; }
        }
        const r = (a + b) / 2, dr = D(x, r);
        // Escala del residuo: un POLO deja |D| enorme aquí; una raíz de verdad, ~0.
        const escala = 1e-5 * (1 + x * x + r * r);
        if (!Number.isFinite(dr) || Math.abs(dr) >= escala) { yPrev = y; dPrev = d; continue; }
        // MESETA: si D sigue siendo ~0 lejos del punto, no es una raíz aislada sino una zona
        // saturada numéricamente (asíntota). Una raíz de verdad hace crecer |D| al alejarse.
        const lejos = [r - 0.5, r + 0.5].map((v) => D(x, v)).filter(Number.isFinite);
        if (lejos.length > 0 && lejos.every((v) => Math.abs(v) < escala)) { yPrev = y; dPrev = d; continue; }
        raices.push(r);
      }
    }
    yPrev = y; dPrev = d;
  }
  // Deduplica raíces casi iguales.
  const unicas: number[] = [];
  for (const r of raices) if (!unicas.some((u) => Math.abs(u - r) < 1e-6 * (1 + Math.abs(r)))) unicas.push(r);
  return unicas;
}

// ─────────────────────────────────────────────
// Oráculos
// ─────────────────────────────────────────────

type Tipo = "rama-falsa" | "rama-perdida" | "condicion-excesiva" | "latex" | "simplificacion"
  | "parser" | "representacion" | "limite-superado";

interface Fallo { nivel: string; ec: string; tipo: Tipo; obtenido: string; esperado: string }

const XS = [-3.7, -2.4, -1.3, -0.55, 0.45, 1.15, 2.3, 3.6, 5.2];

/** Centinelas internos que NUNCA deben llegar al LaTeX del panel como nombre de función. */
const FUGA_CENTINELA = /\\mathrm\{(pm2?|mp2?|fam[N]?|dom|parenDesnuda)\}/;

function verificar(nivel: string, caso: Caso, fallos: Fallo[],
                   despejeForzado?: string): "resuelto" | "parcial" | "error" {
  const { ec } = caso;
  const Ds = residuosOriginal(ec);
  if (Ds.length === 0) {
    fallos.push({ nivel, ec, tipo: "parser", obtenido: "no compila", esperado: "D(x,y) evaluable" });
    return "error";
  }
  /** Residuo MÍNIMO en valor absoluto sobre las ramas de la original: 0 ⇔ el punto está en ella. */
  const D = (x: number, y: number): number => {
    let mejor = NaN;
    for (const f of Ds) {
      const d = f(x, y);
      if (!Number.isFinite(d)) continue;
      if (!Number.isFinite(mejor) || Math.abs(d) < Math.abs(mejor)) mejor = d;
    }
    return mejor;
  };

  let despeje: string;
  try { despeje = despejeForzado ?? despejarEcuaciones([ec])[0]; }
  catch (e) {
    fallos.push({ nivel, ec, tipo: "parser", obtenido: `excepción: ${String(e)}`, esperado: "no lanzar" });
    return "error";
  }
  const completo = /^\s*y\s*=/.test(despeje);

  // ── LaTeX: siempre, resuelto o no. El panel pinta esto.
  let tex = "";
  try { tex = bloqueALatex([despeje]); }
  catch (e) {
    fallos.push({ nivel, ec, tipo: "latex", obtenido: `excepción: ${String(e)}`, esperado: "LaTeX pintable" });
  }
  if (tex === "")
    fallos.push({ nivel, ec, tipo: "latex", obtenido: "vacío", esperado: "LaTeX no vacío" });
  if (FUGA_CENTINELA.test(tex))
    fallos.push({ nivel, ec, tipo: "representacion", obtenido: tex, esperado: "sin centinelas internos en el LaTeX" });
  const abre = (tex.match(/\{/g) ?? []).length, cierra = (tex.match(/\}/g) ?? []).length;
  if (abre !== cierra)
    fallos.push({ nivel, ec, tipo: "latex", obtenido: tex, esperado: `llaves balanceadas (${abre} vs ${cierra})` });

  // ── SIMPLIFICADOR: debe preservar el conjunto de puntos y ser idempotente.
  try {
    const simp = simplificarEcuaciones([ec])[0];
    const ramasSimp = residuosOriginal(simp);
    if (ramasSimp.length > 0) {
      const Dsimp = (x: number, y: number): number => {
        let mejor = NaN;
        for (const f of ramasSimp) {
          const d = f(x, y);
          if (!Number.isFinite(d)) continue;
          if (!Number.isFinite(mejor) || Math.abs(d) < Math.abs(mejor)) mejor = d;
        }
        return mejor;
      };
      for (const x of XS) {
        for (const y of [-2.6, -1.1, -0.3, 0.7, 1.9, 3.4]) {
          const a = D(x, y), b = Dsimp(x, y);
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          // Se comparan CEROS (la curva), no valores: una simplificación puede reescalar.
          if ((Math.abs(a) < 1e-9) !== (Math.abs(b) < 1e-9)) {
            fallos.push({ nivel, ec, tipo: "simplificacion",
              obtenido: `${simp} · en (${x},${y}) original=${a}, simplificada=${b}`,
              esperado: "mismos ceros que la original" });
            break;
          }
        }
      }
    }
    if (simplificarEcuaciones([simp])[0] !== simp)
      fallos.push({ nivel, ec, tipo: "simplificacion",
        obtenido: `${simp} → ${simplificarEcuaciones([simp])[0]}`, esperado: "idempotente" });
  } catch (e) {
    fallos.push({ nivel, ec, tipo: "simplificacion", obtenido: `excepción: ${String(e)}`, esperado: "no lanzar" });
  }

  if (!completo) {
    // Nivel 6: quedarse parcial es EL comportamiento correcto.
    return caso.imposible ? "parcial" : "parcial";
  }
  if (caso.imposible) {
    // No es un fallo automático: puede ser una mejora legítima. Se marca para revisión y se
    // verifica igualmente (si además fuera incorrecta, saldrá en los oráculos de abajo).
    fallos.push({ nivel, ec, tipo: "limite-superado", obtenido: despeje,
      esperado: `parcial (${caso.nota ?? "sin forma cerrada"}) — revisar si es correcto o inventado` });
  }

  const rhs = despeje.replace(/^\s*y\s*=/, "");
  const ventana = caso.ventanaY ?? [-12, 12];

  let ramasFalsas = 0, ramasPerdidas = 0, excesivas = 0;
  let ejemploFalsa = "", ejemploPerdida = "", ejemploExcesiva = "";

  for (const x of XS) {
    const ys = afirmados(rhs, x);

    // (1) SOUNDNESS: cada valor afirmado debe estar en la curva original.
    for (const y of ys) {
      const d = D(x, y);
      if (!Number.isFinite(d)) continue;
      const tol = 1e-6 * (1 + x * x + y * y);
      if (Math.abs(d) > tol) {
        // Guarda de CONDICIONAMIENTO, medida en ULPS DE y en vez de con una pendiente. Si D
        // varía mucho entre dos valores CONSECUTIVOS representables de y, el residuo no dice
        // nada: el punto es indistinguible de una raíz exacta a esta precisión. Pasa de verdad:
        // `⁹√(tan y) = x²+4` con k=−30 cae a 3e−14 del polo de la tangente, por debajo del ulp
        // de y≈−92.7, así que `tan` ahí ya no se puede evaluar —la fórmula del motor es exacta,
        // lo que falla es la aritmética—. Estimarlo por pendiente no bastaba: la raíz novena
        // comprime la derivada y la guarda se quedaba corta.
        const eps = Math.max(Math.abs(y), 1) * 4e-16;   // ~2 ulp
        const va = D(x, y + eps), vb = D(x, y - eps);
        const variacion = Math.max(
          Number.isFinite(va) ? Math.abs(va - d) : Infinity,
          Number.isFinite(vb) ? Math.abs(vb - d) : Infinity,
        );
        if (Math.abs(d) > tol + 10 * variacion) {
          ramasFalsas++;
          if (!ejemploFalsa) ejemploFalsa = `x=${x}: afirma y=${y.toFixed(6)}, D=${d.toExponential(2)}`;
        }
      }
    }

    // (2) COMPLETITUD: toda raíz real de la original debe estar afirmada. Las raíces se buscan
    // POR RAMA de la original (el mínimo en valor absoluto no cambia de signo de forma fiable).
    const raices: number[] = [];
    for (const f of Ds)
      for (const r of raicesEnY(f, x, ventana))
        if (!raices.some((u) => Math.abs(u - r) < 1e-6 * (1 + Math.abs(r)))) raices.push(r);
    // TOPE de raíces por x. Una curva salvajemente oscilatoria (`cos(tan(y⁴))`: en y∈[−8,8] el
    // argumento llega a 4096 y la tangente da miles de vueltas) llena la ventana de raíces, y
    // cada una sin cubrir dispara una búsqueda dirigida: el arnés dejaba de terminar. Con esa
    // densidad la comprobación tampoco significa gran cosa —el muestreo ya no resuelve la
    // curva—, así que se examina una muestra y se sigue.
    if (raices.length > 40) raices.length = 40;
    for (const r of raices) {
      // GUARDA DE CONDICIONAMIENTO. Donde la original es astronómicamente empinada en y, la
      // pregunta "¿está cubierta esta raíz?" deja de tener respuesta en doble precisión:
      // `sin(exp(sinh y))` cerca de y=3.6 tiene período ~1e−8 en y, así que el parámetro de la
      // familia tendría que acertar a k ≈ 10⁷ EXACTO y ni la raíz ni la rama se pueden situar
      // con esa resolución. No es un fallo del motor sino el límite del oráculo, y declararlo
      // "rama perdida" sería ruido: se omite (y así el informe conserva su valor de señal).
      const h = Math.max(Math.abs(r), 1) * 1e-9;
      const dp = D(x, r + h), dm = D(x, r - h);
      const pendiente = Number.isFinite(dp) && Number.isFinite(dm) ? Math.abs(dp - dm) / (2 * h) : Infinity;
      if (pendiente > 1e6) continue;

      const cubierta = ys.some((y) => Math.abs(y - r) < 1e-4 * (1 + Math.abs(r)));
      if (cubierta) continue;
      // Segunda vuelta: puede cubrirla un k enorme, fuera de la enumeración corta. Solo aquí
      // se paga la búsqueda dirigida, que sí alcanza cualquier orden de magnitud.
      if (cubiertaPorFamilia(rhs, x, r)) continue;
      if (ys.length === 0) {
        // Ninguna rama definida en este x: la guarda de dominio recortó de más.
        excesivas++;
        if (!ejemploExcesiva) ejemploExcesiva = `x=${x}: la original tiene y=${r.toFixed(6)} pero el despeje no da NINGÚN valor`;
      } else {
        ramasPerdidas++;
        if (!ejemploPerdida) ejemploPerdida = `x=${x}: falta y=${r.toFixed(6)} (afirmadas: ${ys.map((v) => v.toFixed(3)).join(", ")})`;
      }
    }
  }

  if (ramasFalsas > 0)
    fallos.push({ nivel, ec, tipo: "rama-falsa", obtenido: `${despeje} · ${ejemploFalsa}`,
      esperado: "todo punto afirmado está en la curva original" });
  if (ramasPerdidas > 0)
    fallos.push({ nivel, ec, tipo: "rama-perdida", obtenido: `${despeje} · ${ejemploPerdida}`,
      esperado: "toda raíz real de la original está afirmada" });
  if (excesivas > 0)
    fallos.push({ nivel, ec, tipo: "condicion-excesiva", obtenido: `${despeje} · ${ejemploExcesiva}`,
      esperado: "la guarda de dominio no debe recortar donde SÍ hay curva" });

  return ramasFalsas + ramasPerdidas + excesivas > 0 ? "error" : "resuelto";
}

// ─────────────────────────────────────────────
// Ejecución e informe
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Autodiagnóstico: ¿los oráculos DETECTAN de verdad?
// ─────────────────────────────────────────────
//
// Una batería que no encuentra nada puede significar dos cosas muy distintas: que el motor está
// bien, o que el oráculo es ciego. Antes de dar por bueno ningún veredicto se le INYECTAN
// despejes deliberadamente incorrectos —uno por cada clase de error que dice detectar— y se
// exige que los cace. Si alguna mutación pasara inadvertida, la batería está rota y su
// "SIN FALLOS" no vale nada.

interface Mutacion { ec: string; despeje: string; espera: Tipo; porque: string }

const MUTACIONES: Mutacion[] = [
  { ec: "x^2 + y^2 = 9", despeje: "y = sqrt(9 - x^2)", espera: "rama-perdida",
    porque: "se quita el ±: falta la semicircunferencia inferior" },
  { ec: "sqrt(y) = x - 3", despeje: "y = (x - 3)^2", espera: "rama-falsa",
    porque: "se quita la guarda: inventa curva donde x<3" },
  { ec: "y^2 = x", despeje: "y = dom(pm(sqrt(x)), x - 3)", espera: "condicion-excesiva",
    porque: "guarda de más: borra la curva en 0≤x<3" },
  { ec: "y^3 = x", despeje: "y = nthRoot(x, 3) + 1", espera: "rama-falsa",
    porque: "desplazamiento: ninguna rama cae sobre la curva" },
  { ec: "abs(y) = x", despeje: "y = dom(x, x)", espera: "rama-perdida",
    porque: "solo la rama positiva del absoluto" },
];

console.log("Autodiagnóstico de los oráculos (inyección de fallos conocidos)\n");
let oraculosOk = true;
for (const m of MUTACIONES) {
  const detectados: Fallo[] = [];
  verificar("autodiagnóstico", { ec: m.ec }, detectados, m.despeje);
  const cazado = detectados.some((f) => f.tipo === m.espera);
  if (!cazado) oraculosOk = false;
  console.log(`  ${cazado ? "✓" : "✗ CIEGO"}  ${m.espera.padEnd(20)} ${m.ec}  ⟶  ${m.despeje}`);
  if (!cazado) console.log(`          esperaba detectar: ${m.porque}; detectó: ${detectados.map((f) => f.tipo).join(", ") || "nada"}`);
}
if (!oraculosOk) {
  console.log("\n⚠ LA BATERÍA ESTÁ CIEGA a alguna clase de error: sus resultados NO son fiables.");
  process.exitCode = 1;
}
console.log("");

console.log("Batería de verificación del CAS · despejador + simplificador\n");

const fallos: Fallo[] = [];
const resumenNivel: Array<{ nombre: string; total: number; resueltos: number; parciales: number; conError: number }> = [];

for (const { nombre, casos } of NIVELES) {
  let resueltos = 0, parciales = 0, conError = 0;
  for (const caso of casos) {
    const antes = fallos.length;
    const r = verificar(nombre, caso, fallos);
    if (r === "resuelto") resueltos++;
    else if (r === "parcial") parciales++;
    if (fallos.length > antes) conError++;
    if (VERBOSO) {
      const d = despejarEcuaciones([caso.ec])[0];
      console.log(`  ${caso.ec}\n      → ${d}\n      → ${bloqueALatex([d])}`);
    }
  }
  resumenNivel.push({ nombre, total: casos.length, resueltos, parciales, conError });
}

console.log("nivel                                                        casos  resueltos  parciales  con fallo");
console.log("─".repeat(104));
for (const r of resumenNivel) {
  console.log(`${r.nombre.padEnd(58)} ${String(r.total).padStart(6)} ${String(r.resueltos).padStart(10)} ` +
    `${String(r.parciales).padStart(10)} ${String(r.conError).padStart(10)}${r.conError > 0 ? "  ⚠" : ""}`);
}

// ─────────────────────────────────────────────
// Fase aleatoria: torres de composición generadas
// ─────────────────────────────────────────────
//
// El catálogo de arriba lo escribe una persona, así que encuentra sobre todo lo que ya
// sospechaba. Los fallos de un CAS viven en las COMBINACIONES que a nadie se le ocurren: una
// capa de rango restringido bajo una periódica bajo un recíproco. Aquí se generan torres al
// azar (semilla fija ⇒ reproducible) y se pasan por los MISMOS oráculos, que ya están validados.

function crearRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEMILLA = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 20260720);
const POR_LOTE = Number(process.argv.find((a) => a.startsWith("--n="))?.slice(4) ?? 220);
const R = crearRng(SEMILLA);
const elige = <T>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)];
const ent = (a: number, b: number): number => a + Math.floor(R() * (b - a + 1));

/** Una capa alrededor del núcleo. Se aplican de dentro hacia fuera. */
const CAPAS: ReadonlyArray<(u: string) => string> = [
  (u) => `(${u} + ${ent(-4, 4)})`,
  (u) => `(${ent(2, 4)}*${u})`,
  (u) => `(${u}/${ent(2, 4)})`,
  (u) => `(${u})^${ent(2, 5)}`,
  (u) => `sqrt(${u})`,
  (u) => `cbrt(${u})`,
  (u) => `nthRoot(${u}, ${ent(2, 4)})`,
  (u) => `abs(${u})`,
  (u) => `log(${u})`,
  (u) => `exp(${u})`,
  (u) => `sinh(${u})`,
  (u) => `tanh(${u})`,
  (u) => `sin(${u})`,
  (u) => `cos(${u})`,
  (u) => `tan(${u})`,
  (u) => `1/(${u})`,
];

/** Lado derecho: polinomio pequeño en x (a veces con una función). */
function ladoX(): string {
  switch (ent(0, 5)) {
    case 0: return `${ent(-4, 4)}`;
    case 1: return `${ent(-3, 3)}*x`;
    case 2: return `x^2 ${R() < 0.5 ? "+" : "-"} ${ent(1, 4)}`;
    case 3: return `${ent(-2, 2)}*x + ${ent(-4, 4)}`;
    case 4: return `abs(x) + ${ent(0, 3)}`;
    default: return `cos(x) + ${ent(0, 2)}`;
  }
}

console.log(`\n${"─".repeat(104)}`);
console.log(`Fase aleatoria · semilla=${SEMILLA} · ${POR_LOTE} torres generadas\n`);

const fallosAleatorios: Fallo[] = [];
let generadas = 0, resueltasAl = 0, parcialesAl = 0;
for (let i = 0; i < POR_LOTE; i++) {
  let u = "y";
  const profundidad = ent(1, 3);
  for (let d = 0; d < profundidad; d++) u = elige(CAPAS)(u);
  const ec = `${u} = ${ladoX()}`;
  generadas++;
  if (VERBOSO) console.log(`  [${i}] ${ec}`);
  const antes = fallosAleatorios.length;
  const r = verificar("aleatorio", { ec, ventanaY: [-8, 8] }, fallosAleatorios);
  if (r === "resuelto") resueltasAl++; else if (r === "parcial") parcialesAl++;
  if (fallosAleatorios.length > antes && VERBOSO)
    console.log(`  ⚠ ${ec}\n      → ${despejarEcuaciones([ec])[0]}`);
}
console.log(`  generadas ${generadas} · despejadas del todo ${resueltasAl} · parciales ${parcialesAl} · con fallo ${fallosAleatorios.length}`);
fallos.push(...fallosAleatorios);

console.log(`\n${"═".repeat(104)}`);
if (fallos.length === 0) {
  console.log("SIN FALLOS: soundness, completitud, dominio, representación y simplificación correctos.");
} else {
  const porTipo = new Map<Tipo, Fallo[]>();
  for (const f of fallos) {
    if (!porTipo.has(f.tipo)) porTipo.set(f.tipo, []);
    porTipo.get(f.tipo)!.push(f);
  }
  console.log(`INFORME DE FALLOS (${fallos.length}), agrupados por TIPO:\n`);
  for (const [tipo, lista] of porTipo) {
    console.log(`▸ ${tipo.toUpperCase()} (${lista.length})`);
    for (const f of lista) {
      console.log(`    ecuación : ${f.ec}`);
      console.log(`    obtenido : ${f.obtenido}`);
      console.log(`    esperado : ${f.esperado}`);
      console.log("");
    }
  }
  const graves = fallos.filter((f) => f.tipo !== "limite-superado").length;
  if (graves > 0) process.exitCode = 1;
}
