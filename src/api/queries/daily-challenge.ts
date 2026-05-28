import { gqlQuery } from "../graphql";
import type { DailyChallengeData } from "../types";

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
