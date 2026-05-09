# 162PRESIGINT-002: Per-ref PreviewOptionRefStatus shape + plumbing through inner-preview drivers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-preview-inner.ts`, `policy-preview-inner-choosenstep.ts`, `microturn-option-evaluator.ts`, `policy-evaluation-core.ts`
**Deps**: `archive/tickets/162PRESIGINT-001.md`

## Problem

Today the inner-preview drivers return `ReadonlyMap<string, PolicyValue>` for the resolved per-option refs (see `policy-preview-inner.ts:419-462`, `policy-preview-inner-choosenstep.ts:262, 477`). When `resolveRefs` cannot resolve a ref (drive ended at `depthCap`, surface hidden, no pre-state baseline for delta refs), the ref is **silently omitted** from the map — there is no entry, and no failure signal. Downstream `resolvePreviewOptionRef` (`policy-evaluation-core.ts:1193-1199`) calls `resolvedRefs.get(key)` and gets `undefined`, which then flows into the silent-coercion path at `policy-evaluation-core.ts:504-507` (`unknownAs ?? 0`).

Spec §5.1 calls for an availability-aware shape where every requested ref produces an explicit `ready`/`unavailable` status. This ticket lands the shape change and the per-ref unavailability tracking through the call chain so candidates' existing `unknownPreviewRefs: Map<string, PolicyPreviewUnavailabilityReason>` infrastructure (already defined at `policy-evaluation-core.ts:84` and populated at `1469, 1522, 1528` for outer policy evaluation) is finally populated for chooseN frontier candidates.

This ticket is plumbing only — no trace surface changes, no compiler changes, no YAML changes. Phase 1b (003) consumes the populated tracking map.

## Assumption Reassessment (2026-05-09)

1. **`resolveRefs` shape and call sites.** Verified. `policy-preview-inner.ts:419-462` returns `{ refs: ReadonlyMap<string, PolicyValue>; hidden: boolean }`. `policy-preview-inner-choosenstep.ts:262, 477` mirrors the shape on `withOutcome`. `microturn-option-evaluator.ts:28, 95, 154` consumes via `previewOptionResolvedRefsByOptionKey?: ReadonlyMap<string, ReadonlyMap<string, PolicyValue>>`.
2. **`PolicyPreviewUnavailabilityReason` already defined.** Verified at `policy-evaluation-core.ts:50` (import) and `:84` (`unknownPreviewRefs: Map<string, PolicyPreviewUnavailabilityReason>` field on `PolicyEvaluationCandidate`). The reason union covers `depthCap`, `hidden`, `stochastic`, `unresolved`, `noPreviewDecision`, `failed` per spec §5.1.
3. **`resolvePreviewOptionRef` returns `PolicyValue`.** Verified at `policy-evaluation-core.ts:1193`. Spec §5.1 explicitly says this signature does not change — the resolver continues to return `PolicyValue` (or coerce `undefined` upstream), but on `unavailable` it MUST register the ref into `candidate.unknownPreviewRefs` before returning.
4. **Existing surface-ref tracking pattern.** `resolveSurfaceRef` at line 1469 already does `candidate.unknownPreviewRefs.set(refId, resolution.reason)` — this is the pattern to mirror for the preview-option-ref path.
5. **`refKind` cases drive the `unavailable` reason mapping** per spec §5.1: `outcome` and `driveDepth` always `ready`; surface-resolving refs that hit `hidden` produce `hidden`; `value`-resolved post-state refs that fail to resolve produce `depthCap` (when drive ended at depthCap); `deltaVictoryCurrentMarginSelf` whose post resolves but pre fails produces `unresolved`.

## Architecture Check

1. **Reuses existing tracking infrastructure.** `PolicyEvaluationCandidate.unknownPreviewRefs` already exists for outer policy evaluation; this ticket extends the same map to also receive chooseN frontier preview-option-ref unavailability. No new tracking type, no parallel infrastructure.
2. **Single union per ref.** `PreviewOptionRefStatus = { kind: 'ready'; value: PolicyValue } | { kind: 'unavailable'; reason: PolicyPreviewUnavailabilityReason }`. Status entries are exhaustive — every requested ref produces exactly one status entry. No "ref absent" case remains, eliminating a class of silent fall-through.
3. **No new union surface in `policy-evaluation-core` consumer.** Per spec §5.1: the consumer-side `resolvePreviewOptionRef` continues to return `PolicyValue`. The status union exists at the resolver-handoff boundary only; downstream contribution math is unchanged.
4. **Engine-agnostic.** All changes are in the policy-evaluation pipeline. No game-specific logic added; FITL fixture migration is deferred to 004.
5. **No backwards-compatibility shim.** `previewOptionResolvedRefsByOptionKey`'s element type changes from `ReadonlyMap<string, PolicyValue>` to `ReadonlyMap<string, PreviewOptionRefStatus>`. All consumers migrate in the same diff.

