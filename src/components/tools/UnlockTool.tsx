import { useState } from 'react';
import { removePdfPassword } from '@/lib/pdf-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const UnlockTool = () => {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.pdf', '')}_unprotected.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Success!', description: 'The PDF protection has been removed.' });
    } catch (error) {
      if (error instanceof Error) {
        toast({ title: 'Error removing protection', description: error.message, variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-white">
      <h2 className="text-2xl font-bold">Remove PDF Protection</h2>
      <p className="text-sm text-gray-400">This tool removes the password from an encrypted PDF.</p>
      <div>
        <Label htmlFor="file">PDF File</Label>
        <Input id="file" type="file" onChange={handleFileChange} accept=".pdf" />
        {file && <p className="text-sm text-gray-400 mt-2">Selected file: {file.name}</p>}
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
