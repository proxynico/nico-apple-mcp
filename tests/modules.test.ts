import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { toZodSchema } from "../src/types.ts";
import type { ToolDef } from "../src/types.ts";
import calendar from "../src/tools/calendar.ts";
import notes from "../src/tools/notes.ts";
import contacts from "../src/tools/contacts.ts";
import doctor from "../src/tools/doctor.ts";

const allTools = [...calendar, ...notes, ...contacts, ...doctor];
const find = (name: string) => allTools.find(t => t.name === name)!;
const parse = (name: string, input: unknown) => toZodSchema(find(name)).parse(input);
const ok = (name: string, input: unknown) => toZodSchema(find(name)).safeParse(input).success;

const modules: [string, ToolDef[]][] = [
  ["calendar", calendar],
  ["notes", notes],
  ["contacts", contacts],
  ["doctor", doctor],
];

const mutatingTools = [
  "calendar_create_event",
  "calendar_update_event",
  "calendar_delete_event",
  "notes_create",
  "notes_append",
  "notes_move",
  "notes_update",
  "notes_delete",
  "contacts_create",
  "contacts_update",
  "contacts_delete",
];

const readOnlyTools = [
  "calendar_list_calendars",
  "calendar_search_events",
  "notes_list_folders",
  "notes_list",
  "notes_read",
  "notes_search",
  "contacts_list",
  "contacts_search",
  "contacts_get",
  "doctor",
];

const destructiveTools = [
  "calendar_delete_event",
  "notes_delete",
  "contacts_delete",
];

const nonDeleteMutatingTools = mutatingTools.filter(name => !destructiveTools.includes(name));

describe("module structure", () => {
  for (const [name, tools] of modules) {
    describe(name, () => {
      test("exports a non-empty tools array", () => {
        expect(tools.length).toBeGreaterThan(0);
      });

      test("every tool has name, desc, and handle", () => {
        for (const t of tools) {
          expect(typeof t.name).toBe("string");
          expect(t.name.length).toBeGreaterThan(0);
          expect(typeof t.desc).toBe("string");
          expect(typeof t.handle).toBe("function");
        }
      });
    });
  }

  test("doctor describes Notes and Contacts readiness", () => {
    expect(find("doctor").desc).toContain("Notes");
    expect(find("doctor").desc).toContain("Contacts");
  });

  test("calendar helper permission request has a bounded wait", () => {
    const source = readFileSync(resolve(import.meta.dir, "../src/helpers/cider-cal.swift"), "utf8");

    expect(source).toContain("sem.wait(timeout:");
  });

  test("read-only tools are annotated", () => {
    for (const name of readOnlyTools) {
      expect(find(name).annotations).toEqual({ readOnlyHint: true });
    }
  });

  test("delete tools are annotated destructive", () => {
    for (const name of destructiveTools) {
      expect(find(name).annotations).toEqual({ destructiveHint: true });
    }
  });

  test("non-delete mutating tools are annotated non-destructive", () => {
    for (const name of nonDeleteMutatingTools) {
      expect(find(name).annotations).toEqual({ destructiveHint: false });
    }
  });
});

