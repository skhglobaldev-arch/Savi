'use client';

import { useEffect, useRef, useState } from 'react';
import { OutputGallery, type OutputGalleryItem } from '@/components/OutputGallery';
import { ToolSelect } from '@/components/ToolSelect';
import { ToolPreview } from '@/components/ToolPreview';
import { ToolActionBar, ToolCategoryTabs, ToolFieldLabel, ToolHeader, ToolResultEmpty, ToolStatus } from '@/components/SaviToolUI';
import { ToolVideoIcon } from '@/components/SaviIcons';
import type { TemplateItem } from '@/lib/templates';
import { recordMediaItem } from '@/lib/mediaLibrary';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';
import {
  applyAuthoritativeBalance,
  clearSaviClientRequestId,
  createSaviClientRequestId,
  createSaviRequestScope,
  revokeOwnedObjectUrl
} from '@/lib/savi/clientGeneration';

type VideoToolId = 'text_video' | 'story_video' | 'image_video' | 'first_last' | 'product_ad' | 'social_reel' | 'extend';
type ModelId = 'omni';
type DurationValue = '4' | '6' | '8';
type RatioValue = '16:9' | '9:16';
type QualityValue = '720';

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

export const videoTools: Array<{
  id: VideoToolId;
  title: string;
  description: string;
  promptPlaceholder: string;
  imageSlots: number;
  hiddenInstruction: string;
}> = [
  {
    id: 'text_video',
    title: 'Text to video',
    description: 'Create a cinematic clip from a written idea.',
    promptPlaceholder: 'Example: A premium SAVI workspace comes alive on a glass desk, violet-blue glow, slow camera push-in, soft keyboard clicks, elegant launch mood.',
    imageSlots: 0,
    hiddenInstruction: 'Generate a polished short video from text only with clear camera movement, subject, action, lighting, and audio direction.'
  },
  {
    id: 'story_video',
    title: 'Story Sketch Video',
    description: 'Build a video sequence shot by shot, then continue from the previous shot.',
    promptPlaceholder: 'Example: Shot 1 opens on a pomegranate tree at golden hour. Shot 2 follows the fruit falling. Shot 3 shows a child picking it up.',
    imageSlots: 0,
    hiddenInstruction: 'Create one short video shot in a consistent multi-shot story. Preserve visual continuity, camera language, lighting, subject identity, and narrative flow between shots.'
  },
  {
    id: 'image_video',
    title: 'Image to video',
    description: 'Animate a product, person, scene, or character from references.',
    promptPlaceholder: 'Example: Animate the uploaded product photo with a slow orbit, gentle light sweep, realistic reflections, and a clean final hero frame.',
    imageSlots: 3,
    hiddenInstruction: 'Use up to three reference images to preserve the subject, product, or character while animating the scene.'
  },
  {
    id: 'first_last',
    title: 'Start and end frame',
    description: 'Control the first and last frame for a guided visual transition.',
    promptPlaceholder: 'Example: Move naturally from the start frame to the end frame with the same subject, matching light, smooth camera movement, and no sudden style change.',
    imageSlots: 3,
    hiddenInstruction: 'Use the first image as the starting frame, the second image as the ending frame, and the optional third image as a style, subject, or product reference. Create a coherent transition.'
  },
  {
    id: 'product_ad',
    title: 'Product ad video',
    description: 'Create a short ad with product shots, motion, voice direction, and CTA.',
    promptPlaceholder: 'Example: Create an 8-second premium ad for this skincare jar: texture close-up, hand picks up product, soft water reflection, final clean beauty shot.',
    imageSlots: 3,
    hiddenInstruction: 'Use up to three references for the product, package, logo, or lifestyle scene. Build a premium product advertisement with clear hook, product reveal, benefit shot, and closing call to action.'
  },
  {
    id: 'social_reel',
    title: 'Social reel',
    description: 'Vertical short-form content for Instagram, TikTok, or Shorts.',
    promptPlaceholder: 'Example: Make a fast vertical reel: first-second hook, three quick visual beats, bold readable caption rhythm, smooth product reveal, trendy clean energy.',
    imageSlots: 3,
    hiddenInstruction: 'Use up to three references for the subject, product, or visual direction. Create a punchy vertical reel with quick visual beats, captions, motion, hook, and a clear ending.'
  },
  {
    id: 'extend',
    title: 'Extend video',
    description: 'Continue an existing generated video with a natural next action.',
    promptPlaceholder: 'Example: Continue the uploaded clip for 4 seconds with the same camera direction, lighting, and subject motion, ending on a calm polished final frame.',
    imageSlots: 3,
    hiddenInstruction: 'Use the uploaded video or image references to extend the previous video naturally. Continue the last movement and keep the style consistent.'
  }
];

