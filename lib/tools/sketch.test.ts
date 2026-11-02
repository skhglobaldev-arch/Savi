import assert from 'node:assert/strict';
import test from 'node:test';
import UPNG from '@pdf-lib/upng';
import { encodeNativeSketch } from './sketch.ts';

test('native drawing exports a valid reference PNG using the existing PNG codec', () => {
  const bytes = encodeNativeSketch([{ color: '#111827', width: 10, points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }] }]);
  const codec = (UPNG as unknown as { default?: typeof UPNG }).default || UPNG;
  const decoded = codec.decode(bytes.buffer);
  assert.equal(decoded.width, 640);
  assert.equal(decoded.height, 360);
  const pixels = new Uint8Array(codec.toRGBA8(decoded)[0]);
  assert.deepEqual(Array.from(pixels.slice((180 * 640 + 320) * 4, (180 * 640 + 320) * 4 + 4)), [17, 24, 39, 255]);
  assert.deepEqual(Array.from(pixels.slice(0, 4)), [255, 255, 255, 255]);
});
