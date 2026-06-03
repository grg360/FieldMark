import { useState, type CSSProperties, type ReactNode } from "react";
import { FiChip, FiModal } from "./FieldIntelligenceShared";
import { FI_ACCENT_MUTED } from "../lib/fieldIntelligenceUi";

const NSCLC_SUBSPECIALTY = [
  "EGFR-mutant",
  "ALK / ROS1",
  "KRAS G12C",
  "Immunotherapy-naive",
  "Squamous",
  "Stage IV first-line",
  "Adjuvant",
  "Neoadjuvant",
];

const GENERIC_SUBSPECIALTY = [
  "Early-phase trials",
  "Real-world evidence",
  "Biomarker-driven care",
  "Community practice",
];

const ENGAGEMENT_STYLE = ["Advisory board", "1:1 scientific exchange", "Didactic presentation", "Hybrid / context-dependent"];

const REFERRAL_POSITION = [
  "Community leader (drives referrals into network)",
  "Academic connector (cross-institutional)",
  "Silo'd practice (limited cross-referral)",
  "Insufficient signal",
];

const COMMUNICATION = ["Email", "In-person", "Virtual / video", "Conference"];

interface ContextualizeHCPFormProps {
  hcpName: string;
  therapeuticArea?: string;
  onClose: () => void;
  onSubmit: () => void;
}

export default function ContextualizeHCPForm({
  hcpName,
  therapeuticArea,
  onClose,
  onSubmit,
}: ContextualizeHCPFormProps) {
  const [subspecialty, setSubspecialty] = useState<Set<string>>(new Set());
  const [engagement, setEngagement] = useState<string | null>(null);
  const [referral, setReferral] = useState<string | null>(null);
  const [communication, setCommunication] = useState<Set<string>>(new Set());

  const subOptions =
    therapeuticArea === "Oncology" || therapeuticArea === "NSCLC" ? NSCLC_SUBSPECIALTY : GENERIC_SUBSPECIALTY;

  const toggleMulti = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  };

  return (
    <FiModal title={`Add context for ${hcpName}`} onClose={onClose}>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: FI_ACCENT_MUTED, lineHeight: 1.5 }}>
        Your contribution is private to you. FieldMark surfaces only aggregated signals (when 3+ MSLs contribute the
        same field) on the public HCP profile.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Section title="Sub-specialty depth (multi-select)">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {subOptions.map((opt) => (
              <FiChip
                key={opt}
                label={opt}
                selected={subspecialty.has(opt)}
                multi
                onClick={() => toggleMulti(subspecialty, opt, setSubspecialty)}
              />
            ))}
          </div>
        </Section>

        <Section title="Engagement style preference">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ENGAGEMENT_STYLE.map((opt) => (
              <FiChip
                key={opt}
                label={opt}
                selected={engagement === opt}
                onClick={() => setEngagement(engagement === opt ? null : opt)}
              />
            ))}
          </div>
        </Section>

        <Section title="Referral network position">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {REFERRAL_POSITION.map((opt) => (
              <FiChip
                key={opt}
                label={opt}
                selected={referral === opt}
                onClick={() => setReferral(referral === opt ? null : opt)}
              />
            ))}
          </div>
        </Section>

        <Section title="Communication preference (multi-select)">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {COMMUNICATION.map((opt) => (
              <FiChip
                key={opt}
                label={opt}
                selected={communication.has(opt)}
                multi
                onClick={() => toggleMulti(communication, opt, setCommunication)}
              />
            ))}
          </div>
        </Section>
      </div>

      <button type="button" onClick={onSubmit} style={{ ...primaryBtnStyle, marginTop: 24 }}>
        Save context
      </button>
    </FiModal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.5)", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

const primaryBtnStyle: CSSProperties = {
  width: "100%",
  padding: 12,
  background: "rgba(120, 200, 255, 0.12)",
  border: "1px solid rgba(120, 200, 255, 0.35)",
  borderRadius: 4,
  color: "rgba(120, 200, 255, 1)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
};
