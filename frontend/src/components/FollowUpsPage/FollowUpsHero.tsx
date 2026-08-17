// Follow-Ups hero — canonical H1 (PageHero, Commit B 2026-08-05). The old
// metric-as-title (52px count with a side label) becomes a proper masthead:
// the surface gets a name, and the counts move to the stats cluster where
// every other register surface keeps them. Overdue keeps its alert color.
import PageHero from "../PageHero";
import { COLOR, FONT, COOL } from "../../lib/designTokens";
import type { FollowUpStats } from "../../lib/home";

interface Props {
  stats: FollowUpStats | null;
}

export default function FollowUpsHero({ stats }: Props) {
  const cluster = [
    { value: String(stats?.open_total ?? 0), label: "OPEN", gold: (stats?.open_total ?? 0) > 0 },
    ...(stats && stats.overdue > 0 ? [{ value: String(stats.overdue), label: "OVERDUE", valueColor: COLOR.danger }] : []),
    ...(stats && stats.due_this_week > 0 ? [{ value: String(stats.due_this_week), label: "DUE THIS WEEK" }] : []),
    ...(stats && stats.future > 0 ? [{ value: String(stats.future), label: "FUTURE" }] : []),
    ...(stats && stats.no_due_date > 0 ? [{ value: String(stats.no_due_date), label: "NO DUE DATE" }] : []),
  ];
  return (
    <div style={{ padding: "10px 0 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <PageHero eyebrow="Fieldmark · Follow-ups" meta={stats ? `${stats.completion_rate_30d}% CLOSED · 30D` : undefined} title="Follow-Ups" stats={{ variant: "cluster", items: cluster }} />
      {stats && (stats.completed_this_month > 0 || stats.completion_rate_30d > 0) ? (
        <div style={{ marginTop: 14, fontFamily: FONT.mono, fontSize: 11, color: COOL.label, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>Completed: {stats.completed_this_month} this month</span>
          <span>{String.fromCharCode(0x00b7)}</span>
          <span>{stats.completion_rate_30d}% completion rate (30d)</span>
          {stats.median_close_days_30d !== null ? (
            <>
              <span>{String.fromCharCode(0x00b7)}</span>
              <span>{stats.median_close_days_30d}-day median close</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
