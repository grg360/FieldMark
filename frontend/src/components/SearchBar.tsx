import { useEffect, useRef, useState } from "react";
import { getTADisplayName, searchHCPs, type HCPSearchResult } from "../lib/api";

interface SearchBarProps {
  isOpen: boolean;
  currentTaId: string;
  onClose: () => void;
  onSelect: (hcpId: string, taId: string) => void;
}

const COHORT_BADGE: Record<
  NonNullable<HCPSearchResult["cohortClassification"]>,
  { label: string; color: string; border: string }
> = {
  established: { label: "Established", color: "#FFD700", border: "#FFD700" },
  rising_star: { label: "Rising Star", color: "#9B6DFF", border: "#9B6DFF" },
  community: { label: "Community", color: "#4ECDC4", border: "#4ECDC4" },
  unclassified: { label: "Unclassified", color: "#6B6A65", border: "#6B6A65" },
};

function cohortAccent(cohort: HCPSearchResult["cohortClassification"]): string {
  if (cohort === "established") return "#FFD700";
  if (cohort === "rising_star") return "#9B6DFF";
  if (cohort === "community") return "#4ECDC4";
  return "#6B6A65";
}

function SearchResultRow({
  result,
  currentTaId,
  crossTaLabel,
  onSelect,
}: {
  result: HCPSearchResult;
  currentTaId: string;
  crossTaLabel?: string;
  onSelect: (hcpId: string, taId: string) => void;
}) {
  const cohort = result.cohortClassification ?? "unclassified";
  const badge = COHORT_BADGE[cohort] ?? COHORT_BADGE.unclassified;
  const scoreDisplay =
    result.cohortScore != null && Number.isFinite(result.cohortScore)
      ? Math.round(result.cohortScore).toLocaleString()
      : "—";
  const name = `${result.firstName} ${result.lastName}`.trim();

  const handleClick = () => {
    if (crossTaLabel) {
      const otherTaId =
        result.therapeuticAreaIds.find((id) => id !== currentTaId) ??
        result.therapeuticAreaIds[0];
      if (otherTaId) {
        onSelect(result.id, otherTaId);
        return;
      }
      onSelect(result.id, currentTaId);
      return;
    }
    onSelect(result.id, currentTaId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        width: "100%",
        display: "block",
        textAlign: "left",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid #1E1E22",
        borderLeft: "3px solid transparent",
        padding: "10px 12px",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderLeftColor = cohortAccent(cohort);
        e.currentTarget.style.backgroundColor = "#111113";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderLeftColor = "transparent";
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E6DF" }}>
            {crossTaLabel ? `${name} — ${crossTaLabel}` : name}
          </div>
          {result.institution ? (
            <div
              style={{
                fontSize: 12,
                color: "#6B6A65",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {result.institution}
            </div>
          ) : null}
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              fontSize: 10,
              fontWeight: 500,
              color: badge.color,
              border: `1px solid ${badge.border}`,
              borderRadius: 3,
              padding: "2px 6px",
              letterSpacing: "0.04em",
            }}
          >
            {badge.label}
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            fontFamily: "monospace",
            color: "#6B6A65",
            flexShrink: 0,
          }}
        >
          {scoreDisplay}
        </span>
      </div>
    </button>
  );
}

export default function SearchBar({ isOpen, currentTaId, onClose, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [inCurrentTA, setInCurrentTA] = useState<HCPSearchResult[]>([]);
  const [inOtherTAs, setInOtherTAs] = useState<HCPSearchResult[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    setQuery("");
    setDebouncedQuery("");
    setInCurrentTA([]);
    setInOtherTAs([]);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (debouncedQuery.length < 2) {
      setInCurrentTA([]);
      setInOtherTAs([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { inCurrentTA: current, inOtherTAs: other } = await searchHCPs(
        debouncedQuery,
        currentTaId,
      );
      if (cancelled) return;
      setInCurrentTA(current);
      setInOtherTAs(other);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, currentTaId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmed = query.trim();
  const showDropdown = trimmed.length > 0 || loading;
  const hasInTa = inCurrentTA.length > 0;
  const hasCrossTa = inOtherTAs.length > 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        zIndex: 50,
        backgroundColor: "#0A0A0B",
        borderBottom: "1px solid #1E1E22",
        padding: "8px 16px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search HCP by name…"
          aria-label="Search HCP by name"
          style={{
            flex: 1,
            height: 36,
            backgroundColor: "#111113",
            border: "1px solid #1E1E22",
            borderRadius: 4,
            color: "#E8E6DF",
            fontSize: 14,
            padding: "0 12px",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          style={{
            background: "none",
            border: "none",
            color: "#6B6A65",
            fontSize: 18,
            cursor: "pointer",
            padding: 4,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {showDropdown ? (
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            top: "100%",
            marginTop: 4,
            backgroundColor: "#111113",
            border: "1px solid #1E1E22",
            borderRadius: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {loading ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#6B6A65" }}>Searching…</div>
          ) : trimmed.length < 2 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#6B6A65" }}>
              Type at least 2 characters.
            </div>
          ) : !hasInTa && !hasCrossTa ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#6B6A65" }}>
              {`No HCPs match '${trimmed}'.`}
            </div>
          ) : (
            <>
              {hasInTa
                ? inCurrentTA.map((result) => (
                    <SearchResultRow
                      key={result.id}
                      result={result}
                      currentTaId={currentTaId}
                      onSelect={onSelect}
                    />
                  ))
                : null}
              {hasCrossTa ? (
                <>
                  <div
                    style={{
                      padding: "8px 12px 4px",
                      fontSize: 11,
                      color: "#6B6A65",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      borderTop: hasInTa ? "1px solid #1E1E22" : undefined,
                    }}
                  >
                    Also found in other TAs:
                  </div>
                  {inOtherTAs.map((result) => (
                    <SearchResultRow
                      key={`other-${result.id}`}
                      result={result}
                      currentTaId={currentTaId}
                      crossTaLabel={
                        result.therapeuticAreaName ??
                        (result.therapeuticAreaIds[0]
                          ? getTADisplayName(result.therapeuticAreaIds[0])
                          : "Untagged")
                      }
                      onSelect={onSelect}
                    />
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
