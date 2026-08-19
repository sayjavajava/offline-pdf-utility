import { useState } from 'react';
import { cropPdf, resizePdf, PAPER_SIZES, type PaperSize } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

type Mode = 'crop' | 'resize';
type PaperOption = keyof typeof PAPER_SIZES | 'Custom';

export const CropResizeTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>('crop');
  const [pages, setPages] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Crop state — margins in points, one per edge.
  const [top, setTop] = useState('0');
  const [bottom, setBottom] = useState('0');
  const [left, setLeft] = useState('0');
  const [right, setRight] = useState('0');

  // Resize state.
  const [paperOption, setPaperOption] = useState<PaperOption>('A4');
  const [customWidth, setCustomWidth] = useState('595.28');
  const [customHeight, setCustomHeight] = useState('841.89');
  const [stretch, setStretch] = useState(false);

  const { toast } = useToast();
  const file = files[0] ?? null;

  const targetSize = (): PaperSize => {
    if (paperOption === 'Custom') {
      return { width: Number(customWidth), height: Number(customHeight) };
    }
    return PAPER_SIZES[paperOption];
  };

  const handleRun = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const pageRange = pages.trim() === '' ? 'all' : pages;
      if (mode === 'crop') {
        const margins = {
          top: Number(top),
          bottom: Number(bottom),
          left: Number(left),
          right: Number(right),
        };
        const blob = await cropPdf(file, margins, pageRange, password);
        downloadBlob(blob, derivedName(file.name, '_cropped'));
        toast({ title: 'Success!', description: 'Pages cropped.' });
      } else {
        const blob = await resizePdf(file, targetSize(), pageRange, password, stretch);
        downloadBlob(blob, derivedName(file.name, '_resized'));
        toast({ title: 'Success!', description: 'Pages resized.' });
      }
    } catch (error) {
      reportToolError(toast, mode === 'crop' ? 'Error cropping PDF' : 'Error resizing PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Crop / Resize Pages</h2>
      <p className="text-sm text-muted-foreground">
        Crop trims margins non-destructively — the underlying content is untouched, only the visible
        window shrinks. Resize actually rescales content and page size together, so text and images
        change proportionally; it defaults to scale-to-fit so nothing is distorted.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'crop' ? 'default' : 'outline'}
          onClick={() => setMode('crop')}
        >
          Crop
        </Button>
        <Button
          type="button"
          variant={mode === 'resize' ? 'default' : 'outline'}
          onClick={() => setMode('resize')}
        >
          Resize
        </Button>
      </div>

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

      {mode === 'crop' ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="crop-top">Top margin (pt)</Label>
            <Input id="crop-top" type="number" min="0" value={top} onChange={(e) => setTop(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="crop-bottom">Bottom margin (pt)</Label>
            <Input id="crop-bottom" type="number" min="0" value={bottom} onChange={(e) => setBottom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="crop-left">Left margin (pt)</Label>
            <Input id="crop-left" type="number" min="0" value={left} onChange={(e) => setLeft(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="crop-right">Right margin (pt)</Label>
            <Input id="crop-right" type="number" min="0" value={right} onChange={(e) => setRight(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="paper-size">Target page size</Label>
            <select
              id="paper-size"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={paperOption}
              onChange={(e) => setPaperOption(e.target.value as PaperOption)}
            >
              {Object.keys(PAPER_SIZES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
          </div>
          {paperOption === 'Custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="custom-width">Width (pt)</Label>
                <Input
                  id="custom-width"
                  type="number"
                  min="1"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="custom-height">Height (pt)</Label>
                <Input
                  id="custom-height"
                  type="number"
                  min="1"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stretch} onChange={(e) => setStretch(e.target.checked)} />
            Stretch to fill exactly (distorts proportions — scale-to-fit, centered, is the default)
          </label>
        </div>
      )}

      <div>
        <Label htmlFor="pages">Pages (blank = all)</Label>
        <Input
          id="pages"
          value={pages}
          onChange={(e) => setPages(e.target.value)}
          placeholder='e.g. 1, 3-5 — or leave blank for all'
        />
      </div>
      <div>
        <Label htmlFor="password">Password (if encrypted)</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button onClick={handleRun} disabled={isLoading}>
        {isLoading ? (mode === 'crop' ? 'Cropping...' : 'Resizing...') : mode === 'crop' ? 'Crop Pages' : 'Resize Pages'}
      </Button>
    </div>
  );
};
