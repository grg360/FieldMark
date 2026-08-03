// Shared single-column publication list with sort controls (Design frame 01).
// Renders on every bibliography surface via PublicationCard. Sort: MOST CITED /
// RECENT / DISCUSSED. The DISCUSSED sort needs discussion counts, so the list
// batch-loads the discuss affordances once and passes them to each card (which
// also lets the card skip its own per-row fetch).

import { useEffect, useMemo, useState } from "react";
import { COLOR, FONT } from "../../lib/designTokens";
import { useMediaQuery } from "../../lib/useMediaQuery";
import type { PublicationListRow } from "../../lib/publicationsList";
import { getDiscussAffordances, type DiscussAffordance } from "../../lib/fieldIntelligence";
import PublicationCard from "./PublicationCard";

type Sort = "cited" | "recent" | "discussed";

const SORTS: { key: Sort; label: string }[] = [
  { key: "cited", label: "MOST CITED" },
  { key: "recent", label: "RECENT" },
  { key: "discussed", label: "DISCUSSED" },
];

export default function PublicationList({ pubs, narrow = false, existingOnly = false }: { pubs: PublicationListRow[]; narrow?: boolean; existingOnly?: boolean }) {
  // `narrow` forces the stacked row layout regardless of viewport — used inside
  // the fixed-480px profile bibliography screen, where the container is narrow
  // even on desktop.
  const viewportMobile = useMediaQuery("(max-width: 640px)");
  const isMobile = viewportMobile || narrow;
  const [sort, setSort] = useState<Sort>("cited");
  const [affordances, setAffordances] = useState<Record<string, DiscussAffordance>>({});

  useEffect(() => {
    let cancelled = false;
    const pmids = pubs.map((p) => p.pmid).filter((p): p is string => !!p);
    if (pmids.length === 0) { setAffordances({}); return; }
    getDiscussAffordances(pmids).then((m) => { if (!cancelled) setAffordances(m); });
    return () => { cancelled = true; };
  }, [pubs]);

  const sorted = useMemo(() => {
    const rows = [...pubs];
    const recency = (p: PublicationListRow) => p.pub_date ? Date.parse(p.pub_date) : (p.pub_year ? Date.UTC(p.pub_year, 0) : 0);
    if (sort === "recent") {
      rows.sort((a, b) => recency(b) - recency(a));
    } else if (sort === "discussed") {
      const rc = (p: PublicationListRow) => (p.pmid && affordances[p.pmid]?.reply_count) || 0;
      rows.sort((a, b) => rc(b) - rc(a) || (b.citation_count ?? 0) - (a.citation_count ?? 0));
    } else {
      rows.sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0) || (b.pub_year ?? 0) - (a.pub_year ?? 0));
    }
    return rows;
  }, [pubs, sort, affordances]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* sort controls */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SORTS.map((s) => {
          const active = s.key === sort;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              style={{
                fontFamily: FONT.mono,
                fontSize: 10.5,
                letterSpacing: "0.08em",
                padding: "7px 12px",
                cursor: "pointer",
                color: active ? COLOR.amber : COLOR.ink4,
                background: active ? "rgba(232,160,32,0.1)" : "transparent",
                border: `1px solid ${active ? "rgba(232,160,32,0.35)" : COLOR.hairStrong}`,
                borderRadius: 3,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* single-column rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map((pub) => (
          <PublicationCard
            key={pub.id}
            pub={pub}
            isMobile={isMobile}
            affordance={pub.pmid ? affordances[pub.pmid] ?? null : null}
            existingOnly={existingOnly}
          />
        ))}
      </div>
    </div>
  );
}
