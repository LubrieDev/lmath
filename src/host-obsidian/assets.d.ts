// Declaración de módulos para assets incrustados por esbuild.
// El loader `dataurl` (package.json → script "build") convierte cada .ttf en un
// Data URI (string) que se importa por defecto y se embebe en el bundle (main.js).
declare module "*.ttf" {
  const dataUri: string;
  export default dataUri;
}
