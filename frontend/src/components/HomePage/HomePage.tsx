// Home — "intelligence-led, ledger lens" redesign.
// Layout authority: docs/design/Home Redesign.dc.html (project 3c3a6c73), with the binding
// FRAME EXCEPTIONS: NavBar is the shipped 6-item bar via AppLayout (the frame's own top bar
// is ignored); wired links are /cohorts/ledger, /me/follow-ups, /institutions/:ta,
// /me/insights, /me/watchlists (portfolio figure + rail header + mobile record row,
// wired 2026-07-31 — the surface was orphaned), and portfolio chips → /hcp/:id (the
// exception covers affordances with NO route, e.g. Skyview / All briefs); every other
// affordance is non-interactive; the session date is the live clock. DATA RULES: WHAT MOVED = 8-Jun snapshot vs current ranks_v3 ("compared against 8 Jun
// 2026"); no dispersion/tied/confidence anywhere; follow-ups ordered by priority then due;
// insight bodies rendered VERBATIM; tracked = getTrackedHcpIds; institutions = national pins.
// Where the frame implies data that does not exist (per-institution "tracked" count,
// per-HCP "why now" line, publications-90d / trials / peers), it is omitted rather than
// proxied. Portfolio chips (name + cohort + us_rank badge) ARE sourceable via
// getTrackedHcpsInTerritory — the shipped home's tracking-chip reader.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../lib/authHelpers";
import { useTA } from "../../lib/TAContext";
import { taIdForApiSlug } from "../../lib/api";
import { taLabelToApiSlug, taSlugToLabel } from "../../lib/routeSlugs";
import { supabase } from "../../lib/supabase";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { getTrackedHcpIds } from "../../lib/watchlists";
import { getFieldInsightsForCurrentUser, type FieldInsight } from "../../lib/fieldInsights";
import { getPinnedInstitutionsForUser, getInstitutionsByNames } from "../../lib/institutionPins";
import { getWhatMoved, type WhatMoved, type Mover } from "../../lib/homeWhatMoved";
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

