# 15GAMAGEPOLIR-010: Migrate Runner Seat Config to Human-vs-Agent Descriptors

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only wiring on top of engine descriptors
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-009-migrate-engine-agent-selection-to-structured-descriptors.md

## Problem

The runner still stores seat types as `'human' | 'ai-random' | 'ai-greedy'`, which bakes engine implementation details into UI/store/session contracts and blocks authored-policy defaults from becoming the normal non-human path.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/store/store-types.ts`, `session/session-types.ts`, `store/ai-move-policy.ts`, and `ui/PreGameConfigScreen.tsx` still use the legacy AI seat strings.
2. Ticket `15GAMAGEPOLIR-008` already migrated the shared trace consumer path to structured `agentDecision` payloads, so the runner now straddles two models: structured decision telemetry, but legacy string-based seat configuration.
3. Spec 15 requires human-vs-agent selection first, then a structured agent descriptor for non-human seats.
4. The remaining legacy string contract is broader than the initial ticket text implied: `game-store`, `active-game-runtime`, `replay-runtime`, async serialization tests, session-store tests, and app-level session tests all still persist or assume `'human' | 'ai-random' | 'ai-greedy'`.
5. Corrected scope: this ticket must migrate the full runner/session persistence boundary to structured seat controllers, not just UI defaults and AI move helper wiring.

## Architecture Check

1. A `SeatController` shape is cleaner than continuing to encode controller kind and agent kind in one string field.
2. The runner should reuse the engine-owned `AgentDescriptor` model already present in core types instead of introducing a runner-only duplicate descriptor schema.
3. Keeping the runner on structured descriptors aligns it with the engine contract and removes duplicated parsing logic.
4. The migration must be end-to-end across in-memory store state, session persistence, replay bootstrap, and app-shell contracts; otherwise the runner remains split across two incompatible models.
5. No runner-only string shims should persist as the authoritative seat contract.

## What to Change

### 1. Replace legacy runner seat strings

Introduce runner-side seat controller shapes:

- `{ kind: 'human' }`
- `{ kind: 'agent'; agent: AgentDescriptor }`

### 2. Update AI move policy and session/store plumbing

Make the runner resolve non-human seats through structured descriptors and default them to authored `policy`.

This includes removing the current `ai-random` / `ai-greedy`-driven selection shortcuts in `store/ai-move-policy.ts` and replacing them with descriptor-aware dispatch that matches the engine-facing contract.

This migration also includes:

- `playerSeats` maps in store/render contexts
- session state payloads used by start/resume/replay flows
- bootstrap search helpers that infer the human player id
- async serialization and replay hydration tests that currently encode legacy seat strings

### 3. Update pre-game configuration UX

Expose:

- human vs agent first
- agent mode/details second
- built-in random/greedy as explicit opt-in tools

## File List

- `packages/runner/src/store/store-types.ts` (modify)
- `packages/runner/src/session/session-types.ts` (modify)
- `packages/runner/src/store/ai-move-policy.ts` (modify)
- `packages/runner/src/ui/PreGameConfigScreen.tsx` (modify)
- `packages/runner/src/store/game-store.ts` (modify as needed)
- `packages/runner/src/session/active-game-runtime.ts` (modify if session bootstrap shape changes)
- `packages/runner/src/session/replay-runtime.ts` (modify if replay/session serialization shape changes)
- `packages/runner/src/ui/App.tsx` (modify if app-shell session contracts still inline legacy seat strings)
- `packages/runner/test/store/ai-move-policy.test.ts` (new/modify)
- `packages/runner/test/ui/pre-game-config-screen.test.tsx` (new/modify)
- `packages/runner/test/store/game-store.test.ts` (modify)
- `packages/runner/test/store/game-store-async-serialization.test.ts` (modify)
- `packages/runner/test/store/store-types.test.ts` (modify)
- `packages/runner/test/session/session-store.test.ts` (modify)
- `packages/runner/test/persistence/save-manager.test.ts` (modify)
- `packages/runner/test/ui/App.test.ts` (modify)

## Out of Scope

- engine evaluator or preview changes
- authored FITL/Texas policy content
- browser stress/performance harness work unrelated to seat descriptor migration

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/store/ai-move-policy.test.ts` proves non-human seats default to authored `policy` descriptors and built-in random/greedy remain opt-in.
2. `packages/runner/test/ui/pre-game-config-screen.test.tsx` proves the pre-game UI edits structured human/agent descriptors rather than legacy `ai-*` strings.
3. Session persistence/runtime wiring preserves the new structured seat-controller shape across start/resume/replay flows.
4. No runner-facing persisted/session/store contract keeps `'ai-random'` or `'ai-greedy'` as the source of truth after migration.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Runner seat configuration distinguishes controller kind from agent descriptor kind.
2. Authored `policy` becomes the default non-human execution path.
3. Built-in random/greedy remain available for debugging without shaping the runner architecture.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/ai-move-policy.test.ts` — seat-controller normalization and defaulting.
2. `packages/runner/test/ui/pre-game-config-screen.test.tsx` — UI state and serialization coverage.
3. `packages/runner/test/store/game-store.test.ts` — store/runtime controller handling and human-seat resolution.
4. `packages/runner/test/store/game-store-async-serialization.test.ts` — persisted payload shape uses structured seat controllers.
5. `packages/runner/test/session/session-store.test.ts` and `packages/runner/test/ui/App.test.ts` — session boundary coverage across start/resume/replay flows.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm run check:ticket-deps`
