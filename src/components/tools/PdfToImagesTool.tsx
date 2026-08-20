import { useEffect, useState } from 'react';
import { renderPdfPages, getPageCount, type RenderedPage } from '@/lib/pdf-render';
import { parsePageRange } from '@/lib/pdf-utils';
import { createZip } from '@/lib/zip';
import { derivedName, downloadBlob, reportToolError, stripExtension } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

/** Preview renders small and cheap; the export uses the chosen scale. */
const PREVIEW_SCALE = 0.35;
const PREVIEW_LIMIT = 12;

export const PdfToImagesTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState('');
  const [scale, setScale] = useState(2);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [previews, setPreviews] = useState<{ page: number; url: string }[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const { toast } = useToast();
  const file = files[0] ?? null;

  // Thumbnails (F-5): the page range is otherwise chosen blind. Only ever
  // renders the pages it actually displays (F-20) — this used to render
  // every page via renderPdfPages(file, ...) with no pageNumbers filter,
  // then throw away all but the first PREVIEW_LIMIT: measured at 8.4s on a
  // 400-page document and 15.6s at 800, a real main-thread freeze purely to
  // show 12 thumbnails. getPageCount is cheap (reads numPages, no
  // rendering) — asking it first is what lets the actual render request
  // only the pages that will be shown.
  useEffect(() => {
    if (!file) {
      setPreviews([]);
      setTotalPages(null);
      return;
    }
    let cancelled = false;
    const urls: string[] = [];

    (async () => {
      setPreviewing(true);
      try {
        const count = await getPageCount(file, password);
        if (cancelled) return;
        setTotalPages(count);
        const pageNumbers = Array.from({ length: Math.min(PREVIEW_LIMIT, count) }, (_, i) => i + 1);
        const rendered = await renderPdfPages(file, { scale: PREVIEW_SCALE, pageNumbers, password });
        if (cancelled) return;
        const shown = rendered.map((p) => {
          const url = URL.createObjectURL(new Blob([p.bytes], { type: 'image/png' }));
          urls.push(url);
          return { page: p.pageNumber, url };
        });
        setPreviews(shown);
      } catch (error) {
        // A preview is a convenience; a failure here (an encrypted file with
        // no password yet, say) must not block the tool or shout at the user.
        // It is still logged — a silently empty preview is otherwise
        // indistinguishable from a document that genuinely failed to render.
        console.error('Page preview failed:', error);
        if (!cancelled) {
          setPreviews([]);
          setTotalPages(null);
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    })();

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [file, password]);

  const handleExport = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setProgress(null);
    try {
      let pageNumbers: number[] | undefined;
      if (pages.trim() && pages.trim().toLowerCase() !== 'all') {
        // Reuse the shared parser so the error wording matches every other tool.
        const parsed = parsePageRange(pages, Number.MAX_SAFE_INTEGER);
        if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
        pageNumbers = parsed.indices.map((i) => i + 1);
      }

      const rendered: RenderedPage[] = await renderPdfPages(file, {
        scale,
        pageNumbers,
        password,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      if (rendered.length === 1) {
        downloadBlob(
          new Blob([rendered[0].bytes], { type: 'image/png' }),
          `${stripExtension(file.name)}_page${rendered[0].pageNumber}.png`,
        );
      } else {
        downloadBlob(
          createZip(
            rendered.map((p) => ({
              name: `page-${String(p.pageNumber).padStart(3, '0')}.png`,
              bytes: p.bytes,
            })),
          ),
          derivedName(file.name, '_pages', 'zip'),
        );
      }
      toast({ title: 'Success!', description: `Exported ${rendered.length} page${rendered.length === 1 ? '' : 's'}.` });
    } catch (error) {
      reportToolError(toast, 'Error exporting pages', error);
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">PDF to Images</h2>
      <p className="text-sm text-muted-foreground">
        Render pages to PNG. Several pages are bundled into a zip.
      </p>
      <FilePicker
        files={files}
        onChange={(next) => {
          setFiles(next);
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

      {previewing && <p className="text-sm text-muted-foreground">Rendering preview…</p>}
      {previews.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Preview{totalPages && totalPages > previews.length ? ` (first ${previews.length} of ${totalPages} pages` +
              ' — pick any page number below, whether or not it has a preview)' : ''}
          </p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2" data-testid="page-previews">
            {previews.map((p) => (
              <figure key={p.page} className="text-center">
                <img
                  src={p.url}
                  alt={`Page ${p.page}`}
                  className="w-full rounded border border-glass-border bg-white"
                />
                <figcaption className="text-xs text-muted-foreground mt-1">{p.page}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="pi-pages">Pages (blank = all)</Label>
        <Input id="pi-pages" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="e.g. 1, 3-5" />
      </div>
      <div>
        <Label htmlFor="pi-scale">Scale (1 = 72dpi)</Label>
        <Input
          id="pi-scale"
          type="number"
          min={0.5}
          max={8}
          step={0.5}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
        />
      </div>
      <div>
        <Label htmlFor="pi-password">PDF Password (if protected)</Label>
        <Input id="pi-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      {progress && (
        <p className="text-sm text-muted-foreground" role="status">
          Rendering page {progress.done} of {progress.total}…
        </p>
      )}

      <Button onClick={handleExport} disabled={isLoading}>
        {isLoading ? 'Exporting…' : 'Export Pages as PNG'}
      </Button>
    </div>
  );
};
