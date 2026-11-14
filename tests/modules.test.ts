import { describe, expect, test } from "bun:test";
import { toZodSchema } from "../src/types.ts";
import calendar from "../src/tools/calendar.ts";
import notes from "../src/tools/notes.ts";
import contacts from "../src/tools/contacts.ts";
import meetingPrep from "../src/tools/meetingPrep.ts";
import doctor, { calendarHelperDiagnostic } from "../src/tools/doctor.ts";

type Args = Record<string, unknown>;

const allTools = [...calendar, ...notes, ...contacts, ...meetingPrep, ...doctor];
const find = (name: string) => allTools.find(t => t.name === name)!;
const schema = (name: string) => toZodSchema(find(name));

async function dryRunDetails(name: string, action: string, args: Args): Promise<unknown> {
  const header = `Dry run: ${action}\n`;
  const text = await find(name).handle({ ...args, dryRun: true });
  expect(text).toStartWith(header);
  return JSON.parse(text.slice(header.length));
}

test.each(allTools.map(t => t.name))("%s is annotated by whether it changes data", name => {
  const { params, annotations } = find(name);
  const mutates = params?.dryRun?.type === "boolean";
  expect(annotations).toEqual(mutates ? { destructiveHint: name.includes("_delete") } : { readOnlyHint: true });
});

test("doctor converts Calendar helper failures into diagnostics", async () => {
  const result = await calendarHelperDiagnostic("OK calendar helper", async () => {
    throw new Error("permission timed out");
  });
  expect(result).toEqual(["OK calendar helper", "FAIL calendar helper doctor: permission timed out"]);
});

const eventWindow = { windowStart: "2024-06-01T00:00:00Z", windowEnd: "2024-06-02T00:00:00Z" };

const valid: [string, Args][] = [
  ["doctor", {}],
  ["calendar_list_calendars", {}],
  ["calendar_search_events", { startDate: "2024-01-01T00:00:00", endDate: "2024-01-31T23:59:59" }],
  ["calendar_search_events", { startDate: "2024-01-01", endDate: "2024-01-31", calendarName: "Work", query: "planning" }],
  ["calendar_create_event", { title: "Meeting", startDate: "2024-06-01T09:00:00", endDate: "2024-06-01T10:00:00" }],
  ["calendar_update_event", { title: "Meeting", newTitle: "All-hands" }],
  ["calendar_update_event", { title: "Meeting", calendar: "Work", newNotes: "Bring agenda" }],
  ["calendar_update_event", { eventId: "ABC123", title: "Meeting", ...eventWindow, newTitle: "All-hands" }],
  ["calendar_update_event", { eventId: "ABC123", newTitle: "All-hands" }],
  ["calendar_delete_event", { title: "Meeting" }],
  ["calendar_delete_event", { eventId: "ABC123", title: "Meeting", ...eventWindow }],
  ["calendar_delete_event", { eventId: "ABC123" }],
  ["notes_list_folders", {}],
  ["notes_list", {}],
  ["notes_list", { folder: "Work" }],
  ["notes_list", { limit: 50 }],
  ["notes_create", { title: "Notes", body: "Content" }],
  ["notes_read", { title: "Notes" }],
  ["notes_read", { noteId: "NOTE-1" }],
  ["notes_search", { query: "meeting" }],
  ["notes_search", { query: "meeting", limit: 50 }],
  ["notes_append", { title: "Notes", text: "More text" }],
  ["notes_append", { noteId: "NOTE-1", text: "More text" }],
  ["notes_move", { title: "Notes", folder: "Archive" }],
  ["notes_move", { noteId: "NOTE-1", folder: "Archive" }],
  ["notes_update", { title: "Old", newTitle: "New" }],
  ["notes_update", { title: "Old", newBody: "Updated content" }],
  ["notes_update", { noteId: "NOTE-1", newBody: "Updated" }],
  ["notes_delete", { title: "Notes" }],
  ["notes_delete", { noteId: "NOTE-1" }],
  ["contacts_list", {}],
  ["contacts_list", { limit: 50 }],
  ["contacts_search", { query: "John" }],
  ["contacts_get", { name: "John Doe" }],
  ["contacts_get", { contactId: "CONTACT-1" }],
  ["contacts_create", { firstName: "John", lastName: "Doe" }],
  ["contacts_create", { firstName: "John", lastName: "Doe", email: "john@example.com", phone: "+1234567890", org: "Acme", title: "Engineer" }],
  ["contacts_update", { name: "John Doe", newFirstName: "Jane" }],
  ["contacts_update", { name: "John Doe", newLastName: "Smith", newEmail: "jane@example.com", newPhone: "+1987654321", newOrg: "Acme", newTitle: "Director" }],
  ["contacts_update", { contactId: "CONTACT-1", newOrg: "Acme" }],
  ["contacts_delete", { name: "John Doe" }],
  ["contacts_delete", { contactId: "CONTACT-1" }],
];

