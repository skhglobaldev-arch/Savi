import { saviApiOrigin } from '@/src/auth/config';

import type { MobileChatMessage, MobileConversation } from './types';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === 'string' ? body.error : 'SAVI chat is temporarily unavailable.';
}

export async function listMobileConversations(token: string): Promise<MobileConversation[]> {
  const response = await fetch(`${saviApiOrigin}/api/ai/chat/conversations`, { headers: authHeaders(token) });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { conversations?: MobileConversation[] };
  return body.conversations || [];
}

export async function getMobileConversation(token: string, conversationId: string): Promise<MobileConversation> {
  const response = await fetch(`${saviApiOrigin}/api/ai/chat/conversations/${encodeURIComponent(conversationId)}`, { headers: authHeaders(token) });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { conversation?: MobileConversation };
  if (!body.conversation) throw new Error('Conversation not found.');
  return body.conversation;
}

export async function sendMobileChatMessage(token: string, message: string, conversationId?: string, requestId?: string) {
  const clientRequestId = requestId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await fetch(`${saviApiOrigin}/api/ai/chat`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationId, clientRequestId })
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { response?: string; conversationId?: string };
  if (!body.response || !body.conversationId) throw new Error('SAVI did not return a chat response.');
  return { response: body.response, conversationId: body.conversationId, clientRequestId };
}

export function optimisticMessage(content: string): MobileChatMessage {
  return { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, role: 'user', content, createdAt: new Date().toISOString() };
}
