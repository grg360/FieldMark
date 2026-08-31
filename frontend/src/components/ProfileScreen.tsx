import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  getCurrentUser,
  getMslProfile,
  signOut,
  clearMslProfileCache,
  type MslProfile,
} from "../lib/authHelpers";
import { COLOR, CONTENT_WIDTH } from "../lib/designTokens";
import AppLayout from "./AppLayout";

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 4l4 4-4 4" stroke={COLOR.ink5} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <rect width="12" height="12" rx="2" fill="#0A66C2" />
    <text x="2" y="10" fontSize="9" fontWeight="700" fill="white" fontFamily="system-ui">in</text>
  </svg>
);

// DECOUPLED 2026-08-15. These were display names doing double duty as the key of
// INDICATION_NAME_TO_SLUG, which made the round-trip asymmetric the moment nsclc's
// label changed: the load path read "Lung Cancer" out of INDICATION_SLUG_TO_NAME
// while the save path only recognised "NSCLC", so a saved default silently
// reverted to "all". The picker now holds SLUGS in state and renders labels.
interface IndicationChoice { slug: string; label: string }
const INDICATIONS: Record<string, IndicationChoice[]> = {
  "Rare Disease": [
    { slug: "all", label: "All" },
    { slug: "fabry-disease", label: "Fabry disease" },
    { slug: "huntingtons", label: "Huntington's" },
    { slug: "sickle-cell", label: "Sickle cell" },
    { slug: "gaucher", label: "Gaucher" },
    { slug: "pku", label: "PKU" },
    { slug: "pompe", label: "Pompe" },
  ],
  Oncology: [
    { slug: "all", label: "All" },
    { slug: "nsclc", label: "Lung Cancer" },
    { slug: "colorectal-cancer", label: "Colorectal Cancer" },
    { slug: "car-t", label: "CAR-T" },
    { slug: "dlbcl", label: "DLBCL" },
    { slug: "melanoma", label: "Melanoma" },
    { slug: "cll", label: "CLL" },
    { slug: "aml", label: "AML" },
  ],
  Immunology: [
    { slug: "all", label: "All" },
    { slug: "lupus", label: "Lupus" },
    { slug: "crohns", label: "Crohn's" },
    { slug: "myasthenia-gravis", label: "Myasthenia gravis" },
    { slug: "sjogrens", label: "Sjogren's" },
    { slug: "cidp", label: "CIDP" },
  ],
  Hepatology: [
    { slug: "all", label: "All" },
    { slug: "pbc", label: "PBC" },
    { slug: "nash", label: "NASH" },
    { slug: "psc", label: "PSC" },
    { slug: "aih", label: "AIH" },
    { slug: "hcc", label: "HCC" },
  ],
};

const REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West", "National"];

const TA_NAME_TO_SLUG: Record<string, string> = {
  "Rare Disease": "rare-disease",
  "Oncology": "oncology",
  "Immunology": "immunology",
  "Hepatology": "hepatology",
};

const TA_SLUG_TO_NAME: Record<string, string> = {
  "rare-disease": "Rare Disease",
  "oncology": "Oncology",
  "immunology": "Immunology",
  "hepatology": "Hepatology",
};

// No NAME_TO_SLUG twin: the label->slug direction is what broke, and nothing
// needs it now that state holds the slug. Only slugs listed HERE are persisted
// to msl_profiles.default_indication_slug; every other picker slug saves as
// "all", which is exactly what the old name-map fallback did.
const INDICATION_SLUG_TO_NAME: Record<string, string> = {
  "all": "All",
  "nsclc": "Lung Cancer",
  // Listed HERE as well as in INDICATIONS above - this map is the persistence
  // gate, so an entry missing from it saves as "all" no matter what the picker
  // offered. Both built TAs (nsclc, colorectal-cancer) are present.
  "colorectal-cancer": "Colorectal Cancer",
  "car-t": "CAR-T",
  "dlbcl": "DLBCL",
  "melanoma": "Melanoma",
  "cll": "CLL",
  "aml": "AML",
};

const REGION_NAME_TO_SLUG: Record<string, string> = {
  "Northeast": "northeast",
  "Southeast": "southeast",
  "Midwest": "midwest",
  "Southwest": "southwest",
  "West": "west",
  "National": "national",
};

const REGION_SLUG_TO_NAME: Record<string, string> = {
  "northeast": "Northeast",
  "southeast": "Southeast",
  "midwest": "Midwest",
  "southwest": "Southwest",
  "west": "West",
  "national": "National",
};

