'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ToolPreview } from '@/components/ToolPreview';
import { ToolActionBar, ToolCategoryTabs, ToolFieldLabel, ToolHeader, ToolResultEmpty, ToolStatus } from '@/components/SaviToolUI';
import { ToolFileIcon } from '@/components/SaviIcons';
import type { TemplateItem } from '@/lib/templates';
import { recordMediaItem } from '@/lib/mediaLibrary';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';
import { createClientPdfPages, inspectPdfFile, type ClientPdfPage } from '@/lib/pdf/clientValidation';
import {
  applyAuthoritativeBalance,
  clearSaviClientRequestId,
  createSaviClientRequestId,
  createSaviRequestScope,
  readPrivateTextAsset,
  revokeOwnedObjectUrl
} from '@/lib/savi/clientGeneration';

type FileToolId = 'merge' | 'organize' | 'jpg' | 'extract_images' | 'contract_summary' | 'explain_document' | 'translate_summary' | 'pdf_podcast';
type OutputFile = { url: string; filename: string; label: string };

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
  thumbnail?: string;
  rotation: 0 | 90 | 180 | 270;
  selected: boolean;
};

export const fileTools: Array<{
  id: FileToolId;
  title: string;
  description: string;
  promptPlaceholder: string;
  group: 'PDF tools' | 'AI document';
}> = [
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Upload multiple PDFs, reorder them, then export one clean PDF.',
    promptPlaceholder: 'Example: Put the signed contract first, then the invoice, then the appendix. Keep the file name clear and ready to send.',
    group: 'PDF tools'
  },
  {
    id: 'organize',
    title: 'Organize pages',
    description: 'Preview pages, drag to reorder, rotate, remove, or export selected pages.',
    promptPlaceholder: 'Example: Swap page 1 and page 2, rotate page 3 clockwise, remove blank pages, then export one clean PDF.',
    group: 'PDF tools'
  },
  {
    id: 'jpg',
    title: 'PDF to JPG',
    description: 'Choose exact PDF pages and export them as high-quality JPG files in one ZIP.',
    promptPlaceholder: 'Example: Convert pages 1, 3, and 4 to high-quality JPG files in one ZIP, ready to share.',
    group: 'PDF tools'
  },
  {
    id: 'extract_images',
    title: 'Extract PDF images',
    description: 'Pull the original embedded images from a PDF into one downloadable ZIP.',
    promptPlaceholder: 'Example: Extract every original image embedded in this PDF and package them in one ZIP file.',
    group: 'PDF tools'
  },
  {
    id: 'contract_summary',
    title: 'Summarize this contract',
    description: 'Upload a contract and get key points, risks, obligations, and next actions.',
    promptPlaceholder: 'Example: Summarize this contract in plain language. Highlight payment terms, deadlines, cancellation terms, risks, and what I should check before signing.',
    group: 'AI document'
  },
  {
    id: 'explain_document',
    title: 'Explain this document simply',
    description: 'Upload a PDF and turn complicated content into beginner-friendly notes.',
    promptPlaceholder: 'Example: Explain this document like I am new to the topic. Tell me what it means, what matters, and what I should do next.',
    group: 'AI document'
  },
  {
    id: 'translate_summary',
    title: 'Translate PDF and summarize it',
    description: 'Upload a PDF, translate the main content, and get a clear summary.',
    promptPlaceholder: 'Example: Translate the important parts into Persian, then give me a short summary, key decisions, and any names, dates, or prices.',
    group: 'AI document'
  },
  {
    id: 'pdf_podcast',
    title: 'Turn PDF into podcast',
    description: 'Upload a PDF and create a radio-style podcast script from its key points.',
    promptPlaceholder: 'Example: Turn this PDF into a 2-minute radio podcast script with a warm intro, three clear talking points, and a practical ending.',
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
const CLOSE_ACTIVE_TOOL_EVENT = 'savi-close-active-tool';

function getAiUploadTitle(toolId: FileToolId) {
  if (toolId === 'contract_summary') return 'Choose a contract PDF';
  if (toolId === 'explain_document') return 'Choose a PDF to explain';
  if (toolId === 'translate_summary') return 'Choose a PDF to translate';
  return 'Choose a PDF for a podcast';
}

function getAiUploadDescription(toolId: FileToolId) {
  if (toolId === 'contract_summary') return 'SAVI will show a page preview, then pull out risks, deadlines, and next actions.';
  if (toolId === 'explain_document') return 'SAVI will show a page preview, then explain the document in plain language.';
  if (toolId === 'translate_summary') return 'SAVI will show a page preview, then translate and summarise the important parts.';
  return 'SAVI will show a page preview, then turn the key points into a hosted script.';
}

function getAiPromptLabel(toolId: FileToolId) {
  if (toolId === 'contract_summary' || toolId === 'explain_document') return 'Tell SAVI what to look for';
  if (toolId === 'translate_summary') return 'Add translation guidance';
  if (toolId === 'pdf_podcast') return 'Guide the podcast script';
  return 'Add an optional instruction';
}

function getAiActionLabel(toolId: FileToolId) {
  if (toolId === 'contract_summary') return 'Summarize contract';
  if (toolId === 'explain_document') return 'Explain document';
  if (toolId === 'translate_summary') return 'Translate and summarize';
  return 'Create podcast script';
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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
    const selected = Array.from(files || []);
    if (selected.length) onFiles(multiple ? selected : [selected[0]]);
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
      className={`rounded-2xl border border-dashed p-4 text-center transition sm:p-6 ${
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
      <div aria-hidden="true" className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] before:absolute before:left-1/2 before:top-1/2 before:h-5 before:w-px before:-translate-x-1/2 before:-translate-y-1/2 before:bg-current after:absolute after:left-1/2 after:top-1/2 after:h-px after:w-5 after:-translate-x-1/2 after:-translate-y-1/2 after:bg-current">
      </div>
      <h3 className="mt-3 text-lg font-black sm:mt-4 sm:text-xl">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-white/55 sm:mt-2">{description}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-4 min-h-[44px] rounded-lg bg-white px-6 py-3 text-sm font-black text-black transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-5"
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
  credits: number | null;
  onCreditsChange: (credits: number) => void;
  template?: TemplateItem;
  templateLaunchKey?: number;
}) {
  const { user, isLoading: isAuthLoading, signIn } = useSaviAuth();
  const [activeTool, setActiveTool] = useState<FileToolId>('merge');
  const [toolGroup, setToolGroup] = useState<'PDF tools' | 'AI document'>('PDF tools');
  const [isToolOpen, setIsToolOpen] = useState(false);
  const [mergeFiles, setMergeFiles] = useState<PdfFileItem[]>([]);
  const [pageFile, setPageFile] = useState<PdfFileItem | null>(null);
  const [pageItems, setPageItems] = useState<PageItem[]>([]);
  const [jpgFile, setJpgFile] = useState<PdfFileItem | null>(null);
  const [jpgPages, setJpgPages] = useState<PageItem[]>([]);
  const [aiFile, setAiFile] = useState<PdfFileItem | null>(null);
  const [aiPages, setAiPages] = useState<Array<{ pageNumber: number }>>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [podcastAudioUrl, setPodcastAudioUrl] = useState('');
  const [podcastAudioName, setPodcastAudioName] = useState('');
  const [podcastBusy, setPodcastBusy] = useState(false);
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null);
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [output, setOutput] = useState<OutputFile | null>(null);
  const [serverQuote, setServerQuote] = useState<number | null>(null);
  const [splitQuote, setSplitQuote] = useState<number | null>(null);
  const [podcastQuote, setPodcastQuote] = useState<number | null>(null);
  const workAreaRef = useRef<HTMLDivElement | null>(null);

  const selectedTool = fileTools.find((tool) => tool.id === activeTool) ?? fileTools[0];
  const visibleTools = fileTools.filter((tool) => tool.group === toolGroup);
  const selectedJpgPages = useMemo(() => jpgPages.filter((page) => page.selected), [jpgPages]);
  const selectedOrganizePages = useMemo(() => pageItems.filter((page) => page.selected), [pageItems]);
  const isBusy = Boolean(busyLabel);
  const serverToolId = activeTool === 'merge' ? 'merge_pdf' : activeTool === 'organize' ? 'organize_pdf' : activeTool === 'jpg' ? 'pdf_to_jpg' : activeTool;
  const quotedPageCount = activeTool === 'merge'
    ? mergeFiles.reduce((total, item) => total + (item.pageCount || 0), 0)
    : activeTool === 'organize'
      ? pageFile?.pageCount || 1
      : activeTool === 'jpg' || activeTool === 'extract_images'
        ? jpgFile?.pageCount || 1
        : aiFile?.pageCount || 1;
  const quoteLabel = serverQuote === null
    ? user ? 'Price unavailable' : 'Sign in to view price'
    : `${serverQuote} credits`;

  useEffect(() => {
    if (isAuthLoading || !user) {
      setServerQuote(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      toolId: serverToolId,
      pageCount: String(Math.max(1, quotedPageCount)),
      textCharacters: String(Math.max(1, aiPrompt.length))
    });
    void fetch(`/api/pricing/quote?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) as { credits?: unknown } }))
      .then(({ response, data }) => {
        if (response.ok && typeof data.credits === 'number') setServerQuote(data.credits);
        else setServerQuote(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setServerQuote(null);
      });
    return () => controller.abort();
  }, [aiPrompt.length, isAuthLoading, quotedPageCount, serverToolId, user?.id]);

  useEffect(() => {
    if (isAuthLoading || !user || activeTool !== 'organize') {
      setSplitQuote(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      toolId: 'split_pdf',
      pageCount: String(Math.max(1, pageFile?.pageCount || 1))
    });
    void fetch(`/api/pricing/quote?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) as { credits?: unknown } }))
      .then(({ response, data }) => setSplitQuote(response.ok && typeof data.credits === 'number' ? data.credits : null))
      .catch(() => {
        if (!controller.signal.aborted) setSplitQuote(null);
      });
    return () => controller.abort();
  }, [activeTool, isAuthLoading, pageFile?.pageCount, user?.id]);

  useEffect(() => {
    if (isAuthLoading || !user || !aiResult.trim()) {
      setPodcastQuote(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ toolId: 'radio_talk', textCharacters: String(aiResult.length) });
    void fetch(`/api/pricing/quote?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) as { credits?: unknown } }))
      .then(({ response, data }) => setPodcastQuote(response.ok && typeof data.credits === 'number' ? data.credits : null))
      .catch(() => {
        if (!controller.signal.aborted) setPodcastQuote(null);
      });
    return () => controller.abort();
  }, [aiResult.length, isAuthLoading, user?.id]);

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
    revokeOwnedObjectUrl(output?.url);
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
    setDraggedFileIndex(null);
    setDraggedPageIndex(null);
    clearPodcastAudio();
  }

  function selectFileTool(nextTool: FileToolId, nextPrompt = '') {
    setActiveTool(nextTool);
    setToolGroup(fileTools.find((tool) => tool.id === nextTool)?.group ?? 'PDF tools');
    setIsToolOpen(true);
    clearFileInputs();
    setAiPrompt(nextPrompt);
    setBusyLabel('');
    setError('');
    clearOutput();
    window.requestAnimationFrame(() => workAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
          const preview = await inspectPdfFile(item.file);
          setMergeFiles((current) =>
            current.map((next) =>
              next.id === item.id
                ? { ...next, pageCount: preview.pageCount, status: 'ready' }
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
      const preview = await inspectPdfFile(file);
      const readyItem = {
        ...item,
        pageCount: preview.pageCount,
        status: 'ready' as const
      };
      const pages = createClientPdfPages(preview.pageCount).map((page: ClientPdfPage) => ({
        ...page,
        id: `${item.id}-${page.pageNumber}`
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
      const preview = await inspectPdfFile(file);
      setAiFile({
        ...item,
        pageCount: preview.pageCount,
        status: 'ready'
      });
      setAiPages(createClientPdfPages(preview.pageCount, 6).map(({ pageNumber }) => ({ pageNumber })));
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

    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    const finalPrompt = aiPrompt.trim() || selectedTool.description;
    const requestScope = createSaviRequestScope('pdf-ai', [
      activeTool,
      finalPrompt,
      aiFile.name,
      aiFile.size,
      aiFile.file.lastModified
    ]);
    clearPodcastAudio();
    setAiResult('');
    setBusyLabel('Reading PDF with SAVI...');

    try {
      const form = new FormData();
      form.append('file', aiFile.file);
      form.append('toolId', activeTool);
      form.append('prompt', finalPrompt);
      form.append('clientRequestId', createSaviClientRequestId(requestScope));

      const response = await fetch('/api/file-tools/ai', {
        method: 'POST',
        body: form
      });
      const data = (await response.json().catch(() => ({}))) as {
        result?: string;
        asset?: string;
        filename?: string;
        availableCredits?: number;
        error?: string;
        jobId?: string;
      };

      if (response.status !== 202) clearSaviClientRequestId(requestScope);

      if (!response.ok || (!data.result && !data.asset)) {
        if (response.status === 202 && data.jobId) {
          throw new Error('SAVI is still finishing this document. Generate again in a moment to check the same safe request without a second charge.');
        }
        throw new Error(data.error || 'AI document tool failed.');
      }

      const resultText = data.result || await readPrivateTextAsset(data.asset);
      if (!resultText) throw new Error('SAVI could not load the document result.');

      setAiResult(resultText);
      recordMediaItem({
        type: 'text',
        title: selectedTool.title,
        source: 'Files',
        url: data.asset,
        filename: data.filename || `savi-${activeTool}.txt`,
        text: resultText
      });
      applyAuthoritativeBalance(data.availableCredits, onCreditsChange);
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

    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    setPodcastBusy(true);
    setError('');
    clearPodcastAudio();
    const requestScope = createSaviRequestScope('pdf-podcast-audio', [aiResult, 'Puck', 'energetic, warm, radio podcast host']);

    try {
      const response = await fetch('/api/voice/radio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          toolId: 'radio_talk',
          clientRequestId: createSaviClientRequestId(requestScope),
          script: aiResult,
          voice: 'Puck',
          style: 'energetic, warm, radio podcast host'
        })
      });
      const data = (await response.json().catch(() => ({}))) as { audio?: string; filename?: string; availableCredits?: number; error?: string; jobId?: string };

      if (response.status !== 202) clearSaviClientRequestId(requestScope);

      if (!response.ok || !data.audio) {
        if (response.status === 202 && data.jobId) {
          throw new Error('SAVI is still finishing this podcast. Create it again in a moment to check the same safe request without a second charge.');
        }
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
      applyAuthoritativeBalance(data.availableCredits, onCreditsChange);
    } catch (podcastError) {
      setError(podcastError instanceof Error ? podcastError.message : 'Podcast audio generation failed.');
    } finally {
      setPodcastBusy(false);
    }
  }

  async function runProcess(action: 'merge_pdf' | 'organize_pdf' | 'split_pdf' | 'pdf_to_jpg' | 'extract_images') {
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    clearOutput();
    setError('');
    setBusyLabel('Preparing files...');
    const requestScope = createSaviRequestScope('pdf-process', [
      action,
      mergeFiles.map((item) => `${item.name}:${item.size}:${item.file.lastModified}`).join('|'),
      pageFile ? `${pageFile.name}:${pageFile.size}:${pageFile.file.lastModified}` : '',
      pageItems.map((item) => `${item.pageNumber}:${item.rotation}:${item.selected}`).join('|'),
      jpgFile ? `${jpgFile.name}:${jpgFile.size}:${jpgFile.file.lastModified}` : '',
      selectedJpgPages.map((item) => item.pageNumber).join(',')
    ]);

    try {
      const form = new FormData();
      form.append('action', action);
      form.append('clientRequestId', createSaviClientRequestId(requestScope));

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

      const data = (await response.json().catch(() => ({}))) as {
        asset?: string;
        filename?: string;
        availableCredits?: number;
        error?: string;
        jobId?: string;
      };
      if (response.status !== 202) clearSaviClientRequestId(requestScope);
      if (!response.ok || !data.asset) {
        if (response.status === 202 && data.jobId) {
          throw new Error('SAVI is still finishing this PDF. Run it again in a moment to check the same safe request without a second charge.');
        }
        throw new Error(data.error || 'PDF tool failed.');
      }

      const filename = data.filename || (action.includes('jpg') || action.includes('images') ? 'savi-output.zip' : 'savi-output.pdf');
      const url = data.asset;
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
      applyAuthoritativeBalance(data.availableCredits, onCreditsChange);
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
          title="Add PDFs to merge"
          description="Choose two or more PDFs, then reorder them below before merging."
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
                      <span>{item.status === 'previewing' ? 'Reading PDF...' : item.status === 'ready' ? `${item.pageCount} pages` : 'Invalid PDF'}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-black text-slate-950">{item.name}</p>
                    <p className="mt-1 text-xs text-white/40">{fileSizeLabel(item.size)}</p>
                    {item.error && <p className="mt-2 text-xs text-red-200">{item.error}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMergeFiles((current) => current.filter((next) => next.id !== item.id))}
                    className="grid h-[44px] w-[44px] place-items-center rounded-lg border border-violet-100 bg-white text-slate-400 hover:text-violet-700"
                  >
                    <span aria-hidden="true" className="relative block h-3.5 w-3.5 before:absolute before:left-1/2 before:top-0 before:h-3.5 before:w-px before:-translate-x-1/2 before:rotate-45 before:bg-current after:absolute after:left-1/2 after:top-0 after:h-3.5 after:w-px after:-translate-x-1/2 after:-rotate-45 after:bg-current" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <ToolActionBar
          quote={serverQuote}
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
              {items.length < (file.pageCount || 0) ? `, showing first ${items.length}` : ''}
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
                {page.thumbnail ? (
                  <img
                    src={page.thumbnail}
                    alt={`Page ${page.pageNumber}`}
                    style={{ transform: `rotate(${page.rotation}deg)` }}
                    className="aspect-[3/4] w-full object-cover transition"
                  />
                ) : (
                  <div
                    aria-label={`PDF page ${page.pageNumber}`}
                    className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 bg-slate-950 px-2 text-white"
                    style={{ transform: `rotate(${page.rotation}deg)` }}
                  >
                    <span className="text-2xl font-black">PDF</span>
                    <span className="text-xs font-bold text-white/60">Page {page.pageNumber}</span>
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-slate-950 px-2 py-1 text-xs font-black text-white">
                  {page.pageNumber}
                </span>
                <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-slate-950 text-xs font-black text-white">
                  {page.selected ? <span aria-hidden="true" className="h-2 w-3 -rotate-45 border-b-2 border-l-2 border-white" /> : null}
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
          title="Choose a PDF to organize"
          description="Preview pages, then reorder, rotate, remove, or export the pages you need."
          busy={isBusy}
          onFiles={(files) => loadPagePreview(files[0], 'organize')}
        />
        {renderPageGrid('organize')}
        <div className="grid gap-3 md:grid-cols-2">
          <ToolActionBar
            quote={serverQuote}
            credits={credits}
            disabled={isBusy || !pageFile || pageItems.length < 1}
            loading={busyLabel}
            label="Export organized PDF"
            onClick={() => runProcess('organize_pdf')}
          />
          <ToolActionBar
            quote={splitQuote}
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
          title="Choose a PDF for JPGs"
          description="Select the pages to turn into high-quality JPG files."
          busy={isBusy}
          onFiles={(files) => loadPagePreview(files[0], 'jpg')}
        />

        {renderPageGrid('jpg')}

        <ToolActionBar
          quote={serverQuote}
          credits={credits}
          disabled={isBusy || !jpgFile || selectedJpgPages.length < 1}
          loading={busyLabel}
          label={`Create ZIP from ${selectedJpgPages.length || 0} pages`}
          onClick={() => runProcess('pdf_to_jpg')}
        />
      </div>
    );
  }

  function renderExtractImagesTool() {
    return (
      <div className="space-y-5">
        <UploadDropzone
          title="Choose a PDF to extract images"
          description="SAVI will preserve embedded images and package them in one downloadable ZIP."
          busy={isBusy}
          onFiles={(files) => loadPagePreview(files[0], 'jpg')}
        />

        {jpgFile && (
          <div className="rounded-[26px] border border-white/10 bg-black/25 p-5">
            <p className="truncate text-sm font-black text-white">{jpgFile.name}</p>
            <p className="mt-1 text-sm leading-6 text-white/55">
              {jpgFile.status === 'previewing'
                ? 'Checking the PDF...'
                : jpgFile.status === 'ready'
                  ? `${jpgFile.pageCount} pages ready. SAVI will extract original embedded images, not page screenshots.`
                  : jpgFile.error || 'This PDF could not be opened.'}
            </p>
          </div>
        )}

          <ToolActionBar
          quote={serverQuote}
          credits={credits}
          disabled={isBusy || !jpgFile || jpgFile.status !== 'ready'}
          loading={busyLabel}
          label="Extract images as ZIP"
          onClick={() => runProcess('extract_images')}
        />
      </div>
    );
  }

  function renderAiDocumentTool() {
    return (
      <div className="space-y-5">
        <UploadDropzone
          title={getAiUploadTitle(activeTool)}
          description={getAiUploadDescription(activeTool)}
          busy={isBusy}
          onFiles={(files) => loadAiPdf(files[0])}
        />

        {aiFile && (
          <div className="rounded-[26px] border border-violet-100 bg-white/65 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="max-w-[340px] truncate text-sm font-black text-slate-950">{aiFile.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {aiFile.status === 'previewing' ? 'Reading PDF...' : aiFile.status === 'ready' ? `${aiFile.pageCount} pages` : aiFile.error}
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
                    <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 bg-slate-950 text-white">
                      <span className="text-lg font-black">PDF</span>
                      <span className="text-[10px] font-bold text-white/60">Page {page.pageNumber}</span>
                    </div>
                    <p className="px-2 py-1 text-center text-[11px] font-black text-slate-500">Page {page.pageNumber}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="savi-tool-section">
          <ToolFieldLabel label={getAiPromptLabel(activeTool)} hint="This is optional. SAVI uses the document itself when you leave it blank." badge="Optional" />
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            rows={4}
            aria-label={`${selectedTool.title} instruction`}
            className="min-h-[120px] w-full resize-none bg-transparent text-base leading-7 text-white outline-none placeholder:text-white/35"
            placeholder={selectedTool.promptPlaceholder}
          />
          <div className="mt-3 border-t border-white/10 pt-3">
            <ToolActionBar
              quote={serverQuote}
              credits={credits}
              quoteLabel={quoteLabel}
              disabled={isBusy || !aiFile || aiFile.status !== 'ready'}
              loading={busyLabel || undefined}
              label={getAiActionLabel(activeTool)}
              onClick={runAiDocumentTool}
            />
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
                className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-950 px-5 py-3 text-sm font-black text-white"
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
                      Uses SAVI Radio voice generation. Audio cost: <strong className="text-violet-700">{podcastQuote === null ? 'Price unavailable' : `${podcastQuote} credits`}</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={podcastBusy || Boolean(user && podcastQuote === null)}
                    onClick={createRadioPodcastAudio}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-violet-600 px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(124,58,237,0.22)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {podcastBusy ? 'Creating podcast...' : podcastQuote === null ? 'Quote unavailable' : `Create podcast - ${podcastQuote} credits`}
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
    <section className="savi-tool-shell">
      <ToolHeader
        mark={<ToolFileIcon />}
        eyebrow={isToolOpen ? 'File tool' : 'File tools'}
        title={isToolOpen ? selectedTool.title : 'File tools'}
        description={isToolOpen ? selectedTool.description : 'Upload, preview, reorder, select, export, and download without leaving SAVI.'}
      >
        {!isToolOpen && (
          <ToolCategoryTabs
            value={toolGroup}
            onChange={(value) => setToolGroup(value as 'PDF tools' | 'AI document')}
            options={(['PDF tools', 'AI document'] as const).map((group) => ({
              id: group,
              label: group,
              count: fileTools.filter((tool) => tool.group === group).length
            }))}
          />
        )}
      </ToolHeader>

        {!isToolOpen && (
        <div className="grid gap-2 p-5 md:grid-cols-3 xl:grid-cols-4 md:p-6">
          {visibleTools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => selectFileTool(tool.id)}
              className={`min-h-[44px] rounded-lg border p-4 text-left transition ${
                activeTool === tool.id
                  ? 'border-cyan-200/50 bg-cyan-300/12 shadow-[0_0_35px_rgba(0,217,255,0.12)]'
                  : 'border-white/10 bg-black/18 hover:border-white/25'
              }`}
            >
              <span className="text-base font-black">{tool.title}</span>
              <span className="mt-2 block text-xs leading-5 text-white/52">{tool.description}</span>
              <ToolPreview previewId={tool.id} compact />
              <span className="ml-2 mt-3 inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                {tool.group}
              </span>
            </button>
          ))}
        </div>
        )}
      {isToolOpen && (
      <div ref={workAreaRef} className="scroll-mt-[110px] p-5 md:p-6 lg:scroll-mt-24">
        {activeTool === 'merge' && renderMergeTool()}
        {activeTool === 'organize' && renderOrganizeTool()}
        {activeTool === 'jpg' && renderJpgTool()}
        {activeTool === 'extract_images' && renderExtractImagesTool()}
        {aiDocumentTools.has(activeTool) && renderAiDocumentTool()}

        {error && <div className="mt-5"><ToolStatus kind="error">{error}</ToolStatus></div>}

        {output && (
          <div className="mt-5 flex flex-col gap-4 rounded-[26px] border border-emerald-200/25 bg-emerald-300/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-emerald-100">{output.label}</p>
              <p className="mt-1 text-sm text-white/58">{output.filename}</p>
            </div>
            <a
              href={output.url}
              download={output.filename}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white px-6 py-3 text-center text-sm font-black text-black hover:bg-emerald-100"
            >
              Download
            </a>
          </div>
        )}
        {!output && !aiResult && !isBusy && (
          <ToolResultEmpty>Your exported file will appear here after you finish this step.</ToolResultEmpty>
        )}
      </div>
      )}

    </section>
  );
}

function normaliseClientRotation(rotation: number): PageItem['rotation'] {
  const next = ((rotation % 360) + 360) % 360;
  if (next === 90 || next === 180 || next === 270) return next;
  return 0;
}
