import { useState, type CSSProperties, type ReactNode } from "react";
import { FiChip, FiModal } from "./FieldIntelligenceShared";

interface OptOutRequestFormProps {
  hcpName: string;
  onClose: () => void;
  onSubmit: () => void;
}

export default function OptOutRequestForm({ hcpName, onClose, onSubmit }: OptOutRequestFormProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <FiModal title={`Profile options — ${hcpName}`} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card
          title="Request opt-out"
          description="Remove my profile from the public-facing FieldMark platform"
        >
          <label style={labelStyle}>
            Name
            <input type="text" style={inputStyle} defaultValue={hcpName.replace(/^Dr\.\s*/i, "")} />
          </label>
          <label style={labelStyle}>
            Email
            <input type="email" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            ORCID (optional)
            <input type="text" style={inputStyle} />
          </label>
          <FiChip
            label="I am the HCP named above, or their authorized representative"
            selected={confirmed}
            onClick={() => setConfirmed(!confirmed)}
          />
          <button type="button" onClick={onSubmit} style={{ ...primaryBtnStyle, marginTop: 12 }}>
            Submit opt-out request
          </button>
        </Card>

        <Card title="Claim my profile" description="Verify my identity and gain visibility into how I appear on FieldMark">
          <label style={labelStyle}>
            Name
            <input type="text" style={inputStyle} defaultValue={hcpName.replace(/^Dr\.\s*/i, "")} />
          </label>
          <label style={labelStyle}>
            Email
            <input type="email" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            ORCID (optional)
            <input type="text" style={inputStyle} />
          </label>
          <FiChip
            label="I am the HCP named above, or their authorized representative"
            selected={false}
            onClick={() => {}}
          />
          <button type="button" onClick={onSubmit} style={{ ...primaryBtnStyle, marginTop: 12 }}>
            Submit claim request
          </button>
        </Card>
      </div>
    </FiModal>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: 16,
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(232, 230, 223, 1)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.6)", marginBottom: 16, lineHeight: 1.5 }}>
        {description}
      </div>
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "rgba(232, 230, 223, 0.5)",
  marginBottom: 12,
};

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  background: "rgba(255, 255, 255, 0.04)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: 4,
  color: "rgba(232, 230, 223, 1)",
  fontSize: 14,
  fontFamily: "system-ui, sans-serif",
};

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
