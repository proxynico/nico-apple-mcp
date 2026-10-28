import { z } from "zod";
import { dryRun, type ToolDef } from "../types.ts";
import { isoToEpochMs } from "../dates.ts";
import { runJXA } from "../applescript.ts";
import { runCalendarHelper } from "./calendarHelper.ts";
import { createNote } from "./notes.ts";

const Person = z.object({ name: z.string(), email: z.string(), isCurrentUser: z.boolean() });
const CalendarEvent = z.object({
  title: z.string(),
  calendar: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  location: z.string(),
  notes: z.string(),
  isAllDay: z.boolean(),
  status: z.string(),
  organizer: Person,
  attendees: z.array(Person.extend({ status: z.string(), type: z.string() })),
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

export interface ContactCard {
  name: string;
  org: string;
  jobTitle: string;
  emails: string[];
  phones: string[];
}

/**
 * JXA returning every contact's vCard as a JSON array, in one Apple Event, cut down to the lines a brief
 * uses. Whole cards carry base64 photos, which can run to megabytes.
 */
const READ_CARDS = String.raw`
  const keep = /^(?:[\w-]+\.)?(?:FN|N|ORG|TITLE|EMAIL|TEL)[;:]/i;
  JSON.stringify(Application("Contacts").people.vcard().map(card =>
    card.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(line => keep.test(line)).join("\n")));`;

const VCARD_LINE = /^(?:[\w-]+\.)?([\w-]+)(?:;[^:]*)?:(.*)$/;
const unescapeVCard = (value: string) => value.replace(/\\([\\,;nN])/g, (_, c: string) => (c.toLowerCase() === "n" ? "\n" : c));
/** Split a structured value such as N or ORG on its unescaped semicolons. */
const vCardParts = (value: string) => value.split(/(?<!\\);/).map(unescapeVCard);

function parseVCard(card: string): ContactCard {
  const contact: ContactCard = { name: "", org: "", jobTitle: "", emails: [], phones: [] };
  let first = "";
  let last = "";
  for (const line of card.split("\n")) {
    const [, key = "", value = ""] = VCARD_LINE.exec(line) ?? [];
    switch (key.toUpperCase()) {
      case "FN": contact.name = unescapeVCard(value); break;
      case "N": [last = "", first = ""] = vCardParts(value); break;
      case "ORG": contact.org = vCardParts(value)[0] ?? ""; break;
      case "TITLE": contact.jobTitle = unescapeVCard(value); break;
      case "EMAIL": contact.emails.push(unescapeVCard(value)); break;
      case "TEL": contact.phones.push(unescapeVCard(value)); break;
    }
  }
  if (!contact.name) contact.name = `${first} ${last}`.trim() || contact.org;
  return contact;
}

/** Finds the one contact with an attendee's email, or failing that their exact name. Several matches find none. */
function contactFinder(contacts: ContactCard[]): (person: { name: string; email: string }) => ContactCard | undefined {
  const byEmail = new Map<string, ContactCard[]>();
  const byName = new Map<string, ContactCard[]>();
  const add = (map: Map<string, ContactCard[]>, key: string, contact: ContactCard) => {
    if (key) map.set(key, [...(map.get(key) ?? []), contact]);
  };
  for (const contact of contacts) {
    for (const email of new Set(contact.emails.map(e => e.toLowerCase()))) add(byEmail, email, contact);
    add(byName, contact.name.toLowerCase(), contact);
  }
  const only = (matches?: ContactCard[]) => (matches?.length === 1 ? matches[0] : undefined);
  return ({ name, email }) => only(byEmail.get(email.toLowerCase())) ?? only(byName.get(name.toLowerCase()));
}

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const longDate = (day: Date) => day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDate = (day: Date) => day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const AGENDA_LIMIT = 300;

/** The meetings worth preparing: not cancelled and not declined. */
const isPrepared = (event: CalendarEvent) =>
  event.status !== "canceled" && !event.attendees.some(p => p.isCurrentUser && p.status === "declined");

/** Render a day's brief: each meeting with its people matched to Contacts, then everyone not in Contacts. */
export function renderBrief({ day, events, contacts }: { day: Date; events: CalendarEvent[]; contacts: ContactCard[] }): { title: string; body: string } {
  const findContact = contactFinder(contacts);
  const meetings = events.filter(isPrepared);
  const unknown = new Map<string, string>();
  const sections = meetings.map(event => {
    const organizer = event.organizer.email.toLowerCase();
    const people = event.attendees.filter(p => !p.isCurrentUser && (p.type === "person" || p.type === "unknown"));
    if (!event.organizer.isCurrentUser && (event.organizer.email || event.organizer.name)
      && !people.some(p => p.email.toLowerCase() === organizer)) {
      people.unshift({ ...event.organizer, status: "accepted", type: "person" });
    }
    const lines = [`${event.isAllDay ? "All day" : `${time(event.startMs)}–${time(event.endMs)}`}  ${event.title || "(no title)"}`];
    lines.push([`Calendar: ${event.calendar}`, event.location && `Where: ${event.location.replace(/\s+/g, " ")}`].filter(Boolean).join(" · "));
    for (const person of people) {
      const marks = [organizer && person.email.toLowerCase() === organizer && "organizer", person.status === "declined" && "declined"].filter(Boolean);
      const contact = findContact(person);
      const name = (contact?.name || person.name || person.email) + (marks.length ? ` (${marks.join(", ")})` : "");
      if (contact) {
        const role = [contact.jobTitle, contact.org].filter(Boolean).join(" at ");
        lines.push(`• ${[role ? `${name}, ${role}` : name, person.email || contact.emails[0], contact.phones[0]].filter(Boolean).join(" · ")}`);
      } else {
        const label = person.name && person.email && person.name !== person.email ? `${person.name} <${person.email}>` : person.name || person.email;
        unknown.set((person.email || person.name).toLowerCase(), label);
        lines.push(`• ${[name, person.email !== name && person.email, "not in Contacts"].filter(Boolean).join(" · ")}`);
      }
    }
    const agenda = event.notes.replace(/\s+/g, " ").trim();
    if (agenda) lines.push(`Agenda: ${agenda.length > AGENDA_LIMIT ? `${agenda.slice(0, AGENDA_LIMIT).trimEnd()}…` : agenda}`);
    return lines.join("\n");
  });
  const count = `${meetings.length} event${meetings.length === 1 ? "" : "s"}`;
  const body = [`${longDate(day)}: ${count}`, ...sections];
  if (unknown.size) body.push(`Not in Contacts yet: ${[...unknown.values()].join(", ")}`);
  return { title: `Meeting prep: ${shortDate(day)}`, body: body.join("\n\n") };
}

/** Local midnight at the start and end of `date`'s day, or tomorrow's when no date is given. */
function dayRange(date?: string): { start: Date; end: Date } {
  const base = date ? new Date(isoToEpochMs(date)) : new Date();
  const offset = date ? 0 : 1;
  return {
    start: new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset),
    end: new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset + 1),
  };
}

