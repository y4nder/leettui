import crypto from "node:crypto";
import type { MigrationMeta } from "drizzle-orm/migrator";
import journal from "../../drizzle/meta/_journal.json";

// Embedded migrations.
//
// At dev time drizzle reads `drizzle/` from disk, but a `bun build --compile`
// binary has no such folder. Importing the journal (JSON) and each SQL file as
// bundled text (`with { type: "text" }`) makes the migrations travel *inside*
// the binary, so startup migration works identically in dev and when shipped.
//
// Adding a migration (`bun run db:generate`):
//   1. import the new `drizzle/NNNN_*.sql` as text below
//   2. add a `tag -> text` entry to SQL_BY_TAG
// The journal (imported above) stays the source of truth for ordering/timing.
import m0000 from "../../drizzle/0000_panoramic_senator_kelly.sql" with { type: "text" };
import m0001 from "../../drizzle/0001_even_proudstar.sql" with { type: "text" };
import m0002 from "../../drizzle/0002_marvelous_maverick.sql" with { type: "text" };

const SQL_BY_TAG: Record<string, string> = {
  "0000_panoramic_senator_kelly": m0000,
  "0001_even_proudstar": m0001,
  "0002_marvelous_maverick": m0002,
};

// Mirror of drizzle's `readMigrationFiles`, but sourced from embedded strings
// instead of the filesystem. The resulting shape is byte-for-byte what
// `db.dialect.migrate` expects, including the sha256 hash over the raw SQL.
export function embeddedMigrations(): MigrationMeta[] {
  return journal.entries.map((entry) => {
    const query = SQL_BY_TAG[entry.tag];
    if (query === undefined) {
      throw new Error(
        `Missing embedded SQL for migration "${entry.tag}". ` +
          `Import its .sql file and add it to SQL_BY_TAG in src/db/migrations.ts.`,
      );
    }
    return {
      sql: query.split("--> statement-breakpoint"),
      bps: entry.breakpoints,
      folderMillis: entry.when,
      hash: crypto.createHash("sha256").update(query).digest("hex"),
    };
  });
}
