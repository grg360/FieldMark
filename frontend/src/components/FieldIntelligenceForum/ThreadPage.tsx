// Field Intelligence Forum — thread view (Design frame 3). The core surface:
// the publication anchor with its scope statement, the anchored question, and the
// reply tree carrying all four compliance states. Removal is a placeholder that
// keeps its slot (never a delete); the removed body is reviewer/author-only.
// Every write affordance (Reply, Flag, the composer) renders and is inert.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppLayout from "../AppLayout";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { GROUND, LINE, INK, GOLD, STATE, FACE } from "../../lib/canonicalTokens";
import {
  getModerationQueue,
  getThread,
  type ForumPost,
  type ModerationRecord,
  type ThreadDetail,
} from "../../lib/fieldIntelligence";
import {
  ComplianceChip,
  DisabledControl,
  HandleAvatar,
  mono,
  PrototypeStrip,
  serif,
  ProvenanceChip,
  VerifiedBadge,
} from "./fiUi";
import { useForumWriter } from "./useForumWriter";
import Composer from "./Composer";

const FLAG_REASONS = [
  "Reads as clinical recommendation",
  "Goes beyond what the paper reports",
  "Compares trials not designed for comparison",
  "Off-label or unapproved use",
  "Identifies an HCP, site or account",
];

// Attached note (pattern 03): auto-signal / peer-flag. Additive — the post body
// stays legible; the note explains the concern and what happens next.
function AttachedNote({ post }: { post: ForumPost }) {
  const note = post.notes?.[0];
  if (!note) return null;
  const isPeer = note.note_type === "peer_flag";
  const accent = isPeer ? GOLD.PRIME : INK.LABEL;
  const tint = isPeer ? GOLD.WASH : GROUND.RAISE;
  const border = isPeer ? "${GOLD.EDGE}" : LINE.EDGE;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: tint, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...mono(9, accent), letterSpacing: "0.12em", fontWeight: 600 }}>
          {isPeer ? "PEER FLAG" : "AUTO-SIGNAL"}
        </span>
        <span style={{ ...mono(9, accent), letterSpacing: "0.08em" }}>· {note.label}</span>
      </div>
      <span style={{ fontSize: 12.5, lineHeight: 1.6, color: INK.LABEL }}>{note.body_text}</span>
      <span style={mono(9.5, INK.LABEL)}>{note.disposition_text}</span>
      <DisabledControl variant="ghost">View in moderation queue →</DisabledControl>
    </div>
  );
}

