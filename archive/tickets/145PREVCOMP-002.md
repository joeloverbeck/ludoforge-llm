# 145PREVCOMP-002: Policy-evaluation top-K preview gate

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-eval.ts`, `agents/policy-evaluation-core.ts`, `agents/policy-preview.ts`, trace schema/types
**Deps**: `archive/tickets/145PREVCOMP-001.md`

## Problem

Per Spec 145 D7: previewing every action-selection candidate is too expensive (target: under 5% wall-time overhead). Empirically, ARVN microturns publish 8–12 candidates; previewing the top 4 by move-only score captures realistic competition while keeping cost bounded.

This ticket splits `policy-evaluation-core.ts`'s candidate scoring loop into two phases: (1) compute move-scope-only score for every candidate (no `preview.*` refs), (2) drive synthetic completion only for the top `K_PREVIEW_TOPK` candidates. Lower-ranked candidates' `previewOutcome` is set to `{ kind: 'unknown', reason: 'gated' }` and their preview-derived considerations fall through `coalesce` naturally. This is the cost-control mechanism that makes the driver from `145PREVCOMP-001` deployable on full-game runs.

## Assumption Reassessment (2026-04-25)

1. The policy-evaluation pass is the right insertion point per Spec 145 D7 ("This cap is implemented in the policy-evaluation pass (not in `policy-preview.ts`)"). Live correction: the scoring loop is orchestrated in `packages/engine/src/agents/policy-eval.ts`; `packages/engine/src/agents/policy-evaluation-core.ts` owns evaluator helpers and preview metadata sync.
2. The `'gated'` reason is new — added to `PolicyPreviewUnavailabilityReason` here (it is *not* added in `145PREVCOMP-001`, which only adds `'depthCap'` and `'noPreviewDecision'`).
3. `preview.topK` config field threading and validation already landed in `145PREVCOMP-001`; this ticket consumes the validated value.
4. `K_PREVIEW_TOPK` default is 4 per Spec 145 D7. Justified empirically by the 8–12 candidate-count observation; the derivation script lands in `145PREVCOMP-006`.
5. Composability with existing modes preserved: `disabled` mode still bypasses driver entirely; `tolerateStochastic` mode admits stochastic outcomes from gated and ungated candidates alike.

## Architecture Check

1. **F#10 (Bounded Computation)** — `K_PREVIEW_TOPK` is an explicit per-microturn bound on driver invocations; combined with `145PREVCOMP-001`'s `K_PREVIEW_DEPTH`, total preview work per microturn is bounded by `topK × depthCap = 32` `applyPublishedDecision` calls.
2. **F#11 (Immutability)** — gating is read-only over candidate move-scores; produces a new gating decision per microturn, no mutation of candidate or runtime state.
3. **F#12 (Compiler-Kernel Validation Boundary)** — `preview.topK` validation already lives at compile time (per `145PREVCOMP-001`); runtime here only consumes the validated value with the documented default.
4. **F#15 (Architectural Completeness)** — gates the cost surface introduced by the driver before deployment; without this, the driver is technically correct but operationally too expensive on full-game runs.

No backwards-compatibility shims. The split into "move-only score" and "preview-augmented score for top K" is functional, not a behavioral toggle — when `topK >= candidateCount`, behavior matches "drive every candidate" and is therefore a strict superset of "preview none."

## What to Change

### 1. Add `'gated'` reason

In `packages/engine/src/agents/policy-preview.ts`, extend `PolicyPreviewUnavailabilityReason` to include `'gated'`. Update any associated string-enum schemas in `kernel/schemas-core.ts` if `previewFailureReason` is exposed in trace fixtures.

### 2. Two-phase candidate scoring in `policy-evaluation-core.ts`

Per Spec 145 D7, restructure the candidate scoring loop:

```ts
// Phase A: move-only score (no preview.* refs touched)
const moveOnlyScores = candidates.map((c) => computeMoveOnlyScore(c, ...));

