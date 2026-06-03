const STOPS = [
  { t: 0.0, color: [0xf4, 0xd3, 0x5e] },
  { t: 0.33, color: [0xf4, 0xa2, 0x61] },
  { t: 0.66, color: [0xe7, 0x6f, 0x51] },
  { t: 1.0, color: [0xd6, 0x28, 0x28] },
] as const;

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): string {
  return rgbToHex(
    lerpChannel(from[0], to[0], t),
    lerpChannel(from[1], to[1], t),
    lerpChannel(from[2], to[2], t),
  );
}

function normalizedIntensity(paperCount: number, maxPaperCount: number): number {
  if (maxPaperCount <= 0) return 0;
  return Math.min(1, Math.max(0, paperCount / maxPaperCount));
}

export function calculateHeatColor(paperCount: number, maxPaperCount: number): string {
  const intensity = normalizedIntensity(paperCount, maxPaperCount);
  if (intensity >= 1) return "#D62828";

  for (let i = 0; i < STOPS.length - 1; i++) {
    const left = STOPS[i];
    const right = STOPS[i + 1];
    if (intensity >= left.t && intensity <= right.t) {
      const span = right.t - left.t;
      const localT = span > 0 ? (intensity - left.t) / span : 0;
      return lerpRgb(left.color, right.color, localT);
    }
  }

  return rgbToHex(...STOPS[0].color);
}

export function getChipTextColor(paperCount: number, maxPaperCount: number): string {
  const intensity = normalizedIntensity(paperCount, maxPaperCount);
  return intensity < 0.33 ? "#1a1a1a" : "#FFFFFF";
}
