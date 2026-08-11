import { useState } from 'react';
import { rotatePdf } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const ANGLES = [90, 180, 270] as const;

export const RotateTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState('');
  const [angle, setAngle] = useState<(typeof ANGLES)[number]>(90);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleRotate = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const pageRange = pages.trim() === '' ? 'all' : pages;
      const blob = await rotatePdf(file, angle, pageRange, password);
      downloadBlob(blob, derivedName(file.name, `_rotated${angle}`));
      toast({ title: 'Success!', description: `Pages rotated ${angle}°.` });
    } catch (error) {
      reportToolError(toast, 'Error rotating PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Rotate Pages</h2>
      <p className="text-sm text-muted-foreground">
        Rotate selected pages (or the whole document) by 90°, 180°, or 270°.
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
      <div>
        <Label htmlFor="angle">Rotation</Label>
        <select
          id="angle"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value) as (typeof ANGLES)[number])}
        >
          {ANGLES.map((a) => (
            <option key={a} value={a}>
              {a}° clockwise
            </option>
          ))}
        </select>
      </div>
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
      <Button onClick={handleRotate} disabled={isLoading}>
        {isLoading ? 'Rotating...' : 'Rotate Pages'}
      </Button>
    </div>
  );
};
