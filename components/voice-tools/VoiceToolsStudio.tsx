'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ToolPreview } from '@/components/ToolPreview';
import { ToolActionBar, ToolFieldLabel, ToolHeader, ToolStatus } from '@/components/SaviToolUI';
import { ToolVoiceIcon } from '@/components/SaviIcons';
import type { TemplateItem } from '@/lib/templates';
import { recordMediaItem } from '@/lib/mediaLibrary';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';
import { createSaviRadioScript, type SaviRadioFormat, type SaviRadioLength } from '@/lib/voice/radioScript';
import {
  applyAuthoritativeBalance,
  clearSaviClientRequestId,
  createSaviClientRequestId,
  createSaviRequestScope
} from '@/lib/savi/clientGeneration';

type VoiceMode = 'tts' | 'radio';
type ToneId = 'natural' | 'warm' | 'excited' | 'formal' | 'whisper' | 'cinematic';
type RadioFormatId = SaviRadioFormat;
type RadioLengthId = SaviRadioLength;

const voices = [
  { id: 'kore', name: 'Kore', feel: 'Warm female narrator' },
  { id: 'aoede', name: 'Aoede', feel: 'Smooth storyteller' },
  { id: 'callirrhoe', name: 'Callirrhoe', feel: 'Clear and elegant' },
  { id: 'despina', name: 'Despina', feel: 'Precise presenter' },
  { id: 'puck', name: 'Puck', feel: 'Bright radio host' },
  { id: 'charon', name: 'Charon', feel: 'Deep news voice' },
  { id: 'zephyr', name: 'Zephyr', feel: 'Friendly guide' },
  { id: 'fenrir', name: 'Fenrir', feel: 'Dramatic trailer voice' }
] as const;

const tones: Array<{ id: ToneId; label: string; note: string; rate: number; pitch: number }> = [
  { id: 'natural', label: 'Natural', note: 'Balanced and clean', rate: 1, pitch: 1 },
  { id: 'warm', label: 'Warm', note: 'Soft and friendly', rate: 0.94, pitch: 1.02 },
  { id: 'excited', label: 'Excited', note: 'Upbeat and energetic', rate: 1.08, pitch: 1.08 },
  { id: 'formal', label: 'Formal', note: 'Calm business delivery', rate: 0.92, pitch: 0.96 },
  { id: 'whisper', label: 'Whisper', note: 'Quiet intimate read', rate: 0.82, pitch: 0.9 },
  { id: 'cinematic', label: 'Cinematic', note: 'Trailer style pacing', rate: 0.86, pitch: 0.86 }
];

const radioFormats: Array<{ id: RadioFormatId; label: string; note: string }> = [
  { id: 'solo', label: 'Solo host', note: 'A complete hosted segment' },
  { id: 'news', label: 'News brief', note: 'Crisp anchor delivery' },
  { id: 'podcast', label: 'Podcast talk', note: 'Relaxed conversational show' },
  { id: 'story', label: 'Story show', note: 'Narrative radio episode' }
];

const radioLengths: Array<{ id: RadioLengthId; label: string; target: string }> = [
  { id: 'short', label: 'Short', target: '45 to 60 seconds' },
  { id: 'standard', label: 'Standard', target: '1 to 2 minutes' },
  { id: 'long', label: 'Long', target: '3 to 4 minutes' }
];

export const voiceToolOptions = [
  { id: 'tts' as const, label: 'Text to Speech', note: 'Read exact text with a chosen voice', previewId: 'voice_tts' },
  { id: 'radio' as const, label: 'Radio Talk AI', note: 'Turn a topic into a hosted segment', previewId: 'voice_radio' }
];

const CLOSE_ACTIVE_TOOL_EVENT = 'savi-close-active-tool';

const samples = [
  'Turn your idea into a clear system people can actually use.',
  'سلام، این یک نمونه صدای فارسی برای SAVI است.',
  'Create a calm product intro for a premium AI workspace.',
  'Read this paragraph with confidence, warmth, and a natural pace.'
];

