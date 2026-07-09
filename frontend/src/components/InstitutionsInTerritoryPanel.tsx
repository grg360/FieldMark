import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFilterContext } from "../lib/filter-context";
import { getTopInstitutionsInTerritory, type TerritoryInstitution } from "../lib/api";

interface Props {
  taSlug: string;
  taId?: string;
}

export default function InstitutionsInTerritoryPanel({ taSlug, taId }: Props) {
  const navigate = useNavigate();
  const { states } = useFilterContext();
  const [institutions, setInstitutions] = useState<TerritoryInstitution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const top = await getTopInstitutionsInTerritory(taSlug, states, 8, taId);
      if (!active) return;
      setInstitutions(top);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [taSlug, taId, states.join(",")]);

  if (loading || institutions.length === 0) return null;

  return (
    <div style={{ margin: "0 16px 16px", overflow: "hidden" }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#6B6A65",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          {states.length > 0 ? "Institutions in your territory" : "Top institutions"}
        </span>
        <button
          type="button"
          onClick={() => navigate(`/institutions/${taSlug}`)}
          style={{
            background: "none",
            border: "none",
            color: "#9B9892",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#E8A020";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#9B9892";
          }}
        >
          View all →
        </button>
      </div>

      <div
        className="fm-horizontal-scroll"
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {institutions.map((inst) => (
          <button
            key={inst.slug}
            type="button"
            onClick={() => navigate(`/institution/${inst.slug}`)}
            style={{
              flexShrink: 0,
              width: 220,
              minHeight: 96,
              padding: "10px 12px",
              backgroundColor: "#0F0F12",
              border: "1px solid #1E1E22",
              borderRadius: 6,
              textAlign: "left",
              cursor: "pointer",
              transition: "background-color 120ms, border-color 120ms",
              color: "#E8E6DF",
              fontFamily: "system-ui, sans-serif",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#15131A";
              e.currentTarget.style.borderColor = "#2A2730";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#0F0F12";
              e.currentTarget.style.borderColor = "#1E1E22";
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#E8E6DF",
                lineHeight: 1.3,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {inst.institution_name}
            </div>

            <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
              <span style={{ color: "#9B6DFF", fontWeight: 600 }}>
                {inst.rising_star_count} RS
              </span>
              <span style={{ color: "#E8A020", fontWeight: 600 }}>
                {inst.established_count} Est
              </span>
            </div>

            {inst.top_rising_star_name ? (
              <div style={{ fontSize: 11, color: "#6B6A65" }}>
                Top: <span style={{ color: "#9B9892" }}>{inst.top_rising_star_name}</span>
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
