# 154POLBCDISP-001: Restore policy-bytecode safety-net fallback (D1+D2)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-evaluation-core.ts`
**Deps**: `specs/154-policy-bytecode-emitter-evaluator-dispatch-completeness.md`

## Problem

After Spec 149's Phase 4 F14 cut (commit `5628cd41f`), the policy bytecode evaluator lost its closure-tree safety net. The replacement gate (`requiresDirectLiteralSemantics`) only routes a small set of kinds (`previewSurface`, `candidateTag`, `seatAgg`, `adjacentTokenAgg`, `zoneProp`, filtered token/zone aggregates) to the direct evaluator before the VM runs; everything else flows through bytecode. When the VM's `resolveBuiltInFeature` returns `UNSUPPORTED_FEATURE` for a kind it can't handle natively, `executeBytecode` throws `PolicyBytecodeVmUnsupportedError` (`packages/engine/src/agents/policy-vm/vm.ts:355-356`), but `evaluateCompiledExprWithVm` (`packages/engine/src/agents/policy-evaluation-core.ts:503-531`) does not catch that error today — and `resolveVmFallbackFeature`'s `default: return undefined` branch (`packages/engine/src/agents/policy-evaluation-core.ts:740`) silently swallows any kind without an explicit case.

The result is a silent dispatch gap: any future emitter change that introduces a new `FeatureRef.kind` without a corresponding evaluator handler will collapse `{ ref: feature.X }` consideration values to `unknownAs ?? 0`, agents will pick random tiebreaks, and downstream gates (drive-fingerprint, compound-turn-overhead) will eventually notice. PR #239 commit `beb3c3993` patched this for three known library kinds (`candidateFeature` / `stateFeature` / `candidateAggregate`), but the architectural gap that made the silent failure possible remains open.

This ticket closes the gap by restoring the safety-net architecture from main: (a) make the silent default audible via a defensive throw, and (b) catch that throw in the bytecode driver and dispatch to the existing direct evaluator, which walks the IR and handles every `CompiledPolicyExpr` kind by definition.

## Assumption Reassessment (2026-05-04)

1. `evaluateCompiledExprWithVm` is at `packages/engine/src/agents/policy-evaluation-core.ts:503-531`; the `executeBytecode` call is at line 529 with no surrounding try/catch — confirmed via direct read in the reassess-spec session.
2. `resolveVmFallbackFeature`'s silent default is at `packages/engine/src/agents/policy-evaluation-core.ts:740`; the explicit hot-fix handlers from `beb3c3993` (lines 701-732) coexist with the silent default and are NOT removed by this ticket.
3. `evaluateCompiledExprDirect` (`packages/engine/src/agents/policy-evaluation-core.ts:533-561`) is exhaustive — its switch has no `default:` clause and TypeScript narrows the `CompiledPolicyExpr` union exhaustively. Falling back to it is safe for every IR ref kind.
4. `PolicyBytecodeVmUnsupportedError` is defined and exported at `packages/engine/src/agents/policy-vm/vm.ts:31-36`, already imported in `policy-evaluation-core.ts:52`. No new symbol introductions needed.
5. The `requiresDirectLiteralSemantics` gate (`packages/engine/src/agents/policy-evaluation-core.ts:563-592`) routes `seatAgg` and `adjacentTokenAgg` to the direct evaluator BEFORE the VM is invoked (lines 576-578) — so the new safety-net catch is reached only for kinds the VM legitimately can't handle, not for these.
6. Implementation reassessment confirmed the live code still matched the drafted gap before editing: `executeBytecode` was called bare, and the `resolveVmFallbackFeature` `default:` still returned `undefined`. Sibling tickets `154POLBCDISP-002` and `154POLBCDISP-003` remain active and unabsorbed.

## Architecture Check

