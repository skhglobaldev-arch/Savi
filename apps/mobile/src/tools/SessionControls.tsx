import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/src/theme/tokens';
import type { PagePlan, SessionFile } from '../../../../lib/tools/session';

export function Options({ label, value, options, disabled, onChange }: { label: string; value: string; options: readonly (string | { id: string; label: string })[]; disabled: boolean; onChange: (value: string) => void }) {
  return <View style={styles.section}><Text style={styles.label}>{label}</Text><View style={styles.wrap}>{options.map(item => {
    const id = typeof item === 'string' ? item : item.id;
    return <Pressable accessibilityRole="button" accessibilityState={{ selected: id === value, disabled }} disabled={disabled} key={id} onPress={() => onChange(id)} style={[styles.option, value === id && styles.selected, disabled && styles.disabled]}><Text style={styles.optionText}>{typeof item === 'string' ? item : item.label}</Text></Pressable>;
  })}</View></View>;
}

function SmallAction({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}><Ionicons color={colors.text} name={icon} size={18} /></Pressable>;
}

export function SelectedFiles({ files, disabled, onChange }: { files: SessionFile[]; disabled: boolean; onChange: (files: SessionFile[]) => void }) {
  return <View style={styles.section}>{files.map((file, index) => <View key={file.uri} style={styles.row}>
    <View style={styles.copy}><Text numberOfLines={2} style={styles.name}>{index + 1}. {file.name}</Text><Text style={styles.detail}>{file.role ? `${file.role} · ` : ''}{(file.size / 1024 / 1024).toFixed(1)} MB{file.pageCount ? ` · ${file.pageCount} pages` : ''}</Text></View>
    <SmallAction icon="arrow-up" label={`Move ${file.name} earlier`} disabled={disabled || index === 0} onPress={() => { const next = [...files]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }} />
    <SmallAction icon="close" label={`Remove ${file.name}`} disabled={disabled} onPress={() => onChange(files.filter((_, i) => i !== index))} />
  </View>)}</View>;
}

export function PdfPages({ pages, disabled, onChange, organize }: { pages: PagePlan; disabled: boolean; onChange: (pages: PagePlan) => void; organize: boolean }) {
  const [start, end] = [0, Math.min(pages.length, 500)];
  return <View style={styles.section}>
    <Text style={styles.label}>Pages · {pages.filter(page => page.selected).length} selected</Text>
    <View style={styles.wrap}><SmallAction icon="checkbox-outline" label="Select all pages" disabled={disabled} onPress={() => onChange(pages.map(page => ({ ...page, selected: true })))} /><SmallAction icon="square-outline" label="Deselect all pages" disabled={disabled} onPress={() => onChange(pages.map(page => ({ ...page, selected: false })))} /></View>
    {pages.slice(start, end).map((page, index) => <View key={page.pageNumber} style={styles.row}>
      <SmallAction icon={page.selected ? 'checkbox-outline' : 'square-outline'} label={`${page.selected ? 'Deselect' : 'Select'} page ${page.pageNumber}`} disabled={disabled} onPress={() => onChange(pages.map((item, i) => i === index ? { ...item, selected: !item.selected } : item))} />
      <Text style={styles.page}>Page {page.pageNumber}{page.rotation ? ` · ${page.rotation} degrees` : ''}</Text>
      {organize ? <><SmallAction icon="refresh" label={`Rotate page ${page.pageNumber}`} disabled={disabled} onPress={() => onChange(pages.map((item, i) => i === index ? { ...item, rotation: (item.rotation + 90) % 360 } : item))} /><SmallAction icon="arrow-up" label={`Move page ${page.pageNumber} earlier`} disabled={disabled || index === 0} onPress={() => { const next = [...pages]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }} /></> : null}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({ section: { gap: spacing.xs }, label: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, option: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, minHeight: 42, paddingHorizontal: 12, justifyContent: 'center' }, selected: { borderColor: colors.violet, backgroundColor: '#2A2147' }, disabled: { opacity: 0.4 }, optionText: { color: colors.text, fontSize: 13 }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: spacing.xs }, copy: { flex: 1, minWidth: 0 }, name: { color: colors.text, fontSize: 14 }, detail: { color: colors.textMuted, fontSize: 12, marginTop: 4 }, action: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong, borderRadius: radius.sm }, page: { flex: 1, color: colors.text, fontSize: 14 } });
