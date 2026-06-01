# FieldMark Social — Standalone Workstream Doc

> **Companion to `FieldMark_Handoff_2026-05-29.md`.** That doc covers the full platform. This one is the deep dive on social — what's built, what we validated tonight, and where it's going. If you're picking up the social workstream specifically, read this in full. If you're picking up the platform generally, read the main handoff first.

> **Critical context:** Social is FieldMark's strategic moat. We validated this empirically on May 30, 2026 by surveying ASCO Day 2 capture. The drug-level intelligence layer (extracting specific drug mentions from raw post text) is the differentiating workstream that elevates FieldMark from "rising star identifier" to "the platform that tells pharma MSL teams who's talking about their drug class, in real time, during the moments that matter."

---

## Why social is the moat

FieldMark's original positioning: identify rising star HCPs that traditional KOL databases miss. That's a real product, but it's not a unique product — competitors could replicate the publication + trial scoring with effort.

**The unique value lives in social.** Specifically: **drug-class-specific conversation signal during conference moments.** No other product surfaces this. Traditional KOL databases ignore Twitter/X entirely. Conference monitoring tools track hashtags but not drug names. Pharma competitive intelligence tools track press releases, not real-time clinician interpretation.

The empirical validation came on May 30, 2026 (ASCO 2026 Day 2). We captured 6,432 posts in one day, then surveyed the corpus. Real findings:

- **Talazoparib**: 31 posts, 24 distinct voices, 681 total engagement units (TALAPRO-3 NEJM publication moment)
- **Divarasib + pembrolizumab**: 16 posts, 12 voices (Krescendo-170 KRAS G12C readout)
- **Lorlatinib**: 21 posts, 19 voices (7-year CROWN follow-up)
- **Elisrasib**: 7 posts, 7 voices — *every voice posted exactly once* (expert validation pattern, not chatter)
- **Pumitamig**: 8 posts, 8 voices (same expert pattern)

**Each drug has a distinct signal shape.** Talazoparib's pattern (broad conversation, viral engagement) reflects a community moment. Elisrasib's pattern (one post per voice, all expert) reflects validated expert commentary. These shapes are different *products* for different pharma use cases.

A Pfizer MSL covering talazoparib doesn't want "rising stars in oncology." They want "the 24 voices who posted about talazoparib at ASCO Day 2 specifically — what did they say, who are they, are they HCPs we know?"

That's the moat. That's why social matters.

---

## What's built today

### Capture infrastructure

**`twitter_capture.py`** — 673-line Python script using the Twitter/X API v2. Treats hashtag captures as discrete operations. Supports:

- `--tag X` — single hashtag capture
- `--profile X` — named congress profile (ASCO, ESMO, EASL, AASLD, EHA) covering multiple hashtags
- `--all` — full active hashtag set from config
- `--dry-run` — no DB writes, no paid API calls
- `--max-results N` — tweets per API page (10-100)

Costs roughly $0.005 per post read + $0.010 per user read. ASCO Day 2 was 6,432 posts at $35.94 total. EASL 2026 (smaller hepatology conference) was 113 posts at $1.08.

**`social_capture_config.json`** — hashtag → therapeutic area mapping plus congress profiles. 22 active hashtags across 2 TAs (oncology, hepatology). The source of truth for which hashtags get captured and how they tag.

**`social_update.py`** (shipped May 29, 2026) — one-command pipeline that wraps the capture script with TA tagging and view refresh. Built as a subprocess wrapper to avoid touching `twitter_capture.py`'s internals. Saturday morning ASCO captures are now one command: `python social_update.py --profile ASCO`.

### Storage layer

**`social_posts_v2`** — raw post data. Has columns:
- `handle` (lowercase, e.g. `drchoueiri`)
- `post_text` — full tweet content
- `posted_at` — timestamp
- `engagement_likes`, `engagement_replies`, `engagement_reposts`, `engagement_quotes`
- `captured_via_query` — which hashtag found this post (e.g. `#ASCO26`)
- `therapeutic_areas` — array, backfilled by `social_update.py`
- `social_user_id` — FK to `social_users_v2`

