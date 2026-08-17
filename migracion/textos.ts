// ─────────────────────────────────────────────
// migracion · Textos de la migración (es / en / pt)
// ─────────────────────────────────────────────
//
// Tabla LOCAL del prototipo, con la misma forma que `src/i18n/textos.ts` (una interfaz, una
// tabla por idioma, funciones para lo que lleva número). Cuando esto se promocione, las claves
// se mudan a `Textos` bajo `migracion:` y este archivo desaparece; mientras tanto vive aparte
// para no obligar a tocar los tres archivos de i18n del producto por una función temporal.
//
// El idioma activo lo lleva el módulo de i18n del plugin, así que aquí solo se elige la tabla.

import { idiomaActivo } from "../src/i18n";

export interface TextosMigracion {
  readonly avisoTitulo: string;
  readonly avisoCuerpo: string;
  readonly ajustesNombre: string;
  readonly ajustesDescripcion: string;
  readonly ajustesBoton: string;
  readonly modalTitulo: string;
  readonly modalIntro: string;
  readonly columnaAntes: string;
  readonly columnaAhora: string;
  readonly compatibilidad: string;
  readonly escaneando: string;
  readonly nadaQueHacer: string;
  readonly advertencia: string;
  resumen(bloques: number, notas: number): string;
  bloquesEnNota(n: number): string;
  readonly cancelar: string;
  readonly confirmar: string;
  readonly cerrar: string;
  hecho(bloques: number, notas: number): string;
  fallos(n: number): string;
}

const ES: TextosMigracion = {
  avisoTitulo: "LMath: la sintaxis de los bloques ha cambiado",
  avisoCuerpo:
    "Tus notas siguen funcionando. Abre los ajustes de LMath para actualizarlas al nombre nuevo.",
  ajustesNombre: "Sintaxis de los bloques",
  ajustesDescripcion:
    "Los bloques pasan de `obs-graph` a `_graph`. Los nombres antiguos siguen funcionando durante " +
    "esta transición; esta herramienta reescribe tus notas al nombre nuevo.",
  ajustesBoton: "Actualizar mis notas",
  modalTitulo: "Actualizar la sintaxis de los bloques",
  modalIntro: "Los seis bloques de LMath cambian de nombre:",
  columnaAntes: "Antes",
  columnaAhora: "Ahora",
  compatibilidad:
    "Los dos nombres funcionan mientras dure la transición, así que no hay ninguna prisa: puedes " +
    "cerrar esto y volver cuando quieras.",
  escaneando: "Buscando bloques en tus notas…",
  nadaQueHacer: "No hay ningún bloque con la sintaxis antigua. No hay nada que actualizar.",
  advertencia:
    "Esto reescribe tus notas en el disco. Solo se cambia el nombre del bloque —ni una línea más—, " +
    "pero conviene tener una copia del vault antes de seguir.",
  resumen: (bloques, notas) =>
    `${bloques} ${bloques === 1 ? "bloque" : "bloques"} en ` +
    `${notas} ${notas === 1 ? "nota" : "notas"}:`,
  bloquesEnNota: (n) => `${n} ${n === 1 ? "bloque" : "bloques"}`,
  cancelar: "Cancelar",
  confirmar: "Reescribir",
  cerrar: "Cerrar",
  hecho: (bloques, notas) =>
    `Listo: ${bloques} ${bloques === 1 ? "bloque actualizado" : "bloques actualizados"} en ` +
    `${notas} ${notas === 1 ? "nota" : "notas"}.`,
  fallos: (n) => `${n} ${n === 1 ? "nota no se pudo escribir" : "notas no se pudieron escribir"}.`,
};

const EN: TextosMigracion = {
  avisoTitulo: "LMath: the block syntax has changed",
  avisoCuerpo:
    "Your notes still work. Open the LMath settings to update them to the new name.",
  ajustesNombre: "Block syntax",
  ajustesDescripcion:
    "Blocks are moving from `obs-graph` to `_graph`. The old names keep working throughout this " +
    "transition; this tool rewrites your notes to the new one.",
  ajustesBoton: "Update my notes",
  modalTitulo: "Update the block syntax",
  modalIntro: "All six LMath blocks are being renamed:",
  columnaAntes: "Before",
  columnaAhora: "Now",
  compatibilidad:
    "Both names work for as long as the transition lasts, so there is no hurry: you can close this " +
    "and come back whenever you like.",
  escaneando: "Looking for blocks in your notes…",
  nadaQueHacer: "No blocks use the old syntax. There is nothing to update.",
  advertencia:
    "This rewrites your notes on disk. Only the block's name changes — not one line more — but it " +
    "is worth having a backup of your vault before you continue.",
  resumen: (bloques, notas) =>
    `${bloques} ${bloques === 1 ? "block" : "blocks"} in ` +
    `${notas} ${notas === 1 ? "note" : "notes"}:`,
  bloquesEnNota: (n) => `${n} ${n === 1 ? "block" : "blocks"}`,
  cancelar: "Cancel",
  confirmar: "Rewrite",
  cerrar: "Close",
  hecho: (bloques, notas) =>
    `Done: ${bloques} ${bloques === 1 ? "block" : "blocks"} updated in ` +
    `${notas} ${notas === 1 ? "note" : "notes"}.`,
  fallos: (n) => `${n} ${n === 1 ? "note could not be written" : "notes could not be written"}.`,
};

const PT: TextosMigracion = {
  avisoTitulo: "LMath: a sintaxe dos blocos mudou",
  avisoCuerpo:
    "As suas notas continuam a funcionar. Abra as definições do LMath para as atualizar para o " +
    "nome novo.",
  ajustesNombre: "Sintaxe dos blocos",
  ajustesDescripcion:
    "Os blocos passam de `obs-graph` para `_graph`. Os nomes antigos continuam a funcionar durante " +
    "esta transição; esta ferramenta reescreve as suas notas para o nome novo.",
  ajustesBoton: "Atualizar as minhas notas",
  modalTitulo: "Atualizar a sintaxe dos blocos",
  modalIntro: "Os seis blocos do LMath mudam de nome:",
  columnaAntes: "Antes",
  columnaAhora: "Agora",
  compatibilidad:
    "Os dois nomes funcionam enquanto durar a transição, por isso não há pressa: pode fechar isto " +
    "e voltar quando quiser.",
  escaneando: "A procurar blocos nas suas notas…",
  nadaQueHacer: "Nenhum bloco usa a sintaxe antiga. Não há nada para atualizar.",
  advertencia:
    "Isto reescreve as suas notas no disco. Só muda o nome do bloco — nem uma linha a mais —, mas " +
    "convém ter uma cópia do cofre antes de continuar.",
  resumen: (bloques, notas) =>
    `${bloques} ${bloques === 1 ? "bloco" : "blocos"} em ` +
    `${notas} ${notas === 1 ? "nota" : "notas"}:`,
  bloquesEnNota: (n) => `${n} ${n === 1 ? "bloco" : "blocos"}`,
  cancelar: "Cancelar",
  confirmar: "Reescrever",
  cerrar: "Fechar",
  hecho: (bloques, notas) =>
    `Pronto: ${bloques} ${bloques === 1 ? "bloco atualizado" : "blocos atualizados"} em ` +
    `${notas} ${notas === 1 ? "nota" : "notas"}.`,
  fallos: (n) => `${n} ${n === 1 ? "nota não pôde ser escrita" : "notas não puderam ser escritas"}.`,
};

/** Textos de la migración en el idioma activo del plugin. */
export function tm(): TextosMigracion {
  const id = idiomaActivo();
  return id === "es" ? ES : id === "pt" ? PT : EN;
}
