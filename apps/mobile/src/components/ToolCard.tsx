import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MobileTool } from '@/src/data/tools';
import { colors, radius, spacing } from '@/src/theme/tokens';

const accentColor = { violet: colors.violet, blue: colors.blue, mint: colors.mint } as const;

export function ToolCard({ tool, onPress }: { tool: MobileTool; onPress?: () => void }) {
  const accent = accentColor[tool.accent];
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${tool.title}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}><View style={[styles.icon, { borderColor: accent }]}><Ionicons name={tool.icon} size={22} color={accent} /></View><View style={styles.copy}><Text numberOfLines={1} style={styles.title}>{tool.title}</Text><Text numberOfLines={2} style={styles.description}>{tool.description}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.textSubtle} /></Pressable>;
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 86, padding: spacing.sm }, icon: { alignItems: 'center', backgroundColor: colors.canvasRaised, borderRadius: 12, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 }, copy: { flex: 1, gap: 4 }, title: { color: colors.text, fontSize: 15, fontWeight: '800' }, description: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
