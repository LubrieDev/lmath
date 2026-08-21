// ─────────────────────────────────────────────
// oro · Generar los ficheros dorados (acto DELIBERADO)
// ─────────────────────────────────────────────
//
//   npm run oro
//
// Regenerar los dorados es aceptar la salida actual del CAS como la nueva referencia, así que
// tiene su propio comando y no ocurre nunca por accidente: la suite solo COMPARA
// (`tests/modules/oro.test.ts`), nunca reescribe.
//
// Antes de escribir nada, informa de lo que va a cambiar y con qué clase, para que el que teclea
// el comando vea qué está aceptando. Si lo que cambia incluye algo `matemático`, el aviso sale
// destacado: no lo impide —a veces un cambio matemático es justo lo que se quería—, pero no deja
// que pase inadvertido.

import { deserializar, serializar, volcarEcuaciones, volcarExpresiones } from "./volcar";
import { comparar, informeATexto } from "./clasificar";
import { DORADOS, RUTA_ECUACIONES, RUTA_EXPRESIONES } from "./rutas";

declare const require: (m: string) => {
  readFileSync(p: string, e: string): string;
  writeFileSync(p: string, d: string): void;
  mkdirSync(p: string, o?: { recursive: boolean }): void;
  existsSync(p: string): boolean;
};
declare const process: { stdout: { write(s: string): void } };

const fs = require("fs");
const w = (s: string): void => process.stdout.write(s + "\n");

function regenerar(ruta: string, texto: string, titulo: string): void {
  if (fs.existsSync(ruta)) {
    const antes = deserializar(fs.readFileSync(ruta, "utf8"));
    const informe = comparar(antes, deserializar(texto));
    w(`\n${titulo}`);
    w(informe.cambios.length === 0 && informe.soloAhora.length === 0 && informe.soloAntes.length === 0
      ? "  sin cambios"
      : informeATexto(informe));
    if (informe.recuento["matemático"] > 0)
      w(`  ⚠ ATENCIÓN: ${informe.recuento["matemático"]} cambio(s) MATEMÁTICO(s) en lo que estás aceptando.`);
  } else {
    w(`\n${titulo}\n  fichero nuevo`);
  }
  fs.writeFileSync(ruta, texto);
}

fs.mkdirSync(DORADOS, { recursive: true });
regenerar(RUTA_ECUACIONES, serializar(volcarEcuaciones()), "ecuaciones");
regenerar(RUTA_EXPRESIONES, serializar(volcarExpresiones()), "expresiones");
w("\ndorados escritos.");