describe("schema accepts valid inputs", () => {
  test("doctor", () => {
    expect(() => parse("doctor", {})).not.toThrow();
  });

  test("calendar_list_calendars", () => {
    expect(() => parse("calendar_list_calendars", {})).not.toThrow();
  });

  test("calendar_search_events", () => {
    expect(() => parse("calendar_search_events", {
      startDate: "2024-01-01T00:00:00", endDate: "2024-01-31T23:59:59",
    })).not.toThrow();
  });

  test("calendar_search_events with optional filters", () => {
    expect(() => parse("calendar_search_events", {
      startDate: "2024-01-01", endDate: "2024-01-31", calendarName: "Work", query: "planning",
    })).not.toThrow();
  });

  test("calendar_create_event", () => {
    expect(() => parse("calendar_create_event", {
      title: "Meeting", startDate: "2024-06-01T09:00:00", endDate: "2024-06-01T10:00:00",
    })).not.toThrow();
  });

  test("calendar_update_event", () => {
    expect(() => parse("calendar_update_event", {
      title: "Meeting", newTitle: "All-hands",
    })).not.toThrow();
  });

  test("calendar_update_event with notes", () => {
    expect(() => parse("calendar_update_event", {
      title: "Meeting", calendar: "Work", newNotes: "Bring agenda",
    })).not.toThrow();
  });

  test("calendar_update_event with event id and bounded window target", () => {
    const input = parse("calendar_update_event", {
      eventId: "ABC123",
      title: "Meeting",
      windowStart: "2024-06-01T00:00:00Z",
      windowEnd: "2024-06-02T00:00:00Z",
      newTitle: "All-hands",
    });
    expect(input.eventId).toBe("ABC123");
    expect(input.windowStart).toBe("2024-06-01T00:00:00Z");
    expect(input.windowEnd).toBe("2024-06-02T00:00:00Z");
  });

  test("calendar_update_event with event id only", () => {
    const input = parse("calendar_update_event", {
      eventId: "ABC123",
      newTitle: "All-hands",
    });
    expect(input.eventId).toBe("ABC123");
  });

  test("calendar_delete_event", () => {
    expect(() => parse("calendar_delete_event", {
      title: "Meeting",
    })).not.toThrow();
  });

  test("calendar_delete_event with event id and bounded window target", () => {
    const input = parse("calendar_delete_event", {
      eventId: "ABC123",
      title: "Meeting",
      windowStart: "2024-06-01T00:00:00Z",
      windowEnd: "2024-06-02T00:00:00Z",
    });
    expect(input.eventId).toBe("ABC123");
    expect(input.windowStart).toBe("2024-06-01T00:00:00Z");
    expect(input.windowEnd).toBe("2024-06-02T00:00:00Z");
  });

  test("calendar_delete_event with event id only", () => {
    const input = parse("calendar_delete_event", {
      eventId: "ABC123",
    });
    expect(input.eventId).toBe("ABC123");
  });

  test("notes_list_folders", () => {
    expect(() => parse("notes_list_folders", {})).not.toThrow();
  });

  test("notes_list", () => {
    expect(() => parse("notes_list", {})).not.toThrow();
  });

  test("notes_list with folder", () => {
    expect(() => parse("notes_list", { folder: "Work" })).not.toThrow();
  });

  test("notes_create", () => {
    expect(() => parse("notes_create", { title: "Notes", body: "Content" })).not.toThrow();
  });

  test("notes_read", () => {
    expect(() => parse("notes_read", { title: "Notes" })).not.toThrow();
  });

  test("notes_search", () => {
    expect(() => parse("notes_search", { query: "meeting" })).not.toThrow();
  });

  test("notes_append", () => {
    expect(() => parse("notes_append", { title: "Notes", text: "More text" })).not.toThrow();
  });

  test("notes_move", () => {
    expect(() => parse("notes_move", { title: "Notes", folder: "Archive" })).not.toThrow();
  });

  test("notes_update with title", () => {
    expect(() => parse("notes_update", { title: "Old", newTitle: "New" })).not.toThrow();
  });

  test("notes_update with body", () => {
    expect(() => parse("notes_update", { title: "Old", newBody: "Updated content" })).not.toThrow();
  });

  test("notes_delete", () => {
    expect(() => parse("notes_delete", { title: "Notes" })).not.toThrow();
  });

  test("contacts_list", () => {
    expect(() => parse("contacts_list", {})).not.toThrow();
  });

  test("contacts_list with limit", () => {
    expect(() => parse("contacts_list", { limit: 50 })).not.toThrow();
  });

  test("contacts_search", () => {
    expect(() => parse("contacts_search", { query: "John" })).not.toThrow();
  });

  test("contacts_get", () => {
    expect(() => parse("contacts_get", { name: "John Doe" })).not.toThrow();
  });

  test("contacts_create minimal", () => {
    expect(() => parse("contacts_create", { firstName: "John", lastName: "Doe" })).not.toThrow();
  });

  test("contacts_create with all fields", () => {
    expect(() => parse("contacts_create", {
      firstName: "John", lastName: "Doe",
      email: "john@example.com", phone: "+1234567890", org: "Acme", title: "Engineer",
    })).not.toThrow();
  });

  test("contacts_update", () => {
    expect(() => parse("contacts_update", { name: "John Doe", newFirstName: "Jane" })).not.toThrow();
  });

  test("contacts_update with optional fields", () => {
    expect(() => parse("contacts_update", {
      name: "John Doe",
      newLastName: "Smith",
      newEmail: "jane@example.com",
      newPhone: "+1987654321",
      newOrg: "Acme",
      newTitle: "Director",
    })).not.toThrow();
  });

  test("contacts_delete", () => {
    expect(() => parse("contacts_delete", { name: "John Doe" })).not.toThrow();
  });

  test("mutating tools accept dryRun", () => {
    for (const name of mutatingTools) {
      expect(find(name).params?.dryRun?.type).toBe("boolean");
    }
  });

  test("notes list and search accept bounded limits", () => {
    expect(() => parse("notes_list", { limit: 50 })).not.toThrow();
    expect(() => parse("notes_search", { query: "meeting", limit: 50 })).not.toThrow();
    expect(ok("notes_list", { limit: 501 })).toBe(false);
    expect(ok("notes_search", { query: "meeting", limit: 501 })).toBe(false);
  });
});

