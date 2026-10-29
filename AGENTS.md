# AGENTS.md

## Overview

Nico Apple MCP is a single MCP (Model Context Protocol) server that exposes 22 tools for macOS Apple apps (Calendar, Notes, Contacts) via AppleScript, JXA, and EventKit. Prefer EventKit over AppleScript for Calendar writes. It uses **Bun** as its runtime, package manager, and test runner.

## Prerequisites

- **Bun** is the required runtime (not Node.js). It is installed to `~/.bun/bin/bun`. Ensure `$HOME/.bun/bin` is on `PATH`.
- The project uses `bun.lock` — always use `bun install` (not npm/yarn/pnpm).

## Key commands

See `package.json` `scripts` for the full list. Summary:

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Type check | `bun run typecheck` |
| Run tests | `bun run test` (runs typecheck first, then `bun test`) |
| Start server | `bun run src/index.ts` |
| Build Swift helper | `bun run build:swift` (requires macOS + swiftc) |

## Linux and cloud agents

- **macOS-only tools**: `osascript` (AppleScript/JXA) and `swiftc` (EventKit helper) are unavailable on Linux. Tools that call these will return errors at runtime, which is expected.
- **Tests should pass on Linux**: Validation, module structure, dry-run handler, and startup tests avoid native macOS APIs. Do not hard-code the test count in docs; use the current `bun run test` output.
- **MCP server starts on Linux**: The stdio-transport server starts and responds to JSON-RPC messages. Use `printf '<JSON-RPC>\n' | bun run src/index.ts` to interact with it.
- **`build:swift` will fail on Linux**: Skip this step in non-macOS environments.

## Testing the MCP server interactively

The server uses stdio transport. To test manually, pipe newline-delimited JSON-RPC messages:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | bun run src/index.ts
```

Dry-run mode (`"dryRun": true`) works on any OS for mutating tools (create/update/delete).
