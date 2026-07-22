# TA NEW PLAYBOOK — CHAPTER 3
Continues TA_NEW_PLAYBOOK_ch2.md (which ran §7–§12). Chapter epoch: §13-series.
Same format as ch2: distilled, durable rules for standing up a new therapeutic area on FieldMark —
extracted from the ch1–ch3 debt log, generalized so a future builder can act without re-deriving.

Scope note: ch1–ch2 covered the DATA + FRONTEND layers of a TA launch (scoring model migration, RPC
mirroring, per-TA forks, global-first scope). Ch3 opens the POSITIONING / PUBLIC layer — how a TA's
features are described accurately and safely to the outside world — plus whatever new engineering rules
emerge as work continues.

---

## 13. THE POSITIONING LAYER — describing a TA's features publicly (added, marketing landing page)

### 13a. FEATURE COPY IS A CODE-GROUNDED ARTIFACT, NOT A MEMORY-GROUNDED ONE — re-extract before every positioning pass
The scoring layer EVOLVES between the moment a feature is named and the moment you describe it: "Dark Horses"
was dropped; rising migrated from a 2x2 momentum/visibility grid to a 2-axis emergence/network composite
(§7i); `archetype` was retired as dishonest (§7m). Every one of those is a case where the LABEL a human
remembers outlived the COMPUTATION beneath it. Marketing/positioning copy that overclaims relative to what the
model actually does is the same producer/consumer disagreement bug as §7l — except the "consumer" is a
prospect, and the failure isn't a blank card, it's a false promise.
RULE: before writing ANY public-facing or positioning copy for a TA's features, RE-EXTRACT the current
user-facing definition from the LIVE components (headings, tooltips, methodology strings) AND the underlying
compute (RPC/table/column/script). Treat all prior descriptions as stale until re-grounded. For each feature
confirm: (a) the verbatim in-app strings, (b) what it actually computes, (c) any label⇄computation gap. Copy
may claim only what (b) supports. The extraction report (`FEATURE_DEFINITIONS_CURRENT.md`) is a reusable
asset — it is the CANONICAL FEATURE SURFACE a new TA must light up, and it should be regenerated (cheap,
read-only) at each TA launch rather than trusted from the last one.
COROLLARY (single source of truth): feature descriptions drift because they live in many places (in-app copy,
marketing page, decks, memory). Prefer ONE code-derived canonical definition per feature that the positioning
surfaces cite, so the next drift is caught at the source, not re-discovered per channel.

### 13b. THE PUBLIC SURFACE DESCRIBES CAPABILITY, NEVER NAMED-INDIVIDUAL SURVEILLANCE — a standing liability rail
FieldMark's product identifies and profiles named physicians (HCPs). On any PUBLIC, unauthenticated surface,
that same capability, shown concretely, reads as surveillance of identifiable individuals — a liability and a
trust problem, and it undercuts the invitation-only mystique. RULE for every TA's public/positioning material:
describe the CAPABILITY in the abstract (what the platform can surface, how, why it's rigorous) — never a
named or real-looking physician, never a product screenshot that exposes an individual's profile. Carry it with
brand, concept, and abstract visuals (nebula/constellation motif). This is TA-agnostic: it holds for every new
TA's launch page, not just the first. (Behind the gate, named data is the point; in front of it, capability
only. The gate is the line — §30gl.)

### 13c. PROVENANCE CHECK — confirm you're reading the CURRENT log before acting on "full state"
A session opened against a debt-doc export that was stale (ended §30gl; the referenced §30gq was absent; the
outputs copy was empty). No harm done because the work at hand didn't depend on the missing entry — but the
generalizable rule: when a session's plan hinges on "the latest entry has the full state," VERIFY the log you
were handed actually contains that entry before building on it. Cheap check: grep for the referenced section id;
if absent, flag it and either retrieve the current version or proceed only on state you can see. Silent
reliance on a stale handoff is how a producer/consumer mismatch (§7l) sneaks into the PROCESS layer instead of
the code.

### 13d. CLAIM THE COMPUTE FLOOR — and never market a feature the code doesn't contain
Turning features into public copy has two failure modes, both seen in the AD/marketing pass:
(1) NAMING ESCALATION — an in-app UI LABEL can be more aspirational than the thing it renders. "Belief Profile"
    renders data the store/generator call `scientific_positions` (the generator prompt explicitly forbids belief
    language); "PRE-MEETING BRIEF" renders whenever a relationship exists with NO meeting/calendar entity anywhere;
    "What N MSLs are saying" renders a MOCK, non-persisted reaction count. RULE: public copy claims the COMPUTE
    FLOOR — what the code actually computes — never the UI's own aspirational label. Derive the claim from the
    extraction's "what it computes" section, NOT its "user-facing copy" section.
