import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/theme/tokens';

export function PageHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}</View>{action}</View>;
}

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) { return <View style={[styles.surface, style]}>{children}</View>; }
export function SectionLabel({ children }: { children: ReactNode }) { return <Text style={styles.sectionLabel}>{children}</Text>; }

export function IconButton({ icon, label, onPress, muted = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; muted?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, muted && styles.iconButtonMuted, pressed && styles.pressed]}><Ionicons name={icon} size={20} color={muted ? colors.textMuted : colors.text} /></Pressable>;
}

export function PrimaryButton({ label, icon, onPress, disabled = false }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primary, disabled && styles.primaryDisabled, pressed && !disabled && styles.pressed]}>{icon ? <Ionicons name={icon} size={18} color={colors.text} /> : null}<Text style={styles.primaryText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl, minHeight: 44 }, headerCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' }, detail: { color: colors.textMuted, fontSize: 13 },
  surface: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.7, marginBottom: spacing.sm, textTransform: 'uppercase' },
  iconButton: { alignItems: 'center', backgroundColor: colors.surfaceStrong, borderColor: colors.border, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 }, iconButtonMuted: { backgroundColor: colors.surface },
  primary: { alignItems: 'center', backgroundColor: colors.violetStrong, borderRadius: radius.md, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.lg }, primaryDisabled: { backgroundColor: colors.surfaceStrong }, primaryText: { color: colors.text, fontSize: 15, fontWeight: '800' }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
