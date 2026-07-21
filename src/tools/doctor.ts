import { access } from "fs/promises";
import { constants } from "fs";
import type { ToolDef } from "../types.ts";
import { CAL_BIN, runCalendarHelper } from "./calendarHelper.ts";
import { isPermissionError } from "../applescript.ts";
import { spawnWithTimeout } from "../process.ts";
const TIMEOUT = 5_000;

async function runCheck(name: string, cmd: string[], okText?: string): Promise<string> {
  try {
    const { stdout, stderr, exitCode } = await spawnWithTimeout(cmd, name, TIMEOUT);
    if (exitCode !== 0) return `FAIL ${name}: ${stderr.trim() || stdout.trim() || `exit ${exitCode}`}`;
    return `OK ${name}: ${okText ?? stdout.trim()}`;
  } catch (err) {
    return `FAIL ${name}: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

async function checkExecutable(path: string): Promise<string> {
  try {
    await access(path, constants.X_OK);
    return `OK calendar helper: ${path}`;
  } catch {
    return `FAIL calendar helper: missing or not executable at ${path}. Run bun run build:swift.`;
  }
}

function permissionSummary(helperOutput: string): string {
  if (helperOutput.includes("calendar authorization: fullAccess") || helperOutput.includes("calendar authorization: authorized")) {
    return "OK calendar permission: granted";
  }
  if (helperOutput.includes("calendar authorization: denied")) {
    return "FAIL calendar permission: denied. Grant access in System Settings > Privacy & Security > Calendars.";
  }
  if (helperOutput.includes("calendar authorization: restricted")) {
    return "FAIL calendar permission: restricted by macOS policy.";
  }
  if (helperOutput.includes("calendar authorization: writeOnly")) {
    return "FAIL calendar permission: write-only; Nico Apple MCP needs full calendar access for search/update/delete.";
  }
  return "WARN calendar permission: not determined. Run a Calendar tool once and approve the macOS prompt.";
}

function permissionHint(appName: string, output: string): string {
  if (isPermissionError(output)) {
    return `FAIL ${appName} permission: grant Automation access in System Settings > Privacy & Security > Automation.`;
  }
  return output;
}

export async function calendarHelperDiagnostic(
  helperReady: string,
  runHelper: (...args: string[]) => Promise<string> = runCalendarHelper,
): Promise<string> {
  if (!helperReady.startsWith("OK")) return helperReady;
  try {
    return `OK calendar helper doctor: ${await runHelper("--doctor")}`;
  } catch (err) {
    return `FAIL calendar helper doctor: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

const tools: ToolDef[] = [
  {
    name: "doctor",
    desc: "Check local Nico Apple MCP runtime dependencies, helper readiness, and Notes/Contacts automation readiness",
    annotations: { readOnlyHint: true },
    handle: async () => {
      const helperReady = await checkExecutable(CAL_BIN);
      const helperDoctor = await calendarHelperDiagnostic(helperReady);
      const lines = [
        `OK bun: ${Bun.version}`,
        await runCheck("osascript", ["osascript", "-e", "return \"ok\""], "available"),
        permissionHint("Notes", await runCheck("Notes automation", ["osascript", "-e", "tell application \"Notes\" to count folders"])),
        permissionHint("Contacts", await runCheck("Contacts automation", ["osascript", "-l", "JavaScript", "-e", "Application(\"Contacts\").people.length"])),
        helperReady,
        helperDoctor,
        permissionSummary(helperDoctor),
      ];
      return lines.join("\n");
    },
  },
];

export default tools;
