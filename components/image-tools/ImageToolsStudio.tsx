'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { OutputGallery, type OutputGalleryItem } from '@/components/OutputGallery';
import { ToolSelect } from '@/components/ToolSelect';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ToolPreview } from '@/components/ToolPreview';
import { SketchCanvas, type SketchCanvasHandle, type SketchCanvasTool } from '@/components/image-tools/SketchCanvas';
import type { TemplateItem } from '@/lib/templates';
import { recordMediaItem } from '@/lib/mediaLibrary';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';
import { getSaviTextToImageCreditCost } from '@/lib/ai/saviAgent';

type ImageToolId =
  | 'text_to_image'
  | 'story_sketch'
  | 'sketch_to_image'
  | 'instagram_post'
  | 'product_prompt'
  | 'edit_image'
  | 'remove_background'
  | 'remove_object'
  | 'change_style'
  | 'product_photo'
  | 'mockup'
  | 'visual_mixer'
  | 'text_design'
  | 'variations';

type StoryShot = {
  id: string;
  prompt: string;
  imageUrl?: string;
  imageName?: string;
  isGenerating: boolean;
  parentImageUrl?: string;
  placeholder?: string;
};

type SketchResult = {
  id: string;
  dataUrl: string;
  filename: string;
  sketchDataUrl: string;
  prompt: string;
  status: 'loading' | 'ready' | 'error';
  model: 'nano-banana' | 'nano-banana-pro';
};

type MockupCategory = 'devices' | 'clothing' | 'print';
type MockupModel = 'nano-banana' | 'nano-banana-pro';

type MockupPreset = {
  id: string;
  label: string;
  category: MockupCategory;
  defaultPrompt: string;
};

type VisualMixerCategory = 'subject' | 'scene' | 'style';

type VisualMixerIngredient = {
  id: string;
  category: VisualMixerCategory;
  url: string;
  file: File;
  name: string;
  active: boolean;
};

type VisualMixerResult = {
  id: string;
  dataUrl: string;
  filename: string;
  prompt: string;
  status: 'loading' | 'ready' | 'error';
};

type ImageStudioOutput = OutputGalleryItem & {
  toolId: ImageToolId;
};

type PendingTextToImageRequest = {
  key: string;
  clientRequestId: string;
};

const CLOSE_ACTIVE_TOOL_EVENT = 'savi-close-active-tool';

const imageTools: Array<{
  id: ImageToolId;
  title: string;
  description: string;
  promptPlaceholder: string;
  needsImage: boolean;
  cost: number;
  hiddenInstruction: string;
}> = [
  {
    id: 'text_to_image',
    title: 'Text to image',
    description: 'Create a clean image from a written idea.',
    promptPlaceholder: 'Example: Create a cinematic poster of a premium AI workspace on a glass desk, violet-blue glow, clean typography space, realistic studio lighting.',
    needsImage: false,
    cost: 75,
    hiddenInstruction: 'Generate a high-quality image from the user idea. Keep composition clean, premium, and useful.'
  },
  {
    id: 'story_sketch',
    title: 'Story Sketch',
    description: 'Build a visual sequence shot by shot, then continue from the previous image.',
    promptPlaceholder: 'Example: Build a six-frame story where a pomegranate falls from a tree, a child finds it, then shares it with someone in warm afternoon light.',
    needsImage: false,
    cost: 95,
    hiddenInstruction: 'Create a consistent cinematic storyboard sequence. Each shot should work as a realistic frame and preserve style continuity from earlier shots.'
  },
  {
    id: 'sketch_to_image',
    title: 'Sketch to image',
    description: 'Draw a rough idea, add a prompt, and turn it into a polished image.',
    promptPlaceholder: 'Example: Turn this rough sketch into a realistic collectible fashion doll on a dark grid background, premium materials, clean product lighting.',
    needsImage: false,
    cost: 130,
    hiddenInstruction: 'Use the canvas sketch as a reference. Preserve the rough layout and turn it into a polished generated image.'
  },
  {
    id: 'instagram_post',
    title: 'Instagram post from image',
    description: 'Upload an image and create a hook, caption, hashtags, and post idea.',
    promptPlaceholder: 'Example: Turn this cafe portrait into a stylish Instagram post with one bold hook, a short caption, 8 hashtags, and a soft premium brand tone.',
    needsImage: true,
    cost: 3,
    hiddenInstruction: 'Analyze the provided image and create a short Instagram post package with hook, caption, content angle, and hashtags.'
  },
  {
    id: 'product_prompt',
    title: 'Product photo prompt',
    description: 'Turn a product idea into a premium product photography prompt.',
    promptPlaceholder: 'Example: SAVI daily hydration cream on warm stone with eucalyptus, dewy texture, soft morning window light, calm luxury skincare campaign.',
    needsImage: false,
    cost: 3,
    hiddenInstruction: 'Create a detailed product photography prompt with subject, surface, lighting, composition, camera, mood, and usage notes.'
  },
  {
    id: 'edit_image',
    title: 'Edit image',
    description: 'Change details while keeping the original subject consistent.',
    promptPlaceholder: 'Example: Keep the person exactly the same, change the cafe into a clean luxury studio, soften the light, and preserve face, pose, and framing.',
    needsImage: true,
    cost: 160,
    hiddenInstruction: 'Edit the provided image based on the user request while preserving the main subject and identity.'
  },
  {
    id: 'remove_background',
    title: 'Remove or change background',
    description: 'Remove the background or replace it with a new scene.',
    promptPlaceholder: 'Example: Remove only the background and place the subject on a soft white studio backdrop. Keep hair edges, shadows, and subject untouched.',
    needsImage: true,
    cost: 200,
    hiddenInstruction: 'Mask the background only. Preserve the subject exactly and create a clean transparent or requested background.'
  },
  {
    id: 'remove_object',
    title: 'Remove object',
    description: 'Remove one unwanted object and rebuild the area naturally.',
    promptPlaceholder: 'Example: Remove the person in the back-right corner and rebuild the cafe wall, shelves, and lighting naturally. Do not change the main subject.',
    needsImage: true,
    cost: 250,
    hiddenInstruction: 'Remove only the target object described by the user. Preserve the rest of the image and avoid changing the subject.'
  },
  {
    id: 'change_style',
    title: 'Change clothes or style',
    description: 'Change outfit, color, material, or visual style without changing identity.',
    promptPlaceholder: 'Example: Change only the outfit to a matte charcoal blazer and silk top. Keep the face, pose, hair, lighting, and background unchanged.',
    needsImage: true,
    cost: 250,
    hiddenInstruction: 'Change the requested clothing or style while preserving face, pose, body shape, lighting direction, and image structure.'
  },
  {
    id: 'product_photo',
    title: 'Product photo',
    description: 'Turn a product reference into a premium ad-style product image.',
    promptPlaceholder: 'Example: Use this product as the hero item on a reflective white glass surface, botanical props, soft shadow, high-end ecommerce campaign look.',
    needsImage: true,
    cost: 180,
    hiddenInstruction: 'Create a polished product photography output using the reference image and the requested campaign style.'
  },
  {
    id: 'mockup',
    title: 'Mockup',
    description: 'Place a logo or design onto devices, clothing, print, or a custom surface.',
    promptPlaceholder: 'Example: Place this logo naturally on a matte black laptop screen in a modern studio, realistic perspective, soft reflections, no extra branding.',
    needsImage: true,
    cost: 180,
    hiddenInstruction: 'Create a photorealistic mockup. Use the first uploaded image as the logo or design, then place it naturally on the selected product or surface with realistic lighting, perspective, shadows, and material texture.'
  },
  {
    id: 'visual_mixer',
    title: 'Visual mixer',
    description: 'Blend a subject, scene, and style into one finished image.',
    promptPlaceholder: 'Example: Blend the selected subject, scene, and style into one premium hero image for a calm skincare launch, natural light, clean composition.',
    needsImage: false,
    cost: 210,
    hiddenInstruction: 'Blend the selected subject, scene, and style references into one cohesive premium image. Preserve the strongest visual cues from each category without making a collage.'
  },
  {
    id: 'text_design',
    title: 'Text and poster design',
    description: 'Create readable text, poster layouts, badges, labels, or covers.',
    promptPlaceholder: 'Example: Design a clean launch poster that says “Ask. Create. Organise.” with SAVI branding, purple-blue glow, readable premium layout.',
    needsImage: false,
    cost: 120,
    hiddenInstruction: 'Create a clean graphic layout with accurate readable text, strong hierarchy, and premium spacing.'
  },
  {
    id: 'variations',
    title: 'Create variations',
    description: 'Generate multiple consistent variations from one visual direction.',
    promptPlaceholder: 'Example: Create four variations of this product ad: warmer light, darker luxury mood, clean white ecommerce style, and bold social campaign style.',
    needsImage: true,
    cost: 220,
    hiddenInstruction: 'Create several variations while preserving the main subject and brand direction.'
  }
];

