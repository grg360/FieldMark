import { PULSE_SYNTHESIS_BY_TA } from "./pulseFixture";

// Pulse TA-level synthesis reader — FROZEN (option B on the window pin).
//
// The prototype returns a static, pre-captured paragraph that matches the frozen
// Apr–Jun payload in pulseFixture.ts, and makes NO network or model call. The
// Edge Function get_pulse_synthesis_facts computes its window from current_date,
// so it diverges from the pinned fixture on 1 Aug 2026 — a live call would then
// return a paragraph for a different window (and live DB numbers) than the theme
// list renders. Freezing keeps the page internally consistent.
//
// The Edge Function (generate-pulse-synthesis) and its prompt are UNCHANGED and
// remain the source of truth for the future live path. When the persisted-
// snapshot API lands (option D), restore the cache-read-then-generate flow here
// (see git history) so the window, the numbers, and the paragraph float together.

export interface PulseSynthesis {
  body: string;
  cached: boolean;
  generated_at: string;
}

export async function getPulseSynthesis(
  taSlug: string,
  windowStart: string,
  windowEnd: string,
): Promise<PulseSynthesis | null> {
  const frozen = PULSE_SYNTHESIS_BY_TA[taSlug];
  if (frozen && frozen.window_start === windowStart && frozen.window_end === windowEnd) {
    return { body: frozen.body, cached: true, generated_at: frozen.generated_at };
  }
  return null;
}
