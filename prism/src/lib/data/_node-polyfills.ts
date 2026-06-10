// Side-effect module. Import this BEFORE any module that might touch the
// browser-only `File` global (e.g. cheerio's transitive deps on Node 18).
const g = globalThis as unknown as { File?: unknown };
if (typeof g.File === "undefined") {
  g.File = class {} as unknown as typeof File;
}
export {};
