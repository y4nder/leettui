// Registers the `<spinner>` intrinsic (idempotent with the sync surfaces' imports).
import "opentui-spinner/react";

import { colors } from "@/ui/theme";

// The single in-flight affordance for the app: the same star spinner the sync
// screens use, paired with a dim label. Used for the ProblemView fetch placeholder
// and for the transient "Running…/Submitting…" result states, so every "working…"
// moment reads alike.
export function Loading({ label }: { label: string }) {
  return (
    <box flexDirection="row" alignItems="center">
      <spinner name="star" color={colors.accent} />
      <text fg={colors.fgDim} marginLeft={1}>
        {label}
      </text>
    </box>
  );
}
