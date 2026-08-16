// Home — "intelligence-led, ledger lens" redesign.
// Layout authority: docs/design/Home Redesign.dc.html (project 3c3a6c73), with the binding
// FRAME EXCEPTIONS: NavBar is the shipped 6-item bar via AppLayout (the frame's own top bar
// is ignored); wired links are /cohorts/ledger, /me/follow-ups, /institutions/:ta,
// /me/insights, /me/watchlists (portfolio figure + rail header + mobile record row,
// wired 2026-07-31 — the surface was orphaned), and portfolio chips → /hcp/:id (the
// exception covers affordances with NO route, e.g. Skyview / All briefs); every other
// affordance is non-interactive; the session date is the live clock. DATA RULES: WHAT MOVED = WHAT_MOVED_SNAPSHOT_DATE snapshot vs current ranks_v3 — currently
// the SEEDED 22-Jun illustrative snapshot (see homeWhatMoved.ts header for provenance + revert);
// no dispersion/tied/confidence anywhere; follow-ups ordered by priority then due;
// insight bodies rendered VERBATIM; tracked = getTrackedHcpIds; institutions = national pins.
// Where the frame implies data that does not exist (per-institution "tracked" count,
// per-HCP "why now" line, publications-90d / trials / peers), it is omitted rather than
// proxied. Portfolio chips (name + cohort + us_rank badge) ARE sourceable via
// getTrackedHcpsInTerritory — the shipped home's tracking-chip reader.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../lib/authHelpers";
import { useTA } from "../../lib/TAContext";
import { taIdForApiSlug } from "../../lib/api";
import { taLabelToApiSlug, taSlugToLabel } from "../../lib/routeSlugs";
import { supabase } from "../../lib/supabase";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { getTrackedHcpIds } from "../../lib/watchlists";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { getFieldInsightsForCurrentUser, type FieldInsight } from "../../lib/fieldInsights";
import { getPinnedInstitutionsForUser, getInstitutionsByNames } from "../../lib/institutionPins";
import { getWhatMoved, WHAT_MOVED_SEEDED, type WhatMoved, type Mover } from "../../lib/homeWhatMoved";
import { loadTheWeekTeaser, type WeekTeaser } from "../../lib/theWeek";
import {
  getNextActionsForUser,
  getOverdueFollowUpsForUser,
  getOpenFollowUpStats,
  getRecentBriefsForUser,
  getRecentActivityForUser,
  getTerritoryCoverageStats,
  getTerritoryProfile,
  getTrackedHcpsInTerritory,
  type ActivityEvent,
  type BriefRef,
  type NextActionWithHcp,
  type OpenFollowUpStats,
  type TerritoryCoverageStats,
  type TerritoryProfile,
  type TrackedHcpChip,
} from "../../lib/home";
import AppLayout from "../AppLayout";
import HCPChip, { toChipCohort } from "../HCPChip";
import PageHero from "../PageHero";
import { institutionToSlug } from "../../lib/institutionUtils";
import { GOLD as GOLD_T, GROUND, LINE } from "../../lib/designTokens";
import { CANON, FACE } from "../../lib/canonicalTokens";

// ── palette (from the frame) ──────────────────────────────────────────────────
// Commit C 2026-08-05: the bespoke warm panel joins the Pulse board scheme —
// g2 board, g1 wells, l1 edges, l0 interior rules.
const PAGE = GROUND.g2, CARD = GROUND.g1, BORDER = LINE.l1, HAIR = LINE.l0;
// #c9a25f (soft-gold quartet) folded into GOLD.bright 2026-08-05; GOLD2 and
// GOLD_LINK are per-surface mid-golds outside the convergence ledger.
const GOLD = GOLD_T.bright, GOLD2 = "#e0aa4a", GOLD_LINK = "#e0c08a";
const INK1 = "#f0ebe1", INK2 = "#e8e3d9", INK3 = "#c8c3ba";
const MID = "#8a8681", MID2 = "#a5a097", DIM = "#5d5a54", DIM2 = "#3a3833";
const RED = "#b5705c", GREEN = "#9dbfa4", STEEL = "#93a9ad";
// Spectral retired 2026-08-12 (last consumer): the one value face is FACE.value
// (Newsreader); Spectral's load also dropped from index.html the same day.
const SERIF = FACE.value;
const MONO = FACE.data;

// Cohort chip borders retired 2026-08-13: the shared HCPChip owns cohort
// colour now, derived from the canonical MARK tokens.

const mono = (size: number, weight = 400, color = MID, ls = ".12em") => ({ font: `${weight} ${size}px/1 ${MONO}`, letterSpacing: ls, color });
const serif = (size: number, weight = 400, color = INK2, lh = 1.2) => ({ font: `${weight} ${size}px/${lh} ${SERIF}`, color });
const num = (n: number) => n.toLocaleString("en-US");

// Hint link — canonical ACTION.LINK, inheriting the hint's serif and size so it
// reads as a word IN the sentence rather than a control pasted into it. The
// underline is offset and dimmed so a 13px serif link does not out-shout the
// line it sits in.
const hintLink: CSSProperties = {
  color: CANON.ACTION.LINK,
  textDecoration: "underline",
  textDecorationColor: "rgba(63,184,175,.45)",
  textUnderlineOffset: 2,
  cursor: "pointer",
};

const fmtDue = (iso: string | null): string => {
  if (!iso) return "NO DATE";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
};
const fmtIdx = (n: number | null): string => (n == null ? "—" : n.toFixed(1));

