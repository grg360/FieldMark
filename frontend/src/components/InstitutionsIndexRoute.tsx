// Institutions index — /institutions/:ta. Design frame Institutions.dc.html 1a
// (concentration bands), 1b (network grouping), 1e (mobile 390). Registry-first:
// rows are registry institutions carrying >=1 ranked HCP in the TA via their
// PRIMARY link (ladder + tie-break computed in institution_ta_roster_v1), NOT
// the name-keyed string view. Ordered by ranked-HCP count — deliberately NOT a
// ranking of institutions; the frame's language on this is kept verbatim.
// Bands cut on rank thresholds so the shape survives a refilter. The E/R/C
// cohort split reads at parity with the headline count (full-board counts mean
// community dominates by volume on many rows — the split is what keeps that
// legible: 315 as E300/R34/C3 means something different than C300).

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCurrentUser } from "../lib/authHelpers";
import { getPinnedInstitutionsForUser, pinInstitution, unpinInstitution } from "../lib/institutionPins";
import { taIdForApiSlug } from "../lib/api";
import {
  aggregateInstitutions,
  BAND_LABEL,
  fetchTaRoster,
  type InstitutionAgg,
} from "../lib/institutionRegistry";
import { useMediaQuery } from "../lib/useMediaQuery";
import { CANON, DEPTH, FACE } from "../lib/canonicalTokens";
import AppLayout from "./AppLayout";
import PageHero from "./PageHero";

// CANONICAL MIGRATION 2026-08-13. The warm parchment ramp folds into the one
// cool ink ramp by luminance role; the near-black hairlines become the
// register's OPAQUE rules (LINE.HAIR/EDGE) — visibly more present than the
// old #141417/#1e1e21, which is the intended canonical behaviour. Composition:
// the page ground comes from the shell (AppLayout paints DEPTH.GROUND on BASE);
// section containers take PANEL; bands/toggles are INSET wells; rows stay flat.
const C = {
  bg: CANON.GROUND.BASE,
  hair: CANON.LINE.HAIR,
  hairStrong: CANON.LINE.EDGE,
  bandBg: CANON.GROUND.RAISE,
  ink1: CANON.INK.PRIME,
  ink2: CANON.INK.BODY,
  ink3: CANON.INK.LABEL, // the default mono ink — the label voice
  ink4: CANON.INK.MUTE,
  ink5: CANON.INK.MUTE, // near-twin of ink4 collapses (rule 1)
  ink6: CANON.INK.MUTE, // carries live absence copy → never GHOST (rule 4)
  amber: CANON.GOLD.PRIME,
  chipBorder: CANON.LINE.HAIR,
  link: CANON.ACTION.LINK, // was steel #8fa3ab — links are the one action colour
  toggleBg: CANON.GROUND.INSET,
  toggleBorder: CANON.LINE.HAIR,
};

const mono = (size: number, opts?: { ls?: string; color?: string; weight?: number; lh?: number }) => ({
  fontFamily: FACE.data,
  fontSize: size,
  fontWeight: opts?.weight ?? 400,
  letterSpacing: opts?.ls ?? "0.1em",
  color: opts?.color ?? C.ink3,
  lineHeight: opts?.lh ?? 1,
});

type Grouping = "concentration" | "network" | "state" | "az";