function speak(text: string, tone: ToneId) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const option = tones.find((item) => item.id === tone) ?? tones[0];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = option.rate;
  utterance.pitch = option.pitch;
  window.speechSynthesis.speak(utterance);
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VoiceToolsStudio({
  credits,
  onCreditsChange,
  template,
  templateLaunchKey = 0,
  launchToolId,
  launchKey = 0
}: {
  credits: number | null;
  onCreditsChange: (credits: number) => void;
  template?: TemplateItem;
  templateLaunchKey?: number;
  launchToolId?: string;
  launchKey?: number;
}) {
  const { user, isLoading: isAuthLoading, signIn } = useSaviAuth();
  const [mode, setMode] = useState<VoiceMode>('tts');
  const [isToolOpen, setIsToolOpen] = useState(false);
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<(typeof voices)[number]['id']>('kore');
  const [tone, setTone] = useState<ToneId>('natural');
  const [radioFormat, setRadioFormat] = useState<RadioFormatId>('solo');
  const [radioLength, setRadioLength] = useState<RadioLengthId>('short');
  const [result, setResult] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioName, setAudioName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [serverQuote, setServerQuote] = useState<number | null>(null);

  const selectedVoice = voices.find((item) => item.id === voice) ?? voices[0];
  const selectedTone = tones.find((item) => item.id === tone) ?? tones[0];
  const selectedLength = radioLengths.find((item) => item.id === radioLength) ?? radioLengths[0];
  const quoteLabel = serverQuote === null
    ? user ? 'Price unavailable' : 'Sign in to view price'
    : `${serverQuote} credits`;

  useEffect(() => {
    if (isAuthLoading || !user) {
      setServerQuote(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      toolId: mode === 'radio' ? 'radio_talk' : 'text_to_speech',
      textCharacters: String(Math.max(1, text.length))
    });
    void fetch(`/api/pricing/quote?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) as { credits?: unknown } }))
      .then(({ response, data }) => {
        if (response.ok && typeof data.credits === 'number') setServerQuote(data.credits);
        else setServerQuote(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setServerQuote(null);
      });
    return () => controller.abort();
  }, [isAuthLoading, mode, text.length, user?.id]);

  useEffect(() => {
    const closeActiveTool = () => {
      setIsToolOpen(false);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    };
    window.addEventListener(CLOSE_ACTIVE_TOOL_EVENT, closeActiveTool);
    return () => window.removeEventListener(CLOSE_ACTIVE_TOOL_EVENT, closeActiveTool);
  }, []);

  useEffect(() => {
    if (!template || templateLaunchKey === 0) return;

    if (template.id === 'blog-to-audio') {
      setMode('tts');
      setIsToolOpen(true);
      setText(`${template.prompt}\n\nPaste the blog text or URL here.`);
      setResult('');
      setAudioUrl('');
      setAudioName('');
      setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [template, templateLaunchKey]);

  useEffect(() => {
    if (!launchToolId || launchKey === 0) return;
    const nextTool = voiceToolOptions.find((tool) => tool.id === launchToolId);
    if (!nextTool) return;
    setMode(nextTool.id);
    setIsToolOpen(true);
    setText('');
    setResult('');
    setAudioUrl('');
    setAudioName('');
    setError('');
  }, [launchKey, launchToolId]);

  async function generate() {
    setError('');
    if (!text.trim()) {
      setError(mode === 'radio' ? 'Write a topic or paste notes first.' : 'Write the text you want to turn into speech.');
      return;
    }
    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    const nextResult = mode === 'radio' ? createSaviRadioScript(text, radioFormat, radioLength) : text.trim();
    const requestScope = createSaviRequestScope('voice-generate', [
      mode,
      nextResult,
      selectedVoice.name,
      selectedTone.label,
      radioFormat,
      radioLength
    ]);
    setIsGenerating(true);
    setResult('');
    setAudioUrl('');
    setAudioName('');

    try {
      const response = await fetch('/api/voice/radio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          toolId: mode === 'radio' ? 'radio_talk' : 'text_to_speech',
          clientRequestId: createSaviClientRequestId(requestScope),
          script: nextResult,
          voice: selectedVoice.name,
          style:
            mode === 'radio'
              ? `${selectedTone.label} ${radioFormat} radio show, ${selectedLength.target}, polished host delivery`
              : `${selectedTone.label} text to speech, exact wording, clear natural delivery`
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        audio?: string;
        filename?: string;
        error?: string;
        availableCredits?: number;
        jobId?: string;
      };

      if (response.status !== 202) clearSaviClientRequestId(requestScope);

      if (!response.ok || !data.audio) {
        if (response.status === 202 && data.jobId) {
          throw new Error('SAVI is still finishing this audio. Generate again in a moment to check the same safe request without a second charge.');
        }
        throw new Error(data.error || 'Voice generation failed.');
      }

      setResult(nextResult);
      setAudioUrl(data.audio);
      setAudioName(data.filename || (mode === 'radio' ? 'savi-radio-talk.wav' : 'savi-text-to-speech.wav'));
      recordMediaItem({
        type: 'audio',
        title: mode === 'radio' ? 'Radio Talk AI' : 'Text to Speech',
        source: 'Voice',
        url: data.audio,
        filename: data.filename || (mode === 'radio' ? 'savi-radio-talk.wav' : 'savi-text-to-speech.wav'),
        text: nextResult
      });
      applyAuthoritativeBalance(data.availableCredits, onCreditsChange);
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : 'Voice generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  const placeholder = mode === 'radio'
    ? 'Example: Turn my notes about launching SAVI into a 90-second Persian radio segment with a warm host, clear intro, useful points, and a confident ending.'
    : 'Example: Read this product intro in a warm natural voice: “SAVI turns ideas, files, and tasks into usable outputs.”';

  return (
    <section className="savi-tool-shell">
      <ToolHeader
        mark={<ToolVoiceIcon />}
        eyebrow={isToolOpen ? 'Voice tool' : 'Voice tools'}
        title={isToolOpen ? (mode === 'radio' ? 'Radio Talk AI' : 'Text to Speech') : 'Voice tools'}
        description={isToolOpen
          ? mode === 'radio'
            ? 'Turn a topic or document script into a hosted radio segment.'
            : 'Read exact text with the voice and tone you choose.'
          : 'Text to speech and Radio Talk are separate tools, each with its own voice, tone, and output style.'}
      />

      {!isToolOpen && (
      <div className="grid gap-2 border-b border-white/10 bg-white/[0.02] p-5 md:grid-cols-2 md:p-6">
        {voiceToolOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setMode(item.id);
              setIsToolOpen(true);
              setText('');
              setResult('');
              setAudioUrl('');
              setAudioName('');
              setError('');
            }}
            className={`min-h-[44px] rounded-lg border px-4 py-3 text-left text-white transition ${mode === item.id ? 'border-white/25 bg-white/[0.1]' : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.07]'}`}
          >
            <span className="block font-black">{item.label}</span>
            <span className="mt-1 block text-xs opacity-75">{item.note}</span>
            <ToolPreview previewId={item.previewId} compact />
          </button>
        ))}
      </div>
      )}

      {isToolOpen && (
      <>
      <div className="grid gap-5 p-5 xl:grid-cols-[1fr_0.72fr] md:p-6">
        <div className="savi-tool-section">
          <ToolFieldLabel
            label={mode === 'radio' ? 'Add a topic or script' : 'Paste the text to read'}
            hint={mode === 'radio' ? 'Give SAVI the subject and key points for a hosted segment.' : 'SAVI will speak these words exactly as written.'}
            badge="Required"
          />
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            placeholder={placeholder}
            aria-label={mode === 'radio' ? 'Radio Talk script or topic' : 'Text to Speech text'}
            className="min-h-[180px] w-full resize-none bg-transparent text-base leading-7 text-white outline-none placeholder:text-white/35"
          />
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="mb-3 text-xs font-bold text-white/45">{text.length.toLocaleString()} characters</p>
            <ToolActionBar
              quote={serverQuote}
              credits={credits}
              quoteLabel={quoteLabel}
              disabled={isGenerating}
              loading={isGenerating ? 'Generating...' : undefined}
              label={mode === 'radio' ? 'Create radio segment' : 'Generate audio'}
              onClick={generate}
            />
          </div>
        </div>

        <div className="space-y-4">
          <ControlGroup title="Voice" value={`${selectedVoice.name} - ${selectedVoice.feel}`}>
            <div className="grid grid-cols-2 gap-2">
              {voices.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setVoice(item.id)}
                  className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${voice === item.id ? 'border-violet-300 bg-violet-100 text-violet-950' : 'border-violet-100 bg-white/65 text-slate-600 hover:bg-white'}`}
                >
                  <strong className="block">{item.name}</strong>
                  <span className="mt-1 block text-xs opacity-70">{item.feel}</span>
                </button>
              ))}
            </div>
          </ControlGroup>

          <ControlGroup title="Tone" value={`${selectedTone.label} - ${selectedTone.note}`}>
            <div className="grid grid-cols-2 gap-2">
              {tones.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTone(item.id)}
                  className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${tone === item.id ? 'border-blue-300 bg-blue-100 text-blue-950' : 'border-violet-100 bg-white/65 text-slate-600 hover:bg-white'}`}
                >
                  <strong className="block">{item.label}</strong>
                  <span className="mt-1 block text-xs opacity-70">{item.note}</span>
                </button>
              ))}
            </div>
          </ControlGroup>
        </div>
      </div>

      {mode === 'radio' && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ControlGroup title="Radio format" value={radioFormats.find((item) => item.id === radioFormat)?.label ?? 'Solo host'}>
            <div className="grid gap-2 sm:grid-cols-2">
              {radioFormats.map((item) => (
                <button key={item.id} type="button" onClick={() => setRadioFormat(item.id)} className={`rounded-2xl border px-4 py-3 text-left text-sm ${radioFormat === item.id ? 'border-violet-300 bg-violet-100 text-violet-950' : 'border-violet-100 bg-white/65 text-slate-600'}`}>
                  <strong>{item.label}</strong>
                  <span className="mt-1 block text-xs opacity-70">{item.note}</span>
                </button>
              ))}
            </div>
          </ControlGroup>
          <ControlGroup title="Length" value={`${selectedLength.label} - ${selectedLength.target}`}>
            <div className="grid gap-2 sm:grid-cols-3">
              {radioLengths.map((item) => (
                <button key={item.id} type="button" onClick={() => setRadioLength(item.id)} className={`rounded-2xl border px-4 py-3 text-left text-sm ${radioLength === item.id ? 'border-blue-300 bg-blue-100 text-blue-950' : 'border-violet-100 bg-white/65 text-slate-600'}`}>
                  <strong>{item.label}</strong>
                  <span className="mt-1 block text-xs opacity-70">{item.target}</span>
                </button>
              ))}
            </div>
          </ControlGroup>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.62fr_1fr]">
        <div className="rounded-[26px] border border-violet-100 bg-white/65 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Voice samples</p>
          <div className="mt-3 grid gap-2">
            {samples.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => speak(sample, tone)}
                className="min-h-[44px] rounded-lg border border-violet-100 bg-white/70 px-4 py-3 text-left text-sm font-bold text-slate-700 hover:border-violet-300"
              >
                Play sample
                <span className="mt-1 block text-xs font-medium text-slate-500">{sample}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[26px] border border-violet-100 bg-white/65 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Output</p>
              <p className="mt-1 text-sm text-slate-600">Audio and script appear here after generation.</p>
            </div>
            {result && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadText(mode === 'radio' ? 'savi-radio-script.txt' : 'savi-tts-script.txt', result)} className="inline-flex min-h-[44px] items-center rounded-lg border border-violet-200 bg-white px-5 py-3 text-sm font-black text-slate-800">
                  Download script
                </button>
                {audioUrl && (
                    <a href={audioUrl} download={audioName || 'savi-voice.wav'} className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-950 px-5 py-3 text-sm font-black text-white">
                    Download audio
                  </a>
                )}
              </div>
            )}
          </div>
          {error && <div className="mt-4"><ToolStatus kind="error">{error}</ToolStatus></div>}
          {audioUrl && (
            <div className="mt-4 rounded-[22px] border border-violet-100 bg-violet-50/80 p-4">
              <audio controls src={audioUrl} className="w-full" />
              <p className="mt-2 text-xs font-bold text-slate-500">
                {audioName || 'savi-voice.wav'}
              </p>
            </div>
          )}
          <div className="mt-4 min-h-[180px] whitespace-pre-wrap rounded-[22px] border border-violet-100 bg-white/80 p-4 text-sm leading-7 text-slate-700">
            {isGenerating ? 'Creating playable audio...' : result || 'Your generated voice script or radio segment will appear here.'}
          </div>
        </div>
      </div>

      </>
      )}
    </section>
  );
}

function ControlGroup({ title, value, children }: { title: string; value: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex min-h-[44px] w-full items-center justify-between gap-4 text-left">
        <span>
          <span className="block text-xs font-black uppercase tracking-[0.16em] text-violet-500">{title}</span>
          <span className="mt-1 block text-sm font-bold text-slate-700">{value}</span>
        </span>
        <span aria-hidden="true" className={`grid h-[44px] w-[44px] place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white transition ${open ? 'rotate-90' : ''}`}>
          <span className="h-2.5 w-2.5 -rotate-45 border-b border-r border-white/55" />
        </span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
