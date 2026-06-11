import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getInstitutionCollaborations,
  getInstitutionExternalPartners,
  getInstitutionLeaderboards,
  getInstitutionSummary,
  type ExternalPartnerInstitution,
  type InstitutionCollaboration,
  type InstitutionLeaderboardEntry,
  type InstitutionLeaderboards,
  type InstitutionSummary,
  type LeaderboardEntry,
} from "../lib/api";
import { getInstitutionResearchThemes, type InstitutionResearchTheme } from "../lib/institutionThemes";
import { slugToInstitution } from "../lib/institutionUtils";
import { supabase } from "../lib/supabase";
import GlobalFooter from "./GlobalFooter";
import InstitutionCollaborationsPanel from "./InstitutionCollaborationsPanel";
import InstitutionExternalPartnersPanel from "./InstitutionExternalPartnersPanel";
import InstitutionResearchThemesPanel from "./InstitutionResearchThemesPanel";
import LandscapeLeaderboard from "./LandscapeLeaderboard";

function toLeaderboardEntries(entries: InstitutionLeaderboardEntry[]): LeaderboardEntry[] {
  return entries.map((entry) => ({
    ...entry,
    institution: null,
  }));
}

function PipelineBucket({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: "#9B9892" }}>
        <span style={{ color: "#E8E6DF", fontWeight: 600 }}>{count}</span> {label}
      </span>
    </span>
  );
}

export default function InstitutionRoute() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<InstitutionSummary | null>(null);
  const [boards, setBoards] = useState<InstitutionLeaderboards | null>(null);
  const [collabs, setCollabs] = useState<InstitutionCollaboration[]>([]);
  const [externalPartners, setExternalPartners] = useState<ExternalPartnerInstitution[]>([]);
  const [researchThemes, setResearchThemes] = useState<InstitutionResearchTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    (async () => {
      const institutionName = await slugToInstitution(slug, supabase);
      if (cancelled) return;

      if (!institutionName) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const [summaryRes, boardsRes, collabsRes, partnersRes, themesRes] = await Promise.all([
        getInstitutionSummary(institutionName, "nsclc"),
        getInstitutionLeaderboards(institutionName, "nsclc", 5),
        getInstitutionCollaborations(institutionName, 8),
        getInstitutionExternalPartners(institutionName, 8),
        getInstitutionResearchThemes(institutionName, "NSCLC", 20),
      ]);

      if (cancelled) return;

      setSummary(summaryRes);
      setBoards(boardsRes);
      setCollabs(collabsRes);
      setExternalPartners(partnersRes);
      setResearchThemes(themesRes);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  function handleHcpClick(hcpId: string) {
    navigate(`/hcp/${String(hcpId)}`);
  }

  const backButtonStyle = {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "#6B6A65",
    fontSize: 13,
    cursor: "pointer",
  } as const;

  if (notFound) {
    return (
      <div
        className="fm-screen"
        style={{
          backgroundColor: "#0A0A0B",
          minHeight: "100dvh",
          maxWidth: 480,
          margin: "0 auto",
          padding: 32,
          color: "#9B9892",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <button type="button" onClick={() => navigate("/")} style={backButtonStyle}>
          {"\u2190"} Home
        </button>
        <h1 style={{ fontSize: 22, color: "#E8E6DF", marginTop: 16, fontWeight: 600 }}>
          Institution not found
        </h1>
      </div>
    );
  }

  return (
    <div
      className="fm-screen"
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflowX: "hidden",
      }}
    >
      <div style={{ padding: "16px 16px 16px", borderBottom: "1px solid #1E1E22" }}>
        <button type="button" onClick={() => navigate("/")} style={backButtonStyle}>
          {"\u2190"} Home
        </button>

        {loading && !summary ? (
          <div style={{ fontSize: 13, color: "#6B6A65", marginTop: 12 }}>Loading...</div>
        ) : null}

        {summary ? (
          <>
            <h1 style={{ fontSize: 22, color: "#E8E6DF", margin: "8px 0 4px", fontWeight: 600 }}>
              {summary.institution_name}
            </h1>
            <div style={{ fontSize: 13, color: "#6B6A65" }}>
              {summary.total_investigators} NSCLC investigators {"\u00b7"}{" "}
              {summary.rising_star_count} Rising Star
              {summary.rising_star_count !== 1 ? "s" : ""} {"\u00b7"} {summary.established_count}{" "}
              Established
            </div>
            {summary.top_investigator ? (
              <div style={{ fontSize: 13, color: "#9B9892", marginTop: 6 }}>
                Top investigator:{" "}
                <a
                  href={`/hcp/${summary.top_investigator.hcp_id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleHcpClick(summary.top_investigator!.hcp_id);
                  }}
                  style={{ color: "#9B6DFF", textDecoration: "none" }}
                >
                  {summary.top_investigator.name}
                </a>{" "}
                (#{summary.top_investigator.rank} US{" "}
                {summary.top_investigator.cohort === "rising_star" ? "Rising Star" : "Established"})
              </div>
            ) : null}
            {summary.rising_star_count > 0 ? (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  backgroundColor: "#15131A",
                  border: "1px solid #2A2730",
                  borderRadius: 6,
                  display: "inline-flex",
                  gap: 18,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "#6B6A65",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Rising Star Pipeline
                </span>
                <PipelineBucket
                  label="90+"
                  count={summary.rising_star_pipeline.elite}
                  color="#9B6DFF"
                />
                <PipelineBucket
                  label="80-89"
                  count={summary.rising_star_pipeline.strong}
                  color="#3FB8AF"
                />
                <PipelineBucket
                  label="70-79"
                  count={summary.rising_star_pipeline.developing}
                  color="#E8A04E"
                />
                <PipelineBucket
                  label="<70"
                  count={summary.rising_star_pipeline.early}
                  color="#6B6A65"
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div
        style={{
          padding: "16px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        {boards ? (
          <>
            <LandscapeLeaderboard
              title="Top Rising Stars"
              entries={toLeaderboardEntries(boards.top_rising_stars)}
              onEntryClick={handleHcpClick}
              showRanks={false}
            />
            <LandscapeLeaderboard
              title="Top Established"
              entries={toLeaderboardEntries(boards.top_established)}
              onEntryClick={handleHcpClick}
              showRanks={false}
            />
            <LandscapeLeaderboard
              title="Most Connected"
              subtitle="Highest network position"
              entries={toLeaderboardEntries(boards.most_connected)}
              onEntryClick={handleHcpClick}
              showRanks={false}
            />
            <LandscapeLeaderboard
              title="Highest Network Momentum"
              subtitle="Fastest-growing collaboration networks"
              entries={toLeaderboardEntries(boards.highest_network_momentum)}
              onEntryClick={handleHcpClick}
              showRanks={false}
            />
          </>
        ) : null}
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        {summary && researchThemes.length > 0 ? (
          <div style={{ marginBottom: 24 }}>
            <InstitutionResearchThemesPanel
              themes={researchThemes}
              institutionName={summary.institution_name}
            />
          </div>
        ) : null}
        <InstitutionCollaborationsPanel collaborations={collabs} onHcpClick={handleHcpClick} />
      </div>

      {summary ? (
        <div style={{ padding: "0 16px 16px" }}>
          <InstitutionExternalPartnersPanel
            partners={externalPartners}
            sourceInstitutionName={summary.institution_name}
          />
        </div>
      ) : null}

      <GlobalFooter />
    </div>
  );
}
