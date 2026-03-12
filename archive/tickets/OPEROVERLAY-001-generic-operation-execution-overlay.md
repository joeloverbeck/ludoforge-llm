# OPEROVERLAY-001: Add a generic operation-execution overlay for temporary piece interpretation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — extend the existing free-operation overlay with generic token interpretation, thread it through token-property reads, compiler/schema/tests, and remove the FITL-specific ROKs workaround
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-overlay.ts`, `packages/engine/src/kernel/action-applicability-preflight.ts`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/predicate-value-resolution.ts`, `packages/engine/src/kernel/token-filter.ts`, `packages/engine/src/kernel/resolve-ref.ts`, `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/types-turn-flow.ts`, `packages/engine/src/kernel/schemas-ast.ts`, `packages/engine/src/kernel/schemas-extensions.ts`, `packages/engine/src/cnl/compile-event-cards.ts`, `packages/engine/src/cnl/compile-effects-free-op.ts`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts`, `packages/engine/test/unit/token-filter.test.ts`, `packages/engine/test/unit/resolve-ref.test.ts`, `packages/engine/test/integration/fitl-events-roks.test.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`

## Problem

`ROKs` needs a temporary rule interpretation that is generic in concept but not currently expressible through shared engine contracts:

- selected faction executes a free operation “as US”,
- all US Troops, ARVN Troops, and Police participate,
- ARVN cubes are treated as US Troops for profile logic,
- US-only capability hooks like `Abrams` and US-base doubling remain active because the operation is still “US-like”.

Current engine surfaces already support a shared `freeOperationOverlay` carrying `zoneFilter` and resolved `grantContext`, and `executeAsSeat` already swaps the executing profile. What they still do not support is temporary token-property reinterpretation inside that profile.

`ROKs` is currently implemented by a FITL-specific workaround: card 70 opens a temporary global-var window (`fitl_roksMixedUsOperation`) and shared FITL action data includes dedicated `sweep-roks-mixed-us-profile` / `assault-roks-mixed-us-profile` branches keyed off that flag. That works, but it pushes one card's semantics into global game state and shared action profiles.

The missing abstraction is engine-level and game-agnostic: temporary interpretation of pieces for one operation/grant.

## Assumption Reassessment (2026-03-12)

1. `executeAsSeat` already changes which action profile is selected, but it does not reinterpret token facts read inside that profile. Confirmed by current kernel behavior and existing tests.
2. The shared free-operation overlay path already exists and reaches applicability, legal move discovery, query evaluation, and grant-context resolution. Confirmed in `free-operation-overlay.ts`, `action-applicability-preflight.ts`, `legal-moves.ts`, `apply-move.ts`, and related tests.
3. FITL Sweep and Assault profiles currently read canonical token props directly through token filters and `tokenProp` references. Confirmed in `data/games/fire-in-the-lake/30-rules-actions.md`, `token-filter.ts`, and `resolve-ref.ts`.
4. Card 70 is not currently blocked on authorability; it is implemented via FITL-specific global state and dedicated mixed-US profiles. That workaround is the real cleanup target.
5. The right fix is still generic and engine-level: extend the existing overlay surface with temporary token interpretation rather than adding more FITL-specific branches or preserving the current workaround.

## Architecture Check

1. Extending the existing overlay is cleaner than encoding one card's semantics as global vars plus dedicated alternate action profiles in shared game data.
2. This preserves the architectural boundary: game-specific intent stays in `GameSpecDoc`; the engine only exposes generic overlay semantics for token-property interpretation during one granted operation.
3. The overlay must be temporary and explicit. It should not mutate token state, add compatibility aliases, or leak into non-overlay evaluation.
4. Once the generic overlay exists, remove the current ROKs-specific global-var/profile workaround rather than keeping both architectures alive.

## What to Change

### 1. Extend the existing operation-execution overlay contract

Extend the shared free-operation / execution overlay surface so authored data can declare temporary token-interpretation rules such as:

- treat tokens matching a generic token filter as if selected scalar props had different values for overlay-aware evaluation,
- reinterpret one faction/type combination as another for operation evaluation,
- and compose that with the existing `executeAsSeat`, `zoneFilter`, and `grantContext` surfaces.

The contract must stay game-agnostic and generic enough for future “as if” event/capability rules, not just `ROKs`.

### 2. Thread the overlay through action applicability and execution

Ensure the overlay is visible consistently wherever operation profiles currently inspect token facts through shared kernel helpers:

- action-profile applicability,
- options queries,
- token filters,
- predicate-value resolution,
- `tokenProp` reference resolution,
- and resolution-time query/effect evaluation.

The engine should evaluate one coherent overlay model rather than patching FITL-specific action data or isolated runtime call sites.

### 3. Keep token state immutable and canonical

The overlay must affect interpretation only, not underlying stored token props. Canonical token state remains the source of truth; the overlay is an execution context.

### 4. Remove the current `ROKs` workaround

Reauthor card 70 onto the generic overlay in this ticket and delete the current FITL-specific global-var / alternate-profile workaround from shared FITL action data.

## Files to Touch

- `tickets/OPEROVERLAY-001-generic-operation-execution-overlay.md` (new)
- `packages/engine/src/kernel/free-operation-overlay.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/predicate-value-resolution.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/src/kernel/resolve-ref.ts` (modify)
- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify if extension schema surface changes)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/compile-effects-free-op.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/resolve-ref.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-roks.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify to remove the ROKs-specific mixed-US profiles)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify to consume the generic overlay directly)

## Out of Scope

- Fixing the free-operation probing/OOM issue itself — tracked by `archive/tickets/FREEOP/FREEOP-ROKS-001-free-operation-probe-scaling.md`
- Keeping the existing `fitl_roksMixedUsOperation` workaround alive alongside the generic overlay
- Any FITL-only kernel branching
- Visual presentation changes

## Acceptance Criteria

### Tests That Must Pass

1. Generic tests prove a granted operation can temporarily reinterpret token props without mutating canonical token state.
2. `ROKs` behavior is expressed through the shared overlay contract, without `fitl_roksMixedUsOperation` and without dedicated mixed-US Sweep/Assault profiles.
3. Existing query/predicate behavior without overlays remains correct.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Game-specific piece reinterpretation rules remain authored in `GameSpecDoc`; the engine only executes a generic overlay contract.
2. `GameDef`, simulator, and kernel stay game-agnostic.
3. No backwards-compatibility alias or duplicated token-state mutation path is introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add generic execute-as plus token-interpretation overlay coverage.
2. `packages/engine/test/integration/fitl-events-roks.test.ts` — verify `ROKs` runs through the shared overlay after removing the FITL-specific workaround.
3. `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts` — verify the new overlay payload threads through the existing preflight overlay object.
4. Shared kernel unit tests near touched query/filter/ref code — verify overlay-aware token-property interpretation and unchanged baseline behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-roks.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- Outcome amended: 2026-03-12

- Completion date: 2026-03-12
- What actually changed:
  - Extended the existing free-operation overlay with generic `tokenInterpretations` rules so granted operations can reinterpret token properties without mutating canonical token state.
  - Threaded that overlay through free-operation issuance, preflight, legal move discovery, query/token-filter evaluation, `tokenProp` resolution, overlap/dedup logic, compiler lowering, runtime schemas, and FITL production data.
  - Added a dedicated shared `token-view` kernel boundary so overlay-adjusted token facts are materialized in one place and consumed by token filters, `tokenProp` resolution, and the remaining read-only kernel token-property helpers in lifecycle/derived-value code.
  - Reauthored FITL card 70 (`ROKs`) to use `executeAsSeat`, `zoneFilter`, and generic token interpretation directly in authored data.
  - Removed the FITL-specific `fitl_roksMixedUsOperation` global-var workaround and the dedicated mixed-US Sweep/Assault profiles.
  - Regenerated checked-in engine schema artifacts.
- Deviations from original plan:
  - No direct change was needed in `action-applicability-preflight.ts` or `predicate-value-resolution.ts`; the cleaner implementation boundary was the shared token-property readers (`token-filter.ts`, `resolve-ref.ts`, and overlay plumbing already reaching preflight/execution contexts).
  - Instead of relying on a new synthetic token-interpretation integration scenario, the final coverage leans on focused unit tests plus the real FITL ROKs production path and adjacent FITL integration coverage.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/token-filter.test.js packages/engine/dist/test/unit/resolve-ref.test.js packages/engine/dist/test/unit/kernel/free-operation-preflight-overlay.test.js packages/engine/dist/test/integration/fitl-events-roks.test.js packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js packages/engine/dist/test/integration/fitl-production-data-compilation.test.js packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
