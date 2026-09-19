import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/theme/tokens';

const mark = require('../../assets/brand/savi-icon.png');

export function SaviMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Image source={mark} style={[styles.image, compact && styles.imageCompact]} accessibilityLabel="SAVI" />
      {!compact ? <Text style={styles.wordmark}>SAVI</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  image: { width: 26, height: 26, borderRadius: 8 },
  imageCompact: { width: 22, height: 22, borderRadius: 7 },
  wordmark: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: 1.2 },
});
