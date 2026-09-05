'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ToolPreview } from '@/components/ToolPreview';
import type { TemplateItem } from '@/lib/templates';
import { recordMediaItem } from '@/lib/mediaLibrary';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';

type FileToolId = 'merge' | 'organize' | 'jpg' | 'contract_summary' | 'explain_document' | 'translate_summary' | 'pdf_podcast';
type ConversionMode = 'pages' | 'images';
type OutputFile = { url: string; filename: string; label: string };

type PreviewPage = {
  pageNumber: number;
  thumbnail: string;
};

type PreviewResponse = {
  fileName: string;
  pageCount: number;
  renderedPages: number;
  pages: PreviewPage[];
  error?: string;
};

type PdfFileItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount?: number;
  thumbnail?: string;
  status: 'previewing' | 'ready' | 'error';
  error?: string;
};

type PageItem = {
  id: string;
  pageNumber: number;
  thumbnail: string;
  rotation: 0 | 90 | 180 | 270;
  selected: boolean;
};

const tools: Array<{
  id: FileToolId;
  title: string;
  description: string;
  promptPlaceholder: string;
  cost: number;
  group: 'PDF tools' | 'AI document';
}> = [
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Upload multiple PDFs, reorder them, then export one clean PDF.',
    promptPlaceholder: 'Example: Put the signed contract first, then the invoice, then the appendix. Keep the file name clear and ready to send.',
    cost: 25,
    group: 'PDF tools'
  },
  {
    id: 'organize',
    title: 'Organize pages',
    description: 'Preview pages, drag to reorder, rotate, remove, or export selected pages.',
    promptPlaceholder: 'Example: Swap page 1 and page 2, rotate page 3 clockwise, remove blank pages, then export one clean PDF.',
    cost: 35,
    group: 'PDF tools'
  },
  {
    id: 'jpg',
    title: 'PDF to JPG',
    description: 'Choose exact pages to convert or extract embedded images into a ZIP.',
    promptPlaceholder: 'Example: Convert pages 1, 3, and 4 to high-quality JPG files, or extract every embedded image into one ZIP.',
    cost: 45,
    group: 'PDF tools'
  },
  {
    id: 'contract_summary',
    title: 'Summarize this contract',
    description: 'Upload a contract and get key points, risks, obligations, and next actions.',
    promptPlaceholder: 'Example: Summarize this contract in plain language. Highlight payment terms, deadlines, cancellation terms, risks, and what I should check before signing.',
    cost: 5,
    group: 'AI document'
  },
  {
    id: 'explain_document',
    title: 'Explain this document simply',
    description: 'Upload a PDF and turn complicated content into beginner-friendly notes.',
    promptPlaceholder: 'Example: Explain this document like I am new to the topic. Tell me what it means, what matters, and what I should do next.',
    cost: 4,
    group: 'AI document'
  },
  {
    id: 'translate_summary',
    title: 'Translate PDF and summarize it',
    description: 'Upload a PDF, translate the main content, and get a clear summary.',
    promptPlaceholder: 'Example: Translate the important parts into Persian, then give me a short summary, key decisions, and any names, dates, or prices.',
    cost: 7,
    group: 'AI document'
  },
  {
    id: 'pdf_podcast',
    title: 'Turn PDF into podcast',
    description: 'Upload a PDF and create a radio-style podcast script from its key points.',
    promptPlaceholder: 'Example: Turn this PDF into a 2-minute radio podcast script with a warm intro, three clear talking points, and a practical ending.',
    cost: 8,
    group: 'AI document'
  }
];

const templateToFileTool: Record<string, FileToolId> = {
  'summarize-contract': 'contract_summary',
  'explain-document': 'explain_document',
  'translate-pdf': 'translate_summary',
  'pdf-to-podcast': 'pdf_podcast'
};

const aiDocumentTools = new Set<FileToolId>(['contract_summary', 'explain_document', 'translate_summary', 'pdf_podcast']);
const PODCAST_AUDIO_COST = 120;
const CLOSE_ACTIVE_TOOL_EVENT = 'savi-close-active-tool';

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function getDownloadName(response: Response, fallback: string) {
  const header = response.headers.get('Content-Disposition') || '';
  const match = header.match(/filename="([^"]+)"/);
  return match?.[1] || fallback;
}

