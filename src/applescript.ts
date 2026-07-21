import { spawnWithTimeout } from "./process.ts";

const TIMEOUT = 30_000;
const PERM_RE = /errAEEventNotPermitted|-1743|-10004|Not authorized|not allowed assistive/i;
const PERM_HINT = "\n\nPermission denied. Grant access in System Settings > Privacy & Security > Automation.";

/** Whether an osascript error message indicates a macOS automation-permission denial. */
export function isPermissionError(message: string): boolean {
  return PERM_RE.test(message);
}

/** Escape a string for embedding in AppleScript/JXA double-quoted strings. */
export function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/"/g, '\\"');
}

async function run(flags: string[], script: string, timeout = TIMEOUT): Promise<string> {
  const { stdout, stderr, exitCode } = await spawnWithTimeout([...flags, script], "osascript", timeout);
  if (exitCode !== 0) {
    const msg = stderr.trim() || `osascript exited with code ${exitCode}`;
    throw new Error(isPermissionError(msg) ? msg + PERM_HINT : msg);
  }
  return stdout.trim();
}

export const runAppleScript = (s: string, t?: number) => run(["osascript", "-e"], s, t);
export const runJXA = (s: string, t?: number) => run(["osascript", "-l", "JavaScript", "-e"], s, t);
