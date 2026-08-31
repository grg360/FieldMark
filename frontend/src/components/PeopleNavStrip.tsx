// PeopleNavStrip — the "matured ledger register" navigation/filter strip.
// Layout authority: docs/design/PeopleNavStrip.dc.html (project 46473259).
//
// PURE CHROME REDESIGN — no data/logic changes. Every control is wired to the SAME
// handlers the retired TAFilterChips + IndicationFilter + DashboardTabs used (setTA,
// setTrack, buildFeedPath, navigate, useFilterContext), so behavior is byte-identical;
// only the look + organization change:
//   Row 1 (SUBJECT): domain (Oncology/Immunology) as a scope label + serif TA tabs for the
//     LIVE indications + an "All areas · N live · M planned ▾" roadmap dropdown.
//   Row 2 left (VIEWS): Telescope (mono) — the only remaining view chip after the
//     2026-07-31 collapse; Pulse / Congress / Social / Field intelligence moved to NavBar.
//   Row 2 right (SCOPE): Cohort filter (Established / Rising Stars / Community) grouped with
//     Filters / All-US(territory) / Landscape.
//   Subject line echoes the current selection.
//
// LIVE vs PLANNED is REAL — derived from INDICATIONS_BY_TA[domain].active (the same flag the
// old IndicationFilter used). Live = active indications (excluding the "All" aggregate);
// planned = the rest. The config carries no timeframes, so the roadmap lists names only.
//
// NOTE: the frame's "All" COHORT is intentionally omitted — there is no all-cohorts feed in
// the data and the brief forbade logic changes; the three real cohort filters are wired. The
// "All" that remains is the real "All" INDICATION in Row 1.

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTrack, type Track } from "../lib/TrackContext";
import { useTA } from "../lib/TAContext";
import { useFilterContext, statesFromTerritory } from "../lib/filter-context";
import { useMediaQuery } from "../lib/useMediaQuery";
import { INDICATIONS_BY_TA } from "./IndicationFilter";
import { loadAddressableTas } from "../lib/ledgerTa";
import { cohortServesTa } from "../lib/cohortLedger";
import {
  buildFeedPath,
  resolveIndicationForTaSwitch,
  taLabelToSlug,
  trackToDashboardSlug,
  type ResolvedFeedRoute,
} from "../lib/routeSlugs";

const GOLD = "#d8a94b", INK = "#ece7dd", MID = "#8e887e", DIM = "#5f5b54", FAINT = "#57534c";
const SERIF = "Newsreader, Georgia, serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const HAIR = "rgba(255,255,255,.07)", HAIR_STRONG = "rgba(255,255,255,.12)", HAIR_SOFT = "rgba(255,255,255,.05)";
const PANEL = "#101013";

const DOMAINS = ["Oncology", "Immunology"];
// Views (2026-07-31 collapse): only genuine re-renderings of the same people
// remain — Telescope here, Landscape as the gold chip in the scope group.
// Pulse / Congress / Social / Field intelligence left the strip: each is a
// NavBar destination with its own route, and linking them here duplicated the
// bar. The social feed track is retired outright; the FI feed track is retained
// unrouted-from-UI (see App.tsx) pending a decision on its contribution flow.
const VIEWS: { key: string; label: string }[] = [
  { key: "skyview", label: "SkyView" },
];
const COHORTS: { key: Track; label: string }[] = [
  { key: "established", label: "Established" },
  { key: "rising-stars", label: "Rising Stars" },
  { key: "community", label: "Community" },
];

function num(n: number): string { return n.toLocaleString("en-US"); }

