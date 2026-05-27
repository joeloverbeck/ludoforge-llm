# 200PLNPRPTRC-003: Phase 3 — Promote `PolicyPlanMicroturnTrace.fallbackReason` to discriminated union; re-bless three golden traces

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-plan-trace.ts` (microturn trace type); `packages/engine/src/agents/plan-controller.ts` (emission migration)
**Deps**: `archive/tickets/200PLNPRPTRC-001.md`

## Problem

`PolicyPlanMicroturnTrace.fallbackReason` is currently typed as `string | undefined` (free-form). When the plan controller falls back through `exact → reselected → primitiveConsiderationPolicy → stableFrontierTieBreak`, the reason flows through `microturnTraceFor` (signature at `plan-controller.ts:180–192`) as an opaque string. This blocks any architectural invariant that the union of fallback reasons is closed — a typo'd or new reason cannot be caught at compile time.

Spec 200 §4.5 promotes the field to a discriminated union mirroring Foundation #20's preview-ref vocabulary, with seven explicit cases (four existing + three new for observer-scope-driven fallbacks that today fold into `'primitiveConsiderationPolicyFallback'`). Per Foundation #14, no string-form compatibility shim is added; all internal emission sites migrate in the same change, and the three affected golden traces are re-blessed in the same commit.

## Assumption Reassessment (2026-05-27)

1. `PolicyPlanMicroturnTrace` is at `types-plan-trace.ts:63–70` with `readonly fallbackReason?: string`. Verified.
2. `plan-controller.ts` produces microturn trace records via the `microturnTraceFor` helper:
   - Signature: `function microturnTraceFor(..., match, ..., reason, fallbackReason?)` at lines ~180–192
   - Fallback emission sites at lines 66 and 73 (primitive considered fallback + stable frontier fallback)
   - Exact/reselected sites at lines 47–50 and 53–60 (no fallbackReason on the happy paths)
3. The four existing canonical reasons emitted by the controller correspond to the spec's `noExactRoleValueMatch`, `reselectedWithinRole`, `primitiveConsiderationPolicyFallback`, `stableFrontierTieBreakFallback`. Verify the literal string vocabulary at implementation time by reading the `reason` variables passed at lines 66 and 73.
4. Three new cases (`hiddenStatePrecludedMatch`, `partialObserverScope`, `depthCapped`) are observer-scope-driven fallbacks that today silently fold into the `primitiveConsiderationPolicyFallback` bucket. The migration must inspect the actual reason being recorded at line 66 and split the bucket appropriately — this requires reading the controller logic to determine when observer-scope-driven causes fire.
5. Three golden trace files are likely affected per Spec 200 §5 (verify file-by-file during P3):
   - `packages/engine/test/determinism/plan-trace-replay.test.ts`
   - `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts`
   - `packages/engine/test/determinism/plan-trace-doctrine-gating-golden.test.ts`
   All three exist per glob; their golden fixtures will need re-blessing if they pin specific `fallbackReason` string values.

## Architecture Check

1. **Foundation #14 (No Backwards Compatibility)**: The string→union type change migrates all internal emission sites in `plan-controller.ts` AND re-blesses affected golden traces in the same commit. No string-form compatibility layer; no `_legacy` field; no deferred migration. The "fixture, replay, and test is updated in the same change" mandate is satisfied.
2. **Foundation #16 (Testing as Proof)**: The new architectural-invariant test asserts that no microturn trace carries a `fallbackReason` whose `kind` is outside the declared union — TypeScript's exhaustiveness narrowing makes this a compile-time guarantee, but the runtime test guards against any path that bypasses the type system (e.g., JSON-deserialized traces from replay fixtures).
3. **Foundation #20 (Preview Signal Integrity)**: The union promotion follows the canonical Foundation-#20 vocabulary established by `CompoundAvailability` (Spec 199) and applied in tickets 001/002.
4. **Foundation #8 (Determinism)**: Replay-identity tests for the FITL conformance corpus must continue to pass byte-identically after the golden re-bless. The re-bless captures the *shape* change of `fallbackReason`, not any behavioral change.

## What to Change

### 1. Extend `types-plan-trace.ts` with the fallback-reason union

Add to `packages/engine/src/kernel/types-plan-trace.ts`:

```ts
export type PlanMicroturnFallbackReason =
  | { readonly kind: 'noExactRoleValueMatch' }
  | { readonly kind: 'reselectedWithinRole'; readonly from: string; readonly to: string }
  | { readonly kind: 'primitiveConsiderationPolicyFallback' }
  | { readonly kind: 'stableFrontierTieBreakFallback' }
  | { readonly kind: 'hiddenStatePrecludedMatch' }
  | { readonly kind: 'partialObserverScope' }
  | { readonly kind: 'depthCapped' };