const aspectRatios = ['1:1', '4:5', '9:16', '16:9'] as const;
const qualities = ['720', '1080', '4K'] as const;
const styles = ['Realistic', 'Product', 'Editorial', '3D', 'Minimal', 'Cinematic'] as const;
const sketchColors = ['#ffffff', '#111827', '#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#2563eb', '#7c3aed', '#ec4899'];
const sketchBrushSizes = [4, 10, 34] as const;
const mockupCategories: Array<{ id: MockupCategory; label: string }> = [
  { id: 'devices', label: 'Devices' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'print', label: 'Print' }
];

const mockupPresets: MockupPreset[] = [
  {
    id: 'laptop',
    label: 'Laptop',
    category: 'devices',
    defaultPrompt: 'Place this design perfectly onto the screen of a modern, generic unbranded laptop sitting on a clean wooden desk in a minimalist office. Close-up shot.'
  },
  {
    id: 'phone',
    label: 'Phone',
    category: 'devices',
    defaultPrompt: 'Place this design onto the screen of a generic unbranded smartphone being held by a person outdoors in bright natural light. Close-up shot.'
  },
  {
    id: 'tv',
    label: 'TV',
    category: 'devices',
    defaultPrompt: 'Place this design on a generic unbranded wide-screen wall-mounted TV in a calm modern living room.'
  },
  {
    id: 'shirt',
    label: 'T-shirt',
    category: 'clothing',
    defaultPrompt: 'Show this design printed onto a plain solid-color t-shirt resting on a wooden floor. Close-up product mockup.'
  },
  {
    id: 'hat',
    label: 'Cap',
    category: 'clothing',
    defaultPrompt: 'Show this design embroidered onto a clean cap resting on a desk. Extreme close-up macrophotography with realistic thread texture.'
  },
  {
    id: 'tote',
    label: 'Tote bag',
    category: 'clothing',
    defaultPrompt: 'Print this design clearly onto the front of a minimalist canvas tote bag being carried by a person.'
  },
  {
    id: 'pin',
    label: 'Enamel pin',
    category: 'clothing',
    defaultPrompt: 'Create a small gold-edged enamel pin with this design on a denim jacket. Close-up macrophotography.'
  },
  {
    id: 'book',
    label: 'Book cover',
    category: 'print',
    defaultPrompt: 'Print this design onto the cover of a hardcover book resting on a coffee table, overhead view. No extra title, no extra text, just the design.'
  },
  {
    id: 'poster',
    label: 'Poster',
    category: 'print',
    defaultPrompt: 'Place this design inside a minimalist black frame hanging on a clean white gallery wall with professional lighting.'
  },
  {
    id: 'window',
    label: 'Window decal',
    category: 'print',
    defaultPrompt: 'Place this design as a small transparent vinyl decal sticker on a large glass coffee shop window. Close-up shot. No people.'
  },
  {
    id: 'billboard',
    label: 'Billboard',
    category: 'print',
    defaultPrompt: 'Put this design as a massive advertisement on a giant outdoor street billboard in a busy metropolitan city center.'
  },
  {
    id: 'mural',
    label: 'Mural',
    category: 'print',
    defaultPrompt: 'Paint this design as a large mural directly onto the side of a warm brick building in a sunny city street.'
  }
];

const visualMixerCategories: Array<{
  id: VisualMixerCategory;
  title: string;
  description: string;
  placeholder: string;
  ideas: string[];
}> = [
  {
    id: 'subject',
    title: 'Subject',
    description: 'Main person, product, object, or character.',
    placeholder: 'Example: a premium skincare jar with a glass lid',
    ideas: ['SAVI hydration cream jar', 'a futuristic desk lamp', 'a fashion portrait with soft makeup']
  },
  {
    id: 'scene',
    title: 'Scene',
    description: 'Environment, location, lighting, or moment.',
    placeholder: 'Example: warm spa bathroom with natural morning light',
    ideas: ['warm wooden bathroom shelf', 'minimal studio with white glass', 'modern cafe with soft window light']
  },
  {
    id: 'style',
    title: 'Style',
    description: 'Visual language, mood, material, or art direction.',
    placeholder: 'Example: editorial product photography, clean, premium, realistic',
    ideas: ['editorial product photography', 'cinematic soft realism', 'minimal 3D clay render']
  }
];

const emptyVisualMixerBriefs: Record<VisualMixerCategory, string> = {
  subject: '',
  scene: '',
  style: ''
};

const promptIdeas: Record<ImageToolId, string[]> = {
  text_to_image: ['Premium AI workspace hero image', '3D isometric app icon set', 'Minimal product scene on white glass'],
  story_sketch: ['A founder sketches an idea, then turns it into a product scene', 'A skincare product goes from concept sketch to final campaign image', 'A calm cafe scene becomes a cinematic three-shot brand story'],
  sketch_to_image: ['A luxury skincare product on a soft studio table', 'A cinematic cafe scene with warm window light', 'A modern app dashboard floating on glass'],
  instagram_post: ['Create a premium launch caption from this image', 'Write a short reel hook and caption', 'Make this image into an Instagram carousel idea'],
  product_prompt: ['Luxury skincare bottle on white glass', 'Minimal tech product on a bright desk', 'Premium coffee packaging with soft morning light'],
  edit_image: ['Make the lighting softer and premium', 'Turn this into a clean studio photo', 'Make the scene more luxurious'],
  remove_background: ['Remove only the background', 'Place subject on soft white studio background', 'Change background to a modern office'],
  remove_object: ['Remove the unwanted cup on the table', 'Remove the person in the background', 'Remove the logo from the wall'],
  change_style: ['Change clothes to a black business suit', 'Change outfit color to violet', 'Make this look like a luxury campaign'],
  product_photo: ['Create a glossy product ad with reflections', 'Place product on a marble surface', 'Create a social ad image with empty copy space'],
  mockup: ['Place my logo on a premium laptop mockup', 'Put this design on a canvas tote bag', 'Create a billboard mockup in a city street'],
  visual_mixer: ['Blend these into a premium launch campaign image', 'Create a cohesive cinematic hero image', 'Make a polished product scene from the selected references'],
  text_design: ['Create a clean launch poster for SAVI', 'Design a readable Instagram quote card', 'Create a bold app promo banner'],
  variations: ['Create 4 consistent ad variations', 'Make seasonal color variations', 'Create square and vertical versions']
};

const templateToImageTool: Record<string, ImageToolId> = {
  'instagram-from-image': 'instagram_post',
  'product-photo-prompt': 'product_prompt',
  'image-edit': 'edit_image',
  'remove-background': 'remove_background',
  'remove-object': 'remove_object',
  'change-style': 'change_style'
};

const textOnlyImageTools = new Set<ImageToolId>(['instagram_post', 'product_prompt']);

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
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    };
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function makeClientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createStoryShot(updates: Partial<StoryShot> = {}): StoryShot {
  return {
    id: makeClientId(),
    prompt: '',
    isGenerating: false,
    ...updates
  };
}

function createSketchResult(updates: Partial<SketchResult> = {}): SketchResult {
  return {
    id: makeClientId(),
    dataUrl: '',
    filename: 'savi-sketch-image.png',
    sketchDataUrl: '',
    prompt: '',
    status: 'loading',
    model: 'nano-banana',
    ...updates
  };
}

