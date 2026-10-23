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

  test("commits the approved project icon exports", async () => {
    const assetPaths = [
      "assets/nico-apple-mcp.svg",
      "assets/nico-apple-mcp.png",
      "assets/favicon-32.png",
      "assets/favicon.ico",
      "src/helpers/NicoAppleMCPCalendarHelper.icns",
    ];

    for (const assetPath of assetPaths) {
      const asset = Bun.file(`${ROOT}/${assetPath}`);
      expect(await asset.exists()).toBe(true);
      if (await asset.exists()) {
        expect(asset.size).toBeGreaterThan(100);
      }
    }

    const svg = await Bun.file(`${ROOT}/assets/nico-apple-mcp.svg`).text();
    expect(svg).toContain("#263149");
    expect(svg).toContain("#090D18");
    expect(svg).toContain("#FF5F57");
    expect(svg).toContain("#FFD84A");
    expect(svg).toContain("#54A7FF");
    expect(svg).not.toContain("<text");
  });

  test("publishes the icon in the README and Calendar helper bundle", async () => {
    const pkg = await Bun.file(`${ROOT}/package.json`).json();
    const plist = await Bun.file(`${ROOT}/src/helpers/nico-apple-cal.Info.plist`).text();
    const readme = await Bun.file(`${ROOT}/README.md`).text();

    expect(readme).toContain('src="assets/nico-apple-mcp.png"');
    expect(readme).toContain('alt="Nico Apple MCP icon"');
    expect(plist).toContain("<key>CFBundleIconFile</key>");
    expect(plist).toContain("<string>NicoAppleMCPCalendarHelper</string>");
    expect(pkg.scripts["build:swift"]).toContain("Contents/Resources");
    expect(pkg.scripts["build:swift"]).toContain("NicoAppleMCPCalendarHelper.icns");
  });

  test("README uses public paths and repository names", async () => {
    const readme = await Bun.file(`${ROOT}/README.md`).text();

    expect(readme).toContain("proxynico/nico-apple-mcp");
    expect(readme).not.toContain("/Users/nicolasmontero");
    expect(readme).not.toContain("# Cider");
  });

  test("dependency overrides include current audit fixes", async () => {
    const pkg = await Bun.file(`${ROOT}/package.json`).json();

    expect(pkg.overrides.hono).toBe("4.13.13");
    expect(pkg.overrides["body-parser"]).toBe("2.3.0");
  });

  test("lockfile records the new workspace identity", async () => {
    const lockfile = await Bun.file(`${ROOT}/bun.lock`).text();

    expect(lockfile).toContain('"name": "nico-apple-mcp"');
    expect(lockfile).not.toContain('"name": "cider"');
  });

  test("macOS CI runs the repository validation gates", async () => {
    const workflowPath = `${ROOT}/.github/workflows/ci.yml`;
    const exists = await Bun.file(workflowPath).exists();

    expect(exists).toBe(true);
    if (!exists) return;
    const workflow = await Bun.file(workflowPath).text();
    expect(workflow).toContain("actions/checkout@v7");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("bun run test");
    expect(workflow).toContain("swiftc -typecheck src/helpers/nico-apple-cal.swift");
    expect(workflow).toContain("bun run build:swift");
    expect(workflow).toContain("bun audit");
  });
});
