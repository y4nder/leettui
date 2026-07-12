import { colors } from "@/ui/theme";
import { useAppStore } from "@/ui/store";
import { TextAttributes } from "@opentui/core";

// One-line informational banner shown at the top of the app when a newer release
// is available (state set by BootFlow's non-blocking `checkForUpdate`). Renders
// nothing when no update is pending.
export function UpdateBanner() {
  const tag = useAppStore((s) => s.updateAvailable);
  // Re-render on theme switch, like the other top-level chrome components.
  useAppStore((s) => s.themeVersion);

  if (!tag) return null;

  return (
    <box width="100%" height={1} backgroundColor={colors.info} paddingLeft={1} paddingRight={1}>
      <text fg={colors.bg} attributes={TextAttributes.BOLD}>
        ▲ Update available: {tag} — run `leettui update` (x: dismiss)
      </text>
    </box>
  );
}
