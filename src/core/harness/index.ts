// Language dispatcher for local test harness generation. Given a langSlug and
// the problem's raw `metaData` JSON, returns the harness file to write next to
// `solution.{ext}`, or null when the language is unsupported or the metaData is
// unusable. Never throws — solution creation must not fail on a bad harness.
//
// Currently only `python3` is supported (Stage 7 item 3). Item 5 adds
// `javascript`.

import { parseMetaData, generatePythonHarness } from "./python";

export interface GeneratedHarness {
  filename: string;
  content: string;
}

export function generateHarness(
  langSlug: string,
  metaDataRaw: string | undefined | null
): GeneratedHarness | null {
  if (!metaDataRaw) return null;

  try {
    switch (langSlug) {
      case "python3": {
        const meta = parseMetaData(metaDataRaw);
        return { filename: "main.py", content: generatePythonHarness(meta) };
      }
      default:
        return null;
    }
  } catch {
    // Missing/unparseable metaData — skip the harness, keep the solution.
    return null;
  }
}
