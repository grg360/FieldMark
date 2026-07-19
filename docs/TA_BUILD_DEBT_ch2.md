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

### 30fo. FRONTEND FORK AUDIT (read-only) — 6 sites mapped, current line numbers. Two findings change the plan.
Full read-only audit run to front-load the frontend fork as a build job, not a discovery job. Six fork sites,
current lines confirmed:
  (1) DISPATCH — getRisingStars api.ts 977-987: route AD -> composite RPC names + new "rising_composite" cohort
      tag. taId resolved at 970; TA_ID_MAP["atopic-dermatitis"]="9e4139d2-e062-4a58-8728-cdabb2d7dca1" (627).
  (2) SHORT-CIRCUIT — fetchCohortViaRpc api.ts 476: make the global bail TA/cohort-conditional (taId + cohort
      both in scope at 476).
  (3) SCOPE DEFAULT — App.tsx 459/500/534: AD-conditional scope:'global' at the filters-construction site (caught
      by resolveFilterScope:30; leaves the shared resolver TA-agnostic so Established unaffected).
  (4) FEED MAPPER — enrichAndMapCohortRows api.ts 281-361: new rising_composite branch reading rr.rising_composite_
      score / emergence_pctile / network_influence_pctile (the momentum/visibility set is old-model), emit no archetype.
  (5) DETAIL BREAKDOWN — getRisingStarScoreBreakdown api.ts 1774 + type 585.
  (6) CARD+BREAKDOWN UI — HCPCard rising bits (cohortStatKeys 258, statValueForKey 292-303, ARCHETYPE tile
      991-1041, displayRank 509, name-pill 758-781) + full ScoreBreakdownV3Rising.tsx (4 tiles -> 2, drop archetype).

*** FINDING A (baseline correction): `npx tsc --noEmit` = 0 is a FALSE baseline — it runs the solution tsconfig
(files:[]), checks nothing. The REAL gate is `npm run typecheck` (tsconfig.app.json) = 70 ERRORS (pre-existing:
TS6133 unused-vars + `as PositionRow[]` casts). Build = GREEN. FORK REGRESSION ORACLE: typecheck stays 70, build
stays green. Using 0 would have made the pre-existing 70 look fork-introduced. ***

*** FINDING B (new sub-path): the detail breakdown reads TWO old tables, not one — getRisingStarScoreBreakdown
hits hcp_rising_star_ranks_v3 (momentum/visibility+archetype, 1786) AND hcp_network_momentum_v1 (early/recent
collaborator counts, 1805). We'd scoped the detail repoint as one table. Open Q for the detail rework: does the
new model's network_influence_pctile replace what hcp_network_momentum_v1 fed, or is that a separate collaborator-
count source to keep? Resolve before writing the detail-screen fork. ***

REGRESSION ORACLES for the whole fork: npm run typecheck == 70, npm run build GREEN, and the NSCLC rising
fingerprint (§8 of the audit; 10 rows, all "Balanced Rising Star", 100.0->99.43) byte-identical — re-confirmed
post-RPC-patch, frozen model intact. NEXT SESSION: author the fork spec from this map (still spec-then-build, not
blind), sequence the 3 plumbing sites + 3 model-rework sites, NSCLC conditional throughout.

