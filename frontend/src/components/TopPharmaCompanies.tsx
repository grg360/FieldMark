import React from "react";
import { getTopCompaniesForHcp, type TopCompanyEntry, type CompanyStatus } from "../lib/api";
import { RIGHT_RAIL_HEADER_STYLE, RIGHT_RAIL_SECTION_STYLE } from "./rightRailStyles";

interface TopPharmaCompaniesProps {
  hcpId: string;
}

const STATUS_STYLE: Record<CompanyStatus, { bg: string; border: string; color: string; label: string }> = {
  active: { bg: "#0A1F16", border: "#1D9E75", color: "#1D9E75", label: "ACTIVE" },
  dormant: { bg: "#1F1A0A", border: "#B07816", color: "#B07816", label: "DORMANT" },
  lapsed: { bg: "#1E1E22", border: "#6B6A65", color: "#6B6A65", label: "LAPSED" },
};

const ROW_STYLE = {
  restingBg: "#0D0D10",
  restingBorder: "#1E1E22",
  activeBg: "#15131A",
  activeBorder: "#D85A30",
  restingTextPrimary: "#E8E6DF",
  restingTextSecondary: "#6B6A65",
  restingAmount: "#E8A020",
  activeTextPrimary: "#F5F4EF",
  activeTextSecondary: "#888076",
  activeAmount: "#FAC775",
};

const CORAL_BAR_MIN = 0.07;
const CORAL_BAR_MAX = 0.12;
const CORAL_BAR_ACTIVE = 0.18;
const CORAL_OVERLAY_ACTIVE = 0.03;

function formatCompactDollar(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(n)}`;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function TopPharmaCompanies({ hcpId }: TopPharmaCompaniesProps) {
  const [entries, setEntries] = React.useState<TopCompanyEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [popoverHovered, setPopoverHovered] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!hcpId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setActiveIndex(null);
    void (async () => {
      const data = await getTopCompaniesForHcp(hcpId);
      if (cancelled) return;
      setEntries(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcpId]);

  React.useEffect(() => {
    if (activeIndex === null) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveIndex(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveIndex(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [activeIndex]);

  if (loading) {
    return (
      <div style={RIGHT_RAIL_SECTION_STYLE}>
        <div style={RIGHT_RAIL_HEADER_STYLE}>
          Top Pharma Companies
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 44,
                backgroundColor: "#0D0D10",
                border: "1px solid #1E1E22",
                borderRadius: 3,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  const maxAmount = entries[0]?.total_amount_usd ?? 1;

  return (
    <div ref={containerRef} style={RIGHT_RAIL_SECTION_STYLE}>
      <div style={RIGHT_RAIL_HEADER_STYLE}>
        Top Pharma Companies
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map((entry, idx) => {
          const isActive = activeIndex === idx;
          const barWidthPct = Math.max(0, Math.min(100, (entry.total_amount_usd / maxAmount) * 100));
          const restingBarOpacity = idx === 0
            ? CORAL_BAR_MAX
            : CORAL_BAR_MIN + ((entries.length - 1 - idx) / Math.max(1, entries.length - 1)) * (CORAL_BAR_MAX - CORAL_BAR_MIN);
          const barOpacity = isActive ? CORAL_BAR_ACTIVE : restingBarOpacity;
          const avgPerPayment = entry.payment_count > 0
            ? entry.total_amount_usd / entry.payment_count
            : 0;
          const status = STATUS_STYLE[entry.status];
          return (
            <div key={`${entry.manufacturer_name}-${idx}`} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setActiveIndex(isActive ? null : idx)}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseLeave={() => {
                  setTimeout(() => {
                    if (!popoverHovered) setActiveIndex((current) => (current === idx ? null : current));
                  }, 60);
                }}
                aria-expanded={isActive}
                aria-label={`${entry.manufacturer_clean}, ${entry.payment_count} payments, $${entry.total_amount_usd.toFixed(0)} total`}
                style={{
                  position: "relative",
                  width: "100%",
                  background: isActive ? ROW_STYLE.activeBg : ROW_STYLE.restingBg,
                  border: `1px solid ${isActive ? ROW_STYLE.activeBorder : ROW_STYLE.restingBorder}`,
                  borderRadius: 4,
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "block",
                  overflow: "hidden",
                  transition: "background-color 150ms ease, border-color 150ms ease",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${barWidthPct}%`,
                    background: `rgba(216, 90, 48, ${barOpacity})`,
                    transition: "background-color 150ms ease",
                  }}
                />
                {isActive ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `rgba(216, 90, 48, ${CORAL_OVERLAY_ACTIVE})`,
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{
                      fontSize: 13,
                      color: isActive ? ROW_STYLE.activeTextPrimary : ROW_STYLE.restingTextPrimary,
                      fontWeight: 500,
                      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                      transition: "color 150ms ease",
                    }}>
                      {entry.manufacturer_clean}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: isActive ? ROW_STYLE.activeTextSecondary : ROW_STYLE.restingTextSecondary,
                      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                      transition: "color 150ms ease",
                    }}>
                      {entry.payment_count} {entry.payment_count === 1 ? "payment" : "payments"}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 14,
                    // One-amber rule (§5.5): only the top-paying (dominant) row's amount is amber;
                    // every other row's amount is neutral.
                    color: idx === 0
                      ? (isActive ? ROW_STYLE.activeAmount : ROW_STYLE.restingAmount)
                      : "#C7C3BA",
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 500,
                    flexShrink: 0,
                    marginLeft: 12,
                    transition: "color 150ms ease",
                  }}>
                    {formatCompactDollar(entry.total_amount_usd)}
                  </span>
                </div>
              </button>
              {isActive && (
                <div
                  role="dialog"
                  onMouseEnter={() => setPopoverHovered(true)}
                  onMouseLeave={() => {
                    setPopoverHovered(false);
                    setActiveIndex(null);
                  }}
                  style={{
                    position: "relative",
                    marginTop: 6,
                    backgroundColor: "#161618",
                    border: "1px solid #2B2520",
                    borderRadius: 4,
                    padding: "12px 14px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1E1E22" }}>
                    <span style={{ fontSize: 12, color: "#E8E6DF", fontWeight: 500, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
                      {entry.manufacturer_clean}
                    </span>
                    <span style={{
                      fontSize: 10,
                      color: status.color,
                      background: status.bg,
                      border: `1px solid ${status.border}`,
                      padding: "2px 7px",
                      borderRadius: 3,
                      letterSpacing: "0.04em",
                      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                    }}>
                      {status.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
                      <span style={{ color: "#6B6A65" }}>Most recent</span>
                      <span style={{ color: "#E8E6DF", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{formatShortDate(entry.most_recent_payment_date)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
                      <span style={{ color: "#6B6A65" }}>Total payments</span>
                      <span style={{ color: "#E8E6DF", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{entry.payment_count}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
                      <span style={{ color: "#6B6A65" }}>Avg per payment</span>
                      <span style={{ color: "#E8E6DF", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{formatCompactDollar(avgPerPayment)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
