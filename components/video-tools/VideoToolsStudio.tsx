'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { OutputGallery, type OutputGalleryItem } from '@/components/OutputGallery';
import { ToolSelect } from '@/components/ToolSelect';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ToolPreview } from '@/components/ToolPreview';
import type { TemplateItem } from '@/lib/templates';
import { recordMediaItem } from '@/lib/mediaLibrary';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';

type VideoToolId = 'text_video' | 'story_video' | 'image_video' | 'first_last' | 'product_ad' | 'social_reel' | 'extend';
type ModelId = 'lite' | 'fast' | 'standard';
type DurationValue = '4' | '6' | '8';
type RatioValue = '16:9' | '9:16';
type QualityValue = '720' | '1080' | '4K';
type LocalVideoPreview = {
  toolTitle: string;
  toolId: VideoToolId;
  prompt: string;
  duration: DurationValue;
  ratio: RatioValue;
  quality: QualityValue;
  modelLabel: string;
  withAudio: boolean;
};

type StoryVideoShot = {
  id: string;
  prompt: string;
  videoUrl?: string;
  videoName?: string;
  isGenerating: boolean;
  parentVideoUrl?: string;
  placeholder?: string;
};

type VideoStudioOutput = OutputGalleryItem & {
  toolId: VideoToolId;
};

const CLOSE_ACTIVE_TOOL_EVENT = 'savi-close-active-tool';

const videoTools: Array<{
  id: VideoToolId;
  title: string;
  description: string;
  promptPlaceholder: string;
  imageSlots: number;
  cost: number;
  hiddenInstruction: string;
}> = [
  {
    id: 'text_video',
    title: 'Text to video',
    description: 'Create a cinematic clip from a written idea.',
    promptPlaceholder: 'Example: A premium SAVI workspace comes alive on a glass desk, violet-blue glow, slow camera push-in, soft keyboard clicks, elegant launch mood.',
    imageSlots: 0,
    cost: 900,
    hiddenInstruction: 'Generate a polished short video from text only with clear camera movement, subject, action, lighting, and audio direction.'
  },
  {
    id: 'story_video',
    title: 'Story Sketch Video',
    description: 'Build a video sequence shot by shot, then continue from the previous shot.',
    promptPlaceholder: 'Example: Shot 1 opens on a pomegranate tree at golden hour. Shot 2 follows the fruit falling. Shot 3 shows a child picking it up.',
    imageSlots: 0,
    cost: 1300,
    hiddenInstruction: 'Create one short video shot in a consistent multi-shot story. Preserve visual continuity, camera language, lighting, subject identity, and narrative flow between shots.'
  },
  {
    id: 'image_video',
    title: 'Image to video',
    description: 'Animate a product, person, scene, or character from references.',
    promptPlaceholder: 'Example: Animate the uploaded product photo with a slow orbit, gentle light sweep, realistic reflections, and a clean final hero frame.',
    imageSlots: 3,
    cost: 1200,
    hiddenInstruction: 'Use up to three reference images to preserve the subject, product, or character while animating the scene.'
  },
  {
    id: 'first_last',
    title: 'Start and end frame',
    description: 'Control the first and last frame for a guided visual transition.',
    promptPlaceholder: 'Example: Move naturally from the start frame to the end frame with the same subject, matching light, smooth camera movement, and no sudden style change.',
    imageSlots: 3,
    cost: 1600,
    hiddenInstruction: 'Use the first image as the starting frame, the second image as the ending frame, and the optional third image as a style, subject, or product reference. Create a coherent transition.'
  },
  {
    id: 'product_ad',
    title: 'Product ad video',
    description: 'Create a short ad with product shots, motion, voice direction, and CTA.',
    promptPlaceholder: 'Example: Create an 8-second premium ad for this skincare jar: texture close-up, hand picks up product, soft water reflection, final clean beauty shot.',
    imageSlots: 3,
    cost: 1400,
    hiddenInstruction: 'Use up to three references for the product, package, logo, or lifestyle scene. Build a premium product advertisement with clear hook, product reveal, benefit shot, and closing call to action.'
  },
  {
    id: 'social_reel',
    title: 'Social reel',
    description: 'Vertical short-form content for Instagram, TikTok, or Shorts.',
    promptPlaceholder: 'Example: Make a fast vertical reel: first-second hook, three quick visual beats, bold readable caption rhythm, smooth product reveal, trendy clean energy.',
    imageSlots: 3,
    cost: 1100,
    hiddenInstruction: 'Use up to three references for the subject, product, or visual direction. Create a punchy vertical reel with quick visual beats, captions, motion, hook, and a clear ending.'
  },
  {
    id: 'extend',
    title: 'Extend video',
    description: 'Continue an existing generated video with a natural next action.',
    promptPlaceholder: 'Example: Continue the uploaded clip for 4 seconds with the same camera direction, lighting, and subject motion, ending on a calm polished final frame.',
    imageSlots: 3,
    cost: 1500,
    hiddenInstruction: 'Use the uploaded video or image references to extend the previous video naturally. Continue the last movement and keep the style consistent.'
  }
];

