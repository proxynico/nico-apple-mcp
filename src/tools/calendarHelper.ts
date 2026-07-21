import { dirname, resolve } from "path";
import { spawnWithTimeout } from "../process.ts";

export const CAL_APP = resolve(dirname(import.meta.path), "../helpers/CiderCalendarHelper.app");
export const CAL_BIN = resolve(CAL_APP, "Contents/MacOS/cider-cal");
const CAL_TIMEOUT = 30_000;

export async function runCalendarHelper(...args: string[]): Promise<string> {
  const resultFile = `/tmp/cider-cal-${Bun.nanoseconds()}-${Math.random().toString(36).slice(2)}.txt`;
  try {
    const { stdout, stderr, exitCode } = await spawnWithTimeout(
      ["open", "-W", "-n", CAL_APP, "--args", ...args, "--result-file", resultFile],
      "cider-cal",
      CAL_TIMEOUT,
    );
    if (exitCode !== 0) throw new Error(stderr.trim() || stdout.trim() || `open exited ${exitCode}`);
    const result = await Bun.file(resultFile).text().catch(() => "");
    if (!result.trim()) {
      throw new Error("cider-cal did not return a result. Check Calendar permission for CiderCalendarHelper.");
    }
    return result.trim();
  } finally {
    await Bun.file(resultFile).delete().catch(() => {});
  }
}
