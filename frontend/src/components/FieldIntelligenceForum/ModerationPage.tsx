// Field Intelligence Forum — moderator view (Design frame 4). FieldMark medical-
// affairs review queue. Every moderation action renders and is inert. The queue
// includes the "blocked at composer" lane — a question submitted without an
// anchor, blocked before it could publish (post_id NULL) — so the volume of
// prevented drafts is auditable alongside removals.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../AppLayout";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { COLOR, FONT } from "../../lib/designTokens";
import { getModerationQueue, type ModerationRecord, type QueueState } from "../../lib/fieldIntelligence";
import { DisabledControl, mono, PrototypeStrip } from "./fiUi";

const QUEUE_META: Record<QueueState, { label: string; fg: string; bg: string; border: string }> = {
  open_peer_flag: { label: "OPEN · PEER FLAG", fg: COLOR.amber, bg: "rgba(232,160,32,0.1)", border: "rgba(232,160,32,0.3)" },
  open_auto_signal: { label: "OPEN · AUTO-SIGNAL", fg: COLOR.indigoLink, bg: "rgba(85,102,232,0.1)", border: "rgba(85,102,232,0.3)" },
  blocked_at_composer: { label: "BLOCKED AT COMPOSER", fg: COLOR.ink3, bg: COLOR.surfaceWell, border: COLOR.hairStrong },
  resolved_removed: { label: "RESOLVED · REMOVED", fg: COLOR.danger, bg: "rgba(232,112,78,0.1)", border: "rgba(232,112,78,0.3)" },
};

const MOD_ACTIONS = ["RETURN TO AUTHOR FOR EDIT", "ATTACH CONTEXT NOTE", "HOLD FROM VIEW", "REMOVE", "CLEAR · ON ANCHOR"];

function QueueChip({ state }: { state: QueueState }) {
  const m = QUEUE_META[state];
  return (
    <span style={{ ...mono(9.5, m.fg), letterSpacing: "0.1em", fontWeight: 600, background: m.bg, border: `1px solid ${m.border}`, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

function AuditLog({ record }: { record: ModerationRecord }) {
  if (!record.audit_log?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...mono(9.5, COLOR.ink4), letterSpacing: "0.14em" }}>AUDIT LOG</span>
      {record.audit_log.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 10, ...mono(10, COLOR.ink4) }}>
          <span style={{ color: COLOR.ink5, minWidth: 42 }}>{e.t}</span>
          <span style={{ color: COLOR.ink3 }}>{e.event}</span>
        </div>
      ))}
    </div>
  );
}