export default function HomePage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { setTA } = useTA();
  // Same tracking source as the ledger and Trials — the portfolio bookmark is
  // the same control, not a second one.
  const { isTracked, toggleSave, getOtherWatchlists } = useRelationships();
  // The portfolio's untrack hint. toggleSave removes from the DEFAULT list only
  // and then re-derives tracked as the union of every list, so untracking
  // someone who also sits on another list cannot change the bookmark — it
  // flipped off and sprang back, which reads as a broken control. The rule
  // here: the bookmark only moves when the person is ACTUALLY being untracked;
  // otherwise it holds and says why.
  // Structured, not a prebuilt string: the list name is a LINK, so the message
  // has to be assembled in JSX rather than interpolated.
  type UntrackHint =
    | { kind: "blocked"; person: string; others: { id: string; name: string }[] }
    | { kind: "error" };
  const [untrackHint, setUntrackHint] = useState<UntrackHint | null>(null);

  const portfolioBookmarkTap = async (hcpId: string, name: string) => {
    if (!isTracked(hcpId)) { void toggleSave(hcpId, "home_portfolio").catch(() => {}); return; }
    let others: { id: string; name: string }[];
    try {
      others = await getOtherWatchlists(hcpId);
    } catch {
      // Could not establish whether the untrack would stick. Do NOT guess: a
      // wrong guess is the spring-back this exists to prevent.
      setUntrackHint({ kind: "error" });
      return;
    }
    if (others.length === 0) { void toggleSave(hcpId, "home_portfolio").catch(() => {}); return; }
    setUntrackHint({ kind: "blocked", person: name, others });
  };

  useEffect(() => {
    if (!untrackHint) return;
    const t = setTimeout(() => setUntrackHint(null), 6000);
    return () => clearTimeout(t);
  }, [untrackHint]);
  const [homeTaId, setHomeTaId] = useState<string | undefined>(undefined);
  const [taSlug, setTaSlug] = useState<string>("nsclc");
  const [firstName, setFirstName] = useState("there");
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<OpenFollowUpStats | null>(null);
  const [trackedCount, setTrackedCount] = useState<number>(0);
  const [coverage, setCoverage] = useState<TerritoryCoverageStats | null>(null);
  const [territory, setTerritory] = useState<TerritoryProfile | null>(null);
  const [nextActions, setNextActions] = useState<NextActionWithHcp[]>([]);
  const [overdue, setOverdue] = useState<NextActionWithHcp[]>([]);
  const [insights, setInsights] = useState<FieldInsight[]>([]);
  const [briefs, setBriefs] = useState<BriefRef[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [moved, setMoved] = useState<WhatMoved | null>(null);
  const [portfolioChips, setPortfolioChips] = useState<TrackedHcpChip[]>([]);
  const [institutions, setInstitutions] = useState<{ name: string; hcp: number | null; rising: number | null }[]>([]);
  const [weekTeaser, setWeekTeaser] = useState<WeekTeaser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const user = await getCurrentUser();
        if (!user || cancelled) { if (!cancelled) setLoading(false); return; }

        const { data: profile } = await supabase
          .from("msl_profiles")
          .select("first_name, default_ta_slug, default_indication_slug")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (profile?.first_name) setFirstName(profile.first_name);
        const parentSlug = profile?.default_ta_slug ?? "oncology";
        const indicationSlug = profile?.default_indication_slug ?? taLabelToApiSlug(taSlugToLabel(parentSlug));
        const resolvedTaId = taIdForApiSlug(indicationSlug) ?? taIdForApiSlug(taLabelToApiSlug(taSlugToLabel(parentSlug)));
        setHomeTaId(resolvedTaId);
        setTaSlug(indicationSlug || "nsclc");
        setTA(parentSlug, indicationSlug);

        const [statsD, trackedIds, coverageD, territoryD, actionsD, overdueD, insightsD, briefsD, activityD, pinsD, chipsD] = await Promise.all([
          getOpenFollowUpStats(user.id),
          getTrackedHcpIds(user.id),
          getTerritoryCoverageStats(user.id, resolvedTaId),
          getTerritoryProfile(user.id),
          getNextActionsForUser(user.id, 50),
          getOverdueFollowUpsForUser(user.id, 12),
          getFieldInsightsForCurrentUser(),
          getRecentBriefsForUser(user.id, 5),
          getRecentActivityForUser(user.id, 6),
          getPinnedInstitutionsForUser(user.id),
          getTrackedHcpsInTerritory(user.id),
        ]);
        if (cancelled) return;

        setStats(statsD);
        setTrackedCount(trackedIds.size);
        // chips scoped to the SAME population as the count: getTrackedHcpIds (watchlist
        // membership) — getTrackedHcpsInTerritory alone is looser (any relationship row).
        setPortfolioChips(chipsD.filter((c) => trackedIds.has(c.hcp_id)));
        setCoverage(coverageD);
        setTerritory(territoryD);
        setNextActions(actionsD);
        setOverdue(overdueD);
        setInsights(insightsD);
        setBriefs(briefsD);
        setActivity(activityD);

        // WHAT MOVED — live 8-Jun snapshot vs current, scoped to the user's territory + tracked set.
        const movedD = await getWhatMoved(territoryD?.territory_states ?? [], trackedIds);
        if (!cancelled) setMoved(movedD);

        // THE WEEK — one entry line (count + first event), linking to /me/week.
        // Own surface; nothing on Home is replaced (frame card 04).
        const teaser = await loadTheWeekTeaser([...trackedIds]);
        if (!cancelled) setWeekTeaser(teaser);

        // Institutions — national pins hydrated by name (HCP + RISING; no per-user tracked col).
        const pinNames = pinsD.map((p) => p.institution_name).slice(0, 5);
        if (pinNames.length) {
          const idxMap = await getInstitutionsByNames(pinNames, taSlugToLabel(parentSlug) === "Immunology" ? "Immunology" : "NSCLC");
          if (!cancelled) {
            setInstitutions(pinNames.map((n) => {
              const e = idxMap.get(n);
              return { name: n, hcp: e?.investigator_count ?? null, rising: e?.rising_star_count ?? null };
            }));
          }
        }
      } catch (err) {
        console.warn("HomePage: load error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setTA]);

  // Follow-ups ordered by PRIORITY LABEL, then DUE DATE (DATA RULE 4).
  const PRIO: Record<string, number> = { high: 0, normal: 1, low: 2 };
  const top3 = useMemo(() => {
    return [...nextActions]
      .sort((a, b) => (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1)
        || (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity))
      .slice(0, 3);
  }, [nextActions]);

  // live clock (DATA RULE 11 — never hardcode 30 Jun)
  const now = new Date();
  const hr = now.getHours();
  const greeting = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const dateLine = `${now.toLocaleString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase()} · ${now.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }).toUpperCase()}`;

  const territoryStates = territory?.territory_states ?? [];
  const territoryLabel = territory?.territory_label ?? null;

  const go = {
    ledger: () => navigate("/cohorts/ledger"),
    followUps: () => navigate("/me/follow-ups"),
    institutions: () => navigate(`/institutions/${taSlug}`),
    insights: () => navigate("/me/insights"),
    watchlists: () => navigate("/me/watchlists"),
  };

  return (
    <AppLayout currentTaId={homeTaId} onSearchSelect={(hcpId) => navigate(`/hcp/${hcpId}`)}>
      <style>{`.fmhome a{color:${GOLD_LINK};text-decoration:none} .fmhome a:hover{color:${INK2}} .fmhome-link{cursor:pointer} .fmhome-link:hover{color:${INK2}!important}`}</style>
      {loading ? (
        <div style={{ ...mono(12, 400, MID), padding: "48px 0", textAlign: "center" }}>Loading your workspace…</div>
      ) : !stats ? (
        <div style={{ ...mono(12, 400, MID), padding: "48px 0", textAlign: "center" }}>Home could not be loaded.</div>
      ) : (
        <div className="fmhome" style={{ background: PAGE, border: `1px solid ${BORDER}`, fontFamily: SERIF, marginTop: 12, marginBottom: 24 }}>
          {/* territory band */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isDesktop ? "13px 30px" : "11px 16px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, ...mono(10, 400) }}>
              <span style={{ width: 2, height: 12, background: GREEN }} />
              {territoryLabel ? <span style={{ color: INK3 }}>{territoryLabel.toUpperCase()}</span> : <span style={{ color: MID }}>NO TERRITORY SET</span>}
              {territoryStates.length ? <><span style={{ color: DIM2 }}>/</span><span style={{ color: MID }}>{territoryStates.join(" · ")}</span></> : null}
            </div>
            <span className="fmhome-link" onClick={go.ledger} style={{ ...mono(10, 400, GOLD_LINK) }}>OPEN THE LEDGER ↗</span>
          </div>

          {/* Hero — canonical H1 masthead (PageHero, Commit B 2026-08-05). The
              old Metric row maps onto the stats cluster; overdue keeps its
              alert red via valueColor, coverage keeps gold + its OF-foot. */}
          <div style={{ padding: isDesktop ? "30px 30px 22px" : "18px 16px 14px" }}>
            <PageHero
              narrow={!isDesktop}
              eyebrow="Fieldmark · Home"
              meta={`${dateLine} · SESSION OPENED`}
              title={`${greeting}, ${firstName}`}
              stats={{ variant: "cluster", items: [
                { value: String(stats.overdue), label: "FOLLOW-UPS OVERDUE", valueColor: RED, center: true },
                { value: String(stats.total), label: "FOLLOW-UPS OPEN", center: true },
                { value: String(trackedCount), label: "PORTFOLIO TRACKED", onClick: go.watchlists, center: true },
                // A fact, not an achievement metric (2026-08-05): the old
                // percentage moved 25 points when the board was re-gated.
                { value: coverage ? `${coverage.tracked_count} of ${coverage.total_rising_stars_in_territory}` : "0 of 0", label: "TERRITORY RISING TRACKED", center: true },
              ] }}
            />
          </div>

          {/* ledger strip */}
          <div style={{ margin: isDesktop ? "0 30px" : "0 16px", border: `1px solid ${BORDER}`, display: "flex", ...mono(10, 400, MID, ".1em"), flexWrap: "wrap" }}>
            <span style={{ padding: "11px 18px", borderRight: `1px solid ${BORDER}`, color: INK3 }}>{stats.overdue} FOLLOW-UPS PAST DUE</span>
            <span style={{ padding: "11px 18px", color: DIM }}>HOME CARRIES AGGREGATES ONLY — FULL RECORDS LIVE ON THE PROFILE</span>
          </div>

          {/* main grid */}
          <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 356px" : "1fr", gap: isDesktop ? 40 : 28, padding: isDesktop ? "32px 30px 56px" : "24px 16px 32px", alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 40, minWidth: 0 }}>
              {/* THE WEEK — single entry line into the /me/week surface (frame card 04).
                  Nothing on Home is replaced; this line is added above WHAT MOVED. */}
              <div
                className="fmhome-link"
                onClick={() => navigate("/me/week")}
                style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "13px 18px", background: CARD, border: `1px solid ${BORDER}`, borderLeft: `2px solid ${GOLD}`, cursor: "pointer", flexWrap: "wrap" }}
              >
                <span style={mono(10, 400, GOLD, ".16em")}>THE FORTNIGHT</span>
                {weekTeaser && weekTeaser.count > 0 ? (
                  <>
                    <span style={serif(15, 400, INK2, 1.4)}>
                      {weekTeaser.pub_count > 0 ? `${weekTeaser.pub_count} new ${weekTeaser.pub_count === 1 ? "publication" : "publications"}` : ""}
                      {weekTeaser.pub_count > 0 && weekTeaser.mover_count > 0 ? " · " : ""}
                      {weekTeaser.mover_count > 0 ? `${weekTeaser.mover_count} moved since 8 Jun` : ""}
                      {weekTeaser.first_line ? <span style={{ color: MID }}> — {weekTeaser.first_line}</span> : null}
                    </span>
                    <span style={{ marginLeft: "auto", ...mono(10, 400, GOLD_LINK, ".1em") }}>OPEN ↗</span>
                  </>
                ) : (
                  <>
                    <span style={serif(15, 400, MID, 1.4)}>Nothing new for the people you track this fortnight.</span>
                    <span style={{ marginLeft: "auto", ...mono(10, 400, GOLD_LINK, ".1em") }}>OPEN ↗</span>
                  </>
                )}
              </div>

              {/* WHAT MOVED */}
              <WhatMovedSection moved={moved} isDesktop={isDesktop} />

              {/* NEXT 3 ACTIONS */}
              <section>
                <SectionHead label="NEXT 3 ACTIONS" note="ORDERED BY PRIORITY LABEL, THEN DUE DATE" link={{ text: "ALL FOLLOW-UPS ↗", onClick: go.followUps }} />
                <div style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  {top3.length === 0 ? (
                    <div style={{ padding: "20px 26px", ...serif(15, 300, MID) }}>No open follow-ups.</div>
                  ) : top3.map((a, i) => (
                    <div key={a.id}>
                      {i > 0 ? <div style={{ height: 1, background: HAIR, margin: "0 26px" }} /> : null}
                      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "44px 1fr 168px" : "1fr", gap: isDesktop ? 22 : 8, padding: isDesktop ? "20px 26px" : "16px 18px", alignItems: "start" }}>
                        {isDesktop ? <span style={{ ...mono(22, 400, DIM2), lineHeight: 1.1 }}>{String(i + 1).padStart(2, "0")}</span> : null}
                        <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                            <Link to={`/hcp/${a.hcp.hcp_id}`} style={{ ...serif(19, 500, INK1), textDecoration: "none", borderBottom: `1px solid ${HAIR}` }}>{a.hcp.name}</Link>
                            {a.hcp.institution ? <span style={mono(11, 400, STEEL, ".04em")}>{a.hcp.institution}</span> : null}
                          </div>
                          {/* body VERBATIM; the frame's "why now" line has no stored source and is omitted */}
                          <div style={serif(15, 300, INK3, 1.5)}>{a.body}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: isDesktop ? "flex-end" : "flex-start" }}>
                          {a.overdue ? <span style={{ ...mono(10, 400, RED, ".14em"), border: `1px solid #4a332c`, padding: "6px 9px" }}>OVERDUE</span>
                            : <span style={{ ...mono(10, 400, MID, ".14em"), border: `1px solid ${DIM2}`, padding: "6px 9px" }}>{a.priority.toUpperCase()}</span>}
                          <span style={mono(11, 400, DIM)}>DUE {fmtDue(a.due_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* FOLLOW-UPS BY URGENCY (overdue) */}
              <section>
                <SectionHead label="FOLLOW-UPS BY URGENCY" right={
                  <span style={{ display: "flex", gap: 18, ...mono(10, 400) }}>
                    <span>OVERDUE <span style={{ color: RED }}>{stats.overdue}</span></span>
                    <span>THIS WEEK <span style={{ color: INK2 }}>{stats.due_this_week}</span></span>
                    <span>FUTURE <span style={{ color: INK2 }}>{stats.future}</span></span>
                  </span>
                } />
                <div style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  {overdue.length === 0 ? (
                    <div style={{ padding: "14px 26px", ...serif(14, 300, MID) }}>No overdue follow-ups.</div>
                  ) : overdue.map((f, i) => (
                    <div key={f.id}>
                      {i > 0 ? <div style={{ height: 1, background: HAIR, margin: "0 26px" }} /> : null}
                      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "210px 1fr 84px" : "1fr auto", gap: isDesktop ? 20 : 12, padding: "14px 26px", alignItems: "baseline" }}>
                        <Link to={`/hcp/${f.hcp.hcp_id}`} style={{ ...serif(16, 400, INK2), justifySelf: "start", textDecoration: "none", borderBottom: `1px solid ${HAIR}` }}>{f.hcp.name}</Link>
                        {isDesktop ? <span style={serif(14, 300, MID, 1.45)}>{f.body}</span> : null}
                        <span style={{ ...mono(11, 400, RED), textAlign: "right" }}>{fmtDue(f.due_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* THE RECORD — desktop. Header stays over the insights (the provenance note
                  belongs to the verbatim notes); briefs + relationship activity moved to the
                  rail below YOUR PORTFOLIO, where they carry their own RowCap headers like
                  every other rail block. */}
              {isDesktop ? (
                <section>
                  <SectionHead label="THE RECORD" note="MSL-CAPTURED · YOUR TEAM ONLY" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* insights (verbatim) — full main-column width; never truncated or clamped */}
                    <RowCap left="RECENT INSIGHTS" right={`${insights.length} LOGGED`} />
                    <div style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                      {insights.slice(0, 3).map((n, i) => (
                        <div key={n.id}>
                          {i > 0 ? <div style={{ height: 1, background: HAIR, margin: "0 20px" }} /> : null}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "14px 20px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              {n.interaction_type ? <span style={{ ...mono(9, 400, MID, ".14em"), border: `1px solid ${DIM2}`, padding: "4px 6px" }}>{n.interaction_type.replace(/_/g, " ").toUpperCase()}</span> : null}
                              <span style={serif(16, 400, INK2)}>{`${n.hcp_first_name ?? ""} ${n.hcp_last_name ?? ""}`.trim()}</span>
                              <span style={mono(10, 400, DIM)}>{fmtDue(n.occurred_at)}</span>
                            </div>
                            {/* body VERBATIM from msl_hcp_notes (test rows render as stored) */}
                            <div style={serif(14, 300, MID, 1.5)}>{n.body}</div>
                          </div>
                        </div>
                      ))}
                      <div style={{ height: 1, background: HAIR, margin: "0 20px" }} />
                      <div style={{ padding: "13px 20px" }}><span className="fmhome-link" onClick={go.insights} style={mono(10, 400, GOLD_LINK)}>ALL INSIGHTS ↗</span></div>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            {/* RAIL (desktop) */}
            {isDesktop ? (
              <aside style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                {/* territory coverage */}
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <RowCap left="TERRITORY COVERAGE" right="RISING STARS" />
                  <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                    <span style={mono(36, 400, INK1)}>{coverage?.tracked_count ?? 0}</span>
                    <span style={serif(14, 300, MID, 1.3)}>of {coverage?.total_rising_stars_in_territory ?? 0} rising stars tracked</span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", ...mono(10, 400, DIM, ".1em") }}>
                    <span>{Math.max(0, (coverage?.total_rising_stars_in_territory ?? 0) - (coverage?.tracked_count ?? 0))} IN TERRITORY UNTRACKED</span>
                  </div>
                </div>

                {/* your institutions — national, pin-based (DATA RULE 7 disclaimer kept) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", ...mono(10, 400, MID, ".14em") }}>
                    <span>YOUR INSTITUTIONS</span>
                    <span className="fmhome-link" onClick={go.institutions} style={mono(10, 400, GOLD_LINK)}>ALL ↗</span>
                  </div>
                  <div style={{ ...serif(13, 300, DIM, 1.5), fontStyle: "italic" }}>Pinned by you, nationally — this list is not scoped to your territory.</div>
                  <div style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 18px", borderBottom: `1px solid ${BORDER}`, ...mono(9, 400, DIM, ".12em") }}><span>INSTITUTION</span><span>HCP · RISING</span></div>
                    {institutions.length === 0 ? <div style={{ padding: "12px 18px", ...serif(14, 300, MID) }}>No pinned institutions.</div> : institutions.map((inst, i) => (
                      <div key={inst.name}>
                        {i > 0 ? <div style={{ height: 1, background: HAIR, margin: "0 18px" }} /> : null}
                        <div className="fmhome-link" onClick={() => navigate(`/institution/${institutionToSlug(inst.name)}`)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "12px 18px", alignItems: "baseline", cursor: "pointer" }}>
                          <span style={serif(15, 400, INK2, 1.3)}>{inst.name}</span>
                          <span style={mono(11, 400, MID)}>{inst.hcp != null ? num(inst.hcp) : "—"} · <span style={{ color: inst.rising ? GOLD : DIM }}>{inst.rising != null ? inst.rising : "—"}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* portfolio — named chips via getTrackedHcpsInTerritory (the shipped home's
                    tracking-chip reader: name + cohort + us_rank badge for rising stars),
                    filtered to the getTrackedHcpIds population so chips and count agree.
                    Chip treatment carried over from the shipped surface (canonical cohort
                    colors); chips navigate to /hcp/:id as the shipped tile did — the
                    four-links exception covers affordances with no route, not this one. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", ...mono(10, 400, MID, ".14em") }}><span className="fmhome-link" onClick={go.watchlists} style={{ color: GOLD_LINK }}>YOUR PORTFOLIO ↗</span><span style={{ color: DIM }}>PINNED BY YOU</span></div>
                  <div style={{ background: CARD, border: `1px solid ${BORDER}`, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                      <span style={mono(28, 400, INK1)}>{trackedCount}</span>
                      <span style={serif(14, 300, MID, 1.3)}>investigators tracked across your watchlists</span>
                    </div>
                    {portfolioChips.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {/* register: bordered mono chips, no fill. Border carries the cohort
                            (estGreen / indigo / info); text stays neutral; rank stays an inline
                            gold #figure per the platform's "amber for rank only" rule. Link +
                            population are unchanged. */}
                        {portfolioChips.map((chip) => (
                          // Shared HCPChip (2026-08-13): this chip and the Trials
                          // roster strip used to disagree about what a person looks
                          // like. Both now render the SAME object — name · cohort ·
                          // rank. The ladder word and the community tier are context,
                          // so they sit BESIDE the chip, not inside it.
                          // maxWidth/minWidth are what actually contain a long
                          // name. This wrapper is shrink-to-fit around the chip,
                          // so a percentage limit ON the chip resolves against
                          // the chip itself and never binds; the rail's width
                          // only enters through the wrapper, whose containing
                          // block IS the rail. Without these a 60-character name
                          // ran 62px past the rail edge and scrolled the row.
                          <span key={chip.hcp_id} style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%", minWidth: 0 }}>
                            <HCPChip
                              hcpId={chip.hcp_id}
                              name={chip.name}
                              cohort={toChipCohort(chip.cohort, chip.cohort_rank)}
                              rank={chip.cohort_rank}
                              tracked={isTracked(chip.hcp_id)}
                              onToggleTracked={() => { void portfolioBookmarkTap(chip.hcp_id, chip.name); }}
                              // Every chip in the portfolio is tracked by
                              // definition, so the mark says nothing here — it
                              // steps back to an amber outline and keeps the
                              // untrack tap. See bookmarkTone.
                              bookmarkTone="quiet"
                            />
                            {/* The ladder tag is only shown when it says something
                                the chip does not: the chip already renders EST/RS/COM,
                                so only "EST GLOBAL" (rank came off the global board,
                                not the US one) still earns space beside it. */}
                            {chip.ladder === "EST GLOBAL" ? (
                              <span style={mono(9, 400, MID, ".04em")}>GLOBAL</span>
                            ) : null}
                            {chip.cohort_rank === null && chip.tier !== null ? (
                              <span style={mono(9, 400, MID, ".06em")}>{chip.tier.replace("_", "-").toUpperCase()}</span>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {/* Inline, self-clearing, no modal. It reports a state that
                        did NOT change, so it sits with the wall rather than
                        interrupting it. */}
                    {untrackHint ? (
                      <div role="status" aria-live="polite" style={{ display: "flex", gap: 7, alignItems: "baseline", borderTop: `1px solid ${HAIR}`, paddingTop: 11 }}>
                        <span style={{ color: GOLD, fontSize: 9, lineHeight: 1.7 }}>●</span>
                        <span style={{ ...serif(13, 300, MID, 1.5) }}>
                          {untrackHint.kind === "error" ? (
                            "Couldn't check this person's other lists — nothing changed."
                          ) : (
                            <>
                              {untrackHint.person} stays tracked — also on{" "}
                              {/* "Remove there too" needs somewhere to go. One
                                  list deep-links to it (/me/watchlists/:id is a
                                  real route); several go to the index, since
                                  picking between them IS the disambiguation UI
                                  we are not building inline. */}
                              {untrackHint.others.length === 1 ? (
                                <>
                                  “<Link to={`/me/watchlists/${untrackHint.others[0].id}`} style={hintLink}>{untrackHint.others[0].name}</Link>”
                                </>
                              ) : (
                                <Link to="/me/watchlists" style={hintLink}>{untrackHint.others.length} other lists</Link>
                              )}
                              . Remove there too to untrack.
                            </>
                          )}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* recent briefs — moved from THE RECORD (list-shaped; treatment unchanged) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <RowCap left="RECENT BRIEFS" right={briefs.length ? `${briefs.length} RECENT` : "NONE"} />
                  <div style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    {briefs.length === 0 ? <div style={{ padding: "14px 20px", ...serif(14, 300, MID) }}>No briefs yet.</div> : briefs.map((b, i) => (
                      <div key={b.id}>
                        {i > 0 ? <div style={{ height: 1, background: HAIR, margin: "0 20px" }} /> : null}
                        <div className="fmhome-link" onClick={() => navigate(`/hcp/${b.hcp_id}/brief`)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, padding: "14px 20px", alignItems: "baseline", cursor: "pointer" }}>
                          <span style={serif(16, 400, INK2)}>{b.hcp_name}</span>
                          <span style={mono(10, 400, DIM)}>{fmtDue(b.generated_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* relationship activity — moved from THE RECORD (treatment unchanged) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ ...mono(10, 400, MID, ".14em") }}>RELATIONSHIP ACTIVITY</div>
                  <div style={{ background: CARD, border: `1px solid ${BORDER}`, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {activity.length === 0 ? <span style={serif(14, 300, MID)}>No recent activity.</span> : activity.map((e) => (
                      <span key={e.id} style={serif(14, 300, MID, 1.4)}><span style={{ color: INK2 }}>{e.label}</span></span>
                    ))}
                  </div>
                </div>

                <div style={{ ...serif(13, 300, DIM, 1.6), fontStyle: "italic" }}>Home carries rank, movement and queue only. Publications, guidelines, trials and payment records live on the profile.</div>
              </aside>
            ) : null}

            {/* THE RECORD — mobile compact list (Exc.9: FU/Inst link; others inert).
                Insights left this list 2026-08-10: the count-row compression hid
                the section's actual content on mobile — it now renders in full
                below, same treatment as desktop (verbatim bodies, never clamped). */}
            {!isDesktop ? (
              <section>
                <div style={{ ...mono(10, 400, INK2, ".16em"), paddingBottom: 10 }}>THE RECORD</div>
                <div style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <RecordRow label="Follow-ups" right={<span><span style={{ color: RED }}>{stats.overdue}</span> OVERDUE ↗</span>} onClick={go.followUps} />
                  <RecordRow label="Portfolio" right={`${trackedCount} PINNED ↗`} onClick={go.watchlists} />
                  <RecordRow label="Institutions" right={`${institutions.length ? institutions.length : ""} ↗`} onClick={go.institutions} />
                  <RecordRow label="Briefs" right={briefs.length ? `${briefs.length} RECENT` : "NONE"} />
                  <RecordRow label="Relationship activity" right={activity.length ? "RECENT" : "NONE"} last />
                </div>
              </section>
            ) : null}

            {/* RECENT INSIGHTS — mobile, full treatment (parity with desktop) */}
            {!isDesktop ? (
              <section>
                {/* same header-to-content gap as THE RECORD's mobile header (paddingBottom 10) */}
                <div style={{ paddingBottom: 10 }}>
                  <RowCap left="RECENT INSIGHTS" right={`${insights.length} LOGGED`} />
                </div>
                <div style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  {insights.slice(0, 3).map((n, i) => (
                    <div key={n.id}>
                      {i > 0 ? <div style={{ height: 1, background: HAIR, margin: "0 20px" }} /> : null}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "14px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                          {n.interaction_type ? <span style={{ ...mono(9, 400, MID, ".14em"), border: `1px solid ${DIM2}`, padding: "4px 6px" }}>{n.interaction_type.replace(/_/g, " ").toUpperCase()}</span> : null}
                          <span style={serif(16, 400, INK2)}>{`${n.hcp_first_name ?? ""} ${n.hcp_last_name ?? ""}`.trim()}</span>
                          <span style={mono(10, 400, DIM)}>{fmtDue(n.occurred_at)}</span>
                        </div>
                        {/* body VERBATIM from msl_hcp_notes (test rows render as stored) */}
                        <div style={serif(14, 300, MID, 1.5)}>{n.body}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ height: 1, background: HAIR, margin: "0 20px" }} />
                  <div style={{ padding: "13px 20px" }}><span className="fmhome-link" onClick={go.insights} style={mono(10, 400, GOLD_LINK)}>ALL INSIGHTS ↗</span></div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function SectionHead({ label, note, link, right }: { label: string; note?: string; link?: { text: string; onClick: () => void }; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 12 }}>
      <span style={{ width: 2, height: 12, background: label === "WHAT MOVED" ? GOLD : MID }} />
      <span style={mono(11, 400, INK2, ".16em")}>{label}</span>
      {note ? <span style={mono(10, 400, MID)}>{note}</span> : null}
      <span style={{ flex: 1, height: 1, background: BORDER }} />
      {link ? <span className="fmhome-link" onClick={link.onClick} style={mono(10, 400, GOLD_LINK)}>{link.text}</span> : null}
      {right ?? null}
    </div>
  );
}

function RowCap({ left, right }: { left: string; right: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", ...mono(10, 400, MID, ".14em") }}><span>{left}</span><span style={{ color: DIM }}>{right}</span></div>;
}

function RecordRow({ label, right, onClick, last }: { label: string; right: React.ReactNode; onClick?: () => void; last?: boolean }) {
  return (
    <>
      <div className={onClick ? "fmhome-link" : undefined} onClick={onClick} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "15px 16px", cursor: onClick ? "pointer" : "default" }}>
        <span style={serif(16, 400, INK2)}>{label}</span>
        <span style={mono(10, 400, MID, ".1em")}>{right}</span>
      </div>
      {!last ? <div style={{ height: 1, background: HAIR, margin: "0 16px" }} /> : null}
    </>
  );
}

function WhatMovedSection({ moved, isDesktop }: { moved: WhatMoved | null; isDesktop: boolean }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 12, flexWrap: "wrap" }}>
        <span style={{ width: 2, height: 12, background: GOLD }} />
        <span style={mono(11, 400, INK2, ".16em")}>WHAT MOVED</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, ...mono(10, 400, MID) }}>
          <span>COMPARED AGAINST</span>
          <span style={{ color: INK3, border: `1px solid #2f2c27`, padding: "4px 7px" }}>8 JUN 2026</span>
        </span>
        {WHAT_MOVED_SEEDED ? (
          // Provenance marker — same dashed-amber discipline as the forum's
          // SEEDED chip (fiUi ProvenanceChip): the comparison snapshot is
          // fabricated demo data, not a live measurement.
          <span style={{ ...mono(9, 600, GOLD, ".12em"), background: "rgba(232,160,32,0.06)", border: "1px dashed rgba(232,160,32,0.42)", padding: "3px 7px", whiteSpace: "nowrap" }}>
            ILLUSTRATIVE · BACKDATED SNAPSHOT
          </span>
        ) : null}
        <span style={{ flex: 1, height: 1, background: BORDER }} />
      </div>

      {!moved || !moved.bandA ? (
        <div style={{ border: `1px dashed #33322e`, background: CARD, padding: "26px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={mono(10, 400, GOLD, ".14em")}>BOARD RE-SCORED 5 AUG 2026 · MOVEMENT TRACKING RESET</span>
          <span style={{ ...serif(15, 300, MID, 1.6), fontStyle: "italic" }}>
            Deltas resume with the next weekly snapshot. Ranks before and after the re-score are not comparable, so no movement is shown across it.
          </span>
        </div>
      ) : (
        <>
          {/* BAND A — primary */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "8px 0 10px", borderBottom: `1px solid ${BORDER}`, ...mono(9, 400, DIM, ".14em"), flexWrap: "wrap", gap: 6 }}>
            <span>BAND A · {moved.bandA.tracked ? "TRACKED" : "UNTRACKED"}{moved.bandA.inTerritory ? " · INSIDE YOUR TERRITORY" : ""}</span>
            <span>INDEX {fmtIdx(moved.bandA.idxWas)} → {fmtIdx(moved.bandA.idxNow)} SINCE 8 JUN</span>
          </div>
          <div style={{ borderLeft: `2px solid ${GOLD}`, background: CARD }}>
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "88px 1fr 190px" : "1fr", gap: isDesktop ? 26 : 14, padding: isDesktop ? "26px 28px 16px" : "18px 16px 10px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {/* current position only — rank deltas are compositionally inflated by cohort attrition */}
                <span style={{ font: `400 34px/1 ${MONO}`, color: GOLD }}>#{moved.bandA.nowRank}<span style={{ fontSize: 13, color: MID, letterSpacing: ".1em" }}> US</span></span>
                <span style={mono(10, 400, GREEN, ".1em")}>INDEX {fmtIdx(moved.bandA.idxWas)} → {fmtIdx(moved.bandA.idxNow)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <Link to={`/hcp/${moved.bandA.hcpId}`} style={{ ...serif(26, 500, INK1, 1.2), textDecoration: "none", borderBottom: `1px solid ${HAIR}` }}>{moved.bandA.name}</Link>
                  <span style={mono(12, 400, STEEL, ".04em")}>{moved.bandA.institution ?? "—"}{moved.bandA.state ? ` · ${moved.bandA.state}` : ""}</span>
                </div>
                {/* movement stated factually; no model-synthesis prose is fabricated */}
                <p style={{ margin: 0, ...serif(16, 300, INK3, 1.6) }}>
                  Rising-star index <span style={{ color: INK1, fontWeight: 500 }}>{fmtIdx(moved.bandA.idxWas)} → {fmtIdx(moved.bandA.idxNow)}</span> since 8 Jun 2026 — currently #{moved.bandA.nowRank} US.
                </p>
              </div>
              {isDesktop ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, borderLeft: `1px solid ${BORDER}`, paddingLeft: 26 }}>
                  <span style={mono(10, 400, MID, ".14em")}>TRACE</span>
                  {/* real ranks_v3 momentum/visibility percentiles only; pubs-90d / trials / peers omitted (not sourced) */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "9px 14px", ...mono(11, 400, MID, 0 as unknown as string), alignItems: "baseline" }}>
                    <span>SCI MOMENTUM</span><span style={{ color: INK2 }}>{fmtIdx(moved.bandA.sciMomentum)}</span>
                    <span>NET MOMENTUM</span><span style={{ color: INK2 }}>{fmtIdx(moved.bandA.netMomentum)}</span>
                    <span>SCI VISIBILITY</span><span style={{ color: INK2 }}>{fmtIdx(moved.bandA.sciVisibility)}</span>
                    <span>NET VISIBILITY</span><span style={{ color: INK2 }}>{fmtIdx(moved.bandA.netVisibility)}</span>
                  </div>
                </div>
              ) : null}
              {/* actions — non-interactive (Home performs no writes). A grid row spanning
                  the two left columns (rank + name), centered within that left region,
                  clear of the TRACE column and its divider. */}
              <div style={{ gridColumn: isDesktop ? "1 / 3" : "auto", display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
                <span style={{ ...mono(10, 500, "#0c0c0b", ".14em"), background: GOLD2, padding: "11px 15px", whiteSpace: "nowrap" }}>GENERATE AI BRIEF</span>
                <span style={{ ...mono(10, 500, GOLD_LINK, ".14em"), border: `1px solid #4a4438`, padding: "10px 15px", whiteSpace: "nowrap" }}>TRACK INVESTIGATOR</span>
              </div>
            </div>
          </div>

          {/* BAND B — secondary */}
          {moved.bandB.length ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 0 10px", borderBottom: `1px solid ${BORDER}`, ...mono(9, 400, DIM, ".14em") }}>
                <span>BAND B · SECONDARY MOVEMENT</span>
                <span>{moved.bandB.length} MORE SINCE 8 JUN</span>
              </div>
              <div style={{ background: CARD, borderLeft: `2px solid #2f2c25` }}>
                {moved.bandB.map((m: Mover, i: number) => (
                  <div key={m.hcpId}>
                    {i > 0 ? <div style={{ height: 1, background: HAIR, margin: "0 28px" }} /> : null}
                    <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "88px 1fr 200px" : "1fr", gap: isDesktop ? 26 : 8, padding: isDesktop ? "20px 28px" : "14px 16px", alignItems: "start" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ font: `400 24px/1 ${MONO}`, color: GOLD }}>#{m.nowRank}<span style={{ fontSize: 11, color: MID, letterSpacing: ".1em" }}> US</span></span>
                        <span style={mono(10, 400, GREEN, ".1em")}>INDEX {fmtIdx(m.idxWas)} → {fmtIdx(m.idxNow)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                          <Link to={`/hcp/${m.hcpId}`} style={{ ...serif(19, 500, INK1), textDecoration: "none", borderBottom: `1px solid ${HAIR}` }}>{m.name}</Link>
                          <span style={mono(11, 400, STEEL)}>{m.institution ?? "—"}{m.state ? ` · ${m.state}` : ""}</span>
                        </div>
                        <p style={{ margin: 0, ...serif(15, 300, MID2, 1.55) }}>Index {fmtIdx(m.idxWas)} → {fmtIdx(m.idxNow)} since 8 Jun.</p>
                      </div>
                      {isDesktop ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "7px 12px", ...mono(11, 400, MID), alignItems: "baseline" }}>
                          <span>YOUR CONTACT</span><span style={{ color: m.tracked ? INK2 : DIM }}>{m.tracked ? "TRACKED" : "NONE"}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
