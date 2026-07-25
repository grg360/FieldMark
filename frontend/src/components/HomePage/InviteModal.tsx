import { useState } from "react";
import { recordTeamInviteSignal } from "../../lib/home";
import { COLOR, ELEVATION, FONT, TYPE } from "../../lib/designTokens";

interface Props {
  userId: string;
  onClose: () => void;
}

function isValidEmail(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

export default function InviteModal({ userId, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      await recordTeamInviteSignal(
        userId,
        trimmedEmail || null,
        name.trim() || null,
        company.trim() || null,
      );
      setSuccess(true);
      window.setTimeout(() => onClose(), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...ELEVATION.card,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          fontFamily: FONT.sans,
        }}
      >
        {success ? (
          <p style={{ fontSize: 15, color: COLOR.ink1, margin: 0, lineHeight: 1.5 }}>
            You&apos;re on the list. We&apos;ll be in touch.
          </p>
        ) : (
          <>
            <h2
              style={{
                ...TYPE.eyebrow,
                color: COLOR.ink1,
                margin: "0 0 8px 0",
              }}
            >
              Get notified when team features launch
            </h2>
            <p style={{ fontSize: 13, color: COLOR.ink3, margin: "0 0 20px 0", lineHeight: 1.5 }}>
              We&apos;ll let you know the moment team intelligence features are ready.
            </p>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: COLOR.ink4, display: "block", marginBottom: 4 }}>
                Colleague&apos;s name (optional)
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  backgroundColor: COLOR.surfaceWell,
                  border: `1px solid ${COLOR.hair}`,
                  borderRadius: 4,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: COLOR.ink1,
                  fontFamily: "inherit",
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: COLOR.ink4, display: "block", marginBottom: 4 }}>
                Colleague&apos;s email (optional)
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  backgroundColor: COLOR.surfaceWell,
                  border: `1px solid ${COLOR.hair}`,
                  borderRadius: 4,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: COLOR.ink1,
                  fontFamily: "inherit",
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: COLOR.ink4, display: "block", marginBottom: 4 }}>
                Colleague&apos;s company (optional)
              </span>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  backgroundColor: COLOR.surfaceWell,
                  border: `1px solid ${COLOR.hair}`,
                  borderRadius: 4,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: COLOR.ink1,
                  fontFamily: "inherit",
                }}
              />
            </label>

            <p style={{ fontSize: 11, color: COLOR.ink4, margin: "0 0 16px 0", lineHeight: 1.4 }}>
              Skip this if you just want to be notified yourself — we already have your email.
            </p>

            {error ? (
              <p style={{ fontSize: 12, color: COLOR.danger, margin: "0 0 12px 0" }}>{error}</p>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                style={{
                  background: "none",
                  border: "none",
                  color: COLOR.ink3,
                  fontSize: 13,
                  cursor: pending ? "default" : "pointer",
                  fontFamily: "inherit",
                  padding: "8px 12px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={pending}
                style={{
                  backgroundColor: COLOR.amber,
                  color: COLOR.ground,
                  border: "none",
                  borderRadius: 4,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: pending ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: pending ? 0.6 : 1,
                }}
              >
                {pending ? "Saving..." : "Notify Me"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
