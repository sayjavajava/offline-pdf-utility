import { useState } from 'react';
import { addWatermark } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const AddWatermarkTool = () => {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(50);
  const [opacity, setOpacity] = useState(0.5);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleAddWatermark = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await addWatermark(file, text, { fontSize, color: [1, 0, 0], opacity }, password);
      downloadBlob(blob, derivedName(file.name, '_watermarked'));
      toast({ title: 'Success!', description: 'Watermark added to your PDF.' });
    } catch (error) {
      reportToolError(toast, 'Error adding watermark', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-white">
      <h2 className="text-2xl font-bold">Add Watermark</h2>
      <p className="text-sm text-gray-400">Apply a text watermark to each page of your PDF.</p>
      <div>
        <Label htmlFor="file">PDF File</Label>
        <Input id="file" type="file" onChange={handleFileChange} accept=".pdf" />
        {file && <p className="text-sm text-gray-400 mt-2">Selected file: {file.name}</p>}
      </div>
      <div>
        <Label htmlFor="text">Watermark Text</Label>
        <Input id="text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="fontSize">Font Size</Label>
        <Input id="fontSize" type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
      </div>
      <div>
        <Label htmlFor="opacity">Opacity</Label>
        <Input id="opacity" type="number" min="0" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
      </div>
      <div>
        <Label htmlFor="password">PDF Password (if protected)</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button onClick={handleAddWatermark} disabled={isLoading}>
        {isLoading ? 'Adding Watermark...' : 'Add Watermark'}
      </Button>
    </div>
  );
};
