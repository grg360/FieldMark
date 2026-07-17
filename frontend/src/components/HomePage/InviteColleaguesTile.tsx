import { useEffect, useState } from "react";
import { getMyInvites, primaryInvite, type MyInvite } from "../../lib/invites";
import HomeTile from "./HomeTile";
import InviteEmailForm from "./InviteEmailForm";
import InviteShareCard from "./InviteShareCard";

/**
 * Persistent "Invite colleagues" surface on /me — the place a user can always
 * find their invite link + remaining uses. Reads the user's OWN invites via
 * SELECT-own (RLS-scoped, no RPC). Hidden entirely if the user has no invite
 * or the read fails, so it never renders a broken/empty share box.
 */
export default function InviteColleaguesTile() {
  const [invite, setInvite] = useState<MyInvite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const invites = await getMyInvites();
      if (cancelled) return;
      setInvite(primaryInvite(invites));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // No invite (or the read failed) → show nothing rather than a dead box.
  if (loading || !invite) return null;

  return (
    <HomeTile>
      <div
        style={{
          fontSize: 11,
          color: "#6B6A65",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
          marginBottom: 12,
        }}
      >
        Invite Colleagues
      </div>
      <p style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5, margin: "0 0 12px 0" }}>
        Share your personal link. Anyone you invite gets FieldMark access — and their own invites to pass on.
      </p>
      <InviteShareCard code={invite.code} usesRemaining={invite.uses_remaining} />

      <div
        style={{
          borderTop: "1px solid #1E1E22",
          margin: "16px 0 12px",
          paddingTop: 12,
          fontSize: 11,
          color: "#6B6A65",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
        }}
      >
        Or email an invite
      </div>
      <InviteEmailForm />
    </HomeTile>
  );
}
