// Social search — keyword search over CAPTURED tweet text, rendered in the
// Social surface header area (search lives in surface headers, post-NavBar).
// Sits in SocialPage ABOVE PublicConversation; the frozen v4 conversation
// file is untouched. While a query is active the results panel renders in
// place of the conversation (SocialPage owns that swap via onActiveChange).
//
// NON-NEGOTIABLE COPY (review 2026-08-08): every result set states the corpus
// truth — this searches OUR CAPTURE, not the platform. Zero results is a fact
// about capture, never "this was never discussed".
//
// NULL-HONESTY (same discipline as the voice page — the ?? 0 trap):
//  - engagement nulls render "LIKES —" / ENGAGEMENT NOT CAPTURED, never 0
//  - is_reply renders a REPLY marker: a reply lifted from its thread reads as
//    a standalone claim without it.

import { useEffect, useRef, useState } from "react";
import { FONT, GOLD as GOLD_T, GROUND, LINE, COOL } from "../lib/designTokens";
import { searchCapturedPosts } from "../lib/socialSearch";
import SocialPostRow from "./SocialPostRow";
import type { CapturedPostRow } from "./SocialPostRow";

const GOLD = "#d8a949", BRONZE = "#a07f34";
const INK = COOL.ui, MID = COOL.muted, DIM = COOL.chromeStrong, FAINT = COOL.label, FAINT2 = COOL.faint;

const mono = (s: number, c: string = DIM, ls = "0.14em") => ({ fontFamily: FONT.mono, fontSize: s, letterSpacing: ls, color: c });
const serif = (s: number, c: string = COOL.prose, lh = 1.6) => ({ fontFamily: FONT.serif, fontSize: s, lineHeight: lh, color: c });
const num = (n: number) => n.toLocaleString("en-US");

const PAGE = 50;

export default function SocialSearch({
  taSlug,
  taLabel,
  narrow,
  onActiveChange,
}: {
  taSlug: string;
  taLabel: string;
  narrow: boolean;
  onActiveChange: (active: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState<string | null>(null); // the submitted query
  const [hits, setHits] = useState<CapturedPostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const active = term != null;
  useEffect(() => { onActiveChange(active); }, [active, onActiveChange]);

  const run = async (t: string, offset: number) => {
    const mySeq = ++seq.current;
    setLoading(true);
    const res = await searchCapturedPosts(t, taSlug, PAGE, offset);
    if (seq.current !== mySeq) return; // a newer query superseded this one
    setTotal(res.total);
    setHits((cur) => (offset === 0 ? res.hits : [...cur, ...res.hits]));
    setLoading(false);
  };

  const submit = () => {
    const t = input.trim();
    if (t.length < 2) return;
    setTerm(t);
    setHits([]);
    void run(t, 0);
  };
  const clear = () => { setTerm(null); setInput(""); setHits([]); setTotal(0); };

  return (
    <div style={{ paddingBottom: active ? 0 : 18 }}>
      {/* the box — surface header position */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: narrow ? "14px 16px" : "16px 0" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") clear(); }}
          placeholder={`Search captured ${taLabel} posts…`}
          style={{
            flex: "1 1 260px", maxWidth: 460, background: GROUND.g0, color: INK,
            border: `1px solid ${LINE.l2}`, padding: "9px 12px",
            fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: "0.04em", outline: "none",
          }}
        />
        <span onClick={submit} style={{ cursor: "pointer", ...mono(9.5, GOLD, "0.16em"), border: "1px solid rgba(216,169,73,0.4)", padding: "8px 14px" }}>SEARCH</span>
        {active ? <span onClick={clear} style={{ cursor: "pointer", ...mono(9.5, FAINT, "0.16em"), padding: "8px 4px" }}>CLEAR × BACK TO THE CONVERSATION</span> : null}
        {!active ? <span style={mono(8.5, FAINT2, "0.12em")}>SEARCHES OUR CAPTURE · AND-TERMS · &quot;QUOTED PHRASES&quot; · -EXCLUSIONS</span> : null}
      </div>

      {active ? (
        <div style={{ paddingBottom: 44 }}>
          {/* corpus-truth header — NON-NEGOTIABLE copy */}
          <div style={{ borderTop: `2px solid ${BRONZE}`, borderBottom: `1px solid ${LINE.l1}`, padding: "13px 2px", ...mono(9.5, DIM, "0.16em"), lineHeight: 1.7 }}>
            {loading && hits.length === 0
              ? `SEARCHING OUR CAPTURE FOR “${term.toUpperCase()}”…`
              : total > 0
                ? `${num(total)} POST${total === 1 ? "" : "S"} MENTION${total === 1 ? "S" : ""} “${term.toUpperCase()}” IN WHAT WE'VE CAPTURED — THIS SEARCHES OUR CAPTURE, NOT THE PLATFORM`
                : `NO CAPTURED POST MENTIONS “${term.toUpperCase()}” — ABSENCE HERE IS A FACT ABOUT OUR CAPTURE, NOT ABOUT THE CONVERSATION`}
          </div>

          {total === 0 && !loading ? (
            <div style={{ padding: "24px 2px", ...serif(14.5, MID, 1.7), fontStyle: "italic", maxWidth: 720 }}>
              Capture is query-driven: we hold {taLabel} posts that matched our tracked hashtags and topics.
              A term missing here may be all over the platform — we simply never read it.
            </div>
          ) : null}

          {hits.map((h) => <SocialPostRow key={h.id} post={h} narrow={narrow} />)}

          {hits.length < total ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
              <span onClick={() => term && void run(term, hits.length)} style={{ cursor: "pointer", ...mono(9.5, GOLD_T.gold, "0.16em") }}>
                {loading ? "LOADING…" : `LOAD NEXT ${Math.min(PAGE, total - hits.length)} ↓`}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
