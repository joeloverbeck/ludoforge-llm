# 163GENLOOKUP-003: Runtime resolver + dispatch + observer routing for `lookup` ref family

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new module `agents/policy-lookup-surface.ts`; `agents/policy-runtime.ts` (provider plumbing); `agents/policy-evaluation-core.ts` (dispatch + `resolveLookupRef`); `kernel/types-core.ts` (trace-shape addition for `unknownLookupRefs`)
**Deps**: `archive/tickets/163GENLOOKUP-001.md`

## Problem

The lookup family's runtime path needs three pieces: (a) a provider that reads observer-projected state by collection + key, (b) the dispatch wiring that routes `case 'lookup':` from the existing ref-resolution switch, and (c) the per-candidate `unknownLookupRefs` field that records unavailability without coercing it to a numeric contribution. This ticket lands all three plus the architectural-invariant tests that prove visibility routing, determinism, collection coverage, and runtime keytype-mismatch.

## Assumption Reassessment (2026-05-09)

1. `PolicyPreviewSurfaceProvider` lives at `agents/policy-runtime.ts:71-87`; it is the closest provider analog. The new `PolicyLookupSurfaceProvider` mirrors its shape — `resolveLookup(candidate, ref, seatContext)`.
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
4. **Foundation #8 (Determinism Is Sacred)**: the resolver is pure with respect to its inputs (state, ref, seat context). Replay-twice tests assert byte-identical outcomes including the ordering of `unknownLookupRefs` registrations.
5. **Foundation #10 (Bounded Computation)**: lookup is O(1) per evaluation — one map probe + one path walk. No cap interaction with `INNER_PREVIEW_HARD_CAP`.

## What to Change

### 1. `PolicyLookupSurfaceProvider` interface

Declare in `agents/policy-runtime.ts` adjacent to `PolicyPreviewSurfaceProvider` (`:71-87`):

```ts
export interface PolicyLookupSurfaceProvider {
  resolveLookup(
    candidate: PolicyRuntimeCandidate,
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
    seatContext?: string,
  ): LookupRefStatus;
}
```

Extend `PolicyRuntimeProviders` (`:98-105`) with `readonly lookupSurface: PolicyLookupSurfaceProvider;`.

### 2. New module `policy-lookup-surface.ts`

Create `packages/engine/src/agents/policy-lookup-surface.ts`. Implements `resolveLookup(candidate, ref, seatContext)` against the canonical state via the seat resolution index. Per-collection routing:

- `zones`: read the zone whose ID matches the resolved key. Filter via `CompiledZoneVisibilityCatalog` for the seat's observer profile. Walk `path` against the projected zone object. Hidden zone properties yield `unavailable` with reason `hidden`.
- `tokens`: read the token whose ID matches. Token visibility inherits the owning zone's class (per Spec 102). Hidden-zone tokens yield `unavailable` with reason `hidden`. Walk `path` against the projected token.
- `players`: read the player whose ID matches. Per-player vars consult `CompiledSurfaceCatalog.perPlayerVars`. Walk `path` against the projected player object.
- `globals`: read the global var or marker whose ID (raw string key) matches. Consult `CompiledSurfaceCatalog.globalVars`/`globalMarkers`. Hidden globals (rare) yield `unavailable`.

Runtime keytype validation: compare the resolved key value's branded type against `ref.keyType`. Return `unavailable` with reason `typeMismatch` when they diverge. For `keyType: 'string'`, accept any string-typed key (used by globals; runtime validates global-id existence in the catalog and returns `missing` on unknown ids).

### 3. Wire the provider into `createPolicyRuntimeProviders`

In `policy-runtime.ts:178+`, construct the lookup provider after `currentSurface` and `previewSurface`:

```ts
lookupSurface: {
  resolveLookup(candidate, ref, seatContext) {
    return resolveLookupViaSeatResolution(input.def, ..., candidate, ref, seatContext);
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
  if (candidate === undefined) return undefined;
  const refId = lookupRefKey(ref);
  const resolution = this.runtimeProviders.lookupSurface.resolveLookup(candidate, ref, this.currentSeatContext);
  if (resolution.kind === 'unavailable') {
    candidate.unknownLookupRefs.set(refId, resolution.reason);
    return undefined;
  }
  return resolution.value;
}
```

A small `lookupRefKey(ref)` helper (parallel to the existing `previewOptionRefKey` at `:1681`) produces a stable string id for the ref.

### 6. Dispatch wiring

Replace the fail-closed `case 'lookup':` in `resolveAgentPolicyRef` at `:1156-1199`:

```ts
case 'lookup':
  return this.resolveLookupRef(ref, candidate);
```

### 7. Trace-shape addition

In `kernel/types-core.ts` adjacent to `unknownPreviewRefs` on the trace export (`:1781`), add:

