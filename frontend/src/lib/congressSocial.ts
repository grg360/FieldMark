// Per-congress social aggregation over social_posts_v2, via the get_congress_social
// RPC (aggregation stays in the DB — the client never pulls raw posts). Hashtags in
// config are lowercase with the # prefix, matching how they're stored.
//
// Reporting threshold (Design): below 250 posts from 40 accounts, do not render
// share of voice or topic trend — show the honest empty state. Callers gate on
// meetsThreshold().
//
// The daily series holds ONLY days with captured posts — unobserved days are
// absent, never zero (2026-07-31: the RPC's old generate_series emitted the
// 4 Jun – 20 Jul capture gap as ~47 literal zeros; it no longer emits a calendar).
// True zero days are indistinguishable from unobserved days until capture runs
// record their coverage in social_capture_coverage, so they are absent too.
//
// wow_pct is NULL unless BOTH 7-day comparison windows are fully covered by
// social_capture_coverage rows AND both hold >= 50 posts (server-side gate).
// Nothing populates the coverage table yet, so wow_pct is currently always NULL.
// On NULL, render nothing — no zero, no dash.

import { supabase } from "./supabase";
import type { Congress } from "./congresses";

export const SOCIAL_THRESHOLD = { posts: 250, accounts: 40 } as const;

export interface CongressVoice {
  handle: string;
  name: string;
  posts: number;
  share: number; // % of total posts
}

export interface CongressHashtag {
  tag: string;
  posts: number;
  share: number; // % of total posts carrying this co-hashtag
}

export interface CongressSocial {
  total_posts: number;
  voices: number;
  capture_start: string;
  last_day: string;
  wow_pct: number | null;
  daily: { d: string; n: number }[];
  top_voices: CongressVoice[];
  hot_hashtags: CongressHashtag[];
}

export function meetsThreshold(s: CongressSocial): boolean {
  return s.total_posts >= SOCIAL_THRESHOLD.posts && s.voices >= SOCIAL_THRESHOLD.accounts;
}

export async function getCongressSocial(c: Congress): Promise<CongressSocial | null> {
  if (!c.hashtags || c.hashtags.length === 0) return null;
  try {
    const { data, error } = await supabase.rpc("get_congress_social", {
      p_hashtags: c.hashtags,
      p_capture_start: c.social_capture_start,
    });
    if (error || !data) return null;
    return data as CongressSocial;
  } catch (err) {
    console.warn("getCongressSocial: error", err);
    return null;
  }
}
