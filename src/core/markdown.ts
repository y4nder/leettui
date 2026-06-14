// HTML → Markdown conversion for LeetCode problem descriptions.
//
// LeetCode serves descriptions as HTML with a few constructs that the default
// node-html-markdown conversion mangles:
//   - <sup>/<sub> exponents: `10<sup>5</sup>` collapses to `105`, losing the
//     power. We map them to `^5` / `_i` so constraints stay readable.
//   - <img> tags: images don't render in a TUI, so we drop them rather than
//     leave broken `![](...)` noise.
//   - &nbsp; (decoded to U+00A0): collapsed back to a normal space.
//
// A single configured converter is shared by every call site so the rendered
// markdown is consistent across the problem view and the daily-challenge popup.

import { NodeHtmlMarkdown } from "node-html-markdown";

const converter = new NodeHtmlMarkdown(
  {
    codeBlockStyle: "fenced",
    bulletMarker: "-",
    textReplace: [
      // Non-breaking spaces (decoded &nbsp;) \u2192 normal spaces.
      [/\u00a0/g, " "],
    ],
  },
  {
    // Exponents / subscripts: keep the math legible in plain text.
    sup: { prefix: "^", recurse: true },
    sub: { prefix: "_", recurse: true },
    // No images in a terminal.
    img: { ignore: true },
  },
);

export function htmlToMarkdown(html: string): string {
  return converter.translate(html);
}