function buildAiDocumentResult(toolId: FileToolId, fileName: string, prompt: string) {
  if (toolId === 'contract_summary') {
    return `Contract summary ready for: ${fileName}

Key points
- Plain-language overview of what the contract is about.
- Main parties, dates, responsibilities, and deliverables.
- Payment terms, renewal terms, and cancellation points.

Risks to check
- Unclear obligations or missing deadlines.
- Strong penalties, automatic renewal, or broad liability terms.
- Any clause that needs legal review before signing.

Next actions
1. Review the risky clauses.
2. Mark anything unclear.
3. Ask for changes before approval.

Instruction used:
${prompt}`;
  }

  if (toolId === 'explain_document') {
    return `Simple explanation ready for: ${fileName}

What this document is saying
- This section turns the document into simple everyday language.
- Complicated wording is broken into short points.
- Important ideas are separated from less important details.

Main ideas
1. What the document is about.
2. Why it matters.
3. What the reader should do next.

Beginner-friendly version
Imagine the document as a short guide. SAVI will explain the goal, the important parts, and the action steps without heavy wording.

Instruction used:
${prompt}`;
  }

  if (toolId === 'translate_summary') {
    return `Translation and summary ready for: ${fileName}

Translated summary
- The main message of the document is translated into clear, natural language.
- Important names, numbers, and dates are kept visible.
- The final summary is short enough to scan quickly.

Key takeaways
1. Main topic.
2. Important details.
3. Recommended next action.

Instruction used:
${prompt}`;
  }

  return `Podcast script ready for: ${fileName}

Intro
Welcome back to SAVI Radio. Today we are turning this document into a clear, useful audio segment.

Segment 1: What the document is about
The host explains the main topic in simple language and gives listeners the context they need.

Segment 2: Important points
The host covers the strongest takeaways, useful details, and anything that deserves extra attention.

Segment 3: Final recap
The episode closes with a short summary and practical next steps.

Instruction used:
${prompt}`;
}