const REGION_STATES: Record<string, string[]> = {
  "Northeast": ["CT", "MA", "ME", "NH", "NY", "RI", "VT", "NJ", "PA"],
  "Southeast": ["AL", "FL", "GA", "KY", "MS", "NC", "SC", "TN", "VA", "WV"],
  "Midwest": ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  "Southwest": ["AZ", "NM", "OK", "TX"],
  "West": ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
  "National": [],
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        backgroundColor: on ? "#0A1F16" : "#1c1b18",
        border: on ? "1px solid #1D9E75" : "1px solid rgba(255,255,255,0.12)",
        position: "relative",
        cursor: "pointer",
        transition: "background-color 150ms, border-color 150ms",
        flexShrink: 0,
        padding: 0,
      }}
      aria-pressed={on}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: on ? "#1D9E75" : COLOR.ink4,
          position: "absolute",
          top: 1,
          left: on ? 17 : 1,
          transition: "left 150ms, background-color 150ms",
        }}
      />
    </button>
  );
}

export default function ProfileScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<MslProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [selectedTA, setSelectedTA] = useState("Oncology");
  const [selectedIndication, setSelectedIndication] = useState("all"); // SLUG, not label
  const [selectedRegion, setSelectedRegion] = useState("Northeast");
  const [statesCovered, setStatesCovered] = useState<string[]>([]);
  const [notifications, setNotifications] = useState({
    newStars: true,
    scoreChanges: true,
    fieldNotes: false,
  });

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);
      const p = await getMslProfile(user.id);
      if (!p) {
        setLoading(false);
        return;
      }

      setProfile(p);

      if (p.default_ta_slug && TA_SLUG_TO_NAME[p.default_ta_slug]) {
        setSelectedTA(TA_SLUG_TO_NAME[p.default_ta_slug]);
      }
      if (p.default_indication_slug && INDICATION_SLUG_TO_NAME[p.default_indication_slug]) {
        setSelectedIndication(p.default_indication_slug);
      }
      if (p.region && REGION_SLUG_TO_NAME[p.region]) {
        setSelectedRegion(REGION_SLUG_TO_NAME[p.region]);
      }
      if (p.states_covered) {
        setStatesCovered(p.states_covered);
      }

      setNotifications({
        newStars: p.notify_new_rising_stars ?? true,
        scoreChanges: p.notify_score_changes ?? true,
        fieldNotes: p.notify_field_notes ?? false,
      });

      setLoading(false);
    })();
  }, []);

  function handleTAChange(ta: string) {
    setSelectedTA(ta);
    setSelectedIndication("all");
  }

  function handleRegionChange(region: string) {
    setSelectedRegion(region);
    if (REGION_STATES[region]) {
      setStatesCovered(REGION_STATES[region]);
    }
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setError(null);

    const taSlug = TA_NAME_TO_SLUG[selectedTA] ?? "oncology";
    const indSlug = INDICATION_SLUG_TO_NAME[selectedIndication] ? selectedIndication : "all";
    const regionSlug = REGION_NAME_TO_SLUG[selectedRegion] ?? "northeast";
    const territoryLabel = selectedRegion;

    const { error: updateErr } = await supabase
      .from("msl_profiles")
      .update({
        default_ta_slug: taSlug,
        default_indication_slug: indSlug,
        region: regionSlug,
        states_covered: statesCovered,
        territory_states: statesCovered,
        territory_label: territoryLabel,
        notify_new_rising_stars: notifications.newStars,
        notify_score_changes: notifications.scoreChanges,
        notify_field_notes: notifications.fieldNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    clearMslProfileCache();
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: COLOR.ground,
          minHeight: "100dvh",
          maxWidth: CONTENT_WIDTH.reading,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: COLOR.ink4,
          fontSize: 13,
        }}
      >
        Loading profile...
      </div>
    );
  }

  return (
    // reading width, not the migration default wide: a single-column settings
    // form at 1440 is unusable line lengths — reported as a width exception.
    <AppLayout width="reading">
      <div style={{ fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif", boxSizing: "border-box" }}>
      {/* Settings sub-bar — the Save action; global home nav lives in the TopBar above. */}
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: `1px solid ${COLOR.hairStrong}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: COLOR.ink2, letterSpacing: "0.02em" }}>Settings</span>
        <div style={{ display: "flex", alignItems: "center" }}>
          {error ? (
            <span style={{ fontSize: 11, color: "#E8704E", marginRight: 8 }}>
              {error}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            style={{ background: "none", border: "none", cursor: saving ? "default" : "pointer", padding: 4, fontSize: 13, color: "#1D9E75", fontWeight: 500 }}
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* Profile header */}
        <div style={{ padding: "24px 16px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", alignItems: "center", gridColumn: "1 / -1" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: COLOR.surfaceCard,
              border: "1px solid #E8A020",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 500, color: "#E8A020" }}>
              {profile?.first_name && profile?.last_name
                ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
                : "??"}
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: "#F2F0EA", marginTop: 12, textAlign: "center" }}>
            {profile?.first_name && profile?.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : "..."}
          </div>
          <div style={{ fontSize: 12, color: COLOR.ink4, marginTop: 4, textAlign: "center" }}>
            {profile?.role ?? "Medical Science Liaison"}
            {profile?.company ? ` · ${profile.company}` : ""}
          </div>
          {profile?.linkedin_verified_at ? (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#0d0c0b",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 3,
                padding: "4px 12px",
              }}
            >
              <LinkedInIcon />
              <span style={{ fontSize: 11, color: COLOR.ink4 }}>Verified via LinkedIn</span>
            </div>
          ) : null}
        </div>

        <div className="fm-profile-body">
          <div className="fm-profile-col-left" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ padding: "20px 16px 16px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "#77736B", fontWeight: 600, marginBottom: 16 }}>
                Default view
              </div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "#77736B", fontWeight: 600, marginBottom: 8 }}>
                Therapeutic area
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {["Rare Disease", "Oncology", "Immunology", "Hepatology"].map((ta) => {
                  const isSelected = selectedTA === ta;
                  return (
                    <button
                      key={ta}
                      type="button"
                      onClick={() => handleTAChange(ta)}
                      style={{
                        backgroundColor: isSelected ? "#0D0D0A" : COLOR.surfaceCard,
                        border: `1px solid ${isSelected ? "#E8A020" : "rgba(255,255,255,0.10)"}`,
                        color: isSelected ? "#E8A020" : COLOR.ink1,
                        borderRadius: 4,
                        padding: "10px 12px",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {ta}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "#77736B", fontWeight: 600, marginTop: 16, marginBottom: 8 }}>
                Default indication
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {(INDICATIONS[selectedTA] ?? []).map((chip) => {
                  const isSelected = selectedIndication === chip.slug;
                  return (
                    <button
                      key={chip.slug}
                      type="button"
                      onClick={() => setSelectedIndication(chip.slug)}
                      style={{
                        flexShrink: 0,
                        backgroundColor: isSelected ? "#0D0D0A" : "#0d0c0b",
                        border: `1px solid ${isSelected ? "#E8A020" : "rgba(255,255,255,0.10)"}`,
                        color: isSelected ? "#E8A020" : COLOR.ink4,
                        borderRadius: 3,
                        padding: "6px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: COLOR.ink5, marginTop: 8 }}>Your feed opens here by default.</div>
            </div>
          </div>

          <div className="fm-profile-col-right">
            <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "#77736B", fontWeight: 600, marginBottom: 16 }}>
                Territory
              </div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "#77736B", fontWeight: 600, marginBottom: 8 }}>
                Region
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {REGIONS.map((region) => {
                  const isSelected = selectedRegion === region;
                  return (
                    <button
                      key={region}
                      type="button"
                      onClick={() => handleRegionChange(region)}
                      style={{
                        backgroundColor: isSelected ? "#0D0D0A" : "#0d0c0b",
                        border: `1px solid ${isSelected ? "#E8A020" : "rgba(255,255,255,0.10)"}`,
                        color: isSelected ? "#E8A020" : COLOR.ink4,
                        borderRadius: 3,
                        padding: "6px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {region}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "#77736B", fontWeight: 600, marginTop: 16, marginBottom: 8 }}>
                States covered
              </div>
              <div
                style={{
                  backgroundColor: "#0d0c0b",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 4,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: COLOR.ink1,
                }}
              >
                {statesCovered.length > 0 ? statesCovered.join(", ") : "No states assigned"}
              </div>
              <div style={{ fontSize: 11, color: COLOR.ink5, marginTop: 8 }}>Changes here propagate to Coverage Gaps and territory-scoped surfaces.</div>
            </div>

            <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "#77736B", fontWeight: 600, marginBottom: 16 }}>
                Notifications
              </div>
              {[
                { key: "newStars" as const, label: "New rising stars", desc: "Weekly digest of new HCPs in your TA" },
                { key: "scoreChanges" as const, label: "Score changes", desc: "When a saved HCP's score moves significantly" },
                { key: "fieldNotes" as const, label: "Field notes", desc: "When new anonymous notes are added to saved HCPs" },
              ].map(({ key, label, desc }, i, arr) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: 44,
                    borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                    paddingTop: i === 0 ? 0 : 12,
                    paddingBottom: i < arr.length - 1 ? 12 : 0,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: COLOR.ink1 }}>{label}</div>
                    <div style={{ fontSize: 11, color: COLOR.ink4, marginTop: 2 }}>{desc}</div>
                  </div>
                  <Toggle
                    on={notifications[key]}
                    onToggle={() => setNotifications({ ...notifications, [key]: !notifications[key] })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Account section — full width */}
        <div className="fm-profile-account" style={{ padding: "20px 16px 32px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "#77736B", fontWeight: 600, marginBottom: 16 }}>
            Account
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 44,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              cursor: "default",
            }}
          >
            <span style={{ fontSize: 13, color: COLOR.ink1 }}>Data & privacy</span>
            <ChevronRight />
          </div>

          <button
            type="button"
            onClick={() => signOut()}
            style={{
              display: "flex",
              alignItems: "center",
              height: 44,
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: 0,
              width: "100%",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 13, color: "#E05555" }}>Sign out</span>
          </button>
        </div>
      </div>
      </div>
    </AppLayout>
  );
}
