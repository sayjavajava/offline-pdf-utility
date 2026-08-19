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
  protectPdfWithPermissions,
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
  // vite.config.ts). What's tested here is validation that runs before any
  // of that: it must reject a bad
  // password without ever reaching the WASM module.
  it("rejects an empty password", async () => {
    await expect(protectPdf(await makePdfFile(2), "")).rejects.toThrow(/enter a password/i);
  });

  it("rejects a password shorter than 4 characters", async () => {
    await expect(protectPdf(await makePdfFile(2), "abc")).rejects.toThrow(/at least 4 characters/i);
  });
});

describe("protectPdfWithPermissions (F-17)", () => {
  // Validation that runs before the qpdf WASM call. It matters most here
  // because it is the one guarding against a genuinely silent failure mode —
  // a permissions password equal to the open password would produce a file
  // that *looks* restricted but enforces nothing, since PDF readers grant
  // full access to whoever supplies the owner (permissions) password.
  const permissions = { print: "none", extract: false, modify: "none" } as const;

  it("rejects an empty permissions password", async () => {
    await expect(
      protectPdfWithPermissions(await makePdfFile(1), "", "", permissions),
    ).rejects.toThrow(/enter a permissions password/i);
  });

  it("rejects a permissions password shorter than 4 characters", async () => {
    await expect(
      protectPdfWithPermissions(await makePdfFile(1), "", "abc", permissions),
    ).rejects.toThrow(/at least 4 characters/i);
  });

  it("rejects a permissions password equal to the open password", async () => {
    await expect(
      protectPdfWithPermissions(await makePdfFile(1), "shared-secret", "shared-secret", permissions),
    ).rejects.toThrow(/must differ from the open password/i);
  });

  // The rest of this suite reaches the real qpdf WASM module, not just
  // validation — corrected finding, not present when F-1 was written: the
  // exclusion of qpdf-engine.ts from unit coverage (vite.config.ts) and its
  // own docstring both assumed "Node's fetch does not resolve a data: URI
  // the way a browser does." That was checked against an older Node; on the
  // Node 22.22.2 this repo now requires (bumped for jsdom@30),
  // `fetch("data:...")` resolves correctly
  // and the whole WASM module loads and runs under Vitest — confirmed here,
  // not assumed. The exclusion itself is left in place (it also covers
  // encryptPdfBytes and compressPdf's shared plumbing, and revisiting a
  // repo-wide coverage gate is out of scope for this change), but F-17's own
  // new code no longer needs Playwright alone to prove it actually works.
  it("produces a file that opens with the open password but rejects a wrong one", async () => {
    const blob = await protectPdfWithPermissions(await makePdfFile(1), "", "owner-secret", permissions);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // If this were not genuinely encrypted, any password (or none) would open
    // it — a wrong password succeeding would mean protectPdfWithPermissions
    // silently produced an unprotected file while claiming success.
    await expect(PDFDocument.load(bytes, { password: "wrong-password" })).rejects.toThrow(
      /password incorrect/i,
    );

    const openedWithUserPassword = await PDFDocument.load(bytes, { password: "" });
    expect(openedWithUserPassword.getPageCount()).toBe(1);

    // The permissions (owner) password must also open it — it is a valid
    // decryption credential, just one that additionally bypasses restrictions.
    const openedWithOwnerPassword = await PDFDocument.load(bytes, { password: "owner-secret" });
    expect(openedWithOwnerPassword.getPageCount()).toBe(1);
  }, 20000); // First real WASM compile in the run is slow, more so under coverage instrumentation.

  it("allows a non-empty open password distinct from the permissions password", async () => {
    const blob = await protectPdfWithPermissions(
      await makePdfFile(1),
      "open-secret",
      "owner-secret",
      permissions,
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const opened = await PDFDocument.load(bytes, { password: "open-secret" });
    expect(opened.getPageCount()).toBe(1);
  }, 20000);
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
