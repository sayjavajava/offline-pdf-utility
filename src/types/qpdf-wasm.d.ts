/**
 * Minimal typings for the @jspawn/qpdf-wasm surface we actually call (F-1).
 * The package ships no declarations of its own — it exposes only the qpdf
 * CLI via an Emscripten-generated factory (README: "This doesn't expose the
 * qpdf library - just the CLI").
 */
declare module "@jspawn/qpdf-wasm/qpdf.js" {
  interface QpdfFS {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
  }

  interface QpdfModule {
    FS: QpdfFS;
    /** Runs the qpdf CLI with the given argv and returns its exit code. */
    callMain(args: string[]): number;
  }

  interface QpdfModuleConfig {
    noInitialRun?: boolean;
    /** Overrides where the wasm binary is fetched from — see qpdf-engine.ts. */
    locateFile?: (path: string) => string;
  }

  function createQpdfModule(config?: QpdfModuleConfig): Promise<QpdfModule>;
  export default createQpdfModule;
}
