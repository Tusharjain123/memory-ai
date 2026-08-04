import { getDatabase } from "./database";
import { cosineSimilarity } from "../search/similarity";

export type DashboardAnalytics = {
  totalConversations: number;
  recordingTimeMs: number;
  uniquePeople: number;
  pendingTasks: number;
  completedTasks: number;
  averageDurationMs: number;
  mostDiscussedTopics: Array<{ topic: string; count: number }>;
};

export type SearchMemory = {
  id: string;
  conversationId: string;
  title: string;
  text: string;
  score: number;
};

export type PersonMemory = {
  id: string;
  name: string;
  conversationCount: number;
  lastInteractionAt: string;
  topics: string[];
};

type EmbeddingRow = {
  source_id: string;
  conversation_id: string;
  title: string;
  text: string;
  vector_json: string;
};

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const database = await getDatabase();
  const [conversation, people, actions, topicRows] = await Promise.all([
    database.getFirstAsync<{
      total: number; duration: number; average_duration: number;
    }>(`SELECT COUNT(*) total, COALESCE(SUM(duration_ms),0) duration,
        COALESCE(AVG(duration_ms),0) average_duration FROM conversations`),
    database.getFirstAsync<{ total: number }>("SELECT COUNT(*) total FROM people"),
    database.getFirstAsync<{ pending: number; completed: number }>(
      `SELECT COALESCE(SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END),0) pending,
       COALESCE(SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END),0) completed FROM action_items`,
    ),
    database.getAllAsync<{ topics_json: string }>("SELECT topics_json FROM conversations"),
  ]);
  const topicCounts = new Map<string, number>();
  for (const row of topicRows) {
    for (const topic of JSON.parse(row.topics_json) as string[]) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  return {
    totalConversations: conversation?.total ?? 0,
    recordingTimeMs: conversation?.duration ?? 0,
    uniquePeople: people?.total ?? 0,
    pendingTasks: actions?.pending ?? 0,
    completedTasks: actions?.completed ?? 0,
    averageDurationMs: conversation?.average_duration ?? 0,
    mostDiscussedTopics: [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  };
}

export async function listPeople(): Promise<PersonMemory[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    name: string;
    last_interaction_at: string;
    conversation_id: string;
    topics_json: string;
  }>(
    `SELECT p.id,p.name,p.last_interaction_at,cp.conversation_id,c.topics_json
     FROM people p
     JOIN conversation_people cp ON cp.person_id=p.id
     JOIN conversations c ON c.id=cp.conversation_id
     ORDER BY p.last_interaction_at DESC`,
  );
  const people = new Map<string, PersonMemory>();
  for (const row of rows) {
    const current = people.get(row.id) ?? {
      id: row.id,
      name: row.name,
      conversationCount: 0,
      lastInteractionAt: row.last_interaction_at,
      topics: [],
    };
    current.conversationCount += 1;
    current.topics = [
      ...new Set([...current.topics, ...(JSON.parse(row.topics_json) as string[])]),
    ];
    people.set(row.id, current);
  }
  return [...people.values()];
}

export async function semanticSearch(
  queryVector: number[],
  queryModel: string,
  limit = 12,
  conversationId?: string,
): Promise<SearchMemory[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<EmbeddingRow>(
    `SELECT e.source_id,e.conversation_id,e.text,e.vector_json,c.title
     FROM embeddings e JOIN conversations c ON c.id=e.conversation_id
     WHERE e.model=?
     ${conversationId ? "AND e.conversation_id=?" : ""}`,
    queryModel,
    ...(conversationId ? [conversationId] : []),
  );
  return rows
    .map((row) => ({
      id: row.source_id,
      conversationId: row.conversation_id,
      title: row.title,
      text: row.text,
      score: cosineSimilarity(queryVector, JSON.parse(row.vector_json) as number[]),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function keywordSearch(query: string, limit = 20): Promise<SearchMemory[]> {
  const database = await getDatabase();
  const term = `%${query.trim()}%`;
  const rows = await database.getAllAsync<{
    id: string; conversation_id: string; title: string; text: string;
  }>(
    `SELECT s.id,s.conversation_id,c.title,s.clean_text text
     FROM transcript_segments s JOIN conversations c ON c.id=s.conversation_id
     WHERE s.clean_text LIKE ? OR c.title LIKE ? OR c.summary LIKE ?
     ORDER BY c.created_at DESC LIMIT ?`,
    term, term, term, limit,
  );
  return rows.map((row) => ({ ...row, conversationId: row.conversation_id, score: 1 }));
}

export async function getConversationContext(conversationId: string): Promise<SearchMemory[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string; conversation_id: string; title: string; text: string;
  }>(
    `SELECT s.id,s.conversation_id,c.title,s.clean_text text
     FROM transcript_segments s JOIN conversations c ON c.id=s.conversation_id
     WHERE s.conversation_id=? ORDER BY s.start_ms LIMIT 30`,
    conversationId,
  );
  return rows.map((row) => ({ ...row, conversationId: row.conversation_id, score: 1 }));
}
