import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { PrimaryButton, Surface } from '@/src/components/UI';
import { colors, spacing } from '@/src/theme/tokens';
import { getCreditBalance } from './toolApi';

export function CreditSummary() {
  const { accessToken } = useMobileAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (!accessToken) return;
    setError(false);
    void getCreditBalance(accessToken).then(account => { if (!cancelled) setBalance(account.availableCredits); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [accessToken, revision]));
  return <Surface style={styles.card}><Text style={styles.label}>Available SAVI credits</Text>{error ? <><Text style={styles.error}>Balance unavailable.</Text><PrimaryButton icon="refresh" label="Reload balance" onPress={() => setRevision(value => value + 1)} /></> : balance === null ? <ActivityIndicator color={colors.violet} /> : <Text style={styles.balance}>{balance.toLocaleString()}</Text>}</Surface>;
}
const styles = StyleSheet.create({ card: { padding: spacing.md, gap: spacing.sm, marginTop: spacing.md }, label: { color: colors.textMuted, fontSize: 13 }, balance: { color: colors.mint, fontSize: 26, fontWeight: '800' }, error: { color: colors.danger, fontSize: 13 } });
