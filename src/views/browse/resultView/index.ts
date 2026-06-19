// The result view-model: the `ResultView` type family (`./types`) and the
// builders that produce it from API / local-runner responses (`./builders`).
// This barrel preserves the `views/browse/resultView` import path every
// consumer (both views, the store slices, the CLI presenter) already uses.

export * from "./types";
export * from "./builders";