## What to Change

### 1. Define `PreviewOptionRefStatus`

In `packages/engine/src/agents/policy-preview-inner.ts` (or a sibling type module if cleaner — pick the path that minimizes import cycles):

```ts
export type PreviewOptionRefStatus =
  | { readonly kind: 'ready'; readonly value: PolicyValue }
  | { readonly kind: 'unavailable'; readonly reason: PolicyPreviewUnavailabilityReason };
```

Re-export from wherever the chooseNStep variant lives so all four sites can import the same type.

### 2. Update `resolveRefs` in `policy-preview-inner.ts`

Change return shape from `{ refs: ReadonlyMap<string, PolicyValue>; hidden: boolean }` to `{ refs: ReadonlyMap<string, PreviewOptionRefStatus>; hidden: boolean }`. Replace every `continue` that previously meant "skip this ref" with a `resolved.set(key, { kind: 'unavailable', reason: <mapped> })`. Reason mapping per spec §5.1:
- Drive-intrinsic refs (`outcome`, `driveDepth`) → `{ kind: 'ready', value: ... }` (unchanged).
- Surface refs where `surfaceRef === undefined` → `{ kind: 'unavailable', reason: 'unresolved' }` (no surface ref produced).
- `post.kind === 'hidden'` → `{ kind: 'unavailable', reason: 'hidden' }`. Set the `hidden` flag too as today.
- `post.kind !== 'value'` (other failure mode) → `{ kind: 'unavailable', reason: 'depthCap' }` when the drive ended at depthCap, otherwise `'unresolved'`. Use the `drive` parameter (specifically `drive.terminationReason` or equivalent — verify the field name during implementation) to discriminate.
- `deltaVictoryCurrentMarginSelf` where `post` resolved but `pre` is hidden/non-value → `{ kind: 'unavailable', reason: 'unresolved' }`.

### 3. Update chooseNStep variants in `policy-preview-inner-choosenstep.ts`

The `withOutcome.set(...)` calls at lines 267 and 482 currently embed an `outcome` value into a `PolicyValue` map. After the shape change, the `outcome` ref still produces `{ kind: 'ready', value: <outcome> }`. Mirror the changes from §2.

### 4. Update `microturn-option-evaluator.ts`

Update the type of `previewOptionResolvedRefsByOptionKey` at line 28:

```ts
readonly previewOptionResolvedRefsByOptionKey?:
  ReadonlyMap<string, ReadonlyMap<string, PreviewOptionRefStatus>>;
```

The `.get(...)` calls at lines 95 and 154 now hand a `ReadonlyMap<string, PreviewOptionRefStatus>` to `scoreMicroturnOptionWithContributions`. Update that function's signature in the same way.

### 5. Update `resolvePreviewOptionRef` in `policy-evaluation-core.ts`

At `policy-evaluation-core.ts:1193-1199`, the resolver currently does `resolvedRefs.get(key)` returning `PolicyValue | undefined`. Change to read a `PreviewOptionRefStatus | undefined`:

```ts
const status = resolvedRefs.get(key);
if (status === undefined) {
  // Should not occur after this ticket — every requested ref produces a status entry.
  // Treat as unresolved for safety.
  candidate?.unknownPreviewRefs.set(key, 'noPreviewDecision');
  return undefined;
}
if (status.kind === 'unavailable') {
  candidate?.unknownPreviewRefs.set(key, status.reason);
  return undefined;
}
return status.value;
```

This mirrors the `resolveSurfaceRef` pattern at line 1469 (`candidate.unknownPreviewRefs.set(refId, resolution.reason)`).

### 6. Plumb `candidate` through the call chain

