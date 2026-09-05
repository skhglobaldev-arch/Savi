export type SaviAgentCategory = 'chat' | 'image' | 'voice' | 'video' | 'file' | 'text';

export type SaviAgentToolId =
  | 'chat'
  | 'text_to_image'
  | 'edit_image'
  | 'remove_background'
  | 'remove_object'
  | 'change_style'
  | 'mockup'
  | 'visual_mixer'
  | 'story_sketch'
  | 'sketch_to_image'
  | 'product_photo'
  | 'text_design'
  | 'variations'
  | 'instagram_post'
  | 'product_prompt'
  | 'text_to_speech'
  | 'radio_talk'
  | 'text_video'
  | 'story_video'
  | 'image_video'
  | 'first_last_video'
  | 'product_ad_video'
  | 'social_reel_video'
  | 'extend_video'
  | 'merge_pdf'
  | 'organize_pdf'
  | 'pdf_to_jpg'
  | 'extract_pdf_images'
  | 'contract_summary'
  | 'explain_document'
  | 'translate_pdf'
  | 'pdf_podcast'
  | 'rewrite_text'
  | 'presentation_script'
  | 'video_script';

export type SaviAgentAttachmentKind = 'none' | 'text' | 'image' | 'pdf' | 'video' | 'audio';

export type SaviAgentTool = {
  id: SaviAgentToolId;
  title: string;
  category: SaviAgentCategory;
  creditCost: number;
  requiredInput: SaviAgentAttachmentKind;
  description: string;
  output: 'chat' | 'text' | 'image' | 'audio' | 'video' | 'file';
};

export type SaviAgentHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SaviAgentAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: Exclude<SaviAgentAttachmentKind, 'none' | 'text'> | 'file';
};

export type SaviAgentPlan = {
  intent: 'chat' | 'question' | 'tool';
  reply: string;
  language: 'fa' | 'en';
  toolId: SaviAgentToolId;
  prompt: string;
  missingInput: SaviAgentAttachmentKind;
  quickReplies: string[];
  nextToolId?: SaviAgentToolId;
  pageA?: number;
  pageB?: number;
  voice?: string;
  style?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:5';
  quality?: '720' | '1080' | '4K';
  duration?: '4' | '6' | '8';
};

const makeTool = (
  id: SaviAgentToolId,
  title: string,
  category: SaviAgentCategory,
  creditCost: number,
  requiredInput: SaviAgentAttachmentKind,
  description: string,
  output: SaviAgentTool['output']
): SaviAgentTool => ({ id, title, category, creditCost, requiredInput, description, output });

