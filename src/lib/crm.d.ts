export type {
  Lead,
  LeadRecord,
  ScoredLead,
  Routing,
  Enrichment,
  PipelineStep,
  SlackPayload,
  StoredAlert,
  Tier,
  Timeline,
} from "./lead-logic";

export declare function dataDir(): string;
export declare function csvPath(): string;
export declare function closeDb(): void;
export declare function listLeads(): Promise<import("./lead-logic").LeadRecord[]>;
export declare function getLead(id: string): Promise<import("./lead-logic").LeadRecord | null>;
export declare function saveLead(record: import("./lead-logic").LeadRecord): Promise<import("./lead-logic").LeadRecord | null>;
export declare function listAlerts(): Promise<import("./lead-logic").StoredAlert[]>;
export declare function getAlertForLead(leadId: string): Promise<import("./lead-logic").StoredAlert | null>;
export declare function saveAlert(alert: import("./lead-logic").StoredAlert): Promise<import("./lead-logic").StoredAlert | null>;
