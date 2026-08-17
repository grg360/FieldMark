// "What is landing now" — Design frames 1a / 1b.
//
// Papers ranked by citation accrual over the last full year, NOT lifetime total.
// Each carries a one-word trajectory verdict from the citation series: "still
// climbing" in amber, "plateaued" / "accrual falling" in neutral. Under twelve
// months of history the sparkline is suppressed and replaced with "no trajectory"
// and the reason — never a two-bar line inviting a reading it cannot support.

import { useState } from "react";
import { CANON, FACE } from "../../lib/canonicalTokens";
import { seqStep } from "../../lib/canonicalTokens";
import {
  trajectory,
  designBadge,
  oaLink,
  verdictColor,
  VERDICT_LABEL,
} from "../../lib/assetLogic";
import type { LandingPayload, LandingPaper } from "../../lib/assetPage";

const eyebrow = {
  fontFamily: FACE.data,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: CANON.INK.MUTE,
};
const metaMono = { fontFamily: FACE.data, fontSize: 11, color: CANON.INK.MUTE } as const;

function CitationSpark({ paper }: { paper: LandingPaper }) {
  const traj = trajectory(paper.citation_counts_by_year, paper.pub_year);
  if (traj.verdict === "none") {
    return (
      <div style={{ flex: "none", width: 96, display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-end", gap: 7 }}>
        <span style={{ fontFamily: FACE.data, fontSize: 9, lineHeight: 1.4, letterSpacing: "0.04em", color: CANON.INK.MUTE, textAlign: "right" }}>
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
                // VIZ 2026-08-13: magnitude rides the SEQ ramp (lightness =
                // magnitude), replacing one flat indigo dimmed by opacity. The
                // FINAL bar keeps the semantic verdict flag — the one place an
                // accent may enter a chart, as a state flag, never as a series
                // (rule 6).
                background: last ? color : seqStep(v / max),
              }}
            />
          );
        })}
      </div>
      <span style={{ fontFamily: FACE.data, fontSize: 9, letterSpacing: "0.06em", color }}>
        {VERDICT_LABEL[traj.verdict]}
      </span>
    </div>
  );
}

function PaperCard({ paper, themeColors }: { paper: LandingPaper; themeColors?: Map<string, string> }) {
  const badge = designBadge(paper.publication_types);
  const oa = oaLink(paper.open_access, paper.doi);
  return (
    <div style={{ background: CANON.GROUND.INSET, border: `1px solid ${CANON.LINE.HAIR}`, padding: "16px 18px" }}>
      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ fontFamily: FACE.data, fontSize: 11, lineHeight: 1.5, color: CANON.INK.MUTE, width: 34, flex: "none" }}>
          {paper.pub_year}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FACE.ui, fontSize: 15, fontWeight: 500, lineHeight: 1.45, color: CANON.INK.BODY }}>
            {paper.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap", ...metaMono }}>
            {badge ? (
              <span style={{ padding: "4px 6px", border: `1px solid ${CANON.LINE.HAIR}` }}>{badge}</span>
            ) : null}
            {paper.short_name ? (() => {
              // The theme chip names the SAME entity the composition bands do
              // (both key on theme_canonical_v1.short_name), so it takes that
              // theme's VIZ slot — chip and band are the same colour by
              // construction. A theme outside the charted bands has no slot on
              // this asset and stays neutral; the residual is never given to a
              // named category.
              const themeColor = themeColors?.get(paper.short_name);
              return (
                <span style={{ padding: "4px 6px", border: `1px solid ${themeColor ?? CANON.LINE.EDGE}`, color: themeColor ?? CANON.INK.LABEL }}>
                  {paper.short_name.toUpperCase()}
                </span>
              );
            })() : null}
            {paper.journal ? <span>{paper.journal}</span> : null}
            {paper.citation_count != null ? (
              <span style={{ color: CANON.INK.BODY }}>{paper.citation_count.toLocaleString()} citations</span>
            ) : null}
            {oa.url ? (
              <a href={oa.url} target="_blank" rel="noreferrer noopener" style={{ color: CANON.ACTION.LINK }}>
                {oa.label}
              </a>
            ) : (
              <span style={{ color: CANON.INK.MUTE }}>{oa.label}</span>
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
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
      <div style={{ fontFamily: FACE.ui, fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: CANON.INK.BODY }}>
        {paper.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap", ...metaMono }}>
        <span>
          {paper.pub_year}
          {paper.journal ? ` · ${paper.journal.toUpperCase()}` : ""}
        </span>
        {paper.citation_count != null ? (
          <span style={{ color: CANON.INK.BODY }}>{paper.citation_count.toLocaleString()} CIT</span>
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
      <div style={{ fontFamily: FACE.value, fontSize: 13, fontStyle: "italic", lineHeight: 1.5, color: CANON.INK.BODY, marginBottom: 14 }}>
        By 12-month accrual, not lifetime total.
      </div>
      {papers.length === 0 ? (
        <div style={{ fontFamily: FACE.value, fontSize: 13, lineHeight: 1.55, color: CANON.INK.BODY }}>
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
              style={{ marginTop: 14, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FACE.data, fontSize: 11, color: CANON.ACTION.LINK }}
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
  themeColors,
}: {
  landing: LandingPayload;
  bibliographyHref?: string;
  mobile?: boolean;
  /** theme short_name → its VIZ slot, from the composition already on screen. */
  themeColors?: Map<string, string>;
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
      <div style={{ fontFamily: FACE.value, fontSize: 15, fontStyle: "italic", lineHeight: 1.5, color: CANON.INK.BODY, marginBottom: 20 }}>
        Ranked by citation accrual over the last twelve months, not lifetime total.
      </div>

      {papers.length === 0 ? (
        <div style={{ fontFamily: FACE.value, fontSize: 15, lineHeight: 1.55, color: CANON.INK.BODY }}>
          No paper yet carries a readable citation trajectory — every record here is under two years
          old. {landing.no_trajectory_count} papers are waiting on a first full year of citations.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {papers.map((p) => (
            <PaperCard key={p.id} paper={p} themeColors={themeColors} />
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
        <div style={{ marginTop: 14, fontFamily: FACE.data, fontSize: 11 }}>
          <a href={bibliographyHref} style={{ color: CANON.ACTION.LINK }}>
            All {landing.total_pubs.toLocaleString()} publications in Bibliography →
          </a>
        </div>
      ) : null}
    </div>
  );
}
