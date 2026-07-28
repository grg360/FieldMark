// Per-congress social aggregation over social_posts_v2, via the get_congress_social
// RPC (aggregation stays in the DB — the client never pulls raw posts). Hashtags in
// config are lowercase with the # prefix, matching how they're stored.
//
// Reporting threshold (Design): below 250 posts from 40 accounts, do not render
// share of voice or topic trend — show the honest empty state. Callers gate on
// meetsThreshold(). The daily series is observed days only (starts at capture_start);
// unobserved days are absent, never zero.

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

// ── Voice classification (heuristic) ────────────────────────────────────────
// Splits congress voices into individual clinicians vs organizational accounts
// using account name + profile text (social_users_v2.display_name/bio) and
// handle shape. Follower count is a supporting signal only — it breaks exact
// ties, never overrides text signals. This is INFERENCE, not verification;
// every surface rendering the split must say so in the same register as the
// rest of the page. Tuned against the ASCO 2026 voice population (1,742
// accounts -> 1,286 individual / 456 org): credentials and personal-name shape
// mark individuals; institutional vocabulary, first-person-plural bios, and
// fused CamelCase brand names mark organizations. "MD Anderson" is explicitly
// excluded from the credential signal.
export type VoiceClass = "individual" | "org";

export interface VoiceProfile {
  display_name: string | null;
  bio: string | null;
  follower_count: number | null;
}

const ORG_DN = /\b(center|centre|institute|institution|hospital|university|college|academy|society|association|foundation|journal|network|alliance|coalition|consortium|congress|department|division|clinic|pharma|therapeutics|biotech|news|media|official|nonprofit|charity|advocacy|organization|group|cancer|oncology|analytics|updates|AI|bot)\b|MD Anderson/i;
const ORG_BIO = /\b(center|centre|institute|institution|hospital|university|college|academy|society|association|foundation|journal|network|alliance|coalition|consortium|department|division|clinic|pharma|therapeutics|biotech|news|media|official|nonprofit|charity|advocacy|organization)\b/i;
const ORG_HANDLE = /(news|alert|today|live|official|center|health|hosp|univ|journal|pharma)/i;
const ORG_PLURAL = /\b(we|our|us|join us|follow us)\b/i;
const IND_CRED = /\b(MD|M\.D\.|PhD|Ph\.D\.|MBBS|DO|PharmD|MPH|MSc|RN|NP|PA-C|FACP|FASCO|FRCP|FRCPC|Prof|Professor|Dr|Dra)\b\.?/;
const IND_HANDLE = /(^dr[_a-z]|_dr_|md$|_md|phd$|_phd)/i;
const IND_FIRST_PERSON = /\b(I|I'm|my|mine|me)\b/;
const IND_NAME_SHAPE = /^[\p{L}]+([ .'-][\p{L}]+){1,3}\.?$/u;
const ORG_CAMEL = /^[A-Z][a-z]+[A-Z]/;

export function classifyVoice(handle: string, profile: VoiceProfile | undefined): VoiceClass {
  const dn = (profile?.display_name ?? "").trim();
  const bio = (profile?.bio ?? "").trim();
  const followers = profile?.follower_count ?? 0;
  let org = 0;
  let ind = 0;
  const dnCred = IND_CRED.test(dn);
  if (ORG_DN.test(dn)) org += 2;
  if (ORG_BIO.test(bio)) org += 1;
  if (ORG_PLURAL.test(bio)) org += 1;
  if (ORG_HANDLE.test(handle) && !dnCred) org += 1;
  if (ORG_CAMEL.test(dn) && !dn.includes(" ")) org += 1;
  if (dnCred && !/\bMD Anderson\b/i.test(dn)) ind += 2;
  if (IND_CRED.test(bio)) ind += 2;
  if (IND_HANDLE.test(handle)) ind += 2;
  if (IND_FIRST_PERSON.test(bio)) ind += 1;
  if (IND_NAME_SHAPE.test(dn) && !ORG_DN.test(dn)) ind += 1;
  if (org === ind) return followers >= 25000 ? "org" : "individual";
  return org > ind ? "org" : "individual";
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
