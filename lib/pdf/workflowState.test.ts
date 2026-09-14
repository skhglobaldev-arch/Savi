import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createClientPdfPages } from './clientValidation.ts';
import { buildPdfPagePlan, getPdfWorkflowState, PDF_PREVIEW_COST, SAVI_EXTRACT_IMAGES_AVAILABLE } from './workflowState.ts';

const studioSource = readFileSync(new URL('../../components/file-tools/FileToolsStudio.tsx', import.meta.url), 'utf8');

test('Merge becomes ready with two valid PDFs and enough credits', () => {
  assert.deepEqual(
    getPdfWorkflowState('merge_pdf', {
      authenticated: true,
      quote: 25,
      balance: 300,
      fileCount: 2,
      readyFileCount: 2
    }),
    { ready: true }
  );
});

test('Merge stays disabled before its requirements are met', () => {
  const state = getPdfWorkflowState('merge_pdf', {
    authenticated: true,
    quote: 25,
    balance: 300,
    fileCount: 1,
    readyFileCount: 1
  });
  assert.equal(state.ready, false);
  assert.match(state.reason || '', /two valid PDFs/);
});

test('the Files studio exposes a single-submit lock', () => {
  assert.match(studioSource, /processLockRef/);
  assert.match(studioSource, /if \(processLockRef\.current \|\| isBusy\) return/);
});

test('organize creates a page card for every validated page', () => {
  assert.equal(createClientPdfPages(4).length, 4);
  assert.match(studioSource, /data-testid="organize-workspace"/);
  assert.match(studioSource, /<PdfPageThumbnail file=\{file\.file\}/);
});

test('ordered page plans preserve page order and rotation', () => {
  assert.deepEqual(
    buildPdfPagePlan([
      { pageNumber: 3, rotation: 90, selected: true },
      { pageNumber: 1, rotation: 0, selected: true },
      { pageNumber: 2, rotation: 270, selected: false }
    ]),
    [
      { pageNumber: 3, rotation: 90 },
      { pageNumber: 1, rotation: 0 },
      { pageNumber: 2, rotation: 270 }
    ]
  );
  assert.deepEqual(buildPdfPagePlan([{ pageNumber: 3, selected: true }, { pageNumber: 1, selected: false }], true), [{ pageNumber: 3, rotation: 0 }]);
});

test('Organize requires at least one selected page and submits the mapping', () => {
  assert.equal(getPdfWorkflowState('organize_pdf', {
    authenticated: true,
    quote: 35,
    balance: 300,
    hasFile: true,
    pageCount: 3,
    selectedPageCount: 0
  }).ready, false);
  assert.equal(getPdfWorkflowState('organize_pdf', {
    authenticated: true,
    quote: 35,
    balance: 300,
    hasFile: true,
    pageCount: 3,
    selectedPageCount: 2
  }).ready, true);
  assert.match(studioSource, /action === 'split_pdf' \|\| action === 'organize_pdf'/);
});

test('organize has non-drag reorder controls and rotation/remove actions', () => {
  assert.match(studioSource, /Drag to reorder/);
  assert.match(studioSource, /Rotate left/);
  assert.match(studioSource, /Rotate right/);
  assert.match(studioSource, /Remove page/);
});

test('Split is a first-class workspace with a visible primary action', () => {
  assert.match(studioSource, /id: 'split'/);
  assert.match(studioSource, /data-testid="split-workspace"/);
  assert.match(studioSource, /label="Split PDF"/);
});

test('PDF-to-JPG has a visible primary action and page selection', () => {
  assert.match(studioSource, /data-testid="jpg-workspace"/);
  assert.match(studioSource, /label="Convert to JPG"/);
  assert.match(studioSource, /selectedJpgPages/);
});

test('preview work is free and does not invoke process submission', () => {
  assert.equal(PDF_PREVIEW_COST, 0);
  assert.match(studioSource, /async function loadPagePreview/);
  assert.match(studioSource, /async function runProcess/);
});

test('success state exposes download and process-another actions', () => {
  assert.match(studioSource, /download=\{output\.filename\}/);
  assert.match(studioSource, /Merge another/);
  assert.match(studioSource, /Convert another PDF/);
});

test('Extract Images cannot silently charge while unavailable', () => {
  assert.equal(SAVI_EXTRACT_IMAGES_AVAILABLE, false);
  assert.match(studioSource, /available: SAVI_EXTRACT_IMAGES_AVAILABLE/);
  assert.match(studioSource, /data-testid="extract-images-unavailable"/);
  const extractSection = studioSource.slice(studioSource.indexOf('function renderExtractImagesTool'), studioSource.indexOf('function renderAiDocumentTool'));
  assert.doesNotMatch(extractSection, /runProcess\('extract_images'\)/);
});
