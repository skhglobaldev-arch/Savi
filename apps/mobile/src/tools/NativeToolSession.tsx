import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { IconButton, PrimaryButton, SectionLabel, Surface } from '@/src/components/UI';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { imageAspectRatios, imageQualities, imageStyles, mockupPresets, radioFormats, radioLengths, videoDurations, videoRatios, visualMixerCategories } from '../../../../lib/tools/catalog';
import { SAVI_TTS_TONES, SAVI_TTS_VOICES } from '../../../../lib/ai/toolAssistant';
import { inputIssue, quoteCanExecute, toolContract, type PagePlan, type SessionFile, type ToolContract, type ToolInput } from '../../../../lib/tools/session';
import { Options, PdfPages, SelectedFiles } from './SessionControls';
import { authenticatedRequest, executeNativeTool, handleExpiredToolSession, inspectNativePdf, quoteNativeTool, type NativeToolResult } from './sessionApi';
import { getCreditBalance } from './toolApi';
import { downloadPrivateFile } from './privateFiles';
import { ToolResult } from './ToolResult';
import { SketchInput } from './SketchInput';
import type { ToolQuote } from './types';

export function NativeToolSession({ contract, onBack, initialInput }: { contract: ToolContract; onBack: () => void; initialInput?: Partial<ToolInput> }) {
  const { accessToken, restore } = useMobileAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [input, setInput] = useState<ToolInput>({ prompt: '', quality: '1080', aspectRatio: contract.kind === 'video' ? '9:16' : '1:1', style: imageStyles[0], duration: '6', withAudio: true, voice: SAVI_TTS_VOICES[0].name, tone: SAVI_TTS_TONES[0].id, radioFormat: 'solo', radioLength: 'short', pages: 'all', ...initialInput });
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [pages, setPages] = useState<PagePlan>([]);
  const [quote, setQuote] = useState<ToolQuote | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [result, setResult] = useState<NativeToolResult | null>(null);
  const [podcastScript, setPodcastScript] = useState<string | null>(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const ownedFiles = useRef<File[]>([]);
  const quoteKey = JSON.stringify({ input, files: files.map(({ uri, name, size, pageCount }) => ({ uri, name, size, pageCount })) });
  const latestQuoteKey = useRef(quoteKey);
  latestQuoteKey.current = quoteKey;
  const [quotedKey, setQuotedKey] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const file of ownedFiles.current) { try { file.delete(); } catch { /* Temporary picker file may already be removed. */ } } };
  }, []);
  useEffect(() => navigation.addListener('beforeRemove', event => { if (inFlight.current) event.preventDefault(); }), [navigation]);

  function reset() { requestId.current = null; setConfirmed(false); setResult(null); setError(null); }
  function update<K extends keyof ToolInput>(key: K, value: ToolInput[K]) { if (inFlight.current) return; reset(); setInput(previous => ({ ...previous, [key]: value })); }
  function updateFiles(next: SessionFile[]) { if (inFlight.current) return; reset(); setFiles(next); }

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    setQuote(null); setQuotedKey(null); setQuoteLoading(true); setQuoteError(null);
    const timer = setTimeout(() => {
      void Promise.all([quoteNativeTool(accessToken, contract, input, files, controller.signal), getCreditBalance(accessToken)])
        .then(([nextQuote, account]) => { if (!controller.signal.aborted && latestQuoteKey.current === quoteKey) { setQuote(nextQuote); setBalance(account.availableCredits); setQuotedKey(quoteKey); } })
        .catch(cause => { if (!controller.signal.aborted) { setQuoteError(cause instanceof Error ? cause.message : 'Quote unavailable.'); void handleExpiredToolSession(cause, accessToken, restore).catch(() => undefined); } })
        .finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [accessToken, contract, quoteKey, quoteRevision]);

  const pick = useCallback(async (role?: string) => {
    if (!accessToken || inFlight.current || reading) return;
    setReading(true); setError(null);
    try {
      const selection = await DocumentPicker.getDocumentAsync({ type: contract.mimeTypes, multiple: contract.tool.id === 'visual_mixer' || (!role && contract.maxFiles > 1), copyToCacheDirectory: true });
      if (selection.canceled || !mounted.current) return;
      const selected: SessionFile[] = selection.assets.map(asset => {
        const file = new File(asset.uri); ownedFiles.current.push(file);
        return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType || file.type || (asset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : ''), size: asset.size || file.size, role };
      });
      if (selected.some(file => !contract.mimeTypes.includes(file.mimeType) || file.size > contract.maxFileBytes || file.size <= 0)) throw new Error(`Use supported files under ${Math.round(contract.maxFileBytes / 1024 / 1024)} MB.`);
      const next = role ? [...files.filter(file => file.role !== role || contract.tool.id === 'visual_mixer'), ...selected] : contract.maxFiles === 1 ? selected : [...files, ...selected];
      if (contract.tool.id === 'visual_mixer' && next.filter(file => file.role === role).length > 2) throw new Error('Choose up to two references per category.');
      if (next.length > contract.maxFiles) throw new Error(`Choose up to ${contract.maxFiles} files.`);
      if (contract.pdf) {
        for (const file of selected) file.pageCount = await inspectNativePdf(accessToken, file);
        if (contract.tool.id !== 'merge') setPages(Array.from({ length: selected[0].pageCount || 0 }, (_, i) => ({ pageNumber: i + 1, rotation: 0, selected: true })));
      }
      if (!mounted.current) return;
      reset(); setFiles(next);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'File selection failed.'); }
    finally { if (mounted.current) setReading(false); }
  }, [accessToken, contract, files, reading]);

  const issue = inputIssue(contract, input, files, pages);
  const insufficient = quote !== null && balance !== null && balance < quote.credits;
  const ready = !issue && !reading && !executing && quotedKey === quoteKey && quoteCanExecute(quote?.credits ?? null, balance);
  const run = async () => {
    if (!accessToken || !ready || !confirmed || inFlight.current) return;
    inFlight.current = true; setExecuting(true); setError(null);
    requestId.current ||= `mobile_${Crypto.randomUUID().replace(/-/g, '')}`;
    try {
      const output = await executeNativeTool(accessToken, contract, input, files, pages, requestId.current);
      if (mounted.current) { setResult(output); if (typeof output.availableCredits === 'number') setBalance(output.availableCredits); }
      requestId.current = null;
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'SAVI could not finish this request.');
      void handleExpiredToolSession(cause, accessToken, restore).catch(() => undefined);
    } finally { inFlight.current = false; if (mounted.current) setExecuting(false); }
  };

  const continueStory = async () => {
    if (!result || !accessToken || reading || executing) return;
    setReading(true);
    try {
      const file = await downloadPrivateFile(accessToken, result.assetId, result.filename);
      ownedFiles.current.push(file);
      const reference: SessionFile = { uri: file.uri, name: result.filename, size: file.size, mimeType: contract.kind === 'video' ? 'video/mp4' : 'image/png' };
      if (mounted.current) { reset(); setFiles([reference]); setInput(previous => ({ ...previous, prompt: '' })); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not use this result as a reference.'); }
    finally { setReading(false); }
  };

  const openPodcastAudio = async () => {
    if (!result || !accessToken || reading || executing) return;
    setReading(true); setError(null);
    try {
      const response = await authenticatedRequest(accessToken, `/api/assets/${result.assetId}`);
      const script = await response.text();
      if (!script.trim()) throw new Error('The podcast script is empty.');
      if (script.length > 12000) throw new Error('The script exceeds the current 12,000-character audio limit.');
      if (mounted.current) setPodcastScript(script);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not load the podcast script.'); }
    finally { if (mounted.current) setReading(false); }
  };

  if (podcastScript !== null) return <NativeToolSession contract={toolContract('radio')!} onBack={() => setPodcastScript(null)} initialInput={{ prompt: podcastScript, voice: 'Puck', tone: 'warm', preparedScript: true }} />;

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.md) }]}><IconButton icon="chevron-back" label="Back to tools" onPress={executing ? undefined : onBack} muted /><View style={styles.headerCopy}><Text style={styles.title}>{contract.tool.title}</Text><Text style={styles.detail}>{contract.tool.description}</Text></View></View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView scrollEnabled={!drawing} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl }]}>
        {contract.tool.id === 'sketch_to_image' ? <SketchInput disabled={executing || reading} onDrawing={setDrawing} onUse={file => { ownedFiles.current.push(file); updateFiles([{ uri: file.uri, name: 'sketch.png', mimeType: 'image/png', size: file.size }]); }} /> : null}
        {contract.maxFiles > 0 ? <>
          <SectionLabel>{contract.pdf ? 'Documents' : contract.tool.id === 'sketch_to_image' ? 'Sketch reference' : 'References'}</SectionLabel>
          {contract.tool.id === 'first_last' ? <><PrimaryButton disabled={reading || executing} icon="image-outline" label="Choose start frame" onPress={() => void pick('Start frame')} /><PrimaryButton disabled={reading || executing} icon="image-outline" label="Choose end frame" onPress={() => void pick('End frame')} /><PrimaryButton disabled={reading || executing} icon="add" label="Optional reference" onPress={() => void pick('Reference')} /></> : contract.tool.id === 'visual_mixer' ? visualMixerCategories.map(category => <PrimaryButton key={category.id} disabled={reading || executing} icon="image-outline" label={`Choose ${category.title.toLowerCase()} reference`} onPress={() => void pick(category.title)} />) : <PrimaryButton disabled={reading || executing} icon={contract.pdf ? 'document-outline' : contract.kind === 'video' && contract.mimeTypes.includes('video/mp4') ? 'film-outline' : 'image-outline'} label={reading ? 'Reading files...' : files.length ? 'Choose or add files' : contract.pdf ? 'Choose PDFs' : 'Choose reference'} onPress={() => void pick()} />}
          <SelectedFiles files={files} disabled={executing || reading} onChange={updateFiles} />
          {files.filter(file => file.mimeType.startsWith('image/')).map(file => <Image key={file.uri} source={{ uri: file.uri }} accessibilityLabel={file.role || file.name} style={styles.reference} resizeMode="contain" />)}
          {reading ? <ActivityIndicator color={colors.violet} /> : null}
        </> : null}
        {contract.tool.id === 'organize' || contract.tool.id === 'split' ? <PdfPages pages={pages} disabled={executing} organize={contract.tool.id === 'organize'} onChange={next => { if (!inFlight.current) { reset(); setPages(next); } }} /> : null}
        {contract.tool.id === 'jpg' ? <><SectionLabel>Pages</SectionLabel><TextInput accessibilityLabel="PDF page range" editable={!executing} value={input.pages} onChangeText={value => update('pages', value)} placeholder="all or 1-3, 5" placeholderTextColor={colors.textSubtle} style={styles.field} /></> : null}
        {!contract.pdf || contract.endpoint.endsWith('/ai') ? <><SectionLabel>{contract.kind === 'audio' ? contract.tool.id === 'radio' ? 'Topic' : 'Script' : contract.pdf ? 'Guidance (optional)' : 'Prompt'}</SectionLabel><TextInput accessibilityLabel="Tool prompt or script" editable={!executing} multiline textAlignVertical="top" maxLength={contract.maxPromptLength} value={input.prompt} onChangeText={value => update('prompt', value)} placeholder={contract.tool.promptPlaceholder || 'Write what you want to create...'} placeholderTextColor={colors.textSubtle} style={[styles.field, styles.prompt]} /></> : null}
        {contract.tool.id === 'visual_mixer' ? visualMixerCategories.map(category => { const key = category.id === 'style' ? 'mixerStyle' : category.id; return <View key={category.id}><SectionLabel>{category.title}</SectionLabel><TextInput accessibilityLabel={`${category.title} brief`} editable={!executing} value={input[key] || ''} onChangeText={value => update(key, value)} maxLength={1000} placeholder={category.placeholder} placeholderTextColor={colors.textSubtle} style={styles.field} /></View>; }) : null}
        {contract.tool.category === 'Images' && contract.kind === 'image' ? <><Options label="Quality" options={imageQualities} value={input.quality} disabled={executing} onChange={value => update('quality', value)} /><Options label="Aspect ratio" options={imageAspectRatios} value={input.aspectRatio} disabled={executing} onChange={value => update('aspectRatio', value)} /><Options label="Style" options={imageStyles} value={input.style} disabled={executing} onChange={value => update('style', value)} /></> : null}
        {contract.tool.id === 'mockup' ? <Options label="Surface" options={mockupPresets.map(item => ({ id: item.id, label: item.label }))} value="" disabled={executing} onChange={value => { const preset = mockupPresets.find(item => item.id === value); if (preset) update('prompt', preset.defaultPrompt); }} /> : null}
        {contract.kind === 'video' ? <><Options label="Duration (seconds)" options={videoDurations} value={input.duration} disabled={executing} onChange={value => update('duration', value)} /><Options label="Aspect ratio" options={videoRatios} value={input.aspectRatio} disabled={executing} onChange={value => update('aspectRatio', value)} /><View style={styles.toggle}><Text style={styles.detail}>Include audio</Text><Switch accessibilityLabel="Include video audio" disabled={executing} value={input.withAudio} onValueChange={value => update('withAudio', value)} /></View><Text style={styles.detail}>720p</Text></> : null}
        {contract.kind === 'audio' ? <><Options label="Voice" options={SAVI_TTS_VOICES.map(voice => ({ id: voice.name, label: voice.name }))} value={input.voice} disabled={executing} onChange={value => update('voice', value)} />{!input.preparedScript ? <Options label="Tone" options={SAVI_TTS_TONES} value={input.tone} disabled={executing} onChange={value => update('tone', value)} /> : null}{contract.tool.id === 'radio' && !input.preparedScript ? <><Options label="Format" options={radioFormats} value={input.radioFormat} disabled={executing} onChange={value => update('radioFormat', value as ToolInput['radioFormat'])} /><Options label="Length" options={radioLengths} value={input.radioLength} disabled={executing} onChange={value => update('radioLength', value as ToolInput['radioLength'])} /></> : null}</> : null}
        <Surface style={styles.quote}><Text style={styles.label}>Current quote</Text>{quoteLoading ? <ActivityIndicator color={colors.violet} /> : <Text style={styles.price}>{quote ? `${quote.credits.toLocaleString()} credits` : 'Unavailable'}</Text>}<Text style={[styles.detail, insufficient && styles.error]}>Available: {balance === null ? 'Loading...' : `${balance.toLocaleString()} credits`}{insufficient ? ' · insufficient credits' : ''}</Text></Surface>
        {quoteError ? <><Text accessibilityRole="alert" style={styles.error}>{quoteError}</Text><PrimaryButton icon="refresh" label="Reload quote" disabled={executing} onPress={() => setQuoteRevision(value => value + 1)} /></> : null}
        {issue ? <Text style={styles.detail}>{issue}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {result && accessToken ? <><ToolResult result={result} token={accessToken} />{contract.tool.id === 'pdf_podcast' ? <PrimaryButton disabled={reading || executing} icon="volume-high-outline" label="Review podcast audio" onPress={() => void openPodcastAudio()} /> : null}{contract.tool.id === 'story_sketch' || contract.tool.id === 'story_video' ? <PrimaryButton disabled={reading || executing} icon="arrow-forward" label="Continue from this shot" onPress={() => void continueStory()} /> : null}</> : confirmed ? <Surface style={styles.confirmation}><Text style={styles.label}>{contract.tool.title} · {quote?.credits ?? '—'} credits</Text><PrimaryButton disabled={!ready} icon="sparkles" label={executing ? 'Processing...' : requestId.current ? 'Check same request' : 'Confirm and run'} onPress={() => void run()} /><PrimaryButton disabled={executing} icon="create-outline" label="Edit inputs" onPress={() => setConfirmed(false)} /></Surface> : <PrimaryButton disabled={!ready} icon="arrow-forward" label="Review request" onPress={() => setConfirmed(true)} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

const styles = StyleSheet.create({ screen: { backgroundColor: colors.canvas, flex: 1 }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }, headerCopy: { flex: 1, gap: 4 }, title: { color: colors.text, fontSize: 20, fontWeight: '800' }, detail: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, content: { gap: spacing.md, paddingHorizontal: spacing.lg }, field: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, color: colors.text, fontSize: 16, padding: spacing.md, minHeight: 48 }, prompt: { minHeight: 144, maxHeight: 300 }, reference: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.surface }, toggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, quote: { gap: spacing.xs, padding: spacing.md }, label: { color: colors.text, fontSize: 15, fontWeight: '700' }, price: { color: colors.mint, fontSize: 20, fontWeight: '800' }, error: { color: colors.danger, fontSize: 13, lineHeight: 20 }, confirmation: { gap: spacing.md, padding: spacing.md } });
