/**
 * T-4: acceptance tests for P0-3 (real PDF decryption).
 *
 * These pin the behaviour that was previously impossible: the `password`
 * option upstream pdf-lib does not have was being passed through an `as any`
 * cast and silently discarded, so no encrypted document could ever be opened
 * and every failure was reported as "enter the correct password".
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import {
  editPdfMetadata,
  mergePdf,
  protectPdf,
  removePdfPassword,
  splitPdf,
} from "./pdf-utils";
import {
  FIXTURE_PASSWORD,
  encryptedPdfFile,
  makeCorruptPdfFile,
  makePdfFile,
  pageIndicesOf,
} from "@/test/fixtures";

const ENCRYPTED = [
  "encrypted-rc4-128.pdf",
  "encrypted-aes-256.pdf",
  "encrypted-aes-256-xrefstream.pdf",
] as const;

describe("removePdfPassword", () => {
  it.each(ENCRYPTED)("decrypts %s and re-saves it openable with no password", async (name) => {
    const blob = await removePdfPassword(encryptedPdfFile(name), FIXTURE_PASSWORD);

    const reloaded = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(reloaded.isEncrypted).toBe(false);
    expect(reloaded.getPageCount()).toBe(3);
  });

  it(
    "genuinely strips encryption from a source whose xref is a compressed stream (P1-17)",
    async () => {
      // qpdf's default output shape (also common from other modern PDF
      // writers) — decrypting used to report success while silently handing
      // back a file that was still encrypted, because a leftover copy of the
      // source's xref-stream object (carrying its own /Encrypt reference)
      // survived into the resaved file. `isEncrypted` alone doesn't catch
      // this: it was already false on the in-memory document before save.
      // Only a genuine reload of the *saved bytes*, exactly as done here,
      // would have caught the original bug.
      const blob = await removePdfPassword(
        encryptedPdfFile("encrypted-aes-256-xrefstream.pdf"),
        FIXTURE_PASSWORD,
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());

      const probed = await PDFDocument.load(bytes, { ignoreEncryption: true });
      expect(probed.isEncrypted).toBe(false);

      // Must open with *no* password at all -- ignoreEncryption alone isn't
      // proof; a still-encrypted file loaded that way still has ciphertext
      // where the content should be.
      const reopened = await PDFDocument.load(bytes);
      expect(reopened.getPageCount()).toBe(3);
      expect(await pageIndicesOf(blob)).toEqual([0, 1, 2]);
    },
  );

  it("preserves page identity and order, not just the count", async () => {
    const blob = await removePdfPassword(
      encryptedPdfFile("encrypted-aes-256.pdf"),
      FIXTURE_PASSWORD,
    );
    expect(await pageIndicesOf(blob)).toEqual([0, 1, 2]);
  });

  it("opens a file whose user password is genuinely empty", async () => {
    // The case that breaks under `password || undefined`, which turns a
    // meaningful empty string into "no password supplied".
    const blob = await removePdfPassword(encryptedPdfFile("encrypted-empty-password.pdf"), "");
    expect(await pageIndicesOf(blob)).toEqual([0, 1, 2]);
  });

  it("rejects a wrong password by saying so", async () => {
    await expect(
      removePdfPassword(encryptedPdfFile("encrypted-aes-256.pdf"), "not-the-password"),
    ).rejects.toThrow(/incorrect password/i);
  });

  it("asks for a password when none was supplied, rather than blaming the user's", async () => {
    await expect(
      removePdfPassword(encryptedPdfFile("encrypted-aes-256.pdf")),
    ).rejects.toThrow(/password protected/i);
  });

  it("does not mislabel a corrupt file as a password problem", async () => {
    // The old code matched on the substring "password" anywhere in the message
    // and swallowed genuine parse failures.
    await expect(removePdfPassword(makeCorruptPdfFile(), "anything")).rejects.toThrow(
      /no pdf header|failed to parse/i,
    );
  });

  it("passes an unencrypted file through untouched", async () => {
    const blob = await removePdfPassword(await makePdfFile(2));
    expect(await pageIndicesOf(blob)).toEqual([0, 1]);
  });
});

describe("protectPdf validation (F-1)", () => {
  // The actual encryption goes through qpdf compiled to WASM (qpdf-engine.ts),
  // loaded via a `data:` URI that only a real browser's `fetch` resolves the
  // way this relies on — Node's does not, so that path is excluded from
  // coverage and verified against the real file:// build instead (see
  // vite.config.ts and the F-1 section of docs/CODE_AUDIT.md). What's tested
  // here is validation that runs before any of that: it must reject a bad
  // password without ever reaching the WASM module.
  it("rejects an empty password", async () => {
    await expect(protectPdf(await makePdfFile(2), "")).rejects.toThrow(/enter a password/i);
  });

  it("rejects a password shorter than 4 characters", async () => {
    await expect(protectPdf(await makePdfFile(2), "abc")).rejects.toThrow(/at least 4 characters/i);
  });
});

describe("password threading through the other tools", () => {
  it("splits an encrypted PDF once the password is supplied", async () => {
    const blob = await splitPdf(
      encryptedPdfFile("encrypted-aes-256.pdf"),
      "1,3",
      FIXTURE_PASSWORD,
    );
    expect(await pageIndicesOf(blob)).toEqual([0, 2]);
  });

  it("edits metadata on an encrypted PDF once the password is supplied", async () => {
    const blob = await editPdfMetadata(
      encryptedPdfFile("encrypted-rc4-128.pdf"),
      { title: "Decrypted Title", author: "Tester" },
      FIXTURE_PASSWORD,
    );

    const reloaded = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(reloaded.getTitle()).toBe("Decrypted Title");
    expect(reloaded.getAuthor()).toBe("Tester");
    expect(reloaded.isEncrypted).toBe(false);
  });

  it("reports an encrypted member when merging, instead of throwing raw", async () => {
    await expect(
      mergePdf([await makePdfFile(1), encryptedPdfFile("encrypted-aes-256.pdf")]),
    ).rejects.toThrow(/Could not read "encrypted-aes-256\.pdf".*password protected/i);
  });
});
