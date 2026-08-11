import { useState } from 'react';
import { convertImageToPdf, convertDocxToPdf, detectImageFormat } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export const ConvertTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleConvert = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a file to convert.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      let blob: Blob;
      const lower = file.name.toLowerCase();
      const looksLikeDocx = lower.endsWith('.docx');
      const bytes = await file.arrayBuffer();
      const imageFormat = detectImageFormat(file, bytes);

      if (imageFormat) {
        blob = await convertImageToPdf(file);
      } else if (looksLikeDocx || file.type.includes('wordprocessingml')) {
        const { blob: pdfBlob, warnings } = await convertDocxToPdf(file);
        blob = pdfBlob;
        if (warnings.length > 0) {
          toast({
            title: 'Conversion notes',
            description: warnings.slice(0, 3).join(' '),
          });
        }
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
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Convert to PDF</h2>
      <p className="text-sm text-muted-foreground">Convert JPEG, PNG, or DOCX files to PDF.</p>
      <p className="text-sm text-muted-foreground">
        DOCX conversion renders pages as images; text in the output will not be selectable.
      </p>
      <FilePicker
        files={files}
        onChange={(next) => {
          setFiles(next);
          if (next[0]) {
            const warning = largeFileWarning(next[0]);
            if (warning) toast({ title: 'Large file', description: warning });
          }
        }}
        accept=".jpg,.jpeg,.png,.docx"
        label="File to Convert"
      />
      <Button onClick={handleConvert} disabled={isLoading}>
        {isLoading ? 'Converting...' : 'Convert to PDF'}
      </Button>
    </div>
  );
};
