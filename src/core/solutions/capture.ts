// STUB — RED phase only. Type-checking placeholder so capture.test.ts fails
// on assertions (not a missing-module compile error) under the repo's
// zero-tolerance `tsc --noEmit` pre-commit gate. Real implementation lands in
// the immediately-following GREEN commit.

export type CaptureOutcome = "captured" | "blessed" | "duplicate" | "mismatch";

export interface CaptureResult {
  name: string;
  outcome: CaptureOutcome;
  note: string;
}

export function captureFailingCase(
  _testsDir: string,
  _input: string,
  _expectedOutput?: string,
): CaptureResult {
  throw new Error("not implemented");
}

export function blessRunOutputs(
  _testsDir: string,
  _exampleTestcaseList: string[],
  _expectedCodeAnswer?: string[],
): CaptureResult[] {
  throw new Error("not implemented");
}
