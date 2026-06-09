import { useCallback, useEffect, useState } from "react";
import { HCP } from "../../data/hcpData";
import { getCurrentUser } from "../../lib/authHelpers";
import {
  getNextActionHistoryForRelationship,
  getOpenNextActionForRelationship,
  updateRelationshipStatus,
  type NextAction,
  type Relationship,
  type RelationshipStatus,
} from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";
import NextActionEditor from "./NextActionEditor";
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
  const [openAction, setOpenAction] = useState<NextAction | null>(null);
  const [lastCompletedAction, setLastCompletedAction] = useState<NextAction | null>(null);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionsNonce, setActionsNonce] = useState(0);

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

  const bumpActionsNonce = useCallback(() => {
    setActionsNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!userId || !relationship?.id) {
      setOpenAction(null);
      setLastCompletedAction(null);
      setActionsLoading(false);
      return;
    }

    let cancelled = false;
    setActionsLoading(true);

    Promise.all([
      getOpenNextActionForRelationship(userId, relationship.id),
      getNextActionHistoryForRelationship(userId, relationship.id),
    ])
      .then(([open, history]) => {
        if (cancelled) return;
        setOpenAction(open);
        const completed = history.find((item) => item.completed_at !== null) ?? null;
        setLastCompletedAction(completed);
      })
      .catch((err) => {
        console.error("RelationshipSection load actions failed", err);
        if (!cancelled) {
          setOpenAction(null);
          setLastCompletedAction(null);
        }
      })
      .finally(() => {
        if (!cancelled) setActionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, relationship?.id, actionsNonce]);

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
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: "#6B6A65",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 500,
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

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: "#6B6A65",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 500,
              flexShrink: 0,
              paddingTop: 6,
            }}
          >
            Next Action
          </div>
          <div style={{ flex: 1, minWidth: 0, opacity: actionsLoading ? 0.6 : 1 }}>
            <NextActionEditor
              userId={userId}
              hcpId={hcpId}
              relationshipId={relationship.id}
              openAction={openAction}
              lastCompletedAction={lastCompletedAction}
              onMutate={bumpActionsNonce}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
