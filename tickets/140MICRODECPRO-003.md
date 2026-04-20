# 140MICRODECPRO-003: D1 — domain types + decision stack on GameState + new deterministic constants

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — adds `packages/engine/src/kernel/microturn/` module + extends `GameState` + new constants
**Deps**: `specs/140-microturn-native-decision-protocol.md`

## Problem

Spec 140's entire microturn protocol rests on a new kernel-owned decision-stack representation. Before any behavior change can land (publishMicroturn, applyDecision, simulator rewrite), the domain types must exist and `GameState` must carry them deterministically (F8). This ticket introduces the type surface and the state extension — no behavior yet, but every downstream ticket consumes these types.

## Assumption Reassessment (2026-04-20)

1. `packages/engine/src/kernel/` is the canonical kernel module path — confirmed. New `microturn/` subdirectory is introduced here.
2. `GameState` currently lives in `packages/engine/src/kernel/types-core.ts` — confirmed by Explore agent during reassessment.
3. Branded types pattern for domain identifiers is standard per Foundation 17 — confirmed in existing `ZoneId`, `PlayerId`, `ActionId`, `SeatId`, `DecisionKey` definitions.
4. `stateHash` serialization is the F8 determinism oracle — the decision stack must serialize canonically to preserve replay identity.
5. Neither `MAX_AUTO_RESOLVE_CHAIN` nor `CHANCE_RNG_MIX` exists anywhere in the codebase — both are new (confirmed by grep during reassessment).
6. `AGENT_RNG_MIX` already exists at `packages/engine/src/sim/simulator.ts:26` as the reference pattern for the new `CHANCE_RNG_MIX` constant.

## Architecture Check

1. Pure type + data additions with no behavior change — cleanly reviewable. The decision stack is defined as `readonly DecisionStackFrame[]` — immutable per F11.
2. Engine-agnosticism preserved (F1): all new types are game-agnostic. No FITL or Texas references anywhere in the new module.
3. Schema stays generic (F6): `DecisionContext` is a discriminated union with kernel-defined variants only. No per-game extension points.
4. F14 compliant: no old type is left coexisting with a new one. This ticket *adds* types; downstream tickets *replace* old types atomically when their behavior retires.
5. F17 compliant: `TurnId`, `DecisionFrameId` are branded numeric types; existing `DecisionKey`, `SeatId`, `ActionId` are reused.

## What to Change

### 1. Create `packages/engine/src/kernel/microturn/types.ts`

Export the full type surface per spec 140 D1:

- `DecisionContextKind` union: `'actionSelection' | 'chooseOne' | 'chooseNStep' | 'stochasticResolve' | 'outcomeGrantResolve' | 'turnRetirement'`.
- Branded types: `TurnId = number & { readonly __brand: 'TurnId' }`, `DecisionFrameId = number & { readonly __brand: 'DecisionFrameId' }`.
- Context interfaces (one per kind): `ActionSelectionContext`, `ChooseOneContext`, `ChooseNStepContext`, `StochasticResolveContext`, `OutcomeGrantResolveContext`, `TurnRetirementContext`. Fields match spec 140 D1 verbatim.
- Aggregate: `DecisionContext` union over all six.
- `DecisionStackFrame` interface with `frameId`, `parentFrameId | null`, `turnId`, `context`, `accumulatedBindings: Readonly<Record<DecisionKey, MoveParamValue>>`, `effectFrame: EffectExecutionFrameSnapshot`.
- `EffectExecutionFrameSnapshot` type — define a minimal initial shape here (program counter, bounded-iteration cursors, local let-bindings, pending trigger queue); ticket 005 expands fields as the suspend/resume implementation lands.

### 2. Create `packages/engine/src/kernel/microturn/constants.ts`

Define the two new deterministic constants per the refined spec 140 D1:

