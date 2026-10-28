import { access } from "fs/promises";
import { constants } from "fs";
import type { ToolDef } from "../types.ts";
import { CAL_BIN, runCalendarHelper } from "./calendarHelper.ts";
import { isPermissionError } from "../applescript.ts";
import { spawnWithTimeout } from "../process.ts";
const TIMEOUT = 5_000;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "unknown error");

async function runCheck(name: string, cmd: string[], okText?: string): Promise<string> {
  try {
    const { stdout, stderr, exitCode } = await spawnWithTimeout(cmd, name, TIMEOUT);
    if (exitCode !== 0) return `FAIL ${name}: ${stderr.trim() || stdout.trim() || `exit ${exitCode}`}`;
    return `OK ${name}: ${okText ?? stdout.trim()}`;
  } catch (err) {
    return `FAIL ${name}: ${errorMessage(err)}`;
  }
}

async function checkAutomation(appName: string, cmd: string[]): Promise<string> {
  const result = await runCheck(`${appName} automation`, cmd);
  if (isPermissionError(result)) {
    return `FAIL ${appName} permission: grant Automation access in System Settings > Privacy & Security > Automation.`;
  }
  return result;
}

async function checkExecutable(path: string): Promise<string> {
  try {
    await access(path, constants.X_OK);
    return `OK calendar helper: ${path}`;
  } catch {
    return `FAIL calendar helper: missing or not executable at ${path}. Run bun run build:swift.`;
  }
}

const PERMISSION_SUMMARY: Record<string, string> = {
  fullAccess: "OK calendar permission: granted",
  authorized: "OK calendar permission: granted",
  denied: "FAIL calendar permission: denied. Grant access in System Settings > Privacy & Security > Calendars.",
  restricted: "FAIL calendar permission: restricted by macOS policy.",
  writeOnly: "FAIL calendar permission: write-only; Nico Apple MCP needs full calendar access for search/update/delete.",
};

function permissionSummary(helperOutput: string): string {
  const status = /calendar authorization: (\w+)/.exec(helperOutput)?.[1] ?? "";
  return PERMISSION_SUMMARY[status] ?? "WARN calendar permission: not determined. Run a Calendar tool once and approve the macOS prompt.";
}

export async function calendarHelperDiagnostic(
  helperReady: string,
  runHelper: (...args: string[]) => Promise<string> = runCalendarHelper,
): Promise<string[]> {
  if (!helperReady.startsWith("OK")) return [helperReady];
  try {
    const output = await runHelper("--doctor");
    return [helperReady, `OK calendar helper doctor: ${output}`, permissionSummary(output)];
  } catch (err) {
    return [helperReady, `FAIL calendar helper doctor: ${errorMessage(err)}`];
  }
}

const tools: ToolDef[] = [
  {
    name: "doctor",
    desc: "Check local Nico Apple MCP runtime dependencies, helper readiness, and Notes/Contacts automation readiness",
    annotations: { readOnlyHint: true },
    handle: async () => {
      const [osascript, notes, contacts, calendar] = await Promise.all([
        runCheck("osascript", ["osascript", "-e", "return \"ok\""], "available"),
        checkAutomation("Notes", ["osascript", "-e", "tell application \"Notes\" to count folders"]),
        checkAutomation("Contacts", ["osascript", "-l", "JavaScript", "-e", "Application(\"Contacts\").people.length"]),
        checkExecutable(CAL_BIN).then(ready => calendarHelperDiagnostic(ready)),
      ]);
      return [`OK bun: ${Bun.version}`, osascript, notes, contacts, ...calendar].join("\n");
    },
  },
];

export default tools;
