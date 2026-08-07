// The Public Conversation — v4 build. Layout authority: docs/design/Public
// Conversation v4.dc.html (project 6ee8d7ad). Source of fact: the
// public_conversation RPC only (all aggregation server-side; SECURITY DEFINER
// because the verified-match gate reads the anon-dead dol_matches_v2).
//
// DATA RULES (v3 brief + v4 amendment, binding):
//   • included window 20 May – 03 Jun 2026 (14-day exclusion + the capture
//     pause); raw response totals; ordered by response received; no trends,
//     no prior-week, no "rising/emerging" language, no hot-topics panel.
//   • scatter: one dot per account with >= 3 included posts (A FLOOR WE CHOSE
//     — rendered as chosen), follower_count > 0 AND response > 0. Zero has no
//     position on a log axis, so zero-follower and zero-response accounts are
//     EXCLUDED (both counts stated in the scatter header), never clamped to an
//     edge where they would read as real values. Log-log axes; the
//     undated-denominator disclosure sits between the title and the plot.
//   • colour carries ONE stored fact: dol verified_by_human — same gate as the
//     row chip. No classification of people; the org/individual split used for
//     post WITHHOLDING is the shipped classifyVoice rule about accounts.
//   • hover reads out in a FIXED-SIZE overlay floating inside the chart's
//     lower-left quadrant (2026-07-31: the old below-plot slot changed height
//     per account and reflowed the page on every hover). The overlay reserves
//     for the longest case and every line is nowrap-ellipsized, so nothing
//     resizes as the pointer moves. Quadrant rule: lower-left, flipping to
//     lower-right only when the active dot itself is in the lower-left
//     quadrant (x < 50%, y > 50%) — the dot can never be in both. Click pins
//     (persists until UNPIN or another dot); the list never jumps: an
//     out-of-list account shows its position in the overlay footer, an
//     in-list account marks its row.
//   • PROFILE SAYS role chips from the frame are NOT built: no stored role
//     exists and bio-derived roles would classify people. The bio renders
//     verbatim; only the empty-bio state keeps a chip (PROFILE SAYS NOTHING).
//   • axis domains derive from the real data as whole decades (the frame's
//     fixed 100→100k / 100%→0.01% frame cannot hold followers 1→984k or
//     response-per-follower 0→1250%); out-of-domain dots clamp to the edge
//     and their readout carries the true figures.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { classifyVoice } from "../lib/voiceClassification";
import { GOLD as GOLD_T, GROUND, LINE, FONT, COOL } from "../lib/designTokens";

// Commit C 2026-08-05: the conversation box joins the Pulse board scheme —
// g2 board, g1 band/cards. Warm text/accents stay the frame's own.
const BG = GROUND.g2, BG2 = GROUND.g1, BAND = GROUND.g1, CARD = GROUND.g1;
const HAIR = "rgba(255,255,255,0.07)", HAIR2 = "rgba(255,255,255,0.09)", HAIR3 = "rgba(255,255,255,0.14)";
// AMBER #c9962f folded into GOLD.gold 2026-08-05; the #d8a949 mid-gold and
// bronze are per-surface assignments outside the convergence ledger.
// Register pass 2026-08-07: the warm parchment ink ramp and Spectral serif
// retired — this is a scanning surface, so it takes the COOL ramp and the
// register serif (Source Serif 4), matching the profile spines and ledgers.
const GOLD = "#d8a949", AMBER = GOLD_T.gold, BRONZE = "#a07f34";
const INK = COOL.ui, INK2 = COOL.ui, INK3 = COOL.prose, MID = COOL.muted, MID2 = COOL.muted, DIM = COOL.chromeStrong, FAINT = COOL.label, FAINT2 = COOL.faint;
const SERIF = FONT.serif;
const MONO = FONT.mono;

const mono = (s: number, c: string = DIM, ls = "0.13em") => ({ fontFamily: MONO, fontSize: s, letterSpacing: ls, color: c });
const serif = (s: number, c: string = INK3, lh = 1.6) => ({ fontFamily: SERIF, fontSize: s, lineHeight: lh, color: c });
const num = (n: number) => n.toLocaleString("en-US");

interface Pt { h: string; name: string | null; f: number; resp: number; n: number; cap: number; verified: boolean; pos: number; bio: string | null; url: string | null }
interface Row { pos: number; h: string; name: string | null; bio: string | null; url: string | null; f: number; resp: number; n: number; cap: number; orig: number; reply: number; likes: number; replies: number; reposts: number; quotes: number; verified: boolean; via: string | null; top_post: { text: string; at: string; id: string; likes: number; replies: number; reposts: number; quotes: number } | null }
interface Payload {
  ta_slug: string; window: { start: string; end: string };
  posts_captured: number; posts_included: number; accounts_in_window: number;
  corpus: { accounts_total: number; untagged_posts: number; matched: number; confirmed: number; medium: number; held: number };
  hashtags: { top: { tag: string; pct: number }[]; none_pct: number };
  scatter: { floor: number; plotted: number; zero_follower_excluded: number; zero_response_excluded: number; gold: number; points: Pt[] };
  rows: Row[];
}

