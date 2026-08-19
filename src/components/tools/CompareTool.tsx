import { useState } from 'react';
import { comparePdfs, type PageComparison } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

function describe(p: PageComparison): { label: string; tone: 'same' | 'diff' | 'edge' } {
  if (p.presence === 'onlyInA') return { label: 'Only in A (removed)', tone: 'edge' };
  if (p.presence === 'onlyInB') return { label: 'Only in B (added)', tone: 'edge' };
  if (!p.textDiffers && !p.visuallyDiffers) return { label: 'Identical', tone: 'same' };
  if (p.textDiffers && p.visuallyDiffers) return { label: 'Text and visual differences', tone: 'diff' };
  if (p.textDiffers) return { label: 'Text differs', tone: 'diff' };
  return { label: 'Visual differences', tone: 'diff' };
}

function buildReport(fileNameA: string, fileNameB: string, result: { pageCountA: number; pageCountB: number; pages: PageComparison[] }): string {
  const lines = [
    `Compared: ${fileNameA} (${result.pageCountA} pages) vs ${fileNameB} (${result.pageCountB} pages)`,
    '',
  ];
  for (const p of result.pages) {
    const { label } = describe(p);
    const ratio = p.presence === 'both' && p.pixelDiffRatio !== undefined
      ? ` (${(p.pixelDiffRatio * 100).toFixed(1)}% of pixels)`
      : '';
    lines.push(`Page ${p.page}: ${label}${ratio}`);
  }
  return lines.join('\n');
}

export const CompareTool = () => {
  const [filesA, setFilesA] = useState<File[]>([]);
  const [filesB, setFilesB] = useState<File[]>([]);
  const [passwordA, setPasswordA] = useState('');
  const [passwordB, setPasswordB] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ pageCountA: number; pageCountB: number; pages: PageComparison[] } | null>(null);
  const [diffsOnly, setDiffsOnly] = useState(false);
  const { toast } = useToast();
  const fileA = filesA[0] ?? null;
  const fileB = filesB[0] ?? null;

  const handleCompare = async () => {
    if (!fileA || !fileB) {
      toast({ title: 'Two files needed', description: 'Select a PDF for both A and B.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setProgress(null);
    setResult(null);
    try {
      const compared = await comparePdfs(fileA, fileB, {
        passwordA,
        passwordB,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(compared);
      const diffCount = compared.pages.filter((p) => p.presence !== 'both' || p.textDiffers || p.visuallyDiffers).length;
      toast({
        title: 'Compared',
        description: diffCount === 0
          ? 'Every shared page is identical, and both files have the same page count.'
          : `${diffCount} of ${compared.pages.length} page${compared.pages.length === 1 ? '' : 's'} differ.`,
      });
    } catch (error) {
      reportToolError(toast, 'Error comparing PDFs', error);
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleDownloadReport = () => {
    if (!result || !fileA || !fileB) return;
    const report = buildReport(fileA.name, fileB.name, result);
    downloadBlob(new Blob([report], { type: 'text/plain' }), derivedName(fileA.name, '_vs_' + fileB.name.replace(/\.pdf$/i, ''), 'txt'));
  };

  const visiblePages = result ? (diffsOnly ? result.pages.filter((p) => p.presence !== 'both' || p.textDiffers || p.visuallyDiffers) : result.pages) : [];

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Compare PDFs</h2>
      <p className="text-sm text-muted-foreground">
        Find out what changed between two versions of a document — page by page, both what the
        text says and what the page looks like. Read-only: nothing is modified, and no PDF is
        produced, just a report of what differs.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <FilePicker
            files={filesA}
            onChange={setFilesA}
            accept=".pdf"
            label="PDF A"
            onValidate={assertPdfFile}
            onReject={(error) => reportToolError(toast, 'Invalid file', error)}
          />
          <Label htmlFor="password-a">Password (if encrypted)</Label>
          <Input id="password-a" type="password" value={passwordA} onChange={(e) => setPasswordA(e.target.value)} />
        </div>
        <div className="space-y-2">
          <FilePicker
            files={filesB}
            onChange={setFilesB}
            accept=".pdf"
            label="PDF B"
            onValidate={assertPdfFile}
            onReject={(error) => reportToolError(toast, 'Invalid file', error)}
          />
          <Label htmlFor="password-b">Password (if encrypted)</Label>
          <Input id="password-b" type="password" value={passwordB} onChange={(e) => setPasswordB(e.target.value)} />
        </div>
      </div>

      {progress && (
        <p className="text-sm text-muted-foreground" role="status">
          Comparing… {Math.round((progress.done / progress.total) * 100)}%
        </p>
      )}

      <Button onClick={handleCompare} disabled={isLoading}>
        {isLoading ? 'Comparing…' : 'Compare'}
      </Button>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              A: {result.pageCountA} page{result.pageCountA === 1 ? '' : 's'} · B: {result.pageCountB} page
              {result.pageCountB === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  id="diffs-only"
                  type="checkbox"
                  checked={diffsOnly}
                  onChange={(e) => setDiffsOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="diffs-only" className="mb-0">Show only differences</Label>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleDownloadReport}>
                Download report
              </Button>
            </div>
          </div>

          <ul className="space-y-1 max-h-96 overflow-y-auto">
            {visiblePages.map((p) => {
              const { label, tone } = describe(p);
              const ratio = p.presence === 'both' && p.pixelDiffRatio !== undefined
                ? ` — ${(p.pixelDiffRatio * 100).toFixed(1)}% of pixels`
                : '';
              return (
                <li
                  key={p.page}
                  className={
                    'text-sm rounded px-3 py-1.5 border ' +
                    (tone === 'same'
                      ? 'border-glass-border text-muted-foreground'
                      : tone === 'diff'
                        ? 'border-destructive/50 text-destructive-foreground bg-destructive/10'
                        : 'border-primary/50 bg-primary/10')
                  }
                >
                  Page {p.page}: {label}
                  {ratio}
                </li>
              );
            })}
            {visiblePages.length === 0 && (
              <li className="text-sm text-muted-foreground">No differences to show.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
