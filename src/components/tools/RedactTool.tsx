import { useEffect, useRef, useState } from 'react';
import { redactPdf, type RedactionRect } from '@/lib/pdf-utils';
import { renderPdfPages, getPageCount } from '@/lib/pdf-render';
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
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0); // 0-based
  const [preview, setPreview] = useState<{ url: string; heightPts: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [redactions, setRedactions] = useState<Record<number, RedactionRect[]>>({});
  const [drag, setDrag] = useState<{ start: PixelPoint; current: PixelPoint } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();
  const file = files[0] ?? null;
  const pageNumber = pageIndex + 1;

  // Render the current page whenever the file, page, or password changes.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      setPageCount(null);
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

  // Page count, once we can actually open the file (needs the right password).
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const count = await getPageCount(file, password);
        if (!cancelled) setPageCount(count);
      } catch {
        // Handled by the preview effect's own error path (wrong/missing
        // password); page count just stays unknown until that resolves.
        if (!cancelled) setPageCount(null);
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
