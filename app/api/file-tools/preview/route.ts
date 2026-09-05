import { NextResponse } from 'next/server';
import path from 'node:path';
import { renderPdfThumbnails, sanitizeFileName, withTempDir, writeFormFile } from '@/lib/pdf/serverTools';

export const runtime = 'nodejs';

const MAX_PREVIEW_PAGES = 80;
const MAX_FILE_SIZE = 80 * 1024 * 1024;

function isPdfFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.type === 'application/pdf';
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const requestedMaxPages = Number(form.get('maxPages') ?? MAX_PREVIEW_PAGES);
    const maxPages = Math.min(Math.max(requestedMaxPages || MAX_PREVIEW_PAGES, 1), MAX_PREVIEW_PAGES);

    if (!isPdfFile(file)) {
      return NextResponse.json({ error: 'Please upload a valid PDF file.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'This PDF is too large for preview right now. Please use a file under 80MB.' }, { status: 413 });
    }

    return await withTempDir('savi-pdf-preview-', async (dir) => {
      const inputPath = path.join(dir, `${sanitizeFileName(file.name)}.pdf`);
      await writeFormFile(file, inputPath);
      const preview = await renderPdfThumbnails(inputPath, dir, maxPages);

      if (!preview.pages.length) {
        return NextResponse.json({ error: 'Could not render this PDF preview.' }, { status: 422 });
      }

      return NextResponse.json({
        fileName: file.name,
        size: file.size,
        pageCount: preview.pageCount,
        renderedPages: preview.pages.length,
        pages: preview.pages
      });
    });
  } catch (error) {
    console.error('PDF preview failed', error);
    return NextResponse.json({ error: 'Preview failed. Please try another PDF.' }, { status: 500 });
  }
}
