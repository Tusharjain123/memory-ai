import { handleWaitlist } from "@/lib/waitlist";
import { serverSettings } from "@/lib/server-settings";
export async function POST(request: Request) {
  return handleWaitlist(request, serverSettings());
}