const invalid: [string, Args][] = [
  ["calendar_search_events", { startDate: "not-a-date", endDate: "2024-01-31T23:59:59" }],
  ["calendar_update_event", { newTitle: "No target" }],
  ["calendar_delete_event", {}],
  ["notes_list", { limit: 501 }],
  ["notes_search", { query: "meeting", limit: 501 }],
  ["notes_read", {}],
  ["notes_delete", {}],
  ["contacts_list", { limit: 0 }],
  ["contacts_list", { limit: 1.5 }],
  ["contacts_list", { limit: 1001 }],
  ["contacts_get", {}],
  ["contacts_delete", {}],
];

const handlerErrors: [string, Args, string][] = [
  ["calendar_search_events", { startDate: "2024-03-15T11:00:00Z", endDate: "2024-03-15T10:30:00Z" }, "startDate must be before endDate"],
  ["calendar_create_event", { title: "Invalid Dry Run", startDate: "2024-03-15T11:00:00Z", endDate: "2024-03-15T10:30:00Z", dryRun: true }, "startDate must be before endDate"],
  ["calendar_update_event", { title: "Invalid Dry Run", newStart: "2024-03-15T11:00:00Z", newEnd: "2024-03-15T10:30:00Z", dryRun: true }, "newStart must be before newEnd"],
  ["calendar_update_event", { title: "Invalid Dry Run", windowStart: "2024-03-15T10:30:00Z", newTitle: "Still Invalid", dryRun: true }, "windowStart and windowEnd must be provided together"],
  ["calendar_delete_event", { title: "Invalid Dry Run", windowStart: "2024-03-15T10:30:00Z", dryRun: true }, "windowStart and windowEnd must be provided together"],
];

const dryRuns: [string, string, Args, Args][] = [
  ["calendar_create_event", "create calendar event",
    { title: "Dry Run", startDate: "2024-03-15T10:30:00Z", endDate: "2024-03-15T11:00:00Z" },
    { title: "Dry Run", calendar: "default", startDate: "2024-03-15T10:30:00Z", endDate: "2024-03-15T11:00:00Z", location: "", notes: "" }],
  ["calendar_update_event", "update calendar event",
    { eventId: "ABC123", newNotes: "" },
    { target: { calendar: "all", eventId: "ABC123" }, updates: { newNotes: "" } }],
  ["notes_update", "update note", { title: "Dry Run", newTitle: "Dry Run 2" }, { target: { title: "Dry Run" }, newTitle: "Dry Run 2" }],
  ["notes_update", "update note", { title: "Dry Run", newBody: "" }, { target: { title: "Dry Run" }, newBody: "" }],
  ["notes_update", "update note", { noteId: "NOTE-1", newBody: "Updated" }, { target: { noteId: "NOTE-1" }, newBody: "Updated" }],
  ["contacts_update", "update contact", { name: "Dry Run", newOrg: "" }, { target: { name: "Dry Run" }, updates: { newOrg: "" } }],
  ["contacts_update", "update contact", { contactId: "CONTACT-1", newOrg: "Acme" }, { target: { contactId: "CONTACT-1" }, updates: { newOrg: "Acme" } }],
  ["contacts_delete", "delete contact", { name: "Dry Run" }, { target: { name: "Dry Run" } }],
];

describe("schema", () => {
  test.each(valid)("%s accepts %j", (name, input) => {
    expect(schema(name).parse(input)).toEqual(input);
  });

  test.each(invalid)("%s rejects %j", (name, input) => {
    expect(schema(name).safeParse(input).success).toBe(false);
  });
});

test.each(handlerErrors)("%s handler rejects %j", async (name, args, message) => {
  await expect(find(name).handle(args)).rejects.toThrow(message);
});

test.each(dryRuns)("%s previews %s for %j", async (name, action, args, expected) => {
  expect(await dryRunDetails(name, action, args)).toEqual(expected);
});
