import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SaviMark } from '@/src/components/SaviMark';
import { Screen } from '@/src/components/Screen';
import { PageHeader, PrimaryButton, SectionLabel, Surface } from '@/src/components/UI';
import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { CreditSummary } from '@/src/tools/CreditSummary';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function AccountScreen() {
  const { signOut, user } = useMobileAuth();
  return <Screen>
    <PageHeader title="Account" detail="Your SAVI mobile workspace." />
    <Surface style={styles.accountCard}><View style={styles.brandCircle}>{user?.picture ? <Text style={styles.initial}>{user.name.slice(0, 1).toUpperCase()}</Text> : <SaviMark compact />}</View><View style={styles.accountCopy}><Text style={styles.accountTitle}>{user?.name || 'SAVI member'}</Text><Text numberOfLines={1} style={styles.accountDetail}>{user?.email || 'Signed in to SAVI'}</Text><Text style={styles.readOnly}>Account identity is managed securely through Google sign-in.</Text></View></Surface>
    <CreditSummary />
    <View style={styles.actions}><PrimaryButton label="Sign out" icon="log-out-outline" onPress={() => void signOut()} /></View>
    <SectionLabel>Privacy & data</SectionLabel>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Privacy and Data controls" onPress={() => router.push('/privacy')} style={({ pressed }) => pressed && styles.pressed}>
      <Surface style={styles.row}><View style={styles.rowIcon}><Ionicons name="shield-checkmark-outline" color={colors.textMuted} size={20} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>Privacy & data</Text><Text style={styles.rowDetail}>View privacy information and secure account controls.</Text></View><Ionicons name="chevron-forward" color={colors.textSubtle} size={17} /></Surface>
    </Pressable>
    <Text style={styles.footer}>SAVI iOS</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  accountCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  brandCircle: { alignItems: 'center', backgroundColor: '#251D42', borderRadius: 18, height: 58, justifyContent: 'center', width: 58 },
  initial: { color: colors.text, fontSize: 22, fontWeight: '800' },
  accountCopy: { flex: 1, gap: 5 },
  accountTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  accountDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  readOnly: { color: colors.textSubtle, fontSize: 11, lineHeight: 16 },
  actions: { marginBottom: spacing.xxl, marginTop: spacing.md },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 76, padding: spacing.sm },
  rowIcon: { alignItems: 'center', backgroundColor: colors.canvasRaised, borderColor: colors.border, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  rowDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  footer: { color: colors.textSubtle, fontSize: 11, marginTop: spacing.xxl, textAlign: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
