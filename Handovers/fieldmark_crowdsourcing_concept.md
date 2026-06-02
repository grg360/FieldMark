# FieldMark Crowdsourcing — Concept Doc v0.1

**Version:** 0.1 (pre-MSL review)
**Date:** June 1, 2026
**Status:** Internal spec — not yet shown to MSLs or compliance reviewers
**Purpose:** Capture the v1 design for FieldMark's crowdsourced intelligence layer in enough detail to drive a clickable mockup, which is the artifact that will go to MSLs for "tear it apart" sessions.

---

## 1. Strategic framing

Crowdsourced MSL contributions are not a feature of FieldMark. They are the bedrock of the platform.

The data layer — publications, NIH grants, trials, NPPES, Open Payments, Telescope — is infrastructure. It exists to give MSLs something to react to, contribute about, and engage around. Without contributions flowing in, FieldMark is a better KOL database. With contributions flowing, FieldMark becomes the only source that knows what's actually happening in the field — and that's what every pharma medical affairs team is desperate for and has no good way to get.

The product is the network. The data is the bait.

**One reframe that shaped this doc:** the social layer is the bedrock; the HCP intelligence is the byproduct. MSLs are professionally isolated. They attend conferences, form opinions, hear things — and they have no peer group with which to discuss any of it. A topic-anchored MSL forum points the social-layer pull at the science (defensible) instead of at the HCPs (high-risk). The HCP intelligence emerges adjacent to the science conversation, not as the conversation.

---

## 2. Three contribution surfaces

FieldMark crowdsourcing v1 spans three distinct contribution surfaces, ordered by compliance difficulty.

### 2.1 Topic discussion (easiest)

**What it is:** Anonymous, verified, TA-anchored discussion among MSLs. NSCLC channel, Rare Disease channel, Hepatology channel. Possibly conference-anchored sub-channels later (ASCO 2026, AASLD).

**What MSLs do here:** Share takeaways from conferences. React to clinical developments. Discuss mechanisms of action, trial readouts, label changes, payer dynamics. Ask each other questions. Surface emerging science.

**What MSLs do NOT do here:** Discuss specific HCPs by name. Discuss commercial activity. Discuss competitive intelligence. The forum is for *science*, not *people* and not *deals*.

**Compliance posture:** Low risk. No HCP names. No coordination across companies on commercial activity. Functionally equivalent to a moderated professional discussion board, restricted to verified MSL identities.

**Identity model:** MSLs participate pseudonymously. Their company affiliation is verified but not visible to other users. They have a stable pseudonymous handle within the forum so reputation forms over time.

**Why this might be the most-engaged surface:** MSLs have nowhere else to do this. LinkedIn is too public and too commercial. Internal company channels are too narrow. Conference hallway conversations are too intermittent. A persistent, asynchronous, MSL-only forum pointed at therapeutic-area science is a genuine unmet need.

### 2.2 HCP validation (medium difficulty)

**What it is:** The contribution feature that already exists in a partial form ("Validate This Signal" on HCP detail screens). React to the platform's existing HCP intelligence with structured signals.

**What MSLs do here:** On any HCP profile, contribute structured ratings:
- Data Matches Field Reality: Confirms / Partial / Disputes
- Engagement Potential: High / Moderate / Low
- Scientific Credibility: Strong / Moderate / Early
- Momentum Trajectory: Rising / Stable / Declining
- (Possibly more dimensions added based on MSL feedback)

**What changes from the current build:** The current build treats validation as the only contribution path, which is too thin. In v1, validation becomes one of three paths and gets repositioned accordingly.