// ── log-log geometry: whole-decade domains derived from the data ─────────────
// x: followers. y: response-per-follower (epf). Out-of-domain values clamp to
// the plot edge (with a small inset); zero-epf clamps to the bottom.
const X_LO = 0, X_HI = 6; // 10^0 .. 10^6 followers
const Y_LO = -4, Y_HI = 1; // 10^-4 (0.01%) .. 10^1 (1000%) epf
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const xPct = (f: number) => clamp(((Math.log10(Math.max(f, 1)) - X_LO) / (X_HI - X_LO)) * 100, 1, 99);
// Zero-response accounts never reach here — the RPC excludes them from the
// plotted population (zero has no position on a log axis).
const yPct = (epf: number) => clamp(((Y_HI - Math.log10(epf)) / (Y_HI - Y_LO)) * 100, 1.5, 98.5);
const Y_TICKS = [
  { at: 0, label: "1000%" }, { at: 20, label: "100%" }, { at: 40, label: "10%" },
  { at: 60, label: "1%" }, { at: 80, label: "0.1%" }, { at: 100, label: "0.01%" },
];
const X_TICKS = [
  { at: 0, label: "1" }, { at: 16.67, label: "10" }, { at: 33.33, label: "100" },
  { at: 50, label: "1k" }, { at: 66.67, label: "10k" }, { at: 83.33, label: "100k" }, { at: 100, label: "1M" },
];
const pctLabel = (epf: number) => {
  const p = epf * 100;
  if (p >= 10) return `${Math.round(p)}%`;
  if (p >= 0.1) return `${p.toFixed(1)}%`;
  return `${p.toFixed(3)}%`;
};

const isOrg = (r: { h: string; name: string | null; bio: string | null; f: number }) =>
  classifyVoice(r.h, { display_name: r.name, bio: r.bio, follower_count: r.f }) === "org";

