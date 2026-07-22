// ─────────────────────────────────────────────
// tests · Suite del motor gráfico general (índice)
// ─────────────────────────────────────────────
//
// Pruebas de lógica PURA (sin DOM/Canvas/Obsidian). Este archivo ya no contiene
// pruebas: solo carga los módulos de `tests/modulos/` —cada uno registra sus
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

import "./modulos/trazado.test";        // samplers, continuación, caché, puntos notables, robustez
import "./modulos/despeje.test";        // panel Despejar y / Simplificar y batería del despejador
import "./modulos/parser-latex.test";   // entrada (± , comandos LaTeX) y renderizado de fórmulas
import "./modulos/carril.test";         // seguimiento de la cámara sobre la curva
import "./modulos/implicitas.test";     // separación, polos, periodicidad y teselado
import "./modulos/parametricas.test";   // paramétricas y polares
import "./modulos/escena.test";         // sistemas, intersecciones, autoencuadre, estrés
import "./modulos/calculo.test";        // integral definida y derivadas

resumen();
