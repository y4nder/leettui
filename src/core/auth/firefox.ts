// Reads LeetCode auth cookies straight from Firefox's cookie store so first-time
// (and post-expiry) setup needs zero copy-paste. Firefox stores cookie values in
// plaintext in `cookies.sqlite` (`moz_cookies`), so no decryption is required —
// unlike Chromium, whose values are AES-encrypted (deferred, see plan).
//
// Firefox holds a write lock on the live DB, so we copy it to a temp file and open
// it read-only. We scan every profile across the standard, snap, and flatpak roots
// and keep the most recently accessed pair that has BOTH tokens (a logged-out
// profile has only `csrftoken`).

import { Database } from "bun:sqlite";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { existsSync, readdirSync, copyFileSync, rmSync } from "fs";

export interface FirefoxCookies {
  csrftoken: string;
  lc_session: string;
}

function cookieDbPaths(): string[] {
  const home = homedir();
  const roots = [
    join(home, ".mozilla", "firefox"),
    join(home, "snap", "firefox", "common", ".mozilla", "firefox"),
    join(home, ".var", "app", "org.mozilla.firefox", ".mozilla", "firefox"),
    join(home, "Library", "Application Support", "Firefox", "Profiles"), // macOS
  ];

  const paths: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const cookiePath = join(root, entry, "cookies.sqlite");
      if (existsSync(cookiePath)) paths.push(cookiePath);
    }
  }
  return paths;
}

interface Row {
  name: string;
  value: string;
  lastAccessed: number;
}

export function readFirefoxCookies(): FirefoxCookies | null {
  let best: { csrftoken: string; lc_session: string; lastAccessed: number } | null = null;

  for (const dbPath of cookieDbPaths()) {
    const tmp = join(
      tmpdir(),
      `leettui-ff-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
    );
    try {
      copyFileSync(dbPath, tmp);
      const db = new Database(tmp, { readonly: true });
      try {
        // ORDER BY lastAccessed ASC so the freshest row overwrites stale duplicates
        // (e.g. host `leetcode.com` vs `.leetcode.com`).
        const rows = db
          .query(
            "SELECT name, value, lastAccessed FROM moz_cookies " +
              "WHERE host LIKE '%leetcode.com%' AND name IN ('LEETCODE_SESSION','csrftoken') " +
              "ORDER BY lastAccessed ASC",
          )
          .all() as Row[];

        let csrftoken = "";
        let lc_session = "";
        let lastAccessed = 0;
        for (const r of rows) {
          if (r.name === "csrftoken") csrftoken = r.value;
          else if (r.name === "LEETCODE_SESSION") lc_session = r.value;
          if (r.lastAccessed > lastAccessed) lastAccessed = r.lastAccessed;
        }

        if (csrftoken && lc_session && (!best || lastAccessed > best.lastAccessed)) {
          best = { csrftoken, lc_session, lastAccessed };
        }
      } finally {
        db.close();
      }
    } catch {
      // Unreadable / corrupt profile — skip it.
    } finally {
      try {
        rmSync(tmp, { force: true });
      } catch {
        // best-effort temp cleanup
      }
    }
  }

  return best ? { csrftoken: best.csrftoken, lc_session: best.lc_session } : null;
}
