// PeopleNavStrip — the "matured ledger register" navigation/filter strip.
// Layout authority: docs/design/PeopleNavStrip.dc.html (project 46473259).
//
// PURE CHROME REDESIGN — no data/logic changes. Every control is wired to the SAME
// handlers the retired TAFilterChips + IndicationFilter + DashboardTabs used (setTA,
// setTrack, buildFeedPath, navigate, useFilterContext), so behavior is byte-identical;
// only the look + organization change:
//   Row 1 (SUBJECT): domain (Oncology/Immunology) as a scope label + serif TA tabs for the
//     LIVE TAs + an "All areas · N live ▾" dropdown (the roadmap half was removed
//     2026-09-21; see the manifest note below).
//   Row 2 left (VIEWS): Telescope (mono) — the only remaining view chip after the
//     2026-07-31 collapse; Pulse / Congress / Social / Field intelligence moved to NavBar.
//   Row 2 right (SCOPE): Cohort filter (Established / Rising Stars / Community) grouped with
//     Filters / All-US(territory) / Landscape.
//   Subject line echoes the current selection.
//
// LIVE COMES FROM THE CAPABILITY MANIFEST (2026-09-21). It used to be derived from
// INDICATIONS_BY_TA[domain].active, a hand-maintained literal, with "planned" as everything
// else in that array. PLANNED IS GONE, and the count is why: of the twelve indications the
// roadmap listed for Oncology, ELEVEN did not exist in therapeutic_areas at all -- they were
// strings in a TypeScript array. Meanwhile mesothelioma, which IS a real registry row,
// appeared in neither count because nobody had added it to the literal. A roadmap computed
// as "everything I typed minus everything that works" is not a fact about the product, and
// it sat beside a live count that is one.
//
// Live now means: a leaf TA with at least one cohort behind it, admitted by its ingestion
// config. See lib/taManifest.ts.
//
// NOTE: the frame's "All" COHORT is intentionally omitted — there is no all-cohorts feed in
// the data and the brief forbade logic changes; the three real cohort filters are wired. The
// "All" that remains is the real "All" INDICATION in Row 1.

import { useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTrack, type Track } from "../lib/TrackContext";
import { useTA } from "../lib/TAContext";
import { useFilterContext, statesFromTerritory } from "../lib/filter-context";
import { useMediaQuery } from "../lib/useMediaQuery";
import { cohortServesTa } from "../lib/cohortLedger";
import { offerableByDomain, domainIsLive, type TaCapability } from "../lib/taManifest";
import {
  buildFeedPath,
  taLabelToSlug,
  trackToDashboardSlug,
  type ResolvedFeedRoute,
} from "../lib/routeSlugs";

const GOLD = "#d8a94b", INK = "#ece7dd", MID = "#8e887e", DIM = "#5f5b54", FAINT = "#57534c";
const SERIF = "Newsreader, Georgia, serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const HAIR = "rgba(255,255,255,.07)", HAIR_STRONG = "rgba(255,255,255,.12)", HAIR_SOFT = "rgba(255,255,255,.05)";
const PANEL = "#101013";

// DOMAINS is derived from the manifest inside the component, with domainLive.
// Views (2026-07-31 collapse): only genuine re-renderings of the same people
// remain — Telescope here, Landscape as the gold chip in the scope group.
// Pulse / Congress / Social / Field intelligence left the strip: each is a
// NavBar destination with its own route, and linking them here duplicated the
// bar. The social feed track is retired outright; the FI feed track is retained
// unrouted-from-UI (see App.tsx) pending a decision on its contribution flow.
const VIEWS: { key: string; label: string }[] = [
  { key: "skyview", label: "SkyView" },
];
/**
 * The right-hand meta on a TA row. It used to print "N HCPs" from INDICATIONS_BY_TA.count --
 * a hand-typed number (Oncology "All" said 6,549; the two live boards are far larger) that
 * nothing recomputed. Naming the cohorts a TA actually has is a fact the manifest holds, and
 * it is the fact a reader picking a TA needs: not how many people are in it, but whether the
 * board they are about to look for exists there.
 */
