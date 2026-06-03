export type ThemeCentrality = "core" | "supporting" | "peripheral";

export interface ResearchTheme {
  id: string;
  hcp_id: string;
  theme_name: string;
  centrality: ThemeCentrality;
  paper_count: number;
  display_rank: number | null;
  example_pmids: string[];
  therapeutic_area: string;
  extracted_at: string;
}

export interface ThemeQuestion {
  id: string;
  prompt: string;
  options: {
    value: string;
    label: string;
  }[];
}

export interface ThemeAggregateResponse {
  question_id: string;
  total_responses: number;
  option_counts: { [option_value: string]: number };
}
