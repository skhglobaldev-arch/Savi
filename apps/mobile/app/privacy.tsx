import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { IconButton, PrimaryButton, Surface } from '@/src/components/UI';
import { colors, radius, spacing } from '@/src/theme/tokens';

const webOrigin = 'https://savi.skh.global';

export default function PrivacyScreen() {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const openWeb = async (path: string) => {
    setError(null);
    setOpening(path);
    try {
      await WebBrowser.openBrowserAsync(`${webOrigin}${path}`);
    } catch {
      setError('SAVI could not open this secure web page. Please try again.');
    } finally {
      setOpening(null);
    }
  };

  return <Screen>
    <View style={styles.header}><IconButton icon="chevron-back" label="Back to Account" onPress={() => router.back()} muted /><View style={styles.headerCopy}><Text style={styles.title}>Privacy & data</Text><Text style={styles.detail}>Private account information and secure controls.</Text></View></View>
    <Surface style={styles.card}><Text style={styles.cardTitle}>Your SAVI account</Text><Text style={styles.copy}>SAVI keeps generated assets private to your authenticated account. Your account identity and its security are managed through Google sign-in.</Text></Surface>
    <Surface style={styles.card}><Text style={styles.cardTitle}>Privacy policy</Text><Text style={styles.copy}>Read how SAVI handles account information, generated assets, and provider processing.</Text><PrimaryButton disabled={opening !== null} icon="open-outline" label={opening === '/privacy' ? 'Opening...' : 'Read privacy policy'} onPress={() => void openWeb('/privacy')} /></Surface>
    <Surface style={styles.card}><Text style={styles.cardTitle}>Account and data controls</Text><Text style={styles.copy}>Billing, account controls, and deletion requests stay in SAVI’s secure web settings. That flow preserves the existing confirmation and account-protection rules.</Text><Pressable accessibilityRole="button" disabled={opening !== null} onPress={() => void openWeb('/settings')} style={({ pressed }) => [styles.webAction, pressed && styles.pressed, opening !== null && styles.disabled]}><Text style={styles.webActionText}>{opening === '/settings' ? 'Opening...' : 'Open account settings on web'}</Text></Pressable><Text style={styles.notice}>To request account deletion, use the secure deletion control in web settings.</Text></Surface>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  headerCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800' },
  detail: { color: colors.textMuted, fontSize: 13 },
  card: { gap: spacing.md, marginBottom: spacing.md, padding: spacing.md },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  copy: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  webAction: { alignItems: 'center', borderColor: colors.violet, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.md },
  webActionText: { color: colors.violet, fontSize: 15, fontWeight: '800' },
  notice: { color: colors.textSubtle, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
