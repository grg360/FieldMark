import { useEffect, useState } from "react";
import { getVerifiedDOLs } from "../lib/api";
import type { VerifiedDOL } from "../lib/types";
import DOLListingModal, { DOLCard, ensureAscoPulseStyles, formatTALabel } from "./DOLListingModal";

ensureAscoPulseStyles();

interface DOLHeroPanelProps {
  taSlug: string;
}

const ACCENT_COLOR = "#4DD0E1";

export default function DOLHeroPanel({ taSlug }: DOLHeroPanelProps) {
  const [dols, setDols] = useState<VerifiedDOL[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [countHovered, setCountHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchDols() {
      setLoading(true);
      const { data } = await getVerifiedDOLs(taSlug, 50);
      if (cancelled) return;
      setDols(data ?? []);
      setLoading(false);
    }

    fetchDols();

    return () => {
      cancelled = true;
    };
  }, [taSlug]);

  if (loading || dols.length === 0) return null;

  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px 8px",
        }}
      >
        <span
          className="fm-section-header-left"
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: ACCENT_COLOR,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {`Verified DOLs · ${formatTALabel(taSlug)}`}
        </span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          onMouseEnter={() => setCountHovered(true)}
          onMouseLeave={() => setCountHovered(false)}
          className="fm-section-header-right"
          style={{
            fontSize: 13,
            color: ACCENT_COLOR,
            fontFamily: "monospace",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textDecoration: countHovered ? "underline" : "none",
            filter: countHovered ? "brightness(1.15)" : "none",
          }}
        >
          {`${dols.length} identified`}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "0 16px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {dols.map((dol) => (
          <DOLCard key={`${dol.hcp_id}-${dol.social_user.id}`} dol={dol} bioLineClamp={2} />
        ))}
      </div>

      {modalOpen ? (
        <DOLListingModal taSlug={taSlug} dols={dols} onClose={() => setModalOpen(false)} />
      ) : null}
    </div>
  );
}
