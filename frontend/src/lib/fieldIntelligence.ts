// Field Intelligence Forum — data layer (read-only preview).
//
// Every thread is anchored to a real publications_v2 row; all discussion is
// fabricated (SIMULATED) and seeded. There are NO write paths — this module
// exposes reads only, matching the SELECT-only grants on the field_intel_* tables.

import { supabase } from "./supabase";

export type ComplianceState = "on_anchor" | "under_review" | "context_note" | "removed";
export type NoteType = "auto_signal" | "peer_flag";
export type QueueState =
  | "open_peer_flag"
  | "open_auto_signal"
  | "blocked_at_composer"
  | "resolved_removed";

export interface PublicationRef {
  title: string;
  journal: string | null;
  pub_year: number | null;
  citation_count: number | null;
}

export interface ForumAnchor {
  id: string;
  publication_id: string;
  pubmed_id: string;
  journal_abbrev: string;
  scope_on_topic: string;
  scope_off_topic: string;
  thread_count: number;
  reply_count: number;
  is_seed: boolean; // false = a real anchor minted by the founder-gated RPC
  publication: PublicationRef | null;
}

export interface ForumThread {
  id: string;
  anchor_id: string;
  question_title: string;
  question_body: string | null;
  author_handle: string;
  scope_label: string | null;
  recency_label: string;
  reply_count: number;
  participant_count: number;
  under_review_count: number;
  removed_count: number;
  context_note_count: number;
  is_primary: boolean;
  is_seed: boolean; // false = a real thread; drives the SEEDED/LIVE badge
  created_at: string;
}

export interface PostNote {
  id: string;
  post_id: string;
  note_type: NoteType;
  label: string;
  body_text: string;
  disposition_text: string;
}

export interface ForumPost {
  id: string;
  thread_id: string;
  parent_post_id: string | null;
  depth: number;
  ordinal: number;
  author_handle: string;
  body: string;
  compliance_state: ComplianceState;
  anchor_fragment: string | null;
  recency_label: string;
  removed_body: string | null;
  removed_detected_phrases: string[] | null;
  placeholder_shown: boolean;
  is_seed: boolean; // false = a real post; drives the SEEDED/LIVE badge (per-row)
  notes: PostNote[];
}

export interface ModerationRecord {
  id: string;
  case_number: string;
  post_id: string | null;
  thread_id: string | null;
  anchor_pubmed_id: string | null;
  author_handle: string;
  queue_state: QueueState;
  clause_cited: string | null;
  clause_text: string | null;
  timing_label: string | null;
  sla_label: string | null;
  notification_state: string | null;
  appeal_window_days: number | null;
  classifier_score: number | null;
  account_history: string | null;
  anchor_check_text: string | null;
  decision_text: string | null;
  follow_up_text: string | null;
  blocked_reason: string | null;
  audit_log: { t: string; event: string }[];
}

// Anchor + its threads + the real publication, sorted by citation count desc.
export interface ForumIndexAnchor extends ForumAnchor {
  threads: ForumThread[];
}

// ── ARCHITECTURAL GAP, LOGGED 2026-08-15 — NO TA SCOPE ──────────────────────
// This join takes publications_v2 with NO therapeutic-area predicate, and the
// sort below is citation_count across whatever field_intel_anchors happens to
// hold. The forum can therefore surface any publication in the corpus from any
// TA, ranked above its own subject matter — PMID 40305708 (Semaglutide in MASH,
// Hepatology, 590 citations) led a lung-cancer board for exactly this reason.
// The corpus was not wrong; the forum never asks which TA it is.
// Scoping needs a therapeutic_area_id on field_intel_anchors, a predicate in
// fi_create_thread (see sql/field_intelligence_forum_writes.sql), and a route or
// config source for the TA. LOGGED, DELIBERATELY NOT BUILT.
export async function getForumIndex(): Promise<{ data: ForumIndexAnchor[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from("field_intel_anchors")
    .select(
      "*, publication:publications_v2(title, journal, pub_year, citation_count), threads:field_intel_threads(*)",
    );
  if (error) return { data: null, error };
  const anchors = ((data ?? []) as unknown as ForumIndexAnchor[])
    .map((a) => ({
      ...a,
      threads: [...(a.threads ?? [])].sort(
        (x, y) => Number(y.is_primary) - Number(x.is_primary),
      ),
    }))
    .sort((a, b) => (b.publication?.citation_count ?? 0) - (a.publication?.citation_count ?? 0));
  return { data: anchors, error: null };
}

// Which threads carry at least one moderation record. The forum board shows
// moderation badges only where a record exists; every other thread shows the
// drawn "NO MODERATION ON THIS THREAD" line (that line keeps card heights even).
// Records with no thread_id (e.g. blocked_at_composer, never posted) are ignored.
export async function getModeratedThreadIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("field_intel_moderation_records")
    .select("thread_id");
  if (error || !data) return new Set<string>();
  return new Set(
    (data as { thread_id: string | null }[])
      .map((r) => r.thread_id)
      .filter((id): id is string => !!id),
  );
}

