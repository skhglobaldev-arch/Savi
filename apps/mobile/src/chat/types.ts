export type MobileChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  failed?: boolean;
};

export type MobileConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: MobileChatMessage[];
};
