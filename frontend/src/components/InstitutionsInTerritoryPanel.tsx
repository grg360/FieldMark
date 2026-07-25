import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFilterContext } from "../lib/filter-context";
import { apiSlugForTaId, getTopInstitutionsInTerritory, type TerritoryInstitution } from "../lib/api";
import { FONT, COLOR } from "../lib/designTokens";

interface Props {
  taSlug: string;
  taId?: string;
}

export default function InstitutionsInTerritoryPanel({ taSlug, taId }: Props) {
  const navigate = useNavigate();
  const { states } = useFilterContext();
  const [institutions, setInstitutions] = useState<TerritoryInstitution[]>([]);
  const [loading, setLoading] = useState(true);

  // The index route (/institutions/:ta) keys on the active INDICATION slug, not
  // the parent-TA slug. taSlug here is the parent api slug (e.g. "immunology"),
  // which the index reads as empty; taId is the indication (e.g. AD) — the same
  // id used for the data fetch below — so derive the correct slug from it.
  // (Oncology's parent slug already maps to "nsclc", so NSCLC is unaffected.)
  const institutionsSlug = (taId ? apiSlugForTaId(taId) : undefined) ?? taSlug;

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
          marginBottom: 12,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        {/* Eyebrow role (§type 5): sans, 11/600, 0.18em, --ink-4 */}
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: COLOR.ink4,
          }}
        >
          {states.length > 0 ? "Institutions in your territory" : "Top institutions"}
        </span>
        <button
          type="button"
          onClick={() => navigate(`/institutions/${institutionsSlug}`)}
          style={{
            background: "none",
            border: "none",
            color: COLOR.indigoLink,
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = COLOR.indigoLinkHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = COLOR.indigoLink;
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
            onClick={() => navigate(`/institution/${inst.slug}?ta=${institutionsSlug}`)}
            className="elevation-card elevation-interactive"
            style={{
              flexShrink: 0,
              width: 220,
              minHeight: 96,
              padding: "16px 18px",
              textAlign: "left",
              cursor: "pointer",
              color: COLOR.ink1,
              fontFamily: FONT.sans,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            {/* Card-title treatment at strip scale (the 21px display title would overflow a
                220px card); the design's own institution-name spec. */}
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                color: "#E7E4DC",
                lineHeight: 1.35,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {inst.institution_name}
            </div>

            {/* Counts are mono (data rule); the RS/Est unit labels are sans. Cohort-count
                coloring kept as-is (rising violet, established amber). */}
            <div style={{ display: "flex", gap: 14, fontSize: 12.5 }}>
              <span>
                <span style={{ fontFamily: FONT.mono, fontWeight: 600, color: "#9B6DFF", fontVariantNumeric: "tabular-nums" }}>
                  {inst.rising_star_count}
                </span>
                <span style={{ color: "#6E6A62" }}> RS</span>
              </span>
              <span>
                <span style={{ fontFamily: FONT.mono, fontWeight: 600, color: "#E8A020", fontVariantNumeric: "tabular-nums" }}>
                  {inst.established_count}
                </span>
                <span style={{ color: "#6E6A62" }}> Est</span>
              </span>
            </div>

            {inst.top_rising_star_name ? (
              <div style={{ fontSize: 12, color: "#6E6A62" }}>
                Top: <span style={{ color: "#B6B2AA" }}>{inst.top_rising_star_name}</span>
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
