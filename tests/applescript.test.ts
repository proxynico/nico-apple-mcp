import { describe, expect, test } from "bun:test";
import { esc } from "../src/applescript.ts";
import { isoToEpochMs } from "../src/dates.ts";

describe("AppleScript/JXA helpers", () => {
  test("esc escapes quotes, backslashes, and control characters", () => {
    const out = esc('line1"\nline2\\tail');
    expect(out).toContain("\\n");
    expect(out).toContain("\\\\");
    expect(out).toContain('\\"');
  });

  test("isoToEpochMs treats date-only input as local midnight", () => {
    expect(isoToEpochMs("2024-03-15")).toBe(new Date(2024, 2, 15, 0, 0, 0, 0).getTime());
  });

  test("isoToEpochMs rejects invalid dates", () => {
    expect(() => isoToEpochMs("not-a-date")).toThrow("Invalid date");
  });
});
