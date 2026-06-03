import { THEME_QUESTIONS } from "./mockThemeQuestions";
import type { ThemeAggregateResponse } from "../types/researchTheme";

function hashThemeId(themeId: string): number {
  let hash = 0;
  for (let i = 0; i < themeId.length; i++) {
    hash = (hash + themeId.charCodeAt(i) * 31) | 0;
  }
  return Math.abs(hash);
}

function pickWeightedCounts(
  optionValues: string[],
  total: number,
  seed: number,
): Record<string, number> {
  const weights = optionValues.map((_, idx) => ((seed + idx * 17) % 7) + 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const counts: Record<string, number> = {};
  let assigned = 0;

  optionValues.forEach((value, idx) => {
    const isLast = idx === optionValues.length - 1;
    const count = isLast
      ? total - assigned
      : Math.max(0, Math.round((weights[idx] / weightSum) * total));
    counts[value] = count;
    assigned += count;
  });

  const diff = total - Object.values(counts).reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    const bumpKey = optionValues[seed % optionValues.length];
    counts[bumpKey] = (counts[bumpKey] ?? 0) + diff;
  }

  return counts;
}

export function getMockAggregateForTheme(themeId: string): ThemeAggregateResponse[] {
  const seed = hashThemeId(themeId);
  const totalResponses = 8 + (seed % 17);

  return THEME_QUESTIONS.map((question, qIdx) => {
    const optionValues = question.options.map((o) => o.value);
    const qSeed = seed + qIdx * 101;
    const skewedTotal = Math.max(4, totalResponses - (qIdx % 3));
    return {
      question_id: question.id,
      total_responses: skewedTotal,
      option_counts: pickWeightedCounts(optionValues, skewedTotal, qSeed),
    };
  });
}

export function totalAggregateResponses(aggregates: ThemeAggregateResponse[]): number {
  if (!aggregates.length) return 0;
  return aggregates[0]?.total_responses ?? 0;
}
