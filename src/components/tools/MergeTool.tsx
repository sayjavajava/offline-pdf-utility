import { useState } from 'react';
import { mergePdf } from '@/lib/pdf-utils';
import { downloadBlob, reportToolError } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const MergeTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      toast({ title: 'Not enough files', description: 'Please select at least two PDF files to merge.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await mergePdf(files);
      downloadBlob(blob, 'merged.pdf');
      toast({ title: 'Success!', description: 'Your PDFs have been merged successfully.' });
    } catch (error) {
      reportToolError(toast, 'Error merging PDFs', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-white">
      <h2 className="text-2xl font-bold">Merge PDFs</h2>
      <div>
        <Label htmlFor="files">PDF Files</Label>
        <Input id="files" type="file" onChange={handleFileChange} accept=".pdf" multiple />
        {files.length > 0 && (
          <div className="mt-2">
            <p>{files.length} files selected:</p>
            <ul className="list-disc list-inside">
              {files.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Button onClick={handleMerge} disabled={isLoading}>
        {isLoading ? 'Merging...' : 'Merge PDFs'}
      </Button>
    </div>
  );
};
