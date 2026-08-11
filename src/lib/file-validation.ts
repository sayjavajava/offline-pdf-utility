/** Shared file-input validation for the tool components (P1-11). */

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
export const LARGE_FILE_WARNING_BYTES = 100 * 1024 * 1024; // 100 MB

export function hasPdfExtension(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

export function hasPdfMagic(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < PDF_MAGIC.length) return false;
  const header = new Uint8Array(bytes, 0, PDF_MAGIC.length);
  return PDF_MAGIC.every((b, i) => header[i] === b);
}

export async function assertPdfFile(file: File): Promise<void> {
  if (!hasPdfExtension(file.name)) {
    throw new Error(`"${file.name}" does not look like a PDF. Please choose a .pdf file.`);
  }
  // Read only the header. Buffering the whole file here would allocate a second
  // full copy purely to inspect five bytes — on exactly the large files this
  // module warns about, and just before the tool reads the file again anyway.
  const header = await file.slice(0, PDF_MAGIC.length).arrayBuffer();
  if (!hasPdfMagic(header)) {
    throw new Error(`"${file.name}" is not a valid PDF (missing %PDF- header).`);
  }
}

export function largeFileWarning(file: File): string | null {
  if (file.size <= LARGE_FILE_WARNING_BYTES) return null;
  const mb = (file.size / (1024 * 1024)).toFixed(0);
  return `This file is ${mb} MB. Large files are processed on the main thread and may freeze the tab for a while.`;
}
