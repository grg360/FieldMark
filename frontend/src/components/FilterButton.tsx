import type { RegionKey } from "../lib/regions";
import { useFilterContext } from "../lib/filter-context";
import { useEffect, useState } from "react";
import { getCanonicalThemes } from "../lib/themes-api";

function countActiveFilters(
  regions: RegionKey[],
  states: string[],
  themeIds: string[],
  totalThemeCount: number,
): number {
  let count = 0;
  const isDefault = regions.length === 1 && regions[0] === "US";
  if (!isDefault) count += 1;
  if (states.length > 0) count += 1;
  if (
    themeIds.length > 0 &&
    totalThemeCount > 0 &&
    themeIds.length < totalThemeCount
  ) {
    count += 1;
  }
  return count;
}

interface FilterButtonProps {
  onClick: () => void;
  taSlug: string;
}

export default function FilterButton({ onClick, taSlug }: FilterButtonProps) {
  const { regions, states, themeIds } = useFilterContext();
  const [totalThemeCount, setTotalThemeCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getCanonicalThemes(taSlug).then((themes) => {
      if (!cancelled) setTotalThemeCount(themes.length);
    });
    return () => {
      cancelled = true;
    };
  }, [taSlug]);

  const count = countActiveFilters(regions, states, themeIds, totalThemeCount);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `Open filters, ${count} active` : "Open filters"}
      style={{
        // Active-filter state keeps its coral semantic; idle → warm ghost matching the
        // All US / Landscape controls.
        background: count > 0 ? "rgba(216, 90, 48, 0.10)" : "transparent",
        border: count > 0 ? "1px solid rgba(216, 90, 48, 0.40)" : "1px solid rgba(255,255,255,0.09)",
        padding: "5px 12px 5px 10px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 8,
        position: "relative",
        transition: "background-color 150ms ease, border-color 150ms ease, color 150ms ease",
        flexShrink: 0,
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={count > 0 ? "#D85A30" : "#B6B2AA"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "stroke 150ms ease" }}
        aria-hidden
      >
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      <span
        style={{
          fontSize: 12.5,
          color: count > 0 ? "#D85A30" : "#B6B2AA",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          transition: "color 150ms ease",
        }}
      >
        Filters
      </span>
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            background: "#D85A30",
            color: "#0A0A0B",
            fontSize: 9,
            fontWeight: 600,
            width: 14,
            height: 14,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