interface Props {
  route: ResolvedFeedRoute;
  onOpenFilters: () => void;
  userTerritory: string | null;
  // The subject line (updated · title · surface · count) is suppressed when the strip floats
  // over an immersive surface (Skyview), where the surface carries its own title.
  showSubjectLine?: boolean;
  // Ledger mount (2026-07-31): the cohort row drives the LEDGER's cohort routes instead of
  // the feed's when this override is provided — one cohort control, context-appropriate
  // target. The default (absent) keeps the shipped feed behavior byte-identical.
  onPickCohort?: (key: Track) => void;
  // TA SELECTION IN PLACE (2026-08-31). Supplied only by the ledger, which now serves any TA
  // with board rows. When present, row 1's tabs SELECT A TA on the current surface instead of
  // navigating to the card feed -- so the strip stops being decoration there. Its presence is
  // also what splits `ledgerMount`: feed navigation stays inert, TA selection goes live.
  onPickTa?: (slug: string) => void;
  // The resolved DATA-TA slug (nsclc, colorectal-cancer, ...). Passed explicitly rather than
  // read back off `route`: resolveFeedRoute rewrites an indication it does not recognise for
  // the domain (a hepatology ledger would come back as "mash"), and this value decides which
  // tab is current and which cohorts are available. Too load-bearing to round-trip.
  dataTaSlug?: string | null;
  // Filters / All-US(territory) chips mutate filter-context, which the ledger RPCs do not
  // read — rendering them there would be dead controls. Default true (feed) renders them.
  showScopeChips?: boolean;
}

