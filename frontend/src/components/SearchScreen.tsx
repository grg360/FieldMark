import { useState, useRef, useEffect } from "react";
import { HCP, hcpData } from "../data/hcpData";
import HCPCard from "./HCPCard";
import ActionTray from "./ActionTray";

interface SearchScreenProps {
  onBack: () => void;
  onCardPress: (hcp: HCP) => void;
}

type SearchState = "empty" | "loading" | "results";

const CHIPS = [
  "Gene therapy · Rare Disease · Northeast",
  "Phase III investigators · Immunology",
  "First-author · NEJM or Lancet · last 2 years",
];

const SEARCH_RESULTS: HCP[] = [hcpData[0], hcpData[2], hcpData[3]];

const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function DotsGrid() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map((row) => (
        <div key={row} style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map((col) => (
            <div
              key={col}
              style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "#1E1E22" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PulsingDots() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            backgroundColor: "#E8A020",
            animation: `pulse-dot 1s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        backgroundColor: "#111113",
        border: "1px solid #1E1E22",
        borderLeft: "3px solid #1E1E22",
        borderRadius: 4,
        margin: "0 16px 8px",
        padding: 12,
        height: 120,
        animation: "skeleton-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export default function SearchScreen({ onBack, onCardPress }: SearchScreenProps) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("empty");
  const [trayOpen, setTrayOpen] = useState(false);
  const [activeHCP, setActiveHCP] = useState<HCP | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function runSearch(q: string) {
    if (!q.trim()) return;
    setQuery(q);
    setState("loading");
    setTimeout(() => setState("results"), 1200);
  }

  function handleChip(chip: string) {
    setQuery(chip);
    runSearch(chip);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") runSearch(query);
  }

  return (
    <div
      className="fm-screen"
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Nav bar */}
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            padding: 4,
          }}
        >
          <BackArrow />
          <span style={{ fontSize: 13, color: "#6B6A65" }}>Feed</span>
        </button>
      </div>

      {/* Search input */}
      <div style={{ padding: "16px 16px 0" }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="fm-search-input"
          placeholder="Ask anything — specialty, region, trial type, publication focus..."
          style={{
            width: "100%",
            height: 48,
            backgroundColor: "#111113",
            border: "1px solid #E8A020",
            borderRadius: 4,
            padding: "0 16px",
            fontSize: 14,
            color: "#E8E6DF",
            outline: "none",
            boxSizing: "border-box",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        />

        {/* Chips */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChip(chip)}
              className="fm-search-chip"
              style={{
                flexShrink: 0,
                backgroundColor: "#0D0D10",
                border: "1px solid #1E1E22",
                borderRadius: 3,
                padding: "6px 12px",
                fontSize: 12,
                color: "#6B6A65",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {state === "empty" && (
        <div style={{ marginTop: 48, textAlign: "center", padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <DotsGrid />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#E8E6DF", marginTop: 16 }}>
            Query the field
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#6B6A65",
              marginTop: 8,
              lineHeight: 1.6,
            }}
          >
            Search across 260 verified HCP profiles using plain language. No filters, no boolean logic.
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 24,
              textAlign: "left",
            }}
          >
            {[
              "Find by specialty, institution, or region",
              "Filter by publication venue or trial phase",
              "Surface DOLs by social engagement pattern",
            ].map((line) => (
              <div key={line} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor: "#E8A020",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, color: "#9B9892" }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {state === "loading" && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 16px 8px",
            }}
          >
            <span style={{ fontSize: 13, color: "#6B6A65" }}>Searching...</span>
            <PulsingDots />
          </div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Results state */}
      {state === "results" && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 16px 8px",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: "#E8E6DF" }}>Results</span>
            <span style={{ fontSize: 12, color: "#6B6A65", fontFamily: "monospace" }}>3 matches</span>
          </div>

          <div className="fm-search-results-grid">
          {SEARCH_RESULTS.map((hcp) => (
            <HCPCard
              key={hcp.id}
              hcp={hcp}
              onCardPress={onCardPress}
              onAddPress={(h) => {
                setActiveHCP(h);
                setTrayOpen(true);
              }}
            />
          ))}
          </div>

          {/* Teal note */}
          <div
            style={{
              margin: "8px 16px 24px",
              backgroundColor: "#0A1F16",
              border: "1px solid #1D9E75",
              borderRadius: 4,
              padding: 12,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                backgroundColor: "#1D9E75",
                flexShrink: 0,
                marginTop: 5,
              }}
            />
            <span style={{ fontSize: 12, color: "#1D9E75", lineHeight: 1.5 }}>
              Ranked by composite rising star score, not keyword match. Results update as new publications and trial data are indexed.
            </span>
          </div>
        </div>
      )}

      <ActionTray
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        hcpName={activeHCP?.name ?? ""}
      />
    </div>
  );
}
