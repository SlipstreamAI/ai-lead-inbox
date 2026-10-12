import type { Enrichment, Lead, Routing, ScoredLead } from "./lead-logic";

export declare function llmMode(): "mock" | "openai";
export declare function llmModel(): string;
export declare function enrichLead(lead: Lead, scored: ScoredLead, routing: Routing): Promise<Enrichment>;
