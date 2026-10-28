import { z } from "zod";
import { isIsoDateString } from "./dates.ts";

export interface Param {
  type: "string" | "boolean" | "number";
  desc: string;
  req?: boolean;
  date?: boolean;
  int?: boolean;
  min?: number;
  max?: number;
}

export type ToolSuperRefine = (args: Record<string, unknown>, ctx: z.RefinementCtx) => void;

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

export interface ToolDef {
  name: string;
  desc: string;
  annotations?: ToolAnnotations;
  params?: Record<string, Param>;
  superRefine?: ToolSuperRefine;
  handle(args: Record<string, unknown>): Promise<string>;
}

export function requireOneOf(...keys: string[]): ToolSuperRefine {
  return (args, ctx) => {
    const present = keys.some(key => {
      const value = args[key];
      return typeof value === "string" && value.trim() !== "";
    });
    if (!present) ctx.addIssue({ code: "custom", message: `${keys.join(" or ")} must be provided`, path: keys.slice(0, 1) });
  };
}

/** Format a mutating tool's dry-run preview. */
export function dryRun(action: string, details: Record<string, unknown>): string {
  return `Dry run: ${action}\n${JSON.stringify(details, null, 2)}`;
}

function toZodType(p: Param): z.ZodType {
  if (p.type === "string") {
    let schema = z.string().describe(p.desc);
    if (p.req) schema = schema.refine(v => v.trim() !== "", "must not be empty");
    if (p.date) schema = schema.refine(isIsoDateString, "must be ISO 8601 date");
    return p.req ? schema : schema.optional();
  }

  if (p.type === "number") {
    let schema = z.number().finite().describe(p.desc);
    if (p.int) schema = schema.int();
    if (p.min !== undefined) schema = schema.min(p.min);
    if (p.max !== undefined) schema = schema.max(p.max);
    return p.req ? schema : schema.optional();
  }

  const schema = z.boolean().describe(p.desc);
  return p.req ? schema : schema.optional();
}

export function toZodShape(def: ToolDef): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const [k, p] of Object.entries(def.params ?? {})) {
    shape[k] = toZodType(p);
  }
  return shape;
}

export function toZodSchema(def: ToolDef): z.ZodType<Record<string, unknown>> {
  const schema = z.strictObject(toZodShape(def));
  if (!def.superRefine) return schema as z.ZodType<Record<string, unknown>>;
  return schema.superRefine((args, ctx) => def.superRefine?.(args, ctx));
}
