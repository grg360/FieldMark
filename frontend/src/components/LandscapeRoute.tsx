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
import LandscapeLeaderboard from "./LandscapeLeaderboard";
import LandscapeQuadrantChart from "./LandscapeQuadrantChart";

export default function LandscapeRoute() {
  const { ta } = useParams<{ ta: string }>();
  const navigate = useNavigate();
  const taSlug = ta ?? "nsclc";

  const [points, setPoints] = useState<LandscapePoint[]>([]);
  const [boards, setBoards] = useState<LandscapeLeaderboards | null>(null);
  const [loading, setLoading] = useState(true);

  const taLabel = indicationSlugToLabel("Oncology", taSlug) ?? taSlug.toUpperCase();

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
          onClick={() => navigate("/")}
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
            title={`${taLabel} Landscape`}
            dek={"Top 100 US Rising Stars · momentum vs visibility"}
            stats={[
              { value: String(points.length || 100), label: "PLOTTED" },
              { value: "MOM × VIS", label: "AXES" },
            ]}
          />
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <LandscapeQuadrantChart
          points={points}
          onPointClick={handleHcpClick}
          loading={loading}
        />
      </div>

      <div
        style={{
          padding: "0 16px 16px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        {boards && (
          <>
            <LandscapeLeaderboard
              title="Top Rising Stars"
              entries={boards.top_rising_stars}
              onEntryClick={handleHcpClick}
              accentColor="#E8A020"
            />
            <LandscapeLeaderboard
              title="Fastest Scientific Momentum"
              entries={boards.fastest_scientific_momentum}
              onEntryClick={handleHcpClick}
              accentColor="#3FB8AF"
            />
            <LandscapeLeaderboard
              title="Fastest Network Momentum"
              entries={boards.fastest_network_momentum}
              onEntryClick={handleHcpClick}
              accentColor="#9B6DFF"
            />
            <LandscapeLeaderboard
              title="Most Balanced"
              subtitle="Rising on both axes"
              entries={boards.most_balanced}
              onEntryClick={handleHcpClick}
              accentColor="#9B6DFF"
            />
            <LandscapeLeaderboard
              title="Momentum-Forward"
              subtitle="Strong momentum, building visibility"
              entries={boards.momentum_forward}
              onEntryClick={handleHcpClick}
              accentColor="#9B6DFF"
            />
          </>
        )}
      </div>

    </div>
    </AppLayout>
  );
}
