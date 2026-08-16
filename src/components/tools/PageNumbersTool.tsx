import { useState } from 'react';
import {
  addPageNumbers,
  formatPageNumber,
  type PageNumberFormat,
  type PageNumberPosition,
} from '@/lib/pdf-utils';
import { derivedName, downloadBlob, hexToRgbUnit, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const FORMATS: { value: PageNumberFormat; label: string }[] = [
  { value: 'n', label: 'Page number (1, 2, 3…)' },
  { value: 'n-of-total', label: 'Page x of y' },
  { value: 'bates', label: 'Bates (zero-padded)' },
];

const POSITIONS: PageNumberPosition[] = [
  'bottom-center',
  'bottom-left',
  'bottom-right',
  'top-center',
  'top-left',
  'top-right',
];

export const PageNumbersTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<PageNumberFormat>('n');
  const [start, setStart] = useState(1);
  const [prefix, setPrefix] = useState('');
  const [digits, setDigits] = useState(6);
  const [position, setPosition] = useState<PageNumberPosition>('bottom-center');
  const [fontSize, setFontSize] = useState(12);
  const [color, setColor] = useState('#000000');
  const [pages, setPages] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  // Live preview of the first stamp, so the Bates padding and prefix are
  // visible before committing to a document.
  const preview = formatPageNumber(start, 10, { format, prefix, digits });

  const handleStamp = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await addPageNumbers(
        file,
        {
          format,
          start,
          prefix,
          digits,
          position,
          fontSize,
          color: hexToRgbUnit(color),
          pages: pages.trim() === '' ? 'all' : pages,
        },
        password,
      );
      downloadBlob(blob, derivedName(file.name, '_numbered'));
      toast({ title: 'Success!', description: 'Page numbers added to your PDF.' });
    } catch (error) {
      reportToolError(toast, 'Error adding page numbers', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Add Page Numbers</h2>
      <p className="text-sm text-muted-foreground">
        Stamp sequential page numbers, or Bates numbers for legal documents, onto your PDF.
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
        <Label htmlFor="format">Format</Label>
        <select
          id="format"
          value={format}
          onChange={(e) => setFormat(e.target.value as PageNumberFormat)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="prefix">Prefix (optional)</Label>
        <Input
          id="prefix"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="e.g. ABC-"
          aria-describedby="preview-hint"
        />
        <p id="preview-hint" className="text-xs text-muted-foreground mt-1">
          First stamp will read: <span className="font-mono text-foreground">{preview}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start">Start at</Label>
          <Input id="start" type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value))} />
        </div>
        {format === 'bates' && (
          <div>
            <Label htmlFor="digits">Digits</Label>
            <Input id="digits" type="number" min={1} max={20} value={digits} onChange={(e) => setDigits(Number(e.target.value))} />
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="position">Position</Label>
        <select
          id="position"
          value={position}
          onChange={(e) => setPosition(e.target.value as PageNumberPosition)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{p.replace('-', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="np-fontSize">Font Size</Label>
          <Input id="np-fontSize" type="number" min={1} max={300} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="np-color">Colour</Label>
          <Input id="np-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
        </div>
      </div>

      <div>
        <Label htmlFor="np-pages">Pages to number (blank = all)</Label>
        <Input id="np-pages" value={pages} onChange={(e) => setPages(e.target.value)} placeholder='e.g. 2-10 — or leave blank for "all"' />
      </div>

      <div>
        <Label htmlFor="np-password">PDF Password (if protected)</Label>
        <Input id="np-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      <Button onClick={handleStamp} disabled={isLoading}>
        {isLoading ? 'Adding Page Numbers…' : 'Add Page Numbers'}
      </Button>
    </div>
  );
};
