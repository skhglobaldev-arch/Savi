import { NextRequest, NextResponse } from 'next/server';

import { getSaviConversation } from '@/lib/ai/conversations';
import { readSaviRequestSession } from '@/lib/auth/requestSession';
import { SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = readSaviRequestSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in to view this chat.' }, { status: 401 });
  const { conversationId } = await params;
  try {
    const conversation = await getSaviConversation(session, conversationId);
    if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof SaviInfrastructureError) return NextResponse.json({ error: 'This SAVI account is unavailable.' }, { status: error.status });
    return NextResponse.json({ error: 'SAVI conversations are temporarily unavailable.' }, { status: 503 });
  }
}
