=== CURSOR PROMPT ===

Code only. Don't execute. STOP if ambiguous.

CONTEXT
Build a clickable mockup of FieldMark's Field Intelligence feature — the platform's contribution layer where verified MSLs participate in three ways:
1. Topic forum (TA-anchored anonymous discussion among MSLs)
2. HCP validation (structured ratings on existing HCP profiles)
3. HCP surfacing and contextualization (add new HCPs to the platform; add structured context to known HCPs)

The mockup is for showing to prospective MSL users in 45-60 min sessions where the goal is honest pushback. It does not persist data, does not authenticate, does not validate forms. Everything is visual and click-through-able.

KEY PRINCIPLES (read carefully — these differ from earlier drafts)

1. The feature is called "Field Intelligence" everywhere — in the global nav, on HCP profile sections, on contribution forms. ONE consistent name.

2. There is NO concept of "company team" or "walled gardens." Individual MSLs contribute as individuals. Only AGGREGATE signals (above a minimum threshold) are visible to other users.

3. The platform is free at launch. No "customer company" framing. Individual MSLs sign up via LinkedIn OAuth and participate as individuals.

4. Free text is FORBIDDEN everywhere. All contribution surfaces use structured fields only — chips, dropdowns, multi-select, single-select. This is a hard product constraint for compliance/defamation reasons, not a styling preference.

Design language must match the existing FieldMark application (dark theme, cohort colors gold/white-hot/purple, off-white text, subtle borders, font-family system-ui or inherit from existing app). All new components should look like they belong in the existing app.

FILES TO CREATE
- frontend/src/components/FieldIntelligence.tsx (top-level Field Intelligence destination — the forum landing)
- frontend/src/components/FieldIntelligenceThread.tsx (single thread detail page)
- frontend/src/components/SurfaceHCPForm.tsx (form to surface a new HCP)
- frontend/src/components/ContextualizeHCPForm.tsx (form to add structured context)
- frontend/src/components/OptOutRequestForm.tsx (HCP opt-out request)
- frontend/src/data/mockFieldIntelligencePosts.ts (mock posts with realistic TA-anchored content)

FILES TO MODIFY
- frontend/src/App.tsx (add Field Intelligence top-level nav, route to FieldIntelligence component, link Surface HCP button to global nav)
- The existing HCP DetailScreen component (rename validation section to "FIELD INTELLIGENCE", add new contribution paths, add aggregated counts with threshold logic, add opt-out footer link)

DESIGN CONSTRAINTS

Visual style:
- Dark background rgba(13, 13, 16, X) where X varies
- Text colors: rgba(232, 230, 223, 1.0) primary, rgba(232, 230, 223, 0.7) secondary, rgba(232, 230, 223, 0.5) tertiary
- Border colors: rgba(255, 255, 255, 0.08-0.12)
- For Field-Intelligence-specific accents (distinct from cohort palette gold/white-hot/purple), use rgba(120, 200, 255, X) — a cool blue
- Pseudonymous handle indicator: small circular avatar with first letter; mock-generate a stable hash-color from the handle string so same handle = same color
- "MSL Verified" indicator: small lock icon + "MSL Verified" text in muted color (cool blue at 0.7)

COMPONENT SPECIFICATIONS

1. App.tsx modifications — Field Intelligence in global nav

The current app has TA tabs (Oncology, Hepatology, Rare Disease, Immunology) at the top. Add "Field Intelligence" as a sibling tab to those — same visual treatment, same selectable position. When the Field Intelligence tab is active, hide the TA-specific content (cohort views, Telescope, etc.) and render <FieldIntelligence />.

Also add a small "+ Surface HCP" button to the global nav area (somewhere consistently visible — header right side, or near user profile area). Clicking it opens SurfaceHCPForm as a modal overlay.

2. FieldIntelligence.tsx — Forum landing page

Layout:
- Top section: page header "Field Intelligence" with a subtle subtitle "MSL-verified community — anonymous to peers, verified by FieldMark"
- Three large TA channel tiles: NSCLC, Rare Disease, Hepatology, Immunology (one for each TA)
  - Each tile: TA name (bold, 14px), short description ("Discussion among MSLs covering [TA]"), number of active discussions ("12 active threads"), last activity ("Last post: 2 hours ago")
  - Tile background: rgba(255, 255, 255, 0.03) with subtle border, hover state slightly brighter
- Below tiles: "Recent Activity" section showing 5-7 most-recent posts across all TAs
  - Each entry shows: pseudonymous handle + colored avatar + "MSL Verified" lock icon, post title, TA tag (colored pill), 1-2 line snippet, reply count, relative timestamp
  - Clicking a post takes user to FieldIntelligenceThread
