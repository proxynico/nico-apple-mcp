import { dryRun, requireOneOf, type ToolDef } from "../types.ts";
import { runAppleScript, esc } from "../applescript.ts";

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const renderBodyFragment = (body: string): string =>
  escapeHtml(body).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");

const renderNoteBody = (title: string, body: string): string => {
  const safeTitle = escapeHtml(title);
  const safeBody = renderBodyFragment(body);
  return `<h1>${safeTitle}</h1><br>${safeBody}`;
};

/** Create a plain-text note, in `folder` or the default account, and return its id and title. Notes titles a note with its first line, so the title goes only in the body: setting `name` as well showed it twice. */
export function createNote({ title, body, folder }: { title: string; body: string; folder?: string }): Promise<string> {
  const target = folder ? `folder "${esc(folder)}"` : "default account";
  return runAppleScript(`
    tell application "Notes"
      tell ${target}
        set n to make new note with properties {body:"${esc(renderNoteBody(title, body))}"}
      end tell
      return "Note created: " & id of n & " | " & name of n
    end tell
  `);
}

const noteTarget =(args: Record<string, unknown>): Record<string, unknown> =>
  args.noteId ? { noteId: args.noteId } : { title: args.title };

const findNote = (args: Record<string, unknown>) => {
  const noteId = args.noteId ? esc(args.noteId as string) : undefined;
  const title = args.title ? esc(args.title as string) : undefined;
  const selector = noteId ? `id is "${noteId}"` : `name is "${title}"`;
  const label = noteId ?? title;
  return `
  set theNotes to (every note whose ${selector})
  if (count of theNotes) is 0 then error "Note not found: ${label}"
  if (count of theNotes) > 1 then error "Multiple notes match: ${label}"
  set n to item 1 of theNotes`;
};

const findFolder = (name: string) => `
  set theFolders to (every folder whose name is "${name}")
  if (count of theFolders) is 0 then error "Folder not found: ${name}"
  if (count of theFolders) > 1 then error "Multiple folders match: ${name}"
  set f to item 1 of theFolders`;

/**
 * AppleScript listing `id | name | modified` for `notes`, an object specifier such as `notes of f`,
 * optionally only names containing `query`. Each property comes back for every note in one Apple Event,
 * where per-note reads and `whose` filters took 10-30s for a few hundred notes. Notes can reorder
 * between those events, so the ids are read again and the snapshot retried if they moved.
 */
const listNotes = ({ notes, query, limit, empty }: { notes: string; query?: string; limit: number; empty: string }) => `
  set _ids to missing value
  repeat 3 times
    set {_read, _names, _dates} to {id, name, modification date} of ${notes}
    if (id of ${notes}) is _read then
      set _ids to _read
      exit repeat
    end if
  end repeat
  if _ids is missing value then error "Notes changed while being read. Try again."
  set _limit to ${limit}
  set _count to 0
  set output to ""
  repeat with i from 1 to count of _ids
    if _limit is not 0 and _count >= _limit then exit repeat
    if ${query ? `item i of _names contains "${query}"` : "true"} then
      set output to output & item i of _ids & " | " & item i of _names & " | " & ((item i of _dates) as string) & linefeed
      set _count to _count + 1
    end if
  end repeat
  if output is "" then return "${empty}"
  return output`;

const replaceH1InBody = (newHeading: string) => `
  set _oldBody to body of n
  set AppleScript's text item delimiters to "</h1>"
  set _parts to text items of _oldBody
  if (count of _parts) < 2 then
    set AppleScript's text item delimiters to ""
    set body of n to "<h1>${newHeading}</h1><br>" & _oldBody
  else
    set _tail to items 2 thru -1 of _parts as text
    set AppleScript's text item delimiters to ""
    set body of n to "<h1>${newHeading}</h1>" & _tail
  end if`;

