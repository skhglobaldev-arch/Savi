import type { ReactNode } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/src/theme/tokens';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const content = <View style={[styles.content, style]}>{children}</View>;
  return <SafeAreaView style={styles.safe}>{scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingBottom: spacing.xxl },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
