import { describe, expect, test } from "bun:test";

const ROOT = new URL("..", import.meta.url).pathname;

describe("Nico Apple MCP identity", () => {
  test("package and server metadata use the public project identity", async () => {
    const pkg = await Bun.file(`${ROOT}/package.json`).json();
    const metaExists = await Bun.file(`${ROOT}/src/meta.ts`).exists();

    expect(metaExists).toBe(true);
    if (!metaExists) return;
    const meta = await import("../src/meta.ts") as unknown as Record<string, unknown>;

    expect(pkg.name).toBe("nico-apple-mcp");
    expect(pkg.version).toBe("0.1.0");
    expect(meta.SERVER_NAME).toBe("nico-apple-mcp");
    expect(meta.SERVER_VERSION).toBe("0.1.0");
  });

  test("Calendar helper has a fresh app identity", async () => {
    const swiftPath = `${ROOT}/src/helpers/nico-apple-cal.swift`;
    const plistPath = `${ROOT}/src/helpers/nico-apple-cal.Info.plist`;

    expect(await Bun.file(swiftPath).exists()).toBe(true);
    expect(await Bun.file(plistPath).exists()).toBe(true);
    expect(await Bun.file(`${ROOT}/src/helpers/cider-cal.swift`).exists()).toBe(false);

    const plist = await Bun.file(plistPath).text();
    expect(plist).toContain("com.proxynico.nico-apple-mcp.calendar-helper");
    expect(plist).toContain("Nico Apple MCP Calendar Helper");
  });

  test("README uses public paths and repository names", async () => {
    const readme = await Bun.file(`${ROOT}/README.md`).text();

    expect(readme).toContain("proxynico/nico-apple-mcp");
    expect(readme).not.toContain("/Users/nicolasmontero");
    expect(readme).not.toContain("# Cider");
  });

  test("dependency overrides include current audit fixes", async () => {
    const pkg = await Bun.file(`${ROOT}/package.json`).json();

    expect(pkg.overrides.hono).toBe("4.12.31");
    expect(pkg.overrides["body-parser"]).toBe("2.3.0");
  });

  test("macOS CI runs the repository validation gates", async () => {
    const workflowPath = `${ROOT}/.github/workflows/ci.yml`;
    const exists = await Bun.file(workflowPath).exists();

    expect(exists).toBe(true);
    if (!exists) return;
    const workflow = await Bun.file(workflowPath).text();
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("bun run test");
    expect(workflow).toContain("swiftc -typecheck src/helpers/nico-apple-cal.swift");
    expect(workflow).toContain("bun run build:swift");
    expect(workflow).toContain("bun audit");
  });
});
