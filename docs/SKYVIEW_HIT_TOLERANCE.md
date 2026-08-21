# SkyView hit tolerance — findings, no code changes

**Date:** 2026-08-20
**Surface:** `frontend/src/components/TelescopeField.tsx` (class `Sky`), route `/oncology/telescope/nsclc`
**Status:** MEASURED, NOT FIXED. Three findings below, all deliberately left in place — they are
after-demo work. The two things that *were* fixed on 2026-08-20 are recorded at the bottom for
context, because they change what the user sees but not what is described here.

Everything numeric below was produced by replicating `buildField()` exactly (same seed
`rngFrom(20260730)`, same institution clustering, same golden-angle member placement) against the
live `telescope_nsclc_nodes.json` / `telescope_nsclc_edges.json`, then running the real `hit()`
against the result. The field is 613 nodes (490 established + 123 rising) and 17,365 raw edges.

---

## 1. `hit()` is nearest-wins under a fixed screen-space cap

```tsx
hit(p: { x: number; y: number }) {
  let best = null, bd = 1e9; const rad = 58 / this._cam.z;
  this._targets.forEach((t) => { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; best = t; } });
  return bd < rad ? best : null;
}
```

Two properties that matter:

- **`58 / cam.z` is world units, so the tolerance is a constant 58 CSS pixels on screen** at every
  zoom. It does not tighten as you zoom in or loosen as you pull back.
- **It is a global nearest-neighbour search with a cap, not a per-star region.** The closest target
  in the entire field wins, and is discarded only if it is farther than the cap. There is no
  preference for a brighter, larger, labelled, focused or leader star, and no tie-breaking. A star
  drawn at radius 2.08px competes on exactly equal terms with one drawn at 17.65px.

The `op > 0.12` target filter cannot rescue this: `op` is a function of `focus`, `leaders`,
`cohort`, `density` and `near` only — it never reads the camera — and its floor for a
non-cohort-filtered star is 0.14. Effectively every star is always a candidate.

## 2. The rival distribution — how often the cap admits more than one candidate

Nearest-neighbour distance across all 613 nodes, in CSS px at `cam.z = 1`:

```
min 5.4   p10 34.2   p25 58.9   MEDIAN 91.4   p75 122.6   p90 163.3   max 333.5
```

| Nearest neighbour closer than | nodes | share |
|---|---|---|
| 58px (the cap) | 152 | 24.8% |
| 40px | 85 | 13.9% |
| 30px | 53 | 8.6% |
| 20px | 25 | 4.1% |
| 10px | 4 | 0.7% |

At `z = 1` that reads tolerably — a quarter of stars have a rival. **But the sky never sits at
`z = 1`.** `fitCam()` lands well below it, and because the cap is fixed in *screen* px it covers
`58 / z` *world* px, which is a far wider net at the framing users actually see:

| viewport | landing `z` | cap (world px) | mean rivals | max rivals | nodes with ≥1 rival |
|---|---|---|---|---|---|
| 1440×900 | 0.480 | 121 | 1.4 | 5 | **73.7%** |
| 1920×1080 | 0.591 | 98 | 0.8 | 4 | **58.1%** |
| 2560×1440 | 0.788 | 74 | 0.4 | 3 | 34.4% |
| 3840×2160 | 0.950 | 61 | 0.3 | 3 | 26.8% |

**On a 1080p touchscreen at the default framing, 58% of stars have a competitor inside the
tolerance.** Which one wins is decided by whichever centre is marginally nearer the contact point.

### The confirmed case

Reported: tapping Jonathan W. Riess selected Drew Moghanaki. Reproduced exactly.

| node | i | cohort | rank | world | radius | leader |
|---|---|---|---|---|---|---|
| Jonathan W. Riess | 162 | established | #189 | (3821.8, 501.0) | 2.08px | no |
| Jonathan W. Riess | 490 | rising | #28 | (3730.7, 660.6) | 17.65px | yes |
| Drew Moghanaki | 401 | established | #1146 | (4169.5, 87.9) | 2.08px | no |
| Drew Moghanaki | 565 | rising | #77 | (3956.9, 479.3) | 3.97px | no |

`Riess/established` and `Moghanaki/rising` are **136.8 world px apart**, so nearest-wins flips at
the midpoint, **68.4 world px**. Converted to what a finger sees:

| zoom | selection flips from Riess to Moghanaki at |
|---|---|
| 0.360 (zoom-out floor) | **25 CSS px** |
| 0.480 (1440×900 landing) | **33 CSS px** |
| 0.591 (1920×1080 landing) | **40 CSS px** |
| 0.788 (2560×1440 landing) | **54 CSS px** |

