import { useEffect, useState } from "react";
import { getMyInvites, primaryInvite, FRESH_INVITE_KEY } from "../../lib/invites";
import InviteShareCard from "./InviteShareCard";

/**
 * The signup moment. Shown ONCE, right after a brand-new user finishes the
 * wizard and lands on /me: "You're in! Here's your link to invite colleagues."
 * The perfect first "share this" nudge.
 *
 * Gated on the FRESH_INVITE_KEY that SignupScreen stashes at redemption (the
 * code redeem_invite() returns and previously discarded). Presence = just
 * signed up; dismissing clears it so the banner never returns. The uses count
 * comes from a live SELECT-own read, but the LINK falls back to the captured
 * code, so the banner still works even if the SELECT grant isn't applied yet.
 */
export default function WelcomeShareBanner() {
  const freshCode =
    typeof window !== "undefined" ? sessionStorage.getItem(FRESH_INVITE_KEY) : null;

  const [dismissed, setDismissed] = useState(false);
  const [code, setCode] = useState<string | null>(freshCode);
  const [usesRemaining, setUsesRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!freshCode) return;
    let cancelled = false;
    void (async () => {
      const primary = primaryInvite(await getMyInvites());
      if (cancelled || !primary) return;
      // Prefer the live row (authoritative code + uses); keep the captured code otherwise.
      setCode(primary.code);
      setUsesRemaining(primary.uses_remaining);
    })();
    return () => {
      cancelled = true;
    };
  }, [freshCode]);

  if (!freshCode || dismissed || !code) return null;

  function dismiss() {
    sessionStorage.removeItem(FRESH_INVITE_KEY);
    setDismissed(true);
  }

  return (
    <div
      style={{
        backgroundColor: "rgba(232,160,32,0.06)",
        border: "1px solid #E8A020",
        borderRadius: 6,
        padding: 20,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E6DF" }}>
          You&rsquo;re in! Welcome to FieldMark.
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          style={{
            background: "none",
            border: "none",
            color: "#6B6A65",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {String.fromCharCode(0xd7)}
        </button>
      </div>
      <p style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5, margin: "0 0 14px 0" }}>
        Here&rsquo;s your personal link to invite colleagues. Share it in Slack, a text, or an email.
      </p>
      <InviteShareCard code={code} usesRemaining={usesRemaining} />
    </div>
  );
}