export interface ThreadDetail {
  thread: ForumThread;
  anchor: ForumAnchor;
  posts: ForumPost[];
}

export async function getThread(threadId: string): Promise<{ data: ThreadDetail | null; error: unknown }> {
  const { data: thread, error: tErr } = await supabase
    .from("field_intel_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (tErr || !thread) return { data: null, error: tErr ?? "not found" };

  const { data: anchor, error: aErr } = await supabase
    .from("field_intel_anchors")
    .select("*, publication:publications_v2(title, journal, pub_year, citation_count)")
    .eq("id", (thread as ForumThread).anchor_id)
    .maybeSingle();
  if (aErr || !anchor) return { data: null, error: aErr ?? "anchor missing" };

  const { data: posts, error: pErr } = await supabase
    .from("field_intel_posts")
    .select("*, notes:field_intel_post_notes(*)")
    .eq("thread_id", threadId)
    .order("ordinal", { ascending: true });
  if (pErr) return { data: null, error: pErr };

  return {
    data: {
      thread: thread as ForumThread,
      anchor: anchor as unknown as ForumAnchor,
      posts: (posts ?? []) as unknown as ForumPost[],
    },
    error: null,
  };
}

export async function getModerationQueue(): Promise<{ data: ModerationRecord[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from("field_intel_moderation_records")
    .select("*")
    .order("case_number", { ascending: false });
  if (error) return { data: null, error };
  return { data: (data ?? []) as unknown as ModerationRecord[], error: null };
}

// Discuss affordance for publication cards: which of these publications have a
// forum anchor, and its activity. Keyed by pubmed_id.
export interface DiscussAffordance {
  pubmed_id: string;
  anchor_id: string;
  reply_count: number;
  thread_count: number;
  recency_label: string | null;
  primary_thread_id: string | null;
}

// ── Write path (founder-gated in the DB; UI mirrors it) ─────────────────────
// All writes go through SECURITY DEFINER RPCs that self-gate on the caller's
// auth.uid() and run the content check server-side. The client cannot bypass
// either — there are no INSERT grants on the tables.

export interface WriteResult {
  ok: boolean;
  reason?: string;
  thread_id?: string;
  post_id?: string;
}

// The write handle (pseudonymous to peers, per the surface's model). Hardcoded
// by design for now: the write path is founder-gated (fi_can_write on
// auth.uid()), so exactly one account can post and this constant IS that
// account's handle. A per-user handle field is the multi-writer version.
export const FORUM_WRITE_HANDLE = "@ggroesbeck";

export async function canWriteForum(): Promise<boolean> {
  const { data, error } = await supabase.rpc("fi_can_write");
  return !error && data === true;
}

export async function createThread(
  pubmedId: string,
  questionTitle: string,
  questionBody: string,
): Promise<WriteResult> {
  const { data, error } = await supabase.rpc("fi_create_thread", {
    p_pubmed_id: pubmedId,
    p_question_title: questionTitle,
    p_question_body: questionBody,
    p_handle: FORUM_WRITE_HANDLE,
  });
  if (error) return { ok: false, reason: error.message };
  return data as WriteResult;
}

export async function createReply(
  threadId: string,
  parentPostId: string | null,
  body: string,
): Promise<WriteResult> {
  const { data, error } = await supabase.rpc("fi_create_reply", {
    p_thread_id: threadId,
    p_parent_post_id: parentPostId,
    p_body: body,
    p_handle: FORUM_WRITE_HANDLE,
  });
  if (error) return { ok: false, reason: error.message };
  return data as WriteResult;
}

export async function getDiscussAffordances(
  pubmedIds: string[],
): Promise<Record<string, DiscussAffordance>> {
  if (pubmedIds.length === 0) return {};
  const { data, error } = await supabase
    .from("field_intel_anchors")
    .select("id, pubmed_id, reply_count, thread_count, threads:field_intel_threads(id, recency_label, is_primary, reply_count)")
    .in("pubmed_id", pubmedIds);
  if (error || !data) return {};
  const out: Record<string, DiscussAffordance> = {};
  for (const a of data as any[]) {
    const threads = (a.threads ?? []) as { id: string; recency_label: string; is_primary: boolean; reply_count: number }[];
    const primary = threads.find((t) => t.is_primary) ?? threads[0] ?? null;
    out[a.pubmed_id] = {
      pubmed_id: a.pubmed_id,
      anchor_id: a.id,
      reply_count: a.reply_count,
      thread_count: a.thread_count,
      recency_label: primary?.recency_label ?? null,
      primary_thread_id: primary?.id ?? null,
    };
  }
  return out;
}
