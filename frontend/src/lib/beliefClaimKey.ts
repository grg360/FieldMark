import type { AdvocacyTheme, ResearchFocusItem } from "./scientificPositions";

export type ClaimSection = "strongly_advocates" | "frequently_raises" | "research_focus";

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildAdvocacyClaimKey(
  hcpId: string,
  theme: AdvocacyTheme,
): Promise<string> {
  const sortedIds = [...theme.representative_position_ids].sort();
  const payload = `advocacy|${hcpId}|${sortedIds.join(",")}`;
  return sha256Hex(payload);
}

export async function buildResearchFocusClaimKey(
  hcpId: string,
  item: ResearchFocusItem,
): Promise<string> {
  const sortedCategories = [...item.primary_position_categories].sort();
  const payload = `focus|${hcpId}|${item.theme}|${sortedCategories.join(",")}`;
  return sha256Hex(payload);
}
