import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { PrimaryButton, Surface } from '@/src/components/UI';
import type { MobileTool } from '@/src/data/tools';
import { colors, spacing } from '@/src/theme/tokens';

import { TextToImageSession } from './TextToImageSession';
import { NativeToolSession } from './NativeToolSession';
import { toolContract } from '../../../../lib/tools/session';

export function ToolSession({ tool, onBack }: { tool: MobileTool | undefined; onBack: () => void }) {
  if (tool?.id === 'text_to_image') return <TextToImageSession onBack={onBack} />;
  const contract = tool ? toolContract(tool.id) : null;
  if (contract) return <NativeToolSession key={contract.tool.id} contract={contract} onBack={onBack} />;

  return <Screen>
    <View style={styles.empty}><Surface style={styles.card}><Text style={styles.title}>{tool?.title || 'Tool not found'}</Text><Text style={styles.detail}>{tool ? 'This tool is unavailable on this device right now.' : 'Return to All Tools to choose a SAVI workflow.'}</Text><PrimaryButton icon="arrow-back" label="Back to All Tools" onPress={onBack} /></Surface></View>
  </Screen>;
}

const styles = StyleSheet.create({ empty: { flex: 1, justifyContent: 'center' }, card: { gap: spacing.md, padding: spacing.lg }, title: { color: colors.text, fontSize: 22, fontWeight: '800' }, detail: { color: colors.textMuted, fontSize: 14, lineHeight: 21 } });