// Removal placeholder (pattern 04). Keeps position + depth; states clause, timing,
// notification, appeal window. Removed text is reviewer/author-only, behind a reveal.
function RemovedPlaceholder({ post, record }: { post: ForumPost; record?: ModerationRecord }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", background: GROUND.INSET, border: `1px solid ${STATE.DANGER}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...mono(9.5, STATE.DANGER), letterSpacing: "0.12em", fontWeight: 600 }}>REMOVED BY MODERATION</span>
        <span style={mono(10.5, INK.MUTE)}>{post.author_handle} · posted {post.recency_label}</span>
        <ProvenanceChip seed={post.is_seed} />
      </div>
      <span style={{ fontSize: 13, lineHeight: 1.6, color: INK.BODY }}>
        {record?.clause_text ??
          "Removed under Scope 3.2 — clinical recommendation. The reply advised a treatment sequence and described directing prescriber behavior, neither of which is a discussion of what the anchored publication reports."}
      </span>
      <span style={mono(9.5, INK.LABEL)}>
        {record?.notification_state ?? "Author notified with the clause cited"}
        {record?.appeal_window_days != null ? ` · appeal window ${record.appeal_window_days} days` : ""}
        {record?.account_history ? ` · ${record.account_history}` : ""}
      </span>
      <span style={mono(9.5, INK.LABEL)}>Reply chain below this post preserved — thread not locked</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          style={{ ...mono(9.5, STATE.DANGER), letterSpacing: "0.1em", background: "none", border: `1px solid ${STATE.DANGER}`, padding: "4px 9px", cursor: "pointer" }}
        >
          {revealed ? "HIDE REMOVED TEXT" : "REVEAL REMOVED TEXT · REVIEWERS + AUTHOR ONLY"}
        </button>
        <DisabledControl variant="ghost">Open moderation record →</DisabledControl>
      </div>
      {revealed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: GROUND.BASE, border: `1px dashed ${STATE.DANGER}` }}>
          <span style={{ ...mono(9, INK.LABEL), letterSpacing: "0.12em" }}>REMOVED TEXT · VISIBLE TO REVIEWERS AND THE AUTHOR ONLY</span>
          <span style={{ fontFamily: FACE.value, fontSize: 14.5, lineHeight: 1.65, color: INK.LABEL }}>{post.removed_body}</span>
          {post.removed_detected_phrases && post.removed_detected_phrases.length > 0 && (
            <span style={mono(9.5, INK.LABEL)}>
              Detected phrases: {post.removed_detected_phrases.map((p) => `"${p}"`).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// On mobile, compliance state moves INTO the byline so a fast scroll still reads
// the state from the handle row (Design mobile treatment).
function PostByline({ post, isMobile }: { post: ForumPost; isMobile: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
      <HandleAvatar handle={post.author_handle} size={24} />
      <span style={mono(12, INK.PRIME)}>{post.author_handle}</span>
      <VerifiedBadge small />
      <span style={mono(10, INK.LABEL)}>{post.recency_label}</span>
      {post.compliance_state === "under_review" && <ComplianceChip state="under_review" />}
      {isMobile && post.compliance_state === "on_anchor" && (
        <ComplianceChip state="on_anchor" fragment={post.anchor_fragment} />
      )}
      <ProvenanceChip seed={post.is_seed} />
    </div>
  );
}

function PostActions({ post, isMobile, onReply }: { post: ForumPost; isMobile: boolean; onReply?: (post: ForumPost) => void }) {
  const touch = isMobile ? { minHeight: 44 } : undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {/* on desktop the on-anchor chip sits with the actions; on mobile it's in the byline */}
      {!isMobile && post.compliance_state === "on_anchor" && (
        <ComplianceChip state="on_anchor" fragment={post.anchor_fragment} />
      )}
      {onReply ? (
        <button type="button" onClick={() => onReply(post)} style={{ ...mono(10.5, INK.BODY), letterSpacing: "0.08em", background: "none", border: `1px solid ${LINE.EDGE}`, borderRadius: 0, padding: "8px 12px", cursor: "pointer", ...touch }}>Reply</button>
      ) : (
        <div style={touch}><DisabledControl variant="ghost">Reply</DisabledControl></div>
      )}
      <div style={touch}><DisabledControl variant="ghost">Flag</DisabledControl></div>
    </div>
  );
}

// A single visible post (on-anchor / context-note / under-review). Removed posts
// render via RemovedPlaceholder instead.
function PostBody({ post, record, isMobile, onReply }: { post: ForumPost; record?: ModerationRecord; isMobile: boolean; onReply?: (post: ForumPost) => void }) {
  if (post.compliance_state === "removed") return <RemovedPlaceholder post={post} record={record} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PostByline post={post} isMobile={isMobile} />
      <p style={{ margin: 0, fontFamily: FACE.value, fontSize: 15, lineHeight: 1.7, color: INK.BODY, maxWidth: "72ch" }}>
        {post.body}
      </p>
      {(post.compliance_state === "context_note" || post.compliance_state === "under_review") && (
        <AttachedNote post={post} />
      )}
      <PostActions post={post} isMobile={isMobile} onReply={onReply} />
    </div>
  );
}

export default function ThreadPage() {
  const { id } = useParams();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isWriter = useForumWriter();
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [records, setRecords] = useState<ModerationRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Active reply composer target (writer only): null = closed; parentPostId null
  // = replying to the thread question.
  const [replyTarget, setReplyTarget] = useState<{ parentPostId: string | null; replyingTo?: string } | null>(null);

  async function reload() {
    if (!id) return;
    const [t, m] = await Promise.all([getThread(id), getModerationQueue()]);
    setDetail(t.data);
    setRecords(m.data ?? []);
    setLoaded(true);
  }

  // ── DEFERRED (2026-08-15): error state, drafted and held ────────────────────
  // `t.error` is discarded, so a connection failure falls through to the same
  // `if (!detail)` branch as a genuine 404 and renders THREAD NOT FOUND. On a
  // surface that also removes posts, that reads as "this was taken down".
  //
  // NOT FIXED YET ON PURPOSE: prototype on simulated data, failure path not
  // reachable by a real user. Implement when the forum takes real contributions.
  //
  // NO LIB CHANGE IS NEEDED — getThread already distinguishes the two cases in
  // its return value: a genuine miss returns a STRING sentinel ("not found" /
  // "anchor missing"), a query failure returns a PostgrestError object. So the
  // discriminator is `typeof error === "string"`.
  //
  //   genuine 404   -> unchanged: THREAD NOT FOUND + "← All threads"
  //   load failure  -> kicker  THREAD DID NOT LOAD
  //                    body    "This thread could not be reached. It has not
  //                             been removed and it has not been closed — we
  //                             could not read it."
  //                    link    "← All threads" (unchanged)
  //
  // SECOND, SMALLER GAP, also deferred: `m.data ?? []` below discards
  // getModerationQueue()'s error too, so RemovedPlaceholder may fail to render
  // for posts that WERE removed — absence-as-fact, same family.
  //
  // reload() above is already wired for a retry affordance if one is ever wanted;
  // it is deliberately not used by any error path today.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([getThread(id), getModerationQueue()]).then(([t, m]) => {
      if (cancelled) return;
      setDetail(t.data);
      setRecords(m.data ?? []);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [id]);

  const recordByPost = useMemo(() => {
    const map = new Map<string, ModerationRecord>();
    for (const r of records) if (r.post_id) map.set(r.post_id, r);
    return map;
  }, [records]);

  // parent → children, ordinal-sorted
  const childrenOf = useMemo(() => {
    const map = new Map<string, ForumPost[]>();
    for (const p of detail?.posts ?? []) {
      const key = p.parent_post_id ?? "__root__";
      (map.get(key) ?? map.set(key, []).get(key)!).push(p);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.ordinal - b.ordinal);
    return map;
  }, [detail]);

  if (!loaded) {
    return (
      <AppLayout width="reading">
        <div style={{ paddingTop: 24, ...mono(11, INK.LABEL) }}>Loading…</div>
      </AppLayout>
    );
  }
  if (!detail) {
    return (
      <AppLayout width="reading">
        <div style={{ paddingTop: 24, fontFamily: FACE.ui, color: INK.BODY }}>
          <div style={{ ...mono(10.5, INK.MUTE), letterSpacing: "0.14em", marginBottom: 8 }}>THREAD NOT FOUND</div>
          <Link to="/field-intelligence" style={{ color: GOLD.PRIME }}>← All threads</Link>
        </div>
      </AppLayout>
    );
  }

  const { thread, anchor } = detail;
  const roots = childrenOf.get("__root__") ?? [];
  const onReply = isWriter ? (post: ForumPost) => setReplyTarget({ parentPostId: post.id, replyingTo: post.author_handle }) : undefined;

  const renderPost = (post: ForumPost, nested: boolean, parentHandle?: string) => {
    const kids = childrenOf.get(post.id) ?? [];
    // No-placeholder removed children collapse to a single summary line (mobile + desktop).
    const hiddenRemoved = kids.filter((k) => k.compliance_state === "removed" && !k.placeholder_shown);
    const visibleKids = kids.filter((k) => k.placeholder_shown);
    // Nesting caps at two levels. On mobile, nested replies flatten (no indent) with
    // a "replying to @handle" line; removed placeholders keep full width regardless.
    const flat = isMobile;
    const indentStyle = nested && !flat
      ? { marginLeft: 34, borderLeft: `1px solid ${LINE.HAIR}`, paddingLeft: 20 }
      : undefined;
    return (
      <div key={post.id} style={indentStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "18px 0", borderBottom: `1px solid ${LINE.HAIR}` }}>
          {nested && flat && post.compliance_state !== "removed" && parentHandle && (
            <span style={mono(9.5, INK.LABEL)}>replying to {parentHandle}</span>
          )}
          <PostBody post={post} record={recordByPost.get(post.id)} isMobile={isMobile} onReply={onReply} />
        </div>
        {visibleKids.map((k) => renderPost(k, true, post.author_handle))}
        {hiddenRemoved.length > 0 && (
          <div style={flat ? undefined : { marginLeft: 34, paddingLeft: 20, borderLeft: `1px solid ${LINE.HAIR}` }}>
            <div style={{ ...mono(10, INK.LABEL), padding: "12px 0", fontStyle: "italic" }}>
              {hiddenRemoved.length} {hiddenRemoved.length === 1 ? "reply" : "replies"} removed by moderation — no placeholder shown to peers
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout width="reading">
      <div style={{ fontFamily: FACE.ui, color: INK.PRIME, paddingTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>
        <PrototypeStrip />
        <Link to="/field-intelligence" style={{ ...mono(10.5, INK.LABEL), letterSpacing: "0.1em" }}>← ALL THREADS</Link>

        {/* ── Publication anchor (pattern 01): indigo 2px left rule ── */}
        {/* On mobile the anchor stays on screen: a sticky two-line card at the top
            of the thread — the paper is the only thing that never scrolls away. */}
        <div style={{ padding: isMobile ? "12px 14px" : 20, background: GROUND.RAISE, border: `1px solid ${LINE.HAIR}`, borderLeft: `2px solid ${GOLD.PRIME}`, display: "flex", flexDirection: "column", gap: isMobile ? 8 : 12, ...(isMobile ? { position: "sticky" as const, top: 0, zIndex: 10 } : {}) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...mono(9.5, GOLD.PRIME), letterSpacing: "0.14em", background: "transparent", border: `1px solid ${GOLD.MUTE}`, padding: "3px 7px", fontWeight: 600 }}>PUBLICATION ANCHOR</span>
            <span style={mono(11, INK.LABEL)}>PMID {anchor.pubmed_id}</span>
            <span style={mono(11, INK.LABEL)}>{anchor.journal_abbrev} · {anchor.publication?.pub_year ?? "—"}</span>
            <span style={mono(11, INK.LABEL)}>{(anchor.publication?.citation_count ?? 0)} citations</span>
          </div>
          <h2 style={{ margin: 0, fontFamily: FACE.value, fontSize: 22, fontWeight: 500, lineHeight: 1.35, color: INK.PRIME }}>
            {anchor.publication?.title ?? "—"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <a href={`https://pubmed.ncbi.nlm.nih.gov/${anchor.pubmed_id}/`} target="_blank" rel="noreferrer" style={{ ...mono(11, GOLD.PRIME) }}>Open in PubMed ↗</a>
            <span style={mono(11, INK.LABEL)}>Author list not reproduced in-product</span>
          </div>
          {/* On mobile the scope collapses to a tap-to-read line to keep the anchor
              to two lines; on desktop the full scope statement renders. */}
          {isMobile ? (
            <span style={mono(9.5, INK.LABEL)}>Scope: results as published · tap to read the paper</span>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 13px", background: GROUND.BASE, border: `1px solid ${LINE.HAIR}` }}>
              <span style={{ ...mono(9.5, GOLD.PRIME), letterSpacing: "0.12em", flexShrink: 0, paddingTop: 2, fontWeight: 600 }}>SCOPE</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: INK.LABEL }}>
                On topic: {anchor.scope_on_topic}. Off topic: {anchor.scope_off_topic}.
              </span>
            </div>
          )}
        </div>

        {/* ── The anchored question ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <HandleAvatar handle={thread.author_handle} />
            <span style={mono(12.5, INK.PRIME)}>{thread.author_handle}</span>
            <VerifiedBadge />
            <span style={mono(10.5, INK.LABEL)}>{thread.recency_label}</span>
            <ProvenanceChip seed={thread.is_seed} />
          </div>
          <h1 style={{ margin: 0, fontFamily: FACE.value, fontSize: 27, fontWeight: 400, lineHeight: 1.35, color: INK.PRIME }}>
            {thread.question_title}
          </h1>
          {thread.question_body && (
            <p style={{ margin: 0, fontFamily: FACE.value, fontSize: 15.5, lineHeight: 1.7, color: INK.BODY, maxWidth: "70ch" }}>
              {thread.question_body}
            </p>
          )}
          <div style={{ display: "flex", gap: 14, alignItems: "center", ...mono(10.5, INK.LABEL), flexWrap: "wrap" }}>
            <span>{thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}</span><span>·</span>
            <span>{thread.participant_count} participants</span>
            {thread.scope_label && (<><span>·</span><span>{thread.scope_label}</span></>)}
          </div>
        </div>

        <div style={{ height: 1, background: LINE.HAIR, margin: "8px 0 0" }} />

        {/* ── Reply tree ── */}
        <div>{roots.map((p) => renderPost(p, false))}</div>

        {/* ── Reply composer — rendered, inert ── */}
        <div style={{ marginTop: 16, padding: 18, background: GROUND.RAISE, border: `1px solid ${LINE.HAIR}`, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Anchor reappears as a pill above the composer (mobile treatment; shown
              on all widths — the composer never lets you forget the anchor). */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...mono(9, GOLD.PRIME), letterSpacing: "0.12em", background: "transparent", border: `1px solid ${GOLD.MUTE}`, padding: "2px 7px", fontWeight: 600 }}>ANCHOR PMID {anchor.pubmed_id}</span>
            <span style={{ ...mono(9.5, GOLD.PRIME), letterSpacing: "0.14em" }}>REPLYING WITHIN ANCHOR</span>
            <span style={mono(10, INK.LABEL)}>locked to this thread</span>
          </div>
          <div style={{ padding: 14, background: GROUND.BASE, border: `1px solid ${LINE.HAIR}`, ...serif(15, INK.LABEL) }}>
            Respond to what the paper reports…
          </div>
          <span style={{ fontSize: 12, lineHeight: 1.6, color: INK.MUTE }}>
            Checked for recommendation language, off-label content and HCP names before posting.
            Flagged drafts come back to you unpublished.
          </span>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <DisabledControl variant="ghost">SAVE DRAFT</DisabledControl>
            {isWriter ? (
              <button
                type="button"
                onClick={() => setReplyTarget({ parentPostId: null })}
                style={{ ...mono(10.5, GOLD.PRIME), letterSpacing: "0.12em", background: "transparent", border: `1px solid ${GOLD.MUTE}`, borderRadius: 0, padding: "8px 14px", cursor: "pointer", fontWeight: 600 }}
              >
                CHECK &amp; POST REPLY
              </button>
            ) : (
              <DisabledControl variant="solid-amber">CHECK &amp; POST REPLY</DisabledControl>
            )}
          </div>
        </div>

        {/* Active reply composer (writer only) */}
        {replyTarget && (
          <Composer
            mode={{ kind: "reply", threadId: thread.id, parentPostId: replyTarget.parentPostId, pubmedId: anchor.pubmed_id, journalAbbrev: anchor.journal_abbrev, replyingTo: replyTarget.replyingTo }}
            onClose={() => setReplyTarget(null)}
            onPosted={() => { setReplyTarget(null); reload(); }}
          />
        )}

        {/* ── What flagging offers — rendered, inert (the five reasons) ── */}
        <div style={{ padding: 18, background: GROUND.BASE, border: `1px solid ${LINE.HAIR}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ ...mono(9.5, INK.MUTE), letterSpacing: "0.14em" }}>FLAG THIS REPLY</span>
          <span style={{ fontSize: 12, lineHeight: 1.6, color: INK.MUTE }}>
            Flags are reviewed by FieldMark medical-affairs moderators, not by other MSLs. Your
            identity is not shown to the author.
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {FLAG_REASONS.map((r) => (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: 9, opacity: 0.5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, border: `1px solid ${INK.MUTE}`, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: INK.LABEL }}>{r}</span>
              </div>
            ))}
          </div>
          <span style={mono(9.5, INK.LABEL)}>Target first action within 4h — you will be told the outcome</span>
        </div>
      </div>
    </AppLayout>
  );
}
