import { useEffect, useRef, useState } from "react";
import { getTADisplayName, searchHCPs, type HCPSearchResult } from "../lib/api";
import { formatScoreFloor1 } from "../lib/cohort-metrics";
import { COLOR, ELEVATION, FONT, RADIUS, TYPE } from "../lib/designTokens";

interface SearchBarProps {
  isOpen?: boolean;
  currentTaId: string;
  onClose?: () => void;
  onSelect: (hcpId: string, taId: string) => void;
  variant?: "overlay" | "inline";
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
  // Score-honesty fix: floor to one decimal (no invented 100 ceiling). formatScoreFloor1
  // returns an em dash for null/non-finite.
  const scoreDisplay = formatScoreFloor1(result.cohortScore);
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
        borderBottom: `1px solid ${COLOR.hair}`,
        borderLeft: "3px solid transparent",
        padding: "10px 12px",
        cursor: "pointer",
        fontFamily: FONT.sans,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderLeftColor = cohortAccent(cohort);
        e.currentTarget.style.backgroundColor = COLOR.surfaceRaised;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderLeftColor = "transparent";
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.ink1 }}>
            {crossTaLabel ? `${name} — ${crossTaLabel}` : name}
          </div>
          {result.institution ? (
            <div
              style={{
                fontSize: 12,
                color: COLOR.ink4,
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
            ...TYPE.dataValue,
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          {scoreDisplay}
        </span>
      </div>
    </button>
  );
}

export default function SearchBar({
  isOpen,
  currentTaId,
  onClose,
  onSelect,
  variant = "overlay",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [inCurrentTA, setInCurrentTA] = useState<HCPSearchResult[]>([]);
  const [inOtherTAs, setInOtherTAs] = useState<HCPSearchResult[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInline = variant === "inline";
  const effectivelyOpen = isInline || isOpen === true;
  const [inlineDropdownHidden, setInlineDropdownHidden] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    setQuery("");
    setDebouncedQuery("");
    setInCurrentTA([]);
    setInOtherTAs([]);
  }, [isOpen]);

  useEffect(() => {
    if (!effectivelyOpen) return;
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, effectivelyOpen]);

  useEffect(() => {
    if (!effectivelyOpen) return;
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
  }, [debouncedQuery, currentTaId, effectivelyOpen]);

  useEffect(() => {
    if (!effectivelyOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (isInline) {
          setInlineDropdownHidden(true);
        } else {
          onClose?.();
        }
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [effectivelyOpen, isInline, onClose]);

  if (!effectivelyOpen) return null;

  const trimmed = query.trim();
  const showDropdown =
    (trimmed.length > 0 || loading) && !(isInline && inlineDropdownHidden);
  const hasInTa = inCurrentTA.length > 0;
  const hasCrossTa = inOtherTAs.length > 0;

  const helperTextStyle = {
    ...TYPE.bodyUI,
    padding: "12px 14px",
    fontSize: 12,
    color: COLOR.ink4,
  };

  const dropdownContents = loading ? (
    <div style={helperTextStyle}>Searching…</div>
  ) : trimmed.length < 2 ? (
    <div style={helperTextStyle}>
      Type at least 2 characters.
    </div>
  ) : !hasInTa && !hasCrossTa ? (
    <div style={helperTextStyle}>
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
              ...TYPE.microLabel,
              padding: "8px 12px 4px",
              borderTop: hasInTa ? `1px solid ${COLOR.hair}` : undefined,
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
  );

  if (isInline) {
    return (
      <div
        ref={containerRef}
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          maxWidth: 480,
          margin: "0 16px",
        }}
      >
        <div style={{ position: "relative" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <circle cx="7.5" cy="7.5" r="5.5" stroke={COLOR.ink4} strokeWidth="1.5" />
            <line x1="11.5" y1="11.5" x2="16" y2="16" stroke={COLOR.ink4} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setInlineDropdownHidden(false);
            }}
            onFocus={() => setInlineDropdownHidden(false)}
            placeholder="Search HCP by name…"
            aria-label="Search HCP by name"
            style={{
              width: "100%",
              height: 32,
              backgroundColor: COLOR.surfaceWell,
              border: `1px solid ${COLOR.hair}`,
              borderRadius: RADIUS.well,
              color: COLOR.ink1,
              fontSize: 13,
              padding: "0 12px 0 32px",
              outline: "none",
              fontFamily: FONT.sans,
            }}
          />
        </div>
        {showDropdown ? (
          <div
            style={{
              ...ELEVATION.card,
              position: "absolute",
              left: 0,
              right: 0,
              top: "100%",
              marginTop: 4,
              maxHeight: 320,
              overflowY: "auto",
              zIndex: 50,
            }}
          >
            {dropdownContents}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        zIndex: 50,
        backgroundColor: COLOR.ground,
        borderBottom: `1px solid ${COLOR.hair}`,
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
            backgroundColor: COLOR.surfaceWell,
            border: `1px solid ${COLOR.hair}`,
            borderRadius: RADIUS.well,
            color: COLOR.ink1,
            fontSize: 14,
            padding: "0 12px",
            outline: "none",
            fontFamily: FONT.sans,
          }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          style={{
            background: "none",
            border: "none",
            color: COLOR.ink4,
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
            ...ELEVATION.card,
            position: "absolute",
            left: 16,
            right: 16,
            top: "100%",
            marginTop: 4,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {dropdownContents}
        </div>
      ) : null}
    </div>
  );
}
