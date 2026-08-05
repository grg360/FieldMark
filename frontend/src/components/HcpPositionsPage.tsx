import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  getAllPositionsForHcp,
  type EvidencePosition,
  type PositionType,
  type PositionCategory,
} from "../lib/scientificPositions";
import { resolvePrimaryTaId, taDisplayNameForId } from "../lib/api";
import { supabase } from "../lib/supabase";
import { COLOR, ELEVATION, TYPE } from "../lib/designTokens";
import AppLayout from "./AppLayout";
import PageHero from "./PageHero";

const POLARITY_OPTIONS: { value: PositionType | "all"; label: string; color: string }[] = [
  { value: "all", label: "All", color: "#9B9892" },
  { value: "positive_position", label: "Positive", color: "#3FB8AF" },
  { value: "cautionary_position", label: "Cautionary", color: "#E8A04E" },
  { value: "unmet_need_position", label: "Unmet Need", color: "#9B6DFF" },
  { value: "hypothesis_position", label: "Hypothesis", color: "#7B9EBD" },
];

const CATEGORY_OPTIONS: { value: PositionCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "efficacy", label: "Efficacy" },
  { value: "patient_selection", label: "Patient Selection" },
  { value: "biomarker", label: "Biomarker" },
  { value: "safety", label: "Safety" },
  { value: "resistance", label: "Resistance" },
  { value: "sequencing", label: "Sequencing" },
  { value: "access", label: "Access" },
  { value: "diagnostics", label: "Diagnostics" },
  { value: "methodology", label: "Methodology" },
];

function polarityColor(type: PositionType): string {
  const match = POLARITY_OPTIONS.find((opt) => opt.value === type);
  return match?.color ?? "#9B9892";
}

function polarityLabel(type: PositionType): string {
  const match = POLARITY_OPTIONS.find((opt) => opt.value === type);
  return match?.label ?? type;
}

