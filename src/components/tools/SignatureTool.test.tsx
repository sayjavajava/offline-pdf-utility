/**
 * Add Signature (F-26): component-contract tests.
 *
 * jsdom has no real `<canvas>` 2D rendering (the `canvas` npm package jsdom
 * would need for that is an optional peer dep, not installed here — the
 * same gap `RedactTool.test.tsx` documents for image loading) and no
 * `HTMLCanvasElement.toBlob` implementation at all, so both are stubbed
 * just enough to prove the type/draw -> signature-image -> addSignature
 * wiring is correct, not to re-verify actual pixel rendering — that's
 * covered by a real-browser pass instead, same split this codebase already
 * uses for `pdf-render.ts`. The drag-to-place-a-rect math itself is the
 * same code `RedactTool.tsx` already has unit + real-browser coverage for
 * (including rotated pages); this file only checks it's wired to the right
 * call here, using the identical `stubAndDrag` shape that file's own tests use.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makePdfFile, pngFile } from "@/test/fixtures";

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

const addSignature = vi.fn();
vi.mock("@/lib/pdf-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-utils")>("@/lib/pdf-utils");
  return {
    ...actual,
    addSignature: (...args: unknown[]) => addSignature(...args),
  };
});

const renderPdfPages = vi.fn();
const getPageSizes = vi.fn();
vi.mock("@/lib/pdf-render", () => ({
  renderPdfPages: (...args: unknown[]) => renderPdfPages(...args),
  getPageSizes: (...args: unknown[]) => getPageSizes(...args),
}));

import { SignatureTool } from "./SignatureTool";

const fakeCtx = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
};

beforeEach(() => {
  toastSpy.mockClear();
  downloadBlob.mockClear();
  reportToolError.mockClear();
  addSignature.mockReset();
  renderPdfPages.mockReset();
  getPageSizes.mockReset();
  renderPdfPages.mockResolvedValue([{ pageNumber: 1, bytes: new Uint8Array([1, 2, 3]), width: 300, height: 450 }]);
  getPageSizes.mockResolvedValue([{ width: 200, height: 300 }]);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    fakeCtx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob(["fake-png-bytes"], { type: "image/png" }));
  });
  // jsdom implements neither PointerEvent capture on <canvas> nor real image
  // decoding from a blob: URL (same "no real object-URL/blob machinery"
  // gap RedactTool.test.tsx documents) - both stubbed just enough that the
  // component's own state transitions can be exercised.
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  vi.spyOn(window, "Image").mockImplementation(function (this: HTMLImageElement) {
    const img = document.createElement("img");
    Object.defineProperty(img, "naturalWidth", { value: 40, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 20, configurable: true });
    Object.defineProperty(img, "src", {
      set() {
        queueMicrotask(() => img.onload?.(new Event("load")));
      },
    });
    return img;
  } as unknown as typeof Image);
});

const upload = async (input: HTMLElement, file: File) => {
  await userEvent.setup().upload(input, file);
};

function stubAndDrag(img: HTMLElement) {
  vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON() { return {}; },
  });
  Object.defineProperty(img, "naturalWidth", { value: 200, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: 300, configurable: true });
  fireEvent.mouseDown(img, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(img, { clientX: 50, clientY: 40 });
  fireEvent.mouseUp(img, { clientX: 50, clientY: 40 });
}

describe("SignatureTool (F-26)", () => {
  it("guards when no file is selected", async () => {
    const user = userEvent.setup();
    render(<SignatureTool />);
    await user.click(screen.getByRole("button", { name: /add signature & download/i }));
    expect(addSignature).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
  });

  it("guards when no signature has been created yet", async () => {
    const user = userEvent.setup();
    render(<SignatureTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1));
    await waitFor(() => expect(screen.getByAltText(/page 1/i)).toBeInTheDocument());
    stubAndDrag(screen.getByAltText(/page 1/i));

    await user.click(screen.getByRole("button", { name: /add signature & download/i }));
    expect(addSignature).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No signature yet", variant: "destructive" }),
    );
  });

  it("guards when a signature exists but no placement was chosen", async () => {
    const user = userEvent.setup();
    render(<SignatureTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1));
    await user.type(screen.getByLabelText(/your name/i), "Jane Doe");
    await user.click(screen.getByRole("button", { name: /use this signature/i }));

    await user.click(screen.getByRole("button", { name: /add signature & download/i }));
    expect(addSignature).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No placement chosen", variant: "destructive" }),
    );
  });

  it("types a name, places it on the page, and applies with the right page/rect", async () => {
    const user = userEvent.setup();
    addSignature.mockResolvedValue(new Blob(["x"]));
    render(<SignatureTool />);

    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "doc.pdf"));
    await waitFor(() => expect(screen.getByAltText(/page 1/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/your name/i), "Jane Doe");
    await user.click(screen.getByRole("button", { name: /use this signature/i }));
    expect(fakeCtx.fillText).toHaveBeenCalledWith("Jane Doe", expect.any(Number), expect.any(Number), expect.any(Number));

    stubAndDrag(screen.getByAltText(/page 1/i));

    await user.click(screen.getByRole("button", { name: /add signature & download/i }));

    await waitFor(() => expect(addSignature).toHaveBeenCalled());
    const [fileArg, bytesArg, formatArg, placementArg] = addSignature.mock.calls[0];
    expect(fileArg.name).toBe("doc.pdf");
    expect(bytesArg).toBeInstanceOf(Uint8Array);
    expect(formatArg).toBe("png");
    expect(placementArg.page).toBe(1);
    expect(placementArg.width).toBeGreaterThan(0);
    expect(placementArg.height).toBeGreaterThan(0);
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "doc_signed.pdf");
  });

  it("switches to draw mode and captures a drawn signature", async () => {
    const user = userEvent.setup();
    render(<SignatureTool />);
    await user.click(screen.getByRole("button", { name: /^draw$/i }));

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas, { clientX: 20, clientY: 20 });
    expect(fakeCtx.stroke).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /use this signature/i }));
    expect(await screen.findByAltText(/signature preview/i)).toBeInTheDocument();
  });

  it("switches to upload mode and uses an uploaded image", async () => {
    render(<SignatureTool />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^upload$/i }));
    await upload(screen.getByLabelText(/signature image/i), pngFile("mysig.png"));
    expect(await screen.findByAltText(/signature preview/i)).toBeInTheDocument();
  });

  it("shows an error typing nothing and clicking 'use this signature'", async () => {
    const user = userEvent.setup();
    render(<SignatureTool />);
    await user.click(screen.getByRole("button", { name: /use this signature/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nothing typed", variant: "destructive" }),
    );
  });

  it("surfaces a non-Error rejection from addSignature (P0-5)", async () => {
    const user = userEvent.setup();
    addSignature.mockRejectedValue("boom");
    render(<SignatureTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1));
    await waitFor(() => expect(screen.getByAltText(/page 1/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/your name/i), "Jane Doe");
    await user.click(screen.getByRole("button", { name: /use this signature/i }));
    stubAndDrag(screen.getByAltText(/page 1/i));

    await user.click(screen.getByRole("button", { name: /add signature & download/i }));
    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error adding signature", "boom"),
    );
  });
});
