import { useState } from "react";
import { setSignupCap, toggleSignups, type AppConfig } from "../../lib/admin";
import {
  ErrorNote,
  LoadingNote,
  PALETTE,
  Section,
  buttonStyle,
  formatTimestamp,
  inputStyle,
  labelStyle,
} from "./adminUi";

interface Props {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  onConfig: (c: AppConfig) => void;
}

/**
 * Kill-switch + global cap. Every rendered value comes from the server: the RPCs
 * return the resulting config and we render THAT, never an optimistic local
 * guess. If a write is rejected the display stays on the last known server truth.
 */
export default function AdminKillSwitch({ config, loading, error, onConfig }: Props) {
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [capDraft, setCapDraft] = useState<string>("");
  const [capDirty, setCapDirty] = useState(false);

  // The cap field shows the server value until the admin edits it.
  const capValue = capDirty
    ? capDraft
    : config?.global_signup_cap == null
      ? ""
      : String(config.global_signup_cap);

  async function runToggle(next: boolean) {
    setBusy(true);
    setWriteError(null);
    const { data, error: err } = await toggleSignups(next);
    if (err) setWriteError(err);
    else if (data) onConfig(data);
    setBusy(false);
  }

  async function runSetCap() {
    const trimmed = capValue.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0)) {
      setWriteError("Cap must be a non-negative whole number, or blank for uncapped.");
      return;
    }
    setBusy(true);
    setWriteError(null);
    const { data, error: err } = await setSignupCap(parsed);
    if (err) {
      setWriteError(err);
    } else if (data) {
      onConfig(data);
      setCapDirty(false);
    }
    setBusy(false);
  }

  const enabled = config?.signups_enabled === true;

  return (
    <Section
      title="Signups"
      subtitle="Server-side kill-switch and global cap. Both are enforced inside redeem_invite() — turning signups off blocks redemption immediately, regardless of who holds a valid code."
    >
      {loading ? (
        <LoadingNote />
      ) : error ? (
        <ErrorNote message={error} />
      ) : !config ? (
        <ErrorNote message="No config returned by the server." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "monospace",
                fontSize: 13,
                color: enabled ? PALETTE.green : PALETTE.red,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: enabled ? PALETTE.green : PALETTE.red,
                  display: "inline-block",
                }}
              />
              {enabled ? "signups_enabled = true" : "signups_enabled = false"}
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void runToggle(!enabled)}
              style={{
                ...buttonStyle(enabled ? "ghost" : "primary"),
                opacity: busy ? 0.6 : 1,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Working..." : enabled ? "Pause signups" : "Resume signups"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div>
              <label htmlFor="admin-cap" style={labelStyle}>
                Global signup cap
              </label>
              <input
                id="admin-cap"
                type="text"
                inputMode="numeric"
                value={capValue}
                placeholder="uncapped"
                onChange={(e) => {
                  setCapDirty(true);
                  setCapDraft(e.target.value);
                }}
                style={{ ...inputStyle, width: 140 }}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runSetCap()}
              style={{ ...buttonStyle(), opacity: busy ? 0.6 : 1 }}
            >
              Set cap
            </button>
            {capDirty ? (
              <button
                type="button"
                onClick={() => {
                  setCapDirty(false);
                  setWriteError(null);
                }}
                style={{ ...buttonStyle(), color: PALETTE.dim }}
              >
                Cancel
              </button>
            ) : null}
            <span style={{ fontSize: 11, color: PALETTE.dim, paddingBottom: 8 }}>
              {config.global_signup_cap == null
                ? "Currently uncapped. Blank the field to remove a cap."
                : `Cap of ${config.global_signup_cap} total profiles.`}
            </span>
          </div>

          <div style={{ fontSize: 11, color: PALETTE.faint, fontFamily: "monospace" }}>
            server updated_at {formatTimestamp(config.updated_at)}
          </div>

          {writeError ? <ErrorNote message={writeError} /> : null}
        </div>
      )}
    </Section>
  );
}
