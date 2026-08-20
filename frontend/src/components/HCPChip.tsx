// HCPChip — the ONE object for a person, anywhere their name appears.
// Spec: claude.ai/design project "HCP Chip Spec" (220061d3), HCP Chip Spec.dc.html.
//
// CONTENT IS CANONICAL AND CLOSED: name · cohort · rank. Nothing else ever goes
// inside the chip. Context metadata (trial counts, portfolio position, practice
// state, institution) is real information, but it belongs to the CONTEXT, so it
// renders as text BESIDE the chip — otherwise the same person reads as a
// different object on every surface, which is the thing this component exists
// to end.
//
// Three deliberate departures from the spec plate, all flagged in the build report:
//   1. The plate was drawn against pre-canonical marker hues (its EST green was
//      #63c294). This implementation derives every cohort value from the
//      platform's canonical MARK tokens instead, so the chip cannot drift from
//      the cohort colour used by the ledger, the profiles and the row rails.
//      The spec's RULES are followed exactly; only the source of the hue moves.
//   2. Fill lands at OKLCH L .24 rather than the prose's "L≈28". At .28 the
//      derived EST rank ink reads 3.99:1 on its own fill — under AA for 10px
//      text — because our MARK.EST is a more muted green than the plate's. L.24
//      puts all three cohorts at 4.5:1+ while keeping the fill "just above the
//      charcoal, not on top of it", which is what the prose is protecting.
//   3. The name sits at T.LABEL (11), not T.META (13), at an explicit weight
//      400. 2026-08-13: at 13 the chip read LOUD in aggregate — a portfolio
//      wall of forty of them shouted, which is the opposite of "people-first,
//      cohort-second". T.LABEL is the real step down (the scale's META band
//      absorbs 12–13.5, so 12 would have been no step at all) and the scale
//      names chips in LABEL's own definition. This puts the name 1px off the
//      10px rank tag, so the two are told apart by FACE and INK — Newsreader at
//      L.94 tinted against Plex Mono at the raw marker — rather than by size.
//      That is the intended reading order: person first, then cohort, quietly.

import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CANON, FACE, T } from "../lib/canonicalTokens";

export type ChipCohort = "established" | "rising" | "community" | null;

// ── cohort derivation ────────────────────────────────────────────────────────
// OKLCH round-trip so fill and name-ink are DERIVED from the marker, never
// hand-mixed. Re-temperature a marker and the chip follows for free — the same
// contract DEPTH has with the ground ramp.
function toOklch(hex: string): { L: number; C: number; H: number } {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s2;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s2;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s2;
  return { L, C: Math.hypot(a, bb), H: Math.atan2(bb, a) };
}
function fromOklch(L: number, C: number, H: number): string {
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const enc = (v: number) => {
    const c = Math.max(0, Math.min(1, v));
    const g = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(g * 255).toString(16).padStart(2, "0");
  };
  return `#${enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)}${enc(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  )}${enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)}`;
}
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const FILL_L = 0.24; // see departure (2) above
const NAME_L = 0.94; // near-white, cohort-TINTED — never #fff, never the marker
const NAME_C = 0.18; // fraction of the marker's chroma kept in the name ink

function skin(marker: string) {
  const o = toOklch(marker);
  return {
    marker,
    fill: fromOklch(FILL_L, o.C, o.H),
    name: fromOklch(NAME_L, o.C * NAME_C, o.H),
    hoverFill: fromOklch(FILL_L + 0.06, o.C, o.H),
    hoverName: fromOklch(0.97, o.C * NAME_C, o.H),
  };
}
const SKIN = {
  established: skin(CANON.MARK.EST),
  rising: skin(CANON.MARK.RS),
  community: skin(CANON.MARK.COM),
} as const;

/** Normalise whatever a surface calls a cohort into the chip's three slots.
 *  Anything unrecognised resolves to null, which is the unresolved state: chip
 *  shape kept, fill dropped. Defaulting an unknown cohort into a real slot would
 *  paint a person a cohort they do not hold.
 *
 *  RANKLESS IS NOT THE SAME AS UNRESOLVED (2026-08-20). The guard used to be
 *  `rank == null`, which was correct for the two ranked boards and wrong for the
 *  third: community is not ranked BY DESIGN -- home.ts:1352, "the chip wears the
 *  evidence-tier word, never a number" -- so every qualifying community member
 *  fell to null here and rendered UNRANKED, asserting they hold no board position
 *  when community_board_nsclc_v1 says they hold an anchored one. A tier is a
 *  position; pass it and the chip keeps its COM fill. */
export function toChipCohort(raw: string | null | undefined, rank?: number | null, tier?: string | null): ChipCohort {
  if (rank == null && tier == null) return null;
  switch (raw) {
    case "established":
      return "established";
    case "rising":
    case "rising_star":
      return "rising";
    case "community":
      return "community";
    default:
      return null;
  }
}

