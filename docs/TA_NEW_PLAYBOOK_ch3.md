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
