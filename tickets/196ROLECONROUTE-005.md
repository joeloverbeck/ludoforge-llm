# 196ROLECONROUTE-005: P4B — Generic control-preservation constraint semantics for FITL ARVN Transport

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler/runtime role-constraint semantics for generic authored set/predicate or post-state control preservation, plus FITL profile migration and witnesses
**Deps**: `tickets/196ROLECONROUTE-004.md`

## Problem

`196ROLECONROUTE-004` was narrowed after a Foundations reassessment on 2026-05-26. The original P4 draft tried to express "ARVN Transport origin must preserve population control" with `locatedIn: { role: role.transportOrigin, container: zone.arvnControlledPopulationCenter }`, but the live `locatedIn` contract only compares a role binding's current zone to a literal zone id or another role binding's zone. `zone.arvnControlledPopulationCenter` would be a fake zone id, and a guardrail demote cannot truthfully stand in for admissibility.

This ticket adds the missing generic constraint semantics needed to express origin-control preservation without game-specific engine logic, then migrates the FITL ARVN Transport template so origin-control-losing bindings are rejected by role-constraint admissibility rather than merely demoted by `arvn.doNotLoseOriginControlByTransport`.

## Assumption Reassessment (2026-05-26)

1. `packages/engine/src/agents/plan-role-constraint-eval.ts` currently supports `locatedIn`, `distinctOriginDestination`, `reachable`, and `adjacent`; `locatedIn` only supports literal zone ids and role-bound zones.
2. `data/games/fire-in-the-lake/92-agents.md` has `arvn.transportOrigin`, `arvn.transportDestination`, and the `arvn.doNotLoseOriginControlByTransport` guardrail. The guardrail is policy scoring, not role-binding admissibility.
3. FITL control preservation is state-dependent and may be post-move rather than a static membership test. The compiler must validate everything knowable from authored data, while the runtime evaluates the concrete state-dependent predicate (Foundation #12).
4. No game-specific engine kind such as `arvnControlledPopulationCenter` may be added. FITL-specific labels can appear only as authored data/profile strings interpreted by generic engine semantics (Foundation #1).

## Architecture Check

1. **Generic semantic surface**: The new constraint must be phrased in generic terms such as authored zone-set membership, generic control owner comparison, or a bounded post-state predicate reference. It must not introduce ARVN/FITL-specific branches into compiler or runtime code.
2. **Compiler/kernel boundary**: The compiler validates referenced roles, zone sets, route classes, predicate ids, payload shape, and boundedness. Runtime evaluates only concrete state-dependent truth that cannot be known statically.
3. **No compatibility shim**: Do not keep the invalid `zone.arvnControlledPopulationCenter` shape as an alias. Either reject it fail-closed or replace it everywhere in the same change.
4. **Single rules protocol**: The constraint must filter role bindings before scoring so rejected bindings never reach plan scoring as legal-but-demoted candidates.

## What to Change

### 1. Design the generic constraint shape

Choose and implement one generic shape that can truthfully express FITL origin-control preservation. Acceptable directions include:

- a generic authored zone-set/predicate constraint, if current-state membership is sufficient after reassessment;
- a generic bounded post-state control-preservation constraint, if the invariant must be evaluated after applying the candidate Transport binding;
- another Foundation-compliant generic shape that keeps FITL labels in authored data and keeps engine behavior game-agnostic.

Record the chosen shape in this ticket before source edits continue if live reassessment changes the examples below.

### 2. Compiler and runtime support

Extend the same surfaces used by tickets 001-003:

- `packages/engine/src/kernel/plan-role-constraints.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/src/cnl/game-spec-doc.ts`
- `packages/engine/src/cnl/validate-agent-plan-templates.ts`
- `packages/engine/src/cnl/compile-agent-plan-templates.ts`
- `packages/engine/src/agents/plan-role-constraint-eval.ts`

Add focused unit tests for valid lowering, invalid shape/reference diagnostics, and runtime admit/reject behavior.

### 3. FITL ARVN Transport migration

Update `data/games/fire-in-the-lake/92-agents.md` so ARVN Transport origin-control preservation is expressed through the new generic constraint. Keep `arvn.doNotLoseOriginControlByTransport` only as projected-margin posture scoring after admissibility owns the legality predicate.

### 4. Witness tests

Add or extend FITL integration/policy witnesses to prove:

- an origin-control-losing Transport binding is rejected by role-constraint admissibility;
- the same binding is not merely legal-but-demoted by guardrail scoring;
- legal Transport bindings that preserve origin control still admit and execute;
- deterministic replay remains byte-identical.

## Files to Touch

- `packages/engine/src/kernel/plan-role-constraints.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify)
- `packages/engine/src/cnl/compile-agent-plan-templates.ts` (modify)
- `packages/engine/src/agents/plan-role-constraint-eval.ts` (modify)
- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/unit/cnl/<focused-constraint-validation-test>.test.ts` (new or modify)
- `packages/engine/test/unit/agents/<focused-constraint-runtime-test>.test.ts` (new or modify)
- `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (modify or extend)

## Out of Scope

- NVA route logistics and VC underground positioning migrations.
- Weighted route costs or shortest-path scoring.
- Game-specific engine branches or per-game schema files.
- Reworking `routePairs` selector identity beyond what `196ROLECONROUTE-004` already owns.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler rejects invalid or unresolved authored control/predicate constraint references with template/role-named diagnostics.
2. Runtime rejects a role binding that violates the generic control/predicate constraint and admits one that satisfies it.
3. FITL ARVN Transport origin-control-losing bindings are rejected by constraint admissibility, not merely demoted by `arvn.doNotLoseOriginControlByTransport`.
4. Legal FITL ARVN Transport bindings that preserve origin control remain admitted and executable.
5. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific identifier or branch enters engine/compiler code.
2. The invalid fake-zone shape `zone.arvnControlledPopulationCenter` is not accepted as a compatibility alias.
3. State-dependent control semantics are evaluated deterministically and boundedly.
4. Guardrail scoring remains advisory; admissibility owns the legal role-binding predicate.

## Test Plan

### New/Modified Tests

1. Focused CNL validation/lowering tests for the chosen generic constraint shape.
2. Focused runtime tests for admit/reject behavior.
3. FITL integration/policy witness for ARVN Transport origin-control preservation.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <focused dist test paths>`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
