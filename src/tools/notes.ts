import { dryRun, type ToolDef } from "../types.ts";
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

const findNote = (title: string) => `
  set theNotes to (every note whose name is "${title}")
  if (count of theNotes) is 0 then error "Note not found: ${title}"
  if (count of theNotes) > 1 then error "Multiple notes match: ${title}"
  set n to item 1 of theNotes`;

const findFolder = (name: string) => `
  set theFolders to (every folder whose name is "${name}")
  if (count of theFolders) is 0 then error "Folder not found: ${name}"
  if (count of theFolders) > 1 then error "Multiple folders match: ${name}"
  set f to item 1 of theFolders`;

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
      const folder = a.folder ? esc(a.folder as string) : null;
      const limit = a.limit ? Number(a.limit) : 0;
      if (folder) return runAppleScript(`
        tell application "Notes"
          ${findFolder(folder)}
          set _limit to ${limit}
          set _count to 0
          set output to ""
          repeat with n in notes of f
            if _limit is not 0 and _count >= _limit then exit repeat
            set output to output & name of n & " | " & (modification date of n as string) & linefeed
            set _count to _count + 1
          end repeat
          if output is "" then return "No notes in folder ${folder}"
          return output
        end tell
      `);
      return runAppleScript(`
        tell application "Notes"
          set _limit to ${limit}
          set _count to 0
          set output to ""
          repeat with n in notes
            if _limit is not 0 and _count >= _limit then exit repeat
            set output to output & name of n & " | " & (modification date of n as string) & linefeed
            set _count to _count + 1
          end repeat
          if output is "" then return "No notes found"
          return output
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
      const rawTitle = a.title as string;
      const title = esc(rawTitle);
      const body = esc(renderNoteBody(rawTitle, a.body as string));
      const target = a.folder ? `folder "${esc(a.folder as string)}"` : "default account";
      if (a.dryRun) return dryRun("create note", { title: rawTitle, folder: a.folder ?? "default", body: a.body });
      return runAppleScript(`
        tell application "Notes"
          tell ${target}
            make new note with properties {name:"${title}", body:"${body}"}
          end tell
          return "Note created: ${title}"
        end tell
      `);
    },
  },
  {
    name: "notes_read",
    desc: "Read the content of a note by title",
    annotations: { readOnlyHint: true },
    params: {
      title: { type: "string", desc: "Note title", req: true },
    },
    handle: async (a) => {
      const title = esc(a.title as string);
      return runAppleScript(`
        tell application "Notes"
          ${findNote(title)}
          return "Title: " & name of n & linefeed & "Modified: " & (modification date of n as string) & linefeed & linefeed & plaintext of n
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
      const limit = a.limit ? Number(a.limit) : 0;
      return runAppleScript(`
        tell application "Notes"
          set _limit to ${limit}
          set _count to 0
          set output to ""
          repeat with n in (every note whose name contains "${query}")
            if _limit is not 0 and _count >= _limit then exit repeat
            set output to output & name of n & " | " & (modification date of n as string) & linefeed
            set _count to _count + 1
          end repeat
          if output is "" then return "No notes matching: ${query}"
          return output
        end tell
      `);
    },
  },
  {
    name: "notes_append",
    desc: "Append plain text to an existing note by exact title",
    annotations: { destructiveHint: false },
    params: {
      title: { type: "string", desc: "Note title", req: true },
      text: { type: "string", desc: "Text to append", req: true },
      dryRun: { type: "boolean", desc: "Preview the append without changing Notes" },
    },
    handle: async (a) => {
      const title = esc(a.title as string);
      const fragment = esc(renderBodyFragment(a.text as string));
      if (a.dryRun) return dryRun("append note", { title: a.title, text: a.text });
      return runAppleScript(`
        tell application "Notes"
          ${findNote(title)}
          set body of n to (body of n) & "<br>${fragment}"
          return "Note appended: ${title}"
        end tell
      `);
    },
  },
  {
    name: "notes_move",
    desc: "Move a note to a different folder by exact title",
    annotations: { destructiveHint: false },
    params: {
      title: { type: "string", desc: "Note title", req: true },
      folder: { type: "string", desc: "Destination folder", req: true },
      dryRun: { type: "boolean", desc: "Preview the move without changing Notes" },
    },
    handle: async (a) => {
      const title = esc(a.title as string);
      const folder = esc(a.folder as string);
      if (a.dryRun) return dryRun("move note", { title: a.title, folder: a.folder });
      return runAppleScript(`
        tell application "Notes"
          ${findNote(title)}
          ${findFolder(folder)}
          move n to f
          return "Note moved: ${title} -> ${folder}"
        end tell
      `);
    },
  },
  {
    name: "notes_update",
    desc: "Update an existing note's title or body",
    annotations: { destructiveHint: false },
    params: {
      title: { type: "string", desc: "Current note title to find", req: true },
      newTitle: { type: "string", desc: "New title" },
      newBody: { type: "string", desc: "New body text (plain text)" },
      dryRun: { type: "boolean", desc: "Preview the update without changing Notes" },
    },
    handle: async (a) => {
      const rawTitle = a.title as string;
      const title = esc(rawTitle);
      const newTitleRaw = a.newTitle as string | undefined;
      const newBodyRaw = a.newBody as string | undefined;
      const updates: string[] = [];
      if (newTitleRaw) updates.push(`set name of n to "${esc(newTitleRaw)}"`);
      if (newBodyRaw !== undefined) {
        const heading = newTitleRaw ?? rawTitle;
        const html = esc(renderNoteBody(heading, newBodyRaw));
        updates.push(`set body of n to "${html}"`);
      } else if (newTitleRaw) {
        updates.push(replaceH1InBody(esc(escapeHtml(newTitleRaw))));
      }
      if (!updates.length) throw new Error("No updates specified");
      if (a.dryRun) return dryRun("update note", { title: rawTitle, newTitle: newTitleRaw, newBody: newBodyRaw });
      return runAppleScript(`
        tell application "Notes"
          ${findNote(title)}
          ${updates.join("\n          ")}
          return "Note updated: ${title}"
        end tell
      `);
    },
  },
  {
    name: "notes_delete",
    desc: "Delete a note by title",
    annotations: { destructiveHint: true },
    params: {
      title: { type: "string", desc: "Note title to delete", req: true },
      dryRun: { type: "boolean", desc: "Preview the deletion without changing Notes" },
    },
    handle: async (a) => {
      const title = esc(a.title as string);
      if (a.dryRun) return dryRun("delete note", { title: a.title });
      return runAppleScript(`
        tell application "Notes"
          ${findNote(title)}
          delete n
          return "Note deleted: ${title}"
        end tell
      `);
    },
  },
];

export default tools;
