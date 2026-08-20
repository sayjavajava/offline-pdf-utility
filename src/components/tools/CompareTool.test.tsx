/**
 * T-10, Compare PDFs (F-19): guard when either file is missing, call
 * comparePdfs with both files/passwords, render the per-page results, and
 * surface both Error and non-Error rejections (P0-5). comparePdfs itself
 * (page alignment, text/visual thresholds) is covered by pdf-compare.test.ts
 * against a mocked pdf-render.ts — this file only tests the component
 * contract on top of it.
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

const comparePdfs = vi.fn();
vi.mock("@/lib/pdf-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-utils")>("@/lib/pdf-utils");
  return {
    ...actual,
    comparePdfs: (...args: unknown[]) => comparePdfs(...args),
  };
});

import { CompareTool } from "./CompareTool";

beforeEach(() => {
  toastSpy.mockClear();
  downloadBlob.mockClear();
  reportToolError.mockClear();
  comparePdfs.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const upload = async (input: HTMLElement, file: File) => {
  await userEvent.setup().upload(input, file);
};

describe("CompareTool (T-10 / F-19)", () => {
  it("guards when either file is missing", async () => {
    const user = userEvent.setup();
    render(<CompareTool />);
    await upload(screen.getByLabelText(/pdf a/i), await makePdfFile(1, "a.pdf"));
    await user.click(screen.getByRole("button", { name: /^compare$/i }));
    expect(comparePdfs).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Two files needed", variant: "destructive" }),
    );
  });

  it("selects file A and file B independently (pins the FilePicker duplicate-id bug)", async () => {
    render(<CompareTool />);
    const fileA = await makePdfFile(1, "a.pdf");
    const fileB = await makePdfFile(1, "b.pdf");
    await upload(screen.getByLabelText(/pdf a/i), fileA);
    await upload(screen.getByLabelText(/pdf b/i), fileB);
    expect(await screen.findByText(/selected file: a\.pdf/i)).toBeInTheDocument();
    expect(await screen.findByText(/selected file: b\.pdf/i)).toBeInTheDocument();
  });

  it("compares both files, passing each one's own password", async () => {
    const user = userEvent.setup();
    comparePdfs.mockResolvedValue({
      pageCountA: 2,
      pageCountB: 2,
      pages: [
        { page: 1, presence: "both", textDiffers: false, visuallyDiffers: false, pixelDiffRatio: 0 },
        { page: 2, presence: "both", textDiffers: true, visuallyDiffers: false, pixelDiffRatio: 0.02 },
      ],
    });
    render(<CompareTool />);
    await upload(screen.getByLabelText(/pdf a/i), await makePdfFile(2, "a.pdf"));
    await upload(screen.getByLabelText(/pdf b/i), await makePdfFile(2, "b.pdf"));
    await user.type(screen.getByLabelText(/password \(if encrypted\)/i, { selector: "#password-a" }), "pa");
    await user.type(screen.getByLabelText(/password \(if encrypted\)/i, { selector: "#password-b" }), "pb");
    await user.click(screen.getByRole("button", { name: /^compare$/i }));

    await waitFor(() => expect(comparePdfs).toHaveBeenCalled());
    const [fileArgA, fileArgB, opts] = comparePdfs.mock.calls[0];
    expect(fileArgA.name).toBe("a.pdf");
    expect(fileArgB.name).toBe("b.pdf");
    expect(opts).toMatchObject({ passwordA: "pa", passwordB: "pb" });

    expect(await screen.findByText(/page 1: identical/i)).toBeInTheDocument();
    expect(await screen.findByText(/page 2: text differs/i)).toBeInTheDocument();
  });

  it("labels a differently-sized page as a size difference, not a text difference (P0)", async () => {
    // pdf-compare.ts leaves textDiffers undefined for differently-sized pages,
    // since pdf.js's text extraction is clipped to each page's MediaBox and
    // can't be trusted there — reporting "text differs" would be a false
    // positive. The component must not treat undefined as "no difference"
    // (falling into "Identical") or fabricate a text-differs label either.
    const user = userEvent.setup();
    comparePdfs.mockResolvedValue({
      pageCountA: 1,
      pageCountB: 1,
      pages: [{ page: 1, presence: "both", textDiffers: undefined, visuallyDiffers: true, pixelDiffRatio: undefined }],
    });
    render(<CompareTool />);
    await upload(screen.getByLabelText(/pdf a/i), await makePdfFile(1, "a.pdf"));
    await upload(screen.getByLabelText(/pdf b/i), await makePdfFile(1, "b.pdf"));
    await user.click(screen.getByRole("button", { name: /^compare$/i }));
    expect(await screen.findByText(/page 1: different page size/i)).toBeInTheDocument();
    expect(screen.queryByText(/text differs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/identical/i)).not.toBeInTheDocument();
  });

  it("filters to differences only when the checkbox is checked", async () => {
    const user = userEvent.setup();
    comparePdfs.mockResolvedValue({
      pageCountA: 2,
      pageCountB: 2,
      pages: [
        { page: 1, presence: "both", textDiffers: false, visuallyDiffers: false, pixelDiffRatio: 0 },
        { page: 2, presence: "both", textDiffers: true, visuallyDiffers: false, pixelDiffRatio: 0.02 },
      ],
    });
    render(<CompareTool />);
    await upload(screen.getByLabelText(/pdf a/i), await makePdfFile(2, "a.pdf"));
    await upload(screen.getByLabelText(/pdf b/i), await makePdfFile(2, "b.pdf"));
    await user.click(screen.getByRole("button", { name: /^compare$/i }));
    await screen.findByText(/page 1: identical/i);

    await user.click(screen.getByLabelText(/show only differences/i));
    expect(screen.queryByText(/page 1: identical/i)).not.toBeInTheDocument();
    expect(screen.getByText(/page 2: text differs/i)).toBeInTheDocument();
  });

  it("still toasts when the library rejects with a non-Error (P0-5)", async () => {
    const user = userEvent.setup();
    comparePdfs.mockRejectedValue("boom");
    render(<CompareTool />);
    await upload(screen.getByLabelText(/pdf a/i), await makePdfFile(1, "a.pdf"));
    await upload(screen.getByLabelText(/pdf b/i), await makePdfFile(1, "b.pdf"));
    await user.click(screen.getByRole("button", { name: /^compare$/i }));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });

  it("downloads a text report describing every page", async () => {
    const user = userEvent.setup();
    comparePdfs.mockResolvedValue({
      pageCountA: 1,
      pageCountB: 1,
      pages: [{ page: 1, presence: "both", textDiffers: false, visuallyDiffers: false, pixelDiffRatio: 0 }],
    });
    render(<CompareTool />);
    await upload(screen.getByLabelText(/pdf a/i), await makePdfFile(1, "a.pdf"));
    await upload(screen.getByLabelText(/pdf b/i), await makePdfFile(1, "b.pdf"));
    await user.click(screen.getByRole("button", { name: /^compare$/i }));
    await screen.findByText(/page 1: identical/i);

    await user.click(screen.getByRole("button", { name: /download report/i }));
    expect(downloadBlob).toHaveBeenCalled();
    const [blob, filename] = downloadBlob.mock.calls[0];
    expect(filename).toMatch(/a_vs_b/i);
    const text = await blob.text();
    expect(text).toContain("Page 1: Identical");
  });
});
