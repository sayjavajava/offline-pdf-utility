import { useState } from 'react';
import { convertImageToPdf, convertDocxToPdf } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const ConvertTool = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleConvert = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a file to convert.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      let blob;
      if (file.type.startsWith('image/')) {
        blob = await convertImageToPdf(file);
      } else if (file.name.endsWith('.docx')) {
        blob = await convertDocxToPdf(file);
      } else {
        toast({ title: 'Unsupported file type', description: 'Please select a JPEG, PNG, or DOCX file.', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      downloadBlob(blob, derivedName(file.name, ''));
      toast({ title: 'Success!', description: 'Your file has been converted to PDF.' });
    } catch (error) {
      reportToolError(toast, 'Error converting file', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-white">
      <h2 className="text-2xl font-bold">Convert to PDF</h2>
      <p className="text-sm text-gray-400">Convert JPEG, PNG, or DOCX files to PDF.</p>
      <div>
        <Label htmlFor="file">File to Convert</Label>
        <Input id="file" type="file" onChange={handleFileChange} accept=".jpg,.jpeg,.png,.docx" />
        {file && <p className="text-sm text-gray-400 mt-2">Selected file: {file.name}</p>}
      </div>
      <Button onClick={handleConvert} disabled={isLoading}>
        {isLoading ? 'Converting...' : 'Convert to PDF'}
      </Button>
    </div>
  );
};
