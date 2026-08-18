import { useState } from 'react';
import { diagnosePdf, type DiagnosePdfResult } from '@/lib/pdf-utils';
import { reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const STATUS_LABEL: Record<DiagnosePdfResult['status'], string> = {
  clean: 'No structural problems found',
  warnings: 'Readable, with minor issues',
  errors: 'Structural problems found',
};

export const DiagnoseTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DiagnosePdfResult | null>(null);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleDiagnose = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setResult(null);
    try {
      const outcome = await diagnosePdf(file, password);
      setResult(outcome);
      toast({ title: STATUS_LABEL[outcome.status] });
    } catch (error) {
      reportToolError(toast, 'Error diagnosing PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Diagnose PDF</h2>
      <p className="text-sm text-muted-foreground">
        Checks a PDF's structure and reports what it finds — a read-only inspection, not a repair.
        This only checks that the file is syntactically valid; it cannot detect every possible
        problem, and a clean result does not guarantee every page renders correctly in every reader.
      </p>
      <FilePicker
        files={files}
        onChange={(next) => {
          setFiles(next);
          setResult(null);
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
        <Label htmlFor="diagnose-password">Password (if encrypted)</Label>
        <Input
          id="diagnose-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button onClick={handleDiagnose} disabled={isLoading}>
        {isLoading ? 'Checking...' : 'Diagnose PDF'}
      </Button>

      {result && (
        <div className="space-y-2">
          <p className="font-medium">{STATUS_LABEL[result.status]}</p>
          <pre className="whitespace-pre-wrap rounded-md border border-input bg-muted p-3 text-xs text-foreground">
            {result.report}
          </pre>
        </div>
      )}
    </div>
  );
};
