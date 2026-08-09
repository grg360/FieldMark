// Shared captured-post row — extracted 2026-08-08 from SocialSearch's hit row
// (which was built to the voice-page row rules). Used by search results and
// the Social surface's LATEST stream. The voice page keeps its own ordinal
// variant (one-identity stream; structurally different by design).
//
// NULL-HONESTY (binding): engagement nulls render "LIKES —" /
// ENGAGEMENT NOT CAPTURED, never zero-filled — a null figure ("not captured")
// and a zero ("captured, had none") are different facts. is_reply always
// renders the REPLY chip: a reply lifted from its thread reads as a
// standalone claim without it.

import { Link } from "react-router-dom";
import { FONT, LINE, COOL } from "../lib/designTokens";

const BRONZE = "#a07f34";
const INK = COOL.ui, MID = COOL.muted, DIM = COOL.chromeStrong, FAINT = COOL.label, FAINT2 = COOL.faint;

const mono = (s: number, c: string = DIM, ls = "0.14em") => ({ fontFamily: FONT.mono, fontSize: s, letterSpacing: ls, color: c });
const serif = (s: number, c: string = COOL.prose, lh = 1.6) => ({ fontFamily: FONT.serif, fontSize: s, lineHeight: lh, color: c });
const num = (n: number) => n.toLocaleString("en-US");
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

export interface CapturedPostRow {
  id: string;
  handle: string; // lowercase — the /social/voice/:handle key
  displayName: string | null;
  text: string;
  postedAt: string;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  isReply: boolean;
  sourceUrl: string;
  voicePath: string;
}

export function EngagementMeta({ post }: { post: Pick<CapturedPostRow, "likes" | "replies" | "reposts" | "quotes"> }) {
  const metrics: Array<[string, string, number | null]> = [
    ["LIKE", "LIKES", post.likes],
    ["REPLY", "REPLIES", post.replies],
    ["REPOST", "REPOSTS", post.reposts],
    ["QUOTE", "QUOTES", post.quotes],
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

export default function SocialPostRow({ post, narrow }: { post: CapturedPostRow; narrow: boolean }) {
  return (
    <div style={{ borderBottom: `1px solid ${LINE.l0}`, padding: "20px 2px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 9 }}>
        <Link to={post.voicePath} style={{ ...serif(narrow ? 15 : 17, INK, 1.3), textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.14)" }}>
          {post.displayName || `@${post.handle}`}
        </Link>
        {post.displayName ? (
          <Link to={post.voicePath} style={{ color: BRONZE, fontSize: 11.5, textDecoration: "none" }}>@{post.handle}</Link>
        ) : null}
        {post.isReply ? (
          <span style={{ ...mono(8, FAINT, "0.14em"), border: `1px dashed ${LINE.l2}`, padding: "2px 6px" }}>REPLY · PART OF SOMEONE ELSE&rsquo;S THREAD</span>
        ) : null}
      </div>
      <div style={{ ...serif(narrow ? 14.5 : 16, "#f0ece4", 1.7), textWrap: "pretty" as const, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.text}</div>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", ...mono(8.5, FAINT2, "0.14em") }}>
        <span>POSTED {fmtDay(post.postedAt)}</span><span>·</span>
        <EngagementMeta post={post} />
        <span>QUOTED IN FULL, UNEDITED</span>
        <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ ...mono(8.5, BRONZE, "0.14em"), textDecoration: "none", marginLeft: "auto" }}>VIEW ON SOURCE ↗</a>
      </div>
    </div>
  );
}
