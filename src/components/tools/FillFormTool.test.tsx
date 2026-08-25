/**
 * Fill PDF Forms (F-25): component-contract tests. `getFormFields` and
 * `fillFormFields` themselves (every field type, read-only handling,
 * unsupported-field reporting) are covered against real pdf-lib fixtures in
 * pdf-forms.test.ts — this file only tests what the component does with
 * their results: rendering the right control per field type, collecting
 * edits into the values passed to `fillFormFields`, and surfacing errors.
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

const getFormFields = vi.fn();
const fillFormFields = vi.fn();
vi.mock("@/lib/pdf-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-utils")>("@/lib/pdf-utils");
  return {
    ...actual,
    getFormFields: (...args: unknown[]) => getFormFields(...args),
    fillFormFields: (...args: unknown[]) => fillFormFields(...args),
  };
});

import { FillFormTool } from "./FillFormTool";

beforeEach(() => {
  toastSpy.mockClear();
  downloadBlob.mockClear();
  reportToolError.mockClear();
  getFormFields.mockReset();
  fillFormFields.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const upload = async (input: HTMLElement, file: File) => {
  await userEvent.setup().upload(input, file);
};

describe("FillFormTool (F-25)", () => {
  it("guards when no file is selected", async () => {
    const user = userEvent.setup();
    render(<FillFormTool />);
    await user.click(screen.getByRole("button", { name: /load form fields/i }));
    expect(getFormFields).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No file selected", variant: "destructive" }),
    );
  });

  it("loads fields, passing the file and password", async () => {
    const user = userEvent.setup();
    getFormFields.mockResolvedValue({ fields: [], unsupportedFields: [] });
    render(<FillFormTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "form.pdf"));
    await user.type(screen.getByLabelText(/password/i), "secret");
    await user.click(screen.getByRole("button", { name: /load form fields/i }));

    await waitFor(() => expect(getFormFields).toHaveBeenCalled());
    const [fileArg, passwordArg] = getFormFields.mock.calls[0];
    expect(fileArg.name).toBe("form.pdf");
    expect(passwordArg).toBe("secret");
  });

  it("reports a PDF with no fillable fields", async () => {
    const user = userEvent.setup();
    getFormFields.mockResolvedValue({ fields: [], unsupportedFields: [] });
    render(<FillFormTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "form.pdf"));
    await user.click(screen.getByRole("button", { name: /load form fields/i }));
    expect(await screen.findByText(/no fillable form fields/i)).toBeInTheDocument();
  });

  it("renders every supported field type and collects edits into the fill call", async () => {
    const user = userEvent.setup();
    getFormFields.mockResolvedValue({
      fields: [
        { name: "applicant.name", type: "text", value: "", readOnly: false },
        { name: "subscribe", type: "checkbox", value: false, readOnly: false },
        { name: "country", type: "dropdown", value: "", options: ["USA", "Canada"], readOnly: false },
        { name: "plan", type: "radio", value: "", options: ["basic", "pro"], readOnly: false },
      ],
      unsupportedFields: ["signature1"],
    });
    fillFormFields.mockResolvedValue(new Blob(["x"]));

    render(<FillFormTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "form.pdf"));
    await user.click(screen.getByRole("button", { name: /load form fields/i }));

    expect(await screen.findByText(/signature1/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("applicant.name"), "Jane Doe");
    await user.click(screen.getByLabelText("subscribe"));
    await user.selectOptions(screen.getByLabelText("country"), "Canada");
    await user.click(screen.getByLabelText("pro"));

    await user.click(screen.getByRole("button", { name: /fill & download/i }));

    await waitFor(() => expect(fillFormFields).toHaveBeenCalled());
    const [fileArg, valuesArg, optionsArg] = fillFormFields.mock.calls[0];
    expect(fileArg.name).toBe("form.pdf");
    expect(valuesArg).toEqual({
      "applicant.name": "Jane Doe",
      subscribe: true,
      country: "Canada",
      plan: "pro",
    });
    expect(optionsArg).toMatchObject({ flatten: true });
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "form_filled.pdf");
  });

  it("defaults dropdown/checkbox/text values from what the PDF already had", async () => {
    getFormFields.mockResolvedValue({
      fields: [
        { name: "applicant.name", type: "text", value: "Prefilled", readOnly: false },
        { name: "subscribe", type: "checkbox", value: true, readOnly: false },
      ],
      unsupportedFields: [],
    });
    const user = userEvent.setup();
    render(<FillFormTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "form.pdf"));
    await user.click(screen.getByRole("button", { name: /load form fields/i }));

    expect(await screen.findByLabelText("applicant.name")).toHaveValue("Prefilled");
    expect(screen.getByLabelText("subscribe")).toBeChecked();
  });

  it("disables a read-only field's input", async () => {
    getFormFields.mockResolvedValue({
      fields: [{ name: "locked", type: "text", value: "cannot edit", readOnly: true }],
      unsupportedFields: [],
    });
    const user = userEvent.setup();
    render(<FillFormTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "form.pdf"));
    await user.click(screen.getByRole("button", { name: /load form fields/i }));

    expect(await screen.findByLabelText("locked")).toBeDisabled();
  });

  it("surfaces an error from getFormFields", async () => {
    const user = userEvent.setup();
    getFormFields.mockRejectedValue(new Error("Incorrect password for this PDF."));
    render(<FillFormTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "form.pdf"));
    await user.click(screen.getByRole("button", { name: /load form fields/i }));

    expect(reportToolError).toHaveBeenCalledWith(
      toastSpy,
      "Error reading form fields",
      expect.objectContaining({ message: "Incorrect password for this PDF." }),
    );
  });

  it("surfaces a non-Error rejection from fillFormFields (P0-5)", async () => {
    const user = userEvent.setup();
    getFormFields.mockResolvedValue({
      fields: [{ name: "applicant.name", type: "text", value: "", readOnly: false }],
      unsupportedFields: [],
    });
    fillFormFields.mockRejectedValue("boom");
    render(<FillFormTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "form.pdf"));
    await user.click(screen.getByRole("button", { name: /load form fields/i }));
    await screen.findByLabelText("applicant.name");
    await user.click(screen.getByRole("button", { name: /fill & download/i }));

    await waitFor(() =>
      expect(reportToolError).toHaveBeenCalledWith(toastSpy, "Error filling form", "boom"),
    );
  });

  it("returns to the file picker via 'Choose a different file'", async () => {
    const user = userEvent.setup();
    getFormFields.mockResolvedValue({
      fields: [{ name: "applicant.name", type: "text", value: "", readOnly: false }],
      unsupportedFields: [],
    });
    render(<FillFormTool />);
    await upload(screen.getByLabelText(/pdf file/i), await makePdfFile(1, "form.pdf"));
    await user.click(screen.getByRole("button", { name: /load form fields/i }));
    await screen.findByLabelText("applicant.name");

    await user.click(screen.getByRole("button", { name: /choose a different file/i }));
    expect(screen.getByRole("button", { name: /load form fields/i })).toBeInTheDocument();
  });
});
