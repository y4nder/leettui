// Async orchestration for browse-mode actions. Pure helpers: each handler
// receives the store and renderer it needs as arguments — no React imports,
// no top-level singletons — so they remain easy to reason about and reuse.
//
// Split by concern into sibling modules; this barrel preserves the
// `views/browse/handlers` import path every consumer uses.

export * from "./daily";
export * from "./editor";
export * from "./solve";
export * from "./location";
export * from "./git";
export * from "./backfill";
