import { useCallback, useEffect, useState } from "react";
import { HCP } from "../../data/hcpData";
import { getCurrentUser } from "../../lib/authHelpers";
import {
  updateRelationshipStatus,
  type Relationship,
  type RelationshipStatus,
} from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";
import StatusEditor from "./StatusEditor";

interface Props {
  hcp: HCP;
}

export default function RelationshipSection({ hcp }: Props) {
  const hcpId = String(hcp.hcp_id ?? hcp.id ?? "");
  const { relationshipMap } = useRelationships();

  const [userId, setUserId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((user) => {
      if (!cancelled) setUserId(user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hcpId) {
      setRelationship(null);
      return;
    }
    const rel = relationshipMap.get(hcpId) ?? null;
    setRelationship(rel);
  }, [hcpId, relationshipMap]);

  const updateStatus = useCallback(
    async (newStatus: RelationshipStatus) => {
      if (!userId || !relationship || pending) return;

      setPending(true);
      try {
        const updated = await updateRelationshipStatus(userId, relationship.id, newStatus);
        setRelationship(updated);
      } catch (err) {
        console.error("RelationshipSection updateStatus failed", err);
      } finally {
        setPending(false);
      }
    },
    [userId, relationship, pending],
  );

  if (!userId || !relationship) return null;

  return (
    <div
      style={{
        padding: "16px",
        borderBottom: "1px solid #1E1E22",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 15,
          color: "#E8E6DF",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        RELATIONSHIP
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            fontSize: 12,
            color: "#9B9892",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            width: 80,
            flexShrink: 0,
          }}
        >
          Status
        </div>
        <StatusEditor
          currentStatus={relationship.status}
          pending={pending}
          onChange={(status) => void updateStatus(status)}
        />
      </div>
    </div>
  );
}
