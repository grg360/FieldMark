// Asset page right rail — Design frames 1a / 1b.
//
// Who publishes on the asset, congress presence, and forum threads. Each panel
// prints its own count and shows an honest empty state when the data is absent —
// a section is dropped only because the data is, never padded to look fuller.

import { Link } from "react-router-dom";
import { CANON, FACE } from "../../lib/canonicalTokens";
import { SEQ } from "../../lib/canonicalTokens";
import { authorInitialName, authorRankLabel } from "../../lib/assetLogic";
import { ASSETS_TA_SLUG } from "../../lib/assetConfig";
import { taLabelForSlug } from "../../lib/taLabels";
import type { AuthorsPayload, CongressPresenter, ForumThread } from "../../lib/assetPage";

const eyebrow = {
  fontFamily: FACE.data,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: CANON.INK.MUTE,
} as const;
const metaMono = { fontFamily: FACE.data, fontSize: 11, color: CANON.INK.MUTE, lineHeight: 1.6 } as const;
const emptyProse = { fontFamily: FACE.value, fontSize: 15, lineHeight: 1.55, color: CANON.INK.BODY } as const;

function prettyCongress(slug: string): string {
  return slug.replace(/-/g, " ").toUpperCase();
}

export function AuthorsPanel({ authors }: { authors: AuthorsPayload }) {
  const rows = authors.authors;
  const max = Math.max(1, ...rows.map((r) => r.c));
  return (
    <div style={{ padding: "26px 26px 24px", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
      <div style={{ ...eyebrow, marginBottom: 14 }}>Who publishes on this asset</div>
      {rows.length === 0 ? (
        <div style={emptyProse}>No authorship on this asset has resolved to the HCP graph yet.</div>
      ) : (
        <div>
          {rows.map((r) => (
            <div key={r.hcp_id} style={{ padding: "11px 0", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <Link
                  to={`/hcp/${r.hcp_id}?ta=${ASSETS_TA_SLUG}`}
                  style={{ fontFamily: FACE.ui, fontSize: 13, fontWeight: 500, color: CANON.INK.BODY, textDecoration: "none" }}
                >
                  {authorInitialName(r.first_name, r.last_name)}
                </Link>
                <span style={{ fontFamily: FACE.data, fontSize: 13, color: r.c === max ? CANON.GOLD.PRIME : CANON.INK.BODY, flex: "none" }}>
                  {r.c}
                </span>
              </div>
              <div style={{ height: 3, background: CANON.LINE.HAIR, margin: "8px 0 7px", borderRadius: 2 }}>
                {/* Rank bars take a SINGLE ramp step — magnitude is length here, so
                    colour must stay flat (VIZ spec, 2026-08-13). */}
                <div style={{ height: 3, width: `${((r.c / max) * 100).toFixed(0)}%`, background: SEQ[3], borderRadius: 2 }} />
              </div>
              <div style={metaMono}>{authorRankLabel(r.board_rank, r.scope_type, r.scope_value)}</div>
            </div>
          ))}
          <div style={{ ...metaMono, marginTop: 12 }}>
            {authors.resolved.toLocaleString()} authors resolved to the HCP graph in total; the{" "}
            {rows.length} most prolific on this asset are shown, ranked by publication count only.
          </div>
        </div>
      )}
    </div>
  );
}

export function CongressPanel({ presenters }: { presenters: CongressPresenter[] }) {
  return (
    <div style={{ padding: "24px 26px", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
      <div style={{ ...eyebrow, marginBottom: 14 }}>Congress presence</div>
      {presenters.length === 0 ? (
        <div style={emptyProse}>
          No confirmed presenter on this asset matches the published congress programmes.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {presenters.map((p, i) => (
              <div
                key={`${p.hcp_id}-${p.congress}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingBottom: 9,
                  borderBottom: i < presenters.length - 1 ? `1px solid ${CANON.LINE.HAIR}` : "none",
                }}
              >
                <div>
                  <Link
                    to={`/hcp/${p.hcp_id}?ta=${ASSETS_TA_SLUG}`}
                    style={{ fontFamily: FACE.ui, fontSize: 13, fontWeight: 500, color: CANON.INK.BODY, textDecoration: "none" }}
                  >
                    {p.name}
                  </Link>
                  <div style={{ ...metaMono, marginTop: 4 }}>
                    {p.established_rank != null
                      ? `${taLabelForSlug(ASSETS_TA_SLUG).toUpperCase()} ESTABLISHED #${p.established_rank}`
                      : "CONFIRMED PRESENTER"}
                  </div>
                </div>
                <div style={{ fontFamily: FACE.data, fontSize: 11, color: CANON.INK.MUTE, textAlign: "right", flex: "none" }}>
                  {prettyCongress(p.congress)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...metaMono, marginTop: 13 }}>
            Confirmed from published congress programmes. Unconfirmed sessions are not listed.
          </div>
        </>
      )}
    </div>
  );
}

export function ForumPanel({ threads }: { threads: ForumThread[] }) {
  return (
    <div style={{ padding: "24px 26px" }}>
      <div style={{ ...eyebrow, marginBottom: 14 }}>Forum threads on these papers</div>
      {threads.length === 0 ? (
        <div style={emptyProse}>No forum thread is anchored to this asset's papers yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {threads.map((t, i) => (
            <div
              key={t.id}
              style={{
                paddingBottom: i < threads.length - 1 ? 12 : 0,
                borderBottom: i < threads.length - 1 ? `1px solid ${CANON.LINE.HAIR}` : "none",
              }}
            >
              <Link
                to={`/field-intelligence/thread/${t.id}`}
                style={{ fontFamily: FACE.ui, fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: CANON.INK.BODY, textDecoration: "none" }}
              >
                {t.title}
              </Link>
              <div style={{ ...metaMono, marginTop: 6 }}>
                {[
                  t.reply_count != null ? `${t.reply_count} REPLIES` : null,
                  t.recency_label ? t.recency_label.toUpperCase() : null,
                  t.scope_label ? t.scope_label.toUpperCase() : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
