export type InputType = 'Text' | 'PDF' | 'Image' | 'URL' | 'Audio';

export type TemplateItem = {
  id: string;
  title: string;
  description: string;
  inputType: InputType;
  category: 'Files' | 'Images' | 'Voice' | 'Writing' | 'Video';
  prompt: string;
};

export const templates: TemplateItem[] = [
  {
    id: 'pdf-to-podcast',
    title: 'Turn PDF into podcast',
    description: 'Upload a PDF and turn the key points into a radio-style episode script.',
    inputType: 'PDF',
    category: 'Voice',
    prompt: 'Summarize this PDF and turn it into a short radio-style podcast script.'
  },
  {
    id: 'summarize-contract',
    title: 'Summarize this contract',
    description: 'Extract simple key points, risks, obligations, and action items.',
    inputType: 'PDF',
    category: 'Files',
    prompt: 'Summarize this contract in simple language and list key risks and obligations.'
  },
  {
    id: 'explain-document',
    title: 'Explain this document simply',
    description: 'Make complicated content easier to understand for beginners.',
    inputType: 'PDF',
    category: 'Files',
    prompt: 'Explain this document in simple beginner-friendly language.'
  },
  {
    id: 'notes-to-presentation',
    title: 'Convert notes into a presentation script',
    description: 'Turn messy notes into a clean talk track and slide outline.',
    inputType: 'Text',
    category: 'Writing',
    prompt: 'Turn these notes into a presentation script and slide-by-slide outline.'
  },
  {
    id: 'instagram-from-image',
    title: 'Generate Instagram post from image',
    description: 'Upload an image and create a caption, hook, and post idea.',
    inputType: 'Image',
    category: 'Images',
    prompt: 'Analyze this image and create an Instagram caption, hook, and content idea.'
  },
  {
    id: 'product-photo-prompt',
    title: 'Create product photo prompt',
    description: 'Create a premium prompt for product visuals and marketing images.',
    inputType: 'Text',
    category: 'Images',
    prompt: 'Create a detailed premium product photography prompt from this product idea.'
  },
  {
    id: 'blog-to-audio',
    title: 'Turn blog post into audio',
    description: 'Convert long-form text into a clean spoken audio script.',
    inputType: 'URL',
    category: 'Voice',
    prompt: 'Turn this blog post into a concise audio script with a clear structure.'
  },
  {
    id: 'translate-pdf',
    title: 'Translate PDF and summarize it',
    description: 'Translate the main content and produce a clean summary.',
    inputType: 'PDF',
    category: 'Files',
    prompt: 'Translate this PDF and summarize the main points clearly.'
  },
  {
    id: 'professional-text',
    title: 'Make this text sound professional',
    description: 'Rewrite rough text into a polished, confident version.',
    inputType: 'Text',
    category: 'Writing',
    prompt: 'Rewrite this text to sound professional, clear, and human.'
  },
];
