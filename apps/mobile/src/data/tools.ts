import { saviToolCategories, saviTools, type SaviToolCategory } from '../../../../lib/tools/catalog';

export type MobileToolCategory = SaviToolCategory;

export type MobileTool = (typeof saviTools)[number] & {
  icon: 'image-outline' | 'film-outline' | 'volume-high-outline' | 'document-text-outline';
  accent: 'violet' | 'blue' | 'mint';
  availability: 'available';
};

export const mobileTools: MobileTool[] = saviTools.map(tool => ({
  ...tool,
  icon: tool.category === 'Images' ? 'image-outline' : tool.category === 'Video' ? 'film-outline' : tool.category === 'Voice' ? 'volume-high-outline' : 'document-text-outline',
  accent: tool.category === 'Video' ? 'blue' : tool.category === 'Voice' ? 'mint' : 'violet',
  availability: 'available',
}));
export const mobileToolCategories = saviToolCategories;
