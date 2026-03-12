# OPEROVERLAY-001: Add a generic operation-execution overlay for temporary piece interpretation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel eval/query/filter overlay contract, action-profile applicability/execution support, compiler/schema/tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-overlay.ts`, `packages/engine/src/kernel/action-applicability-preflight.ts`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/predicate-value-resolution.ts`, `packages/engine/src/kernel/token-filter.ts`, `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/schemas-ast.ts`, `packages/engine/src/cnl/compile-event-cards.ts`, `packages/engine/src/cnl/compile-effects-free-op.ts`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-events-roks.test.ts`

## Problem

`ROKs` needs a temporary rule interpretation that is generic in concept but not currently expressible through shared engine contracts:

- selected faction executes a free operation “as US”,
- all US Troops, ARVN Troops, and Police participate,
- ARVN cubes are treated as US Troops for profile logic,
- US-only capability hooks like `Abrams` and US-base doubling remain active because the operation is still “US-like”.

Current engine surfaces support `executeAsSeat`, `zoneFilter`, and `grantContext`, but they do not support temporary piece-interpretation overlays. The only way to author `ROKs` today is to duplicate large custom FITL Sweep/Assault profiles in `GameSpecDoc`, which is cumbersome and was enough to expose the separate free-operation scaling bug.

The missing abstraction is engine-level and game-agnostic: temporary interpretation of pieces for one operation/grant.

## Assumption Reassessment (2026-03-12)

1. `executeAsSeat` already changes which action profile is selected, but it does not reinterpret actual token faction/type filters inside that profile. Confirmed by current kernel behavior and existing tests.
2. FITL Sweep and Assault profiles currently read literal token `faction`/`type` values directly. Confirmed in `data/games/fire-in-the-lake/30-rules-actions.md`.
3. Card 70 is currently forced toward duplicated custom profiles because there is no generic piece-interpretation overlay contract. Confirmed by the current authored-data experiment.
4. The right fix is not FITL-specific branching inside the kernel; it is a generic overlay surface that authored data can supply for any game.

## Architecture Check

1. A generic operation-execution overlay is cleaner than cloning whole operation profiles every time a card says “as if X” or “treat Y as Z”.
2. This preserves the architectural boundary: game-specific intent stays in `GameSpecDoc`; the engine only exposes generic overlay semantics for queries, filters, and profile logic.
3. The overlay must be temporary and explicit. It should not mutate token state or create compatibility aliases in `GameDef`.
4. No backwards-compatibility layer should preserve today’s profile-cloning workaround once the generic overlay exists.

## What to Change

### 1. Define a generic operation-execution overlay contract

Extend the shared free-operation / execution overlay surface so authored data can declare temporary interpretation rules such as:

- include additional factions or piece classes in a profile’s cube/troop queries,
- reinterpret one faction/type combination as another for operation evaluation,
- or expose generic runtime-set/alias information to query/predicate evaluation.

The contract must be generic enough for future “as if” event/capability rules, not just `ROKs`.

### 2. Thread the overlay through action applicability and execution

Ensure the overlay is visible consistently wherever operation profiles currently inspect token facts:

- action-profile applicability,
- options queries,
- token filters,
- predicate-value resolution,
- and resolution-time query/effect evaluation.

The engine should evaluate one coherent overlay model rather than patching isolated call sites.

### 3. Keep token state immutable and canonical

The overlay must affect interpretation only, not underlying stored token props. Canonical token state remains the source of truth; the overlay is an execution context.

### 4. Prepare `ROKs` for reevaluation

Do not finalize card-70 data in this ticket. Instead, provide the generic contract that allows `tickets/FITL70-001-reevaluate-roks-after-engine-rework.md` to remove the custom-profile workaround if appropriate.

## Files to Touch

- `tickets/OPEROVERLAY-001-generic-operation-execution-overlay.md` (new)
- `packages/engine/src/kernel/free-operation-overlay.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/predicate-value-resolution.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (modify only if overlay-aware resolution stays generic)
- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify if extension schema surface changes)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/compile-effects-free-op.ts` (modify)
- `packages/engine/test/integration/fitl-events-roks.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify later only to consume the generic overlay)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify later only to consume the generic overlay)

## Out of Scope

- Fixing the free-operation probing/OOM issue itself — tracked by `archive/tickets/FREEOP/FREEOP-ROKS-001-free-operation-probe-scaling.md`
- Final `ROKs` authored-data cleanup
- Any FITL-only kernel branching
- Visual presentation changes

## Acceptance Criteria

### Tests That Must Pass

1. Generic tests prove a granted operation can temporarily reinterpret pieces without mutating canonical token state.
2. `ROKs`-class behavior can be expressed without duplicating bespoke mixed-cube Sweep/Assault profiles once this contract is consumed.
3. Existing query/predicate behavior without overlays remains correct.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Game-specific piece reinterpretation rules remain authored in `GameSpecDoc`; the engine only executes a generic overlay contract.
2. `GameDef`, simulator, and kernel stay game-agnostic.
3. No backwards-compatibility alias or duplicated token-state mutation path is introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add generic execute-as plus temporary piece-interpretation coverage.
2. `packages/engine/test/integration/fitl-events-roks.test.ts` — verify `ROKs` can be reauthored onto the shared overlay once available.
3. Shared kernel unit tests near touched query/filter/overlay code — verify overlay-aware interpretation and unchanged baseline behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-roks.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

