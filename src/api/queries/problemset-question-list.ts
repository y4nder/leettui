import { gqlQuery } from "@/api/graphql";
import type { ProblemsetQuestionListData } from "@/api/types";

const QUERY = `
query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
    problemsetQuestionList: questionList(
        categorySlug: $categorySlug
        limit: $limit
        skip: $skip
        filters: $filters
    ) {
        total: totalNum
        questions: data {
            acRate
            difficulty
            freqBar
            frontendQuestionId: questionFrontendId
            isFavor
            paidOnly: isPaidOnly
            status
            title
            titleSlug
            topicTags {
                name
                id
                slug
            }
            hasSolution
            hasVideoSolution
        }
    }
}`;

export async function fetchQuestionList(
  limit: number,
  skip: number,
): Promise<ProblemsetQuestionListData> {
  return gqlQuery<ProblemsetQuestionListData>(QUERY, {
    categorySlug: "",
    limit,
    skip,
    filters: {},
  });
}