const videoToolCategories: Record<VideoToolId, 'Create' | 'Animate' | 'Promote'> = {
  text_video: 'Create',
  story_video: 'Create',
  image_video: 'Animate',
  first_last: 'Animate',
  extend: 'Animate',
  product_ad: 'Promote',
  social_reel: 'Promote'
};

const modelOptions: Array<{ id: ModelId; label: string; note: string }> = [
  { id: 'omni', label: 'SAVI Video', note: 'Current server-rendered video output' }
];

const durations: DurationValue[] = ['4', '6', '8'];
const ratios: RatioValue[] = ['16:9', '9:16'];
const qualities: QualityValue[] = ['720'];

const promptIdeas: Record<VideoToolId, string[]> = {
  text_video: ['A cinematic AI workspace opening on a clean desk', 'A luxury product reveal with soft purple light', 'A calm founder story in a modern studio'],
  story_video: ['Shot 1: a red pomegranate hangs on a tree in golden afternoon light', 'Shot 2: the pomegranate falls softly onto the garden soil', 'Shot 3: a child picks it up and smiles at the camera'],
  image_video: ['Animate this product with slow camera orbit', 'Make the character walk into a bright studio', 'Create a subtle premium motion ad'],
  first_last: ['Transition smoothly from frame one to frame two', 'Make the subject move naturally between both frames', 'Create a cinematic reveal between the two images'],
  product_ad: ['A 6 second product ad with hook, reveal, benefit, CTA', 'Premium skincare product with water reflections', 'Tech product launch video with clean motion'],
  social_reel: ['Fast vertical reel with captions and 3 visual beats', 'Before and after transformation reel', 'UGC-style hook then product result'],
  extend: ['Continue the camera movement and reveal the final result', 'Extend with a slower ending and clean CTA', 'Keep the same subject and add a natural next action']
};

const templateToVideoTool: Record<string, VideoToolId> = {};

function getReferenceLabel(toolId: VideoToolId, index: number) {
  if (toolId === 'first_last') {
    return ['Start frame', 'End frame', 'Extra reference'][index] ?? `Reference ${index + 1}`;
  }

  if (toolId === 'extend' && index === 0) return 'Video to extend';

  return `Reference ${index + 1}`;
}

function getVideoReferenceLabel(toolId: VideoToolId) {
  if (toolId === 'first_last') return 'Add the start and end frames';
  if (toolId === 'extend') return 'Upload the video to extend';
  return 'Upload your reference media';
}

function getVideoReferenceHint(toolId: VideoToolId) {
  if (toolId === 'first_last') return 'Choose the start image first, then the end image. A third reference is optional.';
  if (toolId === 'extend') return 'Add the existing clip first; an image can guide the next shot if needed.';
  return 'Add up to three images or videos to guide the result.';
}

function getVideoReferenceBadge(toolId: VideoToolId): 'Required' | 'Optional' {
  return ['image_video', 'first_last', 'extend'].includes(toolId) ? 'Required' : 'Optional';
}

