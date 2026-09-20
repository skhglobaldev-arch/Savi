import { randomUUID } from 'node:crypto';

import type { SaviUser } from '@/lib/auth/session';
import { getSaviDataConnect } from '@/lib/firebase/admin';
import { resolveSaviDatabaseUser } from '@/lib/savi/textToImageInfrastructure';

const MAX_MESSAGE_LENGTH = 4000;

type DatabaseMessage = {
  id: string;
  role: string;
  content: string;
  clientMessageId: string;
  status: string;
  createdAt: string;
};

type DatabaseConversation = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SaviChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type SaviConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: SaviChatMessage[];
};

async function query<T, Variables extends object>(operation: string, variables: Variables) {
  return (await getSaviDataConnect().executeQuery<T, Variables>(operation, variables)).data;
}

async function mutate<T, Variables extends object>(operation: string, variables: Variables) {
  return (await getSaviDataConnect().executeMutation<T, Variables>(operation, variables)).data;
}

function titleFor(message: string) {
  const normalized = message.replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const topic = normalized.replace(/^(please|can you|could you|help me|i need|i want to)\s+/i, '');
  return topic.slice(0, 42).trim() || 'Conversation';
}

function mapConversation(conversation: DatabaseConversation, messages?: DatabaseMessage[]): SaviConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    ...(messages ? {
      messages: messages
        .filter((message): message is DatabaseMessage & { role: 'user' | 'assistant' } => message.role === 'user' || (message.role === 'assistant' && message.status === 'completed'))
        .map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.createdAt }))
    } : {})
  };
}

export async function resolveChatUser(user: SaviUser) {
  return resolveSaviDatabaseUser(user);
}

export async function listSaviConversations(user: SaviUser) {
  const databaseUser = await resolveChatUser(user);
  const data = await query<{ chatConversations?: DatabaseConversation[] }, { userId: string }>('ListChatConversations', { userId: databaseUser.id });
  return (data.chatConversations || []).map((conversation) => mapConversation(conversation));
}

export async function getSaviConversation(user: SaviUser, conversationId: string) {
  const databaseUser = await resolveChatUser(user);
  const data = await query<{ chatConversations?: DatabaseConversation[]; chatMessages?: DatabaseMessage[] }, { userId: string; conversationId: string }>('GetChatConversationForUser', {
    userId: databaseUser.id,
    conversationId
  });
  const conversation = data.chatConversations?.[0];
  return conversation ? mapConversation(conversation, data.chatMessages || []) : null;
}

type StoredTurn = { id: string; conversationId: string; content: string; status: string };

export type SaviChatTurn = {
  conversationId: string;
  assistantMessageId: string;
  state: 'ready' | 'pending' | 'completed';
  response?: string;
};

export async function startSaviChatTurn(user: SaviUser, content: string, clientMessageId: string, requestedConversationId?: string): Promise<SaviChatTurn> {
  if (!content || content.length > MAX_MESSAGE_LENGTH) throw new Error('Invalid chat message.');
  const databaseUser = await resolveChatUser(user);
  const assistantClientMessageId = `assistant:${clientMessageId}`;
  const existing = await query<{ userMessages?: StoredTurn[]; assistantMessages?: StoredTurn[] }, { clientMessageId: string; assistantClientMessageId: string }>('FindChatTurnByClientMessageId', {
    clientMessageId,
    assistantClientMessageId
  });
  const userMessage = existing.userMessages?.[0];
  const assistantMessage = existing.assistantMessages?.[0];
  if (userMessage) {
    const conversation = await getSaviConversation(user, userMessage.conversationId);
    if (!conversation) throw new Error('Conversation not found.');
    if (!assistantMessage) {
      const assistantMessageId = randomUUID();
      await mutate('CreateChatAssistantPlaceholder', { assistantMessageId, conversationId: conversation.id, userId: databaseUser.id, assistantClientMessageId });
      return { conversationId: conversation.id, assistantMessageId, state: 'ready' };
    }
    if (assistantMessage.conversationId !== conversation.id) throw new Error('Conversation not found.');
    if (assistantMessage.status === 'completed') return { conversationId: conversation.id, assistantMessageId: assistantMessage.id, state: 'completed', response: assistantMessage.content };
    if (assistantMessage.status === 'pending') return { conversationId: conversation.id, assistantMessageId: assistantMessage.id, state: 'pending' };
    await mutate('ClaimFailedChatAssistant', { assistantMessageId: assistantMessage.id, conversationId: conversation.id });
    return { conversationId: conversation.id, assistantMessageId: assistantMessage.id, state: 'ready' };
  }

  const conversationId = requestedConversationId || randomUUID();
  const assistantMessageId = randomUUID();
  if (requestedConversationId) {
    const conversation = await getSaviConversation(user, requestedConversationId);
    if (!conversation) throw new Error('Conversation not found.');
    const firstUserMessage = conversation.messages?.find((message) => message.role === 'user')?.content || content;
    await mutate('AppendChatTurn', {
      userMessageId: randomUUID(), conversationId, userId: databaseUser.id,
      content, clientMessageId, title: titleFor(firstUserMessage)
    });
  } else {
    await mutate('CreateChatConversationWithMessage', {
      conversationId, userMessageId: randomUUID(), userId: databaseUser.id,
      title: titleFor(content), content, clientMessageId
    });
  }
  await mutate('CreateChatAssistantPlaceholder', { assistantMessageId, conversationId, userId: databaseUser.id, assistantClientMessageId });
  return { conversationId, assistantMessageId, state: 'ready' };
}

export async function completeSaviChatTurn(conversationId: string, assistantMessageId: string, content: string) {
  await mutate('CompleteChatAssistant', { conversationId, assistantMessageId, content });
}

export async function failSaviChatTurn(conversationId: string, assistantMessageId: string) {
  await mutate('FailChatAssistant', { conversationId, assistantMessageId });
}

export function chatHistory(messages: SaviChatMessage[]) {
  return messages.slice(-14).map((message) => ({ role: message.role, content: message.content }));
}
