import { gqlQuery } from "@/api/graphql";
import type { QuestionContentData } from "@/api/types";

const QUERY = `
query questionContent($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    content
    titleSlug
  }
}`;

export async function fetchQuestionContent(titleSlug: string): Promise<QuestionContentData> {
  return gqlQuery<QuestionContentData>(QUERY, { titleSlug }, true);
}
