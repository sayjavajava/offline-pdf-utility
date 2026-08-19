/**
 * T-11: GlassDashboard — category tabs (F-23), tool switching, and
 * keyboard accessibility (P2-23).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlassDashboard } from "./GlassDashboard";

const TOOL_CARDS = [
  { card: "Split PDF", heading: /split pdf/i, category: "Organize Pages" },
  { card: "Merge PDF", heading: /merge pdfs/i, category: "Organize Pages" },
  { card: "Rotate Pages", heading: /rotate pages/i, category: "Organize Pages" },
  { card: "Delete / Reorder", heading: /delete \/ reorder pages/i, category: "Organize Pages" },
  { card: "Unlock PDF", heading: /remove pdf protection/i, category: "Security" },
  { card: "Convert to PDF", heading: /^convert to pdf$/i, category: "Convert & Export" },
  { card: "Edit Metadata", heading: /edit pdf metadata/i, category: "Edit & Enhance" },
  { card: "Add Watermark", heading: /add watermark/i, category: "Edit & Enhance" },
] as const;

/** The dashboard only mounts the active category's cards, so tests reaching
 * across categories must select the tab first — the same thing a user does. */
async function openCategory(user: ReturnType<typeof userEvent.setup>, category: string) {
  const back = screen.queryByRole("button", { name: /back to tools/i });
  if (back) await user.click(back);
  await user.click(screen.getByRole("button", { name: new RegExp(`^${category}`) }));
}

describe("GlassDashboard (T-11 / P2-23 / F-23)", () => {
  it("opens each tool from its card, switching category tabs as needed", async () => {
    const user = userEvent.setup();
    render(<GlassDashboard />);

    for (const { card, heading, category } of TOOL_CARDS) {
      await openCategory(user, category);
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

  it("only shows the active category's cards, and switching tabs changes which are shown", async () => {
    const user = userEvent.setup();
    render(<GlassDashboard />);

    // Default category (Organize Pages) is visible up front.
    expect(screen.getByRole("button", { name: "Split PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Protect PDF" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Security/ }));
    expect(screen.getByRole("button", { name: "Protect PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redact PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Split PDF" })).not.toBeInTheDocument();
  });

  it("reaches every card by Tab and activates on Enter and Space", async () => {
    const user = userEvent.setup();
    render(<GlassDashboard />);

    const cardNames = TOOL_CARDS.filter((t) => t.category === "Organize Pages").map((t) => t.card);
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

  it("category tabs are reachable by keyboard and report their pressed state", async () => {
    const user = userEvent.setup();
    render(<GlassDashboard />);

    const organizeTab = screen.getByRole("button", { name: /^Organize Pages/ });
    const securityTab = screen.getByRole("button", { name: /^Security/ });
    expect(organizeTab).toHaveAttribute("aria-pressed", "true");
    expect(securityTab).toHaveAttribute("aria-pressed", "false");

    securityTab.focus();
    expect(securityTab).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(securityTab).toHaveAttribute("aria-pressed", "true");
    expect(organizeTab).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Protect PDF" })).toBeInTheDocument();
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
