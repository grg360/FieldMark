// Open-trials pop-up — off the teal OPEN TRIAL badge on both ledgers.
// Layout authority: Open Trials Popup.dc.html (project e672bf7a, 2026-08-08),
// mapped onto the ledger register (charcoal GROUND, mono/serif tokens, the
// decided teal #3FB8AF — not the frame's #4fbfae).
//
// RULES (frame + review, binding):
//  - OPEN-GATED: the same status gate as the badge (lib/openTrials.ts); the
//    footer states it. The pop-up can never list what the badge didn't count.
//  - Two-line trial row: NCT link + status / serif title; dim mono meta
//    (phase · role · sponsor · conditions · dates · type).
//  - Role inline; the site-lead disclosure appears ONCE, in the footer.
//  - phase null → "Phase not recorded", never blank. Enrollment never
//    rendered — the field does not exist in the corpus.
//  - Tail: up to 6 unscrolled; beyond that an explicit "SHOW ALL N" that
//    expands into a scroll region — never a default scroll. The header
//    carries the true count so 6-of-34 never reads as complete.
//  - Single-trial case (43% of badged HCPs): header says "1 TRIAL", the row
//    stands alone — a complete statement, not a truncated list.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FONT, GROUND, LINE, COOL } from "../../lib/designTokens";
import { getOpenTrialsDetail, roleLabel, type OpenTrialDetail } from "../../lib/openTrials";

const TEAL = "#3FB8AF";
const TEAL_DIM = "rgba(63,184,175,0.45)";

const mono = (s: number, c: string, ls = "0.12em") => ({ fontFamily: FONT.mono, fontSize: s, letterSpacing: ls, color: c });

function fmtMonth(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", { month: "short", year: "numeric" });
}

// Registry phase enums → prose, including combined values ("PHASE1; PHASE2"
// → "Phase 1; Phase 2", "EARLY_PHASE1" → "Early Phase 1", "NA" → not applicable).
function fmtPhase(phase: string | null): string {
  if (!phase) return "Phase not recorded";
  if (phase === "NA") return "Phase not applicable";
  return phase
    .replace(/EARLY_PHASE(\d)/g, "Early Phase $1")
    .replace(/PHASE(\d)/g, "Phase $1")
    .replace(/_/g, " ");
}

function metaLine(t: OpenTrialDetail): string {
  const start = fmtMonth(t.startDate);
  const end = fmtMonth(t.completionDate);
  const dates = start && end ? `${start} → ${end}` : start ? `${start} →` : "dates not recorded";
  return [
    fmtPhase(t.phase),
    roleLabel(t.role) || "role not recorded",
    t.sponsor ? `${t.sponsor}${t.sponsorClass ? ` (${t.sponsorClass.toLowerCase()})` : ""}` : "sponsor not recorded",
    t.conditions.length ? t.conditions.join(" · ") : "conditions not recorded",
    `${dates}${t.studyType ? ` · ${t.studyType}` : ""}`,
  ].join("  ·  ");
}

export default function TrialsPopup({ hcpId, hcpName, badgeRef, onClose }: { hcpId: string; hcpName: string; badgeRef: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const [trials, setTrials] = useState<OpenTrialDetail[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  // PORTALED to document.body (2026-08-09): the virtualized tail rows are
  // position:absolute + transform — each row is its own stacking context, so
  // an in-row popup paints UNDER every later row regardless of z-index. The
  // portal escapes the row; position computed from the badge's page rect.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const b = badgeRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.min(640, window.innerWidth * 0.88);
    setPos({
      top: b.bottom + window.scrollY + 8,
      left: Math.max(8, Math.min(b.left + window.scrollX, window.innerWidth + window.scrollX - width - 12)),
    });
  }, [badgeRef]);

  useEffect(() => {
    let alive = true;
    void getOpenTrialsDetail(hcpId).then((t) => { if (alive) setTrials(t); });
    return () => { alive = false; };
  }, [hcpId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      // the badge is excluded so a badge click toggles instead of close+reopen
      if (ref.current?.contains(t) || badgeRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose, badgeRef]);

  // Collapsed default (revision 2026-08-09): the MOST RECENT trial alone, with
  // MORE extending the pop-up down through the rest. The header always states
  // the true count, so 1-of-7 never reads as complete. A single-trial pop-up
  // renders no link — a complete statement. Past ~6 rows the expansion scrolls.
  const n = trials?.length ?? 0;
  const shown = trials ? (n > 1 && !expanded ? trials.slice(0, 1) : trials) : [];

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", top: pos.top, left: pos.left, zIndex: 1000,
        width: "min(640px, 88vw)", background: GROUND.g1,
        border: `1px solid ${TEAL_DIM}`, boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
        cursor: "default", textAlign: "left",
      }}
    >
      {/* header — true count always stated */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: `1px solid ${LINE.l1}`, background: "rgba(63,184,175,0.05)" }}>
        <div style={{ ...mono(10, TEAL, "0.14em") }}>OPEN TRIALS · {hcpName.toUpperCase()}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ ...mono(10, COOL.label, "0.12em") }}>
            {trials == null ? "LOADING…" : n === 1 ? "1 TRIAL" : `${n} TRIALS`}
          </div>
          <span onClick={onClose} style={{ ...mono(11, COOL.label, "0.06em"), cursor: "pointer" }}>ESC</span>
        </div>
      </div>

      {/* rows — scroll only after an explicit expand, and only past ~6 rows */}
      <div style={expanded && n > 6 ? { maxHeight: 430, overflowY: "auto" } : undefined}>
        {trials != null && n === 0 ? (
          <div style={{ padding: "16px", fontFamily: FONT.serif, fontSize: 14, color: COOL.muted, fontStyle: "italic", lineHeight: 1.6 }}>
            No open-status trials — the badge and this list share one gate, so this state indicates the trials
            closed since the badge was computed.
          </div>
        ) : null}
        {shown.map((t) => (
          <div key={t.trialId} style={{ padding: "14px 16px", borderBottom: `1px solid ${LINE.l0}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
              <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer" style={{ ...mono(12, TEAL, "0.06em"), textDecoration: "none", borderBottom: `1px solid ${TEAL_DIM}` }}>
                {t.nctId}
              </a>
              <span style={{ ...mono(9.5, COOL.label, "0.12em"), whiteSpace: "nowrap" }}>{t.status.replace(/_/g, " ")}</span>
            </div>
            <div style={{ fontFamily: FONT.serif, fontSize: 15, color: COOL.ui, marginTop: 6, lineHeight: 1.35, textWrap: "pretty" as const }}>{t.title}</div>
            <div style={{ ...mono(10, COOL.label, "0.06em"), marginTop: 7, lineHeight: 1.6 }}>{metaLine(t)}</div>
          </div>
        ))}
      </div>

      {n > 1 && !expanded ? (
        <div onClick={() => setExpanded(true)} style={{ padding: "11px 16px", borderBottom: `1px solid ${LINE.l0}`, cursor: "pointer", ...mono(10, TEAL, "0.14em") }}>
          MORE · {n - 1} OTHER OPEN TRIAL{n - 1 === 1 ? "" : "S"} ↓
        </div>
      ) : null}

      {/* footer — the ONE site-lead disclosure + the gate statement */}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${LINE.l1}`, ...mono(9.5, COOL.faint, "0.06em"), lineHeight: 1.6 }}>
        Roles as recorded on ClinicalTrials.gov — the registry labels every site lead PI. Open-status trials
        only; closed and completed studies are not listed.
      </div>
    </div>,
    document.body,
  );
}
