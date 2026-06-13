# FieldMark Demo Runbook

> Purpose: Choreograph the live demo for each mentor. Captures click paths, talking points, and mentor-specific variations. The demo seed script is built against this runbook — what data needs to exist is determined by what we demo.

---

## Demo Principles

- **Live, not recorded.** Always screen-share. Drive yourself. Never let mentors "play with it on their own."
- **Lead with the moat.** Scientific Narrative is the first thing they see. Not the landing page, not the cohort tabs. The narrative.
- **Provenance is the close.** End every theme conversation with a DOI click. The verifiable source is what makes this feel different from every other AI feature they've seen.
- **Domain expertise on every screen.** Use real names (Heymach, Singh, Welsh) not lorem ipsum. Use real papers. Real journals. Real DOIs.
- **One question per mentor.** Know in advance what you want each mentor to validate or challenge.

---

## The Core Demo (15-20 minutes, every mentor)

### Opening (2 min)
- Start at `/me` — show the personalized workspace
- Talking point: "This is what an MSL sees on Monday morning. Their territory, their tracked HCPs, their open actions, coverage gaps in their region."
- Don't dwell here. The home page is context, not the product.

### The HCP profile (3-4 min)
- Click into John V. Heymach (UUID `2302d82f-c44a-498e-b0ab-6ca39a3f8964`)
- Let the page load — don't narrate the wait
- **First thing they see should be Scientific Narrative.** That's the headline above Research Themes.
- Talking point: "This is a synthesized analyst note. It was generated from 49 scientific positions extracted from his senior or first-authored NSCLC publications."

### The narrative breakdown (3-4 min)
- Read the headline aloud: "A clinician-scientist whose published record spans perioperative immunotherapy, radioimmunotherapy combinations, and mechanistic resistance reversal in oncogene-driven NSCLC..."
- Talking point: "Notice the language. It's analyst voice, not marketing voice. The synthesis is grounded in actual positions he's taken in published work."
- Point at the corpus depth badge (Deep Corpus)
- Talking point: "10 papers, 49 positions. That gives us enough signal to characterize a worldview. For a Rising Star with 2 papers we tell you that explicitly — we don't pretend a worldview is there."

### The evidence drawer (the moat moment, 4-5 min)
- Click "Resistance Reversal Strategies" theme card
- Drawer slides in from the right
- Talking point: "This is the entire game. The theme isn't a black box. Every supporting position traces back to a specific paper, with the exact quote from the abstract, the DOI, and the PubMed link."
- Read one paper aloud: "Cancer Cell 2023, Senior Author. The MCT4-dependent lactate secretion paper. Here's the position Heymach took. Here's the verbatim line from the abstract that supports it."
- **The click that matters:** Click the DOI link. Land on the Cancer Cell page. Pause for 3 seconds. Let them see it.
- Talking point: "An MSL can verify any claim in three seconds. No black-box AI. No 'trust us.' The provenance chain is the moat."

### Drill-down (2-3 min)
- Close the drawer. Scroll to the footer of the Scientific Narrative section.
- Click "10 papers" — lands on the Publications drill-down view
- Talking point: "This is every senior or first-authored NSCLC paper backing his synthesis. Sorted by citation impact."
- Back to profile. Click "49 positions" — lands on the Positions drill-down.
- Show the polarity filter pills: Positive 16, Cautionary 7, Unmet Need 11, Hypothesis 15
- Talking point: "Two-thirds of his positions are not positive — they're cautions, unmet needs, or hypotheses. This is a translational scientist, not just a trialist. That distribution alone tells you something about how to engage him."

### Close (1-2 min)
- Back to the HCP profile
- Talking point: "Everything you just saw exists for 181 NSCLC investigators today. Top 100 US Rising Stars, top 100 US Established. We're extending to hepatology, rare disease, and immunology over the next quarter."
- Pause. Let them ask.

---

## Mentor-Specific Variations

### For the Medical Affairs advisor
- They've seen iterations before. They want to see what changed since last time.
- Lead with: "You said provenance is the moat. Watch this." Then go straight to the drawer + DOI click.
- Skip the home page intro. They know the workspace.
- Emphasize: the 181-HCP backfill, the supporting paper count, the corpus depth distinction
- Their likely question: "How do you handle HCPs whose senior-authored work doesn't exist yet?" → Answer with the signal_moment framing on Singh
- Have ready: a signal_moment HCP example pulled up in a second tab

### For the life sciences database sales advisor
- They've never seen Scientific Narrative. Lead with the moat moment fully.
- Talking point at the close: "Veeva, H1, IQVIA — none of them surface position-level intelligence. Every product in the category sells access to KOL lists. We sell scientific positioning derived from those KOLs' actual published work."
- Their likely question: "Who's your buyer and what's the price point?" → Discuss Founding 100 framing
- Have ready: the competitive landscape framing (Veeva Link, H1, IQVIA, Within3, Indegene)

### For [other mentors as scheduled]
- [Add mentor-specific notes here as demos get scheduled]
- Always pre-write what you want them to walk away saying

---

## Demo Variations by Therapeutic Area Focus

