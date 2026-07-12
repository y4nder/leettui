import { getClient } from "@/api/client";
import type { GqlResponse } from "@/api/types";

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 20;

export async function gqlQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  useCache = false,
): Promise<T> {
  const cacheKey = useCache ? JSON.stringify({ query, variables }) : "";

  if (useCache && cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.data as T;
    }
  }

  const response = await getClient().graphql<GqlResponse<T>>({
    query,
    variables,
  });

  if (useCache && cacheKey) {
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(cacheKey, { data: response.data, ts: Date.now() });
  }

  return response.data;
}
