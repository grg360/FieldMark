// The country flag as an inline glyph beside a name.
//
// SIZED TO ITS NEIGHBOUR, NOT TO A CONSTANT. The ledger's flag is 12x9 because
// it sits against a 10px mono chip; a profile hero name is 30px serif, and the
// same 9px flag there reads as a speck stuck to a headline. Callers pass the
// HEIGHT they want and the width follows at 4:3, so one component serves both
// registers without either inheriting the other's proportions.
//
// INLINE, NOT A FLEX ITEM. Both profile heroes render the name as inline text
// inside a <span> or a block <div> — neither is a flex row, so alignSelf has
// nothing to act on. verticalAlign: "middle" is what centres the flag against
// the name's own line box, and it works in both containers and in a flex row.
//
// alt="" + aria-hidden on purpose: the flag is RECOGNITION, never the only
// carrier of the fact. Where a caller has no visible country text beside it,
// the flag is decoration and a screen reader should skip it rather than
// announce a country the sighted reader cannot see either.
import { flagSrc } from "../lib/countryFlag";

export interface CountryFlagProps {
  /** ISO-2 country code. A code with no vendored asset renders nothing —
   *  never a placeholder, never a broken <img>. MUST be a country-only field:
   *  14 US state codes collide with a real flag (CA, DE, GA, IN, LA, MO, PA,
   *  ID, MA, PR ...), so a slot that can hold a state must not be passed here. */
  code: string | null | undefined;
  /** Rendered height in px. Width is derived at 4:3. */
  height: number;
  /** Gap from the preceding text. */
  marginLeft?: number;
}

export default function CountryFlag({ code, height, marginLeft = 10 }: CountryFlagProps) {
  const src = flagSrc(code);
  if (!src) return null;
  const width = Math.round((height * 4) / 3);
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={width}
      height={height}
      style={{ width, height, verticalAlign: "middle", marginLeft, flexShrink: 0 }}
    />
  );
}
