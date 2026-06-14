const GRAPHQL_URL = "https://leetcode.com/graphql";
const BASE_URL = "https://leetcode.com";

export interface LeetCodeClient {
  graphql<T>(body: object): Promise<T>;
  post<T>(path: string, body: object): Promise<T>;
  get<T>(path: string): Promise<T>;
}

// Thrown on a 401/403 so callers can distinguish an expired/invalid session from a
// generic failure and prompt the user to re-authenticate.
export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message = `LeetCode session rejected (${status}). It may have expired — re-authenticate from the command palette (Ctrl+P → "Re-authenticate").`,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function throwForStatus(res: Response, label: string): void {
  if (res.status === 401 || res.status === 403) throw new AuthError(res.status);
  throw new Error(`${label} failed: ${res.status} ${res.statusText}`);
}

export function createClient(csrf: string, session: string): LeetCodeClient {
  const headers: Record<string, string> = {
    Cookie: `LEETCODE_SESSION=${session}; csrftoken=${csrf}`,
    "Content-Type": "application/json",
    "x-csrftoken": csrf,
    Origin: BASE_URL,
    Referer: BASE_URL,
    Connection: "keep-alive",
  };

  return {
    async graphql<T>(body: object): Promise<T> {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throwForStatus(res, "GraphQL request");
      return res.json() as Promise<T>;
    },

    async post<T>(path: string, body: object): Promise<T> {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throwForStatus(res, `POST ${path}`);
      return res.json() as Promise<T>;
    },

    async get<T>(path: string): Promise<T> {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "GET",
        headers,
      });
      if (!res.ok) throwForStatus(res, `GET ${path}`);
      return res.json() as Promise<T>;
    },
  };
}

let _client: LeetCodeClient | null = null;

export function initClient(csrf: string, session: string): LeetCodeClient {
  _client = createClient(csrf, session);
  return _client;
}

export function getClient(): LeetCodeClient {
  if (!_client) throw new Error("API client not initialized");
  return _client;
}