const COHORT_TAG: Record<Exclude<ChipCohort, null>, string> = {
  established: "EST",
  rising: "RS",
  community: "COM",
};

// Community wears its evidence tier where the ranked boards wear a number.
// Mirrors COM_RAIL_TIER_WORD (Cohorts/CohortLedger.tsx) so the chip and the
// community rail cannot drift into two vocabularies for one fact.
//
// `unresolved` is deliberately absent. The rail renders it "no medicare
// evidence", which is five words and will not fit a chip -- and it is not a
// tier claim anyway, it is the absence of one. It falls through to the bare
// COM tag below, which is the honest reading.
const TIER_TAG: Record<string, string> = {
  anchored: "ANCHORED",
  supported: "SUPPORTED",
  heme_dominant: "HEME-FOCUSED",
  candidate: "CANDIDATE",
};

/** The ledger's tracked bookmark — same glyph, same amber, everywhere. 7×10.
 *  ON is the ledger's solid amber. OFF is the ledger's outline, dropped to a
 *  whisper: the untracked mark is an AFFORDANCE, not a datum, and the chips
 *  were just deliberately quietened. It has to be findable by a thumb without
 *  reading as a second piece of content on every name in a 39-chip wall, so it
 *  carries no fill and a hairline stroke at low alpha. */
function Bookmark({ on, quiet = false, lit = false }: { on: boolean; quiet?: boolean; lit?: boolean }) {
  // QUIET is for contexts where tracked is a GIVEN, not news — a portfolio of
  // none-but-tracked people, where 39 solid marks discriminate nothing and just
  // put weight back into a wall we spent a pass taking it out of. The mark stays
  // amber and stays tappable; it drops to an outline so it reads as a control at
  // rest rather than a datum, and fills on hover so it still answers when
  // reached for. Touch has no hover, so the resting state must already be
  // findable — hence amber outline, not the untracked white one.
  const solid = on && (!quiet || lit);
  return (
    // No alignSelf: the chip's container centres every child now. A local
    // override here is what let the container keep the wrong alignment.
    <svg width="7" height="10" viewBox="0 0 7 10" aria-hidden style={{ flex: "none", display: "block" }}>
      <path
        d="M0.5 0.5h6v9l-3-2.1-3 2.1z"
        fill={solid ? GOLD_TRACK : "none"}
        stroke={solid ? GOLD_TRACK : on ? GOLD_QUIET : "rgba(255,255,255,.30)"}
        strokeWidth={solid ? 1 : 0.9}
        strokeLinejoin="round"
        style={{ transition: "fill .12s ease, stroke .12s ease" }}
      />
    </svg>
  );
}
const GOLD_TRACK = "#E89921";
const GOLD_QUIET = "rgba(232,153,33,.55)";

/** Invisible hit padding around the chip, cancelled by an equal negative
 *  margin. The outer span's maxWidth adds 2*HIT back, so the VISIBLE chip
 *  clamps to exactly 100% of its container — see the note at the outer span. */
const HIT = 4;

export interface HCPChipProps {
  hcpId: string;
  name: string;
  /** null → unresolved/unranked: the chip keeps its SHAPE and loses its FILL. */
  cohort?: ChipCohort;
  /** Omit or null when the person carries no rank on this board. */
  rank?: number | null;
  /** Community's evidence tier. Community is not ranked, so this is what the
   *  chip shows in the rank slot -- never alongside a number. */
  tier?: string | null;
  /** The rank this person LAST held on a board they have since left, with the
   *  snapshot date it was true on. NOT printed on the chip -- it suppresses the
   *  rank slot entirely and moves the fact to the hover. Without it a de-listed
   *  person is indistinguishable from one who was never ranked, and the chip
   *  asserts the second. See rankText. */
  priorRank?: number | null;
  priorLadder?: "RS" | "EST" | null;
  priorAsOf?: string | null;
  tracked?: boolean;
  /** Wire this and the bookmark becomes the track/untrack control: solid amber
   *  when tracked, a faint outline when not. WITHOUT it the chip keeps its old
   *  behaviour exactly — bookmark shown only when tracked, and inert — so a
   *  surface that has no tracking action never grows a dead affordance. */
  onToggleTracked?: () => void;
  /** "quiet" for surfaces where EVERY chip is tracked — the mark carries no
   *  information there, so it steps back to an amber outline and lights on
   *  hover. Leave it "full" anywhere tracked-vs-untracked actually discriminates. */
  bookmarkTone?: "full" | "quiet";
  style?: CSSProperties;
}