### 30fp. STAGE 1 + STAGE 2 SHIPPED — AD Rising renders (Emergence/Network), committed + browser-verified. NSCLC frozen throughout.
AD Rising frontend is FUNCTIONALLY DONE. Two staged commits, each browser-verified before commit:
  STAGE 1 (plumbing, commit afa54d4): 3 AD-conditional edits — dispatch fork (getRisingStars: AD -> composite RPC
    names + "rising_composite" cohort tag), global short-circuit relaxed for rising_composite only (fetchCohortViaRpc
    476: `&& cohort !== "rising_composite"`), scope default AD-rising -> global (App.tsx x3). CODE CAUGHT A SPEC BUG:
    my EDIT 3 gated scope:'global' on isAd alone -> would have sent AD ESTABLISHED global too -> Established hits the
    still-closed short-circuit -> 447/Silverberg feed collapses to 0. Code re-gated on isAdRising (TA + rising TRACK).
    Verified: AD rising feed populates (Chovatiya #1, ~3052 global), NSCLC fingerprint byte-identical, AD Established
    intact (447, count flows to feedTotal/Load-More gate — there is NO standalone "447" header; feedTotal only drives
    Load-More), typecheck 70, build green. Null score tiles = EXPECTED (mapper not yet reworked).
  STAGE 2 (mapper + UI, commit f3ca0be): split rising_composite from rising_star. Discriminator design = OPTION B
    (keep cohort_classification="rising_star" so the ~15 legacy ===\"rising_star\" gates — incl. detail-fetch gates
    787/836 — stay UNTOUCHED; discriminate via an explicit mapper-set `rising_model:"composite"` field for the card
    + already-threaded taSlug for the detail). PHASE 0 GATE CAUGHT MY SPEC: Option A (set cohort_classification=
    "rising_composite") would have silently broken AD detail (fails the 787/836 fetch guards) AND created 15 NSCLC-
    regression surfaces. Chose explicit flag over emergence_pctile null-check (a flag can't be confused by data
    values). NSCLC byte-identical by ADD-BESIDE (separate mapper branch / early-return / nested block), not edit-
    through. Verified in browser: AD rising cards show EMERGENCE/NETWORK INFLUENCE real values (Chovatiya ~100/~100),
    no archetype, detail right-rail = composite headline + 2 tiles + "Emergence 75% / Network 25%"; NSCLC rising
    UNCHANGED (4 tiles + archetype). typecheck 70, build green.
  LOGGED CONSTRAINTS (Stage 2 deviations, all safety-motivated): (1) detail breakdown reads scope_type='global'
    always (DetailScreen passes no scope) — fine while AD defaults global, but a latent card/detail mismatch if per-
    scope rising views land later. (2) composite sets legacy m-v/archetype fields to 0/"" so legacy render needs no
    null-guards (dead zero-fields on composite objects; harmless). (3) getRisingCompositeScoreBreakdown DUPLICATES
    the collaborator-fetch rather than extracting a shared helper — deliberate, to keep the legacy body byte-
    identical; future refactor. STRABER SCARE resolved: known AD KOL "missing" from rising = correctly Established
    (US #108 / global #559, 9 AD pubs), never rising in either model. Model working, not a bug; global-default can
    bury known US names deep in the 3052 pool (product tradeoff to watch, not a defect).

### 30fq. NEXT (morning): AD Rising NARRATIVES — §30fs enrichment repoint. Traced, NOT a drop-in. Two real changes required.
Goal: AD rising narratives REFLECTIVE OF NSCLC rising (tone/structure/depth) — but NOT same scoring vocabulary
(NSCLC=momentum/visibility/archetype OLD model; AD=emergence/network NEW model). Trace of generate_narratives_v2.py:
  BLOCKER 1 — SOURCE HARDCODED to old model: rising_star cohort config -> hcp_rising_star_ranks_v3 (NSCLC-only, 0 AD
    rows); selection fetch_rising_star_top_hcp_ids_v3 orders by us_rank (AD composite us_rank is NULL -> global). An
    AD run as-is selects ZERO HCPs. Context join reads hcp_scientific_momentum_v1 + hcp_network_momentum_v1 (both
    NSCLC-only). MUST repoint: source -> hcp_rising_composite_v1, selection -> composite rank (global not us_rank),
    context -> emergence/network-influence.
  BLOCKER 2 — PROMPT hardcoded to old axes: build_prompt_rising_star anchors on archetype + momentum/visibility
    percentiles AND instructs the model to NAME the archetype ("...is a Scientific Accelerator..."). AD has none of
    these. MUST author a new Emergence/Network prompt: KEEP the structure (career-years framing; strict narrative/
    why_now/signal_strength/caution_flags/engagement_angle JSON; MSL tone; milestone close; no-marketing-words),
    REPLACE the data block with the 2 axes (Emergence = output 45% / senior-first authorship 35% / citations-per-
    paper 20%, cohort-relative; Network Influence = AD collaboration-graph position), DROP the archetype requirement.
    signal_strength keys off rising_composite_score (was rising_star_percentile).
  BOUND: RISING_DEFAULT_TOP_N=100; NSCLC rising ran top-100 US (95 have narratives = the parity target). AD rising
    match = top-100 (by composite global rank).
  IDEMPOTENCY: SAFE — upsert to hcp_narratives_v2 on_conflict (hcp_id, therapeutic_area_slug); per-slug so an AD
    ("atopic-dermatitis") run does NOT touch nsclc/established narratives; "only-missing" default + freshness skip;
    --force to regen. AD rising narrative coverage now = 0/3052 (the 198 existing atopic-dermatitis narratives are
    ESTABLISHED HCPs, different set).
  ⚠️ SLUG LANDMINE (verify before running): ta_slug_from_name("Atopic Dermatitis") = "atopic_dermatitis" (underscore)
    but frontend + existing rows use "atopic-dermatitis" (hyphen). Existing AD rows are hyphen -> ctx slug likely
    from a proper source, but CONFIRM the write resolves hyphen or narratives generate-but-don't-render.
  PLAN: (a) mechanical source-repoint (same fork pattern as the frontend, no creative judgment), (b) author the
    Emergence/Network prompt (needs Garrett's domain eye on the axis language — deferred to fresh session, not
    authored tired: billed run, expensive to regen if tone is off), (c) verify hyphen slug, (d) run top-100.

### 30fr. AD RISING NARRATIVES shipped (99/100) + FEED INDUSTRY BADGE. Two commits. AD Rising now complete end-to-end.
NARRATIVES (commit prior): repointed generate_narratives_v2.py TA-conditionally (AD rising -> composite +
emergence context + themes); authored the Emergence/Network prompt to the advisor spec (evidence->interpretation
->percentile-last; future-tense discipline; 60/40 emergence/network narrative weight vs 75/25 score; "single
strongest evidence" pre-step; priority-hook close; emergence_confidence [relabeled, DB key stays signal_strength];
caution_flags as semicolon-string [shared-writer constraint]; engagement_angle grounded in real per-HCP themes).
Themes run: extract_research_themes.py "rising-global" key, 100 HCPs, 1059 themes, $1.73, 1014 distinct labels
(near-total variety = genuine per-HCP extraction). Narrative run: 99/100 ($0.55; 1 JSON-parse fail on a null-
classification straggler, deferred). VALIDATED 4 samples: Chovatiya (clean), Rossi/Sanofi (industry caution fired
as TA-SIGNAL not disqualifier - the hardest instruction, worked), Winders (reasoned from advocacy themes, not
forced bench frame), thin-corpus (honest about limited independence). Added --ta flag to the generator (was
missing; ran all visible TAs). --target-version v2 required (v1 default looked ids up in old hcps table -> 0
collapse across ALL TAs; not an AD bug).

FEED INDUSTRY BADGE (commit 480f9ee): AD rising was rendering 17 not 20 - the client-side INDUSTRY_REGEX filter
(api.ts) was DROPPING 3 pharma-affiliated HCPs (Rossi/Sanofi #2, Kerkmann/Pfizer #13, Cyr/Regeneron #15). This
CONTRADICTED the narrative decision (industry authors are a TA-signal to surface, not hide). FIX (Option A, TA-
conditional): rising_composite KEEPS industry HCPs + badges them; rising_star (NSCLC) still filters (byte-
unchanged); established/community unchanged. 15 of top-100 AD rising are pharma-affiliated (Regeneron 7, Pfizer 5)
- a real finding about AD's industry-shaped literature, now surfaced not suppressed.

*** FOOTGUN (cost ~1hr tonight): STACKED ALLOWLIST REBUILDS. A new card field must be threaded through EVERY
rebuild hop or it SILENTLY VANISHES (renders nothing, no error, typecheck passes). The chain: api.ts mapper
(sets field on RisingStar) -> App.tsx mapRisingStarToHCP:335 (rebuilds field-by-field into AppHCP) -> HCPCard.
is_industry_affiliated was set at api.ts:425 (correct) but NOT copied at App.tsx:335 -> undefined at the card ->
badge never rendered. rising_model WAS in the App.tsx allowlist (Stage 2) which is why tiles worked - the
asymmetry (Stage-2 fields present, new field absent) is the diagnostic tell. FIX = add the field to the App.tsx
rebuild + declare on the UIHCP/HCP interface. LESSON: adding any card field = grep for ALL rebuild hops and thread
it through each; don't assume one mapper. This is the producer/consumer bug-class in a new location. ***

### 30fs. SESSION FRICTION NOTE (process, not code). Tooling latency >> problem difficulty tonight.
The badge bug was TINY (one missing field in one allowlist) but took ~1hr due to (a) Claude Code approval friction
(8-12 approvals/prompt, Garrett's back turned, no audio cue), and (b) blank-paste failures relaying Code output.
The DIAGNOSIS method was sound (Code reproduced the data path via RPC+source trace when it couldn't browser-auth);
latency was the enemy, not capability. NEXT SESSION OPENS WITH: (1) .claude/settings.json reads-allow block
(Read/Grep/Glob auto-approve) to kill high-volume trace approvals; (2) a notification HOOK (not a prompt) wired to
audio for when Code needs a real approval. Also: route SMALL diagnostics (field-present-where-is-it-dropped) direct
via SQL/grep, NOT through Code - the round-trip overhead swamps the benefit on 5-min traces. Reserve Code for
multi-file edits + genuinely multi-step work.

COMMITS THIS SESSION (branch ad-frontend-established, unpushed): RPC layer (447bedc) + est global patch; durability
fix (703ce9f); TA-fix de-hardcode NSCLC (60895fe); docs; Stage 1 plumbing (afa54d4); Stage 2 tiles (f3ca0be);
narrative repoint (f98e825); themes selection (e23e1b0); narrative prompt+themes+--ta; feed industry badge (480f9ee).
AD Rising = COMPLETE end-to-end (feed renders 20 w/ badges, narratives generated+validated, NSCLC frozen throughout).

NEXT WORKSTREAM (scoped, not started): COMMUNITY EXPLORER. Reframed from the July "dead end": the NPPES-first derm
ingestion WAS built (19,351 US derms, 11,506 w/ AD-drug Open Payments). Advisor directive (from prior chat, §30bn):
Community is a DIRECTORY, not a leaderboard - NO score, NO rank. Build = filter bar (state/subspecialty/engagement)
+ directory cards (engagement strip: Open Payments tier + AD-drug $ + top manufacturer) + "Also a published KOL"
badge for the 342 hcp_id-matched overlaps. Reads community_practitioners + community_practitioner_payments by
npi_number. Prototype (CommunityExplorer.jsx) already started, matches the directive. NO scoring/ranking/NPI-hcp_id-
matching-at-scale needed (Code's audit assumed a leaderboard the advisor already ruled out).

### 30ft. COMMUNITY EXPLORER shipped on real data + cohort-scope refinement + FUTURE data-completeness audit.
Community Explorer built end-to-end this session. Reframed from the July "dead end": the NPPES-first derm
ingestion WAS done (19,351 US derms in community_practitioners; 14,165 with Open Payments rows in
community_practitioner_payments; ~11,506 with AD-drug payments). Advisor directive (§30bn): DIRECTORY not
leaderboard — no rank, no 0-100 score, search/filter/browse.

BUILD: Stage 1 RPC get_community_directory_filtered + _count (commit ef78f54) — server-side filtered/sorted/
paginated over the 2 tables LEFT JOIN on npi_number; verified 19,351 full / 11,506 AD-drug / CA 2,555 / peds
259; LEFT JOIN proven 1:1 (no fan-out) by the exact full count; grants match established/rising posture.
Stage 2 frontend (commit acf87eb) — reworked the CommunityExplorer prototype (was mock/mulberry32 data) to
real server-driven data: debounced search, offset paging, reqIdRef stale-guard, taxonomy-label friendly map,
sole-prop-derived setting, jsonb top_manufacturer/drug parsing, MFR/DRUG display-name cleanup (raw NPPES is
ALL-CAPS "ABBVIE INC."->"AbbVie"), AD-conditional integration (other TAs/cohorts untouched). Browser-verified:
filters refetch server-side (peds->259), clean names, KOL badges, pagination.

POLISH (uncommitted at this writing): location onto the pin row (dropped low-signal sole-prop "setting"),
"Published KOL" badge reshaped to a compact teal pill in the bottom cluster, tenure copy "N yrs practicing",
skip the redundant getCommunity fetch on AD-community. NAME CASING: NPPES stores names + city ALL-CAPS ->
Title-Cased in mapper via nameCase() (NOT the corporate titleCase which strips Inc/Co/And). LOCATION 3-line
bug root cause = Tailwind Preflight forcing svg{display:block} -> MapPin took its own line; fixed with a flex
row on S.loc. LESSON: any inline icon+text in this app needs an explicit flex row (Preflight blocks svgs).
DROPPED the manufacturer-brand-color idea (Garrett's call): too many pharma brands are red/blue -> color would
imply a distinction it doesn't carry -> confusing, not informative. (Future meaningful-color option: heat by
AD-$ value, or color drug tags by drug class — encode real info, not brand.)

COHORT-SCOPE REFINEMENT (Garrett's product call, spec sent, not yet applied): Community should EXCLUDE
practitioners already designated as AD KOLs (in Established or Rising), NOT include everyone. Reasoning: if
Community is "everyone" it has no distinct identity from Established/Rising, and the "Published KOL" badge is
only interesting as a DISCOVERY signal — a community doctor you'd never have looked at who turns out to have a
publication footprint (the "Sheboygan doctor" case), NOT a redundant label on Silverberg. Data: of 342
matched_hcp_id overlaps, 195 are in Established/Rising (EXCLUDE — already surfaced as KOLs), 147 are matched-
but-not-a-designated-KOL (KEEP + badge — the discovery set). New directory total ~19,156. RPC gets a NOT EXISTS
anti-join vs hcp_established_ranks_v3 + hcp_rising_composite_v1 (AD-scoped, use EXISTS not JOIN to avoid the
fan-out that inflated 342->537 in a test query); is_published_kol = matched_hcp_id IS NOT NULL is correct
POST-exclusion.

*** FUTURE WORKSTREAM (scoped, NOT now) — COMMUNITY COHORT DATA-COMPLETENESS AUDIT ***
Garrett flagged (correctly): the "Published KOL" badge is limited by MATCH RECALL, not by how many community
docs actually publish. matched_hcp_id only exists where the NPPES<->hcps_v2 matcher confidently linked records;
name-matching across NPPES (ALL-CAPS names + address) and the corpus (formatted names + institution) is
lossy, so true-publishing community docs whose records didn't link are INVISIBLE as publishers (look identical
to never-published). 342 matched = high-confidence catches, not all publishers; true number is >=342 and
unknown. This is inherent to entity resolution (aggressive matching -> false-positive badges, worse than
misses) BUT the matcher may have been a fast exact-match first pass with real recall headroom (better name
normalization for the ALL-CAPS/middle-initial/suffix cases could lift catch rate). Broader question Garrett
raised: "what ELSE are we missing on this cohort?" — the whole Community cohort was built fast. Audit scope:
(1) measure NPPES<->corpus match RECALL (how far below achievable ceiling), (2) assess match PRECISION (are
the 342 even correct?), (3) badge is currently ANY-corpus-match not AD-specific publishing (a psoriasis
publisher gets the same badge), (4) is the 14,165/19,351 Open Payments coverage real (5,200 took no pharma $)
or a join/ingestion gap, (5) what enrichment Community lacks vs Established/Rising. IMPORTANT: the cohort-
exclusion logic shipping now is CORRECT REGARDLESS of match recall — better matching later just yields MORE
discovery cases, strengthening the feature, not invalidating it. So ship the logic now, audit as its own
focused session. Do NOT rabbit-hole the matcher mid-polish.

### 30fu. TELESCOPE shipped for AD (collaboration network) + interaction upgrades for BOTH TAs. Terminal Code switch.
Telescope = a co-authorship COLLABORATION NETWORK (d3-force graph), NOT a score quadrant. Audit corrected two
wrong premises: (1) positions are NOT precomputed and NOT score-based — d3-force lays out nodes by co-authorship
edges (weight = shared-pub count); color/size = cohort+rank. (2) NO dependency on the retired momentum/visibility/
archetype model — it consumes only cohort/rank/id/name/institution/score. So the "AD retired the axes" problem
did NOT apply. The real blocker was a TABLE-SOURCE dependency: generator read hcp_score_ranks_v2 (0 AD rows).

DECISION (Garrett, after seeing a mockup of the alternative): AD Telescope = the SAME collaboration network as
NSCLC, not a new emergence×network scatter. Reasoning: Telescope is a navigation/relationship surface ("find
interesting people, click, explore"), consistency across TAs matters, and the built apparatus is TA-agnostic and
reusable. The emergence×network SCATTER was mocked and considered — it's more analytically precise (readable 2-axis
standing, honest quadrants: high-emergence/low-network = "engage before connected") — but it answers a DIFFERENT
question (standing vs relationships) and would mean two Telescopes with two meanings. PARKED as a possible future
product-wide SECOND VIEW (a "Network / Landscape" toggle for ALL TAs), NOT an AD-specific fork.

BUILD (2 commits):
- DATA (generator + files): export_telescope_data.py repointed TA-conditionally via --ta flag (per the "every
  script takes --ta" standard; one script, not a fork). AD reads hcp_established_ranks_v3 (top-50) + hcp_rising_
  composite_v1 (global), co-authorship via publication_authors_v2, country='US' filter DROPPED (AD global-first —
  intl institutions now present, a genuine improvement over NSCLC's US-only graph). Exported telescope_ad_nodes.json
  (1,328 nodes: 50 est + 1,278 rising) + _edges.json (12,570). SMALLER than NSCLC (1,776) — no balloon, no cap.
  NSCLC path byte-faithful. NOTE: re-running NSCLC export showed DATA DRIFT (1,776->1,765 nodes) — the committed
  NSCLC telescope file is stale vs current data; benign (we reverted the NSCLC files to keep them frozen), but
  NSCLC telescope could be refreshed when desired (one command).
- FRONTEND: Telescope.tsx + TelescopeDrawer.tsx made TA-conditional (both import both node/edge pairs, switch by
  taId); isTelescopeAvailable extended to AD; TA-aware header/prose copy (AD drops "US-based"). NSCLC data frozen.

BUGS FOUND+FIXED in browser testing (all in shared apparatus, so BOTH TAs benefit):
- Drawer persisted stale selection across TA switch (NSCLC researcher lingering in AD drawer) → reset
  telescopeSelectedHcp on indicationTaId change.
- AD drawer had NO Top Collaborators / no KOL badges → the DRAWER also hardcoded NSCLC imports; AD's 12,570 edges
  weren't wired. Fixed by same TA-conditional import. (Collaborators derive from edges; badges from nodes.)
- Node-drift-on-click → NOT the centroid-zoom effect; root cause was un-memoized graphData rebuilding on every
  render → ForceGraph2D reheated the sim on any state change. Fixed with useMemo(graphData, [nodesData,edgesData]).

INTERACTION UPGRADES (deliberate, added iteratively per Garrett, tunable constants at top of Telescope.tsx — apply
to BOTH TAs since shared apparatus; NSCLC's UX genuinely improved, not kept byte-identical — intentional):
- Subtle "breathing"/tickle: custom d3 force (createBreathingForce) — random nudge + spring-to-home so nodes
  oscillate in place, don't drift. Constants AMBIENT_ALPHA, TICKLE_ALPHA. Garrett set AMBIENT_ALPHA=0 (continuous
  hum was too much) — kept tickle-on-click only ("tickle it and it moves a bit").
- Click-to-center PAN (centerAt, offset for the drawer so node lands in visible/left area, not behind drawer).
- Zoom-to-focus on select (SELECT_ZOOM), zoom back out on deselect/drawer-close (OVERVIEW_ZOOM=1.3, matches load).
- Selected-node HIGHLIGHT (ring/glow + larger) so it's unmistakable — critical after navigating via a collaborator
  click (previously panned to the area but you couldn't tell which node). Collaborator-name click selects the node;
  collaborator "XX papers" click → NEW (see below).
- COLLABORATOR PAPER-COUNT → SHARED-PUBLICATIONS BIBLIOGRAPHY ("we have the data" win): the HCP profile page's
  MiniCollaboratorNetwork already links "XX co-authored papers" → route /hcp/:id/publications-with/:partnerId →
  HcpPairPublicationsPage (needs only the 2 hcp_ids). Replicated VERBATIM in the Telescope drawer — clicking a
  collaborator's paper-count opens the same "A ↔ B, N shared publications" page. No new component, no new pattern.
  Makes Telescope a launchpad to evidence, not a dead end. Both TAs.

*** TOOLING: SWITCHED TO TERMINAL CLAUDE CODE (the fix for the desktop-app approval friction). ***
The desktop Claude app does NOT expose granular permissions — only all-approvals or the blunt "bypass permissions
mode" (unsafe on the auto-deploy repo). That was the root of two sessions of approval fatigue. FIX: installed
terminal Claude Code (native Windows installer: `irm https://claude.ai/install.ps1 | iex`; PATH = C:\Users\garre\
.local\bin), which HAS the permissions.allow allow-list. Set Read/Grep/Glob to auto-approve (user settings). The
repo already had a sane bash allow-list (run_sql.py, git status/diff/log, npm build/dev/typecheck, py_compile) —
so nearly all read/trace/SQL work now runs WITHOUT prompts, while edits/commits/git-push/billed-runs still ask.
Result: dramatically less friction AND eliminates the desktop-app<->relay. DEFAULT GOING FORWARD: terminal Code for
build sessions. Turned on desktop notification toggles too (Code permission requests / Code notifications / Response
completions) as backup. STILL WANTED: a terminal beep on attention — do via /config Notifications=terminal_bell, or
a Notification hook running powershell [console]::beep (confirm event schema via /hooks). Parked as a config task.

SESSION TALLY (this session): AD rising narrative loose ends (feed industry badge fix + 99/100 narratives generated,
validated, committed) → Community Explorer end-to-end (real 2-table data, server-side RPC, cohort-scope refinement
excluding designated KOLs, polish) → Telescope for AD (network + all interaction upgrades + bibliography link) →
terminal-Code tooling switch. Three surfaces + a tooling upgrade. Branch ad-frontend-established, all committed,
unpushed, nothing deployed.

PARKED / FUTURE (captured, not now): (1) emergence×network SCATTER as a product-wide 2nd Telescope view (toggle).
(2) Community cohort DATA-COMPLETENESS AUDIT (match recall/precision — the "Published KOL" badge is recall-limited,
§30ft). (3) ambient-liveliness left at AMBIENT_ALPHA=0 — could add deliberate subtle motion later if wanted.
(4) NSCLC telescope data refresh (stale by ~11 nodes). (5) terminal beep/notification hook. (6) manufacturer brand
colors in Community — DROPPED (too many red/blue pharma brands → color implies false distinction).

### 30fv. INSTITUTIONS surface made AD-aware end-to-end (4th surface). 3 pieces + 2 slug bugs + 6th-site partner fix.
Institutions = existing NSCLC-era surface (index list + detail page: LandscapeLeaderboards x4, Research Themes,
Collaborations, External Partners, pinning). Audit found it was NOT "already works" — three compounding blockers,
each an instance of the recurring "NSCLC-era convention AD doesn't match" pattern:

PIECE 1 (durable TA on detail route): InstitutionRoute (/institution/:slug — NO :ta in route) hardcoded
"nsclc"/"NSCLC" in 5 detail fetches + header. API layer was already TA-aware; caller wasn't. FIX threads the real
TA via a durable resolution chain (avoids the Pt.20 nav-state-evaporates-on-refresh bug): (1) ?ta= query param →
(2) location.state → (3) DATA-DERIVATION via new resolveInstitutionPrimaryTaId (mirrors resolvePrimaryTaId for HCP
detail — reads institution's HCPs from hcp_therapeutic_areas_v2, picks max-publication TA, NEVER defaults to NSCLC).
List callers (IndexRoute, InTerritoryPanel) append ?ta= for context-accuracy; ambiguous callers (~9: HCP cards,
home pins) fall through to derivation. Established + Research Themes populate for AD immediately (data existed).

PIECE 2 (rising repoint): the surface read hcp_rising_star_ranks_v3 (0 AD rows — same mismatch Telescope hit with
hcp_score_ranks_v2). AD rising lives in hcp_rising_composite_v1. Repointed TA-conditionally (AD → composite,
scope_type='region'/scope_value='US', mapping rank→us_rank & rising_composite_score→rising_star_percentile in old
row shape; NSCLC → frozen v3). "Highest Network Momentum"/"Most Connected" boards stay empty for AD (composite has
no momentum/visibility cols) — graceful. Necessary but NOT sufficient alone (see Piece 3).

PIECE 3 (institution-key repoint — the DEEPER root cause): the ENTIRE surface keyed HCP membership on
hcps_v2.institution_canonical, which is ~UNPOPULATED for AD (8/447 established; vs 447/447 have institution_normalized).
AD's institutions live in institution_normalized (Mount Sinai 23, Northwestern 22...). So index grouping + detail
HCP-set fetch barely intersected AD → empty list, "0 Established." FIX: new helper institutionColumnForTa(taId)
(AD → institution_normalized, else → institution_canonical), applied at all 6 sites (getInstitutionSummary,
getInstitutionLeaderboards, getInstitutionCollaborations, index grouping, getTopInstitutionsInTerritory,
slugToInstitution + getInstitutionExternalPartners). KEY SAFETY: canonical==normalized 99.5% where both exist, so
single-column .eq(col,name) avoids the PostgREST comma-in-.or() bug (e.g. "University of California, San Francisco"),
AND NSCLC stays frozen (always has canonical → canonical-first wins, normalized fallback never runs). Verified AD
Mount Sinai: 564 investigators / 44 rising / 23 established (was 0/4); AD list 218 institutions (was ~0); NSCLC Mount
Sinai 455/1/38 unchanged.

TWO PARENT-vs-INDICATION SLUG BUGS (this IS the multi-TA problem, live): InstitutionsInTerritoryPanel got taSlug =
taLabelToApiSlug("Immunology")="immunology" (PARENT) but taId = AD indication. Data strip worked (used taId); "View
all →" + card ?ta= links built from taSlug (parent) → /institutions/immunology = 0 results (index keys on indication
slug). NSCLC only dodged this because taLabelToApiSlug("Oncology") is HARDCODED to return "nsclc" — a landmine that
misfires for every future multi-indication parent. FIX: derive slug from indication taId (apiSlugForTaId(taId) ??
taSlug). NOTE: YourInstitutionsTile + UserMenu hardcode /institutions/nsclc — left as-is (static home/menu default,
a separate multi-TA-workstream item, not this bug).

6TH SITE (External Partners): confirm-before-acting caught it was populated-but-WRONG for AD — showed the NSCLC
canonical population's partners (455 canonical HCPs) on AD pages, silently mismatched. Repointed: source via
institutionColumnForTa, partner naming via canonical??normalized coalesce. AD Mount Sinai 147 (wrong) → 214 (correct,
Guttman-Yassky-driven: Rockefeller, Mississippi, GWU↔Silverberg, OHSU↔Simpson — unmistakably AD). All 6 sites now
TA-conditional. Committed as one coherent pass.

*** DATA-COMPLETENESS GAP #2 (root cause of Piece 3): institution_canonical is UNPOPULATED for AD (8/447). ***
The raw institution data WAS ingested (institution_normalized is full) — what's missing is the CANONICALIZED column.
Some NSCLC-era canonicalization step populated institution_canonical for NSCLC but never ran for AD. Tonight's fix
works AROUND it (frontend reads normalized for AD); the ROOT fix is running canonicalization for AD (unknown which
pipeline step does this — Garrett didn't recognize it → definitely a "later, properly" task). This is the SECOND
confirmed AD data-completeness gap (after Community's publication-match recall, §30ft) → strong evidence a PLATFORM-
WIDE AD DATA-COMPLETENESS AUDIT is a real needed workstream: systematically verify every NSCLC-era derived/processed
artifact has its AD equivalent (canonicalization, publication matching, and whatever else silently didn't carry over).

*** MULTI-TA NAVIGATION WORKSTREAM — now backed by LIVE EVIDENCE, not speculation. ***
Garrett flagged this morning that multi-TA UI/UX (a TA/indication selector showing only entitled TAs) is the missing
piece before "FieldMark supports multiple TAs" is true. Today surfaced the pattern REPEATEDLY as live bugs: (a) the
InstitutionRoute hardcoded-NSCLC, (b) the two parent-vs-indication slug bugs, (c) the taLabelToApiSlug("Oncology")→
"nsclc" hardcode papering over parent-vs-indication, (d) YourInstitutionsTile/UserMenu static /institutions/nsclc.
These are all the SAME disease: surfaces built when NSCLC was the only TA have NSCLC baked as the implicit default,
and parent-TA-group vs specific-indication isn't handled consistently. The workstream has THREE load-bearing unknowns
to resolve via a codebase audit BEFORE building a selector: (1) full inventory of hardcoded-NSCLC / parent-vs-
indication sites (Field Insights is another — clicking it → NSCLC insights); (2) is "current TA" single-source state
or ad hoc? (seen ≥5 mechanisms: /institutions/:ta URL param, indicationTaId prop, location.state, resolveLandscapeTaId,
resolvePrimaryTaId — likely needs consolidation); (3) does a user→TA ENTITLEMENT model exist, or is it unmodeled
(every user implicitly sees all TAs)? #2 and #3 are the architecture forks — they determine whether the selector is
"wire a picker to existing state+entitlements" or "build TA-state consolidation + entitlement model first." NEXT
SESSION opens with this audit (spec already drafted).

SESSION TALLY (full day): AD rising narrative loose ends → Community Explorer (end-to-end + cohort-scope refinement)
→ Telescope (network + interaction upgrades + bibliography link) → terminal-Code tooling switch (+ beep hook, fixed
via powershell.exe exec-form since no pwsh on the machine) → Institutions (AD-aware end-to-end, 4th surface). Four
surfaces + tooling. Branch ad-frontend-established, all committed, unpushed, nothing deployed. AD has reached SURFACE
parity with NSCLC — the remaining gap to "FieldMark supports 2 TAs" is the multi-TA NAVIGATION layer + the data-
completeness audit.

INSTITUTIONS FOLLOW-UPS (logged, not tonight): (a) rising sub-boards (momentum/visibility) empty for AD — expected.
(b) institution_canonical canonicalization for AD (root data fix). (c) collaborations panel is TA-agnostic (shows an
institution's full co-authorship graph incl. cross-TA pairs like the NSCLC imaging folks at Mount Sinai) — by design,
noted.

### 30fw. MULTI-TA AUDIT complete → docs/MULTI_TA_AUDIT.md. Workstream is FOUNDATION-FIRST (both forks confirmed).
Ran the read-only multi-TA audit (findings persisted to docs/MULTI_TA_AUDIT.md). Both load-bearing verdicts came
back as suspected → the multi-TA selector is NOT "wire a picker," it's build-foundations-first:
- Q2 SINGLE-SOURCE TA STATE? NO. There's a global TrackContext (sessionStorage) for TRACK, but nothing equivalent
  for TA. Feeds derive TA from the URL (/:ta/:dashboard/:indication → resolveFeedRoute, prop-drilled as
  selectedTA/indicationTaId); detail/secondary pages each derive independently (?ta= → location.state →
  resolvePrimaryTaId/resolveInstitutionPrimaryTaId → hardcoded nsclc). URL is de-facto source for FEEDS only. →
  Must introduce a TAContext (peer to TrackContext — precedent exists) BEFORE one selector can drive everything.
- Q3 ENTITLEMENT MODEL? UNMODELED. No user↔TA table / allow-list / subscription / RLS anywhere. Users gated by
  DATA-EXISTENCE (TAFilterChips = ["Oncology","Immunology"]), never by identity. → "show only my TAs" is build-
  from-scratch; clean hook = add allowed_ta_slugs text[] to msl_profiles, mirroring existing states_covered text[].
- Q1 HARDCODED INVENTORY: ~8 core (home tiles/home.ts, CoverageGapsTile, YourInstitutionsTile+institutionPins,
  PublicationsListPage, UserMenu nav, LandscapeRoute/InstitutionsIndexRoute ?? "nsclc", App.tsx:780) + ~8 latent
  ="nsclc" default params. FINITE (~16), scopeable. CAVEAT: file:line cites are from background sweeps — spot-check
  each before editing (state-model/registry claims were directly verified; inventory line numbers were not).
- Q4 REGISTRY: scattered across ≥6 parallel maps (api.ts + routeSlugs.ts + INDICATIONS_BY_TA); no canonical "all
  TAs" structure. Main hazard = parent↔indication split (Oncology≠data-slug nsclc — the exact bug from §30fv).
- Q5 NAV HOME: TAFilterChips + IndicationFilter render only in the feed shell. TopBar is ALREADY TA-aware
  (currentTaId) and in BOTH chrome shells → the natural home for a global selector. No new chrome needed.
SEQUENCE (from the audit): consolidate TA state (TAContext) → build entitlement (allowed_ta_slugs on msl_profiles)
→ unify TA registry → un-hardcode the ~16 surfaces → home the selector in TopBar. This is the next major workstream;
next session can open directly on it (audit doc is the map).

### 30fx. MULTI-TA Phase 1a (TAContext foundation) committed + the AMBIENT-vs-ENTITY boundary rule.
Phase 1a committed (7b56dcc): built TAContext (frontend/src/lib/TAContext.tsx), mirroring TrackContext exactly
(lazy sessionStorage init key "fieldmark.ta", write-through setTA, TAProvider nested in TrackProvider at App root,
throwing useTA hook). Context value: {parentTa:{label,slug,uuid}, indication:{label,slug}, indicationTaId, dataSlug}.
THE critical normalization: indicationTaId = TA_ID_MAP[dataSlug] for BOTH TAs (NOT getIndicationTaId, which returns
undefined for NSCLC) — collapses the "NSCLC resolves via parent-slug path / AD via indication path" asymmetry that
caused the === AD_TA_ID special-casing everywhere. Browser-verified in console: NSCLC feed → indicationTaId
c0065b03, AD feed → 9e4139d2, both correct+defined, flips on chip/pill click. WRITERS wired (FeedLayout mirrors the
URL-resolved route into context; TAFilterChips + IndicationFilter set it alongside navigate()). NO readers migrated
— zero behavior change (inert foundation). Dev-only inspection (console.log + window.__fieldmarkTA, DEV-gated) KEPT
through 1b as the migration-watch window; remove after. Audit doc also committed (c8accde, docs/MULTI_TA_AUDIT.md).

*** THE AMBIENT-vs-ENTITY BOUNDARY (durable rule — prevents a whole bug class; do NOT re-litigate) ***
Discovered when scoping Phase 1b: TAContext holds "which TA is the USER browsing" (ambient). This is the RIGHT
source for AMBIENT/NAVIGATION surfaces (feeds, home tiles, the future TA selector) — answer "what is the user
looking at?". It is the WRONG source for ENTITY-DETAIL surfaces (an HCP's page, an institution's page) — those
answer "what does THIS entity belong to?" and must derive the ENTITY'S OWN TA from its data (resolvePrimaryTaId
from hcp_therapeutic_areas_v2 / resolveInstitutionPrimaryTaId). The two facts DIVERGE: browse AD → click an
NSCLC-only investigator → user-TA=AD is flatly wrong for that HCP=NSCLC. The HCP-detail family (DetailScreen,
HcpPositionsPage, HcpPublicationsPage) already resolves correctly via resolvePrimaryTaId (fixed Pt.20 era) and does
NOT have a durability bug — wiring it to TAContext would ACTIVELY BREAK it (overwrite correct entity-TA with stale
ambient user-TA). So detail pages are NOT a deferred migration step — they are DELIBERATELY EXCLUDED. RULE:
- AMBIENT/NAV surfaces → read TAContext.
- ENTITY-DETAIL surfaces → resolve the entity's own TA; NEVER read TAContext.
The only later detail-related item is OPTIONAL: stamping ?ta=<slug> into links BUILT TO detail pages (TAContext as
a WRITER-side hint at navigation time, preserving browsing context) — NOT the detail page READING TAContext. Different
mechanism, optional polish, later.

PHASE 1B PLAN (readers to migrate — ambient surfaces currently wrong): (1) HOME TILES first (CoverageGapsTile,
YourInstitutionsTile, home.ts) — hardcoded to NSCLC today, ambient, so TAContext is correct → migrating FIXES a real
bug (they'll respect the actual TA instead of always NSCLC). (2) the === AD_TA_ID feed branches (ambient; collapses
AD special-casing once they read normalized indicationTaId from context). (3) assess PublicationsListPage (carries no
TA — check if ambient or entity-scoped first). Detail pages EXCLUDED per the boundary above. Migrate incrementally,
verify each, keep the dev inspection through 1b.

### 30fy. MULTI-TA Phase 1b.1 (home tiles) committed + 3 durable patterns + the rising-table gap is now systemic.
Phase 1b.1 committed (26187c4): migrated the three HOME tiles to read the current TA from TAContext (first real
consumers of the foundation). CoverageGapsTile, YourInstitutionsTile, home.ts (non-component helper — taId passed
as param, no hook) now source indicationTaId/dataSlug/indication.label from useTA() instead of hardcoded NSCLC.
Pins left global (no TA column). Detail-nav left alone (entity resolves own TA — the boundary). typecheck 70→70.

THREE DURABLE PATTERNS ESTABLISHED (each prevents a recurring bug class):
1. HIDE-WHEN-EMPTY (not render-empty): a tile with no data for the current TA returns null (hidden), NOT an empty
   shell (which reads as "broken"). Garrett's requirement: no visible empty tiles. Scoped to TA-DATA-ABSENCE tiles
   (CoverageGaps, YourInstitutions) — deliberately NOT applied to the account-activity tiles (NextActions,
   OverdueFollowUps, RecentInsights/Briefs/Activity, TeamIntelligence) whose empty states are useful NEW-USER
   onboarding guidance ("no follow-ups"), not TA-absence shells. The discrimination matters: empty≠empty.
2. HOME TA = PROFILE DEFAULT (not last-browsed): HomePage lives at /me (NOT a feed route), so FeedLayout never
   seeds TAContext there → home read stale sessionStorage (whatever TA was last browsed). This CAUSED A REGRESSION
   (browse AD to test → home inherited AD → NSCLC coverage-gaps came back empty → hide fired → Garrett's whole
   Territory/Coverage section vanished — the frozen thing broke). FIX: home anchors to msl_profiles.default_ta_slug/
   default_indication_slug, seeds TAContext with it via setTA. Correct semantic (home = your PRIMARY TA, stable,
   not incidental browsing) and it's what production always did. FORWARD-LOOKING (Code's note): when the switcher
   ships, home should follow the deliberate switch → seed becomes "explicit switch if set, else profile default."
   The profile-default seed is also the same msl_profiles mechanism allowed_ta_slugs (entitlement) will live on.
3. AMBIENT-vs-ENTITY (reaffirmed, §30fx): home tiles = ambient → TAContext; detail nav = entity → own resolver.

*** THE hcp_rising_star_ranks_v3 GAP IS NOW SYSTEMIC (4th surface). Escalate to the data-completeness audit. ***
CoverageGapsTile can't populate for AD — and it's the FOURTH surface to hit hcp_rising_star_ranks_v3 (0 AD rows) vs
hcp_rising_composite_v1 (Telescope, Institutions Piece 2, home coverage-gaps/territory). BUT coverage-gaps is worse
than a rank-table swap: it's STRUCTURALLY a US-territory feature — joins hcps_v2 with cohort_classification=
'rising_star' (AD: 1/684 tagged) AND nppes_practice_state IN territory (AD: 1/684 have US practice state). AD rising
= international academics with no US NPI → the "US-state territory coverage gap" concept DOESN'T MAP onto AD. Code
correctly REFUSED to ship the repoint (it wouldn't populate — feature/population mismatch, not a data gap). So
CoverageGaps HIDES on AD (pattern #1). This is the THIRD "NSCLC feature that doesn't cleanly transfer to AD because
the fields are structurally different" (US-clinical vs global-academic) — joining the Telescope scatter question
(§30fu) and Community cohort-meaning. EMERGING CATEGORY: not every feature is TA-agnostic; some encode field-
structure assumptions (US territories, clinical practice) that don't transfer. Matters for TA #3+.
→ Two things for the DATA-COMPLETENESS AUDIT: (a) systematic "every surface reading hcp_rising_star_ranks_v3 needs
an AD composite path" sweep (4 surfaces hit reactively — a 5th will too; fix as one pass, or consider a canonical
AD-rising source everything reads). (b) catalog the "structurally-non-transferable NSCLC features" so multi-TA
design handles them deliberately (redesign / hide / TA-specific-tile) rather than shipping empties.

DAY TALLY (this was a huge multi-session day): AD rising narrative loose ends → Community Explorer (end-to-end +
cohort refinement) → Telescope (network + interactions + bibliography link) → terminal-Code switch (+ working beep,
powershell.exe exec-form) → Institutions (AD-aware, 4th surface, 6 sites) → multi-TA audit → TAContext foundation
(Phase 1a) → home tiles (Phase 1b.1). FOUR surfaces + tooling + the multi-TA foundation & first consumer migration.
AD has SURFACE parity with NSCLC; the remaining gap to "FieldMark supports 2 TAs" = finish multi-TA nav (feed
branches → entitlement → TopBar switcher) + the data-completeness audit. Branch ad-frontend-established, all
committed, unpushed, NOTHING DEPLOYED.

*** MERGE/DEPLOY STRATEGY — a real upcoming decision (flagged, not yet decided). ***
A LARGE unshipped delta is accumulating on ad-frontend-established (4 surfaces + multi-TA foundation, all committed,
none ever deployed — foundation-rebuild auto-deploys to app.besselanalytics.com). The branch is CORRECT (isolates
in-progress work from the auto-deploy branch; solo dev so no drift risk from the target moving). But "committed" ≠
"live/validated in production," and the gap grows. Decide before the merge becomes intimidating: merge UNIT (big-bang
all-at-once vs incremental stable chunks), and the test/rollback plan for landing it on foundation-rebuild. Likely
path: build AD to a complete coherent product (surfaces + multi-TA nav + switcher), THEN one considered merge — but
plan it (test plan, rollback) rather than a bare git merge. Not urgent; on the horizon.

NEXT SESSION opens clean on: Phase 1b.2 (the === AD_TA_ID feed branches — pure ambient, no product questions,
collapses AD special-casing) → entitlement model (allowed_ta_slugs on msl_profiles) → TopBar switcher (ALL / entitled
TAs, per Garrett's product call) → then "ALL" per-surface design. Parked: data-completeness audit, coverage-gaps-for-
AD redesign, merge/deploy strategy.

### 30fz. MULTI-TA Phase 1b.2 (Change 1) — feed AD-branch predicates re-sourced. Context-lag principle discovered.
1b.2 was NOT a collapse (the trace killed that premise): zero category-(a) collapsible branches exist — the pure
TA-ID substitution already happened at api.ts:1073 (const taId = filters.taId ?? TA_ID_MAP[taSlug], TA-agnostic).
All 12 === AD_TA_ID comparisons are (b) source-differences or (c) behavioral-differences that STAY. So 1b.2 = a
RE-SOURCING job: branches stay, but stop hardcoding the '9e4139d2' UUID literal.

*** CONTEXT-LAG PRINCIPLE (important, architectural — will recur) ***
The naive "read dataSlug from useTA()" would have SILENTLY BROKEN AD Rising. Mechanism: TAContext is seeded by an
EFFECT (setTA at App.tsx:375-377), effects run AFTER render → context LAGS the URL by one render. On switch to AD
Rising, the fetch effect fires at commit N where context dataSlug is still "nsclc" → isAdRising=false → region/US
fetch runs instead of scope:"global". At N+1 dataSlug becomes AD but it's not in the effect deps → never re-fires →
AD Rising silently shows only the ~18% US subset, no error (api.ts:1082 routes composite either way — taId-based).
Worse on cold deep-link (TAProvider seeds from sessionStorage, not URL). Code caught this by tracing the effect deps
BEFORE changing anything. FIX (Change 1, done): derive the predicate SYNCHRONOUSLY from the ROUTE via the shared
pure fn — exported deriveTAValue(parentSlug, indicationSlug) from TAContext, computed isAdFeed from route.taSlug/
indicationSlug (same synchronous source :370 uses) → correct at render N, no lag, no double-fetch, no flash. Replaced
all 8 hardcoded '9e4139d2' literals in App.tsx with isAdFeed. Equivalence PROVEN route-by-route (the tricky one:
Immunology "All" carries AD's taId → isAdFeed must be true → it is, via all:"All" fallback through getIndicationTaId
→ atopic-dermatitis; Oncology "All"→nsclc→false; inactive indications→immunology→false — all match today). :370,
api.ts (frozen :1082 rising split + institutions checks), and the filters.therapeuticArea taSlug axis left untouched.
typecheck clean, build green.

DURABLE PRINCIPLE: the URL is the SYNCHRONOUS source of truth for feeds; TAContext is a MIRROR that lags one render.
So render-time/effect predicates on feed routes must derive from the ROUTE (via deriveTAValue), NOT from the lagging
context. Context is for consumers that lack the route handy or tolerate the lag. THE LAG IS ROUTED AROUND, NOT FIXED
— any FUTURE consumer reading dataSlug from useTA() in a render/effect inherits the same bug. STANDING DECISION for
later: either keep deriving-from-route at each site, OR make TAProvider derive synchronously from the URL (Code's
"option 2") so the context never lags and any consumer can read useTA() safely. Option 2 is the cleaner long-term fix
and matters before the TopBar switcher (consumers need to trust useTA()). CAPTURED as a decision, not yet made.

CHANGE 2 (deferred, own verified step): migrating App.tsx:370 (the feed taId derivation) to the normalized context
value flips NSCLC indicationTaId undefined→c0065b03. Most consumers safe, but App.tsx:636/651 puts taId into nav
state and HCP detail keys off its ABSENCE (:1111-1112): today NSCLC card clicks have undefined taId → triggers async
resolvePrimaryTaId(hcpId); after migration NSCLC would skip to c0065b03 — probably correct+faster but a LIVE behavior
change on the frozen NSCLC HCP-detail path (fetch ordering, first-paint timing). Deliberate, separately-verified step
— NOT bundled into 1b.2.

### 30ga. *** MAJOR DATA BUG FOUND: NSCLC Established feed is 61% non-NSCLC (scorer cartesian product + incomplete v2→v3 migration). Change 2 BLOCKED & would MASK it. ***
The Change-2 nav-state question (should NSCLC card-click show NSCLC data?) led to quantifying "how many NSCLC-feed
HCPs resolve to a non-NSCLC dominant TA" → 42.7% (!!). Pulling that thread found a real data bug, fully diagnosed:

WHAT'S WRONG (confirmed in data + code):
- hcp_established_ranks_v3 (the Established feed's table) is TWO PIPELINES FUSED: AD's 4,916 rows = the NEW correct
  per-TA path (recompute_established_ranks_v3.py, which reads hcp_cohort_classification_v2 filtered by TA). NSCLC's
  22,364 rows (11,390 distinct HCPs) = LEGACY v2-era material carrying contamination. Hepatology = 0 rows (never
  materialized into v3).
- ROOT CAUSE of the contamination: established_scoring.py:454 is a CARTESIAN PRODUCT — `for hcp in hcps: for ta_id
  in TARGET_TA_IDS:` writes a score row for EVERY HCP × EVERY TA unconditionally. NO membership check;
  hcp_therapeutic_areas_v2 never read. When an HCP has 0 pubs in a TA, 4 signals zero out BUT career_age and
  pharma_breadth are TA-INDEPENDENT (~20% of composite) → a long-career US hepatologist with pharma ties earns ~20%
  of the NSCLC composite with ZERO NSCLC pubs → sorts below genuine NSCLC researchers but above zero. Contamination
  starts at rank ~190 (median ~2,020); ranks 1-200 are PRISTINE (why nobody noticed / demos look clean). This is
  EXACTLY the TA_BUILD_DEBT.md:1038 prediction ("ensure per-(HCP,TA) scoping").
- SECOND FACTOR: hcp_cohort_classification_v2 (the new per-TA classification table the correct v3 script reads) was
  ONLY populated for Atopic Dermatitis (2,586 rows; ZERO NSCLC, ZERO Hepatology). So recompute_established_ranks_v3
  --ta nsclc would fetch an empty cohort. NSCLC + Hepatology were never migrated to the new path → NSCLC still serves
  legacy contaminated rows, Hepatology has no established board at all.
- COUNTS: 6,948 of 11,390 NSCLC-ranked HCPs (61%) have NO NSCLC membership row (4,890 Hepatology, 2,041 untagged,
  131 AD, 3 Rare Disease). Hepatology genuinely 0 in v3. Rising (0.3% off) + Community (0.0%) are CLEAN — built by
  different properly-scoped paths. So this is Established-feed + NSCLC specific.

WHY CHANGE 2 IS NOW DEAD (and was dangerous): Change 2 (make NSCLC card-click use the feed's c0065b03 instead of the
async resolvePrimaryTaId) would route all 6,948 contaminated HCPs straight to a hollow NSCLC page — turning today's
LOUD/diagnosable symptoms (hepatologist → populated Hep page OR honest not-found) into QUIET/plausible WRONG pages
(null score/rank/narrative rendered as NSCLC). It would MASK the data bug. DO NOT do Change 2 until the data is
fixed. Leave App.tsx:370 on getIndicationTaId (undefined for NSCLC). After the data fix, 42.7%→~0 and Change 2
becomes the trivial timing win it was meant to be.

FIX SHAPE (a deliberate data-pipeline task — NOT done yet, deserves a fresh careful pass):
1. Populate hcp_cohort_classification_v2 for NSCLC (+ Hepatology) with genuine per-TA classification (same path AD
   already uses).
2. Run recompute_established_ranks_v3.py --ta nsclc --ta hepatology to overwrite legacy NSCLC rows with properly-
   scoped ones. *** CRITICAL CAVEAT: it UPSERTS — stale legacy rows for HCPs no longer in the cohort will NOT be
   deleted, so the 6,948 will SURVIVE the rebuild unless there's an EXPLICIT DELETE first. *** Miss this and the
   fix silently doesn't work.
3. Separately fix the cartesian product in established_scoring.py (add the per-(HCP,TA) membership check) so it
   doesn't re-contaminate on future runs.
EFFECT: NSCLC established board 11,390 → ~4,442 HCPs (US region 2,885 → ~1,223). Ranks 1-200 UNAFFECTED (already
genuine NSCLC — demo surface doesn't move). Hepatology gains its established cohort. 42.7% non-NSCLC → ~0.

BROADER IMPLICATION — this is the poster child for the DATA-COMPLETENESS AUDIT: an NSCLC-era pipeline step (the
cartesian scorer) that wasn't per-(HCP,TA)-scoped, PLUS an incomplete migration (hcp_cohort_classification_v2 only
populated for AD). The classification-table-only-for-AD gap suggests OTHER things keyed on that table may also be
AD-only — check as part of this. Joins the growing pattern: institution_canonical unpopulated for AD (§30fv),
hcp_rising_star_ranks_v3 0-AD-rows hitting 4 surfaces (§30fy), and now this. There is a systemic "NSCLC-era artifacts
weren't properly TA-scoped when new TAs were added, and the corrected paths weren't back-filled for the old TAs."

NOTE: this bug is NOT demo-urgent (ranks 1-200 clean, nothing visible is wrong today). It's a correctness bug in the
tail. Fix deliberately, not rushed. Diagnosis is COMPLETE (this entry) — the fix is a clean pickup.

### 30gb. ESTABLISHED-SCORER FIX — step 1 (NSCLC classification) validated + the dedup reversal + fragments deferred.
Executing the fix from §30ga. Chain: dedup(skip) → classification → leadership scoring → rank rebuild(dry-run gate)
→ execute → sweep → downstream regen → then Change 2.

CLASSIFICATION (cohort_classification_v2.py --ta nsclc) — DRY-RUN VALIDATED, safe to execute:
- Invocation mirrors AD exactly: `--ta nsclc --execute` (plain execute, NOT --cohort — the table holds all 4
  cohorts). Module constants TA_ESTABLISHED_MIN_PUBS=5 are STANDARD for all TAs — do NOT tune. Doc traps: ignore
  TA_BUILD_DEBT.md:1148 (obsolete --threshold 85 version) and :1449 (9,466 predates the ta_pubs gate).
- SAFE: additive (upsert on (hcp_id, therapeutic_area_id); AD's rows on 9e4139d2, NSCLC on c0065b03 → no conflict,
  AD's 2,586 untouched); assert_scoped_ta_writes guards it (raises SAFETY VIOLATION if any row's taId ≠ scoped).
  Dry-run writes nothing (print_dry_run_report before the write branch).
- DRY-RUN RESULTS (exact match to projection): established 16,906 (21.2%), rising_eligible 17,096, too_young 1,654,
  community 44,248 — all ✓ exact. NEGATIVE spot-check PASSES: Frank Tacke (genuine hepatologist, 200+ pre-2020 pubs)
  correctly lands COMMUNITY on ta_pubs=1 — the TA-anchor working (old global gate would've made him established).
  No hepatologist lands established. POSITIVE spot-check PASSES: every NSCLC reference KOL established (Heymach 280,
  Reck 278, Paz-Ares 250, Ramalingam 216, Jänne 180, Herbst, Wakelee, Langer, Socinski, Soria, Scagliotti...).
  Sharp discrimination: Naiyer Rizvi (career 1998) → established vs Hira Rizvi (career 2017) → rising_eligible.
- Print-only spillover-check edit (SAFE, cosmetic): keyed the KOL surname list by ta_id (NOT replacing ad_kol_surnames
  — that'd break future AD readouts); used ASCII-safe fragments. classify_hcp/thresholds/upsert/assert untouched.

*** THE DEDUP REVERSAL (important — my "dedup first" call was WRONG) ***
The dry-run exposed FRAGMENTED NSCLC identities (Camidge split 4 ways: D.Ross 159 / David Ross 9 / D.R. 4 / David 0;
Hirsch 3 ways; Soria, Rosell, Gadgeel, Gandara also). I inferred "NSCLC skipped dedup, must run it first" per
TA_NEW_PLAYBOOK.md:610. THAT INFERENCE WAS WRONG. Dedup has NO TA dimension — it ALREADY ran globally over the whole
identity space incl. NSCLC (proof: 584 of 613 Jul-7 merge-candidate stubs are gone from hcps_v2). The fragments
survive because the CONSERVATIVE MATCHER evaluated and REJECTED those pairs, not because nobody looked: strict_name_match
strips only TRAILING initials (so "D. Ross" ≠ "David Ross"), reduces initial-only first names to empty (rejected), and
drops surnames above the rarity bar (Hirsch freq 22 > 10 → dropped). Re-running dedup would fix NONE of them.
AND DEDUP IS DANGEROUS TO RUN: it's GLOBAL, DESTRUCTIVE, IRREVERSIBLE (no merged_into log / tombstone / pointer —
stub hard-deleted), and repoints ~39 FKs incl. AD's committed tables + the frozen NSCLC rank rows. It's the exact
OPPOSITE of the classification's additive/scoped/guarded safety. Fixing the fragments requires RELAXING the matcher
(abbreviated-first-name / higher rarity bar) → sharply raises FALSE-MERGE risk, and a false merge (two real people
fused) is unrecoverable. TA_BUILD_DEBT.md:2003: "NEVER merge on name alone; require ≥1 corroborating signal."
DECISION: DO NOT gate the fix on dedup. Proceed with classification --execute. The fragments are a RANKING-QUALITY
issue (Camidge's 159-identity still lands established + ranks correctly; the 9/4/0 fragments rank low/community — some
low-ranked ghosts deep in the list), NOT a correctness blocker. Weigh against what the fix buys: 61% wrong → ~0 on the
established board. The contamination fix is a massive correctness win; the fragments are a minor blemish the matcher
CAN'T safely fix anyway.

*** DEFERRED SCOPED WORK: NSCLC identity fragments. *** Camidge (4-way), Hirsch (3-way), Soria, Rosell, Gadgeel,
Gandara and similar rank below true standing because the conservative matcher deliberately refuses their ambiguous
pairs. Fixing = relaxing strict_name_match (abbreviated first names, rarity bar) WITH a domain-expert false-merge
review loop (dedup_detect writes dedup_candidates_phase1.csv — BACK IT UP first, re-running detect overwrites the only
record of the 584 completed merges; dedup_merge --dry-run is a genuine preview). A real project, NOT a prerequisite,
NOT safe to rush. Ranking-quality, not correctness.

NEXT: run classification --execute (billed, additive, validated) → verify NSCLC ~16,906 established + AD's 2,586
unchanged → then leadership scoring (publication_leadership_scoring.py --ta nsclc, prerequisite for the 0.75 signal) →
rank rebuild dry-run with explicit weights --w-scientific 0.75 --w-network 0.25 --w-pharma 0.0 --debug-top 30 (the
step-6 doctrine gate: do US top-20 recover known KOLs?) → execute + sweep (computed_at < t0 on BOTH hcp_established_
ranks_v3 AND hcp_publication_leadership_v2, which has the same stale-row problem, 4,045 orphans) → downstream regen
(narratives/themes/positions/telescope/NPI for ~23,000 flipped HCPs — the real cost) → Change 2 becomes trivial.

### 30gc. [FOLLOW-UP, small frontend] Display scores to ONE DECIMAL across all surfaces.
Garrett's call while validating the corrected NSCLC board: show scores as 99.8 / 99.7 / 99.6 rather than
99 / 99 / 99. Reasoning: scores are percentiles (0-100) and COMPRESS hard at the top (being #1 vs #10 of 16,906
is a razor-thin percentile gap), so whole-number display shows a wall of identical "99"s at the top of the board
where the discrimination is most interesting. One decimal surfaces the real rank separation. This is a FRONTEND
DISPLAY change (the scores are stored precise; the UI is rounding) — NOT a scoring change, decoupled from the
established-rebuild data fix. Do it as its own clean pass AFTER the rebuild, and apply UNIFORMLY everywhere a
score renders: HCP cards, the Established/Rising board, HCP detail page, and Telescope drawer (check each). Small,
cross-cutting, good UX. Deferred so as not to context-switch mid-rebuild.

### 30gd. *** ESTABLISHED-SCORER FIX LANDED CLEAN — NSCLC contamination ELIMINATED (61% → 0%). ***
The §30ga-§30gc fix executed successfully. The NSCLC Established board is now 100% genuine-NSCLC-membership.

EXECUTION (all billed steps done, verified at every gate, NOTHING committed to git — only DB writes):
- Step 1: cohort_classification_v2.py --ta nsclc --execute → NSCLC 16,906 established (AD's 2,586 untouched). §30gb.
- Step 2: publication_leadership_scoring.py --ta nsclc (dropped --dry-run; DANGER: opt-out dry-run) → 20,951 NSCLC
  rows (16,906 fresh + 4,045 orphans). Top-30 sci-influence = real KOLs (Wu, Zhou, Reck, Paz-Ares, Peters, Mok...).
- Step 3-6 rank rebuild (the protected sequence — snapshot → t0 → execute → verify → sweep → verify):
  * SNAPSHOT: hcp_established_ranks_v3_nsclc_contaminated_backup (22,364) + hcp_publication_leadership_v2_nsclc_
    presweep_backup (20,951). Both revert paths retained (drop when satisfied).
  * t0(rebuild) = 2026-07-15 18:30:49.991189+00. recompute_established_ranks_v3.py --ta nsclc --w-scientific 0.75
    --w-network 0.25 --w-pharma 0.0 (weights EXPLICIT — defaults 0.50/0.35/0.15 are wrong) → 33,121 rows (16,906
    global + 16,215 region; 71 scopes = 70 countries + 1 global). US board validated by Garrett (domain eye):
    Riely #1, Ramalingam, Jänne, Hirsch #4, Herbst, Heymach, Camidge #8 — the real US NSCLC leadership. Global
    board China-heavy (CN 5,013 > US 3,179) — legitimate, Garrett couldn't personally verify intl names but method
    validated via US board + zero contamination.
  * *** CRITICAL SWEEP CATCH (Code caught a bug in my sweep spec): the two tables need DIFFERENT computed_at
    boundaries because they were written at different times. Ranks: < rebuild-t0 (18:30:49). Leadership: < ITS OWN
    run's t0 (18:02:39), NOT the rebuild's — the leadership FRESH rows are at 18:02:39, so < 18:30:49 would have
    deleted the 16,906 fresh scientific signal the board was just built from. A mechanical application of my
    original "computed_at < t0" for both would have GUTTED the board. Gated-before-destructive-step caught it. ***
  * Sweeps hit EXACT predicted counts: ranks 17,189 deleted, leadership 4,045 deleted. Gate 6: ranks_v3 NSCLC
    33,121/16,906-distinct/0-stale; leadership_v2 NSCLC 16,906/0-stale; AD untouched in both (07-08 stamps).

THE DEFINITIVE RESULT — established cohort is now 100% genuine NSCLC membership:
  NSCLC-dominant 15,675 (92.72%), Hepatology-dominant 1,230 (7.28%), AD 1. ALL 16,906 have genuine NSCLC membership;
  ZERO no-membership rows. The 7.28% Hep-dominant are NOT contamination — they clear the ≥5-NSCLC-pubs gate AND
  carry NSCLC membership (legitimate multi-TA researchers, §26b "v2 multi-TA architecture working as designed").
  The original diagnostic query: 42.7% → 5.2% non-NSCLC across all feeds (residual = real multi-TA overlap, not
  contamination). Board: 11,390 (61% junk) → 16,906 (100% genuine).

STILL OPEN (post-fix):
- *** DOWNSTREAM REGENERATION (the real remaining cost): the 14,303 newly-established HCPs have NO narratives, NO
  research themes, NO scientific positions, NO NPI resolution, NO telescope nodes. The rank rebuild was the cheap
  part. This is a large billed multi-pipeline regen (generate_narratives_v2, extract_research_themes, extract_
  scientific_positions, established_npi_resolver, export_telescope_data — all --ta nsclc). Dropped establisheds
  leave orphaned artifacts. Plan deliberately. ***
- CHANGE 2 now has its HONEST number: the nav-state decision affects ~5.2% genuine multi-TA HCPs (was framed as
  42.7% contamination — that's gone). ~1,230 NSCLC-feed HCPs still resolve to Hepatology (legitimately). Change 2
  is now a real (small) product decision, no longer masking a bug. Revisit if desired.
- established_scoring.py cartesian product — still LATENT (it writes hcp_established_scores_v2, a legacy chain the
  feed no longer reads, but re-running it would re-contaminate). Worth retiring or guarding (add the per-(HCP,TA)
  membership check). Not urgent (nothing reads its output for the feed now).
- FRAGMENTS (Camidge x4, Hirsch x3, etc.) — deferred; needs matcher relaxation + domain-expert false-merge review,
  NOT a dedup re-run (§30gb). Ranking-quality, not correctness.
- BACKUP TABLES (2) retained — drop when satisfied the fix is stable.
- Score display to 1 decimal (§30gc) — deferred frontend follow-up.

### 30ge. DOWNSTREAM REGEN scoped + telescope repointed + TWO MORE contaminated surfaces found (getTACounts, getHCPDetail).
Scoping the downstream regen (§30gd) revealed the "14,303 need everything" framing was WRONG — these pipelines were
never meant to cover the whole cohort (generate_narratives_v2 has ESTABLISHED_DEFAULT_TOP_N=100 → top-100 per TA×scope,
which is why AD sits at 198/2,586). Real targets are top-slices, not 16,906. Three of four pipelines (narratives,
themes, positions) already read the rebuilt hcp_established_ranks_v3 → auto-select the corrected cohort, no wiring.

TELESCOPE REPOINT (done, clean, FREE): export_telescope_data.py seeded from the contaminated hcp_score_ranks_v2 →
repointed both established seeds (NODES_SQL + EDGES_SQL) to hcp_established_ranks_v3 (scope_type='global'+country='US'
LIMIT 50, dropped now-meaningless cohort='established' filter, aliased cohort_score AS score_at_rank so downstream
unchanged). Rising collaborator joins stay on hcp_score_ranks_v2 (correct, TA-scoped). Re-export: nodes 1,776→1,700,
edges 16,840→16,292, new seed = Riely/Ramalingam/Hirsch/Ou/Jänne/Herbst/Heymach/Camidge (matches feed board, Riely #1
US both). HONEST CORRECTION: the old telescope seed was NEVER contaminated — LIMIT 50 sat entirely above rank ~190
where contamination began, so it selected a clean slice from a contaminated table (all 21 dropped were genuine NSCLC,
20 still established, just fell below rank 50 under the validated 0.75/0.25 model). So the repoint is a CONSISTENCY-AND-
CORRECTNESS fix (now uses the validated ranking model, agrees with feed, future-proofed against a deeper LIMIT), not a
decontamination. Committed separately.

*** THE GREP CAUGHT TWO MORE STILL-CONTAMINATED LIVE SURFACES (the fix wasn't fully propagated): ***
- api.ts:1309 getTACounts → reads hcp_established_scores_v2 → still reports 11,390 established, NOT 16,906. The
  established COUNT shown in the app is the old contaminated number.
- api.ts:1692 getHCPDetail → reads hcp_score_ranks_v2 → HCP detail RANK now contradicts the rebuilt feed board.
These are VISIBLE wrongness (wrong count, contradictory ranks) vs the regen's invisible incompleteness (thin newcomer
pages) → prioritize these FIRST. Same disease as the original bug one layer over: surfaces reading the OLD legacy
score tables (hcp_score_ranks_v2 / hcp_established_scores_v2, still cartesian-contaminated 11,389/11,390 for both TAs)
instead of the corrected hcp_established_ranks_v3. FIX = repoint these two consumers to hcp_established_ranks_v3 (like
telescope) — surgical, NOT rebuild the legacy tables (their RISING slices are correct + TA-scoped, unaffected —
rebuilding would risk the working parts). Rising getTACounts (1283/1290) unaffected; 1346 all-cohorts partially.

REGEN SEQUENCE (cheapest/highest-value first, per Code):
1. [DONE] Telescope repoint (free).
2. [NEXT — reprioritized] Repoint getTACounts + getHCPDetail to hcp_established_ranks_v3 (visible wrongness).
3. Narratives (--ta nsclc --target-version v2 --dry-run first) — ~200 HCPs, ~$2-5. FOOTGUN: --target-version
   defaults to v1 → writes legacy tables; MUST pass v2.
4. NPI (established_npi_resolver.py --ta nsclc) — free, two-phase human-gated (propose→CSV→approve→write). FOOTGUN:
   defaults to atopic-dermatitis, MUST pass --ta nsclc. Only 2,164 US-scope gaps meaningful.
5. Positions dry-run to SIZE it — unsized, one row per (publication,position), NSCLC has 83,257 tagged pubs. Don't
   run blind.
6. THEMES — the expensive decision: LLM ~$190-320 US-scope (3,179) vs ~$1,000-1,700 GLOBAL (16,906), ~28h global.
   NSCLC CN-heavy (CN 5,013 > US 3,179) → US leaves most of board uncovered; global ~5×. Deserves its own decision,
   not a default. (Same us-vs-global choice AD_RESEARCH_THEMES_PARAM_PLAN.md:245 framed.)
7. Orphan sweep (optional hygiene): 1,655 stale narratives + 313 stale themes for HCPs no longer established
   (deep-link/search could surface a narrative calling a non-KOL "established"). Stale not broken.

NEWLY-DISCOVERED DEBT: hcp_score_ranks_v2 AND hcp_established_scores_v2 still hold the cartesian contamination (the
established slice; rising/community slices are fine). The established_scoring.py cartesian product (§30gd) is the
source. Retiring/guarding it + repointing the last consumers = full propagation.

### 30gf. Contamination propagation: getHCPDetail (user-visible) + getTACounts repointed; 1353 is dead; dead-path cleanup deferred.
Continuing §30ge (repoint the last contaminated consumers of the legacy score tables to hcp_established_ranks_v3):
- getHCPDetail (api.ts:1692) — USER-VISIBLE fix, the one that matters: HCP detail rank now matches the feed board
  (Riely #1, Jänne #3, Hirsch #4 — identical to rebuild US top-30). Handled the multi-cohort subtlety correctly:
  the read serves established+rising+community, so it's v3-FIRST (established) FALLING THROUGH to v2 (rising/
  community unchanged) — a naive established-only repoint would've NULLED rising/community ranks. Verified 3,903/
  3,905 US rising unaffected. Entity-TA boundary INTACT (uses resolved entity taId, not hardcoded/ambient). SCALE:
  14,303 of the current NSCLC established cohort had NO v2 rank row at all → their detail pages showed no rank
  today; they now get one. This fixed both contradictory ranks AND missing ranks.
- getTACounts established count (api.ts:1309) — repointed hcp_established_scores_v2 → hcp_established_ranks_v3
  (global scope, one row/hcp). Query now returns NSCLC 16,906 (was 11,390), AD 2,585 (was 0 — bonus: _scores_v2
  was never populated for AD, exactly TA_BUILD_DEBT.md:5014's "pipeline populated ranks_v3 but NOT _scores_v2").
  *** HONEST CORRECTION: this count is CORRECT but NOT USER-VISIBLE — taCounts is write-only state, nothing renders
  it. My prior-turn claim "the app now shows 16,906" was wrong (verified the query, not the render). Real
  correctness cleanup (removed a contaminated read), invisible. Validate at query level, not in UI. ***
- 1353 verified-DOL count — DO NOT repoint (Code checked the premise, it failed 3 ways): (a) verified_dols renders
  ONLY in TASelectionScreen.tsx which is NEVER imported (dead); (b) the read is multi-cohort so established-only
  repoint drops 78% of ids; (c) the real defect is .limit(10000) with no ORDER BY dropping ~3,269 rows
  nondeterministically — not the table. is_verified_dol = high-confidence social-handle match (Digital Opinion
  Leader, social track), 162 in DB (NSCLC 126/Hep 54/AD 1), cohort-INDEPENDENT by design.

*** DEFERRED CLEANUP (do NOT do mid-regen): delete the dead path — TASelectionScreen.tsx + getAllTACounts +
the write-only taCounts state + its effect (App.tsx). It's genuinely dead (never imported) AND wasteful (fires a
10,000-row fetch on every TA/region change for a discarded result). BUT: (1) deletion has different/higher blast
radius than repointing — verify truly-dead before cutting; (2) *** TASelectionScreen is a TA-SELECTION component and
we're about to build the TA SWITCHER — check whether it's a half-built earlier attempt relevant to the switcher
before deleting; it may be worth studying, not just cutting ***; (3) separate concern from tonight's decontamination.
Its own task, own verification, own commit. ***

REMAINING regen steps unchanged (§30ge): narratives (~$2-5, --target-version v2!) → NPI (free, --ta nsclc!) →
positions (dry-run to size) → themes (the $190-320 US vs $1000-1700 global decision) → orphan sweep (optional).

### 30gg. NIGHT SESSION CLOSE — decontamination propagation done; regeneration content still pending.
Committed this session (branch ad-frontend-established, unpushed, nothing deployed):
- 650cb83: telescope repoint (NSCLC established seed → hcp_established_ranks_v3; consistency/future-proof, not
  decontam — old LIMIT-50 seed was already clean).
- 9c161b1: getHCPDetail + getTACounts repoint to corrected table (getHCPDetail USER-VISIBLE: detail ranks match
  board, 14,303 newcomers get a rank; getTACounts correct-but-unrendered).
- 265641c (earlier): TA-keyed spillover-check surname list.
Plus the established-scorer DATA FIX (§30ga-§30gd) — DB-only, no git: NSCLC established 61% contaminated → 100%
genuine (16,906), fully gated/backed-up/reversible, AD frozen.

STATE OF THE DECONTAMINATION: the established-scorer data is fixed AND now propagated to every surface that
RENDERS (feed board, HCP-detail rank, Telescope). Remaining legacy-table reads are either intentional (rising/
community slices, correct+TA-scoped) or dead (1353 verified-DOL → TASelectionScreen, never imported). So the
contamination is functionally eliminated from what users see.

STILL PENDING (next session — the actual CONTENT regeneration, which is separate from the decontamination above):
1. NARRATIVES — generate_narratives_v2.py --ta nsclc --target-version v2 --dry-run first. ~200 HCPs (top-100/scope),
   ~$2-5. FOOTGUN: --target-version defaults to v1 → writes LEGACY tables; MUST pass v2. Reads the rebuilt table
   already. START HERE next session (cheapest).
2. NPI — established_npi_resolver.py --ta nsclc. Free, two-phase human-gated (propose→CSV→approve→--execute).
   FOOTGUN: defaults to atopic-dermatitis, MUST pass --ta nsclc. Only 2,164 US-scope gaps meaningful.
3. POSITIONS — extract_scientific_positions.py --ta nsclc --dry-run to SIZE first (one row per (pub,position),
   83,257 tagged pubs — don't run blind).
4. THEMES — extract_research_themes.py. THE COST DECISION: LLM ~$190-320 US-scope (3,179) vs ~$1,000-1,700 GLOBAL
   (16,906, ~28h). NSCLC CN-heavy → US under-covers the board; global ~5x. Deliberate choice, not a default.
5. ORPHAN SWEEP (optional hygiene): 1,655 stale narratives + 313 stale themes for HCPs no longer established.
6. DEAD-PATH cleanup (deferred, own task): delete TASelectionScreen + getAllTACounts + write-only taCounts state
   (dead + wasteful 10k fetch/nav) — BUT check switcher-relevance first (§30gf).

BIGGER PICTURE / STILL OPEN BEYOND REGEN:
- established_scoring.py cartesian product — still LATENT (feeds legacy _scores_v2 nobody renders now, but re-running
  re-contaminates). Retire/guard it (add per-(HCP,TA) membership check).
- DATA-COMPLETENESS AUDIT — the systemic future-proofing move. This whole saga (cartesian scorer + classification-
  only-for-AD + institution_canonical-only-for-NSCLC + rising-table 4-surface gap + _scores_v2-never-for-AD) is one
  pattern: NSCLC-era artifacts not properly TA-scoped, corrected paths not back-filled for old TAs. Worth a
  systematic sweep before TA #3.
- MULTI-TA workstream continues: entitlement (allowed_ta_slugs) → TAProvider URL-sync (option 2, before switcher) →
  TopBar switcher (ALL/entitled TAs) → "ALL" per-surface design. (Check TASelectionScreen relevance here.)
- Change 2 (nav-state) — now honest ~5.2% multi-TA decision, no longer masking a bug.
- Identity fragments (Camidge/Hirsch) — matcher relaxation + domain review, not dedup re-run.
- 1-decimal score display (§30gc). Drop backup tables when satisfied. Merge/deploy strategy for the growing
  unshipped delta (now ~27 commits).

### 30gh. DATA-COMPLETENESS AUDIT complete → docs/DATA_COMPLETENESS_AUDIT.md. The dread quantified: BOUNDED.
Ran the data-completeness audit (read-only, concurrent with the narrative billed run — extra Supabase compute, no
contention). Deliverable docs/DATA_COMPLETENESS_AUDIT.md. THE NUMBER (the thing the nervousness was about): 13
TA-scoping issues remain, 10 new (+1 unconfirmed). *** The family is BOUNDED — the pattern did NOT sprawl. ***

PATTERN CLOSING (not expanding): Python pipeline layer is FULLY CLEAN — 0 remaining unchunked large .in() (the
narrative open-payments fix was the last), 0 remaining readers of contaminated hcp_established_scores_v2, every
hcp_score_ranks_v2 read is therapeutic_area_id-filtered. Known-7 held up: 4 fixed this session, 3 remain (est-scorer
script un-retired, AD institution_canonical + rising_star_ranks_v3 workarounds — both mitigated).

CATEGORY B by-TA matrix (the load-bearing finding) — visible+active TAs are AD/Hepatology/NSCLC (Rare Disease absent
from config → its lopsided tables are DEAD DATA, not bugs — bounds the search). Matrix showed the new big one:
*** HEPATOLOGY IS A HALF-MIGRATED VISIBLE TA: 2,344 narratives + 40,800 community_ranks + legacy data, but ZERO rows
in EVERY new per-TA table (established_ranks_v3, publication_leadership_v2, cohort_classification_v2, research_themes,
scientific_positions). "Retired" at frontend 2026-07-11 BUT therapeutic_area_ingestion_config still has
is_visible_in_ui=true → a billed all-TA run would still generate Hep content. Config-vs-frontend inconsistency. The
single biggest completeness gap — but it's a TA being RETIRED, so fix is likely "make config match retirement," not
"finish migrating Hep." ***

WORST-FIRST (new findings):
1. getHCPDetail per-TA cohort gap (api.ts:1653/1654) — ONLY new VISIBLE-WRONG. Passes global hcps_v2.cohort_score
   through untouched, only upgrades ESTABLISHED to v3 → live AD detail pages show null/global score + unresolved
   rising/community classification. Fix mirrors the v3-probe already in that function. *** FIX FIRST (user-visible). ***
2. AD trials never tagged — trial_ta_mapping.py hardcodes HEP/NSCLC → clinical_trials_ta_v2 has 0 AD rows (Hep 4,313,
   NSCLC 2,463). AD trial signals absent downstream.
3. Hepatology half-migrated config (above).
4. Two more unchunked .in() in api.ts (institutions 4642, landscape 3423); institution fns default taSlug="nsclc";
   3 CLI whitelists that hard-reject new TAs (established_scoring.py TARGET_TA_IDS, trial_ta_mapping.py, CLI lists).

DEAD CODE (audit cross-checked, cleared — NOT real issues): generate_community_narratives.py NSCLC-hardcoding (no
live caller, superseded by generate_narratives_v2.py); getAllTACounts/getTACounts "visible-wrong home UI" (TASelection
Screen unimported, never rendered — matches §30gf).

TRIAGE READ: of 13 — 1 user-visible (getHCPDetail, one-function fix), a few latent-real (Hep config, AD trials, 2
unchunked .in()), some hardening (CLI whitelists), 2 dead. NOTHING says "rebuild everything." Extremely manageable
punch-list. This is the OUTPUT that ends the "how deep does this go" nervousness: it doesn't go deep — it's bounded,
enumerated, mostly minor, most fixable with patterns already applied 5×.

### 30gi. [FORWARD-LOOKING / STRATEGIC] Scheduled re-ingest — after the desk is clean.
Discovered while parking Hepatology: ingest has been is_active=true on TAs but NOT actually re-run in the 10 weeks
since the project started. So "is_active=true" is currently on-but-idle — nominally active, not producing consumed
output. Garrett's insight: the clean end-state is to make ingest a DELIBERATE, SCHEDULED (cron'd) process — re-ingest
NSCLC (and AD) on a known cadence so the corpus stays genuinely current, rather than a flag that's on-but-idle.

SEQUENCING (why NOT now): a re-ingest CASCADES — new pubs → new HCPs → new memberships → potentially new established/
rising members → which need re-scoring, re-classifying, re-narrating, re-telescoping. I.e. re-ingest pours new data
through the exact pipelines just stabilized. Doing it mid-cleanup = chasing a moving target through pipelines still
being fixed. CORRECT ORDER: get pipelines clean + trustworthy FIRST (finish the data-completeness punch-list, retire
the cartesian scorer, etc.), THEN turn on scheduled ingest so fresh data flows through KNOWN-GOOD machinery. "Clean
desk, then cron."

WHEN READY, this needs its own design: (a) cron cadence (weekly? monthly?); (b) the full downstream cascade a fresh
ingest triggers (re-run classification → scoring → ranks → narratives → themes → positions → telescope, per changed
cohort) — automate it or gate it; (c) the local automation box already spec'd (Ryzen mini-PC, Ubuntu, Docker,
Tailscale, Claude Code headless, ntfy/Pushover gates) is the intended home for this; (d) idempotency + the "verify
the frozen thing" discipline must hold across automated runs. This is arguably the capstone: continuous fresh data
through trustworthy pipelines with human-in-the-loop gates. NOT NOW — a clean-desk milestone.

### 30gj. CLEANLINESS SWEEP (day) — 3 of 4 data-completeness items closed; Hep fully parked; active-status honest.
Working the data-completeness audit (§30gh) punch-list toward "cleanest platform." Committed/done this session:
- getHCPDetail per-TA cohort resolution (§ earlier, committed) — the only user-visible audit item. AD/rising/community
  detail now show real per-TA scores, null-when-absent (never global). Entity-TA boundary intact.
- Two unchunked .in() in api.ts (landscape name map, institution investigator counts) → chunked at 100 (the file's
  chunkInstitutionHcpIds convention). Committed 9bcab4b. CLOSES the unchunked-.in() category (pipeline already clean).
  Verified-DOL chain .in()s left unchunked — dead getTACounts path, flagged if revived.
- 4 institution fns (getInstitutionSummary/Leaderboards/Collaborations/ExternalPartners) defaulted taSlug="nsclc" →
  made REQUIRED (dead default, never hit — sole caller passes explicitly — but a latent trap). TS now enforces it.
  Committed. Left in scope-boundary: InstitutionRoute.tsx:111 caller-side `?? "nsclc"` last-resort (fires only when
  an institution has NO derivable TA at all) — flagged for separate honest-empty-vs-nsclc review.

*** HEPATOLOGY FULLY PARKED (the biggest cleanliness win) — DB config change, verified, reversible: ***
therapeutic_area_ingestion_config for Hep (ta_id 9b31947b): is_visible_in_ui True→False AND is_active True→False
(1 row). Rationale: Hep is half-built (0 rows in all new per-TA tables) AND its legacy data is cartesian-CONTAMINATED
(established_scores_v2 ~40% non-Hep members, same TARGET_TA_IDS=[HEP,NSCLC] disease as NSCLC's 61%), AND we haven't
re-ingested in 10 weeks so keeping it active bought nothing. is_visible_in_ui is OVERLOADED (TA_BUILD_DEBT.md:5707):
controls BOTH frontend visibility (already retired in code 2026-07-11 via hardcoded getAllTACounts) AND
generate_narratives_v2.py enrollment — so =false closes the real leak (a bare narrative run would've generated ~500
Hep community narratives, billed). is_active=false stops ingest_publications.py PubMed pulls. Data BYTE-IDENTICAL
after (narratives 2,344, community_ranks 40,800, est_scores 11,390, score_ranks 254,343 all unchanged — flags touch
no data tables). FULLY REVERSIBLE: flip both back + re-ingest fresh when building Hep properly (which requires the
same full rebuild NSCLC got — do NOT build on the contaminated legacy tables).

ALL-TA ACTIVE-STATUS AUDIT (from the same check): config now has only 3 TAs — AD (active/visible), NSCLC
(active/visible), Hep (parked). Rare Disease not in config at all (its lopsided tables are dead data). So the config
is now HONEST: active = the 2 live TAs, parked = the half-built one. AD + NSCLC remain is_active=true (correct — they're
live), but note per §30gi: is_active is eligibility-for-ingest, and ingest hasn't RUN in 10 weeks, so it's on-but-idle
until scheduled ingest is designed (clean-desk-then-cron).

REMAINING data-completeness item (4th of 4): dead-code deletion — generate_community_narratives.py NSCLC-hardcoding
(confirmed dead, safe delete) + the TASelectionScreen/getAllTACounts/getTACounts/taCounts-state path (dead + wasteful
10k fetch/nav, BUT check switcher-relevance first per §30gf before deleting — it's a TA-selection component and the
TopBar switcher is upcoming). Plus documented-not-today: AD trials (trial_ta_mapping.py hardcodes HEP/NSCLC → 0 AD
trial rows), 3 CLI whitelists that hard-reject new TAs (tie to future TA builds), InstitutionRoute:111 fallback,
verified-DOL chunking. NOTHING here is urgent; the platform's 2 live TAs are correct + clean.

### 30gk. MULTI-TA SWITCHER — entitlement model READ SIDE (foundation). Design decisions locked.
Starting the TopBar TA-switcher (the payoff of the multi-TA workstream). Constraint from Garrett: NOT all users have
multi-TA access → switcher must be ENTITLEMENT-AWARE, and entitlement must exist first (audit Q3: it's UNMODELED
today — access gated by data-existence, not identity). Product model (Garrett): existing users → ALL TA access
(grandfather); new users → TA access set at registration (rule TBD, separate WRITE-side step later). Building the
READ side first (unblocks switcher, independent of registration rule).

TRACE FINDINGS (key ones):
- NEAR-MISS: msl_profiles ALREADY has a therapeutic_areas text[] column — but it's a DIFFERENT thing (TA display
  LABELS ['NSCLC'], territory/COVERAGE context, read only by Home). Do NOT reuse for entitlement. allowed_ta_slugs
  is a NEW separate column. (So the user now has 3 distinct TA concepts: states_covered, therapeutic_areas=coverage,
  allowed_ta_slugs=entitlement. Watch naming clarity.)
- states_covered is the pattern to mirror: text[], DEFAULT ARRAY[]::text[], guarded-read, plain-array-write.
- Profile load choke point: getMslProfile(userId) — cached, select("*"), so adding the column auto-fetches; just
  add to MslProfile TS interface. Switcher hangs off this existing cached load — NO new profile query. RLS-scoped
  (users read only their own row).
- Authoritative LIVE-TA source: therapeutic_area_ingestion_config WHERE is_visible_in_ui=true AND is_active=true
  (same as pipeline's load_visible_ta_ids). Returns NSCLC + AD (Hep parked earlier §30gj — the honest config is now
  load-bearing for the switcher). Bonus: a cached getLiveTASlugs() retires the hardcoded TA_CHIPS drift.
- HAZARD (audit Q4 again): parent-vs-indication namespace split — config lists DATA slugs (nsclc, atopic-dermatitis),
  but default_ta_slug + switcher chips use PARENT slugs (oncology, immunology). therapeutic_areas lookup carries
  parent_ta_id/ta_level to reconcile.
- Backfill scope trivial: 4 rows, 0 null, 0 profile-less users.

DECISIONS LOCKED (Garrett confirmed):
1. STORE PARENT SLUGS (oncology, immunology) in allowed_ta_slugs — matches default_ta_slug + switcher-chip
   conventions. Resolver maps config's data slugs → parents to intersect.
2. FAIL-OPEN on empty/null: null/empty allowed_ta_slugs → treat as ALL LIVE TAs (grandfather), NOT "none" — the
   non-breaking property (nobody locked out before registration populates it).
3. Backfill existing 4 users → ['oncology','immunology'] (all live parents = the "all current TAs" grandfather).

BUILD (read side only — NO switcher UI yet):
1. Migration: ALTER TABLE msl_profiles ADD COLUMN allowed_ta_slugs text[] DEFAULT ARRAY[]::text[]; backfill 4 rows
   to ['oncology','immunology'].
2. Resolver in api.ts (next to TA_ID_MAP): cached getLiveTASlugs() (config → parent slugs) + entitledTASlugs(profile)
   = (allowed_ta_slugs null/empty ? liveTASlugs() : allowed_ta_slugs ∩ liveTASlugs()).
3. Add allowed_ta_slugs to MslProfile interface (auto-fetched via select("*")).
4. Testable immediately: Garrett's account grandfathers to all live TAs → can test the multi-TA switcher path later.
WRITE side (registration sets allowed_ta_slugs) = separate later step, rule TBD.

### 30gl. *** SELF-SERVE INVITE-GATED SIGNUP — BUILT & VERIFIED END-TO-END. #1 launch blocker CLEARED. ***
Strategic pivot this session: FieldMark → PUBLIC, self-serve, "users first" (NOT enterprise B2B sales cycle).
Option 1 (public product + signup GATE between open internet and named-physician data). Gate = INVITE SYSTEM (peer-
vouching in the tight MSL/pharma-professional community IS the professional gate AND the viral growth engine). LinkedIn
OAuth evaluated + REJECTED as gate (Aug-2023 API overhaul: returns only name/email, no title/company/industry, explicitly
"does not verify identity") — kept as optional login only. Audience broadened: target medical affairs, WELCOME clinical
dev + commercial (Garrett: med/commercial firewall has cooled, esp. biotech) — capture job_function as segmentation signal,
don't gate on it.

BUILT (3 stages, all committed, all on ad-frontend-established):
- Entitlement READ side (§30gk, committed): allowed_ta_slugs on msl_profiles + live_therapeutic_areas VIEW (IP-safe:
  scoring_weights/pubmed_query never browser-reachable, proven 0-rows via anon path) + fail-open resolver.
- Stage 1 (bc6e600): server-side security foundation. redeem_invite() atomic SECURITY DEFINER RPC (kill-switch check →
  atomic quota decrement WHERE uses_remaining>0 → server-set allowed_ta_slugs from live_ta_parent_slugs() → invited_by
  attribution → referral log → mint invitee's own quota-10 invite). admin_users (identity OFF msl_profiles, no self-
  promote), app_config kill-switch, invites/invite_redemptions tables, entitlement column-lock trigger, dropped client
  INSERT policy. *** VERIFIED ON REAL AUTHENTICATED PATH (anon key + JWT, not service-role): self-edit entitlement
  BLOCKED (P0001 trigger), self-INSERT profile BLOCKED (42501 RLS), flip kill-switch BLOCKED (42501), normal edits work.
  Under public launch "anyone can sign up" = every writable field is an attack surface; all sealed. ***
- Stage 2 (3ed69f8): user-facing flow. SignupScreen (/join/:code, OUTSIDE AuthWrapper): check_invite validation →
  email/password signup → redeem_invite → 4-step WelcomeWizard (name/company/job_function/territory). job_function column
  + check_invite() anon-callable pre-check. WelcomeWizard INSERT→UPDATE (payload EXCLUDES locked allowed_ta_slugs/
  invited_by — verified). Fixed a dev-only StrictMode double-mount hang (ranRef guard collided with StrictMode's mount→
  cleanup→mount: Mount1 cleanup disarmed its async, guard blocked Mount2 → setPhase never called → infinite "validating"
  spinner. Fix: drop ranRef, rely on active/cancelled flag = StrictMode-safe pattern. Dev-only; prod build ran once).
  Email confirmation turned OFF (invite is the gate; removes friction + fragile round-trip + the email rate-limit wall).

END-TO-END VERIFIED via real UI click-through (incognito, fresh email): invite validated → account created → redeem
fired → allowed_ta_slugs server-set {oncology,immunology} → invited_by attributed (68117362...) → quota 10→9 → wizard
saved (company=Genentech, job_function=medical_affairs) → landed in app. THE WHOLE CHAIN WORKS. (Lesson echo: build was
green + typecheck clean + server path proven, and STILL a dev hang — only the click-through caught it. Green-at-top ≠
correct-underneath, same as the contaminated-tail lesson.)

UX POLISH (batched, non-blocking): (1) "Work email" → "Email" (invite is the gate; some users won't use corporate email);
(2) company field: don't guess/pre-fill employer; (3) job_function "Other" → reveal free-text, capture write-in (welcoming
beyond MSLs → capture what they actually are); (4) deterministic ORDER BY in live_ta_parent_slugs if display order matters.

REMAINING LAUNCH PATH: (1) Admin page / Stage 3 — mint/manage invites, referral graph, kill-switch toggle, deactivate
(replaces hand-SQL; NOTE: admin reads app_config/admin_users which are client-locked → needs admin-gated RPCs/Edge Fn;
seed-cohort invite codes must be HIGH-ENTROPY like the auto-minted ones, not memorable). (2) 3 more TAs → launch-5 (proven
manual pipeline; watch each for novel weirdness). (3) One-hour healthcare-data/physician-privacy legal consult before
launch (esp. re: commercial use of payment/influence data). (4) Cold-user onboarding + the UX polish above.

OPEN DESIGN (surfaced, not resolved): MULTI-INDICATION-PER-PARENT. Entitlement is FINE (parent-level → a user with
'oncology' auto-gets new oncology indications, no per-user change). But the SWITCHER hierarchy (parent-level vs indication-
level, how to show Oncology→{NSCLC, prostate, ...}) is NOT designed — today there's 1 indication/parent so it's never been
exercised. Resolve BEFORE building the switcher UI. Trace prompt drafted, deferred.

INFRA NOTE: 34+ unpushed commits on ad-frontend-established (local-only). Push to remote for BACKUP soon (2+ weeks of work
on one machine). Not merge/deploy yet (foundation-rebuild auto-deploys) — just back it up.
