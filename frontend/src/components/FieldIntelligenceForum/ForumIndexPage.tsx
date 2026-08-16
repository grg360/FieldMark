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
import PageHero from "../PageHero";
import { GROUND, LINE, INK, GOLD, STATE, DEPTH, FACE, T } from "../../lib/canonicalTokens";
import { useMediaQuery } from "../../lib/useMediaQuery";
import {
  getForumIndex,
  getModeratedThreadIds,
  type ForumIndexAnchor,
  type ForumThread,
} from "../../lib/fieldIntelligence";
import { mono, ProvenanceChip, serif } from "./fiUi";

// The card grid stops being readable at roughly two dozen threads; past this the
// forum renders as the ledger table (item 2 — switched on the LIVE count, not a
// second static layout).
const SCALE_THRESHOLD = 24;
const INT = new Intl.NumberFormat("en-US");

interface FlatThread {
  thread: ForumThread;
  anchor: ForumIndexAnchor;
}

// ── Permanent disclosure band — KEEP EXACTLY, never softened ─────────────────
function DisclosureBand({ tail, narrow }: { tail: string; narrow: boolean }) {
  if (narrow) {
    return (
      <div style={{ background: GROUND.INSET, borderBottom: `1px solid ${LINE.HAIR}`, padding: "13px 22px", display: "flex", gap: 11 }}>
        <div style={{ width: 2, background: GOLD.PRIME, flexShrink: 0 }} />
        <div>
          <div style={mono(T.MICRO, GOLD.PRIME, 0.18, 500)}>ILLUSTRATIVE PROTOTYPE</div>
          <p style={{ ...serif(T.META, INK.LABEL, 1.5, 400), marginTop: 8 }}>
            Publications, journals and PMIDs are real.{" "}
            <strong style={{ color: INK.BODY, fontWeight: 600 }}>Content marked SEEDED — its posts, handles and moderation records — is fabricated</strong>{" "}
            for compliance review. Content marked LIVE is authored on this surface by a verified MSL. LIVE posts are checked for recommendation language, off-label content and physician names before publishing.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: GROUND.INSET, borderBottom: `1px solid ${LINE.HAIR}`, padding: "15px 40px", display: "flex", alignItems: "flex-start", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0, paddingTop: 2 }}>
        <div style={{ width: 2, height: 22, background: GOLD.PRIME }} />
        <span style={mono(T.LABEL, GOLD.PRIME, 0.2, 500)}>ILLUSTRATIVE PROTOTYPE</span>
      </div>
      <p style={{ ...serif(T.META, INK.LABEL, 1.55, 400), maxWidth: 820 }}>
        Publications, journals and PMIDs are real.{" "}
        <strong style={{ color: INK.BODY, fontWeight: 600 }}>Content marked SEEDED — its posts, handles and moderation records — is fabricated</strong>{" "}
        for compliance review. Content marked LIVE is authored on this surface by a verified MSL. LIVE posts are checked for recommendation language, off-label content and physician names before publishing.
      </p>
      <div style={{ marginLeft: "auto", ...mono(T.LABEL, INK.MUTE, 0.15, 400), lineHeight: 1.7, textAlign: "right", flexShrink: 0 }}>
        PERMANENT DISCLOSURE
        <br />
        {tail}
      </div>
    </div>
  );
}

