# Nico Apple MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a fresh `proxynico/nico-apple-mcp` OSS repository with new identity and the agreed safety, targeting, diagnostics, dependency, and CI improvements.

**Architecture:** Preserve the single Bun/TypeScript stdio MCP server and native Swift EventKit helper. Extend the existing tool definitions rather than introducing new layers; use strict Zod objects and selector refinements at the MCP boundary.

**Tech Stack:** Bun 1.3.14, TypeScript 5.9.3, MCP SDK 1.29.x, Zod 4.4.x, AppleScript/JXA, Swift/EventKit, GitHub Actions macOS runner.

## Global Constraints

- Use Bun only; never npm, Yarn, or pnpm.
- Keep one MCP server and 21 tools.
- Preserve `dryRun` on every mutating tool.
- Do not introduce explicit TypeScript `any`.
- Keep the existing Cider repository unchanged.

---

### Task 1: Strict tool inputs and clearable updates

**Files:**
- Modify: `tests/validation.test.ts`
- Modify: `tests/modules.test.ts`
- Modify: `src/types.ts`
- Modify: `src/tools/calendar.ts`
- Modify: `src/tools/notes.ts`
- Modify: `src/tools/contacts.ts`

**Interfaces:**
- Consumes: existing `toZodSchema(def)` and tool `handle(args)` contracts.
- Produces: strict schemas and handlers that distinguish `undefined` from `""` for clearable fields.

- [ ] Add failing tests that `toZodSchema` rejects `{ dry_run: true }` and dry-run update handlers accept empty clearable values.
- [ ] Run `bun test tests/validation.test.ts tests/modules.test.ts`; expect unknown-key and empty-clear tests to fail.
- [ ] Replace `z.object(toZodShape(def))` with `z.strictObject(toZodShape(def))`; change clearable update guards from truthiness to `!== undefined`.
- [ ] Rerun the focused tests and then `bun run test`; expect all tests to pass.

### Task 2: Stable Notes and Contacts selectors

**Files:**
- Modify: `tests/modules.test.ts`
- Modify: `src/tools/notes.ts`
- Modify: `src/tools/contacts.ts`

**Interfaces:**
- Produces: optional `noteId` or `title` selectors for Notes; optional `contactId` or `name` selectors for Contacts; list/search output containing stable IDs.

- [ ] Add failing schema and source-output tests for ID selectors and ID-bearing list/search output.
- [ ] Run `bun test tests/modules.test.ts`; expect missing-parameter and output assertions to fail.
- [ ] Add reusable Zod selector refinements, pass IDs to AppleScript/JXA selectors, and include IDs in returned list/search/read results.
- [ ] Rerun focused and full tests; expect all tests to pass.

### Task 3: Resilient doctor

**Files:**
- Modify: `tests/modules.test.ts`
- Modify: `src/tools/doctor.ts`

**Interfaces:**
- Produces: `calendarHelperDiagnostic(helperReady, runHelper)` returning diagnostic text for both resolve and reject paths.

- [ ] Add a failing test with an injected helper runner that rejects with `permission timed out`.
- [ ] Run the focused test and verify it fails because the helper error escapes.
- [ ] Extract the minimal helper-diagnostic function, catch the rejection, and keep the main doctor report intact.
- [ ] Rerun focused and full tests.

### Task 4: New product identity and documentation

**Files:**
- Create: `src/meta.ts`
- Rename: `src/helpers/cider-cal.swift` to `src/helpers/nico-apple-cal.swift`
- Rename: `src/helpers/cider-cal.Info.plist` to `src/helpers/nico-apple-cal.Info.plist`
- Rename: `src/helpers/cider-cal.entitlements` to `src/helpers/nico-apple-cal.entitlements`
- Modify: `package.json`, `src/index.ts`, `src/tools/calendarHelper.ts`, `src/tools/doctor.ts`, helper sources, tests, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`

**Interfaces:**
- Produces: `SERVER_NAME = "nico-apple-mcp"`, `SERVER_VERSION = "0.1.0"`, and new helper paths/identity.

- [ ] Add failing identity tests asserting package, MCP metadata, plist identity, helper paths, and absence of user-specific README paths.
- [ ] Run tests and verify identity assertions fail against Cider.
- [ ] Apply the mechanical rename, source server metadata from `src/meta.ts`, and rewrite README setup/troubleshooting text for the public repository.
- [ ] Run tests, Swift typecheck, and MCP handshake; expect the new identity and 21 tools.

### Task 5: Dependencies and macOS CI

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: reproducible Bun install and a single macOS validation workflow.

- [ ] Refresh only the vulnerable transitive overrides identified by `bun audit` and regenerate `bun.lock` with Bun.
- [ ] Run `bun audit`; expect no advisories, or document any stdio-unreachable remaining advisory.
- [ ] Add CI steps for frozen install, `bun run test`, Swift typecheck, `bun run build:swift`, `bun audit`, and `git diff --check`.
- [ ] Run the same commands locally, including the helper build.

### Task 6: Fresh repository publication

**Files:** all intended repository files only.

**Interfaces:**
- Produces: public `https://github.com/proxynico/nico-apple-mcp` on `main`.

- [ ] Review `git status`, staged diff, public documentation, and generated-file exclusions.
- [ ] Commit the fresh repository with concise, intentional commits.
- [ ] Create the public GitHub repository with description `Local MCP tools for Apple Calendar, Notes, and Contacts on macOS`.
- [ ] Add `origin`, push `main`, and verify the remote default branch, visibility, files, and CI run.

