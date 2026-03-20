# 15GAMAGEPOLIR-010: Migrate Runner Seat Config to Human-vs-Agent Descriptors

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only normalization onto engine-owned descriptors
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-009-migrate-engine-agent-selection-to-structured-descriptors.md

## Problem

The runner still stores seat control as legacy sentinel strings (`'human' | 'ai-random' | 'ai-greedy'`). That leaks debug builtins into UI, store, session, persistence, and presentation boundaries, duplicates the engine's now-canonical `AgentDescriptor` model, and keeps authored `policy` from being the normal non-human path.

## Assumption Reassessment (2026-03-19)

1. The core runner contracts are still legacy-string based today: `packages/runner/src/store/store-types.ts` defines `PlayerSeat = 'human' | 'ai-random' | 'ai-greedy'`, and `packages/runner/src/session/session-types.ts` persists the same string union through `PlayerSeatConfig`.
2. Ticket `15GAMAGEPOLIR-009` already made `@ludoforge/engine/runtime` the canonical home of `AgentDescriptor` (`{ kind: 'builtin'; builtinId: 'random' | 'greedy' } | { kind: 'policy'; profileId?: string }`). The runner should import and reuse that exact type rather than define its own variant.
3. The live scope is broader than the original problem statement implied. The legacy contract currently flows through `game-store`, `session-store`, `active-game-runtime`, `replay-runtime`, persistence (`game-db` / save manager), `App.tsx`, pre-game UI, and presentation/model consumers that infer "AI" by checking `seat !== 'human'`.
4. The original file list was slightly inaccurate. The app-shell file is `packages/runner/src/App.tsx`, not `packages/runner/src/ui/App.tsx`. `packages/runner/src/session/session-store.ts` and `packages/runner/src/persistence/game-db.ts` are active contract boundaries and belong in scope.
5. Existing tests are not limited to the ones named originally. The legacy strings are asserted across store, session, persistence, app, pre-game UI, replay/active-runtime, presentation, and render-model tests. This ticket should migrate the relevant existing tests instead of assuming a mostly greenfield test surface.
6. Corrected scope: this ticket must migrate the full runner seat-controller contract end-to-end, including persisted/session/bootstrap boundaries and any runner consumer that currently relies on encoded AI seat strings as the source of truth.

## Architecture Check

1. The current architecture is not the right long-term boundary. Encoding controller kind and builtin policy choice into one seat string couples UX, session state, and diagnostics to implementation shortcuts.
2. The clean runner contract is a seat-controller object that separates "who controls the seat" from "which agent descriptor should execute when it is non-human".
3. The runner should normalize onto engine-owned `AgentDescriptor` immediately and keep built-in `random` / `greedy` as explicit debug descriptors, not as architectural seat modes.
4. Authored `policy` should be the default agent descriptor for non-human seats. Builtins remain available, but only as explicit opt-in selections.
5. There is no value in preserving runner-local aliases as a compatibility layer. If migration breaks a caller or test, that caller/test should be updated to the cleaner contract.
6. Secondary architectural cleanup is warranted where current consumers only need a boolean distinction (`isHuman`) or a controller kind check. Those consumers should stop depending on legacy string semantics.

## What to Change

### 1. Replace legacy runner seat strings with seat-controller objects

Adopt a runner-side contract like:

- `{ kind: 'human' }`
- `{ kind: 'agent'; agent: AgentDescriptor }`

for both persisted `PlayerSeatConfig` entries and in-memory `playerSeats` maps.

### 2. Update store/session/runtime normalization

Migrate the full runner boundary to descriptor-aware controller objects:

- `playerSeats` in store/render context
- session state payloads for start/resume/replay
- persistence record shapes used by save/load
- bootstrap helpers that infer the human-controlled player id
- action/orchestration code that currently derives builtins from `'ai-random'` / `'ai-greedy'`

`packages/runner/src/store/ai-move-policy.ts` should stop modeling runner AI as seat strings and instead work from structured agent descriptors or seat-controller helpers.

### 3. Update pre-game configuration UX

Expose controller choice in two steps:

- human vs agent first
- for agent seats, explicit agent selection second

The default non-human choice should be `{ kind: 'agent', agent: { kind: 'policy' } }`. Built-in greedy/random remain available as explicit debug selections.

### 4. Update downstream runner consumers

Any runner consumer that currently infers semantics from the old string encoding must migrate to the new structure. That includes at least:

