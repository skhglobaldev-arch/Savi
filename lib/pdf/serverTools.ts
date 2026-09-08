import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type TempDirHandler<T> = (dir: string) => Promise<T>;

export async function withTempDir<T>(prefix: string, handler: TempDirHandler<T>) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    return await handler(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function resolveCommand(name: string) {
  const candidates = [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    name
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      if (candidate === name) return name;
    }
  }

  return name;
}

export async function runCommand(command: string, args: string[], cwd?: string) {
  return execFileAsync(await resolveCommand(command), args, {
    cwd,
    maxBuffer: 1024 * 1024 * 32,
    timeout: 120_000
  });
}

export function sanitizeFileName(name: string, fallback = 'savi-file') {
  const cleaned = name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return cleaned || fallback;
}

export async function writeFormFile(file: File, targetPath: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(targetPath, buffer);
  return buffer;
}

export async function getPdfPageCount(filePath: string) {
  try {
    const { stdout } = await runCommand('pdfinfo', [filePath]);
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

export async function renderPdfThumbnails(filePath: string, dir: string, maxPages: number) {
  const pageCount = await getPdfPageCount(filePath);
  const pagesToRender = Math.max(0, Math.min(pageCount || maxPages, maxPages));

  if (!pagesToRender) {
    return { pageCount, pages: [] as Array<{ pageNumber: number; thumbnail: string }> };
  }

  const prefix = path.join(dir, 'thumb');
  await runCommand('pdftoppm', ['-png', '-r', '84', '-f', '1', '-l', String(pagesToRender), filePath, prefix]);

  const files = (await readdir(dir))
    .filter((name) => /^thumb-\d+\.png$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)?.[0] ?? 0) - Number(right.match(/\d+/)?.[0] ?? 0));

  const pages = await Promise.all(
    files.map(async (name) => {
      const pageNumber = Number(name.match(/\d+/)?.[0] ?? 0);
      const bytes = await readFile(path.join(dir, name));
      return {
        pageNumber,
        thumbnail: `data:image/png;base64,${bytes.toString('base64')}`
      };
    })
  );

  return { pageCount, pages };
}

export function parsePageRange(input: string | null | undefined, pageCount: number) {
  const value = (input || 'all').trim().toLowerCase();
  if (!value || value === 'all') {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>();
  for (const chunk of value.split(',')) {
    const part = chunk.trim();
    if (!part) continue;

    if (part.includes('-')) {
      const [startRaw, endRaw] = part.split('-');
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      for (let page = Math.max(1, start); page <= Math.min(pageCount, end); page += 1) {
        pages.add(page);
      }
      continue;
    }

    const page = Number(part);
    if (Number.isInteger(page) && page >= 1 && page <= pageCount) {
      pages.add(page);
    }
  }

  return Array.from(pages).sort((left, right) => left - right);
}

export function binaryResponse(body: Buffer | Uint8Array, filename: string, contentType: string) {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
