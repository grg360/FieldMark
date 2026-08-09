// LATEST — every captured post for a TA, newest-first by posted_at.
// Plain PostgREST reads (social_posts_v2 public-read since 2026-08-07).
//
// SORT vs CAPTURE (binding, from the 2026-08-08 review): posted_at is the
// tweet's own timestamp and is trustworthy — the ORDER is honest. When WE
// read the post is a separate fact (captured_at), recorded only since the
// DEFAULT-now() migration and never backfilled; the surface captions that at
// stream level and never fabricates recency from it.
//
// Engagement nulls pass through untouched (never ?? 0) — same discipline as
// socialSearch / socialVoice.
import { supabase } from "./supabase";
import type { CapturedPostRow } from "../components/SocialPostRow";

export interface LatestStream {
  total: number; // TA-tagged captured posts, all pages
  posts: CapturedPostRow[];
  captureBoundary: string | null; // MIN(captured_at) corpus-wide — recording began here
  untaggedTotal: number; // corpus-wide posts invisible to any TA-scoped read
}

interface Row {
  id: string; handle: string; display_name: string | null; platform_post_id: string;
  post_text: string | null; posted_at: string; engagement_likes: number | null;
  engagement_replies: number | null; engagement_reposts: number | null;
  engagement_quotes: number | null; is_reply: boolean | null;
}

export async function getLatestCaptured(taSlug: string, limit = 50, offset = 0): Promise<LatestStream> {
  const [postsRes, boundaryRes, untaggedRes] = await Promise.all([
    supabase
      .from("social_posts_v2")
      .select("id, handle, display_name, platform_post_id, post_text, posted_at, engagement_likes, engagement_replies, engagement_reposts, engagement_quotes, is_reply", { count: "exact" })
      .contains("therapeutic_areas", [taSlug])
      .order("posted_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("social_posts_v2")
      .select("captured_at")
      .not("captured_at", "is", null)
      .order("captured_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("social_posts_v2")
      .select("id", { count: "exact", head: true })
      .or("therapeutic_areas.is.null,therapeutic_areas.eq.{}"),
  ]);
  if (postsRes.error) console.warn("getLatestCaptured: query error", postsRes.error);

  return {
    total: postsRes.count ?? 0,
    posts: ((postsRes.data ?? []) as Row[]).map((r) => ({
      id: r.id,
      handle: r.handle,
      displayName: r.display_name,
      text: r.post_text ?? "",
      postedAt: r.posted_at,
      // null preserved — absence of a figure is not zero
      likes: r.engagement_likes,
      replies: r.engagement_replies,
      reposts: r.engagement_reposts,
      quotes: r.engagement_quotes,
      isReply: !!r.is_reply,
      sourceUrl: `https://x.com/${r.handle}/status/${r.platform_post_id}`,
      voicePath: `/social/voice/${encodeURIComponent(r.handle)}`,
    })),
    captureBoundary: boundaryRes.data?.captured_at ?? null,
    untaggedTotal: untaggedRes.count ?? 0,
  };
}
