# AD Research Themes — parameterization plan (DRAFT, not applied)

**Status:** Draft for review. Nothing applied, nothing run. `extract_research_themes.py` is unchanged on disk.
**Date:** 2026-07-11
**Script:** `scripts/classify/extract_research_themes.py`
**Companion trace:** the pre-flight findings in the conversation (tag-agnostic detail read; wrong cohort; hcp_id-scoped idempotency footgun; extensive NSCLC hardcoding).

---

## 0. Why this needs a real pass (recap)

Unlike `compute_top_collaborators.py` (already `--ta`, pure SQL, drop-in), this script is:
- **Fully NSCLC-hardcoded** — `THERAPEUTIC_AREA="NSCLC"`, `ta.name='NSCLC'` in both SQLs, rising-star+US selection, NSCLC prompt exemplars, no `--ta`.
- **Targeting the wrong cohort for AD** — selects `hcp_rising_star_ranks_v3` (US Rising). AD Rising is **unbuilt (0 rows)** → would select 0 HCPs. AD needs **Established** (`hcp_established_ranks_v3`).
- **Idempotency footgun** — `DELETE`/`COUNT`/exists are `hcp_id`-scoped, not `(hcp_id, TA)`-scoped → an AD `--force` run would delete a dual-TA HCP's NSCLC themes; the default skip-if-exists would skip AD for any HCP that already has NSCLC themes.

**Tag note (important):** the primary detail-page read (`fetchHcpThemes`, api.ts) filters `hcp_id` + `display_rank` only — **TA-agnostic**, so AD themes render regardless of the tag value. The tag (`therapeutic_area` TEXT) is written as `"Atopic Dermatitis"` here for **hygiene + to make the TA-scoped delete/exists correct**, not because the detail read requires it. (The two TA-filtered reads — `institutionThemes.ts`, `publicationsList.ts` — are themselves NSCLC-hardcoded on the frontend and out of scope for this pass.)

---

## 1. Design (mirrors the Belief Profile parameterization)

- Add `--ta <slug>` (default `nsclc`) + `--scope {us,global}` (the US-only vs intl toggle for the review decision).
- A `TA_CONFIGS` registry keyed by slug. The `nsclc` entry reproduces the current strings/behavior; `atopic-dermatitis` supplies AD scoping + TA-neutral prompt fragments.
- Resolve `ta_id` from slug via `therapeutic_areas.slug` (same as `compute_top_collaborators.py`).
- Parameterize: the selection query (per-TA, per-cohort), the papers query (by `ta_id`), the written tag, the delete/exists (TA-scoped), the prompts (domain + exemplars), and the checkpoint path (per-TA).

### The US-only vs intl decision (for your review)
Controlled by `--scope`, which picks the AD selection query:

| `--scope` | AD selection | HCPs | Est. cost | Runtime |
|---|---|---|---|---|
| `us` (default for AD) | `hcp_established_ranks_v3` `scope_type='region' scope_value='US'` | **447** | **~$30** | ~45 min |
| `global` | `hcp_established_ranks_v3` `scope_type='global'` (all Established, incl. intl) | **~2,586** (confirm at run) | **~$150–180** | ~5 h |

Cost basis: `claude-sonnet-4-6`, 1 call/HCP, up to 30 papers (title+abstract) in the prompt, ~$0.06–0.10/HCP; sequential with a 1 s min interval. Coverage per HCP ≈ 10–12 themes extracted, top-6 get `display_rank` (≈6 shown) — comparable to the NSCLC Gate 15 density (10,640 rows / 1,064 HCPs ≈ 10/HCP). NSCLC's 82%-intl skew is why `global` is the more complete choice for AD, at 5× the cost.

---

## 2. Proposed diffs (against `scripts/classify/extract_research_themes.py`)

