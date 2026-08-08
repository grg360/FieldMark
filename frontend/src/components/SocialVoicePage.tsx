// Social voice — every captured post for one voice (/social/voice/:handle).
// LAYOUT AUTHORITY: Voice Page Choueiri.dc.html (design project 58ed2431,
// imported 2026-08-07). The frame's warm hexes map onto the register the same
// way the Public Conversation's 2026-08-07 register pass did: COOL ink ramp,
// GROUND boards, register serif, conversation accents (GOLD #d8a949 / bronze).
//
// FRAME DECISIONS APPLIED:
//  - Capture-time absence renders at STREAM level (rail CAPTURE WINDOW row +
//    closing prose), NEVER per-post — this settles the held caption question.
//    Post rows carry POSTED only.
//  - Bio is MONO, quoted, with TYPED BY THE ACCOUNT · REPRODUCED WITHOUT
//    CORRECTION beneath (frame), not serif.
//  - Hashtag filter chips over the stream; CARRIES #tag on rows whose tags go
//    beyond the query that captured them.
//  - Closing two-column prose: partial-by-construction + no-second-date.
//
// DATA RULES (review 2026-08-07, unchanged):
//  - (platform, handle) key, lowercased on entry; platform pinned 'twitter'.
//  - Orphan handle (posts, no profile row) renders the stream — never blank.
//  - Engagement nulls render as absence ("LIKES —"), never zero-filled; a
//    null anywhere makes the rail totals "AT LEAST" figures, stated as such.
//  - follower_count is discovery-frozen: FOLLOWERS · UNDATED + footnote.
//  - CORPUS MATCH is dol_matches_v2 verified_by_human — anon-dead, so it
//    renders ONLY when the ranked list passes it via router state (see
//    VoiceLinkState); a direct load omits the row/chip rather than guessing.

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AppLayout from "./AppLayout";
import { FONT, GOLD as GOLD_T, GROUND, LINE, COOL } from "../lib/designTokens";
import { useMediaQuery } from "../lib/useMediaQuery";
import { getVoiceStream, type VoiceStream, type VoicePost } from "../lib/socialVoice";

// Same per-surface accents as PublicConversation (outside the convergence ledger).
const GOLD = "#d8a949", BRONZE = "#a07f34", AMBER = GOLD_T.gold;
const INK = COOL.ui, MID = COOL.muted, DIM = COOL.chromeStrong, FAINT = COOL.label, FAINT2 = COOL.faint;
const HAIR = "rgba(255,255,255,0.07)";

const mono = (s: number, c: string = DIM, ls = "0.14em") => ({ fontFamily: FONT.mono, fontSize: s, letterSpacing: ls, color: c });
const serif = (s: number, c: string = COOL.prose, lh = 1.6) => ({ fontFamily: FONT.serif, fontSize: s, lineHeight: lh, color: c });
const num = (n: number) => n.toLocaleString("en-US");

