/**
 * F-25: Fill PDF Forms.
 *
 * `@cantoo/pdf-lib`'s `PDFForm` already reads and writes AcroForm fields —
 * confirmed directly against the vendored library's own type declarations
 * and source (`PDFForm.getFields()`, `PDFTextField`, `PDFCheckBox`,
 * `PDFDropdown`, `PDFRadioGroup`), not assumed from a changelog summary.
 * This module is a thin, typed layer over that: read every field's current
 * value and shape into a plain object the UI can render generically (one
 * form control per field type, no per-PDF custom code), then apply back
 * whatever the user typed.
 *
 * Four field types are supported: text, checkbox, dropdown, radio. A real
 * PDF can also carry buttons, option lists, and signature fields — those are
 * reported in `unsupportedFields` rather than silently dropped or crashed
 * on, the same "disclose what we can't do" choice `ExtractTextTool` makes
 * for a scanned PDF's empty text layer and `CompareTool` makes for
 * differently-sized pages.
 */
import { PDFForm, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from '@cantoo/pdf-lib';

export type FormFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio';

export type FormFieldInfo =
  | { name: string; type: 'text'; value: string; readOnly: boolean; maxLength?: number }
  | { name: string; type: 'checkbox'; value: boolean; readOnly: boolean }
  | { name: string; type: 'dropdown'; value: string; options: string[]; readOnly: boolean }
  | { name: string; type: 'radio'; value: string; options: string[]; readOnly: boolean };

export type FormFieldsResult = {
  fields: FormFieldInfo[];
  /** Names of fields whose type this tool doesn't support editing (buttons,
   *  option lists, signatures) — present so they can be listed, not hidden. */
  unsupportedFields: string[];
};

/** Pure, no I/O — reads whatever `PDFForm` was already given. */
export function readFormFields(form: PDFForm): FormFieldsResult {
  const fields: FormFieldInfo[] = [];
  const unsupportedFields: string[] = [];

  for (const field of form.getFields()) {
    const name = field.getName();
    const readOnly = field.isReadOnly();

    if (field instanceof PDFTextField) {
      fields.push({ name, type: 'text', value: field.getText() ?? '', readOnly, maxLength: field.getMaxLength() });
    } else if (field instanceof PDFCheckBox) {
      fields.push({ name, type: 'checkbox', value: field.isChecked(), readOnly });
    } else if (field instanceof PDFDropdown) {
      fields.push({
        name,
        type: 'dropdown',
        value: field.getSelected()[0] ?? '',
        options: field.getOptions(),
        readOnly,
      });
    } else if (field instanceof PDFRadioGroup) {
      fields.push({
        name,
        type: 'radio',
        value: field.getSelected() ?? '',
        options: field.getOptions(),
        readOnly,
      });
    } else {
      unsupportedFields.push(name);
    }
  }

  return { fields, unsupportedFields };
}

export type FormFieldValues = Record<string, string | boolean>;

/** Pure, no I/O — applies `values` (by field name) onto `form` in place. */
export function applyFormFieldValues(form: PDFForm, values: FormFieldValues): void {
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values)) continue;
    const value = values[name];

    if (field instanceof PDFTextField && typeof value === 'string') {
      field.setText(value);
    } else if (field instanceof PDFCheckBox && typeof value === 'boolean') {
      if (value) field.check();
      else field.uncheck();
    } else if (field instanceof PDFDropdown && typeof value === 'string') {
      if (value !== '') field.select(value);
    } else if (field instanceof PDFRadioGroup && typeof value === 'string') {
      if (value !== '') field.select(value);
      else field.clear();
    }
  }
}
