// Per-voice social stream (net-new surface, 2026-08-07). Key is
// (platform, handle) — handle alone is NOT unique once bluesky ships;
// platform is pinned 'twitter' until then. Handles are stored lowercase by
// the capture writer; lower()-and-strip-@ again on entry, belt-and-braces.
//
// DATA RULES (review 2026-08-07):
//  - Engagement counts stay null through the mapper. A null like-count
//    ("figure not captured") and a real zero ("captured, had none") are
//    different facts; the render states the absence, never zero-fills.
//  - profile can be null: exactly one orphan handle exists today
//    (posts captured, profile fetch failed) and the page must render it.
//  - captureBoundary = MIN(captured_at) corpus-wide. Every existing post
//    pre-dates the 2026-08-07 DEFAULT-now() migration and has NULL
//    captured_at forever (no backfill possible); the boundary is the honest
//    "recording began" date. Null boundary = no stamp has landed yet.
import { supabase } from "./supabase";

export interface VoiceProfile {
  platform: string;
  handle: string;
  displayName: string | null;
  bio: string | null; // profile text as written — render verbatim
  location: string | null;
  website: string | null;
  // Frozen at handle discovery — profiles are never re-fetched
  // (KNOWN_ISSUES: social profile re-fetch gap). Caption as AT DISCOVERY,
  // never as a current figure. post_count is deliberately NOT exposed: a
  // frozen profile count beside the live captured-stream length implies the
  // two should agree, and they never will.
  followerCount: number | null;
  followingCount: number | null;
  verified: boolean;
  profileUrl: string | null;
}

export interface VoicePost {
  id: string;
  platformPostId: string;
  text: string;
  postedAt: string;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  isReply: boolean;
  hashtags: string[];
  capturedAt: string | null;
  capturedViaQuery: string | null;
  sourceUrl: string;
}

export interface VoiceStream {
  profile: VoiceProfile | null; // null = orphan handle (posts, no profile row)
  posts: VoicePost[]; // reverse-chronological by posted_at
  captureBoundary: string | null;
}

export async function getVoiceStream(rawHandle: string, platform = "twitter"): Promise<VoiceStream> {
  const handle = rawHandle.trim().toLowerCase().replace(/^@/, "");

  const [profRes, postsRes, boundaryRes] = await Promise.all([
    supabase
      .from("social_users_v2")
      .select("platform, handle, display_name, bio, location, website, follower_count, following_count, verified, profile_url")
      .eq("platform", platform)
      .eq("handle", handle)
      .maybeSingle(),
    supabase
      .from("social_posts_v2")
      .select("id, platform_post_id, post_text, posted_at, engagement_likes, engagement_replies, engagement_reposts, engagement_quotes, is_reply, hashtags, captured_at, captured_via_query")
      .eq("platform", platform)
      .eq("handle", handle)
      .order("posted_at", { ascending: false }),
    supabase
      .from("social_posts_v2")
      .select("captured_at")
      .not("captured_at", "is", null)
      .order("captured_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (postsRes.error) console.warn("getVoiceStream: posts query error", postsRes.error);
  if (profRes.error) console.warn("getVoiceStream: profile query error", profRes.error);

  const p = profRes.data;
  return {
    profile: p
      ? {
          platform: p.platform,
          handle: p.handle,
          displayName: p.display_name,
          bio: p.bio,
          location: p.location,
          website: p.website,
          followerCount: p.follower_count,
          followingCount: p.following_count,
          verified: !!p.verified,
          profileUrl: p.profile_url,
        }
      : null,
    posts: (postsRes.data ?? []).map((r) => ({
      id: r.id as string,
      platformPostId: r.platform_post_id as string,
      text: (r.post_text as string) ?? "",
      postedAt: r.posted_at as string,
      // null preserved: absence of a figure is not zero
      likes: r.engagement_likes,
      replies: r.engagement_replies,
      reposts: r.engagement_reposts,
      quotes: r.engagement_quotes,
      isReply: !!r.is_reply,
      hashtags: Array.isArray(r.hashtags) ? (r.hashtags as string[]) : [],
      capturedAt: r.captured_at,
      capturedViaQuery: r.captured_via_query,
      sourceUrl: `https://x.com/${handle}/status/${r.platform_post_id}`,
    })),
    captureBoundary: boundaryRes.data?.captured_at ?? null,
  };
}
