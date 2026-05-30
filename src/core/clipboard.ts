// Clipboard via OSC 52 — a terminal escape sequence that asks the emulator to
// set the system clipboard. Works locally and over SSH without spawning an
// external helper (xclip/pbcopy/wl-copy), at the cost of requiring an OSC
// 52-capable terminal. We write directly to stdout; the sequence passes
// through the alternate screen unaffected.
export function copyToClipboard(text: string): void {
  const b64 = Buffer.from(text, "utf-8").toString("base64");
  process.stdout.write(`\x1b]52;c;${b64}\x07`);
}

export function problemUrl(titleSlug: string): string {
  return `https://leetcode.com/problems/${titleSlug}/`;
}
