# 163GENLOOKUP-003: Runtime resolver + dispatch + observer routing for `lookup` ref family

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new module `agents/policy-lookup-surface.ts`; `agents/policy-runtime.ts` (provider plumbing); `agents/policy-evaluation-core.ts` (dispatch + `resolveLookupRef`); `kernel/types-core.ts` (trace-shape addition for `unknownLookupRefs`)
**Deps**: `archive/tickets/163GENLOOKUP-001.md`, `archive/tickets/163GENLOOKUP-002.md`

## Problem

The lookup family's runtime path needs three pieces: (a) a provider that reads observer-projected state by collection + key, (b) the dispatch wiring that routes `case 'lookup':` from the existing ref-resolution switch, and (c) the per-candidate `unknownLookupRefs` field that records unavailability without coercing it to a numeric contribution. This ticket lands all three plus the architectural-invariant tests that prove visibility routing, determinism, collection coverage, and runtime keytype-mismatch.

## Assumption Reassessment (2026-05-09)

1. `PolicyPreviewSurfaceProvider` lives at `agents/policy-runtime.ts:71-87`; it is the closest provider analog for provider placement, but the lookup provider cannot mirror its candidate-first signature. Lookup keys are ordinary policy expressions, and the main microturn use case resolves `microturn.option.value` through `PolicyEvaluationCore`/completion context rather than through a move candidate. Boundary reset approved 2026-05-09: `PolicyEvaluationCore` evaluates `ref.key` first, then calls `PolicyLookupSurfaceProvider.resolveLookup(ref, resolvedKey, seatContext)`.
2. `PolicyRuntimeProviders` interface at `policy-runtime.ts:98-105` carries `intrinsics`, `candidates`, `currentSurface`, `previewSurface`, `completion?`, `dispose()`. Adding `lookupSurface` is an additive field.
3. `createPolicyRuntimeProviders` factory at `policy-runtime.ts:178+` constructs the provider object; `seatResolutionIndex` is built at `:179` via `createSeatResolutionContext` from `kernel/identity.ts`.
4. `resolveSurfaceRef` at `policy-evaluation-core.ts:1510-1542` is the closest existing observer-routed resolver pattern. It uses `runtimeProviders.previewSurface.resolveSurface(candidate, ref, this.currentSeatContext)` for the preview branch and `runtimeProviders.currentSurface.resolveSurface(ref, this.activeState, this.currentSeatContext)` for the current-state fallthrough.
5. The dispatch switch is `resolveAgentPolicyRef` at `policy-evaluation-core.ts:1156-1199`; ticket 001 added a fail-closed `case 'lookup':` acknowledgement that throws until the resolver exists. This ticket replaces that placeholder with real resolver dispatch.
6. `PolicyEvaluationCandidate.unknownPreviewRefs` is declared at `policy-evaluation-core.ts:91` as a `Map<string, PolicyPreviewUnavailabilityReason>`. The new `unknownLookupRefs` field follows the same shape with `LookupUnavailabilityReason`.
7. Visibility infrastructure is two existing tables: `CompiledSurfaceCatalog` (`kernel/types-core.ts:716-729`, used for `globals`) and `CompiledZoneVisibilityCatalog` (`kernel/types-core.ts:749-752`, used for `zones`/`tokens`/`players`). No new visibility infrastructure is needed.
8. The conventional fixture-helper placement is alongside the architecture test suite (e.g., `test/architecture/preview-integrity/preview-integrity-fixture.ts`, 257 lines). The new helper at `test/architecture/lookup-refs/lookup-refs-fixture.ts` follows that convention.

## Architecture Check

1. **Foundation #4 (Authoritative State and Observer Views)**: the resolver consults the same `seatResolutionIndex` that every other surface ref consults. There is one authoritative state; the lookup never reads it directly. Hidden state always returns `unavailable` with reason `hidden` — no opt-out path.
2. **Foundation #1 (Engine Agnosticism)**: the resolver dispatches by `collection` value (`zones | tokens | players | globals`) — no game-specific identifiers, no per-game shortcuts. The four collections are generic structural primitives.
3. **Foundation #6 (Schema Ownership Stays Generic)**: the resolver consults `CompiledSurfaceCatalog` for `globals` and `CompiledZoneVisibilityCatalog` for entity collections. Both are pre-existing generic catalogs; no new per-game schema is added.
4. **Foundation #8 (Determinism Is Sacred)**: the resolver is pure with respect to its inputs (state, ref, seat context). Tests assert byte-identical lookup outcomes and deterministic `unknownLookupRefs` serialization.
5. **Foundation #10 (Bounded Computation)**: lookup is O(1) per evaluation — one map probe + one path walk. No cap interaction with `INNER_PREVIEW_HARD_CAP`.

