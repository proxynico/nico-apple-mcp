import { dryRun, requireOneOf, type ToolDef } from "../types.ts";
import { isoToEpochMs } from "../dates.ts";
import { runCalendarHelper } from "./calendarHelper.ts";

type Args = Record<string, unknown>;

const ms = (iso: unknown): string => String(isoToEpochMs(iso as string));

function assertBefore(a: Args, startKey: string, endKey: string): void {
  if (isoToEpochMs(a[startKey] as string) >= isoToEpochMs(a[endKey] as string)) {
    throw new Error(`${startKey} must be before ${endKey}`);
  }
}

function targetEvent(a: Args): { args: string[]; target: Args } {
  const args: string[] = [];
  const target: Args = { title: a.title, calendar: a.calendar ?? "all" };
  if (a.title) args.push("--title", a.title as string);
  if (a.calendar) args.push("--calendar", a.calendar as string);
  if (a.eventId) {
    args.push("--event-id", a.eventId as string);
    target.eventId = a.eventId;
  }
  if (Boolean(a.windowStart) !== Boolean(a.windowEnd)) {
    throw new Error("windowStart and windowEnd must be provided together");
  }
  if (a.windowStart) {
    assertBefore(a, "windowStart", "windowEnd");
    args.push("--window-start-ms", ms(a.windowStart), "--window-end-ms", ms(a.windowEnd));
    target.windowStart = a.windowStart;
    target.windowEnd = a.windowEnd;
  }
  return { args, target };
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
      assertBefore(a, "startDate", "endDate");
      const args = ["--start-ms", ms(a.startDate), "--end-ms", ms(a.endDate)];
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
      assertBefore(a, "startDate", "endDate");
      if (a.dryRun) {
        return dryRun("create calendar event", {
          title: a.title,
          calendar: a.calendar ?? "default",
          startDate: a.startDate,
          endDate: a.endDate,
          location: a.location ?? "",
          notes: a.notes ?? "",
        });
      }
      const args = ["--create-event", "--title", a.title as string, "--start-ms", ms(a.startDate), "--end-ms", ms(a.endDate)];
      if (a.calendar) args.push("--calendar", a.calendar as string);
      if (a.location) args.push("--location", a.location as string);
      if (a.notes) args.push("--notes", a.notes as string);
      return runCalendarHelper(...args);
    },
  },
  {
    name: "calendar_update_event",
    desc: "Update an existing event by event id or exact title, optionally narrowed by calendar and date window. For one occurrence of a repeating event, pass windowStart/windowEnd around that occurrence",
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
    superRefine: requireOneOf("eventId", "title"),
    handle: async (a) => {
      if (a.newStart && a.newEnd) assertBefore(a, "newStart", "newEnd");
      const { args, target } = targetEvent(a);
      const updates: Args = {};
      const update = (key: string, flag: string, value: string) => {
        args.push(flag, value);
        updates[key] = a[key];
      };
      if (a.newTitle) update("newTitle", "--new-title", a.newTitle as string);
      if (a.newStart) update("newStart", "--start-ms", ms(a.newStart));
      if (a.newEnd) update("newEnd", "--end-ms", ms(a.newEnd));
      if (a.newLocation !== undefined) update("newLocation", "--location", a.newLocation as string);
      if (a.newNotes !== undefined) update("newNotes", "--notes", a.newNotes as string);
      if (!Object.keys(updates).length) throw new Error("No updates specified");
      if (a.dryRun) return dryRun("update calendar event", { target, updates });
      return runCalendarHelper("--update-event", ...args);
    },
  },
  {
    name: "calendar_delete_event",
    desc: "Delete an event by event id or exact title, optionally narrowed by calendar and date window. For one occurrence of a repeating event, pass windowStart/windowEnd around that occurrence",
    annotations: { destructiveHint: true },
    params: {
      eventId: { type: "string", desc: "Apple Calendar event identifier" },
      title: { type: "string", desc: "Event title to delete" },
      calendar: { type: "string", desc: "Calendar containing the event (searches all if omitted)" },
      windowStart: { type: "string", desc: "Target search window start (ISO 8601)", date: true },
      windowEnd: { type: "string", desc: "Target search window end (ISO 8601)", date: true },
      dryRun: { type: "boolean", desc: "Preview the deletion without changing Calendar" },
    },
    superRefine: requireOneOf("eventId", "title"),
    handle: async (a) => {
      const { args, target } = targetEvent(a);
      if (a.dryRun) return dryRun("delete calendar event", { target });
      return runCalendarHelper("--delete-event", ...args);
    },
  },
];

export default tools;