export default function HCPChip({ hcpId, name, cohort = null, rank = null, tier = null, priorRank = null, priorLadder = null, priorAsOf = null, tracked = false, onToggleTracked, bookmarkTone = "full", style }: HCPChipProps) {
  const [hover, setHover] = useState(false);
  const [markHover, setMarkHover] = useState(false);
  const s = cohort ? SKIN[cohort] : null;
  // Unresolved keeps the box and the border and drops the fill — absence of a
  // cohort is information, so it is SHOWN, not hidden behind a neutral pill.
  const fill = s ? s.fill : "transparent";
  const edge = s ? rgba(s.marker, 0.32) : CANON.LINE.EDGE;
  const nameInk = s ? s.name : CANON.INK.BODY;
  const rankInk = s ? s.marker : CANON.INK.MUTE;
  // Four states. Three print something; the fourth prints NOTHING, on purpose.
  //   ranked      -> "RS 5"
  //   tiered      -> "ANCHORED"   community holds a position, just not a number
  //   de-listed   -> null         name alone, no tag, no fill -- see below
  //   never ranked-> "UNRANKED"   which now means exactly what it says
  //
  // WHY DE-LISTED PRINTS NOTHING (2026-08-20). It briefly printed "WAS RS 5".
  // That is a true fact and the wrong one for this surface: the portfolio is
  // about who you are tracking NOW, and a rank someone held a fortnight ago is
  // noise competing with the live ranks beside it. The fact the reader needs is
  // "not on a board today", and an empty rank slot on a chip whose neighbours
  // all carry one states that without spending a word. History is not discarded
  // -- it moves to the hover, which is where history belongs.
  //
  // UNRANKED IS STILL REACHABLE and still correct: it is the terminal fallback
  // for someone with no rank, no tier and no prior rank. Trials depends on that
  // reading (lib/trials.ts:282, "genuinely unranked -- UNRANKED is the truth").
  // What changed is that it can no longer be reached by someone who WAS ranked.
  const rankText =
    cohort && rank != null ? `${COHORT_TAG[cohort]} ${rank}`
    : tier ? TIER_TAG[tier] ?? "COM"
    : priorRank != null && priorLadder ? null
    : "UNRANKED";
  // The whole de-listing fact, carried on hover. priorAsOf is the date the rank
  // was last true, NOT today.
  const rankTitle =
    priorRank != null && priorLadder && priorAsOf
      ? `${priorLadder === "RS" ? "Rising Star" : "Established"} US #${priorRank} as of ${priorAsOf} — no longer on the board`
      : undefined;
  // Tracked is INFORMATION and always shows. The untracked outline is an
  // AFFORDANCE and only shows where tracking is actually wired.
  const showBookmark = tracked || !!onToggleTracked;
  const on = s && hover;

  return (
    // HIT px of invisible hit padding, negative-margined so it never disturbs
    // layout — which is exactly what the old maxWidth:"100%" tripped over. The
    // -HIT pulls the MARGIN box 2*HIT inside the border box; a shrink-to-fit
    // parent takes its width from that margin box; and a plain 100% then
    // resolved against the already-shortened figure, clamping the chip 8px
    // narrower than its own content. Every affected name lost exactly 8px
    // regardless of length (measured: 37 of 39 portfolio chips — "Jacob Sa…",
    // "Jia …").
    //
    // Adding the padding back into the limit is the whole fix. The chip's
    // BORDER box may reach parent + 2*HIT, so its VISIBLE box lands on exactly
    // 100% of the parent: no bite on a normal name, and a genuinely too-long
    // one still clamps to the container and ellipsises instead of running past
    // the rail edge (dropping the limit outright overflowed a 318px rail by
    // 62px and made the row scroll sideways — checked, 2026-08-13). The two
    // numbers are derived from one constant so they cannot drift apart.
    <span style={{ display: "inline-flex", padding: HIT, margin: -HIT, maxWidth: `calc(100% + ${HIT * 2}px)`, ...style }}>
      {/* The VISUAL chip. It used to be the <Link> itself, but the bookmark is
          now a control, and a button inside an anchor is invalid, unreachable
          content: the box moved out here so the two hit targets are SIBLINGS
          rather than nested. The link still covers the name and the rank, which
          is all of the chip a reader aims at. */}
      <span
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "inline-flex",
          // CENTER, never BASELINE. The chip holds two faces with different
          // metrics (Newsreader name, Plex Mono rank). Baseline-locking them
          // makes the flex line grow to the UNION of two unequal boxes, so
          // whichever item has less descent below the shared baseline — the
          // 10px mono tag — ends up flush to the top with all the leftover
          // slack under it (measured 1.71px). That is the top-anchoring, and
          // it is the same defect that hit the community ledger rows and the
          // Institutions roster. It kept coming back because it was patched one
          // element at a time (see the Bookmark's retired alignSelf) instead of
          // at the container that actually chooses the alignment.
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          // Symmetric. The old "3px 8px 4px" put 1px more under the content,
          // biasing everything up half a pixel — which is why even the
          // already-centered bookmark sat high.
          padding: "3px 8px",
          borderRadius: 3,
          textDecoration: "none",
          background: on ? s!.hoverFill : fill,
          border: `1px solid ${on ? rgba(s!.marker, 0.55) : edge}`,
          // The emboss: top edge lifted, inset highlight, 1px black drop. This
          // is what makes a 22px box read raised and pressable.
          borderTopColor: on ? "rgba(255,255,255,.26)" : "rgba(255,255,255,.17)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 1px 0 rgba(0,0,0,.4)",
          fontFamily: FACE.value,
          // The chip's register is T.LABEL, not T.META — see departure (3).
          fontSize: T.LABEL,
          // FIXED px, not unitless. A unitless 1.15 resolves against each
          // child's OWN font-size, so the 11px name got a 12.65px box and the
          // 10px rank got an 11.5px one — two different boxes to centre, which
          // is a metric mismatch no alignment value can reconcile. One px value
          // gives both faces the same box, so centring them actually levels
          // them.
          lineHeight: "13px",
          color: on ? s!.hoverName : nameInk,
          transition: "background .12s ease, border-color .12s ease, color .12s ease",
        }}
      >
        {/* LEADING bookmark (the spec's recommended placement): tracked people
            are findable by scanning one column of amber ticks down the left rag.
            The hit area is padded WELL past the 7×10 glyph and pulled back with
            an equal negative margin, so it costs the layout nothing. The bleed
            is deliberately asymmetric — generous left and vertical, tight on the
            right — because the only thing it must never swallow is the name,
            which starts immediately to its right. Vertical bleed is held to the
            row gap so a thumb aiming at row 2 cannot land on row 1's bookmark. */}
        {showBookmark ? (
          onToggleTracked ? (
            <span
              role="button"
              tabIndex={0}
              aria-pressed={tracked}
              aria-label={tracked ? `Untrack ${name}` : `Track ${name}`}
              title={tracked ? "Tracked — click to untrack" : "Track this HCP"}
              onClick={(e) => {
                // Both are needed: stopPropagation keeps the row/card handlers
                // out of it, preventDefault keeps the sibling link from being
                // followed when a surface wraps the whole chip in one.
                e.preventDefault();
                e.stopPropagation();
                onToggleTracked();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                onToggleTracked();
              }}
              onMouseEnter={() => setMarkHover(true)}
              onMouseLeave={() => setMarkHover(false)}
              onFocus={() => setMarkHover(true)}
              onBlur={() => setMarkHover(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                flex: "none",
                cursor: "pointer",
                padding: "7px 5px 7px 8px",
                margin: "-7px -5px -7px -8px",
                // Touch devices otherwise fire a 300ms-delayed synthetic click
                // and paint a tap flash over the glyph.
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Bookmark on={tracked} quiet={bookmarkTone === "quiet"} lit={markHover} />
            </span>
          ) : (
            <Bookmark on={tracked} quiet={bookmarkTone === "quiet"} />
          )
        ) : null}
        {/* The name is held at regular weight EXPLICITLY, never by inheritance:
            an adopting surface with a bold context must not be able to make one
            person shout louder than another. Weight is not a channel this chip
            spends — cohort is the fill, rank is the ink, and the name is just
            the name. */}
        {/* top: 1 is a MEASURED optical trim, not a nudge. Centring both 13px
            boxes is exact (both land dead centre), but the two faces sit on
            different baselines INSIDE that shared box — Plex Mono's font box is
            taller than Newsreader's, so its half-leading is smaller and its
            baseline lands 1.14px lower. Boxes level, glyphs not. Moving the
            name down one pixel brings the two baselines within 0.14px AND puts
            both ink centres on the box centre. Baseline delta is the stable
            target here because it does not vary with the name's descenders,
            which per-string ink centring would. Re-measure if either face or
            either size changes. */}
        <Link
          to={`/hcp/${hcpId}`}
          title={rankTitle ? `${name} — ${rankTitle}` : rankText ? `${name} — ${rankText}` : name}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            textDecoration: "none",
            color: "inherit",
            font: "inherit",
            lineHeight: "13px",
            cursor: "pointer",
          }}
        >
          <span style={{ position: "relative", top: 1, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{name}</span>
          {rankText ? (
            <span
              style={{
                flex: "none",
                fontFamily: FACE.data,
                fontSize: 10,
                letterSpacing: ".06em",
                color: rankInk,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {rankText}
            </span>
          ) : null}
        </Link>
      </span>
    </span>
  );
}

/** Chips sit in a 6px-gap row. Context metadata goes BESIDE a chip, never in it. */
export function HCPChipRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 6, ...style }}>{children}</span>;
}
