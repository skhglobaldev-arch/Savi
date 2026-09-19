import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { PageHeader, SectionLabel } from '@/src/components/UI';
import { ToolCard } from '@/src/components/ToolCard';
import { mobileToolCategories, mobileTools, type MobileToolCategory } from '@/src/data/tools';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function ToolsScreen() {
  const [category, setCategory] = useState<MobileToolCategory | 'All'>('All');
  const visibleTools = category === 'All' ? mobileTools : mobileTools.filter((tool) => tool.category === category);
  return <Screen><PageHeader title="All Tools" detail="Create images, video, voice, and files." /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><Filter label="All" active={category === 'All'} onPress={() => setCategory('All')} />{mobileToolCategories.map((item) => <Filter key={item} label={item} active={category === item} onPress={() => setCategory(item)} />)}</ScrollView><View style={styles.countRow}><SectionLabel>Explore tools</SectionLabel><Text style={styles.count}>{visibleTools.length} ready soon</Text></View><View style={styles.list}>{visibleTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</View><Text style={styles.note}>Tool execution connects in a later mobile stage. This native gallery is deliberately separate from the web runtime.</Text></Screen>;
}

function Filter({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filter, active && styles.filterActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ filters: { gap: spacing.xs, marginBottom: spacing.xl, paddingRight: spacing.lg }, filter: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 9 }, filterActive: { backgroundColor: '#2A2147', borderColor: colors.violet }, filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, filterTextActive: { color: colors.text }, countRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, count: { color: colors.textSubtle, fontSize: 12, marginBottom: spacing.sm }, list: { gap: spacing.xs }, note: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, marginTop: spacing.xl, paddingHorizontal: spacing.xs, textAlign: 'center' }, });