// This is deliberately shared by the server planner and the client. The client can display
// an estimate, but the planner is the only source that assigns an action's cost.
export const SAVI_AGENT_TOOLS: Record<SaviAgentToolId, SaviAgentTool> = {
  chat: makeTool('chat', 'Ask SAVI', 'chat', 0, 'none', 'Free conversational help, planning, explanations, and current answers.', 'chat'),
  text_to_image: makeTool('text_to_image', 'Text to Image', 'image', 75, 'text', 'Create an original image from a written idea.', 'image'),
  edit_image: makeTool('edit_image', 'Edit Image', 'image', 160, 'image', 'Change details while preserving the main image.', 'image'),
  remove_background: makeTool('remove_background', 'Remove Background', 'image', 200, 'image', 'Remove or replace a background while preserving the subject.', 'image'),
  remove_object: makeTool('remove_object', 'Remove Object', 'image', 250, 'image', 'Remove one unwanted object and rebuild the area naturally.', 'image'),
  change_style: makeTool('change_style', 'Change Style', 'image', 250, 'image', 'Change clothing, style, colour, or material while preserving the subject.', 'image'),
  mockup: makeTool('mockup', 'Mockup', 'image', 180, 'image', 'Place a design on a realistic product or surface.', 'image'),
  visual_mixer: makeTool('visual_mixer', 'Visual Mixer', 'image', 210, 'image', 'Blend subject, scene, and style references into one image.', 'image'),
  story_sketch: makeTool('story_sketch', 'Story Sketch', 'image', 95, 'text', 'Create a visual story frame or continue a visual sequence.', 'image'),
  sketch_to_image: makeTool('sketch_to_image', 'Sketch to Image', 'image', 130, 'image', 'Turn a sketch into a polished image.', 'image'),
  product_photo: makeTool('product_photo', 'Product Photo', 'image', 180, 'image', 'Create a premium product image for an ad or shop.', 'image'),
  text_design: makeTool('text_design', 'Text Design', 'image', 120, 'text', 'Turn an idea or headline into a visual design.', 'image'),
  variations: makeTool('variations', 'Create Variations', 'image', 220, 'image', 'Create distinct visual variations from an image.', 'image'),
  instagram_post: makeTool('instagram_post', 'Instagram Post', 'text', 3, 'image', 'Write a hook, caption, hashtags, and post idea from an image.', 'text'),
  product_prompt: makeTool('product_prompt', 'Product Photo Prompt', 'text', 3, 'image', 'Write a strong product photography prompt from a product image.', 'text'),
  text_to_speech: makeTool('text_to_speech', 'Text to Speech', 'voice', 30, 'text', 'Turn supplied wording into downloadable spoken audio.', 'audio'),
  radio_talk: makeTool('radio_talk', 'Radio Talk AI', 'voice', 120, 'text', 'Turn a topic or script into a hosted radio segment.', 'audio'),
  text_video: makeTool('text_video', 'Text to Video', 'video', 900, 'text', 'Generate a video from a written scene.', 'video'),
  story_video: makeTool('story_video', 'Story Video', 'video', 1300, 'image', 'Generate a connected shot in a story sequence.', 'video'),
  image_video: makeTool('image_video', 'Image to Video', 'video', 1200, 'image', 'Animate one or more reference images.', 'video'),
  first_last_video: makeTool('first_last_video', 'Start and End Frame Video', 'video', 1600, 'image', 'Create motion between supplied first and last frames.', 'video'),
  product_ad_video: makeTool('product_ad_video', 'Product Ad Video', 'video', 1400, 'image', 'Create a product-focused ad video from references.', 'video'),
  social_reel_video: makeTool('social_reel_video', 'Social Reel', 'video', 1100, 'image', 'Create a short social video from references.', 'video'),
  extend_video: makeTool('extend_video', 'Extend Video', 'video', 1500, 'video', 'Continue an existing video naturally.', 'video'),
  merge_pdf: makeTool('merge_pdf', 'Merge PDF', 'file', 25, 'pdf', 'Combine multiple PDFs into one downloadable PDF.', 'file'),
  organize_pdf: makeTool('organize_pdf', 'Organize PDF Pages', 'file', 35, 'pdf', 'Reorder, swap, or remove pages in a PDF.', 'file'),
  pdf_to_jpg: makeTool('pdf_to_jpg', 'PDF to JPG', 'file', 45, 'pdf', 'Export selected PDF pages as images.', 'file'),
  extract_pdf_images: makeTool('extract_pdf_images', 'Extract PDF Images', 'file', 45, 'pdf', 'Extract embedded images from a PDF into a ZIP.', 'file'),
  contract_summary: makeTool('contract_summary', 'Summarize Contract', 'file', 5, 'pdf', 'Summarize a contract with risks and next steps.', 'text'),
  explain_document: makeTool('explain_document', 'Explain Document', 'file', 4, 'pdf', 'Explain a document in straightforward language.', 'text'),
  translate_pdf: makeTool('translate_pdf', 'Translate PDF', 'file', 7, 'pdf', 'Translate a supplied PDF into the requested language.', 'text'),
  pdf_podcast: makeTool('pdf_podcast', 'PDF to Podcast', 'file', 8, 'pdf', 'Turn a PDF into a structured podcast script.', 'text'),
  rewrite_text: makeTool('rewrite_text', 'Rewrite Text', 'text', 2, 'text', 'Rewrite text in the requested tone or format.', 'text'),
  presentation_script: makeTool('presentation_script', 'Presentation Script', 'text', 4, 'text', 'Turn notes into a clear presentation script.', 'text'),
  video_script: makeTool('video_script', 'Video Script', 'text', 5, 'text', 'Write a video script with hook, scenes, voiceover, and CTA.', 'text')
};

export const SAVI_AGENT_TOOL_IDS = Object.keys(SAVI_AGENT_TOOLS) as SaviAgentToolId[];

export const SAVI_TEXT_TO_IMAGE_QUALITY_CREDIT_ADDITIONS = {
  '720': 0,
  '1080': 50,
  '4K': 140
} as const;

export type SaviTextToImageQuality = keyof typeof SAVI_TEXT_TO_IMAGE_QUALITY_CREDIT_ADDITIONS;

// This stays in the shared registry so the UI can show the familiar estimate while
// the protected server route independently calculates the exact same amount.
export function getSaviTextToImageCreditCost(quality: SaviTextToImageQuality = '1080') {
  return SAVI_AGENT_TOOLS.text_to_image.creditCost + SAVI_TEXT_TO_IMAGE_QUALITY_CREDIT_ADDITIONS[quality];
}

export function getSaviAgentTool(toolId: string | undefined): SaviAgentTool {
  if (toolId && toolId in SAVI_AGENT_TOOLS) return SAVI_AGENT_TOOLS[toolId as SaviAgentToolId];
  return SAVI_AGENT_TOOLS.chat;
}

export function isSaviAgentToolId(value: unknown): value is SaviAgentToolId {
  return typeof value === 'string' && value in SAVI_AGENT_TOOLS;
}

export function serializeSaviAgentTools() {
  return Object.values(SAVI_AGENT_TOOLS).map((tool) => ({
    id: tool.id,
    title: tool.title,
    category: tool.category,
    cost: tool.creditCost,
    requiredInput: tool.requiredInput,
    description: tool.description,
    output: tool.output
  }));
}
