import { useEffect, useRef, useState } from 'react';
import { redactPdf, parsePageRange, type RedactionRect } from '@/lib/pdf-utils';
import { renderPdfPages, getPageSizes, type PageSize } from '@/lib/pdf-render';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

/** Pixels per PDF point for the on-screen preview render. Independent of the
 * export scale in pdf-redact.ts — boxes are converted to point-space
 * immediately on drawing, so this only affects preview legibility. */
const PREVIEW_SCALE = 1.5;

type PixelPoint = { x: number; y: number };

export const RedactTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [pageSizes, setPageSizes] = useState<PageSize[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0); // 0-based
  const [preview, setPreview] = useState<{ url: string; heightPts: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [redactions, setRedactions] = useState<Record<number, RedactionRect[]>>({});
  const [drag, setDrag] = useState<{ start: PixelPoint; current: PixelPoint } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [applyRange, setApplyRange] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();
  const file = files[0] ?? null;
  const pageNumber = pageIndex + 1;
  const pageCount = pageSizes?.length ?? null;

  // Render the current page whenever the file, page, or password changes.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      setPageSizes(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;

    (async () => {
      setPreviewing(true);
      try {
        const [rendered] = await renderPdfPages(file, {
          scale: PREVIEW_SCALE,
          pageNumbers: [pageIndex + 1],
          password,
        });
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([rendered.bytes], { type: 'image/png' }));
        setPreview({ url, heightPts: rendered.height / PREVIEW_SCALE });
      } catch (error) {
        console.error('Page preview failed:', error);
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, pageIndex, password]);

  // Page sizes, once we can actually open the file (needs the right
  // password). Doubles as the page count (F-21) — `getPageSizes` already
  // opens the document and visits every page's `/MediaBox` without
  // rendering anything, so deriving the count from it avoids a second,
  // redundant document open just to ask `numPages`.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const sizes = await getPageSizes(file, password);
        if (!cancelled) setPageSizes(sizes);
      } catch {
        // Handled by the preview effect's own error path (wrong/missing
        // password); sizes just stay unknown until that resolves.
        if (!cancelled) setPageSizes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, password]);

  const pixelToPdfRect = (a: PixelPoint, b: PixelPoint, heightPts: number): RedactionRect => {
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    return {
      x: x1 / PREVIEW_SCALE,
      y: heightPts - y2 / PREVIEW_SCALE,
      width: (x2 - x1) / PREVIEW_SCALE,
      height: (y2 - y1) / PREVIEW_SCALE,
    };
  };

  /** Mouse coordinates relative to the image's own natural pixel grid, correcting for any CSS scaling (e.g. a large page shrunk to fit). */
  const naturalPoint = (e: React.MouseEvent<HTMLImageElement>): PixelPoint => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const ratioX = img.naturalWidth / rect.width;
    const ratioY = img.naturalHeight / rect.height;
    return { x: (e.clientX - rect.left) * ratioX, y: (e.clientY - rect.top) * ratioY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    const point = naturalPoint(e);
    setDrag({ start: point, current: point });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!drag) return;
    setDrag({ ...drag, current: naturalPoint(e) });
  };

  const finishDrag = () => {
    if (!drag || !preview) {
      setDrag(null);
      return;
    }
    const rect = pixelToPdfRect(drag.start, drag.current, preview.heightPts);
    setDrag(null);
    if (rect.width < 4 / PREVIEW_SCALE || rect.height < 4 / PREVIEW_SCALE) return; // ignore accidental clicks
    setRedactions((prev) => ({
      ...prev,
      [pageNumber]: [...(prev[pageNumber] ?? []), rect],
    }));
  };

  const removeBox = (index: number) => {
    setRedactions((prev) => ({
      ...prev,
      [pageNumber]: (prev[pageNumber] ?? []).filter((_, i) => i !== index),
    }));
  };

  const totalBoxes = Object.values(redactions).reduce((sum, rects) => sum + rects.length, 0);
  const pagesWithBoxes = Object.values(redactions).filter((rects) => rects.length > 0).length;
  const currentPageBoxes = redactions[pageNumber] ?? [];

  /**
   * Copies the current page's boxes onto other pages (F-21) — the actual gap
   * a company rollout hits: redacting something that recurs on every page
   * (a footer, a case number) otherwise means manually repeating the same
   * drag hundreds of times. A box is defined in PDF-point space relative to
   * its own page, so blindly copying it onto a differently-sized page would
   * silently land it somewhere wrong — the same "looks like it worked, does
   * nothing right" shape this app avoids elsewhere (P0-5, P1-17). Pages
   * whose size doesn't match the source page are skipped and named, not
   * silently mismatched.
   */
  const handleApplyToRange = () => {
    if (currentPageBoxes.length === 0 || !pageCount || !pageSizes) return;

    const trimmed = applyRange.trim();
    const targets: number[] = [];
    if (trimmed === '' || trimmed.toLowerCase() === 'all') {
      for (let p = 1; p <= pageCount; p++) if (p !== pageNumber) targets.push(p);
    } else {
      const parsed = parsePageRange(trimmed, pageCount);
      if (parsed.errors.length > 0) {
        toast({ title: 'Invalid page range', description: parsed.errors.join(' '), variant: 'destructive' });
        return;
      }
      for (const index of new Set(parsed.indices)) {
        const p = index + 1;
        if (p !== pageNumber) targets.push(p);
      }
    }

    if (targets.length === 0) {
      toast({
        title: 'No other pages to apply to',
        description: 'That range only covers the page you already drew on.',
        variant: 'destructive',
      });
      return;
    }

    const sourceSize = pageSizes[pageIndex];
    const SIZE_TOLERANCE_PT = 1; // absorbs float noise, not a real size difference
    const applied: number[] = [];
    const skipped: number[] = [];
    for (const p of targets) {
      const targetSize = pageSizes[p - 1];
      const sameSize =
        Math.abs(targetSize.width - sourceSize.width) <= SIZE_TOLERANCE_PT &&
        Math.abs(targetSize.height - sourceSize.height) <= SIZE_TOLERANCE_PT;
      if (sameSize) applied.push(p);
      else skipped.push(p);
    }

    if (applied.length > 0) {
      setRedactions((prev) => {
        const next = { ...prev };
        for (const p of applied) {
          next[p] = [...(next[p] ?? []), ...currentPageBoxes];
        }
        return next;
      });
    }

    const MAX_LISTED = 8;
    const listSkipped = () => {
      const shown = skipped.slice(0, MAX_LISTED).join(', ');
      const remaining = skipped.length - MAX_LISTED;
      return `${shown}${remaining > 0 ? ` and ${remaining} more` : ''}`;
    };

    if (applied.length > 0 && skipped.length === 0) {
      toast({
        title: 'Applied',
        description: `Copied ${currentPageBoxes.length} box${currentPageBoxes.length === 1 ? '' : 'es'} to ${applied.length} page${applied.length === 1 ? '' : 's'}.`,
      });
    } else if (applied.length > 0 && skipped.length > 0) {
      toast({
        title: 'Applied, with some pages skipped',
        description: `Copied to ${applied.length} page${applied.length === 1 ? '' : 's'}. Skipped ${skipped.length} page${skipped.length === 1 ? '' : 's'} with a different page size than page ${pageNumber}: ${listSkipped()}.`,
      });
    } else {
      toast({
        title: 'No pages match this page\'s size',
        description: `Every page in range has a different size than page ${pageNumber}, so nothing was copied: ${listSkipped()}.`,
        variant: 'destructive',
      });
    }
  };

  const handleApply = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await redactPdf(file, redactions, password);
      downloadBlob(blob, derivedName(file.name, '_redacted'));
      toast({
        title: 'Success!',
        description: `Redacted ${totalBoxes} box${totalBoxes === 1 ? '' : 'es'} across ${pagesWithBoxes} page${pagesWithBoxes === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      reportToolError(toast, 'Error redacting PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Redact PDF</h2>
      <p className="text-sm text-muted-foreground">
        Draw boxes over content to permanently remove — this deletes the underlying text and image
        data, not just draws over it, so nothing under a box stays selectable, copyable, or
        searchable. Every page you redact loses its own text layer entirely, since it is rebuilt as
        a plain image; pages you leave untouched keep theirs.
      </p>
      <FilePicker
        files={files}
        onChange={(next) => {
          setFiles(next);
          setRedactions({});
          setPageIndex(0);
          setApplyRange('');
          if (next[0]) {
            const warning = largeFileWarning(next[0]);
            if (warning) toast({ title: 'Large file', description: warning });
          }
        }}
        accept=".pdf"
        label="PDF File"
        onValidate={assertPdfFile}
        onReject={(error) => reportToolError(toast, 'Invalid file', error)}
      />

      <div>
        <Label htmlFor="redact-password">Password (if encrypted)</Label>
        <Input
          id="redact-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {previewing && <p className="text-sm text-muted-foreground">Rendering page…</p>}

      {preview && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pageNumber}
              {pageCount ? ` of ${pageCount}` : ''}
              {currentPageBoxes.length > 0 ? ` — ${currentPageBoxes.length} box${currentPageBoxes.length === 1 ? '' : 'es'}` : ''}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageCount !== null && pageNumber >= pageCount}
              onClick={() => setPageIndex((i) => i + 1)}
            >
              Next
            </Button>
          </div>

          <div className="relative inline-block max-w-full border border-glass-border rounded overflow-hidden">
            <img
              ref={imgRef}
              src={preview.url}
              alt={`Page ${pageNumber}`}
              className="max-w-full block select-none cursor-crosshair bg-white"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={finishDrag}
              onMouseLeave={finishDrag}
              draggable={false}
            />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
              {currentPageBoxes.map((rect, i) => {
                const px = {
                  x: (rect.x * PREVIEW_SCALE),
                  y: ((preview.heightPts - rect.y - rect.height) * PREVIEW_SCALE),
                  width: rect.width * PREVIEW_SCALE,
                  height: rect.height * PREVIEW_SCALE,
                };
                return (
                  <rect
                    key={i}
                    x={`${(px.x / (imgRef.current?.naturalWidth || 1)) * 100}%`}
                    y={`${(px.y / (imgRef.current?.naturalHeight || 1)) * 100}%`}
                    width={`${(px.width / (imgRef.current?.naturalWidth || 1)) * 100}%`}
                    height={`${(px.height / (imgRef.current?.naturalHeight || 1)) * 100}%`}
                    fill="rgba(220, 38, 38, 0.5)"
                    stroke="rgb(220, 38, 38)"
                  />
                );
              })}
              {drag && preview && (
                <rect
                  x={`${(Math.min(drag.start.x, drag.current.x) / (imgRef.current?.naturalWidth || 1)) * 100}%`}
                  y={`${(Math.min(drag.start.y, drag.current.y) / (imgRef.current?.naturalHeight || 1)) * 100}%`}
                  width={`${(Math.abs(drag.current.x - drag.start.x) / (imgRef.current?.naturalWidth || 1)) * 100}%`}
                  height={`${(Math.abs(drag.current.y - drag.start.y) / (imgRef.current?.naturalHeight || 1)) * 100}%`}
                  fill="rgba(220, 38, 38, 0.3)"
                  stroke="rgb(220, 38, 38)"
                  strokeDasharray="4"
                />
              )}
            </svg>
          </div>

          {currentPageBoxes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {currentPageBoxes.map((rect, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Box {i + 1}: {Math.round(rect.width)}×{Math.round(rect.height)} pt
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeBox(i)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {currentPageBoxes.length > 0 && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="apply-range">
                  Apply this page's box{currentPageBoxes.length === 1 ? '' : 'es'} to other pages
                </Label>
                <Input
                  id="apply-range"
                  value={applyRange}
                  onChange={(e) => setApplyRange(e.target.value)}
                  placeholder="e.g. 2-50 — or leave blank for every other page"
                  className="w-72"
                />
              </div>
              <Button type="button" variant="outline" onClick={handleApplyToRange} disabled={!pageSizes}>
                Apply
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {totalBoxes === 0
          ? 'No redaction boxes yet — click and drag on the page above to draw one.'
          : `${totalBoxes} box${totalBoxes === 1 ? '' : 'es'} across ${pagesWithBoxes} page${pagesWithBoxes === 1 ? '' : 's'} will be redacted.`}
      </p>

      <Button onClick={handleApply} disabled={isLoading || totalBoxes === 0}>
        {isLoading ? 'Redacting...' : 'Apply Redactions & Download'}
      </Button>
    </div>
  );
};
