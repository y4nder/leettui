// GraphQL response wrappers
export interface GqlResponse<T> {
  data: T;
}

// problemsetQuestionList
export interface ProblemsetQuestionListData {
  problemsetQuestionList: {
    total: number;
    questions: ApiQuestion[];
  };
}

export interface ApiQuestion {
  acRate: number;
  difficulty: "Easy" | "Medium" | "Hard";
  freqBar: number | null;
  frontendQuestionId: string;
  isFavor: boolean;
  paidOnly: boolean;
  status: string | null;
  title: string;
  titleSlug: string;
  topicTags: TopicTag[];
  hasSolution: boolean;
  hasVideoSolution: boolean;
}

export interface TopicTag {
  name: string;
  id: string;
  slug: string;
}

// questionContent
export interface QuestionContentData {
  question: {
    content: string;
    titleSlug: string;
  };
}

// questionEditorData
export interface QuestionEditorData {
  question: {
    questionId: string;
    titleSlug: string;
    questionFrontendId: string;
    content: string;
    codeSnippets: CodeSnippet[];
    envInfo: string;
    enableRunCode: boolean;
  };
}

export interface CodeSnippet {
  lang: string;
  langSlug: string;
  code: string;
}

// consolePanelConfig
export interface ConsolePanelConfigData {
  question: {
    questionFrontendId: string;
    questionTitle: string;
    exampleTestcaseList: string[];
  };
}

// Run/Submit intermediate responses
export interface RunCodeResponse {
  interpret_id: string;
  test_case: string;
}

export interface SubmitCodeResponse {
  submission_id: number;
}

// Run/Submit check response (raw JSON, parsed dynamically)
export interface CheckResponse {
  state: string;
  status_code?: number;
  status_msg?: string;
  task_name?: string;
  compare_result?: string;
  code_answer?: string[];
  std_output_list?: string[];
  expected_code_answer?: string[];
  correct_answer?: boolean;
  total_correct?: number;
  total_testcases?: number;
  status_runtime?: string;
  status_memory?: string;
  memory?: number;
  elapsed_time?: number;
  runtime_percentile?: number;
  memory_percentile?: number;
  compile_error?: string;
  full_compile_error?: string;
  runtime_error?: string;
  full_runtime_error?: string;
  last_testcase?: string;
  expected_output?: string;
  code_output?: string;
  std_output?: string;
  question_id?: string;
  submission_id?: string;
  lang?: string;
}

// Parsed response discriminated union
export type ParsedResponse =
  | { type: "pending" }
  | { type: "run_accepted"; data: CheckResponse }
  | { type: "run_wrong_answer"; data: CheckResponse }
  | { type: "submit_accepted"; data: CheckResponse }
  | { type: "submit_wrong_answer"; data: CheckResponse }
  | { type: "compile_error"; data: CheckResponse }
  | { type: "runtime_error"; data: CheckResponse }
  | { type: "time_limit_exceeded"; data: CheckResponse }
  | { type: "memory_limit_exceeded"; data: CheckResponse }
  | { type: "output_limit_exceeded"; data: CheckResponse }
  | { type: "internal_error"; statusCode: number }
  | { type: "timeout"; statusCode: number }
  | { type: "unknown"; statusCode: number };

export function parseCheckResponse(raw: CheckResponse): ParsedResponse {
  if (raw.state === "PENDING" || raw.state === "STARTED") {
    return { type: "pending" };
  }

  const statusCode = raw.status_code ?? 0;

  switch (statusCode) {
    case 10: {
      const isRun = raw.task_name?.includes("RunCode") ?? false;
      if (isRun) {
        const allCorrect =
          raw.compare_result?.split("").every((c) => c === "1") ?? false;
        return allCorrect
          ? { type: "run_accepted", data: raw }
          : { type: "run_wrong_answer", data: raw };
      }
      return { type: "submit_accepted", data: raw };
    }
    case 11:
      return { type: "submit_wrong_answer", data: raw };
    case 12:
      return { type: "memory_limit_exceeded", data: raw };
    case 13:
      return { type: "output_limit_exceeded", data: raw };
    case 14:
      return { type: "time_limit_exceeded", data: raw };
    case 15:
      return { type: "runtime_error", data: raw };
    case 16:
      return { type: "internal_error", statusCode };
    case 20:
      return { type: "compile_error", data: raw };
    case 30:
      return { type: "timeout", statusCode };
    default:
      return { type: "unknown", statusCode };
  }
}

// Language utilities
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  cpp: "cpp",
  java: "java",
  python: "py",
  python3: "py",
  mysql: "sql",
  mssql: "sql",
  oraclesql: "sql",
  c: "c",
  csharp: "cs",
  javascript: "js",
  ruby: "rb",
  bash: "sh",
  swift: "swift",
  golang: "go",
  scala: "scala",
  html: "html",
  pythonml: "py",
  kotlin: "kt",
  rust: "rs",
  php: "php",
  typescript: "ts",
  racket: "rkt",
  erlang: "erl",
  elixir: "ex",
  dart: "dart",
  pythondata: "py",
  react: "jsx",
};

export function getExtension(langSlug: string): string {
  return LANGUAGE_EXTENSIONS[langSlug] ?? "txt";
}