function imageReferenceFromDataUrl(imageUrl?: string, name = 'previous-shot.png') {
  if (!imageUrl?.startsWith('data:')) return undefined;
  const [header, data] = imageUrl.split(',');
  const mimeType = header.match(/^data:(.*?);base64$/)?.[1] || 'image/png';
  if (!data) return undefined;
  return { data, mimeType, name };
}

export function ImageToolsStudio({
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
  const [toolId, setToolId] = useState<ImageToolId>('text_to_image');
  const [isToolOpen, setIsToolOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<(typeof aspectRatios)[number]>('1:1');
  const [quality, setQuality] = useState<(typeof qualities)[number]>('1080');
  const [style, setStyle] = useState<(typeof styles)[number]>('Realistic');
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [outputBrief, setOutputBrief] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [generatedImageName, setGeneratedImageName] = useState('');
  const [generationMode, setGenerationMode] = useState('');
  const [imageOutputs, setImageOutputs] = useState<ImageStudioOutput[]>([]);
  const [storyInstructions, setStoryInstructions] = useState('Realistic cinematic frames, consistent lighting, premium visual style.');
  const [storyShots, setStoryShots] = useState<StoryShot[]>(() => [
    createStoryShot({ placeholder: 'Example: A red pomegranate hangs from a tree in golden afternoon light, close cinematic frame.' })
  ]);
  const [draggedStoryShotId, setDraggedStoryShotId] = useState<string | null>(null);
  const [dragTargetStoryShotId, setDragTargetStoryShotId] = useState<string | null>(null);
  const sketchCanvasRef = useRef<SketchCanvasHandle>(null);
  const [sketchTool, setSketchTool] = useState<SketchCanvasTool>('pencil');
  const [sketchColor, setSketchColor] = useState('#ffffff');
  const [sketchBrushSize, setSketchBrushSize] = useState<(typeof sketchBrushSizes)[number]>(10);
  const [sketchText, setSketchText] = useState('SAVI');
  const [sketchPrompt, setSketchPrompt] = useState('');
  const [sketchAdditionalPrompt, setSketchAdditionalPrompt] = useState('Transform this drawing into a polished realistic image. Preserve the sketch composition and make it useful for a premium brand.');
  const [sketchModel, setSketchModel] = useState<'nano-banana' | 'nano-banana-pro'>('nano-banana');
  const [sketchResults, setSketchResults] = useState<SketchResult[]>([]);
  const [isSketchEmpty, setIsSketchEmpty] = useState(true);
  const [isSketchGenerating, setIsSketchGenerating] = useState(false);
  const [mockupDesignUrl, setMockupDesignUrl] = useState('');
  const [mockupDesignName, setMockupDesignName] = useState('');
  const [mockupDesignFile, setMockupDesignFile] = useState<File | null>(null);
  const [mockupSurfaceUrl, setMockupSurfaceUrl] = useState('');
  const [mockupSurfaceName, setMockupSurfaceName] = useState('');
  const [mockupSurfaceFile, setMockupSurfaceFile] = useState<File | null>(null);
  const [mockupCategory, setMockupCategory] = useState<MockupCategory>('devices');
  const [mockupPresetId, setMockupPresetId] = useState('laptop');
  const [mockupModel, setMockupModel] = useState<MockupModel>('nano-banana');
  const [visualMixerBriefs, setVisualMixerBriefs] = useState<Record<VisualMixerCategory, string>>({ ...emptyVisualMixerBriefs });
  const [visualMixerIngredients, setVisualMixerIngredients] = useState<Record<VisualMixerCategory, VisualMixerIngredient[]>>({
    subject: [],
    scene: [],
    style: []
  });
  const [visualMixerPrompt, setVisualMixerPrompt] = useState('');
  const [visualMixerResults, setVisualMixerResults] = useState<VisualMixerResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const workAreaRef = useRef<HTMLDivElement | null>(null);
  const pendingTextToImageRequestRef = useRef<PendingTextToImageRequest | null>(null);

  const selectedTool = imageTools.find((tool) => tool.id === toolId) ?? imageTools[0];
  const selectedMockupPreset = mockupPresets.find((item) => item.id === mockupPresetId) ?? mockupPresets[0];
  const creditCost = useMemo(() => {
    if (selectedTool.id === 'text_to_image') return getSaviTextToImageCreditCost(quality);
    if (textOnlyImageTools.has(selectedTool.id)) return selectedTool.cost;
    const qualityAdd = quality === '4K' ? 140 : quality === '1080' ? 50 : 0;
    const mockupModelAdd = selectedTool.id === 'mockup' && mockupModel === 'nano-banana-pro' ? 90 : 0;
    return selectedTool.cost + qualityAdd + mockupModelAdd;
  }, [mockupModel, quality, selectedTool.cost, selectedTool.id]);

  useEffect(() => {
    const closeActiveTool = () => {
      setIsToolOpen(false);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    };
    window.addEventListener(CLOSE_ACTIVE_TOOL_EVENT, closeActiveTool);
    return () => window.removeEventListener(CLOSE_ACTIVE_TOOL_EVENT, closeActiveTool);
  }, []);

  function clearImageInput() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl('');
    setImageName('');
    setImageFile(null);
  }

  function clearGeneratedImage() {
    setOutputBrief('');
    setGeneratedImageUrl('');
    setGeneratedImageName('');
    setGenerationMode('');
  }

  function resetStorySketch() {
    setStoryInstructions('Realistic cinematic frames, consistent lighting, premium visual style.');
    setStoryShots([createStoryShot({ placeholder: 'Example: A red pomegranate hangs from a tree in golden afternoon light, close cinematic frame.' })]);
    setDraggedStoryShotId(null);
    setDragTargetStoryShotId(null);
  }

  function resetSketchStudio() {
    setSketchTool('pencil');
    setSketchColor('#ffffff');
    setSketchBrushSize(10);
    setSketchText('SAVI');
    setSketchPrompt('');
    setSketchAdditionalPrompt('Transform this drawing into a polished realistic image. Preserve the sketch composition and make it useful for a premium brand.');
    setSketchModel('nano-banana');
    setSketchResults([]);
    setIsSketchEmpty(true);
    sketchCanvasRef.current?.clear();
  }

  function resetMockupStudio() {
    if (mockupDesignUrl) URL.revokeObjectURL(mockupDesignUrl);
    if (mockupSurfaceUrl) URL.revokeObjectURL(mockupSurfaceUrl);
    setMockupDesignUrl('');
    setMockupDesignName('');
    setMockupDesignFile(null);
    setMockupSurfaceUrl('');
    setMockupSurfaceName('');
    setMockupSurfaceFile(null);
    setMockupCategory('devices');
    setMockupPresetId('laptop');
    setMockupModel('nano-banana');
  }

  function resetVisualMixerStudio() {
    for (const item of Object.values(visualMixerIngredients).flat()) {
      URL.revokeObjectURL(item.url);
    }
    setVisualMixerBriefs({ ...emptyVisualMixerBriefs });
    setVisualMixerIngredients({ subject: [], scene: [], style: [] });
    setVisualMixerPrompt('');
    setVisualMixerResults([]);
  }

  function selectTool(nextTool: ImageToolId, nextPrompt = '') {
    clearImageInput();
    setToolId(nextTool);
    setIsToolOpen(true);
    setPrompt(nextPrompt);
    clearGeneratedImage();
    resetStorySketch();
    resetSketchStudio();
    resetMockupStudio();
    resetVisualMixerStudio();
    setError('');
    window.requestAnimationFrame(() => workAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  useEffect(() => {
    if (!template || templateLaunchKey === 0) return;
    const nextTool = templateToImageTool[template.id];
    if (!nextTool) return;

    selectTool(nextTool, template.prompt);
  }, [template, templateLaunchKey]);

  function loadImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    setImageFile(file);
    setError('');
    clearGeneratedImage();
  }

  function loadMockupDesign(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }
    if (mockupDesignUrl) URL.revokeObjectURL(mockupDesignUrl);
    setMockupDesignUrl(URL.createObjectURL(file));
    setMockupDesignName(file.name);
    setMockupDesignFile(file);
    setError('');
    clearGeneratedImage();
  }

  function loadMockupSurface(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }
    if (mockupSurfaceUrl) URL.revokeObjectURL(mockupSurfaceUrl);
    setMockupSurfaceUrl(URL.createObjectURL(file));
    setMockupSurfaceName(file.name);
    setMockupSurfaceFile(file);
    setError('');
    clearGeneratedImage();
  }

  function loadVisualMixerImages(category: VisualMixerCategory, files: FileList | null) {
    if (!files?.length) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, 6);
    if (!imageFiles.length) {
      setError('Please upload image files.');
      return;
    }

    setVisualMixerIngredients((current) => ({
      ...current,
      [category]: [
        ...current[category],
        ...imageFiles.map((file) => ({
          id: makeClientId(),
          category,
          url: URL.createObjectURL(file),
          file,
          name: file.name,
          active: true
        }))
      ].slice(-8)
    }));
    setError('');
    clearGeneratedImage();
  }

  function toggleVisualMixerIngredient(category: VisualMixerCategory, id: string) {
    setVisualMixerIngredients((current) => ({
      ...current,
      [category]: current[category].map((item) => (item.id === id ? { ...item, active: !item.active } : item))
    }));
  }

  function removeVisualMixerIngredient(category: VisualMixerCategory, id: string) {
    setVisualMixerIngredients((current) => {
      const removed = current[category].find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return {
        ...current,
        [category]: current[category].filter((item) => item.id !== id)
      };
    });
  }

  async function loadSketchReference(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      sketchCanvasRef.current?.addImage(dataUrl);
      setSketchTool('select');
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load image.');
    }
  }

  async function generateSketchImage(existingPrompt?: string, existingSketchDataUrl?: string, existingModel?: 'nano-banana' | 'nano-banana-pro') {
    const sketchDataUrl = existingSketchDataUrl || sketchCanvasRef.current?.getCanvasData();
    if (!sketchDataUrl || (!existingSketchDataUrl && isSketchEmpty)) {
      setError('Draw something or upload a reference image first.');
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

    const cleanPrompt = (existingPrompt ?? sketchPrompt).trim();
    const finalPrompt = [
      cleanPrompt || 'Create a polished image from this sketch.',
      sketchAdditionalPrompt.trim(),
      existingModel === 'nano-banana-pro' || sketchModel === 'nano-banana-pro'
        ? 'Use the more detailed pro direction: cleaner lighting, stronger realism, more refined materials, and better composition.'
        : 'Use fast creative refinement while keeping the image clean and coherent.'
    ]
      .filter(Boolean)
      .join('\n\n');
    const resultId = makeClientId();
    const model = existingModel || sketchModel;
    const sketchBase64 = sketchDataUrl.includes(',') ? sketchDataUrl.split(',')[1] : sketchDataUrl;

    setError('');
    setIsSketchGenerating(true);
    setSketchResults((current) => [
      createSketchResult({
        id: resultId,
        sketchDataUrl,
        prompt: cleanPrompt,
        model
      }),
      ...current
    ]);

    try {
      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          toolId: 'sketch_to_image',
          aspectRatio: '16:9',
          quality,
          style: `${style} ${model === 'nano-banana-pro' ? 'Nano Banana Pro' : 'Nano Banana Fast'} sketch refinement`,
          referenceImage: {
            data: sketchBase64,
            mimeType: 'image/png',
            name: 'savi-sketch-canvas.png'
          }
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        image?: string;
        filename?: string;
        error?: string;
      };

      if (!response.ok || !data.image) {
        throw new Error(data.error || 'Sketch refinement failed.');
      }
      const resultImage = data.image;

      setSketchResults((current) =>
        current.map((item) =>
          item.id === resultId
            ? {
                ...item,
                dataUrl: resultImage,
                filename: data.filename || 'savi-sketch-image.png',
                status: 'ready'
              }
            : item
        )
      );
      recordMediaItem({
        type: 'image',
        title: 'Sketch to image',
        source: 'Images',
        url: resultImage,
        filename: data.filename || 'savi-sketch-image.png'
      });
      onCreditsChange(credits - creditCost);
    } catch (sketchError) {
      setSketchResults((current) => current.map((item) => (item.id === resultId ? { ...item, status: 'error' } : item)));
      setError(sketchError instanceof Error ? sketchError.message : 'Sketch refinement failed.');
    } finally {
      setIsSketchGenerating(false);
    }
  }

  async function generate() {
    setError('');
    const isProtectedTextToImage = selectedTool.id === 'text_to_image';
    if (selectedTool.needsImage && !imageUrl) {
      setError('Add an image first for this tool.');
      return;
    }
    if (!prompt.trim() && !['remove_background', 'variations'].includes(selectedTool.id)) {
      setError('Write what you want SAVI to create or change.');
      return;
    }
    if (!isProtectedTextToImage && credits < creditCost) {
      setShowUpgrade(true);
      return;
    }
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    setIsGenerating(true);
    setGeneratedImageUrl('');
    setGeneratedImageName('');
    setGenerationMode('');

    try {
      const requestKey = [
        prompt.trim(),
        aspectRatio,
        quality,
        style,
        imageFile?.name || '',
        imageFile?.size || '',
        imageFile?.lastModified || ''
      ].join('|');
      const pendingRequest = pendingTextToImageRequestRef.current;
      const clientRequestId = isProtectedTextToImage
        ? pendingRequest?.key === requestKey
          ? pendingRequest.clientRequestId
          : makeClientId()
        : undefined;
      if (isProtectedTextToImage && clientRequestId) {
        pendingTextToImageRequestRef.current = { key: requestKey, clientRequestId };
      }

      const referenceImage = imageFile
        ? {
            data: await readFileAsBase64(imageFile),
            mimeType: imageFile.type || 'image/png',
            name: imageFile.name
          }
        : undefined;

      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt.trim() || selectedTool.title,
          toolId: selectedTool.id,
          aspectRatio,
          quality,
          style,
          referenceImage,
          clientRequestId
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        image?: string;
        filename?: string;
        mode?: string;
        error?: string;
        availableCredits?: number;
        category?: string;
        jobId?: string;
      };

      if (!response.ok || !data.image) {
        if (
          isProtectedTextToImage &&
          ['INVALID_INPUT', 'UNSUPPORTED_INPUT', 'POLICY_REJECTION', 'INSUFFICIENT_CREDITS', 'AUTH_REQUIRED'].includes(data.category || '')
        ) {
          pendingTextToImageRequestRef.current = null;
        }
        if (response.status === 202 && data.jobId) {
          throw new Error('This image is still being finalized. Try again in a moment.');
        }
        throw new Error(data.error || 'Image generation failed.');
      }
      const resultImage = data.image;
      const resultFilename = data.filename || 'savi-generated-image.png';

      const brief = [
      `Tool: ${selectedTool.title}`,
      `Model direction: Nano Banana image generation and conversational editing`,
      `User request: ${prompt.trim() || selectedTool.title}`,
      `Image input: ${imageName || 'No reference image'}`,
      `Aspect ratio: ${aspectRatio}`,
      `Quality: ${quality}`,
      `Style: ${style}`,
      '',
      'Production brief:',
      selectedTool.hiddenInstruction,
      '',
      'Output rules:',
      '- Keep the main subject consistent when editing.',
      '- Do not overwrite the original image.',
      '- Save the generated output separately.',
      '- Make the result clean enough for marketing use.'
      ].join('\n');

      setOutputBrief(brief);
      setGeneratedImageUrl(resultImage);
      setGeneratedImageName(resultFilename);
      setGenerationMode(data.mode || 'gemini');
      setImageOutputs((current) => [
        {
          id: makeClientId(),
          type: 'image',
          url: resultImage,
          title: selectedTool.title,
          subtitle: `${quality} · ${aspectRatio} · ${style}`,
          filename: resultFilename,
          toolId: selectedTool.id
        },
        ...current
      ]);
      recordMediaItem({
        type: 'image',
        title: selectedTool.title,
        source: 'Images',
        url: resultImage,
        filename: resultFilename
      });
      if (isProtectedTextToImage && typeof data.availableCredits === 'number') {
        onCreditsChange(data.availableCredits);
      } else if (!isProtectedTextToImage) {
        onCreditsChange(credits - creditCost);
      }
      if (isProtectedTextToImage) pendingTextToImageRequestRef.current = null;
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Image generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateMockup() {
    setError('');
    if (!mockupDesignFile) {
      setError('Upload a logo or design first.');
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

    const customInstruction = prompt.trim();
    const finalPrompt = [
      selectedMockupPreset.defaultPrompt,
      customInstruction ? `User instruction: ${customInstruction}` : '',
      mockupSurfaceFile ? 'Use the second uploaded image as the target surface or environment context.' : '',
      mockupModel === 'nano-banana-pro'
        ? 'Use the pro mockup direction: stronger realism, cleaner perspective matching, natural shadows, and premium product photography polish.'
        : 'Use the fast mockup direction: clean placement, realistic lighting, and clear brand visibility.',
      'Do not add unrelated logos, random text, watermark labels, or extra brand names.'
    ]
      .filter(Boolean)
      .join('\n\n');

    setIsGenerating(true);
    setGeneratedImageUrl('');
    setGeneratedImageName('');
    setGenerationMode('');

    try {
      const referenceImages = [
        {
          data: await readFileAsBase64(mockupDesignFile),
          mimeType: mockupDesignFile.type || 'image/png',
          name: mockupDesignFile.name
        }
      ];

      if (mockupSurfaceFile) {
        referenceImages.push({
          data: await readFileAsBase64(mockupSurfaceFile),
          mimeType: mockupSurfaceFile.type || 'image/png',
          name: mockupSurfaceFile.name
        });
      }

      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          toolId: 'mockup',
          aspectRatio: '16:9',
          quality,
          style: `${style} ${mockupModel === 'nano-banana-pro' ? 'Nano Banana Pro' : 'Nano Banana Fast'} mockup`,
          referenceImages
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        image?: string;
        filename?: string;
        mode?: string;
        error?: string;
      };

      if (!response.ok || !data.image) {
        throw new Error(data.error || 'Mockup generation failed.');
      }
      const resultImage = data.image;
      const resultFilename = data.filename || 'savi-mockup.png';

      const brief = [
        `Tool: Mockup`,
        `Preset: ${selectedMockupPreset.label}`,
        `Model direction: ${mockupModel === 'nano-banana-pro' ? 'Nano Banana Pro' : 'Nano Banana Fast'}`,
        `Design input: ${mockupDesignName}`,
        `Surface input: ${mockupSurfaceName || 'Preset-generated surface'}`,
        `Quality: ${quality}`,
        `Style: ${style}`,
        '',
        'Instruction:',
        finalPrompt,
        '',
        'Output rules:',
        '- Keep the uploaded design readable and clearly placed.',
        '- Match perspective, shadows, material texture, and lighting.',
        '- Save the output separately without changing the original upload.'
      ].join('\n');

      setOutputBrief(brief);
      setGeneratedImageUrl(resultImage);
      setGeneratedImageName(resultFilename);
      setGenerationMode(data.mode || 'gemini');
      setImageOutputs((current) => [
        {
          id: makeClientId(),
          type: 'image',
          url: resultImage,
          title: `${selectedMockupPreset.label} mockup`,
          subtitle: `${quality} · ${style}`,
          filename: resultFilename,
          toolId: 'mockup'
        },
        ...current
      ]);
      recordMediaItem({
        type: 'image',
        title: `${selectedMockupPreset.label} mockup`,
        source: 'Images',
        url: resultImage,
        filename: resultFilename
      });
      onCreditsChange(credits - creditCost);
    } catch (mockupError) {
      setError(mockupError instanceof Error ? mockupError.message : 'Mockup generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateVisualMixer() {
    setError('');
    const activeIngredients = visualMixerCategories.flatMap((category) =>
      visualMixerIngredients[category.id]
        .filter((item) => item.active)
        .map((item) => ({
          ...item,
          title: category.title
        }))
    );
    const briefLines = visualMixerCategories
      .map((category) => {
        const value = visualMixerBriefs[category.id].trim();
        return value ? `${category.title}: ${value}` : '';
      })
      .filter(Boolean);

    if (!activeIngredients.length && !briefLines.length && !visualMixerPrompt.trim()) {
      setError('Add at least one image or describe a subject, scene, or style.');
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

    const finalPrompt = [
      'Create one cohesive premium image by blending the chosen visual ingredients.',
      activeIngredients.length
        ? `Use the uploaded reference images by category: ${activeIngredients.map((item, index) => `${index + 1}. ${item.title} - ${item.name}`).join('; ')}.`
        : '',
      briefLines.length ? briefLines.join('\n') : '',
      visualMixerPrompt.trim() ? `Final direction: ${visualMixerPrompt.trim()}` : '',
      `Aspect ratio: ${aspectRatio}. Style preset: ${style}. Quality target: ${quality}.`,
      'Do not make a collage. Do not show separate panels. Make the result feel like a single natural image.'
    ]
      .filter(Boolean)
      .join('\n\n');

    const resultId = makeClientId();
    setIsGenerating(true);
    setVisualMixerResults((current) => [
      {
        id: resultId,
        dataUrl: '',
        filename: 'savi-visual-mixer.png',
        prompt: visualMixerPrompt.trim() || briefLines.join(' · ') || 'Visual mixer image',
        status: 'loading'
      },
      ...current
    ]);

    try {
      const referenceImages = [];
      for (const item of activeIngredients.slice(0, 6)) {
        referenceImages.push({
          data: await readFileAsBase64(item.file),
          mimeType: item.file.type || 'image/png',
          name: `${item.title.toLowerCase()}-${item.name}`
        });
      }

      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          toolId: 'visual_mixer',
          aspectRatio,
          quality,
          style: `${style} visual mixer`,
          referenceImages
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        image?: string;
        filename?: string;
        error?: string;
      };

      if (!response.ok || !data.image) {
        throw new Error(data.error || 'Visual mixer generation failed.');
      }
      const resultImage = data.image;

      setVisualMixerResults((current) =>
        current.map((item) =>
          item.id === resultId
            ? {
                ...item,
                dataUrl: resultImage,
                filename: data.filename || 'savi-visual-mixer.png',
                status: 'ready'
              }
            : item
        )
      );
      recordMediaItem({
        type: 'image',
        title: 'Visual mixer',
        source: 'Images',
        url: resultImage,
        filename: data.filename || 'savi-visual-mixer.png'
      });
      onCreditsChange(credits - creditCost);
    } catch (mixerError) {
      setVisualMixerResults((current) => current.map((item) => (item.id === resultId ? { ...item, status: 'error' } : item)));
      setError(mixerError instanceof Error ? mixerError.message : 'Visual mixer generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  function updateStoryShot(id: string, updates: Partial<StoryShot>) {
    setStoryShots((current) => current.map((shot) => (shot.id === id ? { ...shot, ...updates } : shot)));
  }

  function addStoryShot() {
    setStoryShots((current) => [
      ...current,
      createStoryShot({ placeholder: 'Example: The child kneels down, reaches for the fruit, and the camera moves closer through the leaves.' })
    ]);
    setError('');
  }

  function addFollowUpShot(id: string) {
    setStoryShots((current) => {
      const index = current.findIndex((shot) => shot.id === id);
      if (index === -1) return current;
      const parent = current[index];
      if (!parent.imageUrl) return current;

      const next = createStoryShot({
        parentImageUrl: parent.imageUrl,
        imageUrl: parent.imageUrl,
        placeholder: 'Example: Continue the same scene with the next natural action, same character, light, and camera language.'
      });
      const copy = [...current];
      copy.splice(index + 1, 0, next);
      return copy;
    });
    setError('');
  }

  function deleteStoryShot(id: string) {
    setStoryShots((current) => {
      const next = current.filter((shot) => shot.id !== id);
      return next.length
        ? next
        : [createStoryShot({ placeholder: 'Example: A red pomegranate hangs from a tree in golden afternoon light, close cinematic frame.' })];
    });
    setError('');
  }

  function handleStoryDragEnd() {
    if (draggedStoryShotId && dragTargetStoryShotId && draggedStoryShotId !== dragTargetStoryShotId) {
      setStoryShots((current) => {
        const oldIndex = current.findIndex((shot) => shot.id === draggedStoryShotId);
        const newIndex = current.findIndex((shot) => shot.id === dragTargetStoryShotId);
        if (oldIndex === -1 || newIndex === -1) return current;
        const copy = [...current];
        const [removed] = copy.splice(oldIndex, 1);
        copy.splice(newIndex, 0, removed);
        return copy;
      });
    }
    setDraggedStoryShotId(null);
    setDragTargetStoryShotId(null);
  }

  async function generateStoryShot(id: string) {
    const shot = storyShots.find((item) => item.id === id);
    if (!shot || !shot.prompt.trim()) {
      setError('Write a prompt for this shot first.');
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
    updateStoryShot(id, { isGenerating: true });

    try {
      const parentReference = imageReferenceFromDataUrl(shot.parentImageUrl, 'previous-story-shot.png');
      const finalPrompt = [
        shot.parentImageUrl ? 'Continue the story from the previous reference image. Keep the same realistic visual world, lighting, and subject continuity.' : 'Create the first realistic shot of a visual story sequence.',
        `Global style: ${storyInstructions.trim() || 'Realistic cinematic frames, consistent lighting, premium visual style.'}`,
        `Selected style preset: ${style}.`,
        `Shot prompt: ${shot.prompt.trim()}`
      ].join('\n\n');

      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          toolId: 'story_sketch',
          aspectRatio: '16:9',
          quality,
          style: `${style} realistic storyboard`,
          referenceImage: parentReference
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        image?: string;
        filename?: string;
        error?: string;
      };

      if (!response.ok || !data.image) {
        throw new Error(data.error || 'Story shot generation failed.');
      }
      const resultImage = data.image;
      const resultFilename = data.filename || 'savi-story-shot.png';

      updateStoryShot(id, {
        imageUrl: resultImage,
        imageName: resultFilename,
        isGenerating: false,
        parentImageUrl: undefined
      });
      recordMediaItem({
        type: 'image',
        title: 'Story sketch shot',
        source: 'Images',
        url: resultImage,
        filename: resultFilename
      });
      onCreditsChange(credits - creditCost);
    } catch (storyError) {
      updateStoryShot(id, { isGenerating: false });
      setError(storyError instanceof Error ? storyError.message : 'Story shot generation failed.');
    }
  }

  function renderStorySketchTool() {
    return (
      <div className="mt-5 space-y-5">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Visual style</p>
            <textarea
              value={storyInstructions}
              onChange={(event) => setStoryInstructions(event.target.value)}
              rows={4}
              placeholder="Example: warm realistic storybook frames, consistent child character, golden garden light, soft handheld camera feeling."
              className="mt-3 min-h-[120px] w-full resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ToolSelect label="Quality" value={quality} options={qualities} onChange={setQuality} />
              <ToolSelect label="Style" value={style} options={styles} onChange={setStyle} />
            </div>
          </div>

          <div className="rounded-[30px] border border-violet-100 bg-white/65 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Story board</p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">Build shot by shot</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={addStoryShot} className="rounded-full bg-violet-600 px-5 py-3 text-sm font-black text-white">
                  Add shot
                </button>
                <button type="button" onClick={resetStorySketch} className="rounded-full border border-violet-100 bg-white px-5 py-3 text-sm font-black text-slate-700">
                  Reset
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Generate a frame, then use Next shot to continue from that image. Each generation costs <strong>{creditCost} credits</strong>.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {storyShots.map((shot, index) => {
            const hasGeneratedImage = Boolean(shot.imageUrl && !shot.parentImageUrl);
            const canGenerate = !shot.isGenerating && shot.prompt.trim().length > 0;

            return (
              <article
                key={shot.id}
                draggable={storyShots.length > 1}
                onDragStart={(event) => {
                  setDraggedStoryShotId(shot.id);
                  event.dataTransfer.setData('text/plain', shot.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedStoryShotId !== shot.id) setDragTargetStoryShotId(shot.id);
                }}
                onDragEnd={handleStoryDragEnd}
                className={`rounded-[28px] border p-3 transition ${
                  dragTargetStoryShotId === shot.id
                    ? 'border-violet-300 bg-violet-100'
                    : 'border-violet-100 bg-white/70'
                }`}
              >
                <div className="relative aspect-video overflow-hidden rounded-[22px] border border-violet-100 bg-gradient-to-br from-violet-100 via-white to-blue-100">
                  {shot.imageUrl ? (
                    <img src={shot.imageUrl} alt={shot.prompt || `Shot ${index + 1}`} className={`h-full w-full object-cover ${shot.parentImageUrl ? 'opacity-50' : ''}`} />
                  ) : (
                    <div className="grid h-full place-items-center px-6 text-center text-sm font-bold text-slate-500">
                      {shot.parentImageUrl ? 'Previous image is ready. Describe the next moment.' : 'Describe and generate this shot.'}
                    </div>
                  )}
                  {shot.isGenerating && (
                    <div className="absolute inset-0 grid place-items-center bg-white/65 backdrop-blur-sm">
                      <span className="text-3xl font-black tracking-[0.22em] text-violet-700 animate-pulse">...</span>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-black text-white">Shot {index + 1}</span>
                </div>

                <div className="mt-3 rounded-[20px] border border-violet-100 bg-white/80 p-3">
                  <textarea
                    value={shot.prompt}
                    onChange={(event) => updateStoryShot(shot.id, { prompt: event.target.value })}
                    readOnly={shot.isGenerating || hasGeneratedImage}
                    rows={3}
                    placeholder={shot.placeholder || 'Example: The child reaches down and carefully picks up the fallen pomegranate.'}
                    className="min-h-[82px] w-full resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => generateStoryShot(shot.id)}
                      disabled={!canGenerate || hasGeneratedImage}
                      className="rounded-full bg-violet-600 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {shot.isGenerating ? 'Generating...' : 'Generate'}
                    </button>
                    <div className="flex items-center gap-1">
                      {hasGeneratedImage && (
                        <>
                          <button type="button" onClick={() => addFollowUpShot(shot.id)} className="mini-tool-button">Next shot</button>
                          <a href={shot.imageUrl} download={shot.imageName || `savi-story-shot-${index + 1}.png`} className="mini-tool-button">
                            Download
                          </a>
                        </>
                      )}
                      <button type="button" onClick={() => deleteStoryShot(shot.id)} className="mini-tool-button">
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

  function renderSketchToImageTool() {
    const sketchTools: Array<{ id: SketchCanvasTool; label: string }> = [
      { id: 'select', label: 'Select' },
      { id: 'pencil', label: 'Pencil' },
      { id: 'rectangle', label: 'Rect' },
      { id: 'circle', label: 'Circle' },
      { id: 'text', label: 'Text' }
    ];

    return (
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Sketch canvas</p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">Draw, import, then refine</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => sketchCanvasRef.current?.undo()} className="mini-tool-button">Undo</button>
                <button type="button" onClick={() => sketchCanvasRef.current?.redo()} className="mini-tool-button">Redo</button>
                <button type="button" onClick={() => sketchCanvasRef.current?.deleteSelected()} className="mini-tool-button">Delete</button>
                <button type="button" onClick={() => sketchCanvasRef.current?.clear()} className="mini-tool-button">Clear</button>
              </div>
            </div>

            <div className="mt-4">
              <SketchCanvas
                ref={sketchCanvasRef}
                tool={sketchTool}
                color={sketchColor}
                brushSize={sketchBrushSize}
                textValue={sketchText}
                onContentChange={(empty) => setIsSketchEmpty(empty)}
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="flex flex-wrap gap-2">
                {sketchTools.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSketchTool(item.id)}
                    className={`rounded-full border px-4 py-2 text-xs font-black transition ${sketchTool === item.id ? 'border-violet-300 bg-violet-600 text-white' : 'border-violet-100 bg-white text-slate-600 hover:border-violet-300'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-slate-950 px-5 py-2 text-xs font-black text-white">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    loadSketchReference(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
                Import image
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_0.75fr_0.9fr]">
              <div className="rounded-[22px] border border-violet-100 bg-white/70 p-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Color</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sketchColors.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-label={`Use ${item}`}
                      onClick={() => setSketchColor(item)}
                      className={`h-8 w-8 rounded-full border transition ${sketchColor === item ? 'scale-110 border-violet-500 ring-2 ring-violet-200' : 'border-violet-100'}`}
                      style={{ backgroundColor: item }}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-violet-100 bg-white/70 p-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Brush</p>
                <div className="mt-3 flex gap-2">
                  {sketchBrushSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSketchBrushSize(size)}
                      className={`grid h-8 w-10 place-items-center rounded-full border transition ${sketchBrushSize === size ? 'border-violet-300 bg-violet-600' : 'border-violet-100 bg-white'}`}
                    >
                      <span className={`rounded-full ${sketchBrushSize === size ? 'bg-white' : 'bg-slate-600'}`} style={{ width: Math.max(4, size / 2), height: Math.max(4, size / 2) }} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-violet-100 bg-white/70 p-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Text</p>
                <input
                  value={sketchText}
                  onChange={(event) => setSketchText(event.target.value)}
                  className="mt-3 w-full rounded-2xl border border-violet-100 bg-white px-4 py-2 text-sm font-bold text-slate-800 outline-none focus:border-violet-300"
                  placeholder="Example: SAVI"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
            <textarea
              value={sketchPrompt}
              onChange={(event) => setSketchPrompt(event.target.value)}
              rows={4}
              placeholder={selectedTool.promptPlaceholder}
              className="min-h-[120px] w-full resize-none bg-transparent text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  generateSketchImage();
                }
              }}
            />
          </div>

          <div className="rounded-[26px] border border-violet-100 bg-white/65 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Refine settings</p>
            <textarea
              value={sketchAdditionalPrompt}
              onChange={(event) => setSketchAdditionalPrompt(event.target.value)}
              rows={3}
              className="mt-3 min-h-[88px] w-full resize-none rounded-[20px] border border-violet-100 bg-white/75 px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-violet-300"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ToolSelect label="Quality" value={quality} options={qualities} onChange={setQuality} />
              <ToolSelect label="Style" value={style} options={styles} onChange={setStyle} />
              <div className="rounded-[24px] border border-violet-100 bg-white/65 p-3">
                <p className="px-1 text-xs font-black uppercase tracking-[0.16em] text-violet-500">Model</p>
                <div className="mt-2 grid gap-2">
                  {(['nano-banana', 'nano-banana-pro'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSketchModel(item)}
                      className={`rounded-2xl px-3 py-2 text-sm font-black transition ${sketchModel === item ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-violet-50'}`}
                    >
                      {item === 'nano-banana-pro' ? 'Pro' : 'Fast'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 pt-3">
              <span className="text-xs font-black text-slate-500">{creditCost} credits</span>
              <button
                type="button"
                disabled={isSketchGenerating}
                onClick={() => generateSketchImage()}
                className="rounded-full border border-violet-200 bg-white/70 px-5 py-2.5 text-xs font-black text-violet-700 shadow-[0_12px_28px_rgba(124,58,237,0.13)] backdrop-blur transition hover:bg-violet-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSketchGenerating ? 'Refining...' : 'Generate'}
              </button>
            </div>
            {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          </div>

          <div className="space-y-3">
            {sketchResults.length === 0 ? (
              <div className="grid min-h-[180px] place-items-center rounded-[30px] border border-dashed border-violet-200 bg-white/55 px-6 text-center text-sm font-bold text-slate-400">
                Generated sketch results will appear here.
              </div>
            ) : (
              sketchResults.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-[30px] border border-violet-100 bg-white/75 p-3">
                  <div className="aspect-video overflow-hidden rounded-[22px] bg-gradient-to-br from-violet-100 via-white to-blue-100">
                    {item.status === 'loading' && <div className="grid h-full place-items-center text-3xl font-black tracking-[0.22em] text-violet-700 animate-pulse">...</div>}
                    {item.status === 'error' && <div className="grid h-full place-items-center px-6 text-center text-sm font-bold text-red-600">Generation failed. Try a clearer sketch or prompt.</div>}
                    {item.status === 'ready' && <img src={item.dataUrl} alt={item.prompt || 'Sketch result'} className="h-full w-full object-cover" />}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">{item.model === 'nano-banana-pro' ? 'Pro result' : 'Fast result'}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-bold text-slate-700">{item.prompt || 'Polished image from sketch'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.status === 'ready' && (
                        <>
                          <button type="button" onClick={() => sketchCanvasRef.current?.addImage(item.dataUrl)} className="mini-tool-button">Add to canvas</button>
                          <button type="button" onClick={() => generateSketchImage(item.prompt, item.sketchDataUrl, item.model)} className="mini-tool-button">Regenerate</button>
                          <a href={item.dataUrl} download={item.filename} className="mini-tool-button">Download</a>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderVisualMixerTool() {
    const activeCount = visualMixerCategories.reduce(
      (total, category) => total + visualMixerIngredients[category.id].filter((item) => item.active).length,
      0
    );

    return (
      <div className="mt-5 grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-[30px] border border-violet-100 bg-white/70 p-3">
          <div className="rounded-[24px] border border-violet-100 bg-white/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Visual mixer</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">Mix ingredients</h3>
              </div>
              <button type="button" onClick={resetVisualMixerStudio} className="mini-tool-button">
                Reset
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {visualMixerCategories.map((category) => {
              const items = visualMixerIngredients[category.id];

              return (
                <article key={category.id} className="rounded-[22px] border border-violet-100 bg-white/75 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">{category.title}</p>
                      <p className="mt-1 text-[11px] font-bold leading-4 text-slate-500">{category.description}</p>
                    </div>
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">
                      {items.filter((item) => item.active).length} active
                    </span>
                  </div>

                  <textarea
                    value={visualMixerBriefs[category.id]}
                    onChange={(event) =>
                      setVisualMixerBriefs((current) => ({
                        ...current,
                        [category.id]: event.target.value
                      }))
                    }
                    rows={3}
                    placeholder={category.placeholder}
                    className="mt-3 min-h-[72px] w-full resize-none rounded-[16px] border border-violet-100 bg-white/75 px-3 py-2 text-xs leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-violet-300"
                  />

                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-violet-100 bg-white/80 px-3 py-2 text-xs font-black text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.08)] transition hover:border-violet-300 hover:bg-violet-50">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        loadVisualMixerImages(category.id, event.target.files);
                        event.currentTarget.value = '';
                      }}
                    />
                    <span className="text-lg font-light leading-none">+</span>
                    Add
                  </label>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={`group relative aspect-square overflow-hidden rounded-[16px] border transition ${item.active ? 'border-violet-500 ring-2 ring-violet-100' : 'border-transparent opacity-55 hover:opacity-100'}`}
                      >
                        <button type="button" onClick={() => toggleVisualMixerIngredient(category.id, item.id)} className="absolute inset-0 z-0" aria-label={`Toggle ${item.name}`} />
                        <img src={item.url} alt="" className="h-full w-full object-cover" />
                        <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-2">
                          <span className="truncate rounded-full bg-slate-950/70 px-2 py-1 text-[9px] font-black text-white">{item.name}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeVisualMixerIngredient(category.id, item.id);
                            }}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-slate-900 opacity-0 shadow-sm transition group-hover:opacity-100"
                            aria-label={`Remove ${item.name}`}
                          >
                            x
                          </button>
                        </div>
                        {item.active && <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-violet-500 ring-2 ring-white" />}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Final direction</p>
            <textarea
              value={visualMixerPrompt}
              onChange={(event) => setVisualMixerPrompt(event.target.value)}
              rows={5}
              placeholder={selectedTool.promptPlaceholder}
              className="mt-3 min-h-[132px] w-full resize-none bg-transparent text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  generateVisualMixer();
                }
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 pt-3">
              <div>
                <p className="text-xs font-black text-slate-500">{creditCost} credits</p>
                <p className="mt-1 text-[11px] font-bold text-slate-400">{activeCount} active reference{activeCount === 1 ? '' : 's'}</p>
              </div>
              <button
                type="button"
                disabled={isGenerating}
                onClick={generateVisualMixer}
                className="rounded-full border border-violet-200 bg-white/70 px-5 py-2.5 text-xs font-black text-violet-700 shadow-[0_12px_28px_rgba(124,58,237,0.13)] backdrop-blur transition hover:bg-violet-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? 'Mixing...' : 'Generate'}
              </button>
            </div>
            {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <ToolSelect label="Ratio" value={aspectRatio} options={aspectRatios} onChange={setAspectRatio} />
            <ToolSelect label="Quality" value={quality} options={qualities} onChange={setQuality} />
            <ToolSelect label="Style" value={style} options={styles} onChange={setStyle} />
          </div>

          <div className="space-y-3">
            {visualMixerResults.some((item) => item.status === 'loading') && (
              <div className="rounded-[24px] border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-black text-violet-700">
                Mixing selected ingredients...
              </div>
            )}
            {visualMixerResults.some((item) => item.status === 'ready') ? (
              <OutputGallery
                title="Visual mixer outputs"
                items={visualMixerResults
                  .filter((item) => item.status === 'ready')
                  .map((item) => ({
                    id: item.id,
                    type: 'image' as const,
                    url: item.dataUrl,
                    title: 'Visual mixer',
                    subtitle: item.prompt,
                    filename: item.filename
                  }))}
              />
            ) : (
              <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.035] px-4 py-6 text-center text-sm font-semibold text-white/42">
                Your mixed images will appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderMockupTool() {
    const visiblePresets = mockupPresets.filter((item) => item.category === mockupCategory);

    return (
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Mockup source</p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">Upload design and choose surface</h3>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{mockupModel === 'nano-banana-pro' ? 'Pro' : 'Fast'}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <label className="flex max-w-[260px] cursor-pointer items-center gap-2 rounded-2xl border border-violet-100 bg-white/80 p-1.5 transition hover:border-violet-300 hover:bg-violet-50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    loadMockupDesign(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
                {mockupDesignUrl ? (
                  <img src={mockupDesignUrl} alt="" className="h-10 w-10 rounded-xl bg-slate-950 object-contain" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-2xl font-light text-violet-700">+</span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-600">{mockupDesignName || 'Logo or design'}</span>
              </label>

              <label className="flex max-w-[260px] cursor-pointer items-center gap-2 rounded-2xl border border-violet-100 bg-white/80 p-1.5 transition hover:border-violet-300 hover:bg-violet-50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    loadMockupSurface(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
                {mockupSurfaceUrl ? (
                  <img src={mockupSurfaceUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-2xl font-light text-violet-700">+</span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-600">{mockupSurfaceName || 'Optional surface'}</span>
              </label>
            </div>

            {mockupSurfaceUrl && (
              <button
                type="button"
                onClick={() => {
                  if (mockupSurfaceUrl) URL.revokeObjectURL(mockupSurfaceUrl);
                  setMockupSurfaceUrl('');
                  setMockupSurfaceName('');
                  setMockupSurfaceFile(null);
                }}
                className="mt-3 rounded-full border border-violet-100 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:border-violet-300"
              >
                Remove custom surface
              </button>
            )}
          </div>

          <div className="rounded-[26px] border border-violet-100 bg-white/65 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Preset surface</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mockupCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    const firstPreset = mockupPresets.find((item) => item.category === category.id);
                    setMockupCategory(category.id);
                    if (firstPreset) {
                      setMockupPresetId(firstPreset.id);
                    }
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-black transition ${mockupCategory === category.id ? 'border-violet-300 bg-violet-600 text-white' : 'border-violet-100 bg-white text-slate-600 hover:border-violet-300'}`}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {visiblePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setMockupPresetId(preset.id);
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${mockupPresetId === preset.id ? 'border-violet-300 bg-violet-100 text-violet-950' : 'border-violet-100 bg-white text-slate-600 hover:border-violet-300'}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="space-y-4">
          <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              placeholder={selectedTool.promptPlaceholder}
              className="min-h-[132px] w-full resize-none bg-transparent text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 pt-3">
              <span className="text-xs font-black text-slate-500">{creditCost} credits</span>
              <button
                type="button"
                disabled={isGenerating}
                onClick={generateMockup}
                className="rounded-full border border-violet-200 bg-white/70 px-5 py-2.5 text-xs font-black text-violet-700 shadow-[0_12px_28px_rgba(124,58,237,0.13)] backdrop-blur transition hover:bg-violet-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
            {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <ToolSelect label="Quality" value={quality} options={qualities} onChange={setQuality} />
            <ToolSelect label="Style" value={style} options={styles} onChange={setStyle} />
            <div className="rounded-[24px] border border-violet-100 bg-white/65 p-3">
              <p className="px-1 text-xs font-black uppercase tracking-[0.16em] text-violet-500">Model</p>
              <div className="mt-2 grid gap-2">
                {(['nano-banana', 'nano-banana-pro'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMockupModel(item)}
                    className={`rounded-2xl px-3 py-2 text-sm font-black transition ${mockupModel === item ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-violet-50'}`}
                  >
                    {item === 'nano-banana-pro' ? 'Pro' : 'Fast'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {imageOutputs.some((item) => item.toolId === 'mockup') ? (
            <OutputGallery
              title="Mockup outputs"
              items={imageOutputs.filter((item) => item.toolId === 'mockup')}
              actions={outputBrief ? (
                <button type="button" onClick={() => makeDownload('savi-mockup-brief.txt', outputBrief)} className="rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-black text-slate-800">
                  Download brief
                </button>
              ) : undefined}
            />
          ) : (
            <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.035] px-4 py-6 text-center text-sm font-semibold text-white/42">
              Your mockups will appear here.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="glass rounded-[36px] p-5 md:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-500">{isToolOpen ? 'Image tool' : 'Image tools'}</p>
          <h2 className="mt-2 text-3xl font-black md:text-4xl">{isToolOpen ? selectedTool.title : 'Image tools'}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            {isToolOpen ? selectedTool.description : 'Generate, edit, remove, restyle, and create product-ready images with clear tool choices.'}
          </p>
        </div>
      </div>

      {!isToolOpen && (
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {imageTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => selectTool(tool.id)}
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
      {selectedTool.id === 'story_sketch' ? renderStorySketchTool() : selectedTool.id === 'sketch_to_image' ? renderSketchToImageTool() : selectedTool.id === 'visual_mixer' ? renderVisualMixerTool() : selectedTool.id === 'mockup' ? renderMockupTool() : (
        <div className="grid gap-5">
          <div className="space-y-4">
            <div className="rounded-[30px] border border-violet-100 bg-white/70 p-4">
              {(
                <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-violet-100 pb-3">
                  <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-2xl border border-violet-100 bg-white/80 text-2xl font-light text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.1)] transition hover:border-violet-300 hover:bg-violet-50" aria-label="Attach image">
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => loadImage(event.target.files?.[0])} />
                    +
                  </label>
                  {imageUrl ? (
                    <div className="group flex max-w-[240px] items-center gap-2 rounded-2xl border border-violet-100 bg-white/80 p-1.5">
                      <img src={imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500">{imageName || 'Reference image'}</span>
                      <button
                        type="button"
                        onClick={clearImageInput}
                        className="grid h-7 w-7 place-items-center rounded-full text-xs font-black text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove image"
                      >
                        x
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-slate-400">{selectedTool.needsImage ? 'Attach one image' : 'Optional reference'}</span>
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

            <div className="grid gap-3 md:grid-cols-3">
              <ToolSelect label="Ratio" value={aspectRatio} options={aspectRatios} onChange={setAspectRatio} />
              <ToolSelect label="Quality" value={quality} options={qualities} onChange={setQuality} />
              <ToolSelect label="Style" value={style} options={styles} onChange={setStyle} />
            </div>

            {imageOutputs.some((item) => item.toolId === selectedTool.id) && (
              <OutputGallery
                title={`${selectedTool.title} outputs`}
                items={imageOutputs.filter((item) => item.toolId === selectedTool.id)}
                actions={outputBrief ? (
                  <button type="button" onClick={() => makeDownload('savi-image-brief.txt', outputBrief)} className="rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-black text-slate-800">
                    Download brief
                  </button>
                ) : undefined}
              />
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
  onChange
}: {
  title: string;
  value: T;
  options: readonly T[];
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
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
