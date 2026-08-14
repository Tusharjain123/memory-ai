import type {
  AskResponse,
  EmbeddingVectorResponse,
} from "../contracts";
import { API_URL } from "../config/api";
import {
  getConversationContext,
  keywordSearch,
  getDashboardAnalytics,
  semanticSearch,
  type SearchMemory,
} from "../db/insights";
import { answerLocalAnalytics } from "../search/localAnalytics";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`);
  return (await response.json()) as T;
}

export async function retrieveMemories(
  question: string,
  conversationId?: string,
): Promise<SearchMemory[]> {
  const [keywords, analytics] = await Promise.all([
    conversationId ? getConversationContext(conversationId) : keywordSearch(question),
    conversationId ? Promise.resolve(null) : getDashboardAnalytics(),
  ]);
  let semantic: SearchMemory[] = [];
  try {
    const { vector, model } = await post<EmbeddingVectorResponse>(
      "/v1/ai/embed",
      { text: question },
    );
    semantic = await semanticSearch(vector, model, 12, conversationId);
  } catch {
    // Local keyword/context retrieval remains useful when cloud processing is offline.
  }
  const merged = new Map<string, SearchMemory>();
  if (analytics) {
    merged.set("analytics:current", {
      id: "current",
      conversationId: "analytics",
      title: "Current local analytics",
      text: [
        `Total conversations: ${analytics.totalConversations}`,
        `Total recording time in milliseconds: ${analytics.recordingTimeMs}`,
        `Unique people: ${analytics.uniquePeople}`,
        `Pending tasks: ${analytics.pendingTasks}`,
        `Completed tasks: ${analytics.completedTasks}`,
        `Open commitments: ${analytics.pendingTasks}`,
        `Completed commitments: ${analytics.completedTasks}`,
        `Average meeting duration in milliseconds: ${analytics.averageDurationMs}`,
        `Most discussed topics: ${analytics.mostDiscussedTopics.map((item) => `${item.topic} (${item.count})`).join(", ")}`,
      ].join("\n"),
      score: 1,
    });
  }
  // Prefer approved commitment/person-memory hits (higher score) ahead of raw segments.
  const ranked = [...keywords, ...semantic].sort((left, right) => right.score - left.score);
  for (const item of ranked) {
    const key = `${item.conversationId}:${item.id}`;
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()].slice(0, 20);
}

export function askWithContext(
  question: string,
  memories: SearchMemory[],
): Promise<AskResponse> {
  return post<AskResponse>("/v1/ai/ask", {
    question,
    context: memories.map((memory) => ({
      id: `${memory.conversationId}:${memory.id}`,
      text: `${memory.title}\n${memory.text}`,
    })),
  });
}

export function askGlobalWithContext(
  question: string,
  memories: SearchMemory[],
): Promise<AskResponse> {
  return Promise.resolve(answerLocalAnalytics(question, memories))
    .then((local) => local ?? askWithContext(question, memories));
}