// ── palette (from the frame) ──────────────────────────────────────────────────
const PAGE = "#0c0c0b", CARD = "#111110", BORDER = "#232321", HAIR = "#1b1b19";
const GOLD = "#c9a25f", GOLD2 = "#e0aa4a", GOLD_LINK = "#e0c08a";
const INK1 = "#f0ebe1", INK2 = "#e8e3d9", INK3 = "#c8c3ba";
const MID = "#8a8681", MID2 = "#a5a097", DIM = "#5d5a54", DIM2 = "#3a3833";
const RED = "#b5705c", GREEN = "#9dbfa4", STEEL = "#93a9ad";
const SERIF = "'Spectral', Georgia, serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const mono = (size: number, weight = 400, color = MID, ls = ".12em") => ({ font: `${weight} ${size}px/1 ${MONO}`, letterSpacing: ls, color });
const serif = (size: number, weight = 400, color = INK2, lh = 1.2) => ({ font: `${weight} ${size}px/${lh} ${SERIF}`, color });
const num = (n: number) => n.toLocaleString("en-US");

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

          {/* greeting + masthead metrics */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, padding: isDesktop ? "34px 30px 22px" : "20px 16px 14px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ ...mono(10, 400, MID, ".16em") }}>{dateLine} · SESSION OPENED</div>
              <h2 style={{ margin: 0, font: `300 ${isDesktop ? 44 : 30}px/1.05 ${SERIF}`, color: INK1, letterSpacing: "-.01em" }}>{greeting}, {firstName}</h2>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: isDesktop ? 46 : 24, flexWrap: "wrap" }}>
              <Metric label="FOLLOW-UPS" sub="OVERDUE" value={String(stats.overdue)} color={RED} />
              <Metric label="FOLLOW-UPS" sub="OPEN" value={String(stats.total)} color={INK2} />
              {/* portfolio figure links to the watchlists surface (was orphaned — no live inbound nav) */}
              <div className="fmhome-link" onClick={go.watchlists} style={{ cursor: "pointer" }}>
                <Metric label="PORTFOLIO" sub="TRACKED" value={String(trackedCount)} color={INK2} />
              </div>
              <Metric label="RISING STARS" sub="COVERED" value={`${coverage?.coverage_percentage ?? 0}%`} color={GOLD} foot={coverage ? `${coverage.tracked_count} OF ${coverage.total_rising_stars_in_territory}` : undefined} />
            </div>
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
                            <span style={serif(19, 500, INK1)}>{a.hcp.name}</span>
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
                        <span style={serif(16, 400, INK2)}>{f.hcp.name}</span>
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
                  <div style={{ height: 3, background: BORDER }}><div style={{ width: `${coverage?.coverage_percentage ?? 0}%`, height: 3, background: GOLD }} /></div>
                  <div style={{ display: "flex", justifyContent: "space-between", ...mono(10, 400, DIM, ".1em") }}>
                    <span>COVERAGE {coverage?.coverage_percentage ?? 0}%</span>
                    <span>{Math.max(0, (coverage?.total_rising_stars_in_territory ?? 0) - (coverage?.tracked_count ?? 0))} OPPORTUNITIES REMAINING</span>
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "12px 18px", alignItems: "baseline" }}>
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
                        {portfolioChips.map((chip) => {
                          const cohortColor = chip.cohort === "rising_star" ? "#9B6DFF"
                            : chip.cohort === "established" ? "#E8A020"
                            : chip.cohort === "community" ? "#4A90E2"
                            : "#6B6A65";
                          const cohortBg = chip.cohort === "rising_star" ? "rgba(155,109,255,0.15)"
                            : chip.cohort === "established" ? "rgba(232,160,32,0.15)"
                            : chip.cohort === "community" ? "rgba(74,144,226,0.15)"
                            : "rgba(107,106,101,0.15)";
                          return (
                            <span
                              key={chip.hcp_id}
                              onClick={() => navigate(`/hcp/${chip.hcp_id}`)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", backgroundColor: cohortBg, color: cohortColor, border: `1px solid ${cohortColor}`, borderRadius: 3, fontSize: 11, fontWeight: 500, fontFamily: "system-ui, -apple-system, sans-serif", whiteSpace: "nowrap", cursor: "pointer" }}
                            >
                              <span>{chip.name}</span>
                              {chip.cohort_rank !== null ? (
                                <span style={{ fontSize: 10, opacity: 0.85 }}>#{chip.cohort_rank}</span>
                              ) : null}
                            </span>
                          );
                        })}
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, padding: "14px 20px", alignItems: "baseline" }}>
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

            {/* THE RECORD — mobile compact list (Exc.9: FU/Inst/Insights link; others inert) */}
            {!isDesktop ? (
              <section>
                <div style={{ ...mono(10, 400, INK2, ".16em"), paddingBottom: 10 }}>THE RECORD</div>
                <div style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <RecordRow label="Follow-ups" right={<span><span style={{ color: RED }}>{stats.overdue}</span> OVERDUE ↗</span>} onClick={go.followUps} />
                  <RecordRow label="Portfolio" right={`${trackedCount} PINNED ↗`} onClick={go.watchlists} />
                  <RecordRow label="Institutions" right={`${institutions.length ? institutions.length : ""} ↗`} onClick={go.institutions} />
                  <RecordRow label="Insights" right={<span>{insights.length} LOGGED ↗</span>} onClick={go.insights} />
                  <RecordRow label="Briefs" right={briefs.length ? `${briefs.length} RECENT` : "NONE"} />
                  <RecordRow label="Relationship activity" right={activity.length ? "RECENT" : "NONE"} last />
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
function Metric({ label, sub, value, color, foot }: { label: string; sub: string; value: string; color: string; foot?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
      <span style={mono(9, 400, MID, ".14em")}>{label}</span>
      <span style={mono(9, 400, DIM, ".14em")}>{sub}</span>
      <span style={{ font: `400 30px/1 ${MONO}`, color, paddingTop: 3 }}>{value}</span>
      {foot ? <span style={mono(9, 400, DIM, ".1em")}>{foot}</span> : null}
    </div>
  );
}

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
        <span style={{ flex: 1, height: 1, background: BORDER }} />
      </div>

      {!moved || !moved.bandA ? (
        <div style={{ border: `1px dashed #33322e`, background: CARD, padding: "26px 28px", ...serif(15, 300, MID, 1.6), fontStyle: "italic" }}>
          No qualifying movement against the 8 June 2026 snapshot for this scope.
        </div>
      ) : (
        <>
          {/* BAND A — primary */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "8px 0 10px", borderBottom: `1px solid ${BORDER}`, ...mono(9, 400, DIM, ".14em"), flexWrap: "wrap", gap: 6 }}>
            <span>BAND A · {moved.bandA.tracked ? "TRACKED" : "UNTRACKED"}{moved.bandA.inTerritory ? " · INSIDE YOUR TERRITORY" : ""}</span>
            <span>INDEX {fmtIdx(moved.bandA.idxWas)} → {fmtIdx(moved.bandA.idxNow)} SINCE 8 JUN</span>
          </div>
          <div style={{ borderLeft: `2px solid ${GOLD}`, background: CARD }}>
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "88px 1fr 300px" : "1fr", gap: isDesktop ? 26 : 14, padding: isDesktop ? "26px 28px 22px" : "18px 16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {/* current position only — rank deltas are compositionally inflated by cohort attrition */}
                <span style={{ font: `400 34px/1 ${MONO}`, color: GOLD }}>#{moved.bandA.nowRank}<span style={{ fontSize: 13, color: MID, letterSpacing: ".1em" }}> US</span></span>
                <span style={mono(10, 400, GREEN, ".1em")}>INDEX {fmtIdx(moved.bandA.idxWas)} → {fmtIdx(moved.bandA.idxNow)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={serif(26, 500, INK1, 1.2)}>{moved.bandA.name}</span>
                  <span style={mono(12, 400, STEEL, ".04em")}>{moved.bandA.institution ?? "—"}{moved.bandA.state ? ` · ${moved.bandA.state}` : ""}</span>
                </div>
                {/* movement stated factually; no model-synthesis prose is fabricated */}
                <p style={{ margin: 0, ...serif(16, 300, INK3, 1.6) }}>
                  Rising-star index <span style={{ color: INK1, fontWeight: 500 }}>{fmtIdx(moved.bandA.idxWas)} → {fmtIdx(moved.bandA.idxNow)}</span> since 8 Jun 2026 — currently #{moved.bandA.nowRank} US.
                </p>
                {/* actions rendered non-interactive — Home performs no writes */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 2 }}>
                  <span style={{ ...mono(10, 500, "#0c0c0b", ".14em"), background: GOLD2, padding: "11px 15px" }}>GENERATE BRIEF</span>
                  <span style={{ ...mono(10, 500, GOLD_LINK, ".14em"), border: `1px solid #4a4438`, padding: "10px 15px" }}>TRACK INVESTIGATOR</span>
                </div>
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
                  <div style={{ height: 1, background: BORDER, marginTop: 2 }} />
                  <span style={mono(10, 400, DIM, ".06em")}>PERCENTILES FROM hcp_rising_star_ranks_v3 · US RISING-STAR COHORT</span>
                </div>
              ) : null}
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
                          <span style={serif(19, 500, INK1)}>{m.name}</span>
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
