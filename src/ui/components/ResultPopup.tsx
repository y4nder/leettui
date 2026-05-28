import { useBindings } from "@opentui/keymap/react";
import { colors } from "../theme";
import { resultBindings } from "../keymap";
import type { ResultView, ResultKind } from "../../views/browse/resultView";

interface ResultPopupProps {
  view: ResultView;
}

function titleColor(kind: ResultKind): string {
  switch (kind) {
    case "accepted":
      return colors.accepted;
    case "wrong":
    case "error":
      return colors.hard;
    case "pending":
    case "info":
      return colors.fgDim;
  }
}

function Section({ label, color, value }: { label: string; color: string; value: string }) {
  const lines = value.split("\n");
  return (
    <box
      flexDirection="column"
      borderStyle="single"
      borderColor={color}
      marginTop={1}
    >
      <text fg={color}> {label} </text>
      {lines.map((line, i) => (
        <text key={i} fg={colors.fg}>
          {" "}
          {line}
        </text>
      ))}
    </box>
  );
}

export function ResultPopup({ view }: ResultPopupProps) {
  useBindings(() => ({ bindings: resultBindings }), []);
  const headerColor = titleColor(view.kind);

  return (
    <box
      position="absolute"
      left="15%"
      top="15%"
      width="70%"
      height="70%"
      borderStyle="rounded"
      borderColor={colors.borderFocused}
      backgroundColor={colors.bgPopup}
      flexDirection="column"
    >
      <text fg={colors.fgAccent}> Result </text>

      <scrollbox flexGrow={1}>
        <text fg={headerColor}> {view.title} </text>

        {view.metrics && view.metrics.length > 0 && (
          <box flexDirection="column" marginTop={1}>
            {view.metrics.map((m, i) => (
              <box key={i} flexDirection="row">
                <text fg={colors.fgDim}> {m.label}: </text>
                <text fg={colors.fg}>{m.value}</text>
                {m.subtle && <text fg={colors.fgDim}> ({m.subtle})</text>}
              </box>
            ))}
          </box>
        )}

        {view.diff && (
          <box flexDirection="column">
            {view.diff.testcase && (
              <Section
                label="Last Testcase"
                color={colors.fgAccent}
                value={view.diff.testcase}
              />
            )}
            <Section label="Expected" color={colors.accepted} value={view.diff.expected} />
            <Section label="Your Output" color={colors.hard} value={view.diff.actual} />
          </box>
        )}

        {view.outputs && view.outputs.length > 0 && (
          <box flexDirection="column" marginTop={1}>
            {view.outputs.map((o, i) => {
              const expected = o.label.startsWith("Expected");
              return (
                <box key={i} flexDirection="row">
                  <text fg={expected ? colors.accepted : colors.fgAccent}>
                    {" "}
                    {o.label}:{" "}
                  </text>
                  <text fg={colors.fg}>{o.value}</text>
                </box>
              );
            })}
          </box>
        )}

        {view.error && (
          <box flexDirection="column" marginTop={1}>
            {view.error.split("\n").map((line, i) => (
              <text key={i} fg={colors.hard}>
                {" "}
                {line}
              </text>
            ))}
          </box>
        )}
      </scrollbox>

      <text fg={colors.fgDim}> Esc/Enter:Close </text>
    </box>
  );
}
