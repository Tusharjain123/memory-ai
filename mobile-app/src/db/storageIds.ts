export type StoredEntityType = "segment" | "decision" | "action" | "commitment" | "memory";

export function storedEntityId(
  conversationId: string,
  entityType: StoredEntityType,
  providerId: string,
): string {
  return `${conversationId}:${entityType}:${providerId}`;
}
