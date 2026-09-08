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
  | 'first_last'
  | 'product_ad'
  | 'social_reel'
  | 'extend'
  | 'merge_pdf'
  | 'organize_pdf'
  | 'pdf_to_jpg'
  | 'extract_images'
  | 'contract_summary'
  | 'explain_document'
  | 'translate_summary'
  | 'pdf_podcast'
  | 'rewrite_text'
  | 'presentation_script';

export type SaviAgentAttachmentKind = 'none' | 'text' | 'image' | 'pdf' | 'video' | 'audio';

export type SaviAgentTool = {
  id: SaviAgentToolId;
  title: string;
  category: SaviAgentCategory;
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
  requiredInput: SaviAgentAttachmentKind,
  description: string,
  output: SaviAgentTool['output']
): SaviAgentTool => ({ id, title, category, requiredInput, description, output });

// This is shared by the planner and UI for labels and guidance. Pricing is
// intentionally absent: the authenticated pricing endpoint is the only source
// of a customer-visible quote and the server is the only charge authority.
export const SAVI_AGENT_TOOLS: Record<SaviAgentToolId, SaviAgentTool> = {
  chat: makeTool('chat', 'Ask SAVI', 'chat', 'none', 'Free conversational help, planning, explanations, and current answers.', 'chat'),
  text_to_image: makeTool('text_to_image', 'Text to Image', 'image', 'text', 'Create an original image from a written idea.', 'image'),
  edit_image: makeTool('edit_image', 'Edit Image', 'image', 'image', 'Change details while preserving the main image.', 'image'),
  remove_background: makeTool('remove_background', 'Remove Background', 'image', 'image', 'Remove or replace a background while preserving the subject.', 'image'),
  remove_object: makeTool('remove_object', 'Remove Object', 'image', 'image', 'Remove one unwanted object and rebuild the area naturally.', 'image'),
  change_style: makeTool('change_style', 'Change Style', 'image', 'image', 'Change clothing, style, colour, or material while preserving the subject.', 'image'),
  mockup: makeTool('mockup', 'Mockup', 'image', 'image', 'Place a design on a realistic product or surface.', 'image'),
  visual_mixer: makeTool('visual_mixer', 'Visual Mixer', 'image', 'image', 'Blend subject, scene, and style references into one image.', 'image'),
  story_sketch: makeTool('story_sketch', 'Story Sketch', 'image', 'text', 'Create a visual story frame or continue a visual sequence.', 'image'),
  sketch_to_image: makeTool('sketch_to_image', 'Sketch to Image', 'image', 'image', 'Turn a sketch into a polished image.', 'image'),
  product_photo: makeTool('product_photo', 'Product Photo', 'image', 'image', 'Create a premium product image for an ad or shop.', 'image'),
  text_design: makeTool('text_design', 'Text Design', 'image', 'text', 'Turn an idea or headline into a visual design.', 'image'),
  variations: makeTool('variations', 'Create Variation', 'image', 'image', 'Create one distinct visual variation from an image.', 'image'),
  instagram_post: makeTool('instagram_post', 'Instagram Post', 'text', 'image', 'Write a hook, caption, hashtags, and post idea from an image.', 'text'),
  product_prompt: makeTool('product_prompt', 'Product Photo Prompt', 'text', 'image', 'Write a strong product photography prompt from a product image.', 'text'),
  text_to_speech: makeTool('text_to_speech', 'Text to Speech', 'voice', 'text', 'Turn supplied wording into downloadable spoken audio.', 'audio'),
  radio_talk: makeTool('radio_talk', 'Radio Talk AI', 'voice', 'text', 'Turn a topic or script into a hosted radio segment.', 'audio'),
  text_video: makeTool('text_video', 'Text to Video', 'video', 'text', 'Generate a video from a written scene.', 'video'),
  story_video: makeTool('story_video', 'Story Video', 'video', 'image', 'Generate a connected shot in a story sequence.', 'video'),
  image_video: makeTool('image_video', 'Image to Video', 'video', 'image', 'Animate one or more reference images.', 'video'),
  first_last: makeTool('first_last', 'Start and End Frame Video', 'video', 'image', 'Create motion between supplied first and last frames.', 'video'),
  product_ad: makeTool('product_ad', 'Product Ad Video', 'video', 'image', 'Create a product-focused ad video from references.', 'video'),
  social_reel: makeTool('social_reel', 'Social Reel', 'video', 'image', 'Create a short social video from references.', 'video'),
  extend: makeTool('extend', 'Extend Video', 'video', 'video', 'Continue an existing video naturally.', 'video'),
  merge_pdf: makeTool('merge_pdf', 'Merge PDF', 'file', 'pdf', 'Combine multiple PDFs into one downloadable PDF.', 'file'),
  organize_pdf: makeTool('organize_pdf', 'Organize PDF Pages', 'file', 'pdf', 'Reorder, swap, or remove pages in a PDF.', 'file'),
  pdf_to_jpg: makeTool('pdf_to_jpg', 'PDF to JPG', 'file', 'pdf', 'Export selected PDF pages as images.', 'file'),
  extract_images: makeTool('extract_images', 'Extract PDF Images', 'file', 'pdf', 'Extract embedded images from a PDF into a ZIP.', 'file'),
  contract_summary: makeTool('contract_summary', 'Summarize Contract', 'file', 'pdf', 'Summarize a contract with risks and next steps.', 'text'),
  explain_document: makeTool('explain_document', 'Explain Document', 'file', 'pdf', 'Explain a document in straightforward language.', 'text'),
  translate_summary: makeTool('translate_summary', 'Translate PDF', 'file', 'pdf', 'Translate a supplied PDF into the requested language.', 'text'),
  pdf_podcast: makeTool('pdf_podcast', 'PDF to Podcast', 'file', 'pdf', 'Turn a PDF into a structured podcast script.', 'text'),
  rewrite_text: makeTool('rewrite_text', 'Rewrite Text', 'text', 'text', 'Rewrite text in the requested tone or format.', 'text'),
  presentation_script: makeTool('presentation_script', 'Presentation Script', 'text', 'text', 'Turn notes into a clear presentation script.', 'text')
};

export const SAVI_AGENT_TOOL_IDS = Object.keys(SAVI_AGENT_TOOLS) as SaviAgentToolId[];

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
    requiredInput: tool.requiredInput,
    description: tool.description,
    output: tool.output
  }));
}
