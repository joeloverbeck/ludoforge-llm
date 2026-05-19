# 182STRSTRPOL-008: Phase 3 — Pass-fallback runtime integration (`onAllPruned`) + `allPrunedFallback` trace

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts`, `packages/engine/src/kernel/legal-moves.ts` (or pass-fallback publishing path), `packages/engine/src/kernel/types-core.ts` (extend guardrails trace)
**Deps**: `archive/tickets/182STRSTRPOL-007.md`

## Problem

Spec 182 §5.4 + Foundation #18 require that when a `severity: prune, safe: true` guardrail empties the published frontier, the runtime publishes the declared `onAllPruned` action frame using the same pass-fallback pipeline `legal-moves.ts:1594-1599` already uses. This ticket wires runtime publication of the `onAllPruned` frame, adds the `allPrunedFallback` trace field, and emits the `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK` trace entry. It also handles the edge case where the declared fallback action is not constructible at the current scope by publishing `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` as policy failure metadata and letting the existing policy fallback-on-error surface recover without changing the kernel rollback safety net.

## Assumption Reassessment (2026-05-18)

1. The kernel pass-fallback path lives at `packages/engine/src/kernel/legal-moves.ts:1594-1599` (`actionsForPhase.find((action) => action.tags?.some((tag) => tag === 'pass'))`) — confirmed during reassessment.
2. Ticket 007 lands guardrail dispatch + severity execution; this ticket adds the empty-frontier publication logic that 007 explicitly deferred.
3. Compiler check `CNL_COMPILER_AGENT_GUARDRAIL_ON_ALL_PRUNED_ACTION_NOT_PASS_TAGGED` (added in ticket 006) verifies `onAllPruned.actionId` resolves to a `tags: [pass]` action at compile time; runtime asserts constructibility at publication time.
4. The `allPrunedFallback` trace field is added here as an extension of 007's basic guardrails trace shape.

## Architecture Check

1. The pass-fallback publication uses the same kernel mechanism that Spec 144 established for kernel rollback recovery — no parallel implementation, no shim (Foundation #15, #18).
2. `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK` and `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` are trace entries, not error throws — fallback is observable, not a determinism failure (Foundation #8 separation of engine determinism vs. profile-quality signals).
3. Constructibility check at runtime is the policy-side safety net for the Foundation #18 pass-fallback contract; if the compiler-time `_ACTION_NOT_PASS_TAGGED` check missed a case (e.g., runtime scope makes the action non-constructible), the policy core returns the existing failure shape with explicit fallback metadata, and the public policy wrapper can take its existing fallback-on-error path.
4. The `allPrunedFallback` trace block is generic — no game-specific fields.

## What to Change

### 1. Empty-frontier publication in policy-eval.ts

After the guardrail dispatch loop (ticket 007's insertion), check if `activeCandidates` is empty AND if any `severity: prune` guardrail declared `onAllPruned`. If so:

```ts
if (activeCandidates.length === 0) {
  const allPrunedGuardrail = firedGuardrails.find(
    (g) => g.severity === 'prune' && catalog.compiled.guardrails?.[g.id]?.onAllPruned !== undefined,
  );
  if (allPrunedGuardrail !== undefined) {
    const guardrailDef = catalog.compiled.guardrails![allPrunedGuardrail.id];
    const fallbackSpec = guardrailDef.onAllPruned!;
    const fallbackResult = tryPublishPassFallback(fallbackSpec.actionId, currentScope);
    if (fallbackResult.constructible) {
      // publish fallback frame; record POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK
      trace.guardrails!.allPrunedFallback = {
        guardrailId: allPrunedGuardrail.id,
        actionId: fallbackSpec.actionId,
        traceLabel: fallbackSpec.traceLabel,
      };
      return fallbackResult.frame;
    } else {
      // POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE — fall through to policy fallback-on-error
      trace.guardrails!.allPrunedFallback = { ... constructibilityFailure: true ... };
    }
  }
}
```

### 2. allPrunedFallback trace field extension

Extend `PolicyGuardrailTrace` (introduced in 007) with:

```ts
export interface PolicyGuardrailTrace {
  readonly fired: ReadonlyArray<PolicyGuardrailFiredEntry>;
  readonly notFiredTop: ReadonlyArray<PolicyGuardrailNotFiredEntry>;
  readonly allPrunedFallback?: PolicyGuardrailAllPrunedFallback;
}

