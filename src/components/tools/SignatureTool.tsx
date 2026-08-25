import { useEffect, useRef, useState } from 'react';
import { addSignature, detectImageFormat, type SignatureImageFormat } from '@/lib/pdf-utils';
import { renderPdfPages, getPageSizes, type PageSize } from '@/lib/pdf-render';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

/** Pixels per PDF point for the on-screen page preview — same convention
 *  RedactTool.tsx uses, so its already-proven coordinate math (including for
 *  rotated pages) can be reused verbatim below. */
const PREVIEW_SCALE = 1.5;

type PixelPoint = { x: number; y: number };
type PlacedRect = { x: number; y: number; width: number; height: number };
type SignatureImage = {
  bytes: Uint8Array;
  format: SignatureImageFormat;
  previewUrl: string;
  naturalWidth: number;
  naturalHeight: number;
};

const DRAW_CANVAS_WIDTH = 400;
const DRAW_CANVAS_HEIGHT = 150;

async function canvasToSignatureImage(canvas: HTMLCanvasElement): Promise<SignatureImage> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the canvas.'))), 'image/png');
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    format: 'png',
    previewUrl: URL.createObjectURL(blob),
    naturalWidth: canvas.width,
    naturalHeight: canvas.height,
  };
}

export const SignatureTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [pageSizes, setPageSizes] = useState<PageSize[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [preview, setPreview] = useState<{ url: string; heightPts: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [drag, setDrag] = useState<{ start: PixelPoint; current: PixelPoint } | null>(null);
  const [placement, setPlacement] = useState<PlacedRect | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [signatureMode, setSignatureMode] = useState<'type' | 'draw' | 'upload'>('type');
  const [typedName, setTypedName] = useState('');
  const [signatureImage, setSignatureImage] = useState<SignatureImage | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const file = files[0] ?? null;
  const pageNumber = pageIndex + 1;
  const pageCount = pageSizes?.length ?? null;

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      setNaturalSize(null);
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
        setNaturalSize(null);
      } catch (error) {
        console.error('Page preview failed:', error);
        if (!cancelled) {
          setPreview(null);
          setNaturalSize(null);
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, pageIndex, password]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const sizes = await getPageSizes(file, password);
        if (!cancelled) setPageSizes(sizes);
      } catch {
        if (!cancelled) setPageSizes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, password]);

  const pixelToPdfRect = (a: PixelPoint, b: PixelPoint, heightPts: number): PlacedRect => {
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
    setPlacement(rect);
  };

  // --- Drawing pad (mode: 'draw') ---
  const drawPointer = (e: React.PointerEvent<HTMLCanvasElement>): PixelPoint => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDrawStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const point = drawPointer(e);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setIsDrawing(true);
  };

  const handleDrawMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const point = drawPointer(e);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const handleDrawEnd = () => setIsDrawing(false);

  const handleClearDraw = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleUseDrawn = async () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    try {
      const image = await canvasToSignatureImage(canvas);
      setSignatureImage(image);
    } catch (error) {
      reportToolError(toast, 'Error capturing signature', error);
    }
  };

  // --- Typed name (mode: 'type') ---
  const handleUseTyped = async () => {
    if (typedName.trim() === '') {
      toast({ title: 'Nothing typed', description: 'Type a name first.', variant: 'destructive' });
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = DRAW_CANVAS_WIDTH;
    canvas.height = DRAW_CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '48px cursive';
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, 10, canvas.height / 2, canvas.width - 20);
    try {
      const image = await canvasToSignatureImage(canvas);
      setSignatureImage(image);
    } catch (error) {
      reportToolError(toast, 'Error rendering signature', error);
    }
  };

  // --- Uploaded image (mode: 'upload') ---
  const handleUploadSignature = async (uploaded: File[]) => {
    const image = uploaded[0];
    if (!image) return;
    try {
      const bytes = await image.arrayBuffer();
      const format = detectImageFormat(image, bytes);
      if (format === null) {
        toast({ title: 'Unsupported image', description: 'Use a JPEG or PNG image.', variant: 'destructive' });
        return;
      }
      const objectUrl = URL.createObjectURL(image);
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const el = new window.Image();
        el.onload = () => resolve({ width: el.naturalWidth, height: el.naturalHeight });
        el.onerror = () => reject(new Error('Could not read this image.'));
        el.src = objectUrl;
      });
      setSignatureImage({
        bytes: new Uint8Array(bytes),
        format,
        previewUrl: objectUrl,
        naturalWidth: dims.width,
        naturalHeight: dims.height,
      });
    } catch (error) {
      reportToolError(toast, 'Error reading image', error);
    }
  };

  const handleApply = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }
    if (!signatureImage) {
      toast({ title: 'No signature yet', description: 'Type, draw, or upload a signature first.', variant: 'destructive' });
      return;
    }
    if (!placement) {
      toast({ title: 'No placement chosen', description: 'Click and drag on the page to place the signature.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await addSignature(
        file,
        signatureImage.bytes,
        signatureImage.format,
        { page: pageNumber, ...placement },
        password,
      );
      downloadBlob(blob, derivedName(file.name, '_signed'));
      toast({ title: 'Success!', description: `Signature added to page ${pageNumber}.` });
    } catch (error) {
      reportToolError(toast, 'Error adding signature', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Add Signature</h2>
      <p className="text-sm text-muted-foreground">
        Stamp a visual signature — typed, drawn, or an uploaded image — onto a page. This is a
        visual mark, not a cryptographic digital signature (no key, no trust chain) — the same
        distinction most "sign a PDF" tools outside enterprise contract software make.
      </p>

      <div className="space-y-2">
        <Label>Signature</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={signatureMode === 'type' ? 'default' : 'outline'} onClick={() => setSignatureMode('type')}>
            Type
          </Button>
          <Button type="button" size="sm" variant={signatureMode === 'draw' ? 'default' : 'outline'} onClick={() => setSignatureMode('draw')}>
            Draw
          </Button>
          <Button type="button" size="sm" variant={signatureMode === 'upload' ? 'default' : 'outline'} onClick={() => setSignatureMode('upload')}>
            Upload
          </Button>
        </div>

        {signatureMode === 'type' && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="typed-name">Your name</Label>
              <Input id="typed-name" value={typedName} onChange={(e) => setTypedName(e.target.value)} className="w-64" />
            </div>
            <Button type="button" variant="outline" onClick={handleUseTyped}>
              Use this signature
            </Button>
          </div>
        )}

        {signatureMode === 'draw' && (
          <div className="space-y-2">
            <canvas
              ref={drawCanvasRef}
              width={DRAW_CANVAS_WIDTH}
              height={DRAW_CANVAS_HEIGHT}
              className="border border-glass-border rounded bg-white touch-none cursor-crosshair"
              onPointerDown={handleDrawStart}
              onPointerMove={handleDrawMove}
              onPointerUp={handleDrawEnd}
              onPointerLeave={handleDrawEnd}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleClearDraw}>
                Clear
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleUseDrawn}>
                Use this signature
              </Button>
            </div>
          </div>
        )}

        {signatureMode === 'upload' && (
          <FilePicker
            files={[]}
            onChange={handleUploadSignature}
            accept="image/png,image/jpeg"
            label="Signature Image"
          />
        )}

        {signatureImage && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Current signature:</p>
            <img src={signatureImage.previewUrl} alt="Signature preview" className="h-16 border border-glass-border rounded bg-white" />
          </div>
        )}
      </div>

      <FilePicker
        files={files}
        onChange={(next) => {
          setFiles(next);
          setPlacement(null);
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
        <Label htmlFor="signature-password">Password (if encrypted)</Label>
        <Input id="signature-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
              onClick={() => {
                // A rect drawn on one page's preview has no meaningful
                // position on a different page.
                setPlacement(null);
                setPageIndex((i) => Math.max(0, i - 1));
              }}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pageNumber}
              {pageCount ? ` of ${pageCount}` : ''}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageCount !== null && pageNumber >= pageCount}
              onClick={() => {
                setPlacement(null);
                setPageIndex((i) => i + 1);
              }}
            >
              Next
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mb-2">
            Click and drag on the page below to place your signature. Drag again to move or resize it.
          </p>

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
              onLoad={(e) => setNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              draggable={false}
            />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
              {placement && preview && (
                <>
                  <rect
                    x={`${((placement.x * PREVIEW_SCALE) / (naturalSize?.width || 1)) * 100}%`}
                    y={`${(((preview.heightPts - placement.y - placement.height) * PREVIEW_SCALE) / (naturalSize?.height || 1)) * 100}%`}
                    width={`${((placement.width * PREVIEW_SCALE) / (naturalSize?.width || 1)) * 100}%`}
                    height={`${((placement.height * PREVIEW_SCALE) / (naturalSize?.height || 1)) * 100}%`}
                    fill="rgba(37, 99, 235, 0.15)"
                    stroke="rgb(37, 99, 235)"
                  />
                  {signatureImage && (
                    <image
                      href={signatureImage.previewUrl}
                      x={`${((placement.x * PREVIEW_SCALE) / (naturalSize?.width || 1)) * 100}%`}
                      y={`${(((preview.heightPts - placement.y - placement.height) * PREVIEW_SCALE) / (naturalSize?.height || 1)) * 100}%`}
                      width={`${((placement.width * PREVIEW_SCALE) / (naturalSize?.width || 1)) * 100}%`}
                      height={`${((placement.height * PREVIEW_SCALE) / (naturalSize?.height || 1)) * 100}%`}
                      preserveAspectRatio="none"
                    />
                  )}
                </>
              )}
              {drag && preview && (
                <rect
                  x={`${(Math.min(drag.start.x, drag.current.x) / (naturalSize?.width || 1)) * 100}%`}
                  y={`${(Math.min(drag.start.y, drag.current.y) / (naturalSize?.height || 1)) * 100}%`}
                  width={`${(Math.abs(drag.current.x - drag.start.x) / (naturalSize?.width || 1)) * 100}%`}
                  height={`${(Math.abs(drag.current.y - drag.start.y) / (naturalSize?.height || 1)) * 100}%`}
                  fill="rgba(37, 99, 235, 0.2)"
                  stroke="rgb(37, 99, 235)"
                  strokeDasharray="4"
                />
              )}
            </svg>
          </div>
        </div>
      )}

      <Button onClick={handleApply} disabled={isLoading}>
        {isLoading ? 'Adding signature...' : 'Add Signature & Download'}
      </Button>
    </div>
  );
};
