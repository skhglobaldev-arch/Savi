import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { Screen } from '@/src/components/Screen';
import { IconButton, PageHeader, PrimaryButton, Surface } from '@/src/components/UI';
import { colors, spacing } from '@/src/theme/tokens';
import { Options } from '@/src/tools/SessionControls';
import { ToolResult } from '@/src/tools/ToolResult';
import { handleExpiredToolSession, loadNativeLibrary, type LibraryItem } from '@/src/tools/sessionApi';
import type { ToolResultKind } from '../../../../lib/tools/session';

const filters = [{ id: 'all', label: 'All' }, { id: 'image', label: 'Images' }, { id: 'video', label: 'Video' }, { id: 'audio', label: 'Voice' }, { id: 'document', label: 'PDFs' }, { id: 'archive', label: 'ZIPs' }, { id: 'text', label: 'Text' }];
const icons: Record<ToolResultKind, keyof typeof Ionicons.glyphMap> = { image: 'image-outline', video: 'film-outline', audio: 'volume-high-outline', document: 'document-outline', archive: 'archive-outline', text: 'document-text-outline' };

export function NativeLibrary() {
  const { accessToken, restore } = useMobileAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async (nextOffset = 0) => {
    if (!accessToken) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(null);
    try {
      const page = await loadNativeLibrary(accessToken, nextOffset, abort.signal);
      if (abort.signal.aborted) return;
      setItems(previous => [...new Map([...(nextOffset ? previous : []), ...page.assets].map(item => [item.id, item])).values()]);
      setOffset(page.nextOffset);
    } catch (cause) {
      if (!abort.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Library unavailable.'); void handleExpiredToolSession(cause, accessToken, restore).catch(() => undefined); }
    } finally { if (!abort.signal.aborted) setLoading(false); }
  }, [accessToken, restore]);

  useFocusEffect(useCallback(() => { void load(); return () => { controller.current?.abort(); setSelected(null); }; }, [load]));

  const visible = items.filter(item => filter === 'all' || item.mediaType === filter);
  return <Screen>
    <PageHeader title="Library" detail="Private outputs from your SAVI account." action={<IconButton icon="refresh" label="Refresh Library" onPress={() => void load()} />} />
    <Options label="Media" options={filters} value={filter} onChange={setFilter} disabled={false} />
    {loading ? <ActivityIndicator color={colors.violet} style={styles.loading} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.list}>{visible.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.filename}`} onPress={() => setSelected(item)}><Surface style={styles.item}><Ionicons name={icons[item.mediaType] || 'document-outline'} size={25} color={colors.violet} /><View style={styles.copy}><Text numberOfLines={2} style={styles.filename}>{item.filename}</Text><Text style={styles.detail}>{item.toolId.replace(/_/g, ' ')} · {new Date(item.createdAt).toLocaleDateString()}</Text></View><Ionicons name="chevron-forward" color={colors.textMuted} size={18} /></Surface></Pressable>)}</View>
    {!loading && !error && !visible.length ? <Surface style={styles.empty}><Ionicons name="folder-open-outline" size={30} color={colors.violet} /><Text style={styles.filename}>No saved outputs{filter === 'all' ? ' yet' : ' in this category'}</Text></Surface> : null}
    {offset !== null ? <PrimaryButton disabled={loading} icon="add" label="Load more" onPress={() => void load(offset)} /> : null}
    <Modal visible={selected !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
      <SafeAreaView style={styles.modal}><View style={styles.modalHeader}><Text style={styles.filename}>Private output</Text><IconButton icon="close" label="Close preview" onPress={() => setSelected(null)} /></View><ScrollView contentContainerStyle={styles.preview}>{selected && accessToken ? <ToolResult token={accessToken} result={{ assetId: selected.id, filename: selected.filename, kind: selected.mediaType, mimeType: selected.mimeType }} /> : null}</ScrollView></SafeAreaView>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({ loading: { marginVertical: spacing.lg }, list: { gap: spacing.sm, marginVertical: spacing.lg }, item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md }, copy: { flex: 1, gap: 4, minWidth: 0 }, filename: { color: colors.text, fontSize: 15, fontWeight: '700' }, detail: { color: colors.textMuted, fontSize: 12 }, error: { color: colors.danger, marginVertical: spacing.md }, empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, marginVertical: spacing.lg }, modal: { flex: 1, backgroundColor: colors.canvas }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md }, preview: { padding: spacing.md, paddingBottom: spacing.xxl } });
