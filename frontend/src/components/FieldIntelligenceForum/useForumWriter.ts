// Is the current user allowed to write to the forum? Mirrors the server gate
// (fi_can_write RPC → auth.uid() = the single founder id). Cached once per load;
// the DB is the real authority, this only decides whether to render active vs
// inert affordances.

import { useEffect, useState } from "react";
import { canWriteForum } from "../../lib/fieldIntelligence";

let cached: boolean | undefined;
let inflight: Promise<boolean> | null = null;

function resolveCanWrite(): Promise<boolean> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inflight) {
    inflight = canWriteForum().then((v) => {
      cached = v;
      inflight = null;
      return v;
    });
  }
  return inflight;
}

export function useForumWriter(): boolean {
  const [canWrite, setCanWrite] = useState<boolean>(cached ?? false);
  useEffect(() => {
    let cancelled = false;
    resolveCanWrite().then((v) => { if (!cancelled) setCanWrite(v); });
    return () => { cancelled = true; };
  }, []);
  return canWrite;
}
