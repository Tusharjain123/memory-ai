import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { supabaseConfig, supabaseHeaders } from "../supabase/supabase-rest.js";

const CLOUD_DATA_TIMEOUT_MS = 15_000;

/**
 * Removes what cloud sync stored for a user: folders (links cascade) and the
 * optional profile details. The account row and wallet are kept.
 */
@Injectable()
export class CloudDataService {
  async deleteSyncedData(userId: string): Promise<void> {
    const { url, secret } = supabaseConfig("delete cloud data");
    const id = encodeURIComponent(userId);
    const folders = await fetch(`${url}/rest/v1/folders?user_id=eq.${id}`, {
      method: "DELETE",
      headers: supabaseHeaders(secret, { Prefer: "return=minimal" }),
      signal: AbortSignal.timeout(CLOUD_DATA_TIMEOUT_MS),
    });
    if (!folders.ok) {
      throw new ServiceUnavailableException(`Could not delete cloud folders (${folders.status})`);
    }
    const profile = await fetch(`${url}/rest/v1/users?id=eq.${id}`, {
      method: "PATCH",
      headers: supabaseHeaders(secret, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        age: null,
        gender: null,
        phone_number: null,
        metadata: {},
        cloud_sync_enabled: false,
      }),
      signal: AbortSignal.timeout(CLOUD_DATA_TIMEOUT_MS),
    });
    if (!profile.ok) {
      throw new ServiceUnavailableException(`Could not clear cloud profile (${profile.status})`);
    }
  }
}
