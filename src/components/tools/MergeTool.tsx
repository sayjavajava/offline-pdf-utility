import { useState } from 'react';
import { mergePdf } from '@/lib/pdf-utils';
import { downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export const MergeTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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
      <FilePicker
        multiple
        files={files}
        onChange={setFiles}
        accept=".pdf"
        label="PDF Files"
        onValidate={async (file) => {
          await assertPdfFile(file);
          const warning = largeFileWarning(file);
          if (warning) toast({ title: 'Large file', description: `${file.name}: ${warning}` });
        }}
        onReject={(error) => reportToolError(toast, 'Invalid file', error)}
      />
      <Button onClick={handleMerge} disabled={isLoading}>
        {isLoading ? 'Merging...' : 'Merge PDFs'}
      </Button>
    </div>
  );
};
