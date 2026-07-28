// Batched loader for the discuss affordance on publication cards. Every card
// asks whether its PMID has a forum anchor; requests within a tick are coalesced
// into one .in() query and cached, so a bibliography of N cards costs one query,
// not N. Read-only.

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { DiscussAffordance } from "../../lib/fieldIntelligence";

const cache = new Map<string, DiscussAffordance | null>();
let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const waiters: { pmid: string; resolve: (v: DiscussAffordance | null) => void }[] = [];

async function flush() {
  flushTimer = null;
  const ids = [...pending];
  pending = new Set();
  const current = waiters.splice(0, waiters.length);
  if (ids.length === 0) return;

  const { data } = await supabase
    .from("field_intel_anchors")
    .select("id, pubmed_id, reply_count, thread_count, threads:field_intel_threads(id, recency_label, is_primary)")
    .in("pubmed_id", ids);

  const found = new Map<string, DiscussAffordance>();
  for (const a of (data ?? []) as any[]) {
    const threads = (a.threads ?? []) as { id: string; recency_label: string; is_primary: boolean }[];
    const primary = threads.find((t) => t.is_primary) ?? threads[0] ?? null;
    found.set(a.pubmed_id, {
      pubmed_id: a.pubmed_id,
      anchor_id: a.id,
      reply_count: a.reply_count,
      thread_count: a.thread_count,
      recency_label: primary?.recency_label ?? null,
      primary_thread_id: primary?.id ?? null,
    });
  }
  for (const id of ids) cache.set(id, found.get(id) ?? null);
  for (const w of current) w.resolve(cache.get(w.pmid) ?? null);
}

// Drop a cached entry so a card re-fetches after a thread is created on it.
export function invalidateAffordance(pmid: string) {
  cache.delete(pmid);
}

function request(pmid: string): Promise<DiscussAffordance | null> {
  if (cache.has(pmid)) return Promise.resolve(cache.get(pmid) ?? null);
  return new Promise((resolve) => {
    pending.add(pmid);
    waiters.push({ pmid, resolve });
    if (!flushTimer) flushTimer = setTimeout(flush, 30);
  });
}

// Returns: undefined while loading, then DiscussAffordance | null (null = no anchor).
export function useDiscussAffordance(pmid: string | null | undefined): DiscussAffordance | null | undefined {
  const [state, setState] = useState<DiscussAffordance | null | undefined>(
    pmid && cache.has(pmid) ? cache.get(pmid) : undefined,
  );
  useEffect(() => {
    if (!pmid) { setState(null); return; }
    let cancelled = false;
    request(pmid).then((v) => { if (!cancelled) setState(v); });
    return () => { cancelled = true; };
  }, [pmid]);
  return state;
}
