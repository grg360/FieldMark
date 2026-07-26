import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  apiSlugForTaId,
  getInstitutionCollaborations,
  getInstitutionExternalPartners,
  getInstitutionLeaderboards,
  getInstitutionSummary,
  resolveInstitutionPrimaryTaId,
  taDisplayNameForId,
  taIdForApiSlug,
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
import { COLOR } from "../lib/designTokens";
import TopBar from "./TopBar";
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
      <span style={{ fontSize: 12, color: COLOR.ink3 }}>
        <span style={{ color: COLOR.ink1, fontWeight: 600 }}>{count}</span> {label}
      </span>
    </span>
  );
}

export default function InstitutionRoute() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Explicit TA when the caller carried one — durable via the ?ta= URL param
  // (survives refresh/bookmark), or nav state as a non-durable secondary.
  const explicitTaSlug =
    searchParams.get("ta") ??
    (location.state as { taSlug?: string } | null)?.taSlug ??
    null;

  const [summary, setSummary] = useState<InstitutionSummary | null>(null);
  const [boards, setBoards] = useState<InstitutionLeaderboards | null>(null);
  const [collabs, setCollabs] = useState<InstitutionCollaboration[]>([]);
  const [externalPartners, setExternalPartners] = useState<ExternalPartnerInstitution[]>([]);
  const [researchThemes, setResearchThemes] = useState<InstitutionResearchTheme[]>([]);
  const [taDisplayName, setTaDisplayName] = useState<string>("");
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

      // Durable TA resolution. The detail route (/institution/:slug) has no :ta,
      // so we must not depend on nav state alone (it evaporates on hard-refresh,
      // deep-link, bookmark, back-nav → silent NSCLC fallback). Prefer an
      // explicit TA when carried (?ta= / nav state); otherwise DERIVE the
      // institution's dominant TA from data. Never silent-default to NSCLC.
      let taId = (explicitTaSlug ? taIdForApiSlug(explicitTaSlug) : undefined) ?? null;
      if (!taId) {
        taId = await resolveInstitutionPrimaryTaId(institutionName);
        if (cancelled) return;
      }
      const taSlug = (taId ? apiSlugForTaId(taId) : undefined) ?? "nsclc";
      const displayName = (taId ? taDisplayNameForId(taId) : "") || "NSCLC";
      setTaDisplayName(displayName);

      const [summaryRes, boardsRes, collabsRes, partnersRes, themesRes] = await Promise.all([
        getInstitutionSummary(institutionName, taSlug),
        getInstitutionLeaderboards(institutionName, taSlug, 5),
        getInstitutionCollaborations(institutionName, 8, taSlug),
        getInstitutionExternalPartners(institutionName, 8, taSlug),
        getInstitutionResearchThemes(institutionName, displayName, 20),
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
  }, [slug, explicitTaSlug]);

  function handleHcpClick(hcpId: string) {
    navigate(`/hcp/${String(hcpId)}`);
  }

  if (notFound) {
    return (
      <div style={{ backgroundColor: COLOR.ground, minHeight: "100dvh" }}>
        <div
          className="fm-screen"
          style={{
            maxWidth: 480,
            margin: "0 auto",
            fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
          }}
        >
          <TopBar onLogoPress={() => navigate("/me")} />
          <div style={{ padding: 32, color: COLOR.ink3 }}>
            <h1 style={{ fontSize: 22, color: COLOR.ink1, marginTop: 16, fontWeight: 600 }}>
              Institution not found
            </h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: COLOR.ground, minHeight: "100dvh" }}>
    <div
      className="fm-screen"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
        overflowX: "hidden",
      }}
    >
      <TopBar onLogoPress={() => navigate("/me")} />
      <div style={{ padding: "16px 16px 16px", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
        {loading && !summary ? (
          <div style={{ fontSize: 13, color: COLOR.ink4, marginTop: 12 }}>Loading...</div>
        ) : null}

        {summary ? (
          <>
            <h1 style={{ fontSize: 22, color: COLOR.ink1, margin: "8px 0 4px", fontWeight: 600 }}>
              {summary.institution_name}
            </h1>
            <div style={{ fontSize: 13, color: COLOR.ink4 }}>
              {summary.total_investigators} {taDisplayName} investigators {"\u00b7"}{" "}
              {summary.rising_star_count} Rising Star
              {summary.rising_star_count !== 1 ? "s" : ""} {"\u00b7"} {summary.established_count}{" "}
              Established
            </div>
            {summary.top_investigator ? (
              <div style={{ fontSize: 13, color: COLOR.ink3, marginTop: 6 }}>
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
                  backgroundColor: COLOR.surfaceRaised,
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
                    color: COLOR.ink4,
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
              taDisplayName={taDisplayName}
            />
          </div>
        ) : null}
        <InstitutionCollaborationsPanel
          collaborations={collabs}
          onHcpClick={handleHcpClick}
          institutionName={summary?.institution_name ?? ""}
        />
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
    </div>
  );
}
