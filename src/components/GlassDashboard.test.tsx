/**
 * T-11: GlassDashboard — tool switching and keyboard accessibility (P2-23).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlassDashboard } from "./GlassDashboard";

const TOOL_CARDS = [
  { card: "Split PDF", heading: /split pdf/i },
  { card: "Merge PDF", heading: /merge pdfs/i },
  { card: "Edit Metadata", heading: /edit pdf metadata/i },
  { card: "Convert to PDF", heading: /^convert to pdf$/i },
  { card: "Unlock PDF", heading: /remove pdf protection/i },
  { card: "Add Watermark", heading: /add watermark/i },
] as const;

describe("GlassDashboard (T-11 / P2-23)", () => {
  it("opens each of the six tools from its card", async () => {
    const user = userEvent.setup();
    render(<GlassDashboard />);

    for (const { card, heading } of TOOL_CARDS) {
      const back = screen.queryByRole("button", { name: /back to tools/i });
      if (back) await user.click(back);

      await user.click(screen.getByRole("button", { name: card }));
      expect(screen.getByRole("button", { name: /back to tools/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("returns to the grid via Back to Tools", async () => {
    const user = userEvent.setup();
    render(<GlassDashboard />);

    await user.click(screen.getByRole("button", { name: "Split PDF" }));
    expect(screen.getByRole("button", { name: /back to tools/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to tools/i }));
    expect(screen.getByRole("button", { name: "Split PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to tools/i })).not.toBeInTheDocument();
  });

  it("reaches every card by Tab and activates on Enter and Space", async () => {
    const user = userEvent.setup();
    render(<GlassDashboard />);

    const cardNames = TOOL_CARDS.map((t) => t.card);
    for (const name of cardNames) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("tabindex", "0");
    }

    const first = screen.getByRole("button", { name: "Split PDF" });
    first.focus();
    expect(first).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /back to tools/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /split pdf/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to tools/i }));

    const second = screen.getByRole("button", { name: "Merge PDF" });
    second.focus();
    expect(second).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: /back to tools/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /merge pdfs/i })).toBeInTheDocument();
  });

  it("resets previous tool state when switching tools", async () => {
    const user = userEvent.setup();
    render(<GlassDashboard />);

    await user.click(screen.getByRole("button", { name: "Split PDF" }));
    const pages = screen.getByLabelText(/pages to extract/i);
    await user.type(pages, "1-2");
    expect(pages).toHaveValue("1-2");

    await user.click(screen.getByRole("button", { name: /back to tools/i }));
    await user.click(screen.getByRole("button", { name: "Merge PDF" }));
    expect(screen.getByRole("heading", { name: /merge pdfs/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to tools/i }));
    await user.click(screen.getByRole("button", { name: "Split PDF" }));
    expect(screen.getByLabelText(/pages to extract/i)).toHaveValue("");
  });
});
