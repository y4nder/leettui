import { getClient } from "@/api/client";
import { parseCheckResponse, type CheckResponse, type ParsedResponse } from "@/api/types";

const POLL_INTERVAL = 500;
const MAX_POLLS = 60;

export async function pollResult(
  id: string | number,
  onPoll?: () => void,
): Promise<ParsedResponse> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const raw = await getClient().get<CheckResponse>(`/submissions/detail/${id}/check/`);

    const parsed = parseCheckResponse(raw);
    if (parsed.type !== "pending") {
      return parsed;
    }

    onPoll?.();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  return { type: "timeout", statusCode: 30 };
}
