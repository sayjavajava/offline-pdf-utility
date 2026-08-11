import { useState } from 'react';
import { rearrangePdf } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const RearrangeTool = () => {
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

  const handleRearrange = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }
    if (!pages.trim()) {
      toast({
        title: 'No pages specified',
        description: 'Enter the pages to keep, in the desired order.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await rearrangePdf(file, pages, password);
      downloadBlob(blob, derivedName(file.name, '_rearranged'));
      toast({ title: 'Success!', description: 'Pages rearranged successfully.' });
    } catch (error) {
      reportToolError(toast, 'Error rearranging PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Delete / Reorder Pages</h2>
      <p className="text-sm text-muted-foreground">
        Keep only the pages you list, in that order. Omit a page to delete it;
        list a page more than once to duplicate it.
      </p>
      <div>
        <Label htmlFor="file">PDF File</Label>
        <Input id="file" type="file" onChange={handleFileChange} accept=".pdf" />
        {file && <p className="text-sm text-muted-foreground mt-2">Selected file: {file.name}</p>}
      </div>
      <div>
        <Label htmlFor="pages">Pages to keep (in order)</Label>
        <Input
          id="pages"
          value={pages}
          onChange={(e) => setPages(e.target.value)}
          placeholder="e.g. 5,1,3 — omits page 2 and 4"
        />
      </div>
      <div>
        <Label htmlFor="password">Password (if encrypted)</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button onClick={handleRearrange} disabled={isLoading}>
        {isLoading ? 'Rearranging...' : 'Apply'}
      </Button>
    </div>
  );
};