## What to Change

### 1. `PolicyLookupSurfaceProvider` interface

Declare in `agents/policy-runtime.ts` adjacent to `PolicyPreviewSurfaceProvider` (`:71-87`):

```ts
export interface PolicyLookupSurfaceProvider {
  resolveLookup(
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
    keyValue: PolicyValue,
    seatContext?: string,
  ): LookupRefStatus;
}
```

Extend `PolicyRuntimeProviders` (`:98-105`) with `readonly lookupSurface: PolicyLookupSurfaceProvider;`.

### 2. New module `policy-lookup-surface.ts`

Create `packages/engine/src/agents/policy-lookup-surface.ts`. Implements `resolveLookup(ref, keyValue, seatContext)` against the canonical state via the seat resolution index. The caller supplies the already-evaluated key value so the lookup provider stays focused on observer-routed collection/path resolution and does not duplicate policy-expression evaluation. Per-collection routing:

- `zones`: read the zone whose ID matches the resolved key. Filter via `CompiledZoneVisibilityCatalog` for the seat's observer profile. Walk `path` against the projected zone object. Hidden zone properties yield `unavailable` with reason `hidden`.
- `tokens`: read the token whose ID matches. Token visibility inherits the owning zone's class (per Spec 102). Hidden-zone tokens yield `unavailable` with reason `hidden`. Walk `path` against the projected token.
- `players`: read the player whose ID matches. Per-player vars consult `CompiledSurfaceCatalog.perPlayerVars`. Walk `path` against the projected player object.
- `globals`: read the global var or marker whose ID (raw string key) matches. Consult `CompiledSurfaceCatalog.globalVars`/`globalMarkers`. Hidden globals (rare) yield `unavailable`.

Runtime keytype validation: compare the resolved key value's branded type against `ref.keyType`. Return `unavailable` with reason `typeMismatch` when they diverge. For `keyType: 'string'`, accept any string-typed key (used by globals; runtime validates global-id existence in the catalog and returns `missing` on unknown ids).

### 3. Wire the provider into `createPolicyRuntimeProviders`

In `policy-runtime.ts:178+`, construct the lookup provider after `currentSurface` and `previewSurface`:

```ts
lookupSurface: {
  resolveLookup(ref, keyValue, seatContext) {
    return resolveLookupViaSeatResolution(input.def, ..., ref, keyValue, seatContext);
  },
},
```

The implementation function lives in `policy-lookup-surface.ts`.

### 4. Add `unknownLookupRefs` field to `PolicyEvaluationCandidate`

At `policy-evaluation-core.ts:89-91`, add alongside `unknownPreviewRefs`:

```ts
readonly unknownLookupRefs: Map<string, LookupUnavailabilityReason>;
```

Initialize the map in the candidate factory (search for `unknownPreviewRefs: new Map()` to find the parallel site).

### 5. `resolveLookupRef` private method

Add to the `PolicyEvaluationCore` class, mirroring `resolveSurfaceRef` at `:1510-1542`:

```ts
private resolveLookupRef(
  ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
  candidate: PolicyEvaluationCandidate | undefined,
): PolicyValue {
  const refId = lookupRefKey(ref);
  const keyValue = this.evaluateCompiledExpr(ref.key, candidate);
  const resolution = this.runtimeProviders.lookupSurface.resolveLookup(ref, keyValue, this.currentSeatContext);
  if (resolution.kind === 'unavailable') {
    candidate?.unknownLookupRefs.set(refId, resolution.reason);
    return undefined;
  }
  return resolution.value;
}
```

A small `lookupRefKey(ref)` helper (parallel to the existing `previewOptionRefKey` at `:1681`) produces a stable string id for the ref.

