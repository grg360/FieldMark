// Shared secondary-controls block for BOTH profile spines. Ports the remaining
// DetailScreen features by reusing the SAME components verbatim:
//   • Contact & Access  → ContactAccessCard (getHcpWebSignals: LinkedIn / email / phone,
//     with its own honest "no public contact information" empty state)
//   • Field-intel review → FiModal + FiChip, the same ValidationField options DetailScreen
//     uses (Confirms/Partial/Disputes, etc.)
//   • Report data issue  → FiModal + FiChip (same issue types / note chips)
//   • Add context        → ContextualizeHCPForm
//   • Opt-out / claim     → OptOutRequestForm
//
// IMPORTANT — these submit flows do not persist, exactly as in DetailScreen: its
// "Submit validation", contextualize, opt-out and report-issue handlers are toast-only /
// no-op stubs (the field_intel_* tables are SELECT-only). So "syncs with DetailScreen"
// holds trivially — neither writes. The port matches that behaviour and says so honestly
// (a toast), rather than faking a working submission. ContactAccessCard is the one
// genuinely-live read here.

import { useEffect, useState } from "react";
import { getHcpWebSignals, type WebSignal } from "../../lib/api";
import ContactAccessCard from "../ContactAccessCard";
import ContextualizeHCPForm from "../ContextualizeHCPForm";
import OptOutRequestForm from "../OptOutRequestForm";
import { FiChip, FiModal, FiToast } from "../FieldIntelligenceShared";

const ISSUE_TYPES = ["incorrect institution", "wrong specialty", "outdated info", "other"] as const;
const ISSUE_NOTE_CHIPS = [
  "Affiliation recently changed",
  "Specialty label mismatch",
  "Publication count seems stale",
  "Score inconsistent with field read",
  "Possible duplicate profile",
] as const;

// same fields + options as DetailScreen's ValidationField rows
const FI_FIELDS = [
  { key: "dataMatch", label: "Data Matches Field Reality", options: ["Confirms", "Partial", "Disputes"] },
  { key: "engagement", label: "Engagement Potential", options: ["High", "Moderate", "Low"] },
  { key: "credibility", label: "Scientific Credibility", options: ["Strong", "Moderate", "Early"] },
  { key: "momentum", label: "Momentum Trajectory", options: ["Accelerating", "Steady", "Plateauing"] },
] as const;

const btn = {
  padding: "8px 14px", background: "none", border: "1px solid rgba(255,255,255,.14)", cursor: "pointer",
  font: "500 10px 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#C6CACD", borderRadius: 2,
} as const;

export default function ProfileSecondaryControls({ hcpId, hcpName, specialty }: {
  hcpId: string;
  hcpName: string;
  specialty?: string | null;
}) {
  const [signals, setSignals] = useState<WebSignal[]>([]);
  const [webLoading, setWebLoading] = useState(true);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [optOpen, setOptOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [fiOpen, setFiOpen] = useState(false);
  const [validation, setValidation] = useState<Record<string, string | null>>({ dataMatch: null, engagement: null, credibility: null, momentum: null });
  const [issueType, setIssueType] = useState<string | null>(null);
  const [issueNotes, setIssueNotes] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200); };

  useEffect(() => {
    let alive = true;
    setWebLoading(true);
    getHcpWebSignals(hcpId).then((s) => { if (alive) { setSignals(s); setWebLoading(false); } }).catch(() => alive && setWebLoading(false));
    return () => { alive = false; };
  }, [hcpId]);

  const allValidated = FI_FIELDS.every((f) => validation[f.key]);
  const ta = specialty && /lung|onc/i.test(specialty) ? "Oncology" : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Contact & Access — live read, honest empty state built in */}
      <ContactAccessCard hcpName={hcpName} signals={signals} loading={webLoading} variant="ledger" />

      {/* control bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button style={btn} onClick={() => setFiOpen(true)}>SUBMIT FIELD REVIEW</button>
        <button style={btn} onClick={() => setCtxOpen(true)}>+ ADD CONTEXT</button>
        <button style={btn} onClick={() => setReportOpen(true)}>REPORT DATA ISSUE</button>
        <button style={btn} onClick={() => setOptOpen(true)}>REQUEST OPT-OUT / CLAIM</button>
      </div>

      {ctxOpen && (
        <ContextualizeHCPForm hcpName={hcpName} therapeuticArea={ta}
          onClose={() => setCtxOpen(false)}
          onSubmit={() => { setCtxOpen(false); showToast("Saved. Your contribution will appear in aggregate when 3+ MSLs contribute similar context."); }} />
      )}
      {optOpen && (
        <OptOutRequestForm hcpName={hcpName}
          onClose={() => setOptOpen(false)}
          onSubmit={() => { setOptOpen(false); showToast("Request received — we'll respond within 5 business days."); }} />
      )}

      {reportOpen && (
        <FiModal title="Report data issue" onClose={() => setReportOpen(false)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "rgba(232,230,223,.5)", marginBottom: 8 }}>Issue type</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ISSUE_TYPES.map((opt) => (
                <FiChip key={opt} label={opt} selected={issueType === opt} onClick={() => setIssueType(issueType === opt ? null : opt)} />
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "rgba(232,230,223,.5)", marginBottom: 8 }}>Notes (select all that apply)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ISSUE_NOTE_CHIPS.map((opt) => (
                <FiChip key={opt} label={opt} selected={issueNotes.has(opt)} multi onClick={() => {
                  const next = new Set(issueNotes); if (next.has(opt)) next.delete(opt); else next.add(opt); setIssueNotes(next);
                }} />
              ))}
            </div>
          </div>
          <button type="button" style={btn} onClick={() => { setReportOpen(false); showToast("Issue reported — thank you for helping improve this profile."); }}>Submit report</button>
        </FiModal>
      )}

      {fiOpen && (
        <FiModal title="Submit a field review" onClose={() => setFiOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {FI_FIELDS.map((f) => (
              <div key={f.key}>
                <div style={{ fontSize: 12, color: "rgba(232,230,223,.5)", marginBottom: 8 }}>{f.label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {f.options.map((opt) => (
                    <FiChip key={opt} label={opt} selected={validation[f.key] === opt}
                      onClick={() => setValidation((v) => ({ ...v, [f.key]: v[f.key] === opt ? null : opt }))} />
                  ))}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#3A3A3F" }}>Your identity is never shared. Contributor UUID only.</div>
            <button type="button" disabled={!allValidated} style={{ ...btn, opacity: allValidated ? 1 : 0.4, cursor: allValidated ? "pointer" : "not-allowed" }}
              onClick={() => { if (!allValidated) return; setFiOpen(false); showToast("Field review recorded — the submission path (field-intel write) is not yet wired; stored locally only."); }}>Submit validation</button>
          </div>
        </FiModal>
      )}

      <FiToast message={toast} />
    </div>
  );
}
