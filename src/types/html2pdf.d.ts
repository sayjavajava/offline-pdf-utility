/**
 * Minimal typings for the html2pdf.js surface we actually call (P2-18).
 * The package ships no declarations of its own.
 */
declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | [number, number, number, number];
    jsPDF?: { unit?: string; format?: string; orientation?: string };
    pagebreak?: { mode?: string | string[] };
    html2canvas?: { scale?: number };
  }

  interface Html2PdfWorker {
    set(options: Html2PdfOptions): Html2PdfWorker;
    from(element: HTMLElement): Html2PdfWorker;
    output(type: "blob"): Promise<Blob>;
    save(filename?: string): Promise<void>;
  }

  function html2pdf(): Html2PdfWorker;
  export default html2pdf;
}
