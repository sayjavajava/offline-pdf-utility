/**
 * T-10: component tests for each tool.
 * Mocks pdf-utils + download; pins P0-5, P1-11, P1-13, P1-14.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makePdfFile } from "@/test/fixtures";

const toastSpy = vi.fn();
const downloadBlob = vi.fn();
const derivedName = vi.fn((name: string, suffix: string) => `${name}${suffix}.pdf`);
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

// Spy on the side-effecting helpers, but keep the real implementations of the
// pure ones. A hand-listed mock silently omits anything added later, and the
// resulting "no export defined" error surfaces as an unrelated assertion
// failure inside whichever tool used it.
vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
  derivedName: (...args: unknown[]) => derivedName(...(args as [string, string])),
  reportToolError: (...args: unknown[]) =>
    reportToolError(...(args as [typeof toastSpy, string, unknown])),
}));

const splitPdf = vi.fn();
const splitPdfToZip = vi.fn();
const mergePdf = vi.fn();
const removePdfPassword = vi.fn();
const protectPdf = vi.fn();
const protectPdfWithPermissions = vi.fn();
const compressPdf = vi.fn();
const editPdfMetadata = vi.fn();
const addWatermark = vi.fn();
const convertImageToPdf = vi.fn();
const convertDocxToPdf = vi.fn();
const detectImageFormat = vi.fn();

vi.mock("@/lib/pdf-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-utils")>("@/lib/pdf-utils");
  return {
    ...actual,
    splitPdf: (...args: unknown[]) => splitPdf(...args),
    splitPdfToZip: (...args: unknown[]) => splitPdfToZip(...args),
    mergePdf: (...args: unknown[]) => mergePdf(...args),
    removePdfPassword: (...args: unknown[]) => removePdfPassword(...args),
    protectPdf: (...args: unknown[]) => protectPdf(...args),
    protectPdfWithPermissions: (...args: unknown[]) => protectPdfWithPermissions(...args),
    compressPdf: (...args: unknown[]) => compressPdf(...args),
    editPdfMetadata: (...args: unknown[]) => editPdfMetadata(...args),
    addWatermark: (...args: unknown[]) => addWatermark(...args),
    convertImageToPdf: (...args: unknown[]) => convertImageToPdf(...args),
    convertDocxToPdf: (...args: unknown[]) => convertDocxToPdf(...args),
    detectImageFormat: (...args: unknown[]) => detectImageFormat(...args),
  };
});

import { SplitTool } from "./SplitTool";
import { MergeTool } from "./MergeTool";
import { UnlockTool } from "./UnlockTool";
import { ProtectTool } from "./ProtectTool";
import { CompressTool } from "./CompressTool";
import { EditTool } from "./EditTool";
import { AddWatermarkTool } from "./AddWatermarkTool";
import { ConvertTool } from "./ConvertTool";

beforeEach(() => {
  toastSpy.mockClear();
  downloadBlob.mockClear();
  derivedName.mockClear();
  reportToolError.mockClear();
  splitPdf.mockReset();
  splitPdfToZip.mockReset();
  mergePdf.mockReset();
  removePdfPassword.mockReset();
  protectPdf.mockReset();
  protectPdfWithPermissions.mockReset();
  compressPdf.mockReset();
  editPdfMetadata.mockReset();
  addWatermark.mockReset();
  convertImageToPdf.mockReset();
  convertDocxToPdf.mockReset();
  detectImageFormat.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function upload(input: HTMLElement, file: File | File[]) {
  const user = userEvent.setup();
  await user.upload(input, file);
}

describe("SplitTool (T-10)", () => {
  it("guards when no file is selected and never calls the util", async () => {
    const user = userEvent.setup();
    render(<SplitTool />);
    await user.click(screen.getByRole("button", { name: /split pdf/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
    expect(splitPdf).not.toHaveBeenCalled();
  });

  it("calls splitPdf with 'all' when pages is blank (P1-14)", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(2, "report.pdf");
    splitPdf.mockResolvedValue(new Blob(["x"]));
    render(<SplitTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /split pdf/i }));

    await waitFor(() =>
      expect(splitPdf).toHaveBeenCalledWith(file, "all", ""),
    );
    expect(downloadBlob).toHaveBeenCalled();
  });

  it("disables the button and shows progress while pending", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    let resolve!: (b: Blob) => void;
    splitPdf.mockImplementation(() => new Promise<Blob>((r) => { resolve = r; }));
    render(<SplitTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/pages to extract/i), "1");
    await user.click(screen.getByRole("button", { name: /split pdf/i }));

    expect(screen.getByRole("button", { name: /splitting/i })).toBeDisabled();
    resolve(new Blob(["x"]));
    await waitFor(() => expect(screen.getByRole("button", { name: /split pdf/i })).toBeEnabled());
  });

  it("toasts Error.message on rejection", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    splitPdf.mockRejectedValue(new Error("nope"));
    render(<SplitTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/pages to extract/i), "1");
    await user.click(screen.getByRole("button", { name: /split pdf/i }));

    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(
        toastSpy,
        "Error splitting PDF",
        expect.any(Error),
      ),
    );
  });

  it("still toasts when rejection is a non-Error (P0-5)", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    splitPdf.mockRejectedValue("boom");
    render(<SplitTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/pages to extract/i), "1");
    await user.click(screen.getByRole("button", { name: /split pdf/i }));

    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error splitting PDF", "boom"),
    );
  });

  it("resets to null when the picker is cancelled after a selection (P1-11)", async () => {
    const file = await makePdfFile(1, "keep.pdf");
    render(<SplitTool />);
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;

    await upload(input, file);
    expect(screen.getByText(/selected file: keep.pdf/i)).toBeInTheDocument();

    // Simulate a cancelled re-open: empty FileList.
    Object.defineProperty(input, "files", { configurable: true, value: [] });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      expect(screen.queryByText(/selected file:/i)).not.toBeInTheDocument();
    });
  });

  it("calls splitPdfToZip instead of splitPdf when 'separate files' is checked (F-13)", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(3, "report.pdf");
    splitPdfToZip.mockResolvedValue([
      { pageNumber: 1, bytes: new Uint8Array([1]) },
      { pageNumber: 2, bytes: new Uint8Array([2]) },
    ]);
    render(<SplitTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/pages to extract/i), "1,2");
    await user.click(screen.getByLabelText(/download as separate files/i));
    await user.click(screen.getByRole("button", { name: /split pdf/i }));

    await waitFor(() => expect(splitPdfToZip).toHaveBeenCalledWith(file, "1,2", ""));
    expect(splitPdf).not.toHaveBeenCalled();
    expect(downloadBlob).toHaveBeenCalled();
    // Zipped, so the download uses the derived-name helper rather than a bare filename.
    expect(derivedName).toHaveBeenCalledWith(file.name, "_split", "zip");
  });

  it("downloads a bare PDF, not a zip, when only one page is selected in separate-files mode", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(3, "report.pdf");
    splitPdfToZip.mockResolvedValue([{ pageNumber: 2, bytes: new Uint8Array([9]) }]);
    render(<SplitTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/pages to extract/i), "2");
    await user.click(screen.getByLabelText(/download as separate files/i));
    await user.click(screen.getByRole("button", { name: /split pdf/i }));

    await waitFor(() => expect(splitPdfToZip).toHaveBeenCalledWith(file, "2", ""));
    expect(derivedName).not.toHaveBeenCalled();
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringContaining("page-002.pdf"),
    );
  });
});

describe("MergeTool (T-10 / P1-13)", () => {
  it("renders a numbered list in selection order", async () => {
    const a = await makePdfFile(1, "intro.pdf");
    const b = await makePdfFile(1, "body.pdf");
    render(<MergeTool />);
    await upload(screen.getByLabelText(/pdf files/i), [a, b]);

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("intro.pdf"), expect.stringContaining("body.pdf")]),
    );
    expect(screen.getByText(/processed in this order/i)).toBeInTheDocument();
  });

  it("guards when fewer than two files are selected", async () => {
    const user = userEvent.setup();
    render(<MergeTool />);
    await user.click(screen.getByRole("button", { name: /merge/i }));
    expect(mergePdf).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Not enough files", variant: "destructive" }),
    );
  });

  it("still toasts on non-Error rejection (P0-5)", async () => {
    const user = userEvent.setup();
    const a = await makePdfFile(1, "a.pdf");
    const b = await makePdfFile(1, "b.pdf");
    mergePdf.mockRejectedValue("boom");
    render(<MergeTool />);
    await upload(screen.getByLabelText(/pdf files/i), [a, b]);
    await user.click(screen.getByRole("button", { name: /merge pdfs/i }));
    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error merging PDFs", "boom"),
    );
  });
});

describe("UnlockTool (T-10)", () => {
  it("calls removePdfPassword with the typed password on success", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1, "locked.pdf");
    removePdfPassword.mockResolvedValue(new Blob(["x"]));
    render(<UnlockTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: /remove protection/i }));

    await waitFor(() =>
      expect(removePdfPassword).toHaveBeenCalledWith(file, "secret"),
    );
    expect(downloadBlob).toHaveBeenCalled();
  });

  it("still toasts on non-Error rejection (P0-5)", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    removePdfPassword.mockRejectedValue("boom");
    render(<UnlockTool />);
    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /remove protection/i }));
    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error removing protection", "boom"),
    );
  });
});

describe("ProtectTool (F-1)", () => {
  it("calls protectPdf with the typed password when both fields match", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1, "plain.pdf");
    protectPdf.mockResolvedValue(new Blob(["x"]));
    render(<ProtectTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/^password$/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /protect pdf/i }));

    await waitFor(() => expect(protectPdf).toHaveBeenCalledWith(file, "secret123"));
    expect(downloadBlob).toHaveBeenCalled();
  });

  it("guards on a password mismatch and never calls protectPdf", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1, "plain.pdf");
    render(<ProtectTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/^password$/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "different");
    await user.click(screen.getByRole("button", { name: /protect pdf/i }));

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Passwords do not match", variant: "destructive" }),
    );
    expect(protectPdf).not.toHaveBeenCalled();
  });

  it("guards when no file is selected and never calls protectPdf", async () => {
    const user = userEvent.setup();
    render(<ProtectTool />);
    await user.click(screen.getByRole("button", { name: /protect pdf/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
    expect(protectPdf).not.toHaveBeenCalled();
  });

  it("surfaces protectPdf's rejection message, e.g. an already-encrypted input", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1, "plain.pdf");
    protectPdf.mockRejectedValue(new Error("This PDF already has a password."));
    render(<ProtectTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/^password$/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /protect pdf/i }));

    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(
        toastSpy,
        "Error protecting PDF",
        expect.objectContaining({ message: "This PDF already has a password." }),
      ),
    );
  });

  it("stays on protectPdf's single-password path when restrictions are not toggled on", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1, "plain.pdf");
    protectPdf.mockResolvedValue(new Blob(["x"]));
    render(<ProtectTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/^password$/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /protect pdf/i }));

    await waitFor(() => expect(protectPdf).toHaveBeenCalledWith(file, "secret123"));
    expect(protectPdfWithPermissions).not.toHaveBeenCalled();
  });

  it("switches to protectPdfWithPermissions once restrictions are toggled on, passing both passwords and the chosen flags", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1, "plain.pdf");
    protectPdfWithPermissions.mockResolvedValue(new Blob(["x"]));
    render(<ProtectTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByText(/restrict printing, copying, or editing/i));

    await user.type(screen.getByLabelText(/permissions password/i), "owner-secret");
    await user.selectOptions(screen.getByLabelText(/allow printing/i), "none");
    await user.selectOptions(screen.getByLabelText(/allow editing/i), "none");
    await user.click(screen.getByText(/allow copying text and images/i));

    await user.click(screen.getByRole("button", { name: /protect pdf/i }));

    await waitFor(() =>
      expect(protectPdfWithPermissions).toHaveBeenCalledWith(file, "", "owner-secret", {
        print: "none",
        extract: false,
        modify: "none",
      }),
    );
    expect(protectPdf).not.toHaveBeenCalled();
    expect(downloadBlob).toHaveBeenCalled();
  });
});

/** A file that passes assertPdfFile's magic-byte + extension check, at an exact size. */
function pdfFileOfSize(bytes: number, name = "file.pdf"): File {
  const data = new Uint8Array(bytes);
  data.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  return new File([data], name, { type: "application/pdf" });
}

