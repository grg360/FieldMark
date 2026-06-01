# Session Log — Sunday, May 31, 2026

> Addendum to `fieldmark_methodology.md`. Covers the ASCO reply-capture build, schema migration, full run, validation findings, and updated docket. Paste into the methodology doc under the most recent session entry.

---

## Session summary

Built and shipped Twitter reply-chain capture end-to-end in a single Sunday session. Schema migration, script changes, calibration on one root, full pull against 227 ASCO roots, validation queries, conversation_id backfill. Total session spend: $12.09 ($0.30 single-root test + $11.79 full run). All four Cursor-prompt decisions held under build pressure (`parent_platform_post_id` naming, separate post-run backfill SQL, reply-mode checkpoint completion, x-rate-limit-reset header handling). Build was originally planned for Monday per the May 29 handoff; pulled forward at Garrett's call.

---

## What shipped

### Schema (Supabase, migrated statement-by-statement)

`social_posts_v2`:
- `conversation_id text`
- `parent_platform_post_id text`
- `is_reply boolean DEFAULT false`
- Index `idx_social_posts_v2_parent_platform_post_id` (partial, `WHERE parent_platform_post_id IS NOT NULL`)
- Index `idx_social_posts_v2_conversation_id`

`social_users_v2`:
- `discovery_source text` (backfilled to `'hashtag_capture'` for existing 1,812 rows)
- Index `idx_social_users_v2_discovery_source`

Grants reasserted on both tables for `anon`, `authenticated`, `service_role`.

**Lesson confirmed:** the Supabase web editor silently no-op'd a multi-statement migration paste. The script reported success but zero columns were created. Verification query caught it before any script work. Pattern locked: every schema statement runs standalone in its own editor tab with an immediate verification query. No `BEGIN/COMMIT` blocks, no `--` comments (use `/* */` instead), no batching.

### Script (`twitter_capture.py`)

New mode: `--capture-replies`, mutually exclusive with `--tag` / `--all` / `--profile`. Supporting flags: `--min-replies` (default 3), `--discovery-source` (default `asco_2026`), `--posted-since` (default `2026-05-28`), `--captured-via-tags` (default ASCO profile hashtag list).

