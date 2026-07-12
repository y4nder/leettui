// Bun bundles `import x from "@/file.sql" with { type: "text" }` as a string,
// both in dev and in `bun build --compile` binaries. Tell TS the module shape.
declare module "*.sql" {
  const content: string;
  export default content;
}