```ts
readonly unknownLookupRefs?: readonly string[];
```

Wire population in `policy-agent.ts` at the per-candidate trace construction sites (`:74-91, 280-310`) by reading `candidate.unknownLookupRefs` and serializing to a string array. Mirror the existing `unknownPreviewRefs` wiring.

### 8. Fixture helper

Author `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` mirroring `preview-integrity-fixture.ts` (257 LoC). Provides:

- A two-seat synthetic state with one zone whose `population` property is public to seat A and hidden from seat B.
- A token in that zone with `properties.owner` reads.
- A players collection with public + private vars.
- A globals collection with at least one public var.
- Helpers: `makeLookupResolver(state, def)`, `makeLookupRef({ collection, keyType, keyValue, path })`, etc.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify — `PolicyLookupSurfaceProvider` interface, `PolicyRuntimeProviders` field, factory wiring)
- `packages/engine/src/agents/policy-lookup-surface.ts` (new — resolver implementation)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — `unknownLookupRefs` field, `resolveLookupRef` method, dispatch case)
- `packages/engine/src/kernel/types-core.ts` (modify — trace-shape `unknownLookupRefs?: readonly string[]`)
- `packages/engine/src/agents/policy-agent.ts` (modify — wire `unknownLookupRefs` into per-candidate trace; the `lookupFallbackFired` wiring lands in ticket 004)
- `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-respects-observer-visibility.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-determinism.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-collection-coverage.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-keytype-mismatch.test.ts` (new)

## Out of Scope

- **No `evaluateConsideration` branch** — the `lookupFallback` consumption in `evaluateConsideration` lands in ticket 004. The runtime resolver returning `undefined` for unavailable lookups is sufficient for the dispatch switch — ticket 004's branch checks `consideration.hasLookupRef` and routes to the fallback handler.
- **No `lookupFallbackFired` field** — added in ticket 004 alongside the consideration-level branch.
- **No fixture profile migration** — no existing fixtures use lookup refs.
- **No cookbook update** — ticket 005.

## Acceptance Criteria

### Tests That Must Pass

1. `lookup-respects-observer-visibility.test.ts` — two-seat fixture: same lookup ref, two seat contexts. Seat A resolves `ready` with the actual value; seat B resolves `unavailable` with reason `hidden`. No path through the resolver returns seat B the authoritative value. **Foundation #4 invariant for the lookup family.**
2. `lookup-determinism.test.ts` — replay-twice harness across all four collection types. Byte-identical trace serialization, identical `unknownLookupRefs` ordering, identical resolution values. **Foundation #8 + #16.**
3. `lookup-collection-coverage.test.ts` — each of the four collections has at least one path-walk depth ≥ 2 verified against a synthetic state. **Plus** `zones`/`tokens`/`players` route visibility through `CompiledZoneVisibilityCatalog` while `globals` route through `CompiledSurfaceCatalog` — both honor the seat context but consult different visibility tables (Spec 163 §8.1 #6 extension).
4. `lookup-keytype-mismatch.test.ts` — profile compiles a lookup with `keyType: ZoneId` whose `key` ref resolves to a `TokenId` at runtime. Resolver returns `unavailable` with reason `typeMismatch`.
5. Existing engine architecture tests pass unchanged: `pnpm -F @ludoforge/engine test:e2e` (or the equivalent architectural-invariant lane).

### Invariants

1. The lookup resolver MUST NOT bypass observer projection. Every read goes through `seatResolutionIndex` and the appropriate visibility catalog.
2. Hidden state MUST yield `unavailable` with reason `hidden`. There is no compile-time or runtime opt-out.
3. The resolver MUST be pure: same inputs (state, ref, seat context) → same `LookupRefStatus` output. Determinism is asserted by `lookup-determinism.test.ts`.
4. `unknownLookupRefs` registration order MUST be deterministic — registrations occur in the order the resolver is called, which is the order considerations dispatch refs. Replay-twice tests assert this.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/lookup-refs/lookup-respects-observer-visibility.test.ts` — `// @test-class: architectural-invariant` — Foundation #4 contract.
2. `packages/engine/test/architecture/lookup-refs/lookup-determinism.test.ts` — `// @test-class: architectural-invariant` — replay identity across all 4 collections.
3. `packages/engine/test/architecture/lookup-refs/lookup-collection-coverage.test.ts` — `// @test-class: architectural-invariant` — path-walk + visibility-routing per collection.
4. `packages/engine/test/architecture/lookup-refs/lookup-keytype-mismatch.test.ts` — `// @test-class: architectural-invariant` — runtime typeMismatch contract.
5. `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` — fixture helper (no `@test-class` marker; not a test file).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/lookup-refs/*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
