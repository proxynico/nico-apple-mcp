import { dryRun, type ToolDef } from "../types.ts";
import { isoToEpochMs } from "../dates.ts";
import { z } from "zod";
import { runCalendarHelper } from "./calendarHelper.ts";

function toEpochMsArg(iso: string): string {
  return String(isoToEpochMs(iso));
}

function assertBefore(startIso: string, endIso: string, startName: string, endName: string): void {
  const start = isoToEpochMs(startIso);
  const end = isoToEpochMs(endIso);
  if (start >= end) throw new Error(`${startName} must be before ${endName}`);
}

function addTargetArgs(args: string[], a: Record<string, unknown>): Record<string, unknown> {
  const target: Record<string, unknown> = {
    title: a.title,
    calendar: a.calendar ?? "all",
  };

  if (a.eventId) {
    args.push("--event-id", a.eventId as string);
    target.eventId = a.eventId;
  }

  if (!a.eventId && !a.title) {
    throw new Error("eventId or title must be provided");
  }

  const hasWindowStart = Boolean(a.windowStart);
  const hasWindowEnd = Boolean(a.windowEnd);
  if (hasWindowStart !== hasWindowEnd) {
    throw new Error("windowStart and windowEnd must be provided together");
  }

  if (hasWindowStart && hasWindowEnd) {
    assertBefore(a.windowStart as string, a.windowEnd as string, "windowStart", "windowEnd");
    args.push("--window-start-ms", toEpochMsArg(a.windowStart as string));
    args.push("--window-end-ms", toEpochMsArg(a.windowEnd as string));
    target.windowStart = a.windowStart;
    target.windowEnd = a.windowEnd;
  }

  return target;
}

function hasSelector(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function requireEventIdOrTitle(a: Record<string, unknown>, ctx: z.RefinementCtx): void {
  if (hasSelector(a.eventId) || hasSelector(a.title)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "eventId or title must be provided",
    path: ["eventId"],
  });
}

