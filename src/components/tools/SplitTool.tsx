import { useState } from 'react';
import { splitPdf } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSplit = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file to split.', variant: 'destructive' });
      return;
    }
    if (!pages) {
      toast({ title: 'No pages specified', description: 'Please enter the page range to extract.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await splitPdf(file, pages, password);
      downloadBlob(blob, derivedName(file.name, '_split'));
      toast({ title: 'Success!', description: 'Your PDF has been split successfully.' });
    } catch (error) {
      reportToolError(toast, 'Error splitting PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-white">
      <h2 className="text-2xl font-bold">Split PDF</h2>
      <div>
        <Label htmlFor="file">PDF File</Label>
        <Input id="file" type="file" onChange={handleFileChange} accept=".pdf" />
        {file && <p className="text-sm text-gray-400 mt-2">Selected file: {file.name}</p>}
      </div>
      <div>
        <Label htmlFor="pages">Pages to Extract (e.g., 1, 3-5, 8)</Label>
        <Input id="pages" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="all" />
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
