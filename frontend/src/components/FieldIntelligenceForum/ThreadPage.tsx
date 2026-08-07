// Field Intelligence Forum — thread view (Design frame 3). The core surface:
// the publication anchor with its scope statement, the anchored question, and the
// reply tree carrying all four compliance states. Removal is a placeholder that
// keeps its slot (never a delete); the removed body is reviewer/author-only.
// Every write affordance (Reply, Flag, the composer) renders and is inert.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppLayout from "../AppLayout";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { COLOR, FONT } from "../../lib/designTokens";
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
  const accent = isPeer ? COLOR.amber : COLOR.indigoLink;
  const tint = isPeer ? "rgba(232,160,32,0.05)" : "rgba(85,102,232,0.05)";
  const border = isPeer ? "rgba(232,160,32,0.2)" : "rgba(85,102,232,0.2)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: tint, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...mono(9, accent), letterSpacing: "0.12em", fontWeight: 600 }}>
          {isPeer ? "PEER FLAG" : "AUTO-SIGNAL"}
        </span>
        <span style={{ ...mono(9, accent), letterSpacing: "0.08em" }}>· {note.label}</span>
      </div>
      <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COLOR.ink3 }}>{note.body_text}</span>
      <span style={mono(9.5, COLOR.ink5)}>{note.disposition_text}</span>
      <DisabledControl variant="ghost">View in moderation queue →</DisabledControl>
    </div>
  );
}