export interface PolicyGuardrailAllPrunedFallback {
  readonly guardrailId: string;
  readonly actionId: string;
  readonly traceLabel: string;
  readonly constructibilityFailure?: true;
}
```

### 3. tryPublishPassFallback helper

Locate `legal-moves.ts:1594-1599` and either (a) extract a reusable helper that `policy-eval.ts` calls, or (b) document the existing function name to call directly. The helper takes an `actionId` + scope and returns `{ constructible, frame }` or analog.

### 4. Tests

End-to-end test: profile with `severity: prune, safe: true, onAllPruned: <pass>` that empties the frontier publishes the fallback frame; trace records `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK`; verify the fallback action lands as the published decision.

Edge-case test: an `onAllPruned.actionId` that exists at compile time but is non-constructible at the runtime scope produces `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` and falls through to the existing policy fallback-on-error path. Kernel rollback remains the lower-level Foundation #18 safety net and is not changed here.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — empty-frontier publication)
- `packages/engine/src/agents/policy-guardrail-fallback.ts` (new — shared all-pruned fallback resolution helper)
- `packages/engine/src/kernel/legal-moves.ts` (not modified — policy fallback consumes the already-published legal-move frontier from the kernel)
- `packages/engine/src/kernel/types-core.ts` (modify — extend `PolicyGuardrailTrace` with `allPrunedFallback`)
- `packages/engine/test/integration/agents/guardrail-pass-fallback.test.ts` (new)
- `packages/engine/test/integration/agents/guardrail-fallback-not-constructible.test.ts` (new)
- `packages/engine/test/integration/agents/guardrail-fallback-test-fixtures.ts` (new shared fixture for both fallback tests)

## Out of Scope

- Trace formatting (ticket 009 — caps + ordering across `fired` / `notFiredTop` / `allPrunedFallback`).
- Migration atomic (ticket 010).
- Conformance tests (ticket 011).
- Profile-quality lint warnings (ticket 012).
- Kernel rollback path itself — already implemented by Spec 144 / Foundation #18.

## Acceptance Criteria

### Tests That Must Pass

1. New `guardrail-pass-fallback.test.ts` — guardrail prunes all candidates; declared pass action publishes; trace records `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK`.
2. New `guardrail-fallback-not-constructible.test.ts` — non-constructible `onAllPruned` action emits `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` and falls through to the existing policy fallback-on-error path.
3. Existing pass-fallback tests (Spec 144) continue to pass.
4. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. Pass-fallback publication reuses the kernel mechanism (no parallel implementation; Foundation #15, #18).
2. `allPrunedFallback` trace is deterministic — same inputs produce identical trace contents (Foundation #8).
3. `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` is a profile-quality signal, not an engine determinism failure (Foundation #8 separation).
4. No game-specific identifiers in fallback code (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/guardrail-pass-fallback.test.ts` — end-to-end empty-frontier → fallback.
2. `packages/engine/test/integration/agents/guardrail-fallback-not-constructible.test.ts` — runtime constructibility failure path.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/agents/guardrail-*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-19.

Implemented the Phase 3 guardrail `onAllPruned` runtime fallback path and trace surface.

