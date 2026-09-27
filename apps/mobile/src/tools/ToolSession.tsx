import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { PrimaryButton, Surface } from '@/src/components/UI';
import type { MobileTool } from '@/src/data/tools';
import { colors, spacing } from '@/src/theme/tokens';

import { TextToImageSession } from './TextToImageSession';

export function ToolSession({ tool, onBack }: { tool: MobileTool | undefined; onBack: () => void }) {
  if (tool?.id === 'text-to-image') return <TextToImageSession onBack={onBack} />;

  return <Screen>
    <View style={styles.empty}><Surface style={styles.card}><Text style={styles.title}>{tool?.title || 'Tool not found'}</Text><Text style={styles.detail}>{tool ? 'This tool is planned for a later native stage. Its existing SAVI workflow remains available on the web.' : 'Return to All Tools to choose an available SAVI workflow.'}</Text><PrimaryButton icon="arrow-back" label="Back to All Tools" onPress={onBack} /></Surface></View>
  </Screen>;
}

const styles = StyleSheet.create({ empty: { flex: 1, justifyContent: 'center' }, card: { gap: spacing.md, padding: spacing.lg }, title: { color: colors.text, fontSize: 22, fontWeight: '800' }, detail: { color: colors.textMuted, fontSize: 14, lineHeight: 21 } });