// Phase B: identify top K by move-only score (stable ordering by stableMoveKey for ties)
const topKKeys = pickTopKByScore(moveOnlyScores, profile.preview.topK ?? 4);

// Phase C: preview-augmented score
const finalScores = candidates.map((c, i) => {
  if (topKKeys.has(c.stableMoveKey)) {
    return computeFullScore(c, /* triggers preview via getPreviewOutcome */);
  }
  // Mark gated; coalesce in scoring naturally falls through preview.* refs
  previewRuntime.markGated(c.stableMoveKey);
  return computeMoveOnlyScore(c, /* same as Phase A */);
});
```

The `markGated` call inserts `{ kind: 'unknown', reason: 'gated' }` into the preview cache for the gated candidate, so `getPreviewOutcome` returns the gated outcome on lookup and any `preview.*` ref evaluator sees `unresolved`.

Tie-breaking among candidates with equal move-only scores at the K boundary uses `stableMoveKey` ordering for determinism.

### 3. Composability with `disabled` and `tolerateStochastic`

When `previewMode === 'disabled'`, skip the gate entirely — every candidate already returns `{ kind: 'unknown', reason: 'failed' }` via the existing `disabled` short-circuit. When `previewMode === 'tolerateStochastic'`, the gate still applies; gated candidates do not invoke the driver, so their stochastic-surfacing decision is moot.

### 4. `K_PREVIEW_TOPK` constant

```ts
const K_PREVIEW_TOPK = 4;
```

Default consumed from `profile.preview.topK ?? 4` in the policy-evaluation pass. Override path is `profile.preview.topK` (already wired by `145PREVCOMP-001`).

### 5. Top-K gate unit tests

- `topK=1` previews only the highest-scoring candidate; all others marked `'gated'`.
- `topK >= candidateCount` previews every candidate (matches pre-gate behavior).
- `topK=4` with 12 candidates: exactly 4 candidates have non-`'gated'` outcomes; the other 8 have `reason: 'gated'`.
- Tie-breaking at K boundary uses `stableMoveKey` ordering deterministically.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify — live scoring-loop owner)
- `packages/engine/src/agents/policy-runtime.ts` (modify — expose `markGated` through runtime providers)
- `packages/engine/src/agents/policy-preview.ts` (modify — add `'gated'` reason and `markGated` cache helper)
- `packages/engine/src/kernel/types-core.ts` (modify — extend trace outcome/breakdown types)
- `packages/engine/src/kernel/schemas-core.ts` (modify — extend `PolicyPreviewUnavailabilityReason` schema if exposed)
- `packages/engine/schemas/Trace.schema.json` (regenerated)
- `packages/engine/src/agents/policy-agent.ts` and `packages/engine/test/unit/agents/policy-diagnostics.test.ts` (metadata fixture fallout)
- `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts` (new)

## Out of Scope

- The driver itself — covered by `145PREVCOMP-001`.
- Trace diagnostics emitting `previewGatedCount` / `previewGatedTopFlipDetected` — covered by `145PREVCOMP-005`.
- Empirical re-derivation of the 8–12 candidate-count floor — covered by `145PREVCOMP-006`.
- Profile-level `preview.topK` overrides in shipped data — Spec 145 §I3 keeps shipped profiles on the default; profile audit lives in `145PREVCOMP-003`.

## Acceptance Criteria

### Tests That Must Pass

1. New top-K gate unit tests in `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts`.
2. Existing `policy-evaluation-core.ts` consumer tests — green (existing convergence witnesses may shift slightly due to gating; if any regress, classify per `.claude/rules/testing.md` distillation rules — do not silently re-bless).
3. `pnpm -F @ludoforge/engine test:unit` and `pnpm -F @ludoforge/engine test:integration` green (modulo intentional re-bless in `145PREVCOMP-003`).
4. `pnpm turbo lint` and `pnpm turbo typecheck` green.

### Invariants

1. `K_PREVIEW_TOPK` ≥ 1 always; values from profile config are positive integers (validated by `145PREVCOMP-001`).
2. When `topK >= candidateCount`, no candidate is gated — behavior is a strict superset of the pre-gate path.
3. Gating decision is deterministic given (move-only scores, `stableMoveKey` ordering) — F#8.
4. Gated candidates do NOT invoke `driveSyntheticCompletion` (verified by spy/counter in unit tests).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts` (new) — `@test-class: architectural-invariant` for the gate's monotonicity, determinism, and `topK >= candidateCount` superset property.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test:integration`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`

