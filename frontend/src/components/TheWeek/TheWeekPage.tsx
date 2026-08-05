// The Week — its own surface. Layout authority: docs/design/The Week.dc.html
// (project 132e095e). Reached from Home's entry line at route /me/week; it does
// NOT take a nav slot (the eight-item bar is full — see NavBar.tsx).
//
// Three states, all rendered from loadTheWeek():
//   • quiet  — the primary state. WHAT WAS CHECKED + the last thing that happened
//              + weeks behind. No blank panel, no zero, no apology.
//   • normal — promoted events (ordered by author position → TA → date), then
//              ALSO ON THE RECORD (demoted, not hidden), then the rail.
//   • busy   — a congress week; the meeting groups to one entry.
// Every event owes exactly one control: ATTACH TO A FOLLOW-UP. An event never
// becomes a task, and this surface performs no writes. Absence phrases come from
// the frame's own vocabulary (lib/theWeek.ts ABSENCE) rather than being omitted.
// No fabricated events; social silence is stated as our coverage, not theirs.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../AppLayout";
import PageHero from "../PageHero";
import { supabase } from "../../lib/supabase";
import { getCurrentUser } from "../../lib/authHelpers";
import { taIdForApiSlug } from "../../lib/api";
import { taLabelToApiSlug, taSlugToLabel } from "../../lib/routeSlugs";
import { getTrackedHcpIds } from "../../lib/watchlists";
import { useIsDesktop } from "../../lib/useIsDesktop";
import {
  loadTheWeek,
  positionPhrase,
  ABSENCE,
  RANK_SNAPSHOT_DATE,
  type TheWeek,
  type TrackedPerson,
  type PublicationEvent,
  type TrialEvent,
  type CongressEvent,
} from "../../lib/theWeek";
import { GOLD as GOLD_T, GROUND, LINE } from "../../lib/designTokens";

// ── palette + type (from the frame) ──
// Commit C 2026-08-05: warm board joins the Pulse scheme — g2 board, g1
// wells, l1 edges, l0 interior rules.
const PAGE = GROUND.g2, CARD2 = GROUND.g1;
const BORDER = LINE.l1, BORDER2 = LINE.l0, HAIR = LINE.l0;
// #C9A45E (soft-gold quartet) folded into GOLD.bright 2026-08-05; GOLD2 and
// GOLD_EDGE are per-surface values outside the convergence ledger.
const GOLD = GOLD_T.bright, GOLD2 = "#E6C588", GOLD_EDGE = "#4A422C";
const INK1 = "#EDE8DD", INK2 = "#C4BEB0", INK3 = "#B4AE9F", MID = "#8F8A7C";
const MID2 = "#7E7869", DIM = "#6E6A60";
const SERIF = "Newsreader, Georgia, serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const mono = (size: number, color = MID2, ls = ".12em", weight = 400) => ({
  font: `${weight} ${size}px/1 ${MONO}`,
  letterSpacing: ls,
  color,
});
const serif = (size: number, color = INK1, lh = 1.3, weight = 400) => ({
  font: `${weight} ${size}px/${lh} ${SERIF}`,
  color,
});

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
function fmtSnapshot(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

async function loadTrackedPeople(userId: string): Promise<TrackedPerson[]> {
  const idSet = await getTrackedHcpIds(userId);
  const ids = [...idSet];
  if (ids.length === 0) return [];
  const [{ data: hcps }, { data: ranks }] = await Promise.all([
    supabase
      .from("hcps_v2")
      .select("id, first_name, last_name, institution_canonical, institution_normalized, nppes_practice_state")
      .in("id", ids),
    supabase.from("hcp_rising_star_ranks_v3").select("hcp_id, us_rank").in("hcp_id", ids).not("us_rank", "is", null),
  ]);
  const rankMap = new Map<string, number>();
  for (const r of ranks ?? []) {
    const row = r as { hcp_id: string; us_rank: number };
    const cur = rankMap.get(row.hcp_id);
    if (cur == null || row.us_rank < cur) rankMap.set(row.hcp_id, row.us_rank);
  }
  return (hcps ?? []).map((h) => {
    const r = h as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      institution_canonical: string | null;
      institution_normalized: string | null;
      nppes_practice_state: string | null;
    };
    return {
      hcp_id: r.id,
      relationship_id: null,
      name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Unknown",
      institution: r.institution_canonical ?? r.institution_normalized ?? null,
      state: r.nppes_practice_state ?? null,
      us_rank: rankMap.get(r.id) ?? null,
    };
  });
}

