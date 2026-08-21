// ─────────────────────────────────────────────
// oro · Dónde viven los ficheros dorados (PURO: solo rutas)
// ─────────────────────────────────────────────
//
// En un archivo aparte porque lo comparten el generador (que los escribe) y la prueba (que los
// lee), y porque los bundles de esbuild se ejecutan desde la raíz del proyecto: las rutas son
// relativas a ella, no al archivo.

export const DORADOS = "tests/oro/dorados";
export const RUTA_ECUACIONES = `${DORADOS}/ecuaciones.txt`;
export const RUTA_EXPRESIONES = `${DORADOS}/expresiones.txt`;
