'use client';

import { useEffect, useRef, useState } from 'react';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfJsPromise: Promise<PdfJsModule> | null = null;
const documentCache = new WeakMap<File, ReturnType<PdfJsModule['getDocument']>['promise']>();

function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((module) => {
      module.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return module;
    });
  }
  return pdfJsPromise;
}

async function getPdfDocument(file: File) {
  const cached = documentCache.get(file);
  if (cached) return cached;

  const promise = loadPdfJs().then(async (pdfJs) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return pdfJs.getDocument({ data: bytes }).promise;
  });
  documentCache.set(file, promise);
  return promise;
}

export function PdfPageThumbnail({
  file,
  pageNumber,
  rotation = 0,
  alt,
  className = ''
}: {
  file: File;
  pageNumber: number;
  rotation?: 0 | 90 | 180 | 270;
  alt: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'waiting' | 'loading' | 'ready' | 'error'>('waiting');

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const render = async () => {
      setStatus('loading');
      try {
        const pdf = await getPdfDocument(file);
        if (cancelled) return;

        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const availableWidth = Math.max(120, frame.clientWidth || 180);
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const scale = Math.min(1.5, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale, rotation });
        const outputScale = Math.min(2, window.devicePixelRatio || 1);

        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;

        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable.');
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
        });
        await renderTask.promise;
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      void render();
      return () => {
        cancelled = true;
        renderTask?.cancel();
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void render();
      },
      { rootMargin: '280px 0px' }
    );
    observer.observe(frame);

    return () => {
      cancelled = true;
      observer.disconnect();
      renderTask?.cancel();
    };
  }, [file, pageNumber, rotation]);

  return (
    <div
      ref={frameRef}
      className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden bg-white ${className}`}
      role="img"
      aria-label={alt}
    >
      <canvas ref={canvasRef} aria-hidden="true" className={`max-h-full max-w-full ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`} />
      {status !== 'ready' && (
        <span className="absolute inset-0 grid place-items-center px-3 text-center text-[11px] font-semibold text-slate-500">
          {status === 'error' ? 'Preview unavailable' : status === 'loading' ? 'Rendering page...' : 'Page preview'}
        </span>
      )}
    </div>
  );
}
