import { useState } from 'react';
import { mergePdf } from '@/lib/pdf-utils';
import { downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const MergeTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) {
      setFiles([]);
      return;
    }

    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      try {
        await assertPdfFile(file);
        accepted.push(file);
        const warning = largeFileWarning(file);
        if (warning) toast({ title: 'Large file', description: `${file.name}: ${warning}` });
      } catch (error) {
        reportToolError(toast, 'Invalid file', error);
      }
    }
    setFiles(accepted);
    if (accepted.length === 0) e.target.value = '';
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
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Merge PDFs</h2>
      <div>
        <Label htmlFor="files">PDF Files</Label>
        <Input id="files" type="file" onChange={handleFileChange} accept=".pdf" multiple />
        {files.length > 0 && (
          <div className="mt-2">
            <p className="text-sm text-muted-foreground">
              {files.length} files selected — merged in this order:
            </p>
            <ol className="list-decimal list-inside mt-1">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>{file.name}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <Button onClick={handleMerge} disabled={isLoading}>
        {isLoading ? 'Merging...' : 'Merge PDFs'}
      </Button>
    </div>
  );
};