export default function InstitutionsIndexRoute() {
  const { ta } = useParams<{ ta: string }>();
  const navigate = useNavigate();
  const taSlug = ta ?? "nsclc";

  const [aggs, setAggs] = useState<InstitutionAgg[]>([]);
  const [loading, setLoading] = useState(true);
  const [grouping, setGrouping] = useState<Grouping>("concentration");
  const [userId, setUserId] = useState<string | null>(null);
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const taId = await taIdForApiSlug(taSlug);
      if (!taId || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }
      const rows = await fetchTaRoster(taId);
      if (cancelled) return;
      setAggs(aggregateInstitutions(rows));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [taSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getCurrentUser();
      if (!user || cancelled) return;
      setUserId(user.id);
      const pins = await getPinnedInstitutionsForUser(user.id);
      if (!cancelled) setPinnedSet(new Set(pins.map((p) => p.institution_name)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePin(name: string) {
    if (!userId) return;
    const was = pinnedSet.has(name);
    setPinnedSet((prev) => {
      const next = new Set(prev);
      if (was) next.delete(name);
      else next.add(name);
      return next;
    });
    try {
      if (was) await unpinInstitution(userId, name);
      else await pinInstitution(userId, name);
    } catch {
      setPinnedSet((prev) => {
        const next = new Set(prev);
        if (was) next.add(name);
        else next.delete(name);
        return next;
      });
    }
  }

  const memberSitesByParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of aggs) {
      if (a.networkParent) m.set(a.networkParent, (m.get(a.networkParent) ?? 0) + 1);
    }
    return m;
  }, [aggs]);

  const taUpper = taSlug.toUpperCase().replace(/-/g, " ");

  const openRecord = (a: InstitutionAgg) => navigate(`/institution/${a.slug}?ta=${taSlug}`);

  // ── Row (desktop grid / mobile stack) ─────────────────────────────────────
  function Row({ a, dense }: { a: InstitutionAgg; dense?: boolean }) {
    const pinned = pinnedSet.has(a.name);
    const chips = a.usRanks.slice(0, 7);
    const overflow = a.usRanks.length - chips.length;
    const identity = [
      a.state ?? undefined,
      a.type,
      a.nciDesignation ?? undefined,
      a.isCoe ? "CoE" : undefined,
    ];
    const identityLine = (
      <span style={{ ...mono(11, { ls: "0.05em", lh: 1.5 }) }}>
        {a.state ? `${a.state} · ` : ""}
        {a.type} ·{" "}
        {a.nciDesignation ? (
          a.nciDesignation
        ) : (
          <span style={{ color: C.ink4 }}>NO NCI DESIGNATION</span>
        )}
        {a.isCoe ? " · CoE" : ""}
      </span>
    );
    void identity;
    const networkLine = a.networkParent ? (
      <span style={{ ...mono(11, { ls: "0.05em", color: C.ink4, lh: 1.5 }) }}>
        NETWORK <span style={{ color: C.link }}>{a.networkParent}</span>
        {(memberSitesByParent.get(a.networkParent) ?? 0) > 1
          ? ` · ${memberSitesByParent.get(a.networkParent)} MEMBER SITES REPRESENTED`
          : ""}
      </span>
    ) : (
      <span style={{ ...mono(11, { color: C.ink6 }) }}>NO NETWORK PARENT · SINGLE-SITE REGISTRY RECORD</span>
    );
    const split = (
      <div style={{ display: "flex", gap: isMobile ? 10 : 16, ...mono(11), paddingTop: isMobile ? 0 : 5 }}>
        {([["EST", a.est], ["RIS", a.ris], ["COM", a.com]] as const).map(([label, n]) => (
          <span key={label}>
            <span style={{ color: n > 0 ? C.ink1 : CANON.INK.GHOST, fontSize: 15 }}>{n}</span> {label}
          </span>
        ))}
      </div>
    );
    const rankChips = (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 3 }}>
        {chips.map((r, i) => (
          <span
            key={`${r}-${i}`}
            style={{
              padding: "3px 7px",
              border: r <= 10 ? `1px solid ${C.amber}` : `1px solid ${C.chipBorder}`,
              ...mono(11, { ls: "0", color: r <= 10 ? C.amber : C.ink3 }),
            }}
          >
            #{r}
          </span>
        ))}
        {overflow > 0 ? <span style={{ padding: "3px 7px", ...mono(11, { ls: "0", color: C.ink5 }) }}>+{overflow}</span> : null}
      </div>
    );
    const pin = (
      <button
        type="button"
        className="fm-pill-button"
        aria-label={pinned ? "Unpin institution" : "Pin institution"}
        onClick={(e) => {
          e.stopPropagation();
          void togglePin(a.name);
        }}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          ...mono(15, { ls: "0", color: pinned ? C.amber : CANON.INK.GHOST }),
          paddingTop: 4,
        }}
      >
        ⌖
      </button>
    );

    if (isMobile) {
      return (
        <div
          onClick={() => openRecord(a)}
          style={{ cursor: "pointer", padding: "15px 16px", borderBottom: `1px solid ${C.hair}` }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 7 }}>
            <span style={{ ...mono(25, { color: a.band === "A" || a.band === "B" ? C.amber : C.ink3, ls: "0" }), minWidth: 38 }}>
              {a.memberCount}
            </span>
            <span style={{ fontFamily: FACE.value, fontSize: 17, lineHeight: 1.25, fontWeight: 500, color: C.ink1 }}>{a.name}</span>
          </div>
          <div style={{ paddingLeft: 48, display: "flex", flexDirection: "column", gap: 6 }}>
            {identityLine}
            {networkLine}
            {rankChips}
            {split}
          </div>
        </div>
      );
    }
    return (
      <div
        onClick={() => openRecord(a)}
        style={{
          cursor: "pointer",
          display: "grid",
          gridTemplateColumns: "120px 1fr 348px 168px 44px",
          gap: 20,
          padding: dense ? "16px 28px" : "18px 28px",
          borderBottom: `1px solid ${C.hair}`,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ ...mono(30, { color: a.band === "A" || a.band === "B" ? C.amber : C.ink3, ls: "0" }) }}>{a.memberCount}</span>
          <span style={{ ...mono(11, { color: C.ink4 }) }}>{a.bestUsRank != null ? `BEST #${a.bestUsRank} US` : "NO US RANK HELD"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ fontFamily: FACE.value, fontSize: 20, lineHeight: 1.2, fontWeight: 500, color: C.ink1 }}>{a.name}</span>
          {identityLine}
          {networkLine}
        </div>
        {rankChips}
        {split}
        {pin}
      </div>
    );
  }

  function BandHeader({ left, right }: { left: string; right?: string }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: isMobile ? "9px 16px" : "11px 28px",
          background: C.bandBg,
          borderTop: `1px solid ${C.hairStrong}`,
          borderBottom: `1px solid ${C.hairStrong}`,
          ...mono(isMobile ? 9 : 10, { ls: "0.13em", lh: 1.5 }),
        }}
      >
        <span>{left}</span>
        {right && !isMobile ? <span style={{ color: C.ink5 }}>{right}</span> : null}
      </div>
    );
  }

  // ── Groupings ─────────────────────────────────────────────────────────────
  function groupedContent() {
    if (grouping === "concentration") {
      const bands: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];
      return bands.map((b) => {
        const members = aggs.filter((a) => a.band === b);
        if (members.length === 0) return null;
        return (
          <div key={b}>
            <BandHeader
              left={`BAND ${b} · ${BAND_LABEL[b]} · ${members.length} INSTITUTION${members.length === 1 ? "" : "S"}`}
              right={
                b === "D"
                  ? "MOST HOLD ONE OR TWO — THE COUNT IS THE WHOLE STORY OF THE ROW"
                  : "ORDER IS DESCRIPTIVE, NOT A RANKING"
              }
            />
            {members.map((a) => (
              <Row key={a.id} a={a} dense={b === "D"} />
            ))}
          </div>
        );
      });
    }
    if (grouping === "network") {
      const byParent = new Map<string, InstitutionAgg[]>();
      const unparented: InstitutionAgg[] = [];
      for (const a of aggs) {
        if (a.networkParent) {
          const l = byParent.get(a.networkParent);
          if (l) l.push(a);
          else byParent.set(a.networkParent, [a]);
        } else unparented.push(a);
      }
      const parents = [...byParent.entries()].sort(
        (x, y) => y[1].reduce((s, a) => s + a.memberCount, 0) - x[1].reduce((s, a) => s + a.memberCount, 0),
      );
      return (
        <>
          {parents.map(([parent, members]) => {
            const total = members.reduce((s, a) => s + a.memberCount, 0);
            const best = members.reduce<number | null>(
              (b, a) => (a.bestUsRank != null && (b == null || a.bestUsRank < b) ? a.bestUsRank : b),
              null,
            );
            return (
              <div key={parent}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    padding: isMobile ? "12px 16px" : "14px 28px",
                    background: CANON.GROUND.INSET,
                    borderBottom: `1px solid ${C.hairStrong}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                    <span style={{ ...mono(20, { color: C.amber, ls: "0" }) }}>{total}</span>
                    <span style={{ fontFamily: FACE.value, fontSize: 17, fontWeight: 500, color: C.ink1 }}>{parent}</span>
                    <span style={{ ...mono(11, { ls: "0.12em", color: C.ink4 }) }}>
                      {members.length} MEMBER SITE{members.length === 1 ? "" : "S"} REPRESENTED
                      {best != null ? ` · BEST #${best} US` : ""}
                    </span>
                  </div>
                  {!isMobile ? (
                    <span style={{ ...mono(11, { ls: "0.12em", color: C.ink5 }) }}>
                      NETWORK TOTALS ARE SUMS OF THE SITES BELOW — NOTHING IS HIDDEN IN THEM
                    </span>
                  ) : null}
                </div>
                {members
                  .slice()
                  .sort((x, y) => y.memberCount - x.memberCount)
                  .map((a) => (
                    <div
                      key={a.id}
                      onClick={() => openRecord(a)}
                      style={{
                        cursor: "pointer",
                        display: "grid",
                        gridTemplateColumns: isMobile ? "40px 1fr" : "52px 1fr 220px 168px",
                        gap: isMobile ? 10 : 20,
                        padding: isMobile ? "13px 16px" : "13px 28px 13px 44px",
                        borderBottom: `1px solid ${C.hair}`,
                        alignItems: "center",
                      }}
                    >
                      <span style={{ ...mono(20, { color: a.memberCount >= 5 ? C.amber : C.ink3, ls: "0" }) }}>{a.memberCount}</span>
                      <span style={{ fontFamily: FACE.value, fontSize: 17, color: C.ink1 }}>{a.name}</span>
                      {!isMobile ? (
                        <span style={{ ...mono(11, { ls: "0.06em" }) }}>
                          {a.state ?? "—"} · {a.type} ·{" "}
                          {a.nciDesignation ?? <span style={{ color: C.ink5 }}>NO NCI DESIGNATION</span>}
                        </span>
                      ) : null}
                      {!isMobile ? (
                        <span style={{ ...mono(11, { ls: "0" }) }}>
                          {a.est} EST · {a.ris} RIS · {a.com} COM
                        </span>
                      ) : null}
                    </div>
                  ))}
              </div>
            );
          })}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              padding: isMobile ? "12px 16px" : "14px 28px",
              background: CANON.GROUND.INSET,
              borderBottom: `1px solid ${C.hairStrong}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span style={{ ...mono(20, { color: C.ink3, ls: "0" }) }}>
                {unparented.reduce((s, a) => s + a.memberCount, 0)}
              </span>
              <span style={{ fontFamily: FACE.value, fontSize: 17, fontWeight: 500, color: C.ink1 }}>Unparented</span>
              <span style={{ ...mono(11, { ls: "0.12em", color: C.ink4 }) }}>
                {unparented.length} REPRESENTED INSTITUTIONS HAVE NO NETWORK PARENT
              </span>
            </div>
            {!isMobile ? (
              <span style={{ ...mono(11, { ls: "0.12em", color: C.ink5 }) }}>NOT A NETWORK — THE ABSENCE OF ONE</span>
            ) : null}
          </div>
          {unparented.map((a) => (
            <Row key={a.id} a={a} dense />
          ))}
        </>
      );
    }
    if (grouping === "state") {
      const byState = new Map<string, InstitutionAgg[]>();
      for (const a of aggs) {
        const key = a.state ?? "NO STATE ON RECORD";
        const l = byState.get(key);
        if (l) l.push(a);
        else byState.set(key, [a]);
      }
      const states = [...byState.entries()].sort((x, y) =>
        x[0] === "NO STATE ON RECORD" ? 1 : y[0] === "NO STATE ON RECORD" ? -1 : x[0].localeCompare(y[0]),
      );
      return states.map(([state, members]) => (
        <div key={state}>
          <BandHeader
            left={`${state} · ${members.length} INSTITUTION${members.length === 1 ? "" : "S"} · ${members.reduce((s, a) => s + a.memberCount, 0)} RANKED HCP`}
          />
          {members.map((a) => (
            <Row key={a.id} a={a} dense />
          ))}
        </div>
      ));
    }
    // A–Z
    const alpha = [...aggs].sort((x, y) => x.name.localeCompare(y.name));
    return alpha.map((a) => <Row key={a.id} a={a} dense />);
  }

  const totalRanked = useMemo(() => {
    const s = new Set<string>();
    // memberCount is distinct per institution; distinct overall needs the union —
    // approximate with the sum is WRONG, so track via aggs is impossible here.
    // The header states institutions represented; the coverage line is computed
    // from the roster length at fetch time and carried in aggs order instead.
    for (const a of aggs) s.add(a.id);
    return s.size;
  }, [aggs]);
  void totalRanked;

  const groupingTabs: Array<[Grouping, string]> = [
    ["concentration", "Concentration"],
    ["network", "Network"],
    ["state", "State"],
    ["az", "A–Z"],
  ];

  return (
    <AppLayout width="wide">
      {/* Commit C 2026-08-05: g2 board per the Pulse scheme. */}
      <div style={{ width: "100%", boxSizing: "border-box", margin: "8px 0 24px", ...DEPTH.PANEL, border: `1px solid ${CANON.LINE.HAIR}` }}>
        {/* Hero — canonical H1 (PageHero, Commit B 2026-08-05). The amber-edge
            mono header becomes eyebrow/serif title/dek; the right meta lines
            fold into the meta slot and the REPRESENTED count into the cluster. */}
        <div style={{ padding: isMobile ? "18px 16px 14px" : "26px 28px 0" }}>
          <PageHero
            narrow={isMobile}
            eyebrow="Inst"
            meta={"PRIMARY LINK ONLY · ORDERED BY RANKED-HCP COUNT · NOT A RANKING"}
            title={`Institutions / ${taUpper}`}
            dek={loading
              ? "Resolving the registry…"
              : `${aggs.length} registry institutions carry at least one ranked ${taUpper} HCP. Registry institutions carrying none in this cohort are not listed.`}
            stats={[{ value: String(aggs.length), label: "REPRESENTED", center: true }]}
          />
        </div>

        {/* Grouping toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: isMobile ? "10px 16px" : "16px 28px 12px",
            justifyContent: isMobile ? "flex-start" : "flex-end",
            borderBottom: `1px solid ${C.hairStrong}`,
            overflowX: "auto",
          }}
        >
          {!isMobile ? <span style={{ ...mono(11, { ls: "0.14em", color: C.ink5 }) }}>GROUPING</span> : null}
          <div style={{ display: "flex", border: `1px solid ${C.toggleBorder}`, flexShrink: 0 }}>
            {groupingTabs.map(([key, label], i) => (
              <button
                key={key}
                type="button"
                className="fm-pill-button"
                onClick={() => setGrouping(key)}
                style={{
                  padding: "6px 12px",
                  background: grouping === key ? C.toggleBg : "transparent",
                  color: grouping === key ? C.ink1 : C.ink3,
                  border: "none",
                  borderLeft: i > 0 ? `1px solid ${C.toggleBorder}` : "none",
                  fontFamily: FACE.value,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Column header (desktop, concentration/az only) */}
        {!isMobile && (grouping === "concentration" || grouping === "az" || grouping === "state") ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 348px 168px 44px",
              gap: 20,
              padding: "22px 28px 9px",
              borderBottom: `1px solid ${C.hairStrong}`,
              ...mono(9, { ls: "0.13em", color: C.ink5, lh: 1.5 }),
              textTransform: "uppercase" as const,
            }}
          >
            <div>Ranked<br />HCP · Best</div>
            <div>Institution<br />Type · Designation · Network</div>
            <div>Ranks held<br />US, in cohort</div>
            <div>Cohort split<br />Est · Ris · Com</div>
            <div>Pin</div>
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: "48px 28px", ...mono(11, { color: C.ink4 }) }}>RESOLVING THE REGISTRY…</div>
        ) : aggs.length === 0 ? (
          <div style={{ padding: "48px 28px", fontFamily: FACE.value, fontSize: 15, color: C.ink2 }}>
            No registry institution carries a ranked HCP in this cohort yet.
          </div>
        ) : (
          groupedContent()
        )}

        {!loading && aggs.length > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: isMobile ? "16px" : "20px 28px 26px",
              ...mono(isMobile ? 9 : 10, { lh: 1.7, color: C.ink5 }),
            }}
          >
            <span>
              {grouping === "concentration" ? "END OF BAND D · " : ""}
              {aggs.length} OF {aggs.length} REPRESENTED INSTITUTIONS SHOWN
            </span>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