const modelOptions: Array<{ id: ModelId; label: string; note: string; multiplier: number }> = [
  { id: 'lite', label: 'Lite', note: 'Fast drafts', multiplier: 1 },
  { id: 'fast', label: 'Fast', note: 'Better motion', multiplier: 1.7 },
  { id: 'standard', label: 'Standard', note: 'Studio quality', multiplier: 4 }
];

const durations: DurationValue[] = ['4', '6', '8'];
const ratios: RatioValue[] = ['16:9', '9:16'];
const qualities: QualityValue[] = ['720', '1080', '4K'];

const promptIdeas: Record<VideoToolId, string[]> = {
  text_video: ['A cinematic AI workspace opening on a clean desk', 'A luxury product reveal with soft purple light', 'A calm founder story in a modern studio'],
  story_video: ['Shot 1: a red pomegranate hangs on a tree in golden afternoon light', 'Shot 2: the pomegranate falls softly onto the garden soil', 'Shot 3: a child picks it up and smiles at the camera'],
  image_video: ['Animate this product with slow camera orbit', 'Make the character walk into a bright studio', 'Create a subtle premium motion ad'],
  first_last: ['Transition smoothly from frame one to frame two', 'Make the subject move naturally between both frames', 'Create a cinematic reveal between the two images'],
  product_ad: ['A 6 second product ad with hook, reveal, benefit, CTA', 'Premium skincare product with water reflections', 'Tech product launch video with clean motion'],
  social_reel: ['Fast vertical reel with captions and 3 visual beats', 'Before and after transformation reel', 'UGC-style hook then product result'],
  extend: ['Continue the camera movement and reveal the final result', 'Extend with a slower ending and clean CTA', 'Keep the same subject and add a natural next action']
};

const templateToVideoTool: Record<string, VideoToolId> = {
  'video-ad-script': 'product_ad'
};

function getReferenceLabel(toolId: VideoToolId, index: number) {
  if (toolId === 'first_last') {
    return ['Start frame', 'End frame', 'Extra reference'][index] ?? `Reference ${index + 1}`;
  }

  if (toolId === 'extend' && index === 0) return 'Video to extend';

  return `Reference ${index + 1}`;
}

function makeDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read reference file.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    };
    reader.readAsDataURL(file);
  });
}

function makeClientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createStoryVideoShot(updates: Partial<StoryVideoShot> = {}): StoryVideoShot {
  return {
    id: makeClientId(),
    prompt: '',
    isGenerating: false,
    ...updates
  };
}

function mediaReferenceFromDataUrl(mediaUrl?: string, name = 'previous-video-shot.mp4') {
  if (!mediaUrl?.startsWith('data:')) return undefined;
  const [header, data] = mediaUrl.split(',');
  const mimeType = header.match(/^data:(.*?);base64$/)?.[1] || 'video/mp4';
  if (!data) return undefined;
  return { data, mimeType, name };
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);

  lines.forEach((item, index) => {
    context.fillText(item, x, y + index * lineHeight);
  });
}

