type ChatMessage = {
  content?: string;
  thinking?: string;
};

type JsonSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

export function parseChatJson(message: ChatMessage | undefined): unknown {
  const values = chatJsonValues(message);
  if (!values.length) throw new SyntaxError("Model response is not JSON");
  return values[0];
}

export function parseStructuredChatJson<T>(
  message: ChatMessage | undefined,
  schema: JsonSchema<T>,
): T {
  for (const value of chatJsonValues(message)) {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  throw new SyntaxError("Model response is not JSON");
}

function chatJsonValues(message: ChatMessage | undefined): unknown[] {
  const ranked: Array<{ length: number; value: unknown }> = [];
  const seen = new Set<string>();
  for (const source of [message?.content ?? "", message?.thinking ?? ""]) {
    for (const candidate of jsonCandidates(source)) {
      const parsed = parseCandidate(candidate);
      if (!parsed.ok) continue;
      const key = JSON.stringify(parsed.value);
      if (seen.has(key)) continue;
      seen.add(key);
      ranked.push({ length: candidate.length, value: parsed.value });
    }
  }
  ranked.sort((left, right) => right.length - left.length);
  return ranked.map((item) => item.value);
}

function jsonCandidates(content: string): string[] {
  const trimmed = content.trim().replace(/^\uFEFF/, "");
  if (!trimmed) return [];
  const bodies = fencedBodies(trimmed);
  return [trimmed, ...bodies, ...balancedValues(trimmed), ...bodies.flatMap(balancedValues)]
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function parseCandidate(candidate: string): { ok: true; value: unknown } | { ok: false } {
  for (const text of [candidate, repairJson(candidate)]) {
    try {
      return { ok: true, value: unwrapEncodedJson(JSON.parse(text) as unknown) };
    } catch {
      // Try the repaired form, then the next candidate.
    }
  }
  return { ok: false };
}

function unwrapEncodedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function fencedBodies(text: string): string[] {
  const bodies: string[] = [];
  const closed = /(?:```|~~~)[ \t]*(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)(?:```|~~~)/g;
  for (const match of text.matchAll(closed)) {
    const body = match[1]?.trim();
    if (body) bodies.push(body);
  }
  if (!text.trimEnd().endsWith("```") && !text.trimEnd().endsWith("~~~")) {
    const open = text.match(/(?:```|~~~)[ \t]*(?:json|JSON)?[ \t]*\r?\n([\s\S]+)$/);
    const body = open?.[1]?.trim();
    if (body) bodies.push(body);
  }
  return bodies;
}

function balancedValues(text: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const start = text[index];
    if (start !== "{" && start !== "[") continue;
    const end = closingIndex(text, index);
    if (end < 0) continue;
    values.push(text.slice(index, end + 1));
    index = end;
  }
  return values;
}

function closingIndex(text: string, openIndex: number): number {
  const opener = text[openIndex];
  if (opener !== "{" && opener !== "[") return -1;
  const stack = [opener === "{" ? "}" : "]"];
  let inString = false;
  let escaped = false;
  for (let index = openIndex + 1; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }
    if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

function repairJson(text: string): string {
  const normalized = text.replace(/[\u201C\u201D]/g, "\"").replace(/[\u2018\u2019]/g, "'");
  let repaired = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? "";
    if (inString) {
      repaired += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      repaired += char;
      continue;
    }
    if (char === "/" && normalized[index + 1] === "/") {
      const newline = normalized.indexOf("\n", index);
      index = newline === -1 ? normalized.length : newline;
      continue;
    }
    if (char === "/" && normalized[index + 1] === "*") {
      const close = normalized.indexOf("*/", index + 2);
      index = close === -1 ? normalized.length : close + 1;
      continue;
    }
    const word = literalWord(normalized, index);
    if (word) {
      repaired += word.replacement;
      index += word.length - 1;
      continue;
    }
    if (char === ",") {
      let lookahead = index + 1;
      while (lookahead < normalized.length && /\s/.test(normalized[lookahead] ?? "")) lookahead += 1;
      const next = normalized[lookahead];
      if (next === "}" || next === "]") continue;
    }
    repaired += char;
  }
  return repaired;
}

function literalWord(
  text: string,
  index: number,
): { replacement: string; length: number } | null {
  const previous = text[index - 1] ?? "";
  if (/[A-Za-z0-9_]/.test(previous)) return null;
  for (const [word, replacement] of [["True", "true"], ["False", "false"], ["None", "null"]] as const) {
    if (!text.startsWith(word, index)) continue;
    const next = text[index + word.length] ?? "";
    if (/[A-Za-z0-9_]/.test(next)) continue;
    return { replacement, length: word.length };
  }
  return null;
}

export function isRetryableChatStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function readChatMessage(
  response: Response,
): Promise<{ content?: string; thinking?: string } | undefined> {
  try {
    const payload = (await response.json()) as {
      response?: string;
      message?: { content?: string; thinking?: string };
    };
    const message = payload.message ?? {};
    if (!message.content?.trim() && payload.response?.trim()) {
      return { ...message, content: payload.response };
    }
    return message;
  } catch {
    return undefined;
  }
}
