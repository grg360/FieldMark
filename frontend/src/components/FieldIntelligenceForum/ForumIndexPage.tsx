// Field Intelligence Forum — index (Design frame 2). Two views: by publication
// (anchor cards) and by question (flat list). Every thread is anchored to a real
// paper; there is no composer here — a thread can only be opened from a
// publication card, which makes the anchor structural.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppLayout from "../AppLayout";
import { COLOR, FONT } from "../../lib/designTokens";
import {
  getForumIndex,
  type ForumIndexAnchor,
  type ForumThread,
} from "../../lib/fieldIntelligence";
import { ComplianceChip, mono, PrototypeStrip, serif } from "./fiUi";

const INT = new Intl.NumberFormat("en-US");

function ThreadChips({ t }: { t: ForumThread }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {t.under_review_count > 0 && <ComplianceChip state="under_review" fragment={`${t.under_review_count}`} />}
      {t.removed_count > 0 && <ComplianceChip state="removed" fragment={`${t.removed_count}`} />}
      {t.context_note_count > 0 && <ComplianceChip state="context_note" fragment={`${t.context_note_count}`} />}
      <span style={mono(10, COLOR.ink5)}>
        {t.reply_count} {t.reply_count === 1 ? "reply" : "replies"} · {t.recency_label}
      </span>
    </div>
  );
}

