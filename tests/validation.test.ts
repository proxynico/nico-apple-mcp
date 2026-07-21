import { describe, expect, test } from "bun:test";
import { toZodSchema, toZodShape } from "../src/types.ts";
import type { ToolDef } from "../src/types.ts";
import { z } from "zod";

const mock: ToolDef = {
  name: "test_tool",
  desc: "test",
  params: {
    title: { type: "string", desc: "Title", req: true },
    count: { type: "number", desc: "Count", int: true, min: 0, max: 10 },
    date: { type: "string", desc: "Date", date: true },
    flag: { type: "boolean", desc: "Flag" },
  },
  handle: async () => "",
};

const noParams: ToolDef = { name: "empty", desc: "test", handle: async () => "" };

const parse = (def: ToolDef, input: unknown) => z.object(toZodShape(def)).parse(input);
const ok = (def: ToolDef, input: unknown) => z.object(toZodShape(def)).safeParse(input).success;

describe("toZodShape validation", () => {
  test("passes valid required-only input", () => {
    expect(() => parse(mock, { title: "hi" })).not.toThrow();
  });

  test("passes valid input with all fields", () => {
    expect(() => parse(mock, { title: "hi", count: 5, date: "2024-01-01T00:00:00", flag: true })).not.toThrow();
  });

  test("rejects missing required field", () => {
    expect(ok(mock, {})).toBe(false);
  });

  test("rejects empty required string", () => {
    expect(ok(mock, { title: "   " })).toBe(false);
  });

  test("rejects wrong type", () => {
    expect(ok(mock, { title: 42 })).toBe(false);
  });

  test("rejects invalid date string", () => {
    expect(ok(mock, { title: "hi", date: "nope" })).toBe(false);
  });

  test("rejects non-ISO but parseable date strings", () => {
    expect(ok(mock, { title: "hi", date: "2024/01/01" })).toBe(false);
    expect(ok(mock, { title: "hi", date: "March 15, 2024" })).toBe(false);
  });

  test("rejects impossible ISO dates", () => {
    expect(ok(mock, { title: "hi", date: "2024-02-30" })).toBe(false);
  });

  test("rejects impossible ISO timezone offsets", () => {
    expect(ok(mock, { title: "hi", date: "2024-01-01T10:00:00+99:99" })).toBe(false);
    expect(ok(mock, { title: "hi", date: "2024-01-01T10:00:00+23:60" })).toBe(false);
  });

  test("rejects non-integer", () => {
    expect(ok(mock, { title: "hi", count: 1.5 })).toBe(false);
  });

  test("rejects below min", () => {
    expect(ok(mock, { title: "hi", count: -1 })).toBe(false);
  });

  test("rejects above max", () => {
    expect(ok(mock, { title: "hi", count: 11 })).toBe(false);
  });

  test("rejects non-boolean", () => {
    expect(ok(mock, { title: "hi", flag: "yes" })).toBe(false);
  });

  test("accepts empty args for tool with no params", () => {
    expect(() => parse(noParams, {})).not.toThrow();
  });

  test("rejects unknown fields", () => {
    expect(toZodSchema(mock).safeParse({ title: "hi", dry_run: true }).success).toBe(false);
  });
});
