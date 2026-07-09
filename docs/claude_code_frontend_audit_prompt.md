# Claude Code — Frontend Audit Prompt (paste into Claude Code in the FieldMark repo)

You are auditing the FieldMark frontend to scope a specific task: making the app support a **new therapeutic area (Atopic Dermatitis)** alongside the existing ones (NSCLC, Hepatology), and repointing the cohort views to new backend tables. Do NOT change any code in this pass — this is a read-only audit. Produce a structured summary I can hand to a strategy session.

## Context you need
- The app shows HCP cohorts per therapeutic area: **Established, Rising Stars, Community**, plus Social / Telescope / Field Intelligence tabs. Nav is TA-scoped (e.g. Oncology → NSCLC).
- New backend tables exist for Atopic Dermatitis (ta_id `9e4139d2-e062-4a58-8728-cdabb2d7dca1`):
  - Established → `hcp_established_ranks_v3`
  - Rising → `hcp_rising_composite_v1` (2-axis: Emergence + Network) and `hcp_scientific_emergence_v1` (emergence detail)
  - Community → `community_practitioners` + `community_practitioner_payments` (new operational tables)
- IMPORTANT: the current Rising view likely renders an OLD **2×2 momentum model** (Scientific Momentum / Network Momentum / Scientific Visibility / Network Visibility). The new AD model is **2-axis (Emergence + Network)** — this needs real rework, not just a table swap.

## Produce this summary (be specific, cite file paths + line ranges)

### 1. Architecture map
- The component/routing tree for the cohort surfaces (which files render Established / Rising / Community).
- Are cohort pages **parameterized** (one component driven by props/config) or **separate components per cohort**? This determines if adding AD is config or code.
- How is TA selection implemented (the Oncology→NSCLC nav)? Is the TA list **data-driven** (from a config/table) or **hardcoded**? What would adding "Atopic Dermatitis" as a selectable TA require?

### 2. Data layer
- How does the frontend read Supabase — direct client calls, a hooks/services layer, React Query, or something else? Where does that live?
- List **every file + line** that references the current cohort tables (search for: `hcp_established_ranks`, `rising_star`, `hcp_community`, and any `.from("...")` Supabase table references). This is the repoint surface.
- Is there a **1000-row PostgREST pagination** pattern already in use, or do queries assume <1000 rows? (Known recurring issue.)

### 3. The Rising 2×2 → 2-axis rework
- Find where the Rising card/detail renders the momentum/visibility 2×2. File + component + line range.
- What data shape does it currently expect? What would it take to render **Emergence + Network** (2-axis) instead? Scope this specifically — it's the one non-trivial change.

### 4. Cohort card anatomy
- The Established card component (the score, #rank, Scientific/Network/Pharma chips, narrative, badges). File + structure. This is the template the AD versions will mirror.

### 5. Lift estimate
Given the above, classify the AD repoint as one of:
- **Small** (parameterized components + central data layer + config-driven TA nav → mostly config/table-name changes)
- **Medium** (some hardcoding, the 2×2→2-axis rework, moderate touchpoints)
- **Large** (per-TA/per-cohort hardcoding, many touchpoints, display logic entangled)
Justify the classification with the specific findings.

### 6. Risks / surprises
Anything that would complicate the AD repoint: entangled TA assumptions, hardcoded NSCLC references, shared components with cohort-specific logic baked in, auth/RLS on the new tables, etc.

## Output format
A single markdown summary, structured by the sections above, with file paths and line ranges. Keep it tight enough to paste into a chat (aim for a few hundred lines, not a full code dump). Where a file is thousands of lines, summarize its relevant structure rather than reproducing it.