export default function HcpPositionsPage() {
  const { id: hcpId } = useParams<{ id: string }>();
  const location = useLocation();
  const navTaId = (location.state as { taId?: string } | null)?.taId;
  const [taId, setTaId] = useState<string | undefined>(navTaId);
  const [positions, setPositions] = useState<EvidencePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [hcpName, setHcpName] = useState<string>("");
  const [polarity, setPolarity] = useState<PositionType | "all">("all");
  const [category, setCategory] = useState<PositionCategory | "all">("all");

  // Resolve the TA from nav-state, else re-derive from the HCP (refresh/deep-link).
  useEffect(() => {
    if (navTaId) {
      setTaId(navTaId);
      return;
    }
    if (!hcpId) return;
    let cancelled = false;
    void (async () => {
      const primary = await resolvePrimaryTaId(hcpId);
      if (!cancelled) setTaId(primary ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcpId, navTaId]);

  useEffect(() => {
    let cancelled = false;
    if (!hcpId || !taId) return;
    setLoading(true);

    Promise.all([
      getAllPositionsForHcp(hcpId, taId),
      fetchHcpName(hcpId),
    ])
      .then(([data, name]) => {
        if (cancelled) return;
        setPositions(data);
        setHcpName(name);
      })
      .catch((err) => {
        console.warn("HcpPositionsPage: load error", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hcpId, taId]);

  const filtered = useMemo(() => {
    return positions.filter((p) => {
      if (polarity !== "all" && p.position_type !== polarity) return false;
      if (category !== "all" && p.position_category !== category) return false;
      return true;
    });
  }, [positions, polarity, category]);

  const counts = useMemo(() => {
    const byPolarity: Record<string, number> = { all: positions.length };
    for (const opt of POLARITY_OPTIONS) {
      if (opt.value === "all") continue;
      byPolarity[opt.value] = positions.filter((p) => p.position_type === opt.value).length;
    }
    return byPolarity;
  }, [positions]);

  const breadcrumbs = [
    { label: "Home", path: "/me" },
    ...(hcpId ? [{ label: hcpName || "Profile", path: `/hcp/${hcpId}` }] : []),
    { label: "Scientific Positions" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      {/* Reduced H1 (PageHero, Commit B 2026-08-05) */}
      <div style={{ marginBottom: 24 }}>
        <PageHero
          reduced
          eyebrow="Fieldmark · Positions"
          title="All Scientific Positions"
          dek={hcpName
            ? `All extracted scientific positions for ${hcpName}${taId ? ` (${taDisplayNameForId(taId)})` : ""}`
            : `All extracted scientific positions for this investigator${taId ? ` (${taDisplayNameForId(taId)})` : ""}`}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {POLARITY_OPTIONS.map((opt) => {
          const active = polarity === opt.value;
          const count = counts[opt.value] ?? 0;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPolarity(opt.value)}
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: "5px 12px",
                borderRadius: 999,
                cursor: "pointer",
                backgroundColor: active ? `${opt.color}26` : "transparent",
                color: active ? opt.color : COLOR.ink3,
                border: `1px solid ${active ? opt.color : COLOR.hairStrong}`,
              }}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: 24 }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PositionCategory | "all")}
          style={{
            fontSize: 13,
            padding: "6px 10px",
            backgroundColor: COLOR.surfaceWell,
            color: COLOR.ink1,
            border: `1px solid ${COLOR.hairStrong}`,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>Loading positions...</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>
          No positions match the current filters.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((pos) => (
            <PositionRow key={pos.position_id} pos={pos} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}

function PositionRow({ pos }: { pos: EvidencePosition }) {
  const color = polarityColor(pos.position_type);
  const label = polarityLabel(pos.position_type);
  const bullet = String.fromCharCode(8226);

  return (
    <div
      style={{
        ...ELEVATION.card,
        padding: "16px 18px",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 999,
            backgroundColor: `${color}26`,
            color,
          }}
        >
          {label}
        </span>
        {pos.position_category ? (
          <span style={{ fontSize: 11, color: COLOR.ink3 }}>{pos.position_category}</span>
        ) : null}
        {pos.drug_name ? (
          <span style={{ fontSize: 11, color: COLOR.ink3 }}>
            {bullet} {pos.drug_name}
          </span>
        ) : null}
        {pos.biomarker ? (
          <span style={{ fontSize: 11, color: COLOR.ink3 }}>
            {bullet} {pos.biomarker}
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 13, color: COLOR.ink1, lineHeight: 1.5, marginBottom: 8 }}>
        {pos.position_text}
      </div>

      <div
        style={{
          ...TYPE.bodyProse,
          fontSize: 12,
          color: COLOR.ink4,
          marginLeft: 10,
          marginBottom: 10,
          lineHeight: 1.6,
        }}
      >
        &quot;{pos.evidence_excerpt}&quot;
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: COLOR.ink4 }}>
        {pos.pub_year ? <span>{pos.pub_year}</span> : null}
        {pos.journal ? <span>{bullet} {pos.journal}</span> : null}
        {pos.citation_count != null ? <span>{bullet} {pos.citation_count} citations</span> : null}
        {pos.doi ? (
          <a
            href={`https://doi.org/${pos.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: COLOR.indigoLink, textDecoration: "none" }}
          >
            {bullet} DOI
          </a>
        ) : null}
        {pos.pubmed_id ? (
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${pos.pubmed_id}/`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: COLOR.indigoLink, textDecoration: "none" }}
          >
            {bullet} PubMed
          </a>
        ) : null}
      </div>
    </div>
  );
}

async function fetchHcpName(hcpId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("hcps_v2")
      .select("first_name, last_name")
      .eq("id", hcpId)
      .maybeSingle();
    if (error || !data) return "";
    const first = (data as { first_name?: string }).first_name ?? "";
    const last = (data as { last_name?: string }).last_name ?? "";
    return `${first} ${last}`.trim();
  } catch {
    return "";
  }
}