(2) PHANTOM FEATURES — memory and the founding brief listed "natural-language queries"; the code has none (the real
    surface is a 3-sentence AI identity blurb generated from theme metadata). RULE: a feature absent from the
    extraction report is NOT marketed, however confidently memory asserts it. The extraction (§13a) is the ALLOWLIST
    of what may be claimed — presence in code is necessary, not just plausibility in memory.
COROLLARY — the fork discipline (§11b) applies to COPY, not just RPCs. The AD rising card's "Momentum 70% /
Visibility 30%" tooltip is wrong because a SHARED card string wasn't forked when AD got a new model — the same
byte-identical-frozen-path guarantee that protects the frozen TA's DATA must protect its SHARED UI STRINGS too.
Before any new TA's launch copy (or even in-app strings), confirm every SHARED string a new model reuses actually
describes the NEW model; a model migration (§7i) silently invalidates the reused label.

### 13e. MARKET THE LAYER, GATE THE DRILL-DOWN — differentiator capabilities that carry sensitive columns
A capability can be a top differentiator AND carry columns too sensitive for a public, unauthenticated surface.
(Community: the practicing-physician layer competitors who only index publishers MISS — genuinely a wedge pharma
asks about — but the drill-down is named practitioners × Open Payments dollars, sortable.) Don't drop the
differentiator to protect the sensitive part; SPLIT it. Public copy markets the LAYER and its strategic value
(why it matters, what it covers at CATEGORY level — subspecialty/location/career-stage; "a directory, not a
ranking"); the sensitive drill-down (names, dollars, per-individual figures) stays behind the gate. Keep public
and gated CONSISTENT: the public claim must be a TRUE SUBSET of the gated feature, never a different promise.
TEST: could a competitor read the public block and the gated feature side by side and find a contradiction? If
yes, the public copy overreached. (§13b's capability-not-surveillance rail still governs the public block; the
community layer is a per-TA build — a new TA stands up its own directory, currently AD-only in-app.)

### 13f. SPLIT THE TRUST STORY — transparent scoring vs. grounded AI synthesis; chain every AI claim to its grounding
FieldMark has two intelligence layers, and they earn trust DIFFERENTLY — market them differently.
- SCORING (emergence, network position) is deterministic, inspectable math → market as transparent, "no black
  box." A scientific buyer trusts what it can audit.
- SYNTHESIS (position extraction, identity summary, engagement angles) is AI → market as the exciting "reading"
  layer ("AI reads the corpus for you"), but NEVER unattached: pair every AI claim with its grounding (positions
  tie to publications; generator prompts forbid invention; outputs constrained to the inputs).
RULES: (1) do NOT claim AI does the RANKING — it doesn't, and "AI-ranked your KOLs" reads as LESS trustworthy to
a scientific audience, not more. (2) Concentrate the AI message where it's genuinely load-bearing (a dedicated
band + the AI-native feature blocks), not sprinkled everywhere — selective emphasis excites; ubiquitous "AI!"
reads as hype. (3) Vendor-naming the model publicly is a founder call (credibility signal vs. vendor-lock
perception); the app's internal "Generated by Claude" attribution keeps either choice consistent.

## 14. SHIPPING A STANDALONE STATIC SITE ON CLOUDFLARE PAGES (added — marketing landing deploy)

### 14a. PAGES, NOT WORKERS — Cloudflare merged the flows and funnels you into the wrong builder
Cloudflare's "Create application" defaults toward the WORKERS builder (tell: header reads "Create a Worker,"
fields ask for `npx wrangler deploy` / `versions upload` / an API token). A static site + Functions is a PAGES
project. The Pages entry is often a small "Looking to deploy Pages? Get started" link, NOT one of the big buttons.
The correct Pages setup screen shows Framework preset / Build command / **Build output directory** — and asks for
NONE of the wrangler/API-token stuff. If you see wrangler commands, you're in the wrong builder; back out.
Static-site settings: framework preset None, build command EMPTY, output dir = the folder (`public`).

