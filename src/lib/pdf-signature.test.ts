/**
 * F-26: pdf-signature.ts. `@cantoo/pdf-lib`'s `embedPng`/`embedJpg` +
 * `drawImage` work fine under Node/jsdom (no canvas/DOM needed to embed an
 * already-encoded image), so this is tested against a real PDF and this
 * project's own 1x1 PNG/JPEG test fixtures, not mocked.
 */
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { pngFile, jpegFile } from '@/test/fixtures';
import { placeSignatureImage, displayedToUserSpace, visibleBox } from './pdf-signature';

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

type Box = { x: number; y: number; width: number; height: number };

/**
 * Independent oracle for the page's display transform, built the general
 * way (rotate clockwise about the box origin by a real rotation matrix, then
 * shift back into the positive quadrant) rather than from the per-angle
 * cases `displayedToUserSpace` uses. That is what /Rotate means: the page is
 * shown turned clockwise.
 */
function userToDisplayed(u: number, v: number, box: Box, rotation: number): [number, number] {
  const rad = (rotation * Math.PI) / 180;
  const turn = (x: number, y: number): [number, number] => [
    x * Math.cos(rad) + y * Math.sin(rad),
    -x * Math.sin(rad) + y * Math.cos(rad),
  ];
  const corners = [turn(0, 0), turn(box.width, 0), turn(0, box.height), turn(box.width, box.height)];
  const minX = Math.min(...corners.map((c) => c[0]));
  const minY = Math.min(...corners.map((c) => c[1]));
  const [x, y] = turn(u - box.x, v - box.y);
  return [x - minX, y - minY];
}

/** Where a point of the drawn image (in its own unrotated units) ends up in
 *  user space — how pdf-lib applies drawImage's anchor and `rotate`. */
function drawnPoint(t: ReturnType<typeof displayedToUserSpace>, lx: number, ly: number): [number, number] {
  const rad = (t.rotate * Math.PI) / 180;
  return [t.x + lx * Math.cos(rad) - ly * Math.sin(rad), t.y + lx * Math.sin(rad) + ly * Math.cos(rad)];
}

describe('displayedToUserSpace (F-26 placement on rotated and offset pages)', () => {
  const rect = { x: 40, y: 500, width: 120, height: 45 };
  const boxes: Record<string, Box> = {
    'origin at (0,0)': { x: 0, y: 0, width: 612, height: 792 },
    'origin at (100,50)': { x: 100, y: 50, width: 612, height: 792 },
  };

  for (const [boxLabel, box] of Object.entries(boxes)) {
    for (const rotation of [0, 90, 180, 270, -90, 450]) {
      it(`lands upright on the displayed rect — /Rotate ${rotation}, box ${boxLabel}`, () => {
        const t = displayedToUserSpace(rect, box, rotation);
        const close = ([ax, ay]: [number, number], [bx, by]: [number, number]) => {
          expect(ax).toBeCloseTo(bx, 6);
          expect(ay).toBeCloseTo(by, 6);
        };
        const shown = (lx: number, ly: number) => userToDisplayed(...drawnPoint(t, lx, ly), box, rotation);
        // The image's own bottom-left, right edge and top edge must land on the
        // rect's — which pins both its position and that it reads upright.
        close(shown(0, 0), [rect.x, rect.y]);
        close(shown(rect.width, 0), [rect.x + rect.width, rect.y]);
        close(shown(0, rect.height), [rect.x, rect.y + rect.height]);
      });
    }
  }

  it('treats a /Rotate that is not a multiple of 90 as no rotation, as pdf.js does', () => {
    const box = boxes['origin at (0,0)'];
    expect(displayedToUserSpace(rect, box, 45)).toEqual(displayedToUserSpace(rect, box, 0));
  });
});

describe('visibleBox', () => {
  it('is the CropBox clipped to the MediaBox, the region pdf.js renders', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.setMediaBox(0, 0, 612, 792);
    page.setCropBox(-20, 100, 400, 1000); // overhangs the MediaBox on the left and top
    expect(visibleBox(page)).toEqual({ x: 0, y: 100, width: 380, height: 692 });
  });

  it('is the MediaBox when there is no CropBox', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 400]);
    page.setMediaBox(10, 20, 300, 400);
    expect(visibleBox(page)).toEqual({ x: 10, y: 20, width: 300, height: 400 });
  });
});
