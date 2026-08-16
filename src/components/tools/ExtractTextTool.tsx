import { useState } from 'react';
import { extractPdfText } from '@/lib/pdf-render';
import { parsePageRange } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const ExtractTextTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState('');
  const [pageMarkers, setPageMarkers] = useState(true);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleExtract = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setProgress(null);
    try {
      let pageNumbers: number[] | undefined;
      if (pages.trim() && pages.trim().toLowerCase() !== 'all') {
        const parsed = parsePageRange(pages, Number.MAX_SAFE_INTEGER);
        if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
        pageNumbers = parsed.indices.map((i) => i + 1);
      }

      const extracted = await extractPdfText(file, {
        pageNumbers,
        password,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      // A scanned document is pictures of words with no text layer, so this
      // comes back empty. Saying so beats handing over a blank file that looks
      // like the tool worked.
      if (extracted.every((page) => page.text.trim() === '')) {
        toast({
          title: 'No text found',
          description:
            'This PDF has no text layer — it is most likely scanned. Extracting its words ' +
            'would need OCR, which this tool does not do.',
          variant: 'destructive',
        });
        return;
      }

      const body = pageMarkers
        ? extracted.map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`).join('\n\n')
        : extracted.map((page) => page.text).join('\n\n');

      downloadBlob(
        new Blob([body], { type: 'text/plain;charset=utf-8' }),
        derivedName(file.name, '_text', 'txt'),
      );

      const emptyPages = extracted.filter((page) => page.text.trim() === '').length;
      toast({
        title: 'Success!',
        description:
          `Extracted text from ${extracted.length} page${extracted.length === 1 ? '' : 's'}.` +
          (emptyPages ? ` ${emptyPages} had no text layer.` : ''),
      });
    } catch (error) {
      reportToolError(toast, 'Error extracting text', error);
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Extract Text</h2>
      <p className="text-sm text-muted-foreground">
        Pull the text out of a PDF as a plain text file. Your document is not modified. Scanned
        PDFs have no text layer and will come back empty — reading those needs OCR, which this
        tool does not do.
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
        <Label htmlFor="et-pages">Pages (blank = all)</Label>
        <Input
          id="et-pages"
          value={pages}
          onChange={(e) => setPages(e.target.value)}
          placeholder="e.g. 1, 3-5"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="et-markers"
          type="checkbox"
          checked={pageMarkers}
          onChange={(e) => setPageMarkers(e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="et-markers" className="mb-0">Mark where each page starts</Label>
      </div>

      <div>
        <Label htmlFor="et-password">PDF Password (if protected)</Label>
        <Input
          id="et-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {progress && (
        <p className="text-sm text-muted-foreground" role="status">
          Reading page {progress.done} of {progress.total}…
        </p>
      )}

      <Button onClick={handleExtract} disabled={isLoading}>
        {isLoading ? 'Extracting…' : 'Extract Text'}
      </Button>
    </div>
  );
};
