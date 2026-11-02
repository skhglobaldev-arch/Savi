import { SAVI_EXTRACT_IMAGES_AVAILABLE } from '../pdf/workflowState.ts';
import type { SaviRadioFormat, SaviRadioLength } from '../voice/radioScript.ts';
type RadioFormatId = SaviRadioFormat;
type RadioLengthId = SaviRadioLength;
type DurationValue = '4' | '6' | '8';
type RatioValue = '16:9' | '9:16';
type QualityValue = '720';

export type ImageToolId =
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

export type MockupCategory = 'devices' | 'clothing' | 'print';

export type MockupPreset = {
  id: string;
  label: string;
  category: MockupCategory;
  defaultPrompt: string;
};

export type VisualMixerCategory = 'subject' | 'scene' | 'style';

export const imageTools: Array<{
  id: ImageToolId;
  title: string;
  description: string;
  promptPlaceholder: string;
  needsImage: boolean;
  hiddenInstruction: string;
}> = [
  {
    id: 'text_to_image',
    title: 'Text to image',
    description: 'Create a clean image from a written idea.',
    promptPlaceholder: 'Example: Create a cinematic poster of a premium AI workspace on a glass desk, violet-blue glow, clean typography space, realistic studio lighting.',
    needsImage: false,
    hiddenInstruction: 'Generate a high-quality image from the user idea. Keep composition clean, premium, and useful.'
  },
  {
    id: 'story_sketch',
    title: 'Story Sketch',
    description: 'Build a visual sequence shot by shot, then continue from the previous image.',
    promptPlaceholder: 'Example: Build a six-frame story where a pomegranate falls from a tree, a child finds it, then shares it with someone in warm afternoon light.',
    needsImage: false,
    hiddenInstruction: 'Create a consistent cinematic storyboard sequence. Each shot should work as a realistic frame and preserve style continuity from earlier shots.'
  },
  {
    id: 'sketch_to_image',
    title: 'Sketch to image',
    description: 'Draw a rough idea, add a prompt, and turn it into a polished image.',
    promptPlaceholder: 'Example: Turn this rough sketch into a realistic collectible fashion doll on a dark grid background, premium materials, clean product lighting.',
    needsImage: false,
    hiddenInstruction: 'Use the canvas sketch as a reference. Preserve the rough layout and turn it into a polished generated image.'
  },
  {
    id: 'instagram_post',
    title: 'Instagram post from image',
    description: 'Upload an image and create a hook, caption, hashtags, and post idea.',
    promptPlaceholder: 'Example: Turn this cafe portrait into a stylish Instagram post with one bold hook, a short caption, 8 hashtags, and a soft premium brand tone.',
    needsImage: true,
    hiddenInstruction: 'Analyze the provided image and create a short Instagram post package with hook, caption, content angle, and hashtags.'
  },
  {
    id: 'product_prompt',
    title: 'Product photo prompt',
    description: 'Turn a product idea into a premium product photography prompt.',
    promptPlaceholder: 'Example: SAVI daily hydration cream on warm stone with eucalyptus, dewy texture, soft morning window light, calm luxury skincare campaign.',
    needsImage: false,
    hiddenInstruction: 'Create a detailed product photography prompt with subject, surface, lighting, composition, camera, mood, and usage notes.'
  },
  {
    id: 'edit_image',
    title: 'Edit image',
    description: 'Change details while keeping the original subject consistent.',
    promptPlaceholder: 'Example: Keep the person exactly the same, change the cafe into a clean luxury studio, soften the light, and preserve face, pose, and framing.',
    needsImage: true,
    hiddenInstruction: 'Edit the provided image based on the user request while preserving the main subject and identity.'
  },
  {
    id: 'remove_background',
    title: 'Remove or change background',
    description: 'Remove the background or replace it with a new scene.',
    promptPlaceholder: 'Example: Remove only the background and place the subject on a soft white studio backdrop. Keep hair edges, shadows, and subject untouched.',
    needsImage: true,
    hiddenInstruction: 'Mask the background only. Preserve the subject exactly and create a clean transparent or requested background.'
  },
  {
    id: 'remove_object',
    title: 'Remove object',
    description: 'Remove one unwanted object and rebuild the area naturally.',
    promptPlaceholder: 'Example: Remove the person in the back-right corner and rebuild the cafe wall, shelves, and lighting naturally. Do not change the main subject.',
    needsImage: true,
    hiddenInstruction: 'Remove only the target object described by the user. Preserve the rest of the image and avoid changing the subject.'
  },
  {
    id: 'change_style',
    title: 'Change clothes or style',
    description: 'Change outfit, color, material, or visual style without changing identity.',
    promptPlaceholder: 'Example: Change only the outfit to a matte charcoal blazer and silk top. Keep the face, pose, hair, lighting, and background unchanged.',
    needsImage: true,
    hiddenInstruction: 'Change the requested clothing or style while preserving face, pose, body shape, lighting direction, and image structure.'
  },
  {
    id: 'product_photo',
    title: 'Product photo',
    description: 'Turn a product reference into a premium ad-style product image.',
    promptPlaceholder: 'Example: Use this product as the hero item on a reflective white glass surface, botanical props, soft shadow, high-end ecommerce campaign look.',
    needsImage: true,
    hiddenInstruction: 'Create a polished product photography output using the reference image and the requested campaign style.'
  },
  {
    id: 'mockup',
    title: 'Mockup',
    description: 'Place a logo or design onto devices, clothing, print, or a custom surface.',
    promptPlaceholder: 'Example: Place this logo naturally on a matte black laptop screen in a modern studio, realistic perspective, soft reflections, no extra branding.',
    needsImage: true,
    hiddenInstruction: 'Create a photorealistic mockup. Use the first uploaded image as the logo or design, then place it naturally on the selected product or surface with realistic lighting, perspective, shadows, and material texture.'
  },
  {
    id: 'visual_mixer',
    title: 'Visual mixer',
    description: 'Blend a subject, scene, and style into one finished image.',
    promptPlaceholder: 'Example: Blend the selected subject, scene, and style into one premium hero image for a calm skincare launch, natural light, clean composition.',
    needsImage: false,
    hiddenInstruction: 'Blend the selected subject, scene, and style references into one cohesive premium image. Preserve the strongest visual cues from each category without making a collage.'
  },
  {
    id: 'text_design',
    title: 'Text and poster design',
    description: 'Create readable text, poster layouts, badges, labels, or covers.',
    promptPlaceholder: 'Example: Design a clean launch poster that says “Ask. Create. Organise.” with SAVI branding, purple-blue glow, readable premium layout.',
    needsImage: false,
    hiddenInstruction: 'Create a clean graphic layout with accurate readable text, strong hierarchy, and premium spacing.'
  },
  {
    id: 'variations',
    title: 'Create variation',
    description: 'Create one polished alternative while keeping the core visual direction consistent.',
    promptPlaceholder: 'Example: Create a warmer seasonal variation of this product ad with golden light, premium texture, and the product still clearly recognisable.',
    needsImage: true,
    hiddenInstruction: 'Create one distinct variation while preserving the main subject, product, and brand direction.'
  }
];