const tools: ToolDef[] = [
  {
    name: "calendar_list_calendars",
    desc: "List all calendars available in Apple Calendar",
    annotations: { readOnlyHint: true },
    handle: () => runCalendarHelper(),
  },
  {
    name: "calendar_search_events",
    desc: "Search events in a date range, optionally filtered by calendar and text query",
    annotations: { readOnlyHint: true },
    params: {
      startDate: { type: "string", desc: "Start date (ISO 8601)", req: true, date: true },
      endDate: { type: "string", desc: "End date (ISO 8601)", req: true, date: true },
      calendarName: { type: "string", desc: "Calendar name (searches all if omitted)" },
      query: { type: "string", desc: "Text query for event title, location, or notes" },
    },
    handle: async (a) => {
      assertBefore(a.startDate as string, a.endDate as string, "startDate", "endDate");
      const args = [
        "--start-ms", toEpochMsArg(a.startDate as string),
        "--end-ms", toEpochMsArg(a.endDate as string),
      ];
      if (a.calendarName) args.push("--calendar", a.calendarName as string);
      if (a.query) args.push("--query", a.query as string);
      return runCalendarHelper(...args);
    },
  },
  {
    name: "calendar_create_event",
    desc: "Create a new event in Apple Calendar",
    annotations: { destructiveHint: false },
    params: {
      title: { type: "string", desc: "Event title", req: true },
      startDate: { type: "string", desc: "Start date (ISO 8601)", req: true, date: true },
      endDate: { type: "string", desc: "End date (ISO 8601)", req: true, date: true },
      calendar: { type: "string", desc: "Calendar name (uses default if omitted)" },
      location: { type: "string", desc: "Event location" },
      notes: { type: "string", desc: "Event notes" },
      dryRun: { type: "boolean", desc: "Preview the event without creating it" },
    },
    handle: async (a) => {
      const title = a.title as string;
      assertBefore(a.startDate as string, a.endDate as string, "startDate", "endDate");
      const args = [
        "--create-event",
        "--title", title,
        "--start-ms", toEpochMsArg(a.startDate as string),
        "--end-ms", toEpochMsArg(a.endDate as string),
      ];
      if (a.calendar) args.push("--calendar", a.calendar as string);
      if (a.location) args.push("--location", a.location as string);
      if (a.notes) args.push("--notes", a.notes as string);
      if (a.dryRun) {
        return dryRun("create calendar event", {
          title,
          calendar: a.calendar ?? "default",
          startDate: a.startDate,
          endDate: a.endDate,
          location: a.location ?? "",
          notes: a.notes ?? "",
        });
      }
      return runCalendarHelper(...args);
    },
  },
  {
    name: "calendar_update_event",
    desc: "Update an existing event by event id or exact title, optionally narrowed by calendar and date window",
    annotations: { destructiveHint: false },
    params: {
      eventId: { type: "string", desc: "Apple Calendar event identifier" },
      title: { type: "string", desc: "Current event title to find" },
      calendar: { type: "string", desc: "Calendar containing the event (searches all if omitted)" },
      windowStart: { type: "string", desc: "Target search window start (ISO 8601)", date: true },
      windowEnd: { type: "string", desc: "Target search window end (ISO 8601)", date: true },
      newTitle: { type: "string", desc: "New title" },
      newStart: { type: "string", desc: "New start date (ISO 8601)", date: true },
      newEnd: { type: "string", desc: "New end date (ISO 8601)", date: true },
      newLocation: { type: "string", desc: "New location" },
      newNotes: { type: "string", desc: "New notes" },
      dryRun: { type: "boolean", desc: "Preview the update without changing Calendar" },
    },
    superRefine: requireEventIdOrTitle,
    handle: async (a) => {
      const args = ["--update-event"];
      const updates: Record<string, unknown> = {};
      if (a.newStart && a.newEnd) assertBefore(a.newStart as string, a.newEnd as string, "newStart", "newEnd");
      if (a.title) args.push("--title", a.title as string);
      if (a.calendar) args.push("--calendar", a.calendar as string);
      const target = addTargetArgs(args, a);
      if (a.newTitle) {
        args.push("--new-title", a.newTitle as string);
        updates.newTitle = a.newTitle;
      }
      if (a.newStart) {
        args.push("--start-ms", toEpochMsArg(a.newStart as string));
        updates.newStart = a.newStart;
      }
      if (a.newEnd) {
        args.push("--end-ms", toEpochMsArg(a.newEnd as string));
        updates.newEnd = a.newEnd;
      }
      if (a.newLocation !== undefined) {
        args.push("--location", a.newLocation as string);
        updates.newLocation = a.newLocation;
      }
      if (a.newNotes !== undefined) {
        args.push("--notes", a.newNotes as string);
        updates.newNotes = a.newNotes;
      }
      if (!Object.keys(updates).length) throw new Error("No updates specified");
      if (a.dryRun) return dryRun("update calendar event", { target, updates });
      return runCalendarHelper(...args);
    },
  },
  {
    name: "calendar_delete_event",
    desc: "Delete an event by event id or exact title, optionally narrowed by calendar and date window",
    annotations: { destructiveHint: true },
    params: {
      eventId: { type: "string", desc: "Apple Calendar event identifier" },
      title: { type: "string", desc: "Event title to delete" },
      calendar: { type: "string", desc: "Calendar containing the event (searches all if omitted)" },
      windowStart: { type: "string", desc: "Target search window start (ISO 8601)", date: true },
      windowEnd: { type: "string", desc: "Target search window end (ISO 8601)", date: true },
      dryRun: { type: "boolean", desc: "Preview the deletion without changing Calendar" },
    },
    superRefine: requireEventIdOrTitle,
    handle: async (a) => {
      const args = ["--delete-event"];
      if (a.title) args.push("--title", a.title as string);
      if (a.calendar) args.push("--calendar", a.calendar as string);
      const target = addTargetArgs(args, a);
      if (a.dryRun) return dryRun("delete calendar event", { target });
      return runCalendarHelper(...args);
    },
  },
];

export default tools;