function CaseDetail({ record }: { record: ModerationRecord }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20, background: COLOR.surfaceCard, border: `1px solid ${COLOR.hairStrong}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <QueueChip state={record.queue_state} />
          <span style={mono(11, COLOR.ink2)}>CASE {record.case_number}</span>
        </div>
        <span style={mono(10.5, COLOR.ink5)}>{record.sla_label ?? record.timing_label ?? ""}</span>
      </div>
      <span style={mono(10.5, COLOR.ink4)}>
        {record.author_handle} · MSL Verified{record.anchor_pubmed_id ? ` · PMID ${record.anchor_pubmed_id}` : ""}
      </span>

      {record.queue_state === "blocked_at_composer" ? (
        <>
          <span style={{ fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6, color: COLOR.ink2 }}>{record.blocked_reason}</span>
          <span style={mono(10, COLOR.ink5)}>{record.notification_state}</span>
          {record.decision_text && (
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COLOR.ink4 }}>{record.decision_text}</span>
          )}
        </>
      ) : null}

      {record.anchor_check_text && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "12px 14px", background: "rgba(85,102,232,0.05)", border: "1px solid rgba(85,102,232,0.16)" }}>
          <span style={{ ...mono(9.5, COLOR.indigoLink), letterSpacing: "0.12em" }}>ANCHOR CHECK</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COLOR.ink3 }}>{record.anchor_check_text}</span>
        </div>
      )}

      {record.clause_text && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "12px 14px", background: "rgba(232,112,78,0.05)", border: "1px solid rgba(232,112,78,0.2)" }}>
          <span style={{ ...mono(9.5, COLOR.danger), letterSpacing: "0.12em" }}>DECISION · {record.clause_cited}</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COLOR.ink2 }}>{record.clause_text}</span>
          {record.notification_state && (
            <span style={mono(9.5, COLOR.ink5)}>
              {record.notification_state}
              {record.appeal_window_days != null ? ` · appeal window ${record.appeal_window_days} days` : ""}
            </span>
          )}
        </div>
      )}

      {(record.classifier_score != null || record.account_history) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ ...mono(9.5, COLOR.ink4), letterSpacing: "0.14em" }}>SIGNALS</span>
          {record.classifier_score != null && (
            <span style={mono(10, COLOR.ink3)}>
              Classifier · {record.classifier_score.toFixed(2)} recommendation likelihood
              {record.classifier_score < 0.8 ? " (below the 0.80 auto-hold threshold)" : " · auto-held from view"}
            </span>
          )}
          {record.account_history && <span style={mono(10, COLOR.ink3)}>Account history: {record.account_history}</span>}
        </div>
      )}

      {record.follow_up_text && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ ...mono(9.5, COLOR.ink4), letterSpacing: "0.14em" }}>FOLLOW-UP</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COLOR.ink3 }}>{record.follow_up_text}</span>
        </div>
      )}

      <AuditLog record={record} />

      {/* Moderator actions — rendered, inert. Every action requires a clause. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
        <span style={{ ...mono(9.5, COLOR.ink4), letterSpacing: "0.14em" }}>ACTIONS</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(record.queue_state === "blocked_at_composer"
            ? ["SUGGEST AN ANCHOR", "CLOSE · NO ACTION NEEDED"]
            : MOD_ACTIONS
          ).map((a) => (
            <DisabledControl key={a} variant="ghost">{a}</DisabledControl>
          ))}
        </div>
        <span style={{ fontSize: 11.5, lineHeight: 1.6, color: COLOR.ink5 }}>
          Every action requires a clause citation and is written to the audit log with the
          moderator&rsquo;s identity. Removals and holds are disclosed to the author; clears are not
          disclosed to the flagger&rsquo;s peers.
        </span>
      </div>
    </div>
  );
}

export default function ModerationPage() {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [records, setRecords] = useState<ModerationRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getModerationQueue().then((res) => {
      if (cancelled) return;
      const rows = res.data ?? [];
      setRecords(rows);
      setSelected(rows.find((r) => r.queue_state === "open_peer_flag")?.id ?? rows[0]?.id ?? null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const open = useMemo(() => records.filter((r) => r.queue_state.startsWith("open")).length, [records]);
  const current = records.find((r) => r.id === selected) ?? null;

  return (
    <AppLayout width="reading">
      <div style={{ fontFamily: FONT.sans, color: COLOR.ink1, paddingTop: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <PrototypeStrip />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ ...mono(10.5, COLOR.ink5), letterSpacing: "0.18em" }}>MODERATOR VIEW · FIELDMARK MEDICAL AFFAIRS</span>
          <h1 style={{ margin: 0, fontFamily: FONT.serif, fontSize: 30, fontWeight: 500, color: COLOR.ink1 }}>Review queue · Oncology</h1>
          <div style={{ display: "flex", gap: 22, ...mono(10.5, COLOR.ink4), flexWrap: "wrap" }}>
            <span><span style={{ color: COLOR.ink1 }}>{loaded ? open : "—"}</span> OPEN</span>
            <span><span style={{ color: COLOR.ink1 }}>41m</span> MEDIAN TO ACTION</span>
            <span><span style={{ color: COLOR.ink1 }}>12</span> AUTO-SIGNALS TODAY</span>
            <span><span style={{ color: COLOR.ink1 }}>4h</span> SLA</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "340px 1fr", gap: 16, alignItems: "start" }}>
          {/* queue list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1, background: COLOR.hairStrong, border: `1px solid ${COLOR.hairStrong}` }}>
            {records.map((r) => {
              const active = r.id === selected;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(r.id)}
                  style={{ textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, padding: 14, background: active ? COLOR.surfaceRaised : COLOR.surfaceCard, border: "none", borderLeft: `2px solid ${active ? COLOR.amber : "transparent"}` }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <QueueChip state={r.queue_state} />
                    <span style={mono(9.5, COLOR.ink5)}>{r.timing_label ?? ""}</span>
                  </div>
                  <span style={{ fontFamily: FONT.serif, fontSize: 13, lineHeight: 1.45, color: COLOR.ink2 }}>
                    {r.blocked_reason ?? r.anchor_check_text?.slice(0, 90) ?? r.clause_text?.slice(0, 90) ?? ""}
                  </span>
                  <span style={mono(9.5, COLOR.ink5)}>{r.author_handle}{r.anchor_pubmed_id ? ` · PMID ${r.anchor_pubmed_id}` : ""}</span>
                </button>
              );
            })}
          </div>

          {/* case detail */}
          <div>{current ? <CaseDetail record={current} /> : <div style={{ ...mono(11, COLOR.ink5), padding: 20 }}>Select a case.</div>}</div>
        </div>

        {/* who moderates — load-bearing copy, verbatim */}
        <div style={{ padding: "16px 18px", background: COLOR.surfaceWell, border: `1px solid ${COLOR.hair}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...mono(9.5, COLOR.ink4), letterSpacing: "0.14em" }}>WHO MODERATES</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.65, color: COLOR.ink3, maxWidth: "92ch" }}>
            Reviewers are FieldMark medical-affairs staff with no affiliation to any manufacturer,
            and no member company can see, direct or appeal another company&rsquo;s cases. Classifier
            thresholds, clause list and action counts are published quarterly.
          </span>
        </div>

        <Link to="/field-intelligence" style={{ ...mono(10.5, COLOR.ink3), letterSpacing: "0.1em" }}>← ALL THREADS</Link>
      </div>
    </AppLayout>
  );
}
