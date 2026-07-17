# FieldMark Invite Email — Design Spec (locked)

Design approved 2026-07-17. Rendering is Resend-gated (build the HTML email when Resend is provisioned);
this captures the locked design + copy so it isn't lost.

## Concept
The invite is a PEER VOUCH into a private network — vocabulary of admission/membership, not signup.
Softened from the app's dense dark terminal aesthetic → warmer "front door," but amber-anchored and on-brand.

## Structure (top → bottom)
1. Wordmark: "FIELDMARK" in AMBER (#BA7517), mono font, letter-spaced. No bullet/dot. Stands alone.
2. Peer line: "[Inviter Name] invited you to join FieldMark." (muted, secondary)
3. HERO — the tagline / brand hook: "We see the nebula before the star." (large, 22px/500, primary text)
   — This is the emotional pitch: you spot the rising KOL before they've emerged. Came from Garrett. Keep it.
4. Value line (TA-SPECIFIC when known): "FieldMark is a private intelligence network for medical affairs. It
   surfaces the rising KOLs in [NSCLC] — the researchers gaining influence now, before they're on everyone's
   radar — mapped across publications, trials, and collaborations."
   — PERSONALIZE by TA when determinable (infer from inviter's TA, or per-invite); graceful fallback to "your
     therapeutic area" when unknown.
5. CTA button (amber #BA7517 bg, #FAEEDA text): "Claim your access" → the /join/<code> link.
6. Scarcity/exclusivity line (muted, centered): "Membership is invitation-only."
7. Footer, separated: "You received this because [Inviter] believed FieldMark would be valuable to your work."
   then, a line down, quiet mono signature: "BESSEL ANALYTICS".

## Exclusivity levers (deliberate — reads curated/serious, NOT gimmicky)
- "private intelligence network" / "membership" / "invitation-only" — vocabulary of admission.
- "Claim your access" (not "Accept invitation") — implies something reserved for you.
- "Membership is invitation-only." — states the gate as fact; no "limited spots!" urgency gimmicks.

## Palette
- Amber accent: #BA7517 (wordmark, CTA bg). CTA text: #FAEEDA (amber-50, light-on-amber).
- Otherwise clean/warm surfaces, generous whitespace, sans body. Amber + mono are the brand anchors.

## Build notes (when Resend is live)
- HTML email (table-based layout for email-client compatibility — the widget mock used divs; real email needs
  email-safe HTML). Test in major clients (Gmail, Outlook, Apple Mail).
- From-address model (decided earlier): FieldMark sends, but NAMES the inviter in the body for the peer-vouch
  credibility (cleaner deliverability than sending "as" the person).
- Inject: inviter name, recipient TA (with fallback), the /join/<code> link.
- Send path: Edge Function (reuse generate-brief pattern), server-picks the caller's code. Resend API + verified
  domain required.
