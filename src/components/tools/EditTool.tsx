import { useState } from 'react';
import { editPdfMetadata } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const EditTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [metadata, setMetadata] = useState({ title: '', author: '', subject: '', keywords: '' });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleMetadataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setMetadata(prev => ({ ...prev, [id]: value }));
  };

  const handleEdit = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file to edit.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await editPdfMetadata(file, metadata, password);
      downloadBlob(blob, derivedName(file.name, '_edited'));
      toast({ title: 'Success!', description: 'The PDF metadata has been updated.' });
    } catch (error) {
      reportToolError(toast, 'Error editing PDF', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Edit PDF Metadata</h2>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={metadata.title} onChange={handleMetadataChange} />
        </div>
        <div>
          <Label htmlFor="author">Author</Label>
          <Input id="author" value={metadata.author} onChange={handleMetadataChange} />
        </div>
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" value={metadata.subject} onChange={handleMetadataChange} />
        </div>
        <div>
          <Label htmlFor="keywords">Keywords (comma-separated)</Label>
          <Input id="keywords" value={metadata.keywords} onChange={handleMetadataChange} />
        </div>
      </div>
      <div>
        <Label htmlFor="password">Password (if encrypted)</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button onClick={handleEdit} disabled={isLoading}>
        {isLoading ? 'Saving...' : 'Save Metadata'}
      </Button>
    </div>
  );
};
