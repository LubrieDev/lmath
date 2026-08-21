// ─────────────────────────────────────────────
// frontera · Nadie de fuera entra en las tripas de `src/CAS/`
// ─────────────────────────────────────────────
//
// La regla que hace que la fachada sea una fachada y no una sugerencia: desde fuera de
// `src/CAS/` solo se puede importar `src/CAS/api`. Sin esta prueba, la primera vez que a alguien
// (yo incluido) le venga bien un atajo, importará `CAS/nucleo/expresion` directamente y la
// frontera dejará de existir sin que nadie se entere.
//
// Las puertas son DOS: `api.ts` (el núcleo nuevo) y `api-legado.ts` (el motor histórico, que solo
// puede encoger). Cualquier otra ruta bajo `CAS/` es una infracción.
//
// La comprobación es textual sobre el árbol de fuentes —no necesita compilar nada— y por eso
// también vigila lo que un análisis de tipos no vería: un `import type`, un `require`, o un
// import dentro de un comentario que alguien descomente.

import { describe, test, assert, igual } from "../runner";

declare const require: (m: string) => {
  readFileSync(p: string, e: string): string;
  readdirSync(p: string, o: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean }>;
  existsSync(p: string): boolean;
};
const fs = require("fs");

const RAIZ = "src";
const CAS = "src/CAS";

/** Las ÚNICAS puertas: la del núcleo nuevo y la del motor histórico. Son dos y no una a
 *  propósito —`api-legado.ts` solo puede encoger, y su tamaño es el marcador de progreso de la
 *  migración—, pero cualquier otra ruta bajo `CAS/` es una infracción. */
const PUERTAS = [`${CAS}/api`, `${CAS}/api-legado`];

/** Todos los `.ts` bajo `dir`, recursivamente. Rutas con `/`, para que las comparaciones no
 *  dependan del separador de la plataforma. */
function fuentes(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...fuentes(ruta));
    else if (e.name.endsWith(".ts")) out.push(ruta);
  }
  return out;
}

/** Los módulos que importa un archivo, tal como están escritos (`from "…"` y `require("…")`). */
function importados(ruta: string): string[] {
  const texto = fs.readFileSync(ruta, "utf8");
  const out: string[] = [];
  const re = /(?:from|require\s*\()\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) out.push(m[1]);
  return out;
}

/** Resuelve un import relativo a una ruta desde la raíz del proyecto. */
function resolver(desde: string, especificador: string): string | null {
  if (!especificador.startsWith(".")) return null;
  const partes = desde.split("/").slice(0, -1);
  for (const p of especificador.split("/")) {
    if (p === ".") continue;
    else if (p === "..") partes.pop();
    else partes.push(p);
  }
  return partes.join("/");
}