describe("schema rejects invalid inputs", () => {
  test("rejects missing required fields", () => {
    expect(ok("contacts_get", {})).toBe(false);
  });

  test("rejects wrong type", () => {
    expect(ok("contacts_get", { name: 42 })).toBe(false);
  });

  test("rejects invalid date", () => {
    expect(ok("calendar_search_events", {
      startDate: "not-a-date", endDate: "2024-01-31T23:59:59",
    })).toBe(false);
  });

  test("calendar_update_event rejects missing event id and title in schema", () => {
    expect(ok("calendar_update_event", { newTitle: "No target" })).toBe(false);
  });

  test("calendar_delete_event rejects missing event id and title in schema", () => {
    expect(ok("calendar_delete_event", {})).toBe(false);
  });

  test("calendar_search_events rejects startDate >= endDate", async () => {
    await expect(find("calendar_search_events").handle({
      startDate: "2024-03-15T11:00:00Z",
      endDate: "2024-03-15T10:30:00Z",
    })).rejects.toThrow("startDate must be before endDate");
  });

  test("calendar_create_event rejects startDate >= endDate in dry-run", async () => {
    await expect(find("calendar_create_event").handle({
      title: "Invalid Dry Run",
      startDate: "2024-03-15T11:00:00Z",
      endDate: "2024-03-15T10:30:00Z",
      dryRun: true,
    })).rejects.toThrow("startDate must be before endDate");
  });

  test("calendar_update_event rejects newStart >= newEnd in dry-run", async () => {
    await expect(find("calendar_update_event").handle({
      title: "Invalid Dry Run",
      newStart: "2024-03-15T11:00:00Z",
      newEnd: "2024-03-15T10:30:00Z",
      dryRun: true,
    })).rejects.toThrow("newStart must be before newEnd");
  });

  test("calendar_update_event rejects unpaired windowStart in dry-run", async () => {
    await expect(find("calendar_update_event").handle({
      title: "Invalid Dry Run",
      windowStart: "2024-03-15T10:30:00Z",
      newTitle: "Still Invalid",
      dryRun: true,
    })).rejects.toThrow("windowStart and windowEnd must be provided together");
  });

  test("calendar_delete_event rejects unpaired windowStart in dry-run", async () => {
    await expect(find("calendar_delete_event").handle({
      title: "Invalid Dry Run",
      windowStart: "2024-03-15T10:30:00Z",
      dryRun: true,
    })).rejects.toThrow("windowStart and windowEnd must be provided together");
  });

  test("rejects invalid limit", () => {
    expect(ok("contacts_list", { limit: 0 })).toBe(false);
    expect(ok("contacts_list", { limit: 1.5 })).toBe(false);
    expect(ok("contacts_list", { limit: 1001 })).toBe(false);
  });
});

describe("dry-run handlers", () => {
  test("calendar create dry-run keeps readable JSON details", async () => {
    const text = await find("calendar_create_event").handle({
      title: "Dry Run",
      startDate: "2024-03-15T10:30:00Z",
      endDate: "2024-03-15T11:00:00Z",
      dryRun: true,
    });
    expect(text).toContain("Dry run: create calendar event");
    expect(JSON.parse(text.replace(/^Dry run: create calendar event\n/, ""))).toMatchObject({
      title: "Dry Run",
      calendar: "default",
      startDate: "2024-03-15T10:30:00Z",
      endDate: "2024-03-15T11:00:00Z",
      location: "",
      notes: "",
    });
  });

  test("notes update dry-run does not execute Notes", async () => {
    const text = await find("notes_update").handle({
      title: "Dry Run",
      newTitle: "Dry Run 2",
      dryRun: true,
    });
    expect(text).toContain("Dry run: update note");
  });

  test("contacts delete dry-run does not execute Contacts", async () => {
    const text = await find("contacts_delete").handle({
      name: "Dry Run",
      dryRun: true,
    });
    expect(text).toContain("Dry run: delete contact");
  });

  test("calendar update dry-run can clear notes", async () => {
    const text = await find("calendar_update_event").handle({
      eventId: "ABC123",
      newNotes: "",
      dryRun: true,
    });
    expect(JSON.parse(text.replace(/^Dry run: update calendar event\n/, "")).updates).toMatchObject({
      newNotes: "",
    });
  });

  test("notes update dry-run can clear the body", async () => {
    const text = await find("notes_update").handle({
      title: "Dry Run",
      newBody: "",
      dryRun: true,
    });
    expect(JSON.parse(text.replace(/^Dry run: update note\n/, ""))).toMatchObject({
      newBody: "",
    });
  });

  test("contacts update dry-run can clear the organization", async () => {
    const text = await find("contacts_update").handle({
      name: "Dry Run",
      newOrg: "",
      dryRun: true,
    });
    expect(JSON.parse(text.replace(/^Dry run: update contact\n/, "")).updates).toMatchObject({
      newOrg: "",
    });
  });
});
