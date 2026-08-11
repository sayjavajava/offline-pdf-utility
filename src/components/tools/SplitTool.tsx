import { useState } from 'react';
import { splitPdf } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
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
      const blob = await splitPdf(file, pageRange, password);
      downloadBlob(blob, derivedName(file.name, '_split'));
      toast({ title: 'Success!', description: 'Your PDF has been split successfully.' });
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
      <Button onClick={handleSplit} disabled={isLoading}>
        {isLoading ? 'Splitting...' : 'Split PDF'}
      </Button>
    </div>
  );
};
