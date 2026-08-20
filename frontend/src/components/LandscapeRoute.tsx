import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getLandscapeLeaderboards,
  getLandscapePoints,
  type LandscapeLeaderboards,
  type LandscapePoint,
} from "../lib/api";
import { indicationSlugToLabel } from "../lib/routeSlugs";
import { COLOR, GROUND, LINE } from "../lib/designTokens";
import AppLayout from "./AppLayout";
import PageHero from "./PageHero";
import { useScoringDate, formatScoringDate } from "../lib/scoringMeta";
import LandscapeLeaderboard from "./LandscapeLeaderboard";
import LandscapeQuadrantChart from "./LandscapeQuadrantChart";

export default function LandscapeRoute() {
  const scoredAt = useScoringDate();
  const { ta } = useParams<{ ta: string }>();
  const navigate = useNavigate();
  const taSlug = ta ?? "nsclc";

  const [points, setPoints] = useState<LandscapePoint[]>([]);
  const [boards, setBoards] = useState<LandscapeLeaderboards | null>(null);
  const [loading, setLoading] = useState(true);

  const taLabel = indicationSlugToLabel("Oncology", taSlug) ?? taSlug.toUpperCase();

  // The size of the plotted set, or null when there is nothing plotted. NULL
  // RATHER THAN 0 on purpose: every consumer below has to decide what to do
  // about absence, and a 0 would let one of them print "Top 0 US Rising Stars"
  // or "ranked within the plotted 0" without the type ever objecting.
  const plotted = points.length > 0 ? points.length : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([getLandscapePoints(taSlug, 100), getLandscapeLeaderboards(taSlug, 5)])
      .then(([p, b]) => {
        if (cancelled) return;
        setPoints(p);
        setBoards(b);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taSlug]);

  function handleHcpClick(hcpId: string) {
    navigate(`/hcp/${String(hcpId)}`);
  }

  return (
    <AppLayout width="wide">
    <div
      className="fm-screen"
      style={{
        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
        overflowX: "hidden",
        // Commit C 2026-08-05: g2 board per the Pulse scheme.
        margin: "8px 0 24px",
        background: GROUND.g2,
        border: `1px solid ${LINE.l1}`,
      }}
    >
      <div style={{ padding: "16px 16px 8px", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
        <button
          type="button"
          onClick={() => navigate("/me")}
          style={{
            padding: 0,
            border: "none",
            background: "transparent",
            color: COLOR.ink4,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {"\u2190"} Home
        </button>
        <div style={{ margin: "10px 0 4px" }}>
          <PageHero
            eyebrow={"Fieldmark · Landscape"}
            meta={`RANKS AS OF ${formatScoringDate(scoredAt)}`}
            title={`${taLabel} Landscape`}
            // The count comes from the plotted set, never from a literal
            // (2026-08-20). Both this dek and the tile below carried `|| 100`,
            // so an empty board announced "Top 100 US Rising Stars" over an
            // empty chart and a tile reading 100 — a fabricated figure standing
            // in for a missing one, which is the failure this platform's
            // absence rules exist to prevent. With no points the dek simply
            // drops the count rather than naming a number we do not have.
            dek={plotted != null ? `Top ${plotted} US Rising Stars · momentum vs visibility` : "US Rising Stars · momentum vs visibility"}
            stats={{ variant: "cluster", items: [
              // Three states, distinguished: still loading, genuinely empty,
              // and a real count. The em-dash is the platform's honest-absence
              // glyph (cohortLedger cellDisplay) — absence is never a number.
              { value: loading ? "…" : plotted != null ? String(plotted) : "—", label: "PLOTTED" },
            ] }}
          />
        </div>
      </div>

      {/* Axis definitions (frame 370428e2 + ruling 2026-08-09): the suffix
          states the hidden transform — axis position is the composite
          re-ranked WITHIN the plotted set, so 50 means "median of these
          {n}", not "50th percentile composite". */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, padding: "0 16px 4px" }}>
        {([["Y", "MOMENTUM"], ["X", "VISIBILITY"]] as const).map(([axis, name]) => (
          <div key={axis} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 9, letterSpacing: "0.16em", color: "#6e6b66", width: 18 }}>{axis}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, letterSpacing: "0.1em", color: "#ece9e4" }}>{name}</span>
            {/* Same `|| 100` fallback as the hero, fixed with it: this line
                asserts the denominator the axis is ranked within, and printing
                a stand-in there misstates what the axis MEANS, not just how
                many dots are on it. */}
            <span style={{ fontSize: 12, color: "#6e6b66" }}>percentile composite{plotted != null ? ` · ranked within the plotted ${plotted}` : ""}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        <LandscapeQuadrantChart
          points={points}
          onPointClick={handleHcpClick}
          loading={loading}
        />
      </div>

      {/* Boards (frame 370428e2, option 1b, ruled 2026-08-09):
          MOST BALANCED removed ON MERIT — a live |sci−net| delta calc, but
          magnitude-blind (equally-mediocre ranks like equally-strong) and the
          last conceptual residue of the retired "Balanced" archetype bucket.
          Board accents converge on register gold — teal/violet were the
          retired archetype palette. The two momentum boards stay, paired,
          with their separation stated from LIVE data so it cannot rot. */}
      {/* Four UNIFORM panels, two rows of 1fr 1fr (frame 370428e2, reconciled
          2026-08-09). PRINCIPLE: panel chrome carries no meaning here — a
          container border means "different kind of object", and these four are
          the same kind, one ranked list each. The momentum pair is grouped by
          a CAPTION ROW, not a box; the grid gap is the divider. Overlap stays
          computed from the live intersection, never hardcoded. */}
      {boards && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <LandscapeLeaderboard
              title="Top Rising Stars"
              subtitle="Overall composite rank"
              entries={boards.top_rising_stars}
              onEntryClick={handleHcpClick}
              accentColor="#E8A020"
            />
            <LandscapeLeaderboard
              title="Momentum-Forward"
              subtitle="Strong momentum, building visibility"
              entries={boards.momentum_forward}
              onEntryClick={handleHcpClick}
              accentColor="#E8A020"
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", padding: "30px 0 12px" }}>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, letterSpacing: "0.13em", color: "#ece9e4" }}>
              MOMENTUM · THE TWO LIVE AXES, RANKED SEPARATELY
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, letterSpacing: "0.11em", color: "#c8932f" }}>
              {`OVERLAP ${boards.momentum_overlap} OF ${boards.fastest_scientific_momentum.length}`}
              {boards.momentum_overlap <= 2 ? " · DISTINCT POPULATIONS" : " · SUBSTANTIALLY SHARED"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <LandscapeLeaderboard
              title="Fastest Scientific Momentum"
              subtitle="Scientific momentum percentile"
              entries={boards.fastest_scientific_momentum}
              onEntryClick={handleHcpClick}
              accentColor="#E8A020"
            />
            <LandscapeLeaderboard
              title="Fastest Network Momentum"
              subtitle="Network momentum percentile"
              entries={boards.fastest_network_momentum}
              onEntryClick={handleHcpClick}
              accentColor="#E8A020"
            />
          </div>
        </div>
      )}

    </div>
    </AppLayout>
  );
}
