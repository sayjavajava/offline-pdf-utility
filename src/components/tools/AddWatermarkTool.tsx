import { useState } from 'react';
import { addWatermark } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, hexToRgbUnit, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const AddWatermarkTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(50);
  const [opacity, setOpacity] = useState(0.5);
  const [color, setColor] = useState('#ff0000');
  const [rotation, setRotation] = useState(45);
  const [tile, setTile] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const clampFontSize = () => {
    if (!Number.isFinite(fontSize) || fontSize < 1) setFontSize(1);
    else if (fontSize > 300) setFontSize(300);
  };

  const clampOpacity = () => {
    if (!Number.isFinite(opacity) || opacity < 0) setOpacity(0);
    else if (opacity > 1) setOpacity(1);
  };

  const clampRotation = () => {
    if (!Number.isFinite(rotation)) setRotation(0);
    else if (rotation < -360) setRotation(-360);
    else if (rotation > 360) setRotation(360);
  };

  const handleAddWatermark = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await addWatermark(
        file,
        text,
        { fontSize, color: hexToRgbUnit(color), opacity, rotation, tile },
        password,
      );
      downloadBlob(blob, derivedName(file.name, '_watermarked'));
      toast({ title: 'Success!', description: 'Watermark added to your PDF.' });
    } catch (error) {
      reportToolError(toast, 'Error adding watermark', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Add Watermark</h2>
      <p className="text-sm text-muted-foreground">Apply a text watermark to each page of your PDF.</p>
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
      <div>
        <Label htmlFor="text">Watermark Text</Label>
        <Input id="text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="fontSize">Font Size (1–300)</Label>
        <Input
          id="fontSize"
          type="number"
          min={1}
          max={300}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          onBlur={clampFontSize}
          aria-describedby="fontSize-hint"
        />
        <p id="fontSize-hint" className="text-xs text-muted-foreground mt-1">Must be between 1 and 300.</p>
      </div>
      <div>
        <Label htmlFor="opacity">Opacity (0–1)</Label>
        <Input
          id="opacity"
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          onBlur={clampOpacity}
          aria-describedby="opacity-hint"
        />
        <p id="opacity-hint" className="text-xs text-muted-foreground mt-1">Must be between 0 and 1.</p>
      </div>
      <div>
        <Label htmlFor="color">Colour</Label>
        <Input
          id="color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-20 p-1"
        />
      </div>
      <div>
        <Label htmlFor="rotation">Rotation (degrees)</Label>
        <Input
          id="rotation"
          type="number"
          min={-360}
          max={360}
          value={rotation}
          onChange={(e) => setRotation(Number(e.target.value))}
          onBlur={clampRotation}
          aria-describedby="rotation-hint"
        />
        <p id="rotation-hint" className="text-xs text-muted-foreground mt-1">
          45° gives the usual diagonal stamp. 0 is horizontal.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="tile"
          type="checkbox"
          checked={tile}
          onChange={(e) => setTile(e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="tile" className="mb-0">Repeat across the whole page</Label>
      </div>
      <div>
        <Label htmlFor="password">PDF Password (if protected)</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button onClick={handleAddWatermark} disabled={isLoading}>
        {isLoading ? 'Adding Watermark...' : 'Add Watermark'}
      </Button>
    </div>
  );
};
