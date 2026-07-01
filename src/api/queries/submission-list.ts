import { gqlQuery } from "../graphql";

// [ASSUMED] — field names, types, and units reverse-engineered from the
// JacobLinCool/LeetCode-Query community library (RESEARCH.md §Pattern 3).
// Every field here is pending live-spike validation (plan 01-02 Task 2) before
// the backfill service (Task 3) is built against it.
export interface ApiSubmission {
  id: string; // [ASSUMED] string; parseInt at insert; validate it matches CheckResponse.submission_id
  lang: string; // langSlug e.g. "python3"
  timestamp: string; // [ASSUMED] unix epoch SECONDS as string; multiply * 1000 for ms at insert
  statusDisplay: string; // e.g. "Accepted", "Wrong Answer"
  runtime: string; // [ASSUMED] display string e.g. "52 ms"
  memory: string; // [ASSUMED] display string e.g. "16.4 MB"
  title: string;
  titleSlug: string;
  isPending: string; // [ASSUMED] "Not Pending" when complete
  url: string;
}

export interface SubmissionListData {
  submissionList: {
    hasNext: boolean;
    submissions: ApiSubmission[];
  };
}

// [ASSUMED] — query name + variable names (offset/limit/questionSlug) reverse-
// engineered; not yet confirmed against the live API.
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

const PAGE_SIZE = 20; // [ASSUMED] — validate in spike

export async function fetchSubmissionList(
  questionSlug: string,
  offset: number,
  limit = PAGE_SIZE,
): Promise<SubmissionListData> {
  // Do NOT pass useCache=true — submissions are mutable, re-runs must see fresh data.
  return gqlQuery<SubmissionListData>(QUERY, { offset, limit, slug: questionSlug });
}