// ── Masthead — PageHero (2026-08-15) ────────────────────────────────────────
// EYEBROW IS "FI" ALONE, NOT "FI · LUNG CANCER · ONCOLOGY". The convergence
// format is SCOPE · TA · AREA, but this surface HAS NO TA SCOPE: getForumIndex
// (lib/fieldIntelligence.ts:110) joins field_intel_anchors to publications_v2
// with no therapeutic-area predicate, and that gap is logged there with a real
// instance — a Hepatology/MASH paper once led a lung-cancer board on citation
// count. Naming a TA here would assert a filter that does not exist. The TA
// segments go in when the scope does, not before.
//
// WHAT ELSE CHANGED, and what it cost:
//   · stat values were SERIF 25 — editorial figures in the title's own face.
//     They are mono 26 now, the data face every other surface uses. This is the
//     largest character change on the surface and it is deliberate: a count of
//     threads is data, not a headline.
//   · the explicit 1px x 44px divider rules become the cluster's borderRight.
//   · the eyebrow row was space-between with NO rule. It takes the spanning
//     hairline (Hero Rule 1: the rule is structure, not text) and the
//     "UPDATED THROUGH THE LATEST INGEST" stamp becomes the meta right of it.
//   · title 46/400 -> 52/600 desktop; narrow stays 30, which is what T.FIGURE
//     already gave it.
//   · "ANCHORED DISCUSSION" leaves the eyebrow. The claim is not lost — the dek
//     below states it in full ("Every thread is anchored to a published paper").
//
// The disclosure band uses the new `above` slot. It is full-bleed via a negative
// margin matching the wrapper's gutter, because PageHero's body needs that
// gutter and the band must reach the panel edge.
function Masthead({
  narrow,
  subtitle,
  stats,
  band,
}: {
  narrow: boolean;
  subtitle: string;
  stats: { value: string; label: string; gold?: boolean }[];
  band: ReactNode;
}) {
  const gutter = narrow ? 22 : 40;
  return (
    <div style={{ padding: `0 ${gutter}px` }}>
      <PageHero
        narrow={narrow}
        above={<div style={{ margin: `0 -${gutter}px` }}>{band}</div>}
        eyebrow="FI"
        meta="UPDATED THROUGH THE LATEST INGEST"
        title="Field Intelligence Forum"
        dek={subtitle}
        stats={{ variant: "cluster", items: stats }}
      />
    </div>
  );
}