describe("frontera · la fachada de src/CAS/", () => {
  // Sin esto, la prueba de abajo pasaría también si `fuentes()` dejara de encontrar archivos —un
  // cambio de ruta, un renombrado de carpeta— y estaríamos mirando un verde que no comprueba
  // nada. Una regla que solo se vigila cuando hay algo que vigilar no es una regla.
  test("el recorrido encuentra de verdad el árbol de fuentes", () => {
    const todas = fuentes(RAIZ), delNucleo = fuentes(CAS);
    assert(todas.length > 100, `esperaba más de 100 fuentes en ${RAIZ}, encontré ${todas.length}`);
    assert(delNucleo.length >= 10, `esperaba al menos 10 en ${CAS}, encontré ${delNucleo.length}`);
    assert(
      todas.some((a) => importados(a).length > 0),
      "ningún archivo declara importaciones: el lector de importaciones está roto"
    );
  });

  test("el resolutor de rutas relativas funciona", () => {
    // Si `resolver` devolviera siempre null, la prueba de la fachada no vería ninguna infracción
    // aunque las hubiera. Se comprueba con la forma exacta que tendría una infracción real.
    igual(resolver("src/host-obsidian/ui/paneles.ts", "../../CAS/nucleo/expresion"),
      "src/CAS/nucleo/expresion", "sube dos niveles y baja al núcleo");
    igual(resolver("src/despejar.ts", "./CAS/api"), "src/CAS/api", "hermano");
    igual(resolver("src/despejar.ts", "mathjs"), null, "un paquete no es una ruta relativa");
  });

  test("desde fuera de CAS/ solo se importa CAS/api", () => {
    const infracciones: string[] = [];
    for (const archivo of fuentes(RAIZ)) {
      if (archivo.startsWith(`${CAS}/`)) continue;          // dentro de CAS/ todo vale
      for (const esp of importados(archivo)) {
        const destino = resolver(archivo, esp);
        if (destino === null || !destino.startsWith(`${CAS}/`)) continue;
        if (PUERTAS.includes(destino)) continue;             // las fachadas, que son las puertas
        infracciones.push(`${archivo} → ${esp}`);
      }
    }
    assert(
      infracciones.length === 0,
      `importan las tripas de CAS/ en vez de su fachada:\n      ${infracciones.join("\n      ")}`
    );
  });

  test("el núcleo no depende de la interfaz ni del motor de dibujo", () => {
    // La dirección de la dependencia es la que define la arquitectura: `CAS/` es el que no sabe
    // que existe un plano, un canvas, una nota ni un idioma. En cuanto importe algo de `host-`,
    // `core/`, `engines/` o `i18n/`, deja de ser un núcleo y pasa a ser otra capa de la interfaz.
    const prohibidos = ["host-obsidian", "engines/", "i18n/", "core/rendering", "core/interaction"];
    const infracciones: string[] = [];
    for (const archivo of fuentes(CAS)) {
      for (const esp of importados(archivo)) {
        if (prohibidos.some((p) => esp.includes(p))) infracciones.push(`${archivo} → ${esp}`);
      }
    }
    assert(
      infracciones.length === 0,
      `el núcleo importa capas de arriba:\n      ${infracciones.join("\n      ")}`
    );
  });

  test("obsidian no se importa desde el núcleo", () => {
    const infracciones = fuentes(CAS)
      .filter((a) => importados(a).some((e) => e === "obsidian" || e.startsWith("obsidian/")));
    assert(infracciones.length === 0, `importan obsidian: ${infracciones.join(", ")}`);
  });

  test("las capas de consumo piden el CAS por la fachada, no por dentro", () => {
    // La otra mitad de la regla. Que nadie entre en las tripas de `CAS/` no sirve de nada si los
    // paneles y los bloques siguen importando `../../despejar` o `../../math/resolverSistema`
    // directamente: la fachada existiría y no la usaría nadie, y el dia que una capacidad se
    // mude al nucleo habria que tocar los quince sitios que la piden en vez de una linea.
    //
    // `core/` NO esta en esta lista a proposito: `core/parsing/` todavia mezcla lectura, algebra
    // y composicion (queda anotado en la revision de arquitectura), y encaminarlo por la fachada
    // crearia un ciclo real —`core/parsing` → fachada → `integral` → `core/parsing`—. Se ordena
    // cuando esa carpeta se parta, no antes.
    const CONSUMIDORES = ["src/host-obsidian/", "src/engines/", "src/trig/", "src/vector/"];
    const DEL_CAS = [
      "parser", "latex", "simplificar", "despejar", "despejeInverso", "derivar", "integrar",
      "integral", "condiciones", "formatoExpr", "evaluador", "degeneradas",
    ];
    const infracciones: string[] = [];
    for (const archivo of fuentes(RAIZ)) {
      if (!CONSUMIDORES.some((c) => archivo.startsWith(c))) continue;
      for (const esp of importados(archivo)) {
        const destino = resolver(archivo, esp);
        if (destino === null) continue;
        const hoja = destino.replace(/^src\//, "");
        const esDelCas = DEL_CAS.includes(hoja) || hoja.startsWith("math/")
          || hoja.startsWith("expr/") || hoja.startsWith("despeje/") || hoja.startsWith("latex/");
        if (esDelCas) infracciones.push(`${archivo} -> ${esp}`);
      }
    }
    assert(
      infracciones.length === 0,
      "piden el CAS por dentro en vez de por la fachada:\n      " + infracciones.join("\n      ")
    );
  });
});
