import { Component, type ReactNode } from "react";

import { logCrash, CRASH_LOG } from "@/core/crash";
import { colors } from "@/ui/theme";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Catches render/commit throws anywhere below it — the failure mode behind the
// "black screen after splash" bug (a throw during render leaves OpenTUI on a
// cleared alternate screen with nothing painted). Instead of black, it logs the
// stack and paints a plain-`<text>` message inside the still-live renderer.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    logCrash("render", error);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <box
        width="100%"
        height="100%"
        flexDirection="column"
        justifyContent="center"
        backgroundColor={colors.bg}
        padding={2}
      >
        <text fg={colors.error}>leettui hit an unexpected error and can't continue.</text>
        <box height={1} />
        <text fg={colors.fg}>{`${error.name}: ${error.message}`}</text>
        <box height={1} />
        <text fg={colors.fgDim}>{`Full stack saved to ${CRASH_LOG}`}</text>
        <text fg={colors.fgDim}>Press Ctrl+C to quit.</text>
      </box>
    );
  }
}