- Below recent activity: a subtle banner: "Topic discussion only — no HCP names in posts. Use HCP profiles for HCP-specific contributions."

3. FieldIntelligenceThread.tsx — Single thread view

Layout:
- Header: thread title, TA tag, original poster's pseudonymous handle + avatar, "MSL Verified" indicator, timestamp
- Body: the original post (a few paragraphs of mocked technical content)
- Replies section: 3-5 mocked replies in chronological order
  - Each reply: handle + avatar, body, timestamp
- At bottom: "Reply" button → opens an inline structured response area
  - Reply form: a textarea-styled element (BUT placeholder text says "Structured reply format coming soon — for now, post a structured observation")
  - For mockup purposes, the reply form can accept text input visually, but submission just dismisses with a "Reply posted" toast — no persistence
  - (Note: in production, replies would also use structured fields only. For the mockup, this is the one place where free-text-like input is shown, to be honest about where that tension exists)

4. SurfaceHCPForm.tsx — Surface a new HCP

Opens as a modal overlay when global "+ Surface HCP" is clicked.

Title: "Surface a new HCP"
Subtitle: "Help FieldMark discover an HCP whose importance isn't yet reflected in our data."

Structured fields (NO free text fields):
- First name (text input — note: this is identifying data, not commentary, so text input is acceptable)
- Last name (text input)
- Institution (text input with mock autocomplete suggesting existing institutions)
- Therapeutic area (dropdown: NSCLC, Rare Disease, Hepatology, Immunology, Other)
- Specialty (text input)
- What makes this person worth tracking? (single-select chips, choose one):
  - "Influential in regional/community network"
  - "Sub-specialty depth not reflected in publications"
  - "Rising trainee or junior faculty"
  - "Active in clinical trials but low-visibility"
  - "Emerging speaker or educator"

Bottom of form, subtle disclaimer text: "Submissions are reviewed before publishing. Multiple independent submissions strengthen the signal — when 3+ MSLs surface the same HCP, the record is added to the public database."

Submit button: "Submit for review" → shows confirmation toast "Thanks — we'll review and add this HCP to the platform when confirmed", then dismisses the form

5. ContextualizeHCPForm.tsx — Add context for a known HCP

Opens from an HCP detail screen via "Add context" button.

Title: "Add context for Dr. [HCP NAME]"

IMPORTANT: NO "visible to your company's team" indicator. NO walled-garden language. Replace any team-visibility framing with a simple privacy note at the top:

Privacy note (small, cool-blue text at top): "Your contribution is private to you. FieldMark surfaces only aggregated signals (when 3+ MSLs contribute the same field) on the public HCP profile."

Structured fields (all chip-based, NO free text):
- Sub-specialty depth (multi-select chips) — mock with TA-relevant options. For NSCLC HCPs show: "EGFR-mutant", "ALK / ROS1", "KRAS G12C", "Immunotherapy-naive", "Squamous", "Stage IV first-line", "Adjuvant", "Neoadjuvant"
- Engagement style preference (single-select chips): "Advisory board", "1:1 scientific exchange", "Didactic presentation", "Hybrid / context-dependent"
- Referral network position (single-select chips): "Community leader (drives referrals into network)", "Academic connector (cross-institutional)", "Silo'd practice (limited cross-referral)", "Insufficient signal"
- Communication preference (multi-select chips): "Email", "In-person", "Virtual / video", "Conference"

Submit button: "Save context" → confirmation toast "Saved. Your contribution will appear in aggregate when 3+ MSLs contribute similar context."

6. OptOutRequestForm.tsx — HCP opt-out

Opens from a small footer link on HCP detail screens: "Are you Dr. [name]? Request opt-out or claim your profile"

Layout: Two cards side-by-side:

Card 1: "Request opt-out"
- Description: "Remove my profile from the public-facing FieldMark platform"
- Behind it, a structured form:
  - Name (text)
  - Email (text)
  - ORCID (text, optional)
  - Confirmation checkbox: "I am the HCP named above, or their authorized representative"
- Submit: "Submit opt-out request"

Card 2: "Claim my profile"
- Description: "Verify my identity and gain visibility into how I appear on FieldMark"
- Behind it, a similar structured form

Either submission → confirmation toast "Request received — we'll respond within 5 business days"

7. mockFieldIntelligencePosts.ts — Mock data

Create 12-15 realistic posts across NSCLC, Rare Disease, Hepatology, Immunology channels.

