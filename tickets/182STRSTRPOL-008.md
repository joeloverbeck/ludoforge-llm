# 182STRSTRPOL-008: Phase 3 — Pass-fallback runtime integration (`onAllPruned`) + `allPrunedFallback` trace

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts`, `packages/engine/src/kernel/legal-moves.ts` (or pass-fallback publishing path), `packages/engine/src/kernel/types-core.ts` (extend guardrails trace)
**Deps**: `archive/tickets/182STRSTRPOL-007.md`

## Problem

Spec 182 §5.4 + Foundation #18 require that when a `severity: prune, safe: true` guardrail empties the published frontier, the runtime publishes the declared `onAllPruned` action frame using the same pass-fallback pipeline `legal-moves.ts:1594-1599` already uses. This ticket wires runtime publication of the `onAllPruned` frame, adds the `allPrunedFallback` trace field, and emits the `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK` trace entry. Also handles the edge case where the declared fallback action is not constructible at the current scope (publishes `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` and falls through to existing blacklist-and-rollback recovery per Foundation #18).

## Assumption Reassessment (2026-05-18)

1. The kernel pass-fallback path lives at `packages/engine/src/kernel/legal-moves.ts:1594-1599` (`actionsForPhase.find((action) => action.tags?.some((tag) => tag === 'pass'))`) — confirmed during reassessment.
2. Ticket 007 lands guardrail dispatch + severity execution; this ticket adds the empty-frontier publication logic that 007 explicitly deferred.
3. Compiler check `CNL_COMPILER_AGENT_GUARDRAIL_ON_ALL_PRUNED_ACTION_NOT_PASS_TAGGED` (added in ticket 006) verifies `onAllPruned.actionId` resolves to a `tags: [pass]` action at compile time; runtime asserts constructibility at publication time.
4. The `allPrunedFallback` trace field is added here as an extension of 007's basic guardrails trace shape.

## Architecture Check

1. The pass-fallback publication uses the same kernel mechanism that Spec 144 established for kernel rollback recovery — no parallel implementation, no shim (Foundation #15, #18).
2. `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK` and `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` are trace entries, not error throws — fallback is observable, not a determinism failure (Foundation #8 separation of engine determinism vs. profile-quality signals).
3. Constructibility check at runtime is the kernel safety net per Foundation #18; if the compiler-time `_ACTION_NOT_PASS_TAGGED` check missed a case (e.g., runtime scope makes the action non-constructible), the runtime falls through to existing blacklist-and-rollback.
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
      // POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE — fall through to kernel rollback
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

Edge-case test: an `onAllPruned.actionId` that exists at compile time but is non-constructible at the runtime scope produces `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` and falls through to kernel rollback per Foundation #18.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — empty-frontier publication)
- `packages/engine/src/kernel/legal-moves.ts` (modify only if helper extraction is preferred over direct call)
- `packages/engine/src/kernel/types-core.ts` (modify — extend `PolicyGuardrailTrace` with `allPrunedFallback`)
- `packages/engine/test/integration/agents/guardrail-pass-fallback.test.ts` (new)
- `packages/engine/test/integration/agents/guardrail-fallback-not-constructible.test.ts` (new)

## Out of Scope

- Trace formatting (ticket 009 — caps + ordering across `fired` / `notFiredTop` / `allPrunedFallback`).
- Migration atomic (ticket 010).
- Conformance tests (ticket 011).
- Profile-quality lint warnings (ticket 012).
- Kernel rollback path itself — already implemented by Spec 144 / Foundation #18.

## Acceptance Criteria

### Tests That Must Pass

1. New `guardrail-pass-fallback.test.ts` — guardrail prunes all candidates; declared pass action publishes; trace records `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK`.
2. New `guardrail-fallback-not-constructible.test.ts` — non-constructible `onAllPruned` action emits `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` and falls through to kernel rollback.
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