export const imageAspectRatios = ['1:1', '4:5', '9:16', '16:9'] as const;

export const imageQualities = ['720', '1080', '4K'] as const;

export const imageStyles = ['Realistic', 'Product', 'Editorial', '3D', 'Minimal', 'Cinematic'] as const;
export const sketchColors = ['#ffffff', '#111827', '#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#2563eb', '#7c3aed', '#ec4899'];
export const sketchBrushSizes = [4, 10, 34] as const;

export const mockupCategories: Array<{ id: MockupCategory; label: string }> = [
  { id: 'devices', label: 'Devices' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'print', label: 'Print' }
];

export const mockupPresets: MockupPreset[] = [
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

export const visualMixerCategories: Array<{
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

export type VideoToolId = 'text_video' | 'story_video' | 'image_video' | 'first_last' | 'product_ad' | 'social_reel' | 'extend';

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

export const videoDurations: DurationValue[] = ['4', '6', '8'];

export const videoRatios: RatioValue[] = ['16:9', '9:16'];

export const videoQualities: QualityValue[] = ['720'];

export const radioFormats: Array<{ id: RadioFormatId; label: string; note: string }> = [
  { id: 'solo', label: 'Solo host', note: 'A complete hosted segment' },
  { id: 'news', label: 'News brief', note: 'Crisp anchor delivery' },
  { id: 'podcast', label: 'Podcast talk', note: 'Relaxed conversational show' },
  { id: 'story', label: 'Story show', note: 'Narrative radio episode' }
];

export const radioLengths: Array<{ id: RadioLengthId; label: string; target: string }> = [
  { id: 'short', label: 'Short', target: '45 to 60 seconds' },
  { id: 'standard', label: 'Standard', target: '1 to 2 minutes' },
  { id: 'long', label: 'Long', target: '3 to 4 minutes' }
];

export const voiceToolOptions = [
  { id: 'tts' as const, label: 'Text to Speech', note: 'Read exact text with a chosen voice', previewId: 'voice_tts' },
  { id: 'radio' as const, label: 'Radio Talk AI', note: 'Turn a topic into a hosted segment', previewId: 'voice_radio' }
];

export type FileToolId = 'merge' | 'organize' | 'split' | 'jpg' | 'extract_images' | 'contract_summary' | 'explain_document' | 'translate_summary' | 'pdf_podcast';

export const fileTools: Array<{
  id: FileToolId;
  title: string;
  description: string;
  promptPlaceholder: string;
  group: 'PDF tools' | 'AI document';
  available?: boolean;
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
    id: 'split',
    title: 'Split PDF',
    description: 'Choose the pages to export as a separate PDF with a clear page-by-page view.',
    promptPlaceholder: '',
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
    group: 'PDF tools',
    available: SAVI_EXTRACT_IMAGES_AVAILABLE
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

export type SaviToolCategory = 'Images' | 'Video' | 'Voice' | 'Files';
export type SaviToolDescriptor = { id: string; title: string; description: string; category: SaviToolCategory; promptPlaceholder: string };
export const saviToolCategories: SaviToolCategory[] = ['Images', 'Video', 'Voice', 'Files'];
export const saviTools: SaviToolDescriptor[] = [
  ...imageTools.map(tool => ({ ...tool, category: 'Images' as const })),
  ...videoTools.map(tool => ({ ...tool, category: 'Video' as const })),
  ...voiceToolOptions.map(tool => ({ id: tool.id, title: tool.label, description: tool.note, promptPlaceholder: '', category: 'Voice' as const })),
  ...fileTools.filter(tool => tool.available !== false).map(tool => ({ ...tool, category: 'Files' as const })),
];
