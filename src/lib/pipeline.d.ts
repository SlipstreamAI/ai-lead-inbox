import type { Enrichment, LeadRecord, SlackPayload } from "./lead-logic";

export type PipelineSuccess = {
  ok: true;
  lead: LeadRecord;
  alert: {
    id: string;
    payload: SlackPayload;
    delivery: string;
    deliveryStatus: string;
    deliveryDetail: string;
  };
};

export type PipelineFailure = {
  ok: false;
  errors: Record<string, string>;
  steps: { name: string; status: string; detail: string; ms: number }[];
};

export declare function runPipeline(
  input: unknown,
  options?: {
    id?: string;
    now?: string | number | Date;
    rand?: number;
    origin?: string;
    alertId?: string;
    enrichment?: Enrichment;
    webhookUrl?: string;
  },
): Promise<PipelineSuccess | PipelineFailure>;

export declare function deliverAlert(input: {
  payload: SlackPayload;
  webhookUrl?: string;
}): Promise<{ delivery: string; deliveryStatus: string; deliveryDetail: string }>;

export declare function llmMode(): "mock" | "openai";
