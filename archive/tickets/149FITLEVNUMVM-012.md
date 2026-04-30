# 149FITLEVNUMVM-012: Feature-id table assignment from GameDef

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/policy-bytecode/feature-table.ts`
**Deps**: `archive/tickets/149FITLEVNUMVM-011.md`

## Problem

Phase 3's compiler needs a deterministic mapping from DSL refs (zone props, marker counts, global vars, player ints, token aggregates) to dense integer feature ids. This ticket lands the feature-id table builder. The compiler (ticket 013) consumes the table; the VM (ticket 015) reads via `LOAD_FEATURE <feature-id>` opcodes.

## Assumption Reassessment (2026-04-28)

1. `EncodedStateLayout` from ticket 004 already has the index-based id tables for zones/tokens/players/markers/variables. The feature-id table is one level above: it maps full DSL refs (e.g., `zone:hue.population`, `globals.monsoonFlag`) to dense ints whose decoded form references those layout indices.
2. The closure-tree evaluator (Spec 147 AOT) currently resolves refs via `CompiledAgentPolicyRef` — the type referenced by `compiled-policy-runtime.ts:CompiledPolicyRuntimeContext.resolveCompiledPolicyRef`. The feature-id table aligns with this existing resolution structure.
3. Determinism: same `GameDef` input must produce byte-identical feature-id tables across compilations (F8).
4. Post-011 review correction: ticket 011 already introduced the serializable `FeatureTable` / `FeatureRef` shape in `packages/engine/src/cnl/policy-bytecode/types.ts` so `PolicyBytecode.schema.json` can validate checked artifacts. This ticket extends that landed shape with deterministic builder and lookup helpers; it must not redefine `FeatureTable` with an incompatible `ReadonlyMap` field.

## Architecture Check

1. Feature-id assignment is fully deterministic from `GameDef` — sort by canonical string order before assigning ids. F8 preserved.
2. Generic over the layout — no FITL-specific feature names. F1 preserved.
3. The table is a derived artifact, not authored. F7 preserved.
4. No backwards-compatibility shims (F14).

## What to Change

### 1. `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (new)

Export:
- Use the existing `FeatureTable` / `FeatureRef` exports from `types.ts` as the serialized artifact shape:
  ```ts
  interface FeatureTable {
    refs: readonly FeatureRef[];              // index → ref descriptor
    refToId: Readonly<Record<string, number>>; // canonical-key → feature-id
  }
  interface FeatureRef {
    kind: 'zoneProp' | 'globalVar' | 'playerInt' | 'markerCount' | 'tokenAgg' | /* etc */;
    layoutIndex: number;  // index into EncodedStateLayout's relevant id table
    aux: number[];        // additional encoding (e.g., owner index, prop index)
  }
  ```
- `function buildFeatureTable(def: GameDef, layout: EncodedStateLayout): FeatureTable` — pure deterministic function.
- `function canonicalKey(ref: FeatureRef): string` — stable string serialization for sort + map keys.
- Optional runtime lookup helpers may wrap `refToId` in a local `Map` for execution efficiency, but the exported artifact remains the serializable record shape from ticket 011.

### 2. Coverage of all `CompiledPolicyExpr` variants

The feature table must cover every kind of leaf reference that can appear in `AgentPolicyExpr` / `CompiledPolicyExpr`:
- `zoneTokenAgg` — `(zoneScope, owner, op)` triples → feature id.
- `globalTokenAgg` — `(owner, op)` → feature id.
- `globalZoneAgg` — `(zoneSource, op)` → feature id.
- `adjacentTokenAgg` — `(zoneScope, owner, op)` → feature id.
- `seatAgg` — `(over, aggOp, innerExpr)` → may decompose, since `innerExpr` is a closure; coordinate with ticket 013.
- `compiledRef` — direct ref → feature id.

Document any variants that cannot be statically resolved (require `RESOLVE_DYNAMIC` opcode at runtime per spec §5 edge case).

### 3. Type tests for table coverage

Add a unit test verifying that `buildFeatureTable` against the FITL GameDef produces a table covering every distinct ref appearing in the FITL profile YAML (us-baseline, arvn-baseline, nva-baseline, vc-baseline).

### 4. Determinism test

Build the feature table twice on the same GameDef; assert byte-identical output (`refs` order and `refToId` object key order canonical).

