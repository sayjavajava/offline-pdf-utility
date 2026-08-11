import { useState } from 'react';
import { removePdfPassword } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const UnlockTool = () => {
  const [file, setFile] = useState<File | null>(null);
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

  const handleUnlock = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await removePdfPassword(file, password);
      downloadBlob(blob, derivedName(file.name, '_unprotected'));
      toast({ title: 'Success!', description: 'The PDF protection has been removed.' });
    } catch (error) {
      reportToolError(toast, 'Error removing protection', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Remove PDF Protection</h2>
      <p className="text-sm text-muted-foreground">This tool removes the password from an encrypted PDF.</p>
      <div>
        <Label htmlFor="file">PDF File</Label>
        <Input id="file" type="file" onChange={handleFileChange} accept=".pdf" />
        {file && <p className="text-sm text-muted-foreground mt-2">Selected file: {file.name}</p>}
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button onClick={handleUnlock} disabled={isLoading}>
        {isLoading ? 'Processing...' : 'Remove Protection'}
      </Button>
    </div>
  );
};
