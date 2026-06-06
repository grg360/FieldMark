import React, { useState } from "react";
import type { EstablishedScoreBreakdown } from "../lib/api";
import InfoTooltip from "./InfoTooltip";
import MiniCollaboratorNetwork from "./MiniCollaboratorNetwork";

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

const formatCompactNumber = (n: number): string => {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return new Intl.NumberFormat("en-US").format(n);
};

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
    fontSize: 15,
    color: "#E8E6DF",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 12,
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

  const scoreBarTrackStyle: React.CSSProperties = {
    height: 4,
    backgroundColor: "#1E1E22",
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 8,
    overflow: "hidden",
  };

  const tileContainerStyle: React.CSSProperties = {
    backgroundColor: "#0D0D10",
    border: "1px solid #1E1E22",
    borderRadius: 4,
    padding: "8px 6px",
    textAlign: "center",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  };

  const renderScoreBar = (hasData: boolean, value: number | null | undefined) => (
    <div style={scoreBarTrackStyle}>
      {hasData && value != null && (
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, value))}%`,
            backgroundColor: "#5C5FE8",
            borderRadius: 2,
          }}
        />
      )}
    </div>
  );

  return (
    <div style={{ padding: 0, borderBottom: "1px solid #1E1E22" }}>
      <div style={{ marginBottom: 16 }}>
        <InfoTooltip content="Composite ranking of Scientific Influence (60%) and Network Influence (40%), normalized within US Established cohort. Pharma Engagement is informational and does not drive ranking.">
          <div style={sectionHeaderStyle}>Cohort Score</div>
        </InfoTooltip>
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
          <InfoTooltip content="Publication leadership percentile. Based on senior-author papers, citation impact, guideline authorship, and recent activity.">
            <span style={scoreLabelStyle}>Scientific Influence</span>
          </InfoTooltip>
          <span style={scoreValueStyle}>{sci ? Math.round(sci.percentile) : "—"}</span>
        </div>
        {renderScoreBar(Boolean(sci), sci?.percentile)}
        {expanded && sci && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              marginTop: 6,
              marginBottom: 8,
            }}
          >
            {[
              {
                value: sci.senior_pub_count,
                label: "Sr. Papers",
                tooltip: "Number of papers published as senior author (last author) in NSCLC.",
              },
              {
                value: sci.senior_pub_total_citations,
                label: "Citations",
                tooltip: "Total citations across all senior-author NSCLC papers.",
              },
              {
                value: sci.senior_pub_recent_5yr,
                label: "Recent (5y)",
                tooltip: "Senior-author NSCLC papers published in the last 5 years.",
              },
              {
                value: sci.guideline_pub_count,
                label: "Guidelines",
                tooltip:
                  "Number of clinical practice guideline, consensus statement, or expert panel publications in NSCLC.",
              },
            ].map((tile, idx) => (
              <InfoTooltip
                key={idx}
                content={tile.tooltip}
                style={{ display: "block", width: "100%" }}
              >
                <div style={tileContainerStyle}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#E8E6DF",
                      lineHeight: 1.2,
                      fontFeatureSettings: '"tnum"',
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {formatCompactNumber(tile.value)}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#6B6A65",
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                      marginTop: 2,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tile.label}
                  </div>
                </div>
              </InfoTooltip>
            ))}
          </div>
        )}

        <div style={scoreRowStyle}>
          <InfoTooltip content="Collaboration network centrality percentile. Combines degree, eigenvector, and betweenness centrality from 10-year NSCLC co-authorship graph.">
            <span style={scoreLabelStyle}>Network Influence</span>
          </InfoTooltip>
          <span style={scoreValueStyle}>{net ? Math.round(net.score) : "—"}</span>
        </div>
        {renderScoreBar(Boolean(net), net?.score)}
        {expanded && net && (
          <div style={{ ...evidenceItemStyle, marginTop: 4 }}>
            <div>{formatInt(net.collaborator_count)} total collaborators</div>
            {data.top_collaborators.length > 0 && (
              <MiniCollaboratorNetwork hcpName="" collaborators={data.top_collaborators} />
            )}
          </div>
        )}

        <div style={scoreRowStyle}>
          <InfoTooltip content="Industry engagement breadth percentile. Based on Open Payments: total payments, distinct companies, distinct drugs, and contract count. Informational only — does not drive ranking.">
            <span style={scoreLabelStyle}>
              {ind ? "Pharma Engagement" : "Limited Public Data"}
            </span>
          </InfoTooltip>
          <span style={scoreValueStyle}>{ind ? Math.round(ind.percentile) : "—"}</span>
        </div>
        {renderScoreBar(Boolean(ind), ind?.percentile)}
        {expanded && ind && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              marginTop: 6,
              marginBottom: 8,
            }}
          >
            {[
              {
                value: formatCompactDollar(ind.total_payments_3yr),
                label: "Payments",
                tooltip:
                  "Total Open Payments received from pharmaceutical companies in NSCLC over the last 3 years.",
              },
              {
                value: formatCompactNumber(ind.distinct_companies_3yr),
                label: "Companies",
                tooltip:
                  "Number of distinct pharmaceutical companies with payment relationships in the last 3 years.",
              },
              {
                value: formatCompactNumber(ind.distinct_drugs_3yr),
                label: "Drugs",
                tooltip:
                  "Number of distinct drugs covered by payment relationships in the last 3 years.",
              },
              {
                value: formatCompactNumber(ind.payment_count_3yr),
                label: "Contracts",
                tooltip: "Total count of distinct payment contracts in the last 3 years.",
              },
            ].map((tile, idx) => (
              <InfoTooltip
                key={idx}
                content={tile.tooltip}
                style={{ display: "block", width: "100%" }}
              >
                <div style={tileContainerStyle}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#E8E6DF",
                      lineHeight: 1.2,
                      fontFeatureSettings: '"tnum"',
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {tile.value}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#6B6A65",
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                      marginTop: 2,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tile.label}
                  </div>
                </div>
              </InfoTooltip>
            ))}
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
