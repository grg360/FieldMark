import type { FollowUpFilterStatus } from "../../lib/home";

interface Props {
  statusFilter: FollowUpFilterStatus;
  hasAnyFilter: boolean;
}

export default function FollowUpsEmptyState({ statusFilter, hasAnyFilter }: Props) {
  if (statusFilter === "completed") {
    return (
      <div style={{ padding: "72px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#E8E6DF", fontWeight: 500, marginBottom: 8 }}>
          No completed follow-ups yet.
        </div>
        <div style={{ fontSize: 13, color: "#6B6A65", lineHeight: 1.5 }}>
          Completed work will appear here.
        </div>
      </div>
    );
  }

  if (hasAnyFilter) {
    return (
      <div style={{ padding: "72px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#E8E6DF", fontWeight: 500, marginBottom: 8 }}>
          No follow-ups match your filters.
        </div>
        <div style={{ fontSize: 13, color: "#6B6A65", lineHeight: 1.5 }}>
          Try adjusting filters above.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "80px 24px", textAlign: "center" }}>
      <div
        style={{
          fontSize: 36,
          color: "#3FB8AF",
          fontWeight: 700,
          marginBottom: 16,
          lineHeight: 1,
        }}
      >
        {String.fromCharCode(0x2713)}
      </div>
      <div style={{ fontSize: 18, color: "#E8E6DF", fontWeight: 600, marginBottom: 10 }}>
        You&apos;re all caught up.
      </div>
      <div style={{ fontSize: 13, color: "#6B6A65", lineHeight: 1.6, maxWidth: 420, margin: "0 auto" }}>
        Follow-ups appear here when you create them from HCP pages or save AI recommendations from Briefs.
      </div>
    </div>
  );
}
