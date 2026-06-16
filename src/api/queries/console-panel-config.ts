import { gqlQuery } from "../graphql";
import type { ConsolePanelConfigData } from "../types";

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
