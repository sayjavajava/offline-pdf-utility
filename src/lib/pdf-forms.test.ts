/**
 * F-25: pdf-forms.ts.
 *
 * `@cantoo/pdf-lib` works fine under Node/jsdom for AcroForm creation and
 * reading (no canvas/DOM involved, unlike `pdf-render.ts`/`pdf-search.ts`'s
 * `TextLayer` path), so these fixtures are real PDFs with real form fields
 * built via the same library this feature reads, not mocked or hand-crafted
 * byte strings.
 */
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { readFormFields, applyFormFieldValues, type FormFieldValues } from './pdf-forms';

async function buildFormFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();

  const name = form.createTextField('applicant.name');
  name.setText('Jane Doe');
  name.addToPage(page, { font, x: 20, y: 350, width: 200, height: 20 });

  const notes = form.createTextField('applicant.notes');
  notes.addToPage(page, { font, x: 20, y: 320, width: 200, height: 20 });

  const subscribe = form.createCheckBox('subscribe');
  subscribe.addToPage(page, { x: 20, y: 290, width: 20, height: 20 });

  const country = form.createDropdown('country');
  country.addOptions(['USA', 'Canada', 'Mexico']);
  country.select('Canada');
  country.addToPage(page, { font, x: 20, y: 260, width: 200, height: 20 });

  const plan = form.createRadioGroup('plan');
  plan.addOptionToPage('basic', page, { x: 20, y: 230 });
  plan.addOptionToPage('pro', page, { x: 60, y: 230 });

  const readOnlyField = form.createTextField('locked');
  readOnlyField.setText('cannot edit');
  readOnlyField.enableReadOnly();
  readOnlyField.addToPage(page, { font, x: 20, y: 200, width: 200, height: 20 });

  return doc;
}

describe('readFormFields (F-25)', () => {
  it('reads every supported field type with its current value', async () => {
    const doc = await buildFormFixture();
    const { fields, unsupportedFields } = readFormFields(doc.getForm());

    expect(unsupportedFields).toEqual([]);

    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName['applicant.name']).toMatchObject({ type: 'text', value: 'Jane Doe', readOnly: false });
    expect(byName['applicant.notes']).toMatchObject({ type: 'text', value: '', readOnly: false });
    expect(byName['subscribe']).toMatchObject({ type: 'checkbox', value: false, readOnly: false });
    expect(byName['country']).toMatchObject({
      type: 'dropdown',
      value: 'Canada',
      options: ['USA', 'Canada', 'Mexico'],
      readOnly: false,
    });
    expect(byName['plan']).toMatchObject({ type: 'radio', value: '', options: ['basic', 'pro'], readOnly: false });
    expect(byName['locked']).toMatchObject({ type: 'text', value: 'cannot edit', readOnly: true });
  });

  it('reports an empty result for a PDF with no form fields', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const { fields, unsupportedFields } = readFormFields(doc.getForm());
    expect(fields).toEqual([]);
    expect(unsupportedFields).toEqual([]);
  });

  it('reports a button field as unsupported rather than crashing or silently dropping it', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const form = doc.getForm();
    const button = form.createButton('submit');
    button.addToPage('Submit', page, { font, x: 20, y: 20, width: 60, height: 20 });

    const { fields, unsupportedFields } = readFormFields(form);
    expect(fields).toEqual([]);
    expect(unsupportedFields).toEqual(['submit']);
  });

  it('reports an empty rich-text field as unsupported instead of failing the whole read', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const form = doc.getForm();
    const plain = form.createTextField('plain');
    plain.addToPage(page, { x: 20, y: 140, width: 100, height: 20 });
    const rich = form.createTextField('rich');
    rich.addToPage(page, { x: 20, y: 100, width: 100, height: 20 });
    rich.enableRichFormatting();
    // Through a real save/load: that is the shape a user's file arrives in.
    const reloaded = (await PDFDocument.load(await doc.save())).getForm();

    // pdf-lib's own getText() throws RichTextFieldReadError for this field,
    // which used to fail "Load fields" for every field in the document.
    const { fields, unsupportedFields } = readFormFields(reloaded);
    expect(fields.map((f) => f.name)).toEqual(['plain']);
    expect(unsupportedFields).toEqual(['rich']);
  });
});

/** What FillFormTool sends when the user changes nothing: every field's
 *  value exactly as `readFormFields` reported it. */