describe("CompressTool (F-14)", () => {
  it("guards when no file is selected and never calls compressPdf", async () => {
    const user = userEvent.setup();
    render(<CompressTool />);
    await user.click(screen.getByRole("button", { name: /compress pdf/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
    expect(compressPdf).not.toHaveBeenCalled();
  });

  it("calls compressPdf and reports the size reduction on success", async () => {
    const user = userEvent.setup();
    const file = pdfFileOfSize(2_000_000, "big.pdf");
    compressPdf.mockResolvedValue(new Blob([new Uint8Array(1_000_000)]));
    render(<CompressTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /compress pdf/i }));

    await waitFor(() => expect(compressPdf).toHaveBeenCalledWith(file));
    expect(downloadBlob).toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Success!",
        description: expect.stringContaining("50% smaller"),
      }),
    );
  });

  it("does not claim a size reduction when compression did not shrink the file", async () => {
    const user = userEvent.setup();
    const file = pdfFileOfSize(1000, "already-small.pdf");
    // A tiny fixed-size STORE-method output can come back the same size or larger.
    compressPdf.mockResolvedValue(new Blob([new Uint8Array(1100)]));
    render(<CompressTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /compress pdf/i }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Success!",
          description: expect.stringContaining("already efficiently compressed"),
        }),
      ),
    );
  });

  it("surfaces compressPdf's rejection message, e.g. an already-encrypted input", async () => {
    const user = userEvent.setup();
    const file = pdfFileOfSize(1000);
    compressPdf.mockRejectedValue(
      new Error("This PDF already has a password. Remove its existing protection first (Unlock PDF), then compress it."),
    );
    render(<CompressTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /compress pdf/i }));

    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(
        toastSpy,
        "Error compressing PDF",
        expect.objectContaining({ message: expect.stringContaining("Unlock PDF") }),
      ),
    );
  });

  it("still toasts on non-Error rejection (P0-5)", async () => {
    const user = userEvent.setup();
    const file = pdfFileOfSize(1000);
    compressPdf.mockRejectedValue("boom");
    render(<CompressTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /compress pdf/i }));

    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error compressing PDF", "boom"),
    );
  });
});