function getVideoPromptLabel(toolId: VideoToolId) {
  if (toolId === 'text_video') return 'Describe the video';
  if (toolId === 'image_video') return 'Describe the motion';
  if (toolId === 'first_last') return 'Describe the transition';
  if (toolId === 'product_ad') return 'Describe the ad';
  if (toolId === 'social_reel') return 'Describe the reel';
  if (toolId === 'extend') return 'Describe what happens next';
  return 'Describe the next shot';
}

function getVideoActionLabel(toolId: VideoToolId) {
  if (toolId === 'text_video') return 'Create video';
  if (toolId === 'image_video') return 'Animate video';
  if (toolId === 'first_last') return 'Create transition';
  if (toolId === 'product_ad') return 'Create product ad';
  if (toolId === 'social_reel') return 'Create social reel';
  if (toolId === 'extend') return 'Extend video';
  return 'Generate video';
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

async function mediaReferenceFromDataUrl(mediaUrl?: string, name = 'previous-video-shot.mp4') {
  if (!mediaUrl) return undefined;
  if (mediaUrl.startsWith('data:')) {
    const [header, data] = mediaUrl.split(',');
    const mimeType = header.match(/^data:(.*?);base64$/)?.[1] || 'video/mp4';
    return data ? { data, mimeType, name } : undefined;
  }
  const response = await fetch(mediaUrl, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('SAVI could not load the previous story video.');
  const blob = await response.blob();
  if (!blob.type.startsWith('video/')) throw new Error('The previous story asset is not a video.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('SAVI could not prepare the previous story video.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
  const [, data = ''] = dataUrl.split(',');
  return data ? { data, mimeType: blob.type || 'video/mp4', name } : undefined;
}

export function VideoToolsStudio({
  credits,
  onCreditsChange,
  template,
  templateLaunchKey = 0,
  launchToolId,
  launchKey = 0
}: {
  credits: number | null;
  onCreditsChange: (credits: number) => void;
  template?: TemplateItem;
  templateLaunchKey?: number;
  launchToolId?: string;
  launchKey?: number;
}) {
  const { user, isLoading: isAuthLoading, signIn } = useSaviAuth();
  const [toolId, setToolId] = useState<VideoToolId>('text_video');
  const [toolCategory, setToolCategory] = useState<'All' | 'Create' | 'Animate' | 'Promote'>('All');
  const [isToolOpen, setIsToolOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ModelId>('omni');
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
  const [serverQuote, setServerQuote] = useState<number | null>(null);
  const workAreaRef = useRef<HTMLDivElement | null>(null);

  const selectedTool = videoTools.find((tool) => tool.id === toolId) ?? videoTools[0];
  const visibleVideoTools = videoTools.filter((tool) => toolCategory === 'All' || videoToolCategories[tool.id] === toolCategory);
  const selectedModel = modelOptions.find((item) => item.id === model) ?? modelOptions[0];
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
      toolId: selectedTool.id,
      duration,
      referenceImageCount: String(references.length)
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
  }, [duration, isAuthLoading, references.length, selectedTool.id, user?.id]);

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
    setModel('omni');
  }, [template, templateLaunchKey]);

  useEffect(() => {
    if (!launchToolId || launchKey === 0) return;
    const nextTool = videoTools.find((tool) => tool.id === launchToolId);
    if (nextTool) selectVideoTool(nextTool.id);
  }, [launchKey, launchToolId]);

  function clearGeneratedVideo() {
    revokeOwnedObjectUrl(videoUrl);
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
    setToolCategory(videoToolCategories[nextTool]);
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
      `Output path: ${selectedModel.label}`,
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
    const requestScope = createSaviRequestScope('video-generate', [
      selectedTool.id,
      prompt.trim(),
      ratio,
      duration,
      quality,
      withAudio,
      references.map((item) => `${item.name}:${item.file.size}:${item.file.lastModified}`).join('|')
    ]);

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
          references: referencePayload,
          clientRequestId: createSaviClientRequestId(requestScope)
        })
      });
      const data = (await response.json().catch(() => ({}))) as { video?: string; filename?: string; error?: string; availableCredits?: number; jobId?: string };

      if (response.status !== 202) clearSaviClientRequestId(requestScope);

      if (!response.ok || !data.video) {
        if (response.status === 202 && data.jobId) {
          throw new Error('SAVI is still finishing this video. Generate again in a moment to check the same safe request without a second charge.');
        }
        throw new Error(data.error || 'Video generation failed.');
      }

      const resultVideo = data.video;
      const resultFilename = data.filename || 'generated-video.mp4';
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
      applyAuthoritativeBalance(data.availableCredits, onCreditsChange);
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
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    setError('');
    updateStoryVideoShot(id, { isGenerating: true });

    try {
      const parentReference = await mediaReferenceFromDataUrl(shot.parentVideoUrl, 'previous-story-video-shot.mp4');
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
      const requestScope = createSaviRequestScope('story-video-shot', [
        id,
        finalPrompt,
        ratio,
        duration,
        quality,
        withAudio,
        shot.parentVideoUrl || ''
      ]);

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
          references: parentReference ? [parentReference] : [],
          clientRequestId: createSaviClientRequestId(requestScope)
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        video?: string;
        filename?: string;
        error?: string;
        availableCredits?: number;
        jobId?: string;
      };

      if (response.status !== 202) clearSaviClientRequestId(requestScope);

      if (!response.ok || !data.video) {
        if (response.status === 202 && data.jobId) {
          throw new Error('SAVI is still finishing this story shot. Generate again in a moment to check the same safe request without a second charge.');
        }
        throw new Error(data.error || 'Story video shot generation failed.');
      }
      const resultVideo = data.video;
      const resultFilename = data.filename || 'story-video-shot.mp4';

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
      applyAuthoritativeBalance(data.availableCredits, onCreditsChange);
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
              Generate one short video at a time. Use Next shot to continue from the previous clip. Each shot uses the current server quote: <strong>{quoteLabel}</strong>.
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
            const previewVideo = shot.videoUrl || shot.parentVideoUrl;
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
                  {previewVideo ? (
                    <video src={previewVideo} controls={hasGeneratedVideo} muted={!hasGeneratedVideo} loop playsInline className={`h-full w-full object-cover ${shot.parentVideoUrl && !shot.videoUrl ? 'opacity-45' : ''}`} />
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
                          <a href={shot.videoUrl} download={shot.videoName || `story-video-shot-${index + 1}.mp4`} className="mini-tool-button">
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
    <section className="savi-tool-shell">
      <ToolHeader
        mark={<ToolVideoIcon />}
        eyebrow={isToolOpen ? 'Video tool' : 'Video tools'}
        title={isToolOpen ? selectedTool.title : 'Video tools'}
        description={isToolOpen ? selectedTool.description : 'Create text-to-video, image-to-video, social reels, product ads, and frame-guided clips.'}
      >
        {!isToolOpen && (
          <ToolCategoryTabs
            value={toolCategory}
            onChange={(value) => setToolCategory(value as 'All' | 'Create' | 'Animate' | 'Promote')}
            options={(['All', 'Create', 'Animate', 'Promote'] as const).map((category) => ({
              id: category,
              label: category,
              count: category === 'All' ? videoTools.length : videoTools.filter((tool) => videoToolCategories[tool.id] === category).length
            }))}
          />
        )}
      </ToolHeader>

      {!isToolOpen && (
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4 md:p-6">
        {visibleVideoTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => selectVideoTool(tool.id)}
            className={`min-h-[44px] rounded-lg border p-3 text-left text-white transition sm:p-4 ${toolId === tool.id ? 'border-white/25 bg-white/[0.1]' : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.07]'}`}
          >
            <span className="block font-black">{tool.title}</span>
            <span className="mt-2 block text-xs leading-5 opacity-75">{tool.description}</span>
            <ToolPreview previewId={tool.id} compact />
          </button>
        ))}
      </div>
      )}

      {isToolOpen && (
      <>
      <div ref={workAreaRef} className="scroll-mt-[110px] p-5 md:p-6 lg:scroll-mt-24">
      {selectedTool.id === 'story_video' ? renderStoryVideoTool() : (
      <div className="grid gap-5">
        <div className="space-y-4">
          <div className="savi-tool-section">
            {selectedTool.imageSlots > 0 && (
              <>
              <ToolFieldLabel
                label={getVideoReferenceLabel(selectedTool.id)}
                hint={getVideoReferenceHint(selectedTool.id)}
                badge={getVideoReferenceBadge(selectedTool.id)}
              />
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-violet-100 pb-3">
                <label className="grid h-[44px] w-[44px] cursor-pointer place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-2xl font-light text-white shadow-sm transition hover:border-white/20 hover:bg-white/[0.1]" aria-label={getVideoReferenceLabel(selectedTool.id)}>
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
                  <span aria-hidden="true" className="relative block h-4 w-4 before:absolute before:left-1/2 before:top-0 before:h-4 before:w-px before:-translate-x-1/2 before:bg-current after:absolute after:left-0 after:top-1/2 after:h-px after:w-4 after:-translate-y-1/2 after:bg-current" />
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
                      className="grid h-[44px] w-[44px] place-items-center rounded-lg text-xs font-black text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${item.name}`}
                    >
                      <span aria-hidden="true" className="relative block h-3.5 w-3.5 before:absolute before:left-1/2 before:top-0 before:h-3.5 before:w-px before:-translate-x-1/2 before:rotate-45 before:bg-current after:absolute after:left-1/2 after:top-0 after:h-3.5 after:w-px after:-translate-x-1/2 after:-rotate-45 after:bg-current" />
                    </button>
                  </div>
                )) : (
                  <span className="text-xs font-bold text-slate-400">
                    {selectedTool.id === 'first_last' ? 'Add start frame, end frame, then optional reference' : 'Choose up to 3 references'}
                  </span>
                )}
              </div>
              </>
            )}
            <ToolFieldLabel label={getVideoPromptLabel(selectedTool.id)} badge="Required" />
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
              placeholder={selectedTool.promptPlaceholder}
              aria-label={`${selectedTool.title} prompt`}
              className="min-h-[165px] w-full resize-none bg-transparent text-base leading-7 text-white outline-none placeholder:text-white/35"
            />
            <div className="mt-3 border-t border-white/10 pt-3">
              <ToolActionBar
                quote={serverQuote}
                credits={credits}
                quoteLabel={quoteLabel}
                disabled={isGenerating}
                loading={isGenerating ? 'Generating...' : undefined}
                label={getVideoActionLabel(selectedTool.id)}
                onClick={generate}
              />
            </div>
            {error && <div className="mt-3"><ToolStatus kind="error">{error}</ToolStatus></div>}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2 xl:col-span-4">
              <ToolFieldLabel label="Core settings" hint="Adjust length, shape, quality, and sound direction." badge="Optional" />
            </div>
            <ToolSelect label="Model" value={model} options={modelOptions.map((item) => item.id)} labels={Object.fromEntries(modelOptions.map((item) => [item.id, item.label])) as Record<ModelId, string>} onChange={setModel} />
            <ToolSelect label="Time" value={duration} options={durations} suffix="s" onChange={setDuration} />
            <ToolSelect label="Ratio" value={ratio} options={ratios} onChange={setRatio} />
            <ToolSelect label="Quality" value={quality} options={qualities} onChange={setQuality} />
          </div>

          <button
            type="button"
            onClick={() => setWithAudio((current) => !current)}
            aria-pressed={withAudio}
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

          {!isGenerating && !videoOutputs.some((item) => item.toolId === selectedTool.id) && (
            <ToolResultEmpty>Your video will appear here after you create it.</ToolResultEmpty>
          )}

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
                    <button type="button" onClick={() => makeDownload('video-brief.txt', outputBrief)} className="rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-black text-slate-800">
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
