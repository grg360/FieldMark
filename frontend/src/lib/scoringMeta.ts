// Scoring freshness — the last date the scoring chain ran, from the DB rather
// than a hardcoded string (2026-08-05). Surfaces that document or depend on the
// scoring stamp their hero with "current as of {date}" so the claim never goes
// stale silently — the Methodology page had described a six-week-old formula.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

let cached: string | null | undefined;

export function formatScoringDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

export function useScoringDate(): string | null {
  const [iso, setIso] = useState<string | null>(cached ?? null);
  useEffect(() => {
    if (cached !== undefined) return;
    let alive = true;
    void supabase.rpc("scoring_current_as_of").then(({ data }) => {
      cached = (data as string | null) ?? null;
      if (alive) setIso(cached);
    });
    return () => { alive = false; };
  }, []);
  return iso;
}
