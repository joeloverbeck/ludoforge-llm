# 154POLBCDISP-002: Promote FeatureRef.kind into a typed registry + add enumeration completeness test (D4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/policy-bytecode/types.ts`, `packages/engine/test/unit/agents/`
**Deps**: `archive/tickets/154POLBCDISP-001.md`

## Problem

Today, `FeatureRef.kind` is typed as plain `string` (`packages/engine/src/cnl/policy-bytecode/types.ts:78-82`):

```ts
export interface FeatureRef {
  readonly kind: string;
  readonly layoutIndex: number;
  readonly aux: readonly number[];
}
```

This is the structural-typing root cause that allowed Spec 149's silent dispatch gap to land in the first place: there is no compile-time surface anywhere that the emitter (`featureRefForCompiledPolicyRef` in `packages/engine/src/cnl/policy-bytecode/feature-table.ts:187`), the VM core (`resolveBuiltInFeature` in `packages/engine/src/agents/policy-vm/vm.ts:181`), and the JS fallback (`resolveVmFallbackFeature` in `packages/engine/src/agents/policy-evaluation-core.ts:674`) share. The three sides evolve independently, each responsible for its own switch on the open `string` field.

`archive/tickets/154POLBCDISP-001.md` closes the runtime gap (silent → audible → caught), but the architectural surface remains open: a future emitter change can introduce a new kind without forcing the evaluator sides to update. This ticket promotes the dispatch contract into a typed registry and adds the architectural-invariant test that proves emitter and evaluator stay aligned.

## Assumption Reassessment (2026-05-04)

1. `featureRefForCompiledPolicyRef` (`packages/engine/src/cnl/policy-bytecode/feature-table.ts:187-291`) currently produces 18 distinct `kind` values: `globalVar`, `playerInt`, `globalMarker`, `zoneProp`, `zoneTokenAgg`, `globalTokenAgg`, `globalZoneAgg`, `candidateIntrinsic`, `candidateParam`, `candidateTag`, `candidateTags`, `candidateFeature`, `stateFeature`, `candidateAggregate`, `adjacentTokenAgg`, `seatAgg`, `dynamicRef`, `dynamicSurface`, `dynamicExpr`. Verified via the structural Explore agent in the reassess-spec session.
2. `featureRefForCompiledPolicyRef` is module-internal (no `export` keyword on line 187), but the test reaches `FeatureRef` instances via `evaluateCompiledExprWithVm` against constructed `CompiledPolicyExpr` envelopes — direct introspection of the emitter is not needed. The registry in `types.ts` provides the compile-time surface.
3. The 18-kind list is exact: `library:previewStateFeature` refs are accepted by `findLibraryRef`'s type signature (`policy-evaluation-core.ts:795-806`) but `featureRefForCompiledPolicyRef` does not emit `previewStateFeature` — those library refs fall through to line 249's catch-all and emit `dynamicRef` instead. So `previewStateFeature` is correctly NOT in `FEATURE_REF_KINDS`.
4. `archive/tickets/154POLBCDISP-001.md` lands the safety-net try/catch before this ticket — the test can rely on `evaluateCompiledExprWithVm` either returning a typed `PolicyValue` or, for legitimately-unsupported kinds, throwing `PolicyBytecodeVmUnsupportedError` (which the test catches and treats as "fallback handles this kind correctly").
5. Test directory convention: agents unit tests live at `packages/engine/test/unit/agents/` (24 sibling test files confirmed there).

## Architecture Check

1. Foundation 16 (Testing as Proof): the original Spec 149 silent gap was caught only by downstream canaries (`drive-fingerprint-property` `captures.length > 0`, `spec-140-compound-turn-overhead` budget). A direct enumeration test promotes the dispatch contract from a hand-maintained convention to a proven invariant. Future emitter additions force a corresponding registry update, which forces a corresponding test fixture, which surfaces the need for an evaluator handler before the change can land.
2. Foundation 15 (Architectural Completeness): the typed registry closes the structural-typing root cause from the same architectural commitment that motivated `archive/tickets/154POLBCDISP-001.md`. The two tickets together replace "convention plus runtime safety net" with "compile-time gate plus runtime safety net" — the registry catches new kinds at type-check time; the safety net catches them at runtime if anything still slips through.
3. Engine-agnostic: types and dispatch infrastructure for the policy bytecode evaluator are part of the universal interpreter. No game-specific identifiers in either `types.ts` or the new test.
4. Foundation 14 compliance: the type narrowing from `string` to `FeatureRefKind` is an in-place change with no shim, no alias, no `_legacy` suffix. Existing call sites compile against the narrower type without modification because they only ever assign string literals matching the registry.

## What to Change

### 1. Introduce `FEATURE_REF_KINDS` const-array and `FeatureRefKind` union

In `packages/engine/src/cnl/policy-bytecode/types.ts`, replace the existing `FeatureRef` interface (lines 78-82) with:

```ts
export const FEATURE_REF_KINDS = [
  'globalVar', 'playerInt', 'globalMarker',
  'zoneProp', 'zoneTokenAgg', 'globalTokenAgg', 'globalZoneAgg',
  'candidateIntrinsic', 'candidateParam', 'candidateTag', 'candidateTags',
  'candidateFeature', 'stateFeature', 'candidateAggregate',
  'adjacentTokenAgg', 'seatAgg',
  'dynamicRef', 'dynamicSurface', 'dynamicExpr',
] as const;

export type FeatureRefKind = (typeof FEATURE_REF_KINDS)[number];

export interface FeatureRef {
  readonly kind: FeatureRefKind;
  readonly layoutIndex: number;
  readonly aux: readonly number[];
}
```

