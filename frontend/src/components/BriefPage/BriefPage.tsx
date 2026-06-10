import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { generateBrief, type Brief } from "../../lib/briefs";
import BriefHeader from "./BriefHeader";
import MeetingReadinessBanner from "./MeetingReadinessBanner";
import RelationshipSnapshot from "./RelationshipSnapshot";
import ScientificSnapshot from "./ScientificSnapshot";
import NetworkAndInstitution from "./NetworkAndInstitution";
import StrategicOpportunities from "./StrategicOpportunities";

export default function BriefPage() {
  const { hcpId } = useParams();
  const navigate = useNavigate();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBrief = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateBrief(id);
      setBrief(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setBrief(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hcpId) {
      setError("HCP ID missing");
      setLoading(false);
      return;
    }
    void loadBrief(hcpId);
  }, [hcpId, loadBrief]);

  function handleRetry() {
    if (!hcpId) return;
    void loadBrief(hcpId);
  }

  return (
    <div
      style={{
        backgroundColor: "#0A0A0B",
        padding: 16,
        paddingBottom: 80,
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => navigate(hcpId ? `/hcp/${hcpId}` : "/")}
          aria-label="Back to HCP detail"
          style={{
            background: "none",
            border: "none",
            color: "#9B9892",
            fontSize: 18,
            cursor: "pointer",
            padding: 4,
            lineHeight: 1,
          }}
        >
          {String.fromCharCode(0x2190)}
        </button>
        <span style={{ fontSize: 15, fontWeight: 500, color: "#E8E6DF" }}>Brief</span>
      </div>

      {loading ? (
        <div
          style={{
            fontSize: 15,
            color: "#6B6A65",
            lineHeight: 1.6,
            animation: "briefPulse 2s ease-in-out infinite",
          }}
        >
          <style>{`
            @keyframes briefPulse {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 0.8; }
            }
          `}</style>
          Pulling intelligence... synthesizing opportunities...
        </div>
      ) : null}

      {!loading && error ? (
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginBottom: 8 }}>
            Couldn&apos;t generate brief
          </div>
          <div style={{ fontSize: 13, color: "#9B9892", marginBottom: 16, lineHeight: 1.5 }}>
            {error}
          </div>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              backgroundColor: "#3FB8AF",
              color: "#0A0A0B",
              border: "none",
              borderRadius: 4,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && brief ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <BriefHeader
            hcp={brief.content.hcp}
            generatedAt={brief.generated_at}
            hasRelationship={brief.has_relationship}
          />

          {brief.has_relationship ? (
            <MeetingReadinessBanner
              followUps={brief.content.follow_ups}
              insights={brief.content.insights}
            />
          ) : null}

          <StrategicOpportunities
            opportunities={brief.content.opportunities}
            aiStatus={brief.ai_status}
            aiError={brief.ai_error}
          />

          {brief.has_relationship ? (
            <RelationshipSnapshot
              status={brief.content.relationship.status}
              insights={brief.content.insights}
              followUps={brief.content.follow_ups}
            />
          ) : null}

          <ScientificSnapshot
            publications={brief.content.publications}
            themes={brief.content.themes}
          />

          <NetworkAndInstitution
            collaborators={brief.content.collaborators}
            hcpInstitution={brief.content.hcp.institution}
          />
        </div>
      ) : null}
    </div>
  );
}