### 14b. ENV VARS BIND AT DEPLOY TIME — a dashboard edit does nothing until you redeploy
Setting/changing a Pages env var (`SUPABASE_URL`, keys) does NOT affect the running Function until a NEW deploy.
"Retry deployment" re-runs the SAME commit (picks up new env values); a git push builds a NEW commit. If you fix a
value and nothing changes, you almost certainly didn't redeploy. Corollary: a git push that shows a NEW commit hash
is the only thing that ships new CODE — a "retry" of the old hash ships the old code (cost us a cycle: debug logging
was committed locally but the deployed hash was still the pre-logging build → empty logs).

### 14c. THE FAILURE-SIGNATURE LADDER for a Function → Supabase insert (read the log, don't guess)
A form Function returning a generic 502/error walks a deterministic ladder; instrument it and read the real cause:
- Function "outcome: ok", `exceptions:[]`, `logs:[]`, returns 502 → the CATCH fired with no log → `fetch()` THREW
  → malformed URL. #1 cause: **`SUPABASE_URL` missing the `https://` scheme** (or a trailing space/newline in the
  pasted value — invisible without quoting/escaping the logged value). Your-side env fix, no code change.
- `resp 401` → auth: anon key in the service-role slot, or missing `apikey`/`Authorization` header.
- `resp 403 code 42501 "permission denied for table"` → **Supabase default-privileges: new tables don't grant the
  `service_role` table privileges by default.** Fix: `grant select, insert on table public.<t> to service_role;`
  RLS stays ON, no public policies — service_role bypasses RLS; the public/anon key still can't touch it. (This is
  the same Data-API default-privileges change flagged for the platform's Oct-30 enforcement — it bites EVERY new
  table exposed through the API, not just waitlist. Sweep app tables before enforcement.)
- `resp 404` → wrong REST path / URL didn't carry to this build / double-slash from a trailing slash on the URL.
- `resp 400/409 <postgres msg>` → payload vs schema. Specifically **409 = the dedup unique index rejecting a repeat**
  — which is the guard WORKING; but if the code doesn't treat a duplicate as success, a returning user sees a false
  error. Insert must send `Prefer: resolution=ignore-duplicates` AND/OR treat 409 as `{ok:true}` 200.
Keep a STATUS-ONLY failure log in production (`console.log("insert failed", resp.status)` — no body, no PII). Silent
failure paths are worse for a form that quietly matters; the bare status is the breadcrumb that ends the next guess.

