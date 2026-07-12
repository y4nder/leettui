import { gqlQuery } from "@/api/graphql";
import type { DailyChallengeData } from "@/api/types";

const QUERY = `
query questionOfToday {
  activeDailyCodingChallengeQuestion {
    date
    link
    question {
      titleSlug
      title
      difficulty
      frontendQuestionId: questionFrontendId
    }
  }
}`;

export async function fetchDailyChallenge(): Promise<DailyChallengeData> {
  return gqlQuery<DailyChallengeData>(QUERY, {}, true);
}
