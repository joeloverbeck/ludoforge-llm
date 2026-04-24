# 144PROBEREC-005: Determinism replay-identity proof + Trace.schema.json update

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `Trace.schema.json` extension + new determinism test
**Deps**: `tickets/144PROBEREC-002.md`

## Problem

The rollback safety net introduced in ticket 002 adds a new trace surface (`ProbeHoleRecoveryLog`, `GameTrace.probeHoleRecoveries`, `GameTrace.recoveredFromProbeHole`). Foundation #13 (Artifact Identity) requires a JSON Schema entry for every trace payload, and Foundation #8 (Determinism) requires a replay-identity test proving that traces containing recovery events replay byte-identically across two independent `runGame` invocations.

This ticket closes both loops: it extends the schema artifact and adds the determinism test.

## Assumption Reassessment (2026-04-24)

1. `packages/engine/schemas/Trace.schema.json` exists (13,802 lines per reassessment). `DecisionLog`'s schema entry (at `DecisionLogSchema`) is the canonical location; the new `ProbeHoleRecoveryLog` sits alongside it, not inside the `DecisionLog` schema (because recoveries are NOT DecisionLog variants per ticket 002).
2. The `GameTrace` schema entry defines fields mirroring `types-core.ts:1707-1717`. It needs the two new non-optional fields added.
3. `pnpm turbo schema:artifacts` is the regen command per `CLAUDE.md`. Any manual edit that diverges from the TypeScript types is caught by this step.
4. `packages/engine/test/determinism/` currently contains 11 tests (per reassessment). This ticket adds one more, following the existing style (seed + replay + byte-identical assertion).

## Architecture Check

1. Schema is authoritative for on-wire trace payloads — keeping it in sync with `types-core.ts` is a hard F#13 requirement.
2. `ProbeHoleRecoveryLog` is a **sibling** of `DecisionLog`, not a union member. The schema mirrors the TypeScript structure exactly: a standalone `$defs` entry referenced from `GameTrace.properties.probeHoleRecoveries.items`.
3. The replay-identity test is `@test-class: architectural-invariant`: any legitimate trace (including those with recovery events) must replay to bit-identical state. The test uses the synthetic GameDef from ticket 002's `fitl-probe-hole-rollback-safety-net.test.ts` (where rollback is guaranteed to fire) so it does not depend on FITL-specific fixtures.
4. No additional kernel or simulator change needed — the replay-identity guarantee is already enforced by ticket 002's pure `rollbackToActionSelection`. This ticket proves it.

## What to Change

### 1. Extend `packages/engine/schemas/Trace.schema.json`

Add a new `$defs.ProbeHoleRecoveryLog` entry:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["kind", "stateHashBefore", "stateHashAfter", "seatId", "turnId", "blacklistedActionId", "rolledBackFrames", "reason"],
  "properties": {
    "kind": { "type": "string", "const": "probeHoleRecovery" },
    "stateHashBefore": { "type": "string", "pattern": "^-?[0-9]+n?$" },
    "stateHashAfter": { "type": "string", "pattern": "^-?[0-9]+n?$" },
    "seatId": { "type": "string" },
    "turnId": { "type": "string" },
    "blacklistedActionId": { "type": "string" },
    "rolledBackFrames": { "type": "integer", "minimum": 0 },
    "reason": { "type": "string" }
  }
}
```

(BigInt fields follow the existing canonical string encoding used elsewhere in the schema; align with how `stateHash` is serialized on `DecisionLog` — consult the current entry and match the pattern exactly.)

Extend the `GameTrace` schema entry to include:
```json
"probeHoleRecoveries": {
  "type": "array",
  "items": { "$ref": "#/$defs/ProbeHoleRecoveryLog" }
},
"recoveredFromProbeHole": {
  "type": "integer",
  "minimum": 0
}
```
Both as required entries in the `GameTrace` schema's `required` array.

Run `pnpm turbo schema:artifacts` to validate the schema round-trips with the TypeScript types. Fix any drift before merging.

### 2. Determinism replay-identity test

`packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` (`@test-class: architectural-invariant`):

- Use the synthetic GameDef from ticket 002 (crafted to force rollback at depth 4). Run it under two independent `runGame` invocations with identical seed/agents/options.
- Assert:
  - `trace1.finalState.stateHash === trace2.finalState.stateHash` (canonical F#8 replay-identity).
  - `trace1.decisions.length === trace2.decisions.length`
  - `trace1.probeHoleRecoveries.length === trace2.probeHoleRecoveries.length`
  - For each `i`, `trace1.probeHoleRecoveries[i].stateHashBefore === trace2.probeHoleRecoveries[i].stateHashBefore` and same for `stateHashAfter` — the state before and after recovery is deterministic.
- Additional sub-assertion: serialize each trace to JSON via the canonical serializer and assert byte-identical strings (the ultimate F#8 proof).

### 3. Ajv schema validation test

If not already covered by existing `schemas-top-level.test.ts` after ticket 002's fixture migration: ensure `validGameTrace` round-trips through the extended schema. The test imports the JSON schema and validates a trace literal containing a `probeHoleRecoveries: [ProbeHoleRecoveryLog]` entry.

## Files to Touch

- `packages/engine/schemas/Trace.schema.json` (modify — add `ProbeHoleRecoveryLog` `$defs` entry + extend `GameTrace`)
- `packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` (new)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify if needed — extend the `validGameTrace` fixture to include a recovery event and confirm schema validation passes)

## Out of Scope

- Deep probe / LRU / cache — ticket 001.
- Rollback / `ProbeHoleRecoveryLog` type / `GameTrace` migration / blacklist — ticket 002.
- Seed-1001 fixture / F#18 amendment / convergence-witness re-bless — ticket 003.
- `SimulationOptions.decisionHook` / diagnostic harness rewire — ticket 004.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo schema:artifacts` — schema round-trips with TypeScript types; no drift.
2. `pnpm -F @ludoforge/engine test packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` — replay-identity holds for traces containing recovery events.
3. `pnpm -F @ludoforge/engine test packages/engine/test/unit/schemas-top-level.test.ts` — `GameTrace` schema validates correctly with recovery events.
4. Existing engine suite: `pnpm turbo test`.

### Invariants

1. `Trace.schema.json` is a structural mirror of TypeScript types (F#13). Post-merge, `pnpm turbo schema:artifacts` returns clean.
2. `trace1.finalState.stateHash === trace2.finalState.stateHash` for any two independent `runGame(def, seed, agents, ...)` invocations — even when rollback fires (F#8).
3. Each `ProbeHoleRecoveryLog` entry is a pure function of the state at the failure point; its `stateHashBefore`/`stateHashAfter` are deterministic (enforced by test).
4. `GameTrace.probeHoleRecoveries` serializes canonically — byte-identical JSON output across two independent runs (final sub-assertion).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` — replay identity on synthetic GameDef with forced rollback (`@test-class: architectural-invariant`).
2. Schema-test touchup as needed in `schemas-top-level.test.ts`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo schema:artifacts`
3. `pnpm -F @ludoforge/engine test packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm turbo test`
