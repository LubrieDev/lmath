// ─────────────────────────────────────────────
// rendering · Paleta del PLANO (la tinta, no el marco)
// ─────────────────────────────────────────────
//
// Reparto de responsabilidades del color en el plugin, decidido a la vista de las tres
// maquetas de tema claro:
//
//   • El MARCO —contenedor, panel de la fórmula, botones, menús, bordes— hereda las
//     variables de Obsidian (`--background-primary`, `--text-normal`…). Es cromo, y el
//     cromo es del usuario: así el bloque encaja con CUALQUIER tema, también los de la
//     comunidad, y sin mantenimiento por nuestra parte. Eso vive en `styles.css`.
//   • La TINTA del plano —rejilla, ejes, etiquetas, curvas, marcadores— es NUESTRA, en dos
//     versiones afinadas a mano. Una gráfica necesita contraste GARANTIZADO entre sus capas
//     (la rejilla debe verse sin competir con los ejes, y la curva por encima de las dos), y
//     ninguna variable de tema promete eso. Lo único que se le pregunta al tema es si es
//     claro u oscuro.
//
// El FONDO del plano no está aquí a propósito: lo pone el CSS del canvas
// (`--background-primary`) y el Overlay solo limpia, así que la superficie sigue al tema
// como el resto de la nota y cambiarlo no cuesta un repintado.
//
// La paleta clara NO es la oscura invertida. Sobre blanco, el azul `#4f9eff` se lava y baja
// a `#2f6df6`; la rejilla pasa de gris claro al 12 % a negro al 10 %; los ejes ganan peso
// porque un gris tenue sobre blanco desaparece; y el halo BLANCO de los marcadores —que
// sobre fondo oscuro los separa de la curva— se vuelve oscuro, porque sobre blanco un halo
// blanco no separa nada.

/** Color RGBA normalizado [0..1], el formato de `Estilo` (y directo para WebGL). */
export type ColorRGBA = readonly [number, number, number, number];

export interface PaletaPlano {
  /** Rejilla tenue de fondo. */
  readonly rejilla: string;
  /** Ejes X e Y. */
  readonly eje: string;
  /** Marcas (ticks) de los ejes. */
  readonly marca: string;
  /** Números de los ejes. */
  readonly etiqueta: string;
  /** Asíntotas punteadas. */
  readonly asintota: string;
  /** Halo de los marcadores: los separa de la curva sobre la que se posan. */
  readonly halo: string;
  /** Disco de un punto notable (raíz, vértice, corte con Y). */
  readonly puntoNotable: string;
  /** Disco de una intersección entre curvas de un sistema. */
  readonly interseccion: string;
  /** Icono del cursor (la cruz que sustituye al puntero del sistema). */
  readonly cursor: string;
  /** Líneas de puntos del crosshair. */
  readonly guiaCrosshair: string;
  /** Etiquetas `x = …` / `y = …` del crosshair. */
  readonly textoCrosshair: string;
  /** Anillo del punto ANCLADO en modo carril. */
  readonly anilloCarril: string;
  /** Relleno de la integral sobre el eje (área positiva) y bajo el eje (negativa). */
  readonly rellenoPositivo: string;
  readonly rellenoNegativo: string;
  /** Tramado diagonal sobre esos rellenos. */
  readonly tramaPositiva: string;
  readonly tramaNegativa: string;
  /** Verticales que cierran la región de integración en x=a y x=b. */
  readonly bordeRegion: string;
  /** Colores de curva por orden de ecuación (se reciclan si hay más ecuaciones). */
  readonly curvas: readonly ColorRGBA[];
}

/** Paleta de SIEMPRE (tema oscuro): valores idénticos a los que había repartidos por los
 *  renderizadores, para que el tema oscuro quede exactamente como estaba. */
