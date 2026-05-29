import { colors } from "../theme";
import type { ThemeColor } from "../themes";
import type { ResultView, ResultKind } from "../../views/browse/resultView";

interface ResultBodyProps {
  view: ResultView;
}

function titleColor(kind: ResultKind): ThemeColor {
  switch (kind) {
    case "accepted":
      return colors.success;
    case "wrong":
    case "error":
      return colors.error;
    case "pending":
    case "info":
      return colors.subtle;
  }
}

function Section({ label, color, value }: { label: string; color: ThemeColor; value: string }) {
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

export function ResultBody({ view }: ResultBodyProps) {
  const headerColor = titleColor(view.kind);
  return (
    <>
      <text fg={headerColor}> {view.title} </text>

      {view.metrics && view.metrics.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          {view.metrics.map((m, i) => (
            <box key={i} flexDirection="row">
              <text fg={colors.subtle}> {m.label}: </text>
              <text fg={colors.fg}>{m.value}</text>
              {m.subtle && <text fg={colors.subtle}> ({m.subtle})</text>}
            </box>
          ))}
        </box>
      )}

      {view.diff && (
        <box flexDirection="column">
          {view.diff.testcase && (
            <Section
              label="Last Testcase"
              color={colors.info}
              value={view.diff.testcase}
            />
          )}
          <Section label="Expected" color={colors.success} value={view.diff.expected} />
          <Section label="Your Output" color={colors.error} value={view.diff.actual} />
        </box>
      )}

      {view.outputs && view.outputs.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          {view.outputs.map((o, i) => {
            const expected = o.label.startsWith("Expected");
            return (
              <box key={i} flexDirection="row">
                <text fg={expected ? colors.success : colors.info}>
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
            <text key={i} fg={colors.error}>
              {" "}
              {line}
            </text>
          ))}
        </box>
      )}
    </>
  );
}