function cohortSummary(cap: TaCapability): string {
  const parts: string[] = [];
  if (cap.est) parts.push("EST");
  if (cap.rs) parts.push("RS");
  if (cap.com) parts.push("COM");
  return parts.join(" · ");
}

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
  const { setTA, manifest } = useTA();
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

  // --- WHICH TAs ARE LIVE HERE ---
  // Identity is slug throughout; labels are rendered, never compared. ONE SOURCE FOR BOTH
  // SURFACES NOW: the feed read INDICATIONS_BY_TA.active ("the card feed has data for this
  // indication") and the ledger read addressability ("this slug maps to a uuid"). Neither
  // asked whether a board exists, they answered the same question differently, and they
  // agreed for colorectal only by coincidence.
  const domains = offerableByDomain(manifest);
  const DOMAINS = domains.map((d) => d.domainLabel);
  // null manifest = still loading. Empty, not a guess: a tab that appears and then
  // disappears reads as a bug, and a tab rendered from a stale literal reads as a promise.
  const live: TaCapability[] =
    manifest === null ? [] : (domains.find((d) => d.domainLabel === taLabel)?.tas ?? []);

  // The tab that reads as current. On a TA-selecting surface that is the resolved TA, not
  // route.indicationSlug -- see the dataTaSlug prop note.
  const currentSlug = taSelectable ? (dataTaSlug ?? "") : indicationSlug;

  // WAS `(d) => d === "Oncology"`, a literal that outlived its reason. Immunology was
  // deactivated 2026-07-31 because its only target was the card feed; Atopic Dermatitis has
  // had an Established board since, is admitted by its ingestion config, and is offered by
  // the ledger picker -- so the app told users Immunology was live in three places while
  // this line quietly refused to switch to it. The manifest is the one answer now.
  const domainLive = (d: string) => domainIsLive(manifest, d);

  // --- handlers (identical wiring to the retired components) ---

  /**
   * SWITCH THE DOMAIN. On a TA-selecting surface this stays put and changes the TA, exactly
   * like pickIndication below.
   *
   * THE TARGET IS A LEAF TA FROM THE MANIFEST, AND THAT IS THE WHOLE FIX (2026-09-23).
   *
   * It used to compute the target with resolveIndicationForTaSwitch, which returns a FEED
   * INDICATION slug -- a vocabulary that includes the "all" aggregate. Immunology's first
   * active indication IS "all", so clicking the chip called onPickTa("all"), the ledger wrote
   * ?ta=all, useLedgerTa asked taIdForApiSlug("all") and got undefined because "all" is not
   * in TA_ID_MAP, layer 1 failed, layer 2 answered with the CURRENT session TA, and the
   * URL-rewrite effect replaced ?ta=all with the TA the user was already on. The chip did
   * exactly what it was told and looked completely inert.
   *
   * INDICATIONS AND LEAF TAs ARE DIFFERENT VOCABULARIES. The feed had an "all" board, so
   * resolveIndicationForTaSwitch returning "all" was right THERE. The ledger has no "all"
   * board -- it is one TA at a time by construction -- so its TA selector must be given
   * something taIdForApiSlug can resolve. Reaching for the feed's resolver on a ledger
   * control was the mistake, and the retired feed is why nobody noticed it was the wrong
   * resolver rather than merely the wrong surface.
   *
   * FIRST OFFERABLE LEAF IN MANIFEST ORDER, which covers both shapes without a branch:
   * Immunology has exactly one (Atopic Dermatitis) and Oncology has two, where the first is
   * Colorectal Cancer because the manifest orders by label. The leaf tabs beside the chips
   * are how the reader reaches the other one, so landing on either is a starting point rather
   * than a verdict.
   *
   * NO TARGET -> INERT, AND NOTHING INVENTED. A domain with no offerable leaf returns without
   * writing anything. The old `!domainLive(chip)` guard said the same thing less directly;
   * absence of a target IS absence of a live domain, read off the same manifest.
   *
   * IF THE NEW TA LACKS THE MOUNTED COHORT the ledger's own "unavailable for this area" state
   * handles it -- Immunology + Rising Stars is the live example. Not special-cased here: a
   * chip that silently changed cohort as well as area would be two actions on one click.
   */
  const pickDomain = (chip: string) => {
    if (chip === taLabel) return;
    const target = domains.find((d) => d.domainLabel === chip)?.tas[0];
    if (!target) return;
    // TA-SELECTING SURFACE (the ledger): change the TA and stay. onPickTa writes ?ta=, the
    // ledger re-resolves from the URL and reloads its rows -- and useLedgerTa's own effect
    // writes the session TA, so setTA here would be a second writer racing it.
    if (taSelectable) { onPickTa?.(target.slug); setTaOpen(false); setSheet(false); return; }
    // Ledger without TA selection: inert, as pickIndication is. Nothing to navigate to.
    if (ledgerMount) { setTaOpen(false); setSheet(false); return; }
    setTA(taLabelToSlug(chip), target.slug);
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
  const moreMeta = `${live.length} live`;

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
                      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", color: "#5b5852" }}>{cohortSummary(o)}</span>
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
                <div style={{ position: "absolute", top: "calc(100% + 1px)", left: -16, zIndex: 50, width: 300, background: PANEL, border: `1px solid ${HAIR_STRONG}`, boxShadow: "0 24px 60px rgba(0,0,0,.6)" }}>
                  <div>
                    <div style={{ padding: "18px 20px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>Live now · {live.length}</div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {live.map((o) => (
                          <div key={o.slug} onClick={() => pickIndication(o.slug)} style={{ cursor: ledgerMount && !taSelectable && o.slug !== currentSlug ? "default" : "pointer", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${HAIR_SOFT}` }}>
                            <span style={{ fontFamily: SERIF, fontSize: 15.5, color: o.slug === currentSlug ? GOLD : ledgerMount && !taSelectable ? FAINT : INK }}>{o.label}</span>
                            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", color: "#5b5852" }}>{cohortSummary(o)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
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
