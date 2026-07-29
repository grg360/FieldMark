import React from "react";
import { useNavigate } from "react-router-dom";
import { HCP } from "../data/hcpData";
import { getPublicationsByYearForHcp } from "../lib/api";
import { enrichCharacterisation, type PublicationListRow } from "../lib/publicationsList";
import { COLOR } from "../lib/designTokens";
import TopBar from "./TopBar";
import GlobalFooter from "./GlobalFooter";
import PublicationList from "./PublicationsListPage/PublicationList";

interface BibliographyScreenProps {
  hcp: HCP;
  year: number;
  onBack: () => void;
}

export default function BibliographyScreen({ hcp, year, onBack }: BibliographyScreenProps) {
  const navigate = useNavigate();
  const [papers, setPapers] = React.useState<PublicationListRow[]>([]);
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
      const rows: PublicationListRow[] = data.map((p) => ({
        id: p.id, pmid: p.pmid, title: p.title, journal: p.journal,
        pub_year: year, pub_date: p.pubDate, citation_count: p.citations, doi: null,
        is_first_author: p.isFirstAuthor, is_senior_author: p.isSeniorAuthor,
        bylineText: p.authors,
      }));
      const enriched = await enrichCharacterisation(rows);
      if (cancelled) return;
      setPapers(enriched);
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
              {loading ? "loading…" : `${papers.length} papers`}
            </span>
          </div>

          {/* Paper cards */}
          {loading ? (
            <div style={{ padding: "16px", fontSize: 13, color: COLOR.ink4 }}>Loading…</div>
          ) : papers.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: COLOR.ink4 }}>
              No publications for {year}.
            </div>
          ) : (
            <div style={{ padding: "0 16px 32px" }}>
              <PublicationList pubs={papers} narrow />
            </div>
          )}
        </div>

        <GlobalFooter />
      </div>
    </div>
  );
}
