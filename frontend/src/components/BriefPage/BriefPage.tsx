import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { generateBrief, type Brief } from "../../lib/briefs";
import AppLayout from "../AppLayout";
import BriefHeader from "./BriefHeader";
import MeetingReadinessBanner from "./MeetingReadinessBanner";
import CollapsibleSection from "./CollapsibleSection";
import RelationshipSnapshot from "./RelationshipSnapshot";
import ScientificSnapshot from "./ScientificSnapshot";
import NetworkAndInstitution from "./NetworkAndInstitution";
import StrategicOpportunities from "./StrategicOpportunities";
import { useIsDesktop } from "../../lib/useIsDesktop";

export default function BriefPage() {
  const { hcpId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
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

  const breadcrumbs = brief?.content.hcp
    ? [
        { label: "Home", path: "/me" },
        { label: brief.content.hcp.name, path: hcpId ? `/hcp/${hcpId}` : undefined },
        { label: "Brief" },
      ]
    : [
        { label: "Home", path: "/me" },
        { label: "Brief" },
      ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="reading">

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

      {!loading && brief ? (() => {
        const overdueCount = brief.content.follow_ups.filter((f) => f.overdue).length;
        const relationshipDefaultOpen = overdueCount > 0;

        return (
        <>
          <BriefHeader
            hcp={brief.content.hcp}
            generatedAt={brief.generated_at}
            hasRelationship={brief.has_relationship}
          />

          {isDesktop ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, marginTop: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
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
                  hcpId={brief.hcp_id}
                  userId={brief.user_id}
                />
              </div>

              <div style={{ position: "sticky", top: 16, alignSelf: "start", display: "flex", flexDirection: "column", gap: 0 }}>
                {brief.has_relationship ? (
                  <CollapsibleSection title="Relationship Context" defaultOpen={true}>
                    <RelationshipSnapshot
                      status={brief.content.relationship.status}
                      insights={brief.content.insights}
                      followUps={brief.content.follow_ups}
                    />
                  </CollapsibleSection>
                ) : null}

                <CollapsibleSection title="Scientific Activity" defaultOpen={true}>
                  <ScientificSnapshot
                    publications={brief.content.publications}
                    themes={brief.content.themes}
                  />
                </CollapsibleSection>

                <CollapsibleSection title="Network & Institution" defaultOpen={true}>
                  <NetworkAndInstitution
                    collaborators={brief.content.collaborators}
                    hcpInstitution={brief.content.hcp.institution}
                  />
                </CollapsibleSection>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
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
                hcpId={brief.hcp_id}
                userId={brief.user_id}
              />

              {brief.has_relationship ? (
                <CollapsibleSection title="Relationship Context" defaultOpen={relationshipDefaultOpen}>
                  <RelationshipSnapshot
                    status={brief.content.relationship.status}
                    insights={brief.content.insights}
                    followUps={brief.content.follow_ups}
                  />
                </CollapsibleSection>
              ) : null}

              <CollapsibleSection title="Scientific Activity" defaultOpen={false}>
                <ScientificSnapshot
                  publications={brief.content.publications}
                  themes={brief.content.themes}
                />
              </CollapsibleSection>

              <CollapsibleSection title="Network & Institution" defaultOpen={false}>
                <NetworkAndInstitution
                  collaborators={brief.content.collaborators}
                  hcpInstitution={brief.content.hcp.institution}
                />
              </CollapsibleSection>
            </div>
          )}
        </>
        );
      })() : null}

    </AppLayout>
  );
}
