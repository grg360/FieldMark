// Field Intelligence Forum composer — active only for the founder (writer gate).
// Used to open a thread from a publication card and to reply within a thread.
// The anchor is locked (set from the card/thread, never chosen here). On submit
// the server runs the content check; a flagged draft comes back unpublished with
// the reason, and stays in the box so it can be edited. Content authored here is
// REAL (is_seed=false, simulated=false) and renders with the LIVE provenance chip;
// only the pre-existing seed corpus carries the SEEDED marker.

import { useState } from "react";
import { COLOR, FONT, GROUND, LINE, GOLD, COOL } from "../../lib/designTokens";
import { createReply, createThread, FORUM_WRITE_HANDLE, type WriteResult } from "../../lib/fieldIntelligence";
import { mono, ProvenanceChip } from "./fiUi";

type Mode =
  | { kind: "thread"; pubmedId: string; journalAbbrev: string; title: string }
  | { kind: "reply"; threadId: string; parentPostId: string | null; pubmedId: string; journalAbbrev: string; replyingTo?: string };

export default function Composer({
  mode,
  onClose,
  onPosted,
}: {
  mode: Mode;
  onClose: () => void;
  onPosted: (result: WriteResult) => void;
}) {
  const isThread = mode.kind === "thread";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setReason(null);
    const result = isThread
      ? await createThread(mode.pubmedId, title, body)
      : await createReply(mode.threadId, mode.parentPostId, body);
    setBusy(false);
    if (result.ok) {
      onPosted(result);
    } else {
      // Draft returned, unpublished — show the reason and keep the text.
      setReason(result.reason ?? "Draft returned.");
    }
  }

  const canSubmit = !busy && (isThread ? title.trim().length > 0 : body.trim().length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(6,6,7,0.74)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 24 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 620, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", background: GROUND.g2, border: `1px solid ${LINE.l1}`, display: "flex", flexDirection: "column", gap: 16, padding: 24, fontFamily: FONT.sans }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ ...mono(10.5, GOLD.gold), letterSpacing: "0.16em", fontWeight: 600 }}>
            {isThread ? "ASK THE FIRST QUESTION" : "REPLY WITHIN ANCHOR"}
          </span>
          <button type="button" onClick={onClose} style={{ ...mono(11, COOL.muted), background: "none", border: "none", cursor: "pointer" }}>Close</button>
        </div>

        {/* Anchor — locked, set from the card/thread */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", background: GROUND.g1, border: `1px solid ${LINE.l0}`, borderLeft: `2px solid ${GOLD.gold}` }}>
          <span style={{ ...mono(9, GOLD.gold), letterSpacing: "0.12em", background: "transparent", border: `1px solid ${GOLD.dim}`, padding: "2px 6px", fontWeight: 600 }}>
            {isThread ? "ANCHOR SET FROM THIS CARD" : "ANCHOR"}
          </span>
          <span style={mono(10.5, COOL.muted)}>PMID {mode.pubmedId} · {mode.journalAbbrev}</span>
          <span style={mono(10, COOL.label)}>locked</span>
        </div>
        {isThread && mode.title && (
          <span style={{ fontFamily: FONT.serif, fontSize: 14.5, lineHeight: 1.4, color: COOL.prose }}>{mode.title}</span>
        )}
        {isThread && (
          <span style={{ ...mono(9.5, COOL.label), lineHeight: 1.5 }}>Your question becomes the thread&rsquo;s anchor.</span>
        )}
        {!isThread && mode.replyingTo && (
          <span style={mono(9.5, COOL.label)}>replying to {mode.replyingTo}</span>
        )}

        {isThread && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ ...mono(9, COOL.label), letterSpacing: "0.14em" }}>YOUR QUESTION</span>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What did you take from the paper that you want to put to the field?"
              rows={2}
              style={{ resize: "vertical", padding: 12, background: GROUND.g1, border: `1px solid ${LINE.l1}`, color: COOL.ui, fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.5 }}
            />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...mono(9, COOL.label), letterSpacing: "0.14em" }}>{isThread ? "CONTEXT (OPTIONAL)" : "YOUR REPLY"}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Respond to what the paper reports…"
            rows={isThread ? 3 : 5}
            style={{ resize: "vertical", padding: 12, background: GROUND.g1, border: `1px solid ${LINE.l1}`, color: COOL.ui, fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6 }}
          />
        </div>

        {/* Constraint copy — the check is real */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 13px", background: "rgba(85,102,232,0.05)", border: "1px solid rgba(85,102,232,0.16)" }}>
          <span style={{ ...mono(9, GOLD.gold), letterSpacing: "0.12em", flexShrink: 0, paddingTop: 2, fontWeight: 600 }}>CHECK</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COOL.muted }}>
            Checked for recommendation language, off-label content and HCP names before posting.
            Flagged drafts come back to you unpublished.
          </span>
        </div>

        {/* Returned-draft reason */}
        {reason && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.35)" }}>
            <span style={{ ...mono(9, COLOR.amber), letterSpacing: "0.12em", fontWeight: 600 }}>DRAFT RETURNED · NOT PUBLISHED</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COOL.prose }}>{reason}</span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, ...mono(10, COOL.label) }}>
            Posting as {FORUM_WRITE_HANDLE} · MSL Verified · anonymous to peers <ProvenanceChip seed={false} />
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ ...mono(10.5, COOL.muted), background: "none", border: `1px solid ${LINE.l1}`, borderRadius: 4, padding: "8px 14px", cursor: "pointer" }}>Cancel</button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              style={{ ...mono(10.5, canSubmit ? GOLD.gold : COOL.faint), letterSpacing: "0.12em", background: "transparent", border: `1px solid ${canSubmit ? GOLD.dim : LINE.l2}`, borderRadius: 0, padding: "8px 14px", cursor: canSubmit ? "pointer" : "not-allowed", fontWeight: 600 }}
            >
              {busy ? "CHECKING…" : isThread ? "CHECK & OPEN THREAD" : "CHECK & POST"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
