// ─────────────────────────────────────────────
// tests · Suite del motor gráfico general (índice)
// ─────────────────────────────────────────────
//
// Pruebas de lógica PURA (sin DOM/Canvas/Obsidian). Este archivo ya no contiene
// pruebas: solo carga los módulos de `tests/modules/` —cada uno registra sus
// `describe` al importarse— e imprime el resumen final una única vez.
//
// El runner (`./runner`) lleva el contador de pasadas/fallos a nivel de módulo, así
// que la suite entera debe seguir siendo UN solo bundle con UNA sola llamada a
// `resumen()` al final: por eso los módulos se importan por efecto secundario y
// ninguno cierra la cuenta por su lado.
//
// Es la suite RÁPIDA (`npm run test`, ~30 s): la que se corre en CADA cambio. El barrido de
// zoom vive aparte en `zoom.test.ts` (~80 s, `npm run test:zoom`) porque su coste dominaba el
// ciclo. Regla para un bloque nuevo: si tarda más de unos segundos (el runner cronometra cada
// `describe`), va a la suite lenta; si no, aquí —en el módulo que le toque por tema.

import { resumen } from "./runner";

import "./modules/trazado.test";        // samplers, continuación, caché, puntos notables, robustez
import "./modules/despeje.test";        // panel Despejar y / Simplificar: contrato de presentación
import "./modules/despeje-radicales.test"; // familia radical/cuadrática y guarda de expansión
import "./modules/despeje-bateria.test";   // cobertura graduada y frontera de lo imposible
import "./modules/parser-latex.test";   // entrada (± , comandos LaTeX) y renderizado de fórmulas
import "./modules/carril.test";         // seguimiento de la cámara sobre la curva
import "./modules/gestos.test";         // punteros sobre el plano: arrastre, pellizco, cancelación
import "./modules/implicitas.test";     // separación, polos, periodicidad y teselado
import "./modules/parametricas.test";   // paramétricas y polares
import "./modules/escena.test";         // sistemas, intersecciones, autoencuadre, estrés
import "./modules/calculo.test";        // integral definida y derivadas
import "./modules/trig.test";           // obs-trig: parser del bloque y modelo del ángulo
import "./modules/vector.test";         // obs-vector: parser del bloque, tipografía y dibujo
import "./modules/restriccion.test";    // restricción de dominio: `expr {a ≤ x ≤ b}`
import "./modules/parametros.test";     // parámetros declarados: `A = 1` + `f(x) = A\sin x`
import "./modules/crosshair.test";      // la y del crosshair: evaluada en explícitas, rama en el resto
import "./modules/mate.test";           // motor matemático: racionales, polinomios y sistemas

resumen();