### 2a. Constants → per-TA registry
```diff
-CHECKPOINT_PATH = "extract_research_themes_checkpoint.json"
 MODEL = "claude-sonnet-4-6"
@@
-THERAPEUTIC_AREA = "NSCLC"
-
-SYSTEM_PROMPT = (
-    "You analyze NSCLC research output to identify thematic focus areas of individual "
-    "investigators. You return structured JSON only - no preamble, no explanation, "
-    "no markdown code fences."
-)
+# Per-TA config. The nsclc entry reproduces the original prompt text and NSCLC-Rising-US
+# selection verbatim (byte-identical rendered prompts, identical selected HCP set). Non-NSCLC
+# TAs supply their own cohort scoping, tag, and TA-neutral prompt fragments.
+SYSTEM_PROMPT_TEMPLATE = (
+    "You analyze {domain} research output to identify thematic focus areas of individual "
+    "investigators. You return structured JSON only - no preamble, no explanation, "
+    "no markdown code fences."
+)
+
+# Selection SQL is per-TA because the cohort differs (NSCLC=Rising-US, AD=Established).
+# All variants take a single %s = ta_id.
+TARGET_HCPS_SQL_NSCLC_RISING_US = """
+SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.us_rank
+FROM hcps_v2 h
+JOIN hcp_rising_star_ranks_v3 r ON r.hcp_id = h.id
+WHERE r.therapeutic_area_id = %s
+  AND h.country = 'US'
+  AND r.us_rank IS NOT NULL
+ORDER BY r.us_rank ASC
+"""
+
+TARGET_HCPS_SQL_ESTABLISHED_US = """
+SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.rank
+FROM hcps_v2 h
+JOIN hcp_established_ranks_v3 r ON r.hcp_id = h.id
+WHERE r.therapeutic_area_id = %s
+  AND r.scope_type = 'region' AND r.scope_value = 'US'
+ORDER BY r.rank ASC
+"""
+
+TARGET_HCPS_SQL_ESTABLISHED_GLOBAL = """
+SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.rank
+FROM hcps_v2 h
+JOIN hcp_established_ranks_v3 r ON r.hcp_id = h.id
+WHERE r.therapeutic_area_id = %s
+  AND r.scope_type = 'global'
+ORDER BY r.rank ASC
+"""
+
+TA_CONFIGS = {
+    "nsclc": {
+        "tag": "NSCLC",                 # therapeutic_area TEXT write value (unchanged)
+        "domain": "NSCLC",              # prompt framing (renders byte-identical)
+        "generic_negative": "'lung cancer'",
+        "theme_examples": "'EGFR-mutant resistance mechanisms' or "
+                          "'CNS-active TKIs for brain metastases'",
+        "selection": {"rising": TARGET_HCPS_SQL_NSCLC_RISING_US},
+        "default_scope": "rising",      # NSCLC keeps Rising-US (byte-for-byte)
+    },
+    "atopic-dermatitis": {
+        "tag": "Atopic Dermatitis",
+        "domain": "atopic dermatitis",
+        "generic_negative": "'atopic dermatitis'",
+        # TA-neutral: teaches "specific, not generic" without naming any drug/mechanism.
+        "theme_examples": "'a specific signaling-pathway focus' or "
+                          "'a defined patient-selection strategy'",
+        "selection": {"us": TARGET_HCPS_SQL_ESTABLISHED_US,
+                      "global": TARGET_HCPS_SQL_ESTABLISHED_GLOBAL},
+        "default_scope": "us",
+    },
+}
+DEFAULT_TA = "nsclc"
```

### 2b. Papers query → parameterize by ta_id (result-identical for NSCLC)
```diff
 PAPERS_SQL = """
 SELECT p.id, p.pubmed_id, p.title, p.abstract, p.pub_year,
        pa.is_first_author, pa.is_senior_author
 FROM publications_v2 p
 JOIN publication_authors_v2 pa ON pa.publication_id = p.id
 JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
-JOIN therapeutic_areas ta ON ta.id = pta.therapeutic_area_id
 WHERE pa.hcp_id = %s
-  AND ta.name = 'NSCLC'
+  AND pta.therapeutic_area_id = %s
   AND p.pub_year >= 2021
   AND (pa.is_first_author = true OR pa.is_senior_author = true)
   AND p.title IS NOT NULL
 ORDER BY p.pub_year DESC, p.pub_date DESC NULLS LAST
 LIMIT 30
 """
```
`fetch_papers(conn, hcp_id, ta_id)` executes with `(hcp_id, ta_id)`. For NSCLC, `ta_id` = the NSCLC ta_id → identical rows to `ta.name='NSCLC'`.

