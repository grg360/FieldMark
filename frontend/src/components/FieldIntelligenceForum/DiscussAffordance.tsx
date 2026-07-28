// Discuss affordance (Design frame 1 / pattern 06). A fixed block on a publication
// card, two states:
//  - No discussion: dashed border, no fill, "Ask the first question", inert
//    DISCUSS THIS PAPER (there is no composer on the forum surface — a thread can
//    only originate here, which is what makes the anchor structural). No zero count.
//  - Existing discussion: filled indigo, reply count + recency, OPEN DISCUSSION →.
// Compliance state is never shown on this block. Appears on the year bibliography,
// co-authored publications and institution partner publications; NOT on congress
// abstracts (Design flagged that as an open question).

import { useNavigate } from "react-router-dom";
import { COLOR, FONT } from "../../lib/designTokens";
import { useDiscussAffordance } from "./useDiscussAffordance";

const mono = (size: number, color: string) => ({
  fontFamily: FONT.mono,
  fontSize: size,
  color,
  letterSpacing: "0.04em" as const,
});

export default function DiscussAffordance({ pmid }: { pmid: string | null | undefined }) {
  const navigate = useNavigate();
  const affordance = useDiscussAffordance(pmid);

  // While loading, reserve the slot silently to avoid layout jump.
  if (affordance === undefined) {
    return <div style={{ minHeight: 92, marginTop: 10 }} />;
  }

  // ── Existing discussion ── filled indigo, activity first.
  if (affordance) {
    const replies = affordance.reply_count;
    const target = affordance.primary_thread_id
      ? `/field-intelligence/thread/${affordance.primary_thread_id}`
      : "/field-intelligence";
    return (
      <div
        style={{
          marginTop: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: 12,
          background: "rgba(85,102,232,0.05)",
          border: "1px solid rgba(85,102,232,0.22)",
          borderRadius: 4,
        }}
      >
        <span style={{ ...mono(9, COLOR.indigoLink), letterSpacing: "0.14em" }}>FIELD INTELLIGENCE</span>
        <button
          type="button"
          onClick={() => navigate(target)}
          style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: FONT.serif, fontSize: 14.5, lineHeight: 1.4, color: COLOR.ink1 }}
        >
          {replies} {replies === 1 ? "reply" : "replies"}
          {affordance.thread_count > 1 ? ` across ${affordance.thread_count} threads` : ""}
        </button>
        {affordance.recency_label && (
          <span style={{ ...mono(9.5, COLOR.ink4) }}>last reply {affordance.recency_label}</span>
        )}
        <button
          type="button"
          onClick={() => navigate(target)}
          style={{ ...mono(10, COLOR.indigoLink), letterSpacing: "0.08em", background: "rgba(85,102,232,0.08)", border: "1px solid rgba(85,102,232,0.3)", borderRadius: 3, padding: "6px 10px", cursor: "pointer", textAlign: "left" }}
        >
          OPEN DISCUSSION →
        </button>
      </div>
    );
  }

  // ── No discussion ── dashed, empty slot, inert invitation. No zero count.
  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 12,
        border: `1px dashed ${COLOR.hairStrong}`,
        borderRadius: 4,
      }}
    >
      <span style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.14em" }}>FIELD INTELLIGENCE</span>
      <span style={{ fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.45, color: COLOR.ink3 }}>
        No discussion yet. Ask the first question.
      </span>
      {/* Inert: rendered disabled, no composer opens. */}
      <span
        aria-disabled="true"
        role="button"
        style={{ ...mono(10, COLOR.ink4), letterSpacing: "0.08em", border: `1px solid ${COLOR.hairStrong}`, borderRadius: 3, padding: "6px 10px", opacity: 0.45, cursor: "not-allowed", userSelect: "none" }}
      >
        DISCUSS THIS PAPER
      </span>
      <span style={{ ...mono(9, COLOR.ink5), lineHeight: 1.5 }}>Your question becomes the thread&rsquo;s anchor</span>
    </div>
  );
}
