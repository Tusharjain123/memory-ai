import { getDatabase } from "./database";

export type ConversationPerson = {
  conversationId: string;
  personId: string;
  name: string;
  speakerLabel: string;
  relationship: string | null;
  isPlaceholder: boolean;
};

export type PeopleConversationSection = {
  conversationId: string;
  title: string;
  durationMs: number;
  createdAt: string;
  people: ConversationPerson[];
};

export type PersonProfile = {
  id: string;
  name: string;
  relationship: string;
  email: string;
  phone: string;
  notes: string;
  isPlaceholder: boolean;
  lastInteractionAt: string;
  conversations: Array<{
    id: string;
    title: string;
    createdAt: string;
    speakerLabel: string;
  }>;
};

export type PersonProfileUpdate = {
  name: string;
  relationship: string;
  email: string;
  phone: string;
  notes: string;
};

type GroupedPersonRow = {
  conversation_id: string;
  title: string;
  duration_ms: number;
  created_at: string;
  person_id: string;
  name: string;
  speaker_label: string;
  relationship: string | null;
  is_placeholder: number;
};

export async function listPeopleByConversation(): Promise<PeopleConversationSection[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<GroupedPersonRow>(
    `SELECT c.id conversation_id,c.title,c.duration_ms,c.created_at,
            p.id person_id,p.name,cp.speaker_label,p.relationship,p.is_placeholder
     FROM conversations c
     JOIN conversation_people cp ON cp.conversation_id=c.id
     JOIN people p ON p.id=cp.person_id
     ORDER BY c.created_at DESC,cp.speaker_label COLLATE NOCASE`,
  );
  const sections = new Map<string, PeopleConversationSection>();
  for (const row of rows) {
    const section = sections.get(row.conversation_id) ?? {
      conversationId: row.conversation_id,
      title: row.title,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
      people: [],
    };
    section.people.push({
      conversationId: row.conversation_id,
      personId: row.person_id,
      name: row.is_placeholder ? row.speaker_label : row.name,
      speakerLabel: row.speaker_label,
      relationship: row.relationship,
      isPlaceholder: row.is_placeholder === 1,
    });
    sections.set(row.conversation_id, section);
  }
  return [...sections.values()];
}

export async function getPerson(id: string): Promise<PersonProfile | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    id: string;
    name: string;
    relationship: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    is_placeholder: number;
    last_interaction_at: string;
  }>(
    `SELECT id,name,relationship,email,phone,notes,is_placeholder,last_interaction_at
     FROM people WHERE id=?`,
    id,
  );
  if (!row) return null;
  const conversations = await database.getAllAsync<{
    id: string;
    title: string;
    created_at: string;
    speaker_label: string;
  }>(
    `SELECT c.id,c.title,c.created_at,cp.speaker_label
     FROM conversation_people cp
     JOIN conversations c ON c.id=cp.conversation_id
     WHERE cp.person_id=?
     ORDER BY c.created_at DESC`,
    id,
  );
  return {
    id: row.id,
    name: row.is_placeholder ? "" : row.name,
    relationship: row.relationship ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    notes: row.notes ?? "",
    isPlaceholder: row.is_placeholder === 1,
    lastInteractionAt: row.last_interaction_at,
    conversations: conversations.map((item) => ({
      id: item.id,
      title: item.title,
      createdAt: item.created_at,
      speakerLabel: item.speaker_label,
    })),
  };
}

export async function updatePerson(
  id: string,
  update: PersonProfileUpdate,
): Promise<void> {
  const name = update.name.trim();
  if (!name) throw new Error("Name is required");
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const current = await database.getFirstAsync<{ name: string }>(
      "SELECT name FROM people WHERE id=?",
      id,
    );
    if (!current) throw new Error("Person not found");
    const duplicate = await database.getFirstAsync<{ id: string }>(
      "SELECT id FROM people WHERE name=? COLLATE NOCASE AND id<>?",
      name, id,
    );
    if (duplicate) throw new Error("A person with this name already exists");
    const now = new Date().toISOString();
    await database.runAsync(
      `UPDATE people
       SET name=?,relationship=?,email=?,phone=?,notes=?,is_placeholder=0,updated_at=?
       WHERE id=?`,
      name,
      nullable(update.relationship),
      nullable(update.email),
      nullable(update.phone),
      nullable(update.notes),
      now,
      id,
    );
    await database.runAsync(
      `UPDATE action_items
       SET owner=?
       WHERE owner IS NOT NULL
         AND (
           LOWER(TRIM(owner))=LOWER(TRIM(?))
           OR EXISTS (
             SELECT 1
             FROM conversation_people cp
             WHERE cp.person_id=?
               AND cp.conversation_id=action_items.conversation_id
               AND LOWER(TRIM(action_items.owner))=LOWER(TRIM(cp.speaker_label))
           )
         )`,
      name, current.name, id,
    );
  });
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}
