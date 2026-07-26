import React from "react";
import { useNavigate } from "react-router-dom";
import { HCP } from "../data/hcpData";
import { getPublicationsByYearForHcp, type BibliographyPaper } from "../lib/api";
import { COLOR, ELEVATION, FONT } from "../lib/designTokens";
import TopBar from "./TopBar";
import GlobalFooter from "./GlobalFooter";

interface BibliographyScreenProps {
  hcp: HCP;
  year: number;
  onBack: () => void;
}

// Link violet used for cross-references across the platform (cohort/rising-star
// accent). Frozen hex, not a token — matches the "View" links elsewhere.
const LINK_VIOLET = "#9B6DFF";

function PaperCard({ paper }: { paper: BibliographyPaper }) {
  function handleViewAbstract(e: React.MouseEvent) {
    e.stopPropagation();
    if (!paper.pmid) return;
    window.open(`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      style={{
        ...ELEVATION.card,
        borderLeft: `3px solid ${COLOR.amber}`,
        padding: 12,
        cursor: "default",
        fontFamily: FONT.sans,
      }}
    >
      {/* Row 1: author-role pill + citations. First = teal, Senior/PI = info-blue,
          everyone else = neutral. is_senior_author comes from the DB (handles the
          last-named-author / trailing-collective case). */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div
          style={{
            backgroundColor: paper.isFirstAuthor
              ? "#0A1F16"
              : paper.isSeniorAuthor
                ? "rgba(79,163,199,0.14)"
                : COLOR.surfaceWell,
            border: `1px solid ${
              paper.isFirstAuthor ? "#1D9E75" : paper.isSeniorAuthor ? COLOR.info : COLOR.hair
            }`,
            color: paper.isFirstAuthor ? "#1D9E75" : paper.isSeniorAuthor ? COLOR.info : COLOR.ink4,
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 3,
            lineHeight: 1.4,
          }}
        >
          {paper.isFirstAuthor ? "First author" : paper.isSeniorAuthor ? "Senior author" : "Co-author"}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3 }}>
          <span className="fm-bib-citation" style={{ fontSize: 16, fontFamily: FONT.mono, fontWeight: 500, color: COLOR.amber, lineHeight: 1 }}>
            {paper.citations != null ? paper.citations.toLocaleString() : "—"}
          </span>
          <span style={{ fontSize: 10, color: COLOR.ink4, lineHeight: 1, marginBottom: 1 }}>citations</span>
        </div>
      </div>

      {/* Row 2: title */}
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          color: COLOR.ink1,
          fontWeight: 500,
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {paper.title}
      </div>

      {/* Row 3: journal + full author byline */}
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4 }}>
        {paper.journal ? <span style={{ color: COLOR.amber }}>{paper.journal}</span> : null}
        {paper.journal && paper.authors ? <span style={{ color: COLOR.ink5 }}> · </span> : null}
        {paper.authors ? <span style={{ color: COLOR.ink4 }}>{paper.authors}</span> : null}
      </div>

      {/* Row 4: PMID + view abstract */}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontFamily: FONT.mono, color: COLOR.ink5 }}>
          {paper.pmid ? `PMID ${paper.pmid}` : "—"}
        </span>
        <button
          onClick={handleViewAbstract}
          disabled={!paper.pmid}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 11,
            fontWeight: 500,
            color: paper.pmid ? LINK_VIOLET : COLOR.ink5,
            cursor: paper.pmid ? "pointer" : "default",
          }}
        >
          View Abstract
        </button>
      </div>
    </div>
  );
}

export default function BibliographyScreen({ hcp, year, onBack }: BibliographyScreenProps) {
  const navigate = useNavigate();
  const [papers, setPapers] = React.useState<BibliographyPaper[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const targetId = hcp.hcp_id ?? hcp.id ?? "";
    if (!targetId) {
      setPapers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const data = await getPublicationsByYearForHcp(String(targetId), year);
      if (cancelled) return;
      setPapers(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id, year]);

  const crumbLinkStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
    color: COLOR.ink3,
    cursor: "pointer",
    fontFamily: "inherit",
  };

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

        {/* Breadcrumb — the HCP crumb returns to the profile that spawned this
            view via onBack (a sub-screen state reset), not a route navigation. */}
        <nav
          aria-label="Breadcrumb"
          style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "12px 16px 4px" }}
        >
          <button type="button" style={crumbLinkStyle} onClick={() => navigate("/me")}>
            Home
          </button>
          <span style={{ color: COLOR.ink5 }}>{String.fromCharCode(0x203a)}</span>
          <button type="button" style={crumbLinkStyle} onClick={onBack}>
            {hcp.name}
          </button>
          <span style={{ color: COLOR.ink5 }}>{String.fromCharCode(0x203a)}</span>
          <span style={{ fontSize: 12, color: COLOR.ink1 }}>{year} Publications</span>
        </nav>

        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {/* Section header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              padding: "8px 16px 8px",
            }}
          >
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: COLOR.ink4 }}>
              Publications
            </span>
            <span style={{ fontSize: 11, color: COLOR.ink5 }}>
              {loading ? "loading…" : `${papers.length} papers · sorted by citations`}
            </span>
          </div>

          {/* Paper cards */}
          {loading ? (
            <div className="fm-bib-grid" style={{ padding: "0 16px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: COLOR.surfaceWell,
                    border: `1px solid ${COLOR.hair}`,
                    borderLeft: `3px solid ${COLOR.hair}`,
                    borderRadius: 4,
                    padding: 12,
                    height: 110,
                  }}
                />
              ))}
            </div>
          ) : papers.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: COLOR.ink4 }}>
              No publications for {year}.
            </div>
          ) : (
            <div className="fm-bib-grid" style={{ padding: "0 16px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
              {papers.map((paper) => (
                <PaperCard key={paper.id} paper={paper} />
              ))}
            </div>
          )}
        </div>

        <GlobalFooter />
      </div>
    </div>
  );
}
