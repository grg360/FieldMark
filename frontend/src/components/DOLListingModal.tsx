import { useEffect, useState } from "react";
import type { VerifiedDOL } from "../lib/types";
import DOLPostModal from "./DOLPostModal";

const ACCENT_COLOR = "#4DD0E1";

export function ensureAscoPulseStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("fm-asco-pulse-styles")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "fm-asco-pulse-styles";
  styleEl.textContent = `
    @keyframes fmAscoPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(styleEl);
}

ensureAscoPulseStyles();

function AscoActiveBadge() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
      }}
      title="Active in ASCO conversation (last 7 days)"
      aria-label="Active in ASCO conversation"
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "#10b981",
          animation: "fmAscoPulse 2s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: "#10b981",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 500,
          letterSpacing: 0.3,
          whiteSpace: "nowrap",
        }}
      >
        Live · ASCO
      </span>
    </div>
  );
}

export function formatTALabel(taSlug: string): string {
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

const KNOWN_CREDENTIALS = new Set([
  "md",
  "phd",
  "mph",
  "mpa",
  "do",
  "pharmd",
  "rn",
  "np",
  "pa",
  "mba",
  "msc",
  "mhs",
  "msn",
  "msph",
  "dnp",
  "edd",
  "dsc",
  "dvm",
  "fasco",
  "facp",
  "facs",
  "fashp",
  "fastro",
  "bs",
  "ba",
  "ms",
  "ma",
]);

function titleCaseIfNeeded(name: string): string {
  if (/[A-Z]/.test(name)) return name;
  return name
    .split(/\s+/)
    .map((token) => {
      if (!token) return token;
      const cleanToken = token.replace(/[,.]/g, "").toLowerCase();
      if (KNOWN_CREDENTIALS.has(cleanToken)) {
        return token.toUpperCase();
      }
      return token[0].toUpperCase() + token.slice(1);
    })
    .join(" ");
}

function addMiddleInitialPeriods(name: string): string {
  const tokens = name.split(/\s+/);
  return tokens
    .map((token, idx) => {
      if (idx === 0 || idx === tokens.length - 1) return token;
      if (/^[A-Z]$/.test(token)) return `${token}.`;
      return token;
    })
    .join(" ");
}

export function buildDOLDisplayName(dol: VerifiedDOL): string {
  const displayName = dol.social_user.display_name?.trim();
  if (displayName) {
    return addMiddleInitialPeriods(titleCaseIfNeeded(displayName));
  }
  return `${dol.first_name} ${dol.last_name}`.trim();
}

interface DOLCardProps {
  dol: VerifiedDOL;
  bioLineClamp?: number;
  fullWidth?: boolean;
  onLatestPost?: (dol: VerifiedDOL) => void;
}

export function DOLCard({ dol, bioLineClamp = 2, fullWidth = false, onLatestPost }: DOLCardProps) {
  const cardStyle = {
    width: fullWidth ? "100%" : 280,
    minWidth: fullWidth ? undefined : 280,
    textAlign: "left" as const,
    backgroundColor: "#111113",
    border: "1px solid #1E1E22",
    borderLeft: `3px solid ${ACCENT_COLOR}`,
    borderRadius: 4,
    padding: 10,
  };

  const openProfile = () => {
    const url = dol.social_user.profile_url ?? undefined;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const cardBody = (
    <>
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
          {buildDOLDisplayName(dol)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {dol.is_asco_active ? <AscoActiveBadge /> : null}
          <span
            style={{
              fontSize: 12,
              color: ACCENT_COLOR,
              fontFamily: "system-ui, sans-serif",
            }}
            aria-label={dol.social_user.platform}
            title={dol.social_user.platform}
          >
            {dol.social_user.platform === "twitter" ? "𝕏" : "bsky"}
          </span>
        </div>
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
          WebkitLineClamp: bioLineClamp,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {dol.social_user.bio ?? "No bio available."}
      </div>
    </>
  );

  if (onLatestPost) {
    return (
      <div style={cardStyle}>
        <button
          type="button"
          onClick={openProfile}
          style={{
            width: "100%",
            textAlign: "left",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {cardBody}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLatestPost(dol);
          }}
          style={{
            marginTop: 8,
            padding: 0,
            background: "none",
            border: "none",
            fontSize: 12,
            color: ACCENT_COLOR,
            fontFamily: "system-ui, sans-serif",
            cursor: "pointer",
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = "underline";
            e.currentTarget.style.filter = "brightness(1.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = "none";
            e.currentTarget.style.filter = "none";
          }}
        >
          Latest post →
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={openProfile} style={{ ...cardStyle, cursor: "pointer" }}>
      {cardBody}
    </button>
  );
}

interface DOLListingModalProps {
  taSlug: string;
  dols: VerifiedDOL[];
  onClose: () => void;
}

export default function DOLListingModal({ taSlug, dols, onClose }: DOLListingModalProps) {
  const [selectedDOL, setSelectedDOL] = useState<VerifiedDOL | null>(null);
  const [isWide, setIsWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dol-listing-modal-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: isWide ? "center" : "flex-end",
        alignItems: "center",
        padding: isWide ? 24 : 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: isWide ? 960 : 480,
          margin: isWide ? undefined : "0 auto",
          backgroundColor: "#111113",
          border: "1px solid #1E1E22",
          borderRadius: isWide ? 8 : "8px 8px 0 0",
          maxHeight: isWide ? "85dvh" : "90dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {!isWide ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, flexShrink: 0 }}>
            <div style={{ width: 32, height: 3, backgroundColor: "#1E1E22", borderRadius: 2 }} />
          </div>
        ) : null}

        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
            flexShrink: 0,
          }}
        >
          <h2
            id="dol-listing-modal-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 500,
              color: ACCENT_COLOR,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {`Verified DOLs · ${formatTALabel(taSlug)} (${dols.length})`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: "#6B6A65",
              fontSize: 24,
              lineHeight: 1,
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </header>

        <div
          style={{
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: 16,
            flex: 1,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isWide ? "repeat(2, minmax(0, 1fr))" : "1fr",
              gap: 8,
            }}
          >
            {dols.map((dol) => (
              <DOLCard
                key={`${dol.hcp_id}-${dol.social_user.id}`}
                dol={dol}
                bioLineClamp={4}
                fullWidth
                onLatestPost={(d) => setSelectedDOL(d)}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedDOL ? (
        <DOLPostModal dol={selectedDOL} onClose={() => setSelectedDOL(null)} />
      ) : null}
    </div>
  );
}
