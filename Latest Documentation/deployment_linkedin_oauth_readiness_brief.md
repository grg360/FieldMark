# FieldMark — Deployment + LinkedIn OAuth Submission Readiness Brief

**Created:** May 8, 2026
**Purpose:** Context document for a new chat focused on getting FieldMark deployed to a public domain and ready for LinkedIn OAuth application submission.

---

## What FieldMark is

A mobile-first B2B SaaS platform identifying community HCPs and digital opinion leaders for pharma MSL teams. Three-cohort framework (Rising Stars / Community / Established) plus a fourth Social track for digital opinion leaders captured from public conversation. Crowdsourced intelligence platform combining public scientific data (PubMed, ClinicalTrials.gov, OpenAlex) with planned anonymous verified contributions from MSLs.

Pre-launch. Independently developed by Garrett, a global leadership team member at Avalere Health (20+ years medical communications).

## Why deployment is needed now

LinkedIn OAuth application submission is the immediate driver. LinkedIn requires:
- Live, publicly accessible domain (not localhost, not preview URLs)
- Privacy policy + terms of service at stable URLs
- Working OAuth redirect URL
- App that looks real to a human reviewer
- Use case description that aligns with LinkedIn's permitted uses

Garrett's target: submit OAuth application within next week. LinkedIn review typically takes 5-15 business days, so getting submission right on first try matters — rejection adds 1-2 weeks.

## Tech stack