What changed:
- Added `PolicyGuardrailTrace.allPrunedFallback` with `guardrailId`, `actionId`, `traceLabel`, and optional `constructibilityFailure`.
- Changed guardrail dispatch so a `prune` guardrail that removes every candidate reports `allPrunedGuardrailId` instead of throwing before the fallback path can run.
- Added `resolveAllPrunedGuardrailFallback()` in `packages/engine/src/agents/policy-guardrail-fallback.ts`. The helper checks the compiler-declared pass-tagged `onAllPruned.actionId` against the already-published legal candidate frontier, returns a constructible fallback candidate when present, and emits deterministic fallback trace metadata.
- Updated `evaluatePolicyMoveCore()` to select the constructible pass fallback with `selectedReason: fallbackExplicit`; when the declared fallback is not constructible at runtime, it records `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` in the failure detail and preserves the `constructibilityFailure` trace marker.
- Added integration coverage for the successful fallback path and the non-constructible fallback path, plus a shared guardrail fallback fixture. Both new test files carry `@test-class: architectural-invariant` markers.

Deviations from the draft:
- `packages/engine/src/kernel/legal-moves.ts` was not modified. The policy layer already receives the kernel-published legal candidate frontier, so constructibility is proven by the declared pass action being present in that frontier. This avoids duplicating the kernel legal-move enumerator while preserving Foundation #18 constructibility.
- The helper returns a selected fallback move through the existing policy-evaluation result shape rather than introducing a separate frame type; trace formatting beyond the `allPrunedFallback` field remains ticket 009 scope.
- The non-constructible edge is proven through the policy core failure metadata plus the public policy fallback-on-error wrapper. This ticket did not modify or directly exercise kernel rollback; that lower-level safety net remains existing Foundation #18 behavior.

Source-size ledger:
- `packages/engine/src/agents/policy-eval.ts` — final size 1716 lines; preexisting over cap; active growth is the narrow call site, failure mapping, and selection-reason preservation. User approved option 1 on 2026-05-19; the fallback mechanics were extracted to `policy-guardrail-fallback.ts`.
- `packages/engine/src/agents/policy-guardrail-fallback.ts` — new focused helper, 102 lines, under cap.
- `packages/engine/src/agents/policy-guardrail-eval.ts` — final size 211 lines, under cap.
- `packages/engine/src/kernel/types-core.ts` — final size 2661 lines; preexisting shared contract file over cap; active growth is the trace type extension only.
- Test files are each under cap: `guardrail-fallback-test-fixtures.ts` 172 lines, `guardrail-pass-fallback.test.ts` 43 lines, `guardrail-fallback-not-constructible.test.ts` 52 lines.

Command ledger:
- Test Plan command 1 ran directly as `pnpm -F @ludoforge/engine build` followed by `node --test packages/engine/dist/test/integration/agents/guardrail-*.test.js`.
- Acceptance item 3 ran through `node --test packages/engine/dist/test/unit/legal-moves.test.js packages/engine/dist/test/unit/kernel/legal-moves.test.js`.
- Test Plan command 2 ran directly as `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck`.
- Additional shared-contract check: `pnpm -F @ludoforge/engine schema:artifacts:check`.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/integration/agents/guardrail-*.test.js` — passed, 2 tests.
- `node --test packages/engine/dist/test/unit/legal-moves.test.js packages/engine/dist/test/unit/kernel/legal-moves.test.js` — passed, 116 tests.
- `pnpm -F @ludoforge/engine lint` — passed.
- `pnpm -F @ludoforge/engine typecheck` — passed.
- `pnpm -F @ludoforge/engine schema:artifacts:check` — passed.
- `pnpm turbo build` — passed, 3 tasks successful.
- `pnpm turbo test` — initially failed because the two new tests lacked `@test-class` markers; after adding the markers and rebuilding, rerun passed, 5 tasks successful.
- `pnpm turbo lint` — passed, 2 tasks successful.
- `pnpm turbo typecheck` — passed, 3 tasks successful.

Post-proof edit validity:
- After broad proof, this ticket closeout was updated with status, source-size ledger, command ledger, verification transcription, and post-ticket-review truthing of the non-constructible recovery wording only. No source, schema, test behavior, or dependency boundary changed after the final proof lanes.
