# Repository Guidelines

## Project Overview

This is **RamTeamAi**, a desktop app built with **Tauri 2 + React + TypeScript + Vite + Vitest**.

Agents must treat this as a real runnable product, not just a code-generation exercise. Do not mark work as done until the app has been checked from the terminal with the relevant commands below.

## Mandatory Terminal Discipline

- Work from the repository root: `C:\Users\makst\Documents\RAM`.
- This workspace is on Windows. Prefer PowerShell-compatible commands.
  - Use `Get-ChildItem` instead of `ls -la`.
  - Use `Get-ChildItem -Recurse -Filter <name>` instead of Unix `find`.
  - Use `Remove-Item -LiteralPath ...` for deletion and verify paths before destructive operations.
- Before editing, inspect the existing files and package scripts.
- After editing, run the smallest relevant verification command first, then broader checks.
- Never say "it should work" without showing which command was run and whether it passed.
- If a command fails, read the full error output, fix the root cause, and rerun the command.
- Do not leave long-running dev servers/processes running unless the user explicitly asks.

## Project Structure

- `src/` - React UI, state, providers, orchestration, MCP/project-builder frontend code.
- `src-tauri/` - Rust/Tauri desktop backend, commands, config, keychain, persistence, native features.
- `tests/` or colocated `*.test.ts` files - automated tests.
- `assets/` - static assets and screenshots.
- `docs/` - setup, release, and architecture documentation.
- `scripts/` - Windows helper scripts for dev, release, versioning, and logging.
- `dist/` - generated frontend build output; do not edit manually.

## Build, Test, and Development Commands

Run these from the repository root.

### Install dependencies

```powershell
npm install
```

### Type-check

```powershell
npm run check
```

### Test

```powershell
npm test
```

### Frontend production build

```powershell
npm run build
```

### Frontend dev server

```powershell
npm run dev
```

Vite normally uses port `5173`. Tauri dev mode starts Vite on `127.0.0.1:1420` through `src-tauri/tauri.conf.json`.

### Tauri desktop dev app

```powershell
npm run tauri:dev
```

This uses `scripts\tauri-dev.ps1`, which sets up Visual Studio Build Tools and Cargo paths before running Tauri.

### Tauri dev with logs

Use this when the desktop app does not start or exits immediately:

```powershell
npm run dev:logs
```

Then inspect the newest files under `logs\dev\`:

```powershell
Get-ChildItem .\logs\dev\ | Sort-Object LastWriteTime -Descending | Select-Object -First 5
Get-Content -Raw .\logs\dev\<latest>.err.log
Get-Content -Raw .\logs\dev\<latest>.out.log
```

### Release/build checks

```powershell
npm run tauri:build
npm run release:windows
```

Only run release commands when the task is specifically about packaging or release artifacts, because they can take longer and require the native toolchain.

## Required Verification Before Finishing

For most code changes, run:

```powershell
npm run check
npm test
npm run build
```

For changes under `src-tauri/`, `scripts/`, `src-tauri/tauri.conf.json`, updater config, permissions, or native features, also run or explicitly attempt:

```powershell
npm run tauri:dev
```

If Tauri cannot be launched in the current environment, run `npm run dev:logs`, inspect the logs, and report the blocker with exact file paths and error messages.

## App-Launch Debugging Procedure

When the user says the app does not launch:

1. Run `npm run check`.
2. Run `npm test`.
3. Run `npm run build`.
4. Run `npm run dev:logs` or `npm run tauri:dev`.
5. Inspect:
   - terminal output;
   - latest `logs\dev\*.err.log` and `logs\dev\*.out.log`;
   - old root logs such as `tauri-dev-run.err.log`, `tauri-dev-run.out.log`, `codex-runtime-vite.err.log`, and `codex-runtime-vite.out.log` if relevant.
6. Fix the first real error, not just symptoms.
7. Rerun the failing command.
8. In the final response, include:
   - what failed;
   - what was changed;
   - exact verification commands and results;
   - remaining blockers, if any.

## Coding Style

- Follow the existing TypeScript/React/Rust style.
- Keep modules focused and small.
- Prefer explicit types at important boundaries.
- Do not introduce new frameworks or state libraries without a clear reason.
- Do not edit generated `dist/` files by hand.
- Keep formatting consistent with the surrounding file.

## Testing Guidelines

- Add or update tests for functional changes.
- Use Vitest for TypeScript tests.
- Tests should cover business logic, state transitions, provider adapters, command builders, and error handling.
- If a bug is fixed, add a regression test when practical.

## Documentation Guidelines

- Update `README.md`, `docs/`, or this file when commands, setup steps, release flow, or architecture change.
- Keep instructions copy-pasteable on Windows.
- If documentation mentions a port, script, or artifact path, verify it against the actual config.

## Library and API Documentation

When a task asks about a library, framework, SDK, API, CLI tool, or cloud service, use Context7 MCP first to fetch current documentation before answering or changing code. This applies even to common tools like React, Vite, Tauri, Firebase, Tailwind, and Vitest.

Do not use Context7 for ordinary refactoring, business-logic debugging, or general programming concepts unless library/API behavior is the question.

## Security and Configuration

- Do not commit secrets, API keys, tokens, private certificates, or local `.env` files.
- Use `.env.example` for required variable names.
- Keep real credentials in ignored local files or the OS keychain.
- Do not print secrets in logs or final responses.

## Definition of Done

A task is done only when:

- the requested code/docs change is complete;
- relevant terminal checks were run;
- failures were either fixed or clearly reported as blockers;
- no unrelated files were modified;
- the final response lists exact commands and outcomes.