- **Frontend**: React + TypeScript, Vite, mobile-responsive
- **Backend**: Supabase (Postgres 17.6) — direct from frontend via supabase-js client
- **Auth**: Will use LinkedIn OAuth (this is what's being submitted)
- **AI**: Claude API integration for narratives and synthesis (planned, not yet wired)
- **Hosting**: TBD — needs decision in deployment chat
- **Repo**: Private GitHub repository, commits via `quick_commit.ps1` script

Frontend lives at `C:\Users\garre\Desktop\FieldMark\frontend`. The codebase is functional, demo-ready, and committed.

## Current state of the app — what's real vs. mocked

A LinkedIn reviewer will click around. Worth knowing what they'll see:

### Real functionality (works against live database)
- HCP feed with rising stars from real `hcp_normalized_scores` data (~114K HCPs total in DB, 190K publications)
- Therapeutic area filtering (Rare Disease, Oncology / NSCLC, Hepatology, Immunology)
- Search across HCPs
- HCP detail screens with real publication data
- Geographic data on HCPs (state, country, city for ~58K HCPs)
- Verified DOL hero panel (5 oncology, 2 hepatology, 2 rare disease — real verified DOLs)
- Score modal with real scoring methodology

### Placeholder / pre-auth state
- LinkedIn auth screen exists but doesn't actually authenticate (the whole point of the OAuth submission)
- Profile screen has limited functionality
- No real user accounts; no per-user data

### Heavily mocked
- Social track (entire fourth track ships in v1.0 with mock data — disclosed as "preview · sample data" in the analytics)
- Landscape view (map with hardcoded city markers, not real DB query)
- City feed screen (hardcoded sample HCPs per city)
- Some cohort classifications (Rising Stars / Dark Horses are real; Community / Established are placeholder until v1.1)

A reviewer who clicks deeply into the Social track will see preview labels. A reviewer who only stays at the main feed will see real data.

## Specific LinkedIn OAuth considerations

### Use case framing for the application

FieldMark is verifying that LinkedIn users hold MSL/field medical roles within pharmaceutical companies. The use case is:

> "FieldMark is a B2B intelligence platform for pharmaceutical Medical Science Liaisons (MSLs) and field medical teams. We use LinkedIn OAuth to verify users' professional roles within medical affairs at pharmaceutical companies. Verified MSLs can access HCP intelligence, contribute structured insights anonymously, and engage with the platform's collaborative features. We do not use LinkedIn data for marketing or share it with third parties."

This framing emphasizes:
- B2B (LinkedIn approves B2B use cases more readily than consumer)
- Professional verification (clear use)
- Pharma medical affairs (legitimate industry, not adjacent areas like pharma marketing or sales)
- Privacy protection (anonymity for contributions)

LinkedIn cares about this exact framing. Vague descriptions get rejected.

### Required scopes

For MSL verification, FieldMark likely needs:
- `openid` — identity verification
- `profile` — name, profile URL
- `email` — for account communication
- Possibly `r_liteprofile` (deprecated but some apps still use)

NOT needed and shouldn't be requested:
- `r_emailaddress` (replaced by openid email)
- Any write scopes
- Any contacts/connections scopes (would broaden review scrutiny)

### Redirect URL

Must be HTTPS, must be on the registered domain, must match exactly what's submitted in the application. Common pattern: `https://[domain]/auth/linkedin/callback`

### Privacy policy specifics

LinkedIn requires the privacy policy to specifically address:
- What LinkedIn data is collected (name, email, profile URL, role verification)
- How long it's retained
- Whether it's shared with third parties (answer: no)
- User's right to delete their account and associated LinkedIn data
- Compliance with applicable laws

### Terms of service specifics

Should cover:
- B2B use only (not for consumer access)
- Professional verification requirement
- User responsibilities
- Platform's right to remove access for abuse
- Dispute resolution

## Hosting platform decision factors

Three viable options:

**Vercel** — strongest Vite/React integration, automatic git deploys, free tier sufficient for v1.0, custom domain free, environment variables straightforward. Best for "just works" experience.

**Netlify** — similar to Vercel, slight differences in build configuration. Equally viable.

**Cloudflare Pages** — best CDN performance globally, more configuration steps for environment variables, free tier generous. Best for "I want maximum performance and don't mind one extra config step."

For LinkedIn OAuth submission timeline, Vercel is the safest pick — fastest path from "git push" to "live URL with custom domain." Vercel's automatic preview URLs also help during development.

## Environment variables / secrets

The Vite frontend uses these (from past chat context):
- `VITE_SUPABASE_URL` — Supabase project URL (public, exposed in frontend)
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key (public, exposed in frontend, RLS protects data)

These get configured in the hosting platform's dashboard. Vercel calls them "Environment Variables." They need to be set for both production and preview deployments.

LinkedIn OAuth will add:
- `VITE_LINKEDIN_CLIENT_ID` — public, used in OAuth flow
- `LINKEDIN_CLIENT_SECRET` — server-side only, NEVER expose to frontend (this means OAuth callback handling needs to happen in a server-side function, not in pure-frontend Vite code)

**This is an architectural consideration**: pure Vite SPA can't safely handle the OAuth client_secret. Options:
1. Use Supabase Auth's LinkedIn provider (Supabase handles the secret server-side) — easiest path
2. Use Vercel/Netlify serverless functions for the OAuth callback
3. Add a small backend service

Option 1 (Supabase Auth with LinkedIn provider) is by far the cleanest. Supabase has built-in LinkedIn OAuth support. The frontend just calls `supabase.auth.signInWithOAuth({ provider: 'linkedin_oidc' })` and Supabase handles the rest. The LinkedIn application is configured to redirect to Supabase's auth endpoint, not directly to FieldMark's domain.

This actually changes the redirect URL on the LinkedIn application — it points to Supabase, not FieldMark. Worth confirming with Supabase docs.

## Pre-submission checklist

Before submitting the LinkedIn OAuth application:

- [ ] Domain registered and DNS pointing to hosting platform
- [ ] App deployed and accessible at production URL
- [ ] HTTPS working (automatic with Vercel/Netlify)
- [ ] `noindex` meta tags added so search engines don't index the demo URL
- [ ] Privacy policy at stable URL (e.g. `/privacy`) with real content
- [ ] Terms of service at stable URL (e.g. `/terms`) with real content
- [ ] LinkedIn OAuth flow scaffolded — at minimum, a button that initiates the flow and a landing page for successful return
- [ ] Use case description drafted for application form (per "Use case framing" above)
- [ ] Required scopes documented and minimized
- [ ] Redirect URL configured to match what's in the application
- [ ] Reviewer-friendly polish: app looks real, no obvious placeholder text, no broken links visible from main flows
- [ ] Documentation files from this session for context

## What NOT to worry about for OAuth submission

These don't block submission and shouldn't be in scope for the deployment session:

- The Social track being heavily mocked (it's labeled as preview)
- Landscape map using hardcoded data (not directly part of OAuth flow)
- Cohort classification being placeholder (visible but not OAuth-relevant)
- v1.1 features like MSL tagging being absent (we're submitting to ENABLE v1.1, not because v1.1 is built)
- Performance optimization
- Mobile-specific bugs unless egregious

## Files to bring to the deployment chat

1. This brief
2. `v1_1_enhancements_backlog.md` (forward-looking deferrals)
3. `social_track_v1_0_implementation_log.md` (record of what was built today)

The first two give the new chat full context. The third helps if questions about Social track features come up during deployment review.

## Specific asks for the new chat

1. Recommend hosting platform (Vercel likely; confirm)
2. Walk through deployment setup step-by-step
3. Configure custom domain DNS
4. Help draft privacy policy + terms of service (template + customization for FieldMark specifics)
5. Scaffold LinkedIn OAuth flow using Supabase Auth's LinkedIn provider
6. Configure environment variables in hosting platform
7. Review pre-submission checklist before LinkedIn application submission
8. Help draft the use case description for the application form

That's roughly the scope of what next week needs to deliver.

---

*End of deployment readiness brief.*
