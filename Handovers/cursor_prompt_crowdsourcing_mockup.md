=== CURSOR PROMPT ===

Code only. Don't execute. STOP if ambiguous.

CONTEXT
Build a clickable mockup of FieldMark's crowdsourcing feature set across three surfaces:
1. Topic forum (MSL-only TA-anchored discussion)
2. HCP validation (strengthened version of existing Validate This Signal)
3. HCP surfacing and contextualization (new contribution paths)

The mockup is for showing to prospective MSL users in 45-60 min "tear it apart" sessions. It does not persist data, does not authenticate, does not validate forms. Everything is visual and click-through-able.

Design language must match the existing FieldMark application (dark theme, cohort colors gold/white-hot/purple, off-white text, subtle borders, font-family system-ui or inherit from existing app). All new components should look like they belong in the existing app.

FILES TO CREATE
- frontend/src/components/CrowdsourcingNav.tsx (top-nav entry point or sidebar link)
- frontend/src/components/TopicForum.tsx (forum landing page)
- frontend/src/components/TopicThread.tsx (a single thread detail page)
- frontend/src/components/SurfaceHCPForm.tsx (form to surface a new HCP)
- frontend/src/components/ContextualizeHCPForm.tsx (form to add walled-garden context)
- frontend/src/components/OptOutRequestForm.tsx (HCP opt-out request)
- frontend/src/data/mockTopicPosts.ts (mock data file with realistic NSCLC forum posts)

FILES TO MODIFY
- frontend/src/App.tsx (add routes/tabs for crowdsourcing surfaces, link from HCP detail to Contextualize form, add Surface button to global nav)
- The existing HCP DetailScreen component (add "Add context" button next to "Validate this signal", show aggregated validation counts with threshold logic)

DESIGN CONSTRAINTS

Visual style:
- Dark background rgba(13, 13, 16, X) where X varies
- Text colors: rgba(232, 230, 223, 1.0) for primary, rgba(232, 230, 223, 0.7) for secondary, rgba(232, 230, 223, 0.5) for tertiary
- Border colors: rgba(255, 255, 255, 0.08-0.12)
- Accent: existing cohort colors where appropriate. For crowdsourcing-specific accents, use rgba(120, 200, 255, X) (a cool blue) to distinguish from the cohort palette
- Pseudonymous handle indicator: small circular avatar with first letter, mock-generated stable color per handle
- "MSL Verified" badge: small lock icon + "MSL Verified" text in muted color

COMPONENT SPECIFICATIONS

1. CrowdsourcingNav.tsx
- A new top-level nav option called "Community" placed in the existing main nav (alongside whatever currently exists)
- When clicked, takes the user to the Topic Forum
- Should fit naturally into the existing nav structure

2. TopicForum.tsx
- Landing page for the forum
- Three large TA channel tiles at the top: NSCLC, Rare Disease, Hepatology
- Each tile: TA name, brief description, number of active discussions, last activity timestamp
- Below the tiles: a "Recent Activity" feed of the most recent 5-7 posts across all channels
- Each feed entry: pseudonymous handle + avatar, post title, TA tag, snippet (first 1-2 lines), reply count, timestamp
- Clicking a post takes the user to TopicThread.tsx
- A subtle banner at the top: "MSL Verified Community — anonymous to peers, verified by FieldMark"

3. TopicThread.tsx
- A single thread view
- Header: thread title, TA tag, original poster's pseudonymous handle, timestamp
- Body: the original post (a few paragraphs of mocked content)
- Replies: 3-5 mocked replies in chronological order, each with handle, body, timestamp
- At the bottom: a "Reply" button (clicking opens an inline structured response, but submission does nothing — just dismisses)

4. SurfaceHCPForm.tsx
- A form-style modal or full-page form
- Title: "Surface a new HCP"
- Subtitle: "Help FieldMark discover an HCP we don't yet know about, or whose importance we're missing"
- Structured fields:
  - First name (text)
  - Last name (text)
  - Institution (text, with mock autocomplete suggesting existing institutions)
  - Therapeutic area (dropdown: NSCLC, Rare Disease, Hepatology, Other)
  - Specialty (text)
  - What makes this person worth tracking? (single-select chips, no free text):
    - "Influential in regional/community network"
    - "Sub-specialty depth not reflected in publications"
    - "Rising trainee/junior faculty"
    - "Active in clinical trials but low-visibility"
    - "Emerging speaker/educator"
- A subtle disclaimer at the bottom: "Submissions are reviewed before publishing. Multiple independent submissions strengthen the signal."
- Submit button "Submit for review" → shows confirmation toast "Thanks — we'll review and add this HCP to the platform when confirmed", then dismisses the form