The const-array preserves runtime identity (the test imports it to drive its enumeration loop); the type alias provides the compile-time narrowing surface. `featureRefForCompiledPolicyRef` should compile against the narrowed type without source changes — every `kind:` assignment in `feature-table.ts` is a string-literal that already narrows to `FeatureRefKind`. If any consumer fails to type-check after the narrowing, that's the registry doing its job — fix the consumer (or extend `FEATURE_REF_KINDS` if the failing site emits a legitimate new kind), do not loosen the type back to `string`.

### 2. Add `policy-bytecode-fallback-completeness.test.ts`

Create `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts`. The file must declare its test class on the first non-comment line:

```ts
// @test-class: architectural-invariant
```

Test structure:

1. Import `FEATURE_REF_KINDS` and `FeatureRefKind` from `packages/engine/src/cnl/policy-bytecode/types.ts` (or its barrel re-export at `packages/engine/src/cnl/policy-bytecode/index.ts`).
2. Declare `const KINDS_PRODUCED_BY_EMITTER = [...FEATURE_REF_KINDS] as const;` and add a `KINDS_PRODUCED_BY_EMITTER satisfies readonly FeatureRefKind[];` clause. Type-level cross-check: if `FEATURE_REF_KINDS` gains a new member, this enumeration must be extended in lock-step.
3. For each kind, construct a minimal fixture:
   - A `GameDef` with 1-2 zones, 2-4 tokens, 2-3 player vars, 1 marker — just enough for the kind under test to find layout indices.
   - A `CompiledAgentPolicyRef` (or a `CompiledPolicyExpr` envelope) that, when emitted by `featureRefForCompiledPolicyRef`, produces the target `FeatureRef.kind`. Construct IR directly — bypass the YAML compiler so the test is hermetic.
   - A minimal `PolicyEvaluationContext` (instantiate via the existing constructor pattern used by `policy-bytecode-equivalence.test.ts`) holding the `GameDef`, encoded state, and a candidate where applicable.
4. Per kind, call `evaluateCompiledExprWithVm` (or its public alias `evaluateCompiledExpr`) and assert:
   - The result is a typed `PolicyValue` (number / string / boolean / array — NOT bare `undefined`), OR
   - The call throws `PolicyBytecodeVmUnsupportedError`. Catch the throw and treat it as "the safety net from `archive/tickets/154POLBCDISP-001.md` will dispatch to the direct evaluator in production" — this is the documented escape hatch for kinds the VM can't satisfy. The test does not need to verify the catch's downstream value here; that's covered by the existing equivalence test and by the integration tests that exercised the original silent gap.
5. Negative assertion: at no point does any kind silently return `undefined` from `evaluateCompiledExprWithVm`.

The test serves three purposes documented in spec D4b: gate against the original bug recurring; gate against new emitter kinds without evaluator coverage; document the contract.

## Files to Touch

- `packages/engine/src/cnl/policy-bytecode/types.ts` (modify)
- `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (new)

## Out of Scope

- Per-kind semantic correctness (assertion against specific values). Covered by `policy-bytecode-equivalence.test.ts` and downstream integration tests.
- Any change to `featureRefForCompiledPolicyRef` (`feature-table.ts:187`) — the existing emitted shapes are correct; only the type the field is declared with changes.
- The D3 explicit-handler delete-vs-keep decision (`tickets/154POLBCDISP-003.md`).
- Exporting `featureRefForCompiledPolicyRef` from the module — the test does not need direct access; the registry-driven enumeration is sufficient.
- Native VM handlers for `candidateFeature` / `stateFeature` / `candidateAggregate` (rejected in spec Brainstorm Context — wrong layer).

## Acceptance Criteria

### Tests That Must Pass

1. New `policy-bytecode-fallback-completeness.test.ts` runs in `pnpm -F @ludoforge/engine test:unit` and passes for every kind in `FEATURE_REF_KINDS`.
2. The `KINDS_PRODUCED_BY_EMITTER satisfies readonly FeatureRefKind[]` clause type-checks.
3. The test file declares `// @test-class: architectural-invariant` per `.claude/rules/testing.md`.
4. `pnpm -F @ludoforge/engine typecheck` passes — narrowing `FeatureRef.kind` to `FeatureRefKind` does not break any existing consumer (emitter, VM core, JS fallback).
5. Existing engine test suite passes: `pnpm -F @ludoforge/engine test` — including `policy-bytecode-equivalence.test.ts` and the integration / performance lanes that originally caught the silent gap.

### Invariants

1. **Dispatch contract is type-checked**: any future emitter change that adds a `kind:` not present in `FEATURE_REF_KINDS` fails to type-check at the construction site.
2. **Test enumeration cannot silently drift**: any future addition to `FEATURE_REF_KINDS` that is not paired with an addition to `KINDS_PRODUCED_BY_EMITTER` fails the satisfies-clause at compile time.
3. **No silent `undefined` from `evaluateCompiledExprWithVm`**: every kind in the registry either returns a typed `PolicyValue` or throws `PolicyBytecodeVmUnsupportedError` (which the safety net from `archive/tickets/154POLBCDISP-001.md` catches).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (new) — architectural-invariant test enumerating every emitter-produced `FeatureRef.kind` and asserting it resolves through `evaluateCompiledExprWithVm` without silent `undefined`.

### Commands

1. `pnpm -F @ludoforge/engine build` — confirm typecheck of the narrowed `FeatureRef.kind`.
2. `pnpm -F @ludoforge/engine test:unit` — confirm the new test passes.
3. `pnpm -F @ludoforge/engine test` — full engine suite to confirm no regression.
4. `pnpm turbo typecheck` — repo-wide typecheck (catches any consumer that breaks under the narrower type).
5. `pnpm turbo lint` — confirm no lint regression.
