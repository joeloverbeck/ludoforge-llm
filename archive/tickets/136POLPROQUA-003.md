# 136POLPROQUA-003: Rename canary to `fitl-policy-agent-canary-determinism.test.ts`

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — single-file rename in `packages/engine/test/determinism/`
**Deps**: `specs/136-policy-profile-quality-corpus.md`

## Problem

Post-commit `820072e3`, `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` is a single-purpose determinism-and-boundedness proof (FOUNDATIONS #8 and #10). Once the policy-profile-quality corpus lands (Tickets 001 and 002), readers browsing `determinism/` alongside `policy-profile-quality/fitl-variant-*-convergence.test.ts` benefit from a filename that unambiguously signals which corpus each file belongs to. Spec 136 Implementation Direction → Migration lists this rename as optional and atomic: no assertion changes, only a filename (and optionally the `describe` name).

This ticket is marked LOW priority and can be descoped during review if preferred — the spec's Required Proof does not depend on it. It is included per ticket fidelity (never silently skip a spec deliverable).

## Assumption Reassessment (2026-04-18)

1. Current file: `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`. Verified exists at ticket start. Current `describe` string: `'FITL PolicyAgent determinism canary'` (line 22) — already contains the word "determinism", so a describe-name change is unnecessary. Only the filename rename is in scope.
2. No production code imports the filename directly; test discovery is still glob-based under `packages/engine/test/determinism/**`. Active draft artifacts (`tickets/136POLPROQUA-003.md`, `specs/136-policy-profile-quality-corpus.md`) do reference the old path and must be updated alongside the rename so live repo docs stay truthful. Historical references in `archive/` and git commit messages are immutable and out of scope.
3. Lane manifest (`test-lane-manifest.mjs`) globs `packages/engine/test/determinism/` — renaming a file inside the directory does not require manifest changes.
4. `.github/workflows/engine-determinism.yml` triggers on `packages/engine/test/determinism/**` — rename preserves the trigger.

## Architecture Check

1. **Zero semantic change**. The file's assertions, marker, and test structure stay identical; only the filename changes. No risk of altering the corpus's coverage or determinism guarantees.
2. **Improves corpus readability**. Readers seeing `fitl-policy-agent-canary-determinism.test.ts` next to `fitl-variant-arvn-evolved-convergence.test.ts` immediately understand that the former proves determinism invariants and the latter tracks convergence quality — no cross-reference to the spec needed.
3. **FOUNDATIONS #14 compliant**. Rename happens in one change; no alias file, no compatibility shim, no `.old` suffix preservation. If the rename is rejected during review, the ticket is dropped cleanly.

## What to Change

### 1. Rename the file

Move `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` → `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts`.

### 2. Update internal `describe` string (optional; verify before editing)

Current describe: `'FITL PolicyAgent determinism canary'`. Already unambiguous — no change needed. If preferred for symmetry with the new filename, it can be left alone. This ticket leaves the describe untouched.

### 3. Verify build & test still pass

The `dist/` build will pick up the new filename automatically. Ticket 001's determinism lint rule (via `test-class-markers.test.ts`) will continue to pass — the file's content is unchanged.

## Files to Touch

- `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` (delete via rename)
- `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` (new via rename)

## Out of Scope

- Any change to assertions in the renamed file.
- Any change to other files in `determinism/`.
- Changes to workflow files, lane manifest, or package scripts (the rename is invisible to them).
- Descope path: if the user decides the rename is not worth the diff, close this ticket with "Declined — file remains `fitl-policy-agent-canary.test.ts`" in the Outcome. No downstream ticket depends on the rename.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:determinism` — all determinism assertions still pass under the renamed file.
2. `pnpm -F @ludoforge/engine test:unit` — `test-class-markers.test.ts` continues to discover and validate the file.
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — full suite green.

### Invariants

1. The renamed file's content (including `@test-class` marker, seed list, and assertions) is byte-identical to the pre-rename file — the only changes are filename and git blob path.
2. Determinism lane continues to include the file; no file is added to or removed from any lane as a side effect of this ticket.

## Test Plan

### New/Modified Tests

No new tests. The existing canary file is the test surface; only its path changes.

### Commands

1. Rename `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` to `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` — the rename itself.
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:determinism` — targeted verification.
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — full-suite verification.
4. `pnpm run check:ticket-deps` — dependency integrity.

## Outcome

- Completion date: 2026-04-18
- `ticket corrections applied`: `only live reference is the file itself` -> active draft ticket/spec references to the old path were updated in the same change so the rename remained repo-truthful.
- Renamed `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` to `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` without changing the file contents or the existing `describe` string.
- Updated active draft references in `tickets/136POLPROQUA-003.md` and `specs/136-policy-profile-quality-corpus.md` so current-state documentation points at the renamed file while archived historical references continue to use the old path.
- Verification set: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test:determinism`, `pnpm -F @ludoforge/engine test:unit`, `pnpm run check:ticket-deps`, `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`.