**Compliance posture:** Medium risk. Structured fields only — no free text. Individual contributions are not visible to other users. Only aggregated counts are surfaced ("12 MSLs have confirmed; 2 partial; 0 dispute"). Aggregation thresholds prevent re-identification (e.g., don't show counts under 3 MSLs).

**Identity model:** Contributions are anonymized at the contribution layer. Aggregation surfaces show counts only, no attribution.

**Defamation defense:** Structured fields with finite options; no free text; aggregation thresholds; HCP opt-out and profile claiming available.

### 2.3 HCP surfacing and contextualization (hardest)

**What it is:** The contribution path where MSLs add information the platform doesn't have — either by surfacing HCPs the platform doesn't know exist, or by adding MSL-specific context to known HCPs.

**Two sub-flows:**

**(a) Surface a new HCP.** MSL submits a structured contribution: name, institution, therapeutic area, specialty, what makes this person worth tracking. Backend creates a pending HCP record. After N MSLs from M distinct companies submit the same person, the record is promoted to the public database.

**(b) Contextualize a known HCP.** MSL adds structured context to an HCP that already exists in the database:
- Sub-specialty depth (specific NSCLC subtype, specific rare disease, etc.)
- Engagement style preference (advisory board / scientific exchange / didactic / hybrid)
- Referral network signal (community-leadership / academic-connector / silo'd)
- Communication preference (email / in-person / virtual)
- Other structured fields TBD based on MSL session feedback

**What MSLs do NOT do here:** No free-text commentary. No commercial information (no payment data, no contracting info). No engagement-outcome reporting ("the rep visit went well") — that's CRM territory and crosses the line into commercial coordination.

**Compliance posture:** High risk. Sharpest defamation surface, sharpest FCPA/Anti-kickback exposure, sharpest privacy exposure. Walled gardens probably required by default — each customer's MSLs see only their own company's contextualization. Cross-company sharing is opt-in at the company level with explicit data-sharing agreements.

**Identity model:** Within the customer company, contributions may be attributed (your MSL team sees who on the team added what). Cross-company aggregation, if enabled at the company level, is anonymized.

**Why this is still worth building despite the risk:** This is where the actual platform value lives. Validate-only is too thin. Topic discussion alone is engaging but doesn't compound into a data product. Surfacing and contextualization is what turns the network into a moat — pharma databases can copy our data, they cannot copy a population of MSLs adding field-grade intelligence on a population of HCPs.

---

## 3. MSL value proposition

The MSL has to want to contribute. The platform's design must answer "what does the MSL get?"

The honest list:

**3.1 A peer group.** Most MSLs are functionally siloed. The topic forum gives them a verified, anonymous, professionally-relevant community that does not exist anywhere else. This is the strongest pull and the reason the topic forum is positioned first.

**3.2 Better intelligence on HCPs they're trying to engage.** Contributions unlock visibility into aggregated peer signals. An MSL preparing for an HCP engagement can see "this HCP has been validated by 8 MSLs as scientifically strong; 12 have rated engagement potential as high." Even within a single company's walled garden, this is more aggregated peer signal than the MSL has access to today.

**3.3 Career mobility signal.** A verified record of contributions across MSL roles is a portable professional asset. Over years, an MSL accumulates a reputation footprint in their TA — anonymized externally, transparent to them. (This is a v2+ concept but worth surfacing now because it materially changes the long-term incentive structure.)

**3.4 The satisfaction of being heard.** Most MSL field intelligence currently dies in CRM systems or internal slack channels. Contributing to a platform that propagates the signal beyond their immediate team is intrinsically rewarding. This is real but never enough on its own.

---

## 4. Compliance posture (v1 working draft)

Compliance review has not yet happened. This is the *working* posture to take into MSL sessions and compliance conversations.

**4.1 Identity verification.** LinkedIn OAuth confirms MSL/field medical role. Verified, then displayed pseudonymously to other users. Verification is the gate to participation; pseudonymity is the gate to honest contribution.

**4.2 No free text.** Every contribution surface uses structured fields. Free-text is the single biggest defamation risk and is forbidden in v1.

**4.3 No commercial information.** Contributions never include payment data, contracting status, engagement-outcome reports, or anything that resembles commercial coordination across companies.

**4.4 No HCP-specific commentary in the topic forum.** The topic forum is for science. HCP-related contributions happen exclusively in the validation and contextualization surfaces, where structured fields control the contribution surface.

**4.5 Aggregation thresholds.** No counts are displayed below a minimum threshold (e.g., 3 MSLs from 2+ distinct companies). This prevents single-contributor or single-company signals from being reconstructed as a coordinated statement.

**4.6 Walled gardens by default for contextualization.** Cross-company sharing of HCP contextualization data is opt-in at the company level. Validation and topic discussion may be more permissive (aggregated cross-company), but contextualization (which is sharper and more defamation-exposed) is locked down by default.

**4.7 HCP opt-out and profile claiming.** Any HCP can opt their profile out of the public-facing platform. Any HCP can claim their profile and request review of aggregated signals. These mechanics are baked in from day one, not bolted on after a customer complaint.

**4.8 No retroactive ratings of past engagements.** MSLs do not rate engagements that have happened. They contribute *forward-looking* assessments and *structural* attributes (sub-specialty depth, referral network position). The line between "data about an HCP" and "report card on a past interaction" is bright and policed.

---

## 5. MVP scope (what gets built first)

**MVP includes:**
- LinkedIn OAuth verification with TA + role capture
- One topic discussion channel per TA (NSCLC, Rare Disease, Hepatology), pseudonymous, structured-but-flexible posts
- The current Validate This Signal surface, strengthened (more dimensions, aggregation threshold logic, "12 MSLs confirmed" display)
- "Surface a new HCP" form (structured fields, pending-record workflow)
- Walled-garden "Contextualize this HCP" form (visible only to your company's MSLs in v1)
- HCP opt-out request flow
- HCP profile claim flow (basic — full identity verification deferred)

**MVP excludes:**
- Cross-company contextualization sharing (defer to v1.1+)
- Career mobility signal / MSL profile pages (defer to v2)
- Conference-anchored topic sub-channels (defer to v1.1+)
- Native mobile (web-mobile-responsive only)
- Direct-message between MSLs (probably never)

---

## 6. Mockup priorities for first MSL session

The clickable mockup needs to enable an MSL to react to the *intent* and the *shape*, not to debug pixel decisions. Priority surfaces for the mockup:

**(1) Topic forum landing page.** Three TA channels. A few mocked posts in NSCLC channel that look real — ASCO takeaway, mechanism-of-action question, payer-dynamics observation. Pseudonymous handles. Anonymous post-count visible.

**(2) Topic forum post detail.** Click into one post. Mocked replies. The MSL should be able to see what a thread looks like and react to its tone, length, structure.

**(3) HCP profile with all three contribution surfaces visible.** The existing HCP detail screen with three new entry points:
- "Validate this signal" (existing, strengthened)
- "Add context" (walled-garden contextualization)
- A "Surface a new HCP" button accessible from somewhere obvious in the global nav

**(4) "Surface a new HCP" form.** Structured fields. Submit goes to a "thanks, we'll review" confirmation. No actual persistence.

**(5) "Add context" form.** Structured fields for sub-specialty, engagement preference, referral position. Walled-garden indicator visible ("Visible to your company's MSL team only"). Submit goes to confirmation.

**(6) Opt-out request flow.** From a public HCP profile, a small "Are you Dr. X?" link in the footer that opens an opt-out request form. Mocked end-to-end.

What the mockup does NOT need:
- Real authentication
- Real persistence
- Working aggregation logic
- Mobile-specific layouts
- Validation logic on form fields

---

## 7. First MSL session protocol

**Format:** 1:1, 45-60 minutes, screen-share.
**Setting:** Quiet, no distractions, recording explicitly disclosed and offered (some MSLs will decline being recorded — that's fine).
**Opening:** "I'm building something for field medical teams. I'd love to walk you through what I have and have you tear it apart. There's nothing precious here — your honest reaction is the entire reason for this call."

**Walkthrough order:**
1. Topic forum first (lowest stakes, warms up the conversation)
2. HCP profile and validation (familiar territory)
3. "Surface" and "Contextualize" forms (the harder asks)
4. Opt-out flow (compliance check)

**Listen for:**
- Where they say "I would never do this" or "my compliance officer would kill this"
- Where they say "this is what I'd actually want" — usually unprompted
- Where they pause and don't say anything — that's often the hardest signal but the most important
- Specific MSL workflows that the mockup doesn't accommodate — these are the gaps to spec

**Avoid:**
- Defending the design
- Explaining what something "will eventually do"
- Selling

**Output of the session:** A 1-page rewrite of this doc with their reactions incorporated. Then do it again with a second MSL.

---

## 8. Open questions for the MSL session

These are the questions whose answers should come from MSLs, not from the platform team:

1. Is pseudonymity sufficient, or do MSLs want full anonymity? Or full attribution within the customer company?
2. What structured fields are missing from the contextualization form?
3. Is the "Surface a new HCP" promotion threshold (N MSLs from M companies) the right shape, or is a simpler threshold better?
4. How frequently would an MSL realistically contribute? Daily? Weekly? Quarterly? (This shapes whether the design rewards depth-per-contribution or volume-per-contribution.)
5. Would the MSL community tolerate a "Contributing is the price of seeing aggregated signals" model? Or does that feel coercive?
6. What's the right balance between the topic forum being moderated (employee-curated) vs unmoderated (community-governed)?
7. Where are the compliance officers actually going to push back? (The MSL knows their compliance officer better than we do.)

---

## 9. What this doc is not

This doc is not a product spec. It is not compliance-cleared. It is not customer-validated. It is the v0.1 working hypothesis that drives the mockup that drives the MSL session that drives the v1 product spec.

The mockup is the artifact. This doc is the seed.
