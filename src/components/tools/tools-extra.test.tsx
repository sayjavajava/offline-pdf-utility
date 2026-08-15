/**
 * T-10, continued: component tests for the tools added after the original
 * pass — Rotate, Rearrange, Page Numbers, Extract Images, PDF to Images.
 *
 * Same contract as tools.test.tsx: guard when no file is chosen, call the
 * library with the arguments the form actually describes, surface both Error
 * and non-Error rejections (P0-5), and download what came back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

const rotatePdf = vi.fn();
const rearrangePdf = vi.fn();
const addPageNumbers = vi.fn();
const extractImages = vi.fn();

vi.mock("@/lib/pdf-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-utils")>("@/lib/pdf-utils");
  return {
    ...actual,
    rotatePdf: (...args: unknown[]) => rotatePdf(...args),
    rearrangePdf: (...args: unknown[]) => rearrangePdf(...args),
    addPageNumbers: (...args: unknown[]) => addPageNumbers(...args),
    extractImages: (...args: unknown[]) => extractImages(...args),
  };
});

// pdf-render drives pdf.js, which needs a canvas and a live worker. Mocked so
// the component contract can be tested; the real rendering is covered by the
// browser checks.
const renderPdfPages = vi.fn();
vi.mock("@/lib/pdf-render", () => ({
  renderPdfPages: (...args: unknown[]) => renderPdfPages(...args),
  getPageCount: vi.fn(),
}));

import { RotateTool } from "./RotateTool";
import { RearrangeTool } from "./RearrangeTool";
import { PageNumbersTool } from "./PageNumbersTool";
import { ExtractImagesTool } from "./ExtractImagesTool";
import { PdfToImagesTool } from "./PdfToImagesTool";

beforeEach(() => {
  toastSpy.mockClear();
  downloadBlob.mockClear();
  reportToolError.mockClear();
  rotatePdf.mockReset();
  rearrangePdf.mockReset();
  addPageNumbers.mockReset();
  extractImages.mockReset();
  renderPdfPages.mockReset();
  // Previews fire on mount; default to "nothing rendered" unless a case says otherwise.
  renderPdfPages.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const upload = async (input: HTMLElement, file: File) => {
  await userEvent.setup().upload(input, file);
};

const pdfInput = () => screen.getByLabelText(/pdf file/i);

describe("RotateTool (T-10)", () => {
  it("guards when no file is selected", async () => {
    const user = userEvent.setup();
    render(<RotateTool />);
    await user.click(screen.getByRole("button", { name: /rotate/i }));
    expect(rotatePdf).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
  });

  it("defaults a blank page field to every page", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(3);
    rotatePdf.mockResolvedValue(new Blob(["x"]));
    render(<RotateTool />);
    await upload(pdfInput(), file);
    await user.click(screen.getByRole("button", { name: /rotate/i }));
    await waitFor(() => expect(rotatePdf).toHaveBeenCalledWith(file, 90, "all", ""));
  });

  it("still toasts when the library rejects with a non-Error (P0-5)", async () => {
    const user = userEvent.setup();
    rotatePdf.mockRejectedValue("boom");
    render(<RotateTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /rotate/i }));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });
});

describe("RearrangeTool (T-10)", () => {
  it("guards when no file is selected", async () => {
    const user = userEvent.setup();
    render(<RearrangeTool />);
    await user.click(screen.getByRole("button", { name: /apply|reorder|delete/i }));
    expect(rearrangePdf).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("passes the requested page order through and downloads the result", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(4);
    rearrangePdf.mockResolvedValue(new Blob(["x"]));
    render(<RearrangeTool />);
    await upload(pdfInput(), file);
    await user.type(screen.getByLabelText(/pages/i), "3,1");
    await user.click(screen.getByRole("button", { name: /apply|reorder|delete/i }));
    await waitFor(() => expect(rearrangePdf).toHaveBeenCalled());
    expect(rearrangePdf.mock.calls[0][1]).toBe("3,1");
    expect(downloadBlob).toHaveBeenCalled();
  });
});

describe("PageNumbersTool (T-10 / F-6)", () => {
  it("guards when no file is selected", async () => {
    const user = userEvent.setup();
    render(<PageNumbersTool />);
    await user.click(screen.getByRole("button", { name: /add page numbers/i }));
    expect(addPageNumbers).not.toHaveBeenCalled();
  });

  it("previews the first stamp before anything is processed", async () => {
    render(<PageNumbersTool />);
    // The preview is the whole point of the prefix/padding controls being
    // visible — it must reflect the form without touching the document.
    expect(screen.getByText(/first stamp will read/i)).toHaveTextContent("1");
    await userEvent.setup().selectOptions(screen.getByLabelText(/format/i), "bates");
    await waitFor(() =>
      expect(screen.getByText(/first stamp will read/i)).toHaveTextContent("000001"),
    );
  });

  it("sends the chosen format and start number to the library", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(2);
    addPageNumbers.mockResolvedValue(new Blob(["x"]));
    render(<PageNumbersTool />);
    await upload(pdfInput(), file);
    await user.selectOptions(screen.getByLabelText(/format/i), "n-of-total");
    await user.clear(screen.getByLabelText(/start at/i));
    await user.type(screen.getByLabelText(/start at/i), "5");
    await user.click(screen.getByRole("button", { name: /add page numbers/i }));

    await waitFor(() => expect(addPageNumbers).toHaveBeenCalled());
    expect(addPageNumbers.mock.calls[0][1]).toMatchObject({ format: "n-of-total", start: 5 });
    expect(downloadBlob).toHaveBeenCalled();
  });
});

describe("ExtractImagesTool (T-10 / F-7)", () => {
  it("reports plainly when a PDF has no images, rather than downloading nothing", async () => {
    const user = userEvent.setup();
    extractImages.mockResolvedValue({ images: [], skipped: [] });
    render(<ExtractImagesTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /extract images/i }));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: "No images found", variant: "destructive" }),
      ),
    );
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("downloads a single image on its own rather than zipping it", async () => {
    const user = userEvent.setup();
    extractImages.mockResolvedValue({
      images: [{ name: "image-001-p1.png", bytes: new Uint8Array([1, 2]), width: 1, height: 1, format: "png" }],
      skipped: [],
    });
    render(<ExtractImagesTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /extract images/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(String(downloadBlob.mock.calls[0][1])).toMatch(/\.png$/);
  });

  it("zips several images", async () => {
    const user = userEvent.setup();
    const image = (name: string) => ({ name, bytes: new Uint8Array([1]), width: 1, height: 1, format: "png" as const });
    extractImages.mockResolvedValue({ images: [image("a.png"), image("b.png")], skipped: [] });
    render(<ExtractImagesTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /extract images/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(String(downloadBlob.mock.calls[0][1])).toMatch(/\.zip$/);
  });

  it("mentions images it could not export", async () => {
    const user = userEvent.setup();
    extractImages.mockResolvedValue({
      images: [{ name: "a.png", bytes: new Uint8Array([1]), width: 1, height: 1, format: "png" }],
      skipped: ["image-002-p1: unsupported image encoding (/JPXDecode)."],
    });
    render(<ExtractImagesTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /extract images/i }));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining("could not be exported") }),
      ),
    );
  });
});

describe("PdfToImagesTool (T-10 / F-4, F-5)", () => {
  it("guards when no file is selected", async () => {
    const user = userEvent.setup();
    render(<PdfToImagesTool />);
    await user.click(screen.getByRole("button", { name: /export pages/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
  });

  it("renders thumbnails once a file is chosen (F-5)", async () => {
    renderPdfPages.mockResolvedValue([
      { pageNumber: 1, bytes: new Uint8Array([1]), width: 10, height: 10 },
      { pageNumber: 2, bytes: new Uint8Array([2]), width: 10, height: 10 },
    ]);
    render(<PdfToImagesTool />);
    await upload(pdfInput(), await makePdfFile(2));
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  });

  it("does not blow up the tool when the preview fails", async () => {
    // An encrypted file with no password yet is the common case here.
    renderPdfPages.mockRejectedValue(new Error("password required"));
    render(<PdfToImagesTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await waitFor(() => expect(renderPdfPages).toHaveBeenCalled());
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /export pages/i })).toBeEnabled();
  });

  it("exports a single page as a bare png and several as a zip", async () => {
    const user = userEvent.setup();
    const page = (n: number) => ({ pageNumber: n, bytes: new Uint8Array([n]), width: 10, height: 10 });

    renderPdfPages.mockResolvedValue([page(1)]);
    const { unmount } = render(<PdfToImagesTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /export pages/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(String(downloadBlob.mock.calls[0][1])).toMatch(/_page1\.png$/);
    unmount();

    downloadBlob.mockClear();
    renderPdfPages.mockResolvedValue([page(1), page(2)]);
    render(<PdfToImagesTool />);
    await upload(pdfInput(), await makePdfFile(2));
    await user.click(screen.getByRole("button", { name: /export pages/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(String(downloadBlob.mock.calls[0][1])).toMatch(/\.zip$/);
  });
});
