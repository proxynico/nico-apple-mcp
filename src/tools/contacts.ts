import { dryRun, requireOneOf, type ToolDef } from "../types.ts";
import { runJXA, esc } from "../applescript.ts";

/**
 * JXA listing `id | name — organization` for every contact, optionally only names containing `query`.
 * Each property comes back for every contact in one Apple Event, where per-contact reads took 20-100s
 * for a few hundred contacts. Contacts can reorder between those events, so the ids are read again and
 * the snapshot retried if they moved. Names are matched with NSString's case-insensitive search, as
 * Contacts' own `whose` filter does, because that filter took up to 30s.
 */
const listPeople = ({ query, limit, empty }: { query?: string; limit?: number; empty: string }) => `
  ObjC.import("Foundation");
  const people = Application("Contacts").people;
  let snapshot = null;
  for (let attempt = 0; attempt < 3 && !snapshot; attempt++) {
    const ids = people.id();
    const fields = {
      ids,
      firstNames: people.firstName(),
      lastNames: people.lastName(),
      orgs: people.organization(),
      names: ${query ? "people.name()" : "null"},
    };
    const after = people.id();
    if (after.length === ids.length && after.every((id, i) => id === ids[i])) snapshot = fields;
  }
  if (!snapshot) throw new Error("Contacts changed while being read. Try again.");
  const { ids, firstNames, lastNames, orgs, names } = snapshot;
  const lines = [];
  for (let i = 0; i < ids.length && lines.length < ${limit ?? "Infinity"}; i++) {
    if (names && $(names[i] || "").rangeOfStringOptions("${query ?? ""}", $.NSCaseInsensitiveSearch).location === $.NSNotFound) continue;
    const full = ((firstNames[i] || "") + " " + (lastNames[i] || "")).trim();
    lines.push(ids[i] + " | " + (orgs[i] ? full + " \\u2014 " + orgs[i] : full));
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
