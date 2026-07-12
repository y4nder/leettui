import { gqlQuery } from "@/api/graphql";
import type { QuestionEditorData } from "@/api/types";

const QUERY = `
query questionEditorData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    titleSlug
    questionFrontendId
    content
    codeSnippets {
      lang
      langSlug
      code
    }
    envInfo
    enableRunCode
  }
}`;

export async function fetchEditorData(titleSlug: string): Promise<QuestionEditorData> {
  return gqlQuery<QuestionEditorData>(QUERY, { titleSlug }, true);
}
