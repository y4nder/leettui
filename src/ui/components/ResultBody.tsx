import { colors } from "@/ui/theme";
import type { ThemeColor } from "@/ui/themes";
import type { ResultView, ResultKind, ResultCase } from "@/views/browse/resultView";
import type { CaseStatus } from "@/core/testRunner";
import { Loading } from "@/ui/components/Loading";

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
    case "loading":
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
        // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered output lines that may repeat
        <text key={i} fg={colors.fg}>
          {" "}
          {line}
        </text>
      ))}
    </box>
  );
}

export function ResultBody({ view }: ResultBodyProps) {
  // In-flight states carry no body — render just the shared spinner + label.
  if (view.kind === "loading") {
    return (
      <box paddingLeft={1}>
        <Loading label={view.title} />
      </box>
    );
  }

  const headerColor = titleColor(view.kind);
  return (
    <>
      <text fg={headerColor}> {view.title} </text>

      {view.metrics && view.metrics.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          {view.metrics.map((m) => (
            <box key={m.label} flexDirection="row">
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
          {view.outputs.map((o) => {
            const expected = o.label.startsWith("Expected");
            return (
              <box key={o.label} flexDirection="row">
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
            // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered error lines that may repeat
            <text key={i} fg={colors.error}>
              {" "}
              {line}
            </text>
          ))}
        </box>
      )}

      {view.notes && view.notes.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          {view.notes.map((n) => (
            <text key={n} fg={colors.subtle}>
              {" "}
              {n}
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
