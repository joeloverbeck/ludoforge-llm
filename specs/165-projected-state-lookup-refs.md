# Spec 165 — Projected-State Lookup Refs

**Status**: PROPOSED
**Priority**: Medium
**Complexity**: M
**Date**: 2026-05-11
**Predecessors**: Spec 162 (preview signal integrity / Foundation #20), Spec 163 (generic microturn state-feature lookups — current-state surface), Spec 164 (continued inner preview deepening — produces `DriveResult.state` post-completion checkpoint), Spec 158 (microturn policy scope and `microturn.option.value` intrinsic).
**Dependencies**: Spec 162 (closed); Spec 163 (closed); Spec 164 (closed); Spec 158 (closed).
**Related**: A future observer-purity / anti-clairvoyance hardening spec (see §11) would apply uniformly to all preview-derived refs (`preview.option.*` and `lookup.surface: previewOptionState`); it is not a prerequisite for this spec.
**Trigger reports**:
- `reports/projected-state-lookup-refs-2026-05-10.md` — internal campaign report identifying the missing matrix cell (current-state keyed lookup ✅, projected-state scalar preview ✅, projected-state keyed lookup ❌).
- `reports/projected-state-lookup-proposal.md` — external deep-research proposal (ChatGPT-Pro). Reassessed against the codebase by this spec; per-recommendation dispositions in §12.

---

## 1. Goal

Give microturn-scope considerations a generic, observer-routed way to score chooseN ADD candidates and action-selection candidates by a per-object property of the option's referent **at the projected post-completion state** — without forward simulation beyond the existing bounded inner preview. After this spec lands, a profile author can write a consideration like "score this ADD option by the projected ARVN troop count in the target zone after the synthetic completion of the pending action" using one declarative DSL primitive, and the compiled lookup MUST honor Foundation #4 (observer projections), Foundation #10 (bounded computation — no new search), Foundation #17 (typed identifiers), Foundation #19 (decision-granularity uniformity), and Foundation #20 (signal integrity — unavailable projected lookups never silently coerce to numeric contributions).

The new family completes the keyed-state-lookup matrix:

| State source | Surface today | This spec |
|---|---|---|
| Current observer-projected state | `lookup.surface: policyState` (Spec 163) | unchanged |
| Bounded synthetic-completion endpoint, scalar | `preview.option.*` enum (Spec 161/162/164) | unchanged |
| Bounded synthetic-completion endpoint, **keyed per-object** | **missing** | **added** |
| Cross-action / multi-round game-tree search | — | **out of scope** (§3) |

## 2. Context (verified against codebase)

### 2.1 The empty matrix cell

`packages/engine/src/contracts/policy-contract.ts:57-66` defines `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS = ['victoryCurrentMarginSelf', 'victoryCurrentRankSelf', 'deltaVictoryCurrentMarginSelf', 'globalVar', 'perPlayerVarSelf', 'derivedMetric', 'outcome', 'driveDepth']`. These are scalar reads against the post-completion projected state. None are per-zone, per-token, or path-keyed.

`packages/engine/src/kernel/types-core.ts:430-442` defines the existing `lookup` ref with `surface: 'policyState'` only:

```ts
{
  readonly kind: 'lookup';
  readonly surface: 'policyState';
  readonly collection: 'zones' | 'tokens' | 'players' | 'globals';
  readonly keyType: 'ZoneId' | 'TokenId' | 'PlayerId' | 'string';
  readonly key: CompiledPolicyExpr;
  readonly path: readonly string[];
  readonly onMissing: 'unavailable' | { readonly kind: 'constant'; readonly value: number | string | boolean };
  readonly onHidden: 'unavailable';
}
```

The same restriction is mirrored in `packages/engine/src/kernel/schemas-core.ts:706` (`surface: z.literal('policyState')`).

### 2.2 Reuse-able infrastructure (already in place)

- **`DriveResult.state`**: `packages/engine/src/agents/policy-preview-inner.ts:198-205` defines `DriveResult { readonly state: GameState; readonly depth: number; readonly outcome: PolicyPreviewTraceOutcome; ... }`. The `state` field is the post-completion `GameState`. Spec 164 §5.3 documents that the deep pass continues from this state. The same `GameState` shape that `policy-lookup-surface.ts` already operates on.
- **Lookup resolver context already parameterized over state**: `policy-lookup-surface.ts:21-29` defines `PolicyLookupResolutionContext { readonly state: GameState; ... }`. The resolver internals walk paths against whatever `state` is provided; pointing it at `DriveResult.state` requires no game-specific changes.
- **Observer projection at readout**: `policy-lookup-surface.ts:65` (`projectLookupObject`) consults `CompiledZoneVisibilityCatalog` and `CompiledSurfaceCatalog` exactly as Spec 163 routed visibility. The same projection function operates uniformly on any `GameState`.
- **Preview-derived costClass already a join lattice**: `packages/engine/src/cnl/compile-agents.ts:3740-3748` defines `maxCostClass(state < candidate < preview)`. A new `surface: previewOptionState` lookup forces `value.costClass = 'preview'` naturally by joining the lookup machinery's base cost with the synthetic-completion drive cost.
- **Per-candidate `DriveResult` already cached**: `policy-preview-inner.ts:495` drives once per option (`runChooseOneInnerPreview`) and reuses the result across all ref resolutions. The new lookup family reads from the same cache; no additional drives are introduced.
- **Existing visibility-at-readout for preview**: `policy-preview-inner.ts:447` calls `resolveVisibleSurface(input, drive.state, ...)` which routes through `isSurfaceVisibilityAccessible` and `hiddenSamplingZones`, returning `kind: 'hidden'` when the readout would expose information hidden from the acting seat. The new family inherits this same posture — readouts route through `policy-lookup-surface.ts`'s existing observer visibility check, which already returns `unavailable` (reason `hidden`) when the projection is opaque to the seat.

### 2.3 Fallback validation today

`packages/engine/src/cnl/compile-agents.ts:2095-2117` enforces the existing per-discriminant fallback rules:

```ts
const previewOptionRefIds = collectPreviewOptionRefIds(value.expr);
if (previewOptionRefIds.length > 0 && previewFallback === undefined) { /* reject */ }
const lookupRefIds = collectLookupRefIds(value.expr);
if (lookupRefIds.length > 0 && lookupFallback === undefined) { /* reject */ }
```

`collectLookupRefIds` at `compile-agents.ts:3580-3618` already encodes `surface` in the synthesized ref id (`lookup.${surface}.${collection}.${path.join('.')}`), so adding a new surface produces distinct ref ids automatically; the split-by-surface refactor (§5) is small.

### 2.4 Empirical witness

`reports/projected-state-lookup-refs-2026-05-10.md` §2.3-2.5 documents that the FITL ARVN seed-1000 campaign hit a structural ceiling at compositeScore=-6 with Spec 164 deep-pass enabled. Trace shows all 4 deep-pass chooseNStep frontiers (Govern target select, decision idx 1/5/9/13) produced `readyRefStats['preview.option.delta.victory.currentMargin.self'] = { distinctValueCount: 1, range: 0 }`. Root cause: FITL Govern's `+1 patronage per target` is zone-agnostic in its immediate effect formula, so the scalar projected margin delta is uniform across all options. A keyed projected-state lookup would let the author score by *per-zone* projected fields (e.g., post-Train ARVN troop count, post-Pacify support level, post-Sweep activated-guerrilla count) where the per-zone game-rule effect *does* differentiate.

This is exactly the missing matrix cell: when the game rule has per-zone consequences but the aggregate margin formula sums them away, the scalar `preview.option.*` family cannot expose the per-option difference; only a keyed projected-state lookup can.

## 3. Non-goals

- **No cross-action or multi-round simulation.** This spec adds a keyed-readout surface on the *existing* bounded inner-preview output. It does not add game-tree search, opponent modeling, belief sampling, ISMCTS, or rollout policy design. Foundation #10 (bounded computation) is preserved.
- **No per-game projected refs.** No FITL-specific `preview.option.coinControlled.<zone>`, no Texas-Hold'em-specific projected refs. The lookup primitive operates over generic surface collections only. Foundations #1 and #6.
- **No arbitrary checkpoints.** `previewOptionState` resolves only against the ready-completion endpoint (`DriveResult.state` when `outcome === 'ready'`). No "broad state", "deep state", "mid-confirm state", or "state after N microturns" surface in this spec. Deferred.
- **No aggregated projected lookup.** Single-value lookup only, matching Spec 163's posture. Aggregations remain in the existing `zoneTokenAgg` / `adjacentTokenAgg` families against current state. Deferred to a future `lookup-aggregate` spec if authoring demand emerges.
- **No new delta ref family.** `preview.option.delta.lookup.*` is not introduced. Composition via the existing arithmetic operators (`subtract`, etc.) over a `policyState` lookup and a `previewOptionState` lookup is the supported pattern. §4.5.
- **No new observer machinery.** Visibility filtering reuses `policy-lookup-surface.ts`'s existing `projectLookupObject` plus `isSurfaceVisibilityAccessible`. No new visibility table, no new observer profile shape.
- **No standalone `PreviewObserverPurity` discriminator.** The existing preview pipeline relies on visibility-at-readout (`policy-preview-inner.ts:447`); the new family inherits this guarantee. A standalone clairvoyance-hardening spec would apply uniformly to all preview-derived refs (existing `preview.option.*` and the new family) and is deferred. See §11 open question.
- **No new cap class.** Cost accounting reuses Spec 164's named cap classes (`standard256`, `deep1024`). The projected lookup is O(1) per option per ref; cost is `(existing Spec 164 drive budget) + (per-option lookup count × O(1))`.
- **No mutation of Foundation #19 or #20.** Projected lookups report `ready` or `unavailable` with explicit fallback declaration, identical to existing preview refs.

## 4. Architecture

### 4.1 Surface extension

Extend the existing `lookup` ref discriminant in `packages/engine/src/kernel/types-core.ts:430-442` from `surface: 'policyState'` to `surface: 'policyState' | 'previewOptionState'`. All other fields (`collection`, `keyType`, `key`, `path`, `onMissing`, `onHidden`) are unchanged in shape. The schema in `packages/engine/src/kernel/schemas-core.ts:706` mirrors the same extension.

YAML authoring shape:

```yaml
preferProjectedTroopBuildup:
  scopes: [microturn]
  costClass: preview
  weight: 100
  value:
    lookup:
      surface: previewOptionState
      collection: zones
      keyType: ZoneId
      key:
        ref: microturn.option.value
      path: [variables, arvnTroopCount]   # game-defined zone variable
      onMissing: unavailable
  previewFallback:
    onUnavailable: noContribution
```

`onMissing` and `onHidden` keep their existing semantics. `onHidden: 'unavailable'` remains non-overridable (Foundation #4). `onMissing` may still be `'unavailable'` or `{ kind: 'constant'; value }` (refLocal policy, identical to Spec 163).

### 4.2 Resolver refactor

`packages/engine/src/agents/policy-lookup-surface.ts` is refactored to factor out an explicit state-source parameter:

```ts
export type LookupStateProvenance =
  | { readonly kind: 'currentState' }
  | { readonly kind: 'previewOptionState';
      readonly depth: number;
      readonly capClass: string;
      readonly completionPolicy: PolicyPreviewDriveTrace['completionPolicy']; };

export interface LookupStateSource {
  readonly state: GameState;
  readonly provenance: LookupStateProvenance;
}

export function resolveLookupAgainstState(
  context: PolicyLookupResolutionContext,
  source: LookupStateSource,
  ref: LookupRef,
  keyValue: PolicyValue,
  seatContext?: string,
): LookupRefStatus { /* existing path-walk + visibility logic, with context.state replaced by source.state */ }
```

The existing `resolveLookupViaSeatResolution` becomes a thin wrapper that constructs `source = { state: context.state, provenance: { kind: 'currentState' } }` and delegates. No change in behavior for Spec 163 considerations.

### 4.3 Routing in `policy-evaluation-core.ts`

At ref resolution time (`policy-evaluation-core.ts`'s `resolveLookupRef`, added in Spec 163 Phase 2):

1. If `ref.surface === 'policyState'`: delegate to `resolveLookupViaSeatResolution(currentStateContext, ...)`. **Unchanged from Spec 163.**
2. If `ref.surface === 'previewOptionState'`:
   - Require a candidate-bound `DriveResult` in scope. Action-selection candidates and chooseNStep ADD/CONFIRM frontiers without per-option drive context register the canonical per-ref reason `gated` in `unknownPreviewRefs[]` and produce an unavailable value. (Mirrors the existing behavior for `preview.option.*` refs at non-preview frontiers per Spec 162; the aggregate breakdown counter remains named `unknownGated`.)
   - If `drive.outcome !== 'ready'`: return `unavailable` with reason equal to the drive outcome (`depthCap`, `hidden`, `stochastic`, `failed`, `unresolved`). **Depth-capped `DriveResult.state` is NEVER read as if it were a valid endpoint.**
   - Construct `source = { state: drive.state, provenance: { kind: 'previewOptionState', depth: drive.depth, capClass: drive.capClass, completionPolicy: drive.completionPolicy } }` and call `resolveLookupAgainstState`. The existing observer-projected path-walk runs unchanged.

### 4.4 Key evaluation rule

The lookup `key` expression is evaluated **in the root candidate context**, not in the projected state. For chooseNStep ADD frontiers, the typical key is `ref: microturn.option.value`; for action-selection candidates, the typical key is whichever candidate-param surface the existing `microturn.option.value` intrinsic exposes for action-selection (Spec 158). Compile-time validation rejects `previewOptionState` lookups whose key expression transitively reads any preview-derived ref:

- `previewOptionRef` (any `refKind`)
- `lookup` with `surface === 'previewOptionState'`

This avoids cyclic preview dependencies (where the key for a projected lookup would itself require a projection to compute) and keeps cost accounting deterministic. Diagnostic code: `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE`.

### 4.5 Composition over a delta family

Authors who want "projected minus current" compose two lookups arithmetically:

```yaml
preferProjectedTroopDelta:
  scopes: [microturn]
  costClass: preview
  weight: 50
  value:
    subtract:
      - lookup:
          surface: previewOptionState
          collection: zones
          keyType: ZoneId
          key: { ref: microturn.option.value }
          path: [variables, arvnTroopCount]
          onMissing: unavailable
      - lookup:
          surface: policyState
          collection: zones
          keyType: ZoneId
          key: { ref: microturn.option.value }
          path: [variables, arvnTroopCount]
          onMissing: unavailable
  previewFallback:
    onUnavailable: noContribution
  lookupFallback:
    onUnavailable: noContribution
```

When a single `value` expression mixes both surfaces, **both** fallback declarations are required (§4.6). No new `delta.lookup.*` ref family is added.

### 4.6 Fallback contract: split by state source

The required-fallback rule shifts from "discriminant-keyed" to "state-source-keyed":

| Ref in `value` expression | Required fallback |
|---|---|
| `previewOptionRef` (any kind) | `previewFallback.onUnavailable` |
| `lookup.surface: policyState` | `lookupFallback.onUnavailable` |
| `lookup.surface: previewOptionState` | **`previewFallback.onUnavailable`** (NOT `lookupFallback`) |

Rationale: the root cause of unavailability for a `previewOptionState` lookup is the synthetic completion (preview-derived). Authors who already know Spec 162's `previewFallback` contract do not learn a new namespace. A consideration whose `value` mixes current-state lookups and projected-state lookups MUST declare both fallbacks. A consideration whose projected lookup declares only `lookupFallback` is rejected at compile time with `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK`.

`onMissing` and `onHidden` remain ref-local (inside the lookup ref) for both surfaces. Only the *consideration-level* unavailability fallback is repartitioned.

### 4.7 Observer-projection inheritance

Projected lookups inherit two layers of observer protection:

1. **Visibility at readout** (`policy-lookup-surface.ts`'s existing `projectLookupObject`): consults `CompiledZoneVisibilityCatalog` for entity collections and `CompiledSurfaceCatalog` for `globals`. If the seat cannot see the path on the projected state, the lookup returns `unavailable` with reason `hidden`.
2. **`onHidden: 'unavailable'` non-overridable**: as in Spec 163, no `{ kind: 'constant'; value }` override is permitted. Foundation #4 is enforced at compile time, not bypassable at authoring time.

What this does **not** guarantee on its own is drive-time observer-purity (i.e., that the synthetic decisions made *during* `policyGuided` completion do not exploit information hidden from the acting seat). This is a pre-existing concern that already applies to the `preview.option.*` family: a hardening pass that audits the synthetic-completion pipeline for clairvoyance leakage would benefit all preview-derived refs uniformly. This spec inherits the existing guarantee level and documents the gap in §11.

### 4.8 Continued-deepening integration

The Spec 164 deep-pass triggers extend to projected lookups:

- **`allRequestedRefsDepthCapped`**: includes projected lookup refs. A frontier whose only projected-lookup refs all returned `unavailable(depthCap)` at the broad pass triggers the deep pass exactly like a frontier whose `preview.option.*` refs are all depth-capped.
- **`allReadyValuesUniform`**: defined over **post-expression numeric contribution** across candidate options, not over raw ref identity. A preview-derived consideration has usable signal at a frontier iff its `ready` contribution differs across at least two candidate options. This handles projected lookups that return non-numeric scalars later mapped to numbers by the expression system. (See §11 open question 2 for the rationale and one remaining edge case.)

When deepening fires and projected values remain uniform, the trace honestly records `tiebreakAfterPreviewNoSignal` and the agent falls through to the deterministic tiebreaker. No ref family manufactures differentiation where the game rule has none — Foundation #20 honesty.

### 4.9 Trace surface

The trace records each projected-lookup resolution under a surface-qualified ref id:

- `lookup.policyState.zones.properties.population` (Spec 163, unchanged)
- `lookup.previewOptionState.zones.variables.arvnTroopCount` (new)

Per-candidate projected-lookup outcomes appear in:

- `readyRefStats[refId]` — same shape as Spec 162/163, including `distinctValueCount`, `range`, `min`, `max`.
- `unknownLookupRefs[]` — gains entries when the projected lookup is `unavailable` for a path-missing/hidden/type-mismatch reason **at the ready endpoint**. (Drive-induced unavailability like `depthCap` flows through the existing `unknownPreviewRefs[]` channel because the root cause is the drive, not the lookup.)
- `previewFallbackFired` — fires for projected lookups when their `previewFallback.onUnavailable` resolves the contribution to a constant.

The trace consumer can distinguish current-state vs projected-state lookups by the `policyState` vs `previewOptionState` segment of the ref id. No new top-level trace shape is required.

## 5. Compiler changes

`packages/engine/src/cnl/compile-agents.ts`:

1. **Parse `lookup.surface: previewOptionState`.** Update the parser entry that lowers `lookup` ref expressions to accept either surface value. Reject unknown surfaces with `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE` (new diagnostic).
2. **Cost-class promotion.** When `lookup.surface === 'previewOptionState'`, the compiled ref carries `costClass: 'preview'` (the lookup machinery's base cost joined with the synthetic-completion drive cost via the existing `maxCostClass` join lattice at `compile-agents.ts:3740-3748`). The consideration's overall costClass propagates upward through the existing `maxCostClass` chain at line 2121.
3. **Split fallback-required check by surface.** Refactor `collectLookupRefIds` at `compile-agents.ts:3580-3618` into two callers (or one caller with a surface filter):
   - `currentStateLookupRefIds` = lookup refs with `surface: 'policyState'` → require `lookupFallback` (existing Spec 163 rule).
   - `projectedStateLookupRefIds` = lookup refs with `surface: 'previewOptionState'` → require `previewFallback` (new rule).
   The ref-id encoding at line 3586 already includes `surface`, so the split is mechanical. Update the diagnostic message at line 2101 to enumerate both projected-lookup refs and `preview.option.*` refs when reporting missing `previewFallback`.
4. **New diagnostic — projected lookup requires preview fallback**: `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK`. Fires when a consideration's `value` contains any `lookup.surface: previewOptionState` ref AND `previewFallback` is omitted (even if `lookupFallback` is present). Suggestion text mirrors the existing `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` shape.
5. **New diagnostic — projected lookup key not preview-free**: `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE`. Fires when a projected lookup's `key` expression transitively reads any preview-derived ref (`previewOptionRef` or another `lookup.surface: previewOptionState`). Implementation: walk the `key` expression with the existing `collectPreviewOptionRefIds` and (new) `projectedStateLookupRefIds` collectors; if either returns non-empty, emit the diagnostic.
6. **`costClass: preview` declaration consistency.** If the author writes `costClass: state` on a consideration whose `value` contains a `previewOptionState` lookup, the existing `maxCostClass` join already escalates the effective compiled costClass. No new diagnostic is required — the compiled artifact records `preview`, and Spec 164's existing cost-formula validation handles budgeting. (Authors may still write `costClass: preview` for clarity.)

## 6. Runtime changes

Files touched (anchors verified):

- `packages/engine/src/kernel/types-core.ts:430-442` — extend `CompiledAgentPolicyRef`'s `lookup` discriminant surface union from `'policyState'` to `'policyState' | 'previewOptionState'`.
- `packages/engine/src/agents/policy-lookup-surface.ts` — add `LookupStateProvenance` discriminated union (`currentState` vs `previewOptionState`) beside the resolver context, matching §4.2's resolver-adjacent ownership.
- `packages/engine/src/kernel/schemas-core.ts:706` — extend the zod schema to `z.union([z.literal('policyState'), z.literal('previewOptionState')])`.
- `packages/engine/src/agents/policy-lookup-surface.ts` — refactor `resolveLookupViaSeatResolution` into a thin wrapper around a new exported `resolveLookupAgainstState(context, source, ref, keyValue, seatContext?)` that takes an explicit `LookupStateSource`. No behavioral change for Spec 163 callers.
- `packages/engine/src/agents/policy-evaluation-core.ts` — extend `resolveLookupRef` (Spec 163, around `:1510-1542` mirroring `resolveSurfaceRef`) with the routing rule from §4.3. When `ref.surface === 'previewOptionState'`:
  - If no per-candidate `DriveResult` is in scope, record `gated` in `unknownPreviewRefs[]` and produce an unavailable value (NOT `unknownLookupRefs[]` — the unavailability is preview-derived).
  - If `drive.outcome !== 'ready'`, map the drive outcome to a preview-unavailability reason and register in `unknownPreviewRefs[]`.
  - Otherwise delegate to `resolveLookupAgainstState(..., source: { state: drive.state, provenance })`. Path-missing / hidden / type-mismatch outcomes at this stage register in `unknownLookupRefs[]` (the lookup itself was the proximate cause of unavailability, given a successful drive).
- `packages/engine/src/agents/policy-agent.ts` — `traceCandidatesForFrontier` and the structural-frontier dispatch consume the same `unknownPreviewRefs` and `unknownLookupRefs` maps populated above; no shape change.
- `packages/engine/src/agents/policy-preview-inner.ts:447` — unchanged. The existing visibility-at-readout for `preview.option.*` refs continues to work for the scalar family. Projected lookups route through `policy-lookup-surface.ts`'s separate visibility plumbing, not `resolveVisibleSurface`.
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` — Spec 164 deep-trigger evaluation gains awareness of projected-lookup refs in the `allRequestedRefsDepthCapped` check. `allReadyValuesUniform` operates over post-expression numeric contributions per §4.8; this is already the documented semantics in Spec 164 §5.4, this spec only widens the set of refs considered.

No changes to the kernel, compiler-kernel boundary, RNG, or visibility tables themselves. Foundation #4's invariant (observer-routed projection) is reused, not reimplemented.

## 7. Phases and acceptance criteria

| Phase | Deliverable | Acceptance criterion | Effort |
|---|---|---|---|
| 0 | Compiled types + schema + diagnostic codes registry update | Surface union extended in `types-core.ts` and `schemas-core.ts`; `LookupStateProvenance` exported; new diagnostic codes (`CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE`, `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK`, `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE`) registered; `pnpm turbo build` green | XS |
| 1 | Resolver refactor (preserves Spec 163 behavior) | `resolveLookupAgainstState` exported; `resolveLookupViaSeatResolution` becomes a one-line wrapper; full Spec 163 test suite passes byte-identically | S |
| 2 | Compiler lowering + diagnostics | Round-trip test: YAML profile with `lookup.surface: previewOptionState` compiles into the expected ref shape; missing `previewFallback` rejected; non-preview-free key rejected; unknown surface rejected; costClass joined to `preview` | M |
| 3 | Runtime routing in `resolveLookupRef` | Architectural-invariant test: projected lookup at a chooseOne frontier with a ready drive resolves against `DriveResult.state`; same lookup at a depth-capped drive registers `depthCap` in `unknownPreviewRefs`; same lookup at action-selection without a per-option drive registers `gated` in `unknownPreviewRefs` | M |
| 4 | Continued-deepening integration | Architectural-invariant test: a frontier whose only projected lookups all returned `unavailable(depthCap)` triggers the Spec 164 deep pass when `allRequestedRefsDepthCapped` is declared; a frontier whose projected lookups returned `ready` but with uniform post-expression contributions triggers the deep pass when `allReadyValuesUniform` is declared; trace records both phases | S |
| 5 | Cookbook recipe + fixture | `docs/agent-dsl-cookbook.md` gains a "Projected-State Lookups at chooseN Frontiers" section with the decision tree (current vs projected vs scalar vs composed delta); at least one fixture profile in `packages/engine/test/architecture/lookup-refs-projected/` exercises the family end-to-end with a synthetic two-zone state and per-zone projected differentiation | S |

## 8. Test plan

Test classification per `.claude/rules/testing.md`. Architectural-invariant tests live under `packages/engine/test/architecture/lookup-refs-projected/` (mirroring Spec 163's directory pattern), part of the live default blocking engine lane. Convergence-witness tests live under `packages/engine/test/policy-profile-quality/` only when they assert profile-quality trajectories.

### 8.1 architectural-invariant tests

1. **`projected-lookup-ready-endpoint-only.test.ts`** — Two parallel fixtures: (a) drive resolves to `outcome: 'ready'`; (b) drive resolves to `outcome: 'depthCap'`. Same projected lookup ref. Assert: (a) returns the path value walked against `DriveResult.state`; (b) returns `unavailable(depthCap)` and never reads `DriveResult.state` as if it were a valid endpoint. Foundation #20 + Spec 164 integrity preservation.

2. **`projected-lookup-fallback-contract.test.ts`** — Three compilation attempts: (a) projected lookup with only `lookupFallback` declared → rejected with `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK`; (b) projected lookup with only `previewFallback` → compiles; (c) mixed-surface lookup composition with both `previewFallback` and `lookupFallback` → compiles. The diagnostic message includes the projected lookup ref id.

3. **`projected-lookup-key-preview-free.test.ts`** — Three compilation attempts: (a) projected lookup whose `key` reads `microturn.option.value` (preview-free) → compiles; (b) projected lookup whose `key` reads a `preview.option.*` ref → rejected with `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE`; (c) projected lookup whose `key` reads another `lookup.surface: previewOptionState` → rejected with the same diagnostic. Cyclic-dependency prevention.

4. **`projected-lookup-observer-visibility.test.ts`** — Two-seat fixture where seat A can see a zone's `variables.arvnTroopCount` at the projected state and seat B cannot. Same projected lookup ref evaluated under each seat context. Assert: seat A resolves `ready` with the projected value; seat B resolves `unavailable(hidden)`. The path-walk routes through the same observer-projection function as Spec 163 — no new visibility code path is introduced. Foundation #4.

5. **`projected-lookup-onhidden-no-override.test.ts`** — Compilation of a projected lookup with `onHidden: { kind: 'constant'; value: 0 }` is rejected with the existing `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED` diagnostic. Same rule as Spec 163; the new surface does not weaken it.

6. **`projected-lookup-gated-at-action-selection.test.ts`** — Projected lookup referenced at an action-selection frontier (no per-option `DriveResult` in scope under the current preview pipeline). Assert: every candidate records `gated` in `unknownPreviewRefs`; consideration's `previewFallback.onUnavailable: noContribution` produces no contribution. Mirrors Spec 162's gating of `preview.option.*` at non-preview frontiers.

7. **`projected-lookup-costclass-promotion.test.ts`** — Author writes `costClass: state` on a consideration whose `value` contains a projected lookup. Assert: compiled consideration's effective `costClass === 'preview'` via the existing `maxCostClass` join. No diagnostic raised; the join is a quiet escalation.

8. **`projected-lookup-collection-coverage.test.ts`** — Each of the four collections (`zones`, `tokens`, `players`, `globals`) has at least one path-walk depth ≥ 2 verified against `DriveResult.state` from a synthetic completion. Asserts the path walker handles each collection's projection shape uniformly against the projected state. Mirrors Spec 163 §8.1 #6 for the projected surface.

9. **`projected-lookup-determinism.test.ts`** — Replay-twice a microturn that resolves projected lookups; assert byte-identical resolution outcomes, ref-id-sorted `unknownPreviewRefs`, and contribution values. Foundation #8.

### 8.2 compiler tests

10. **`projected-lookup-unknown-surface-rejected.test.ts`** — `surface: 'foo'` rejected with `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE`.

11. **`projected-lookup-policystate-unchanged.test.ts`** — All Spec 163 round-trip tests pass byte-identically after the surface union extension. Foundation #14 says no compatibility shims; this test asserts the *absence* of unintended behavior change in the unchanged surface, not the presence of a shim.

### 8.3 Continued-deepening integration tests

12. **`projected-lookup-deepening-trigger-depthcap.test.ts`** — A frontier whose only requested projected lookups all returned `unavailable(depthCap)` at the broad pass triggers the deep pass when `allRequestedRefsDepthCapped` is declared. The deep pass resolves them; trace records both phases via the Spec 164 `broad`/`deep` coverage sub-blocks.

13. **`projected-lookup-deepening-trigger-uniform.test.ts`** — A frontier whose projected lookups return `ready` but yield uniform post-expression contributions across all candidates triggers the deep pass when `allReadyValuesUniform` is declared. The trigger evaluation operates over the compiled consideration's post-expression numeric contribution per `value.expr`, not over raw ref values, so non-numeric projected lookups participate via their downstream arithmetic.

### 8.4 New fixture creation

A new fixture profile in `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-fixture.ts` (mirroring Spec 163's `lookup-refs-fixture.ts`) exercises each collection on the projected surface. The fixture defines a synthetic two-zone game whose chooseN ADD frontier publishes per-option `ZoneId` values; each candidate's bounded inner-preview produces a distinct projected `variables.troopCount` per zone. The fixture is the canonical witness for the empirical motivation in §2.4 and the cookbook example in Phase 5.

### 8.5 Convergence-witness tests (profile-quality)

14. **FITL ARVN seed-1000 projected-lookup witness** (optional, under `packages/engine/test/policy-profile-quality/`): a profile variant that adds a `preferProjectedPostTrainTroopBuildup` consideration scoring Train target ADD options by the projected post-Train ARVN troop count. Asserts that the consideration's contribution differentiates options. **Not a blocking engine invariant** — profile-quality only. Witness id: `spec-165-projected-lookup-witness`.

## 9. Foundation alignment

| Foundation | Alignment |
|---|---|
| #1 (Engine Agnosticism) | Direct goal — `lookup.surface: previewOptionState` operates over generic state collections against a generic projected `GameState`; no per-game lookup tables, no per-game projected refs |
| #4 (Authoritative State and Observer Views) | Direct goal — projected lookups route through the same `projectLookupObject` plus `CompiledZoneVisibilityCatalog` / `CompiledSurfaceCatalog` pipeline Spec 163 uses; `onHidden: 'unavailable'` non-overridable; visibility-at-readout enforced. Drive-time observer-purity inherited from existing pipeline (see §4.7 and §11) |
| #5 (One Rules Protocol, Many Clients) | Unaffected — kernel-published microturns unchanged |
| #6 (Schema Ownership Stays Generic) | Direct goal — no new per-game schema; the `path` is author-supplied and walked generically |
| #8 (Determinism Is Sacred) | Reinforced — §8.1 #9 proves byte-identical resolution under replay |
| #9 (Replay, Telemetry, and Auditability) | Reinforced — `unknownPreviewRefs` and `unknownLookupRefs` partition by proximate cause (drive vs path); `LookupStateProvenance` exposes depth, capClass, completion policy in the trace |
| #10 (Bounded Computation) | Direct goal — no new search; lookups are O(1) per option per ref; Spec 164's cap classes accommodate the additional path-walk work within existing budgets |
| #12 (Compiler-Kernel Validation Boundary) | Reinforced — three new compile-time diagnostics catch authoring errors at compile time |
| #14 (No Backwards Compatibility) | Honored — surface union extended in-place; no `lookup_v2` alias; Spec 163's `surface: 'policyState'` semantics unchanged; no shim layer. Authors who previously wrote `surface: 'policyState'` continue without modification |
| #15 (Architectural Completeness) | Direct goal — closes the empty matrix cell identified in `reports/projected-state-lookup-refs-2026-05-10.md` §2.5; no symptom-level workaround |
| #16 (Testing as Proof) | Direct goal — §8 enumerates architectural-invariant, compiler, and deepening-integration tests proving each property |
| #17 (Strongly Typed Domain Identifiers) | Aligned — `keyType` continues to enforce branded `ZoneId`, `TokenId`, `PlayerId` against the projected `GameState`'s `MoveParamScalar` surface; raw `'string'` for `globals` per Spec 163 §11 |
| #19 (Decision-Granularity Uniformity) | Reinforced — projected lookups apply uniformly across `chooseOne`, `chooseNStep` ADD, and any future microturn kind that publishes typed option values plus a per-option drive |
| #20 (Preview Signal Integrity) | Reinforced — projected lookups extend the integrity contract: drive-induced unavailability flows through `previewFallback`; path-induced unavailability at a ready drive flows through the same `previewFallback` (state-source-keyed contract, §4.6); explicit fallback declared in YAML; status visible in trace |

## 10. Code anchors for implementers

- `packages/engine/src/kernel/types-core.ts:430-442` — `CompiledAgentPolicyRef` `lookup` discriminant (extend `surface` union)
- `packages/engine/src/kernel/schemas-core.ts:706` — zod schema (mirror the union)
- `packages/engine/src/agents/policy-preview-inner.ts:198-205` — `DriveResult` shape (the projected `state` source)
- `packages/engine/src/agents/policy-preview-inner.ts:447` — existing visibility-at-readout for `preview.option.*` (reference pattern, NOT touched)
- `packages/engine/src/agents/policy-lookup-surface.ts:19` — `LookupRef = Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>` (now spans both surfaces)
- `packages/engine/src/agents/policy-lookup-surface.ts:21-29` — `PolicyLookupResolutionContext` (parameterized over `state`; the resolver refactor extracts `LookupStateSource` here)
- `packages/engine/src/agents/policy-lookup-surface.ts:51-70` — `resolveLookupViaSeatResolution` (becomes a wrapper around `resolveLookupAgainstState`)
- `packages/engine/src/agents/policy-evaluation-core.ts` — `resolveLookupRef` (extend with §4.3 routing)
- `packages/engine/src/agents/policy-agent.ts` — `traceCandidatesForFrontier` (no shape change; consumes existing `unknownPreviewRefs` / `unknownLookupRefs` maps)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` — Spec 164 deep-trigger evaluation (extend `allRequestedRefsDepthCapped` to include projected-lookup refs)
- `packages/engine/src/cnl/compile-agents.ts:2095-2117` — required-fallback diagnostics (split-by-surface refactor; new diagnostic codes)
- `packages/engine/src/cnl/compile-agents.ts:3580-3618` — `collectLookupRefIds` (split into surface-keyed collectors; ref-id encoding at `:3586` already includes surface)
- `packages/engine/src/cnl/compile-agents.ts:3740-3748` — `maxCostClass` (already escalates to `preview` when any leaf is `preview`; no change)
- `packages/engine/src/contracts/policy-contract.ts:57-66` — `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS` (UNCHANGED; this spec does NOT add scalar enum variants)
- `docs/agent-dsl-cookbook.md` — "Projected-State Lookups at chooseN Frontiers" section (Phase 5)
- `docs/FOUNDATIONS.md:91-95, 125-129, 131-137` — Foundations #14, #19, #20 (UNCHANGED; this spec extends their scope to a new ref family without amending text)

## 11. Open questions

1. **Drive-time observer-purity hardening (deferred — separate future spec)**: The existing preview pipeline relies on visibility-at-readout (`policy-preview-inner.ts:447` plus `policy-lookup-surface.ts`'s `projectLookupObject`), not drive-time observer-purity. `policyGuided` synthetic decisions during the inner completion can in principle exploit information hidden from the acting seat to choose a synthetic path the agent wouldn't have chosen under projection; the resulting `DriveResult.state` would then be contaminated. This concern applies uniformly to all preview-derived refs (existing `preview.option.*` and the new projected lookups), and a hardening pass — auditing the synthetic-completion pipeline for clairvoyance leakage, possibly introducing a `PreviewObserverPurity` discriminator across the preview surface as proposed in `reports/projected-state-lookup-proposal.md` — should be authored as its own spec. This spec inherits the existing posture and does not block on the hardening. The empirical FITL ARVN seed-1000 witness in §2.4 is in a fully-public information regime (no hidden zone tokens for the COIN faction's view of ARVN zones), so the v1 deliverable produces correct behavior under the current pipeline.

2. **`allReadyValuesUniform` semantics for non-numeric projected lookups**: §4.8 defines the trigger over post-expression numeric contribution. A projected lookup that returns a string or boolean is mapped to a number only after the expression system processes it. Spec 164's existing definition is already over numeric contributions; this spec narrows the documentation but does not change Spec 164 semantics. Open edge case: a projected lookup whose value is consumed by a conditional (`when`-clause-style) that produces non-numeric contributions skips the trigger evaluation. This is acceptable for v1 — the conditional case is rare and the deep pass would not improve the situation regardless. Reassess if profile-quality witnesses demonstrate that the edge case blocks differentiation in practice.

3. **Path-stability convention for game-defined zone variables**: Projected lookups against `variables.<x>` rely on the game spec initializing `<x>` to a stable default for every zone. A path that exists on some zones but not others at the projected endpoint is legal (returns `unavailable(missing)` for the absent zones, fallback fires), but it produces a fallback-heavy signal. The cookbook (Phase 5) will recommend initializing zone/token/player variables to stable defaults if authors want projected lookups to be reliable. The compiler does NOT enforce game-defined variable existence (would require a per-game schema, violating Foundation #6); validation remains runtime-only with explicit fallback declaration.

4. **Token-collection key resolution at projected state**: Tokens may move between zones during the synthetic completion. A projected lookup keyed by a `TokenId` resolves against the *projected* token location (i.e., the zone where the token resides in `DriveResult.state`). This matches Spec 163's resolver pattern (which already locates a token by traversing `state.zoneVars`) and is the intuitive behavior for "projected per-token property". No compile-time disambiguation is needed; the runtime behavior is well-defined by the resolver's existing implementation.

## 12. Reassessment of source proposal

`reports/projected-state-lookup-proposal.md` (ChatGPT-Pro deep research) reassessed against the codebase:

| Recommendation | Disposition | Rationale |
|---|---|---|
| Extend `lookup` family with `surface: 'previewOptionState'` (vs new family or `preview.option.lookup.*`) | **Adopted** (§4.1) | Codebase verification: surface field already exists; `PolicyLookupResolutionContext` parameterized over state; resolver refactor is small. Maximum reuse, minimum new surface area. |
| Resolver refactor: `resolveLookupAgainstState(ref, source, evalContext)` | **Adopted** (§4.2) | Codebase verification: `PolicyLookupResolutionContext` already mostly parameterized; factoring `LookupStateSource` is a one-pass refactor. |
| Ready-completion endpoint only (depth-cap → unavailable) | **Adopted** (§4.3) | Resolves the path-stability concern cleanly. Depth-capped `DriveResult.state` is documented in Spec 164 §5.3 as a continuation checkpoint, not an evaluation endpoint. |
| Key evaluation in root candidate context | **Adopted** (§4.4) | Matches existing Spec 158/163 plumbing; `microturn.option.value` is the canonical key intrinsic. |
| Compile-time rule: projected-lookup key must be preview-free | **Adopted** (§4.4, §5.5) | Prevents cyclic preview dependencies. Implementation reuses existing `collectPreviewOptionRefIds`. |
| `costClass: preview` for projected lookups | **Adopted** (§5.2) | The existing `maxCostClass` join lattice escalates naturally. |
| Composition over new delta family | **Adopted** (§4.5, non-goal in §3) | No `preview.option.delta.lookup.*`; existing arithmetic ops suffice. |
| Fallback contract: state-source-keyed (`previewOptionState` → `previewFallback`) | **Adopted** (§4.6, §5.3-5.4) | Requires splitting `collectLookupRefIds` by surface in the compiler. The split is mechanical because the ref-id encoding at `compile-agents.ts:3586` already includes `surface`. |
| `previewFallback` for projected lookups, NOT new `previewLookupFallback` namespace | **Adopted** (§4.6) | Avoids teaching authors a third fallback namespace. |
| Mixed-surface compositions require both `previewFallback` and `lookupFallback` | **Adopted** (§4.5) | Symmetric and authoring-friendly. |
| `onHidden: 'unavailable'` non-overridable | **Adopted** (§4.7) | Same rule as Spec 163; not weakened by the new surface. |
| Trace records surface-qualified ref IDs | **Adopted** (§4.9) | Mechanical: ref-id encoding at `compile-agents.ts:3586` already includes surface. |
| Trace records `LookupStateProvenance` (depth, capClass, completionPolicy) | **Adopted** (§4.2, §4.9) | Aligned with Foundation #9 (Auditability). |
| Continued-deepening triggers (`allRequestedRefsDepthCapped` includes projected lookups; `allReadyValuesUniform` defined over post-expression numeric contributions) | **Adopted** (§4.8) | Spec 164 §5.4 already documents the per-microturn evaluation; this spec widens the ref set, not the trigger semantics. |
| Foundation labels corrected: #14 = "No Backwards Compatibility", #19 = "Decision-Granularity Uniformity", #20 = "Preview Signal Integrity" | **Adopted with thanks** (§9) | The internal report's labels were stale; ChatGPT-Pro's read of `docs/FOUNDATIONS.md:91-95, 125-129, 131-137` is correct. Spec 165's Foundation alignment table uses the corrected labels. |
| Anti-clairvoyance / observer-purity as a "non-negotiable safety invariant" with a `PreviewObserverPurity` discriminator | **Deferred to a separate future spec** (§4.7, §11 open question 1) | Codebase verification: the existing `preview.option.*` family already relies on visibility-at-readout, not drive-time observer-purity. The drive-time concern is pre-existing and applies uniformly across all preview-derived refs. Hardening should be authored as its own spec applying to the full preview pipeline; this spec inherits the existing posture rather than introducing a new discriminator that bifurcates only one ref family's contract. |
| Trace shape: `ProjectedLookupTrace` as a new dedicated interface | **Adopted in spirit, simplified in shape** (§4.9) | Codebase verification: existing `readyRefStats`, `unknownPreviewRefs`, `unknownLookupRefs`, and `previewFallbackFired` channels already carry the needed fields. The dedicated interface is not necessary; surface-qualified ref ids plus `LookupStateProvenance` in the resolver context provide the same observability with less new schema. |
| Test distribution (architectural-invariant blocking, golden-trace, convergence-witness profile-quality) | **Adopted** (§8) | Aligned with `.claude/rules/testing.md`. The convergence-witness FITL test is non-blocking profile-quality per the existing rules. |
| Cookbook decision tree (current vs projected vs scalar vs composed delta) | **Adopted** (§4.5, Phase 5) | Cookbook recipe authored in Phase 5; matches the trichotomy in `reports/projected-state-lookup-refs-2026-05-10.md` §6.4. |
| Cross-action / multi-round preview, per-game projected refs, arbitrary checkpoints, aggregations, ISMCTS / belief sampling | **Confirmed out of scope** (§3) | Each violates a clearly-stated Foundation (#1, #6, #10) or expands authoring axes unboundedly. The internal report and the external proposal align on these defers. |

## 13. Follow-On Tickets

Decomposition under namespace `165PROSTALOO-*`:

- `165PROSTALOO-001` — Phase 0: surface union extension in `types-core.ts` and `schemas-core.ts`; `LookupStateProvenance` export; diagnostic codes registry update.
- `165PROSTALOO-002` — Phase 1: resolver refactor — extract `resolveLookupAgainstState` from `resolveLookupViaSeatResolution`; preserve byte-identical Spec 163 behavior.
- `165PROSTALOO-003` — Phase 2: compiler lowering for `lookup.surface: previewOptionState`; split fallback-required check by surface; new diagnostics `CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE`, `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK`, `CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE`; costClass join already covered by existing infrastructure.
- `165PROSTALOO-004` — Phase 3: runtime routing in `policy-evaluation-core.ts`'s `resolveLookupRef`; per-candidate `DriveResult` consumption; `unknownPreviewRefs` vs `unknownLookupRefs` partitioning by proximate unavailability cause.
- `165PROSTALOO-005` — Phase 4: continued-deepening integration — extend `allRequestedRefsDepthCapped` evaluation to include projected-lookup refs; widen `allReadyValuesUniform` documentation to clarify post-expression numeric contribution semantics (no Spec 164 behavior change).
- `165PROSTALOO-006` — Phase 5: cookbook recipe in `docs/agent-dsl-cookbook.md` ("Projected-State Lookups at chooseN Frontiers") + new fixture profile in `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-fixture.ts` exercising the family end-to-end on a synthetic two-zone game.

Each ticket records its own acceptance criteria, dependencies, and architectural-invariant test ownership.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-11:

- [`archive/tickets/165PROSTALOO-001.md`](../archive/tickets/165PROSTALOO-001.md) — Extend `lookup.surface` union, export `LookupStateProvenance`, register new diagnostic codes (covers Phase 0)
- [`archive/tickets/165PROSTALOO-002.md`](../archive/tickets/165PROSTALOO-002.md) — Extract `resolveLookupAgainstState` from `resolveLookupViaSeatResolution` (covers Phase 1 / §4.2)
- [`archive/tickets/165PROSTALOO-003.md`](../archive/tickets/165PROSTALOO-003.md) — Compiler lowering for `lookup.surface: previewOptionState` and surface-keyed fallback split (covers Phase 2 / §4.6 / §5)
- [`archive/tickets/165PROSTALOO-004.md`](../archive/tickets/165PROSTALOO-004.md) — Runtime routing for `lookup.surface: previewOptionState` in `resolveLookupRef` (covers Phase 3 / §4.3 / §6)
- [`archive/tickets/165PROSTALOO-005.md`](../archive/tickets/165PROSTALOO-005.md) — Continued-deepening integration — widen Spec 164 triggers to projected-lookup refs (covers Phase 4 / §4.8)
- [`tickets/165PROSTALOO-006.md`](../tickets/165PROSTALOO-006.md) — Cookbook recipe + end-to-end projected-lookup fixture (covers Phase 5 / §4.5)