## Files to Touch

- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (new)
- `packages/engine/src/cnl/policy-bytecode/index.ts` (modify — extend barrel)
- `packages/engine/test/unit/cnl/policy-bytecode-feature-table.test.ts` (new)

## Out of Scope

- The compiler that consumes the feature table (ticket 013).
- The VM that reads via `LOAD_FEATURE` opcodes (ticket 015).
- Round-trip equivalence (ticket 014).
- Wiring into preview drive (already done conceptually in ticket 006; the bytecode VM reuses the encoded view).

## Acceptance Criteria

### Tests That Must Pass

1. New test: feature table covers every distinct ref in all 4 FITL baseline profiles.
2. New test: `buildFeatureTable` is deterministic across two invocations.
3. New test: works on Texas Hold'em GameDef (game-agnostic check).
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific ref names hardcoded.
2. Integer-only feature ids.
3. F1, F6, F7, F8 preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/policy-bytecode-feature-table.test.ts` — coverage, determinism, both games.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/policy-bytecode-feature-table.test.js`.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.

## Outcome (2026-04-30)

Completed the Phase 3 feature-id table slice:

- Added `packages/engine/src/cnl/policy-bytecode/feature-table.ts` with deterministic `buildFeatureTable(def, layout)`, stable `canonicalKey(ref)`, `getFeatureId(...)`, and compiled-policy expression feature-ref collection helpers.
- Extended `packages/engine/src/cnl/policy-bytecode/index.ts` so the feature-table helpers are exported through the existing policy-bytecode barrel.
- Added `packages/engine/test/unit/cnl/policy-bytecode-feature-table.test.ts` covering deterministic dense id assignment, FITL baseline profile feature-ref coverage, and Texas Hold'em game-agnostic coverage.

Ticket corrections applied:

- The landed `FeatureTable` / `FeatureRef` artifact shape from ticket 011 remains authoritative. This ticket does not redefine it or add schema fields.
- Static feature refs are assigned from the compiled production policy catalog and the `EncodedStateLayout` index tables. Runtime-dependent refs that cannot be decoded from the Phase 1 layout alone are represented as deterministic `dynamicRef`, `dynamicSurface`, or `dynamicExpr` feature refs so ticket 013 can lower them to `RESOLVE_DYNAMIC` or eliminate them when the bytecode compiler owns that decision.

Verification set:

- PASS — `pnpm -F @ludoforge/engine build`
- PASS — `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/policy-bytecode-feature-table.test.js`
- PASS — `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/policy-bytecode-types.test.js`
- PASS — `pnpm turbo build`
- PASS — `pnpm turbo lint`
- PASS — `pnpm turbo typecheck`
- PASS — `pnpm -F @ludoforge/engine test`

Post-investigation harness correction:

- The earlier default-lane timeout was not caused by `dist/test/unit/zobrist-table.test.js`; that was only the reporter's last unit-file label from the previous batched child process.
- `dist/test/integration/agents/drive-fingerprint-property.test.js` is a slow FITL drive witness, so the lane manifest now classifies it into `integration:slow-parity` / `integration:slow-parity-shard-b` and keeps it out of `default`, `integration:core`, and `integration:game-packages`.
- The default runner lane now executes sequentially with a per-child timeout, so future long or stuck files are attributed to the exact test file instead of the last TAP event from a large batch.
- A second slow default-lane witness was `dist/test/integration/sim/snapshot-serialization.test.js`. Its FITL golden only inspects the first decision snapshot, so the test now uses seeded choice agents and one turn instead of a ten-turn `PolicyAgent` simulation.

Additional verification:

- PASS — `pnpm -F @ludoforge/engine exec node --test dist/test/unit/run-tests-script.test.js`
- PASS — `pnpm -F @ludoforge/engine exec node --test dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js`
- PASS — `timeout 90s pnpm -F @ludoforge/engine exec node --test dist/test/integration/sim/snapshot-serialization.test.js`

Deferred sibling scope: bytecode compiler consumption and concrete dynamic-resolution policy remain in `149FITLEVNUMVM-013`; round-trip equivalence remains in `149FITLEVNUMVM-014`; VM `LOAD_FEATURE` execution remains in `149FITLEVNUMVM-015`.