### 2c. TA-scope the delete / exists (the footgun fix)
```diff
 DELETE_THEMES_SQL = """
-DELETE FROM public.hcp_research_themes_v2 WHERE hcp_id = %s
+DELETE FROM public.hcp_research_themes_v2 WHERE hcp_id = %s AND therapeutic_area = %s
 """

 COUNT_THEMES_SQL = """
-SELECT COUNT(*) AS cnt FROM public.hcp_research_themes_v2 WHERE hcp_id = %s
+SELECT COUNT(*) AS cnt FROM public.hcp_research_themes_v2 WHERE hcp_id = %s AND therapeutic_area = %s
 """
```
`delete_themes(conn, hcp_id, tag)` and `themes_exist(conn, hcp_id, tag)` pass the tag. **NSCLC behavior is unchanged** — every NSCLC theme row already has `therapeutic_area='NSCLC'`, so scoping the delete/count to `'NSCLC'` is a no-op on NSCLC data; it only prevents an AD run from touching or being blocked by NSCLC rows.

### 2d. Write the parameterized tag
```diff
 def write_themes(conn, hcp_id, themes, extraction_run_id):
+    # tag comes from the resolved TA config
     rows = [
         (hcp_id, t["theme_name"], t["centrality"], t["paper_count"],
-         t.get("display_rank"), t["example_pmids"] or None, THERAPEUTIC_AREA, extraction_run_id)
+         t.get("display_rank"), t["example_pmids"] or None, tag, extraction_run_id)
         for t in themes
     ]
```
(`write_themes` gains a `tag` param.)

### 2e. Prompts — parameterize domain + exemplars (NSCLC renders byte-identical)
```diff
 def build_user_prompt(papers):
     publications_block = format_publications_block(papers)
     return (
-        "Below are the recent publications (last 5 years) of an NSCLC researcher. "
+        f"Below are the recent publications (last 5 years) of an {domain} researcher. "
         "They appear as either first author (executing the work) or senior author "
         "(directing the work).\n\n"
         "Identify 10-12 distinct research themes in their work. Themes should be SPECIFIC "
-        "scientific concepts - e.g., 'EGFR-mutant resistance mechanisms' or "
-        "'CNS-active TKIs for brain metastases' - NOT generic categories like 'lung cancer' "
-        "or 'clinical trials'.\n\n"
+        f"scientific concepts - e.g., {theme_examples} - NOT generic categories like "
+        f"{generic_negative} or 'clinical trials'.\n\n"
         ... (rest unchanged) ...
     )
```
`build_user_prompt(papers, domain, theme_examples, generic_negative)`. For `nsclc` (domain="NSCLC", the exact NSCLC exemplars, generic="'lung cancer'") the rendered prompt is **byte-identical** to today. `SYSTEM_PROMPT` is likewise built from `SYSTEM_PROMPT_TEMPLATE.format(domain=domain)` → byte-identical for NSCLC.

### 2f. CLI + main wiring
```diff
 def parse_args():
-    parser = argparse.ArgumentParser(description="Extract NSCLC research themes per HCP via Claude API.")
+    parser = argparse.ArgumentParser(description="Extract per-HCP research themes by TA via Claude API.")
+    parser.add_argument("--ta", choices=tuple(TA_CONFIGS.keys()), default=DEFAULT_TA,
+                        help="Therapeutic area slug (default: nsclc).")
+    parser.add_argument("--scope", choices=("us", "global"), default=None,
+                        help="AD/global-capable TAs: US-only vs all-region Established. "
+                             "Defaults to the TA config's default_scope.")
     parser.add_argument("--dry-run", ...)
     parser.add_argument("--force", ...)
     parser.add_argument("--limit", ...)
```
```diff
 def main():
     load_dotenv()
     args = parse_args()
+    ta = TA_CONFIGS[args.ta]
+    ta_id = resolve_ta_id(conn, args.ta)               # therapeutic_areas.slug -> id
+    scope = args.scope or ta["default_scope"]
+    target_sql = ta["selection"][scope]
+    tag, domain = ta["tag"], ta["domain"]
+    checkpoint_path = f"extract_research_themes_{args.ta}_{scope}_checkpoint.json"  # per-TA/scope
     ...
```
Thread `ta_id`/`target_sql`/`tag`/`domain`/`theme_examples`/`generic_negative` through `fetch_target_hcps`, `fetch_papers`, `themes_exist`, `delete_themes`, `write_themes`, `build_user_prompt`, and the system prompt. Replace the module-level `CHECKPOINT_PATH` with the per-TA `checkpoint_path` everywhere it's used (per-TA checkpoints so an AD run can't resume from an NSCLC checkpoint).

