export type MobileToolCategory = 'Images' | 'Video' | 'Voice' | 'Files';

export type MobileTool = { id: string; title: string; description: string; category: MobileToolCategory; icon: 'image-outline' | 'film-outline' | 'volume-high-outline' | 'document-text-outline'; accent: 'violet' | 'blue' | 'mint' };

// Deliberately local Stage 1 metadata: the native shell does not import browser UI or backend code.
export const mobileTools: MobileTool[] = [
  { id: 'text-to-image', title: 'Text to Image', description: 'Turn an idea into an original image.', category: 'Images', icon: 'image-outline', accent: 'violet' },
  { id: 'image-editor', title: 'Image Editor', description: 'Refine an image with natural language.', category: 'Images', icon: 'image-outline', accent: 'blue' },
  { id: 'image-to-video', title: 'Image to Video', description: 'Bring a still image into motion.', category: 'Video', icon: 'film-outline', accent: 'violet' },
  { id: 'text-to-video', title: 'Text to Video', description: 'Create a short video from a prompt.', category: 'Video', icon: 'film-outline', accent: 'blue' },
  { id: 'text-to-speech', title: 'Text to Speech', description: 'Turn supplied wording into voice.', category: 'Voice', icon: 'volume-high-outline', accent: 'mint' },
  { id: 'merge-pdf', title: 'Merge PDF', description: 'Combine multiple PDFs into one file.', category: 'Files', icon: 'document-text-outline', accent: 'violet' },
  { id: 'organize-pdf', title: 'Organize PDF Pages', description: 'Reorder, rotate, or remove pages.', category: 'Files', icon: 'document-text-outline', accent: 'blue' },
  { id: 'pdf-to-jpg', title: 'PDF to JPG', description: 'Export selected PDF pages as images.', category: 'Files', icon: 'document-text-outline', accent: 'mint' },
];
export const mobileToolCategories: MobileToolCategory[] = ['Images', 'Video', 'Voice', 'Files'];
