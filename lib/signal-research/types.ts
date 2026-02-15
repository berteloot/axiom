/**
 * Generic sales intelligence research schema.
 * User prompts define the research focus (e.g., SAP, cloud migration, AI adoption).
 */

export type SignalStrength = "STRONG" | "MODERATE" | "WEAK" | "NONE";

export type SignalCategory =
  | "website"
  | "job_postings"
  | "press_news"
  | "forums_communities"
  | "partner_vendor"
  | string; // Allow custom categories from user prompt

export interface ResearchSignal {
  category: SignalCategory;
  strength: SignalStrength;
  keyEvidence: string;
  sourceUrls: string[];
  actionableInsight?: string;
  recommendedNextStep?: string;
}

export interface CompanyResearch {
  company: string;
  industry?: string;
  revenue?: string;
  employees?: string;
  currentSystem?: string; // e.g., current ERP
  overallScore: number; // 1-10
  salesOpportunity?: string;
  keyEvidence?: string;
  keyDecisionMakers?: Array<{ name: string; title: string }>;
  signals: ResearchSignal[];
}

export interface ResearchOutput {
  researchFocus: string;
  industry?: string;
  companies: CompanyResearch[];
}

export type PriorityTier = "P1-HOT" | "P2-WARM" | "P3-NURTURE" | "P4-LOW";

export interface ActionPlanItem {
  priority: PriorityTier;
  company: string;
  action: string;
  keyContact?: string;
  timing?: string;
  rationale: string;
}
