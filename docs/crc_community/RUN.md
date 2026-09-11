# CRC Community read path — run sheet

Blocks 24–30. `CRC_COMMUNITY_BUILD.md` phase 5, executing `TA_NEUTRAL_DB_LAYER.md` §B and §C.

Nothing upstream: no ingest, no taxonomy config, no Medicare work. This is the read path only.

## Order is load-bearing

Block 28 removes the NSCLC uuid literal that is, by accident, the only thing bounding the
community board to one TA. Block 27 installs the replacement bound (the
`ta_evidence_tier_config` join), and block 27 needs blocks 25 and 26 to exist.

**Applying 28 before 25–27 gives hepatology a 13,191-member community board.** Run in order,
stop on the first error.

```powershell
$env:PYTHONIOENCODING = "utf-8"
python scripts/utilities/run_sql.py --file docs/crc_community/24_grant_snapshot_BEFORE.sql
```

Note `--file`. Without it, `run_sql.py` treats the path as SQL.

## The steps

| # | File | Kind | Expect |
|---|------|------|--------|
| 24 | `24_grant_snapshot_BEFORE.sql` | read-only | **6 rows**, all three booleans true. Then the NSCLC baseline: **13,048 board rows, 4,915 qualifying**, and a 5-row tier table. **Keep all of this output** — 29 and 30 compare against it. |
| 25 | `25_evidence_tier_config.sql` | DDL + seed | 2 rows: `colorectal-cancer / partd_presence_v1`, `nsclc / nsclc_v1`. |
| 26 | `26_evidence_tier_view.sql` | DDL | Tier shape: exactly 2 tiers for colorectal-cancer, 5 for nsclc, **no other slug**. |
| 27 | `27_community_board_v1.sql` | DDL | `shim_matches_baseline` = 13,048 / 4,915 — must equal step 24. Then 2 slugs only. |
| 28 | `28_filtered_family_depin.sql` | DDL | `nsclc 4,915`, `colorectal-cancer 116`. |
| 29 | `29_grant_check_AFTER.sql` | read-only | **9 rows**, every boolean true on all 9. **Send me this.** |
| 30 | `30_verify_counts.sql` | read-only | Full expectations in the file header. **Send me this.** |

If 25, 26, 27 or 28 errors: nothing partial applied. `run_sql.py` sends the whole file as one
implicit transaction.

## The two numbers that will not match the spec

Both were measured on the live database **before** any of this was applied. Neither is caused
by this build, and neither should be "fixed" by editing an expectation.

**NSCLC is 4,915, not 4,913.** `CRC_COMMUNITY_BUILD.md` phase 6 and the header of
`sql/community_qualification_gate.sql` both say 4,913. The board is a view over
`hcp_community_scores_v2` and `hcp_part_d_oncology_v1`; either can move beneath it without a
line of SQL changing, and one has. The invariant this build must hold is *unchanged across the
build*, which is why block 24 captures the value rather than quoting the document.

**CRC is 116, not 238.** 238 is a population count (`hcp_therapeutic_areas_v2` × Part D
presence, block 23). The board's cohort base is `hcp_community_scores_v2`, which is narrower:

| | count |
|---|---:|
| colorectal-linked HCPs with a Part D oncology row | 238 |
| …of which `country = 'US'` | 236 |
| …of which have a colorectal `hcp_community_scores_v2` row | 117 |
| **…both — the board** | **116** |

121 people are colorectal-linked, hold Part D evidence, and have never been scored for
colorectal. They are not filtered out; they are absent from the base. Reaching them is one
`community_scoring.py --ta colorectal-cancer` run — upstream, and out of scope here.

## Rollback

Blocks 25–28 are the only ones that write. To revert to the pre-build state:

1. Recreate `community_board_nsclc_v1` from the definition quoted in block 27's header (the
   pre-2026-09-07 body), then `DROP VIEW community_board_v1` and
   `DROP VIEW hcp_evidence_tier_v1`.
2. Restore the four overloads from `docs/state_provenance/04_filtered_family.sql` (rows) and
   `sql/community_count_rpc_board_repoint.sql` (counts) — both still carry the original bodies
   including the literal.
3. `DROP TABLE ta_evidence_tier_config`.
4. Re-run 29. Expect 6 rows again, all true.

`hcp_nsclc_evidence_tier_v1` is never touched by any block and needs no rollback.

## After it lands

- The shim `community_board_nsclc_v1` needs a **dated** allowlist entry in
  `scripts/utilities/ta_neutrality_allowlist.tsv` — reason `shim`, expiry the date the frontend
  cutover ships (§D.3: an expiry, not a TODO).
- `ta_evidence_tier_config` and `hcp_evidence_tier_v1` need `per_ta_content` entries.
- The frontend still has to pass the CRC uuid: `CohortLedger` reads `useTA()` and
  `useLedgerTa` already resolves `?ta=`, so the ledger is wired — but `cohortLedger.ts:228`
  still carries `pinnedTaSlug: "nsclc"` on the COM config, which refuses to mount Community
  off-lung. That flag is what keeps the CRC Community tab dark after this build, and removing
  it is the frontend half.