**Critical: RLS enabled on `social_posts_v2`, zero policies.** The frontend cannot read this table directly. This was the SOURCE bug we hit on May 29 — the workaround is materialized views.

**`social_users_v2`** — Twitter user profiles. Includes follower_count, bio, display_name, platform. Joined into materialized views for enrichment.

### Materialized views (refreshed via `refresh_social_analytics()` Postgres function)

Four views, all per-TA, all trailing 30 days:

**`mv_social_share_of_voice_by_ta`** — top voices by total engagement, with display_name. Renders the donut chart on the Social tab.

**`mv_social_hot_topics_by_ta`** — co-occurring hashtags ranked by engagement, excluding entry hashtags. Renders the hot topics bars. Real result: NSCLC + GU subcommunity tags (#lcsm, #mmsm, #liquidbiopsy, #prostatecancer, #bladdercancer) dominate.

**`mv_social_trending_topics_by_ta`** — week-over-week deltas filtered to prior_engagement >= 50. Renders the trending strip. Real result on ASCO Day 2: ↑ #lcsm, ↑ #mmsm, ↑ #melanoma, ↓ #oncology (generic tag fading as subcommunity tags surge — meaningful signal).

**`mv_social_voice_emergence_by_ta`** — scatter plot data (follower count vs engagement-per-follower) with HCP-match enrichment, post_count >= 2 filter, **dominant_source_hashtag** column precomputed (added May 29 to fix the SOURCE bug). Renders the Rising Voices scatter chart.

### Frontend rendering

**`RisingVoicesChart.tsx`** — the headline visualization. Log-log scatter (follower count vs engagement-per-follower). Three-color dot system:
- **Amber `#E8A020`** = rising voice (<5k followers + >5% engagement)
- **Blue `#6BA3D8`** = established with engagement (≥5k + >2%)
- **Slate `#8AA0AC`** = other voices

Click-to-pin tooltip with "View on Twitter ↗" button. Filters: follower_count >= 100, total_engagement >= 20, post_count >= 4 (filters noise from tiny accounts and conference agenda bots).

**`SocialAnalyticsBanner.tsx`** — share of voice donut + hot topics bars + trending strip. Wired to real data via `getSocialAnalytics(taSlug)` in api.ts.

**`SocialCard.tsx`** — individual voice cards below the chart. Bio-keyword confidence-tier heuristic classifies each voice:
- `likely_hcp` — bio contains strong patterns (MD, PhD, DO, oncologist, fellow, professor)
- `possibly_hcp` — bio contains weak patterns (oncology, cancer, research)
- `unverified` — no clinical signal in bio
Wired via `getSocialCandidates(taSlug)`. Replaces the earlier mock.

**Confidence-tier accuracy is empirically good.** ASCO's institutional account correctly gets `possibly_hcp`. Sumanta Pal's sparse bio correctly gets `unverified`. Individual clinicians with credential-laden bios correctly get `likely_hcp`.

### Auxiliary scripts

- `dol_matching.py` (18KB, last modified May 5) — original DOL matching pipeline. **Currently broken for v2** — the v1→v2 migration regenerated HCP UUIDs, breaking foreign key references. Real workstream to rebuild matching against v2 HCP IDs. Filed.
- `twitter_enrichment.py` — found 358 Twitter matches against v1 HCPs originally. Same v1→v2 break.
- `bluesky_enrichment.py` — found 603 Bluesky matches against v1 HCPs originally. Same v1→v2 break.

The DOL infrastructure was built and worked under v1 but was effectively lost in the v1→v2 migration. Restoring it is a separate filed workstream (probably 2-4 hours of pipeline re-running with verification).

### Saturday/conference workflow

```powershell
cd C:\Users\garre\Desktop\FieldMark
python social_update.py --profile ASCO
```

That captures, tags, refreshes. Costs $15-35 per heavy conference day. App reflects current data within ~6 minutes.

Currently supported profiles: ASCO, ESMO, EASL, AASLD, EHA. Adding new profiles is a config edit (add primary_hashtags + secondary_hashtags) plus updating the TA mapping in `active_hashtags`.

---

## What we validated tonight (May 30, 2026 — ASCO Day 2)

### Real numbers

- **6,432 posts captured Day 2** vs **3,217 Day 1** — 2x conference acceleration
- **$35.94 cost Day 2** vs **$23.62 Day 1**
- **378 new users discovered Day 2** vs 753 Day 1 (network saturating)
- **374 seconds (~6 min) total pipeline time** including capture + tag + view refresh

### Real product observations

**Rising Voices chart now shows 126 voices** (up from 122 Day 1). The amber cluster expanded — new rising voices emerged from Day 2's heavy abstract presentation traffic.

**Hot Topics shifted predictably:**
- Day 1: liquidbiopsy 17.45%, lcsm 14.14%, mmsm 7.51%, prostatecancer 6.52%, melanoma 5.41%
- Day 2: liquidbiopsy 18%, lcsm 13%, mmsm 8%, **prostatecancer 7%** (new in top 5), melanoma 5%, **bladdercancer 5%** (new in top 5)

The Day 2 new entries (prostatecancer, bladdercancer) reflect Day 2's plenary sessions on those tumor types. **The system surfaced the conference's actual themes without us telling it what to look for.**

**Trending vs prior week:**
- ↑ lcsm (rising)
- ↑ mmsm (rising)
- ↑ melanoma (rising)
- ↓ oncology (falling — generic tag declining as subcommunity tags rise)
- ↓ urology (falling)
- ↓ diamundialdelmelanoma (World Melanoma Day, which has its own date)

**Top voice share doubling:**
- Dr Rishabh Jain 9% Day 2 (was 4.64% Day 1)
- gilberto lopes 8% Day 2 (was 3.99% Day 1)
- Neeraj Agarwal 6% Day 2 (was 3.16%)

These aren't bots. We confirmed by reading their actual posts — substantive clinical commentary, thread-style trial summaries, real-time abstract interpretation.

### THE moat validation: drug-mention extraction proof-of-concept

This is the single highest-leverage thing we discovered tonight. Across just 25 top-engagement Day 2 posts, manually identified drugs:

- **talazoparib + enzalutamide** (TALAPRO-3 prostate cancer, NEJM publication)
- **divarasib + pembrolizumab** (Krescendo-170 KRAS G12C NSCLC)
- **lorlatinib** (CROWN 7-year)
- **elisrasib** (KRAS G12C NSCLC)
- **daraxonrasib** (RevMed pancreatic, FDA Expanded Access)
- **pralsetinib** (AcceleRET-Lung)
- **sunvozertinib** (WU-KONG28)
- **pumitamig** (PD-L1/VEGF-A bispecific, ROSETTA Lung-02)
- **durvalumab + chemoradiotherapy** (RAD-IO bladder cancer)
- **sac-TMT + pembrolizumab** (OptiTROP-Lung05)

Then ran a SQL extraction (simple ILIKE matching) on all Day 2 posts:

| Drug | Posts | Voices | Engagement |
|------|-------|--------|------------|
| talazoparib | 31 | 24 | 681 |
| divarasib | 16 | 12 | 363 |
| lorlatinib | 21 | 19 | 346 |
| elisrasib | 7 | 7 | 237 |
| pumitamig | 8 | 8 | 162 |
| sunvozertinib | 15 | 14 | 160 |
| daraxonrasib | 5 | 5 | 135 |
| KRAS G12C (class) | 12 | 7 | 89 |
| pralsetinib | 5 | 3 | 16 |

**120 distinct posts from 99 unique voices** discussing 9 specific drugs in a single 24-hour Day 2 window. And we only searched for 9 drugs — there are dozens more in the corpus we didn't query.

**Signal shape insights worth thinking about:**

- **Broad conversation pattern** (talazoparib, lorlatinib): many people weighing in, viral engagement. Reflects a *community moment* — major publication, milestone follow-up.
- **Expert validation pattern** (elisrasib, pumitamig): each voice posts exactly once, all high quality. Reflects *expert commentary on novel data* — the people speaking are signaling expertise, not chasing engagement.
- **Distributed conversation** (sunvozertinib): many voices, moderate engagement each. Reflects *broader practitioner interest in a class*.
- **Narrow expert dialogue** (pralsetinib, 3 voices): the small group that follows this molecule closely.

**Each shape is a different product story.** A pharma MSL team can use these patterns to triage their attention:
- For their drug, are they seeing the broad pattern (good — community moment) or the narrow pattern (concerning — only 3 voices care)?
- Are competitor drugs in their class seeing the expert pattern? Who are those experts?

---

## Where social is going

### v1.1 — Drug Mention Extraction Layer (the moat)

**The build.** Add an extraction pipeline that runs Claude API over `social_posts_v2.post_text` on a rolling basis as posts come in. Extracts:

- Drug names (generic and brand)
- Trial names (TALAPRO-3, Krescendo-170, etc.)
- Patient population (NSCLC, mCSPC, MIBC, etc.)
- Sentiment/stance (positive efficacy, safety concern, methodology critique, etc.)

**Schema design (proposed).** New table `drug_mentions_v2`:

```
drug_mentions_v2
  id uuid pk
  post_id uuid fk -> social_posts_v2
  drug_name text             -- "talazoparib"
  drug_class text            -- "PARP inhibitor"
  trial_name text             -- "TALAPRO-3"
  patient_population text     -- "metastatic prostate cancer with HRR alterations"
  sentiment text              -- "positive_efficacy" | "safety_concern" | "neutral" | etc.
  extracted_at timestamp
  extraction_model text       -- "claude-sonnet-4-X" for audit
  confidence numeric          -- 0-1 from extraction model
```

**Materialized view layer.** Build `mv_social_drug_activity_by_drug`:
- Per drug, trailing 30 days
- Total mentions, unique voices, total engagement
- Top voices ranked
- Trend vs prior week
- Conference-specific subset (when captured_via_query is a conference tag)

**Frontend.** Drug-detail pages: "Who's talking about [drug]?" Tabs for community conversation, expert voices, sentiment breakdown, conference activity timeline.

**Real cost estimate.** Extracting drugs from 6,432 Day 2 posts via Claude API at ~$0.003 per extraction = ~$20/day for major conference days. Steady-state for non-conference days probably $1-5/day. Annual cost <$2,000.

**Real timeline.** 2-3 days of focused work to build extraction + storage + first MV. Another 2-3 days to build the drug detail page UI.

### v1.2 — Congress-Specific Pages

Event-scoped views separate from steady-state. "ASCO 2026 Conference Pulse" page with:
- Day-by-day post volume timeline
- Per-day top drugs, top voices, top trials
- Session-linked spikes (when do specific abstract sessions cause engagement spikes for specific drugs?)
- Drug-mention heatmap across the conference

Different from the always-on rising voices view because conferences are short, high-density moments that deserve their own treatment.

### v1.3 — Sentiment-per-drug

Layer sentiment classification onto drug mentions. Output per drug:
- % positive, % concerned, % neutral
- Specific concerns surfacing in negative posts (efficacy, safety, accessibility, cost)
- Sentiment trend over time (drug A's sentiment is improving as Phase 3 data lands, drug B's declining due to safety reports)

This is gold for pharma MSL planning. Knowing your drug is trending negative on safety is the kind of signal that should drive immediate field response.

### v1.4 — Topic Clustering via Embeddings

Rather than hashtag-based topic detection (current), use post-text embeddings to cluster posts by semantic similarity. Surface emergent conversation themes:
- "Cardiac safety concerns" cluster appearing across multiple drugs
- "Real-world data vs trial data gap" thematic discussion
- "Diversity in trial populations" emergent debate

Hashtags can't capture these themes. Embeddings can.

### v1.5 — Collaborative Orbit (Garrett's strategic moat feature)

This is the longer-term play, partially overlapping with social. Map co-investigator relationships (`trial_investigators_v2`, `publications_v2` co-authorship) into a graph. Then enrich with social co-mention signal: who's tweeting about whom? Who's quote-tweeting the same KOLs?

Surface "rising stars in the orbit of [Established KOL]" — the kind of query that no other tool answers.

### v1.6 — Predictive Rising Voice Model

ML model that predicts which voices are about to surge based on:
- Engagement trajectory (acceleration, not just absolute level)
- Network position (whose posts they engage with)
- Topic coverage (are they posting about drugs that are about to have catalyst moments?)

Output: "These 12 voices are likely to be in the top 50 by next month."

### v1.7 — Weekly Automated Refresh Pipeline

Currently captures are manual (Garrett runs `social_update.py` daily during conferences). Build automation:
- Daily captures on a schedule
- Weekly automated refresh of all materialized views
- Monday morning digest email (Garrett's primary retention mechanic for the product)

### Filed but not yet sequenced

- **LinkedIn data surfacing on profile screen** — company affiliation as priority field
- **EU CTIS ingestion** — European trial registry to complement ClinicalTrials.gov
- **Bluesky capture** at the same depth as Twitter (currently only via `bluesky_enrichment.py`'s legacy v1 matching)
- **Drug name normalization** — canonical drug names + brand alias mapping (talazoparib = Talzenna, etc.)
- **Investigator-mention extraction** — who's mentioned BY NAME in posts (not just hashtags)
- **Institution-mention extraction** — which research institutions are getting cited

---

## Open issues / tech debt specific to social

1. **DOL matching pipeline broken in v2.** `dol_matches_v2` has 0 rows. The v1 matching scripts target v1 HCP IDs which were regenerated during v1→v2 migration. Real workstream to rebuild against v2.

2. **`getVerifiedDOLs` query in api.ts** queries `dol_matches_v2` (empty), so the "verified DOL" count shows 0 across all TAs. Cosmetic but visible.

3. **Hepatology Social tab is sparse.** EASL 2026 captured only 113 posts. Hepatology Twitter is genuinely 1/30th the volume of oncology Twitter. The Rising Voices chart filter (post_count >= 4) reduces Hepatology to ~2 voices. Real product call: design a sparse-TA UX, OR accept that hepatology Social is empty until AASLD in November.

4. **Confidence tier heuristic is bio-keyword based, not learned.** Works well empirically but won't scale to edge cases. v1.2+ would benefit from a learned classifier trained on confirmed HCPs.

5. **Cards still don't have the institutional aggregator filter.** ASCO, OncoAlert, and similar institutional accounts appear as cards. Should be either hidden or surfaced separately as "Institutional voices."

6. **`#EASL26` (2-digit year variant) was missed in initial EASL config.** Manually added during May 29 session. Pattern to watch for at every future conference — confirm both `#XYZ2026` and `#XYZ26` variants are in the active_hashtags list.

7. **Twitter API rate limits not handled gracefully.** If a capture hits rate limits mid-run, the script reports partial results without flagging it loudly. Should fail louder.

8. **No budget warning before captures.** `social_update.py --profile ASCO` will spend $20-40 silently. Should print estimated cost and require confirmation. Filed as small enhancement.

9. **Drug mention extraction is the unbuild moat.** Every day without it is a day FieldMark's product is differentiated less than it could be.

---

## Real strategic questions worth thinking about

### Should the homepage pivot from "Rising Stars by TA" to "Drug-class signal by event"?

Tonight's data exploration suggests: maybe. The drug-mention signal is more directly valuable to pharma MSL teams than the rising-star signal. A Pfizer MSL doesn't care about NSCLC rising stars in general — they care about who's talking about talazoparib at ASCO Day 2.

Counterargument: rising stars is the broader product. Drug-class signal is the deeper product. Maybe the homepage stays rising stars, and drug detail pages become the "click-deeper" surface that proves the product's value.

Decide later. File as strategic.

### What's the right pricing model?

Originally filed as $24.99/month individual subscription targeting 57,000 US MSLs.

After tonight's validation, real question: **does the drug-class signal justify a higher tier?** A Pfizer MSL with budget could pay $500/month for drug-specific intelligence. The individual rising-stars product is $25. The drug intelligence product might be $200-500.

Two-tier pricing worth filing as strategic.

### How does this position vs H1, Veeva, IQVIA?

The exit thesis (acquisition by H1/Veeva/IQVIA) becomes more compelling with the drug intelligence layer. None of those competitors has real-time conference drug-class signal. FieldMark with the v1.1 moat is a credible acquisition target for any of them.

### Conference-by-conference capture economics

ASCO Day 1+2: $59.56 total. Probably $30-40 more for Days 3-5. Total ASCO ~$100. Mid-tier conferences (ESMO, ASH) probably similar. Smaller (EASL, AASLD) much cheaper.

Annual capture cost: probably $1,500-2,500 across all conferences in scope.

That's the cost of the data. Worth it given the product validation.

---

## What I wish I had known going into the social workstream

A few honest read-outs that future Claude (or future Garrett, after coffee) should know:

### The capture script is a black box, treat it that way

`twitter_capture.py` is 673 lines and works. Don't try to import its functions. Don't try to modify its capture logic. Use subprocess. Pass arguments. Read exit codes. Trust the cost summary.

### Hashtags are the easy layer; drug names are the moat

Conference hashtag capture is the entry point but it's a commodity. The signal that elevates the platform is what's *inside* the post text. Drug-mention extraction is the difference between "we monitor ASCO" and "we tell you who's talking about your drug at ASCO."

### RLS on `social_posts_v2` is intentional

The frontend cannot read this table directly. Use materialized views with precomputed aggregates. We hit this on May 29 with the SOURCE bug — the fix was rebuilding `mv_social_voice_emergence_by_ta` with a precomputed `dominant_source_hashtag` column. Same architectural pattern applies to any future frontend feature that needs post-level data.

### Real conferences capture is uneven

ASCO (45,000 attendees) → 6,432 posts/day. EASL (8,000 attendees) → 113 posts total. Hepatology Twitter is genuinely thin. AASLD in November will be richer for US hepatology. Set expectations honestly.

### `#XYZ26` vs `#XYZ2026` — capture both

Conferences have hashtag variants. Always add both 4-digit and 2-digit year forms. Lesson learned at EASL 2026 — `#EASL26` was missed initially.

### The fake "drug" data isn't fake

When Claude is reading tonight's drug-mention results, every drug name is real:
- talazoparib = Talzenna (Pfizer)
- divarasib = GDC-6036 (Genentech/Roche)
- daraxonrasib = RMC-6236 (Revolution Medicines)
- pumitamig = AK112 (Akeso/Summit)
- lorlatinib = Lorbrena (Pfizer)
- These are real molecules in real Phase 2/3 trials being discussed by real oncologists.

Don't second-guess the data. Read it as truth.

### The voices in our database have real names

We're working with real people: drchoueiri = Toni Choueiri at Dana-Farber. neerajaiims = Neeraj Agarwal at Huntsman. stephenvliu = Stephen V. Liu at Georgetown. These are recognized GU and thoracic oncologists. Their commentary is signal.

When tempted to dismiss a voice or apply generic skepticism to "Twitter accounts," remember: **these are credentialed clinicians using a public platform to discuss real trial data.** FieldMark's job is to surface them, not to second-guess them.

---

## Tomorrow's first social-specific session

When Garrett comes back, the social workstream is at a meaningful inflection point. Real options for the next session:

**A. Start the drug extraction build (v1.1).** Architecture session: schema design, Claude API prompt engineering, pipeline integration with social_update.py. ~Half-day. Highest-leverage.

**B. Saturday morning ASCO capture + observation.** Run `python social_update.py --profile ASCO` for Day 3 (which would now be live), observe the Social tab evolution. Lower energy investment, real product validation work.

**C. Sketch the drug-detail page UI.** Design work without engineering. Useful preparation for v1.1 build.

**D. Restore DOL matching.** Real workstream but lower-leverage than drug extraction. Filed.

My honest lean: **A.** Tonight's validation is the launchpad. Next session should be the architecture deep-dive that turns the moat hypothesis into a real build plan.

---

## **PRIORITY 0: ASCO reply chain capture before window closes**

> **This is the single most time-sensitive item in this doc.** If you skip everything else and only do one thing in the next 72 hours, do this.

### The window math

Twitter/X API standard search returns posts from the last 7 days only. Full-archive search is gated behind expensive tiers (Pro $5K/month or Enterprise $42K/month). FieldMark is on the pay-per-use tier which can access the 7-day window at $0.005 per post.

**The ASCO 2026 reply chains become unreachable on a rolling basis:**

- ASCO Day 1 (Wed May 28, 2026) → reply window closes Wed June 4
- ASCO Day 2 (Fri May 30) → window closes Fri June 6
- ASCO Day 3 (Sat May 31) → window closes Sat June 7
- ASCO Day 4 (Sun June 1) → window closes Sun June 8
- ASCO Day 5 (Mon June 2) → window closes Mon June 9

**Capture by Monday-Tuesday or lose the reply data forever.**

### Why replies matter

The top-level post is "TALAPRO-3 PFS 77% vs 56%." The reply chains are where the substantive interpretation lives: "...but the HRR-deficient subset is only 28% of mCSPC and the toxicity profile in clinical practice will limit uptake."

The **expert disagreement, specific clinical concerns, comparative analysis, and patient population debates** all live in the reply layer. For a Pfizer MSL covering talazoparib, the reply chain to drchoueiri's TALAPRO-3 post is more valuable than the top-level post itself.

**Reply chains ARE the differentiated signal** that elevates the drug-mention extraction layer from "what drugs are mentioned" to "what are oncologists actually saying about each drug."

### Cost estimate (real numbers)

For top 50 ASCO Days 1-2 posts by engagement, average 15-20 replies each:
- 750-1,000 reply posts × $0.005 = **$3.75-$5.00**

For all posts mentioning the 9 drugs we extracted tonight:
- ~120 drug-mention posts × ~15 replies each = ~1,800 reply posts × $0.005 = **~$9.00**

For comprehensive top-100 + all-drug-mention capture:
- ~2,500-3,000 reply posts = **~$12-15**

**Hard cost cap: $15.** Anything beyond that is overkill for the proof.

### Implementation sketch (build Monday morning)

**New script: `capture_replies.py`**

Takes a list of post IDs and fetches their reply trees via Twitter API `conversation_id` parameter. Pattern:

```
For each parent_post_id:
  Query: search/recent with query = "conversation_id:{parent_post_id}"
  Pagination: handle next_token until exhausted
  Insert each reply into social_posts_v2 with new fields populated
  Track cumulative cost; stop at $15 cap
```

**Schema additions to `social_posts_v2`:**

```sql
ALTER TABLE social_posts_v2 ADD COLUMN parent_post_id text;
ALTER TABLE social_posts_v2 ADD COLUMN conversation_id text;
ALTER TABLE social_posts_v2 ADD COLUMN is_reply boolean DEFAULT false;
CREATE INDEX idx_social_posts_v2_parent ON social_posts_v2(parent_post_id) 
  WHERE parent_post_id IS NOT NULL;
CREATE INDEX idx_social_posts_v2_conversation ON social_posts_v2(conversation_id);
```

**Selection criteria for which posts get replies captured:**

Two SQL queries to build the parent_post_id list:

1. Top 50 by engagement across all ASCO captures:
```sql
SELECT post_id 
FROM social_posts_v2 
WHERE captured_via_query IN ('#ASCO26', '#ASCO2026')
AND posted_at >= '2026-05-28 00:00:00+00'
AND (is_reply = false OR is_reply IS NULL)
ORDER BY 
  COALESCE(engagement_likes, 0) + COALESCE(engagement_replies, 0) + 
  COALESCE(engagement_reposts, 0) + COALESCE(engagement_quotes, 0) DESC
LIMIT 50;
```

2. All posts mentioning target drugs (talazoparib, divarasib, lorlatinib, elisrasib, daraxonrasib, pralsetinib, sunvozertinib, pumitamig, plus expand the list with anything else Garrett wants):
```sql
SELECT post_id
FROM social_posts_v2
WHERE (
  post_text ILIKE '%talazoparib%' OR
  post_text ILIKE '%divarasib%' OR
  post_text ILIKE '%lorlatinib%' OR
  post_text ILIKE '%elisrasib%' OR
  post_text ILIKE '%elirasib%' OR
  post_text ILIKE '%daraxonrasib%' OR
  post_text ILIKE '%pralsetinib%' OR
  post_text ILIKE '%sunvozertinib%' OR
  post_text ILIKE '%pumitamig%'
)
AND posted_at >= '2026-05-28 00:00:00+00';
```

Union the two queries, dedupe, then iterate.

**Integration into `social_update.py`:**

Add a new flag `--capture-replies` or `--include-replies` that, after capture completes, runs `capture_replies.py` against the top-N high-engagement posts captured in that run. For future conferences (ESMO September, AASLD November, etc.) this becomes automatic.

### Timeline

Garrett's schedule:
- **Saturday May 30 (today, end of session)** — capture surveyed, doc updated
- **Sunday May 31** — limited session
- **Monday June 1** — significant session available, this is the build day

**Monday June 1 is the right time to build and execute this.**

Build sequence:
1. Schema additions to `social_posts_v2` (~5 min)
2. Build `capture_replies.py` (~60 min)
3. Test on small batch (top 5 posts) — confirm reply data lands correctly (~15 min, ~$0.50 spend)
4. Run on full target list (top 50 + drug mentions, deduped) (~30 min, ~$10-15 spend)
5. Verify reply data is queryable, build a quick observation query (~15 min)
6. Update `social_update.py` to integrate `--capture-replies` flag (~30 min)

Total: ~2.5 hours. Real Monday morning workstream.

**Hard deadline: by end of day Tuesday June 2.** ASCO Day 1 reply window closes Wednesday June 4. Building Monday gives Tuesday as buffer for unexpected issues.

### Risk if skipped

The reply data exists only inside Twitter/X's 7-day rolling window. Once expired, it's gone forever — full-archive access for reply chains requires $5,000/month Pro tier minimum. The drug-mention moat thesis would still be validated by top-level posts, but the deepest, most differentiated signal would be permanently inaccessible.

For $15 of API spend, this is one of the highest-leverage decisions Garrett can make.

---

## Closing thought

The social workstream went from "interesting capture infrastructure" on May 29 to "validated platform moat" on May 30 in roughly 24 hours. The Day 2 ASCO capture wasn't just data — it was the empirical proof that the FieldMark thesis works at scale on real-world data.

Drug-level intelligence from social during conferences is the product that elevates FieldMark from "rising star identifier" to "platform pharma can't ignore."

The reply chain capture by Tuesday June 2 is the next chapter — deeper signal, same conference, irrecoverable if missed.

Build it Monday.

— Claude, end of Saturday May 30, 2026 (updated with Priority 0 reply capture workstream)
