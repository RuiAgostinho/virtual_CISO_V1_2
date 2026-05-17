import { request } from "./api";

export interface ChatSource {
  id?: string;
  title?: string;
  label?: string;
  source?: string;
  source_type: string;
  source_ref?: string;
  content_excerpt?: string;
  framework?: string;
  control_code?: string;
  url?: string | null;
  score?: number;
  snippet?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: ChatSource[];
  used_context?: string;
  task_type?: string;
  model_used?: string;
  used_rag?: boolean;
  confidence?: number;
}

export interface AssistantHistoryEntry {
  id: string;
  question: string;
  answer: string;
  task_type?: string;
  model_used?: string;
  used_rag?: boolean;
  confidence?: number | null;
  sources_json: ChatSource[];
  history_json?: Array<{ role: string; content: string }>;
  filters_json?: Record<string, any>;
  created_by?: string | null;
  created_by_label?: string;
  converted_decision_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantHistoryListResponse {
  count: number;
  results: AssistantHistoryEntry[];
}

export interface ConvertRecommendationPayload {
  decision_code: string;
  justification: string;
  title?: string;
}

export interface ConvertRecommendationResponse {
  decision_id: string;
  recommendation_id: string;
  decision: string;
  decision_display: string;
}

export const chatApi = {
  async ask(
    query: string,
    history: Pick<ChatMessage, "role" | "content">[] = []
  ): Promise<{
    task_type: string;
    model_used: string;
    used_rag: boolean;
    confidence: number;
    response: string;
    sources: ChatSource[];
  }> {
    return await request("/api/assistant/ask/", {
      method: "POST",
      body: JSON.stringify({ query, history }),
    });
  },

  async listHistory(params?: Record<string, string | number | boolean>) {
    let url = "/api/assistant/history/";
    if (params) {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        query.set(key, String(value));
      });
      url += `?${query.toString()}`;
    }
    return await request<AssistantHistoryListResponse>(url);
  },

  async deleteHistoryEntry(id: string) {
    return await request<void>(`/api/assistant/history/${id}/`, {
      method: "DELETE",
    });
  },

  async convertRecommendation(id: string, payload: ConvertRecommendationPayload) {
    return await request<ConvertRecommendationResponse>(`/api/assistant/history/${id}/convert/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
