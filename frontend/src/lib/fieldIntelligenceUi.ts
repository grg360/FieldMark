export const FI_ACCENT = "rgba(120, 200, 255, 1)";
export const FI_ACCENT_MUTED = "rgba(120, 200, 255, 0.7)";
export const FI_BG = "rgba(13, 13, 16, 0.95)";

export function handleAvatarColor(handle: string): string {
  let hash = 0;
  for (let i = 0; i < handle.length; i++) {
    hash = handle.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 42%)`;
}

export function mockFieldIntelContributorCount(hcpId: string): number {
  const samples = [0, 1, 2, 12, 5, 8, 0, 3, 12, 7, 4, 0, 9, 12, 6, 2, 11];
  let hash = 0;
  for (let i = 0; i < hcpId.length; i++) {
    hash = (hash + hcpId.charCodeAt(i)) % samples.length;
  }
  return samples[hash] ?? 0;
}