export default function TheWeekPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [taId, setTaId] = useState<string | undefined>(undefined);
  const [week, setWeek] = useState<TheWeek | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const user = await getCurrentUser();
        if (!user || cancelled) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data: profile } = await supabase
          .from("msl_profiles")
          .select("default_ta_slug, default_indication_slug")
          .eq("user_id", user.id)
          .maybeSingle();
        const parentSlug = profile?.default_ta_slug ?? "oncology";
        const indicationSlug = profile?.default_indication_slug ?? taLabelToApiSlug(taSlugToLabel(parentSlug));
        const resolvedTaId =
          taIdForApiSlug(indicationSlug) ?? taIdForApiSlug(taLabelToApiSlug(taSlugToLabel(parentSlug)));
        if (!cancelled) setTaId(resolvedTaId);

        const people = await loadTrackedPeople(user.id);
        const w = await loadTheWeek(user.id, people, new Date(), resolvedTaId);
        if (!cancelled) setWeek(w);
      } catch (err) {
        console.warn("TheWeekPage: load error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goFollowUps = () => navigate("/me/follow-ups");
  const goHcp = (id: string) => navigate(`/hcp/${id}`);

  const content = useMemo(() => {
    if (loading) return <Centered>Loading the week…</Centered>;
    if (!week) return <Centered>The Week could not be loaded.</Centered>;
    return (
      <WeekBody week={week} isDesktop={isDesktop} onFollowUps={goFollowUps} onHcp={goHcp} />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, week, isDesktop]);

  return (
    <AppLayout currentTaId={taId} onSearchSelect={(hcpId) => navigate(`/hcp/${hcpId}`)}>
      <style>{`.fmweek a{color:${GOLD};text-decoration:none}.fmweek a:hover{color:${GOLD2}}.fmweek-link{cursor:pointer}.fmweek-btn{cursor:pointer}`}</style>
      <div className="fmweek" style={{ background: PAGE, fontFamily: SERIF, color: INK1, marginTop: 12, marginBottom: 24, border: `1px solid ${BORDER}` }}>
        {content}
      </div>
    </AppLayout>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ ...mono(12, MID2), padding: "60px 0", textAlign: "center" }}>{children}</div>;
}

// ── the body: header + state-specific column + rail ──
function WeekBody({
  week,
  isDesktop,
  onFollowUps,
  onHcp,
}: {
  week: TheWeek;
  isDesktop: boolean;
  onFollowUps: () => void;
  onHcp: (id: string) => void;
}) {
  const eventCount = week.publications.length + week.trials.length + week.congress.reduce((n, c) => n + c.presenter_count, 0);

  const headline =
    week.state === "quiet"
      ? "Nothing new for the people you track."
      : week.state === "busy"
        ? `${week.congress[0]?.congress_label ?? "Congress"} fortnight. ${countPeople(week)} of your ${week.tracked_total} appear.`
        : eventCount > 0
          ? `${spellCount(eventCount)} for the people you track.`
          : `${spellCount(week.rank_movement.movers.length)} moved among the people you track.`;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 360px" : "1fr", gap: isDesktop ? 56 : 30, padding: isDesktop ? "48px 40px 56px" : "26px 18px 34px" }}>
        {/* MAIN COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 30, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {/* Hero — canonical H1 (PageHero, Commit B). The honest window label
                rides the meta slot; the fortnight counters become the cluster. */}
            <PageHero
              narrow={!isDesktop}
              eyebrow="The Fortnight"
              meta={`${week.window_label} · + RANK SINCE ${fmtSnapshot(RANK_SNAPSHOT_DATE)}`}
              title={headline}
              maxTitleCh={24}
              dek={week.state === "quiet" ? `Fourteen days, ${week.tracked_total} people. ${ABSENCE.publications} ${ABSENCE.trials} ${ABSENCE.congress}` : undefined}
              stats={[
                { value: String(week.tracked_total), label: "TRACKED" },
                { value: String(eventCount), label: "EVENTS · 14D" },
                { value: String(week.rank_movement.movers.length), label: "RANK MOVERS", gold: week.rank_movement.movers.length > 0 },
              ]}
            />
            {week.state === "quiet" ? null : (
              <div style={{ ...mono(11, DIM, ".12em"), lineHeight: 1.7, maxWidth: "80ch" }}>
                PUBLICATIONS: NEW LINKS OVER THE LAST 14 DAYS, ORDERED BY AUTHOR POSITION, THEN YOUR THERAPEUTIC AREA, THEN DATE. RANK: INDEX MOVEMENT SINCE {week.rank_movement.snapshot_date}. NOT A SCORE.
              </div>
            )}
          </div>

          {week.state === "quiet" ? (
            <QuietBody week={week} isDesktop={isDesktop} />
          ) : (
            <EventsBody week={week} isDesktop={isDesktop} onFollowUps={onFollowUps} onHcp={onHcp} />
          )}
        </div>

        {/* RAIL — always renders WHAT WAS CHECKED, portfolio, people */}
        {isDesktop ? (
          <aside style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <WhatWasChecked week={week} />
            <Portfolio week={week} />
            <PeopleInWeek week={week} onHcp={onHcp} />
          </aside>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <WhatWasChecked week={week} />
            <Portfolio week={week} />
          </div>
        )}
      </div>
    </div>
  );
}