Each post: { id, channel (NSCLC/RareDisease/Hepatology/Immunology), handle, avatarColor, title, body, timestamp, replyCount, replies[] }

Content should be plausibly real MSL-grade scientific discussion. NOT lorem ipsum. NOT marketing voice. Genuine peer-discussion tone.

Examples of plausible content:
- NSCLC: "ASCO 2026 takeaway — the [combination regimen] subgroup analysis. Anyone else surprised by the biomarker signal in the squamous arm?"
- NSCLC: "Trying to make sense of the recent KRAS G12C resistance pattern in the post-progression cohort. What's the field's read?"
- Rare Disease: "Newborn screening expansion for [condition] — how is your team thinking about engagement strategy with pediatric specialists at non-academic centers?"
- Rare Disease: "Anyone tracking the new gene therapy delivery mechanism? Curious if community sites are getting comfortable with it."
- Hepatology: "AASLD preview — the MASH biomarker validation work looked promising. Clinical implications still feel uncertain to me."
- Hepatology: "PBC second-line landscape getting interesting. Where is everyone seeing patient flow vs prescriber adoption?"
- Immunology: "JAK inhibitor safety signal discussion — how is your TA team handling the cardiovascular conversation with prescribers?"

Use anonymized or fictional drug references rather than real branded names. Replies should feel like authentic peer discussion — short, technical, sometimes asking back-questions, sometimes contributing data points or observations.

HCP DETAIL SCREEN MODIFICATIONS

In the existing HCP DetailScreen component:

1. Locate the existing "VALIDATE THIS SIGNAL" section header
2. Rename it to "FIELD INTELLIGENCE"
3. Above the existing validation buttons, add an aggregated display:
   - If aggregate count >= 3: "[N] MSLs have contributed to this profile" in muted cool-blue
   - If aggregate count < 3: "Field Intelligence pending — be among the first to contribute" in muted text
   - Mock the count per HCP (varies by HCP — some have 12, some have 0)
4. Keep the existing validation buttons (Confirms / Partial / Disputes, etc.) — they're part of Field Intelligence
5. Below the validation buttons, add two new buttons styled to match:
   - "Add context" → opens ContextualizeHCPForm
   - "Report data issue" → opens a simple stub form (just structured fields: "Issue type: incorrect institution / wrong specialty / outdated info / other" + "Notes" multi-select chips, no free text; submission gives confirmation toast)
6. In the footer of the detail screen, add the small text link: "Are you Dr. [name]? Request opt-out or claim your profile" → opens OptOutRequestForm

BEHAVIORAL DETAILS

- No real backend calls anywhere
- All submit actions show a confirmation toast and dismiss the form
- Toasts: match any existing toast pattern in the app, or use a simple inline fade-in if none exists (3-second auto-dismiss)
- Forms do NOT validate (no required-field errors) — the mockup is for visual shape, not validation logic
- Pseudonymous avatars: generate a stable hash-color from the handle string so the same handle always gets the same color
- Timestamps in posts: use relative format ("2 hours ago", "yesterday", "3 days ago")
- All Field Intelligence surfaces should feel like a natural extension of the existing app — same fonts, same spacing patterns, same component styles

ABSOLUTE CONSTRAINTS

- Do NOT modify Telescope, HCPCard, TrackSwitch, TrackContext, or any existing chart/visualization components
- Do NOT add real authentication or persistence
- Do NOT change the existing TA filter, cohort filter, or score display logic
- Do NOT add free-text fields in contribution forms (hard product constraint)
- Do NOT use "Crowdsourcing" or "Community Intelligence" anywhere — the feature is "Field Intelligence" everywhere
- Do NOT use "your team" or "your company" framing — there are no teams in v1
- All copy should be neutral and observational — NOT marketing voice ("Help FieldMark discover" rather than "Be a hero and surface...")

EXPECTED OUTCOME

A clickable mockup that:
- Lets an MSL click through the Field Intelligence tab from the global nav into the forum landing
- Lets an MSL pick a TA channel and see threads listed in it
- Lets an MSL click a thread, see replies, mock-reply
- Lets an MSL see how Field Intelligence appears on an HCP profile
- Lets an MSL fill out (without persistence) the three contribution forms: Surface, Contextualize, Validate
- Lets an MSL see the opt-out request flow as it would appear to an HCP
- Feels like a real extension of FieldMark, not a separate prototype

The mockup is shown 1:1 to prospective MSL users for 45-60 min sessions where the goal is honest pushback. It does not need to be production-ready, but it must feel realistic enough that the MSL reacts to the *intent* rather than to obvious mock-ness.

DO NOT change anything else.

=== END CURSOR PROMPT ===