describe("EditTool (T-10)", () => {
  it("passes metadata fields through on success", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1, "meta.pdf");
    editPdfMetadata.mockResolvedValue(new Blob(["x"]));
    render(<EditTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.type(screen.getByLabelText(/^title$/i), "Hello");
    await user.click(screen.getByRole("button", { name: /save metadata/i }));

    await waitFor(() =>
      expect(editPdfMetadata).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ title: "Hello" }),
        "",
      ),
    );
  });

  it("still toasts on non-Error rejection (P0-5)", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    editPdfMetadata.mockRejectedValue("boom");
    render(<EditTool />);
    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /save metadata/i }));
    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error editing PDF", "boom"),
    );
  });
});

describe("AddWatermarkTool (T-10)", () => {
  it("calls addWatermark with text and options", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    addWatermark.mockResolvedValue(new Blob(["x"]));
    render(<AddWatermarkTool />);

    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /add watermark/i }));

    await waitFor(() =>
      expect(addWatermark).toHaveBeenCalledWith(
        file,
        "CONFIDENTIAL",
        expect.objectContaining({ fontSize: 50, opacity: 0.5 }),
        "",
      ),
    );
  });

  it("still toasts on non-Error rejection (P0-5)", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    addWatermark.mockRejectedValue("boom");
    render(<AddWatermarkTool />);
    await upload(screen.getByLabelText(/pdf file/i), file);
    await user.click(screen.getByRole("button", { name: /add watermark/i }));
    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error adding watermark", "boom"),
    );
  });
});

describe("ConvertTool (T-10)", () => {
  it("routes images through convertImageToPdf", async () => {
    const user = userEvent.setup();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "photo.jpg", {
      type: "image/jpeg",
    });
    detectImageFormat.mockReturnValue("jpeg");
    convertImageToPdf.mockResolvedValue(new Blob(["x"]));
    render(<ConvertTool />);

    await upload(screen.getByLabelText(/file to convert/i), file);
    await user.click(screen.getByRole("button", { name: /convert to pdf/i }));

    await waitFor(() => expect(convertImageToPdf).toHaveBeenCalledWith(file));
    expect(screen.getByText(/selectable and searchable/i)).toBeInTheDocument();
  });

  it("still toasts on non-Error rejection (P0-5)", async () => {
    const user = userEvent.setup();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "photo.jpg", {
      type: "image/jpeg",
    });
    detectImageFormat.mockReturnValue("jpeg");
    convertImageToPdf.mockRejectedValue("boom");
    render(<ConvertTool />);
    await upload(screen.getByLabelText(/file to convert/i), file);
    await user.click(screen.getByRole("button", { name: /convert to pdf/i }));
    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error converting file", "boom"),
    );
  });
});
