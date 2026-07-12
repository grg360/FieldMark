### 30fa. AD RISING migration AUTHORED — get_rising_composite_filtered/_count, mirrors ESTABLISHED (not old-rising). Traced both bodies first.
Continues §30ez (which scoped the 4-tier frontend). The RPC pair is the first build artifact. Traced the real
`get_established_filtered` + `_count` bodies AND the old `get_rising_star_filtered` before writing — the trace
decided the template: old-rising fakes scope with a `us_rank` CASE trick because `hcp_rising_star_ranks_v3` is
one-row-per-HCP; ESTABLISHED uses true scope-row filtering (`scope_type=p_scope_type AND scope_value=ANY(
p_scope_values)`), which is exactly `hcp_rising_composite_v1`'s shape. So mirror established, NOT the same-named
old-rising fn. Authored: two overloads each (with/without `p_canonical_theme_ids`) for rows + count, copying
established's WHERE/states/themes-EXISTS/ORDER BY/LIMIT verbatim; swapped only table (`hcp_established_ranks_v3`
-> `hcp_rising_composite_v1`) and score (`cohort_score` -> `rising_composite_score`); added `emergence_pctile`
+ `network_influence_pctile` as real return cols; aliased `rising_composite_score` into the generic
`normalized_score`/`composite_score` slots so shared HCPCard chrome renders unchanged. GRANT EXECUTE TO
authenticated only (not anon) — table is RLS-locked authenticated-read (§30bz); anon would 401 anyway. NOTIFY
pgrst. File: `2026_07_12_get_rising_composite_filtered.sql`. Net-new names -> collides with nothing, old rising
RPC untouched for frozen NSCLC.
CORRECTION (see §30fk): this entry originally read "migration DONE / safe to apply anytime." BOTH WRONG. (1) NOT
APPLIED — the file lives in the strategy-thread outputs, not the live DB or repo; "authored a file" != "migration
done." (2) The mirror inherited a LATENT GLOBAL BUG from established: `scope_value = ANY(p_scope_values)` returns
0 rows for global (global rows are scope_value=NULL). Corrected 2026-07-12 with a two-arm OR branch keying global
on scope_type alone. Status now: DRAFTED + global-corrected, NOT applied, pending the Option-2 spec.

### 30fb. *** CAREER-YEAR COLUMN: use career_first_pub_year_v2, NOT plain. 76% corpus divergence — verified. ***
The one place "mirror Established" is WRONG — it's a data-correctness choice, not a structural mirror. Old-rising
deliberately used `career_first_pub_year_v2` (the homonym-pollution fix); established uses plain
`career_first_pub_year`. Checked which holds correct data before mirroring. Evidence: `SELECT count(*) FILTER
(WHERE career_first_pub_year IS DISTINCT FROM career_first_pub_year_v2)` = 214,102 / 282,464 = **75.8% disagree**.
Spot-check AD rising top-20: plain shows impossible starts for early-career stars (Ana Rossi 1952, Filomena Russo
1948); v2 shows correct recent (2016–2022). The columns are computed differently (plain ~ OpenAlex works-count/
first-work, homonym-inflated; v2 = MIN(pub_year) over LINKED pubs w/ 1940 floor). FIX: both rows overloads select
`career_first_pub_year_v2 AS career_first_pub_year` — return-col NAME unchanged so frontend contract is untouched.

