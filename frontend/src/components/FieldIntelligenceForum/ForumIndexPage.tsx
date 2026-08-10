// Field Intelligence Forum — index board (redesign, frame project 12c8f7a5).
// Four states, all driven by LIVE reads of the field_intel_* tables:
//   01 by publication (card grid)   — renders when 0 < threads ≤ SCALE_THRESHOLD
//   02 empty                        — renders when the real thread count is 0
//   03 by question (ungrouped list) — the "by question" toggle
//   04 at scale (Pulse-style ledger)— renders when threads > SCALE_THRESHOLD
//
// Publications / journals / PMIDs are real (publications_v2); every post, handle
// and moderation record is fabricated. There is no composer here — a thread can
// only be opened from a publication card, which makes the anchor structural.

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppLayout from "../AppLayout";
import { FONT, COOL, GOLD, GROUND, LINE } from "../../lib/designTokens";
import { useMediaQuery } from "../../lib/useMediaQuery";
import {
  getForumIndex,
  getModeratedThreadIds,
  type ForumIndexAnchor,
  type ForumThread,
} from "../../lib/fieldIntelligence";
import { ProvenanceChip } from "./fiUi";

// The card grid stops being readable at roughly two dozen threads; past this the
// forum renders as the ledger table (item 2 — switched on the LIVE count, not a
// second static layout).
const SCALE_THRESHOLD = 24;
const INT = new Intl.NumberFormat("en-US");

// ── Frame palette (terminal / near-black, muted gold; matched to Scientific Pulse) ──
// Commit C 2026-08-05: box/cards/edges join the Pulse board scheme (g2 board,
// g1 wells, l0/l1 rules); golds/inks stay the frame's own pending their pass.
// Grounds un-reversed 2026-08-07: the FIELD (surface — the box interior and
// the grid gaps) is the darker step and the CONTAINERS (cards, bands, rows)
// are the lighter charcoal raised on it — matching the thread page, where
// g2 containers sit on the dark page ground.
const C = {
  surface: GROUND.g1,
  card: GROUND.g2,
  cardDark: GROUND.g1,
  cardAlt: GROUND.g2,
  border: LINE.l1,
  borderSoft: LINE.l0,
  hair: LINE.l0,
  borderMed: LINE.l2,
  frameBorder: "#1e2228",
  gold: GOLD.gold, // was #c9973f — gold convergence 2026-08-05
  goldDim: "#b08b4e",
  goldDark: "#8a6c3a",
  goldBright: "#e0b063",
  orange: "#c07a2e",
  ink: "#e9e6df",
  ink2: "#ded9d0",
  ink3: "#9aa1a9",
  ink4: "#79818b",
  ink5: COOL.prose, // prose mint #c9d0d8 retired into COOL.prose 2026-08-05 (Two Ramps)
  muted: "#6b747e",
  muted2: "#5a636d",
  faint: "#4f5862",
  faint2: "#3f4750",
  removed: "#cf8158",
  removedBorder: "rgba(176,96,58,.5)",
  removedBg: "rgba(176,96,58,.17)",
  urBorder: "rgba(201,151,63,.38)",
  urBg: "rgba(201,151,63,.07)",
  note: "#98a0a8",
  noteBorder: "#2b3138",
  goldChipBg: "rgba(201,151,63,.09)",
} as const;

const SERIF = "'Source Serif 4', Georgia, serif";
const MONO = FONT.mono;