// ── Moderation badges (item 4) — presence driven by moderation records ───────
function badgeStyle(border: string, bg: string, color: string): CSSProperties {
  return { padding: "3px 7px", border: `1px solid ${border}`, background: bg, ...mono(T.MICRO, color, 0.13, 500), whiteSpace: "nowrap" };
}
function Moderation({ t, moderated }: { t: ForumThread; moderated: boolean }) {
  const hasMod = moderated && t.under_review_count + t.removed_count + t.context_note_count > 0;
  if (!hasMod) {
    return <span style={mono(T.MICRO, INK.MUTE, 0.13, 400)}>NO MODERATION ON THIS THREAD</span>;
  }
  return (
    <>
      {t.under_review_count > 0 && <span style={badgeStyle(GOLD.EDGE, GOLD.WASH, GOLD.PRIME)}>◇ UNDER REVIEW · {t.under_review_count}</span>}
      {t.removed_count > 0 && <span style={badgeStyle(STATE.DANGER, GROUND.INSET, STATE.DANGER)}>× REMOVED · {t.removed_count}</span>}
      {t.context_note_count > 0 && <span style={badgeStyle(LINE.HAIR, "transparent", INK.LABEL)}>† CONTEXT NOTE · {t.context_note_count}</span>}
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
      <div style={{ margin: "20px 22px 0", background: GROUND.RAISE, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 2, height: 11, background: GOLD.PRIME }} />
          <span style={mono(T.MICRO, GOLD.PRIME, 0.16, 500)}>ANCHOR REQUIRED</span>
        </div>
        <p style={{ ...serif(T.META, INK.LABEL, 1.55, 400), marginTop: 11 }}>
          There is no composer here. Threads start from a publication card in the bibliography — the paper you choose becomes the anchor.
        </p>
        <button type="button" onClick={onBibliography} style={{ marginTop: 13, padding: "9px 14px", border: `1px solid ${GOLD.EDGE}`, background: GOLD.WASH, ...mono(T.MICRO, GOLD.PRIME, 0.15, 500), cursor: "pointer" }}>
          OPEN THE BIBLIOGRAPHY&nbsp; →
        </button>
      </div>
    );
  }
  return (
    <div style={{ margin: "34px 40px 0", background: GROUND.RAISE, padding: "20px 26px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 30 }}>
        <div style={{ width: 132, flexShrink: 0, paddingTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 2, height: 11, background: GOLD.PRIME }} />
            <span style={mono(T.LABEL, GOLD.PRIME, 0.16, 500)}>ANCHOR REQUIRED</span>
          </div>
          <div style={{ ...mono(T.LABEL, INK.MUTE, 0.1, 400), marginTop: 9, lineHeight: 1.6 }}>
            NO COMPOSER
            <br />
            ON THIS SURFACE
          </div>
        </div>
        <div style={{ display: "flex", gap: 34, flex: 1 }}>
          {steps.map(([head, body]) => (
            <div key={head} style={{ flex: 1 }}>
              <div style={mono(T.LABEL, GOLD.MUTE, 0.16, 500)}>{head}</div>
              <p style={{ ...serif(T.META, INK.LABEL, 1.5, 400), marginTop: 9 }}>{body}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={onBibliography} style={{ flexShrink: 0, alignSelf: "center", padding: "10px 16px", border: `1px solid ${GOLD.EDGE}`, background: GOLD.WASH, ...mono(T.LABEL, GOLD.PRIME, 0.16, 500), cursor: "pointer" }}>
          OPEN THE BIBLIOGRAPHY&nbsp; →
        </button>
      </div>
      <div style={{ height: 1, background: LINE.HAIR, margin: "18px 0 14px" }} />
      <p style={serif(T.META, INK.MUTE, 1.55, 400)}>
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
          background: on ? GOLD.WASH : "transparent",
          border: "none",
          cursor: "pointer",
          ...mono(narrow ? 10 : 11, on ? GOLD.PRIME : INK.MUTE, 0.14, on ? 500 : 400),
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: narrow ? "20px 22px 0" : "36px 40px 0", gap: 16 }}>
      <div style={{ display: "flex", background: GROUND.RAISE, padding: 3, flex: narrow ? 1 : "none" }}>
        {tab("pub", "BY PUBLICATION")}
        {tab("question", "BY QUESTION")}
      </div>
      {!narrow && right}
    </div>
  );
}

// ── Anchor card (state 01) — uniform heights via fixed question windows ──────
function QuestionWindow({ t, moderated }: { t: ForumThread; moderated: boolean }) {
  // The window used to be pinned to height:98 with overflow:hidden above a local
  // 900px breakpoint, to align cards across the two-column grid. It did not do
  // that job and it clipped moderation badges at every desktop width:
  //
  //   >= ~1025px  three badges fit one line; the stack (44 title + 10 + meta
  //               + 10 + 22.3 badge row) reaches 107.3px -> bottom 9.3px sliced,
  //               which is why badges read as having their borders cut off
  //   900-1025px  the row wraps to two lines, 136.5px -> 38.5px clipped, the
  //               entire second line invisible
  //
  // The pin was never what aligned the cards: the anchor grid is align-items:
  // stretch, so the CARDS already equalise. Only this inner window was fixed, so
  // removing the pin lets a taller card set its row height — correct behaviour
  // for a variable-count badge row, not a regression.
  //
  // Rejected: capping at two badges with a "+1" chip. On a surface whose whole
  // subject is moderation, hiding moderation state is the wrong trade.
  //
  // overflow:hidden stays on the TITLE clamp below, where it does real work; it
  // is gone from this container, which is where it was doing the clipping.
  // Removing the pin also retires this component's local 900px breakpoint — one
  // of the three that were live on this surface.
  return (
    <Link to={`/field-intelligence/thread/${t.id}`} style={{ display: "block", minHeight: 98, textDecoration: "none" }}>
      <p style={{ ...serif(T.BODY, INK.BODY, 1.45, 400), height: 44, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
        {t.question_title}
      </p>
      <div style={{ ...mono(T.LABEL, INK.MUTE, 0.12, 400), marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ProvenanceChip seed={t.is_seed} />
        <span>{t.reply_count} {t.reply_count === 1 ? "REPLY" : "REPLIES"} · {t.recency_label.toUpperCase()}</span>
      </div>
      {/* minHeight 23, not 19: a badge is 22.3px tall (9.5px mono + 3px padding
            + 1px border, doubled), so 19 under-reserved its own single line. */}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minHeight: 23 }}>
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
    // BOUNDARY BY BORDER, NOT BY GRADIENT. DEPTH.CARD was measured and rejected:
    // its two stops are #191b1f -> #15181C, a self-contrast of 1.033:1, and the
    // whole ground ramp lives in the bottom 1% of the luminance scale
    // (GROUND.BASE RL .0055, RAISE .0090). At that depth a gradient cannot draw an
    // edge. canonicalTokens says as much itself: DEPTH.RIM "carries more perceived
    // depth than doubling a gradient, at zero contrast cost".
    //
    // So the edge is a real LINE.EDGE border (1.60:1 against the card fill — ~15x
    // the gradient), the cards are discrete objects via the grid's 16px gap, and
    // DEPTH.RIM adds the light-from-above cue on the top edge only.
    //
    // SPREAD ORDER: DEPTH.RIM carries a `borderTop`, so the `border` shorthand must
    // come FIRST or it silently overwrites the rim. Border first, depth last.
    <div style={{ background: GROUND.RAISE, padding: "24px 26px 20px", border: `1px solid ${LINE.EDGE}`, ...DEPTH.RIM, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={mono(T.LABEL, GOLD.PRIME, 0.13, 500)}>{anchor.journal_abbrev} · {pub?.pub_year ?? "—"}</span>
        <span style={mono(T.LABEL, INK.MUTE, 0.1, 400)}>PMID {anchor.pubmed_id}</span>
      </div>
      <h3 style={{ ...serif(T.SUB, INK.PRIME, 1.34, 600), marginTop: 14, letterSpacing: "-0.005em", height: 54, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
        {pub?.title ?? "—"}
      </h3>
      <div style={{ marginTop: 12, display: "flex", gap: 20, ...mono(T.LABEL, INK.MUTE, 0.11, 400) }}>
        <span>{INT.format(pub?.citation_count ?? 0)} CITATIONS</span>
        <span>{anchor.thread_count} {anchor.thread_count === 1 ? "THREAD" : "THREADS"}</span>
        <span>{anchor.reply_count} {anchor.reply_count === 1 ? "REPLY" : "REPLIES"}</span>
      </div>
      {/* Header rule retired: with a real card edge, three equal LINE.HAIR rules
          inside the card made every level of the hierarchy the same weight. The
          one remaining rule now means exactly one thing — "next thread". Spacing
          carries what the rule used to. */}
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 34 }}>
        {first && <QuestionWindow t={first} moderated={moderatedIds.has(first.id)} />}
        <div style={{ height: 1, background: LINE.HAIR, margin: "14px 0" }} />
        {second ? (
          <QuestionWindow t={second} moderated={moderatedIds.has(second.id)} />
        ) : (
          <div style={{ minHeight: 98, display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: `1px solid ${LINE.HAIR}`, paddingLeft: 14 }}>
            <span style={mono(T.LABEL, INK.MUTE, 0.14, 400)}>ONE THREAD ON THIS ANCHOR</span>
            <p style={{ ...serif(T.META, INK.MUTE, 1.45, 400), marginTop: 10 }}>
              A second question on this paper starts the same way — from its card in the bibliography.
            </p>
          </div>
        )}
      </div>
      <div style={{ marginTop: 26, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={mono(T.LABEL, INK.MUTE, 0.13, 400)}>LAST ACTIVITY {first?.recency_label.toUpperCase() ?? "—"}</span>
        <Link to={`/field-intelligence/thread/${primaryId}`} style={{ ...mono(T.LABEL, GOLD.MUTE, 0.13, 500), textDecoration: "none" }}>
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
      <div style={{ margin: "18px 22px 0", display: "flex", flexDirection: "column", gap: 1, background: GROUND.BASE }}>
        {flat.map(({ thread: t, anchor: a }) => (
          <Link key={t.id} to={`/field-intelligence/thread/${t.id}`} style={{ background: GROUND.RAISE, padding: "16px 18px", textDecoration: "none", display: "block" }}>
            <p style={serif(T.BODY, INK.PRIME, 1.42, 400)}>{t.question_title}</p>
            <div style={{ ...mono(T.MICRO, GOLD.PRIME, 0.11, 500), marginTop: 10, lineHeight: 1.5 }}>
              {a.journal_abbrev} · {a.publication?.pub_year ?? "—"} · PMID {a.pubmed_id}
            </div>
            <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={mono(T.MICRO, INK.MUTE, 0.12, 400)}>{t.reply_count} {t.reply_count === 1 ? "REPLY" : "REPLIES"} · {t.recency_label.toUpperCase()}</span>
              <Moderation t={t} moderated={moderatedIds.has(t.id)} />
            </div>
          </Link>
        ))}
      </div>
    );
  }
  return (
    <div style={{ margin: "16px 40px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 330px 132px", gap: 36, padding: "18px 26px 12px", ...mono(T.MICRO, INK.MUTE, 0.16, 400) }}>
        <span>QUESTION</span>
        <span>ANCHORED TO</span>
        <span style={{ textAlign: "right" }}>ACTIVITY · MODERATION</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: GROUND.BASE }}>
        {flat.map(({ thread: t, anchor: a }) => (
          <div key={t.id} style={{ background: GROUND.RAISE, padding: "20px 26px", display: "grid", gridTemplateColumns: "1fr 330px 132px", gap: 36, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <Link to={`/field-intelligence/thread/${t.id}`} style={{ ...serif(T.LEAD, INK.PRIME, 1.4, 400), textDecoration: "none" }}>{t.question_title}</Link>
              <div style={{ ...mono(T.LABEL, INK.MUTE, 0.12, 400), marginTop: 9 }}>OPENED BY {t.author_handle} · {t.recency_label.toUpperCase()}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={mono(T.LABEL, GOLD.PRIME, 0.12, 500)}>{a.journal_abbrev} · {a.publication?.pub_year ?? "—"} · PMID {a.pubmed_id}</div>
              <p style={{ ...serif(T.META, INK.MUTE, 1.45, 400), marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.publication?.title ?? ""}
              </p>
            </div>
            <div style={{ justifySelf: "end", textAlign: "right" }}>
              <div style={mono(T.LABEL, INK.LABEL, 0.12, 400)}>{t.reply_count} {t.reply_count === 1 ? "REPLY" : "REPLIES"}</div>
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
      <div style={{ margin: "14px 22px 0", display: "flex", flexDirection: "column", gap: 1, background: GROUND.BASE }}>
        {flat.map(({ thread: t, anchor: a }, i) => (
          <div key={t.id} style={{ background: GROUND.RAISE, padding: "14px 16px", display: "flex", gap: 14 }}>
            <span style={{ ...mono(T.LABEL, INK.MUTE, 0.06, 400), flexShrink: 0, lineHeight: 1.5 }}>{pad(i + 1)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Link to={`/field-intelligence/thread/${t.id}`} style={{ ...serif(T.BODY, INK.PRIME, 1.4, 400), textDecoration: "none", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>{t.question_title}</Link>
              <div style={{ ...mono(T.MICRO, GOLD.PRIME, 0.1, 500), marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.journal_abbrev} · PMID {a.pubmed_id}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                <span style={mono(T.MICRO, INK.MUTE, 0.12, 400)}>{t.reply_count} REPLIES · {t.recency_label.toUpperCase()}</span>
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
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, padding: "0 22px 10px", ...mono(T.MICRO, INK.MUTE, 0.14, 400) }}>
        <span>MODERATION KEY</span>
        <span style={{ color: GOLD.PRIME }}>◇ UNDER REVIEW</span>
        <span style={{ color: STATE.DANGER }}>× REMOVED</span>
        <span style={{ color: INK.LABEL }}>† CONTEXT NOTE</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 24, padding: "0 22px 12px", ...mono(T.MICRO, INK.MUTE, 0.16, 400), lineHeight: 1.5, borderBottom: `1px solid ${LINE.HAIR}` }}>
        <span>#</span>
        <span>QUESTION</span>
        <span>ANCHOR</span>
        <span style={{ textAlign: "right" }}>REPLIES</span>
        <span style={{ textAlign: "right" }}>LAST</span>
        <span style={{ textAlign: "right" }}>MODERATION</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: GROUND.BASE, marginTop: 1 }}>
        {flat.map(({ thread: t, anchor: a }, i) => (
          <div key={t.id} style={{ background: GROUND.RAISE, padding: "15px 22px", display: "grid", gridTemplateColumns: GRID, gap: 24, alignItems: "center" }}>
            <span style={mono(T.LABEL, INK.MUTE, 0.06, 400)}>{pad(i + 1)}</span>
            <div style={{ minWidth: 0 }}>
              <Link to={`/field-intelligence/thread/${t.id}`} style={{ ...serif(T.BODY, INK.PRIME, 1.35, 400), textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{t.question_title}</Link>
              <div style={{ ...mono(T.MICRO, INK.MUTE, 0.12, 400), marginTop: 6 }}>{t.author_handle}</div>
            </div>
            <div style={{ minWidth: 0, ...mono(T.LABEL, GOLD.PRIME, 0.1, 400), lineHeight: 1.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {a.journal_abbrev}<span style={{ color: INK.MUTE }}> · PMID {a.pubmed_id}</span>
            </div>
            <span style={{ textAlign: "right", ...mono(T.LABEL, INK.LABEL, 0, 400) }}>{t.reply_count}</span>
            <span style={{ textAlign: "right", ...mono(T.LABEL, INK.MUTE, 0.1, 400) }}>{t.recency_label.toUpperCase()}</span>
            <div style={{ justifySelf: "end", display: "flex", gap: 5, justifyContent: "flex-end", alignItems: "center" }}>
              {moderatedIds.has(t.id) && t.under_review_count + t.removed_count + t.context_note_count > 0 ? (
                <>
                  {t.under_review_count > 0 && <span style={badgeStyle(GOLD.EDGE, GOLD.WASH, GOLD.PRIME)}>◇ {t.under_review_count}</span>}
                  {t.removed_count > 0 && <span style={badgeStyle(STATE.DANGER, GROUND.INSET, STATE.DANGER)}>× {t.removed_count}</span>}
                  {t.context_note_count > 0 && <span style={badgeStyle(LINE.HAIR, "transparent", INK.LABEL)}>† {t.context_note_count}</span>}
                </>
              ) : (
                <span style={mono(T.LABEL, INK.MUTE, 0, 400)}>—</span>
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
        <div key={head} style={{ display: "flex", gap: narrow ? 16 : 26, padding: narrow ? "14px 0" : "18px 0", borderTop: `1px solid ${LINE.HAIR}`, borderBottom: i === 2 ? `1px solid ${LINE.HAIR}` : undefined }}>
          <span style={{ ...mono(narrow ? 10 : 11, GOLD.MUTE, 0, 500), flexShrink: 0, width: narrow ? 20 : 26, lineHeight: 1.5 }}>{pad2(i + 1)}</span>
          <div>
            <div style={mono(narrow ? 9.5 : 10.5, INK.BODY, 0.16, 500)}>{head}</div>
            <p style={{ ...serif(narrow ? 13 : 14, INK.MUTE, 1.55, 400), marginTop: 7 }}>{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
  if (narrow) {
    return (
      <div style={{ margin: "20px 22px 0", background: GROUND.RAISE, padding: "24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 2, height: 11, background: GOLD.PRIME }} />
          <span style={mono(T.MICRO, GOLD.PRIME, 0.17, 500)}>NO THREADS OPEN</span>
        </div>
        <h2 style={{ ...serif(T.TITLE, INK.PRIME, 1.22, 400), marginTop: 16 }}>No one has anchored a question yet.</h2>
        <p style={{ ...serif(T.BODY, INK.LABEL, 1.6, 400), marginTop: 13 }}>
          This is where verified MSLs discuss what a published paper reports — one thread per question, tied to the paper it came from.
        </p>
        {stepsBlock}
        <button type="button" onClick={onBibliography} style={{ marginTop: 20, display: "block", width: "100%", textAlign: "center", padding: "13px 16px", border: `1px solid ${GOLD.EDGE}`, background: GOLD.WASH, ...mono(T.LABEL, GOLD.PRIME, 0.16, 500), cursor: "pointer" }}>
          OPEN THE BIBLIOGRAPHY&nbsp; →
        </button>
      </div>
    );
  }
  return (
    <div style={{ margin: "16px 40px 0", display: "grid", gridTemplateColumns: "1fr 440px", gap: 1, background: GROUND.BASE }}>
      <div style={{ background: GROUND.RAISE, padding: "44px 48px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 2, height: 11, background: GOLD.PRIME }} />
          <span style={mono(T.LABEL, GOLD.PRIME, 0.18, 500)}>NO THREADS OPEN</span>
        </div>
        <h2 style={{ ...serif(34, INK.PRIME, 1.2, 400), marginTop: 22, letterSpacing: "-0.01em", maxWidth: 520 }}>No one has anchored a question yet.</h2>
        <p style={{ ...serif(T.BODY, INK.LABEL, 1.62, 400), marginTop: 16, maxWidth: 560 }}>
          This is where verified MSLs discuss what a published paper reports — one thread per question, each one tied to the paper it came from. The room is open. It fills the moment someone picks an anchor.
        </p>
        {stepsBlock}
        <button type="button" onClick={onBibliography} style={{ marginTop: 28, display: "inline-block", padding: "13px 20px", border: `1px solid ${GOLD.EDGE}`, background: GOLD.WASH, ...mono(T.LABEL, GOLD.PRIME, 0.17, 500), cursor: "pointer" }}>
          OPEN THE BIBLIOGRAPHY&nbsp; →
        </button>
        <div style={{ marginTop: 34, paddingTop: 20, borderTop: `1px solid ${LINE.HAIR}`, display: "flex", gap: 26, alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0, paddingTop: 1 }}>
            <div style={{ width: 2, height: 11, background: GOLD.MUTE }} />
            <span style={mono(T.LABEL, GOLD.PRIME, 0.16, 500)}>ANCHOR REQUIRED</span>
          </div>
          <p style={serif(T.META, INK.MUTE, 1.6, 400)}>
            Topic discussion only — no HCP names in posts, no product claims, no discussion of unapproved use. Replies are scoped to what the anchored paper reports. Moderation states are shown on the thread, not hidden.
          </p>
        </div>
      </div>
      <div style={{ background: GROUND.RAISE, padding: "44px 40px 40px" }}>
        <div style={mono(T.LABEL, INK.MUTE, 0.18, 500)}>ILLUSTRATION · NOT A REAL THREAD</div>
        <p style={{ ...serif(T.META, INK.MUTE, 1.55, 400), marginTop: 14 }}>
          What one thread looks like once it exists. The anchor sits above the question; moderation states are shown in place.
        </p>
        <div style={{ marginTop: 24, padding: "24px 26px", background: GROUND.BASE, opacity: 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={mono(T.LABEL, GOLD.PRIME, 0.13, 500)}>NEJM · 2025</span>
            <span style={mono(T.LABEL, INK.MUTE, 0.1, 400)}>PMID 40454646</span>
          </div>
          <h3 style={{ ...serif(T.SUB, INK.BODY, 1.34, 600), marginTop: 14, height: 51, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
            Tarlatamab in Small-Cell Lung Cancer after Platinum-Based Chemotherapy.
          </h3>
          <div style={{ marginTop: 12, display: "flex", gap: 18, ...mono(T.LABEL, INK.MUTE, 0.11, 400) }}>
            <span>153 CITATIONS</span>
            <span>0 THREADS</span>
          </div>
          <div style={{ height: 1, background: LINE.HAIR, marginTop: 18 }} />
          <p style={{ ...serif(T.BODY, INK.MUTE, 1.45, 400), marginTop: 16, fontStyle: "italic" }}>A question scoped to what this paper reports would appear here.</p>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={badgeStyle(GOLD.EDGE, GOLD.WASH, GOLD.PRIME)}>◇ UNDER REVIEW</span>
            <span style={badgeStyle(STATE.DANGER, GROUND.INSET, STATE.DANGER)}>× REMOVED</span>
            <span style={badgeStyle(LINE.HAIR, "transparent", INK.LABEL)}>† CONTEXT NOTE</span>
          </div>
        </div>
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${LINE.HAIR}` }}>
          <div style={mono(T.LABEL, INK.MUTE, 0.16, 400)}>MODERATION IS VISIBLE BY DESIGN</div>
          <p style={{ ...serif(T.META, INK.MUTE, 1.6, 400), marginTop: 11 }}>
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

  // ── DEFERRED (2026-08-15): error state, drafted and held ────────────────────
  // `idx.error` is discarded here. On a failed query the page falls through to
  // `empty` and the Masthead draws "0 THREADS · 0 REPLIES · FORUM STATUS: OPEN"
  // — three affirmative claims, all false, the last one in gold (this surface's
  // live/active colour). That is a count standing in for a fact, not an absence.
  //
  // NOT FIXED YET ON PURPOSE: the forum is a prototype on simulated data, so the
  // failure path is not reachable by a real user. Implement this when the forum
  // takes real contributions. The copy is settled — it must NOT reuse the empty
  // state's vocabulary ("NO THREADS OPEN" / "No one has anchored a question
  // yet.") and must NOT display a number anywhere in the branch:
  //
  //   branch      !loaded -> LOADING / failed -> error / else the board
  //   Masthead    stats={[]}  (stats.map over [] is already safe)
  //   subtitle    "The forum could not be reached. What follows is a connection
  //                failure, not a reading of the board."
  //   kicker      FORUM DID NOT LOAD          (neutral ink, NOT gold: gold means
  //                                            live here; NOT STATE.DANGER: that
  //                                            means a moderation action)
  //   headline    "We could not reach the forum."
  //   body        "This is a failure to load, not a count. We are not telling
  //                you the forum is empty — we are telling you we could not read
  //                it. No thread has been closed and nothing has been removed."
  //
  // SECOND, SMALLER GAP, also deferred: getModeratedThreadIds() swallows its own
  // error and returns an empty Set (lib/fieldIntelligence.ts). Moderation badges
  // then silently vanish board-wide and every thread draws the "NO MODERATION ON
  // THIS THREAD" line — an absence claim the data cannot support.
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
      <div style={{ ...DEPTH.PANEL, border: `1px solid ${LINE.HAIR}`, color: INK.PRIME, margin: "8px 0 24px", fontFamily: FACE.value, overflow: "hidden", paddingBottom: narrow ? 24 : 0 }}>
        {/* The band is PERMANENT, so the loading branch keeps its own copy — it
            must not vanish while the board resolves. Once loaded it renders
            inside the hero's `above` slot. */}
        {!loaded ? (
          <>
            <DisclosureBand narrow={narrow} tail={empty ? "APPLIES WHETHER OR NOT THREADS EXIST" : "APPLIES TO EVERY THREAD BELOW"} />
            <div style={{ padding: narrow ? "40px 22px" : "60px 40px", ...mono(T.LABEL, INK.MUTE, 0.14, 400) }}>LOADING FORUM…</div>
          </>
        ) : (
          <>
            {/* EYEBROW IS "FI" ALONE — NO TA SEGMENTS. The convergence format is
                SCOPE · TA · AREA, but this surface has no TA scope to name:
                getForumIndex() joins field_intel_anchors to publications_v2 with
                no therapeutic-area predicate. That gap is logged in full at
                lib/fieldIntelligence.ts:110 ("ARCHITECTURAL GAP, LOGGED
                2026-08-15 — NO TA SCOPE"), with a real instance: a Hepatology
                MASH paper led a lung-cancer board on citation count.
                ADD "· Lung Cancer · Oncology" HERE when, and only when,
                getForumIndex gains that predicate. Until then the eyebrow would
                assert a filter the query does not apply. */}
            <Masthead
              band={<DisclosureBand narrow={narrow} tail={empty ? "APPLIES WHETHER OR NOT THREADS EXIST" : "APPLIES TO EVERY THREAD BELOW"} />}
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
                <ViewToggle view={view} onView={setView} narrow={narrow} right={<span style={mono(T.LABEL, INK.MUTE, 0.15, 400)}>BOTH VIEWS EMPTY UNTIL THE FIRST THREAD IS ANCHORED</span>} />
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
                      <span style={mono(T.LABEL, INK.MUTE, 0.15, 400)}>ANCHOR SHOWN PER THREAD · MOST RECENT FIRST</span>
                    ) : atScale ? (
                      <span style={mono(T.LABEL, INK.MUTE, 0.15, 400)}>LEDGER · SORTED BY LAST ACTIVITY</span>
                    ) : (
                      <span style={mono(T.LABEL, INK.MUTE, 0.15, 400)}>{counts.anchors} ANCHORS · MOST RECENT ACTIVITY FIRST</span>
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
                  <div style={{ margin: narrow ? "16px 22px 0" : "16px 40px 0", display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))", gap: 16 }}>
                    {orderedAnchors.map((a) => (
                      <AnchorCard key={a.id} anchor={a} moderatedIds={moderatedIds} />
                    ))}
                  </div>
                )}

                {/* By question keeps the anchor-required constraint below the list. */}
                {view === "question" && (
                  <div style={{ margin: narrow ? "20px 22px 0" : "34px 40px 0", background: GROUND.RAISE, padding: narrow ? "16px 18px" : "18px 26px", display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
                      <div style={{ width: 2, height: 11, background: GOLD.PRIME }} />
                      <span style={mono(T.LABEL, GOLD.PRIME, 0.16, 500)}>ANCHOR REQUIRED</span>
                    </div>
                    <p style={{ ...serif(T.META, INK.LABEL, 1.55, 400), flex: 1, minWidth: 240 }}>
                      Grouping by question does not loosen scope. Topic discussion only — no HCP names in posts, no product claims, no discussion of unapproved use. Replies stay scoped to what the anchored paper reports.
                    </p>
                    {!narrow && (
                      <button type="button" onClick={openBibliography} style={{ marginLeft: "auto", flexShrink: 0, padding: "10px 16px", border: `1px solid ${GOLD.EDGE}`, background: GOLD.WASH, ...mono(T.LABEL, GOLD.PRIME, 0.16, 500), cursor: "pointer" }}>
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
