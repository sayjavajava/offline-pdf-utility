import { useState } from 'react';
import { splitPdf, splitPdfToZip } from '@/lib/pdf-utils';
import { createZip } from '@/lib/zip';
import { derivedName, downloadBlob, reportToolError, stripExtension } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const SplitTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState('');
  const [password, setPassword] = useState('');
  const [separateFiles, setSeparateFiles] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleSplit = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file to split.', variant: 'destructive' });
      return;
    }

    const pageRange = pages.trim() === '' ? 'all' : pages;

    setIsLoading(true);
    try {
      if (separateFiles) {
        const pdfPages = await splitPdfToZip(file, pageRange, password);
        // Repeated page numbers are possible (P1-7 allows duplicates in a
        // range like "3,1,1"); suffix collisions rather than silently
        // overwrite one entry with another in the zip.
        const seen = new Map<number, number>();
        const entries = pdfPages.map(({ pageNumber, bytes }) => {
          const occurrence = (seen.get(pageNumber) ?? 0) + 1;
          seen.set(pageNumber, occurrence);
          const suffix = occurrence > 1 ? `-copy${occurrence}` : '';
          return { name: `page-${String(pageNumber).padStart(3, '0')}${suffix}.pdf`, bytes };
        });

        if (pdfPages.length === 1) {
          downloadBlob(
            new Blob([pdfPages[0].bytes], { type: 'application/pdf' }),
            `${stripExtension(file.name)}_${entries[0].name}`,
          );
        } else {
          downloadBlob(createZip(entries), derivedName(file.name, '_split', 'zip'));
        }
        toast({
          title: 'Success!',
          description: `Split into ${pdfPages.length} file${pdfPages.length === 1 ? '' : 's'}.`,
        });
      } else {
        const blob = await splitPdf(file, pageRange, password);
        downloadBlob(blob, derivedName(file.name, '_split'));
        toast({ title: 'Success!', description: 'Your PDF has been split successfully.' });
      }
    } catch (error) {
      reportToolError(toast, 'Error splitting PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Split PDF</h2>
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
        <Label htmlFor="pages">Pages to Extract</Label>
        <Input
          id="pages"
          value={pages}
          onChange={(e) => setPages(e.target.value)}
          placeholder='e.g. 1, 3-5, 8 — or "all"'
        />
      </div>
      <div>
        <Label htmlFor="password">Password (if encrypted)</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="separate-files"
          type="checkbox"
          checked={separateFiles}
          onChange={(e) => setSeparateFiles(e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="separate-files" className="mb-0">Download as separate files (zip)</Label>
      </div>
      <Button onClick={handleSplit} disabled={isLoading}>
        {isLoading ? 'Splitting...' : 'Split PDF'}
      </Button>
    </div>
  );
};