export default function ForumIndexPage() {
  const navigate = useNavigate();
  const [anchors, setAnchors] = useState<ForumIndexAnchor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"pub" | "question">("pub");

  useEffect(() => {
    let cancelled = false;
    getForumIndex().then((res) => {
      if (cancelled) return;
      setAnchors(res.data ?? []);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const totals = useMemo(() => {
    let threads = 0, replies = 0, underReview = 0;
    for (const a of anchors) {
      threads += a.threads.length;
      for (const t of a.threads) {
        replies += t.reply_count;
        underReview += t.under_review_count;
      }
    }
    return { threads, replies, underReview };
  }, [anchors]);

  // Flat question list (by-question view), primary questions first, then recency.
  const questions = useMemo(() => {
    const rows: { thread: ForumThread; anchor: ForumIndexAnchor }[] = [];
    for (const a of anchors) for (const t of a.threads) rows.push({ thread: t, anchor: a });
    return rows.sort((x, y) => Number(y.thread.is_primary) - Number(x.thread.is_primary));
  }, [anchors]);

  return (
    <AppLayout width="reading">
      <div style={{ fontFamily: FONT.sans, color: COLOR.ink1, paddingTop: 16, display: "flex", flexDirection: "column", gap: 22 }}>
        <PrototypeStrip />

        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ ...mono(10.5, COLOR.ink5), letterSpacing: "0.18em" }}>ANCHORED DISCUSSION</span>
            <h1 style={{ margin: 0, fontFamily: FONT.serif, fontSize: 32, fontWeight: 500, letterSpacing: "-0.01em", color: COLOR.ink1 }}>
              Field Intelligence Forum
            </h1>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: COLOR.ink3, maxWidth: "62ch" }}>
              Every thread is anchored to a published paper. A thread cannot be opened without one — the
              anchor defines the scope of what is on topic, and what is not.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 6, padding: 4, border: `1px solid ${COLOR.hairStrong}`, background: COLOR.surfaceWell }}>
              {(["pub", "question"] as const).map((m) => {
                const active = view === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setView(m)}
                    style={{
                      ...mono(10.5, active ? COLOR.amber : COLOR.ink4),
                      letterSpacing: "0.08em",
                      padding: "8px 14px",
                      cursor: "pointer",
                      background: active ? "rgba(232,160,32,0.1)" : "transparent",
                      border: `1px solid ${active ? "rgba(232,160,32,0.4)" : "transparent"}`,
                      borderRadius: 3,
                    }}
                  >
                    {m === "pub" ? "By publication" : "By question"}
                  </button>
                );
              })}
            </div>
            <span style={mono(10, COLOR.ink5)}>
              {loaded ? `${totals.threads} threads · ${INT.format(totals.replies)} replies · ${totals.underReview} under review` : "loading…"}
            </span>
          </div>
        </div>

        {/* BY PUBLICATION */}
        {view === "pub" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
            {anchors.map((a) => {
              const primary = a.threads.find((t) => t.is_primary) ?? a.threads[0];
              const secondary = a.threads.filter((t) => t !== primary);
              return (
                <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18, background: COLOR.surfaceCard, border: `1px solid ${COLOR.hairStrong}`, borderRadius: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...mono(10.5, COLOR.ink3) }}>
                    <span style={{ color: COLOR.indigoLink }}>{a.journal_abbrev} · {a.publication?.pub_year ?? "—"}</span>
                    <span>PMID {a.pubmed_id}</span>
                  </div>
                  <h3 style={{ margin: 0, fontFamily: FONT.serif, fontSize: 17.5, fontWeight: 500, lineHeight: 1.35, color: COLOR.ink1 }}>
                    {a.publication?.title ?? "—"}
                  </h3>
                  <div style={{ display: "flex", gap: 16, ...mono(10.5, COLOR.ink5) }}>
                    <span>{INT.format(a.publication?.citation_count ?? 0)} citations</span>
                    <span>{a.thread_count} {a.thread_count === 1 ? "thread" : "threads"}</span>
                    <span>{a.reply_count} {a.reply_count === 1 ? "reply" : "replies"}</span>
                  </div>
                  <div style={{ height: 1, background: COLOR.hair }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {primary && (
                      <>
                        <Link to={`/field-intelligence/thread/${primary.id}`} style={{ fontFamily: FONT.serif, fontSize: 14.5, color: COLOR.ink1, lineHeight: 1.45 }}>
                          {primary.question_title}
                        </Link>
                        <ThreadChips t={primary} />
                      </>
                    )}
                    {secondary.map((t) => (
                      <Link key={t.id} to={`/field-intelligence/thread/${t.id}`} style={{ fontFamily: FONT.serif, fontSize: 14.5, color: COLOR.ink2, lineHeight: 1.45 }}>
                        {t.question_title}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* BY QUESTION */}
        {view === "question" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, background: COLOR.hairStrong, border: `1px solid ${COLOR.hairStrong}` }}>
            {questions.map(({ thread: t, anchor: a }) => (
              <div key={t.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 28, padding: 20, background: COLOR.surfaceCard }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9, maxWidth: "74ch" }}>
                  <Link to={`/field-intelligence/thread/${t.id}`} style={{ fontFamily: FONT.serif, fontSize: 19, fontWeight: 500, lineHeight: 1.4, color: COLOR.ink1 }}>
                    {t.question_title}
                  </Link>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ ...mono(9.5, COLOR.indigoLink), letterSpacing: "0.12em", background: "rgba(85,102,232,0.1)", border: "1px solid rgba(85,102,232,0.28)", padding: "2px 6px" }}>ANCHOR</span>
                    <span style={mono(11, COLOR.ink3)}>PMID {a.pubmed_id} · {a.journal_abbrev}</span>
                    <span style={{ fontSize: 12.5, color: COLOR.ink4 }}>{a.publication?.title ?? ""}</span>
                  </div>
                  <span style={mono(10.5, COLOR.ink5)}>{t.author_handle} · {t.recency_label}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-end", flexShrink: 0 }}>
                  <span style={mono(12, COLOR.ink1)}>{t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}</span>
                  {t.under_review_count > 0 && <ComplianceChip state="under_review" fragment={`${t.under_review_count}`} />}
                  {t.removed_count > 0 && <ComplianceChip state="removed" fragment={`${t.removed_count}`} />}
                  {t.context_note_count > 0 && <ComplianceChip state="context_note" fragment={`${t.context_note_count}`} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ANCHOR REQUIRED — load-bearing copy, verbatim */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: COLOR.surfaceWell, border: `1px solid ${COLOR.hair}`, borderRadius: 6, flexWrap: "wrap" }}>
          <span style={{ ...mono(9.5, COLOR.amber), letterSpacing: "0.14em", flexShrink: 0 }}>ANCHOR REQUIRED</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.6, color: COLOR.ink3, maxWidth: "88ch" }}>
            A new question cannot be posted without selecting a publication from the FieldMark corpus.
            Topic discussion only — no HCP names in posts, no product claims, no discussion of
            unapproved use. Replies are scoped to what the anchored paper reports.
          </span>
        </div>

        <div style={{ ...serif(13, COLOR.ink4), maxWidth: "80ch" }}>
          To open a thread you start from a publication card in the{" "}
          <button type="button" onClick={() => navigate("/field-intelligence")} style={{ ...serif(13, COLOR.indigoLink), background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            bibliography
          </button>
          . There is no composer on this surface — the anchor is structural, not a rule to remember.
        </div>
      </div>
    </AppLayout>
  );
}
