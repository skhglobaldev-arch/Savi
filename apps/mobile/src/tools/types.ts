export type TextToImageQuality = '720' | '1080' | '4K';
export type TextToImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:5';

export type ToolQuote = {
  toolId: string;
  credits: number;
  pricingVersion: string;
  provisional: boolean;
};

export type CreditBalance = {
  availableCredits: number;
};

export type TextToImageResult = {
  assetId: string;
  image: string;
  filename: string;
  jobId: string;
  availableCredits: number;
};

export type ToolApiError = Error & {
  category?: string;
  status?: number;
};
