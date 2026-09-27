import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { PageHeader, SectionLabel } from '@/src/components/UI';
import { ToolCard } from '@/src/components/ToolCard';
import { mobileToolCategories, mobileTools, type MobileToolCategory } from '@/src/data/tools';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function ToolsScreen() {
  const [category, setCategory] = useState<MobileToolCategory | 'All'>('All');
  const [query, setQuery] = useState('');
  const visibleTools = useMemo(() => mobileTools.filter((tool) => {
    const matchesCategory = category === 'All' || tool.category === category;
    const search = query.trim().toLowerCase();
    return matchesCategory && (!search || `${tool.title} ${tool.description} ${tool.category}`.toLowerCase().includes(search));
  }), [category, query]);
  const availableCount = visibleTools.filter((tool) => tool.availability === 'available').length;
  return <Screen><PageHeader title="All Tools" detail="Create images, video, voice, and files." /><View style={styles.search}><Ionicons color={colors.textSubtle} name="search" size={18} /><TextInput accessibilityLabel="Search SAVI tools" autoCapitalize="none" autoCorrect={false} onChangeText={setQuery} placeholder="Search tools" placeholderTextColor={colors.textSubtle} style={styles.searchInput} value={query} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><Filter label="All" active={category === 'All'} onPress={() => setCategory('All')} />{mobileToolCategories.map((item) => <Filter key={item} label={item} active={category === item} onPress={() => setCategory(item)} />)}</ScrollView><View style={styles.countRow}><SectionLabel>Explore tools</SectionLabel><Text style={styles.count}>{availableCount ? `${availableCount} available now` : `${visibleTools.length} tools`}</Text></View><View style={styles.list}>{visibleTools.map((tool) => <ToolCard key={tool.id} tool={tool} onPress={() => router.push({ pathname: '/tool/[toolId]', params: { toolId: tool.id } })} />)}</View>{visibleTools.length === 0 ? <Text style={styles.empty}>No SAVI tools match that search.</Text> : null}<Text style={styles.note}>Text to Image is available natively now. Additional SAVI tools will join this workspace in later stages.</Text></Screen>;
}

function Filter({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filter, active && styles.filterActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ search: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, minHeight: 48, paddingHorizontal: spacing.sm }, searchInput: { color: colors.text, flex: 1, fontSize: 15, paddingVertical: 10 }, filters: { gap: spacing.xs, marginBottom: spacing.xl, paddingRight: spacing.lg }, filter: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 9 }, filterActive: { backgroundColor: '#2A2147', borderColor: colors.violet }, filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, filterTextActive: { color: colors.text }, countRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, count: { color: colors.textSubtle, fontSize: 12, marginBottom: spacing.sm }, list: { gap: spacing.xs }, empty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.lg, textAlign: 'center' }, note: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, marginTop: spacing.xl, paddingHorizontal: spacing.xs, textAlign: 'center' }, });