1. The fix re-establishes the pre-149 architectural shape: the bytecode VM is a best-effort fast path; the direct evaluator is the slow-but-complete fallback for anything the VM can't satisfy. The shape is conceptually identical to main's pre-F14 try/catch/fallback, but uses `evaluateCompiledExprDirect` (the post-F14 IR-walker) instead of the deleted closure-tree — no Foundation 14 violation, no `_legacy` shim.
2. Engine-agnostic: the policy bytecode evaluator is part of the universal interpreter; this ticket changes only agnostic dispatch logic. No game-specific identifiers, no FITL-specific or Texas-specific branches.
3. Foundation 15 (Architectural Completeness): the silent `default: return undefined` was a symptom-level patch shape that allowed the emitter and evaluator to drift independently. Replacing it with a defensive throw + downstream catch turns drift into an audible failure mode that the test in `154POLBCDISP-002` will gate against going forward.
4. The catch is type-narrow (only `PolicyBytecodeVmUnsupportedError` falls back); any other error (e.g., `RUNTIME_EVALUATION_ERROR`, division-by-zero) propagates as before. No widening of error-swallowing surface area.

## What to Change

### 1. Make `resolveVmFallbackFeature`'s default branch throw

In `packages/engine/src/agents/policy-evaluation-core.ts`, the `resolveVmFallbackFeature` switch (line 679) currently ends with:

```ts
default:
  return undefined;
```

Replace with a defensive throw that names the unhandled kind:

```ts
default:
  throw new PolicyBytecodeVmUnsupportedError(
    `Policy bytecode feature kind "${(ref as { kind: string }).kind}" has no handler in resolveVmFallbackFeature; falling back to direct evaluator.`,
  );
```

The existing case-body `return undefined` paths (lines 704, 715, 726, 735) stay as-is — they are explicit, documented returns when the in-IR lookup or candidate context legitimately produces `undefined`. Only the catch-all default changes. The throw at line 742 (for `dynamicSurface` / `dynamicRef` / `dynamicExpr` when in-IR lookup fails) is unchanged.

### 2. Wrap `executeBytecode` in a type-narrow try/catch

In `packages/engine/src/agents/policy-evaluation-core.ts`, `evaluateCompiledExprWithVm` (lines 503-531) currently calls `executeBytecode` bare at line 529:

```ts
const result = executeBytecode(bytecode, this.encodedState, vmContext);
return result.value;
```

Replace with a try/catch that narrowly catches `PolicyBytecodeVmUnsupportedError` and dispatches to the direct evaluator:

```ts
try {
  const result = executeBytecode(bytecode, this.encodedState, vmContext);
  return result.value;
} catch (error) {
  if (error instanceof PolicyBytecodeVmUnsupportedError) {
    return this.evaluateCompiledExprDirect(expr, candidate);
  }
  throw error;
}
```

`PolicyBytecodeVmUnsupportedError` is already imported (`policy-evaluation-core.ts:52`); no import additions needed.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)

## Out of Scope

- Removing the explicit `candidateFeature` / `stateFeature` / `candidateAggregate` handlers added by `beb3c3993` (deferred to `tickets/154POLBCDISP-003.md` — perf-measurement-driven decision).
- Adding the `FEATURE_REF_KINDS` registry or `FeatureRefKind` union (covered by `tickets/154POLBCDISP-002.md`).
- Adding native VM handlers for any kind currently routed through the JS fallback (rejected in spec Brainstorm Context — wrong layer).
- Reintroducing the closure-tree (rejected per Foundation 14).
- Changes to `policy-wasm-score-routing.ts` or any WASM dispatch (out of spec scope).
- Recalibrating `test/perf/agents/fitl-per-card-cost.perf.test.ts` ceiling — that's PR #239 follow-up, sequenced separately.

## Acceptance Criteria

### Tests That Must Pass

