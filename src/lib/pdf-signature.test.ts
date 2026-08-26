/**
 * F-26: pdf-signature.ts. `@cantoo/pdf-lib`'s `embedPng`/`embedJpg` +
 * `drawImage` work fine under Node/jsdom (no canvas/DOM needed to embed an
 * already-encoded image), so this is tested against a real PDF and this
 * project's own 1x1 PNG/JPEG test fixtures, not mocked.
 */
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { pngFile, jpegFile } from '@/test/fixtures';
import { placeSignatureImage } from './pdf-signature';

async function bytesOf(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

describe('placeSignatureImage (F-26)', () => {
  it('embeds a PNG signature onto the given page, leaving page count intact', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    doc.addPage([300, 400]);

    await placeSignatureImage(doc, await bytesOf(pngFile()), 'png', {
      page: 2,
      x: 50,
      y: 50,
      width: 100,
      height: 40,
    });

    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('embeds a JPEG signature', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    await expect(
      placeSignatureImage(doc, await bytesOf(jpegFile()), 'jpeg', { page: 1, x: 0, y: 0, width: 50, height: 50 }),
    ).resolves.not.toThrow();
  });

  it('throws a clear error for a page number that does not exist', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    await expect(
      placeSignatureImage(doc, await bytesOf(pngFile()), 'png', { page: 5, x: 0, y: 0, width: 50, height: 50 }),
    ).rejects.toThrow(/page 5 does not exist/i);
  });

  it('throws a clear, wrapped error for unreadable image bytes', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const garbage = new Uint8Array([1, 2, 3, 4]);
    await expect(
      placeSignatureImage(doc, garbage, 'png', { page: 1, x: 0, y: 0, width: 50, height: 50 }),
    ).rejects.toThrow(/could not read the signature image/i);
  });

  it('round-trips through a real save/load with the image visibly present', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    await placeSignatureImage(doc, await bytesOf(pngFile()), 'png', {
      page: 1,
      x: 20,
      y: 20,
      width: 80,
      height: 30,
    });
    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    const xObjects = reloaded.getPage(0).node.Resources()?.lookup(reloaded.context.obj('XObject'));
    expect(xObjects).toBeDefined();
  });
});
