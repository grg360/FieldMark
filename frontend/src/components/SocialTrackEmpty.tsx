import { useState } from "react";
import SocialAnalyticsBanner from "./SocialAnalyticsBanner";
import SocialCard from "./SocialCard";
import SuggestHashtagModal from "./SuggestHashtagModal";
import { getMockSocialCandidates } from "../data/socialMockData";
import RisingVoicesChart from "./RisingVoicesChart";

// Inject pulse animation once for the live banner
if (typeof document !== "undefined" && !document.getElementById("fm-pulse-styles")) {
  const style = document.createElement("style");
  style.id = "fm-pulse-styles";
  style.textContent = `
    @keyframes fm-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(style);
}

interface SocialTrackEmptyProps {
  selectedTA: string;
}

export default function SocialTrackEmpty({ selectedTA }: SocialTrackEmptyProps) {
  const [hashtagModalOpen, setHashtagModalOpen] = useState(false);
  const candidates = getMockSocialCandidates(selectedTA);
  const humanTAName = selectedTA;

  let emptyStateSubline: string;
  if (selectedTA === "Hepatology") {
    emptyStateSubline =
      "Captures during EASL 2026 will populate this view with active voices in hepatology conversations. Other therapeutic area coverage builds out from here.";
  } else if (selectedTA === "Rare Disease") {
    emptyStateSubline =
      "Captures from rare disease community hashtags will populate this view as the pipeline starts running. Coverage builds out over time.";
  } else {
    emptyStateSubline =
      "Captures during ASCO 2026 will populate this view with active voices in oncology conversations. Other therapeutic area coverage builds out from here.";
  }

  return (
    <div style={{ width: "100%" }}>
      {/* ASCO Live banner — only shows for Oncology while ASCO is active */}
      {selectedTA === "Oncology" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: "#2A1F0A",
            border: "1px solid #E8A020",
            borderRadius: 4,
            padding: "8px 14px",
            margin: "0 16px 12px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#E8A020",
              flexShrink: 0,
              animation: "fm-pulse 2s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#E8A020",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            ASCO 2026 · Live
          </span>
          <span
            style={{
              fontSize: 11,
              color: "#B8B4AC",
              marginLeft: 4,
            }}
          >
            Conference coverage active through June 2
          </span>
        </div>
      )}

      {/* Disclosure card */}
      <div
        style={{
          backgroundColor: "#111113",
          border: "1px solid #2A3848",
          borderLeft: "3px solid #6BA3D8",
          borderRadius: 4,
          padding: "10px 14px",
          margin: "0 16px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "#6BA3D8",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Social signal · preview
          </span>
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#B8B4AC", margin: "0 0 6px", fontFamily: "system-ui, sans-serif" }}>
          Identifying digital opinion leaders is hard. There&apos;s no authoritative list — and traditional KOL databases mostly don&apos;t try.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#B8B4AC", margin: "0 0 6px", fontFamily: "system-ui, sans-serif" }}>
          This view captures voices active in {humanTAName} conversations on Twitter/X and Bluesky. Some entries are credentialed clinicians whose identity we&apos;ve verified through publications, trials, or NPPES. Others are accounts we&apos;ve captured but haven&apos;t matched to credentialed identity yet — they may be HCPs, fellows, researchers, or other participants in the public dialogue.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#B8B4AC", margin: "0 0 6px", fontFamily: "system-ui, sans-serif" }}>
          Each card shows our algorithmic confidence assessment based on bio analysis. MSL community verification is coming in v1.1 — when LinkedIn-verified MSL identity launches, MSLs will be able to tag HCPs they recognize as verified clinicians.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#E8E6DF", fontWeight: 500, margin: 0, fontFamily: "system-ui, sans-serif" }}>
          We&apos;re showing you our work, including the parts that aren&apos;t finished. That&apos;s the deal.
        </p>
      </div>

      <RisingVoicesChart selectedTA={selectedTA} />

      {/* Suggest a hashtag CTA */}
      <div style={{ margin: "0 16px 12px", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setHashtagModalOpen(true)}
          style={{
            backgroundColor: "#0D0D10",
            border: "1px solid #2A3848",
            color: "#6BA3D8",
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          + Suggest a hashtag
        </button>
      </div>

      {candidates.length > 0 && (
        <SocialAnalyticsBanner selectedTA={selectedTA} />
      )}

      {/* Mock candidates or empty state */}
      {candidates.length > 0 ? (
        <div className="fm-card-grid" style={{ paddingBottom: 24 }}>
          {candidates.map((c) => (
            <SocialCard key={c.id} candidate={c} />
          ))}
        </div>
      ) : (
        <div style={{ margin: "32px 16px", textAlign: "center", color: "#6B6A65" }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: "#E8E6DF", fontFamily: "system-ui, sans-serif", marginBottom: 8 }}>
            No social signals yet for {humanTAName}
          </div>
          <div style={{ fontSize: 14, color: "#6B6A65", lineHeight: 1.6, maxWidth: 440, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
            {emptyStateSubline}
          </div>
        </div>
      )}

      <SuggestHashtagModal
        open={hashtagModalOpen}
        onClose={() => setHashtagModalOpen(false)}
      />
    </div>
  );
}
