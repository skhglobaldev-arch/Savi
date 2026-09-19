import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { SaviMark } from '@/src/components/SaviMark';
import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { Screen } from '@/src/components/Screen';
import { PageHeader, PrimaryButton, SectionLabel, Surface } from '@/src/components/UI';
import { colors, radius, spacing } from '@/src/theme/tokens';

const settingsRows = [
  { icon: 'person-outline' as const, title: 'Profile', detail: 'Connect your SAVI account later' },
  { icon: 'notifications-outline' as const, title: 'Notifications', detail: 'Available in a future mobile stage' },
  { icon: 'shield-checkmark-outline' as const, title: 'Privacy', detail: 'Control your mobile workspace' },
];

export default function AccountScreen() {
  const { signOut, user } = useMobileAuth();
  return <Screen><PageHeader title="Account" detail="Your SAVI mobile workspace." /><Surface style={styles.accountCard}><View style={styles.brandCircle}>{user?.picture ? <Text style={styles.initial}>{user.name.slice(0, 1).toUpperCase()}</Text> : <SaviMark compact />}</View><View style={styles.accountCopy}><Text style={styles.accountTitle}>{user?.name || 'SAVI member'}</Text><Text numberOfLines={1} style={styles.accountDetail}>{user?.email || 'Signed in to SAVI'}</Text></View></Surface><View style={styles.actions}><PrimaryButton label="Sign out" icon="log-out-outline" onPress={() => void signOut()} /></View><SectionLabel>Settings</SectionLabel><View style={styles.list}>{settingsRows.map((row) => <Surface key={row.title} style={styles.row}><View style={styles.rowIcon}><Ionicons name={row.icon} color={colors.textMuted} size={20} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.rowDetail}>{row.detail}</Text></View><Ionicons name="chevron-forward" color={colors.textSubtle} size={17} /></Surface>)}</View><Text style={styles.footer}>SAVI iOS V1 · Foundation</Text></Screen>;
}

const styles = StyleSheet.create({ accountCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, padding: spacing.md }, brandCircle: { alignItems: 'center', backgroundColor: '#251D42', borderRadius: 18, height: 58, justifyContent: 'center', width: 58 }, initial: { color: colors.text, fontSize: 22, fontWeight: '800' }, accountCopy: { flex: 1, gap: 5 }, accountTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, accountDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, actions: { marginBottom: spacing.xxl, marginTop: spacing.md }, list: { gap: spacing.xs }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 70, padding: spacing.sm }, rowIcon: { alignItems: 'center', backgroundColor: colors.canvasRaised, borderColor: colors.border, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 }, rowCopy: { flex: 1, gap: 3 }, rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, rowDetail: { color: colors.textMuted, fontSize: 12 }, footer: { color: colors.textSubtle, fontSize: 11, marginTop: spacing.xxl, textAlign: 'center' }, });
