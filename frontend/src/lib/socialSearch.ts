// Keyword search over CAPTURED tweet text — social_post_search RPC
// (migration 2026_08_08). websearch semantics: multi-word AND, "quoted
// phrases", -exclusions; word-boundary + English stemming (partial tokens
// don't match — see KNOWN_ISSUES on clinical-term stemming).
//
// DATA RULE: engagement counts stay null through the mapper. A null figure
// ("not captured") and a zero ("captured, had none") are different facts;
// the render states the absence. Never ?? 0 these.
import { supabase } from "./supabase";

export interface SearchHit {
  id: string;
  handle: string; // lowercase — the /social/voice/:handle key
  displayName: string | null;
  platformPostId: string;
  text: string;
  postedAt: string;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  isReply: boolean;
  sourceUrl: string;
  voicePath: string;
}

export interface SearchResult {
  total: number;
  hits: SearchHit[];
}

interface RpcPost {
  id: string; handle: string; display_name: string | null;
  platform_post_id: string; post_text: string | null; posted_at: string;
  likes: number | null; replies: number | null; reposts: number | null;
  quotes: number | null; is_reply: boolean | null;
}

export async function searchCapturedPosts(
  term: string,
  taSlug: string | null,
  limit = 50,
  offset = 0,
): Promise<SearchResult> {
  const { data, error } = await supabase.rpc("social_post_search", {
    p_term: term,
    p_ta_slug: taSlug,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.warn("searchCapturedPosts: rpc error", error);
    return { total: 0, hits: [] };
  }
  const payload = (data ?? { total: 0, posts: [] }) as { total: number; posts: RpcPost[] };
  return {
    total: payload.total ?? 0,
    hits: (payload.posts ?? []).map((r) => ({
      id: r.id,
      handle: r.handle,
      displayName: r.display_name,
      platformPostId: r.platform_post_id,
      text: r.post_text ?? "",
      postedAt: r.posted_at,
      // null preserved — absence of a figure is not zero
      likes: r.likes,
      replies: r.replies,
      reposts: r.reposts,
      quotes: r.quotes,
      isReply: !!r.is_reply,
      sourceUrl: `https://x.com/${r.handle}/status/${r.platform_post_id}`,
      voicePath: `/social/voice/${encodeURIComponent(r.handle)}`,
    })),
  };
}