A finger contact patch is roughly 8–12 mm — **30–45 CSS px across**. At every landing zoom the flip
boundary falls *inside* the contact patch. Tapping the faint 2.08px established-Riess dot with a
centroid biased 40px toward Moghanaki returns Moghanaki, rank #77. No coordinate bug is required;
the geometry alone produces it, which is why it never reproduced with a mouse.

## 3. Pointer contact geometry is available and unused

`TelescopeField.tsx:21` imports React's `PointerEvent`, which carries the full Pointer Events
surface: `pointerType` (`"mouse"` / `"pen"` / `"touch"`), `width` and `height` (the contact patch in
CSS px), `pressure`, `tiltX`/`tiltY`, `isPrimary`, `pointerId`.

The component reads exactly one of them — `pointerId`, for `setPointerCapture` and the multi-touch
guard. `toWorld()` receives the event and discards everything but `clientX`/`clientY`:

```tsx
const sx0 = (ev.clientX - r.left) / r.width * VW, sy0 = (ev.clientY - r.top) / r.height * VH;
return { sx: sx0, sy: sy0, x: …, y: … };
```

`hit()` then receives only `{ x, y }`. **The information needed to tell a 1px mouse point from a
40px finger patch is destroyed one call upstream of the decision that needs it.** Nothing in the
file branches on `pointerType` anywhere.

Chrome on Windows touchscreens does populate `width`/`height` with real contact geometry rather than
the 1×1 default, so a patch-derived tolerance is available whenever this is picked up. Options not
evaluated here: patch-scaled tolerance, `pointerType`-gated tolerance, ranking candidates by drawn
radius instead of pure distance, or requiring the contact to land within the star's drawn glow.
That is a design decision, not a mechanical one.

## 4. 54 people are in the field twice

Independent of hit-testing, and sitting directly under the same symptom: **108 of the 613 nodes are
duplicate people** — 54 names each appear once from the established board and once from the rising
board, at unrelated world positions, with different ranks.

```
143.4px apart  Liza C. Villaruz     [established #700  | rising #95]
148.5px        Wade T. Iams         [established #535  | rising #16]
149.8px        Taher Abu Hejleh     [established #1875 | rising #37]
150.5px        Sandip Pravin Patel  [established #453  | rising #53]
160.5px        Rachel E. Sanborn    [established #1075 | rising #5]
163.0px        Catherine A. Shu     [established #463  | rising #18]
```

Both HCPs in the confirmed case are among them — Riess is #189 established *and* #28 rising;
Moghanaki is #1146 established *and* #77 rising.

Consequences worth being explicit about:

- "Selected the wrong star" can mean *the same person's other node*, showing a different cohort and
  a different rank, which reads as a data error to anyone in the room.
- The duplicates are close enough (143–163px for the tightest six) to be mutual rivals inside the
  `58 / z` cap at the landing zooms in §2.
- `buildField` places them independently because the institution cluster is keyed on
  `institution`, and each board row carries its own copy — there is no identity join across the two
  boards at layout time.

This is upstream of `TelescopeField`: it is a question about what the two board exports contain and
whether the sky should union them on `hcp_id`. Recorded here only because it is inseparable from the
symptom above.

---

## What was fixed on 2026-08-20 (not the above)

For context, so this document is not misread as describing current behaviour in full:

1. **Tap-vs-drag accumulator.** `_drag.moved` summed the offset from the pointerdown anchor on every
   `pointermove`, so it grew with the *number* of events rather than distance travelled; a
   stationary finger crossed the threshold in ~150ms and the tap was discarded. Now accumulates the
   incremental step; threshold raised 7 → 12. A multi-touch guard was added so a second finger
   cannot take over an in-progress drag.
2. **Label identity and legibility.** Label React keys moved from array index to the node's own
   identity (names no longer swap in place after a pan), and the chips gained a backing plate so
   edges stop reading through the letterforms.
3. **Labels select their own star.** The chips were `pointerEvents: "none"`, so a tap on a name fell
   through to the host and `hit()` resolved whatever star sat *under the name* — never the star the
   name belonged to, since a chip is offset 46px+ from its star and runs ~150px wide. Measured on
   the landing camera: **not one point on Riess's own plate selected Riess**; the plate centre
   selected Philip C. Mack (#594), the right edge Erica L. Carpenter (#1776), and the left half
   selected nothing at all (which also cleared any active focus). Chips now call `focusOn(target)`
   directly and never consult `hit()`.

**None of those touch the 58px tolerance.** Taps on a bare star — the majority of interactions,
since only 14–22 of 613 stars carry a label — still resolve through nearest-wins exactly as
described in §1–§2, and the Riess/Moghanaki flip at 25–54 CSS px is still live.