Boundary note: candidate-less microturn scoring still resolves lookup refs because the key expression comes from the completion provider. `unknownLookupRefs` is recorded on `PolicyEvaluationCandidate` when a real move candidate exists, and the microturn option scorer records its own unknown-lookup map for candidate-less option scoring.

### 6. Dispatch wiring

Replace the fail-closed `case 'lookup':` in `resolveAgentPolicyRef` at `:1156-1199`:

```ts
case 'lookup':
  return this.resolveLookupRef(ref, candidate);
```

### 7. Trace-shape addition

In `kernel/types-core.ts` adjacent to `unknownPreviewRefs` on the trace export (`:1781`), add:

```ts
readonly unknownLookupRefs: readonly PolicyLookupUnknownRefTrace[];
```

Wire population in `policy-agent.ts` at the per-candidate trace construction sites (`:74-91, 280-310`) by reading `candidate.unknownLookupRefs` and serializing to `{ refId, reason }` entries. Mirror the existing `unknownPreviewRefs` wiring with lookup-specific reasons.

### 8. Fixture helper

Author `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` mirroring `preview-integrity-fixture.ts` (257 LoC). Provides:

- A two-seat synthetic state with one public zone and one owner-visible zone whose `population` property is hidden from seat B.
- A public token with `properties.strength` reads.
- A players collection with a seat-visible variable.
- A globals collection with one public var and marker.
- Helpers: `resolveLookup`, `lookupRef`, `literalExpr`, and `scoreLookupOption`.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify — `PolicyLookupSurfaceProvider` interface, `PolicyRuntimeProviders` field, factory wiring)
- `packages/engine/src/agents/policy-lookup-surface.ts` (new — resolver implementation)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — `unknownLookupRefs` field, `resolveLookupRef` method, dispatch case)
- `packages/engine/src/kernel/types-core.ts` (modify — trace-shape `unknownLookupRefs: readonly PolicyLookupUnknownRefTrace[]`)
- `packages/engine/src/agents/policy-agent.ts` (modify — wire `unknownLookupRefs` into per-candidate trace; the `lookupFallbackFired` wiring lands in ticket 004)
- `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-observer-visibility.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-dispatch-determinism.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-collection-coverage.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-keytype-mismatch.test.ts` (new)

## Out of Scope

- **No `evaluateConsideration` branch** — the `lookupFallback` consumption in `evaluateConsideration` lands in ticket 004. The runtime resolver returning `undefined` for unavailable lookups is sufficient for the dispatch switch — ticket 004's branch checks `consideration.hasLookupRef` and routes to the fallback handler.
- **No `lookupFallbackFired` field** — added in ticket 004 alongside the consideration-level branch.
- **No fixture profile migration** — no existing fixtures use lookup refs.
- **No cookbook update** — ticket 005.

## Acceptance Criteria

### Tests That Must Pass

1. `lookup-observer-visibility.test.ts` — two-seat fixture: same lookup ref, two seat contexts. Seat A resolves `ready` with the actual value; seat B resolves `unavailable` with reason `hidden`. No path through the resolver returns seat B the authoritative value. **Foundation #4 invariant for the lookup family.**
2. `lookup-dispatch-determinism.test.ts` — microturn option scoring dispatches lookup refs through resolved option keys, and unavailable lookup refs serialize in deterministic ref-id order. **Foundation #8 + #16.**
3. `lookup-collection-coverage.test.ts` — each of the four collections has at least one path-walk depth ≥ 2 verified against a synthetic state. `zones`/`tokens` route entity visibility through `CompiledZoneVisibilityCatalog`; `players` and `globals` route variable/marker visibility through `CompiledSurfaceCatalog`.
4. `lookup-keytype-mismatch.test.ts` — resolver returns `unavailable` with reason `typeMismatch` when the runtime key exists in a different collection domain than the declared lookup collection/key type.
5. Existing engine architecture tests pass unchanged: `pnpm -F @ludoforge/engine test:e2e` (or the equivalent architectural-invariant lane).

### Invariants

