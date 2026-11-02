import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { PrimaryButton } from '@/src/components/UI';
import { colors, spacing } from '@/src/theme/tokens';
import { encodeNativeSketch, type SketchStroke } from '../../../../lib/tools/sketch';
import { sketchColors, sketchBrushSizes } from '../../../../lib/tools/catalog';
import { Options } from './SessionControls';

const inks = sketchColors;

export function SketchInput({ disabled, onUse, onDrawing }: { disabled: boolean; onUse: (file: File) => void; onDrawing: (drawing: boolean) => void }) {
  const [width, setWidth] = useState(320);
  const [ink, setInk] = useState(inks[1]);
  const [brush, setBrush] = useState('10');
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const current = useRef<SketchStroke | null>(null);
  const point = (event: GestureResponderEvent) => ({ x: Math.max(0, Math.min(1, event.nativeEvent.locationX / width)), y: Math.max(0, Math.min(1, event.nativeEvent.locationY / (width * 9 / 16))) });
  function move(event: GestureResponderEvent) {
    if (!current.current || current.current.points.length > 250) return;
    current.current = { ...current.current, points: [...current.current.points, point(event)] };
    setStrokes(previous => [...previous.slice(0, -1), current.current!]);
  }
  return <View style={styles.section}>
    <Text style={styles.label}>Draw a sketch or choose a sketch file below</Text>
    <View style={styles.inks}>{inks.map(color => <Pressable accessibilityRole="button" accessibilityLabel={color === '#ffffff' ? 'Eraser' : `Ink ${color}`} accessibilityState={{ selected: ink === color, disabled }} disabled={disabled} key={color} onPress={() => setInk(color)} style={[styles.swatch, { backgroundColor: color, borderColor: color === ink ? colors.violet : colors.border }]} />)}</View>
    <Options label="Brush" value={brush} options={sketchBrushSizes.map(String)} disabled={disabled} onChange={setBrush} />
    <View accessible accessibilityLabel="Sketch canvas" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.canvas} onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled} onResponderGrant={event => { onDrawing(true); current.current = { color: ink, width: Number(brush), points: [point(event)] }; setStrokes(previous => [...previous.slice(-79), current.current!]); }} onResponderMove={move} onResponderRelease={() => { current.current = null; onDrawing(false); }} onResponderTerminate={() => { current.current = null; onDrawing(false); }}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>{strokes.flatMap((stroke, index) => stroke.points.map((point, i) => {
        const previous = stroke.points[Math.max(0, i - 1)];
        const x = point.x * width, y = point.y * width * 9 / 16, px = previous.x * width, py = previous.y * width * 9 / 16;
        const length = Math.max(stroke.width * width / 640, Math.hypot(x - px, y - py));
        const thickness = stroke.width * width / 640;
        return <View key={`${index}-${i}`} style={{ position: 'absolute', left: (x + px) / 2 - length / 2, top: (y + py) / 2 - thickness / 2, width: length, height: thickness, borderRadius: thickness / 2, backgroundColor: stroke.color, transform: [{ rotate: `${Math.atan2(y - py, x - px)}rad` }] }} />;
      }))}</View>
    </View>
    <View style={styles.actions}><PrimaryButton disabled={disabled || !strokes.length} icon="arrow-undo" label="Undo" onPress={() => setStrokes(previous => previous.slice(0, -1))} /><PrimaryButton disabled={disabled || !strokes.length} icon="trash-outline" label="Clear" onPress={() => setStrokes([])} /></View>
    <PrimaryButton disabled={disabled || !strokes.length} icon="checkmark" label="Use this sketch" onPress={() => { const file = new File(Paths.cache, `savi-sketch-${Crypto.randomUUID()}.png`); file.create(); file.write(encodeNativeSketch(strokes)); onUse(file); }} />
  </View>;
}

const styles = StyleSheet.create({ section: { gap: spacing.sm }, label: { color: colors.textMuted, fontSize: 13 }, inks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, swatch: { width: 32, height: 32, borderWidth: 2, borderRadius: 16 }, canvas: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#ffffff', overflow: 'hidden', borderWidth: 1, borderColor: colors.border }, actions: { flexDirection: 'row', gap: spacing.sm } });