export default function PeopleNavStrip({ route, onOpenFilters, userTerritory, showSubjectLine = true, onPickCohort, showScopeChips = true, onPickTa, dataTaSlug }: Props) {
  const { track, setTrack } = useTrack();
  const { setTA } = useTA();
  const navigate = useNavigate();
  const { states, setStates, hydrateFromProfile } = useFilterContext();
  const narrow = useMediaQuery("(max-width: 767px)");

  const [taOpen, setTaOpen] = useState(false);
  const [sheet, setSheet] = useState(false);

  const taLabel = route.taLabel;
  const indicationLabel = route.indicationLabel;
  const taSlug = route.taSlug;
  const indicationSlug = route.indicationSlug;

  // Ledger mount marker (onPickCohort is only supplied there). On the ledger, controls that
  // would route to the card feed — which is not shipping — are rendered inert.
  const ledgerMount = !!onPickCohort;
  // THE SPLIT (2026-08-31). `ledgerMount` used to mean two things at once: "do not navigate
  // to the feed" AND "no other TA is reachable". The second stopped being true when the
  // ledger RPCs took p_ta_id, but the single flag kept every other TA greyed out — a chip
  // rendered under "Live now" that could not be clicked, which is worse than either honest
  // state. Feed navigation stays inert; TA selection is live wherever onPickTa is supplied.
  const taSelectable = !!onPickTa;

  // --- WHICH INDICATIONS ARE LIVE HERE ---
  // Identity is o.slug throughout; labels are rendered, never compared.
  const opts = INDICATIONS_BY_TA[taLabel] ?? [];
  // On a TA-selecting surface the honest predicate is "does this TA have a board", which is
  // therapeutic_areas + TA_ID_MAP (loadAddressableTas), NOT INDICATIONS_BY_TA.active — that
  // flag means "the card feed has data for this indication". The two agree for colorectal
  // today by coincidence, and coincidences of that kind are how the last four TA defects got
  // in. On the feed the `active` flag remains exactly right, so it is unchanged there.
  const [addressable, setAddressable] = useState<string[] | null>(null);
  useEffect(() => {
    if (!taSelectable) return;
    let alive = true;
    void loadAddressableTas().then((tas) => {
      if (alive) setAddressable(tas.map((t) => t.slug));
    });
    return () => { alive = false; };
  }, [taSelectable]);

  const liveByFlag = opts.filter((o) => o.active && o.slug !== "all");
  const live = taSelectable
    // null = still loading. Show only the current TA rather than flashing the feed's set and
    // then narrowing it -- a tab that appears and disappears reads as a bug.
    ? (addressable === null
        ? opts.filter((o) => o.slug === dataTaSlug)
        : opts.filter((o) => o.slug !== "all" && addressable.includes(o.slug)))
    : liveByFlag;
  const planned = taSelectable
    ? opts.filter((o) => o.slug !== "all" && !live.some((l) => l.slug === o.slug))
    : opts.filter((o) => !o.active);

  // The tab that reads as current. On a TA-selecting surface that is the resolved TA, not
  // route.indicationSlug -- see the dataTaSlug prop note.
  const currentSlug = taSelectable ? (dataTaSlug ?? "") : indicationSlug;

  // Immunology deactivated 2026-07-31: its only target is the card feed. Rendered in the
  // planned treatment — visible, clearly unavailable, not clickable. Oncology stays live.
  const domainLive = (d: string) => d === "Oncology";

  // --- handlers (identical wiring to the retired components) ---
  const pickDomain = (chip: string) => {
    if (chip === taLabel || !domainLive(chip)) return;
    const newTaSlug = taLabelToSlug(chip);
    const { slug: indSlug } = resolveIndicationForTaSwitch(chip, indicationSlug);
    setTA(newTaSlug, indSlug);
    navigate(buildFeedPath(newTaSlug, trackToDashboardSlug(track), indSlug));
    setTaOpen(false); setSheet(false);
  };

  const pickIndication = (indSlug: string) => {
    // Clicking the current tab is a no-op on every surface: it is a scope label, not a
    // navigation.
    if (indSlug === currentSlug) { setTaOpen(false); setSheet(false); return; }
    // TA-SELECTING SURFACE (the ledger): stay put and change the TA. onPickTa writes ?ta=,
    // the ledger re-resolves from the URL and reloads its rows. No navigation, so the
    // territory scope, the open cohort and the scroll position all survive the switch.
    if (taSelectable) { onPickTa?.(indSlug); setTaOpen(false); setSheet(false); return; }
    // Ledger without TA selection, and "All": still inert — the target is the card feed.
    if (ledgerMount) { setTaOpen(false); setSheet(false); return; }
    setTA(taSlug, indSlug);
    navigate(buildFeedPath(taSlug, trackToDashboardSlug(track), indSlug));
    setTaOpen(false); setSheet(false);
  };

  const pickView = (key: string) => {
    if (key === track) return;
    setTrack(key as Track);
    navigate(buildFeedPath(taSlug, trackToDashboardSlug(key as Track), indicationSlug));
  };

  const pickCohort = (key: Track) => {
    if (key === track) return;
    // A cohort that cannot answer for this TA is rendered unavailable below; this is the
    // handler-side half of the same rule, so a keyboard or programmatic path cannot get in
    // where the pointer cannot.
    if (taSelectable && !cohortServesTa(key, dataTaSlug)) return;
    setTrack(key);
    if (onPickCohort) { onPickCohort(key); return; }
    navigate(buildFeedPath(taSlug, trackToDashboardSlug(key), indicationSlug));
  };

  const toggleTerritory = () => {
    if (states.length > 0) setStates([]);
    else hydrateFromProfile(userTerritory ?? "", statesFromTerritory(userTerritory ?? ""));
  };

  const openLandscape = () => {
    navigate(`/landscape/${indicationSlug === "all" ? "nsclc" : indicationSlug}`);
  };

  // --- active-state derivation (single track model; honest) ---
  const viewActive = (key: string): boolean => track === key;
  const cohortActive = (key: Track) => track === key;

  const activeCohort = COHORTS.find((c) => cohortActive(c.key));
  const activeView = VIEWS.find((v) => viewActive(v.key));
  const surface = activeCohort?.label ?? activeView?.label ?? "";
  const title = indicationSlug === "all" ? taLabel : `${taLabel} — ${indicationLabel}`;
  const count = route.indicationCount;
  const territoryLabel = states.length > 0 ? `Territory · ${states.length}` : "All US";
  const landscapeLabel = indicationSlug === "all" ? "Landscape" : `${indicationLabel} landscape`;
  const moreMeta = `${live.length} live · ${planned.length} planned`;

  // ============================ MOBILE ============================
  if (narrow) {
    return (
      <div style={{ position: "relative", fontFamily: SERIF, borderBottom: `1px solid ${HAIR}` }}>
        {/* domain + subject */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px 0" }}>
          {DOMAINS.map((d) => (
            <div key={d} onClick={() => pickDomain(d)} title={domainLive(d) ? undefined : "Planned"} style={{ cursor: domainLive(d) ? "pointer" : "default", fontFamily: MONO, fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: d === taLabel ? GOLD : domainLive(d) ? DIM : FAINT }}>{d}</div>
          ))}
        </div>
        <div onClick={() => setSheet(true)} style={{ cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, padding: "6px 16px 13px", borderBottom: `1px solid ${HAIR}` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <span style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.1, color: INK }}>{indicationSlug === "all" ? taLabel : indicationLabel}</span>
            <span style={{ fontSize: 10, color: GOLD }}>▾</span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: FAINT, paddingBottom: 4 }}>{moreMeta}</span>
        </div>

        {/* views — suppressed on the ledger mount (2026-08-06): SkyView is a NavBar
            destination; linking it from the ledger duplicated the bar */}
        {ledgerMount ? null : (
        <div style={{ display: "flex", alignItems: "stretch", gap: 20, padding: "0 16px", overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${HAIR_STRONG}` }}>
          {VIEWS.map((v) => {
            const on = viewActive(v.key);
            return (
              <div key={v.key} onClick={() => pickView(v.key)} style={{ position: "relative", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "14px 0 12px", fontFamily: MONO, fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", whiteSpace: "nowrap", color: on ? GOLD : MID }}>
                <span style={{ width: 4, height: 4, background: on ? GOLD : "rgba(255,255,255,.16)" }} />
                {v.label}
                <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 1.5, background: on ? GOLD : "transparent" }} />
              </div>
            );
          })}
        </div>
        )}

        {/* cohort */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 0" }}>
          <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".22em", textTransform: "uppercase", color: FAINT }}>Cohort</span>
          <div style={{ display: "flex", alignItems: "stretch", border: `1px solid ${HAIR_STRONG}`, overflowX: "auto", scrollbarWidth: "none" }}>
            {COHORTS.map((c, i) => {
              const on = cohortActive(c.key);
              const off = taSelectable && !cohortServesTa(c.key, dataTaSlug);
              return (
                <div key={c.key} onClick={() => pickCohort(c.key)} title={off ? `Not built for ${indicationLabel} yet` : undefined} style={{ cursor: off ? "default" : "pointer", padding: "7px 11px", whiteSpace: "nowrap", borderLeft: `1px solid ${i === 0 ? "transparent" : HAIR_STRONG}`, fontFamily: SERIF, fontSize: 13, background: on ? "rgba(216,169,75,.09)" : "transparent", color: on ? GOLD : off ? FAINT : MID }}>{c.label}</div>
              );
            })}
          </div>
        </div>

        {/* filters / territory / landscape */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px 13px", overflowX: "auto", scrollbarWidth: "none" }}>
          {showScopeChips ? <div onClick={onOpenFilters} style={ghostChip(false)}>Filters</div> : null}
          {showScopeChips ? <div onClick={toggleTerritory} style={ghostChip(states.length > 0)}>{territoryLabel} <span style={{ fontSize: 8, color: GOLD }}>▾</span></div> : null}
          <div onClick={openLandscape} style={goldChip()}>{landscapeLabel}</div>
        </div>

        {sheet ? (
          <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={() => setSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(6,6,8,.72)" }} />
            <div style={{ position: "relative", background: PANEL, borderTop: `1px solid ${HAIR_STRONG}`, maxHeight: "82vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px 12px", borderBottom: `1px solid ${HAIR}` }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: "#7d786f" }}>{taLabel} — therapeutic areas</span>
                <span onClick={() => setSheet(false)} style={{ cursor: "pointer", fontFamily: MONO, fontSize: 12, color: "#7d786f" }}>✕</span>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: GOLD }}>Live now · {live.length}</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                  {live.map((o) => (
                    <div key={o.slug} onClick={() => pickIndication(o.slug)} style={{ cursor: ledgerMount && !taSelectable && o.slug !== currentSlug ? "default" : "pointer", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: `1px solid ${HAIR_SOFT}` }}>
                      <span style={{ fontFamily: SERIF, fontSize: 17, color: o.slug === currentSlug ? GOLD : ledgerMount && !taSelectable ? FAINT : INK }}>{o.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", color: "#5b5852" }}>{o.count != null ? `${num(o.count)} HCPs` : "Live"}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: "#7d786f", marginTop: 22 }}>On the roadmap · {planned.length}</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                  {planned.map((o) => (
                    <div key={o.slug} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${HAIR_SOFT}` }}>
                      <span style={{ fontFamily: SERIF, fontSize: 15.5, color: "#6f6b64" }}>{o.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".14em", textTransform: "uppercase", color: FAINT }}>Planned</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ============================ DESKTOP ============================
  return (
    <div style={{ position: "relative", fontFamily: SERIF }}>
      {/* SUBJECT: domain + therapeutic area */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 22, minHeight: 56, padding: "0 20px", borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 9 }}>
          {DOMAINS.map((d) => (
            <div key={d} onClick={() => pickDomain(d)} title={domainLive(d) ? undefined : "Planned"} style={{ cursor: domainLive(d) ? "pointer" : "default", fontFamily: MONO, fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: d === taLabel ? GOLD : domainLive(d) ? DIM : FAINT }}>{d}</div>
          ))}
        </div>
        <div style={{ width: 1, height: 22, background: "rgba(255,255,255,.1)", marginBottom: 11 }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: 26, flex: 1 }}>
          {/* live indications as serif tabs, "All" first */}
          {[
            // "All" is an aggregate across the feed's indications, not a TA -- there is no
            // all-TA board to select, so a TA-selecting surface omits it rather than
            // offering a tab that cannot resolve to a uuid.
            ...(taSelectable ? [] : [{ label: "All", key: "all" }]),
            ...live.map((o) => ({ label: o.label, key: o.slug })),
          ].map((t) => {
            const on = t.key === currentSlug;
            // Inert only where the click would go to the unshipped card feed. On a
            // TA-selecting surface every live tab is a real selection.
            const inert = ledgerMount && !on && !taSelectable;
            return (
              <div key={t.key} onClick={() => pickIndication(t.key)} title={inert ? "Planned" : undefined} style={{ position: "relative", cursor: inert ? "default" : "pointer", paddingBottom: 11, fontFamily: SERIF, fontSize: 16.5, lineHeight: 1, whiteSpace: "nowrap", color: on ? INK : inert ? FAINT : MID }}>
                {t.label}
                <div style={{ position: "absolute", left: -2, right: -2, bottom: -1, height: 1.5, background: on ? GOLD : "transparent" }} />
              </div>
            );
          })}

          {/* All areas — roadmap dropdown */}
          <div style={{ position: "relative", paddingBottom: 11 }}>
            <div onClick={() => setTaOpen((v) => !v)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: taOpen ? GOLD : MID }}>
              <span>All areas</span>
              <span style={{ color: "#4e4b45" }}>{moreMeta}</span>
              <span style={{ fontSize: 9, color: GOLD }}>▾</span>
            </div>

            {taOpen ? (
              <div>
                <div onClick={() => setTaOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", top: "calc(100% + 1px)", left: -16, zIndex: 50, width: 660, background: PANEL, border: `1px solid ${HAIR_STRONG}`, boxShadow: "0 24px 60px rgba(0,0,0,.6)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "238px 1fr" }}>
                    <div style={{ padding: "18px 20px", borderRight: `1px solid rgba(255,255,255,.08)` }}>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>Live now · {live.length}</div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {live.map((o) => (
                          <div key={o.slug} onClick={() => pickIndication(o.slug)} style={{ cursor: ledgerMount && !taSelectable && o.slug !== currentSlug ? "default" : "pointer", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${HAIR_SOFT}` }}>
                            <span style={{ fontFamily: SERIF, fontSize: 15.5, color: o.slug === currentSlug ? GOLD : ledgerMount && !taSelectable ? FAINT : INK }}>{o.label}</span>
                            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", color: "#5b5852" }}>{o.count != null ? `${num(o.count)} HCPs` : "Live"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: "18px 20px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: "#7d786f" }}>On the roadmap · {planned.length}</div>
                        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".12em", color: "#4e4b45" }}>Opens as coverage clears review</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px" }}>
                        {planned.map((o) => (
                          <div key={o.slug} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${HAIR_SOFT}` }}>
                            <span style={{ fontFamily: SERIF, fontSize: 14.5, color: "#6f6b64" }}>{o.label}</span>
                            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: FAINT }}>Planned</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderTop: `1px solid rgba(255,255,255,.08)`, background: "rgba(255,255,255,.015)" }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: FAINT }}>Planned areas open as coverage clears review</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* VIEWS (what) + SCOPE (who / where) */}
      <div style={{ display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 32, padding: "0 20px", borderBottom: `1px solid ${HAIR_STRONG}`, flexWrap: "wrap" }}>
        {/* views — suppressed on the ledger mount (2026-08-06): SkyView is a NavBar
            destination; linking it from the ledger duplicated the bar. The empty div
            keeps space-between pinning the scope group right. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 18, flex: "none" }}>
          {ledgerMount ? null : VIEWS.map((v) => {
            const on = viewActive(v.key);
            return (
              <div key={v.key} onClick={() => pickView(v.key)} style={{ position: "relative", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, padding: "17px 0 15px", fontFamily: MONO, fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", whiteSpace: "nowrap", color: on ? GOLD : MID }}>
                <span style={{ width: 4, height: 4, background: on ? GOLD : "rgba(255,255,255,.16)" }} />
                {v.label}
                <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 1.5, background: on ? GOLD : "transparent" }} />
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", flex: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: FAINT, whiteSpace: "nowrap" }}>Cohort</span>
            <div style={{ display: "flex", alignItems: "stretch", border: `1px solid ${HAIR_STRONG}` }}>
              {COHORTS.map((c, i) => {
                const on = cohortActive(c.key);
                // UNAVAILABLE, NOT HIDDEN. Community exists for one TA so far; greying the
                // chip says that, where removing it would imply the cohort does not exist.
                // The tooltip names the reason so the state is legible without a click --
                // the ledger's absence panel is a fallback for deep links now, not the
                // primary way a user learns this.
                const off = taSelectable && !cohortServesTa(c.key, dataTaSlug);
                return (
                  <div key={c.key} onClick={() => pickCohort(c.key)} title={off ? `Not built for ${indicationLabel} yet` : undefined} style={{ cursor: off ? "default" : "pointer", padding: "6px 10px", whiteSpace: "nowrap", borderLeft: `1px solid ${i === 0 ? "transparent" : HAIR_STRONG}`, fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.2, background: on ? "rgba(216,169,75,.09)" : "transparent", color: on ? GOLD : off ? FAINT : MID }}>{c.label}</div>
                );
              })}
            </div>
          </div>

          <div style={{ width: 1, height: 22, background: "rgba(255,255,255,.09)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {showScopeChips ? <div onClick={onOpenFilters} style={ghostChip(false)}>Filters</div> : null}
            {showScopeChips ? <div onClick={toggleTerritory} style={ghostChip(states.length > 0)}>{territoryLabel} <span style={{ fontSize: 9, color: GOLD }}>▾</span></div> : null}
            <div onClick={openLandscape} style={goldChip()}>{landscapeLabel}</div>
          </div>
        </div>
      </div>

      {/* SUBJECT LINE — echoes the selection */}
      {showSubjectLine ? (
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: "#4e4b45" }}>Updated just now</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 400, letterSpacing: "-.01em", color: INK }}>{title}</span>
            {surface ? <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "#7d786f" }}>{surface}</span> : null}
          </div>
          {count != null ? <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: FAINT }}>{num(count)} physicians</span> : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}

// shared chip styles (mono, bordered)
function ghostChip(active: boolean): CSSProperties {
  return {
    flex: "none", cursor: "pointer", border: `1px solid ${active ? "rgba(216,169,75,.42)" : "rgba(255,255,255,.11)"}`,
    background: active ? "rgba(216,169,75,.07)" : "transparent", padding: "6px 10px", whiteSpace: "nowrap",
    fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: active ? GOLD : "#a49d92",
    display: "flex", alignItems: "center", gap: 7,
  };
}
function goldChip(): CSSProperties {
  return {
    flex: "none", cursor: "pointer", border: "1px solid rgba(216,169,75,.42)", background: "rgba(216,169,75,.07)",
    padding: "6px 11px", whiteSpace: "nowrap", fontFamily: MONO, fontSize: 10, letterSpacing: ".14em",
    textTransform: "uppercase", color: GOLD,
  };
}
