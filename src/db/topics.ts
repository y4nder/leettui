import { asc } from "drizzle-orm";
import { getDb } from "./index";
import { topics } from "./schema";

export interface DbTopic {
  slug: string;
}

export function getAllTopics(): DbTopic[] {
  return getDb().select().from(topics).orderBy(asc(topics.slug)).all();
}

export function getAllTopicsWithAll(): string[] {
  const all = getAllTopics().map((t) => t.slug);
  return ["all", ...all];
}
