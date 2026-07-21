/**
 * MCP server startup test.
 *
 * Spawns `bun run src/index.ts` and verifies the process doesn't immediately
 * crash. This is the exact failure mode that breaks Claude Code's MCP
 * connection — a parse/runtime error during startup causes the server to
 * exit with a non-zero code before the stdio handshake can happen.
 */
import { test, expect } from "bun:test";

const ROOT = new URL("..", import.meta.url).pathname;
const STARTUP_GRACE_MS = 1_000;

test("calendar helper build embeds Calendar privacy usage descriptions", async () => {
  const pkg = await Bun.file(`${ROOT}/package.json`).json();
  const buildScript = pkg.scripts["build:swift"];
  expect(buildScript).toContain("CiderCalendarHelper.app/Contents/MacOS");
  expect(buildScript).toContain("src/helpers/cider-cal.Info.plist");
  expect(buildScript).toContain("src/helpers/cider-cal.entitlements");
  expect(buildScript).toContain("--options runtime");
  expect(buildScript).toContain("codesign --force --sign -");

  const plist = await Bun.file(`${ROOT}/src/helpers/cider-cal.Info.plist`).text();
  expect(plist).toContain("com.proxynico.cider.calendar-helper");
  expect(plist).toContain("NSCalendarsFullAccessUsageDescription");
  expect(plist).toContain("NSCalendarsUsageDescription");

  const entitlements = await Bun.file(`${ROOT}/src/helpers/cider-cal.entitlements`).text();
  expect(entitlements).toContain("com.apple.security.personal-information.calendars");
});

test(
  "server starts without crashing",
  async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      // Keep stdin open as a pipe so the stdio-transport server doesn't see
      // an immediate EOF and exit before we can check it's alive.
      stdin: "pipe",
    });

    // Give the server time to initialise (or crash).
    await new Promise<void>((resolve) => setTimeout(resolve, STARTUP_GRACE_MS));

    const exitedAlready = proc.exitCode !== null;
    if (exitedAlready) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(
        `Server exited with code ${proc.exitCode} immediately after starting.\n\nstderr:\n${stderr}`
      );
    }

    proc.kill();
    await proc.exited;
  },
  STARTUP_GRACE_MS + 3_000
);