function countPeople(week: TheWeek): string {
  const ids = new Set<string>();
  week.publications.forEach((e) => ids.add(e.hcp_id));
  week.trials.forEach((e) => ids.add(e.hcp_id));
  week.congress.forEach((c) => c.presenters.forEach((p) => ids.add(p.hcp_id)));
  return spellNumber(ids.size);
}

// ── QUIET (rare now — only when neither a new link nor a rank move exists) ──
function QuietBody({ week, isDesktop }: { week: TheWeek; isDesktop: boolean }) {
  return (
    <>
      <div style={{ height: 1, background: HAIR }} />
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={mono(11, MID2, ".16em")}>THE LAST THING THAT HAPPENED</div>
        {week.last_event ? (
          <div style={{ background: CARD2, border: `1px solid ${BORDER2}`, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={mono(11, "#8C7C4E", ".16em")}>PUBLICATION</span>
              <span style={mono(11, DIM, ".1em")}>{fmtDay(week.last_event.date).toUpperCase()}</span>
            </div>
            <div style={serif(isDesktop ? 22 : 19)}>
              {shortName(week.last_event.hcp_name)} — {week.last_event.kind === "publication" ? positionPhrase(week.last_event as PublicationEvent) : "trial"}
            </div>
            <div style={{ ...serif(isDesktop ? 18 : 16, INK3, 1.5, 400), fontStyle: "italic", maxWidth: "62ch" }}>
              {week.last_event.title}
            </div>
            {week.last_event.kind === "publication" ? (
              <div style={mono(11, DIM, ".1em")}>
                {(week.last_event as PublicationEvent).journal?.toUpperCase() ?? "JOURNAL"}
                {(week.last_event as PublicationEvent).pubmed_id ? ` · PMID ${(week.last_event as PublicationEvent).pubmed_id}` : ""}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ ...serif(16, MID, 1.6, 300), fontStyle: "italic" }}>No prior event on record for this set.</div>
        )}
      </section>
    </>
  );
}

// ── NORMAL / BUSY ──
function EventsBody({ week, isDesktop, onFollowUps, onHcp }: { week: TheWeek; isDesktop: boolean; onFollowUps: () => void; onHcp: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {week.congress.map((c) => (
        <CongressCard key={c.congress_slug} c={c} isDesktop={isDesktop} />
      ))}
      {week.publications.map((e) => (
        <PublicationCard key={`${e.publication_id}:${e.hcp_id}`} e={e} week={week} isDesktop={isDesktop} onFollowUps={onFollowUps} />
      ))}
      {week.trials.map((e) => (
        <TrialCard key={`${e.trial_id}:${e.hcp_id}`} e={e} week={week} isDesktop={isDesktop} onFollowUps={onFollowUps} />
      ))}
      {week.publications.length + week.trials.length + week.congress.length === 0 ? (
        <div style={{ ...serif(17, MID, 1.6, 300), fontStyle: "italic", padding: "4px 0" }}>
          {ABSENCE.publications} {ABSENCE.trials} The movement below is a dated rank comparison, not this fortnight's events.
        </div>
      ) : null}
      {week.rank_movement.movers.length ? <RankMovement week={week} isDesktop={isDesktop} onHcp={onHcp} /> : null}
      {week.demoted.length ? <AlsoOnRecord week={week} isDesktop={isDesktop} /> : null}
    </div>
  );
}

// ── RANK MOVEMENT — explicitly dated 8-week comparison (Home-consistent). Index
// movement, not rank delta; us_rank is current position only. ──
function RankMovement({ week, isDesktop, onHcp }: { week: TheWeek; isDesktop: boolean; onHcp: (id: string) => void }) {
  const movers = week.rank_movement.movers;
  return (
    <section style={{ background: CARD2, border: `1px solid ${BORDER}`, padding: isDesktop ? "26px 30px" : "22px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={mono(11, GOLD, ".16em")}>RANK MOVEMENT</span>
        <span style={mono(11, DIM, ".1em")}>SINCE {fmtSnapshot(week.rank_movement.snapshot_date)} · {movers.length} RISER{movers.length === 1 ? "" : "S"}</span>
      </div>
      <div style={{ ...serif(15, MID, 1.5, 300), maxWidth: "72ch", fontStyle: "italic" }}>
        An eight-week comparison against the {fmtSnapshot(week.rank_movement.snapshot_date)} snapshot — the only one we hold — not a weekly move. Index movement; position shown is current.
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {movers.map((m, i) => (
          <div
            key={m.hcp_id}
            className="fmweek-link"
            onClick={() => onHcp(m.hcp_id)}
            style={{ display: "grid", gridTemplateColumns: isDesktop ? "70px 1fr 150px" : "56px 1fr", gap: 16, padding: "13px 0", borderTop: i === 0 ? undefined : `1px solid ${BORDER2}`, alignItems: "baseline", cursor: "pointer" }}
          >
            <div style={{ font: `400 20px/1 ${MONO}`, color: GOLD }}>#{m.now_rank}</div>
            <div style={serif(18, INK1)}>{m.name}</div>
            {isDesktop ? (
              <div style={{ ...mono(11, INK3, ".06em"), textAlign: "right" }}>
                INDEX {m.idx_now.toFixed(1)} <span style={{ color: "#9DBFA4" }}>▲{m.idx_delta.toFixed(2)}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AttachControl({ week, hcpId, onFollowUps }: { week: TheWeek; hcpId: string; onFollowUps: () => void }) {
  const open = week.open_follow_ups[hcpId];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 4, flexWrap: "wrap" }}>
      <span
        className="fmweek-btn"
        onClick={onFollowUps}
        style={{ ...mono(10, GOLD, ".14em"), border: `1px solid ${GOLD_EDGE}`, padding: "9px 15px" }}
      >
        ATTACH TO A FOLLOW-UP
      </span>
      {open ? (
        <span style={mono(10, "#8C7C4E", ".1em")}>
          OPEN: {open.body.slice(0, 40).toUpperCase()}{open.due_at ? ` · ${fmtDay(open.due_at).toUpperCase()}` : ""}
        </span>
      ) : (
        <span style={mono(10, DIM, ".12em")}>NO OPEN FOLLOW-UP FOR THIS HCP</span>
      )}
    </div>
  );
}

function PublicationCard({ e, week, isDesktop, onFollowUps }: { e: PublicationEvent; week: TheWeek; isDesktop: boolean; onFollowUps: () => void }) {
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORDER}`, padding: isDesktop ? "28px 32px" : "22px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <span style={mono(11, GOLD, ".16em")}>PUBLICATION</span>
          <span style={mono(11, DIM, ".1em")}>{fmtDay(e.date).toUpperCase()}</span>
        </div>
        <div style={serif(isDesktop ? 25 : 20)}>
          {shortName(e.hcp_name)} — {positionPhrase(e)}
        </div>
        <div style={{ ...serif(isDesktop ? 19 : 16, INK3, 1.45, 400), fontStyle: "italic", maxWidth: "62ch" }}>{e.title}</div>
        <div style={mono(11, DIM, ".1em")}>
          {e.journal?.toUpperCase() ?? "JOURNAL"}
          {e.total_authors ? ` · ${e.total_authors} AUTHORS` : ""}
          {e.pubmed_id ? ` · PMID ${e.pubmed_id}` : ""}
        </div>
        <div style={{ borderLeft: `1px solid ${GOLD}`, padding: "2px 0 2px 16px", ...serif(16, INK2, 1.5), maxWidth: "58ch" }}>
          {captionFor(e)}
        </div>
        <AttachControl week={week} hcpId={e.hcp_id} onFollowUps={onFollowUps} />
      </div>
    </div>
  );
}

function TrialCard({ e, week, isDesktop, onFollowUps }: { e: TrialEvent; week: TheWeek; isDesktop: boolean; onFollowUps: () => void }) {
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORDER}`, padding: isDesktop ? "28px 32px" : "22px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          {/* Newly captured — an appearance, never a status CHANGE (not detectable) */}
          <span style={mono(11, GOLD, ".16em")}>TRIAL · NEWLY CAPTURED</span>
          <span style={mono(11, DIM, ".1em")}>{fmtDay(e.date).toUpperCase()}</span>
        </div>
        <div style={serif(isDesktop ? 25 : 20)}>
          {shortName(e.hcp_name)}{e.role ? ` — ${e.role.toLowerCase()}` : ""}
        </div>
        <div style={{ ...serif(isDesktop ? 19 : 16, INK3, 1.45, 400), fontStyle: "italic", maxWidth: "62ch" }}>{e.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, ...mono(11, DIM, ".1em"), flexWrap: "wrap" }}>
          {e.nct_id ? <span>{e.nct_id}</span> : null}
          {e.status ? (
            <>
              <span>·</span>
              <span style={{ color: INK1 }}>{e.status.replace(/_/g, ", ")}</span>
            </>
          ) : null}
        </div>
        <AttachControl week={week} hcpId={e.hcp_id} onFollowUps={onFollowUps} />
      </div>
    </div>
  );
}

function CongressCard({ c, isDesktop }: { c: CongressEvent; isDesktop: boolean }) {
  return (
    <div style={{ background: CARD2, border: `1px solid #3A362D`, padding: isDesktop ? "28px 32px" : "22px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={mono(11, GOLD, ".16em")}>CONGRESS · {c.congress_label}</span>
        <span style={mono(11, DIM, ".1em")}>
          {c.window_start ? fmtDay(c.window_start).toUpperCase() : ""}
          {c.window_end && c.window_end !== c.window_start ? ` – ${fmtDay(c.window_end).toUpperCase()}` : ""}
        </span>
      </div>
      <div style={{ ...serif(isDesktop ? 25 : 20, INK1, 1.3), maxWidth: "44ch" }}>
        {spellNumber(c.presenter_count)} tracked {c.presenter_count === 1 ? "HCP" : "HCPs"} across {c.abstract_count} {c.abstract_count === 1 ? "abstract" : "abstracts"}.
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {c.presenters.slice(0, 6).map((p, i) => (
          <div
            key={`${p.hcp_id}:${i}`}
            style={{ display: "grid", gridTemplateColumns: isDesktop ? "210px 1fr 132px" : "1fr auto", gap: 16, padding: "14px 0", borderTop: `1px solid ${BORDER2}`, alignItems: "baseline" }}
          >
            <div style={serif(18, INK1)}>{shortName(p.hcp_name)}</div>
            {isDesktop ? <div style={{ ...serif(16, INK3, 1.4, 400), fontStyle: "italic" }}>{p.presentation_title ?? ""}</div> : null}
            <div style={{ ...mono(10, GOLD, ".1em"), textAlign: "right" }}>{(p.session_type ?? "SESSION").toUpperCase()}</div>
          </div>
        ))}
      </div>
      {c.presenters.length > 6 ? (
        <div style={mono(10, DIM, ".12em")}>+{c.presenters.length - 6} MORE</div>
      ) : null}
    </div>
  );
}

function AlsoOnRecord({ week, isDesktop }: { week: TheWeek; isDesktop: boolean }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={mono(11, MID2, ".16em")}>ALSO ON THE RECORD</span>
        <span style={{ flex: 1, height: 1, background: HAIR }} />
      </div>
      {week.demoted.map((e) => (
        <div
          key={e.kind === "publication" ? `${e.publication_id}:${e.hcp_id}` : `${e.trial_id}:${e.hcp_id}`}
          style={{ display: "grid", gridTemplateColumns: isDesktop ? "96px 1fr" : "84px 1fr", gap: 18, padding: "16px 4px", borderBottom: `1px solid ${HAIR}`, alignItems: "baseline" }}
        >
          <div style={mono(11, DIM, ".08em")}>{fmtDay(e.date).toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={serif(18, INK2)}>
              {shortName(e.hcp_name)} — {e.kind === "publication" ? positionPhrase(e) : `${(e as TrialEvent).role ?? "investigator"}, ${(e as TrialEvent).nct_id ?? "trial"}`}
            </div>
            <div style={{ ...serif(16, MID, 1.45, 400), fontStyle: "italic", maxWidth: "64ch" }}>{e.title}</div>
            <div style={mono(11, DIM, ".08em")}>
              {e.kind === "publication"
                ? `${(e as PublicationEvent).journal?.toUpperCase() ?? ""}${(e as PublicationEvent).in_therapeutic_area ? "" : " · NO TA MATCH"}`
                : ((e as TrialEvent).status?.replace(/_/g, ", ") ?? "")}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

// caption: only the certain facts (author position + TA). Theme-on-record is
// deferred (cross-vocabulary join, omitted rather than proxied).
function captionFor(e: PublicationEvent): string {
  const pos =
    e.position === "first"
      ? "First position on the byline."
      : e.position === "senior"
        ? "Last position on the byline."
        : e.position === "middle" && e.position_ordinal != null && e.total_authors != null
          ? `Position ${e.position_ordinal} of ${e.total_authors} on the byline.`
          : "On the byline.";
  const ta = e.in_therapeutic_area ? " In your therapeutic area." : "";
  return pos + ta;
}

// ── rail cards ──
function WhatWasChecked({ week }: { week: TheWeek }) {
  const c = week.coverage;
  const leadPubs = week.publications.length;
  const alsoPubs = week.demoted.filter((e) => e.kind === "publication").length;
  const movers = week.rank_movement.movers.length;
  const rows: [string, string, boolean][] = [
    ["PUBLICATIONS", leadPubs || alsoPubs ? `${leadPubs} LEAD · ${alsoPubs} ALSO` : `INGESTED THRU ${fmtDay(c.publications_thru).toUpperCase()}`, leadPubs > 0],
    ["TRIALS", week.trials.length ? `${week.trials.length} EVENT${week.trials.length === 1 ? "" : "S"}` : `REFRESHED ${fmtDay(c.trials_refreshed).toUpperCase()}`, week.trials.length > 0],
    ["CONGRESS", c.congress_abstracts_in_window ? `${c.congress_abstracts_in_window} ABSTRACTS` : "BETWEEN MEETINGS", c.congress_abstracts_in_window > 0],
    ["SOCIAL", `${c.verified_accounts} OF ${week.tracked_total} VERIFIED${c.verified_accounts ? "" : " · NONE POSTED"}`, false],
    ["RANK & INDEX", movers ? `${movers} MOVED · SINCE ${fmtSnapshot(RANK_SNAPSHOT_DATE)}` : `1 SNAPSHOT · SINCE ${fmtSnapshot(RANK_SNAPSHOT_DATE)}`, movers > 0],
  ];
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORDER2}`, padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={mono(10, GOLD, ".18em")}>WHAT WAS CHECKED</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {rows.map(([k, v, live]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, ...mono(11, MID2, 0 as unknown as string) }}>
            <span style={{ color: MID2 }}>{k}</span>
            <span style={{ color: live ? INK1 : "#78736A", textAlign: "right" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ ...serif(14, "#78736A", 1.5, 400), borderTop: `1px solid ${BORDER2}`, paddingTop: 13 }}>
        {ABSENCE.social(week.social.verified_accounts, week.tracked_total)} Silence here is our coverage, not theirs.
      </div>
    </div>
  );
}

function Portfolio({ week }: { week: TheWeek }) {
  const p = week.portfolio;
  const rows: [string, number][] = [
    ["TRACKED", p.tracked],
    ["ON AN OPEN TRIAL", p.on_open_trial],
    ["VERIFIED ACCOUNT", p.verified_account],
    ["OPEN FOLLOW-UPS", p.open_follow_ups],
  ];
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORDER2}`, padding: "24px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={mono(10, GOLD, ".18em")}>YOUR PORTFOLIO</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={mono(11, MID2)}>{k}</span>
            <span style={{ font: `400 15px/1 ${MONO}`, color: INK1 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleInWeek({ week, onHcp }: { week: TheWeek; onHcp: (id: string) => void }) {
  const seen = new Map<string, string>();
  week.publications.forEach((e) => seen.set(e.hcp_id, e.hcp_name));
  week.demoted.forEach((e) => seen.set(e.hcp_id, e.hcp_name));
  week.trials.forEach((e) => seen.set(e.hcp_id, e.hcp_name));
  week.congress.forEach((c) => c.presenters.forEach((p) => seen.set(p.hcp_id, p.hcp_name)));
  const people = [...seen.entries()];
  const absent = week.tracked_total - people.length;
  if (people.length === 0) return null;
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORDER2}`, padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={mono(10, GOLD, ".18em")}>THE PEOPLE IN THIS WEEK</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {people.map(([id, name]) => (
          <div key={id} className="fmweek-link" onClick={() => onHcp(id)} style={{ ...serif(18, INK1), cursor: "pointer" }}>
            {name}
          </div>
        ))}
      </div>
      <div style={{ ...mono(10, DIM, ".12em"), borderTop: `1px solid ${BORDER2}`, paddingTop: 13 }}>
        {absent > 0 ? `${spellNumber(absent).toUpperCase()} OF YOUR ${week.tracked_total} DID NOT APPEAR` : "ALL TRACKED APPEAR"}
      </div>
    </div>
  );
}

// ── word helpers (small numbers spelled, per the frame's voice) ──
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function spellNumber(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}
function spellCount(n: number): string {
  if (n === 1) return "One thing";
  const w = spellNumber(n);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} things`;
}
// "Okonkwo, A." style short name from "Amelia Okonkwo"
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  const last = parts[parts.length - 1];
  const first = parts[0];
  return `${last}, ${first.charAt(0)}.`;
}
