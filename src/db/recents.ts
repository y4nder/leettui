import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/index";
import { type DbQuestion, toDbQuestion } from "@/db/questions";
import { questions, recents } from "@/db/schema";

// A recently-viewed question: the full question row plus the epoch-millis instant
// it was last viewed (so the modal can show "when"). `viewedAt` is the same value
// `recordRecent` writes (`Date.now()` at view time).
export interface RecentQuestion extends DbQuestion {
  viewedAt: number;
}

// Most-recent-wins cap: the history holds at most this many questions; re-viewing
// an existing one bumps it rather than growing the list, and viewing a new one
// past the cap trims the oldest. ~50 is plenty for "where was I?" recall.
export const RECENTS_CAP = 50;

// Record a question as just-viewed (Stage 20). Upserts a single row keyed by the
// question's stable PK — a re-view bumps `viewed_at` to now (bump-to-top) instead
// of inserting a duplicate — then trims the history back to `cap` rows, dropping
// the oldest. `now`/`cap` are injectable so the data layer is deterministically
// testable (real call sites pass neither).
export function recordRecent(
  questionId: number,
  now: number = Date.now(),
  cap = RECENTS_CAP,
): void {
  const db = getDb();
  db.insert(recents)
    .values({ questionId, viewedAt: now })
    .onConflictDoUpdate({ target: recents.questionId, set: { viewedAt: now } })
    .run();

  // Keep only the `cap` newest rows. A NOT IN over the top-`cap` subquery deletes
  // the tail in one statement (the idx_recents_viewed_at index orders both sides).
  db.run(sql`
    DELETE FROM ${recents}
    WHERE ${recents.questionId} NOT IN (
      SELECT ${recents.questionId} FROM ${recents}
      ORDER BY ${recents.viewedAt} DESC
      LIMIT ${cap}
    )
  `);
}

// Recently-viewed questions, newest first (Stage 20), each carrying its `viewedAt`
// instant. Inner-joined back to the `questions` table, so a recent whose question
// is no longer present is silently skipped (defensive — the FK keeps this from
// happening in practice).
export function getRecents(): RecentQuestion[] {
  return getDb()
    .select()
    .from(recents)
    .innerJoin(questions, eq(recents.questionId, questions.id))
    .orderBy(desc(recents.viewedAt))
    .all()
    .map((row) => ({ ...toDbQuestion(row.questions), viewedAt: row.recents.viewedAt }));
}