- applied-move / presentation logic that determines whether a move came from a human or agent seat
- render/model helpers that only need `isHuman`
- tests and fixtures that serialize or compare seat config payloads

## File List

- `packages/runner/src/store/store-types.ts` (modify)
- `packages/runner/src/session/session-types.ts` (modify)
- `packages/runner/src/store/ai-move-policy.ts` (modify)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/session/session-store.ts` (modify)
- `packages/runner/src/session/active-game-runtime.ts` (modify)
- `packages/runner/src/session/replay-runtime.ts` (modify)
- `packages/runner/src/persistence/game-db.ts` (modify if persisted type changes)
- `packages/runner/src/App.tsx` (modify if app-shell typings/contracts still assume legacy seat strings)
- `packages/runner/src/ui/PreGameConfigScreen.tsx` (modify)
- `packages/runner/src/presentation/action-announcement-presentation.ts` (modify)
- `packages/runner/src/model/derive-runner-frame.ts` (modify if human/agent checks still depend on string values)
- relevant runner tests under `packages/runner/test/...` (modify/add)

## Out of Scope

- engine evaluator, policy IR, or preview changes
- authored FITL/Texas policy content
- browser stress/performance harness work unrelated to seat-controller migration

## Acceptance Criteria

### Tests That Must Pass

1. Runner session/store/persistence contracts no longer use `'ai-random'` or `'ai-greedy'` as the authoritative seat representation.
2. `packages/runner/test/store/ai-move-policy.test.ts` proves agent-controller normalization defaults non-human seats to `{ kind: 'policy' }` and keeps builtin random/greedy as explicit opt-in descriptors.
3. `packages/runner/test/ui/PreGameConfigScreen.test.tsx` proves the pre-game UI edits structured human/agent controller objects rather than legacy seat strings.
4. Session start/resume/replay and save/load flows preserve the new seat-controller shape intact.
5. Presentation/render consumers that only need human-vs-agent semantics read that from the structured controller shape rather than string comparisons.
6. Existing suite: `pnpm -F @ludoforge/runner test`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`
8. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Runner seat configuration separates controller kind from agent descriptor kind.
2. Authored `policy` is the default non-human execution path.
3. Built-in random/greedy remain available for debugging without shaping the runner architecture.
4. No runner-only alias layer remains as the long-term seat-controller contract.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/ai-move-policy.test.ts` — seat-controller normalization, descriptor dispatch, and builtin opt-in coverage.
2. `packages/runner/test/ui/PreGameConfigScreen.test.tsx` — UI state, validation, and emitted structured config coverage.
3. `packages/runner/test/store/game-store.test.ts` and `packages/runner/test/store/game-store-async-serialization.test.ts` — store/runtime controller handling and serialized payload shape coverage.
4. `packages/runner/test/session/session-store.test.ts`, `packages/runner/test/session/active-game-runtime.test.tsx`, and `packages/runner/test/session/replay-runtime.test.tsx` — start/resume/replay boundary coverage.
5. `packages/runner/test/persistence/save-manager.test.ts` and `packages/runner/test/ui/App.test.ts` — persistence/app-shell integration coverage.
6. `packages/runner/test/presentation/action-announcement-presentation.test.ts` and any affected render/model tests — downstream consumer migration coverage.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What changed:
  - Replaced the runner's legacy seat string contract with structured seat-controller objects that embed engine-owned `AgentDescriptor` values.
  - Migrated session state, store state, persistence records, pre-game UI, runtime bootstrap helpers, presentation consumers, and affected tests to the new `{ kind: 'human' } | { kind: 'agent'; agent: AgentDescriptor }` shape.
  - Reworked runner AI turn execution to dispatch through engine agents via descriptor-aware selection instead of runner-local `'ai-random'` / `'ai-greedy'` seat parsing.
  - Added per-player agent RNG wiring in the runner store so builtin and policy agents execute through the same descriptor-driven path.
  - Regenerated runner bootstrap fixtures after the current engine validator surfaced stale FITL fixture data (`derivedMetrics[*].runtime`), which was required to restore the runner bootstrap test suite.
- Deviations from original plan:
  - The old `applyTemplateMove`-specific runner AI tests were replaced with `applyMove`-based descriptor-dispatch coverage because the architectural goal is no longer template-move AI wiring in the runner.
  - `packages/runner/src/App.tsx` required only test-contract updates; the app-shell runtime logic itself already flowed through the session store boundary cleanly once that boundary moved to structured controllers.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/runner bootstrap:fixtures`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm run check:ticket-deps`
