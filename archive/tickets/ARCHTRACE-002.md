# ARCHTRACE-002: Add Provenance Metadata To Effect Trace Entries

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — trace contract extension
**Deps**: ARCHTRACE-001

## Reassessed Assumptions (Code/Test Reality Check)

Validated against current `src/kernel` and `test/`:

1. Provenance metadata is not present today in runtime types, zod schemas, or JSON schema artifacts.
2. Effect tracing is emitted from multiple runtime seams:
- action effect execution (`applyMove` -> `applyEffects`)
- trigger execution/cascades (`dispatchTriggers` -> `applyEffects`)
- lifecycle dispatch (`dispatchLifecycleEvent`)
- auto-advance loops (`advanceToDecisionPoint`/`advancePhase`)
3. The current trace model has a gap: `EffectTraceCreateToken` exists in types/schema but no runtime emission currently occurs from `applyCreateToken`.
4. Several declared trace variants are effectively dormant (`queryResult`, `conditional` are typed but not emitted).
5. Existing tests assert category-level lifecycle trace presence/parity, but do not validate execution provenance fields.
6. `ARCHTRACE-001` is completed and archived (`archive/tickets/ARCHTRACE-001.md`), so this ticket should treat the dependency as satisfied.

## What Needs To Change / Be Implemented

Extend generic effect-trace entries with execution provenance so consumers do not rely on heuristics.

Required implementation:
1. Add a game-agnostic provenance object to `EffectTraceEntry` schema/types with:
- `phase`: current phase id string at emission time.
- `eventContext`: execution context enum, minimum:
  - `actionCost`
  - `actionEffect`
  - `lifecycleEffect`
  - `triggerEffect`
  - `lifecycleEvent` (for lifecycle marker entries)
- optional `actionId` when the source context is action-scoped.
- `effectPath`: deterministic effect index path string (e.g. `cost[0]`, `stage[1].forEach.effects[0]`, `trigger:onFoo.effects[2]`).
2. Thread provenance context through all effect execution entry points without game-specific branches:
- action cost and resolution stages
- lifecycle onEnter/onExit effect execution
- trigger execution and trigger cascades
- auto-advance induced lifecycle/trigger execution
3. Ensure provenance is always emitted for trace entries that come from effect/lifecycle execution in the runtime paths above.
4. Keep compiler/runtime logic generic; no game-specific trace semantics.
5. Update shared zod schemas and regenerate `schemas/Trace.schema.json` + `schemas/EvalReport.schema.json`.
6. Fix the existing `createToken` tracing gap while implementing provenance so all currently active effect traces consistently carry provenance.

## Architectural Direction

Preferred architecture for long-term extensibility:
1. Centralized provenance attachment via execution context plumbing (`EffectContext` + collector helpers), not per-effect bespoke mutation logic.
2. Deterministic path generation at effect interpreter boundaries (`applyEffects` recursion), not ad-hoc string building inside individual effect handlers.
3. Uniform provenance contract across action/lifecycle/trigger/auto-advance flows, so downstream tooling can use a single parser.

This is more beneficial than the current architecture because it removes inference heuristics from consumers and avoids per-callsite trace shape drift.

## Invariants That Should Pass

1. Every trace entry can be attributed to an execution context without test-side inference.
2. Provenance fields are stable and deterministic across identical replays.
3. Provenance model remains game-agnostic and does not encode game-specific semantics.
4. Existing runtime behavior is unchanged apart from richer telemetry.
5. `createToken` trace entries are emitted and include provenance.

## Tests That Should Pass

1. Unit test: trace entries from action effects include provenance with `actionId`.
2. Unit test: trace entries from lifecycle/trigger paths include provenance with correct `eventContext`.
3. Unit test: provenance values are deterministic for repeated seed/move replay.
4. Unit test: `createToken` trace entry exists and includes provenance.
5. Schema sync test: artifacts are regenerated and in sync.
6. Existing JSON schema validation tests continue to pass with the extended trace contract.
5. Regression: existing unit/integration suites pass.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
1. Added a shared provenance contract to effect trace entries (`phase`, `eventContext`, optional `actionId`, `effectPath`) in kernel types and zod schemas.
2. Threaded provenance context through action cost/effects, trigger execution/cascades, lifecycle effects/events, and event-card effect execution.
3. Added deterministic effect-path propagation through nested effect interpreter recursion.
4. Fixed missing runtime `createToken` trace emission and attached provenance to it.
5. Regenerated `schemas/Trace.schema.json` and `schemas/EvalReport.schema.json` from updated schema definitions.
6. Added/updated unit tests for provenance attachment, determinism, and control-flow trace builders.
- Deviations from original plan:
1. Added a safe fallback provenance context for direct `applyEffects` trace callers that do not explicitly provide trace context, to avoid widespread unrelated test/runtime breakage while preserving deterministic provenance fields.
- Verification results:
1. `npm run lint` passed.
2. `npm test` passed (unit + integration + schema artifact check).
