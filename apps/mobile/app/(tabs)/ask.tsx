import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { IconButton, Surface } from '@/src/components/UI';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function AskSaviScreen() {
  const [draft, setDraft] = useState('');
  return <Screen scroll={false} style={styles.screen}>
    <View style={styles.header}><View><Text style={styles.title}>New chat</Text><Text style={styles.subtitle}>Ask SAVI anything</Text></View><IconButton icon="ellipsis-horizontal" label="Chat options" muted /></View>
    <View style={styles.empty}><View style={styles.emptyMark}><Ionicons name="sparkles" color={colors.violet} size={28} /></View><Text style={styles.emptyTitle}>Where should we start?</Text><Text style={styles.emptyCopy}>Tell SAVI what you want to make, understand, or organise.</Text><View style={styles.promptGroup}><Text style={styles.promptLabel}>TRY A STARTER</Text><View style={styles.prompts}><Text style={styles.prompt}>Plan a launch video</Text><Text style={styles.prompt}>Turn this into an image brief</Text><Text style={styles.prompt}>Help me organise PDFs</Text></View></View></View>
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} keyboardVerticalOffset={85}>
      <Surface style={styles.composer}><TextInput accessibilityLabel="Ask SAVI message" multiline onChangeText={setDraft} placeholder="Message SAVI..." placeholderTextColor={colors.textSubtle} style={styles.input} value={draft} /><View style={styles.controls}><IconButton icon="attach" label="Attach a file (coming soon)" muted /><Text style={styles.stageNote}>Stage 1</Text><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim()} style={[styles.send, !draft.trim() && styles.sendDisabled]}><Ionicons name="arrow-up" color={colors.text} size={19} /></Pressable></View></Surface>
    </KeyboardAvoidingView>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.sm }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm }, title: { color: colors.text, fontSize: 23, fontWeight: '800' }, subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 }, empty: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: spacing.xxl }, emptyMark: { alignItems: 'center', backgroundColor: '#251D42', borderColor: '#443073', borderRadius: 24, borderWidth: 1, height: 72, justifyContent: 'center', marginBottom: spacing.lg, width: 72 }, emptyTitle: { color: colors.text, fontSize: 25, fontWeight: '800', marginBottom: spacing.xs }, emptyCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 280, textAlign: 'center' }, promptGroup: { alignSelf: 'stretch', marginTop: spacing.xxl }, promptLabel: { color: colors.textSubtle, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: spacing.sm }, prompts: { gap: spacing.xs }, prompt: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, color: colors.textMuted, fontSize: 13, paddingHorizontal: spacing.sm, paddingVertical: 12 }, composer: { padding: spacing.sm }, input: { color: colors.text, fontSize: 16, lineHeight: 22, maxHeight: 110, minHeight: 44, paddingHorizontal: spacing.xs, paddingTop: spacing.xs }, controls: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, justifyContent: 'space-between' }, stageNote: { color: colors.textSubtle, flex: 1, fontSize: 11, fontWeight: '700' }, send: { alignItems: 'center', backgroundColor: colors.violetStrong, borderRadius: 12, height: 42, justifyContent: 'center', width: 42 }, sendDisabled: { backgroundColor: colors.surfaceStrong },
});
