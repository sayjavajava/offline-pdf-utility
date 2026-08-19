import { useState } from 'react';
import { compressPdf } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CompressTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleCompress = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file to compress.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await compressPdf(file);
      downloadBlob(blob, derivedName(file.name, '_compressed'));

      const before = formatSize(file.size);
      const after = formatSize(blob.size);
      const saved = file.size > 0 ? Math.round((1 - blob.size / file.size) * 100) : 0;
      toast({
        title: 'Success!',
        description:
          saved > 0
            ? `${before} → ${after} (${saved}% smaller).`
            : `${before} → ${after}. This PDF was already efficiently compressed.`,
      });
    } catch (error) {
      reportToolError(toast, 'Error compressing PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Compress PDF</h2>
      <p className="text-sm text-muted-foreground">
        Shrinks a PDF, mainly by recompressing embedded images. Images that get recompressed lose
        some quality (like a JPEG re-save) — this only makes a real difference on image-heavy PDFs;
        a text-only document is usually already about as small as it gets.
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
        accept=".pdf"
        label="PDF File"
        onValidate={assertPdfFile}
        onReject={(error) => reportToolError(toast, 'Invalid file', error)}
      />
      <Button onClick={handleCompress} disabled={isLoading}>
        {isLoading ? 'Compressing...' : 'Compress PDF'}
      </Button>
    </div>
  );
};
