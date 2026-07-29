// "What is landing now" — Design frames 1a / 1b.
//
// Papers ranked by citation accrual over the last full year, NOT lifetime total.
// Each carries a one-word trajectory verdict from the citation series: "still
// climbing" in amber, "plateaued" / "accrual falling" in neutral. Under twelve
// months of history the sparkline is suppressed and replaced with "no trajectory"
// and the reason — never a two-bar line inviting a reading it cannot support.

import { useState } from "react";
import { COLOR, FONT } from "../../lib/designTokens";
import {
  trajectory,
  designBadge,
  oaLink,
  verdictColor,
  VERDICT_LABEL,
} from "../../lib/assetLogic";
import type { LandingPayload, LandingPaper } from "../../lib/assetPage";

const eyebrow = {
  fontFamily: FONT.mono,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: COLOR.ink3,
};
const metaMono = { fontFamily: FONT.mono, fontSize: 10, color: COLOR.ink4 } as const;

function CitationSpark({ paper }: { paper: LandingPaper }) {
  const traj = trajectory(paper.citation_counts_by_year, paper.pub_year);
  if (traj.verdict === "none") {
    return (
      <div style={{ flex: "none", width: 96, display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-end", gap: 7 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 9, lineHeight: 1.4, letterSpacing: "0.04em", color: COLOR.ink5, textAlign: "right" }}>
          NO TRAJECTORY
          <br />
          {(traj.reason ?? "").toUpperCase()}
        </span>
      </div>
    );
  }
  const max = Math.max(1, ...traj.spark);
  const color = verdictColor(traj.verdict);
  return (
    <div style={{ flex: "none", width: 96, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 26 }}>
        {traj.spark.map((v, i) => {
          const last = i === traj.spark.length - 1;
          return (
            <div
              key={i}
              style={{
                width: 5,
                minHeight: 2,
                height: Math.max(2, Math.round((v / max) * 26)),
                background: last ? color : COLOR.indigo,
                opacity: last ? 1 : 0.55,
              }}
            />
          );
        })}
      </div>
      <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: "0.06em", color }}>
        {VERDICT_LABEL[traj.verdict]}
      </span>
    </div>
  );
}

function PaperCard({ paper }: { paper: LandingPaper }) {
  const badge = designBadge(paper.publication_types);
  const oa = oaLink(paper.open_access, paper.doi);
  return (
    <div style={{ background: COLOR.surfaceCard, border: `1px solid ${COLOR.hairStrong}`, padding: "16px 18px" }}>
      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.5, color: COLOR.ink4, width: 34, flex: "none" }}>
          {paper.pub_year}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 500, lineHeight: 1.45, color: COLOR.ink1 }}>
            {paper.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap", ...metaMono }}>
            {badge ? (
              <span style={{ padding: "4px 6px", border: `1px solid ${COLOR.hairStrong}` }}>{badge}</span>
            ) : null}
            {paper.short_name ? (
              <span style={{ padding: "4px 6px", border: `1px solid ${COLOR.indigo}`, color: COLOR.indigoLink }}>
                {paper.short_name.toUpperCase()}
              </span>
            ) : null}
            {paper.journal ? <span>{paper.journal}</span> : null}
            {paper.citation_count != null ? (
              <span style={{ color: COLOR.ink2 }}>{paper.citation_count.toLocaleString()} citations</span>
            ) : null}
            {oa.url ? (
              <a href={oa.url} target="_blank" rel="noreferrer noopener" style={{ color: COLOR.indigoLink }}>
                {oa.label}
              </a>
            ) : (
              <span style={{ color: COLOR.ink5 }}>{oa.label}</span>
            )}
          </div>
        </div>
        <CitationSpark paper={paper} />
      </div>
    </div>
  );
}

function CompactCard({ paper }: { paper: LandingPaper }) {
  const traj = trajectory(paper.citation_counts_by_year, paper.pub_year);
  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${COLOR.hair}` }}>
      <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: COLOR.ink1 }}>
        {paper.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap", ...metaMono }}>
        <span>
          {paper.pub_year}
          {paper.journal ? ` · ${paper.journal.toUpperCase()}` : ""}
        </span>
        {paper.citation_count != null ? (
          <span style={{ color: COLOR.ink2 }}>{paper.citation_count.toLocaleString()} CIT</span>
        ) : null}
        <span style={{ color: verdictColor(traj.verdict) }}>
          {traj.verdict === "none" ? "NO TRAJECTORY" : VERDICT_LABEL[traj.verdict]}
        </span>
      </div>
    </div>
  );
}

function MobileLanding({ landing }: { landing: LandingPayload }) {
  const [expanded, setExpanded] = useState(false);
  const papers = landing.papers;
  const shown = expanded ? papers : papers.slice(0, 2);
  const rest = papers.length - shown.length;
  return (
    <div>
      <div style={{ ...eyebrow, marginBottom: 6 }}>What is landing now</div>
      <div style={{ fontFamily: FONT.serif, fontSize: 13, fontStyle: "italic", lineHeight: 1.5, color: COLOR.ink3, marginBottom: 14 }}>
        By 12-month accrual, not lifetime total.
      </div>
      {papers.length === 0 ? (
        <div style={{ fontFamily: FONT.serif, fontSize: 13, lineHeight: 1.55, color: COLOR.ink3 }}>
          No paper yet carries a readable citation trajectory.
        </div>
      ) : (
        <>
          {shown.map((p) => (
            <CompactCard key={p.id} paper={p} />
          ))}
          {rest > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{ marginTop: 14, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT.mono, fontSize: 11, color: COLOR.indigoLink }}
            >
              {rest} more →
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function LandingNow({
  landing,
  bibliographyHref,
  mobile = false,
}: {
  landing: LandingPayload;
  bibliographyHref?: string;
  mobile?: boolean;
}) {
  if (mobile) return <MobileLanding landing={landing} />;
  const papers = landing.papers;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={eyebrow}>What is landing now</span>
        <span style={metaMono}>
          {papers.length} of {landing.total_pubs.toLocaleString()}
        </span>
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 14, fontStyle: "italic", lineHeight: 1.5, color: COLOR.ink3, marginBottom: 20 }}>
        Ranked by citation accrual over the last twelve months, not lifetime total.
      </div>

      {papers.length === 0 ? (
        <div style={{ fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.55, color: COLOR.ink3 }}>
          No paper yet carries a readable citation trajectory — every record here is under two years
          old. {landing.no_trajectory_count} papers are waiting on a first full year of citations.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {papers.map((p) => (
            <PaperCard key={p.id} paper={p} />
          ))}
        </div>
      )}

      {landing.no_trajectory_count > 0 && papers.length > 0 ? (
        <div style={{ ...metaMono, marginTop: 12, lineHeight: 1.6 }}>
          {landing.no_trajectory_count.toLocaleString()} further papers are under twelve months old
          and carry no trajectory yet.
        </div>
      ) : null}

      {bibliographyHref ? (
        <div style={{ marginTop: 14, fontFamily: FONT.mono, fontSize: 11 }}>
          <a href={bibliographyHref} style={{ color: COLOR.indigoLink }}>
            All {landing.total_pubs.toLocaleString()} publications in Bibliography →
          </a>
        </div>
      ) : null}
    </div>
  );
}
