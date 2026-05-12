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
};
