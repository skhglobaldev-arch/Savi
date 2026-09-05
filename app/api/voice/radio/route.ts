import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const runtime = 'nodejs';

const MAX_SCRIPT_LENGTH = 12000;
const DEFAULT_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_VOICE = 'Puck';
const RADIO_AUDIO_COST = 120;
const runFile = promisify(execFile);

type RadioRequest = {
  script?: string;
  voice?: string;
  style?: string;
};

function createWavBuffer(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function extractAudioBase64(value: unknown): { data: string; mimeType: string; sampleRate?: number } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (record.type === 'audio' && typeof record.data === 'string') {
    return {
      data: record.data,
      mimeType: typeof record.mime_type === 'string' ? record.mime_type : 'audio/l16',
      sampleRate: typeof record.sample_rate === 'number' ? record.sample_rate : undefined
    };
  }

  const direct =
    (record.output_audio as { data?: unknown } | undefined)?.data ??
    (record.outputAudio as { data?: unknown } | undefined)?.data;

  if (typeof direct === 'string') return { data: direct, mimeType: 'audio/l16' };

  for (const [key, child] of Object.entries(record)) {
    if (key.toLowerCase().includes('audio') && child && typeof child === 'object') {
      const data = (child as { data?: unknown }).data;
      const mimeType = (child as { mime_type?: unknown; mimeType?: unknown }).mime_type ?? (child as { mimeType?: unknown }).mimeType;
      const sampleRate = (child as { sample_rate?: unknown; sampleRate?: unknown }).sample_rate ?? (child as { sampleRate?: unknown }).sampleRate;
      if (typeof data === 'string') {
        return {
          data,
          mimeType: typeof mimeType === 'string' ? mimeType : 'audio/l16',
          sampleRate: typeof sampleRate === 'number' ? sampleRate : undefined
        };
      }
    }
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = extractAudioBase64(item);
        if (found) return found;
      }
    } else if (child && typeof child === 'object') {
      const found = extractAudioBase64(child);
      if (found) return found;
    }
  }

  return null;
}

function createAudioPrompt(script: string, style: string) {
  return `# AUDIO PROFILE
Radio AI is a warm, confident podcast host for SAVI by SKH.GLOBAL.

# SCENE
The host is recording a polished radio podcast in a calm premium studio. The delivery should feel clear, professional, useful, and easy to listen to.

# DIRECTOR NOTES
Style: ${style}
Pace: natural radio pacing, with short pauses between sections.
Tone: helpful, practical, premium, not exaggerated.
Do not read headings mechanically. Make the script feel like a real radio segment.

# TRANSCRIPT
${script}`;
}

async function createLocalPreviewAudio(script: string) {
  const folder = path.join(tmpdir(), `savi-radio-${randomUUID()}`);
  const textPath = path.join(folder, 'script.txt');
  const aiffPath = path.join(folder, 'podcast.aiff');
  const wavPath = path.join(folder, 'podcast.wav');

  await mkdir(folder, { recursive: true });

  try {
    await writeFile(textPath, script, 'utf8');
    await runFile('/usr/bin/say', ['-f', textPath, '-o', aiffPath], { timeout: 90000 });
    await runFile('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@24000', aiffPath, wavPath], { timeout: 30000 });
    const wav = await readFile(wavPath);

    return {
      audio: `data:audio/wav;base64,${wav.toString('base64')}`,
      filename: 'savi-radio-podcast-local-preview.wav'
    };
  } finally {
    await rm(folder, { force: true, recursive: true }).catch(() => {});
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RadioRequest;
    const script = body.script?.trim() ?? '';
    const voice = body.voice?.trim() || DEFAULT_VOICE;
    const style = body.style?.trim() || 'warm professional podcast host';

    if (!script) {
      return NextResponse.json({ error: 'Podcast script is required.' }, { status: 400 });
    }

    if (script.length > MAX_SCRIPT_LENGTH) {
      return NextResponse.json({ error: `Podcast script is too long. Limit it to ${MAX_SCRIPT_LENGTH} characters for now.` }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try {
        const localAudio = await createLocalPreviewAudio(script);
        return NextResponse.json({
          ...localAudio,
          creditCost: RADIO_AUDIO_COST,
          mode: 'local-preview'
        });
      } catch {
        return NextResponse.json(
          { error: 'Podcast voice is not connected on this device yet. Add a voice provider to create downloadable audio.' },
          { status: 500 }
        );
      }
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model: process.env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL,
        input: createAudioPrompt(script, style),
        response_format: {
          type: 'audio'
        },
        generation_config: {
          speech_config: [
            {
              voice
            }
          ]
        }
      })
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const message =
        (data.error as { message?: string } | undefined)?.message ||
        'Gemini TTS could not generate the podcast audio.';
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const audioData = extractAudioBase64(data);
    if (!audioData) {
      return NextResponse.json({ error: 'Gemini returned no audio. Try a shorter script or another voice.' }, { status: 502 });
    }

    const wavBuffer = audioData.mimeType.toLowerCase().includes('wav')
      ? Buffer.from(audioData.data, 'base64')
      : createWavBuffer(Buffer.from(audioData.data, 'base64'), audioData.sampleRate || 24000);
    return NextResponse.json({
      audio: `data:audio/wav;base64,${wavBuffer.toString('base64')}`,
      filename: 'savi-radio-podcast.wav',
      creditCost: RADIO_AUDIO_COST
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Podcast audio generation failed.' },
      { status: 500 }
    );
  }
}
