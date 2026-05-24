import { request } from "./api";

export type RagRunMode = "incremental" | "full";
export type RagRunStatus = "running" | "success" | "failed";

export interface RagRunTypeCount {
  processed: number;
  failed: number;
}

export interface RagRun {
  id: string;
  mode: RagRunMode;
  status: RagRunStatus;
  triggered_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  chunks_created: number;
  chunks_updated: number;
  chunks_removed: number;
  chunks_failed: number;
  total_processed: number;
  counts_by_type: Record<string, RagRunTypeCount>;
  error_message: string;
  error_detail: string;
}

export interface RagByType {
  source_type: string;
  label: string;
  count: number;
}

export interface RagGovernanceMissing {
  source_type: string;
  label: string;
  eligible: number;
  indexed: number;
  missing: number;
}

export interface RagStats {
  total_chunks: number;
  embedded_chunks: number;
  missing_embedding: number;
  by_type: RagByType[];
  governance_missing: RagGovernanceMissing[];
}

export interface RagOverview {
  stats: RagStats;
  current_run: RagRun | null;
  last_run: RagRun | null;
  recent_runs: RagRun[];
}

export const ragApi = {
  getOverview: () => request<RagOverview>("/api/assistant/rag/overview/"),

  reindex: (mode: RagRunMode) =>
    request<RagRun>("/api/assistant/rag/reindex/", {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),

  terminateRunningRun: () =>
    request<RagRun>("/api/assistant/rag/terminate/", {
      method: "POST",
    }),

  completeGovernanceMissing: (batchSize = 50) =>
    request<RagRun>("/api/assistant/rag/reindex/", {
      method: "POST",
      body: JSON.stringify({
        mode: "incremental",
        preset: "governance_missing",
        batch_size: batchSize,
      }),
    }),
};
