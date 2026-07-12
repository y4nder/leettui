import { gqlQuery } from "@/api/graphql";
import type { SimilarQuestionsData } from "@/api/types";

const QUERY = `
query similarQuestions($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    similarQuestionList {
      difficulty
      titleSlug
      title
      isPaidOnly
    }
  }
}`;

// Live GraphQL fetch (cached) of a problem's "similar questions". No migration —
// the slugs are resolved against the local DB at the call site to decide which
// are navigable (the Related Questions panel, Stage 12 item 4).
export async function fetchSimilarQuestions(titleSlug: string): Promise<SimilarQuestionsData> {
  return gqlQuery<SimilarQuestionsData>(QUERY, { titleSlug }, true);
}
