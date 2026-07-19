import { useEffect, useState } from "react";
import { getMyInvites, primaryInvite, type MyInvite } from "../lib/invites";
import { useIsDesktop } from "../lib/useIsDesktop";
import InviteEmailForm from "./HomePage/InviteEmailForm";
import InviteShareCard from "./HomePage/InviteShareCard";

/**
 * Compact "Invite colleagues" entry point for the top bar, next to the avatar.
 * Collapsed: a small amber CTA with the invites-remaining count. Expanded: a
 * modal holding the SAME invite UI as before — personal link + copy, and the
 * email-an-invite form — reused as-is (InviteShareCard + InviteEmailForm).
 *
 * This only relocates the mount: the old full-width /me tile becomes an on-demand
 * modal. No change to invite logic, link generation, or email-send behavior.
 */
export default function InviteColleaguesButton() {
  const isDesktop = useIsDesktop();
  const [invite, setInvite] = useState<MyInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

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

  // Hidden until we know the user actually has an invite (same guard the tile used).
  if (loading || !invite) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Invite colleagues"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "rgba(232,160,32,0.10)",
          border: "1px solid rgba(232,160,32,0.45)",
          color: "#E8A020",
          borderRadius: 999,
          padding: "5px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "system-ui, -apple-system, sans-serif",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        Invites
        {isDesktop ? (
          <span style={{ color: "#9B9892", fontWeight: 500 }}>· {invite.uses_remaining} left</span>
        ) : null}
      </button>

      {open ? <InviteModalContent invite={invite} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function InviteModalContent({ invite, onClose }: { invite: MyInvite; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite colleagues"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#0D0D10",
          border: "1px solid #1E1E22",
          borderRadius: 8,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#6B6A65",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 500,
            }}
          >
            Invite Colleagues
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
      </div>
    </div>
  );
}