### 30fc. SCORING LAYER CLEAN — rising ranks built on v2, no re-score. Established RANKS clean too (card DISPLAY bug only).
The 76% divergence escalated the question: if the SCORER gated on the plain column, the frozen ranks would be
contaminated (career-age-relative measure fed inflated ages) and AD Rising becomes a re-score, not a wiring job.
Grepped all `*.py` (via PowerShell `Get-ChildItem -Recurse | Where-Object Extension -in .py | Select-String`,
because `rg` isn't installed on the Windows box). Result: `emergence_scoring.py:234`,
`scientific_momentum_scoring.py:88-89`, `network_momentum_scoring.py:88-89` all read `career_first_pub_year_v2`
and gate youth via `(current_year - career_first_pub_year_v2) <= threshold`; `scoring_pipeline.py:900` null-v2 ->
ineligible. => rising ranks SOUND; AD Rising stays a WIRING job. Twin finding: `established_scoring.py:298` selects
PLAIN `career_first_pub_year`, but projection-only (career age not in established's ranking math) -> Established
RANKS clean; Established CARDS may DISPLAY the corrupted year. Logged as a low-priority TA-wide display fix.

### 30fd. FRONTEND CONSUMER TRACE — entire rising read path speaks OLD 2x2 vocabulary. Confirms 4-tier blast radius (§30ez).
The RPC return shape is a CONTRACT; traced the consumer half before finalizing (this project's #1 recurring
bug-class: producer/consumer disagreement — count-RPC v2/v3 §30ep, themes tag, feed loadMore §30es). Verbatim
trace of `fetchCohortViaRpc`->`enrichAndMapCohortRows` rising branch (api.ts ~281–351), `types.ts` 102–108,
`hcpData.ts` 68–74, `ScoreBreakdownV3Rising.tsx` 160–205: NOTHING reads `rising_composite_score`/`emergence_pctile`/
`network_influence_pctile` as rising fields. The mapper even MISMAPS `network_influence_pctile := visibility
Component`, `scientific_influence_pctile := momentum_component`. So the new columns appear NOWHERE in the read
path — pointing the feed at the new table without the frontend rework renders all-zeros (`?? 0` everywhere),
which LOOKS like data. Confirms §30ez's 4 tiers. Also surfaced a 2nd Tier-1 sub-path: the DETAIL breakdown is fed
by `getRisingStarScoreBreakdown` (api.ts ~1786), a SEPARATE query hitting the OLD table directly — Tier 1 is two
repoints (feed cards + detail-breakdown builder), not one.

### 30fe. ARCHETYPE for AD = dropped by the advisor's own logic (not a feature loss). Decision logged; re-derivation deferred.
Field-grep (`archetype|scope_rank|us_rank`) showed archetype is a SUBSYSTEM, not a field: 5 fns in HCPCard + an
ARCHETYPE stat column + name-row pill; `ScoreBreakdownV3Rising` has its own archetypeColor/ShortLabel/showBadge;
named archetypes (Balanced Rising Star, Scientific/Network Accelerator). The NEW model emits NO archetype. Reason
it's gone: the §30v advisor pass killed the network-in-momentum axis AS DISHONEST — archetype labeled positions
in a 2x2 grid whose axes no longer mean what they claimed. NOW: AD renders no archetype badge (old subsystem
stays live for NSCLC on the old table); AD leads with cohort-relative `emergence_pctile` + 2-tile breakdown =
more info than one quadrant label. LATER (open design Q, after seeing the 2-tile render): does emergence x
network-influence warrant its OWN honest archetype (emergence-high/network-low = "surging, not yet connected" vs
inverse)? Build the honest version or none — do NOT port the old one.

### 30ff. AD-ONLY FORK found + designed — NSCLC stays BYTE-IDENTICAL (architectural guarantee, not vigilance). Baseline captured.
NSCLC-frozen must be enforced by structure, not care. Trace: `getRisingStars` (api.ts 958–998) resolves `taId`
at line 970, two lines above where it passes the four RPC/table literals into `fetchCohortViaRpc`. The dispatch
lives at the CALL SITE (fetchCohortViaRpc takes countRpc/rowsRpc/rankTable/cohort as PARAMS — no map/switch
inside). So the fork is: `taId === AD ? (new 4 literals + new "rising_composite" cohort tag) : (existing 4
literals, unchanged)`. NSCLC's literals never change -> not "preserved", literally not in the diff.
`enrichAndMapCohortRows` already discriminates on `cohort` -> AD gets a new mapping branch; `"rising_star"`
branch untouched. REGRESSION GATE captured BEFORE any edit — NSCLC top-10 global fingerprint via
`get_rising_star_filtered(c0065b03…, 'global', ARRAY['global'], …, 10, 0)`: ranks 1–10, all "Balanced Rising
Star", percentile 100.0->99.43. Post-change the identical call must reproduce these 10 rows byte-for-byte. NSCLC
ta_id `c0065b03-a25e-4e9a-bde4-4b4d0db7827d`.

### 30fg. *** GLOBAL-SCOPE RISING IS SERVED NOWHERE — pre-existing gap, and it blocks global-first AD. ***
`fetchCohortViaRpc` short-circuits global (api.ts 476–478: `if scopeType==="global" || scopeValues.length===0
return {rows:[],total:0}`). Traced exhaustively: `getRisingStars` has NO global branch (returns the empty as-is,
no fallback); every direct `hcp_rising_star_ranks_v3` read in api.ts is count-only, single-HCP detail, enrichment,
or `us_rank NOT NULL` (US-only) — NONE is a global rows path. `resolveFilterScope` (rank-filters.ts 29–45)
DEFAULTS to region/US; global only on EXPLICIT user selection. So explicit-global rising = empty feed TODAY, for
NSCLC too (it's a latent gap, not an AD regression). CONSEQUENCE: for global-first AD the fork must ALSO relax the
476–478 short-circuit for the composite branch AND likely change the region/US default for AD (rank-filters.ts) —
TWO edits, TWO files, touching SHARED infra (476–478 governs all 3 cohorts). Needs its own trace, not a rider on
the fork.

### 30fh. DECISION (Garrett): AD is global-first — international researchers MUST be in the demo. Global = Tier-1 DoD.
AD is more heavily international than NSCLC by the nature of the therapeutic area; the demo has to show those
researchers. So global rising is NOT deferrable to Tier 2 — it's part of Tier 1's definition-of-done. Shipping
AD rising US-defaulted would under-serve exactly the cohort the demo exists to show. This reframes the problem:
not just "relax the short-circuit" but "is region/US even the right DEFAULT for AD?" — `resolveFilterScope`
defaults to US, so an AD user lands in the wrong lens before global is even reachable. Two edits (api.ts
short-circuit + rank-filters.ts default), both potentially TA-conditional. OPEN, routed to Code: does AD
ESTABLISHED already solve global-default scope (-> mirror it, clean) or did it ship US-defaulted (-> Established
has the same latent gap and rising is where we fix it for BOTH)? [AWAITING TRACE — this determines whether Tier 1
is "mirror an existing scope pattern" or "design global-first scope for the first time," i.e. the size of Tier 1.]

### 30fi. NSCLC back-migration DEFERRED — mentors live in the NSCLC DB, NSCLC is frozen. Split-brain is now DELIBERATE.
Correction to the original plan (which had NSCLC back-migration as a precondition to repointing). Garrett: the
NSCLC database holds mentor records and cannot be touched now. Clarified the back-migration would NOT modify
existing NSCLC data (it writes new rows into `hcp_rising_composite_v1`, leaving `hcp_rising_star_ranks_v3`
frozen) — but the decision stands regardless: don't run it. This is fine because the AD-only fork (§30ff) routes
per-TA, so AD -> new composite path, NSCLC -> old path unchanged. The AD/NSCLC rising split-brain (two live
models) is now a DELIBERATE, logged state — a maintenance concern, not a correctness/safety one — reconciled
later on Garrett's schedule when the mentors aren't load-bearing. Removes the NSCLC precondition from the Tier 1
spec entirely.

### 30fj. AD ESTABLISHED SHIPS US-DEFAULTED — global-first is NOT solved anywhere. No pattern to mirror.
Routed the pivotal §30fh question to Code: does AD Established already handle global-default (mirror it) or ship
US-defaulted (design new)? Answer: US-defaulted, identical architecture to rising. `resolveFilterScope` /
`resolveRpcScopeParams` are TA-AGNOSTIC (no TA/indication branch); default FilterState is region=US, national=true
-> the RPC serves US Established (447). The 476-478 global short-circuit is inherited by getEstablished too; every
direct `hcp_established_ranks_v3` read is US-only/single-HCP/enrichment. => AD Established's ~2,585 `scope_type=
'global'` rows are STRANDED — unreachable through any feed path today. Silverberg shows (he's US/DC — that's what
the §30ex DC-fight was about); international peers do NOT, in default OR explicit-global (short-circuit). So there
is no working global pattern to lift; global-first is a platform-level gap AD is the first TA to expose.

### 30fk. *** GLOBAL IS UNWIRED AT THE SQL LAYER — removing the short-circuit yields EMPTY, not global. RPC rewrite required. ***
Traced whether relaxing 476-478 actually works. It does NOT — the short-circuit was MASKING an unwired path (the
§30ep failure mode: remove the guard, find nothing underneath). Three independent blockers:
  (1) For global, `resolveRpcScopeParams` emits p_scope_values=[] -> `scope_value = ANY(ARRAY[])` = FALSE for
      every row -> 0 rows even if the short-circuit is gone.
  (2) DEEPER: global rows are stored scope_type='global', scope_value=NULL (measured: est AD global=2,585 NULL;
      rising_composite AD global=3,052 NULL). `NULL = ANY(...)` is NULL, never TRUE -> the `scope_value = ANY`
      FORM is structurally incapable of matching global rows, whatever you pass.
  (3) `get_rising_composite_filtered` DOES NOT EXIST in pg_proc or any repo .sql — it was only ever a file in the
      strategy-thread outputs. The §30fa/§30ez "migration DONE" was ASPIRATIONAL. (Corrected §30fa.)
THE FIX (trace-provided): a global branch keying on scope_type alone, in ALL overloads:
  AND ( (p_scope_type='global' AND r.scope_type='global')
        OR (r.scope_type=p_scope_type AND r.scope_value=ANY(p_scope_values)) )
Applied to the drafted rising RPC (all 4 overloads, verified). Because the gap is a SHARED SQL-layer defect,
the same one-line branch unlocks global for BOTH established and rising.

### 30fl. DECISION (Garrett): AD is heavily global -> respect it. Option 2 (fix the choke point once, both cohorts).
Rising-only global would demo a working global rising feed beside a US-only Established feed still stranding 82%
of its roster — the cohort-inconsistency the platform keeps getting bitten by. And because global is a shared
SQL-layer defect (§30fk), rising-only isn't smaller — it's the identical RPC surgery declining to apply the same
branch to the established fn next door. So Option 2 = fix `get_established_filtered`/_count AND ship
`get_rising_composite_filtered`/_count, both WITH the global branch, TA-conditional so NSCLC stays US-defaulted +
untouched. Corollary: this IS the §30ex "AD needs to filter differently than NSCLC" product fork, arriving on
schedule — global scope doesn't filter on practice_state at all, so the 302 NULL-practice-state HCPs §30ex
stranded become visible in global view. The practice-state problem and the global-scope problem were the same
problem (AD's intl roster doesn't fit a US-state territory model); global-default is the fix for both. COST: AD
Established's default view changes for AD -> re-verify in browser (447 US in US mode; 2,585 in global mode). Worth
it regardless — "done" was against a US-only lens hiding 82% of the roster.

### 30fm. RPC-LAYER SPEC ISSUED (SQL only, no frontend). Two files authored; global proven in isolation before wiring.
Sequencing choice: fix + verify the SQL layer ALONE first — the RPC changes are invisible to users until the
frontend short-circuit relaxes (next unit), so global can be proven via direct RPC calls with zero user-facing
risk. Clean checkpoint. Two files authored + published (Garrett saving locally + sending to Code):
  - 2026_07_12_get_rising_composite_filtered.sql — net-new, 4 overloads, global branch baked in (NOT yet applied).
  - 2026_07_12_get_established_filtered_global.sql — REPLACES the 4 live established overloads; adds ONLY the
    global OR-branch (region/US byte-identical). Reconstructed from the verbatim pg_get_functiondef paste.
SPEC SAFEGUARDS (the session's disciplines, encoded):
  - PHASE 0 ROLLBACK CAPTURE: save current pg_get_functiondef of both established fns before replacing (revert).
  - TRANSCRIPTION GATE: diff my reconstructed established bodies vs live; the ONLY delta may be the scope branch.
    If any other line differs (my transcription drifted), STOP. (Protects against replacing a working fn with a
    mistyped body.)
  - REGRESSION ORACLES: NSCLC + AD established US top-10 captured BEFORE apply; must be byte-identical after.
  - GLOBAL PROOF: G1 AD est global count EXPECT 2585; G3 AD rising global count EXPECT 3052, Chovatiya #1. These
    two numbers = the stranded international rosters becoming reachable.
  - COUNT/ROWS PARITY (§30ep in advance): global branch in ALL FOUR overloads (2 rows + 2 count); verify
    count==rows cardinality for global (2585/3052) so the feed won't frozen-page once wired.
  - CROSS-TA: RPC becomes global-capable for ALL TAs, but only AD's frontend calls global; NSCLC global is
    informational-only (frontend never calls it) so NSCLC stays US-defaulted + untouched.
Career-year (_v2) est display fix explicitly NOT bundled (single-purpose scope patch; still queued §30fc).
AWAITING Code results: transcription diffs, regression match, G1=2585 / G3=3052, parity. If those land, the
frontend short-circuit relaxation + rising-model rework is the only thing between us and AD showing its real roster.

### 30fn. *** RPC LAYER APPLIED + VERIFIED — global works, region/US byte-identical, parity holds. First verified-applied state. ***
Both migrations applied to live DB (NOT committed yet). All Phase-3 criteria PASS:
  REGRESSION (no leak into region path): R1 NSCLC est US top-10 = baseline MATCH. R2 AD est US = Silverberg #1,
    count 447 — unchanged. The global OR-branch did not disturb region/US.
  GLOBAL NOW REACHABLE (the point): G1 AD est global count = 2585 (exact). G2 AD est global top-5 surfaces the
    stranded intl roster — Silverberg #1, WOLLENBERG (DE) #2, FLOHR (UK) #3, Guttman-Yassky #4, Simpson #5. G3 AD
    rising global count = 3052 (exact), Chovatiya #1 (emg 99.9 / net 99.77), Rossi/Rosmarin/Capozza/Kridin. G4 AD
    rising region US ranks differ at 4-5 from global (expected — scope-local ranking).
  PARITY (§30ep guard): P1 est global rows@5000 = 2585 == count. P2 rising global rows@5000 = 3052 == count. Feed
    won't frozen-page once wired.
  CROSS-TA: X1 NSCLC est global = 11,390 rows — now RPC-reachable but NSCLC frontend won't call global (short-
    circuit stays for non-AD). Data's there for a future NSCLC-global; no action now.
TRANSCRIPTION GATE (pre-apply): Code ran a whitespace-insensitive semantic diff (scope predicate subtracted from
both sides, remainder byte-identical) across all 4 established overloads — all PASS, aliases r3/er intact,
author-metrics join + theme EXISTS verbatim. Stronger than the raw diff I specced. Rollback artifact captured:
docs/2026_07_12_established_rollback_PREPATCH.sql (re-run to revert the 4 established fns; DROP the 4 rising fns
to fully revert).
STATE: DB live + verified. Git: NOTHING committed — 2 migration files + rollback artifact untracked in docs/.
Frontend: UNTOUCHED — RPC serves global correctly but the 476-478 short-circuit still returns empty before the
RPC is called, and getRisingStars still dispatches the OLD rising RPC. NEXT (distinct piece): frontend fork —
relax short-circuit (TA-conditional AD), dispatch AD rising to get_rising_composite_filtered, mapper branch to
read rising_composite_score/emergence_pctile/network_influence_pctile, set AD global-default scope, + the 2-tile
breakdown rework. That's the only thing between here and AD showing its real roster.
