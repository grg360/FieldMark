// Institution record — /institution/:slug. Design frame Institutions.dc.html
// 1c (populated), 1d (sparse), 1f/1g (mobile). Registry-first: the record IS a
// reference_institutions row reached through the primary-link roster view; the
// roster is every ranked HCP whose PRIMARY link is this record, banded by
// cohort in the ledger's row rhythm. Slugs stay STRING-DERIVED
// (institutionToSlug over the registry canonical name); legacy profile links
// carrying hcps_v2-string slugs resolve via their carriers' primary link.
// Every gap renders in the frame's absence vocabulary as a fact — NONE —
// SINGLE-SITE RECORD, NOT ON RECORD, NO THEMES. The unresolved line renders
// only when N > 0 and is computed live.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getInstitutionCollaborations,
  getInstitutionExternalPartners,
  taIdForApiSlug,
  type ExternalPartnerInstitution,
  type InstitutionCollaboration,
} from "../lib/api";
import { getInstitutionResearchThemes, type InstitutionResearchTheme } from "../lib/institutionThemes";
import InstitutionEnvironmentPanel from "./InstitutionEnvironmentPanel";
import {
  aggregateInstitutions,
  BAND_LABEL,
  countUnresolvedForRecord,
  fetchRecordGeo,
  fetchTaRoster,
  resolveLegacySlugToRecord,
  resolveRecordBySlug,
  type CohortKey,
  type InstitutionAgg,
  type RosterRow,
} from "../lib/institutionRegistry";
import { getCurrentUser } from "../lib/authHelpers";
import { STATUS_LABEL, type RelationshipStatus } from "../lib/relationships";
import { supabase } from "../lib/supabase";
import { useMediaQuery } from "../lib/useMediaQuery";
import { CANON, DEPTH, FACE } from "../lib/canonicalTokens";
import AppLayout from "./AppLayout";
import InstitutionResearchThemesPanel from "./InstitutionResearchThemesPanel";
import InstitutionCollaborationsPanel from "./InstitutionCollaborationsPanel";
import InstitutionExternalPartnersPanel from "./InstitutionExternalPartnersPanel";

// Canonical migration 2026-08-13 — same map as InstitutionsIndexRoute (the two
// files share this palette verbatim; keeping them identical is the point).
const C = {
  bg: CANON.GROUND.BASE,
  hair: CANON.LINE.HAIR,
  hairStrong: CANON.LINE.EDGE,
  bandBg: CANON.GROUND.RAISE,
  ink1: CANON.INK.PRIME,
  ink2: CANON.INK.BODY,
  ink3: CANON.INK.LABEL,
  ink4: CANON.INK.MUTE,
  ink5: CANON.INK.MUTE,
  amber: CANON.GOLD.PRIME,
  link: CANON.ACTION.LINK,
};

const mono = (size: number, opts?: { ls?: string; color?: string; weight?: number; lh?: number }) => ({
  fontFamily: FACE.data,
  fontSize: size,
  fontWeight: opts?.weight ?? 400,
  letterSpacing: opts?.ls ?? "0.1em",
  color: opts?.color ?? C.ink3,
  lineHeight: opts?.lh ?? 1,
});

const COHORT_ORDER: CohortKey[] = ["established", "rising", "community"];
const COHORT_LABEL: Record<CohortKey, string> = {
  established: "ESTABLISHED",
  rising: "RISING STARS",
  community: "COMMUNITY",
};
const COHORT_ABBR: Record<CohortKey, string> = { established: "EST", rising: "RIS", community: "COM" };

function floor1(v: number | null): string {
  if (v == null) return "—";
  return (Math.floor(v * 10) / 10).toFixed(1);
}

interface MemberRow {
  hcp_id: string;
  name: string;
  cohort: CohortKey;
  us_rank: number | null;
  global_rank: number | null;
  index_score: number | null;
}

