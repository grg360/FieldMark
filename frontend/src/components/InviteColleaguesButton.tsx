import { useEffect, useState } from "react";
import { getMyInvites, primaryInvite, type MyInvite } from "../lib/invites";
import { useIsDesktop } from "../lib/useIsDesktop";
import InviteEmailForm from "./HomePage/InviteEmailForm";
import InviteShareCard from "./HomePage/InviteShareCard";
import { COLOR, ELEVATION, FONT, TYPE } from "../lib/designTokens";

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
          // Match the UserMenu avatar circle next to it: transparent fill,
          // 1.5px amber ring, 32px height, all-amber text. Stays a pill.
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "transparent",
          border: `1.5px solid ${COLOR.amber}`,
          color: COLOR.amber,
          borderRadius: 999,
          height: 32,
          padding: "0 12px",
          boxSizing: "border-box",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: FONT.sans,
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        Invites
        {isDesktop ? (
          <span style={{ color: COLOR.amber, fontWeight: 500 }}>· {invite.uses_remaining} left</span>
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
          ...ELEVATION.card,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          fontFamily: FONT.sans,
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
          <div style={TYPE.microLabel}>
            Invite Colleagues
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: COLOR.ink4,
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {String.fromCharCode(0xd7)}
          </button>
        </div>

        <p style={{ ...TYPE.bodyUI, margin: "0 0 12px 0" }}>
          Share your personal link. Anyone you invite gets FieldMark access — and their own invites to pass on.
        </p>
        <InviteShareCard code={invite.code} usesRemaining={invite.uses_remaining} />

        <div
          style={{
            ...TYPE.microLabel,
            borderTop: `1px solid ${COLOR.hair}`,
            margin: "16px 0 12px",
            paddingTop: 12,
          }}
        >
          Or email an invite
        </div>
        <InviteEmailForm />
      </div>
    </div>
  );
}
