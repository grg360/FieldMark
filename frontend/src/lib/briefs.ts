import { supabase } from "./supabase";

export interface BriefHcp {
  id: string;
  name: string;
  institution: string;
  specialty: string;
  archetype: string | null;
  score: number | null;
  rank: number | null;
  rank_total: number | null;
}

export interface BriefRelationship {
  exists: boolean;
  status: string | null;
  first_added_at: string | null;
}

export interface BriefInsight {
  body: string;
  interaction_type: string;
  insight_strength: string;
  occurred_at: string;
}

export interface BriefFollowUp {
  body: string;
  due_at: string | null;
  priority: string;
  overdue: boolean;
}

export interface BriefPublication {
  title: string;
  year: number;
}

export interface BriefCollaborator {
  name: string;
  institution: string | null;
}

export type EvidenceType = "insight" | "follow_up" | "publication" | "theme" | "collaborator";

export interface OpportunityEvidence {
  type: EvidenceType;
  label: string;
}

export interface Opportunity {
  recommendation: string;
  supporting_evidence: OpportunityEvidence[];
}

export interface BriefContent {
  version: 1;
  hcp: BriefHcp;
  relationship: BriefRelationship;
  insights: BriefInsight[];
  follow_ups: BriefFollowUp[];
  publications: BriefPublication[];
  themes: string[];
  collaborators: BriefCollaborator[];
  opportunities: Opportunity[] | null;
}

export type AiStatus = "pending" | "generated" | "failed" | "skipped";

export interface Brief {
  id: string;
  user_id: string;
  hcp_id: string;
  has_relationship: boolean;
  content: BriefContent;
  ai_status: AiStatus;
  ai_error: string | null;
  generated_at: string;
  expires_at: string;
}

export async function generateBrief(hcpId: string): Promise<Brief> {
  const { data, error } = await supabase.functions.invoke<Brief>("generate-brief", {
    body: { hcpId },
  });
  if (error) {
    console.warn("generateBrief: invoke error", error);
    throw error;
  }
  if (!data) {
    throw new Error("Brief response was empty");
  }
  return data;
}
