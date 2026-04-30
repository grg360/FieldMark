import React, { useRef, useState } from "react";
import { HCP } from "../data/hcpData";
import { StatPillWithTooltip } from "./StatPillWithTooltip";
import ScoreModal from "./ScoreModal";

function isDarkHorse(hcp: HCP): boolean {
  if (hcp.score < 85) return false;
  const citNum = parseFloat(hcp.citTraj.replace("%", "").replace("+", ""));
  if (isNaN(citNum) || citNum < 40) return false;
  const trialsNum = parseInt(hcp.trials, 10);
  if (isNaN(trialsNum) || trialsNum < 2) return false;
  return true;
}

interface DetailScreenProps {
  hcp: HCP;
  onBack: () => void;
  onAddNote: () => void;
  onYearPress: (year: number) => void;
}

const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
    <circle cx="12" cy="3" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <circle cx="12" cy="13" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <circle cx="4" cy="8" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <line x1="5.3" y1="7.2" x2="10.7" y2="4.3" stroke="#6B6A65" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="5.3" y1="8.8" x2="10.7" y2="11.7" stroke="#6B6A65" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const MetricPill = ({ label, value }: { label: string; value: string | number }) => (
  <div
    style={{
      backgroundColor: "#0D0D10",
      border: "1px solid #1E1E22",
      borderRadius: 4,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    <span style={{ fontSize: 12, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {label}
    </span>
    <span style={{ fontSize: 14, color: "#E8E6DF", fontFamily: "monospace", fontWeight: 500 }}>{value}</span>
  </div>
);

function ScoreRow({ label, value, percent, activeTooltip, onTooltipChange }: {
  label: string;
  value: number;
  percent: number;
  activeTooltip: string | null;
  onTooltipChange: (k: string | null) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <StatPillWithTooltip
          label={label}
          tooltipKey={label}
          activeTooltip={activeTooltip}
          onTooltipChange={onTooltipChange}
        >
          <span style={{ fontSize: 13, color: "#E8E6DF", cursor: "pointer" }}>{label}</span>
        </StatPillWithTooltip>
        <span style={{ fontSize: 13, color: "#E8A020", fontFamily: "monospace" }}>{value}</span>
      </div>
      <div style={{ height: 3, backgroundColor: "#1E1E22", borderRadius: 0, overflow: "hidden" }}>
        <div style={{ height: "100%", backgroundColor: "#E8A020", width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function DetailScreen({ hcp, onBack, onAddNote, onYearPress }: DetailScreenProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const narrative = hcp.narrative || "Narrative generating — check back soon.";

  const pubTimeline = [
    { year: 2020, value: 2 },
    { year: 2021, value: 3 },
    { year: 2022, value: 4 },
    { year: 2023, value: 7 },
    { year: 2024, value: 11 },
  ];
  const maxValue = Math.max(...pubTimeline.map((p) => p.value));
  const [tooltip, setTooltip] = React.useState<number | null>(null);
  const mobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [validation, setValidation] = React.useState({
    dataMatch: null as string | null,
    engagement: null as string | null,
    credibility: null as string | null,
    momentum: null as string | null,
  });

  const allValidated =
    validation.dataMatch && validation.engagement && validation.credibility && validation.momentum;

  return (
    <div className="fm-screen" style={{ backgroundColor: "#0A0A0B", minHeight: "100dvh", maxWidth: 480, margin: "0 auto" }}>
      <style>{`@keyframes fm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {/* Nav bar */}
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
          <span style={{ fontSize: 15, color: "#6B6A65" }}>Rising stars</span>
        </button>
        <button style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <ShareIcon />
        </button>
      </div>

      <div className="fm-detail-body" style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* LEFT COLUMN: Header + main content */}
        <div className="fm-detail-left">
        {/* Header section */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div className="fm-detail-heading" style={{ fontSize: 18, fontWeight: 500, color: "#E8E6DF", marginBottom: 4 }}>{hcp.name}</div>
          <div className="fm-detail-subheading" style={{ fontSize: 14, color: "#6B6A65", marginBottom: 12 }}>
            {hcp.institution}
          </div>
          {/* Metric pills: hidden on tablet (shown in right column instead) */}
          <div className="fm-detail-metric-pills-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setScoreModalOpen(true); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); setScoreModalOpen(true); }}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "block", width: "100%" }}
            >
              <MetricPill label="Rising star score" value={hcp.score.toFixed(1)} />
            </button>
            <MetricPill label="Career age" value="4.2 yrs" />
            <MetricPill label="Pub velocity" value={hcp.pubVel} />
            <MetricPill label="Citation trajectory" value={hcp.citTraj} />
          </div>
        </div>

        {/* Dark Horse callout */}
        {isDarkHorse(hcp) && (
          <div style={{ padding: "12px 16px 0" }}>
            <div
              style={{
                backgroundColor: "#0D0A1A",
                border: "1px solid #9B6DFF",
                borderLeft: "3px solid #9B6DFF",
                borderRadius: 4,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#9B6DFF" }}>♞</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#9B6DFF", fontFamily: "system-ui, sans-serif" }}>Dark Horse</span>
                <span style={{ fontSize: 11, color: "#6B6A65" }}>· top 8% of rising stars</span>
              </div>
              <div style={{ fontSize: 12, color: "#9B9892", lineHeight: 1.5, marginTop: 8 }}>
                Dr. {hcp.name.split(" ").slice(1).join(" ")} meets all four Dark Horse criteria — composite score 85+, citation trajectory +40%, 2+ active trials, and career age under 8 years. Fewer than 1 in 12 rising stars qualify.
              </div>
            </div>
          </div>
        )}

        {/* Why rising star section */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div style={{ fontSize: 15, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Why rising star
          </div>
          <div
            style={{
              borderLeft: "3px solid #E8A020",
              paddingLeft: 12,
              fontSize: 14,
              color: "#B8B4AC",
              lineHeight: 1.6,
            }}
          >
            {narrative}
          </div>
        </div>

        {/* Score breakdown */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div style={{ fontSize: 15, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Score breakdown
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <ScoreRow label="Publication velocity" value={94} percent={94} activeTooltip={activeTooltip} onTooltipChange={setActiveTooltip} />
            <ScoreRow label="Citation trajectory" value={88} percent={88} activeTooltip={activeTooltip} onTooltipChange={setActiveTooltip} />
            <ScoreRow label="Trial activity" value={81} percent={81} activeTooltip={activeTooltip} onTooltipChange={setActiveTooltip} />
            <ScoreRow label="Career age multiplier" value={76} percent={76} activeTooltip={activeTooltip} onTooltipChange={setActiveTooltip} />
          </div>
        </div>

        {/* Publication timeline */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div style={{ fontSize: 15, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Publication timeline
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, justifyContent: "center" }}>
            {pubTimeline.map((p) => {
              const isActive = tooltip === p.year;
              const barHeight = (p.value / maxValue) * 80;
              return (
                <div
                  key={p.year}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", cursor: "pointer" }}
                  onClick={() => onYearPress(p.year)}
                  onMouseEnter={() => setTooltip(p.year)}
                  onMouseLeave={() => setTooltip(null)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    if (mobileTimerRef.current) clearTimeout(mobileTimerRef.current);
                    setTooltip(p.year);
                    mobileTimerRef.current = setTimeout(() => setTooltip(null), 2000);
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: `${barHeight + 8 + 16}px`,
                        left: "50%",
                        transform: "translateX(-50%)",
                        backgroundColor: "#1E1E22",
                        border: "1px solid #E8A020",
                        borderRadius: 3,
                        padding: "4px 8px",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        zIndex: 10,
                      }}
                    >
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6A65" }}>
                        {p.year}
                      </div>
                      <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 500, color: "#E8A020" }}>
                        {p.value} papers
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      width: "100%",
                      backgroundColor: "#E8A020",
                      height: `${barHeight}px`,
                      marginBottom: 8,
                    }}
                  />
                  <span style={{ fontSize: 10, color: "#6B6A65", fontFamily: "monospace" }}>{p.year}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Field validation */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div style={{ fontSize: 15, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Validate this signal
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#6B6A65", marginBottom: 8 }}>Community confidence</div>
            <div style={{ height: 6, backgroundColor: "#1E1E22", borderRadius: 0, marginBottom: 8 }}>
              <div style={{ height: "100%", backgroundColor: "#1D9E75", width: "73%" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#1D9E75", fontFamily: "monospace" }}>73%</span>
              <span style={{ fontSize: 11, color: "#6B6A65" }}>41 MSLs</span>
            </div>
          </div>

          {/* Validation buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            <ValidationField
              label="Data matches field reality"
              options={["Confirms", "Partial", "Disputes"]}
              selected={validation.dataMatch}
              onSelect={(val) => setValidation({ ...validation, dataMatch: val })}
            />
            <ValidationField
              label="Engagement potential"
              options={["High", "Moderate", "Low"]}
              selected={validation.engagement}
              onSelect={(val) => setValidation({ ...validation, engagement: val })}
            />
            <ValidationField
              label="Scientific credibility"
              options={["Strong", "Moderate", "Early"]}
              selected={validation.credibility}
              onSelect={(val) => setValidation({ ...validation, credibility: val })}
            />
            <ValidationField
              label="Momentum trajectory"
              options={["Accelerating", "Steady", "Plateauing"]}
              selected={validation.momentum}
              onSelect={(val) => setValidation({ ...validation, momentum: val })}
            />
          </div>

          <button
            onClick={() => {}}
            disabled={!allValidated}
            style={{
              width: "100%",
              height: 44,
              marginTop: 16,
              backgroundColor: "#0A1F16",
              border: "1px solid #1D9E75",
              color: "#1D9E75",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 4,
              cursor: allValidated ? "pointer" : "not-allowed",
              opacity: allValidated ? 1 : 0.4,
            }}
          >
            Submit validation
          </button>

          <div style={{ fontSize: 11, color: "#3A3A3F", textAlign: "center", marginTop: 8 }}>
            Your identity is never shared. Contributor UUID only.
          </div>
        </div>
        </div>{/* end fm-detail-left */}

        {/* RIGHT COLUMN: Metric pills + Field notes */}
        <div className="fm-detail-right">
          {/* Metric pills: visible on tablet only */}
          <div className="fm-detail-metric-pills-tablet" style={{ display: "none", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setScoreModalOpen(true); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); setScoreModalOpen(true); }}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "block", width: "100%" }}
            >
              <MetricPill label="Rising star score" value={hcp.score.toFixed(1)} />
            </button>
            <MetricPill label="Career age" value="4.2 yrs" />
            <MetricPill label="Pub velocity" value={hcp.pubVel} />
            <MetricPill label="Citation trajectory" value={hcp.citTraj} />
          </div>

        {/* Field notes */}
        <div style={{ padding: "16px 0 24px" }}>
          <div style={{ fontSize: 15, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Field notes
          </div>

          <div
            style={{
              backgroundColor: "#0D0D10",
              border: "1px solid #1E1E22",
              borderRadius: 4,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11, color: "#6B6A65" }}>
              <span>MSL · Rare Disease · Northeast</span>
              <span style={{ color: "#3A3A3F" }}>Mar 2025</span>
            </div>
            <div style={{ fontSize: 12, color: "#9B9892", lineHeight: 1.5 }}>
              Interaction type: Conference presentation. Evidence: Strong signal. Presented unprompted to 40+ attendees at NORD 2025,
              fielded questions from 3 senior KOLs.
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#0D0D10",
              border: "1px solid #1E1E22",
              borderRadius: 4,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11, color: "#6B6A65" }}>
              <span>MSL · Rare Disease · Northeast</span>
              <span style={{ color: "#3A3A3F" }}>Feb 2025</span>
            </div>
            <div style={{ fontSize: 12, color: "#9B9892", lineHeight: 1.5 }}>
              Interaction type: Peer nomination. Evidence: Strong signal. Named specifically by Dr. Chen at MGH as 'the person to watch in lysosomal storage' — unsolicited.
            </div>
          </div>

          <button
            onClick={onAddNote}
            style={{
              width: "100%",
              height: 40,
              backgroundColor: "transparent",
              border: "1px solid #1E1E22",
              color: "#6B6A65",
              fontSize: 13,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            + Add note
          </button>
        </div>
        </div>{/* end fm-detail-right */}
      </div>{/* end fm-detail-body */}

      {scoreModalOpen && (
        <ScoreModal
          hcpName={hcp.name}
          ta={hcp.specialty}
          score={hcp.score}
          onClose={() => setScoreModalOpen(false)}
        />
      )}
    </div>
  );
}

function ValidationField({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (val: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#9B9892", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((opt) => {
          const isSelected = selected === opt;
          let bgColor = "#0D0D10";
          let borderColor = "#1E1E22";
          let textColor = "#6B6A65";

          if (isSelected) {
            if (opt === "Confirms" || opt === "High" || opt === "Strong" || opt === "Accelerating") {
              bgColor = "#0A1F16";
              borderColor = "#1D9E75";
              textColor = "#1D9E75";
            } else if (opt === "Partial" || opt === "Moderate" || opt === "Steady") {
              bgColor = "#1A1200";
              borderColor = "#E8A020";
              textColor = "#E8A020";
            } else {
              bgColor = "#1A0A0A";
              borderColor = "#7B2020";
              textColor = "#E05555";
            }
          }

          return (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              style={{
                flex: 1,
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                color: textColor,
                fontSize: 12,
                padding: "8px 0",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