const mono = (size: number, color: string, ls = 0.14, weight = 400): CSSProperties => ({
  fontFamily: MONO,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${ls}em`,
  color,
});
const serif = (size: number, color: string, lh = 1.5, weight = 400): CSSProperties => ({
  fontFamily: SERIF,
  fontSize: size,
  fontWeight: weight,
  lineHeight: lh,
  color,
});

interface FlatThread {
  thread: ForumThread;
  anchor: ForumIndexAnchor;
}

// ── Permanent disclosure band — KEEP EXACTLY, never softened ─────────────────
function DisclosureBand({ tail, narrow }: { tail: string; narrow: boolean }) {
  if (narrow) {
    return (
      <div style={{ background: C.cardAlt, borderBottom: `1px solid ${C.border}`, padding: "13px 22px", display: "flex", gap: 11 }}>
        <div style={{ width: 2, background: C.gold, flexShrink: 0 }} />
        <div>
          <div style={mono(9.5, C.gold, 0.18, 500)}>ILLUSTRATIVE PROTOTYPE</div>
          <p style={{ ...serif(12.5, C.ink3, 1.5), marginTop: 8 }}>
            Publications, journals and PMIDs are real.{" "}
            <strong style={{ color: C.ink2, fontWeight: 600 }}>Content marked SEEDED — its posts, handles and moderation records — is fabricated</strong>{" "}
            for compliance review. Content marked LIVE is authored on this surface by a verified MSL. LIVE posts are checked for recommendation language, off-label content and physician names before publishing.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: C.cardAlt, borderBottom: `1px solid ${C.border}`, padding: "15px 40px", display: "flex", alignItems: "flex-start", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0, paddingTop: 2 }}>
        <div style={{ width: 2, height: 22, background: C.gold }} />
        <span style={mono(10, C.gold, 0.2, 500)}>ILLUSTRATIVE PROTOTYPE</span>
      </div>
      <p style={{ ...serif(13.5, C.ink3, 1.55), maxWidth: 820 }}>
        Publications, journals and PMIDs are real.{" "}
        <strong style={{ color: C.ink2, fontWeight: 600 }}>Content marked SEEDED — its posts, handles and moderation records — is fabricated</strong>{" "}
        for compliance review. Content marked LIVE is authored on this surface by a verified MSL. LIVE posts are checked for recommendation language, off-label content and physician names before publishing.
      </p>
      <div style={{ marginLeft: "auto", ...mono(10, C.faint, 0.15), lineHeight: 1.7, textAlign: "right", flexShrink: 0 }}>
        PERMANENT DISCLOSURE
        <br />
        {tail}
      </div>
    </div>
  );
}

// ── Masthead with the four computed header counts (item 1) ───────────────────
function Stat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  // centred over the label (2026-08-07 — same treatment as the ledger heroes)
  return (
    <div style={{ padding: "0 24px", textAlign: "center" }}>
      <div style={serif(25, gold ? C.gold : C.ink, 1)}>{value}</div>
      <div style={{ ...mono(9.5, gold ? C.goldDark : C.faint, 0.16), marginTop: 8 }}>{label}</div>
    </div>
  );
}

function Masthead({
  narrow,
  subtitle,
  stats,
}: {
  narrow: boolean;
  subtitle: string;
  stats: { value: string; label: string; gold?: boolean }[];
}) {
  if (narrow) {
    return (
      <div style={{ padding: "24px 22px 0" }}>
        <div style={mono(9.5, C.goldDim, 0.2, 500)}>ANCHORED DISCUSSION</div>
        <h1 style={{ ...serif(30, C.ink, 1.08), margin: "12px 0 0", letterSpacing: "-0.01em" }}>Field Intelligence Forum</h1>
        <p style={{ ...serif(14, C.ink3, 1.55), marginTop: 12 }}>{subtitle}</p>
        <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {stats.map((s) => (
            <span key={s.label} style={mono(10, s.gold ? C.goldDark : C.faint, 0.13)}>
              {s.value} {s.label}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: "46px 40px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={mono(10.5, C.goldDim, 0.2, 500)}>ANCHORED DISCUSSION</span>
        <span style={mono(10, C.faint, 0.15)}>UPDATED THROUGH THE LATEST INGEST</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 64, marginTop: 16 }}>
        <div style={{ maxWidth: 600 }}>
          <h1 style={{ ...serif(46, C.ink, 1.06), margin: 0, letterSpacing: "-0.01em" }}>Field Intelligence Forum</h1>
          <p style={{ ...serif(15, C.ink3, 1.6), marginTop: 14 }}>{subtitle}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          {stats.map((s, i) => (
            <div key={s.label} style={{ display: "flex", alignItems: "flex-end" }}>
              {i > 0 && <div style={{ width: 1, height: 44, background: "#191d22" }} />}
              <Stat value={s.value} label={s.label} gold={s.gold} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Moderation badges (item 4) — presence driven by moderation records ───────
function badgeStyle(border: string, bg: string, color: string): CSSProperties {
  return { padding: "3px 7px", border: `1px solid ${border}`, background: bg, ...mono(9.5, color, 0.13, 500), whiteSpace: "nowrap" };
}
function Moderation({ t, moderated }: { t: ForumThread; moderated: boolean }) {
  const hasMod = moderated && t.under_review_count + t.removed_count + t.context_note_count > 0;
  if (!hasMod) {
    return <span style={mono(9.5, C.faint, 0.13)}>NO MODERATION ON THIS THREAD</span>;
  }
  return (
    <>
      {t.under_review_count > 0 && <span style={badgeStyle(C.urBorder, C.urBg, C.gold)}>◇ UNDER REVIEW · {t.under_review_count}</span>}
      {t.removed_count > 0 && <span style={badgeStyle(C.removedBorder, C.removedBg, C.removed)}>× REMOVED · {t.removed_count}</span>}
      {t.context_note_count > 0 && <span style={badgeStyle(C.noteBorder, "transparent", C.note)}>† CONTEXT NOTE · {t.context_note_count}</span>}
    </>
  );
}

// ── ANCHOR REQUIRED block + the 01/02/03 route-in — KEEP EXACTLY ─────────────
function AnchorRequiredBlock({ narrow, onBibliography }: { narrow: boolean; onBibliography: () => void }) {
  const steps: [string, string][] = [
    ["01 OPEN THE BIBLIOGRAPHY", "Threads start from the corpus, not from here."],
    ["02 CHOOSE A PUBLICATION", "The paper you select becomes the thread's anchor."],
    ["03 ASK WHAT IT REPORTS", "Scope is fixed by the anchor for every reply that follows."],
  ];
  if (narrow) {
    return (
      <div style={{ margin: "20px 22px 0", background: C.card, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 2, height: 11, background: C.gold }} />
          <span style={mono(9.5, C.gold, 0.16, 500)}>ANCHOR REQUIRED</span>
        </div>
        <p style={{ ...serif(13, C.ink3, 1.55), marginTop: 11 }}>
          There is no composer here. Threads start from a publication card in the bibliography — the paper you choose becomes the anchor.
        </p>
        <button type="button" onClick={onBibliography} style={{ marginTop: 13, padding: "9px 14px", border: "1px solid #3a3227", background: C.urBg, ...mono(9.5, C.gold, 0.15, 500), cursor: "pointer" }}>
          OPEN THE BIBLIOGRAPHY&nbsp; →
        </button>
      </div>
    );
  }
  return (
    <div style={{ margin: "34px 40px 0", background: C.card, padding: "20px 26px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 30 }}>
        <div style={{ width: 132, flexShrink: 0, paddingTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 2, height: 11, background: C.gold }} />
            <span style={mono(10, C.gold, 0.16, 500)}>ANCHOR REQUIRED</span>
          </div>
          <div style={{ ...mono(10, C.faint, 0.1), marginTop: 9, lineHeight: 1.6 }}>
            NO COMPOSER
            <br />
            ON THIS SURFACE
          </div>
        </div>
        <div style={{ display: "flex", gap: 34, flex: 1 }}>
          {steps.map(([head, body]) => (
            <div key={head} style={{ flex: 1 }}>
              <div style={mono(10, C.goldDark, 0.16, 500)}>{head}</div>
              <p style={{ ...serif(13.5, C.ink3, 1.5), marginTop: 9 }}>{body}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={onBibliography} style={{ flexShrink: 0, alignSelf: "center", padding: "10px 16px", border: "1px solid #3a3227", background: C.urBg, ...mono(10, C.gold, 0.16, 500), cursor: "pointer" }}>
          OPEN THE BIBLIOGRAPHY&nbsp; →
        </button>
      </div>
      <div style={{ height: 1, background: C.borderSoft, margin: "18px 0 14px" }} />
      <p style={serif(13, C.ink4, 1.55)}>
        Topic discussion only — no HCP names in posts, no product claims, no discussion of unapproved use. Replies are scoped to what the anchored paper reports.
      </p>
    </div>
  );
}

// ── View toggle (BY PUBLICATION / BY QUESTION) ───────────────────────────────
function ViewToggle({ view, onView, right, narrow }: { view: "pub" | "question"; onView: (v: "pub" | "question") => void; right?: ReactNode; narrow: boolean }) {
  const tab = (v: "pub" | "question", label: string) => {
    const on = view === v;
    return (
      <button
        key={v}
        type="button"
        onClick={() => onView(v)}
        style={{
          flex: narrow ? 1 : "none",
          textAlign: "center",
          padding: narrow ? "9px 0" : "9px 18px",
          background: on ? C.goldChipBg : "transparent",
          border: "none",
          cursor: "pointer",
          ...mono(narrow ? 10 : 11, on ? C.gold : C.muted, 0.14, on ? 500 : 400),
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: narrow ? "20px 22px 0" : "36px 40px 0", gap: 16 }}>
      <div style={{ display: "flex", background: C.card, padding: 3, flex: narrow ? 1 : "none" }}>
        {tab("pub", "BY PUBLICATION")}
        {tab("question", "BY QUESTION")}
      </div>
      {!narrow && right}
    </div>
  );
}

// ── Anchor card (state 01) — uniform heights via fixed question windows ──────
function QuestionWindow({ t, moderated }: { t: ForumThread; moderated: boolean }) {
  // Narrow: the fixed 98px window exists to align cards across the desktop
  // two-column grid; in the single mobile column it only clips — moderation
  // badges ran past the card edge and were cut mid-chip. The window goes
  // natural-height and the badge row wraps (2026-08-10).
  const narrow = useMediaQuery("(max-width: 900px)");
  return (
    <Link to={`/field-intelligence/thread/${t.id}`} style={{ display: "block", height: narrow ? "auto" : 98, minHeight: 98, overflow: "hidden", textDecoration: "none" }}>
      <p style={{ ...serif(15, C.ink2, 1.45), height: 44, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
        {t.question_title}
      </p>
      <div style={{ ...mono(10, C.faint, 0.12), marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ProvenanceChip seed={t.is_seed} />
        <span>{t.reply_count} {t.reply_count === 1 ? "REPLY" : "REPLIES"} · {t.recency_label.toUpperCase()}</span>
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minHeight: 19 }}>
        <Moderation t={t} moderated={moderated} />
      </div>
    </Link>
  );
}

function AnchorCard({ anchor, moderatedIds }: { anchor: ForumIndexAnchor; moderatedIds: Set<string> }) {
  const threads = anchor.threads; // most-recent-activity first (sorted by caller)
  const first = threads[0];
  const second = threads[1];
  const pub = anchor.publication;
  const primaryId = (threads.find((t) => t.is_primary) ?? first)?.id;
  return (
    <div style={{ background: C.card, padding: "24px 26px 20px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={mono(10.5, C.goldDim, 0.13, 500)}>{anchor.journal_abbrev} · {pub?.pub_year ?? "—"}</span>
        <span style={mono(10.5, C.faint, 0.1)}>PMID {anchor.pubmed_id}</span>
      </div>
      <h3 style={{ ...serif(20, C.ink, 1.34, 600), marginTop: 14, letterSpacing: "-0.005em", height: 54, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
        {pub?.title ?? "—"}
      </h3>
      <div style={{ marginTop: 12, display: "flex", gap: 20, ...mono(10.5, C.faint, 0.11) }}>
        <span>{INT.format(pub?.citation_count ?? 0)} CITATIONS</span>
        <span>{anchor.thread_count} {anchor.thread_count === 1 ? "THREAD" : "THREADS"}</span>
        <span>{anchor.reply_count} {anchor.reply_count === 1 ? "REPLY" : "REPLIES"}</span>
      </div>
      <div style={{ height: 1, background: C.borderSoft, marginTop: 18 }} />
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 16 }}>
        {first && <QuestionWindow t={first} moderated={moderatedIds.has(first.id)} />}
        <div style={{ height: 1, background: C.hair, margin: "14px 0" }} />
        {second ? (
          <QuestionWindow t={second} moderated={moderatedIds.has(second.id)} />
        ) : (
          <div style={{ height: 98, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", background: C.cardDark, margin: "0 -12px", padding: "0 12px" }}>
            <span style={mono(10, C.faint, 0.14)}>ONE THREAD ON THIS ANCHOR</span>
            <p style={{ ...serif(13, C.muted, 1.45), marginTop: 10 }}>
              A second question on this paper starts the same way — from its card in the bibliography.
            </p>
          </div>
        )}
      </div>
      <div style={{ height: 1, background: C.borderSoft, marginTop: 14 }} />
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={mono(10, C.faint, 0.13)}>LAST ACTIVITY {first?.recency_label.toUpperCase() ?? "—"}</span>
        <Link to={`/field-intelligence/thread/${primaryId}`} style={{ ...mono(10, C.goldDark, 0.13, 500), textDecoration: "none" }}>
          OPEN ANCHOR&nbsp; →
        </Link>
      </div>
    </div>
  );
}

// ── By-question list (state 03) — UNGROUPED, recency only ────────────────────
// NOTE: the frame groups these by question kind (endpoint interpretation, safety,
// subgroup scope, methods). That grouping is NOT a stored field — it was Design's
// inference over the eight fabricated questions (field_intel_threads.scope_label
// is null on all but one, and is a therapeutic-area scope, not a question kind).
// Per the build brief we do not derive categories with a classifier this pass, so
// the list is intentionally UNGROUPED — a deliberate consequence of what the data
// holds. When question categories become a stored field on threads, this view
// gets its grouping back (section per category, ordered as here).
function QuestionList({ flat, moderatedIds, narrow }: { flat: FlatThread[]; moderatedIds: Set<string>; narrow: boolean }) {
  if (narrow) {
    return (
      <div style={{ margin: "18px 22px 0", display: "flex", flexDirection: "column", gap: 1, background: C.surface }}>
        {flat.map(({ thread: t, anchor: a }) => (
          <Link key={t.id} to={`/field-intelligence/thread/${t.id}`} style={{ background: C.card, padding: "16px 18px", textDecoration: "none", display: "block" }}>
            <p style={serif(14.5, C.ink, 1.42)}>{t.question_title}</p>
            <div style={{ ...mono(9.5, C.goldDim, 0.11, 500), marginTop: 10, lineHeight: 1.5 }}>
              {a.journal_abbrev} · {a.publication?.pub_year ?? "—"} · PMID {a.pubmed_id}
            </div>
            <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={mono(9.5, C.faint, 0.12)}>{t.reply_count} {t.reply_count === 1 ? "REPLY" : "REPLIES"} · {t.recency_label.toUpperCase()}</span>
              <Moderation t={t} moderated={moderatedIds.has(t.id)} />
            </div>
          </Link>
        ))}
      </div>
    );
  }
  return (
    <div style={{ margin: "16px 40px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 330px 132px", gap: 36, padding: "18px 26px 12px", ...mono(9.5, C.muted2, 0.16) }}>
        <span>QUESTION</span>
        <span>ANCHORED TO</span>
        <span style={{ textAlign: "right" }}>ACTIVITY · MODERATION</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: C.surface }}>
        {flat.map(({ thread: t, anchor: a }) => (
          <div key={t.id} style={{ background: C.card, padding: "20px 26px", display: "grid", gridTemplateColumns: "1fr 330px 132px", gap: 36, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <Link to={`/field-intelligence/thread/${t.id}`} style={{ ...serif(17, C.ink, 1.4), textDecoration: "none" }}>{t.question_title}</Link>
              <div style={{ ...mono(10, C.faint, 0.12), marginTop: 9 }}>OPENED BY {t.author_handle} · {t.recency_label.toUpperCase()}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={mono(10, C.goldDim, 0.12, 500)}>{a.journal_abbrev} · {a.publication?.pub_year ?? "—"} · PMID {a.pubmed_id}</div>
              <p style={{ ...serif(13, C.ink4, 1.45), marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.publication?.title ?? ""}
              </p>
            </div>
            <div style={{ justifySelf: "end", textAlign: "right" }}>
              <div style={mono(10.5, C.note, 0.12)}>{t.reply_count} {t.reply_count === 1 ? "REPLY" : "REPLIES"}</div>
              <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                <Moderation t={t} moderated={moderatedIds.has(t.id)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ledger (state 04, at scale) — Pulse-style table ──────────────────────────
function Ledger({ flat, moderatedIds, narrow }: { flat: FlatThread[]; moderatedIds: Set<string>; narrow: boolean }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (narrow) {
    return (
      <div style={{ margin: "14px 22px 0", display: "flex", flexDirection: "column", gap: 1, background: C.surface }}>
        {flat.map(({ thread: t, anchor: a }, i) => (
          <div key={t.id} style={{ background: C.card, padding: "14px 16px", display: "flex", gap: 14 }}>
            <span style={{ ...mono(10, C.faint2, 0.06), flexShrink: 0, lineHeight: 1.5 }}>{pad(i + 1)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Link to={`/field-intelligence/thread/${t.id}`} style={{ ...serif(14, C.ink, 1.4), textDecoration: "none", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>{t.question_title}</Link>
              <div style={{ ...mono(9, C.goldDim, 0.1, 500), marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.journal_abbrev} · PMID {a.pubmed_id}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                <span style={mono(9, C.faint, 0.12)}>{t.reply_count} REPLIES · {t.recency_label.toUpperCase()}</span>
                <Moderation t={t} moderated={moderatedIds.has(t.id)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  const GRID = "44px 1fr 300px 78px 108px 116px";
  return (
    <div style={{ margin: "18px 40px 0" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, padding: "0 22px 10px", ...mono(9.5, C.muted2, 0.14) }}>
        <span>MODERATION KEY</span>
        <span style={{ color: C.gold }}>◇ UNDER REVIEW</span>
        <span style={{ color: C.removed }}>× REMOVED</span>
        <span style={{ color: C.note }}>† CONTEXT NOTE</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 24, padding: "0 22px 12px", ...mono(9.5, C.muted2, 0.16), lineHeight: 1.5, borderBottom: `1px solid ${C.borderSoft}` }}>
        <span>#</span>
        <span>QUESTION</span>
        <span>ANCHOR</span>
        <span style={{ textAlign: "right" }}>REPLIES</span>
        <span style={{ textAlign: "right" }}>LAST</span>
        <span style={{ textAlign: "right" }}>MODERATION</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: C.surface, marginTop: 1 }}>
        {flat.map(({ thread: t, anchor: a }, i) => (
          <div key={t.id} style={{ background: C.card, padding: "15px 22px", display: "grid", gridTemplateColumns: GRID, gap: 24, alignItems: "center" }}>
            <span style={mono(11, C.muted2, 0.06)}>{pad(i + 1)}</span>
            <div style={{ minWidth: 0 }}>
              <Link to={`/field-intelligence/thread/${t.id}`} style={{ ...serif(15.5, C.ink, 1.35), textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{t.question_title}</Link>
              <div style={{ ...mono(9.5, C.faint, 0.12), marginTop: 6 }}>{t.author_handle}</div>
            </div>
            <div style={{ minWidth: 0, ...mono(10, C.goldDim, 0.1), lineHeight: 1.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {a.journal_abbrev}<span style={{ color: C.faint }}> · PMID {a.pubmed_id}</span>
            </div>
            <span style={{ textAlign: "right", ...mono(11, C.note, 0) }}>{t.reply_count}</span>
            <span style={{ textAlign: "right", ...mono(10, C.faint, 0.1) }}>{t.recency_label.toUpperCase()}</span>
            <div style={{ justifySelf: "end", display: "flex", gap: 5, justifyContent: "flex-end", alignItems: "center" }}>
              {moderatedIds.has(t.id) && t.under_review_count + t.removed_count + t.context_note_count > 0 ? (
                <>
                  {t.under_review_count > 0 && <span style={badgeStyle(C.urBorder, C.urBg, C.gold)}>◇ {t.under_review_count}</span>}
                  {t.removed_count > 0 && <span style={badgeStyle(C.removedBorder, C.removedBg, C.removed)}>× {t.removed_count}</span>}
                  {t.context_note_count > 0 && <span style={badgeStyle(C.noteBorder, "transparent", C.note)}>† {t.context_note_count}</span>}
                </>
              ) : (
                <span style={mono(10, C.faint2, 0)}>—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empty state (state 02) ───────────────────────────────────────────────────
function EmptyState({ narrow, onBibliography }: { narrow: boolean; onBibliography: () => void }) {
  const steps: [string, string][] = [
    ["OPEN THE BIBLIOGRAPHY", "Every publication in the FieldMark corpus is an eligible anchor. There is no composer on this surface — threads begin at the paper."],
    ["CHOOSE A PUBLICATION", "The paper you select becomes the anchor and appears on the thread with its journal, year and PMID."],
    ["ASK WHAT THE PAPER REPORTS", "Your question opens the thread. Every reply that follows is scoped to what that paper reports."],
  ];
  const stepsBlock = (
    <div style={{ marginTop: narrow ? 22 : 34 }}>
      {steps.map(([head, body], i) => (
        <div key={head} style={{ display: "flex", gap: narrow ? 16 : 26, padding: narrow ? "14px 0" : "18px 0", borderTop: `1px solid ${C.borderSoft}`, borderBottom: i === 2 ? `1px solid ${C.borderSoft}` : undefined }}>
          <span style={{ ...mono(narrow ? 10 : 11, C.goldDark, 0, 500), flexShrink: 0, width: narrow ? 20 : 26, lineHeight: 1.5 }}>{pad2(i + 1)}</span>
          <div>
            <div style={mono(narrow ? 9.5 : 10.5, C.ink5, 0.16, 500)}>{head}</div>
            <p style={{ ...serif(narrow ? 13 : 14, C.ink4, 1.55), marginTop: 7 }}>{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
  if (narrow) {
    return (
      <div style={{ margin: "20px 22px 0", background: C.card, padding: "24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 2, height: 11, background: C.gold }} />
          <span style={mono(9.5, C.gold, 0.17, 500)}>NO THREADS OPEN</span>
        </div>
        <h2 style={{ ...serif(25, C.ink, 1.22), marginTop: 16 }}>No one has anchored a question yet.</h2>
        <p style={{ ...serif(14, C.ink3, 1.6), marginTop: 13 }}>
          This is where verified MSLs discuss what a published paper reports — one thread per question, tied to the paper it came from.
        </p>
        {stepsBlock}
        <button type="button" onClick={onBibliography} style={{ marginTop: 20, display: "block", width: "100%", textAlign: "center", padding: "13px 16px", border: "1px solid #3a3227", background: C.urBg, ...mono(10, C.gold, 0.16, 500), cursor: "pointer" }}>
          OPEN THE BIBLIOGRAPHY&nbsp; →
        </button>
      </div>
    );
  }
  return (
    <div style={{ margin: "16px 40px 0", display: "grid", gridTemplateColumns: "1fr 440px", gap: 1, background: C.surface }}>
      <div style={{ background: C.card, padding: "44px 48px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 2, height: 11, background: C.gold }} />
          <span style={mono(10.5, C.gold, 0.18, 500)}>NO THREADS OPEN</span>
        </div>
        <h2 style={{ ...serif(34, C.ink, 1.2), marginTop: 22, letterSpacing: "-0.01em", maxWidth: 520 }}>No one has anchored a question yet.</h2>
        <p style={{ ...serif(15.5, C.ink3, 1.62), marginTop: 16, maxWidth: 560 }}>
          This is where verified MSLs discuss what a published paper reports — one thread per question, each one tied to the paper it came from. The room is open. It fills the moment someone picks an anchor.
        </p>
        {stepsBlock}
        <button type="button" onClick={onBibliography} style={{ marginTop: 28, display: "inline-block", padding: "13px 20px", border: "1px solid #3a3227", background: C.urBg, ...mono(11, C.gold, 0.17, 500), cursor: "pointer" }}>
          OPEN THE BIBLIOGRAPHY&nbsp; →
        </button>
        <div style={{ marginTop: 34, paddingTop: 20, borderTop: `1px solid ${C.borderSoft}`, display: "flex", gap: 26, alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0, paddingTop: 1 }}>
            <div style={{ width: 2, height: 11, background: C.goldDark }} />
            <span style={mono(10, C.goldDim, 0.16, 500)}>ANCHOR REQUIRED</span>
          </div>
          <p style={serif(13.5, C.ink4, 1.6)}>
            Topic discussion only — no HCP names in posts, no product claims, no discussion of unapproved use. Replies are scoped to what the anchored paper reports. Moderation states are shown on the thread, not hidden.
          </p>
        </div>
      </div>
      <div style={{ background: C.card, padding: "44px 40px 40px" }}>
        <div style={mono(10, C.muted, 0.18, 500)}>ILLUSTRATION · NOT A REAL THREAD</div>
        <p style={{ ...serif(13.5, C.ink4, 1.55), marginTop: 14 }}>
          What one thread looks like once it exists. The anchor sits above the question; moderation states are shown in place.
        </p>
        <div style={{ marginTop: 24, padding: "24px 26px", background: C.cardDark, opacity: 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={mono(10.5, C.goldDim, 0.13, 500)}>NEJM · 2025</span>
            <span style={mono(10.5, C.faint, 0.1)}>PMID 40454646</span>
          </div>
          <h3 style={{ ...serif(19, C.ink5, 1.34, 600), marginTop: 14, height: 51, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
            Tarlatamab in Small-Cell Lung Cancer after Platinum-Based Chemotherapy.
          </h3>
          <div style={{ marginTop: 12, display: "flex", gap: 18, ...mono(10.5, C.faint, 0.11) }}>
            <span>153 CITATIONS</span>
            <span>0 THREADS</span>
          </div>
          <div style={{ height: 1, background: C.borderSoft, marginTop: 18 }} />
          <p style={{ ...serif(15, C.muted, 1.45), marginTop: 16, fontStyle: "italic" }}>A question scoped to what this paper reports would appear here.</p>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={badgeStyle(C.urBorder, C.urBg, C.gold)}>◇ UNDER REVIEW</span>
            <span style={badgeStyle(C.removedBorder, C.removedBg, C.removed)}>× REMOVED</span>
            <span style={badgeStyle(C.noteBorder, "transparent", C.note)}>† CONTEXT NOTE</span>
          </div>
        </div>
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.borderSoft}` }}>
          <div style={mono(10, C.muted2, 0.16)}>MODERATION IS VISIBLE BY DESIGN</div>
          <p style={{ ...serif(13, C.muted, 1.6), marginTop: 11 }}>
            Threads under review stay listed. Removed posts leave a record in place of the post. Context notes are attached, not substituted.
          </p>
        </div>
      </div>
    </div>
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// ForumFooter removed 2026-08-05 (chrome consolidation): it duplicated
// GlobalFooter — same MSL-use line, same utility links, same copyright —
// producing a double footer under AppLayout. GlobalFooter is the footer.

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ForumIndexPage() {
  const navigate = useNavigate();
  const narrow = useMediaQuery("(max-width: 900px)");
  const [anchors, setAnchors] = useState<ForumIndexAnchor[]>([]);
  const [moderatedIds, setModeratedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"pub" | "question">("pub");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getForumIndex(), getModeratedThreadIds()]).then(([idx, mod]) => {
      if (cancelled) return;
      setAnchors(idx.data ?? []);
      setModeratedIds(mod);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openBibliography = () => navigate("/assets");

  // Both tabs order on the same principle — most recent activity first. Anchor
  // cards are ordered by their most recent thread; threads within a card, the
  // by-question list and the ledger are all sorted by created_at desc.
  const ts = (t: ForumThread) => new Date(t.created_at).getTime();
  const orderedAnchors = useMemo(() => {
    const firstTs = (a: ForumIndexAnchor) => (a.threads[0] ? ts(a.threads[0]) : 0);
    return [...anchors]
      .map((a) => ({ ...a, threads: [...a.threads].sort((x, y) => ts(y) - ts(x)) }))
      .sort((a, b) => firstTs(b) - firstTs(a));
  }, [anchors]);

  const flat: FlatThread[] = useMemo(() => {
    const rows: FlatThread[] = [];
    for (const a of orderedAnchors) for (const t of a.threads) rows.push({ thread: t, anchor: a });
    return rows.sort((x, y) => ts(y.thread) - ts(x.thread));
  }, [orderedAnchors]);

  const counts = useMemo(() => {
    let threads = 0, replies = 0, underReview = 0;
    for (const a of orderedAnchors)
      for (const t of a.threads) {
        threads += 1;
        replies += t.reply_count;
        underReview += t.under_review_count;
      }
    return { threads, replies, anchors: orderedAnchors.length, underReview };
  }, [orderedAnchors]);

  const atScale = counts.threads > SCALE_THRESHOLD;

  const subtitle =
    view === "question"
      ? "Grouped by what is being asked. The anchor still governs scope — it moves to the second column, but no thread exists without one."
      : atScale
        ? "Past roughly two dozen threads the card grid stops being readable. The forum then renders as a ledger — one row per thread, scanned the way Pulse's theme table is scanned."
        : "Every thread is anchored to a published paper. A thread cannot be opened without one — the anchor defines the scope of what is on topic, and what is not.";

  // Header stats — all computed from the real tables (item 1). The frame's
  // "4 QUESTION KINDS" stat is replaced with a real count (ANCHORS), since
  // question kinds are not stored (see QuestionList note).
  const stats = [
    { value: INT.format(counts.threads), label: "THREADS" },
    { value: INT.format(counts.replies), label: "REPLIES" },
    { value: INT.format(counts.anchors), label: "ANCHORS" },
    { value: INT.format(counts.underReview), label: "UNDER REVIEW", gold: true },
  ];

  const empty = loaded && counts.threads === 0;

  return (
    <AppLayout width="wide">
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink, margin: "8px 0 24px", fontFamily: SERIF, overflow: "hidden", paddingBottom: narrow ? 24 : 0 }}>
        <DisclosureBand narrow={narrow} tail={empty ? "APPLIES WHETHER OR NOT THREADS EXIST" : "APPLIES TO EVERY THREAD BELOW"} />

        {!loaded ? (
          <div style={{ padding: narrow ? "40px 22px" : "60px 40px", ...mono(11, C.muted, 0.14) }}>LOADING FORUM…</div>
        ) : (
          <>
            <Masthead
              narrow={narrow}
              subtitle={empty ? "Every thread is anchored to a published paper. A thread cannot be opened without one — the anchor defines the scope of what is on topic, and what is not." : subtitle}
              stats={
                empty
                  ? [
                      { value: "0", label: "THREADS" },
                      { value: "0", label: "REPLIES" },
                      { value: "OPEN", label: "FORUM STATUS", gold: true },
                    ]
                  : stats
              }
            />

            {empty ? (
              <>
                <ViewToggle view={view} onView={setView} narrow={narrow} right={<span style={mono(10, C.faint, 0.15)}>BOTH VIEWS EMPTY UNTIL THE FIRST THREAD IS ANCHORED</span>} />
                <EmptyState narrow={narrow} onBibliography={openBibliography} />
              </>
            ) : (
              <>
                {/* By publication leads with the anchor-required route-in; by question
                    keeps the constraint band below the list. */}
                {view === "pub" && !atScale && <AnchorRequiredBlock narrow={narrow} onBibliography={openBibliography} />}

                <ViewToggle
                  view={view}
                  onView={setView}
                  narrow={narrow}
                  right={
                    view === "question" ? (
                      <span style={mono(10, C.faint, 0.15)}>ANCHOR SHOWN PER THREAD · MOST RECENT FIRST</span>
                    ) : atScale ? (
                      <span style={mono(10, C.faint, 0.15)}>LEDGER · SORTED BY LAST ACTIVITY</span>
                    ) : (
                      <span style={mono(10, C.faint, 0.15)}>{counts.anchors} ANCHORS · MOST RECENT ACTIVITY FIRST</span>
                    )
                  }
                />

                {view === "question" ? (
                  <QuestionList flat={flat} moderatedIds={moderatedIds} narrow={narrow} />
                ) : atScale ? (
                  <Ledger flat={flat} moderatedIds={moderatedIds} narrow={narrow} />
                ) : (
                  // minmax(0,·): a bare 1fr track floors at the card's min-content —
                  // the clamped anchor title reports full one-line width and pushed
                  // the whole column past the phone viewport (2026-08-10)
                  <div style={{ margin: narrow ? "16px 22px 0" : "16px 40px 0", display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))", gap: 1, background: C.surface }}>
                    {orderedAnchors.map((a) => (
                      <AnchorCard key={a.id} anchor={a} moderatedIds={moderatedIds} />
                    ))}
                  </div>
                )}

                {/* By question keeps the anchor-required constraint below the list. */}
                {view === "question" && (
                  <div style={{ margin: narrow ? "20px 22px 0" : "34px 40px 0", background: C.card, padding: narrow ? "16px 18px" : "18px 26px", display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
                      <div style={{ width: 2, height: 11, background: C.gold }} />
                      <span style={mono(10, C.gold, 0.16, 500)}>ANCHOR REQUIRED</span>
                    </div>
                    <p style={{ ...serif(13.5, C.ink3, 1.55), flex: 1, minWidth: 240 }}>
                      Grouping by question does not loosen scope. Topic discussion only — no HCP names in posts, no product claims, no discussion of unapproved use. Replies stay scoped to what the anchored paper reports.
                    </p>
                    {!narrow && (
                      <button type="button" onClick={openBibliography} style={{ marginLeft: "auto", flexShrink: 0, padding: "10px 16px", border: "1px solid #3a3227", background: C.urBg, ...mono(10, C.gold, 0.16, 500), cursor: "pointer" }}>
                        OPEN THE BIBLIOGRAPHY&nbsp; →
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

          </>
        )}
      </div>
    </AppLayout>
  );
}