1. The lookup resolver MUST NOT bypass observer projection. Every read goes through `seatResolutionIndex` and the appropriate visibility catalog.
2. Hidden state MUST yield `unavailable` with reason `hidden`. There is no compile-time or runtime opt-out.
3. The resolver MUST be pure: same inputs (state, ref, seat context) → same `LookupRefStatus` output. Determinism is asserted by `lookup-dispatch-determinism.test.ts`.
4. `unknownLookupRefs` trace order MUST be deterministic — candidate traces and microturn option results sort entries by stable ref id before exposing them.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/lookup-refs/lookup-observer-visibility.test.ts` — `// @test-class: architectural-invariant` — Foundation #4 contract.
2. `packages/engine/test/architecture/lookup-refs/lookup-dispatch-determinism.test.ts` — `// @test-class: architectural-invariant` — dispatch through resolved microturn option keys plus deterministic unknown-ref ordering.
3. `packages/engine/test/architecture/lookup-refs/lookup-collection-coverage.test.ts` — `// @test-class: architectural-invariant` — path-walk + visibility-routing per collection.
4. `packages/engine/test/architecture/lookup-refs/lookup-keytype-mismatch.test.ts` — `// @test-class: architectural-invariant` — runtime typeMismatch contract.
5. `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` — fixture helper (no `@test-class` marker; not a test file).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/lookup-refs/*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-09
Outcome amended: 2026-05-09

What landed:

- Added `PolicyLookupSurfaceProvider` plumbing and `packages/engine/src/agents/policy-lookup-surface.ts`.
- Replaced the fail-closed `lookup` runtime dispatch with `resolveLookupRef`, evaluating the lookup key in `PolicyEvaluationCore` before provider resolution.
- Added `unknownLookupRefs` tracking through candidate metadata, microturn option scoring, trace types, Zod schema source, and generated `Trace.schema.json`.
- Added lookup architectural-invariant tests for observer visibility, collection coverage, runtime keytype mismatch, and deterministic dispatch/unknown-ref ordering.

Post-review correction:

- Tightened resolver defense-in-depth so impossible `collection`/`keyType` pairs return `typeMismatch`.
- Added focused coverage proving hidden per-player variables report `hidden` for non-owner observers instead of degrading to `unresolved`.

Deviations from original plan:

- The provider receives the already-resolved key value. This matches the 2026-05-09 boundary reset: `PolicyEvaluationCore` owns policy-expression evaluation, and the lookup provider owns observer-routed collection/path resolution.
- `lookupFallbackFired` and consideration-level fallback consumption remain owned by `tickets/163GENLOOKUP-004.md`.

Schema/artifact fallout:

- `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, and `packages/engine/schemas/Trace.schema.json` now require `unknownLookupRefs` on policy candidate traces.
- Existing hand-authored metadata/schema tests were updated to include empty `unknownLookupRefs` where no lookup refs fire.

Verification:

- `node --test packages/engine/dist/test/architecture/lookup-refs/*.test.js` — passed.
- `pnpm -F @ludoforge/engine test:e2e` — passed.
- `pnpm -F @ludoforge/engine test:unit` — passed.
- `pnpm turbo schema:artifacts` — passed.
- `pnpm turbo build` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — passed.
- `pnpm run check:ticket-deps` — passed.
- Post-review: `pnpm -F @ludoforge/engine build` — passed.
- Post-review: `node --test packages/engine/dist/test/architecture/lookup-refs/lookup-keytype-mismatch.test.js packages/engine/dist/test/architecture/lookup-refs/lookup-observer-visibility.test.js packages/engine/dist/test/architecture/lookup-refs/lookup-collection-coverage.test.js packages/engine/dist/test/architecture/lookup-refs/lookup-dispatch-determinism.test.js` — passed.
- Post-review/archive: `pnpm -F @ludoforge/engine test:e2e` — passed.
- Post-review/archive: `pnpm turbo build` — passed.
- Post-review/archive: `pnpm turbo lint` — passed.
- Post-review/archive: `pnpm turbo typecheck` — passed.
- Post-review/archive: `pnpm turbo test` — passed.
- Post-review/archive: `pnpm run check:ticket-deps` — passed.
- Post-review/archive: `git diff --check` — passed.

Late-edit proof validity:

- The only post-review production edit narrowed the resolver's existing runtime-validation and visibility behavior. The focused lookup architecture tests and broad build/lint/typecheck/test lanes were rerun after that edit.
