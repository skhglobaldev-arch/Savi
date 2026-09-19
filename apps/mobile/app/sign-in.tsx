import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { SaviMark } from '@/src/components/SaviMark';
import { Screen } from '@/src/components/Screen';
import { PrimaryButton, Surface } from '@/src/components/UI';
import { colors, spacing } from '@/src/theme/tokens';

export default function SignInScreen() {
  const { signIn, status, error } = useMobileAuth();
  if (status === 'signed_in') return <Redirect href="/(tabs)" />;
  const isLoading = status === 'loading';
  return <Screen scroll={false} style={styles.screen}><View style={styles.inner}><SaviMark /><View style={styles.copy}><Text style={styles.title}>Your ideas, ready when you are.</Text><Text style={styles.detail}>Sign in to continue with the same SAVI workspace you use on the web.</Text></View><Surface style={styles.authCard}><View style={styles.icon}><Ionicons name="sparkles" size={24} color={colors.violet} /></View><Text style={styles.cardTitle}>Continue with SAVI</Text><Text style={styles.cardCopy}>Google sign-in opens securely in your browser. SAVI never stores Google credentials on your device.</Text>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<PrimaryButton label={isLoading ? 'Checking session...' : 'Continue with Google'} icon="logo-google" onPress={() => void signIn()} disabled={isLoading} />{isLoading ? <ActivityIndicator color={colors.violet} style={styles.spinner} /> : null}</Surface><Text style={styles.footer}>By continuing, you return to SAVI through this app only.</Text></View></Screen>;
}

const styles = StyleSheet.create({ screen: { justifyContent: 'center' }, inner: { flex: 1, justifyContent: 'center' }, copy: { gap: spacing.sm, marginBottom: spacing.xxl, marginTop: spacing.xxl }, title: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.4, lineHeight: 40 }, detail: { color: colors.textMuted, fontSize: 16, lineHeight: 23 }, authCard: { alignItems: 'center', gap: spacing.md, padding: spacing.xl }, icon: { alignItems: 'center', backgroundColor: '#251D42', borderRadius: 18, height: 58, justifyContent: 'center', width: 58 }, cardTitle: { color: colors.text, fontSize: 19, fontWeight: '800' }, cardCopy: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' }, error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' }, spinner: { marginTop: -spacing.xs }, footer: { color: colors.textSubtle, fontSize: 11, lineHeight: 17, marginTop: spacing.lg, textAlign: 'center' }, });
