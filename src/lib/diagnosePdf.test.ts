/**
 * F-16: diagnosePdf, the read-only `--check` diagnostic shipped in place of
 * "Repair a damaged PDF" — see docs/CODE_AUDIT.md for the spike that found
 * qpdf's recovery never outperforms this app's own loadPdf tolerance.
 *
 * This reaches the real qpdf WASM module, not just pre-WASM validation —
 * confirmed testable under Vitest during F-17 (Node 22.22.2's fetch resolves
 * data: URIs; see the correction in docs/CODE_AUDIT.md's F-1 section).
 */
import { describe, expect, it } from "vitest";
import { diagnosePdf } from "./pdf-utils";
import { encryptedPdfFile, FIXTURE_PASSWORD, makeCorruptPdfFile, makePdfFile } from "@/test/fixtures";

describe("diagnosePdf (F-16)", () => {
  it("reports a clean file as clean", async () => {
    const result = await diagnosePdf(await makePdfFile(2));
    expect(result.status).toBe("clean");
    expect(result.report).toMatch(/no syntax or stream encoding errors/i);
  }, 20000);

  it("reports a genuinely malformed file as having errors, with qpdf's own explanation", async () => {
    const result = await diagnosePdf(makeCorruptPdfFile());
    expect(result.status).toBe("errors");
    expect(result.report.length).toBeGreaterThan(0);
  }, 20000);

  it("checks an encrypted file once given its password", async () => {
    const result = await diagnosePdf(encryptedPdfFile("encrypted-aes-256.pdf"), FIXTURE_PASSWORD);
    expect(result.status).toBe("clean");
    expect(result.report).toMatch(/supplied password is (user|owner) password/i);
  }, 20000);

  it("asks for a password rather than reporting a false structural error", async () => {
    await expect(diagnosePdf(encryptedPdfFile("encrypted-aes-256.pdf"))).rejects.toThrow(
      /password protected/i,
    );
  }, 20000);

  it("reports a wrong password distinctly from a genuinely damaged file", async () => {
    await expect(
      diagnosePdf(encryptedPdfFile("encrypted-aes-256.pdf"), "not-the-password"),
    ).rejects.toThrow(/incorrect password/i);
  }, 20000);
});
