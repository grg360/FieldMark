import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getLandscapeLeaderboards,
  getLandscapePoints,
  type LandscapeLeaderboards,
  type LandscapePoint,
} from "../lib/api";
import { indicationSlugToLabel } from "../lib/routeSlugs";
import { COLOR } from "../lib/designTokens";
import NavBar from "./NavBar";
import GlobalFooter from "./GlobalFooter";
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
    <div style={{ backgroundColor: COLOR.ground, minHeight: "100dvh" }}>
    <NavBar />
    <div
      className="fm-screen"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
        overflowX: "hidden",
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
        <h1 style={{ fontSize: 22, color: COLOR.ink1, margin: "8px 0 4px", fontWeight: 600 }}>
          {taLabel} Landscape
        </h1>
        <div style={{ fontSize: 13, color: COLOR.ink4 }}>
          Top 100 US Rising Stars {"\u00b7"} momentum vs visibility
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

      <GlobalFooter />
    </div>
    </div>
  );
}
