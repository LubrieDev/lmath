// ─────────────────────────────────────────────
// oro · El corpus COMPARTIDO de casos del CAS (PURO: solo datos)
// ─────────────────────────────────────────────
//
// Un solo sitio donde vive «qué le preguntamos al CAS». Antes esta lista estaba dentro de
// `bateria-cas.ts`, sin exportar, así que el volcado dorado y la batería habrían interrogado a
// dos corpus distintos que se irían separando sin que nadie lo notara. Con un corpus único, la
// batería (que juzga soundness y completitud) y los dorados (que fijan la salida literal) hablan
// exactamente de los mismos casos.
//
// Este archivo NO importa nada del plugin y no ejecuta nada: son datos.
//
// ── Los dos corpus, y por qué son dos ────────────────────────────────────────────────────
// `NIVELES` son ECUACIONES, graduadas por dificultad, y su razón de ser es el despejador: cada
// caso es «aísla y aquí». Es el corpus histórico de la batería y se conserva LITERAL —añadir o
// quitar un caso cambia los números del informe por nivel, así que no se toca sin querer hacerlo.
//
// `EXPRESIONES` son expresiones sueltas, y existen porque el corpus de arriba está escrito para
// el despeje: casi todos sus casos son implícitas, y por tanto no dicen casi nada de simplificar,
// derivar e integrar, que trabajan sobre f(x). Sin este segundo corpus, los dorados de esos tres
// caminos serían mayoritariamente `∅` y no protegerían nada.

/** Un caso del corpus graduado. */
export interface Caso {
  ec: string;
  /** Los del nivel 6: SIN forma cerrada. Que queden parciales es el comportamiento correcto. */
  imposible?: boolean;
  /** Ventana de y para la búsqueda de raíces (por defecto ±12). Se estrecha donde la curva
   *  es densa en y (periódicas con muchísimas raíces) para que el informe sea legible. */
  ventanaY?: [number, number];
  nota?: string;
}

export interface Nivel {
  nombre: string;
  casos: Caso[];
}

/** El corpus graduado, LITERAL como estaba en `bateria-cas.ts`. */
export const NIVELES: Array<Nivel> = [
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

/** Todas las ecuaciones del corpus graduado, en orden. */
export const ECUACIONES: readonly string[] = NIVELES.flatMap((n) => n.casos.map((c) => c.ec));

/**
 * Corpus de EXPRESIONES f(x) para los caminos que el corpus de ecuaciones no ejercita:
 * simplificar, derivar e integrar. Elegidas para cubrir familias, no para que salgan bien:
 * varias están aquí precisamente porque hoy devuelven `∅`, y ese `∅` es información que el
 * dorado debe fijar (el día que deje de serlo, el clasificador lo marcará como `alcance`).
 */
export const EXPRESIONES: readonly string[] = [
  // polinómicas y sus formas
  "x^2 - 1",
  "(x+1)^2 - x^2",
  "(x+1)^3",
  "x^2 + 2*x + 1",
  "(x^2 - 1)/(x - 1)",
  "(x^3 - 1)/(x - 1)",
  "x/x",
  "0*x",
  "(x^2 - 4)/(x^2 - 4*x + 4)",
  // fracciones algebraicas
  "1/(x-1) + 1/(x+1)",
  "(x^2+1)/(x*(x+2))",
  "1/(1 + 1/(1 + x))",
  "sqrt(x)/(x+1)",
  // radicales y constantes irracionales
  "sqrt(2)*sqrt(3)",
  "sqrt(8) + sqrt(18)",
  "sqrt(x^2 + 1)",
  "nthRoot(x^3, 3)",
  "(1+sqrt(5))/2 + (1-sqrt(5))/2",
  "x^(1/2)",
  "x^(2/3)",
  // exponencial y logaritmo
  "e^(2*log(x, e))",
  "log(8, 2)",
  "log(x, 10)",
  "e^(3*x)",
  "3^x",
  "x*e^x",
  "log(x, e)",
  // trigonometría
  "sin(x)/cos(x)",
  "2*sin(x)*cos(x)",
  "sin(x)^2",
  "sin(pi/6)",
  "sin(x)^2 + cos(x)^2",
  "tan(x)",
  "asin(x)",
  "sin(2*x)",
  // valor absoluto y escalones
  "abs(x)",
  "abs(x^2)",
  "sqrt(x^2)",
  "floor(x)",
  // las que hoy no tienen primitiva elemental conocida por el motor
  "1/(x^2 - 1)",
  "1/(x^2 + 1)",
  "x*sqrt(x^2 + 1)",
  "e^(x^2)",
  // composiciones profundas
  "sin(sqrt(x^2+1))",
  "log(sqrt(x)+1, e)",
  "x^x",
  // constantes con nombre
  "pi*x",
  "5*pi*x - x*pi",
  "(x^2 + 5*x - x)*pi",
];