export default function PublicConversation({ taSlug, taLabel, narrow }: { taSlug: string; taLabel: string; narrow: boolean }) {
  const [d, setD] = useState<Payload | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [shown, setShown] = useState(7);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<Pt | null>(null);
  const [pinned, setPinned] = useState<Pt | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setD(null); setRows([]); setShown(7); setPinned(null); setHovered(null);
    supabase.rpc("public_conversation", { p_ta_slug: taSlug, p_limit: 32, p_offset: 0 }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { console.warn("public_conversation:", error); setLoading(false); return; }
      const p = data as Payload;
      setD(p); setRows(p.rows ?? []); setLoading(false);
    });
    return () => { alive = false; };
  }, [taSlug]);

  const loadMore = async () => {
    const step = narrow ? 10 : 25;
    if (shown + step <= rows.length) { setShown(shown + step); return; }
    const { data } = await supabase.rpc("public_conversation", { p_ta_slug: taSlug, p_limit: step + 25, p_offset: rows.length });
    const more = ((data as Payload | null)?.rows ?? []);
    setRows((r) => [...r, ...more]);
    setShown(shown + step);
  };

  // group boundary: re-derived on the 15-day window. 2,000 raw responses holds
  // against the real distribution (a natural gap sits under the 2,2xx cluster).
  const BOUNDARY = 2000;

  const active = pinned ?? hovered; // the readout slot shows hover; click pins
  const activeRowIdx = useMemo(() => (active ? rows.slice(0, shown).findIndex((r) => r.h === active.h) : -1), [active, rows, shown]);

  if (loading) return <div style={{ ...mono(11, FAINT), padding: "48px 24px", background: BG }}>Loading the public conversation…</div>;
  if (!d) return <div style={{ ...mono(11, FAINT), padding: "48px 24px", background: BG }}>The public conversation could not be loaded.</div>;

  // Honest empty states, data-gated
  if (d.accounts_in_window === 0) {
    return (
      <EmptyPanel taLabel={taLabel}
        headline="No capture inside the included window."
        body={`Capture holds no ${taLabel} posts between 20 May and 3 June 2026, so there is no window population to order. The corpus starts when the capture starts.`} />
    );
  }
  if (d.accounts_in_window < 50) {
    return (
      <EmptyPanel taLabel={taLabel}
        headline="Below the minimum we set."
        body={`${num(d.accounts_in_window)} accounts posted in the included window. We show a list only at fifty accounts or more — a number we chose, not one the audit set.`}
        facts={[["MINIMUM TO SHOW A LIST", "50 ACCOUNTS · OUR CHOICE"], ["ACCOUNTS SEEN", num(d.accounts_in_window)], ["POSTS SEEN", num(d.posts_included)]]} />
    );
  }

  const groupARows = rows.slice(0, shown).filter((r) => r.resp >= BOUNDARY);
  const groupBRows = rows.slice(0, shown).filter((r) => r.resp < BOUNDARY);

  return (
    <div style={{ background: BG, border: `1px solid ${LINE.l1}`, margin: "8px 0 24px", fontFamily: MONO }}>
      {/* title band */}
      <div style={{ display: "flex", alignItems: narrow ? "flex-start" : "center", flexDirection: narrow ? "column" : "row", gap: narrow ? 8 : 14, justifyContent: "space-between", padding: narrow ? "14px 18px" : "15px 28px", background: CARD, borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          {/* the filled PUB tag removed 2026-08-07 — it clipped to "PUS" beside
              the title and a filled gold chip is off-register; the eyebrow-less
              title carries the surface name alone */}
          <span style={{ ...serif(19, INK, 1.2) }}>The Public Conversation <span style={{ color: FAINT }}>/</span> {taLabel}</span>
        </div>
        <div style={{ ...mono(narrow ? 9.5 : 10.5, DIM, "0.11em"), lineHeight: 1.7 }}>
          {num(d.corpus.accounts_total)} ACCOUNTS · {num(d.posts_captured)} TA-TAGGED POSTS CAPTURED · {num(d.posts_included)} INCLUDED{narrow ? <br /> : " · "}POSTS 20 MAY — 03 JUN 2026 · ORDERED BY RESPONSE RECEIVED
        </div>
      </div>

      {/* honesty panel */}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 480px", borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ padding: narrow ? "18px 18px 18px 20px" : "24px 28px 26px 28px", borderLeft: `2px solid ${BRONZE}`, marginLeft: narrow ? 16 : 26 }}>
          <div style={{ ...mono(9.5, BRONZE, "0.2em"), marginBottom: 10 }}>WHAT THIS SURFACE IS</div>
          <div style={{ ...serif(narrow ? 14.5 : 16, INK3, 1.62), maxWidth: 880, textWrap: "pretty" as const }}>
            Public posts, read as written. These accounts were not drawn from the corpus and are not asserted to be clinicians — they range from people who see patients to people who have been patients, and the surface exists to find the conversation that has not reached the literature. Everything stated about a person below is either their own profile text or a count of their own posts.
          </div>
          <div style={{ ...serif(narrow ? 14 : 16, MID, 1.62), maxWidth: 880, marginTop: 14, textWrap: "pretty" as const }}>
            {num(d.corpus.matched)} of these {num(d.corpus.accounts_total)} accounts — {Math.round((d.corpus.matched / d.corpus.accounts_total) * 100)}% — match a physician in our database, and {d.corpus.confirmed} of those matches were confirmed by hand. The rest we have not matched to anyone, and we have not tried to.
          </div>
          {d.corpus.untagged_posts > 0 ? (
            <div style={{ ...serif(narrow ? 14 : 16, MID, 1.62), maxWidth: 880, marginTop: 14, textWrap: "pretty" as const }}>
              {num(d.corpus.untagged_posts)} reply-capture posts carry no TA tag and are not counted, though they fall inside the included window.
            </div>
          ) : null}
        </div>
        <div style={{ padding: narrow ? "16px 18px" : "24px 28px", borderLeft: narrow ? "none" : `1px solid rgba(255,255,255,0.06)`, display: "flex", flexDirection: "column", gap: 9 }}>
          {([
            ["CORPUS CHIP SHOWN WHEN", `A HUMAN CONFIRMED THE MATCH · ${d.corpus.confirmed} OF ${d.corpus.matched}`, MID],
            ["NOT SHOWN", `${d.corpus.medium} MEDIUM-CONFIDENCE · ${d.corpus.held} HELD IN REVIEW`, MID],
            ["ROLE", "READ FROM THE BIO · NOT A STORED FIELD", MID],
            ["ORDER", "RESPONSE RECEIVED · RAW, UNCORRECTED", MID],
            ["FOLLOWER COUNT", "READ ONCE · DATE NOT RECORDED", AMBER],
            ["CAPTURE", "PAUSED 03 JUN · RESUMED 21 JUL", AMBER],
          ] as [string, string, string][]).map(([k, v, c], i, arr) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, ...mono(10, "#7a7367", "0.11em"), paddingBottom: i < arr.length - 1 ? 8 : 0, borderBottom: i < arr.length - 1 ? `1px dotted rgba(255,255,255,0.1)` : "none" }}>
              <span>{k}</span><span style={{ color: c, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── population scatter ─────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${HAIR}`, background: BG2 }}>
        <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: `22px ${narrow ? 18 : 28}px 0` }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, maxWidth: 900 }}>
            <div style={mono(9.5, BRONZE, "0.2em")}>AUDIENCE AGAINST RESPONSE · EVERY ACCOUNT IN THE WINDOW</div>
            <div style={{ ...serif(narrow ? 14 : 16, INK3) }}>Response per follower against follower count, both on log scales, one dot per account. Upper left is a small audience answering hard. The list below shows {Math.min(shown, rows.length)} accounts; this shows all of them, and it is the only place you can see that response is not a function of audience size.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: narrow ? "flex-start" : "flex-end" }}>
            <span style={mono(10, DIM)}>{num(d.scatter.plotted)} ACCOUNTS PLOTTED · {num(d.accounts_in_window)} IN THE WINDOW</span>
            <span style={mono(9.5, FAINT)}>{d.scatter.floor} OR MORE INCLUDED POSTS — A FLOOR WE CHOSE, NOT ONE THE DATA SET</span>
            <span style={mono(9.5, FAINT)}>POSTS 20 MAY — 03 JUN 2026 · 15 DAYS</span>
            {d.scatter.zero_follower_excluded > 0 || d.scatter.zero_response_excluded > 0 ? (
              <span style={mono(9.5, FAINT)}>
                NOT PLOTTED · {d.scatter.zero_follower_excluded} WITH ZERO FOLLOWERS · {d.scatter.zero_response_excluded} WITH ZERO RESPONSE — ZERO HAS NO PLACE ON A LOG AXIS
              </span>
            ) : null}
          </div>
        </div>

        {/* denominator disclosure — in the reader's path */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", margin: `18px ${narrow ? 18 : 28}px 0`, padding: "14px 18px", borderLeft: `2px solid rgba(201,150,47,0.5)`, background: BAND }}>
          <span style={{ border: `1px solid rgba(201,150,47,0.45)`, color: AMBER, fontSize: 9, letterSpacing: "0.14em", padding: "3px 7px", whiteSpace: "nowrap" }}>UNDATED DENOMINATOR</span>
          <span style={{ ...serif(narrow ? 13.5 : 15.5, MID, 1.55), maxWidth: 1200 }}>The vertical axis divides response by a follower count that was read once, on a date nothing in the pipeline recorded. It is the weakest number on this surface, and here it is underneath every dot. Read the vertical position as a rough band, not a value.</span>
        </div>

        {/* legend: one stored fact */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: narrow ? 12 : 28, alignItems: "center", padding: `16px ${narrow ? 18 : 28}px 8px` }}>
          <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: GOLD }} />
            <span style={mono(9.5, MID)}>CORPUS MATCH CONFIRMED BY A PERSON · {d.scatter.gold} OF {num(d.scatter.plotted)}</span>
          </span>
          <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: DIM }} />
            <span style={mono(9.5, MID)}>NOT MATCHED, OR MATCHED WITHOUT CONFIRMATION · {num(d.scatter.plotted - d.scatter.gold)}</span>
          </span>
          {narrow ? null : <span style={mono(9.5, FAINT)}>COLOR CARRIES ONE STORED FACT · IT IS NOT A CLASSIFICATION OF PEOPLE</span>}
        </div>

        {/* plot */}
        <div style={{ display: "grid", gridTemplateColumns: `${narrow ? 40 : 52}px 1fr`, padding: `8px ${narrow ? 18 : 28}px 6px` }}>
          <div style={{ display: "flex", alignItems: "center", height: narrow ? 260 : 430 }}>
            <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", ...mono(9, FAINT, "0.14em") }}>RESPONSE PER FOLLOWER (LOG)</span>
          </div>
          <div>
            <div style={{ position: "relative", height: narrow ? 260 : 430, borderLeft: `1px solid ${HAIR3}`, borderBottom: `1px solid ${HAIR3}` }}>
              {Y_TICKS.map((t) => (
                <div key={t.at}>
                  {t.at > 0 && t.at < 100 ? <div style={{ position: "absolute", left: 0, right: 0, top: `${t.at}%`, borderTop: `1px dotted rgba(255,255,255,0.08)` }} /> : null}
                  <span style={{ position: "absolute", right: "100%", paddingRight: 6, top: `calc(${t.at}% - 6px)`, ...mono(9, FAINT, "0"), whiteSpace: "nowrap" }}>{t.label}</span>
                </div>
              ))}
              {X_TICKS.slice(1, -1).map((t) => (
                <div key={t.at} style={{ position: "absolute", top: 0, bottom: 0, left: `${t.at}%`, borderLeft: `1px dotted rgba(255,255,255,0.07)` }} />
              ))}
              {d.scatter.points.map((p) => {
                const on = active?.h === p.h;
                return (
                  <span key={p.h}
                    onMouseEnter={() => setHovered(p)}
                    onMouseLeave={() => setHovered((h) => (h?.h === p.h ? null : h))}
                    onClick={() => setPinned((cur) => (cur?.h === p.h ? null : p))}
                    style={{
                      position: "absolute", left: `${xPct(p.f)}%`, top: `${yPct(p.resp / p.f)}%`,
                      width: on ? 11 : 7, height: on ? 11 : 7, margin: on ? "-5.5px 0 0 -5.5px" : "-3.5px 0 0 -3.5px",
                      borderRadius: "50%", background: p.verified ? GOLD : DIM,
                      opacity: on ? 1 : 0.85, cursor: "pointer",
                      outline: on ? `1px solid ${INK}` : "none", zIndex: on ? 2 : 1,
                    }} />
                );
              })}
              {active ? (() => {
                // Quadrant rule: lower-left unless the active dot is itself in the
                // lower-left quadrant, then lower-right. Fixed box; nothing reflows.
                const dotLowerLeft = xPct(active.f) < 50 && yPct(active.resp / active.f) > 50;
                const cell = (k: string, v: string): React.ReactNode => (
                  <div key={k} style={{ minWidth: 0 }}>
                    <div style={{ ...mono(8, FAINT, "0.12em"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k}</div>
                    <div style={{ ...mono(narrow ? 11 : 12, INK2, "0.02em"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{v}</div>
                  </div>
                );
                return (
                  <div style={{
                    position: "absolute", bottom: "3%", ...(dotLowerLeft ? { right: "2%" } : { left: "2%" }),
                    width: narrow ? 210 : 350, height: narrow ? 150 : 170, boxSizing: "border-box",
                    background: "rgba(19,17,16,0.96)", border: `1px solid rgba(255,255,255,0.14)`,
                    padding: narrow ? "8px 10px" : "10px 14px", zIndex: 3, overflow: "hidden",
                    display: "flex", flexDirection: "column", gap: narrow ? 5 : 7,
                    pointerEvents: pinned ? "auto" : "none",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ ...mono(8, BRONZE, "0.16em"), whiteSpace: "nowrap" }}>{pinned ? "PINNED" : "HOVER · CLICK PINS"}</span>
                      <span style={{ display: "flex", gap: 10, whiteSpace: "nowrap" }}>
                        {pinned && active.url ? <a href={active.url} target="_blank" rel="noopener noreferrer" style={{ ...mono(8, BRONZE, "0.12em"), textDecoration: "none" }}>OPEN ↗</a> : null}
                        {pinned ? <span onClick={() => setPinned(null)} style={{ ...mono(8, FAINT, "0.12em"), cursor: "pointer" }}>UNPIN ×</span> : null}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span style={{ ...serif(narrow ? 13 : 15, INK, 1.2), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{active.name || `@${active.h}`}</span>
                      {active.verified ? <span title="Corpus match confirmed by a person" style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD, flexShrink: 0 }} /> : null}
                    </div>
                    <div style={{ ...mono(narrow ? 8.5 : 9, MID, "0.08em"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      @{active.h} · {num(active.pos)} OF {num(d.accounts_in_window)} BY RESPONSE
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: narrow ? "4px 8px" : "6px 12px" }}>
                      {cell("POSTS INCLUDED", `${active.n} OF ${active.cap} CAPTURED`)}
                      {cell("RESPONSE", num(active.resp))}
                      {cell("FOLLOWERS · UNDATED", num(active.f))}
                      {cell("PLOTTED AT", `${pctLabel(active.resp / active.f)} / FOLLOWER`)}
                    </div>
                    <div style={{ ...mono(8, activeRowIdx >= 0 ? AMBER : FAINT, "0.1em"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "auto" }}>
                      {activeRowIdx >= 0 ? `IN THE LIST BELOW · ROW ${activeRowIdx + 1} — MARKED` : "NOT IN THE LIST BELOW · THE LIST DOES NOT MOVE"}
                    </div>
                  </div>
                );
              })() : null}
            </div>
            <div style={{ position: "relative", height: 16, marginTop: 9, ...mono(9, FAINT, "0.1em") }}>
              {(narrow ? X_TICKS.filter((_, i) => i % 3 === 0) : X_TICKS).map((t) => (
                <span key={t.at} style={{ position: "absolute", left: `${t.at}%`, transform: "translateX(-50%)" }}>{t.label}</span>
              ))}
            </div>
            <div style={{ textAlign: "center", ...mono(9, FAINT, "0.14em"), paddingTop: 10 }}>FOLLOWER COUNT (LOG) · READ ONCE, DATE NOT RECORDED</div>
          </div>
        </div>
      </div>

      {/* hashtag strip */}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr 1fr" : `340px repeat(${d.hashtags.top.length}, 1fr) 200px`, borderBottom: `1px solid ${HAIR}`, background: BG2 }}>
        <div style={{ padding: narrow ? "14px 18px" : "16px 24px", borderRight: `1px solid rgba(255,255,255,0.05)`, gridColumn: narrow ? "1 / -1" : "auto" }}>
          <div style={{ ...mono(9, "#7a7367", "0.18em"), marginBottom: 10 }}>HASHTAGS CARRIED · SHARE OF INCLUDED POSTS</div>
          <div style={{ ...mono(10.5, MID, "0.1em"), lineHeight: 1.6 }}>WHAT PEOPLE TYPED — NOT A TOPIC MODEL, NOT WHAT THE POST IS ABOUT</div>
        </div>
        {d.hashtags.top.map((t) => (
          <div key={t.tag} style={{ padding: narrow ? "12px 18px" : "16px 22px", borderRight: `1px solid rgba(255,255,255,0.05)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 }}>
              <span style={{ ...serif(15, INK2, 1.2) }}>{t.tag}</span><span style={{ color: GOLD, fontSize: 11 }}>{Math.round(t.pct)}%</span>
            </div>
            <div style={{ height: 2, background: HAIR }}><div style={{ height: 2, width: `${Math.min(t.pct, 100)}%`, background: BRONZE }} /></div>
          </div>
        ))}
        <div style={{ padding: narrow ? "12px 18px" : "16px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 }}>
            <span style={{ ...serif(15, DIM, 1.2) }}>no hashtag</span><span style={{ color: DIM, fontSize: 11 }}>{Math.round(d.hashtags.none_pct)}%</span>
          </div>
          <div style={{ height: 2, background: HAIR }}><div style={{ height: 2, width: `${d.hashtags.none_pct}%`, background: "#4d4a44" }} /></div>
        </div>
      </div>

      {/* column head (desktop) */}
      {narrow ? null : (
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 340px", borderBottom: `1px solid ${HAIR2}`, background: BG2 }}>
          <div style={{ padding: "14px 0 12px 28px", ...mono(9, FAINT, "0.16em"), lineHeight: 1.5 }}>ORDER<br />RESPONSE · POSTS</div>
          <div style={{ padding: "14px 32px 12px 0", ...mono(9, FAINT, "0.16em"), lineHeight: 1.5 }}>ACCOUNT · PROFILE AS WRITTEN · REPRESENTATIVE POST<br />WHY THIS ACCOUNT IS HERE</div>
          <div style={{ padding: "14px 28px 12px 28px", ...mono(9, FAINT, "0.16em"), lineHeight: 1.5, borderLeft: `1px solid rgba(255,255,255,0.05)` }}>COUNTS ON INCLUDED POSTS<br />EVERY FIGURE FROM THE ACCOUNT&rsquo;S OWN POSTS</div>
        </div>
      )}

      {/* exclusion band */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", padding: `16px ${narrow ? 18 : 28}px`, background: BAND, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        <span style={{ border: `1px solid rgba(201,150,47,0.45)`, color: AMBER, fontSize: 9, letterSpacing: "0.14em", padding: "3px 7px", whiteSpace: "nowrap" }}>LAST 14 DAYS EXCLUDED</span>
        <span style={{ ...serif(narrow ? 13.5 : 15.5, MID, 1.55), maxWidth: 1180 }}>Posts from the last fourteen days are left out, because their response is still arriving. Capture also paused on 3 June and resumed on 21 July, and everything in the resumed run falls inside that fortnight — so the included posts are the fifteen days from 20 May to 3 June, compared as raw totals with no correction.</span>
      </div>

      {/* groups + rows */}
      {groupARows.length > 0 ? (
        <>
          <GroupHead label={`GROUP A · RESPONSE RECEIVED ABOVE ${num(BOUNDARY)}`} note="ORDER DESCRIBES RESPONSE TO INCLUDED POSTS · IT IS NOT A JUDGEMENT OF STANDING" narrow={narrow} />
          {groupARows.map((r, i) => <AccountRow key={r.h} r={r} total={d.accounts_in_window} marked={active?.h === r.h} narrow={narrow} groupA idx={i} />)}
        </>
      ) : null}
      {groupBRows.length > 0 ? (
        <>
          <GroupHead label={`GROUP B · RESPONSE RECEIVED BELOW ${num(BOUNDARY)}`} note="ONE STRONG POST HERE CARRIES MORE THAN THE GAPS BETWEEN THESE ROWS — TREAT AS TIED" narrow={narrow} />
          {groupBRows.map((r, i) => <AccountRow key={r.h} r={r} total={d.accounts_in_window} marked={active?.h === r.h} narrow={narrow} groupA={false} idx={i} />)}
        </>
      ) : null}

      {/* footer */}
      <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", justifyContent: "space-between", gap: 8, padding: `14px ${narrow ? 18 : 28}px`, background: BG2 }}>
        <span style={mono(9.5, FAINT, "0.14em")}>SHOWING {Math.min(shown, rows.length)} OF {num(d.accounts_in_window)} ACCOUNTS WITH AN INCLUDED POST · {num(d.posts_captured - d.posts_included)} CAPTURED POSTS SIT OUTSIDE THE WINDOW · NO HISTORY IS KEPT, SO THIS ORDER CANNOT BE COMPARED WITH LAST MONTH&rsquo;S</span>
        <span onClick={() => void loadMore()} style={{ ...mono(9.5, BRONZE, "0.14em"), cursor: "pointer", whiteSpace: "nowrap" }}>LOAD NEXT {narrow ? 10 : 25} ↓</span>
      </div>
    </div>
  );
}

function GroupHead({ label, note, narrow }: { label: string; note: string; narrow: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: `9px ${narrow ? 18 : 28}px`, background: BAND, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
      <span style={mono(9.5, BRONZE, "0.18em")}>{label}</span>
      {narrow ? null : <span style={mono(9.5, FAINT, "0.14em")}>{note}</span>}
    </div>
  );
}

// One ranked row. Representative-post withholding rules (v3, kept):
//   org account (shipped classifyVoice) → no quote (an institution's writing is
//   not a person's voice); all included posts are replies → no quote (a reply
//   lifted from its thread misrepresents what was said).
function AccountRow({ r, total, marked, narrow, groupA, idx }: { r: Row; total: number; marked: boolean; narrow: boolean; groupA: boolean; idx: number }) {
  const org = isOrg(r);
  const allReplies = r.orig === 0;
  const why = buildWhy(r, org, idx, groupA);
  const postUrl = r.top_post ? `https://x.com/${r.h}/status/${r.top_post.id}` : null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "150px 1fr 340px", borderBottom: `1px solid rgba(255,255,255,0.06)`, borderLeft: groupA ? `2px solid rgba(160,127,52,0.5)` : "none", background: marked ? "rgba(216,169,73,0.05)" : "transparent", outline: marked ? `1px solid rgba(216,169,73,0.4)` : "none", outlineOffset: -1 }}>
      <div style={{ padding: narrow ? "18px 18px 0" : "26px 0 26px 26px", display: narrow ? "flex" : "block", gap: 14, alignItems: "baseline" }}>
        <span style={{ fontFamily: SERIF, fontSize: narrow ? 26 : 38, lineHeight: 1, color: groupA ? GOLD : "#b08c39" }}>{r.pos}</span>
        <div style={{ ...mono(9, FAINT, "0.1em"), marginTop: narrow ? 0 : 8 }}>OF {num(total)}</div>
        <div style={{ color: AMBER, fontSize: 13, letterSpacing: "0.04em", marginTop: narrow ? 0 : 16 }}>{num(r.resp)}</div>
        <div style={{ ...mono(9, FAINT, "0.1em"), marginTop: narrow ? 0 : 4 }}>FROM {r.n} POST{r.n === 1 ? "" : "S"}</div>
      </div>
      <div style={{ padding: narrow ? "12px 18px 18px" : "24px 34px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <span style={{ ...serif(narrow ? 18 : 22, INK, 1.25) }}>{r.name || `@${r.h}`}</span>
          {r.name ? <span style={{ color: BRONZE, fontSize: 12 }}>@{r.h}</span> : <span style={mono(11, FAINT, "0.12em")}>NO DISPLAY NAME SET</span>}
          {!r.bio ? <span style={{ border: `1px dashed rgba(255,255,255,0.16)`, color: FAINT, fontSize: 9, letterSpacing: "0.14em", padding: "3px 7px" }}>PROFILE SAYS NOTHING</span> : null}
          {r.verified ? <span style={{ border: `1px solid rgba(216,169,73,0.35)`, color: AMBER, fontSize: 9, letterSpacing: "0.14em", padding: "3px 7px" }}>MATCHED TO CORPUS · CONFIRMED BY A PERSON</span> : null}
        </div>
        <div>
          <div style={{ ...mono(9, FAINT, "0.16em"), marginBottom: 6 }}>PROFILE, VERBATIM</div>
          {r.bio ? (
            <div style={{ color: MID, fontSize: 12.5, lineHeight: 1.55 }}>&ldquo;{r.bio}&rdquo;</div>
          ) : (
            <div style={{ color: FAINT2, fontSize: 12.5, lineHeight: 1.55 }}>— BIO EMPTY. WE HAVE NOTHING TO QUOTE AND WE ARE NOT INFERRING A ROLE.</div>
          )}
        </div>
        {org || allReplies || !r.top_post ? (
          <div style={{ borderLeft: `1px dashed rgba(255,255,255,0.14)`, padding: "2px 0 2px 20px" }}>
            <div style={{ ...mono(9, FAINT, "0.16em"), marginBottom: 9 }}>NO REPRESENTATIVE POST</div>
            <div style={{ ...serif(narrow ? 14 : 16, DIM, 1.55), maxWidth: 820 }}>
              {org
                ? "This account reads as an organisation, not a person. Quoting it as a voice would attribute an institution's writing to an individual, so we don't."
                : "Every included post is a reply inside someone else's thread. A reply lifted out of its thread misrepresents what was said, so we show none."}
            </div>
          </div>
        ) : (
          <div style={{ borderLeft: `1px solid ${BRONZE}`, padding: "2px 0 2px 20px" }}>
            <div style={{ ...mono(9, BRONZE, "0.16em"), marginBottom: 9 }}>THEIR OWN WORDS · MOST RESPONSE OF ANY INCLUDED POST</div>
            <div style={{ ...serif(narrow ? 15 : 17.5, "#e2dcd0", 1.55), maxWidth: 820, textWrap: "pretty" as const }}>{r.top_post.text}</div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 11, ...mono(9.5, FAINT, "0.12em") }}>
              <span>@{r.h} · POSTED {r.top_post.at.toUpperCase()}</span>
              <span>{num(r.top_post.likes)} LIKES · {num(r.top_post.replies)} REPLIES · {num(r.top_post.reposts)} REPOSTS · {num(r.top_post.quotes)} QUOTES</span>
              <span style={{ color: FAINT2 }}>QUOTED IN FULL, UNEDITED</span>
              {postUrl ? <a href={postUrl} target="_blank" rel="noopener noreferrer" style={{ color: BRONZE, textDecoration: "none" }}>VIEW ON SOURCE ↗</a> : null}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", paddingTop: 4 }}>
          <span style={{ border: `1px solid rgba(201,150,47,0.4)`, color: AMBER, fontSize: 9, letterSpacing: "0.14em", padding: "3px 7px", whiteSpace: "nowrap" }}>WHY HERE · PROVISIONAL</span>
          <span style={{ ...serif(narrow ? 13.5 : 15, MID2, 1.55), maxWidth: 700 }}>{why}</span>
        </div>
      </div>
      <div style={{ padding: narrow ? "0 18px 18px" : "26px 28px", borderLeft: narrow ? "none" : `1px solid rgba(255,255,255,0.05)`, display: "flex", flexDirection: "column", gap: 8 }}>
        {([
          ["POSTS INCLUDED", `${r.n} OF ${r.cap} CAPTURED`],
          ["ORIGINAL · REPLY", `${r.orig} · ${r.reply}`],
          ["RESPONSE RECEIVED", num(r.resp)],
          ["LIKE · REPLY · REPOST · QUOTE", `${num(r.likes)} · ${num(r.replies)} · ${num(r.reposts)} · ${num(r.quotes)}`],
          ["FOLLOWERS · UNDATED", r.f > 0 ? num(r.f) : "NOT ON RECORD"],
          ["CORPUS MATCH", org ? "NOT APPLICABLE" : r.verified ? "CONFIRMED BY A PERSON" : "UNMATCHED"],
          ["CAPTURED VIA", r.via ?? "—"],
        ] as [string, string][]).map(([k, v], i, arr) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: MONO, fontSize: k.includes("·") && k.startsWith("LIKE") ? 9.5 : 10, letterSpacing: "0.1em", color: "#7a7367", paddingBottom: i < arr.length - 1 ? 7 : 0, borderBottom: i < arr.length - 1 ? `1px dotted rgba(255,255,255,0.09)` : "none" }}>
            <span>{k}</span>
            <span style={{ color: k === "RESPONSE RECEIVED" ? GOLD : k === "CORPUS MATCH" && r.verified && !org ? AMBER : k === "CAPTURED VIA" ? BRONZE : INK2, textAlign: "right" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Factual, count-only narratives — no synthesis, no judgement words.
function buildWhy(r: Row, org: boolean, idx: number, groupA: boolean): string {
  const bits: string[] = [];
  bits.push(`${cap(spell(r.n))} included post${r.n === 1 ? "" : "s"} drew ${r.resp.toLocaleString()} responses${groupA && idx === 0 ? ", the highest total in the window" : ""}.`);
  if (r.reply > 0 && r.orig > 0) bits.push(`${cap(spell(r.reply))} of those posts were replies to other people.`);
  if (r.orig === 0 && r.reply > 0) bits.push(`Answering other people is the whole of this account's activity, and the whole of what we can see about it.`);
  if (org) bits.push(`Whether an organisational account belongs on this list at all is open in the audit.`);
  bits.push(`Who repeated them we cannot see: reposts reach us as a number, with no record of who made them.`);
  return bits.join(" ");
}
const SPELL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const spell = (n: number) => (n < SPELL.length ? SPELL[n] : n.toLocaleString());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function EmptyPanel({ taLabel, headline, body, facts }: { taLabel: string; headline: string; body: string; facts?: [string, string][] }) {
  return (
    <div style={{ background: BG, border: `1px solid ${HAIR2}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "13px 28px", background: CARD, borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ color: BG, background: DIM, fontSize: 9, letterSpacing: "0.16em", padding: "3px 6px", fontFamily: MONO }}>PUB</span>
          <span style={{ ...serif(19, INK, 1.2) }}>The public conversation <span style={{ color: FAINT }}>/</span> {taLabel}</span>
        </div>
        <span style={mono(10.5, DIM)}>SAME SURFACE · BELOW THE MINIMUM WE SET</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: facts ? "1fr 480px" : "1fr" }}>
        <div style={{ padding: "34px 28px 38px 30px", borderLeft: `2px solid #4d4a44`, marginLeft: 26 }}>
          <div style={{ ...mono(9.5, DIM, "0.2em"), marginBottom: 12 }}>NO LIST FOR THIS TERRITORY</div>
          <div style={{ ...serif(19, INK3, 1.6), maxWidth: 860, textWrap: "pretty" as const }}>{headline} {body}</div>
          <div style={{ ...serif(16, DIM, 1.6), maxWidth: 860, marginTop: 16 }}>Whether these accounts were posting before capture began here, we have no way of knowing — the corpus starts when the capture starts.</div>
        </div>
        {facts ? (
          <div style={{ padding: "34px 28px", borderLeft: `1px solid rgba(255,255,255,0.06)`, display: "flex", flexDirection: "column", gap: 9 }}>
            {facts.map(([k, v], i) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, ...mono(10, "#7a7367", "0.11em"), paddingBottom: 8, borderBottom: i < facts.length - 1 ? `1px dotted rgba(255,255,255,0.1)` : "none" }}>
                <span>{k}</span><span style={{ color: MID, textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