### Thoracic oncology MSL background
- Lead HCP: John V. Heymach (MD Anderson)
- Secondary: Aditi P. Singh (UPenn) for Rising Star comparison
- Themes to surface: Perioperative immunotherapy, KRAS, EGFR resistance
- Have ready: AEGEAN, MATTERHORN, HUDSON references

### Broader oncology MSL background
- Lead HCP: Pasi A. Jänne or Mark M. Awad (Dana-Farber)
- Themes to surface: Combination strategies, biomarker selection
- Pivot point: "Notice how the synthesis adapts to each investigator's research focus"

### Hepatology MSL background
- Acknowledge upfront: hepatology Scientific Positions not yet extracted
- Lean on: Established cohort scoring (already exists for hepatology HCPs)
- Lead HCPs: Loomby, Sanyal, Kowdley
- Talking point: "Same scoring framework, same methodology, Scientific Narrative coming Q2."

---

## Anticipated Mentor Questions + Prepared Answers

### "How is this different from Veeva Link?"
- Veeva surfaces who matters and where they're networked. We surface what they believe and what they're saying.
- Veeva is a directory. FieldMark is an analyst.
- The provenance chain is the differentiator they can't replicate without rebuilding the data model.

### "How do you validate the AI doesn't hallucinate?"
- Two-layer extraction: positions are tagged with specific publication IDs at extraction time, syntheses can only reference positions that exist
- Every claim has a `representative_position_ids` array linking back to actual database rows
- The drawer is the validation tool. Click any theme, read the evidence excerpt, verify against the DOI.
- We never let the model invent positions. We let the model synthesize themes from positions we've already extracted with explicit citation.

### "What about HCPs not in the senior-author pool?"
- 11 of 100 Rising Stars had zero senior or first-authored papers — they're filtered out of Scientific Narrative
- The methodology is intentionally conservative. Middle-author papers represent institutional contribution, not individual positioning.
- For thin-corpus HCPs, the "Emerging Signal" framing honors recent footprint without overclaiming worldview.

### "What's your data source for publications?"
- PubMed for publication metadata
- OpenAlex for citation counts and author metrics
- ClinicalTrials.gov for trial investigator data
- NPPES for practitioner identification
- CMS Open Payments for pharma engagement
- All public, all citable, all updated weekly via automated pipeline.

### "How much does this cost?"
- Defer detailed pricing — Founding 100 program in development
- Frame: "We're working out pricing with our first MSL teams. Discounted upfront pricing for early adopters, not a free trial — we want committed users from day one."
- Defer to follow-up conversation if they press

### "What therapeutic areas do you cover?"
- NSCLC fully built (181 HCPs with Scientific Narrative)
- Hepatology, rare disease, immunology have cohort scoring but Scientific Positions coming Q2
- Roadmap is therapeutic-area expansion driven by customer demand

### "Can my team use this today?"
- Soft yes: invite-only access for Founding 100
- Conditioned on: NDA + commercial agreement + employment agreement clearance on our side
- Always defer commercial commitment to follow-up — never close in the demo itself

---

## What to NOT Demo

- Anything still buggy or half-built
- The HCP detail page sections we haven't audited yet (they may still have the headerless treatment)
- Field Intelligence (not ready)
- Anything that requires explanation longer than 30 seconds — if it can't be self-evident, it's not ready for mentors
- The `[DetailScreen diagnostic]` console logs (close dev tools before demo)

---

## Pre-Demo Checklist

- [ ] Test user logged in with realistic seeded data
- [ ] Browser cache cleared, fresh tab
- [ ] Dev tools closed
- [ ] Backend deployed to production (Cloudflare green checkmark)
- [ ] Synthesis backfill complete for demo HCPs (verify with `SELECT COUNT FROM hcp_ai_overviews WHERE synthesis_type = 'scientific_positions';`)
- [ ] Test the exact click path once before the demo starts
- [ ] Have the SQL `psql` console open in a second tab for impromptu queries if mentor asks "show me X"
- [ ] Have the demo runbook open on a second screen, not on the screen being shared
- [ ] Time-box: 20 min demo + 10 min Q&A. Cut things short before they cut you short.

---

## Post-Demo Capture

After each demo, write down within 30 minutes:
- What they reacted to most strongly
- What confused them
- What they asked that you didn't anticipate
- Specific feedback on the synthesis quality (did the headline land? did the themes feel accurate?)
- Whether they explicitly asked about pricing or commercial terms (= buying signal)
- Whether they offered to make introductions (= advocate signal)

---

## Open Questions to Resolve Before First Mentor Demo

- [ ] What's the demo user account? `GG / Garrett Reeves` or a fresh persona?
- [ ] Should the home page show a Northeast NSCLC territory or a different one?
- [ ] What watchlists should be pre-populated?
- [ ] How many follow-ups should be in the seed data? Real-feeling or empty?
- [ ] Are there any HCPs whose synthesis is weak enough that we should NOT navigate to them?
- [ ] Is the AI Synthesis on Coverage Gaps still showing? Should it be replaced/removed before demos?

