export type StoredEntityType = "segment" | "decision" | "action";

export function storedEntityId(
  conversationId: string,
  entityType: StoredEntityType,
  providerId: string,
): string {
  return `${conversationId}:${entityType}:${providerId}`;
}