export const PLANO_OSCURO: PaletaPlano = {
  rejilla: "rgba(130,130,150,0.12)",
  eje: "rgba(160,160,170,0.7)",
  marca: "rgba(160,160,170,0.5)",
  etiqueta: "rgba(160,160,170,0.85)",
  asintota: "rgba(100, 150, 255, 0.3)",
  halo: "rgba(255, 255, 255, 0.3)",
  puntoNotable: "rgba(255, 160, 40, 1.0)",
  interseccion: "rgba(168, 85, 247, 1.0)",
  cursor: "rgba(235, 238, 245, 0.95)",
  guiaCrosshair: "rgba(140, 170, 255, 0.3)",
  textoCrosshair: "rgba(200, 210, 255, 0.9)",
  anilloCarril: "rgba(255, 160, 40, 0.9)",
  rellenoPositivo: "rgba(90, 165, 255, 0.20)",
  rellenoNegativo: "rgba(240, 110, 90, 0.20)",
  tramaPositiva: "rgba(140, 195, 255, 0.30)",
  tramaNegativa: "rgba(255, 150, 125, 0.30)",
  bordeRegion: "rgba(110, 175, 255, 0.95)",
  curvas: [
    [0.31, 0.62, 1.0, 1.0],   // azul
    [1.0, 0.63, 0.20, 1.0],   // naranja
    [0.40, 0.85, 0.45, 1.0],  // verde
    [0.85, 0.45, 0.90, 1.0],  // morado
    [0.95, 0.40, 0.45, 1.0],  // rojo
    [0.35, 0.80, 0.85, 1.0],  // cian
  ],
};

/** Paleta para fondo CLARO. Mismos seis matices (son identidad del plugin), oscurecidos
 *  hasta contrastar sobre blanco; y las capas de fondo invertidas en peso, no en color. */
export const PLANO_CLARO: PaletaPlano = {
  rejilla: "rgba(16,24,40,0.10)",
  eje: "rgba(30,38,55,0.50)",
  marca: "rgba(30,38,55,0.40)",
  etiqueta: "rgba(30,38,55,0.70)",
  asintota: "rgba(45, 95, 205, 0.35)",
  halo: "rgba(16, 24, 40, 0.16)",
  puntoNotable: "rgba(168, 86, 10, 1.0)",
  interseccion: "rgba(109, 40, 217, 1.0)",
  cursor: "rgba(24, 30, 44, 0.90)",
  guiaCrosshair: "rgba(45, 80, 180, 0.32)",
  textoCrosshair: "rgba(30, 45, 90, 0.95)",
  anilloCarril: "rgba(168, 86, 10, 0.95)",
  rellenoPositivo: "rgba(47, 109, 246, 0.14)",
  rellenoNegativo: "rgba(214, 70, 50, 0.14)",
  tramaPositiva: "rgba(47, 109, 246, 0.30)",
  tramaNegativa: "rgba(214, 70, 50, 0.30)",
  bordeRegion: "rgba(37, 85, 200, 0.95)",
  curvas: [
    [0.184, 0.427, 0.965, 1.0],  // azul   #2f6df6
    [0.659, 0.337, 0.039, 1.0],  // naranja #a8560a
    [0.122, 0.541, 0.298, 1.0],  // verde  #1f8a4c
    [0.545, 0.247, 0.780, 1.0],  // morado #8b3fc7
    [0.812, 0.184, 0.271, 1.0],  // rojo   #cf2f45
    [0.051, 0.498, 0.588, 1.0],  // cian   #0d7f96
  ],
};

// Paleta ACTIVA. Es estado de módulo a propósito: el tema es una propiedad de la APP
// (todos los bloques de todas las notas comparten uno), no de un bloque, y así los
// renderizadores no necesitan que se les inyecte nada ni cambian sus contratos. El valor
// por defecto es el oscuro, que es también el que ven las pruebas de Node —donde no hay
// `document`— y por eso su geometría y sus colores no se mueven.
let activa: PaletaPlano = PLANO_OSCURO;

/** Fija la paleta del plano según el tema activo. La llama el host al montar cada bloque y
 *  cuando Obsidian avisa de un cambio de tema (`css-change`); basta repintar después. */
export function fijarTemaPlano(oscuro: boolean): void {
  activa = oscuro ? PLANO_OSCURO : PLANO_CLARO;
}

/** Paleta del plano en uso. Se consulta al PINTAR (no al construir la escena), así un
 *  cambio de tema se resuelve con un repintado y sin rehacer geometría. */
export function paletaPlano(): PaletaPlano {
  return activa;
}

/** Color de curva por índice de ecuación, reciclando la paleta si hay más ecuaciones. */
export function colorCurva(indice: number): ColorRGBA {
  const c = activa.curvas;
  return c[((indice % c.length) + c.length) % c.length];
}
