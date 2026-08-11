/**
 * Shared download / filename helpers used by every tool component.
 *
 * Consolidates the six copy-pasted createObjectURL → click → revoke sequences
 * (P1-10) and, in one place, fixes:
 *   - P1-8  incorrect filename derivation (`.replace('.pdf','')` / `.split('.')[0]`)
 *   - P1-9  synchronous `URL.revokeObjectURL` after `a.click()`
 *   - P0-5  silent swallow of non-`Error` throws in tool catch blocks
 */

type ToastFn = (props: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => unknown;

/** Strip only the final extension; leave earlier dots alone. */
export function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, "");
}

/**
 * Build a derived download name from an original filename.
 * e.g. derivedName("report.v2.docx", "_split") → "report.v2_split.pdf"
 *      derivedName("photo.png", "", "pdf") → "photo.pdf"
 */
export function derivedName(original: string, suffix: string, ext = "pdf"): string {
  return `${stripExtension(original)}${suffix}.${ext}`;
}

/**
 * Trigger a browser download of `blob` as `filename`.
 * Revoke is deferred (P1-9) so browsers that fetch the blob asynchronously
 * still have a live URL when the download starts.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Always surface a destructive toast, even when the thrown value is not an
 * `Error` instance (P0-5). Also logs the original so the stack survives.
 */
export function reportToolError(toast: ToastFn, title: string, error: unknown): void {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  toast({
    title,
    description: message || "An unexpected error occurred.",
    variant: "destructive",
  });
}
