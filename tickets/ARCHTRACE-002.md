# ARCHTRACE-002: Add Provenance Metadata To Effect Trace Entries

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — trace contract extension
**Deps**: ARCHTRACE-001

## What Needs To Change / Be Implemented

Extend generic effect-trace entries with execution provenance so consumers do not rely on heuristics.

Required implementation:
1. Add provenance fields to trace schema/types (game-agnostic), including at minimum:
- `phase` (current phase)
- `eventContext` (e.g., action execution vs lifecycle event vs trigger cascade)
- optional `actionId` when applicable
- `effectPath` (stable path/index within expanded effects)
2. Populate provenance in all effect execution entry points:
- action cost/stages
- lifecycle phase enter/exit effects
- trigger effects
- auto-advance induced effects
3. Keep provenance optional only where truly not derivable; otherwise always emit.
4. Update `schemas/Trace.schema.json` and `schemas/EvalReport.schema.json`.

## Invariants That Should Pass

1. Every trace entry can be attributed to an execution context without test-side inference.
2. Provenance fields are stable and deterministic across identical replays.
3. Provenance model remains game-agnostic and does not encode game-specific semantics.
4. Existing runtime behavior is unchanged apart from richer telemetry.

## Tests That Should Pass

1. Unit test: trace entries from action effects include provenance with `actionId`.
2. Unit test: trace entries from lifecycle/trigger paths include provenance with correct `eventContext`.
3. Unit test: provenance values are deterministic for repeated seed/move replay.
4. Schema sync test: artifacts are regenerated and in sync.
5. Regression: existing unit/integration suites pass.