async function previewPdf(file: File, maxPages: number) {
  const form = new FormData();
  form.append('file', file);
  form.append('maxPages', String(maxPages));

  const response = await fetch('/api/file-tools/preview', {
    method: 'POST',
    body: form
  });
  const data = (await response.json().catch(() => ({}))) as PreviewResponse;

  if (!response.ok) {
    throw new Error(data.error || 'Preview failed.');
  }

  return data;
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function UploadDropzone({
  title,
  description,
  multiple,
  busy,
  onFiles
}: {
  title: string;
  description: string;
  multiple?: boolean;
  busy?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOver, setIsOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const pdfs = Array.from(files || []).filter(isPdf);
    if (pdfs.length) onFiles(pdfs);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsOver(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={onDrop}
      className={`rounded-[30px] border border-dashed p-6 text-center transition ${
        isOver ? 'border-cyan-200 bg-cyan-300/10' : 'border-white/15 bg-black/25'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-white/15 bg-white/[0.06] text-3xl font-black">
        +
      </div>
      <h3 className="mt-4 text-xl font-black">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/55">{description}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-5 rounded-full bg-white px-6 py-3 text-sm font-black text-black transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Choose PDF{multiple ? 's' : ''}
      </button>
    </div>
  );
}

export function FileToolsStudio({
  credits,
  onCreditsChange,
  template,
  templateLaunchKey = 0
}: {
  credits: number;
  onCreditsChange: (credits: number) => void;
  template?: TemplateItem;
  templateLaunchKey?: number;
}) {
  const { user, isLoading: isAuthLoading, signIn } = useSaviAuth();
  const [activeTool, setActiveTool] = useState<FileToolId>('merge');
  const [isToolOpen, setIsToolOpen] = useState(false);
  const [mergeFiles, setMergeFiles] = useState<PdfFileItem[]>([]);
  const [pageFile, setPageFile] = useState<PdfFileItem | null>(null);
  const [pageItems, setPageItems] = useState<PageItem[]>([]);
  const [jpgFile, setJpgFile] = useState<PdfFileItem | null>(null);
  const [jpgPages, setJpgPages] = useState<PageItem[]>([]);
  const [aiFile, setAiFile] = useState<PdfFileItem | null>(null);
  const [aiPages, setAiPages] = useState<PreviewPage[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [podcastAudioUrl, setPodcastAudioUrl] = useState('');
  const [podcastAudioName, setPodcastAudioName] = useState('');
  const [podcastBusy, setPodcastBusy] = useState(false);
  const [conversionMode, setConversionMode] = useState<ConversionMode>('pages');
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null);
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [output, setOutput] = useState<OutputFile | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const workAreaRef = useRef<HTMLDivElement | null>(null);

  const selectedTool = tools.find((tool) => tool.id === activeTool) ?? tools[0];
  const selectedJpgPages = useMemo(() => jpgPages.filter((page) => page.selected), [jpgPages]);
  const selectedOrganizePages = useMemo(() => pageItems.filter((page) => page.selected), [pageItems]);
  const isBusy = Boolean(busyLabel);

  useEffect(() => {
    const closeActiveTool = () => {
      setIsToolOpen(false);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    };
    window.addEventListener(CLOSE_ACTIVE_TOOL_EVENT, closeActiveTool);
    return () => window.removeEventListener(CLOSE_ACTIVE_TOOL_EVENT, closeActiveTool);
  }, []);

  useEffect(() => {
    if (!template || templateLaunchKey === 0) return;
    const nextTool = templateToFileTool[template.id];
    if (!nextTool) return;

    selectFileTool(nextTool, template.prompt);
  }, [template, templateLaunchKey]);

  function clearOutput() {
    if (output?.url) URL.revokeObjectURL(output.url);
    setOutput(null);
  }

  function clearPodcastAudio() {
    setPodcastAudioUrl('');
    setPodcastAudioName('');
  }

  function clearFileInputs() {
    setMergeFiles([]);
    setPageFile(null);
    setPageItems([]);
    setJpgFile(null);
    setJpgPages([]);
    setAiFile(null);
    setAiPages([]);
    setAiPrompt('');
    setAiResult('');
    setConversionMode('pages');
    setDraggedFileIndex(null);
    setDraggedPageIndex(null);
    clearPodcastAudio();
  }

  function selectFileTool(nextTool: FileToolId, nextPrompt = '') {
    setActiveTool(nextTool);
    setIsToolOpen(true);
    clearFileInputs();
    setAiPrompt(nextPrompt);
    setBusyLabel('');
    setError('');
    clearOutput();
    window.requestAnimationFrame(() => workAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function chargeOrOpenUpgrade(cost: number) {
    if (credits < cost) {
      setShowUpgrade(true);
      return false;
    }
    return true;
  }

  async function addMergeFiles(files: File[]) {
    clearOutput();
    setError('');
    const items: PdfFileItem[] = files.map((file) => ({
      id: makeId(),
      file,
      name: file.name,
      size: file.size,
      status: 'previewing'
    }));
    setMergeFiles((current) => [...current, ...items]);

    await Promise.all(
      items.map(async (item) => {
        try {
          const preview = await previewPdf(item.file, 1);
          setMergeFiles((current) =>
            current.map((next) =>
              next.id === item.id
                ? { ...next, pageCount: preview.pageCount, thumbnail: preview.pages[0]?.thumbnail, status: 'ready' }
                : next
            )
          );
        } catch (previewError) {
          setMergeFiles((current) =>
            current.map((next) =>
              next.id === item.id
                ? { ...next, status: 'error', error: previewError instanceof Error ? previewError.message : 'Preview failed.' }
                : next
            )
          );
        }
      })
    );
  }

  async function loadPagePreview(file: File, mode: 'organize' | 'jpg') {
    clearOutput();
    setError('');
    const item: PdfFileItem = {
      id: makeId(),
      file,
      name: file.name,
      size: file.size,
      status: 'previewing'
    };

    if (mode === 'organize') {
      setPageFile(item);
      setPageItems([]);
    } else {
      setJpgFile(item);
      setJpgPages([]);
    }

    try {
      const preview = await previewPdf(file, 80);
      const readyItem = {
        ...item,
        pageCount: preview.pageCount,
        thumbnail: preview.pages[0]?.thumbnail,
        status: 'ready' as const
      };
      const pages = preview.pages.map((page) => ({
        id: `${item.id}-${page.pageNumber}`,
        pageNumber: page.pageNumber,
        thumbnail: page.thumbnail,
        rotation: 0 as const,
        selected: true
      }));

      if (mode === 'organize') {
        setPageFile(readyItem);
        setPageItems(pages);
      } else {
        setJpgFile(readyItem);
        setJpgPages(pages);
      }
    } catch (previewError) {
      const failedItem = {
        ...item,
        status: 'error' as const,
        error: previewError instanceof Error ? previewError.message : 'Preview failed.'
      };
      if (mode === 'organize') setPageFile(failedItem);
      else setJpgFile(failedItem);
    }
  }

  async function loadAiPdf(file: File) {
    clearOutput();
    setAiResult('');
    clearPodcastAudio();
    setError('');
    const item: PdfFileItem = {
      id: makeId(),
      file,
      name: file.name,
      size: file.size,
      status: 'previewing'
    };
    setAiFile(item);
    setAiPages([]);

    try {
      const preview = await previewPdf(file, 6);
      setAiFile({
        ...item,
        pageCount: preview.pageCount,
        thumbnail: preview.pages[0]?.thumbnail,
        status: 'ready'
      });
      setAiPages(preview.pages);
    } catch (previewError) {
      setAiFile({
        ...item,
        status: 'error',
        error: previewError instanceof Error ? previewError.message : 'Preview failed.'
      });
    }
  }

  async function runAiDocumentTool() {
    setError('');
    if (!aiFile || aiFile.status !== 'ready') {
      setError('Upload a PDF first.');
      return;
    }

    if (!chargeOrOpenUpgrade(selectedTool.cost)) return;
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    const finalPrompt = aiPrompt.trim() || selectedTool.description;
    clearPodcastAudio();
    setAiResult('');
    setBusyLabel('Reading PDF with SAVI...');

    try {
      const form = new FormData();
      form.append('file', aiFile.file);
      form.append('toolId', activeTool);
      form.append('prompt', finalPrompt);

      const response = await fetch('/api/file-tools/ai', {
        method: 'POST',
        body: form
      });
      const data = (await response.json().catch(() => ({}))) as { result?: string; error?: string };

      if (!response.ok || !data.result) {
        throw new Error(data.error || 'AI document tool failed.');
      }

      setAiResult(data.result);
      recordMediaItem({
        type: 'text',
        title: selectedTool.title,
        source: 'Files',
        filename: `savi-${activeTool}.txt`,
        text: data.result
      });
      onCreditsChange(credits - selectedTool.cost);
    } catch (documentError) {
      setError(documentError instanceof Error ? documentError.message : 'AI document tool failed.');
    } finally {
      setBusyLabel('');
    }
  }

  async function createRadioPodcastAudio() {
    if (!aiResult.trim()) {
      setError('Generate the podcast script first.');
      return;
    }

    if (!chargeOrOpenUpgrade(PODCAST_AUDIO_COST)) return;
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    setPodcastBusy(true);
    setError('');
    clearPodcastAudio();

    try {
      const response = await fetch('/api/voice/radio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          script: aiResult,
          voice: 'Puck',
          style: 'energetic, warm, radio podcast host'
        })
      });
      const data = (await response.json().catch(() => ({}))) as { audio?: string; filename?: string; error?: string };

      if (!response.ok || !data.audio) {
        throw new Error(data.error || 'Podcast audio generation failed.');
      }

      setPodcastAudioUrl(data.audio);
      setPodcastAudioName(data.filename || 'savi-radio-podcast.wav');
      recordMediaItem({
        type: 'audio',
        title: 'PDF radio podcast',
        source: 'Files',
        url: data.audio,
        filename: data.filename || 'savi-radio-podcast.wav',
        text: aiResult
      });
      onCreditsChange(credits - PODCAST_AUDIO_COST);
    } catch (podcastError) {
      setError(podcastError instanceof Error ? podcastError.message : 'Podcast audio generation failed.');
    } finally {
      setPodcastBusy(false);
    }
  }

  async function runProcess(action: 'merge_pdf' | 'organize_pdf' | 'split_pdf' | 'pdf_to_jpg' | 'extract_images') {
    if (!chargeOrOpenUpgrade(selectedTool.cost)) return;
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    clearOutput();
    setError('');
    setBusyLabel('Preparing files...');

    try {
      const form = new FormData();
      form.append('action', action);

      if (action === 'merge_pdf') {
        mergeFiles.filter((item) => item.status === 'ready').forEach((item) => form.append('files', item.file));
      }

      if (action === 'organize_pdf' || action === 'split_pdf') {
        if (!pageFile) throw new Error('Upload a PDF first.');
        const plan = (action === 'split_pdf' ? selectedOrganizePages : pageItems).map((page) => ({
          pageNumber: page.pageNumber,
          rotation: page.rotation
        }));
        form.append('files', pageFile.file);
        form.append('pagePlan', JSON.stringify(plan));
      }

      if (action === 'pdf_to_jpg' || action === 'extract_images') {
        if (!jpgFile) throw new Error('Upload a PDF first.');
        form.append('files', jpgFile.file);
        if (action === 'pdf_to_jpg') {
          form.append('pages', selectedJpgPages.map((page) => page.pageNumber).join(','));
        }
      }

      setBusyLabel(action === 'pdf_to_jpg' || action === 'extract_images' ? 'Building ZIP...' : 'Building PDF...');

      const response = await fetch('/api/file-tools/process', {
        method: 'POST',
        body: form
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'PDF tool failed.');
      }

      const blob = await response.blob();
      const filename = getDownloadName(response, action.includes('jpg') || action.includes('images') ? 'savi-output.zip' : 'savi-output.pdf');
      const url = URL.createObjectURL(blob);
      setOutput({
        url,
        filename,
        label: action === 'pdf_to_jpg' || action === 'extract_images' ? 'ZIP ready' : 'PDF ready'
      });
      recordMediaItem({
        type: action === 'pdf_to_jpg' || action === 'extract_images' ? 'zip' : 'pdf',
        title: action === 'pdf_to_jpg' || action === 'extract_images' ? 'PDF images ZIP' : selectedTool.title,
        source: 'Files',
        url,
        filename
      });
      onCreditsChange(credits - selectedTool.cost);
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : 'Something went wrong.');
    } finally {
      setBusyLabel('');
    }
  }

  function renderMergeTool() {
    return (
      <div className="space-y-5">
        <UploadDropzone
          title="Drop PDFs to merge"
          description="Add two or more PDF files. Drag the cards below to control the final order."
          multiple
          busy={isBusy}
          onFiles={addMergeFiles}
        />

        {mergeFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-white/60">{mergeFiles.length} PDF files</p>
              <button
                type="button"
                onClick={() => setMergeFiles([])}
                className="rounded-full border border-violet-100 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:text-violet-700"
              >
                Clear
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {mergeFiles.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggedFileIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedFileIndex === null) return;
                    setMergeFiles((current) => moveItem(current, draggedFileIndex, index));
                    setDraggedFileIndex(null);
                  }}
                  className="group flex cursor-grab gap-4 rounded-[24px] border border-white/10 bg-white/[0.045] p-3 active:cursor-grabbing"
                >
                  <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/35">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-white/35">PDF</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs font-black text-cyan-100/80">
                      <span className="rounded-full bg-white/10 px-2 py-1">#{index + 1}</span>
                      <span>{item.status === 'previewing' ? 'Reading...' : `${item.pageCount || 0} pages`}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-black text-slate-950">{item.name}</p>
                    <p className="mt-1 text-xs text-white/40">{fileSizeLabel(item.size)}</p>
                    {item.error && <p className="mt-2 text-xs text-red-200">{item.error}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMergeFiles((current) => current.filter((next) => next.id !== item.id))}
                    className="h-8 w-8 rounded-full border border-violet-100 bg-white text-slate-400 hover:text-violet-700"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <ActionBar
          cost={selectedTool.cost}
          credits={credits}
          disabled={isBusy || mergeFiles.filter((item) => item.status === 'ready').length < 2}
          loading={busyLabel}
          label="Merge PDFs"
          onClick={() => runProcess('merge_pdf')}
        />
      </div>
    );
  }

  function renderPageGrid(mode: 'organize' | 'jpg') {
    const items = mode === 'organize' ? pageItems : jpgPages;
    const file = mode === 'organize' ? pageFile : jpgFile;
    const setter = mode === 'organize' ? setPageItems : setJpgPages;

    if (!file) return null;

    if (file.status === 'previewing') {
      return <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-6 text-center text-white/55">Opening PDF pages...</div>;
    }

    if (file.status === 'error') {
      return <div className="rounded-[26px] border border-red-300/20 bg-red-400/10 p-6 text-center text-red-100">{file.error}</div>;
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <div>
            <p className="max-w-[260px] truncate text-sm font-black text-slate-950">{file.name}</p>
            <p className="mt-1 text-xs text-white/45">
              {file.pageCount} pages
              {items.length < (file.pageCount || 0) ? `, previewing first ${items.length}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setter((current) => current.map((page) => ({ ...page, selected: true })))} className="mini-tool-button">
              Select all
            </button>
            <button type="button" onClick={() => setter((current) => current.map((page) => ({ ...page, selected: false })))} className="mini-tool-button">
              Select none
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((page, index) => (
            <div
              key={page.id}
              draggable={mode === 'organize'}
              onDragStart={() => setDraggedPageIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedPageIndex === null || mode !== 'organize') return;
                setter((current) => moveItem(current, draggedPageIndex, index));
                setDraggedPageIndex(null);
              }}
              className={`rounded-[22px] border p-2 transition ${
                page.selected ? 'border-cyan-200/45 bg-cyan-300/10' : 'border-white/10 bg-white/[0.035] opacity-60'
              } ${mode === 'organize' ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              <button
                type="button"
                onClick={() => setter((current) => current.map((next) => (next.id === page.id ? { ...next, selected: !next.selected } : next)))}
                className="relative block w-full overflow-hidden rounded-2xl border border-white/10 bg-black/35"
              >
                <img
                  src={page.thumbnail}
                  alt={`Page ${page.pageNumber}`}
                  style={{ transform: `rotate(${page.rotation}deg)` }}
                  className="aspect-[3/4] w-full object-cover transition"
                />
                <span className="absolute left-2 top-2 rounded-full bg-slate-950 px-2 py-1 text-xs font-black text-white">
                  {page.pageNumber}
                </span>
                <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-slate-950 text-xs font-black text-white">
                  {page.selected ? '✓' : ''}
                </span>
              </button>
              {mode === 'organize' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setter((current) =>
                        current.map((next) =>
                          next.id === page.id ? { ...next, rotation: normaliseClientRotation(next.rotation + 90) } : next
                        )
                      )
                    }
                    className="mini-tool-button"
                  >
                    Rotate
                  </button>
                  <button
                    type="button"
                    onClick={() => setter((current) => current.filter((next) => next.id !== page.id))}
                    className="mini-tool-button"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderOrganizeTool() {
    return (
      <div className="space-y-5">
        <UploadDropzone
          title="Open a PDF"
          description="Preview every page you want to control. Drag pages to reorder, rotate them, or remove pages before export."
          busy={isBusy}
          onFiles={(files) => loadPagePreview(files[0], 'organize')}
        />
        {renderPageGrid('organize')}
        <div className="grid gap-3 md:grid-cols-2">
          <ActionBar
            cost={selectedTool.cost}
            credits={credits}
            disabled={isBusy || !pageFile || pageItems.length < 1}
            loading={busyLabel}
            label="Export organized PDF"
            onClick={() => runProcess('organize_pdf')}
          />
          <ActionBar
            cost={selectedTool.cost}
            credits={credits}
            disabled={isBusy || !pageFile || selectedOrganizePages.length < 1}
            loading={busyLabel}
            label="Export selected pages"
            onClick={() => runProcess('split_pdf')}
          />
        </div>
      </div>
    );
  }

  function renderJpgTool() {
    return (
      <div className="space-y-5">
        <UploadDropzone
          title="Upload PDF for images"
          description="Convert selected pages to JPG, or switch mode and extract original embedded images from the PDF."
          busy={isBusy}
          onFiles={(files) => loadPagePreview(files[0], 'jpg')}
        />

        <div className="grid gap-2 rounded-[24px] border border-white/10 bg-white/[0.04] p-2 sm:grid-cols-2">
          {[
            { id: 'pages' as const, label: 'Pages to JPG', note: 'Choose exact PDF pages' },
            { id: 'images' as const, label: 'Extract images', note: 'Pull original embedded images' }
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setConversionMode(item.id)}
              className={`rounded-[20px] px-4 py-3 text-left transition ${
                conversionMode === item.id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-white hover:text-violet-700'
              }`}
            >
              <span className="block text-sm font-black">{item.label}</span>
              <span className="mt-1 block text-xs opacity-70">{item.note}</span>
            </button>
          ))}
        </div>

        {conversionMode === 'pages' ? renderPageGrid('jpg') : (
          <div className="rounded-[26px] border border-white/10 bg-black/25 p-5">
            <h3 className="text-lg font-black">Extract embedded images</h3>
            <p className="mt-2 text-sm leading-6 text-white/55">
              SAVI will look inside the PDF and package the original embedded images into one downloadable ZIP.
            </p>
          </div>
        )}

        <ActionBar
          cost={selectedTool.cost}
          credits={credits}
          disabled={isBusy || !jpgFile || (conversionMode === 'pages' && selectedJpgPages.length < 1)}
          loading={busyLabel}
          label={conversionMode === 'pages' ? `Create ZIP from ${selectedJpgPages.length || 0} pages` : 'Extract images as ZIP'}
          onClick={() => runProcess(conversionMode === 'pages' ? 'pdf_to_jpg' : 'extract_images')}
        />
      </div>
    );
  }

  function renderAiDocumentTool() {
    return (
      <div className="space-y-5">
        <UploadDropzone
          title={`Upload PDF for ${selectedTool.title}`}
          description="Add the document, check the preview, then generate the selected workflow."
          busy={isBusy}
          onFiles={(files) => loadAiPdf(files[0])}
        />

        {aiFile && (
          <div className="rounded-[26px] border border-violet-100 bg-white/65 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="max-w-[340px] truncate text-sm font-black text-slate-950">{aiFile.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {aiFile.status === 'previewing' ? 'Opening PDF...' : aiFile.status === 'ready' ? `${aiFile.pageCount || 0} pages` : aiFile.error}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAiFile(null);
                  setAiPages([]);
                  setAiResult('');
                  clearPodcastAudio();
                }}
                className="mini-tool-button"
              >
                Remove
              </button>
            </div>

            {aiPages.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {aiPages.map((page) => (
                  <div key={page.pageNumber} className="overflow-hidden rounded-2xl border border-violet-100 bg-white">
                    <img src={page.thumbnail} alt={`Page ${page.pageNumber}`} className="aspect-[3/4] w-full object-cover" />
                    <p className="px-2 py-1 text-center text-[11px] font-black text-slate-500">Page {page.pageNumber}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-[26px] border border-violet-100 bg-white/70 p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-violet-500">Instruction</p>
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            rows={4}
            className="min-h-[120px] w-full resize-none bg-transparent text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400"
            placeholder={selectedTool.promptPlaceholder}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 pt-3">
            <span className="text-xs font-black text-slate-500">{selectedTool.cost} credits</span>
            <button
              type="button"
              disabled={isBusy || !aiFile || aiFile.status !== 'ready'}
              onClick={runAiDocumentTool}
              className="rounded-full border border-violet-200 bg-white/70 px-5 py-2.5 text-xs font-black text-violet-700 shadow-[0_12px_28px_rgba(124,58,237,0.13)] backdrop-blur transition hover:bg-violet-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busyLabel || `Generate ${selectedTool.title}`}
            </button>
          </div>
        </div>

        {aiResult && (
          <div className="rounded-[30px] border border-emerald-200 bg-emerald-50/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-black text-emerald-900">{selectedTool.title} ready</p>
                <p className="mt-1 text-sm text-emerald-800/70">You can copy or download this draft.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([aiResult], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `savi-${activeTool}.txt`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
              >
                Download
              </button>
            </div>
            <div className="mt-4 whitespace-pre-wrap rounded-[22px] border border-emerald-100 bg-white/80 p-4 text-sm leading-7 text-slate-700">
              {aiResult}
            </div>

            {activeTool === 'pdf_podcast' && (
              <div className="mt-5 rounded-[26px] border border-violet-200 bg-white/85 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-950">Create radio podcast audio</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Uses SAVI Radio voice generation. Audio cost: <strong className="text-violet-700">{PODCAST_AUDIO_COST} credits</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={podcastBusy}
                    onClick={createRadioPodcastAudio}
                    className="rounded-full bg-violet-600 px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(124,58,237,0.22)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {podcastBusy ? 'Creating podcast...' : `Create podcast - ${PODCAST_AUDIO_COST} credits`}
                  </button>
                </div>

                {podcastAudioUrl && (
                  <div className="mt-4 rounded-[22px] border border-violet-100 bg-violet-50/80 p-4">
                    <audio controls src={podcastAudioUrl} className="w-full" />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-bold text-slate-500">{podcastAudioName}</p>
                      <a
                        href={podcastAudioUrl}
                        download={podcastAudioName || 'savi-radio-podcast.wav'}
                        className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
                      >
                        Download podcast
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="glass overflow-hidden rounded-[36px]">
      <div className="border-b border-white/10 bg-white/[0.035] p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/70">{isToolOpen ? 'File tool' : 'File tools'}</p>
            <h2 className="mt-2 text-3xl font-black md:text-4xl">{isToolOpen ? selectedTool.title : 'File tools'}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">
              {isToolOpen ? selectedTool.description : 'Upload, preview, reorder, select, export, and download without leaving SAVI.'}
            </p>
          </div>
        </div>

        {!isToolOpen && (
        <div className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => selectFileTool(tool.id)}
              className={`rounded-[24px] border p-4 text-left transition ${
                activeTool === tool.id
                  ? 'border-cyan-200/50 bg-cyan-300/12 shadow-[0_0_35px_rgba(0,217,255,0.12)]'
                  : 'border-white/10 bg-black/18 hover:border-white/25'
              }`}
            >
              <span className="text-base font-black">{tool.title}</span>
              <span className="mt-2 block text-xs leading-5 text-white/52">{tool.description}</span>
              <ToolPreview previewId={tool.id} compact />
              <span className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-black text-cyan-100">
                {tool.cost} credits
              </span>
              <span className="ml-2 mt-3 inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                {tool.group}
              </span>
            </button>
          ))}
        </div>
        )}
      </div>

      {isToolOpen && (
      <div ref={workAreaRef} className="scroll-mt-24 p-5 md:p-6">
        {activeTool === 'merge' && renderMergeTool()}
        {activeTool === 'organize' && renderOrganizeTool()}
        {activeTool === 'jpg' && renderJpgTool()}
        {aiDocumentTools.has(activeTool) && renderAiDocumentTool()}

        {error && (
          <div className="mt-5 rounded-[22px] border border-red-300/20 bg-red-400/10 p-4 text-sm font-bold text-red-100">
            {error}
          </div>
        )}

        {output && (
          <div className="mt-5 flex flex-col gap-4 rounded-[26px] border border-emerald-200/25 bg-emerald-300/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-emerald-100">{output.label}</p>
              <p className="mt-1 text-sm text-white/58">{output.filename}</p>
            </div>
            <a
              href={output.url}
              download={output.filename}
              className="rounded-full bg-white px-6 py-3 text-center text-sm font-black text-black hover:bg-emerald-100"
            >
              Download
            </a>
          </div>
        )}
      </div>
      )}

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </section>
  );
}

function normaliseClientRotation(rotation: number): PageItem['rotation'] {
  const next = ((rotation % 360) + 360) % 360;
  if (next === 90 || next === 180 || next === 270) return next;
  return 0;
}

function ActionBar({
  cost,
  credits,
  disabled,
  loading,
  label,
  onClick
}: {
  cost: number;
  credits: number;
  disabled?: boolean;
  loading?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.045] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-white/50">
            {cost} credits
            <span className="text-white/25"> / </span>
            <span className={credits >= cost ? 'text-white/58' : 'text-red-200'}>{credits} available</span>
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className="rounded-full border border-white/12 bg-white/10 px-5 py-2.5 text-xs font-black text-white/80 backdrop-blur transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading || label}
        </button>
      </div>
    </div>
  );
}
