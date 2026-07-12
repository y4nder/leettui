import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Variables substituted into per-language template files. `functionName` comes
// from the problem's metaData (absent when metaData is missing/unparseable).
export interface TemplateVars {
  functionName?: string;
  titleSlug: string;
}

// Substitutes `{{functionName}}`/`{{titleSlug}}` (optional inner whitespace) in
// a template file's text. A missing `functionName` degrades to an empty string,
// mirroring `generateHarness` returning null without metaData.
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{\{\s*functionName\s*\}\}/g, vars.functionName ?? "")
    .replace(/\{\{\s*titleSlug\s*\}\}/g, vars.titleSlug ?? "");
}

// Copies every file from a per-language template dir into the destination
// language folder, rendering `{{...}}` vars. Create-if-absent (a user's prior
// edits are never clobbered). Returns the set of template filenames seen, so
// the caller can suppress the bundled default for any filename the template
// already provides (e.g. `solution.py` overrides the snippet, `main.py`
// overrides the generated harness). A missing template dir → empty set.
export function overlayTemplates(srcDir: string, destDir: string, vars: TemplateVars): Set<string> {
  const applied = new Set<string>();
  if (!existsSync(srcDir)) return applied;

  let entries: string[];
  try {
    entries = readdirSync(srcDir);
  } catch {
    return applied;
  }

  for (const name of entries) {
    const srcPath = join(srcDir, name);
    let raw: string;
    try {
      // Top-level files only — subdirectories are intentionally not recursed.
      if (!statSync(srcPath).isFile()) continue;
      raw = readFileSync(srcPath, "utf-8");
    } catch {
      // Unreadable entry — skip it, never fail solution creation.
      continue;
    }
    applied.add(name);
    const destPath = join(destDir, name);
    if (!existsSync(destPath)) {
      mkdirSync(destDir, { recursive: true });
      writeFileSync(destPath, renderTemplate(raw, vars));
    }
  }
  return applied;
}
