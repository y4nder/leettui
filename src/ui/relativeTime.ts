// Compact relative-time formatting for "when did this happen" displays (e.g. the
// recents modal's viewed-at column). Pure + `now`-injectable so the boundary cases
// are unit-tested deterministically. Coarse on purpose — a TUI list wants "3h ago",
// not "3 hours, 12 minutes ago".
export function formatRelative(ms: number, now: number = Date.now()): string {
  const sec = Math.floor((now - ms) / 1000);
  if (sec < 60) return "just now"; // also covers clock skew / future timestamps (sec < 0)

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;

  return `${Math.floor(day / 365)}y ago`;
}
