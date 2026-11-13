import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let pages = [];
let destroyed = 0;
let terminated = 0;
let workerStarts = 0;
let workerError = false;
let ocrText = '';
const globalWorkerOptions = {};
const pdfMock = {
  GlobalWorkerOptions: globalWorkerOptions,
  getDocument: () => ({
    promise: Promise.resolve({ numPages: pages.length, getPage: async number => pages[number - 1] }),
    destroy: async () => { destroyed++; },
  }),
};
mock.module('pdfjs-dist', {
  namedExports: pdfMock,
  exports: pdfMock,
});
const tesseractMock = {
  createWorker: async () => {
    workerStarts++;
    if (workerError) throw Error('OCR no disponible');
    return { recognize: async () => ({ data: { text: ocrText } }), terminate: async () => { terminated++; } };
  },
};
mock.module('tesseract.js', {
  namedExports: tesseractMock,
  exports: tesseractMock,
});
globalThis.document = { createElement: () => ({ getContext: () => ({}), width: 0, height: 0 }) };

const { importPdf, validatePdfFile, MAX_PDF_BYTES } = await import('../../lib/pdf-import.ts');
const valid = () => new File(['%PDF-1.7\ncontenido'], 'recetario.pdf', { type: 'application/pdf' });
const page = (text, width = 100) => ({
  getTextContent: async () => ({ items: text ? [{ str: text, hasEOL: true }] : [] }),
  getViewport: () => ({ width, height: 100 }),
  render: () => ({ promise: Promise.resolve() }),
  cleanup() {},
});

test('valida extensión, tamaño y cabecera antes de procesar', async () => {
  await assert.rejects(validatePdfFile(new File([], 'vacío.pdf')), /contenido/);
  await assert.rejects(validatePdfFile(new File(['%PDF-1.7'], 'imagen.png')), /extensión/);
  await assert.rejects(validatePdfFile(new File(['no es PDF'], 'incorrecto.pdf')), /cabecera/);
  await assert.rejects(validatePdfFile({ size: MAX_PDF_BYTES + 1 }), /20 MiB/);
  await validatePdfFile(valid());
});

test('extrae páginas con texto sin iniciar OCR y conserva identidad de documento', async () => {
  pages = [page('Una receta suficientemente larga para evitar el reconocimiento óptico.'), page('Otra receta suficientemente larga para conservar su texto original.')];
  workerStarts = destroyed = terminated = 0;
  const progress = [];
  const drafts = await importPdf(valid(), value => progress.push(value));
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map(d => d.method), ['text', 'text']);
  assert.equal(drafts[0].documentId, drafts[1].documentId);
  assert.deepEqual(drafts.map(d => d.page), [1, 2]);
  assert.equal(drafts[0].status, 'pending');
  assert.equal(globalWorkerOptions.workerSrc, '/api/pdf-worker');
  assert.equal(workerStarts, 0);
  assert.equal(destroyed, 1);
  assert.equal(progress.length, 2);
});

test('usa OCR para páginas sin texto, conserva páginas ilegibles y libera recursos', async () => {
  pages = [page(''), page('', 250000)]; workerError = false; ocrText = '  receta reconocida  ';
  workerStarts = destroyed = terminated = 0;
  const drafts = await importPdf(valid(), () => {});
  assert.equal(drafts[0].text, 'receta reconocida');
  assert.equal(drafts[0].method, 'ocr');
  assert.equal(drafts[1].method, 'unreadable');
  assert.equal(workerStarts, 1);
  assert.equal(terminated, 1);
  assert.equal(destroyed, 1);
});

test('si OCR no arranca no reintenta cada página y limita documentos grandes', async () => {
  pages = [page(''), page('')]; workerError = true; workerStarts = destroyed = terminated = 0;
  const drafts = await importPdf(valid(), () => {});
  assert.deepEqual(drafts.map(d => d.method), ['unreadable', 'unreadable']);
  assert.equal(workerStarts, 1);
  assert.equal(destroyed, 1);
  pages = Array.from({ length: 501 }, () => page(''));
  await assert.rejects(importPdf(valid(), () => {}), /500 páginas/);
  assert.equal(destroyed, 2);
});
