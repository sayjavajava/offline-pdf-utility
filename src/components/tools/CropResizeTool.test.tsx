/**
 * T-10: component test for CropResizeTool (F-15).
 *
 * Same contract as the other tool component tests: guard when no file is
 * chosen, call the library with the arguments the form actually describes,
 * surface non-Error rejections (P0-5), and download what came back.
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

const cropPdf = vi.fn();
const resizePdf = vi.fn();

vi.mock("@/lib/pdf-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-utils")>("@/lib/pdf-utils");
  return {
    ...actual,
    cropPdf: (...args: unknown[]) => cropPdf(...args),
    resizePdf: (...args: unknown[]) => resizePdf(...args),
  };
});

import { CropResizeTool } from "./CropResizeTool";

beforeEach(() => {
  toastSpy.mockClear();
  downloadBlob.mockClear();
  reportToolError.mockClear();
  cropPdf.mockReset();
  resizePdf.mockReset();
});

const upload = async (input: HTMLElement, file: File) => {
  await userEvent.setup().upload(input, file);
};

const pdfInput = () => screen.getByLabelText(/pdf file/i);

describe("CropResizeTool (T-10 / F-15)", () => {
  it("guards when no file is selected, in crop mode (the default)", async () => {
    const user = userEvent.setup();
    render(<CropResizeTool />);
    await user.click(screen.getByRole("button", { name: /^crop pages$/i }));
    expect(cropPdf).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
  });

  it("crops with the margins entered, blank pages defaulting to all", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(2);
    cropPdf.mockResolvedValue(new Blob(["x"]));
    render(<CropResizeTool />);
    await upload(pdfInput(), file);

    await user.clear(screen.getByLabelText(/top margin/i));
    await user.type(screen.getByLabelText(/top margin/i), "10");
    await user.clear(screen.getByLabelText(/left margin/i));
    await user.type(screen.getByLabelText(/left margin/i), "5");

    await user.click(screen.getByRole("button", { name: /^crop pages$/i }));
    await waitFor(() =>
      expect(cropPdf).toHaveBeenCalledWith(
        file,
        { top: 10, bottom: 0, left: 5, right: 0 },
        "all",
        "",
      ),
    );
    expect(downloadBlob).toHaveBeenCalled();
  });

  it("switches to resize mode and passes the selected paper size", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    resizePdf.mockResolvedValue(new Blob(["x"]));
    render(<CropResizeTool />);
    await upload(pdfInput(), file);

    await user.click(screen.getByRole("button", { name: /^resize$/i }));
    await user.click(screen.getByRole("button", { name: /^resize pages$/i }));

    await waitFor(() => expect(resizePdf).toHaveBeenCalled());
    const [calledFile, target, pages, password, stretch] = resizePdf.mock.calls[0];
    expect(calledFile).toBe(file);
    expect(target).toEqual({ width: 595.28, height: 841.89 }); // A4 default
    expect(pages).toBe("all");
    expect(password).toBe("");
    expect(stretch).toBe(false);
    expect(downloadBlob).toHaveBeenCalled();
  });

  it("still toasts when the library rejects with a non-Error (P0-5)", async () => {
    const user = userEvent.setup();
    cropPdf.mockRejectedValue("boom");
    render(<CropResizeTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /^crop pages$/i }));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });
});