The chooseN frontier path in `microturn-option-evaluator.ts` and `policy-evaluation-core.ts` may need to thread the active `PolicyEvaluationCandidate` instance into `resolvePreviewOptionRef`. Verify the call graph during implementation; if the candidate is already available (via the evaluator's evaluation context), no new parameter is needed. If it's not, add the minimal threading.

### 7. Update existing call sites in tests

Test fixtures that construct `previewOptionResolvedRefsByOptionKey` directly (e.g., `policy-preview-inner-hidden-info.test.ts`, `policy-preview-inner-choosenstep-hidden-info.test.ts`, fixture builders in `packages/engine/test/helpers/spec-160-inner-preview-fixture.ts`, `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-fixture.ts`) need to update their map element type to `PreviewOptionRefStatus`. Mechanical: wrap existing values as `{ kind: 'ready', value: ... }`; convert "absent entry means unavailable" patterns into explicit `{ kind: 'unavailable', reason: ... }` entries.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (modify — type export + `resolveRefs` shape)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (modify — mirror shape change)
- `packages/engine/src/agents/microturn-option-evaluator.ts` (modify — interface type + `scoreMicroturnOptionWithContributions` signature)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — `resolvePreviewOptionRef` consumes status union; populates `candidate.unknownPreviewRefs`)
- `packages/engine/test/helpers/spec-160-inner-preview-fixture.ts` (modify — fixture builders)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-fixture.ts` (modify — fixture builders)
- `packages/engine/test/unit/agents/policy-preview-inner-hidden-info.test.ts` (modify — assertions read new shape)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` (modify — assertions read new shape)
- `packages/engine/test/unit/agents/policy-preview-inner-chooseone.test.ts` (modify if it touches the resolved-refs map)
- `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (modify if it touches the resolved-refs map)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts` (modify if it touches the resolved-refs map)

`Likely surface`: the test list above is bounded by the previously-validated grep for `previewOptionRef` consumers; exact set will be confirmed during implementation by typechecker errors after the shape change lands in the source files.

## Out of Scope

- Trace surface changes (`unknownPreviewRefs` populated in candidate trace, `selectionReason` union, advisory, `coverage` block). Owned by 003.
- Compiler `previewFallback` parsing or diagnostic. Owned by 004.
- Runtime fallback-aware contribution path (`previewFallback` consumption at `evaluateConsideration`). Owned by 005.
- New tests that exercise the integrity behavior end-to-end. Owned by 003 (T3, T4) and 005 (T1, T2).
- Fixture YAML migrations in `data/games/fire-in-the-lake/`. Owned by 004 (atomic cut with compiler diagnostic).

## Acceptance Criteria

### Tests That Must Pass

1. Existing inner-preview tests (`policy-preview-inner-*.test.ts`, `policy-preview-inner-choosenstep-*.test.ts`) continue to pass with their fixture-shape migrations.
2. Existing FITL canary golden tests (`policy-preview-inner-fitl-canary-golden.test.ts`, `policy-preview-inner-choosenstep-fitl-canary-golden.test.ts`) continue to pass — behavior is unchanged for `ready` refs.
3. Existing replay-identity tests (`spec-160-inner-preview-replay-identity.test.ts`, `spec-161-choosenstep-inner-preview-replay-identity.test.ts`) continue to pass byte-identical replay.
4. Existing suite: `pnpm turbo build && pnpm turbo test`.

### Invariants

1. Every requested preview-option ref produces a status entry in the resolved map (`ready` or `unavailable`). No silent omission.
2. After the shape change, when an `unavailable` ref is consumed by `resolvePreviewOptionRef`, the surrounding `PolicyEvaluationCandidate.unknownPreviewRefs` map gains an entry mapping the ref id to its `PolicyPreviewUnavailabilityReason`.
3. `INNER_PREVIEW_HARD_CAP === 256` unchanged (`compile-agents.ts:81`).
4. No game-specific symbol or game id added to engine-agnostic modules.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-hidden-info.test.ts` — update assertions: hidden ref now appears as `{ kind: 'unavailable', reason: 'hidden' }` in `option.resolvedRefs` map.
2. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` — same as above for chooseNStep variant.
3. Fixture builders (`packages/engine/test/helpers/spec-160-inner-preview-fixture.ts`, `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-fixture.ts`) — update construction to wrap values in `{ kind: 'ready', value: ... }`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test` (full suite, includes determinism replay tests)
4. `pnpm turbo typecheck` (catches missed migration sites)
