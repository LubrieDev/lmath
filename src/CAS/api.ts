// ─────────────────────────────────────────────
// CAS · La fachada del NÚCLEO simbólico
// ─────────────────────────────────────────────
//
// La puerta a lo construido en esta reforma: la expresión, la torre numérica, el orden total, el
// registro de funciones, la forma canónica, los números algebraicos y el puente.
//
// ── Dos puertas, y por qué ───────────────────────────────────────────────────────────────
// El motor histórico —simplificar, despejar, derivar, integrar, el LaTeX de mathjs— sale por
// `api-legado.ts`, no por aquí. Mientras estuvieron juntos, importar la fachada para usar un tipo
// del núcleo metía en el grafo `simplificar`, `despejar`, `integral`, `latex` y `evaluador`: el
// núcleo parecía depender del motor viejo cuando no lo hace.
//
// Separadas, el tamaño de `api-legado.ts` es literalmente el marcador de progreso de la
// migración. Cada etapa que traslade una capacidad al núcleo le quita una línea, y cuando se
// quede vacío, la transición habrá terminado.
//
// ── La regla ─────────────────────────────────────────────────────────────────────────────
// Desde fuera de `src/CAS/` se importa `src/CAS/api` o `src/CAS/api-legado`, y nada más. Lo
// comprueba `tests/modules/frontera.test.ts`, no la disciplina de nadie.
//
// ── Lo que NO va a entrar aquí nunca ─────────────────────────────────────────────────────
// Nada que sepa que existe un plano, un lienzo, una nota o un idioma. El trazado, la cámara, los
// paneles, los bloques y la traducción son CONSUMIDORES del CAS, no partes de él.

// La expresión y sus primitivas.
export {
  type Expresion, type Condicion, type NombreConstante,
  aplicacion, condicionado, constante, entero, esExacta, familia, literal, opuesto,
  potencia, producto, racional, rama, simbolo, simbolosDe, suma, resta, cociente, inverso,
  contieneSimbolo, recorrer,
} from "./nucleo/expresion";
export { type Numero, aproximar, desdeTexto, esExacto, numAlgebraico, textoN } from "./nucleo/numero";
export { comparar, ordenar } from "./nucleo/orden";
export { iguales, contiene, sinRepetidas } from "./nucleo/igualdad";

// El registro de funciones: añadir una función es añadir una ficha, no tocar siete archivos.
export { type FichaFuncion, type Inversa } from "./registro/ficha";
export { CATALOGO, conocida, fichaDe } from "./registro/catalogo";

// La forma canónica, que ahora es estructural y no se calcula al imprimir.
export { normalizar } from "./normal/canonica";
export { siempreDefinida } from "./dominio/definicion";

// Números exactos de cualquier grado, y el camino de vuelta a expresión.
export {
  type Algebraico, aproximarA, bienFormado, comoRadical, compararA, desdeRacional,
  igualesA, negadoA, productoA, raicesAlgebraicas, signoA, sumaA,
} from "./numeros/algebraico";
export { comoExpresion, formaCerrada, tieneFormaCerrada } from "./numeros/forma";
export { type SolucionExacta, raicesExactas } from "./resolver/exactas";

// El puente con mathjs, que es lo único que sabe de centinelas.
export { aMathjs, deMathjs, funcionSoportada } from "./puente/mathjs";

