import { useEffect, useState } from "react";
import { getVerifiedDOLs } from "../lib/api";
import type { VerifiedDOL } from "../lib/types";

interface DOLHeroPanelProps {
  taSlug: string;
}

const ACCENT_COLOR = "#4DD0E1";

function formatTALabel(taSlug: string): string {
  const slug = taSlug.trim().toLowerCase();
  if (slug === "nsclc") return "NSCLC";
  if (slug === "rare-disease") return "Rare Disease";
  if (slug === "hepatology") return "Hepatology";
  if (slug === "oncology") return "Oncology";
  if (slug === "immunology") return "Immunology";
  return taSlug;
}

function formatFollowerCount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${value}`;
  if (value < 10000) return `${(value / 1000).toFixed(1)}K`;
  if (value < 100000) return `${(value / 1000).toFixed(1)}K`;
  if (value < 1000000) return `${Math.round(value / 1000)}K`;
  return `${(value / 1000000).toFixed(1)}M`;
}

function buildDisplayName(dol: VerifiedDOL): string {
  const displayName = dol.social_user.display_name?.trim();
  if (displayName) return displayName;
  return `${dol.first_name} ${dol.last_name}`.trim();
}

export default function DOLHeroPanel({ taSlug }: DOLHeroPanelProps) {
  const [dols, setDols] = useState<VerifiedDOL[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchDols() {
      setLoading(true);
      const { data } = await getVerifiedDOLs(taSlug, 10);
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
        <span
          className="fm-section-header-right"
          style={{
            fontSize: 13,
            color: ACCENT_COLOR,
            fontFamily: "monospace",
          }}
        >
          {`${dols.length} identified`}
        </span>
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
          <button
            key={`${dol.hcp_id}-${dol.social_user.id}`}
            onClick={() => {
              window.open(dol.social_user.profile_url, "_blank", "noopener,noreferrer");
            }}
            style={{
              width: 280,
              minWidth: 280,
              textAlign: "left",
              backgroundColor: "#111113",
              border: "1px solid #1E1E22",
              borderLeft: `3px solid ${ACCENT_COLOR}`,
              borderRadius: 4,
              padding: 10,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#E8E6DF",
                  fontFamily: "system-ui, sans-serif",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {buildDisplayName(dol)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: ACCENT_COLOR,
                  fontFamily: "system-ui, sans-serif",
                  flexShrink: 0,
                }}
                aria-label={dol.social_user.platform}
                title={dol.social_user.platform}
              >
                {dol.social_user.platform === "twitter" ? "𝕏" : "bsky"}
              </span>
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#6B6A65",
                fontFamily: "system-ui, sans-serif",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {dol.institution ?? "Institution unavailable"}
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "#6B6A65",
                fontFamily: "monospace",
              }}
            >
              {`${formatFollowerCount(dol.social_user.follower_count)} followers`}
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "#B8B4AC",
                fontFamily: "system-ui, sans-serif",
                lineHeight: 1.45,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {dol.social_user.bio ?? "No bio available."}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
