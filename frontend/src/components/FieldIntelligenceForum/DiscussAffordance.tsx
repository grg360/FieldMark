// Discuss affordance (Design frame 1 / pattern 06). A block on a publication card
// with two states:
//  - No discussion: dashed, unfilled, the word "Discuss" plus the invitation.
//    (A bare icon does not invite; the empty state needs the word.)
//  - Existing discussion: filled indigo, glyph + reply count + recency.
// The "your question becomes the thread's anchor" microcopy lives in the composer,
// not on every card. Compliance state is never shown here. Appears on the year
// bibliography, co-authored and institution partner publications; not on congress
// abstracts. For the founder, the empty state opens a composer (creates the thread);
// for everyone else it is inert.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FONT, GOLD, COOL, LINE } from "../../lib/designTokens";
import type { DiscussAffordance as Affordance } from "../../lib/fieldIntelligence";
import { invalidateAffordance, useDiscussAffordance } from "./useDiscussAffordance";
import { useForumWriter } from "./useForumWriter";
import Composer from "./Composer";

const mono = (size: number, color: string) => ({
  fontFamily: FONT.mono,
  fontSize: size,
  color,
  letterSpacing: "0.04em" as const,
});

function SpeechGlyph({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M1 2.5h10v6H4.5L2 10.5V8.5H1z" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

export default function DiscussAffordance({
  pmid,
  journalAbbrev,
  title,
  compact = false,
  affordance: provided,
  existingOnly = false,
}: {
  pmid: string | null | undefined;
  journalAbbrev?: string | null;
  title?: string | null;
  compact?: boolean;
  // When the list has already batch-loaded affordances, pass the value (or null)
  // to skip the per-card fetch. `undefined` means "not provided — fetch it".
  affordance?: Affordance | null;
  // Show ONLY where a thread already exists — render nothing on a threadless row (no
  // "ask the first question"). For surfaces that display discussion but don't create
  // it: thread creation belongs on the bibliography/forum path, not on every list row.
  existingOnly?: boolean;
}) {
  const navigate = useNavigate();
  const canWrite = useForumWriter();
  const hookValue = useDiscussAffordance(provided === undefined ? pmid : null);
  const affordance = provided === undefined ? hookValue : provided;
  const [composing, setComposing] = useState(false);

  if (affordance === undefined) {
    return <div style={compact ? { minWidth: 150 } : { minHeight: 92, marginTop: 10 }} />;
  }

  const composer = composing && pmid ? (
    <Composer
      mode={{ kind: "thread", pubmedId: pmid, journalAbbrev: journalAbbrev ?? "", title: title ?? "" }}
      onClose={() => setComposing(false)}
      onPosted={(r) => {
        setComposing(false);
        invalidateAffordance(pmid);
        if (r.thread_id) navigate(`/field-intelligence/thread/${r.thread_id}`);
      }}
    />
  ) : null;

  // ── COMPACT (bibliography rows) ──
  if (compact) {
    if (affordance) {
      const target = affordance.primary_thread_id ? `/field-intelligence/thread/${affordance.primary_thread_id}` : "/field-intelligence";
      return (
        <button
          type="button"
          onClick={() => navigate(target)}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", background: "transparent", border: `1px solid ${GOLD.dim}`, borderRadius: 0, cursor: "pointer", ...mono(10.5, GOLD.gold), whiteSpace: "nowrap" }}
        >
          <SpeechGlyph color={GOLD.gold} />
          {affordance.reply_count} {affordance.reply_count === 1 ? "reply" : "replies"}
          {affordance.recency_label ? ` · ${affordance.recency_label}` : ""}
        </button>
      );
    }
    // existingOnly surfaces render nothing on a threadless row — no create affordance.
    if (existingOnly) return null;
    // no discussion — dashed, the word + short invitation
    const empty = (
      <span
        onClick={canWrite && pmid ? () => setComposing(true) : undefined}
        aria-disabled={canWrite ? undefined : "true"}
        role="button"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", border: `1px dashed ${LINE.l1}`, borderRadius: 4, ...mono(10.5, canWrite ? GOLD.gold : COOL.chrome), whiteSpace: "nowrap", cursor: canWrite ? "pointer" : "not-allowed", opacity: canWrite ? 1 : 0.7 }}
      >
        <SpeechGlyph color={canWrite ? GOLD.gold : COOL.label} />
        Discuss <span style={{ color: COOL.label }}>· starts a public thread visible to verified MSLs</span>
      </span>
    );
    return (<>{empty}{composer}</>);
  }

  // ── FULL (isolated / other callers) ──
  if (affordance) {
    const target = affordance.primary_thread_id ? `/field-intelligence/thread/${affordance.primary_thread_id}` : "/field-intelligence";
    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, padding: 12, background: "transparent", border: `1px solid ${LINE.l1}`, borderRadius: 0 }}>
        <span style={{ ...mono(9, GOLD.gold), letterSpacing: "0.14em", fontWeight: 600 }}>FIELD INTELLIGENCE</span>
        <button type="button" onClick={() => navigate(target)} style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: FONT.serif, fontSize: 14.5, lineHeight: 1.4, color: COOL.ui }}>
          {affordance.reply_count} {affordance.reply_count === 1 ? "reply" : "replies"}{affordance.thread_count > 1 ? ` across ${affordance.thread_count} threads` : ""}
        </button>
        {affordance.recency_label && <span style={mono(9.5, COOL.chrome)}>last reply {affordance.recency_label}</span>}
        <button type="button" onClick={() => navigate(target)} style={{ ...mono(10, GOLD.gold), letterSpacing: "0.08em", background: "transparent", border: `1px solid ${GOLD.dim}`, borderRadius: 0, padding: "6px 10px", cursor: "pointer", textAlign: "left" }}>OPEN DISCUSSION →</button>
      </div>
    );
  }
  if (existingOnly) return null;
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, padding: 12, border: `1px dashed ${LINE.l1}`, borderRadius: 4 }}>
      <span style={{ ...mono(9, COOL.label), letterSpacing: "0.14em" }}>FIELD INTELLIGENCE</span>
      <span style={{ fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.45, color: COOL.muted }}>No discussion yet. Your question opens a public thread on this paper, visible to other verified MSLs.</span>
      {canWrite && pmid ? (
        <button type="button" onClick={() => setComposing(true)} style={{ ...mono(10, GOLD.gold), letterSpacing: "0.08em", background: "transparent", border: `1px solid ${GOLD.dim}`, borderRadius: 0, padding: "6px 10px", cursor: "pointer", textAlign: "left" }}>DISCUSS THIS PAPER</button>
      ) : (
        <span aria-disabled="true" role="button" style={{ ...mono(10, COOL.chrome), letterSpacing: "0.08em", border: `1px solid ${LINE.l1}`, borderRadius: 3, padding: "6px 10px", opacity: 0.45, cursor: "not-allowed", userSelect: "none" }}>DISCUSS THIS PAPER</span>
      )}
      {composer}
    </div>
  );
}
