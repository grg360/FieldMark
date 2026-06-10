const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function plural(n: number, singular: string): string {
  return n === 1 ? `${n} ${singular} ago` : `${n} ${singular}s ago`;
}

export function formatOccurredAt(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) return "Today";
  if (diffHours < 48) return "Yesterday";

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return `${diffDays} days ago`;

  return formatShortDate(then);
}

export function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return plural(diffMins, "minute");

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return plural(diffHours, "hour");

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return plural(diffDays, "day");

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return plural(diffWeeks, "week");

  return formatShortDate(then);
}