export default function InstitutionRoute() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const taSlug = searchParams.get("ta") ?? "nsclc";
  const isMobile = useMediaQuery("(max-width: 767px)");

  const [record, setRecord] = useState<InstitutionAgg | null>(null);
  const [taIdState, setTaIdState] = useState<string | null>(null); // kept for the environment panel
  const [rosterRows, setRosterRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unresolvedN, setUnresolvedN] = useState(0);
  const [geo, setGeo] = useState<{ city: string | null; lat: number | null; lng: number | null }>({
    city: null,
    lat: null,
    lng: null,
  });
  const [themesByHcp, setThemesByHcp] = useState<Map<string, string[]>>(new Map());
  const [engagedByHcp, setEngagedByHcp] = useState<Map<string, number>>(new Map());
  const [statusByHcp, setStatusByHcp] = useState<Map<string, string>>(new Map());
  const [instThemes, setInstThemes] = useState<InstitutionResearchTheme[]>([]);
  const [collabs, setCollabs] = useState<InstitutionCollaboration[]>([]);
  const [partners, setPartners] = useState<ExternalPartnerInstitution[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setRecord(null);
    (async () => {
      const taId = await taIdForApiSlug(taSlug);
      if (!taId || !slug || cancelled) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }
      setTaIdState(taId);
      const all = await fetchTaRoster(taId);
      if (cancelled) return;
      const aggs = aggregateInstitutions(all);
      let rec = resolveRecordBySlug(aggs, slug);
      if (!rec) rec = await resolveLegacySlugToRecord(slug, aggs);
      if (cancelled) return;
      if (!rec) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const mine = all.filter((r) => r.reference_institution_id === rec!.id);
      setRecord(rec);
      setRosterRows(mine);
      setLoading(false);

      const rosterIds = new Set(mine.map((r) => r.hcp_id));
      void countUnresolvedForRecord(rec, taId, rosterIds).then((n) => {
        if (!cancelled) setUnresolvedN(n);
      });
      void fetchRecordGeo(rec.name).then((g) => {
        if (!cancelled) setGeo(g);
      });
      // Themes / collaboration panels are string-keyed legacy surfaces — fed
      // best-effort by the canonical name; their own empty states stay honest
      // when the registry name has no string twin in hcps_v2.
      void getInstitutionResearchThemes(rec.name, taSlug.toUpperCase()).then((t) => {
        if (!cancelled) setInstThemes(t);
      });
      void getInstitutionCollaborations(rec.name, 8, taSlug).then((c) => {
        if (!cancelled) setCollabs(c);
      });
      void getInstitutionExternalPartners(rec.name, 8, taSlug).then((p) => {
        if (!cancelled) setPartners(p);
      });

      const ids = [...rosterIds].slice(0, 200);
      void supabase
        .from("hcp_research_themes_v2")
        .select("hcp_id, theme_name, display_rank")
        .in("hcp_id", ids)
        .order("display_rank", { ascending: true })
        .then(({ data }) => {
          if (cancelled || !data) return;
          const m = new Map<string, string[]>();
          for (const row of data as Array<{ hcp_id: string; theme_name: string | null }>) {
            if (!row.theme_name) continue;
            const list = m.get(row.hcp_id) ?? [];
            list.push(row.theme_name);
            m.set(row.hcp_id, list);
          }
          setThemesByHcp(m);
        });
      void (async () => {
        const user = await getCurrentUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from("msl_hcp_relationships")
          .select("hcp_id, status")
          .eq("user_id", user.id)
          .in("hcp_id", ids);
        if (cancelled || !data) return;
        // Contact state is the relationship STATUS (targeted/engaged…), not an
        // interaction count — the table carries no count.
        const m = new Map<string, number>();
        const s = new Map<string, string>();
        for (const row of data as Array<{ hcp_id: string; status: string | null }>) {
          m.set(row.hcp_id, 1);
          if (row.status) s.set(row.hcp_id, row.status);
        }
        setEngagedByHcp(m);
        setStatusByHcp(s);
      })();
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, taSlug]);

  const members = useMemo(() => {
    const byId = new Map<string, MemberRow>();
    for (const r of rosterRows) {
      const existing = byId.get(r.hcp_id);
      const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.hcp_id.slice(0, 8);
      // An HCP on two boards appears once, under its senior cohort (est > ris > com).
      const rank = COHORT_ORDER.indexOf(r.cohort);
      if (!existing || rank < COHORT_ORDER.indexOf(existing.cohort)) {
        byId.set(r.hcp_id, {
          hcp_id: r.hcp_id,
          name,
          cohort: r.cohort,
          us_rank: r.us_rank,
          global_rank: r.global_rank,
          index_score: r.index_score,
        });
      }
    }
    return [...byId.values()];
  }, [rosterRows]);

  const taUpper = taSlug.toUpperCase().replace(/-/g, " ");

  if (loading) {
    return (
      <AppLayout width="wide">
        <div style={{ padding: "48px 28px", ...mono(11, { color: C.ink4 }) }}>RESOLVING REGISTRY RECORD…</div>
      </AppLayout>
    );
  }
  if (notFound || !record) {
    return (
      <AppLayout width="wide">
        <div style={{ padding: isMobile ? "32px 16px" : "48px 28px", width: "100%", boxSizing: "border-box" }}>
          <div style={{ fontFamily: FACE.value, fontSize: 20, color: C.ink1, marginBottom: 10 }}>
            No registry record resolves from this address.
          </div>
          <div style={{ fontFamily: FACE.value, fontSize: 15, fontWeight: 300, color: C.ink2, maxWidth: 560, lineHeight: 1.6 }}>
            Either the institution carries no ranked {taUpper} HCP, or the name string behind this link has no
            registry match yet. Registry coverage is an enrichment overlay — the string, not the registry, owns the URL.
          </div>
          <Link to={`/institutions/${taSlug}`} style={{ ...mono(11, { color: C.link }), display: "inline-block", marginTop: 20 }}>
            « INSTITUTIONS / {taUpper}
          </Link>
        </div>
      </AppLayout>
    );
  }

  const pad = isMobile ? "16px" : "28px";
  const bandInfo = record.band;
  const singleRoster = members.length === 1;

  const heroFacts: Array<[string, React.ReactNode]> = [
    ["TYPE", <span style={{ ...mono(13, { color: C.ink1, ls: "0" }) }}>{record.type}</span>],
    [
      "NCI DESIGNATION",
      record.nciDesignation ? (
        <span style={{ ...mono(13, { color: C.amber, ls: "0" }) }}>{record.nciDesignation}</span>
      ) : (
        <span style={{ ...mono(13, { color: C.ink4, ls: "0", lh: 1.4 }) }}>
          {record.type === "community_idn" ? "NONE — NOT A CANCER CENTRE" : "NONE"}
        </span>
      ),
    ],
    ["CENTER OF EXCELLENCE", <span style={{ ...mono(13, { color: C.ink1, ls: "0" }) }}>{record.isCoe ? "yes" : "no"}</span>],
    [
      "NETWORK PARENT",
      record.networkParent ? (
        <span style={{ ...mono(13, { color: C.link, ls: "0" }) }}>{record.networkParent}</span>
      ) : (
        <span style={{ ...mono(13, { color: C.ink4, ls: "0", lh: 1.4 }) }}>NONE — SINGLE-SITE RECORD</span>
      ),
    ],
    [
      "CITY",
      geo.city ? (
        <span style={{ ...mono(13, { color: C.ink1, ls: "0" }) }}>
          {geo.city}
          {record.state ? `, ${record.state}` : ""}
        </span>
      ) : record.state ? (
        <span style={{ ...mono(13, { color: C.ink1, ls: "0" }) }}>{record.state}</span>
      ) : (
        <span style={{ ...mono(13, { color: C.ink4, ls: "0", lh: 1.4 }) }}>NOT ON RECORD</span>
      ),
    ],
    [
      "COORDINATES",
      geo.lat != null && geo.lng != null ? (
        <span style={{ ...mono(13, { color: C.ink1, ls: "0" }) }}>
          {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
        </span>
      ) : (
        <span style={{ ...mono(13, { color: C.ink4, ls: "0", lh: 1.4 }) }}>NOT ON RECORD</span>
      ),
    ],
  ];

  function cohortBand(cohort: CohortKey) {
    // Ordered by global_rank, not us_rank. us_rank is the STORED US column, which
    // places by the historical country the board was scored against and is null
    // for 18 established roster rows — those sank to the bottom on the old
    // `?? 1e9`, below every ranked colleague, which is not a statement anyone
    // meant to make. global_rank is already on institution_ta_roster_v1 (never
    // null across all 2,548 rows today) so this needs no RPC change and no
    // fallback that can actually fire.
    //
    // The numeral below renders global_rank to match, so ordering and displayed
    // key are the same fact. That pairing is load-bearing: the rising band does
    // not reorder under this sort (0 of 29 institutions — every linked rising HCP
    // carries a stored us_rank and both keys derive from the same global
    // ordering), but the established band reorders at 58 of 142 institutions,
    // 880 rows. Sorting on one key while displaying the other would have rendered
    // those US ranks visibly out of sequence.
    const list = members
      .filter((m) => m.cohort === cohort)
      .sort((a, b) => (a.global_rank ?? 1e9) - (b.global_rank ?? 1e9));
    if (list.length === 0) return null;
    const scores = list.map((m) => m.index_score).filter((v): v is number => v != null);
    const scoreSpan =
      scores.length > 1 ? `INDEX ${floor1(Math.max(...scores))} → ${floor1(Math.min(...scores))} · FLOORED TO ONE DECIMAL` : null;
    return (
      <div key={cohort}>
        {cohort === "rising" ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              padding: `20px ${pad} 13px`,
              background: C.bandBg,
              borderTop: `1px solid ${C.hairStrong}`,
              borderBottom: `1px solid ${C.hairStrong}`,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={{ ...mono(15, { color: C.ink1, ls: "0.13em", weight: 500 }) }}>
                RISING STARS · {list.length} OF {members.length}
              </span>
              <span style={{ ...mono(11, { ls: "0.13em" }) }}>RANKS AND INDEX BELOW ARE WITHIN THE RISING STAR COHORT</span>
            </div>
            {!isMobile ? (
              <span style={{ textAlign: "right", ...mono(11, { ls: "0.13em", color: C.ink5, lh: 1.7 }) }}>
                A SEPARATE RANKING, NOT A CONTINUATION OF THE ONE ABOVE
                <br />
                NOTHING HERE IS COMPARABLE TO A FIGURE IN THE BAND ABOVE
              </span>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              padding: `11px ${pad}`,
              background: C.bandBg,
              borderTop: `1px solid ${C.hairStrong}`,
              borderBottom: `1px solid ${C.hairStrong}`,
              ...mono(11, { ls: "0.13em" }),
            }}
          >
            <span>
              {COHORT_LABEL[cohort]} · {list.length} OF {members.length} ·{" "}
              {list.length === 1 ? "RANK WITHIN COHORT" : "RANKS WITHIN COHORT"}
            </span>
            {!isMobile ? (
              <span style={{ color: C.ink5 }}>
                {singleRoster && cohort === "community"
                  ? "NO ESTABLISHED OR RISING STAR HCP CARRIES THIS INSTITUTION"
                  : scoreSpan ?? ""}
              </span>
            ) : null}
          </div>
        )}
        {list.map((m) => {
          const themes = (themesByHcp.get(m.hcp_id) ?? []).slice(0, 2);
          const engaged = engagedByHcp.get(m.hcp_id);
          return (
            <div
              key={m.hcp_id}
              onClick={() => navigate(`/hcp/${m.hcp_id}`)}
              style={{
                cursor: "pointer",
                display: isMobile ? "flex" : "grid",
                flexDirection: isMobile ? ("column" as const) : undefined,
                gridTemplateColumns: isMobile ? undefined : "92px 1fr 300px 96px 96px",
                gap: isMobile ? 6 : 20,
                padding: `17px ${pad}`,
                borderBottom: `1px solid ${C.hair}`,
                // Centered 2026-08-13 (was "start"): row height is driven by the
                // themes cell (1 or 2 lines), so top-anchoring left the rank,
                // index and contact cells hanging at the top of tall rows. The
                // per-cell paddingTop nudges that propped up the old alignment
                // are removed with it — they would fight a true center.
                alignItems: isMobile ? "start" : "center",
              }}
            >
              <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: isMobile ? 10 : 3, alignItems: isMobile ? "baseline" : "flex-start" }}>
                {/* Rank numerals are amber for EVERY row (2026-08-13), matching the
                    EST/RS ledger's rank rail: GOLD.RANK at 600, the token reserved
                    for "rank numerals and ledger ordinals ONLY". The old
                    us_rank <= 10 ternary is dropped — the top-10 fact is already
                    stated in the record header, and colour now means "this is a
                    rank" rather than "this rank is special".

                    GLOBAL AND US SWAPPED (2026-08-17): the numeral is global_rank,
                    the key the band is sorted by, and the US rank is demoted to the
                    sublabel. Previously the numeral was the STORED us_rank — which
                    places by the historical country the board was scored against
                    and is null for 18 established roster rows, so those rendered a
                    dash. global_rank is never null across all 2,548 rows, so the
                    dash is now unreachable and every member shows a number. The
                    ?? "—" stays as a type guard, not an expected state. */}
                <span style={{ ...mono(25, { color: CANON.GOLD.RANK, weight: 600, ls: "0" }) }}>
                  {m.global_rank?.toLocaleString() ?? "—"}
                </span>
                <span style={{ ...mono(9, { color: C.ink4 }) }}>
                  {COHORT_ABBR[m.cohort]} · GLOBAL{m.us_rank != null ? ` · #${m.us_rank.toLocaleString()} US` : ""}
                </span>
                {isMobile ? (
                  <span style={{ fontFamily: FACE.value, fontSize: 17, fontWeight: 500, color: C.ink1 }}>{m.name}</span>
                ) : null}
              </div>
              {!isMobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: FACE.value, fontSize: 17, lineHeight: 1.2, fontWeight: 500, color: C.ink1 }}>{m.name}</span>
                </div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingLeft: isMobile ? 0 : undefined }}>
                {themes.length > 0 ? (
                  themes.map((t) => (
                    // Fill dropped 2026-08-13: the pill was uniform on every
                    // chip — no match/primary/secondary state — so it encoded
                    // nothing the column header doesn't already say, and its
                    // padding made long themes wrap into a two-line block while
                    // short ones read as text. Plain mono on the row ground,
                    // like every other roster cell; the NO THEMES absence state
                    // was already unfilled, so the slot is now consistent.
                    <span key={t} style={{ ...mono(11, { ls: "0", lh: 1.3, color: CANON.INK.LABEL }) }}>
                      {t}
                    </span>
                  ))
                ) : (
                  <span style={{ ...mono(11, { color: C.ink5, ls: "0.08em", lh: 1.4 }) }}>NO THEMES ON RECORD</span>
                )}
              </div>
              <div style={{ textAlign: isMobile ? "left" : ("right" as const), ...mono(17, { color: C.ink1, ls: "0" }) }}>
                {floor1(m.index_score)}
              </div>
              {/* Contact state: neutral ink always (2026-08-13) — amber is the
                  rank column's alone, and an amber "NOT ENGAGED" contradicted
                  itself. BOTH branches now read the one STATUS_LABEL map, so the
                  enum path can no longer render a raw "NOT_ENGAGED" while the
                  empty path renders a hand-written literal. */}
              <div
                style={{
                  textAlign: isMobile ? "left" : ("right" as const),
                  ...mono(9, { ls: "0.08em", color: C.ink5 }),
                }}
              >
                {STATUS_LABEL[
                  (engaged != null && engaged > 0
                    ? (statusByHcp.get(m.hcp_id) as RelationshipStatus | undefined)
                    : undefined) ?? "not_engaged"
                ].toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <AppLayout width="wide">
      {/* Commit C 2026-08-05: g2 board per the Pulse scheme. */}
      <div style={{ width: "100%", boxSizing: "border-box", margin: "8px 0 24px", ...DEPTH.PANEL, border: `1px solid ${CANON.LINE.HAIR}` }}>
        <div style={{ padding: `12px ${pad}`, borderBottom: `1px solid ${C.hair}`, ...mono(11, { ls: "0.12em", color: C.ink5 }) }}>
          «{" "}
          <Link to={`/institutions/${taSlug}`} style={{ color: C.link }}>
            INSTITUTIONS / {taUpper}
          </Link>{" "}
          · BAND {bandInfo}
        </div>

        {/* Hero */}
        <div
          style={{
            display: isMobile ? "flex" : "grid",
            flexDirection: isMobile ? ("column" as const) : undefined,
            gridTemplateColumns: isMobile ? undefined : "1fr 460px",
            gap: isMobile ? 20 : 48,
            padding: `34px ${pad} 30px`,
            borderBottom: `1px solid ${C.hairStrong}`,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              borderLeft: `2px solid ${members.length > 3 ? C.amber : CANON.INK.GHOST}`,
              paddingLeft: 16,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <span style={{ ...mono(11, { ls: "0.16em", color: members.length > 3 ? C.amber : C.ink4 }) }}>REGISTRY INSTITUTION</span>
              <span style={{ fontFamily: FACE.value, fontSize: isMobile ? 25 : 30, lineHeight: 1.1, fontWeight: 500, color: C.ink1 }}>
                {record.name}
              </span>
            </div>
            <div style={{ fontFamily: FACE.value, fontSize: 15, lineHeight: 1.6, fontWeight: 300, color: C.ink2, maxWidth: 660 }}>
              {members.length === 1
                ? `One ranked ${taUpper} HCP, in the ${COHORT_LABEL[members[0].cohort].toLowerCase()} cohort.`
                : `${members.length} ranked ${taUpper} HCPs — ${record.est} established, ${record.ris} rising, ${record.com} community.` +
                  (record.bestUsRank != null && record.bestUsRank <= 10 ? ` Holds a US top-10.` : "")}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 28px", alignContent: "start", paddingTop: 6 }}>
            {heroFacts.map(([label, node]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...mono(9, { ls: "0.14em", color: C.ink5 }) }}>{label}</span>
                {node}
              </div>
            ))}
          </div>
        </div>

        {/* Roster header + unresolved line (only when N > 0) */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: `22px ${pad} 12px`, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ ...mono(11, { ls: "0.16em", color: C.amber, weight: 500 }) }}>ROSTER</span>
            <span style={{ ...mono(15, { ls: "0.1em", color: C.ink1, weight: 500 }) }}>
              RANKED {taUpper} HCP · {members.length}
            </span>
          </div>
          <span style={{ ...mono(11, { color: C.ink5, lh: 1.5 }) }}>
            {unresolvedN > 0
              ? `${unresolvedN} HCP CARRYING A ${record.name.toUpperCase()} NAME STRING DID NOT RESOLVE TO THIS RECORD AND ARE NOT COUNTED`
              : singleRoster
                ? "ONE PERSON IS THE WHOLE ROSTER — NOT A TRUNCATED LIST"
                : ""}
          </span>
        </div>

        {!isMobile ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "92px 1fr 300px 96px 96px",
              gap: 20,
              padding: `0 ${pad} 9px`,
              borderBottom: `1px solid ${C.hairStrong}`,
              ...mono(9, { ls: "0.13em", color: C.ink5, lh: 1.5 }),
              textTransform: "uppercase" as const,
            }}
          >
            <div>Rank<br />US · Global</div>
            <div>Physician</div>
            <div>Works on<br />Themes</div>
            <div style={{ textAlign: "right" }}>Index<br />Within cohort</div>
            <div style={{ textAlign: "right" }}>Contact<br />State</div>
          </div>
        ) : null}

        {COHORT_ORDER.map((cohort) => cohortBand(cohort))}

        {/* Institutional Environment — four displayed signals (2026-08-10,
            frame 805df654), sibling to the panel group below. None of the four
            feeds any ordering; bands + member counts remain the only ranking. */}
        {taIdState ? (
          <div style={{ padding: `26px ${pad} 30px` }}>
            <InstitutionEnvironmentPanel
              referenceInstitutionId={record.id}
              taId={taIdState}
              kol={{ established: record.est, rising: record.ris, bestUsRank: record.bestUsRank, bandLabel: BAND_LABEL[record.band] }}
            />
          </div>
        ) : null}

        {/* Themes + collaboration — below the roster per design note 03. The
            panels are string-keyed (legacy surface); they render their own
            honest empty states when the canonical name has no string twin. */}
        <div
          style={{
            display: isMobile ? "flex" : "grid",
            flexDirection: isMobile ? ("column" as const) : undefined,
            gridTemplateColumns: isMobile ? undefined : "1fr 1fr",
            gap: 1,
            background: C.hairStrong,
            borderTop: `1px solid ${C.hairStrong}`,
            borderBottom: `1px solid ${C.hairStrong}`,
          }}
        >
          <div style={{ background: C.bg, padding: `24px ${pad} 28px` }}>
            <InstitutionResearchThemesPanel themes={instThemes} institutionName={record.name} taDisplayName={taUpper} />
          </div>
          <div style={{ background: C.bg, padding: `24px ${pad} 28px`, display: "flex", flexDirection: "column", gap: 26 }}>
            <InstitutionCollaborationsPanel
              collaborations={collabs}
              institutionName={record.name}
              onHcpClick={(hcpId: string) => navigate(`/hcp/${hcpId}`)}
            />
            <InstitutionExternalPartnersPanel partners={partners} sourceInstitutionName={record.name} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `22px ${pad} 26px` }}>
          <span style={{ ...mono(11, { ls: "0.1em", color: C.ink5 }) }}>
            REGISTRY RECORD · PRIMARY LINK VIA TYPE LADDER · SECONDARY LINKS PRESERVED IN hcp_institutions_v2
          </span>
        </div>
      </div>
    </AppLayout>
  );
}
