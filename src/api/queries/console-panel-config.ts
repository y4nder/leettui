import { gqlQuery } from "@/api/graphql";
import type { ConsolePanelConfigData } from "@/api/types";

const QUERY = `
query consolePanelConfig($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    questionTitle
    exampleTestcaseList
    metaData
  }
}`;

export async function fetchConsolePanelConfig(titleSlug: string): Promise<ConsolePanelConfigData> {
  return gqlQuery<ConsolePanelConfigData>(QUERY, { titleSlug }, true);
}
