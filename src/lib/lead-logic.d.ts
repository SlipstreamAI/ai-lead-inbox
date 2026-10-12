export type Timeline = "asap" | "this_month" | "this_quarter" | "this_year" | "exploring";
export type Tier = "hot" | "warm" | "cold" | "disqualified";
export type BudgetBand = "under_1500" | "1500_4999" | "5000_14999" | "15000_plus" | "unknown";

export type Lead = {
  name: string;
  email: string;
  company: string;
  role: string;
  website: string;
  message: string;
  budgetUsd: number | null;
  budgetBand: BudgetBand;
  budgetLabel: string;
  timeline: Timeline;
  source: string;
};

export type ScoreBreakdown = {
  budget: number;
  timeline: number;
  emailDomain: number;
  seniority: number;
  intent: number;
  website: number;
  penalties: number;
};

export type ScoredLead = {
  score: number;
  breakdown: ScoreBreakdown;
  flags: string[];
};

export type Routing = {
  tier: Tier;
  owner: string;
  ownerRole: string;
  channel: string;
  slaMinutes: number;
  reason: string;
};

export type Enrichment = {
  industry: string;
  companySize: string;
  intentSummary: string;
  painPoints: string[];
  personalizationHooks: string[];
  recommendedNextAction: string;
  draftSubject: string;
  draftBody: string;
  provider: string;
  model: string;
  scoreUsed?: number;
};

export type PipelineStep = {
  name: string;
  status: "ok" | "error";
  detail: string;
  ms: number;
};

export type JevDecision = {
  used: true;
  model: string;
  rawScore: number;
  scoreConfidence: number;
  route: string;
  routeConfidence: number;
  intent: string;
  intentConfidence: number;
  gates: { spam: number; urgent: number; needsHuman: number };
  confidenceThreshold: number;
  heldForReview: boolean;
  holdReasons: string[];
  probabilities?: {
    score?: Record<string, number>;
    route?: Record<string, number>;
    intent?: Record<string, number>;
  };
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type LeadRecord = Lead & {
  id: string;
  createdAt: string;
  score: number;
  breakdown: ScoreBreakdown;
  flags: string[];
  tier: Tier;
  owner: string;
  ownerRole: string;
  channel: string;
  slaMinutes: number;
  routeReason: string;
  industry: string;
  companySize: string;
  intentSummary: string;
  painPoints: string[];
  personalizationHooks: string[];
  nextAction: string;
  draftSubject: string;
  draftBody: string;
  llmProvider: string;
  llmModel: string;
  alertStatus: string;
  alertId: string;
  origin: string;
  steps: PipelineStep[];
  jev?: JevDecision;
};

export type SlackPayload = {
  text: string;
  blocks: unknown[];
};

export type StoredAlert = {
  id: string;
  leadId: string;
  createdAt: string;
  channel: string;
  payload: SlackPayload;
  delivery: string;
  deliveryStatus: string;
  deliveryDetail: string;
};

export function validateLead(input: unknown):
  | { ok: true; lead: Lead }
  | { ok: false; errors: Record<string, string> };

export function scoreLead(lead: Lead): ScoredLead;
export function routeLead(lead: Lead, scored: ScoredLead): Routing;
export function mockEnrich(lead: Lead, scored: ScoredLead, routing: Routing): Enrichment;
export function buildEnrichmentPrompt(
  lead: Lead,
  scored: ScoredLead,
  routing: Routing,
): { system: string; user: string };
export function normalizeEnrichment(parsed: unknown, provider: string, model: string): Enrichment;
export function extractJsonObject(content: string): unknown;
export function createId(prefix: string, now?: number, rand?: number): string;
export function assembleRecord(
  lead: Lead,
  scored: ScoredLead,
  routing: Routing,
  enrichment: Enrichment,
  meta: {
    id: string;
    createdAt: string;
    origin?: string;
    steps?: PipelineStep[];
    alertStatus?: string;
    alertId?: string;
  },
): LeadRecord;
export function buildSlackPayload(record: LeadRecord): SlackPayload;
export function csvEscape(value: unknown): string;
export function leadsToCsv(records: LeadRecord[]): string;
export function assertStoredRecord(record: unknown): LeadRecord;
export function budgetLabel(amount: number | null): string;
export function inferIndustry(lead: Lead): string;

export const TIMELINE_LABELS: Record<Timeline, string>;
export const TIER_LABELS: Record<Tier, string>;
export const BREAKDOWN_META: { key: keyof ScoreBreakdown; label: string; max: number }[];
export const CSV_HEADERS: string[];
