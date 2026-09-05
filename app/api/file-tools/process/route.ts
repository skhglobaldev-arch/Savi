import { NextResponse } from 'next/server';
import { PDFDocument, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import path from 'node:path';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import {
  binaryResponse,
  getPdfPageCount,
  parsePageRange,
  runCommand,
  sanitizeFileName,
  withTempDir,
  writeFormFile
} from '@/lib/pdf/serverTools';

export const runtime = 'nodejs';

type PdfAction = 'merge_pdf' | 'organize_pdf' | 'split_pdf' | 'pdf_to_jpg' | 'extract_images';

type PagePlanItem = {
  pageNumber: number;
  rotation?: number;
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 25;

function isPdfFile(value: FormDataEntryValue): value is File {
  return value instanceof File && value.type === 'application/pdf';
}

function readAction(value: FormDataEntryValue | null): PdfAction | null {
  if (typeof value !== 'string') return null;
  if (['merge_pdf', 'organize_pdf', 'split_pdf', 'pdf_to_jpg', 'extract_images'].includes(value)) {
    return value as PdfAction;
  }
  return null;
}

function readPagePlan(value: FormDataEntryValue | null): PagePlanItem[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        pageNumber: Number(item.pageNumber),
        rotation: Number(item.rotation || 0)
      }))
      .filter((item) => Number.isInteger(item.pageNumber) && item.pageNumber > 0);
  } catch {
    return [];
  }
}

function readSwapPages(value: FormDataEntryValue | null): [number, number] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 2) return null;
    const first = Number(parsed[0]);
    const second = Number(parsed[1]);
    if (Number.isInteger(first) && Number.isInteger(second) && first > 0 && second > 0 && first !== second) {
      return [first, second];
    }
  } catch {
    return null;
  }

  return null;
}

function normaliseRotation(rotation = 0) {
  const next = ((rotation % 360) + 360) % 360;
  return [0, 90, 180, 270].includes(next) ? next : 0;
}

async function createMergedPdf(files: File[]) {
  const output = await PDFDocument.create();

  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const copiedPages = await output.copyPages(source, source.getPageIndices());
    copiedPages.forEach((page) => output.addPage(page));
  }

  return Buffer.from(await output.save());
}

async function createPagePlanPdf(file: File, pagePlan: PagePlanItem[], mode: 'organize' | 'split', swapPages?: [number, number] | null) {
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const output = await PDFDocument.create();
  const pageCount = source.getPageCount();
  let safePlan = pagePlan.filter((item) => item.pageNumber >= 1 && item.pageNumber <= pageCount);

  if (!safePlan.length && mode === 'organize') {
    safePlan = Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      rotation: 0
    }));
  }

  if (mode === 'organize' && swapPages) {
    const [first, second] = swapPages;
    if (first > pageCount || second > pageCount) {
      throw new Error(`This PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}. Choose pages within that range.`);
    }

    const firstIndex = safePlan.findIndex((item) => item.pageNumber === first);
    const secondIndex = safePlan.findIndex((item) => item.pageNumber === second);
    if (firstIndex >= 0 && secondIndex >= 0) {
      [safePlan[firstIndex], safePlan[secondIndex]] = [safePlan[secondIndex], safePlan[firstIndex]];
    }
  }

  if (!safePlan.length) {
    throw new Error(mode === 'split' ? 'Select at least one page to export.' : 'No pages are available to export.');
  }

  for (const item of safePlan) {
    const [copiedPage] = await output.copyPages(source, [item.pageNumber - 1]);
    copiedPage.setRotation(degrees(normaliseRotation(item.rotation)));
    output.addPage(copiedPage);
  }

  return Buffer.from(await output.save());
}