const tools: ToolDef[] = [
  {
    name: "meeting_prep",
    desc: "Brief for a day's meetings: each meeting's time, place, and agenda, with every attendee matched to Apple Contacts by email or name (job title, company, phone), plus everyone not in Contacts yet. Set saveNote to also save the brief to Apple Notes",
    annotations: { destructiveHint: false },
    params: {
      date: { type: "string", desc: "Day to prepare (ISO 8601; default tomorrow)", date: true },
      calendarName: { type: "string", desc: "Only this calendar (all if omitted)" },
      saveNote: { type: "boolean", desc: "Also save the brief as a note in Apple Notes" },
      folder: { type: "string", desc: "Notes folder for the saved brief (default account if omitted)" },
      dryRun: { type: "boolean", desc: "Preview the note without saving it" },
    },
    handle: async (a) => {
      const { start, end } = dayRange(a.date as string | undefined);
      const args = ["--start-ms", String(start.getTime()), "--end-ms", String(end.getTime())];
      if (a.calendarName) args.push("--calendar", a.calendarName as string);
      const [found, cards] = await Promise.all([
        runCalendarHelper(...args).then(out => z.object({ events: z.array(CalendarEvent) }).parse(JSON.parse(out)).events),
        runJXA(READ_CARDS).then(out => z.array(z.string()).parse(JSON.parse(out))),
      ]);
      // EventKit also returns events that only touch the day, such as one ending at its midnight.
      const events = found.filter(e => e.startMs < end.getTime() && e.endMs > start.getTime());
      if (!events.some(isPrepared)) return `No meetings on ${longDate(start)}.${a.saveNote ? " Nothing saved to Notes." : ""}`;
      const brief = renderBrief({ day: start, events, contacts: cards.map(parseVCard) });
      const text = `${brief.title}\n\n${brief.body}`;
      if (!a.saveNote) return text;
      if (a.dryRun) return dryRun("save meeting prep note", { ...brief, folder: a.folder ?? "default" });
      const saved = await createNote({ ...brief, folder: a.folder as string | undefined });
      return `${text}\n\n${saved}`;
    },
  },
];

export default tools;
