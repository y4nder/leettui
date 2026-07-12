import { gqlQuery } from "@/api/graphql";

// Field names, types, and units below were reverse-engineered from the
// JacobLinCool/LeetCode-Query community library (RESEARCH.md §Pattern 3) and
// then CONFIRMED against the live API by the plan 01-02 Task 2 spike
// (`scripts/spike-submission-list.ts`, run against a real 40+ submission
// account). See the plan's SUMMARY "Live Spike Findings" for the raw evidence.
export interface ApiSubmission {
  id: string; // Confirmed: numeric string, e.g. "2040787397". parseInt at insert.
  lang: string; // langSlug e.g. "python3", "rust", "typescript"
  timestamp: string; // Confirmed: unix epoch SECONDS as a string. Multiply * 1000 for ms at insert.
  statusDisplay: string; // e.g. "Accepted", "Wrong Answer"
  runtime: string; // Confirmed: display string, e.g. "2 ms"
  memory: string; // Confirmed: display string, e.g. "46.9 MB"
  title: string;
  titleSlug: string;
  isPending: string; // Confirmed: "Not Pending" for completed submissions; skip any other value at insert (A9).
  url: string;
}

export interface SubmissionListData {
  submissionList: {
    hasNext: boolean;
    submissions: ApiSubmission[];
  };
}

// Confirmed against the live API: query name `submissionList`, variables
// offset/limit/questionSlug (the `slug` GraphQL variable maps to `questionSlug`).
const QUERY = `
query submissionList($offset: Int!, $limit: Int!, $slug: String) {
    submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
        hasNext
        submissions {
            id
            lang
            timestamp
            statusDisplay
            runtime
            memory
            title
            titleSlug
            isPending
            url
        }
    }
}`;

const PAGE_SIZE = 20; // Confirmed: the live API returned exactly 20 rows per page.

export async function fetchSubmissionList(
  questionSlug: string,
  offset: number,
  limit = PAGE_SIZE,
): Promise<SubmissionListData> {
  // Do NOT pass useCache=true — submissions are mutable, re-runs must see fresh data.
  return gqlQuery<SubmissionListData>(QUERY, { offset, limit, slug: questionSlug });
}
