import { NextRequest, NextResponse } from 'next/server';

import { readSaviRequestSession } from '@/lib/auth/requestSession';
import { listSaviConversations } from '@/lib/ai/conversations';
import { SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = readSaviRequestSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in to view chats.' }, { status: 401 });
  try {
    return NextResponse.json({ conversations: await listSaviConversations(session) });
  } catch (error) {
    if (error instanceof SaviInfrastructureError) return NextResponse.json({ error: 'This SAVI account is unavailable.' }, { status: error.status });
    return NextResponse.json({ error: 'SAVI conversations are temporarily unavailable.' }, { status: 503 });
  }
}