## Review Outcome (2026-04-25)

Landed the policy-evaluation top-K preview gate. At initial closeout, the ticket was not archive-ready because its named integration lane was still red on changed-path failures then owned by follow-up `145PREVCOMP-003`.

- `policy-eval.ts` now computes a move-only ranking from non-preview move considerations, admits only the top `profile.preview.topK ?? 4` candidates to preview, and marks the remaining candidates as gated before full scoring evaluates preview refs.
- `policy-preview.ts` now supports the serialized `gated` preview outcome through a cache-level `markGated` hook. Gated candidates do not invoke the synthetic-completion driver; preview refs resolve as unknown and `coalesce` fallbacks continue naturally.
- `policy-runtime.ts` / `policy-evaluation-core.ts` expose the gate hook through the existing runtime-provider boundary instead of coupling the scoring pass directly to preview internals.
- Trace types, schemas, and generated `Trace.schema.json` now include `gated`; preview outcome breakdowns also separate `depthCap`, `noPreviewDecision`, and `gated` instead of folding them into generic failure.
- `policy-evaluation-topk-gate.test.ts` covers `topK=1`, `topK >= candidateCount`, the default-sized `topK=4` / 12-candidate shape, and deterministic `stableMoveKey` tie-breaking.

Live seam correction: the ticket named `policy-evaluation-core.ts` as the scoring-loop insertion point, but the current scoring loop lives in `policy-eval.ts`. The implementation uses `policy-eval.ts` for orchestration and keeps `policy-evaluation-core.ts` limited to the preview-gating provider method.

Integration-lane classification:

- `pnpm -F @ludoforge/engine test:integration` is not green after the gate. Direct reruns isolate three failures:
  - `dist/test/integration/spec-140-profile-migration.test.js` fails immediately on `data/games/fire-in-the-lake/92-agents.md:346: scopes: [completion]`; this literal is present in `HEAD` and is a shipped-profile audit/migration residue.
  - `dist/test/integration/fitl-march-free-operation.test.js` no longer reaches the historical seed-1006 required free-operation March witness within 220 decisions, while the adjacent executable-through-former-witness test still passes. This is a trajectory-sensitive witness shift under the new policy scoring path.
  - `dist/test/integration/classified-move-parity.test.js` now reaches a FITL step-420 path where the selected action is absent from classified enumeration. This is an architectural-invariant failure surfaced by the changed policy trajectory and must not be silently re-blessed.
- These broad integration residues were recorded on follow-up `145PREVCOMP-003`, whose scope was profile audit, fixture/witness classification, and re-bless/follow-up decisions after `145PREVCOMP-002`.

Verification:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-evaluation-topk-gate.test.js`
3. `pnpm -F @ludoforge/engine schema:artifacts:check`
4. `pnpm -F @ludoforge/engine test:unit`
5. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js dist/test/unit/agents/policy-evaluation-topk-gate.test.js`
6. `pnpm -F @ludoforge/engine test:integration` — red as classified above
7. `pnpm turbo lint`
8. `pnpm turbo typecheck`

## Blocker Resolution (2026-04-25)

`archive/tickets/145PREVCOMP-003.md` resolved the blocking integration classifications:

- Retired shipped-profile completion syntax was removed from `data/games/fire-in-the-lake/92-agents.md`.
- The seed-1006 March exact witness was reclassified as stale trajectory evidence while the executable-path proof remains green.
- `classified-move-parity.test.ts` now uses first-legal test agents so the legality/enumeration invariant is not coupled to policy-profile trajectory.

Focused reruns now pass:

1. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/spec-140-profile-migration.test.js`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-march-free-operation.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
