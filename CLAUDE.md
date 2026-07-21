# cider

Bun/TS MCP server for Apple Calendar, Notes, and Contacts. Commands and
Linux/cloud caveats live in `AGENTS.md`.

- Calendar goes through the compiled Swift EventKit helper
  `src/helpers/CiderCalendarHelper.app/Contents/MacOS/cider-cal` — run
  `bun run build:swift` after touching `src/helpers/cider-cal.swift`.
- Keep cider as one server.
- Prefer EventKit over brittle AppleScript for Calendar writes.
- Preserve `dryRun` on mutating tools.
