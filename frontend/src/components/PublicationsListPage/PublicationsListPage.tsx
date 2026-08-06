import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getPublicationsByTheme,
  getPublicationsByInternalPair,
  getPublicationsByPartner,
  type PublicationListRow,
} from "../../lib/publicationsList";
import { institutionToSlug } from "../../lib/institutionUtils";
import { useIsDesktop } from "../../lib/useIsDesktop";
import AppLayout from "../AppLayout";
import PublicationList from "./PublicationList";
import PageHero from "../PageHero";

export default function PublicationsListPage() {
  const [searchParams] = useSearchParams();
  const theme = searchParams.get("theme");
  const internalPair = searchParams.get("internal_pair");
  const partner = searchParams.get("partner");
  const partnerName1 = searchParams.get("partner_name1");
  const partnerName2 = searchParams.get("partner_name2");
  const institutionParam = searchParams.get("institution");

  const [pubs, setPubs] = useState<PublicationListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [institutionName, setInstitutionName] = useState<string>("");

  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (institutionParam) setInstitutionName(institutionParam);
  }, [institutionParam]);

  useEffect(() => {
    if (!institutionName) return;
    setLoading(true);

    (async () => {
      try {
        if (theme) {
          const data = await getPublicationsByTheme(institutionName, theme, "NSCLC", 50);
          setPubs(data);
        } else if (internalPair) {
          const [h1, h2] = internalPair.split(",");
          if (h1 && h2) {
            const data = await getPublicationsByInternalPair(h1, h2, 50);
            setPubs(data);
          }
        } else if (partner) {
          const data = await getPublicationsByPartner(institutionName, partner, 50);
          setPubs(data);
        }
      } catch (err) {
        console.warn("PublicationsListPage: fetch error", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [institutionName, theme, internalPair, partner]);

  function headerForMode(): { title: string; subtitle: string } {
    if (theme) {
      return {
        title: theme,
        subtitle: `Top publications · ${institutionName}`,
      };
    }
    if (internalPair && partnerName1 && partnerName2) {
      return {
        title: `${partnerName1} ${String.fromCharCode(0x2194)} ${partnerName2}`,
        subtitle: `Shared publications · ${institutionName}`,
      };
    }
    if (partner) {
      return {
        title: `${institutionName} ${String.fromCharCode(0x2194)} ${partner}`,
        subtitle: "Shared publications",
      };
    }
    return { title: "Publications", subtitle: institutionName };
  }

  const headerInfo = headerForMode();

  const breadcrumbs = [
    { label: "Home", path: "/me" },
    {
      label: institutionName,
      path: institutionName ? `/institution/${institutionToSlug(institutionName)}` : "/",
    },
    { label: "Publications" },
  ];

  const visiblePubs = showAll ? pubs : pubs.slice(0, 50);

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="reading">
      <div style={{ marginBottom: 24 }}>
        {/* Reduced H1 (PageHero, Commit B 2026-08-05) */}
        <PageHero reduced eyebrow="Fieldmark · Publications" meta={`${pubs.length} PUBLICATION${pubs.length === 1 ? "" : "S"}`} title={headerInfo.title} dek={headerInfo.subtitle} />
        {!loading && pubs.length > 0 ? (
          <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 8 }}>
            Showing {visiblePubs.length} of {pubs.length}{" "}
            {pubs.length === 1 ? "publication" : "publications"}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: "#6B6A65", padding: "48px 0", textAlign: "center" }}>
          Loading...
        </div>
      ) : pubs.length === 0 ? (
        <div style={{ fontSize: 14, color: "#9B9892", padding: "48px 0", textAlign: "center" }}>
          No publications found for this view.
        </div>
      ) : (
        <>
          {/* Institution list displays discussion but does not create it: OPEN
              DISCUSSION renders only where a thread exists; no "ask the first
              question" on threadless rows (that lives on the bibliography/forum). */}
          <PublicationList pubs={visiblePubs} existingOnly />

          {!showAll && pubs.length > 50 ? (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <button
                type="button"
                className="fm-pill-button"
                onClick={() => setShowAll(true)}
                style={{
                  background: "none",
                  border: "1px solid #1E1E22",
                  color: "#9B6DFF",
                  padding: "10px 20px",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Show all {pubs.length} publications
              </button>
            </div>
          ) : null}
        </>
      )}
    </AppLayout>
  );
}