// Removal placeholder (pattern 04). Keeps position + depth; states clause, timing,
// notification, appeal window. Removed text is reviewer/author-only, behind a reveal.
function RemovedPlaceholder({ post, record }: { post: ForumPost; record?: ModerationRecord }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", background: "rgba(232,112,78,0.05)", border: "1px solid rgba(232,112,78,0.24)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...mono(9.5, COLOR.danger), letterSpacing: "0.12em", fontWeight: 600 }}>REMOVED BY MODERATION</span>
        <span style={mono(10.5, COLOR.ink4)}>{post.author_handle} · posted {post.recency_label}</span>
        <ProvenanceChip seed={post.is_seed} />
      </div>
      <span style={{ fontSize: 13, lineHeight: 1.6, color: COLOR.ink2 }}>
        {record?.clause_text ??
          "Removed under Scope 3.2 — clinical recommendation. The reply advised a treatment sequence and described directing prescriber behavior, neither of which is a discussion of what the anchored publication reports."}
      </span>
      <span style={mono(9.5, COLOR.ink5)}>
        {record?.notification_state ?? "Author notified with the clause cited"}
        {record?.appeal_window_days != null ? ` · appeal window ${record.appeal_window_days} days` : ""}
        {record?.account_history ? ` · ${record.account_history}` : ""}
      </span>
      <span style={mono(9.5, COLOR.ink5)}>Reply chain below this post preserved — thread not locked</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          style={{ ...mono(9.5, COLOR.danger), letterSpacing: "0.1em", background: "none", border: `1px solid rgba(232,112,78,0.3)`, padding: "4px 9px", cursor: "pointer" }}
        >
          {revealed ? "HIDE REMOVED TEXT" : "REVEAL REMOVED TEXT · REVIEWERS + AUTHOR ONLY"}
        </button>
        <DisabledControl variant="ghost">Open moderation record →</DisabledControl>
      </div>
      {revealed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: COLOR.surfaceWell, border: `1px dashed rgba(232,112,78,0.3)` }}>
          <span style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.12em" }}>REMOVED TEXT · VISIBLE TO REVIEWERS AND THE AUTHOR ONLY</span>
          <span style={{ fontFamily: FONT.serif, fontSize: 14.5, lineHeight: 1.65, color: COLOR.ink3 }}>{post.removed_body}</span>
          {post.removed_detected_phrases && post.removed_detected_phrases.length > 0 && (
            <span style={mono(9.5, COLOR.ink5)}>
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
      <span style={mono(12, COLOR.ink1)}>{post.author_handle}</span>
      <VerifiedBadge small />
      <span style={mono(10, COLOR.ink5)}>{post.recency_label}</span>
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
        <button type="button" onClick={() => onReply(post)} style={{ ...mono(10.5, COLOR.indigoLink), letterSpacing: "0.08em", background: "none", border: `1px solid rgba(85,102,232,0.3)`, borderRadius: 4, padding: "8px 12px", cursor: "pointer", ...touch }}>Reply</button>
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
      <p style={{ margin: 0, fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.7, color: COLOR.ink2, maxWidth: "72ch" }}>
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
        <div style={{ paddingTop: 24, ...mono(11, COLOR.ink5) }}>Loading…</div>
      </AppLayout>
    );
  }
  if (!detail) {
    return (
      <AppLayout width="reading">
        <div style={{ paddingTop: 24, fontFamily: FONT.sans, color: COLOR.ink2 }}>
          <div style={{ ...mono(10.5, COLOR.ink4), letterSpacing: "0.14em", marginBottom: 8 }}>THREAD NOT FOUND</div>
          <Link to="/field-intelligence" style={{ color: COLOR.indigoLink }}>← All threads</Link>
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
      ? { marginLeft: 34, borderLeft: `1px solid ${COLOR.hair}`, paddingLeft: 20 }
      : undefined;
    return (
      <div key={post.id} style={indentStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "18px 0", borderBottom: `1px solid ${COLOR.hair}` }}>
          {nested && flat && post.compliance_state !== "removed" && parentHandle && (
            <span style={mono(9.5, COLOR.ink5)}>replying to {parentHandle}</span>
          )}
          <PostBody post={post} record={recordByPost.get(post.id)} isMobile={isMobile} onReply={onReply} />
        </div>
        {visibleKids.map((k) => renderPost(k, true, post.author_handle))}
        {hiddenRemoved.length > 0 && (
          <div style={flat ? undefined : { marginLeft: 34, paddingLeft: 20, borderLeft: `1px solid ${COLOR.hair}` }}>
            <div style={{ ...mono(10, COLOR.ink5), padding: "12px 0", fontStyle: "italic" }}>
              {hiddenRemoved.length} {hiddenRemoved.length === 1 ? "reply" : "replies"} removed by moderation — no placeholder shown to peers
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout width="reading">
      <div style={{ fontFamily: FONT.sans, color: COLOR.ink1, paddingTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>
        <PrototypeStrip />
        <Link to="/field-intelligence" style={{ ...mono(10.5, COLOR.ink3), letterSpacing: "0.1em" }}>← ALL THREADS</Link>

        {/* ── Publication anchor (pattern 01): indigo 2px left rule ── */}
        {/* On mobile the anchor stays on screen: a sticky two-line card at the top
            of the thread — the paper is the only thing that never scrolls away. */}
        <div style={{ padding: isMobile ? "12px 14px" : 20, background: COLOR.surfaceCard, border: `1px solid ${COLOR.hairStrong}`, borderLeft: `2px solid ${COLOR.indigo}`, display: "flex", flexDirection: "column", gap: isMobile ? 8 : 12, ...(isMobile ? { position: "sticky" as const, top: 0, zIndex: 10 } : {}) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...mono(9.5, COLOR.indigoLink), letterSpacing: "0.14em", background: "rgba(85,102,232,0.1)", border: "1px solid rgba(85,102,232,0.3)", padding: "3px 7px" }}>PUBLICATION ANCHOR</span>
            <span style={mono(11, COLOR.ink3)}>PMID {anchor.pubmed_id}</span>
            <span style={mono(11, COLOR.ink3)}>{anchor.journal_abbrev} · {anchor.publication?.pub_year ?? "—"}</span>
            <span style={mono(11, COLOR.ink5)}>{(anchor.publication?.citation_count ?? 0)} citations</span>
          </div>
          <h2 style={{ margin: 0, fontFamily: FONT.serif, fontSize: 22, fontWeight: 500, lineHeight: 1.35, color: COLOR.ink1 }}>
            {anchor.publication?.title ?? "—"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <a href={`https://pubmed.ncbi.nlm.nih.gov/${anchor.pubmed_id}/`} target="_blank" rel="noreferrer" style={{ ...mono(11, COLOR.indigoLink) }}>Open in PubMed ↗</a>
            <span style={mono(11, COLOR.ink5)}>Author list not reproduced in-product</span>
          </div>
          {/* On mobile the scope collapses to a tap-to-read line to keep the anchor
              to two lines; on desktop the full scope statement renders. */}
          {isMobile ? (
            <span style={mono(9.5, COLOR.indigoLink)}>Scope: results as published · tap to read the paper</span>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 13px", background: "rgba(85,102,232,0.05)", border: "1px solid rgba(85,102,232,0.16)" }}>
              <span style={{ ...mono(9.5, COLOR.indigoLink), letterSpacing: "0.12em", flexShrink: 0, paddingTop: 2 }}>SCOPE</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COLOR.ink3 }}>
                On topic: {anchor.scope_on_topic}. Off topic: {anchor.scope_off_topic}.
              </span>
            </div>
          )}
        </div>

        {/* ── The anchored question ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <HandleAvatar handle={thread.author_handle} />
            <span style={mono(12.5, COLOR.ink1)}>{thread.author_handle}</span>
            <VerifiedBadge />
            <span style={mono(10.5, COLOR.ink5)}>{thread.recency_label}</span>
            <ProvenanceChip seed={thread.is_seed} />
          </div>
          <h1 style={{ margin: 0, fontFamily: FONT.serif, fontSize: 27, fontWeight: 400, lineHeight: 1.35, color: COLOR.ink1 }}>
            {thread.question_title}
          </h1>
          {thread.question_body && (
            <p style={{ margin: 0, fontFamily: FONT.serif, fontSize: 15.5, lineHeight: 1.7, color: COLOR.ink2, maxWidth: "70ch" }}>
              {thread.question_body}
            </p>
          )}
          <div style={{ display: "flex", gap: 14, alignItems: "center", ...mono(10.5, COLOR.ink5), flexWrap: "wrap" }}>
            <span>{thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}</span><span>·</span>
            <span>{thread.participant_count} participants</span>
            {thread.scope_label && (<><span>·</span><span>{thread.scope_label}</span></>)}
          </div>
        </div>

        <div style={{ height: 1, background: COLOR.hairStrong, margin: "8px 0 0" }} />

        {/* ── Reply tree ── */}
        <div>{roots.map((p) => renderPost(p, false))}</div>

        {/* ── Reply composer — rendered, inert ── */}
        <div style={{ marginTop: 16, padding: 18, background: COLOR.surfaceCard, border: `1px solid ${COLOR.hairStrong}`, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Anchor reappears as a pill above the composer (mobile treatment; shown
              on all widths — the composer never lets you forget the anchor). */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...mono(9, COLOR.indigoLink), letterSpacing: "0.12em", background: "rgba(85,102,232,0.1)", border: "1px solid rgba(85,102,232,0.3)", padding: "2px 7px" }}>ANCHOR PMID {anchor.pubmed_id}</span>
            <span style={{ ...mono(9.5, COLOR.amber), letterSpacing: "0.14em" }}>REPLYING WITHIN ANCHOR</span>
            <span style={mono(10, COLOR.ink5)}>locked to this thread</span>
          </div>
          <div style={{ padding: 14, background: COLOR.surfaceWell, border: `1px solid ${COLOR.hair}`, ...serif(15, COLOR.ink5) }}>
            Respond to what the paper reports…
          </div>
          <span style={{ fontSize: 12, lineHeight: 1.6, color: COLOR.ink4 }}>
            Checked for recommendation language, off-label content and HCP names before posting.
            Flagged drafts come back to you unpublished.
          </span>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <DisabledControl variant="ghost">SAVE DRAFT</DisabledControl>
            {isWriter ? (
              <button
                type="button"
                onClick={() => setReplyTarget({ parentPostId: null })}
                style={{ ...mono(10.5, "#0a0a0a"), letterSpacing: "0.08em", background: COLOR.amber, border: "1px solid rgba(232,160,32,0.5)", borderRadius: 4, padding: "8px 14px", cursor: "pointer" }}
              >
                CHECK &amp; POST
              </button>
            ) : (
              <DisabledControl variant="solid-amber">CHECK &amp; POST</DisabledControl>
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
        <div style={{ padding: 18, background: COLOR.surfaceWell, border: `1px solid ${COLOR.hair}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ ...mono(9.5, COLOR.ink4), letterSpacing: "0.14em" }}>FLAG THIS REPLY</span>
          <span style={{ fontSize: 12, lineHeight: 1.6, color: COLOR.ink4 }}>
            Flags are reviewed by FieldMark medical-affairs moderators, not by other MSLs. Your
            identity is not shown to the author.
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {FLAG_REASONS.map((r) => (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: 9, opacity: 0.5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, border: `1px solid ${COLOR.ink4}`, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: COLOR.ink3 }}>{r}</span>
              </div>
            ))}
          </div>
          <span style={mono(9.5, COLOR.ink5)}>Target first action within 4h — you will be told the outcome</span>
        </div>
      </div>
    </AppLayout>
  );
}