- `export const MAX_AUTO_RESOLVE_CHAIN: number = <default>` — upper bound on consecutive kernel-owned microturns in a single `advanceAutoresolvable` call. Default derived from `MoveEnumerationBudgets`-scale values (recommend the max of existing trigger-depth and enumeration budgets as the initial value; document the rationale in a single-line comment above the constant).
- `export const CHANCE_RNG_MIX: bigint = <64-bit constant>` — XOR mix for the chance RNG derivation. Pattern mirrors `AGENT_RNG_MIX = 0x9e3779b97f4a7c15n` at `packages/engine/src/sim/simulator.ts:26`. Use a distinct constant (not a derivation of `AGENT_RNG_MIX`) to avoid accidental RNG correlation. Recommended: `0xbf58476d1ce4e5b9n` (well-known 64-bit mix).

Both constants are runtime-only (serialization-irrelevant) but must be stable across releases per F13.

### 3. Extend `GameState` in `packages/engine/src/kernel/types-core.ts`

Add four new fields (all `readonly`):

- `decisionStack: readonly DecisionStackFrame[]`
- `nextFrameId: DecisionFrameId` (monotonic allocator)
- `nextTurnId: TurnId` (incremented on turn retirement)
- `activeDeciderSeatId: SeatId | '__chance' | '__kernel'` (derived from top of stack; stored for serialization canonicality)

The stack is fully serialized as part of `GameState`. Two states with identical `stateHash` must have identical decision stacks.

### 4. Update `initialState`

Extend `packages/engine/src/kernel/initial-state.ts` (or wherever `initialState` is defined) to initialize the four new fields:

- `decisionStack: []` (empty at game start; the first call to `advanceAutoresolvable` pushes the opening `ActionSelectionContext`).
- `nextFrameId: 0 as DecisionFrameId`
- `nextTurnId: 0 as TurnId`
- `activeDeciderSeatId: <activePlayer seat>` initially.

### 5. Serialization canonicality

Extend `serde.ts` / schema definitions in `packages/engine/src/kernel/schemas-core.ts` to include the new fields in canonical `GameState` serialization. Ensure byte-identical round-trip preserving stack + bindings.

### 6. Barrel re-exports

Add `export * from './microturn/types.js'` and `export * from './microturn/constants.js'` to `packages/engine/src/kernel/index.ts` so downstream tickets can import cleanly.

## Files to Touch

- `packages/engine/src/kernel/microturn/types.ts` (new)
- `packages/engine/src/kernel/microturn/constants.ts` (new)
- `packages/engine/src/kernel/types-core.ts` (modify — extend `GameState`)
- `packages/engine/src/kernel/initial-state.ts` (modify — initialize new fields)
- `packages/engine/src/kernel/schemas-core.ts` (modify — add new fields to canonical serialization)
- `packages/engine/src/kernel/serde.ts` (modify if needed for round-trip)
- `packages/engine/src/kernel/index.ts` (modify — re-export)

## Out of Scope

- `publishMicroturn` / `applyDecision` / `advanceAutoresolvable` — ticket 004.
- Effect-frame suspend/resume implementation — ticket 005.
- Any simulator or agent code change.
- Retiring `MoveLog` / `applyMove` — ticket 006.
- T2 (decision stack invariants test) — attaches to this ticket's content but written in ticket 014 per spec's test-bundling decision.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` succeeds — new types compile under strict mode.
2. Existing determinism suite (`packages/engine/test/determinism/`) passes unchanged — adding empty stack fields to initial state must not change any existing replay-identity fixture (empty stack serializes to the identity element under the canonical encoding).
3. `pnpm -F @ludoforge/engine test` passes — no behavioral regressions.
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. All four new `GameState` fields are `readonly` — F11.
2. `DecisionContext` discriminated-union exhaustiveness is enforced (TypeScript compile-time).
3. `stateHash` for any existing fixture with empty-stack initialization is bit-identical before and after this ticket (may require golden-fixture update documented as "empty-stack canonicality initialization").
4. `MAX_AUTO_RESOLVE_CHAIN` and `CHANCE_RNG_MIX` are exported from `packages/engine/src/kernel/index.ts` and accessible to downstream tickets.

## Test Plan

### New/Modified Tests

None in this ticket — T2 (decision stack invariants) and T8 (stochastic auto-advance) are authored in ticket 014 per spec's explicit test-bundling. A light smoke-level type assertion file may be added to prove `DecisionContext` exhaustiveness, but the full invariant suite lives in 014.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
