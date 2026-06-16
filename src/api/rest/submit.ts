import { getClient } from "../client";
import type { SubmitCodeResponse } from "../types";

export async function submitCode(
  slug: string,
  lang: string,
  questionId: string,
  typedCode: string,
): Promise<SubmitCodeResponse> {
  return getClient().post<SubmitCodeResponse>(`/problems/${slug}/submit/`, {
    lang,
    question_id: questionId,
    typed_code: typedCode,
  });
}
