# Nico Apple MCP Design

## Goal

Create a fresh public OSS repository named **Nico Apple MCP** from the proven Cider codebase, with new product identity and a short list of safety and maintenance improvements.

## Identity

- Display name: `Nico Apple MCP`
- Repository, package, and MCP server name: `nico-apple-mcp`
- Initial version: `0.1.0`
- Calendar helper display name: `Nico Apple MCP Calendar Helper`
- Calendar helper executable: `nico-apple-cal`
- Calendar helper bundle identifier: `com.proxynico.nico-apple-mcp.calendar-helper`
- GitHub repository: `proxynico/nico-apple-mcp`, public, default branch `main`

The repository starts with new Git history. The existing Cider repository and its Conductor workspace remain unchanged.

## Architecture

Keep one Bun/TypeScript stdio MCP server. Calendar continues to use the signed Swift EventKit helper; Notes continues to use AppleScript; Contacts continues to use JXA. No new service, framework, transport, or abstraction layer is added.

## Behavior changes

1. Reject unknown tool arguments so a misspelled `dryRun` cannot silently become a real mutation.
2. Return stable IDs from Notes and Contacts list/search operations and accept those IDs for read/update/delete operations, while retaining title/name fallback compatibility.
3. Allow empty strings to clear clearable update fields, while names and titles remain non-empty.
4. Make `doctor` report Calendar-helper failures without aborting the other diagnostics.
5. Refresh vulnerable transitive dependency overrides until `bun audit` is clean or only reports a documented stdio-unreachable exception.
6. Add one macOS CI workflow covering install, TypeScript/tests, Swift typecheck, helper build, and dependency audit.

## Safety and compatibility

- Every mutating tool retains `dryRun`.
- Delete operations remain marked destructive.
- Calendar event IDs remain unchanged.
- Notes and Contacts title/name targeting remains available for existing clients.
- A new Calendar helper identity intentionally causes a fresh macOS permission prompt.

## Verification

- TDD regression coverage for strict schemas, stable IDs, clearing fields, and resilient diagnostics.
- `bun run test`
- `swiftc -typecheck src/helpers/nico-apple-cal.swift`
- `bun run build:swift`
- MCP initialize plus `tools/list` returns 21 tools under server name `nico-apple-mcp` version `0.1.0`.
- `bun audit`
- `git diff --check`

Live writes to Calendar, Notes, and Contacts are not required before the initial public push; the README will document the manual permission and smoke-test procedure.
