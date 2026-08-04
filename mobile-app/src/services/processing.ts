import type {
  ProcessedConversation,
  ProcessingJobState,
} from "../contracts";
import { API_URL } from "../config/api";

export async function processRecording(uri: string): Promise<ProcessedConversation> {
  const form = new FormData();
  form.append("audio", {
    uri,
    name: `conversation-${Date.now()}.m4a`,
    type: "audio/mp4",
  } as unknown as Blob);
  const response = await fetch(`${API_URL}/v1/conversations/process`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Processing failed (${response.status})`);
  }
  const queued = (await response.json()) as ProcessingJobState;
  if (queued.status !== "queued") throw new Error("The processing job was not queued");
  return poll(queued.jobId);
}

async function poll(jobId: string): Promise<ProcessedConversation> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_250));
    const response = await fetch(`${API_URL}/v1/conversations/process/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (!response.ok) throw new Error(`Could not check processing (${response.status})`);
    const state = (await response.json()) as ProcessingJobState;
    if (state.status === "complete") return state.result;
    if (state.status === "failed") throw new Error(state.error);
  }
  throw new Error("Processing timed out. Your local recording was kept.");
}