5. ContextualizeHCPForm.tsx
- A form opened from an HCP detail screen (button labeled "Add context")
- Title: "Add context for Dr. [HCP NAME]"
- Walled-garden indicator at top in cool-blue: "Visible to your company's MSL team only"
- Structured fields:
  - Sub-specialty depth (multi-select chips): mock with NSCLC-relevant options like "EGFR-mutant", "ALK/ROS1", "Immunotherapy-naive", "Squamous", "Stage IV first-line", etc.
  - Engagement style preference (single-select chips): "Advisory board", "1:1 scientific exchange", "Didactic presentation", "Hybrid / context-dependent"
  - Referral network position (single-select chips): "Community leader (drives referrals into network)", "Academic connector (cross-institutional)", "Silo'd (limited cross-referral)", "Insufficient signal"
  - Communication preference (multi-select chips): "Email", "In-person", "Virtual / video", "Conference"
- No free-text fields anywhere
- Submit button "Save context" → confirmation toast "Saved to your team's view"

6. OptOutRequestForm.tsx
- Opens from a small footer link on HCP detail screens: "Are you Dr. [name]? Request opt-out or profile claim"
- Two clear options as cards:
  - "Request opt-out" — removes my profile from the public-facing platform
  - "Claim my profile" — verify my identity and gain visibility into how I appear on FieldMark
- Each card has a structured form behind it
- Opt-out form: name, email, ORCID (optional), confirmation checkbox "I am the HCP named above or their authorized representative"
- Submit → confirmation toast "Request received — we'll respond within 5 business days"

7. mockTopicPosts.ts
- Mock data file with 12-15 realistic posts across the three TA channels
- Each post: id, channel (NSCLC/RareDisease/Hepatology), handle, avatarColor, title, body, timestamp, replyCount, replies[]
- Content should be plausible MSL-grade scientific discussion (NOT generic placeholder lorem ipsum)
- Examples of plausible content:
  - NSCLC: "ASCO 2026 takeaway on the [drug X] subgroup analysis — anyone else surprised by the [biomarker] signal?"
  - NSCLC: "Trying to make sense of the recent [combination regimen] readout. What's the field's read?"
  - Rare Disease: "Newborn screening expansion for [condition] — how is your team thinking about MSL engagement strategy?"
  - Hepatology: "AASLD presentation on [mechanism] in PBC — clinical implications still unclear?"
- Use anonymized/fictional drug references rather than real branded names to avoid IP issues in the mockup
- Replies should feel like authentic peer discussion — short, technical, sometimes asking back-questions

HCP DETAIL SCREEN MODIFICATIONS

In the existing HCP DetailScreen component:
- Locate the existing "Validate This Signal" section
- Modify the section header from "VALIDATE THIS SIGNAL" to "COMMUNITY INTELLIGENCE"
- Above the existing validation buttons, add a small aggregated display: "12 MSLs have validated this profile" (where 12 is mocked per HCP, threshold logic: show count only if >= 3, otherwise display "Validation pending — be among the first to contribute")
- Below the existing validation buttons, add two new buttons styled to match:
  - "Add context (visible to your team)" — opens ContextualizeHCPForm
  - "Report data issue" — opens a simple structured form (out of scope for v1 but stub it visually)
- In the footer of the detail screen, add the small "Are you Dr. [name]? Request opt-out or profile claim" link → opens OptOutRequestForm

GLOBAL NAV MODIFICATIONS

In App.tsx:
- Add a new top-level "Community" entry point in the existing nav (whether that's a tab, a sidebar item, or a button — match the existing pattern)
- Clicking it routes to TopicForum
- Add a global "+ Surface HCP" button somewhere consistently visible (header? sidebar?) that opens SurfaceHCPForm
- All forms should open as modal-style overlays or dedicated routes — pick whichever matches the existing app's pattern better

BEHAVIORAL DETAILS

- No real backend calls
- All "submit" actions show a confirmation toast and dismiss the form
- Toasts should match any existing toast pattern in the app, or use a simple inline fade-in if none exists
- Forms should NOT validate (no required-field errors); the goal is the visual shape, not the validation logic
- Pseudonymous avatars: generate a stable hash-color from the handle string so the same handle always gets the same color
- Timestamps: use relative format ("2 hours ago", "yesterday", "3 days ago")

ABSOLUTE CONSTRAINTS

- Do NOT modify Telescope, HCPCard, TrackSwitch, TrackContext, or any existing chart/visualization components
- Do NOT add real authentication
- Do NOT add real data persistence
- Do NOT change the existing TA filter, cohort filter, or score display logic
- Do NOT add free-text fields anywhere in the contribution forms (this is a hard product constraint, not a styling preference)
- All copy should be neutral and observational — NOT marketing voice ("Help FieldMark discover" not "Be a hero and surface...")

EXPECTED OUTCOME

A clickable mockup that:
- Lets an MSL click through the Community/forum landing page, into a thread, back out
- Lets an MSL see how all three contribution paths surface on an HCP profile
- Lets an MSL fill out (without persistence) the three contribution forms
- Lets an MSL see the opt-out request flow as it would appear to an HCP
- Feels like a real version of FieldMark, not a separate prototype

The mockup is shown to prospective MSL users 1:1 for 45-60 min sessions where the goal is honest pushback. It does not need to be production-ready, but it needs to be realistic enough that the MSL reacts to the *intent* rather than to obvious mock-ness.

DO NOT change anything else.

=== END CURSOR PROMPT ===
