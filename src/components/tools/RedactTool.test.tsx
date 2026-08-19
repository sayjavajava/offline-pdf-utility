/**
 * T-10: component test for RedactTool (F-16).
 *
 * The actual pixel<->PDF-point math and pdf.js rendering are covered
 * elsewhere: `toPixelRect` has direct unit tests (pdf-redact.test.ts), and
 * the full render-and-rasterize pipeline is verified against the real built
 * app (Playwright) — jsdom doesn't load real images through blob URLs or lay
 * out a real DOM box for `getBoundingClientRect`, so this only stubs those
 * just enough to prove the drag-to-box-to-redactPdf-call wiring is correct,
 * not to re-verify the coordinate math a second time.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makePdfFile } from "@/test/fixtures";

const toastSpy = vi.fn();
const downloadBlob = vi.fn();
const reportToolError = vi.fn(
  (toast: typeof toastSpy, title: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    toast({ title, description: message || "An unexpected error occurred.", variant: "destructive" });
  },
);

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: (...args: unknown[]) => toastSpy(...args),
}));

vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
  reportToolError: (...args: unknown[]) =>
    reportToolError(...(args as [typeof toastSpy, string, unknown])),
}));

const redactPdf = vi.fn();
vi.mock("@/lib/pdf-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-utils")>("@/lib/pdf-utils");
  return {
    ...actual,
    redactPdf: (...args: unknown[]) => redactPdf(...args),
  };
});

const renderPdfPages = vi.fn();
const getPageCount = vi.fn();
vi.mock("@/lib/pdf-render", () => ({
  renderPdfPages: (...args: unknown[]) => renderPdfPages(...args),
  getPageCount: (...args: unknown[]) => getPageCount(...args),
}));

import { RedactTool } from "./RedactTool";

beforeEach(() => {
  toastSpy.mockClear();
  downloadBlob.mockClear();
  reportToolError.mockClear();
  redactPdf.mockReset();
  renderPdfPages.mockReset();
  getPageCount.mockReset();
  renderPdfPages.mockResolvedValue([{ pageNumber: 1, bytes: new Uint8Array([1, 2, 3]), width: 300, height: 450 }]);
  getPageCount.mockResolvedValue(1);
  // jsdom has no real object-URL/blob machinery worth exercising here.
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

const upload = async (input: HTMLElement, file: File) => {
  await userEvent.setup().upload(input, file);
};

describe("RedactTool (T-10 / F-16)", () => {
  it("disables Apply until at least one box is drawn", async () => {
    render(<RedactTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1));
    await waitFor(() => expect(screen.getByAltText(/page 1/i)).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /apply redactions/i })).toBeDisabled();
    expect(redactPdf).not.toHaveBeenCalled();
  });

  it("drawing a box enables Apply and calls redactPdf with the drawn rect", async () => {
    const user = userEvent.setup();
    redactPdf.mockResolvedValue(new Blob(["x"]));
    render(<RedactTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1));

    const img = await screen.findByAltText(/page 1/i);
    // 200x300 CSS px displayed, matching the 200x300 "natural" raster below —
    // no CSS scaling in play, so pixel math is a direct 1:1 stub.
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON() { return {}; },
    });
    Object.defineProperty(img, "naturalWidth", { value: 200, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 300, configurable: true });

    fireEvent.mouseDown(img, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(img, { clientX: 50, clientY: 40 });
    fireEvent.mouseUp(img, { clientX: 50, clientY: 40 });

    await waitFor(() => expect(screen.getByRole("button", { name: /apply redactions/i })).toBeEnabled());
    expect(screen.getByText(/1 box across 1 page will be redacted/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /apply redactions/i }));
    await waitFor(() => expect(redactPdf).toHaveBeenCalled());
    const [, redactions] = redactPdf.mock.calls[0];
    expect(Object.keys(redactions)).toEqual(["1"]);
    expect(redactions[1]).toHaveLength(1);
    expect(downloadBlob).toHaveBeenCalled();
  });

  it("still toasts when the library rejects with a non-Error (P0-5)", async () => {
    const user = userEvent.setup();
    redactPdf.mockRejectedValue("boom");
    render(<RedactTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1));

    const img = await screen.findByAltText(/page 1/i);
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON() { return {}; },
    });
    Object.defineProperty(img, "naturalWidth", { value: 200, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 300, configurable: true });

    fireEvent.mouseDown(img, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(img, { clientX: 50, clientY: 40 });
    fireEvent.mouseUp(img, { clientX: 50, clientY: 40 });

    await waitFor(() => expect(screen.getByRole("button", { name: /apply redactions/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /apply redactions/i }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });

  it("removing the only box disables Apply again", async () => {
    const user = userEvent.setup();
    render(<RedactTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1));

    const img = await screen.findByAltText(/page 1/i);
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON() { return {}; },
    });
    Object.defineProperty(img, "naturalWidth", { value: 200, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 300, configurable: true });

    fireEvent.mouseDown(img, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(img, { clientX: 50, clientY: 40 });
    fireEvent.mouseUp(img, { clientX: 50, clientY: 40 });
    await waitFor(() => expect(screen.getByRole("button", { name: /apply redactions/i })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(screen.getByRole("button", { name: /apply redactions/i })).toBeDisabled();
  });
});