async function createJpgZip(file: File, pageRange: string | null) {
  return withTempDir('savi-pdf-jpg-', async (dir) => {
    const inputPath = path.join(dir, `${sanitizeFileName(file.name)}.pdf`);
    await writeFormFile(file, inputPath);

    const pageCount = await getPdfPageCount(inputPath);
    const pages = parsePageRange(pageRange, pageCount);
    if (!pages.length) {
      throw new Error('Select at least one PDF page.');
    }

    const zip = new JSZip();
    const outDir = path.join(dir, 'jpg');
    await mkdir(outDir);

    for (const page of pages) {
      const prefix = path.join(outDir, `page-${String(page).padStart(3, '0')}`);
      await runCommand('pdftoppm', ['-jpeg', '-r', '180', '-f', String(page), '-l', String(page), inputPath, prefix]);

      const produced = (await readdir(outDir))
        .filter((name) => name.startsWith(`page-${String(page).padStart(3, '0')}-`) && name.endsWith('.jpg'))
        .sort()
        .at(0);

      if (produced) {
        zip.file(`savi-page-${String(page).padStart(3, '0')}.jpg`, await readFile(path.join(outDir, produced)));
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return binaryResponse(zipBuffer, `${sanitizeFileName(file.name)}-jpg-pages.zip`, 'application/zip');
  });
}

async function createExtractedImagesZip(file: File) {
  return withTempDir('savi-pdf-images-', async (dir) => {
    const inputPath = path.join(dir, `${sanitizeFileName(file.name)}.pdf`);
    await writeFormFile(file, inputPath);

    const prefix = path.join(dir, 'extracted-image');
    await runCommand('pdfimages', ['-j', inputPath, prefix]);

    const imageFiles = (await readdir(dir))
      .filter((name) => name.startsWith('extracted-image-'))
      .filter((name) => /\.(jpg|jpeg|png|ppm|pbm)$/i.test(name))
      .sort();

    if (!imageFiles.length) {
      return NextResponse.json({ error: 'No embedded images were found in this PDF.' }, { status: 422 });
    }

    const zip = new JSZip();
    for (let index = 0; index < imageFiles.length; index += 1) {
      const name = imageFiles[index];
      const extension = path.extname(name).replace('.', '') || 'jpg';
      zip.file(`savi-extracted-image-${String(index + 1).padStart(3, '0')}.${extension}`, await readFile(path.join(dir, name)));
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return binaryResponse(zipBuffer, `${sanitizeFileName(file.name)}-images.zip`, 'application/zip');
  });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const action = readAction(form.get('action'));

    if (!action) {
      return NextResponse.json({ error: 'Choose a valid PDF tool.' }, { status: 400 });
    }

    const files = form.getAll('files').filter(isPdfFile);
    if (!files.length) {
      return NextResponse.json({ error: 'Upload at least one PDF file.' }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `You can process up to ${MAX_FILES} PDFs at once.` }, { status: 400 });
    }

    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      return NextResponse.json({ error: 'One of the PDFs is too large. Please use files under 100MB.' }, { status: 413 });
    }

    if (action === 'merge_pdf') {
      if (files.length < 2) {
        return NextResponse.json({ error: 'Upload at least two PDFs to merge.' }, { status: 400 });
      }

      const merged = await createMergedPdf(files);
      return binaryResponse(merged, 'savi-merged.pdf', 'application/pdf');
    }

    const [file] = files;

    if (action === 'organize_pdf' || action === 'split_pdf') {
      const pagePlan = readPagePlan(form.get('pagePlan'));
      const swapPages = readSwapPages(form.get('swapPages'));
      const output = await createPagePlanPdf(file, pagePlan, action === 'split_pdf' ? 'split' : 'organize', swapPages);
      const suffix = action === 'split_pdf' ? 'selected-pages' : 'organized';
      return binaryResponse(output, `${sanitizeFileName(file.name)}-${suffix}.pdf`, 'application/pdf');
    }

    if (action === 'pdf_to_jpg') {
      return createJpgZip(file, typeof form.get('pages') === 'string' ? String(form.get('pages')) : 'all');
    }

    if (action === 'extract_images') {
      return createExtractedImagesZip(file);
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF processing failed.';
    console.error('PDF processing failed', error);
    return NextResponse.json({ error: message || 'PDF processing failed.' }, { status: 500 });
  }
}
