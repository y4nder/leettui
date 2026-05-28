# api/

LeetCode API client layer. All HTTP communication with leetcode.com lives here.

## Files

- `client.ts` — Authenticated fetch wrapper. Creates headers with `LEETCODE_SESSION` cookie + `x-csrftoken`. Exports `initClient()`, `getClient()` singleton.
- `graphql.ts` — Generic GraphQL POST helper with LRU cache (20 entries, 5min TTL). Used by all query files.
- `types.ts` — All TypeScript interfaces for API responses, plus `ParsedResponse` discriminated union for run/submit results, and language extension map.

### queries/

GraphQL queries ported from the Rust reference (`leetcode-core/src/graphql/query/`):

- `problemset-question-list.ts` — `fetchQuestionList(limit, skip)` — paginated problem list (1000/page)
- `question-content.ts` — `fetchQuestionContent(titleSlug)` — HTML problem description (cached)
- `editor-data.ts` — `fetchEditorData(titleSlug)` — code snippets per language (cached)
- `console-panel-config.ts` — `fetchConsolePanelConfig(titleSlug)` — example test cases (cached)

### rest/

REST endpoints for code execution:

- `run.ts` — `runCode(slug, lang, questionId, typedCode, dataInput)` — POST to `/problems/{slug}/interpret_solution/`
- `submit.ts` — `submitCode(slug, lang, questionId, typedCode)` — POST to `/problems/{slug}/submit/`
- `check.ts` — `pollResult(id)` — Polls `/submissions/detail/{id}/check/` every 500ms until completion (max 60 polls)

## Auth headers

```
Cookie: LEETCODE_SESSION={session}; csrftoken={csrf}
Content-Type: application/json
x-csrftoken: {csrf}
Origin: https://leetcode.com
Referer: https://leetcode.com
```

## Response parsing

Run/submit responses are parsed via `parseCheckResponse()` in `types.ts`. Status codes: 10=Accepted, 11=WrongAnswer, 12=MemoryLimit, 13=OutputLimit, 14=TimeLimit, 15=RuntimeError, 16=InternalError, 20=CompileError, 30=Timeout.

## Dependencies

Depends on `config/` for auth tokens (via `client.ts`).
