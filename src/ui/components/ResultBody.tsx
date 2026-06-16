import { colors } from "../theme";
import type { ThemeColor } from "../themes";
import type { ResultView, ResultKind, ResultCase } from "../../views/browse/resultView";
import type { CaseStatus } from "../../core/testRunner";

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

function caseGlyph(status: CaseStatus): { glyph: string; color: ThemeColor } {
  switch (status) {
    case "pass":
      return { glyph: "✓", color: colors.success };
    case "fail":
      return { glyph: "✗", color: colors.error };
    case "error":
    case "timeout":
      return { glyph: "!", color: colors.error };
    case "ran":
      return { glyph: "·", color: colors.subtle };
  }
}

function CaseRow({ c }: { c: ResultCase }) {
  const { glyph, color } = caseGlyph(c.status);
  // fail → show the expected/actual diff. error/timeout → show the captured
  // message (held in `actual`). pass/ran → just the status line.
  return (
    <box flexDirection="column" marginTop={1}>
      <box flexDirection="row">
        <text fg={color}> {glyph} </text>
        <text fg={colors.fg}>{c.name}</text>
        {(c.status === "error" || c.status === "timeout") && (
          <text fg={colors.subtle}> ({c.status})</text>
        )}
      </box>
      {c.status === "fail" && (
        <>
          {c.expected !== undefined && (
            <Section label="Expected" color={colors.success} value={c.expected} />
          )}
          {c.actual !== undefined && (
            <Section label="Your Output" color={colors.error} value={c.actual} />
          )}
        </>
      )}
      {(c.status === "error" || c.status === "timeout") && c.actual && (
        <Section label="Error" color={colors.error} value={c.actual} />
      )}
      {c.status === "ran" && c.actual !== undefined && (
        <Section label="Output" color={colors.info} value={c.actual} />
      )}
    </box>
  );
}

function Section({ label, color, value }: { label: string; color: ThemeColor; value: string }) {
  const lines = value.split("\n");
  return (
    <box flexDirection="column" borderStyle="single" borderColor={color} marginTop={1}>
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
            <Section label="Last Testcase" color={colors.info} value={view.diff.testcase} />
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
                <text fg={expected ? colors.success : colors.info}> {o.label}: </text>
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

      {view.cases && view.cases.length > 0 && (
        <box flexDirection="column">
          {view.cases.map((c) => (
            <CaseRow key={c.name} c={c} />
          ))}
        </box>
      )}
    </>
  );
}
