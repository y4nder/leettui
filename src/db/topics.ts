import { asc } from "drizzle-orm";
import { getDb } from "@/db/index";
import { topics } from "@/db/schema";

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