const tools: ToolDef[] = [
  {
    name: "notes_list_folders",
    desc: "List all folders in Apple Notes",
    annotations: { readOnlyHint: true },
    handle: () => runAppleScript(`
      tell application "Notes"
        set output to ""
        repeat with f in folders
          set output to output & name of f & " (" & (count of notes of f) & " notes)" & linefeed
        end repeat
        return output
      end tell
    `),
  },
  {
    name: "notes_list",
    desc: "List notes, optionally filtered by folder",
    annotations: { readOnlyHint: true },
    params: {
      folder: { type: "string", desc: "Folder name (lists all if omitted)" },
      limit: { type: "number", desc: "Max notes to return", int: true, min: 1, max: 500 },
    },
    handle: async (a) => {
      const limit = (a.limit as number | undefined) ?? 0;
      if (!a.folder) {
        return runAppleScript(`tell application "Notes"${listNotes({ notes: "notes", limit, empty: "No notes found" })}
        end tell`);
      }
      const folder = esc(a.folder as string);
      return runAppleScript(`
        tell application "Notes"
          ${findFolder(folder)}
          ${listNotes({ notes: "notes of f", limit, empty: `No notes in folder ${folder}` })}
        end tell
      `);
    },
  },
  {
    name: "notes_create",
    desc: "Create a new note in Apple Notes",
    annotations: { destructiveHint: false },
    params: {
      title: { type: "string", desc: "Note title", req: true },
      body: { type: "string", desc: "Note body (plain text)", req: true },
      folder: { type: "string", desc: "Folder name (uses default if omitted)" },
      dryRun: { type: "boolean", desc: "Preview the note without creating it" },
    },
    handle: async (a) => {
      if (a.dryRun) return dryRun("create note", { title: a.title, folder: a.folder ?? "default", body: a.body });
      return createNote({ title: a.title as string, body: a.body as string, folder: a.folder as string | undefined });
    },
  },
  {
    name: "notes_read",
    desc: "Read the content of a note by id or exact title",
    annotations: { readOnlyHint: true },
    params: {
      noteId: { type: "string", desc: "Apple Notes identifier" },
      title: { type: "string", desc: "Exact note title" },
    },
    superRefine: requireOneOf("noteId", "title"),
    handle: async (a) => {
      return runAppleScript(`
        tell application "Notes"
          ${findNote(a)}
          return "ID: " & id of n & linefeed & "Title: " & name of n & linefeed & "Modified: " & (modification date of n as string) & linefeed & linefeed & plaintext of n
        end tell
      `);
    },
  },
  {
    name: "notes_search",
    desc: "Search notes by title",
    annotations: { readOnlyHint: true },
    params: {
      query: { type: "string", desc: "Search query", req: true },
      limit: { type: "number", desc: "Max notes to return", int: true, min: 1, max: 500 },
    },
    handle: async (a) => {
      const query = esc(a.query as string);
      const limit = (a.limit as number | undefined) ?? 0;
      return runAppleScript(`tell application "Notes"${listNotes({ notes: "notes", query, limit, empty: `No notes matching: ${query}` })}
        end tell`);
    },
  },
  {
    name: "notes_append",
    desc: "Append plain text to an existing note by id or exact title",
    annotations: { destructiveHint: false },
    params: {
      noteId: { type: "string", desc: "Apple Notes identifier" },
      title: { type: "string", desc: "Exact note title" },
      text: { type: "string", desc: "Text to append", req: true },
      dryRun: { type: "boolean", desc: "Preview the append without changing Notes" },
    },
    superRefine: requireOneOf("noteId", "title"),
    handle: async (a) => {
      const fragment = esc(renderBodyFragment(a.text as string));
      if (a.dryRun) return dryRun("append note", { target: noteTarget(a), text: a.text });
      return runAppleScript(`
        tell application "Notes"
          ${findNote(a)}
          set body of n to (body of n) & "<br>${fragment}"
          return "Note appended: " & id of n & " | " & name of n
        end tell
      `);
    },
  },
  {
    name: "notes_move",
    desc: "Move a note to a different folder by id or exact title",
    annotations: { destructiveHint: false },
    params: {
      noteId: { type: "string", desc: "Apple Notes identifier" },
      title: { type: "string", desc: "Exact note title" },
      folder: { type: "string", desc: "Destination folder", req: true },
      dryRun: { type: "boolean", desc: "Preview the move without changing Notes" },
    },
    superRefine: requireOneOf("noteId", "title"),
    handle: async (a) => {
      const folder = esc(a.folder as string);
      if (a.dryRun) return dryRun("move note", { target: noteTarget(a), folder: a.folder });
      return runAppleScript(`
        tell application "Notes"
          ${findNote(a)}
          ${findFolder(folder)}
          move n to f
          return "Note moved: " & id of n & " | " & name of n & " -> ${folder}"
        end tell
      `);
    },
  },
  {
    name: "notes_update",
    desc: "Update an existing note's title or body by id or exact title",
    annotations: { destructiveHint: false },
    params: {
      noteId: { type: "string", desc: "Apple Notes identifier" },
      title: { type: "string", desc: "Current exact note title" },
      newTitle: { type: "string", desc: "New title" },
      newBody: { type: "string", desc: "New body text (plain text)" },
      dryRun: { type: "boolean", desc: "Preview the update without changing Notes" },
    },
    superRefine: requireOneOf("noteId", "title"),
    handle: async (a) => {
      const rawTitle = a.title as string | undefined;
      const newTitleRaw = a.newTitle as string | undefined;
      const newBodyRaw = a.newBody as string | undefined;
      const updates: string[] = [];
      if (newTitleRaw) updates.push(`set name of n to "${esc(newTitleRaw)}"`);
      if (newBodyRaw !== undefined) {
        const body = esc(renderBodyFragment(newBodyRaw));
        if (newTitleRaw ?? rawTitle) {
          const html = esc(renderNoteBody((newTitleRaw ?? rawTitle) as string, newBodyRaw));
          updates.push(`set body of n to "${html}"`);
        } else {
          updates.push(`set body of n to "<h1>" & name of n & "</h1><br>${body}"`);
        }
      } else if (newTitleRaw) {
        updates.push(replaceH1InBody(esc(escapeHtml(newTitleRaw))));
      }
      if (!updates.length) throw new Error("No updates specified");
      if (a.dryRun) return dryRun("update note", { target: noteTarget(a), newTitle: newTitleRaw, newBody: newBodyRaw });
      return runAppleScript(`
        tell application "Notes"
          ${findNote(a)}
          ${updates.join("\n          ")}
          return "Note updated: " & id of n & " | " & name of n
        end tell
      `);
    },
  },
  {
    name: "notes_delete",
    desc: "Delete a note by id or exact title",
    annotations: { destructiveHint: true },
    params: {
      noteId: { type: "string", desc: "Apple Notes identifier" },
      title: { type: "string", desc: "Exact note title to delete" },
      dryRun: { type: "boolean", desc: "Preview the deletion without changing Notes" },
    },
    superRefine: requireOneOf("noteId", "title"),
    handle: async (a) => {
      if (a.dryRun) return dryRun("delete note", { target: noteTarget(a) });
      return runAppleScript(`
        tell application "Notes"
          ${findNote(a)}
          set deletedId to id of n
          set deletedName to name of n
          delete n
          return "Note deleted: " & deletedId & " | " & deletedName
        end tell
      `);
    },
  },
];

export default tools;
