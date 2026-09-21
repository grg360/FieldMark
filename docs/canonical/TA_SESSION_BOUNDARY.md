# TA as a session boundary

Decided 2026-09-15. This supersedes the TopBar-switcher model described in
`migrations/2026_07_16_msl_profiles_allowed_ta_slugs.sql` and every design that treats
therapeutic area as a per-surface filter.

## The decision

**Therapeutic area is established once, at session start, and is immutable for the life
of the session.** A user with more than one entitlement changes it through an explicit
"Switch TA" action that RE-ESTABLISHES the session. No surface reads, writes, derives or
overrides it.

Every surface is bespoke to its TA. An institution or a drug may appear in more than one
TA's data, but the *surface* is always "this institution, as seen from Colorectal." There
are no cross-TA surfaces, and none are planned.

## Why, and it is not ergonomics

Every TA defect of the last fortnight is one architecture producing many symptoms. TA is
ambient state any surface can read or write, so each surface is a place it can be wrong:

- HomePage overwrote the session TA
- narratives rendered under a TA that did not match their board row
- `pinnedTaSlug: "nsclc"` welded Community to one TA; the de-pin then exposed
  `ledger_meta` and `community_ledger`, which took no TA at all and would have rendered
  lung physicians under a colorectal heading
- `get_community_filtered` accepted `p_ta_id` and filtered on the ARGUMENT
  (`WHERE p_ta_id = '<nsclc uuid>'`), returning zero rows, correctly typed and empty

Those are not five bugs. **Making TA a session property does not fix them one at a time;
it makes the category impossible.** A surface cannot get TA wrong if a surface never
holds TA.

The user agrees with the architecture. An MSL covers a therapeutic area — that is the job
description. Flipping between indications mid-session is not a workflow. The present
design pays for that edge case on every page.

And it is defensible to a compliance reviewer. "This session is scoped to Colorectal" is
a sentence. "Any page may show any therapeutic area the user is entitled to" is one you
have to defend.

## What it retires

The frontend currently holds **three independent literal mirrors** of
`ta_evidence_tier_config`:

| mirror | where | what it copies |
|---|---|---|
| `boardTaSlugs` | `cohortLedger.ts:241` | which TAs have a Community board |
| `COM_TIER_MODELS` | `cohortLedger.ts:410` | which tiers each TA's model emits |
| tier priority | block 28's `ORDER BY` | how tiers rank |

Each is hand-maintained, each drifts independently, and adding a TA to one and not the
others is a defect that has needed a warning comment three separate times. All three are
copies of something the database already knows.

**Session-scoped TA collapses them.** One call at session establishment returns the TA's
CAPABILITY MANIFEST — which cohorts exist, the tier vocabulary and its ordering, which
surfaces are live, the labels. The frontend stops holding opinions about therapeutic
areas and renders what the session handed it. `ta_evidence_tier_config` becomes the
single authority in fact rather than in a comment.

It also answers hepatology without a special case. Hepatology has no Community board
because it has no `ta_evidence_tier_config` row, so its manifest omits Community and no
chip renders. Named absence by construction rather than by remembering to check.

## Entitlement is coarse; the session is fine

`msl_profiles.allowed_ta_slugs` holds **PARENT** slugs — `['oncology', 'immunology']` —
not indication slugs. That is not a mismatch to fix; it is two grains doing two jobs:

    entitlement   which PARENTS a user may see          allowed_ta_slugs
    session       which INDICATION they are in now      one slug, immutable

The picker offers every live indication under every entitled parent. A user entitled to
oncology alone still chooses between Lung and Colorectal, and is in exactly one of them.

**`entitledTASlugs()` currently FAILS OPEN** — `api.ts:1045-1058`, an empty or null list
returns all live TAs. That was correct for grandfathering existing users. It is much
harder to defend once TA is a compliance boundary, and it should be revisited as part of
this work rather than inherited silently.

## The three rules

**1. Switching is a session re-establishment, not a re-render.** It lands on Home for the
new TA with filters, cursors, tier selections, watchlist context and scroll state
discarded. Carrying any of it across is how lung chips end up on a colorectal board.

**2. A deep link cannot change the session silently.** A shared URL carrying another TA
is refused with a named reason. If the user is entitled to that TA, offer an explicit
session switch — an offer, taken deliberately, not an override. Anything less
reintroduces ambient TA through the back door.

**3. A single-entitlement user never sees the picker.** One live indication means land
straight in, and "Switch TA" is ABSENT from the menu rather than present and disabled. A
disabled control is a promise of something that does not exist for them.

## The concrete architectural change

`TAContext.tsx` exposes `setTA`, and `ledgerTa.ts:103` calls it. **`setTA` as a
general-purpose setter is the defect this design removes.** After this work the only
writer is session establishment; everything else reads.

That is the test for whether the change actually landed: `grep setTA` returns the session
boundary and nothing else.

## Open, to decide during the build

- Whether the capability manifest is a new RPC or an extension of the existing session
  bootstrap.
- Whether `entitledTASlugs()` stops failing open, and what existing users see if it does.
- Where the picker lives for a user whose entitlements change mid-session (an admin
  grant, a revocation) — the session is immutable, so the change takes effect at next
  establishment, and the user should be told rather than left stale.