### 14d. SEPARATE REPO = the guardrail is structural, not vigilant
The marketing site lives in its OWN repo + its OWN Pages project, never the app repo. This makes "a marketing deploy
can't touch the app" a GUARANTEE (the app's code is never in the diff), not a thing you have to be careful about —
the §11a principle applied at the repo level. Watch the failure mode: running the new repo's git commands (`remote
add`, push) from the APP directory would point the app's history at the marketing remote. Always confirm the working
directory + `git remote -v` before pushing. (Also: gitignore tooling scratch like `supabase/.temp/` — an untracked
temp file blocks `git checkout` on every branch switch.)

### 14e. POST-DEPLOY, HARD-REFRESH BEFORE BELIEVING WHAT YOU SEE
The window between "new code deployed" and "browser still holding old CSS/JS" renders as a SHATTERED layout with
correct data — looks catastrophically broken, is actually cache. Ctrl+Shift+R or incognito before diagnosing. Cost
a genuine "it's broken!" scare on the app release that a hard-refresh instantly cleared. Pair rule: restart the dev
server after any branch switch (Vite hot-reloads file changes but can hold a stale module graph across a bulk swap).

---

## 15. BRANCH-VS-DIRECT DISCIPLINE ON AN AUTO-DEPLOYING PRODUCTION BRANCH (added — AD merge + Community restyle)

### 15a. The axis is BLAST RADIUS × SILENCE, not change size
`foundation-rebuild` auto-deploys to production on push. A branch-per-tiny-change ritual won't be sustained (a rule
you won't follow is worse than none), so decide by consequence, not size:
- COMMIT DIRECT when low-blast-radius and self-evident: styling, copy, a single isolated component — failure is
  cosmetic and obvious in seconds. (Community restyle → direct.)
- CUT A BRANCH when the change touches SHARED code (components multiple TAs use, `api.ts`, routing), DATA/MIGRATIONS,
  or AUTH/entitlement — or when a failure would be SILENT (breaks a TA/feature you're not looking at; locks out users
  you can't see because you're already logged in). A NEW TA BUILD is the flagship "branch" case — it touches shared
  cohort logic and can break the frozen TA silently. (§11c fingerprint gate applies to exactly these.)
Cheap safety net for the direct path: hard-refresh + eyeball production after every push (§14e).

### 15b. "REUSE THE SHARED COMPONENT" ≠ force the wrong component onto new data
Aligning a new surface (Community cards) to an existing design system: reuse the shared TOKENS/primitives (card
chrome, tile look, typography, color vars), NOT a component whose behavioral premise doesn't fit. The cohort KPI tile
carries a 0–100 percentile bar + a metric-tooltip map; community data is dollars + a manufacturer name with NO
percentile. Importing it literally renders an empty 0% bar — a UI lie, the §7m "porting a retired premise" trap in
styling form. Correct: match the token-level look, drop the percentile machinery. Prefer shared style VARIABLES over
copied hex literals, or the surface silently drifts the next time the design system is retuned (§13a/§7l one-source
instinct, applied to CSS). When Code flags that a shared component doesn't fit the new data — that's the discipline
working; take the token-match option, not the force-fit.

---

## §32. INCREMENTAL REINGEST — corrections & additions to the ROADMAP (from the first real cycle walk, 2026-07-21)

The full canonical pipeline order (§1) documents the from-scratch BUILD. The INCREMENTAL reingest cycle (weekly pub
refresh) is a NET-NEW sequence, now designed and walked once — see **INCREMENTAL_REINGEST_SEQUENCE.md** (the incremental
counterpart to §1). Key corrections the walk forced into the ROADMAP:

**§32a. Stale script-status inventory.** The §1-era inventory listing `network_centrality_scoring.py` and
`pharma_engagement_scoring.py` as "✗ PENDING" is STALE — both exist on disk (scripts/score/) and the full established
scoring sub-pipeline is present. (Established composite weights: --w-scientific 0.75 --w-network 0.25 --w-pharma 0.0,
so pharma_engagement is displayed-only, irrelevant to rank.)

**§32b. Inventory upsert must use GREATEST (never lower a count).** The §3b Stage-2 upsert (`ON CONFLICT DO UPDATE`)
must set `corpus_pub_count = GREATEST(EXCLUDED.corpus_pub_count, existing.corpus_pub_count)`, NOT
`= EXCLUDED.corpus_pub_count`. Reason: `author_pub_flat` under-represents the corpus the inventory counts were built
from (drift both directions — 933 established KOLs would DROP, 2,665 would rise, on the current NSCLC state). A bare
overwrite silently degrades established KOLs. GREATEST is correct both ways: never lower (anti-clobber), raise when flat
shows more. DISCIPLINE (proven load-bearing): dry-run the upsert as a COUNT with a `clobber_would_drop_count` check
BEFORE writing — it must be 0. LATENT FOOTGUN: a full `--truncate` inventory rebuild from the current flat table does
NOT get this protection → would lower 933+ KOLs. Before any full rebuild, rebuild author_pub_flat completely from
publications_v2 first, or always use GREATEST semantics.

**§32c. ta_tagging is LOAD-BEARING in the incremental cycle and runs BETWEEN Step C and Step F.** Step C does not tag
TAs (§1 L270); Step F scopes to TA-tagged HCPs (`--hcp-ids-file` from hcp_therapeutic_areas_v2). So newly-created HCPs
MUST be tagged (ta_tagging_rebuild_v2 --ta <slug> --execute) before Step F, or they're silently unlinked (zero-pub
phantoms). ta_tagging is also the concept-classifier that decides which new HCPs enter the scored population.

**§32d. Incremental SCOPING — three tools added (this session).** The back half of the chain was built whole-corpus/
whole-TA for the BUILD and is untenable per incremental cycle. Added:
  - `compute_affected_hcps.py` (scripts/utilities): computes the affected-HCP set = new HCPs (by ingestion_run_id) UNION
    pre-existing authors of the batch pubs. CRITICAL: group B is derived from publications_v2.authorships JSON →
    hcp_openalex_authors_v2, NOT from publication_authors_v2 (which is empty until Step F runs — a sequencing trap).
    Output feeds `--candidate-hcp-ids-file` for the scoped stages.
  - `dedup_detect.py --candidate-hcp-ids-file / --ingestion-run-id` (scoped): relational name-block scoping — must
    load full hcps_v2 for blocking (the key folds hyphens/diacritics in Python; a SQL surname filter would MISS
    variant-surname existing HCPs), then scope the expensive publication_authors_v2 read to the neighborhood. Emits
    only pairs with ≥1 seed member (new-vs-existing dups preserved — the important case).
  - `ta_tagging_rebuild_v2.py --candidate-hcp-ids-file` (scoped): Phase 3 must re-aggregate each affected HCP's FULL
    pub set (a new pub can push a PRE-EXISTING HCP over/under threshold — so the affected set must include existing
    co-authors of batch pubs, not just new HCPs).
  Every scoped tool requires a BOTH-MODES validation (full vs scoped → identical decisions for the affected HCPs) before
  it's trusted on real data. Offline proofs done; real-data validation of scoped ta_tagging pending (full-scan baseline
  crashed — under investigation).

**§32e. Non-negotiable ordering (unchanged from build, re-confirmed):** Step F BEFORE dedup (dedup repoints
publication_authors_v2 FKs so Step F links follow merges); career metrics AFTER dedup (R1 — de-inflating before identity
resolution harms fragmented KOLs); cohort classify AFTER career, BEFORE scoring (R2); Step F uses `--hcp-ids-file` with
ALL TA hcp_ids, NEVER `--only-new-hcps` (R3 — buried 34% of AD's established cohort).

---

## §33. RISING-STAR SCORING — THE MOMENTUM CHAIN (the section the main playbook was missing)

**The main TA_NEW_PLAYBOOK.md step 12 ("scoring_pipeline.py (rising) → hcp_score_ranks_v2") is STALE for the live
NSCLC rising leaderboard.** Ground truth (frontend api.ts + FEATURE_DEFINITIONS_CURRENT.md + ch2 §7i):

- **NSCLC (and every non-AD TA) rising board** = the "OLD" 2x2 Momentum/Visibility model → table
  `hcp_rising_star_ranks_v3` (momentum_component, visibility_component, scientific/network momentum & visibility
  percentiles, `archetype`) → produced by a 5-SCRIPT MOMENTUM CHAIN. Frontend reads via RPC `get_rising_star_filtered`,
  ordered by `us_rank`.
- **AD rising** = the NEWER emergence/network composite → `hcp_rising_composite_v1` (rising_composite_scoring.py +
  emergence_scoring.py). NSCLC has 0 rows there. (ch2 §7i: the advisor pass that designed the new AD model killed one
  of the old model's axes AS METHODOLOGICALLY DISHONEST — so NSCLC runs a partly-superseded model. Migrating NSCLC to
  the new composite is a SEPARATE model-migration project, ch2 §7i-7j, not a cycle step.)
- `scoring_pipeline.py → hcp_score_ranks_v2` is only a DETAIL-PAGE rank FALLBACK for rising/community, NOT the board.
  Its NSCLC rising data was 7 weeks stale. Do NOT rely on it for the leaderboard or the diff.

### THE CHAIN (all scripts in scripts/score/, all click-based, all support --ta/--dry-run/--debug-top).
New HCPs have 0 rows in all momentum inputs, so the WHOLE chain must run (centrality is whole-graph — an HCP's
centrality depends on all edges, so it can't be per-HCP scoped; --ta nsclc recomputes the whole NSCLC graph incl new
HCPs + their Step-F edges). UPSERTs (ON CONFLICT DO UPDATE), so re-running refreshes existing rows + adds new HCPs.

1. `network_centrality_scoring.py --ta nsclc --window-type hist_2016_2020 --start-year 2016 --end-year 2020`
   → hcp_network_centrality_v2 (historical window; network_momentum's early baseline)
2. `network_centrality_scoring.py --ta nsclc --window-type recent_2021_2025 --start-year 2021 --end-year 2025`
   → hcp_network_centrality_v2 (recent window; rising_star + network_momentum both read this)
   VERIFY: new HCPs now have recent_2021_2025 centrality rows (was 0).
3. `scientific_momentum_scoring.py --ta nsclc`  (--early 2016-2020 vs --recent 2021-2025, reads publication_authors_v2)
   → hcp_scientific_momentum_v1
4. `network_momentum_scoring.py --ta nsclc`  (diffs hist_2016_2020 vs recent_2021_2025 centrality)
   → hcp_network_momentum_v1
5. `rising_star_scoring.py --ta nsclc`  (Rising Star Raw = 0.70*Momentum + 0.30*Visibility; reads sci_momentum JOIN
   net_momentum JOIN net_centrality[recent_2021_2025] JOIN hcps_v2) → hcp_rising_star_ranks_v3 (THE LIVE BOARD)
   VERIFY: new rising HCPs now have hcp_rising_star_ranks_v3 rows; board reflects the cycle.

All 5 have --dry-run (compute, no write) + --debug-top N (print top N). Dry-run each, verify counts, then run live.
network_centrality is the slow one (whole-graph centrality over ~76K nodes).

### THE DIFF — reingest_diff.py POINTS AT THE WRONG TABLE
reingest_diff snapshots hcp_score_ranks_v2 (the stale fallback), but the board is hcp_rising_star_ranks_v3 (rising) +
hcp_established_ranks_v3 (established). To show real "what changed", REPOINT reingest_diff at those two tables, and the
BEFORE snapshot must be re-taken on the correct table (the existing 8c7244a1 is on the wrong table). TODO: repoint +
re-baseline. For THIS cycle: after the chain runs, capture before/after on hcp_rising_star_ranks_v3 to see the 63 new
rising stars enter + any rank movement.

### ALSO UPDATE main TA_NEW_PLAYBOOK.md step 12 to reference THIS section.

### §33 CORRECTION — the momentum model is NOT "old/inferior tech debt." It's MODEL-PER-LANDSCAPE by design.
Earlier framing in §33 ("OLD model", "partly-superseded", "migration is outstanding work") is WRONG and is retracted.
Corrected understanding (per Garrett): NSCLC and AD use DIFFERENT rising-star methodologies BECAUSE THE THERAPEUTIC
LANDSCAPES ARE DIFFERENT — a deliberate fit-for-purpose choice, not a version lag.
- NSCLC (large, mature, US-heavy, dense long-history co-authorship network) → MOMENTUM/VISIBILITY model
  (hcp_rising_star_ranks_v3): measures velocity/acceleration through an established field where there's a rich
  temporal signal. Correct for this landscape.
- AD (~82% international, different research structure) → EMERGENCE/NETWORK composite (hcp_rising_composite_v1):
  emergence + network-influence fits a landscape where "who's surfacing / who's connected" matters more than
  velocity through a dense US network.
The ch2 §7i "killed an axis as dishonest" note = that axis didn't work FOR AD's landscape, driving an AD-appropriate
model — NOT a universal condemnation of the momentum model. The per-TA fork (ch2 §11: taId===AD ? composite :
rising_star) is the INTENDED architecture (model-per-landscape), NOT a temporary pre-unification state. There is NO
"migrate NSCLC to the new model" TODO. Each TA gets the methodology that fits its landscape; adding a TA includes
choosing/assigning its rising model, not defaulting everything to one.

---

## §34. PER-TA RISING-MODEL SELECTION — the decision tree (how to choose the `rising_model` value when onboarding a TA)

Companion to §33's model-per-landscape architecture. When onboarding a TA, its rising-star scoring model is a
DELIBERATE choice driven by the therapeutic landscape, made at build time. Walk this tree in order:

### 1. Does the MOMENTUM model (NSCLC) fit?
Fits when the landscape has DEPTH TO MEASURE VELOCITY AGAINST: long publication history, dense co-authorship network,
strong US presence, enough temporal signal that "who's accelerating" is meaningful. Requires ~5-script chain
(centrality x2 windows → sci/net momentum → rising_star_scoring → hcp_rising_star_ranks_v3).
LIKELY FITS: mature solid tumors, Alzheimer's, major cardiology, big established fields ("more protein to chew on").
→ If yes: rising_model='momentum'. Done.

### 2. Does the EMERGENCE/NETWORK composite (AD) fit?
Fits when the field is YOUNGER / SPARSER / MORE INTERNATIONAL / FAST-MOVING, where recent output growth + connectedness
beats velocity-through-density. emergence_scoring + rising_composite_scoring → hcp_rising_composite_v1 (0.75 emergence
+ 0.25 network).
LIKELY FITS: rare diseases with a real cohort, newer modalities, internationally-skewed fields (AD ~82% intl).
→ If yes: rising_model='emergence_composite'. Done.

### 3. Neither fits as-is? Sub-cases, CHEAPEST FIRST — exhaust 3a before ever building 3c.
- **3a. PARAMETER problem, not model problem (CHECK FIRST).** "Neither fits" is USUALLY "right model, wrong
  windows/weights." A mature-but-recently-exploded field (e.g. immuno-oncology ~2015+) may want MOMENTUM with SHIFTED
  windows (recent 2020-2025 vs 2015-2019, not the 2016-2020/2021-2025 defaults). That's a CONFIG change to the existing
  chain, not a new model. Most "neither" cases resolve here.
- **3b. HYBRID of the two existing scorers.** Landscape with an established old guard AND rapid new-researcher influx
  might want momentum's velocity signal + emergence's from-zero detection. Composite the two existing scorers' outputs
  rather than build new. Moderate effort, reuses code.
- **3c. GENUINELY NEW methodology (real project — only if signal SOURCES differ).** A landscape structurally unlike
  both — so sparse that neither centrality nor pub-velocity has signal (very rare disease, <50 real researchers). The
  rising signal must come from DIFFERENT SOURCES: trial leadership, grant awards (NIH RePORTER — K-award/R01 as
  rising leading indicators), conference activity, MSL crowdsourced intel. Build only when the signal sources
  themselves differ, not just the tuning.
- **3d. SHIP WITHOUT RISING (the honest "not yet").** If no model is defensible on the available signal, DON'T ship a
  rising board — show Established + Community only, add Rising when data supports it. "I don't want to put lipstick on
  a pig" applies directly: a rising board on insufficient signal IS lipstick. Better to omit than ship noise.

### KEY DISCIPLINE
Exhaust 3a (reparametrize an existing model) BEFORE 3c (build new). Only build a new model when the SIGNAL SOURCES
differ (publications too thin → trials/grants/conference/MSL), not merely when the tuning is off. Choosing the model
(and its windows/weights) is part of TA onboarding — record it in the per-TA `rising_model` config so the automated
reingest dispatches the correct chain (§33).

---

## §35. INCREMENTAL REINGEST — THE COMMAND RUNBOOK (copy-paste, in order)
Every stage of one incremental reingest cycle with the EXACT command. NSCLC example (TA_ID
c0065b03-a25e-4e9a-bde4-4b4d0db7827d, this-cycle ingestion_run_id 5001edfd-7085-4e97-8f04-16b813bbd32a). Substitute
the run's own ta_id / ingestion_run_id. Windows/PowerShell. Prepend $env:PYTHONIOENCODING="utf-8" for any query that
outputs unicode names.

### 0. INGEST (produces the ingestion_run_id everything else scopes to)
    python scripts/ingest/ingest_publications.py --ta nsclc --incremental
    # → new publications_v2 rows + a new ingestion_run_id. RECORD that id; every stage below scopes to it.

### 1. compute affected HCPs (the scope file for tagging/enrich)
    python scripts/utilities/compute_affected_hcps.py --ingestion-run-id <RUN> --out affected.txt
    # → affected.txt = new HCPs (by run_id) UNION existing authors of the batch pubs (via authorships JSON →
    #   hcp_openalex_authors_v2, NOT publication_authors_v2 which is empty for new HCPs pre-Step-F).

### 2. ta_tagging (scoped)   [DEFAULT DRY-RUN — add --execute]
    python scripts/classify/ta_tagging_rebuild_v2.py --ta nsclc --candidate-hcp-ids-file affected.txt --execute
    # scoped mode resolves HCP→pubs via author_pub_flat (Step-F-independent). VERIFY hcp_therapeutic_areas_v2 count rose.

### 3. generate the full-TA hcp-ids file, then Step F (scoped additive)
    python scripts/utilities/run_sql.py "SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id='<TA_ID>'" > nsclc_all_hcp_ids.txt
    # regex-clean to bare uuids (one per line) → nsclc_all_hcp_ids_clean.txt (strip run_sql header/---/footer)
    python scripts/classify/rebuild_publication_authors_v2.py --hcp-ids-file nsclc_all_hcp_ids_clean.txt --execute
    # R3: ALL TA hcp_ids, NEVER --only-new. ON CONFLICT DO NOTHING (additive, safe). "R3 risk DROPPED: 0" must hold.
    # VERIFY: new_hcps_now_linked = count(DISTINCT pa.hcp_id) WHERE hcp_id IN (new HCPs) → was 0, now ~tagged count.

### 4. 9b authorship position   [DEFAULT DRY-RUN — add --execute]
    python scripts/classify/derive_authorship_position_v2.py --pub-ids-file batch_pubs_<N>.txt --author-position-mode skip --execute
    # --author-position-mode skip is MANDATORY (author_position col is INTEGER; default 'label' writes STRING → crash).
    # scope by PUB (the batch's new pubs). Writes is_first_author/is_senior_author booleans (the scorer signal).

### 5. DEDUP   [detect is read-only; merge defaults to high-confidence tier]
    python scripts/dedup/dedup_detect.py --ingestion-run-id <RUN>          # → dedup_candidates_phase1.csv
    # REVIEW every candidate. shared_coauthors = decisive same-person. Empty 0-pub stub = safe merge. Different-institution
    # + pub_domain_overlap = same-person-multi-affiliation. Verify low-evidence via institution+pub_count before merging.
    python scripts/dedup/dedup_merge.py --dry-run                          # then:
    python scripts/dedup/dedup_merge.py --execute                         # (--tier fragment_low_evidence / --cluster N for others)
    # VERIFY hcps_v2 count drops by #merges.

### 6. CAREER CHAIN (the deep one — 4 sub-steps, all AFTER dedup)
    # 6a. career metrics: writes total_career_pubs + RAW career_first_pub_year. NO --execute flag (dry-run is opt-in).
    python scripts/enrich/career_enrichment_from_clusters.py --only-changed-today --target-version v2
    # 6b. author metrics: populates hcp_author_metrics_v2.counts_by_year (billed; scoped via the flag Code added).
    python scripts/enrich/openalex_author_enrichment.py --hcp-ids-file affected.txt        # (--dry-run to preview scope)
    #     VERIFY: count(hcp_author_metrics_v2 WHERE new HCPs AND counts_by_year NOT NULL AND snapshot=today) > 0.
    # 6c. sustained-onset → career_first_pub_year_v2 (run the NSCLC-adapted SQL; PREVIEW before UPDATE; snapshot_date
    #     in the SQL MUST match 6b's printed snapshot_date). File: nsclc_career_first_pub_year_v2_incremental.sql
    python scripts/utilities/run_sql.py "<the sustained-onset UPDATE, scoped by ingestion_run_id>"
    #     VERIFY: count(career_first_pub_year_v2) for new HCPs → was 0, now ~all.
    # 6d. cohort classify: reads _v2, guards it, derives career_age, assigns cohort.   [--execute]
    python scripts/classify/cohort_classification_v2.py --ta nsclc --execute
    #     GATE: new HCPs spread across rising_eligible/established/community, NOT 100% community. career_age 0..~50.

### 7. SCORE — via the dispatcher (--ta selects TA + methodology)
    python scripts/score/rising_score.py --ta nsclc --execute
    # Dispatches by the TA's rising_model. momentum (NSCLC) → 5-script chain → hcp_rising_star_ranks_v3.
    #   emergence_composite (AD) → emergence + rising_composite → hcp_rising_composite_v1.
    # ~70-90 min for momentum (two whole-graph centrality windows are the long poles). Fail-fast per step.
    # VERIFY: count(hcp_rising_star_ranks_v3 WHERE new HCPs) > 0.
    # (Established scoring is a separate chain / future established_score.py dispatcher — TA-agnostic, run when needed.)

### 8. THE DIFF (the deliverable) — capture BEFORE (before step 7!) and AFTER on the CORRECT table
    # BEFORE (capture BEFORE running step 7, or the board is overwritten):
    $env:PYTHONIOENCODING="utf-8"
    python scripts/utilities/run_sql.py "SELECT h.first_name,h.last_name,r.us_rank,r.rising_star_raw,r.momentum_component,r.visibility_component,r.archetype FROM hcp_rising_star_ranks_v3 r JOIN hcps_v2 h ON h.id=r.hcp_id WHERE r.therapeutic_area_id='<TA_ID>' AND r.country='US' ORDER BY r.us_rank LIMIT 30" > nsclc_rising_board_BEFORE.txt
    # AFTER (same query → _AFTER.txt), then compare: do top ranks hold? do new rising HCPs appear? any movement?
    # NOTE: reingest_diff.py currently points at the WRONG table (hcp_score_ranks_v2). Repoint it to
    #   hcp_rising_star_ranks_v3 + hcp_established_ranks_v3 before relying on it (TODO).

### STAGE ORDERING (hard dependencies)
ingest → affected → tagging → Step F → 9b → DEDUP → career chain (6a→6b→6c→6d) → score → diff.
Career MUST be after dedup (R1). 9b after Step F (updates rows F created). Capture BEFORE-snapshot before step 7.
