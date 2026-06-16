import { useTerminalDimensions } from "@opentui/react";
import { colors } from "../../theme";

// Hand-crafted wordmark — block-letter "LEETTUI". Kept to three rows so it fits
// comfortably on small terminals; a single-line wordmark is used when there isn't
// room. `reveal` (0..1) drives a left-to-right wipe used by the splash animation.
const LOGO_LINES = [
  "█   █▀▀ █▀▀ ▀█▀ ▀█▀ █ █ █",
  "█   █▀  █▀   █   █  █ █ █",
  "█▄▄ █▄▄ █▄▄  █   █  █▄█ █",
];
const LOGO_WIDTH = Math.max(...LOGO_LINES.map((l) => l.length));

interface LogoProps {
  /** 0..1 left-to-right reveal. Defaults to fully shown. */
  reveal?: number;
  /** Tagline under the mark. Pass "" to hide. */
  subtitle?: string;
  /** Force the single-line wordmark regardless of width. */
  compact?: boolean;
}

export function Logo({ reveal = 1, subtitle = "LeetCode in your terminal", compact }: LogoProps) {
  const { width } = useTerminalDimensions();
  const useCompact = compact || width < LOGO_WIDTH + 4;
  const showSubtitle = reveal >= 1 && subtitle.length > 0;

  if (useCompact) {
    return (
      <box flexDirection="column" alignItems="center">
        <text fg={colors.accent}>
          {"‹ leettui ›".slice(0, Math.max(0, Math.round(reveal * 11)))}
        </text>
        {showSubtitle ? <text fg={colors.subtle}>{subtitle}</text> : null}
      </box>
    );
  }

  const cols = Math.max(0, Math.round(reveal * LOGO_WIDTH));

  return (
    <box flexDirection="column" alignItems="center">
      <box width={LOGO_WIDTH} flexDirection="column" alignItems="flex-start">
        {LOGO_LINES.map((line, i) => (
          <text key={i} fg={colors.accent}>
            {line.slice(0, cols)}
          </text>
        ))}
      </box>
      {showSubtitle ? (
        <box flexDirection="column" alignItems="center">
          <box height={1} />
          <text fg={colors.subtle}>{subtitle}</text>
        </box>
      ) : null}
    </box>
  );
}