```

Update `PolicyPlanMicroturnTrace` (lines 63–70): change `readonly fallbackReason?: string` → `readonly fallbackReason?: PlanMicroturnFallbackReason`.

### 2. Migrate `plan-controller.ts` emission sites

Update the `microturnTraceFor` helper signature at lines 180–192: change the `fallbackReason?: string` parameter to `fallbackReason?: PlanMicroturnFallbackReason`.

Update all callers at lines 66 and 73 (and any other sites that pass `reason` into `microturnTraceFor`):
- Line 66 (primitive considered fallback): replace `reason` string with `{ kind: 'primitiveConsiderationPolicyFallback' }` OR one of the new observer-scope-driven variants, depending on what triggered the fallback. Read the surrounding logic to determine the discriminator.
- Line 73 (stable frontier fallback): replace with `{ kind: 'stableFrontierTieBreakFallback' }`.
- Reselected path (line 58): if the reselection produces a `deviation` string, the new union variant `{ kind: 'reselectedWithinRole', from, to }` captures it structurally.

The three new variants (`hiddenStatePrecludedMatch`, `partialObserverScope`, `depthCapped`) require the controller to inspect why the primitive fallback fired. If the existing controller doesn't have signal sources for these distinctions, plumbing may be needed — likely by inspecting whether the unmatched microturn's expected step references hidden / observer-scoped state. If full disambiguation is not feasible without significant refactoring, retain the `primitiveConsiderationPolicyFallback` default and document the conditions under which the new variants are emitted (in a comment inside `plan-controller.ts`).

### 3. Re-bless three golden trace files

For each of the three affected golden trace files:
- `packages/engine/test/determinism/plan-trace-replay.test.ts`
- `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts`
- `packages/engine/test/determinism/plan-trace-doctrine-gating-golden.test.ts`

Read the file to determine whether it pins a literal `fallbackReason` string (likely `'primitive-fallback'` or similar). If yes, regenerate the golden by running the test and capturing the new structured `fallbackReason: { kind: ... }` output. The commit body must contain one `Re-bless golden trace: <test-file> — Spec 200 promotes free-form fallbackReason to discriminated union` line per affected file (multiple files may share one commit when the reason matches; see Spec 200 §5).

If a golden trace file does NOT pin `fallbackReason` literally (e.g., it asserts only `match: 'fallback'` without checking the reason), no re-bless is needed for that file.

### 4. Add architectural-invariant test for union closure

New file: `packages/engine/test/architecture/plan-trace-fallback-reason-union-closed.test.ts` (per Spec 200 §8).

The test iterates over a representative FITL conformance fixture's microturn traces and asserts that for every microturn with `match === 'fallback'` and `fallbackReason !== undefined`, the `fallbackReason.kind` is one of the seven declared union variants. Mark with `// @test-class: architectural-invariant`.

### 5. Extend FITL conformance replay-identity tests

Update FITL conformance replay-identity coverage to assert byte-identical traces under the new `fallbackReason` union shape. This is operationally a verification step: the existing replay-identity tests must pass byte-identically after the golden re-bless (the re-bless is the structural change; replay-identity is the determinism guarantee).

## Files to Touch

- `packages/engine/src/kernel/types-plan-trace.ts` (modify — add `PlanMicroturnFallbackReason` union + update `PolicyPlanMicroturnTrace.fallbackReason` type)
- `packages/engine/src/agents/plan-controller.ts` (modify — `microturnTraceFor` signature + emission sites at lines 66, 73, and reselected paths)
- `packages/engine/test/determinism/plan-trace-replay.test.ts` (modify — re-bless golden if applicable)
- `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts` (modify — re-bless golden if applicable)
- `packages/engine/test/determinism/plan-trace-doctrine-gating-golden.test.ts` (modify — re-bless golden if applicable)
- `packages/engine/test/architecture/plan-trace-fallback-reason-union-closed.test.ts` (new — architectural invariant)

## Out of Scope

- Cross-game conformance corpus extension (Phase 4, ticket 200PLNPRPTRC-004).
- New trace fields beyond `fallbackReason`'s union promotion — `roleBindingStatuses` (ticket 001), `decisionSurfaceMatch` (ticket 001), and `rejectedByConstraint` (ticket 002) are already covered.
- Profile YAML changes — Spec 200 explicitly excludes.
- Plumbing for the three new observer-scope-driven variants if it requires significant controller refactoring — document the limitation in a code comment and defer to a follow-up if needed (re-evaluate Spec 200 §4.5 acceptance during implementation).

## Acceptance Criteria

### Tests That Must Pass

1. `plan-trace-fallback-reason-union-closed.test.ts` (new) — no microturn `fallbackReason.kind` outside the declared union of seven variants.
2. Each affected golden trace file passes after re-bless with the new structured `fallbackReason` shape.
3. Existing replay-identity tests for the FITL conformance corpus pass byte-identically post-re-bless.
4. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — full engine test suite green.

### Invariants

1. `PolicyPlanMicroturnTrace.fallbackReason` is of type `PlanMicroturnFallbackReason | undefined` (the string-form no longer compiles).
2. Every microturn trace with `match === 'fallback'` and `fallbackReason` set has a `fallbackReason.kind` matching one of the seven declared union variants.
3. Replay identity preserved: same `(GameDef, initial state, seed, actions)` produces byte-identical traces under the new union shape.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/plan-trace-fallback-reason-union-closed.test.ts` (new) — architectural invariant for union closure.
2. Re-bless: `plan-trace-replay.test.ts`, `plan-semantic-correspondence-golden.test.ts`, `plan-trace-doctrine-gating-golden.test.ts` (modify — regenerate golden fixtures if they pin literal `fallbackReason` strings).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/plan-trace-fallback-reason-union-closed.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/plan-trace-replay.test.js`
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/plan-semantic-correspondence-golden.test.js`
4. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/plan-trace-doctrine-gating-golden.test.js`
5. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

### Commit body for golden re-bless

For each affected golden trace file (verify during implementation), include in the commit body:

```
Re-bless golden trace: <test-file> — Spec 200 promotes free-form fallbackReason to discriminated union
```

Multiple files may share one commit when the reason matches.
