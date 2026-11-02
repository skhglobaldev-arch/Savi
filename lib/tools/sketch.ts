import UPNG from '@pdf-lib/upng';

export type SketchStroke = { color: string; width: number; points: { x: number; y: number }[] };

export function encodeNativeSketch(strokes: SketchStroke[]) {
  const width = 640, height = 360;
  const pixels = new Uint8Array(width * height * 4).fill(255);
  for (const stroke of strokes) {
    if (!/^#[0-9a-f]{6}$/i.test(stroke.color)) throw new Error('Invalid sketch color.');
    const color = [1, 3, 5].map(start => parseInt(stroke.color.slice(start, start + 2), 16));
    const radius = Math.max(1, Math.min(stroke.width / 2, 32));
    const stamp = (x: number, y: number) => {
      for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(height - 1, Math.ceil(y + radius)); py++) {
        for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(width - 1, Math.ceil(x + radius)); px++) {
          if ((px - x) ** 2 + (py - y) ** 2 > radius ** 2) continue;
          pixels.set([...color, 255], (py * width + px) * 4);
        }
      }
    };
    stroke.points.forEach((point, index) => {
      const previous = stroke.points[Math.max(0, index - 1)];
      const x = Math.max(0, Math.min(1, point.x)) * width, y = Math.max(0, Math.min(1, point.y)) * height;
      const px = Math.max(0, Math.min(1, previous.x)) * width, py = Math.max(0, Math.min(1, previous.y)) * height;
      const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / Math.max(1, radius / 2)));
      for (let step = 0; step <= steps; step++) stamp(px + (x - px) * step / steps, py + (y - py) * step / steps);
    });
  }
  const encoder = (UPNG as unknown as { default?: typeof UPNG }).default || UPNG;
  return new Uint8Array(encoder.encode([pixels.buffer], width, height, 0));
}
