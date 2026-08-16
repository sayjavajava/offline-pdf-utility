/**
 * F-8: FilePicker reorder / remove behaviour.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilePicker } from "./FilePicker";

describe("FilePicker (F-8)", () => {
  it("reorders and removes files in a multi list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const a = new File(["a"], "a.pdf", { type: "application/pdf" });
    const b = new File(["b"], "b.pdf", { type: "application/pdf" });
    const c = new File(["c"], "c.pdf", { type: "application/pdf" });

    const { rerender } = render(
      <FilePicker multiple files={[a, b, c]} onChange={onChange} accept=".pdf" label="PDFs" />,
    );

    expect(screen.getByText(/3 files/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /move b.pdf up/i }));
    expect(onChange).toHaveBeenLastCalledWith([b, a, c]);

    rerender(
      <FilePicker multiple files={[b, a, c]} onChange={onChange} accept=".pdf" label="PDFs" />,
    );
    await user.click(screen.getByRole("button", { name: /remove a.pdf/i }));
    expect(onChange).toHaveBeenLastCalledWith([b, c]);
  });

  it("shows the selected name for a single file", () => {
    const file = new File(["x"], "solo.pdf", { type: "application/pdf" });
    render(
      <FilePicker files={[file]} onChange={() => {}} accept=".pdf" label="PDF File" />,
    );
    expect(screen.getByText(/selected file: solo.pdf/i)).toBeInTheDocument();
  });
});
