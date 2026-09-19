import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { SaviMark } from '@/src/components/SaviMark';
import { Screen } from '@/src/components/Screen';
import { IconButton, PrimaryButton, SectionLabel, Surface } from '@/src/components/UI';
import { ToolCard } from '@/src/components/ToolCard';
import { mobileTools } from '@/src/data/tools';
import { colors, spacing } from '@/src/theme/tokens';

const quickActions = [
  { label: 'Make an image', icon: 'image-outline' as const },
  { label: 'Start a video', icon: 'film-outline' as const },
  { label: 'Work with PDFs', icon: 'document-text-outline' as const },
];

export default function HomeScreen() {
  return <Screen>
    <View style={styles.topRow}><SaviMark /><IconButton icon="ellipsis-horizontal" label="More SAVI options" muted /></View>
    <View style={styles.hero}>
      <View style={styles.eyebrow}><View style={styles.liveDot} /><Text style={styles.eyebrowText}>YOUR CREATIVE WORKSPACE</Text></View>
      <Text style={styles.heroTitle}>What idea are we turning into output?</Text>
      <Text style={styles.heroCopy}>Ask. Create. Organise.</Text>
      <Surface style={styles.askCard}><View style={styles.askIcon}><Ionicons name="sparkles" color={colors.violet} size={21} /></View><View style={styles.askCopy}><Text style={styles.askLabel}>Ask SAVI</Text><Text style={styles.askHint}>Start with a question, task, or rough idea.</Text></View><IconButton icon="arrow-up" label="Start a new SAVI chat" onPress={() => router.push('/(tabs)/ask')} /></Surface>
    </View>
    <SectionLabel>Start creating</SectionLabel>
    <View style={styles.quickGrid}>{quickActions.map((action) => <Surface key={action.label} style={styles.quick}><Ionicons name={action.icon} size={20} color={colors.blue} /><Text style={styles.quickText}>{action.label}</Text></Surface>)}</View>
    <View style={styles.sectionHead}><SectionLabel>Continue with a tool</SectionLabel><Text onPress={() => router.push('/(tabs)/tools')} style={styles.allTools}>All tools</Text></View>
    <View style={styles.toolList}>{mobileTools.slice(0, 3).map((tool) => <ToolCard key={tool.id} tool={tool} onPress={() => router.push('/(tabs)/tools')} />)}</View>
    <PrimaryButton label="Open All Tools" icon="grid-outline" onPress={() => router.push('/(tabs)/tools')} />
  </Screen>;
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xxl }, hero: { gap: spacing.md, marginBottom: spacing.xxl }, eyebrow: { alignItems: 'center', flexDirection: 'row', gap: 7 }, liveDot: { backgroundColor: colors.mint, borderRadius: 4, height: 7, width: 7 }, eyebrowText: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.9 }, heroTitle: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.4, lineHeight: 40 }, heroCopy: { color: colors.textMuted, fontSize: 17, lineHeight: 24 }, askCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.sm }, askIcon: { alignItems: 'center', backgroundColor: '#251D42', borderRadius: 12, height: 45, justifyContent: 'center', width: 45 }, askCopy: { flex: 1, gap: 3 }, askLabel: { color: colors.text, fontSize: 15, fontWeight: '800' }, askHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, quickGrid: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xxl }, quick: { flex: 1, gap: 9, minHeight: 96, padding: spacing.sm }, quickText: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 17 }, sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, allTools: { color: colors.violet, fontSize: 13, fontWeight: '800', marginBottom: spacing.sm }, toolList: { gap: spacing.xs, marginBottom: spacing.lg },
});
