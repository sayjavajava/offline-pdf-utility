import { useState } from 'react';
import { extractImages } from '@/lib/pdf-utils';
import { createZip } from '@/lib/zip';
import { derivedName, downloadBlob, reportToolError, stripExtension } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const ExtractImagesTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleExtract = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const { images, skipped } = await extractImages(file, password);

      if (images.length === 0) {
        toast({
          title: 'No images found',
          description: skipped.length
            ? `This PDF has no exportable images. ${skipped[0]}`
            : 'This PDF does not contain any embedded images.',
          variant: 'destructive',
        });
        return;
      }

      // One image downloads as itself; several are bundled so the browser is
      // not asked to fire a dozen separate downloads.
      if (images.length === 1) {
        const only = images[0];
        downloadBlob(
          new Blob([only.bytes], { type: only.format === 'jpg' ? 'image/jpeg' : 'image/png' }),
          `${stripExtension(file.name)}_${only.name}`,
        );
      } else {
        downloadBlob(createZip(images.map((i) => ({ name: i.name, bytes: i.bytes }))), derivedName(file.name, '_images', 'zip'));
      }

      toast({
        title: 'Success!',
        description:
          `Extracted ${images.length} image${images.length === 1 ? '' : 's'}.` +
          (skipped.length ? ` ${skipped.length} could not be exported.` : ''),
      });
    } catch (error) {
      reportToolError(toast, 'Error extracting images', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Extract Images</h2>
      <p className="text-sm text-muted-foreground">
        Pull the embedded images out of a PDF. Your document is not modified. Several images are
        bundled into a zip; JPEG and common PNG-style images are supported.
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
      <div>
        <Label htmlFor="ei-password">PDF Password (if protected)</Label>
        <Input id="ei-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button onClick={handleExtract} disabled={isLoading}>
        {isLoading ? 'Extracting…' : 'Extract Images'}
      </Button>
    </div>
  );
};
