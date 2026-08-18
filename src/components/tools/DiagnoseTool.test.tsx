/**
 * T-10: component test for DiagnoseTool (F-16).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makePdfFile } from "@/test/fixtures";

const toastSpy = vi.fn();
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
  reportToolError: (...args: unknown[]) =>
    reportToolError(...(args as [typeof toastSpy, string, unknown])),
}));

const diagnosePdf = vi.fn();

vi.mock("@/lib/pdf-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-utils")>("@/lib/pdf-utils");
  return {
    ...actual,
    diagnosePdf: (...args: unknown[]) => diagnosePdf(...args),
  };
});

import { DiagnoseTool } from "./DiagnoseTool";

beforeEach(() => {
  toastSpy.mockClear();
  reportToolError.mockClear();
  diagnosePdf.mockReset();
});

const upload = async (input: HTMLElement, file: File) => {
  await userEvent.setup().upload(input, file);
};

const pdfInput = () => screen.getByLabelText(/pdf file/i);

describe("DiagnoseTool (T-10 / F-16)", () => {
  it("guards when no file is selected", async () => {
    const user = userEvent.setup();
    render(<DiagnoseTool />);
    await user.click(screen.getByRole("button", { name: /diagnose pdf/i }));
    expect(diagnosePdf).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
  });

  it("shows a clean result and its report text", async () => {
    const user = userEvent.setup();
    const file = await makePdfFile(1);
    diagnosePdf.mockResolvedValue({ status: "clean", report: "No syntax or stream encoding errors found" });
    render(<DiagnoseTool />);
    await upload(pdfInput(), file);
    await user.click(screen.getByRole("button", { name: /diagnose pdf/i }));

    await waitFor(() => expect(diagnosePdf).toHaveBeenCalledWith(file, ""));
    expect(await screen.findByText(/no structural problems found/i)).toBeInTheDocument();
    expect(screen.getByText(/no syntax or stream encoding errors found/i)).toBeInTheDocument();
  });

  it("shows an errors result distinctly from clean", async () => {
    const user = userEvent.setup();
    diagnosePdf.mockResolvedValue({ status: "errors", report: "can't find startxref" });
    render(<DiagnoseTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /diagnose pdf/i }));

    expect(await screen.findByText(/structural problems found/i)).toBeInTheDocument();
  });

  it("passes the entered password through", async () => {
    const user = userEvent.setup();
    diagnosePdf.mockResolvedValue({ status: "clean", report: "ok" });
    render(<DiagnoseTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /diagnose pdf/i }));

    await waitFor(() => expect(diagnosePdf).toHaveBeenCalledWith(expect.any(File), "secret123"));
  });

  it("still toasts when the library rejects with a non-Error (P0-5)", async () => {
    const user = userEvent.setup();
    diagnosePdf.mockRejectedValue("boom");
    render(<DiagnoseTool />);
    await upload(pdfInput(), await makePdfFile(1));
    await user.click(screen.getByRole("button", { name: /diagnose pdf/i }));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });
});
