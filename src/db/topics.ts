import { getDb } from "./index";

export interface DbTopic {
  slug: string;
}

export function getAllTopics(): DbTopic[] {
  return getDb()
    .query("SELECT slug FROM topics ORDER BY slug")
    .all() as DbTopic[];
}

export function getAllTopicsWithAll(): string[] {
  const topics = getAllTopics().map((t) => t.slug);
  return ["all", ...topics];
}
