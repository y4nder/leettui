import { colors } from "@/ui/theme";
import { useAppStore } from "@/ui/store";
import { TextAttributes } from "@opentui/core";

// One-line informational banner shown at the top of the app for the two update
// stages: a newer release exists (`updateAvailable`, set by the update
// scheduler's check) or the background auto-update already installed it
// (`updateInstalled` — the "restart to apply" CTA, which supersedes the
// available banner). Renders nothing when neither is set.
export function UpdateBanner() {
  const tag = useAppStore((s) => s.updateAvailable);
  const installed = useAppStore((s) => s.updateInstalled);
  // Re-render on theme switch, like the other top-level chrome components.
  useAppStore((s) => s.themeVersion);

  if (installed) {
    return (
      <box
        width="100%"
        height={1}
        backgroundColor={colors.success}
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={colors.bg} attributes={TextAttributes.BOLD}>
          ▲ Updated to {installed} — restart leettui to apply (x: dismiss)
        </text>
      </box>
    );
  }

  if (!tag) return null;

  return (
    <box width="100%" height={1} backgroundColor={colors.info} paddingLeft={1} paddingRight={1}>
      <text fg={colors.bg} attributes={TextAttributes.BOLD}>
        ▲ Update available: {tag} — run `leettui update` (x: dismiss)
      </text>
    </box>
  );
}
