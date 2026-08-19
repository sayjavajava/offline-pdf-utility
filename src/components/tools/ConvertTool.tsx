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

  const handleConvert = async () => {
    if (files.length === 0) {
      toast({ title: 'No file selected', description: 'Please select a file to convert.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      let blob: Blob;

      if (files.length > 1) {
        // Several images combine into one multi-page PDF (F-22). DOCX has no
        // equivalent multi-file operation, so a mixed selection surfaces as a
        // clear per-file error from convertImageToPdf itself rather than a
        // silent partial conversion.
        blob = await convertImageToPdf(files);
      } else {
        const file = files[0];
        const lower = file.name.toLowerCase();
        const looksLikeDocx = lower.endsWith('.docx');
        const bytes = await file.arrayBuffer();
        const imageFormat = detectImageFormat(file, bytes);

        if (imageFormat) {
          blob = await convertImageToPdf([file]);
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
      }

      const outName = derivedName(files[0].name, files.length > 1 ? '_combined' : '');
      downloadBlob(blob, outName);
      toast({
        title: 'Success!',
        description:
          files.length > 1
            ? `Combined ${files.length} images into one PDF.`
            : 'Your file has been converted to PDF.',
      });
    } catch (error) {
      reportToolError(toast, 'Error converting file', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Convert to PDF</h2>
      <p className="text-sm text-muted-foreground">
        Convert JPEG or PNG images to PDF — select several to combine them into one multi-page
        PDF, in the order shown. DOCX files convert one at a time.
      </p>
      <p className="text-sm text-muted-foreground">
        DOCX text comes out selectable and searchable. Complex formatting (styles, precise
        spacing) is simplified; links are shown but are not clickable.
      </p>
      <FilePicker
        multiple
        files={files}
        onChange={setFiles}
        accept=".jpg,.jpeg,.png,.docx"
        label="File(s) to Convert"
        onValidate={async (file) => {
          const warning = largeFileWarning(file);
          if (warning) toast({ title: 'Large file', description: `${file.name}: ${warning}` });
        }}
      />
      <Button onClick={handleConvert} disabled={isLoading}>
        {isLoading ? 'Converting...' : 'Convert to PDF'}
      </Button>
    </div>
  );
};
