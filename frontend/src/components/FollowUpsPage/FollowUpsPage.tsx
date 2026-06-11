import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../lib/authHelpers";
import {
  getFollowUpsForUser,
  getFollowUpStats,
  markFollowUpComplete,
  snoozeFollowUp,
  type FollowUpRow as FollowUpRowType,
  type FollowUpStats,
  type FollowUpSource,
  type FollowUpFilterPriority,
  type FollowUpFilterStatus,
} from "../../lib/home";
import AppLayout from "../AppLayout";
import FollowUpsHero from "./FollowUpsHero";
import FollowUpsFilterBar from "./FollowUpsFilterBar";
import FollowUpsBucketSection from "./FollowUpsBucketSection";
import FollowUpsEmptyState from "./FollowUpsEmptyState";

export default function FollowUpsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<FollowUpRowType[]>([]);
  const [stats, setStats] = useState<FollowUpStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FollowUpFilterStatus>("open");
  const [priorityFilter, setPriorityFilter] = useState<FollowUpFilterPriority>("all");
  const [sourceFilter, setSourceFilter] = useState<FollowUpSource>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user || cancelled) return;
        setUserId(user.id);
      } catch (err) {
        console.warn("FollowUpsPage: get user error", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [rowsData, statsData] = await Promise.all([
        getFollowUpsForUser(userId, {
          status: statusFilter,
          priority: priorityFilter,
          source: sourceFilter,
        }),
        getFollowUpStats(userId),
      ]);
      setRows(rowsData);
      setStats(statsData);
    } catch (err) {
      console.warn("FollowUpsPage: refresh error", err);
    } finally {
      setLoading(false);
    }
  }, [userId, statusFilter, priorityFilter, sourceFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleComplete = useCallback(
    async (followUpId: string) => {
      if (!userId) return;
      try {
        await markFollowUpComplete(userId, followUpId);
        await refresh();
      } catch (err) {
        console.warn("handleComplete error", err);
      }
    },
    [userId, refresh],
  );

  const handleSnooze = useCallback(
    async (followUpId: string, newDueAt: string) => {
      if (!userId) return;
      try {
        await snoozeFollowUp(userId, followUpId, newDueAt);
        await refresh();
      } catch (err) {
        console.warn("handleSnooze error", err);
      }
    },
    [userId, refresh],
  );

  const grouped = useMemo(() => {
    const now = Date.now();
    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;
    const buckets = {
      overdue: [] as FollowUpRowType[],
      thisWeek: [] as FollowUpRowType[],
      future: [] as FollowUpRowType[],
      noDueDate: [] as FollowUpRowType[],
    };
    for (const row of rows) {
      if (statusFilter === "completed") {
        buckets.future.push(row);
        continue;
      }
      if (row.due_at === null) buckets.noDueDate.push(row);
      else {
        const ts = new Date(row.due_at).getTime();
        if (ts < now) buckets.overdue.push(row);
        else if (ts < weekFromNow) buckets.thisWeek.push(row);
        else buckets.future.push(row);
      }
    }
    return buckets;
  }, [rows, statusFilter]);

  const breadcrumbs = [
    { label: "Home", path: "/me" },
    { label: "Follow-Ups" },
  ];

  const isCompletedView = statusFilter === "completed";

  const sectionProps = {
    onComplete: handleComplete,
    onSnooze: handleSnooze,
    onViewHcp: (hcpId: string) => navigate(`/hcp/${hcpId}`),
    onGenerateBrief: (hcpId: string) => navigate(`/hcp/${hcpId}/brief`),
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <FollowUpsHero stats={stats} />

      <FollowUpsFilterBar
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        sourceFilter={sourceFilter}
        onStatusChange={setStatusFilter}
        onPriorityChange={setPriorityFilter}
        onSourceChange={setSourceFilter}
      />

      {loading && rows.length === 0 ? (
        <div style={{ fontSize: 14, color: "#6B6A65", padding: "48px 0", textAlign: "center" }}>
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <FollowUpsEmptyState
          statusFilter={statusFilter}
          hasAnyFilter={priorityFilter !== "all" || sourceFilter !== "all"}
        />
      ) : isCompletedView ? (
        <div style={{ marginTop: 32 }}>
          <FollowUpsBucketSection
            label="Completed"
            tint="none"
            rows={rows}
            isCompletedView
            {...sectionProps}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 36, marginTop: 32 }}>
          {grouped.overdue.length > 0 ? (
            <FollowUpsBucketSection
              label="Overdue"
              tint="red"
              rows={grouped.overdue}
              {...sectionProps}
            />
          ) : null}
          {grouped.thisWeek.length > 0 ? (
            <FollowUpsBucketSection
              label="This Week"
              tint="amber"
              rows={grouped.thisWeek}
              {...sectionProps}
            />
          ) : null}
          {grouped.future.length > 0 ? (
            <FollowUpsBucketSection
              label="Future"
              tint="none"
              rows={grouped.future}
              {...sectionProps}
            />
          ) : null}
          {grouped.noDueDate.length > 0 ? (
            <FollowUpsBucketSection
              label="No Due Date"
              tint="none"
              rows={grouped.noDueDate}
              {...sectionProps}
            />
          ) : null}
        </div>
      )}
    </AppLayout>
  );
}
