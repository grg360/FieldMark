# Stranded community narratives — measured 2026-09-18

2,066 nsclc community narratives belong to HCPs who are not qualifying members of the
nsclc community board. They are now unreachable, not deleted. This records what they
are, why the sweep never saw them, and what is still open.

## The set

| | count |
|---|---|
| nsclc community narratives with live text | 3,005 |
| — qualifying board members | 939 |
| — board row present, `qualifies = false` | 306 |
| — no board row for nsclc at all | 1,760 |
| **stranded (the last two rows)** | **2,066** |

All 3,005 predate 2026-08-11. Oldest 2026-05-29, newest 2026-08-07.

Membership means `qualifies`, not "has a row". That is the predicate `community_ledger`
and `get_community_filtered` already use, and it is what makes the 306 stranded rather
than merely unranked.

## What was rendering them, before 2026-09-18

`community_hcp_profile`'s `narr` CTE did not reference its `board` CTE. It fetched on
(hcp_id, therapeutic_area_slug, cohort) alone, so a non-member got their prose with
`standing` serialising to null underneath it.

Reachability, traced through every read path:

| route | reachable | why |
|---|---|---|
| `/hcp/:id/practice` (PracticeFirstProfile) | **2,066** | no dispatch, no TA gate, no board check — direct URL only, nothing links to it |
| `/hcp/:id` (ProfileDispatch → CommunityHcpProfile) | **1,659** | the rest route to the established (397) or rising (10) shells, which read their own cohort's narrative |

Of the 1,659: 1,161 render on a bare `/hcp/:id`; the other 498 need `?ta=nsclc` or a
session TA of nsclc — all 498 are nsclc members in `hcp_therapeutic_areas_v2`, and 13
link sites including `CohortLedger.tsx` append `?ta=`.

**Paths that never could reach them**, confirmed the same day: `community_ledger` (both
overloads — the narrative subquery is evaluated per board row), the card feed
(`get_community_filtered` → `where b.qualifies`), `hcp_profile_brief_ta`
(`cohort = 'established'`), `hcp_rising_profile_ta` (`cohort = 'rising_star'`),
`community_practice_profile`, `export_telescope_data.py`, `watchlists.ts`,
`socialSearch.ts`, `home.ts`. `getHCPDetail` in `lib/api.ts` selects narratives by rank
row rather than board membership and would have been a third path, but it has no callers.

## Why the sweep never saw this set

`scripts/narrative/sweep_stranded_narratives.py:66` excludes community from
`BOARD_SOURCES` deliberately, and the stated premise is that community narratives are
"blocked upstream on Phase 4 context assembly".

That premise is true about WRITES and does not cover these rows. Context assembly has
been disabled since 2026-08-11; every one of the 2,066 was written before that date. They
predate the block rather than being prevented by it. A generator that cannot run does not
retire the prose it already wrote.

**The sweep is unchanged.** Once `narr` is board-gated the rows are unreachable, and
deleting them is a separate decision — it needs its own restore file and its own
`BOARD_SOURCES` entry with a `qualifies` predicate, neither of which is a defect fix.

## What changed instead

`migrations/2026_09_18_community_hcp_profile_ta_overload.sql` adds
`community_hcp_profile(p_ta_id, p_hcp_id)`, which gates `narr` on a qualifying board row
for the TA passed in. Verified: all 2,066 return `narrative: null`; the 939 members are
byte-identical to the one-argument function.

**The one-argument signature still renders them.** It was not dropped — it keeps its ACL
and could be called by anything added later. It is superseded, not fixed. Both frontend
callers moved to the overload in the same commit and nothing else calls it.

## Still open

- `community_practice_profile` is still one-argument and lung-pinned. It carries no
  narrative, so it is not part of this defect, but it is the reason
  `PracticeFirstProfile`'s admin-code reference set still says "lung".
- `COMMUNITY_PROFILE_TA_SLUGS` is still `["nsclc"]`. Widening it is now unblocked on the
  profile RPC's side — board, evidence tier and narrative all follow `p_ta_id` — but the
  gate should not move until `community_practice_profile` does.
- Whether to delete the 2,066 or leave them addressable for a future board that readmits
  those HCPs. Unreachable is not the same as wrong, and a narrative written in May
  describes a May practice either way.
