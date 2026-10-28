import { dryRun, requireOneOf, type ToolDef } from "../types.ts";
import { runJXA, esc } from "../applescript.ts";

/**
 * JXA listing `id | name — organization` for every contact, optionally only those whose name contains
 * `query`. One Apple Event returns every contact's vCard, which holds that contact's id and names
 * together. Reading each contact's properties one by one took 20-100s, and joining per-property reads
 * by position paired ids with other contacts' names while Contacts was being edited. Names are matched
 * with NSString's case-insensitive search, as Contacts' own `whose` filter does, because that filter
 * took up to 30s.
 */
const listPeople = ({ query, limit, empty }: { query?: string; limit?: number; empty: string }) => `
  ObjC.import("Foundation");
  const components = value => {
    const parts = [""];
    for (let i = 0; i < value.length; i++) {
      if (value[i] === ";") parts.push("");
      else if (value[i] === "\\\\" && i + 1 < value.length) parts[parts.length - 1] += /n/i.test(value[++i]) ? "\\n" : value[i];
      else parts[parts.length - 1] += value[i];
    }
    return parts;
  };
  const lines = [];
  for (const card of Application("Contacts").people.vcard()) {
    if (lines.length >= ${limit ?? "Infinity"}) break;
    const props = {};
    for (const line of card.replace(/\\r?\\n[ \\t]/g, "").split(/\\r?\\n/)) {
      const m = /^(?:[\\w-]+\\.)?([\\w-]+)(?:;[^:]*)?:(.*)$/.exec(line);
      if (m && !(m[1].toUpperCase() in props)) props[m[1].toUpperCase()] = m[2];
    }
    ${query ? `if ($(components(props.FN || "").join(";")).rangeOfStringOptions("${query}", $.NSCaseInsensitiveSearch).location === $.NSNotFound) continue;` : ""}
    const [lastName, firstName] = components(props.N || "");
    const full = ((firstName || "") + " " + (lastName || "")).trim();
    const org = components(props.ORG || "")[0];
    lines.push((props["X-ABUID"] || "") + " | " + (org ? full + " \\u2014 " + org : full));
  }
  lines.length === 0 ? "${empty}" : lines.join("\\n");`;

const contactTarget = (args: Record<string, unknown>): Record<string, unknown> =>
  args.contactId ? { contactId: args.contactId } : { name: args.name };

const findContact = (args: Record<string, unknown>, exactName = false) => {
  const contactId = args.contactId ? esc(args.contactId as string) : undefined;
  const name = args.name ? esc(args.name as string) : undefined;
  const selector = contactId
    ? `{ id: "${contactId}" }`
    : `{ name: ${exactName ? `"${name}"` : `{_contains: "${name}"}`} }`;
  const label = contactId ?? name;
  return `
  const matches = app.people.whose(${selector});
  if (matches.length === 0) throw new Error("Contact not found: ${label}");
  if (matches.length > 1) throw new Error("Multiple contacts match: ${label}");`;
};

