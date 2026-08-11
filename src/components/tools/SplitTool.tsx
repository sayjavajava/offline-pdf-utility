import { useState } from 'react';
import { splitPdf } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const SplitTool = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    if (!next) {
      setFile(null);
      return;
    }
    try {
      await assertPdfFile(next);
      setFile(next);
      const warning = largeFileWarning(next);
      if (warning) toast({ title: 'Large file', description: warning });
    } catch (error) {
      setFile(null);
      e.target.value = '';
      reportToolError(toast, 'Invalid file', error);
    }
  };

  const handleSplit = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file to split.', variant: 'destructive' });
      return;
    }

    // Blank means "all" — matches the placeholder and splitPdf's keyword (P1-14).
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
      <div>
        <Label htmlFor="file">PDF File</Label>
        <Input id="file" type="file" onChange={handleFileChange} accept=".pdf" />
        {file && <p className="text-sm text-muted-foreground mt-2">Selected file: {file.name}</p>}
      </div>
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
