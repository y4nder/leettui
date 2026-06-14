// Pure parser for pasted LeetCode auth cookies. Accepts any of:
//   - a full `Cookie:` request header  (`Cookie: csrftoken=…; LEETCODE_SESSION=…`)
//   - a `document.cookie` dump          (`csrftoken=…; LEETCODE_SESSION=…`)
//   - newline-separated `KEY=VALUE` lines
// Extracts `csrftoken` and `LEETCODE_SESSION` (mapped to `lc_session`). Tolerant of
// `; ` / newline separators, a leading `Cookie:` label, and surrounding whitespace/quotes.
// No side effects — unit-tested in paste.test.ts.

export interface ParsedCookies {
  csrftoken?: string;
  lc_session?: string;
}

export function parseCookieInput(raw: string): ParsedCookies {
  const out: ParsedCookies = {};
  if (!raw) return out;

  // Drop an optional leading `Cookie:` header label.
  const cleaned = raw.trim().replace(/^cookie:\s*/i, "");

  for (const part of cleaned.split(/[;\n]+/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    // Keep everything after the first `=` (session/csrf values may contain `=` padding).
    let val = part.slice(eq + 1).trim().replace(/^["']|["']$/g, "").trim();
    if (!val) continue;
    if (key === "LEETCODE_SESSION") out.lc_session = val;
    else if (key === "csrftoken") out.csrftoken = val;
  }

  return out;
}
