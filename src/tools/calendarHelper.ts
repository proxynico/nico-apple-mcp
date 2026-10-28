import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { spawnWithTimeout } from "../process.ts";

export const CAL_APP = resolve(dirname(import.meta.path), "../helpers/NicoAppleMCPCalendarHelper.app");
export const CAL_BIN = resolve(CAL_APP, "Contents/MacOS/nico-apple-cal");
const CAL_TIMEOUT = 30_000;

const readText = (path: string) => Bun.file(path).text().then(text => text.trim(), () => "");

/**
 * Run the helper through LaunchServices so macOS grants Calendar access to the helper app itself.
 * `open` doesn't relay the app's output, so its stdout and stderr go through temp files.
 * `-g` keeps the helper from taking focus.
 */
export async function runCalendarHelper(...args: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "nico-apple-cal-"));
  const outFile = join(dir, "stdout");
  const errFile = join(dir, "stderr");
  try {
    const { stdout, stderr, exitCode } = await spawnWithTimeout(
      ["open", "-g", "-W", "-n", "--stdout", outFile, "--stderr", errFile, CAL_APP, "--args", ...args],
      "nico-apple-cal",
      CAL_TIMEOUT,
    );
    if (exitCode !== 0) throw new Error(stderr.trim() || stdout.trim() || `open exited ${exitCode}`);
    const [result, error] = await Promise.all([readText(outFile), readText(errFile)]);
    if (result) return result;
    throw new Error(error || "nico-apple-cal did not return a result. Check Calendar permission for NicoAppleMCPCalendarHelper.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