function untouchedValues(form: ReturnType<PDFDocument['getForm']>): FormFieldValues {
  return Object.fromEntries(readFormFields(form).fields.map((f) => [f.name, f.value]));
}

describe('fields the tool cannot represent are left untouched', () => {
  it('keeps every selection of a multi-select dropdown the user never touched', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const langs = doc.getForm().createDropdown('langs');
    langs.addOptions(['en', 'fr', 'de']);
    langs.enableMultiselect();
    langs.select(['en', 'de']);
    langs.addToPage(page, { x: 20, y: 100, width: 100, height: 20 });
    const form = (await PDFDocument.load(await doc.save())).getForm();

    expect(readFormFields(form).unsupportedFields).toEqual(['langs']);
    applyFormFieldValues(form, untouchedValues(form));
    // Used to come back as ['en']: the UI holds one value per dropdown.
    expect(form.getDropdown('langs').getSelected()).toEqual(['en', 'de']);
  });

  it('does not rewrite a rich-text field, even if a caller passes a value for it', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const rich = doc.getForm().createTextField('rich');
    rich.setText('styled');
    rich.addToPage(page, { x: 20, y: 100, width: 100, height: 20 });
    rich.enableRichFormatting();
    const form = (await PDFDocument.load(await doc.save())).getForm();

    applyFormFieldValues(form, { rich: 'replaced' });
    expect(form.getTextField('rich').isRichFormatted()).toBe(true);
    expect(form.getTextField('rich').getText()).toBe('styled');
  });

  it('still flattens a form that contains them', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const form = doc.getForm();
    const rich = form.createTextField('rich');
    rich.addToPage(page, { x: 20, y: 140, width: 100, height: 20 });
    rich.enableRichFormatting();
    const langs = form.createDropdown('langs');
    langs.addOptions(['en', 'de']);
    langs.enableMultiselect();
    langs.addToPage(page, { x: 20, y: 100, width: 100, height: 20 });
    const reloaded = await PDFDocument.load(await doc.save());

    applyFormFieldValues(reloaded.getForm(), untouchedValues(reloaded.getForm()));
    reloaded.getForm().flatten();
    const flattened = await PDFDocument.load(await reloaded.save());
    expect(flattened.getForm().getFields()).toEqual([]);
  });
});

describe('applyFormFieldValues (F-25)', () => {
  it('sets text, checkbox, dropdown, and radio values by field name', async () => {
    const doc = await buildFormFixture();
    const form = doc.getForm();

    applyFormFieldValues(form, {
      'applicant.name': 'John Smith',
      'applicant.notes': 'VIP',
      subscribe: true,
      country: 'USA',
      plan: 'pro',
    });

    const { fields } = readFormFields(form);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName['applicant.name'].value).toBe('John Smith');
    expect(byName['applicant.notes'].value).toBe('VIP');
    expect(byName['subscribe'].value).toBe(true);
    expect(byName['country'].value).toBe('USA');
    expect(byName['plan'].value).toBe('pro');
  });

  it('ignores values for field names that do not exist, without throwing', async () => {
    const doc = await buildFormFixture();
    const form = doc.getForm();
    expect(() => applyFormFieldValues(form, { 'no.such.field': 'x' })).not.toThrow();
  });

  it('unchecks a checkbox when set to false', async () => {
    const doc = await buildFormFixture();
    const form = doc.getForm();
    applyFormFieldValues(form, { subscribe: true });
    applyFormFieldValues(form, { subscribe: false });
    const { fields } = readFormFields(form);
    expect(fields.find((f) => f.name === 'subscribe')?.value).toBe(false);
  });

  it('clears a radio group when set to an empty string', async () => {
    const doc = await buildFormFixture();
    const form = doc.getForm();
    applyFormFieldValues(form, { plan: 'basic' });
    applyFormFieldValues(form, { plan: '' });
    const { fields } = readFormFields(form);
    expect(fields.find((f) => f.name === 'plan')?.value).toBe('');
  });

  it('round-trips through a real save/load cycle', async () => {
    const doc = await buildFormFixture();
    applyFormFieldValues(doc.getForm(), { 'applicant.name': 'Round Trip', subscribe: true, country: 'Mexico' });

    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    const { fields } = readFormFields(reloaded.getForm());
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName['applicant.name'].value).toBe('Round Trip');
    expect(byName['subscribe'].value).toBe(true);
    expect(byName['country'].value).toBe('Mexico');
  });
});
