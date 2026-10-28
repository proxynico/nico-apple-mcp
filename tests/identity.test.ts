import { expect, test } from "bun:test";

const ROOT = new URL("..", import.meta.url).pathname;

test("public README uses public paths", async () => {
  const readme = await Bun.file(`${ROOT}/README.md`).text();

  expect(readme).toContain("proxynico/nico-apple-mcp");
  expect(readme).not.toContain("/Users/nicolasmontero");
});