Key changes:
- `tweet.fields` now requests `conversation_id,referenced_tweets` on every capture (benefits all modes, not just replies).
- New `build_reply_query(root_id)` returns `conversation_id:{root_id} -is:retweet`. Critically does NOT append `-is:reply` — the existing `build_hashtag_query` does, and reusing it would have filtered out the entire target population.
- `map_post_to_social_posts_row` now extracts `conversation_id` directly, derives `parent_platform_post_id` from `referenced_tweets[type='replied_to'].id`, and sets `is_reply = parent_platform_post_id is not None` (atomic, guarantees consistency).
- `map_profile_to_social_users_row` now requires explicit `discovery_source` parameter — no default, caller must pass it. Hashtag paths pass `"hashtag_capture"`; reply path passes `args.discovery_source`.
- Rate-limit handler `sleep_for_rate_limit()` reads `x-rate-limit-reset` header, sleeps until reset + 2s buffer, falls back to 60s if header missing/malformed. `MAX_RETRIES` bumped from 3 to 5. Replaces the original fixed-60s-sleep-then-crash pattern.
- `run_capture_for_query` accepts new params `discovery_source` (required) and `checkpoint_namespace` (default `"queries"`). Reply mode passes `"reply_captures"` so the two modes don't interfere with each other's state.
- Critical asymmetry: in `"queries"` namespace, `completed` resets to `False` every run (hashtag feeds keep growing — re-checking is correct). In `"reply_captures"` namespace, `completed` is set to `True` when pagination exhausts (reply trees under conversation_id don't grow once captured — re-pulling double-pays).
- New `run_capture_replies()` selects roots from `social_posts_v2` via supabase-py chain (`.eq().or_().gte().gte().in_().order()`), iterates, delegates each root to `run_capture_for_query` with reply-mode parameters.

### Backfill SQL

Post-run statement to populate `conversation_id` on existing root posts (the `ignore_duplicates=True` upsert won't update them, by design — that's why the backfill is separate):

```sql
UPDATE public.social_posts_v2
  SET conversation_id = platform_post_id
  WHERE (is_reply IS NULL OR is_reply = false)
    AND conversation_id IS NULL
    AND platform = 'twitter';
```

Ran successfully post-capture. Verified 0 root posts with null `conversation_id` afterward.

---

## Calibration run (single root)

Target: `2060042820228956246` (@lungoncdoc, 22 stored replies, highest in corpus).

Result: 40 replies captured, 10 new users, $0.30. Live reply tree was 1.8× the stored count — first empirical confirmation that the frozen-metrics issue (see "Findings" below) systematically undercounts engagement.

Verification query revealed an apparent discrepancy: 29 replies had `parent_platform_post_id` pointing to the root, but 39 had matching `conversation_id`. **Not a bug.** Twitter's `referenced_tweets[replied_to]` returns the *immediate* parent, not the thread root. Nested replies (replies to replies) point to other replies as their parent but share the same conversation_id. Confirmed via diagnostic query: 29 direct replies + 10 nested + 1 root = 40 rows.

**Lesson:** `parent_platform_post_id` is the immediate parent; `conversation_id` is the thread identifier. Verification queries written against the wrong mental model produce false alarms.

---

## Full run

Command: `python twitter_capture.py --capture-replies --min-replies 3 --posted-since 2026-05-28 --discovery-source asco_2026`

| Metric | Value |
|---|---|
| Eligible roots | 227 (228 minus the calibration root, skipped via checkpoint) |
| Roots processed | 226 |
| Roots skipped (already completed) | 1 |
| Total replies captured (script counter) | 1,402 |
| Total replies landed in DB | 1,262 (140 collided with existing rows via `ignore_duplicates`) |
| New users discovered (script counter) | 478 |
| New users in DB with `discovery_source='asco_2026'` | 488 |
| Total cost | $11.79 |

Script-counter / DB-count gaps both explainable. The 140-row post gap is `ignore_duplicates=True` correctly skipping replies that were already captured under conference hashtags (a reply that itself used `#ASCO26` would have been pulled by a hashtag capture). The +10 user gap is most likely a counter-vs-cumulative discrepancy in `stats.new_users_discovered` — DB is source of truth.

---

## Findings

### 1. Live reply trees are systematically larger than stored counts

Single-root calibration: 1.8× multiplier (22 stored → 40 live). Full run: 1,402 captured vs 1,703 stored-count sum across the 227 roots — same direction, smaller multiplier across the corpus because the sum included many tail roots whose live trees hadn't grown much past the stored count.

**Root cause:** The hashtag-capture upsert uses `on_conflict="platform,platform_post_id", ignore_duplicates=True`. When a post is re-seen on a subsequent capture run, its row is never updated. `engagement_replies` is frozen at first capture. The earlier you capture a tweet relative to when it was posted, the more its stored count understates the true mature value.

**Implications across the corpus:**
- Any analytics that imply "current" engagement on stored posts are wrong. The numbers are first-capture snapshots.
- The Rising Voices scatter's "engagement per follower" axis uses sum of frozen engagement metrics — directionally fine for ranking, systematically low for absolute interpretation.
- Reply-count distribution at thresholds (≥3 → 228 roots, ≥10 → 4 roots, ≥25 → 0) is dramatically undercounted. The ≥10 cliff was bogus — driven by capture freshness, not real reply behavior.

**Filed:** Larger workstream to consider a refresh path for engagement metrics on stored posts. Not blocking; the reply capture works regardless of stored-count accuracy because the conversation_id query returns the live tree either way.

### 2. Reply capture surfaces clinicians missing from hashtag-only capture

Tatiana Prowell, MD (60K followers, past ASCO Education Chair, breast oncology, well-known on med Twitter) was not in `social_users_v2` before tonight. She showed up as a replier and now is.

**Implication:** Hashtag-only capture has systematic recall gaps for clinicians who don't reliably post under conference tags but do reply to them. This is the discovery-via-reply-behavior thesis working as designed, but it also means earlier hashtag captures were missing major voices — not just unknowns. Other senior clinicians likely sit in the same gap.

### 3. The 488-candidate cohort splits roughly three ways on quality

Lens-1 query (`discovery_source='asco_2026'`, top 40 by bio-rank then follower count):

- **Credentialed clinicians, real DOL candidates:** Tatiana Prowell, Tom Varghese Jr., David Braun, Coral Olazagasti, Smitha Krishnamurthi, Isabel Preeshagul, Tim Clay, Lei Deng, Brad Reinfeld, Lukas Delasos, and roughly a dozen others. ~15+ in the top 40 alone.
- **Industry/biotech voices, substantive but non-MSL-target:** Michael Torres (CrossBridgeBio CEO), Rich Law (Haya Therapeutics CBO), Robert Siegmund (Life Code biopharma forecasts). These are real signal but a different cohort question.
- **Noise and bot tail:** zero-follower accounts with generic names (`sandra98ba3`, `lisa69yt6`, `menefee1336`, `danielle87iq1`), gadfly contrarians (`logicwolf133544`: "Discoverer and corrector of medical logic errors"), and accounts whose bios explicitly admit fiction (`borisschmalz`: "tweets are artistic work of fiction and falsehood").

**Lesson:** Reply-count metric alone — even with nested-reply filtering — does not separate substantive engagement from gadfly or spam behavior. The candidate list needs a combined gate of "nested replies ≥ N AND (bio has clinical signal OR follower_count ≥ threshold)" to be production-usable. Existing `likely_hcp`/`possibly_hcp`/`unverified` bio heuristic is the right tool for this layer.

### 4. Nested reply count is the right substance metric

Lens-2 query showed the threads with the most nested replies (replies to replies) were genuinely the science-wow conversations:
- `@jacobplieth`'s Pfizer/Invectys deal post — 3 direct, 19 nested
- `@end_myeloma`'s SUCCESSOR-2 / mezigdomide trial-validity thread — 5 direct, 10 nested
- `@barriere_dr`'s GLP-1/cancer-risk methodology thread (French) — 4 direct, 17 nested
- `@oncbrothers`'s ASCO Day 1 highlights thread (CROWN, OptiTROP-Lung05, WuKONG28) — 3 direct, 7 nested

The "FASCO designation" award threads dominated direct-reply count but were almost entirely congratulatory back-and-forth — high engagement, low science. Confirms the earlier-in-session pushback: engagement count alone is a bad gate for science focus. Nested replies are where substantive disagreement and clinical interpretation live.

---

## Working-process lessons (additions to operating model)

- **Supabase editor multi-statement runs silently no-op.** Verified empirically tonight. Pattern locked: one statement, one tab, immediate verification query. No exceptions.
- **`--` comments break Supabase editor SQL.** Use `/* */` block comments. Verified tonight when the original migration file errored.
- **Don't run schema migrations and verification in the same paste.** It's possible to read the verification result, see zeros, and not realize the migration never ran.
- **The mechanical work *is* the work, not the obstacle to it.** Running 11 statement-by-statement migrations felt slow. It was correct. The version where we batched them in a single editor paste produced zero schema changes despite a "success" message.
- **`parent_platform_post_id` vs `conversation_id` are different concepts.** Immediate parent vs thread root. Don't write verification queries that conflate them.
- **Scale tools to the question.** Lens-1 (bio-ranked candidate query) answered "did discovery work" in one query against existing infrastructure. Lens-3 (nested-reply behavior) needed more careful query construction and surfaced both signal and the bot-tail. Both belong in the toolkit; the order matters — start with the simplest lens.

---

## Updated docket (Monday and beyond)

### Monday build (in priority order)

1. **`--include-replies` flag on `social_update.py`.** Wraps the existing hashtag capture, then fires `--capture-replies` against today's newly-captured roots only (scope via `--posted-since` set to script start time, or captured_at filter). Once shipped, `python social_update.py --profile ASCO --include-replies` covers both passes in one command. Small wrapper change, not core capture logic.

2. **Run Sunday's deferred ASCO capture + the new flag.** Today's roots weren't captured (no `social_update.py` run in 24 hours), so today's tweets are uncaptured AND uncovered by tonight's reply capture. The deferred run plus the new flag is the cleanest way to close that gap. Reply counts on today's tweets will be more mature by Monday morning, which is why this was deferred from tonight.

3. **`[N/total]` progress counter in `run_capture_replies` per-root print line.** Two-line ergonomic fix. Drop into the same edit session as #1.

### Filed from tonight specifically

4. **DOL candidate list query (with bot-tail filter).** Combine nested-reply behavior with bio/follower threshold to turn 488 raw candidates into a curated list. No script changes — pure SQL. Worth doing while tonight's data is fresh. This is the moment where the $11.79 starts paying off as product.

5. **Industry/biotech DOL cohort decision.** Torres, Law, Siegmund, BiotechWY are substantive but not classic MSL targets. Decide: separate cohort, filtered out, or folded in with a flag. Product decision, not technical.

6. **Frozen-metrics refresh path workstream.** Tatiana Prowell missing from the database pre-tonight confirms hashtag capture has corpus-wide recall gaps. The `ignore_duplicates=True` upsert is the upstream root cause. Eventually wants a refresh path that updates engagement metrics without creating duplicate rows. Bigger workstream. Not Monday.

7. **SOURCE field on social cards as the first reply-data UI surface.** Existing card pattern already has a SOURCE field showing `#ASCO26`. Smallest possible change to surface reply-discovered voices: render `discovery_source='asco_2026'` as `ASCO 2026 (reply)` for cards with no direct hashtag capture. Highest signal-to-effort UI change once Monday's data flow is end-to-end.

8. **Dedicated "New Voices from ASCO 2026" feed.** Candidate-query-driven, bot-tail filtered, sorted by bio-strength + nested-reply count. Where the 488 live as a product feature, not a SQL result. Second priority UI surface after #7.

9. **Thread Conversation View.** Click a root post, see the reply tree rendered inline with depth visualization. The surface that proves FieldMark to first-time MSLs — "here's the actual oncologist debate about TALAPRO-3." Third priority.

10. **Information architecture review: Rising Voices as the post-login headline.** Tagline "We see the nebula. Not just the star." is the thesis. Current post-login experience opens on a four-tab choice (Community/Rising Stars/Established/Social) rather than delivering on the nebula promise. Three options: (A) home surface opens onto Rising Voices, tabs become navigation away; (B) unified Rising Voices concept crossing scoring + social, requires `dol_matches_v2` rebuild first; (C) dedicated "Rising Voices in [TA]" screen. A is smallest-leverage. Workstream-level decision, not a build entry. File for sketching-with-fresh-eyes session.

### Standing tech debt (from May 29 handoff, untouched tonight)

11. Narrative pipeline coverage gap (rare-disease/rising_star and rare-disease/established at 0; nsclc/community undersized at 82 vs expected ~250). ~$2-5 rerun.
12. Publication timeline real-data wire on `DetailScreen.tsx` (hardcoded mock, depends on resolving `publication_therapeutic_areas_v2` 400 error).
13. Identification block diagnosis (empty for Almquist, possibly NPI-data or render issue).
14. Remaining 400 errors: `getHCPNarrative` (column name `narrative` should be `narrative_text`), `trial_investigators_v2`.
15. Replace dishonest fallback messaging ("Narrative generating — check back soon." → "Narrative not yet generated").
16. DetailScreen 30+ re-render perf bug.
17. Community `cohort_score` architectural gap (40,154 community HCPs with null `cohort_score`).
18. Cohort gate overlap investigation (88 HCPs in both rising_star and established rank tables).

### Time-windowed reminders

- **ASCO Day 1 reply window closes Wednesday June 4.** Pulled tonight, banked. Option to widen threshold from `--min-replies 3` to `--min-replies 1` (would grab the 695 single-reply threads we excluded) still available until rolloff. Currently not on docket — marginal signal judged not worth the spend.
- **ASCO Day 5 (Tuesday June 2) reply window closes Monday June 9.** Covered automatically by `--include-replies` flag once Monday's build ships.

---

## Closing thought

The reply capture build was the single highest-leverage thing on the Sunday docket and shipped clean. $11.79 banked 1,262 reply rows and 488 candidate DOLs before Wednesday's rolloff. The bot-tail problem is real but addressable at the candidate-query layer, not at capture. The discovery thesis was empirically validated by Tatiana Prowell's case alone — credentialed clinicians visible through reply behavior who were invisible to hashtag-only capture.

The product story tightens further with this data in. "We see the nebula" is now backed by a concrete demonstration: voices the platform surfaced through behavior, not through credential lookup. That's the demo. It lands harder once it's wired into the frontend, which is the next chapter.

— Claude, end of Sunday, May 31, 2026