### 2g. (minor) dry-run cost projection
`main`'s dry-run projection hardcodes "full 4400 HCPs" ([lines ~693–702](scripts/classify/extract_research_themes.py:693)). Replace the `4400` denominator with the actual `total` loaded for the chosen `--ta`/`--scope`, so the projected-cost line is correct for AD (447 or ~2,586) instead of NSCLC's 4,400.

---

## 3. NSCLC regression-safety (byte-for-byte)

- **Prompts:** `nsclc` config reproduces the exact domain ("NSCLC"), exemplars, and negative ("'lung cancer'") → `SYSTEM_PROMPT` and the user prompt render **byte-identical**. (Verify the same way as the Belief Profile pipeline: a no-API prompt-render harness diffed before/after for `--ta nsclc`.)
- **Selection:** `nsclc` keeps `default_scope="rising"` → the Rising-US query; refactored from `ta.name='NSCLC'` to `r.therapeutic_area_id = <nsclc ta_id>`, which selects the **identical HCP set**.
- **Papers:** `pta.therapeutic_area_id = <nsclc ta_id>` = same rows as `ta.name='NSCLC'`.
- **Tag write:** unchanged (`"NSCLC"`).
- **Delete/exists:** gains `AND therapeutic_area='NSCLC'` — a no-op on NSCLC's single-TA data (all rows are `'NSCLC'`), so results are unchanged; it only makes multi-TA runs safe.
- **Default `--ta nsclc`** → a bare invocation behaves as today.

---

## 4. Suggested run sequence (when approved)
```bash
# 1) NSCLC byte-identity check (no API): render the nsclc prompt before/after, diff — expect empty.
# 2) AD dry-run (US), inspect prompt + sample themes, cost projection:
python scripts/classify/extract_research_themes.py --ta atopic-dermatitis --scope us --dry-run
# 3) AD real run — pick scope after reviewing the dry-run cost/coverage:
python scripts/classify/extract_research_themes.py --ta atopic-dermatitis --scope us      # ~$30, ~45m
#   or
python scripts/classify/extract_research_themes.py --ta atopic-dermatitis --scope global  # ~$150-180, ~5h
```
Note: the script also lacks `sys.stdout.reconfigure(encoding="utf-8")`, so on Windows its dry-run sample print will crash on Unicode names (same class as the collaborators script). Add the reconfigure lines, or run with `PYTHONIOENCODING=utf-8`.

---

## 5. Open decisions for you
1. **`--scope us` (~$30) vs `global` (~$150)** — the main call. US-only surfaces the 447 US Established; `global` covers all ~2,586 Established incl. intl (where 82% of AD KOLs are).
2. **Theme exemplars** — I defaulted to TA-neutral (per your "de-contaminate" instruction). If you'd rather give the model AD-specific anchors for richer themes (e.g. "'IL-13 pathway modulation' or 'skin-barrier repair strategies'"), that's a one-line change to the AD config's `theme_examples` — flagging the quality/neutrality tradeoff.
3. **Confirm the `global` count** — I cited ~2,586 from cohort_classification; the exact `scope_type='global'` distinct-HCP count in `hcp_established_ranks_v3` should be confirmed at run time (drives the real cost).
