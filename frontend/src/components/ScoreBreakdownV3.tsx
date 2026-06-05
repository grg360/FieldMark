import React, { useState } from "react";
import type { EstablishedScoreBreakdown } from "../lib/api";

interface ScoreBreakdownV3Props {
  data: EstablishedScoreBreakdown | null;
  loading?: boolean;
}

const formatCompactDollar = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};

const formatInt = (n: number): string => new Intl.NumberFormat("en-US").format(n);

function networkTier(percentile: number): string {
  if (percentile >= 99) return "Top 1% of NSCLC collaboration network";
  if (percentile >= 95) return "Top 5% of NSCLC collaboration network";
  if (percentile >= 90) return "Top 10% of NSCLC collaboration network";
  if (percentile >= 75) return "Top 25% of NSCLC collaboration network";
  return "Active in NSCLC collaboration network";
}

export default function ScoreBreakdownV3({ data, loading }: ScoreBreakdownV3Props) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div style={{ padding: 16, color: "#6B6A65", fontSize: 12 }}>
        Loading score breakdown...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 16, color: "#6B6A65", fontSize: 12 }}>
        Score breakdown not available.
      </div>
    );
  }

  const cohortScoreDisplay = Math.round(Number(data.cohort_score));
  const sci = data.scientific;
  const net = data.network;
  const ind = data.industry;

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    color: "#6B6A65",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
    fontWeight: 500,
  };

  const scoreRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "4px 0",
  };

  const scoreLabelStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#E8E6DF",
  };

  const scoreValueStyle: React.CSSProperties = {
    fontSize: 15,
    color: "#E8A020",
    fontWeight: 600,
    fontFeatureSettings: '"tnum"',
  };

  const evidenceItemStyle: React.CSSProperties = {
    fontSize: 11,
    color: "#9B9892",
    paddingLeft: 12,
    lineHeight: 1.6,
  };

  const subSectionDividerStyle: React.CSSProperties = {
    height: 1,
    backgroundColor: "#1E1E22",
    margin: "12px 0",
  };

  return (
    <div style={{ padding: 0, borderBottom: "1px solid #1E1E22" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={sectionHeaderStyle}>Cohort Score</div>
        <div
          style={{
            fontSize: 32,
            color: "#E8A020",
            fontWeight: 700,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {cohortScoreDisplay}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={sectionHeaderStyle}>Why They Matter</div>

        <div style={scoreRowStyle}>
          <span style={scoreLabelStyle}>Scientific Influence</span>
          <span style={scoreValueStyle}>{sci ? Math.round(sci.percentile) : "—"}</span>
        </div>
        {expanded && sci && (
          <div style={{ ...evidenceItemStyle, marginTop: 4, marginBottom: 8 }}>
            {sci.senior_pub_count > 0 && (
              <div>{formatInt(sci.senior_pub_count)} senior-author papers</div>
            )}
            {sci.senior_pub_total_citations > 0 && (
              <div>{formatInt(sci.senior_pub_total_citations)} citations</div>
            )}
            {sci.guideline_pub_count > 0 && (
              <div>{formatInt(sci.guideline_pub_count)} guideline papers</div>
            )}
            {sci.senior_pub_recent_5yr > 0 && (
              <div>{formatInt(sci.senior_pub_recent_5yr)} recent (5yr)</div>
            )}
          </div>
        )}

        <div style={scoreRowStyle}>
          <span style={scoreLabelStyle}>Network Influence</span>
          <span style={scoreValueStyle}>{net ? Math.round(net.score) : "—"}</span>
        </div>
        {expanded && net && (
          <div style={{ ...evidenceItemStyle, marginTop: 4 }}>
            <div>{networkTier(net.score)}</div>
            <div>{formatInt(net.collaborator_count)} collaborators</div>
            {data.top_collaborators.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 11, color: "#6B6A65", marginBottom: 2 }}>
                  Top collaborators:
                </div>
                {data.top_collaborators.map((c) => (
                  <div
                    key={c.hcp_id}
                    style={{ fontSize: 11, color: "#9B9892", lineHeight: 1.5 }}
                  >
                    {c.name}
                    {c.institution && (
                      <span style={{ color: "#6B6A65" }}>
                        {" "}
                        ·{" "}
                        {c.institution.length > 32
                          ? `${c.institution.substring(0, 32)}…`
                          : c.institution}
                      </span>
                    )}
                    <span style={{ color: "#6B6A65" }}> · {c.shared_publications} pubs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={subSectionDividerStyle} />

      <div style={{ marginBottom: 12 }}>
        <div style={sectionHeaderStyle}>Industry Engagement</div>
        <div style={scoreRowStyle}>
          <span style={scoreLabelStyle}>
            {ind ? "Pharma Engagement" : "Limited Public Data"}
          </span>
          <span style={scoreValueStyle}>{ind ? Math.round(ind.percentile) : "—"}</span>
        </div>
        {expanded && ind && (
          <div style={{ ...evidenceItemStyle, marginTop: 4 }}>
            <div>{formatCompactDollar(ind.total_payments_3yr)} payments (3yr)</div>
            <div>{formatInt(ind.distinct_companies_3yr)} companies</div>
            <div>{formatInt(ind.distinct_drugs_3yr)} drugs</div>
            <div>{formatInt(ind.payment_count_3yr)} transactions</div>
          </div>
        )}
        {expanded && !ind && (
          <div style={{ ...evidenceItemStyle, marginTop: 4, fontStyle: "italic" }}>
            Industry engagement data not available in Open Payments for this investigator.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: "none",
          border: "none",
          color: "#6B6A65",
          fontSize: 11,
          cursor: "pointer",
          padding: "4px 0",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 500,
        }}
      >
        {expanded ? "▴ Hide evidence" : "▾ Show evidence"}
      </button>
    </div>
  );
}