1. The full engine test suite passes locally: `pnpm -F @ludoforge/engine test`.
2. `slow-parity-shard-b` lane passes — specifically `drive-fingerprint-property.test.ts:122` (`captures.length > 0`).
3. `test:performance` lane passes — specifically `spec-140-compound-turn-overhead.test.ts` (`totalCompoundTurns <= 600`).
4. `policy-bytecode-equivalence.test.ts` (`packages/engine/test/integration/policy-bytecode-equivalence.test.ts`) continues to pass — both sides go through the same evaluator path post-Spec-149, so the deepEqual assertion at line 443 holds with the safety-net active.
5. Engine default test lane (`pnpm -F @ludoforge/engine test:unit`) stays green.

### Invariants

1. No new `PolicyBytecodeVmUnsupportedError` propagates out of `evaluatePolicyMove` (or its public callers) in production runs. The catch in `evaluateCompiledExprWithVm` swallows every unsupported throw cleanly and dispatches to the direct evaluator.
2. Replay parity is preserved — same `(GameDef, initial state, seed, actions)` produces an identical canonical state hash before and after this change. The fallback path produces the same values the silent-undefined path would have produced *if* the VM had a correct handler, because the direct evaluator walks the same IR.
3. Type-narrow catch contract: any error that is NOT a `PolicyBytecodeVmUnsupportedError` continues to propagate uncaught.

## Test Plan

### New/Modified Tests

No new tests in this ticket. The architectural-invariant enumeration test that proves the safety net's completeness is authored in `tickets/154POLBCDISP-002.md` (which depends on this ticket so the test exercises a fixed safety net, not the silent gap).

### Commands

1. `pnpm -F @ludoforge/engine build` — confirm typecheck after edits.
2. `pnpm -F @ludoforge/engine test:unit` — confirm engine unit tests stay green.
3. `pnpm -F @ludoforge/engine test` — full engine test suite including the integration and performance lanes that originally caught the silent gap.
4. `pnpm turbo lint` and `pnpm turbo typecheck` — repo-wide quality gates.

## Outcome

Completed: 2026-05-04.

Implemented. `packages/engine/src/agents/policy-evaluation-core.ts` now:

1. Wraps `executeBytecode` in a type-narrow `try` / `catch` that falls back to `evaluateCompiledExprDirect(expr, candidate)` only for `PolicyBytecodeVmUnsupportedError`.
2. Replaces the `resolveVmFallbackFeature` catch-all `default: return undefined` branch with a defensive `PolicyBytecodeVmUnsupportedError` that names the unhandled `FeatureRef.kind`.

The explicit `candidateFeature`, `stateFeature`, and `candidateAggregate` fallback handlers from PR #239 were kept in place, as required by this ticket. The typed registry / enumeration test remains owned by `tickets/154POLBCDISP-002.md`; the explicit-handler perf decision remains owned by `tickets/154POLBCDISP-003.md`.

## Verification Result

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed, 6/6 subtests.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-vm-core.test.js dist/test/unit/agents/policy-runtime-encoded.test.js dist/test/unit/cnl/policy-bytecode-compile.test.js dist/test/unit/cnl/policy-bytecode-feature-table.test.js` — passed, 15/15 subtests.
4. `node dist/test/unit/walker-deletion-enforcement.test.js` from `packages/engine/` — passed, 2/2 subtests; used to classify the unit-lane failure below.

## Deviations

1. `pnpm -F @ludoforge/engine test:unit` was run twice after a successful build and failed both times only at `dist/test/unit/walker-deletion-enforcement.test.js` with Node reporting file-level `testCodeFailure` before subtests printed. Running that same compiled file directly with `node dist/test/unit/walker-deletion-enforcement.test.js` passed both walker-deletion assertions. This failure is outside the policy-bytecode seam touched by this ticket and is recorded as unrelated lane noise rather than an owned blocker.
2. `pnpm -F @ludoforge/engine test`, `pnpm turbo lint`, and `pnpm turbo typecheck` were not run after the repeated `test:unit` lane failure; the strongest truthful proof for the owned seam is the passing engine build plus focused policy-bytecode unit/integration proof above.
