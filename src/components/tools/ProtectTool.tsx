import { useState } from 'react';
import { protectPdf, protectPdfWithPermissions, type PdfPermissions } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const ProtectTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restrict, setRestrict] = useState(false);
  const [permissionsPassword, setPermissionsPassword] = useState('');
  const [print, setPrint] = useState<PdfPermissions['print']>('full');
  const [extract, setExtract] = useState(true);
  const [modify, setModify] = useState<PdfPermissions['modify']>('all');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleProtect = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', description: 'Re-enter the password to confirm it.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = restrict
        ? await protectPdfWithPermissions(file, password, permissionsPassword, { print, extract, modify })
        : await protectPdf(file, password);
      downloadBlob(blob, derivedName(file.name, '_protected'));
      toast({ title: 'Success!', description: 'Your PDF is now password protected.' });
    } catch (error) {
      reportToolError(toast, 'Error protecting PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Protect PDF</h2>
      <p className="text-sm text-muted-foreground">
        Adds a password to a PDF, so it can only be opened by someone who knows it. There is no
        way to recover a lost password — keep it somewhere safe.
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
        <Label htmlFor="password">{restrict ? 'Open password (leave blank to let anyone open it)' : 'Password'}</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="confirm-password">Confirm {restrict ? 'open password' : 'password'}</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} />
        Restrict printing, copying, or editing
      </label>

      {restrict && (
        <div className="space-y-4 rounded-md border border-input p-4">
          <p className="text-sm text-muted-foreground">
            PDF restrictions are enforced only for whoever opens the file with the open password
            above — a second, separate <strong>permissions password</strong> is needed to bypass
            them, so it must be different from the open password. This is an honor system followed
            by compliant PDF readers, not a hard security boundary: the content is still
            decryptable with the open password, so anyone with basic tooling can strip these
            restrictions. Use it to discourage casual copying or printing, not to protect secrets.
          </p>
          <div>
            <Label htmlFor="permissions-password">Permissions password (required, must differ from the open password)</Label>
            <Input
              id="permissions-password"
              type="password"
              value={permissionsPassword}
              onChange={(e) => setPermissionsPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="print-permission">Allow printing</Label>
            <select
              id="print-permission"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={print}
              onChange={(e) => setPrint(e.target.value as PdfPermissions['print'])}
            >
              <option value="full">Full quality</option>
              <option value="low">Low resolution only</option>
              <option value="none">Not allowed</option>
            </select>
          </div>
          <div>
            <Label htmlFor="modify-permission">Allow editing</Label>
            <select
              id="modify-permission"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={modify}
              onChange={(e) => setModify(e.target.value as PdfPermissions['modify'])}
            >
              <option value="all">Allowed</option>
              <option value="none">Not allowed</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={extract} onChange={(e) => setExtract(e.target.checked)} />
            Allow copying text and images
          </label>
        </div>
      )}

      <Button onClick={handleProtect} disabled={isLoading}>
        {isLoading ? 'Protecting...' : 'Protect PDF'}
      </Button>
    </div>
  );
};
