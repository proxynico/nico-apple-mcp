# nico-apple-mcp

Bun/TS MCP server for Apple Calendar, Notes, and Contacts. Commands and
Linux/cloud caveats live in `AGENTS.md`.

- Calendar goes through the compiled Swift EventKit helper
  `src/helpers/NicoAppleMCPCalendarHelper.app/Contents/MacOS/nico-apple-cal` — run
  `bun run build:swift` after touching `src/helpers/nico-apple-cal.swift`.
- Keep nico-apple-mcp as one server.
- Prefer EventKit over brittle AppleScript for Calendar writes.
- Preserve `dryRun` on mutating tools.
