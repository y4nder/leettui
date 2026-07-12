import { getClient } from "@/api/client";
import type { RunCodeResponse } from "@/api/types";

export async function runCode(
  slug: string,
  lang: string,
  questionId: string,
  typedCode: string,
  dataInput: string,
): Promise<RunCodeResponse> {
  return getClient().post<RunCodeResponse>(`/problems/${slug}/interpret_solution/`, {
    lang,
    question_id: questionId,
    typed_code: typedCode,
    data_input: dataInput,
  });
}