const tools: ToolDef[] = [
  {
    name: "contacts_list",
    desc: "List contacts (name and organization)",
    annotations: { readOnlyHint: true },
    params: {
      limit: { type: "number", desc: "Max contacts to return (default: all)", int: true, min: 1, max: 1000 },
    },
    handle: async (a) => runJXA(listPeople({ limit: a.limit as number | undefined, empty: "No contacts found" })),
  },
  {
    name: "contacts_search",
    desc: "Search contacts by name",
    annotations: { readOnlyHint: true },
    params: {
      query: { type: "string", desc: "Name to search for", req: true },
    },
    handle: async (a) => {
      const query = esc(a.query as string);
      return runJXA(listPeople({ query, empty: `No contacts matching: ${query}` }));
    },
  },
  {
    name: "contacts_get",
    desc: "Get full details of a contact by id or name",
    annotations: { readOnlyHint: true },
    params: {
      contactId: { type: "string", desc: "Apple Contacts identifier" },
      name: { type: "string", desc: "Contact name (first, last, or full)" },
    },
    superRefine: requireOneOf("contactId", "name"),
    handle: async (a) => {
      return runJXA(`
        const app = Application("Contacts");
        ${findContact(a)}
        const p = matches[0];
        const lines = ["ID: " + p.id(), "Name: " + (p.firstName() || "") + " " + (p.lastName() || "")];
        const org = p.organization();
        if (org) lines.push("Organization: " + org);
        const title = p.jobTitle();
        if (title) lines.push("Title: " + title);
        for (const e of p.emails()) lines.push("Email (" + e.label() + "): " + e.value());
        for (const ph of p.phones()) lines.push("Phone (" + ph.label() + "): " + ph.value());
        for (const addr of p.addresses()) lines.push("Address (" + addr.label() + "): " + addr.formattedAddress());
        lines.join("\\n");
      `);
    },
  },
  {
    name: "contacts_create",
    desc: "Create a new contact in Apple Contacts",
    annotations: { destructiveHint: false },
    params: {
      firstName: { type: "string", desc: "First name", req: true },
      lastName: { type: "string", desc: "Last name", req: true },
      email: { type: "string", desc: "Email address" },
      phone: { type: "string", desc: "Phone number" },
      org: { type: "string", desc: "Organization" },
      title: { type: "string", desc: "Job title" },
      dryRun: { type: "boolean", desc: "Preview the contact without creating it" },
    },
    handle: async (a) => {
      const first = esc(a.firstName as string);
      const last = esc(a.lastName as string);
      if (a.dryRun) {
        return dryRun("create contact", {
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email ?? "",
          phone: a.phone ?? "",
          org: a.org ?? "",
          title: a.title ?? "",
        });
      }
      const props = [`firstName: "${first}"`, `lastName: "${last}"`];
      if (a.org) props.push(`organization: "${esc(a.org as string)}"`);
      if (a.title) props.push(`jobTitle: "${esc(a.title as string)}"`);
      const after: string[] = [];
      if (a.email) after.push(`p.emails.push(app.Email({label: "work", value: "${esc(a.email as string)}"}));`);
      if (a.phone) after.push(`p.phones.push(app.Phone({label: "work", value: "${esc(a.phone as string)}"}));`);
      return runJXA(`
        const app = Application("Contacts");
        const p = app.Person({${props.join(", ")}});
        app.people.push(p);
        ${after.join(" ")}
        app.save();
        "Contact created: " + p.id() + " | ${first} ${last}";
      `);
    },
  },
  {
    name: "contacts_update",
    desc: "Update an existing contact by id or exact full name",
    annotations: { destructiveHint: false },
    params: {
      contactId: { type: "string", desc: "Apple Contacts identifier" },
      name: { type: "string", desc: "Exact full name of the contact" },
      newFirstName: { type: "string", desc: "New first name" },
      newLastName: { type: "string", desc: "New last name" },
      newEmail: { type: "string", desc: "New primary email address" },
      newPhone: { type: "string", desc: "New primary phone number" },
      newOrg: { type: "string", desc: "New organization" },
      newTitle: { type: "string", desc: "New job title" },
      dryRun: { type: "boolean", desc: "Preview the update without changing Contacts" },
    },
    superRefine: requireOneOf("contactId", "name"),
    handle: async (a) => {
      const updates: string[] = [];
      const updateDetails: Record<string, unknown> = {};
      if (a.newFirstName) {
        updates.push(`p.firstName = "${esc(a.newFirstName as string)}";`);
        updateDetails.newFirstName = a.newFirstName;
      }
      if (a.newLastName) {
        updates.push(`p.lastName = "${esc(a.newLastName as string)}";`);
        updateDetails.newLastName = a.newLastName;
      }
      if (a.newOrg !== undefined) {
        updates.push(`p.organization = "${esc(a.newOrg as string)}";`);
        updateDetails.newOrg = a.newOrg;
      }
      if (a.newTitle !== undefined) {
        updates.push(`p.jobTitle = "${esc(a.newTitle as string)}";`);
        updateDetails.newTitle = a.newTitle;
      }
      if (a.newEmail !== undefined) {
        updates.push(`
        if (p.emails.length > 0) {
          p.emails[0].value = "${esc(a.newEmail as string)}";
        } else {
          p.emails.push(app.Email({label: "work", value: "${esc(a.newEmail as string)}"}));
        }
      `);
        updateDetails.newEmail = a.newEmail;
      }
      if (a.newPhone !== undefined) {
        updates.push(`
        if (p.phones.length > 0) {
          p.phones[0].value = "${esc(a.newPhone as string)}";
        } else {
          p.phones.push(app.Phone({label: "work", value: "${esc(a.newPhone as string)}"}));
        }
      `);
        updateDetails.newPhone = a.newPhone;
      }
      if (!updates.length) throw new Error("No updates specified");
      if (a.dryRun) return dryRun("update contact", { target: contactTarget(a), updates: updateDetails });
      return runJXA(`
        const app = Application("Contacts");
        ${findContact(a, true)}
        const p = matches[0];
        ${updates.join("\n")}
        app.save();
        "Contact updated: " + p.id() + " | " + p.name();
      `);
    },
  },
  {
    name: "contacts_delete",
    desc: "Delete a contact by id or exact full name",
    annotations: { destructiveHint: true },
    params: {
      contactId: { type: "string", desc: "Apple Contacts identifier" },
      name: { type: "string", desc: "Contact name (must match exactly)" },
      dryRun: { type: "boolean", desc: "Preview the deletion without changing Contacts" },
    },
    superRefine: requireOneOf("contactId", "name"),
    handle: async (a) => {
      if (a.dryRun) return dryRun("delete contact", { target: contactTarget(a) });
      return runJXA(`
        const app = Application("Contacts");
        ${findContact(a, true)}
        const p = matches[0];
        const deletedId = p.id();
        const deletedName = p.name();
        app.delete(p);
        app.save();
        "Contact deleted: " + deletedId + " | " + deletedName;
      `);
    },
  },
];

export default tools;
