// The `ResultView` family — the view-model the result UI renders (ResultBody /
// ResultPopup) and the run/submit/local-test builders produce. Pure types, no
// logic; the constructors live in `./builders`, both re-exported from the barrel.

import type { CaseStatus } from "@/core/testRunner";

export type ResultKind = "accepted" | "wrong" | "error" | "info" | "loading";

export interface ResultMetric {
  label: string;
  value: string;
  subtle?: string;
}

export interface ResultDiff {
  testcase?: string;
  expected: string;
  actual: string;
}

export interface ResultCase {
  name: string;
  status: CaseStatus;
  expected?: string;
  actual?: string;
}

export interface ResultView {
  kind: ResultKind;
  title: string;
  metrics?: ResultMetric[];
  diff?: ResultDiff;
  error?: string;
  outputs?: { label: string; value: string }[];
  cases?: ResultCase[];
  notes?: string[];
}
