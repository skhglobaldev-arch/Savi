import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { IconButton, PrimaryButton, SectionLabel, Surface } from '@/src/components/UI';
import { colors, radius, spacing } from '@/src/theme/tokens';

import { generateTextToImage, getCreditBalance, privateAssetUrl, quoteTextToImage } from './toolApi';
import type { TextToImageAspectRatio, TextToImageQuality, TextToImageResult, ToolQuote } from './types';

const qualities: TextToImageQuality[] = ['720', '1080', '4K'];
const aspectRatios: TextToImageAspectRatio[] = ['1:1', '16:9', '9:16', '4:5'];

function createClientRequestId() {
  return `mobile_text_to_image_${Crypto.randomUUID().replace(/-/g, '')}`;
}

export function TextToImageSession({ onBack }: { onBack: () => void }) {
  const { accessToken } = useMobileAuth();
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<TextToImageQuality>('1080');
  const [aspectRatio, setAspectRatio] = useState<TextToImageAspectRatio>('1:1');
  const [quote, setQuote] = useState<ToolQuote | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [quoteState, setQuoteState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<TextToImageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const resetForInput = useCallback(() => {
    requestIdRef.current = null;
    setConfirmed(false);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setQuoteState('loading');
    setError(null);
    void Promise.all([quoteTextToImage(accessToken, { quality, aspectRatio }), getCreditBalance(accessToken)])
      .then(([nextQuote, nextBalance]) => {
        if (cancelled) return;
        setQuote(nextQuote);
        setBalance(nextBalance.availableCredits);
        setQuoteState('ready');
      })
      .catch((cause) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteState('error');
        setError(cause instanceof Error ? cause.message : 'SAVI could not load this tool.');
      });
    return () => { cancelled = true; };
  }, [accessToken, aspectRatio, quality]);

  const canContinue = Boolean(prompt.trim()) && quoteState === 'ready' && quote;
  const insufficientCredits = quote !== null && balance !== null && balance < quote.credits;
  const resultSource = useMemo(() => {
    if (!result || !accessToken) return undefined;
    return { uri: privateAssetUrl(result.image), headers: { Authorization: `Bearer ${accessToken}` } };
  }, [accessToken, result]);

  const generate = useCallback(async () => {
    if (!accessToken || !quote || !prompt.trim() || executing || insufficientCredits) return;
    setExecuting(true);
    setError(null);
    const clientRequestId = requestIdRef.current || createClientRequestId();
    requestIdRef.current = clientRequestId;
    try {
      const nextResult = await generateTextToImage(accessToken, {
        prompt: prompt.trim(),
        quality,
        aspectRatio,
        clientRequestId,
      });
      setResult(nextResult);
      setBalance(nextResult.availableCredits);
      requestIdRef.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SAVI could not generate this image.');
    } finally {
      setExecuting(false);
    }
  }, [accessToken, aspectRatio, executing, insufficientCredits, prompt, quality, quote]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.md) }]}>
        <IconButton icon="chevron-back" label="Back to tools" onPress={onBack} muted />
        <View style={styles.headerCopy}><Text style={styles.headerTitle}>Text to Image</Text><Text style={styles.headerDetail}>Create one original image</Text></View>
      </View>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.keyboard}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Surface style={styles.intro}><View style={styles.introIcon}><Ionicons color={colors.violet} name="image-outline" size={24} /></View><View style={styles.introCopy}><Text style={styles.introTitle}>Describe what you want to see</Text><Text style={styles.introDetail}>SAVI confirms the current credit quote before anything is generated.</Text></View></Surface>

        <SectionLabel>Prompt</SectionLabel>
        <TextInput
          accessibilityLabel="Image prompt"
          editable={!executing}
          multiline
          maxLength={4000}
          onChangeText={(value) => { setPrompt(value); resetForInput(); }}
          placeholder="A sunlit studio portrait of a ceramic vase..."
          placeholderTextColor={colors.textSubtle}
          style={styles.prompt}
          textAlignVertical="top"
          value={prompt}
        />
        <Text style={styles.helper}>Use a clear subject, setting, and visual direction.</Text>

        <SectionLabel>Format</SectionLabel>
        <OptionRow disabled={executing} label="Quality" options={qualities} selected={quality} onSelect={(value) => { setQuality(value as TextToImageQuality); resetForInput(); }} />
        <OptionRow disabled={executing} label="Aspect ratio" options={aspectRatios} selected={aspectRatio} onSelect={(value) => { setAspectRatio(value as TextToImageAspectRatio); resetForInput(); }} />

        <Surface style={styles.quoteCard}>
          <View><Text style={styles.quoteLabel}>Current SAVI quote</Text><Text style={styles.quoteDetail}>{quoteState === 'loading' ? 'Checking current price...' : quoteState === 'error' ? 'Quote unavailable' : 'One image generation'}</Text></View>
          {quoteState === 'loading' ? <ActivityIndicator color={colors.violet} /> : <Text style={styles.quoteCredits}>{quote ? `${quote.credits} credits` : '—'}</Text>}
        </Surface>
        {balance !== null ? <Text style={[styles.balance, insufficientCredits && styles.balanceWarning]}>Available now: {balance.toLocaleString()} credits{insufficientCredits ? ' · insufficient for this request' : ''}</Text> : null}
        {error ? <Surface style={styles.error}><Text style={styles.errorText}>{error}</Text></Surface> : null}

        {!confirmed ? (
          <PrimaryButton disabled={!canContinue || insufficientCredits} icon="arrow-forward" label="Review generation" onPress={() => { setConfirmed(true); setError(null); }} />
        ) : (
          <Surface style={styles.confirmation}>
            <Text style={styles.confirmationTitle}>Ready to generate?</Text>
            <Text style={styles.confirmationDetail}>This will reserve and settle {quote?.credits ?? 0} SAVI credits only if SAVI produces your image.</Text>
            <PrimaryButton disabled={executing || insufficientCredits} icon={executing ? undefined : 'sparkles'} label={executing ? 'Generating image...' : `Generate · ${quote?.credits ?? 0} credits`} onPress={() => void generate()} />
            <Pressable accessibilityRole="button" disabled={executing} onPress={() => setConfirmed(false)} style={styles.editAction}><Text style={styles.editActionText}>Edit request</Text></Pressable>
          </Surface>
        )}

        {result ? <View style={styles.resultSection}><SectionLabel>Result</SectionLabel><Surface style={styles.resultCard}>{resultSource ? <Image accessibilityLabel="Generated SAVI image" resizeMode="cover" source={resultSource} style={[styles.resultImage, aspectRatio === '9:16' && styles.portraitResult]} /> : null}<View style={styles.resultCopy}><Text style={styles.resultTitle}>Your image is ready</Text><Text style={styles.resultDetail}>{result.filename} · Private to your SAVI account</Text></View></Surface></View> : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function OptionRow({ disabled, label, options, selected, onSelect }: { disabled: boolean; label: string; options: readonly string[]; selected: string; onSelect: (value: string) => void }) {
  return <View style={styles.optionsSection}><Text style={styles.optionTitle}>{label}</Text><View style={styles.options}>{options.map((option) => <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected: option === selected }} disabled={disabled} key={option} onPress={() => onSelect(option)} style={[styles.option, option === selected && styles.optionSelected, disabled && styles.optionDisabled]}><Text style={[styles.optionText, option === selected && styles.optionTextSelected]}>{option}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  keyboard: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerCopy: { flex: 1, gap: 2 }, headerTitle: { color: colors.text, fontSize: 20, fontWeight: '800' }, headerDetail: { color: colors.textMuted, fontSize: 12 },
  scroll: { gap: spacing.md, paddingHorizontal: spacing.lg }, intro: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.md }, introIcon: { alignItems: 'center', backgroundColor: '#251D42', borderRadius: radius.md, height: 48, justifyContent: 'center', width: 48 }, introCopy: { flex: 1, gap: 3 }, introTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, introDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  prompt: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, color: colors.text, fontSize: 16, lineHeight: 22, minHeight: 144, padding: spacing.md }, helper: { color: colors.textSubtle, fontSize: 12, marginTop: -spacing.xs },
  optionsSection: { gap: spacing.xs }, optionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, option: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, minHeight: 38, paddingHorizontal: 14, justifyContent: 'center' }, optionSelected: { backgroundColor: '#2A2147', borderColor: colors.violet }, optionDisabled: { opacity: 0.55 }, optionText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, optionTextSelected: { color: colors.text },
  quoteCard: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }, quoteLabel: { color: colors.text, fontSize: 15, fontWeight: '800' }, quoteDetail: { color: colors.textMuted, fontSize: 12, marginTop: 3 }, quoteCredits: { color: colors.mint, fontSize: 16, fontWeight: '800' }, balance: { color: colors.textMuted, fontSize: 12, marginTop: -spacing.xs }, balanceWarning: { color: colors.danger },
  error: { backgroundColor: '#2A1822', borderColor: '#643044', borderWidth: StyleSheet.hairlineWidth, padding: spacing.md }, errorText: { color: '#FFC3D1', fontSize: 13, lineHeight: 19 }, confirmation: { gap: spacing.sm, padding: spacing.md }, confirmationTitle: { color: colors.text, fontSize: 16, fontWeight: '800' }, confirmationDetail: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, editAction: { alignItems: 'center', minHeight: 36, justifyContent: 'center' }, editActionText: { color: colors.violet, fontSize: 13, fontWeight: '800' },
  resultSection: { gap: spacing.xs, marginTop: spacing.md }, resultCard: { overflow: 'hidden' }, resultImage: { aspectRatio: 1, backgroundColor: colors.canvasRaised, width: '100%' }, portraitResult: { aspectRatio: 9 / 16 }, resultCopy: { gap: 3, padding: spacing.md }, resultTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, resultDetail: { color: colors.textMuted, fontSize: 12 },
});
