import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SaviMark } from '@/src/components/SaviMark';
import { Screen } from '@/src/components/Screen';
import { PrimaryButton, SectionLabel, Surface } from '@/src/components/UI';
import { ToolCard } from '@/src/components/ToolCard';
import { mobileTools } from '@/src/data/tools';
import { colors, spacing } from '@/src/theme/tokens';

const quickActions = [
  { label: 'Make an image', icon: 'image-outline' as const, toolId: 'text_to_image' },
  { label: 'Start a video', icon: 'film-outline' as const, toolId: 'text_video' },
  { label: 'Work with PDFs', icon: 'document-text-outline' as const, toolId: 'merge' },
];

function openTool(toolId: string) {
  router.push({ pathname: '/tool/[toolId]', params: { toolId, from: 'home' } });
}

export default function HomeScreen() {
  return <Screen>
    <View style={styles.brandRow}><SaviMark /></View>
    <View style={styles.hero}>
      <View style={styles.eyebrow}><View style={styles.liveDot} /><Text style={styles.eyebrowText}>YOUR CREATIVE WORKSPACE</Text></View>
      <Text style={styles.heroTitle}>What idea are we turning into output?</Text>
      <Text style={styles.heroCopy}>Ask. Create. Organise.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Start a new SAVI chat" onPress={() => router.push('/(tabs)/ask')} style={({ pressed }) => pressed && styles.pressed}>
        <Surface style={styles.askCard}><View style={styles.askIcon}><Ionicons name="sparkles" color={colors.violet} size={21} /></View><View style={styles.askCopy}><Text style={styles.askLabel}>Ask SAVI</Text><Text style={styles.askHint}>Start with a question, task, or rough idea.</Text></View><Ionicons name="arrow-up" color={colors.textMuted} size={20} /></Surface>
      </Pressable>
    </View>
    <SectionLabel>Start creating</SectionLabel>
    <View style={styles.quickGrid}>{quickActions.map((action) => <Pressable accessibilityRole="button" accessibilityLabel={action.label} key={action.label} onPress={() => openTool(action.toolId)} style={({ pressed }) => [styles.quickPressable, pressed && styles.pressed]}><Surface style={styles.quick}><Ionicons name={action.icon} size={20} color={colors.blue} /><Text style={styles.quickText}>{action.label}</Text></Surface></Pressable>)}</View>
    <View style={styles.sectionHead}><SectionLabel>Continue with a tool</SectionLabel><Pressable accessibilityRole="button" accessibilityLabel="Open all SAVI tools" onPress={() => router.push('/(tabs)/tools')}><Text style={styles.allTools}>All tools</Text></Pressable></View>
    <View style={styles.toolList}>{mobileTools.slice(0, 3).map((tool) => <ToolCard key={tool.id} tool={tool} onPress={() => openTool(tool.id)} />)}</View>
    <PrimaryButton label="Open All Tools" icon="grid-outline" onPress={() => router.push('/(tabs)/tools')} />
  </Screen>;
}

const styles = StyleSheet.create({
  brandRow: { marginBottom: spacing.xxl },
  hero: { gap: spacing.md, marginBottom: spacing.xxl },
  eyebrow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  liveDot: { backgroundColor: colors.mint, borderRadius: 4, height: 7, width: 7 },
  eyebrowText: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.9 },
  heroTitle: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.4, lineHeight: 40 },
  heroCopy: { color: colors.textMuted, fontSize: 17, lineHeight: 24 },
  askCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  askIcon: { alignItems: 'center', backgroundColor: '#251D42', borderRadius: 12, height: 45, justifyContent: 'center', width: 45 },
  askCopy: { flex: 1, gap: 3 },
  askLabel: { color: colors.text, fontSize: 15, fontWeight: '800' },
  askHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  quickGrid: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xxl },
  quickPressable: { flex: 1 },
  quick: { flex: 1, gap: 9, minHeight: 96, padding: spacing.sm },
  quickText: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  allTools: { color: colors.violet, fontSize: 13, fontWeight: '800', marginBottom: spacing.sm },
  toolList: { gap: spacing.xs, marginBottom: spacing.lg },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
