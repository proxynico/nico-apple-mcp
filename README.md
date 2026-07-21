# Cider

Local Apple Calendar, Notes, and Contacts tools for Claude Code, Codex, and other AI assistants on macOS.

Cider lets an AI assistant use the Apple apps already on your Mac.

It connects Claude Code, Codex, or another MCP client to:

- Apple Calendar
- Apple Notes
- Apple Contacts
- a `doctor` check that tells you whether the setup is healthy

You install it once, register one MCP server, approve the normal macOS privacy prompts, and then your assistant can help with calendar events, notes, and contacts from your local machine.

MCP is the tool/plugin connection used by assistants like Claude Code and Codex. In practice, Cider is the bridge between your assistant and your Apple apps.

## What It Can Do

Calendar:
- list your calendars
- search events by date range
- create events
- update events
- delete events
- use event IDs so common titles like "Lunch" or "Call" do not hit the wrong event

Notes:
- list folders and notes
- read and search notes
- create, append, move, update, and delete notes

Contacts:
- list and search contacts
- read contact details
- create, update, and delete contacts

Diagnostics:
- run `doctor` to confirm Bun, AppleScript, the Calendar helper, Calendar access, Notes access, and Contacts access are working.

## Install

```bash
git clone https://github.com/proxynico/cider.git
cd cider
bun install
bun run build:swift
```

`bun run build:swift` creates the small signed **Cider Calendar Helper** app that macOS uses for Calendar permission.

## Register With Claude Code

```bash
claude mcp add --scope user cider -- bun run /path/to/cider/src/index.ts
claude mcp get cider
```

Example for this local checkout:

```bash
claude mcp add --scope user cider -- bun run /Users/nicolasmontero/Developer/tools/cider/src/index.ts
```

Restart Claude Code after registering or updating Cider.

## Register With Codex

```bash
codex mcp add cider -- bun run /path/to/cider/src/index.ts
codex mcp list
```

Example for this local checkout:

```bash
codex mcp add cider -- bun run /Users/nicolasmontero/Developer/tools/cider/src/index.ts
```

Restart Codex after registering or updating Cider.

## Approve macOS Permissions

macOS controls access to Calendar, Notes, and Contacts. Cider cannot bypass those prompts, and that is a good thing.

After registration, ask your assistant to run:

```text
doctor
```

Then try a harmless Calendar read:

```text
calendar_list_calendars
```

If macOS asks for Calendar access, approve it.

If no prompt appears, open:

```text
System Settings > Privacy & Security > Calendars
```

Make sure **CiderCalendarHelper** is enabled with **Full Access**.

For Notes and Contacts, use:

```text
System Settings > Privacy & Security > Automation
```

Allow your MCP client or terminal app to control Notes and Contacts if macOS asks.

## Check That It Works

From your assistant, run:

```text
doctor
```

A healthy setup looks like this:

```text
OK bun
OK osascript
OK Notes automation
OK Contacts automation
OK calendar helper
calendar authorization: authorized
OK calendar permission: granted
```

Then try:

```text
calendar_list_calendars
notes_list_folders
contacts_list
```

If those work, Cider is ready.

## Using Calendar Safely

Calendar search returns an `eventId`. Use that `eventId` when updating or deleting events.

That is safer than updating by title alone, because many calendars have repeated titles like "Meeting", "Lunch", or "Call".

Example flow:

1. Search for events in a date range.
2. Pick the right event from the results.
3. Use its `eventId` to update or delete it.

Mutating Calendar, Notes, and Contacts tools also support `dryRun: true` where available, so your assistant can preview the action before changing anything.

## Dates

Use ISO-style dates:

```text
2026-05-12
2026-05-12T10:30:00
2026-05-12T10:30:00Z
2026-05-12T10:30:00+02:00
```

Date-only values mean local midnight on your Mac.

## Troubleshooting

Run `doctor` first. It is the fastest way to see what is broken.

If Calendar says `notDetermined` or denied:
- run `calendar_list_calendars`
- approve the prompt if it appears
- check that **CiderCalendarHelper** is enabled in Calendar privacy settings
- restart the MCP client after changing permissions

If Notes or Contacts fail:
- check Automation permissions for the app running Cider
- restart the MCP client after changing permissions

If tools disappeared or still use old behavior:
- quit old Claude/Codex sessions
- start a fresh session so the MCP server reloads the latest code

## Development

Useful commands:

```bash
bun install
bun run build:swift
bun run test
bun run src/index.ts
```

Before shipping changes, run:

```bash
bun run build:swift
bun run test
git diff --check
```

For a full live smoke test, also verify:
- `doctor`
- `calendar_list_calendars`
- a temporary Calendar create/update/delete
- temporary Notes and Contacts create/read/delete if those surfaces changed

## How It Works

Cider is one local MCP server. The TypeScript server exposes the tools. Calendar uses a small signed helper app because macOS grants Calendar permission to apps, not anonymous background scripts. Notes and Contacts use Apple automation.

No cloud account, API key, or external database is required. Access stays on your Mac and is controlled by macOS privacy settings.

## License

MIT