// Passed by the ranked list when it links here (held diff); a direct load has none.
export interface VoiceLinkState {
  rank?: number;
  rankOf?: number;
  corpusConfirmed?: boolean; // dol verified_by_human — the ranked list's gate
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

// Null-aware total: exact when every post carries the figure; "AT LEAST" when
// some do; absent when none do. Never silently zero-fills.
function total(posts: VoicePost[], pick: (p: VoicePost) => number | null): { label: string; partial: boolean } | null {
  const vals = posts.map(pick);
  const present = vals.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  const sum = present.reduce((a, b) => a + b, 0);
  const partial = present.length < vals.length;
  return { label: `${partial ? "≥ " : ""}${num(sum)}`, partial };
}

function EngagementMeta({ p }: { p: VoicePost }) {
  const metrics: Array<[string, string, number | null]> = [
    ["LIKE", "LIKES", p.likes],
    ["REPLY", "REPLIES", p.replies],
    ["REPOST", "REPOSTS", p.reposts],
    ["QUOTE", "QUOTES", p.quotes],
  ];
  if (metrics.every(([, , v]) => v == null)) {
    return <span style={{ color: FAINT }}>ENGAGEMENT NOT CAPTURED</span>;
  }
  return (
    <>
      {metrics.map(([one, many, v]) => (
        <span key={many} style={{ display: "inline-flex", gap: 8 }}>
          <span style={{ color: v == null ? FAINT2 : MID }}>
            {v == null ? `${many} —` : `${num(v)} ${v === 1 ? one : many}`}
          </span>
          <span style={{ color: FAINT2 }}>·</span>
        </span>
      ))}
    </>
  );
}

export default function SocialVoicePage() {
  const params = useParams();
  const location = useLocation();
  const narrow = useMediaQuery("(max-width: 767px)");
  const linkState = (location.state ?? {}) as VoiceLinkState;
  const rawHandle = params.handle ?? "";
  const handle = rawHandle.trim().toLowerCase().replace(/^@/, "");

  const [stream, setStream] = useState<VoiceStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState<string>("ALL");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVoiceStream(rawHandle)
      .then((s) => { if (!cancelled) setStream(s); })
      .catch((err) => console.warn("SocialVoicePage: load error", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rawHandle]);

  const profile = stream?.profile ?? null;
  const posts = useMemo(() => stream?.posts ?? [], [stream]);
  const n = posts.length;

  // Stream facts (null-aware)
  const orig = posts.filter((p) => !p.isReply).length;
  const likesT = total(posts, (p) => p.likes);
  const repliesT = total(posts, (p) => p.replies);
  const repostsT = total(posts, (p) => p.reposts);
  const quotesT = total(posts, (p) => p.quotes);
  const anyEngPartial = [likesT, repliesT, repostsT, quotesT].some((t) => t == null || t.partial);
  const respPresent = posts.flatMap((p) => [p.likes, p.replies, p.reposts, p.quotes]).filter((v): v is number => v != null);
  const resp = respPresent.reduce((a, b) => a + b, 0);
  const viaList = [...new Set(posts.map((p) => p.capturedViaQuery).filter(Boolean))] as string[];
  const stamps = posts.map((p) => p.capturedAt).filter(Boolean).sort() as string[];
  const boundary = stream?.captureBoundary ?? null;

  // Hashtag filters: the stream's own top tags + NONE CARRIED (frame pattern).
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of posts) for (const t of p.hashtags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  }, [posts]);
  const shown = tag === "ALL" ? posts
    : tag === "NONE CARRIED" ? posts.filter((p) => p.hashtags.length === 0)
    : posts.filter((p) => p.hashtags.includes(tag));

  const factRow = (k: string, v: React.ReactNode, vColor = INK) => (
    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, ...mono(9) }}>
      <span style={{ color: FAINT }}>{k}</span>
      <span style={{ color: vColor, textAlign: "right" }}>{v}</span>
    </div>
  );
  const footnote = (t: string) => (
    <div style={{ ...mono(8.5, FAINT2, "0.13em"), lineHeight: 1.7, marginTop: -6 }}>{t}</div>
  );

  return (
    <AppLayout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: narrow ? "0 0 44px" : "0 26px 44px" }}>

        {/* breadcrumb row (frame) — rank/confirmation only when the list passed them */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", padding: "20px 0 14px", ...mono(9.5, FAINT2, "0.18em") }}>
          <Link to="/social" style={{ ...mono(9.5, DIM, "0.18em"), textDecoration: "none" }}>← THE PUBLIC CONVERSATION</Link>
          {linkState.rank != null && linkState.rankOf != null ? (<><span>·</span><span>RANK {num(linkState.rank)} OF {num(linkState.rankOf)}</span></>) : null}
          {linkState.corpusConfirmed ? (<><span>·</span><span>CONFIRMED CORPUS MATCH</span></>) : null}
        </div>

        {/* voice header card */}
        <div style={{ border: `1px solid ${LINE.l1}`, background: GROUND.g1, display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 320px" }}>
          <div style={{ padding: narrow ? "20px 18px" : "26px 28px 24px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ ...serif(narrow ? 24 : 30, INK, 1.15), letterSpacing: "0.01em" }}>
                {profile?.displayName || `@${handle}`}
              </span>
              {profile?.displayName ? <span style={{ ...mono(11, DIM, "0.04em") }}>@{handle}</span> : null}
              {linkState.corpusConfirmed ? (
                <span style={{ ...mono(8.5, GOLD, "0.16em"), border: "1px solid rgba(216,169,73,0.35)", background: "rgba(216,169,73,0.06)", padding: "4px 8px" }}>
                  MATCHED TO CORPUS · CONFIRMED BY A PERSON
                </span>
              ) : null}
            </div>

            <div style={{ ...mono(8.5, FAINT2, "0.18em"), marginTop: 22 }}>PROFILE, VERBATIM</div>
            {profile ? (
              profile.bio ? (
                <>
                  <div style={{ ...mono(12, MID, "0.01em"), lineHeight: 1.75, marginTop: 8 }}>&ldquo;{profile.bio}&rdquo;</div>
                  <div style={{ ...mono(8.5, FAINT2, "0.16em"), marginTop: 7 }}>TYPED BY THE ACCOUNT · REPRODUCED WITHOUT CORRECTION</div>
                </>
              ) : (
                <div style={{ ...mono(12, FAINT2, "0.01em"), lineHeight: 1.75, marginTop: 8 }}>— BIO EMPTY. WE HAVE NOTHING TO QUOTE AND WE ARE NOT INFERRING A ROLE.</div>
              )
            ) : (
              <div style={{ ...mono(12, FAINT2, "0.01em"), lineHeight: 1.75, marginTop: 8 }}>— NO PROFILE ON FILE. POSTS WERE CAPTURED; THE PROFILE READ FAILED AND WAS NEVER RETRIED.</div>
            )}

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${HAIR}`, ...serif(15, COOL.prose, 1.7), textWrap: "pretty" as const }}>
              These are the {num(n)} post{n === 1 ? "" : "s"} we captured from this account — each one a single read taken
              at capture time, not a live feed, and not everything the account has posted.
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["ENGAGEMENT · READ ONCE AT CAPTURE · NO TIMESTAMP",
                "REPOSTS · A COUNT, WITH NO RECORD OF WHO MADE THEM",
                "CAPTURE · PARTIAL BY CONSTRUCTION"].map((t) => (
                <div key={t} style={{ borderLeft: "2px solid rgba(160,127,52,0.55)", padding: "6px 12px", background: GROUND.g0, ...mono(9, DIM, "0.14em") }}>{t}</div>
              ))}
            </div>
          </div>

          {/* fact rail */}
          <div style={{ borderLeft: narrow ? "none" : `1px solid ${LINE.l1}`, borderTop: narrow ? `1px solid ${LINE.l1}` : "none", padding: narrow ? "20px 18px" : "26px 24px", display: "flex", flexDirection: "column", gap: 13 }}>
            {factRow("POSTS CAPTURED", num(n))}
            {factRow("ORIGINAL · REPLY", `${num(orig)} · ${num(n - orig)}`)}
            {factRow("RESPONSE RECEIVED", respPresent.length ? `${anyEngPartial ? "≥ " : ""}${num(resp)}` : "NOT CAPTURED", GOLD)}
            {factRow("LIKE · REPLY · REPOST · QUOTE",
              [likesT, repliesT, repostsT, quotesT].map((t) => t ? t.label : "—").join(" · "))}
            {anyEngPartial ? footnote("SOME FIGURES NOT CAPTURED · TOTALS ARE FLOORS, NOT COUNTS") : null}
            {factRow("FOLLOWERS · UNDATED", profile ? (profile.followerCount != null ? num(profile.followerCount) : "NOT ON RECORD") : "NO PROFILE ON FILE")}
            {footnote("READ ONCE · DATE NOT RECORDED · NOT A GROWTH FIGURE")}
            {linkState.corpusConfirmed != null
              ? factRow("CORPUS MATCH", linkState.corpusConfirmed ? "CONFIRMED BY A PERSON" : "UNMATCHED", linkState.corpusConfirmed ? AMBER : INK)
              : null}
            {factRow("CAPTURED VIA", viaList.length ? viaList.join(" · ") : "—", BRONZE)}
            {factRow("CAPTURE WINDOW", stamps.length ? `${fmtDay(stamps[0])} – ${fmtDay(stamps[stamps.length - 1])}` : "NOT RECORDED")}
            {footnote(stamps.length
              ? "STAMPED AT WRITE TIME · EARLIER CAPTURES CARRY NO TIME"
              : boundary
                ? `CAPTURE TIME NOT RECORDED BEFORE ${fmtDay(boundary)}`
                : "CAPTURE-TIME RECORDING HAS NOT PRODUCED ITS FIRST STAMP")}
          </div>
        </div>

        {/* stream header + hashtag filters */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: 28, paddingBottom: 10, borderBottom: `1px solid ${HAIR}` }}>
          <div style={{ ...mono(9.5, DIM, "0.18em") }}>
            THE POST STREAM · REVERSE CHRONOLOGICAL BY POSTED_AT · {tag === "ALL"
              ? `${num(shown.length)} SHOWN OF ${num(n)} CAPTURED`
              : `${num(shown.length)} SHOWN · FILTERED BY ${tag.toUpperCase()} · ${num(n)} CAPTURED`}
          </div>
          {n > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["ALL", ...tagCounts, "NONE CARRIED"].map((t) => {
                const on = tag === t;
                return (
                  <span key={t} onClick={() => setTag(t)}
                    style={{ cursor: "pointer", ...mono(9, on ? GOLD : DIM, "0.14em"), padding: "5px 10px", border: `1px solid ${on ? "rgba(216,169,73,0.4)" : LINE.l2}`, background: GROUND.g0 }}>
                    {t === "ALL" ? "ALL POSTS" : t.toUpperCase()}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
        <div style={{ ...mono(8.5, FAINT2, "0.14em"), padding: "10px 0 18px" }}>
          EVERY FIGURE BELOW COMES FROM THIS ACCOUNT&rsquo;S OWN POSTS · TEXT QUOTED IN FULL, UNEDITED
        </div>

        {/* the stream */}
        {loading ? (
          <div style={{ ...mono(10, FAINT), padding: "30px 0" }}>LOADING STREAM…</div>
        ) : n === 0 ? (
          <div style={{ border: `1px dashed ${LINE.l2}`, padding: "26px 28px", ...serif(15, MID, 1.6), fontStyle: "italic" }}>
            No posts captured for this voice. Capture is query-driven — absence here is a fact about our queries, not about the account.
          </div>
        ) : (
          shown.map((p, idx) => {
            const carried = p.hashtags.filter((t) => t.toLowerCase() !== (p.capturedViaQuery ?? "").toLowerCase());
            return (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: narrow ? "52px 1fr" : "78px 1fr", borderTop: `1px solid ${LINE.l0}`, padding: "22px 0" }}>
                <div style={{ paddingRight: 16 }}>
                  <div style={{ ...serif(narrow ? 18 : 22, FAINT2, 1) }}>{String(idx + 1).padStart(2, "0")}</div>
                  <div style={{ ...mono(8, FAINT2, "0.14em"), marginTop: 5 }}>OF {num(shown.length)}</div>
                </div>
                <div>
                  <div style={{ ...serif(narrow ? 15 : 16.5, "#f0ece4", 1.72), textWrap: "pretty" as const, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.text}</div>
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", ...mono(8.5, FAINT2, "0.14em") }}>
                    <span>@{handle}</span><span>·</span>
                    <span>POSTED {fmtDay(p.postedAt)}</span><span>·</span>
                    {p.isReply ? (<><span style={{ color: FAINT }}>REPLY</span><span>·</span></>) : null}
                    <EngagementMeta p={p} />
                    {carried.length ? (<><span style={{ color: GOLD }}>CARRIES {carried.join(" ")}</span><span>·</span></>) : null}
                    <span>QUOTED IN FULL, UNEDITED</span>
                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ ...mono(8.5, BRONZE, "0.14em"), textDecoration: "none", marginLeft: "auto" }}>VIEW ON SOURCE ↗</a>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* closing prose — partial-by-construction + the no-second-date rule */}
        {!loading && n > 0 ? (
          <div style={{ borderTop: `1px solid ${LINE.l1}`, marginTop: 26, paddingTop: 20, display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: narrow ? 20 : 36 }}>
            <div style={{ ...serif(14.5, MID, 1.75), textWrap: "pretty" as const }}>
              End of the captured stream — {num(n)} post{n === 1 ? "" : "s"}, not the account&rsquo;s complete output.
              An account with one captured post here is not a quiet account; it is an account we read once.
            </div>
            <div style={{ ...serif(14.5, MID, 1.75), textWrap: "pretty" as const }}>
              {stamps.length
                ? "Capture times are stamped at write time for newer reads; older reads carry none. Nothing on this page is dated twice, so nothing on this page is a trend."
                : boundary
                  ? `None of these posts carries a recorded capture time — recording began ${fmtDay(boundary).toLowerCase()} and never backfills. Nothing on this page is dated twice, so nothing on this page is a trend.`
                  : "None of these posts carries a recorded capture time, and capture-time recording has not produced its first stamp. Nothing on this page is dated twice, so nothing on this page is a trend."}
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
