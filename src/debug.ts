export interface DebugEntry {
  ts: string;
  key: string;
  mods: string;
  mode: string;
  action: string;
  error?: string;
}

const MAX = 200;
let enabled = false;
const ring: DebugEntry[] = [];

export function initDebug(flag: boolean): void {
  enabled = flag;
}

export function isDebugEnabled(): boolean {
  return enabled;
}

function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function push(entry: DebugEntry): void {
  ring.push(entry);
  if (ring.length > MAX) ring.shift();
}

export function logKey(key: string, mods: string, mode: string, action: string): void {
  if (!enabled) return;
  push({ ts: timestamp(), key, mods, mode, action });
}

export function logError(key: string, mode: string, action: string, err: unknown): void {
  if (!enabled) return;
  const error = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  push({ ts: timestamp(), key, mods: "", mode, action, error });
}

export function getEntries(): DebugEntry[] {
  return [...ring];
}

export function dumpToString(): string {
  return ring
    .map((e) => {
      const modPart = e.mods ? `+${e.mods}` : "";
      const base = `[${e.ts}] key=${e.key}${modPart} mode=${e.mode} → ${e.action}`;
      if (!e.error) return base;
      return `${base}\n  ERROR: ${e.error.replace(/\n/g, "\n  ")}`;
    })
    .join("\n");
}
