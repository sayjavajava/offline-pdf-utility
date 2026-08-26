import { useState } from 'react';
import { getFormFields, fillFormFields, type FormFieldInfo, type FormFieldValues } from '@/lib/pdf-utils';
import { derivedName, downloadBlob, reportToolError } from '@/lib/download';
import { assertPdfFile, largeFileWarning } from '@/lib/file-validation';
import { FilePicker } from '@/components/FilePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export const FillFormTool = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [loadingFields, setLoadingFields] = useState(false);
  const [filling, setFilling] = useState(false);
  const [fields, setFields] = useState<FormFieldInfo[] | null>(null);
  const [unsupportedFields, setUnsupportedFields] = useState<string[]>([]);
  const [values, setValues] = useState<FormFieldValues>({});
  const [flatten, setFlatten] = useState(true);
  const { toast } = useToast();
  const file = files[0] ?? null;

  const handleLoadFields = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }

    setLoadingFields(true);
    try {
      const result = await getFormFields(file, password);
      setFields(result.fields);
      setUnsupportedFields(result.unsupportedFields);
      const initialValues: FormFieldValues = {};
      for (const field of result.fields) initialValues[field.name] = field.value;
      setValues(initialValues);
    } catch (error) {
      reportToolError(toast, 'Error reading form fields', error);
    } finally {
      setLoadingFields(false);
    }
  };

  const handleFill = async () => {
    if (!file) return;

    setFilling(true);
    try {
      const blob = await fillFormFields(file, values, { flatten, password });
      downloadBlob(blob, derivedName(file.name, '_filled'));
      toast({ title: 'Success!', description: 'The form has been filled.' });
    } catch (error) {
      reportToolError(toast, 'Error filling form', error);
    } finally {
      setFilling(false);
    }
  };

  const handleBack = () => {
    setFields(null);
    setUnsupportedFields([]);
    setValues({});
  };

  return (
    <div className="space-y-4 text-foreground">
      <h2 className="text-2xl font-bold">Fill PDF Forms</h2>
      <p className="text-sm text-muted-foreground">
        Fill in a PDF's fillable fields — text boxes, checkboxes, dropdowns, and radio buttons — and download the
        result. Choose to flatten the form so it looks identical in every reader, or leave it editable so the
        fields can still be changed later.
      </p>

      {!fields ? (
        <>
          <FilePicker
            files={files}
            onChange={(next) => {
              setFiles(next);
              handleBack();
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
            <Label htmlFor="fill-password">Password (if encrypted)</Label>
            <Input
              id="fill-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button onClick={handleLoadFields} disabled={loadingFields}>
            {loadingFields ? 'Reading form fields...' : 'Load Form Fields'}
          </Button>
        </>
      ) : (
        <>
          <Button type="button" variant="outline" onClick={handleBack}>
            Choose a different file
          </Button>

          {fields.length === 0 && unsupportedFields.length === 0 && (
            <p className="text-sm text-muted-foreground">This PDF has no fillable form fields.</p>
          )}

          {unsupportedFields.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {unsupportedFields.length} field{unsupportedFields.length === 1 ? '' : 's'} in this PDF (
              {unsupportedFields.join(', ')}) {unsupportedFields.length === 1 ? 'is' : 'are'} a type this tool
              doesn't edit (buttons, option lists, or signature fields) and will be left as-is.
            </p>
          )}

          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.name}>
                {field.type === 'text' && (
                  <>
                    <Label htmlFor={`field-${field.name}`}>{field.name}</Label>
                    <Input
                      id={`field-${field.name}`}
                      value={typeof values[field.name] === 'string' ? (values[field.name] as string) : ''}
                      disabled={field.readOnly}
                      maxLength={field.maxLength}
                      onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    />
                  </>
                )}
                {field.type === 'checkbox' && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={values[field.name] === true}
                      disabled={field.readOnly}
                      onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.checked }))}
                    />
                    {field.name}
                  </label>
                )}
                {field.type === 'dropdown' && (
                  <>
                    <Label htmlFor={`field-${field.name}`}>{field.name}</Label>
                    <select
                      id={`field-${field.name}`}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={typeof values[field.name] === 'string' ? (values[field.name] as string) : ''}
                      disabled={field.readOnly}
                      onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    >
                      <option value="">(none)</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {field.type === 'radio' && (
                  <fieldset>
                    <legend className="text-sm font-medium mb-1">{field.name}</legend>
                    <div className="flex flex-wrap gap-4">
                      {field.options.map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`field-${field.name}`}
                            checked={values[field.name] === option}
                            disabled={field.readOnly}
                            onChange={() => setValues((prev) => ({ ...prev, [field.name]: option }))}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            ))}
          </div>

          {fields.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
              Flatten form after filling (looks the same in every reader; fields can no longer be edited)
            </label>
          )}

          <Button onClick={handleFill} disabled={filling}>
            {filling ? 'Filling...' : 'Fill & Download'}
          </Button>
        </>
      )}
    </div>
  );
};
