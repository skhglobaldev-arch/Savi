export type MobileToolCategory = 'Images' | 'Video' | 'Voice' | 'Files';

export type MobileTool = {
  id: string;
  title: string;
  description: string;
  category: MobileToolCategory;
  icon: 'image-outline' | 'film-outline' | 'volume-high-outline' | 'document-text-outline';
  accent: 'violet' | 'blue' | 'mint';
  availability: 'available' | 'coming_soon';
};

// Native presentation metadata. Server routes remain authoritative for quotes and execution.
export const mobileTools: MobileTool[] = [
  { id: 'text-to-image', title: 'Text to Image', description: 'Turn an idea into an original image.', category: 'Images', icon: 'image-outline', accent: 'violet', availability: 'available' },
  { id: 'image-editor', title: 'Image Editor', description: 'Refine an image with natural language.', category: 'Images', icon: 'image-outline', accent: 'blue', availability: 'coming_soon' },
  { id: 'image-to-video', title: 'Image to Video', description: 'Bring a still image into motion.', category: 'Video', icon: 'film-outline', accent: 'violet', availability: 'coming_soon' },
  { id: 'text-to-video', title: 'Text to Video', description: 'Create a short video from a prompt.', category: 'Video', icon: 'film-outline', accent: 'blue', availability: 'coming_soon' },
  { id: 'text-to-speech', title: 'Text to Speech', description: 'Turn supplied wording into voice.', category: 'Voice', icon: 'volume-high-outline', accent: 'mint', availability: 'coming_soon' },
  { id: 'merge-pdf', title: 'Merge PDF', description: 'Combine multiple PDFs into one file.', category: 'Files', icon: 'document-text-outline', accent: 'violet', availability: 'coming_soon' },
  { id: 'organize-pdf', title: 'Organize PDF Pages', description: 'Reorder, rotate, or remove pages.', category: 'Files', icon: 'document-text-outline', accent: 'blue', availability: 'coming_soon' },
  { id: 'pdf-to-jpg', title: 'PDF to JPG', description: 'Export selected PDF pages as images.', category: 'Files', icon: 'document-text-outline', accent: 'mint', availability: 'coming_soon' },
];
export const mobileToolCategories: MobileToolCategory[] = ['Images', 'Video', 'Voice', 'Files'];
