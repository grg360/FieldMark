// Drug Intelligence — asset page data layer.
//
// One call per panel, fired in parallel. The RPCs are read-only SECURITY DEFINER
// aggregations (migrations/2026_07_28_asset_page_rpcs.sql); the rules live in
// assetLogic.ts. A panel that errors resolves to an empty payload so one dead
// query never blanks the whole page — and an empty panel renders the honest empty
// state rather than a spinner that never ends.

import { supabase } from "./supabase";
import type { CompositionPayload, CitationYear, OpenAccess } from "./assetLogic";

export interface AssetOverview {
  generic: string;
  total_pubs: number;
  ytd_2026: number;
  themed: number;
  open_access: number;
  authors_resolved: number;
  board_ranked: number;
  author_strings: number;
  earliest_year: number | null;
  trajectory_resolved: number;
}

export interface LandingPaper {
  id: string;
  title: string;
  journal: string | null;
  pub_year: number;
  citation_count: number | null;
  publication_types: string[] | null;
  open_access: OpenAccess | null;
  doi: string | null;
  citation_counts_by_year: CitationYear[] | null;
  short_name: string | null;
}
export interface LandingPayload {
  papers: LandingPaper[];
  total_pubs: number;
  no_trajectory_count: number;
}

export interface AuthorRow {
  hcp_id: string;
  c: number;
  first_name: string | null;
  last_name: string | null;
  board_rank: number | null;
  scope_value: string | null;
  scope_type: string | null;
}
export interface AuthorsPayload {
  authors: AuthorRow[];
  resolved: number;
  board_ranked: number;
  author_strings: number;
}

export interface CongressPresenter {
  hcp_id: string;
  name: string;
  congress: string;
  established_rank: number | null;
  rising_rank: number | null;
}

export interface ForumThread {
  id: string;
  title: string;
  reply_count: number | null;
  recency_label: string | null;
  scope_label: string | null;
}

export interface AssetPageData {
  overview: AssetOverview | null;
  composition: CompositionPayload;
  landing: LandingPayload;
  authors: AuthorsPayload;
  congress: CongressPresenter[];
  forum: ForumThread[];
}

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`${fn} failed:`, error.message);
    return fallback;
  }
  return (data as T) ?? fallback;
}

export async function loadAssetPage(generic: string): Promise<AssetPageData> {
  const [overview, composition, landing, authors, congress, forum] = await Promise.all([
    rpc<AssetOverview | null>("asset_overview", { p_generic: generic }, null),
    rpc<CompositionPayload>("asset_composition", { p_generic: generic }, {
      per_year: [],
      per_theme: [],
    }),
    rpc<LandingPayload>("asset_landing", { p_generic: generic, p_limit: 6 }, {
      papers: [],
      total_pubs: 0,
      no_trajectory_count: 0,
    }),
    rpc<AuthorsPayload>("asset_authors", { p_generic: generic, p_limit: 6 }, {
      authors: [],
      resolved: 0,
      board_ranked: 0,
      author_strings: 0,
    }),
    rpc<CongressPresenter[]>("asset_congress", { p_generic: generic }, []),
    rpc<ForumThread[]>("asset_forum", { p_generic: generic }, []),
  ]);

  return { overview, composition, landing, authors, congress, forum };
}