function createLocalVideoPreview(request: LocalVideoPreview) {
  return new Promise<{ url: string; filename: string }>((resolve, reject) => {
    if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
      reject(new Error('Video preview is not available in this browser.'));
      return;
    }

    const canvas = document.createElement('canvas');
    const isVertical = request.ratio === '9:16';
    canvas.width = isVertical ? 720 : 1280;
    canvas.height = isVertical ? 1280 : 720;

    const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!context) {
      reject(new Error('Could not create video canvas.'));
      return;
    }
    const ctx = context;

    const stream = canvas.captureStream(24);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((item) => MediaRecorder.isTypeSupported(item));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    const durationMs = Math.max(4, Math.min(Number(request.duration), 8)) * 1000;
    const startedAt = performance.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      stream.getTracks().forEach((track) => track.stop());
      reject(new Error('Could not record the video preview.'));
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve({
        url: URL.createObjectURL(blob),
        filename: `savi-${request.toolId}-${request.duration}s-${request.quality}.webm`
      });
    };

    function drawFrame(now: number) {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const width = canvas.width;
      const height = canvas.height;
      const glowX = width * (0.18 + progress * 0.64);
      const glowY = height * (0.22 + Math.sin(progress * Math.PI) * 0.18);

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#f8fafc');
      gradient.addColorStop(0.42, '#ede9fe');
      gradient.addColorStop(1, '#dbeafe');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(glowX, glowY, 20, glowX, glowY, Math.min(width, height) * 0.52);
      glow.addColorStop(0, 'rgba(124, 58, 237, 0.42)');
      glow.addColorStop(0.55, 'rgba(56, 189, 248, 0.18)');
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width * (0.5 + Math.sin(progress * Math.PI * 2) * 0.035), height * 0.5);
      ctx.rotate((progress - 0.5) * 0.08);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.strokeStyle = 'rgba(124,58,237,0.28)';
      ctx.lineWidth = 3;
      const cardW = width * 0.64;
      const cardH = height * 0.46;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 38);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#4f46e5';
      ctx.beginPath();
      ctx.arc(width * (0.32 + progress * 0.08), height * 0.42, Math.min(width, height) * 0.07, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = `800 ${Math.round(width * 0.043)}px Inter, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('SAVI Video Preview', width / 2, height * 0.2);

      ctx.fillStyle = '#475569';
      ctx.font = `700 ${Math.round(width * 0.022)}px Inter, Arial, sans-serif`;
      ctx.fillText(`${request.modelLabel} · ${request.duration}s · ${request.quality} · ${request.ratio}`, width / 2, height * 0.27);

      ctx.fillStyle = '#111827';
      ctx.font = `800 ${Math.round(width * 0.028)}px Inter, Arial, sans-serif`;
      wrapCanvasText(ctx, request.toolTitle, width / 2, height * 0.45, width * 0.52, height * 0.055, 2);

      ctx.fillStyle = '#334155';
      ctx.font = `700 ${Math.round(width * 0.019)}px Inter, Arial, sans-serif`;
      wrapCanvasText(ctx, request.prompt, width / 2, height * 0.58, width * 0.58, height * 0.038, 3);

      ctx.fillStyle = 'rgba(124,58,237,0.92)';
      const barWidth = width * 0.44 * progress;
      ctx.beginPath();
      ctx.roundRect(width * 0.28, height * 0.78, barWidth, height * 0.018, 10);
      ctx.fill();

      ctx.fillStyle = '#64748b';
      ctx.font = `700 ${Math.round(width * 0.015)}px Inter, Arial, sans-serif`;
      ctx.fillText(request.withAudio ? 'Audio direction included' : 'Silent visual preview', width / 2, height * 0.86);

      if (progress < 1) {
        requestAnimationFrame(drawFrame);
        return;
      }

      setTimeout(() => recorder.stop(), 160);
    }

    recorder.start();
    requestAnimationFrame(drawFrame);
  });
}

export function VideoToolsStudio({
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
  const [toolId, setToolId] = useState<VideoToolId>('text_video');
  const [isToolOpen, setIsToolOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ModelId>('lite');
  const [duration, setDuration] = useState<DurationValue>('6');
  const [ratio, setRatio] = useState<RatioValue>('16:9');
  const [quality, setQuality] = useState<QualityValue>('720');
  const [withAudio, setWithAudio] = useState(true);
  const [storyVideoInstructions, setStoryVideoInstructions] = useState('Realistic cinematic shots, consistent characters, natural motion, premium lighting.');
  const [storyVideoShots, setStoryVideoShots] = useState<StoryVideoShot[]>(() => [
    createStoryVideoShot({ placeholder: 'Example: The pomegranate hangs on a tree in golden light, leaves moving softly, cinematic close-up.' })
  ]);
  const [draggedStoryVideoShotId, setDraggedStoryVideoShotId] = useState<string | null>(null);
  const [dragTargetStoryVideoShotId, setDragTargetStoryVideoShotId] = useState<string | null>(null);
  const [references, setReferences] = useState<Array<{ url: string; name: string; type: string; file: File }>>([]);
  const [outputBrief, setOutputBrief] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoName, setVideoName] = useState('');
  const [videoOutputs, setVideoOutputs] = useState<VideoStudioOutput[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const workAreaRef = useRef<HTMLDivElement | null>(null);

  const selectedTool = videoTools.find((tool) => tool.id === toolId) ?? videoTools[0];
  const selectedModel = modelOptions.find((item) => item.id === model) ?? modelOptions[0];
  const creditCost = useMemo(() => {
    const durationMultiplier = duration === '8' ? 1.35 : duration === '4' ? 0.75 : 1;
    const qualityMultiplier = quality === '4K' ? 2.6 : quality === '1080' ? 1.45 : 1;
    return Math.ceil(selectedTool.cost * selectedModel.multiplier * durationMultiplier * qualityMultiplier);
  }, [duration, quality, selectedModel.multiplier, selectedTool.cost, selectedTool.id]);

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
    const nextTool = templateToVideoTool[template.id];
    if (!nextTool) return;

    selectVideoTool(nextTool, template.prompt);
    setRatio(nextTool === 'social_reel' ? '9:16' : '16:9');
    setDuration('6');
    setModel('lite');
  }, [template, templateLaunchKey]);

  function clearGeneratedVideo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl('');
    setVideoName('');
  }

  function resetStoryVideo() {
    setStoryVideoInstructions('Realistic cinematic shots, consistent characters, natural motion, premium lighting.');
    setStoryVideoShots([
      createStoryVideoShot({ placeholder: 'Example: The pomegranate hangs on a tree in golden light, leaves moving softly, cinematic close-up.' })
    ]);
    setDraggedStoryVideoShotId(null);
    setDragTargetStoryVideoShotId(null);
  }

  function selectVideoTool(nextTool: VideoToolId, nextPrompt = '') {
    references.forEach((item) => URL.revokeObjectURL(item.url));
    setReferences([]);
    setToolId(nextTool);
    setIsToolOpen(true);
    setPrompt(nextPrompt);
    setOutputBrief('');
    clearGeneratedVideo();
    resetStoryVideo();
    setError('');
    setRatio(nextTool === 'social_reel' ? '9:16' : '16:9');
    window.requestAnimationFrame(() => workAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function addReferences(files: FileList | null) {
    const selectedFiles = Array.from(files || []).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    const remainingSlots = selectedTool.imageSlots - references.length;

    if (remainingSlots <= 0) {
      setError('You can upload up to 3 references for this tool.');
      return;
    }

    const next = selectedFiles
      .slice(0, remainingSlots)
      .map((file) => ({ url: URL.createObjectURL(file), name: file.name, type: file.type, file }));

    setReferences((current) => [...current, ...next]);
    setOutputBrief('');
    clearGeneratedVideo();
    setError(selectedFiles.length > remainingSlots ? 'Only the first 3 references are kept for this tool.' : '');
  }

  function removeReference(index: number) {
    setReferences((current) => {
      const item = current[index];
      if (item) URL.revokeObjectURL(item.url);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    setOutputBrief('');
    clearGeneratedVideo();
    setError('');
  }

  async function generate() {
    setError('');
    if (!prompt.trim()) {
      setError('Write the video idea, scene, or changes first.');
      return;
    }
    if (['image_video', 'extend'].includes(selectedTool.id) && references.length < 1) {
      setError('Add a reference image or video for this tool.');
      return;
    }
    if (selectedTool.id === 'first_last' && references.length < 2) {
      setError('Add both start and end frame images.');
      return;
    }
    if (credits < creditCost) {
      setShowUpgrade(true);
      return;
    }
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    setIsGenerating(true);
    setOutputBrief('');
    clearGeneratedVideo();

    const brief = [
      `Tool: ${selectedTool.title}`,
      `Model direction: Veo 3.1 ${selectedModel.label}`,
      `Duration: ${duration}s`,
      `Ratio: ${ratio}`,
      `Quality: ${quality}`,
      `Audio: ${withAudio ? 'native audio and voice direction' : 'silent visual output'}`,
      `References: ${references.map((item) => item.name).join(', ') || 'No references'}`,
      '',
      'User request:',
      prompt.trim(),
      '',
      'Production brief:',
      selectedTool.hiddenInstruction,
      '',
      'Shot plan:',
      '1. Hook: clear first second with strong subject visibility.',
      '2. Motion: natural camera movement and consistent lighting.',
      '3. Detail: show product, person, or transformation clearly.',
      '4. Finish: resolve with a clean end frame and usable CTA.',
      '',
      'Output rules:',
      '- Keep references consistent when provided.',
      '- Avoid messy text unless captions are requested.',
      '- Preserve brand-safe, launch-ready pacing.'
    ].join('\n');

    try {
      const referencePayload = await Promise.all(
        references.map(async (item) => ({
          data: await readFileAsBase64(item.file),
          mimeType: item.type,
          name: item.name
        }))
      );

      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          toolId: selectedTool.id,
          ratio,
          duration,
          quality,
          withAudio,
          references: referencePayload
        })
      });
      const data = (await response.json().catch(() => ({}))) as { video?: string; filename?: string; error?: string };

      if (!response.ok || !data.video) {
        throw new Error(data.error || 'Video generation failed.');
      }

      const resultVideo = data.video;
      const resultFilename = data.filename || 'savi-generated-video.mp4';
      setVideoUrl(resultVideo);
      setVideoName(resultFilename);
      setOutputBrief(brief);
      setVideoOutputs((current) => [
        {
          id: makeClientId(),
          type: 'video',
          url: resultVideo,
          title: selectedTool.title,
          subtitle: `${duration}s · ${quality} · ${ratio}`,
          filename: resultFilename,
          toolId: selectedTool.id
        },
        ...current
      ]);
      recordMediaItem({
        type: 'video',
        title: selectedTool.title,
        source: 'Videos',
        url: resultVideo,
        filename: resultFilename
      });
      onCreditsChange(credits - creditCost);
    } catch (videoError) {
      setError(videoError instanceof Error ? videoError.message : 'Video generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  function updateStoryVideoShot(id: string, updates: Partial<StoryVideoShot>) {
    setStoryVideoShots((current) => current.map((shot) => (shot.id === id ? { ...shot, ...updates } : shot)));
  }

  function addStoryVideoShot() {
    setStoryVideoShots((current) => [...current, createStoryVideoShot({ placeholder: 'Describe the next video shot...' })]);
    setError('');
  }

  function applyStoryVideoIdea(idea: string) {
    setStoryVideoShots((current) => {
      const emptyIndex = current.findIndex((shot) => !shot.videoUrl && !shot.prompt.trim());
      if (emptyIndex === -1) {
        return [
          ...current,
          createStoryVideoShot({
            prompt: idea,
            placeholder: 'Example: Continue with the child kneeling down and reaching for the fruit, same warm garden mood.'
          })
        ];
      }
      return current.map((shot, index) => (index === emptyIndex ? { ...shot, prompt: idea } : shot));
    });
    setError('');
  }

  function addFollowUpVideoShot(id: string) {
    setStoryVideoShots((current) => {
      const index = current.findIndex((shot) => shot.id === id);
      if (index === -1) return current;
      const parent = current[index];
      if (!parent.videoUrl) return current;

      const next = createStoryVideoShot({
        parentVideoUrl: parent.videoUrl,
        videoUrl: parent.videoUrl,
        placeholder: 'Example: Continue the action naturally, same camera and lighting, with the subject taking the next small step.'
      });
      const copy = [...current];
      copy.splice(index + 1, 0, next);
      return copy;
    });
    setError('');
  }

  function deleteStoryVideoShot(id: string) {
    setStoryVideoShots((current) => {
      const next = current.filter((shot) => shot.id !== id);
      return next.length
        ? next
        : [createStoryVideoShot({ placeholder: 'Example: The pomegranate hangs on a tree in golden light, leaves moving softly, cinematic close-up.' })];
    });
    setError('');
  }

  function handleStoryVideoDragEnd() {
    if (draggedStoryVideoShotId && dragTargetStoryVideoShotId && draggedStoryVideoShotId !== dragTargetStoryVideoShotId) {
      setStoryVideoShots((current) => {
        const oldIndex = current.findIndex((shot) => shot.id === draggedStoryVideoShotId);
        const newIndex = current.findIndex((shot) => shot.id === dragTargetStoryVideoShotId);
        if (oldIndex === -1 || newIndex === -1) return current;
        const copy = [...current];
        const [removed] = copy.splice(oldIndex, 1);
        copy.splice(newIndex, 0, removed);
        return copy;
      });
    }
    setDraggedStoryVideoShotId(null);
    setDragTargetStoryVideoShotId(null);
  }

  async function generateStoryVideoShot(id: string) {
    const shot = storyVideoShots.find((item) => item.id === id);
    if (!shot || !shot.prompt.trim()) {
      setError('Write a prompt for this video shot first.');
      return;
    }
    if (storyVideoShots.some((item) => item.isGenerating)) {
      setError('Let the current shot finish first.');
      return;
    }
    if (credits < creditCost) {
      setShowUpgrade(true);
      return;
    }
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    setError('');
    updateStoryVideoShot(id, { isGenerating: true });

    try {
      const parentReference = mediaReferenceFromDataUrl(shot.parentVideoUrl, 'previous-story-video-shot.mp4');
      const finalPrompt = [
        shot.parentVideoUrl
          ? 'Continue from the previous generated video shot. Keep the same story world, visual style, camera language, subject continuity, and motion logic.'
          : 'Create the first short video shot of a cinematic story sequence.',
        `Global direction: ${storyVideoInstructions.trim() || 'Realistic cinematic shots, consistent characters, natural motion, premium lighting.'}`,
        `Shot duration: ${duration}s.`,
        `Aspect ratio: ${ratio}.`,
        `Quality target: ${quality}.`,
        `Audio: ${withAudio ? 'include natural ambience or useful sound direction' : 'silent visual shot only'}.`,
        `Shot prompt: ${shot.prompt.trim()}`
      ].join('\n\n');

      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          toolId: 'story_video',
          ratio,
          duration,
          quality,
          withAudio,
          references: parentReference ? [parentReference] : []
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        video?: string;
        filename?: string;
        error?: string;
      };

      if (!response.ok || !data.video) {
        throw new Error(data.error || 'Story video shot generation failed.');
      }
      const resultVideo = data.video;
      const resultFilename = data.filename || 'savi-story-video-shot.mp4';

      updateStoryVideoShot(id, {
        videoUrl: resultVideo,
        videoName: resultFilename,
        isGenerating: false,
        parentVideoUrl: undefined
      });
      recordMediaItem({
        type: 'video',
        title: 'Story video shot',
        source: 'Videos',
        url: resultVideo,
        filename: resultFilename
      });
      onCreditsChange(credits - creditCost);
    } catch (storyError) {
      updateStoryVideoShot(id, { isGenerating: false });
      setError(storyError instanceof Error ? storyError.message : 'Story video shot generation failed.');
    }
  }

  function renderStoryVideoTool() {
    return (
      <div className="mt-5 space-y-5">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Story direction</p>
            <textarea
              value={storyVideoInstructions}
              onChange={(event) => setStoryVideoInstructions(event.target.value)}
              rows={4}
              placeholder="Example: warm realistic story film, consistent child character, golden garden light, gentle handheld motion, natural ambient sound."
              className="mt-3 min-h-[120px] w-full resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ToolSelect label="Time" value={duration} options={durations} suffix="s" onChange={setDuration} />
              <ToolSelect label="Ratio" value={ratio} options={ratios} onChange={setRatio} />
              <ToolSelect label="Quality" value={quality} options={qualities} onChange={setQuality} />
              <ToolSelect label="Model" value={model} options={modelOptions.map((item) => item.id)} labels={Object.fromEntries(modelOptions.map((item) => [item.id, item.label])) as Record<ModelId, string>} onChange={setModel} />
            </div>
            <button
              type="button"
              onClick={() => setWithAudio((current) => !current)}
              className={`mt-3 flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left text-sm ${withAudio ? 'border-blue-200 bg-blue-50 text-blue-950' : 'border-violet-100 bg-white text-slate-600'}`}
            >
              <span className="font-black">Audio direction</span>
              <span className={`h-6 w-11 rounded-full p-1 transition ${withAudio ? 'bg-blue-600' : 'bg-slate-300'}`}>
                <span className={`block h-4 w-4 rounded-full bg-white transition ${withAudio ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          </div>

          <div className="rounded-[30px] border border-violet-100 bg-white/65 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Video storyboard</p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">Generate scene by scene</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={addStoryVideoShot} className="rounded-full bg-violet-600 px-5 py-3 text-sm font-black text-white">
                  Add shot
                </button>
                <button type="button" onClick={resetStoryVideo} className="rounded-full border border-violet-100 bg-white px-5 py-3 text-sm font-black text-slate-700">
                  Reset
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Generate one short video at a time. Use Next shot to continue from the previous clip. Each shot costs <strong>{creditCost} credits</strong>.
            </p>
            <div className="mt-3 rounded-[22px] bg-violet-50 px-4 py-3 text-xs font-bold leading-5 text-violet-700">
              Best flow: write Shot 1, generate it, then click Next shot and describe the next action.
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-violet-100 bg-white/65 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Shot ideas</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {promptIdeas.story_video.map((idea) => (
              <button key={idea} type="button" onClick={() => applyStoryVideoIdea(idea)} className="rounded-full border border-violet-100 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:border-violet-300">
                {idea.replace(/^Shot \d: /, '')}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {storyVideoShots.map((shot, index) => {
            const hasGeneratedVideo = Boolean(shot.videoUrl && !shot.parentVideoUrl);
            const canGenerate = !shot.isGenerating && !storyVideoShots.some((item) => item.isGenerating) && shot.prompt.trim().length > 0;

            return (
              <article
                key={shot.id}
                draggable={storyVideoShots.length > 1}
                onDragStart={(event) => {
                  setDraggedStoryVideoShotId(shot.id);
                  event.dataTransfer.setData('text/plain', shot.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedStoryVideoShotId !== shot.id) setDragTargetStoryVideoShotId(shot.id);
                }}
                onDragEnd={handleStoryVideoDragEnd}
                className={`rounded-[28px] border p-3 transition ${
                  dragTargetStoryVideoShotId === shot.id
                    ? 'border-violet-300 bg-violet-100'
                    : 'border-violet-100 bg-white/70'
                }`}
              >
                <div className="relative aspect-video overflow-hidden rounded-[22px] border border-violet-100 bg-gradient-to-br from-violet-100 via-white to-blue-100">
                  {shot.videoUrl ? (
                    <video src={shot.videoUrl} controls={hasGeneratedVideo} muted={!hasGeneratedVideo} loop playsInline className={`h-full w-full object-cover ${shot.parentVideoUrl ? 'opacity-45' : ''}`} />
                  ) : (
                    <div className="grid h-full place-items-center px-6 text-center text-sm font-bold text-slate-500">
                      {shot.parentVideoUrl ? 'Previous clip is ready. Describe the next moment.' : 'Describe and generate this video shot.'}
                    </div>
                  )}
                  {shot.isGenerating && (
                    <div className="absolute inset-0 grid place-items-center bg-white/65 backdrop-blur-sm">
                      <span className="text-3xl font-black tracking-[0.22em] text-violet-700 animate-pulse">...</span>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-black text-white">Shot {index + 1}</span>
                  <span className="absolute right-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-black text-slate-800">{duration}s</span>
                </div>

                <div className="mt-3 rounded-[20px] border border-violet-100 bg-white/80 p-3">
                  <textarea
                    value={shot.prompt}
                    onChange={(event) => updateStoryVideoShot(shot.id, { prompt: event.target.value })}
                    readOnly={shot.isGenerating || hasGeneratedVideo}
                    rows={3}
                    placeholder={shot.placeholder || 'Example: The child picks up the fruit and looks toward the camera, soft smile, same garden background.'}
                    className="min-h-[82px] w-full resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => generateStoryVideoShot(shot.id)}
                      disabled={!canGenerate || hasGeneratedVideo}
                      className="rounded-full bg-violet-600 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {shot.isGenerating ? 'Generating...' : 'Generate'}
                    </button>
                    <div className="flex items-center gap-1">
                      {hasGeneratedVideo && (
                        <>
                          <button type="button" onClick={() => addFollowUpVideoShot(shot.id)} className="mini-tool-button">Next shot</button>
                          <a href={shot.videoUrl} download={shot.videoName || `savi-story-video-shot-${index + 1}.mp4`} className="mini-tool-button">
                            Download
                          </a>
                        </>
                      )}
                      <button type="button" onClick={() => deleteStoryVideoShot(shot.id)} className="mini-tool-button">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <section className="glass rounded-[36px] p-5 md:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-500">{isToolOpen ? 'Video tool' : 'Video tools'}</p>
          <h2 className="mt-2 text-3xl font-black md:text-4xl">{isToolOpen ? selectedTool.title : 'Video tools'}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            {isToolOpen ? selectedTool.description : 'Create text-to-video, image-to-video, social reels, product ads, and frame-guided clips.'}
          </p>
        </div>
      </div>

      {!isToolOpen && (
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {videoTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => selectVideoTool(tool.id)}
            className={`rounded-[22px] border p-3 text-left transition sm:p-4 ${toolId === tool.id ? 'border-violet-300 bg-violet-100 text-violet-950 shadow-[0_18px_40px_rgba(124,58,237,0.16)]' : 'border-violet-100 bg-white/65 text-slate-600 hover:bg-white'}`}
          >
            <span className="block font-black">{tool.title}</span>
            <span className="mt-2 block text-xs leading-5 opacity-75">{tool.description}</span>
            <ToolPreview previewId={tool.id} compact />
            <span className="mt-3 inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-black text-violet-700">{tool.cost}+ credits</span>
          </button>
        ))}
      </div>
      )}

      {isToolOpen && (
      <>
      <div ref={workAreaRef} className="mt-5 scroll-mt-24">
      {selectedTool.id === 'story_video' ? renderStoryVideoTool() : (
      <div className="grid gap-5">
        <div className="space-y-4">
          <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
            {selectedTool.imageSlots > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-violet-100 pb-3">
                <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-2xl border border-violet-100 bg-white/80 text-2xl font-light text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.1)] transition hover:border-violet-300 hover:bg-violet-50" aria-label="Attach references">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      addReferences(event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                  +
                </label>
                {references.length ? references.map((item, index) => (
                  <div key={item.url} className="group flex max-w-[210px] items-center gap-2 rounded-2xl border border-violet-100 bg-white/80 p-1.5">
                    {item.type.startsWith('video/') ? (
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-[10px] font-black text-white">VID</div>
                    ) : (
                      <img src={item.url} alt="" className="h-10 w-10 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-black text-violet-700">{getReferenceLabel(selectedTool.id, index)}</p>
                      <p className="truncate text-[10px] font-bold text-slate-400">{item.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeReference(index)}
                      className="grid h-7 w-7 place-items-center rounded-full text-xs font-black text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${item.name}`}
                    >
                      x
                    </button>
                  </div>
                )) : (
                  <span className="text-xs font-bold text-slate-400">
                    {selectedTool.id === 'first_last' ? 'Attach start, end, and optional reference' : 'Attach up to 3 references'}
                  </span>
                )}
              </div>
            )}
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
              placeholder={selectedTool.promptPlaceholder}
              className="min-h-[165px] w-full resize-none bg-transparent text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 pt-3">
              <span className="text-xs font-black text-slate-500">{creditCost} credits</span>
              <button
                type="button"
                disabled={isGenerating}
                onClick={generate}
                className="rounded-full border border-violet-200 bg-white/70 px-5 py-2.5 text-xs font-black text-violet-700 shadow-[0_12px_28px_rgba(124,58,237,0.13)] backdrop-blur transition hover:bg-violet-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
            {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ToolSelect label="Model" value={model} options={modelOptions.map((item) => item.id)} labels={Object.fromEntries(modelOptions.map((item) => [item.id, item.label])) as Record<ModelId, string>} onChange={setModel} />
            <ToolSelect label="Time" value={duration} options={durations} suffix="s" onChange={setDuration} />
            <ToolSelect label="Ratio" value={ratio} options={ratios} onChange={setRatio} />
            <ToolSelect label="Quality" value={quality} options={qualities} onChange={setQuality} />
          </div>

          <button
            type="button"
            onClick={() => setWithAudio((current) => !current)}
            className={`flex w-full items-center justify-between rounded-[24px] border px-5 py-4 text-left ${withAudio ? 'border-blue-200 bg-blue-50 text-blue-950' : 'border-violet-100 bg-white/65 text-slate-600'}`}
          >
            <span>
              <span className="block font-black">Native audio direction</span>
              <span className="mt-1 block text-sm opacity-70">Voice, ambience, sound effects, and caption rhythm</span>
            </span>
            <span className={`h-7 w-12 rounded-full p-1 transition ${withAudio ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white transition ${withAudio ? 'translate-x-5' : ''}`} />
            </span>
          </button>

          {(isGenerating || videoOutputs.some((item) => item.toolId === selectedTool.id)) && (
            <div className="space-y-3">
              {isGenerating && (
                <div className="rounded-[24px] border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-black text-violet-700">
                  Creating video preview...
                </div>
              )}
              {videoOutputs.some((item) => item.toolId === selectedTool.id) && (
                <OutputGallery
                  title={`${selectedTool.title} outputs`}
                  items={videoOutputs.filter((item) => item.toolId === selectedTool.id)}
                  actions={outputBrief ? (
                    <button type="button" onClick={() => makeDownload('savi-video-brief.txt', outputBrief)} className="rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-black text-slate-800">
                      Download brief
                    </button>
                  ) : undefined}
                />
              )}
            </div>
          )}
        </div>
      </div>
      )}
      </div>
      </>
      )}

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </section>
  );
}

function Segment<T extends string>({
  title,
  value,
  options,
  labels,
  suffix = '',
  onChange
}: {
  title: string;
  value: T;
  options: readonly T[];
  labels?: Record<T, string>;
  suffix?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="rounded-[24px] border border-violet-100 bg-white/65 p-3">
      <p className="px-1 text-xs font-black uppercase tracking-[0.16em] text-violet-500">{title}</p>
      <div className="mt-2 grid gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-2xl px-3 py-2 text-sm font-black transition ${value === option ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-violet-50'}`}
          >
            {(labels?.[option] ?? option) + suffix}
          </button>
        ))}
      </div>
    </div>
  );
}
