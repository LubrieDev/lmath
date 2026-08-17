// ─────────────────────────────────────────────
// migracion · Suite del escáner/reescritor de cercados
// ─────────────────────────────────────────────
//
// Se ejecuta con `npm run test:migracion`. Usa el runner de `tests/` (mismo micro-framework,
// mismo formato de salida) porque esto acabará viviendo en `tests/modules/` cuando el prototipo
// se promocione.
//
// Lo que se prueba aquí no es "que funcione": es que NO haga de más. La mitad de los casos
// afirman que un texto se queda exactamente como estaba.

import { assert, describe, igual, resumen, test } from "../tests/runner";

import { analizar, reescribir } from "./escaner";
import { RENOMBRES } from "./nombres";

describe("migración · lo que SÍ se reescribe", () => {
  test("un bloque suelto cambia de identificador", () => {
    const antes = "```obs-graph\nx^2\n```\n";
    igual(reescribir(antes).texto, "```_graph\nx^2\n```\n");
  });

  test("los seis bloques de la tabla, en una sola nota", () => {
    const antes = RENOMBRES.map((r) => `\`\`\`${r.viejo}\nx\n\`\`\``).join("\n\n");
    const despues = RENOMBRES.map((r) => `\`\`\`${r.nuevo}\nx\n\`\`\``).join("\n\n");
    const { texto, hallazgos } = reescribir(antes);
    igual(texto, despues);
    igual(hallazgos.length, 6);
  });

  test("un bloque indentado dentro de una lista se migra igual", () => {
    const antes = "- ejemplo:\n    ```obs-trig\n    30\n    ```\n";
    igual(reescribir(antes).texto, "- ejemplo:\n    ```_trig\n    30\n    ```\n");
  });

  test("el identificador en mayúsculas se reconoce y sale canónico", () => {
    igual(reescribir("```OBS-VECTOR\nv=(3,2)\n```").texto, "```_vector\nv=(3,2)\n```");
  });

  test("un cercado de tildes también es un cercado", () => {
    igual(reescribir("~~~obs-system\ny=x\n~~~").texto, "~~~_system\ny=x\n~~~");
  });

  test("el hallazgo apunta a la línea y columna reales", () => {
    const [h] = analizar("texto\n\n  ```obs-integral\n\\int_0^1 x dx\n  ```\n");
    igual(h.linea, 3);
    igual(h.columna, 5);
    igual(h.viejo, "obs-integral");
    igual(h.nuevo, "_integral");
  });
});

describe("migración · lo que NO se toca", () => {
  test("una mención en prosa no es un bloque", () => {
    const antes = "Escribe un bloque obs-graph para dibujar una curva.\n";
    assert(reescribir(antes).texto === antes, "la prosa se modificó");
  });

  test("un ejemplo dentro de un cercado MÁS LARGO es texto, no un bloque", () => {
    // Es justo lo que hace el README de LMath al documentar la sintaxis.
    const antes = "````\n```obs-graph\nx^2\n```\n````\n";
    igual(analizar(antes).length, 0);
    assert(reescribir(antes).texto === antes, "se reescribió un ejemplo literal");
  });

  test("un cercado de acentos dentro de uno de tildes tampoco cuenta", () => {
    const antes = "~~~\n```obs-trig\n30\n```\n~~~\n";
    igual(analizar(antes).length, 0);
  });

  test("el contenido de un bloque ajeno se respeta", () => {
    const antes = "```js\nconst s = '```obs-graph';\n```\n";
    igual(analizar(antes).length, 0);
  });

  test("un lenguaje que no es nuestro se queda como está", () => {
    const antes = "```python\nprint(1)\n```\n";
    assert(reescribir(antes).texto === antes, "se tocó un bloque ajeno");
  });

  test("sin hallazgos se devuelve LA MISMA cadena, no una copia", () => {
    const antes = "# Nota\n\nSin bloques.\n";
    assert(reescribir(antes).texto === antes, "debería ser idéntica por identidad");
  });

  test("un acento grave en la cadena de información no abre cercado", () => {
    // CommonMark lo prohíbe; si se abriera, el resto de la nota se leería como código.
    const antes = "``` `obs-graph`\nno es un bloque\n```\n";
    igual(analizar(antes).length, 0);
  });
});

describe("migración · fidelidad del texto", () => {
  test("los finales de línea CRLF sobreviven intactos", () => {
    const antes = "# Nota\r\n\r\n```obs-graph\r\nx^2\r\n```\r\n";
    const despues = reescribir(antes).texto;
    igual(despues, "# Nota\r\n\r\n```_graph\r\nx^2\r\n```\r\n");
    igual((despues.match(/\r\n/g) ?? []).length, 5);
  });

  test("la longitud del cercado y lo que sigue al identificador se conservan", () => {
    const antes = "`````obs-graph   \nx\n`````\n";
    igual(reescribir(antes).texto, "`````_graph   \nx\n`````\n");
  });

  test("un cercado sin cerrar al final del archivo no rompe el recorrido", () => {
    igual(reescribir("```obs-graph\nx^2\n").texto, "```_graph\nx^2\n");
  });

  test("solo cambia la longitud del identificador: el resto es idéntico", () => {
    const antes = "a\n```obs-graph\nx\n```\nb\n```obs-trig\n30\n```\nc\n";
    const despues = reescribir(antes).texto;
    // obs-graph(9)→_graph(6) y obs-trig(8)→_trig(5): 3+3 caracteres menos, nada más.
    igual(despues.length, antes.length - 6);
    igual(despues.split("\n").length, antes.split("\n").length);
  });

  test("ida y vuelta devuelve el original exacto", () => {
    const antes = "```obs-graph\r\nx^2\r\n```\r\n\n~~~obs-vector\nv=(1,2)\n~~~\n";
    const ida = reescribir(antes, "adelante");
    igual(ida.hallazgos.length, 2);
    igual(reescribir(ida.texto, "atras").texto, antes);
  });

  test("reescribir dos veces no vuelve a cambiar nada (idempotente)", () => {
    const unaVez = reescribir("```obs-graph\nx\n```\n").texto;
    assert(reescribir(unaVez).texto === unaVez, "la segunda pasada tocó algo");
  });
});

resumen();
