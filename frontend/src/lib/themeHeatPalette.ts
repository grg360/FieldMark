export function calculateHeatColor(
  paperCount: number,
  maxPaperCount: number,
): string {
  if (maxPaperCount <= 0 || paperCount <= 0) return "#1A1A1E";
  const ratio = Math.min(1, paperCount / maxPaperCount);
  const minAlpha = 0.08;
  const maxAlpha = 0.32;
  const alpha = minAlpha + (maxAlpha - minAlpha) * ratio;
  const baseR = 17, baseG = 17, baseB = 19;
  const amberR = 232, amberG = 160, amberB = 32;
  const r = Math.round(baseR + (amberR - baseR) * alpha);
  const g = Math.round(baseG + (amberG - baseG) * alpha);
  const b = Math.round(baseB + (amberB - baseB) * alpha);
  return `rgb(${r}, ${g}, ${b})`;
}

export function getChipTextColor(
  _paperCount: number,
  _maxPaperCount: number,
): string {
  return "#E8E6DF";
}
