# Spec 163 — Generic Microturn State-Feature Lookups

**Status**: PROPOSED
**Priority**: Medium
**Complexity**: M
**Date**: 2026-05-09
**Predecessors**: Spec 162 (preview signal integrity / Foundation #20), Spec 158 (microturn policy scope and refs), Spec 113 (preview state policy surface), Spec 102 (shared observer model).
**Dependencies**: Spec 162 (closed); Spec 158 (closed); Spec 113 (closed); Spec 102 (closed).
**Related**: Spec 164 (continued inner preview deepening — orthogonal preview-budget deepening; no interaction with the lookup family).
**Trigger reports**: `archive/specs/162-preview-signal-integrity.md` §11 (out-of-scope, Spec 163 carve-out); `reports/preview-signal-integrity.md` §5 (external deep-research proposal — reassessed against the codebase by this spec).

---

## 1. Goal

Give microturn-scope considerations a generic, observer-routed way to score chooseN target options by a visible property of the option's referent — without forward simulation. After this spec lands, a profile author can write a consideration like "score this ADD option by the visible population of the zone it names" using one declarative DSL primitive, and the compiled lookup MUST honor Foundation #4 (observer projections), Foundation #17 (typed identifiers), and Foundation #20 (signal integrity — unavailable lookups never silently coerce to numeric contributions).

The lookup family is **non-preview**. It complements `preview.option.*` refs with a static-state alternative that resolves at the current observer projection of `state`, not at a synthetic forward state. Profiles whose chooseN frontiers were starved of preview signal under Spec 162's integrity contract gain an honest, bounded source of differentiating evidence.

## 2. Context (verified against codebase)

The chooseN frontier microturn evaluator (`microturn-option-evaluator.ts`) consumes a `MoveParamValue` per ADD candidate (`microturn.option.value`). Today's policy DSL has zero generic primitives for "look up a state object whose ID is the option value". The closest existing surfaces are:

| Need | Closest existing primitive | Gap |
|---|---|---|
| Read a property of a specific zone | `zoneProp` (`packages/engine/src/kernel/types-core.ts:522-526`) | Static zone reference; no support for a key expression that names the zone at evaluation time |
| Aggregate over tokens in a zone | `zoneTokenAgg` (`types-core.ts:547-549`) | Aggregation, not single-object property read; aggregator already keyed by static zone |
| Read state via observer projection | `resolveSurfaceRef` for `previewSurface` (`policy-evaluation-core.ts:1510-1542`) | Routes only the preview-surface family; current-state surface is not exposed as a keyed lookup |
| Validate ID type at compile time | Branded types in `kernel/branded.ts` | Type system supports it; the compiler does not enforce it on policy refs today |

The runtime infrastructure to support a keyed lookup already exists:
- `currentSeatContext` is declared on the evaluation core at `policy-evaluation-core.ts:279` and threaded as the third argument to surface providers (`previewSurface.resolveSurface` at `:1520`, `currentSurface.resolveSurface` at `:1541`); `seatResolutionIndex` is built inside `createPolicyRuntimeProviders` at `policy-runtime.ts:179` (via `createSeatResolutionContext` from `kernel/identity.ts`). Visibility filtering routes uniformly for every existing surface ref.
- `MoveParamScalar` (`types-ast.ts:677`) carries `TokenId | ZoneId | PlayerId | string | number | boolean`. ADD-option values for chooseN target microturns are already strongly typed.
- Visibility infrastructure is two existing tables, not one. `CompiledSurfaceCatalog` (`kernel/types-core.ts:716-729`) records per-surface visibility for **global-state surfaces** (`globalVars`, `globalMarkers`, `perPlayerVars`, `derivedMetrics`, `victory`, `activeCardIdentity`/`Tag`/`Metadata`/`Annotation`); `CompiledZoneVisibilityCatalog` (`kernel/types-core.ts:749-752`) plus the Spec 102 `CompiledObserverCatalog` records per-zone observer visibility for entity state. The lookup family rides whichever table is appropriate for each `collection`; no new visibility infrastructure is needed.

What is missing is a single new ref discriminant in `CompiledAgentPolicyRef` plus a runtime resolver. This spec adds them. No new observer machinery, no new visibility infrastructure, no new game-specific surfaces.

In FITL ARVN seed 1000 (Spec 162's witness), the four `tiebreakAfterPreviewNoSignal` chooseNStep decisions involve target-zone ADD options that have a visible `population` property in the current observer projection. A `lookup`-driven consideration would resolve to a non-zero contribution at those exact frontiers under Spec 162's signal-integrity contract, restoring honest differentiation without raising the inner-preview cap.

## 3. Non-goals

- **No DataAsset access.** DataAssets are a kernel-side authoring concept; exposing them at the policy-evaluation layer would couple per-game schema to the agent runtime and violate Foundations #1 and #6. Deferred to a future spec if authoring demand emerges.
- **No preview-pipeline changes.** This spec adds a non-preview ref family. Preview deepening is Spec 164; this spec must not raise, lower, or reshape `INNER_PREVIEW_HARD_CAP` or any preview budget.
- **No new aggregation operators.** `lookup` returns a single value (or an unavailable status). Aggregations across multiple matching state objects continue to use the existing `zoneTokenAgg` family. A future "lookup-aggregate" hybrid is out of scope.
- **No game-specific lookup tables.** No FITL `population` shortcut, no Texas Hold'em pot-odds shortcut. The lookup primitive operates over generic surface collections only.
- **No new observer machinery.** All visibility filtering reuses the seat-resolution path that `resolveSurfaceRef` already takes.
- **No mutation of Foundation #20.** Lookup refs report `ready` or `unavailable` exactly like preview refs. Unavailable lookups MUST declare an explicit fallback or omit a contribution; the existing `previewFallback` mechanism is repurposed (renamed at the compiled-shape layer — see §5).

## 4. Architecture

### 4.1 New ref discriminant

Extend `CompiledAgentPolicyRef` (`types-core.ts:393-443`) with a `lookup` variant:

```ts
type CompiledAgentLookupRef = {
  readonly kind: 'lookup';
  readonly surface: 'policyState';
  readonly collection: 'zones' | 'tokens' | 'players' | 'globals';
  readonly keyType: 'ZoneId' | 'TokenId' | 'PlayerId' | 'string';
  readonly key: CompiledAgentPolicyExpression;   // typically { ref: 'microturn.option.value' }
  readonly path: readonly string[];              // e.g., ['properties', 'population']
  readonly onMissing: 'unavailable' | { kind: 'constant'; value: number | string | boolean };
  readonly onHidden: 'unavailable';              // hidden state ALWAYS yields unavailable; no override
};
```

Resolution semantics:

1. Evaluate `key` to a `MoveParamScalar`. If the value's runtime type does not match `keyType`, return `unavailable` with reason `typeMismatch`.
2. Look up the named entity in the **observer-projected** state for `currentSeatContext.seatId`. If the entity does not exist in that projection, the disposition is governed by `onMissing` — when `onMissing: 'unavailable'`, return `unavailable` with reason `missing`; when `onMissing: { kind: 'constant', value: V }`, return `ready` with `value: V`.
3. Walk `path` against the projection of the entity. If any intermediate is hidden under the seat's observer view, return `unavailable` with reason `hidden`. (`onHidden` is fixed to `unavailable` to enforce Foundation #4 — there is no opt-out for reading hidden state.)
4. If the terminal value's TypeScript type is not `PolicyValue`-compatible (number/string/boolean), return `unavailable` with reason `unresolved`.
5. Otherwise, return `ready` with the projected value.

The output type aligns with `PreviewOptionRefStatus` (introduced by Spec 162):

```ts
type LookupRefStatus =
  | { kind: 'ready'; value: PolicyValue }
  | { kind: 'unavailable'; reason: LookupUnavailabilityReason };

type LookupUnavailabilityReason =
  | 'hidden'
  | 'missing'
  | 'typeMismatch'
  | 'unresolved';
```

### 4.2 Consideration-level fallback semantics (parallel to Spec 162 `previewFallback`)

Spec 162 introduced `previewFallback.onUnavailable` for considerations whose `value` resolves through `previewOptionRef`. This spec adds an analogous compiled field `lookupFallback.onUnavailable` for considerations whose `value` resolves through `CompiledAgentLookupRef`. The YAML shape mirrors Spec 162:

```yaml
preferHighPopulationTarget:
  scopes: [microturn]
  weight: 50
  value:
    lookup:
      surface: policyState
      collection: zones
      keyType: ZoneId
      key:
        ref: microturn.option.value
      path: [properties, population]
      onMissing: unavailable
  lookupFallback:
    onUnavailable: noContribution      # default — contribution is OMITTED, not 0
    # alternative:
    # onUnavailable: { constant: 0 }
```

**Default change**: a consideration with a `lookup`-typed value MUST declare `lookupFallback`; absence emits `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` at compile time. This mirrors Spec 162's `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` and preserves Foundation #20's prohibition against silent coercion.

The `unknownAs` field continues to apply only to non-preview, non-lookup unknown values within the same consideration — exactly the same scoping rule Spec 162 documented.

**Trace surface**: per-candidate trace gains `unknownLookupRefs: readonly { refId: string; reason: LookupUnavailabilityReason }[]` (parallel to `unknownPreviewRefs`) and Phase 3 adds `lookupFallbackFired?: { termId: string; kind: 'noContribution' | 'constant'; value?: number }` (parallel to `previewFallbackFired`). Selection-reason classification gains no new variants — `tiebreakAfterPreviewNoSignal` and `fallbackExplicit` from Spec 162 already cover the cross-product of preview/lookup unavailability when both ref families are in play. The existing `tiebreakAfterPreviewNoSignal` variant name reads as preview-specific but is interpreted as "ref-no-signal" semantically once the lookup family is wired. This spec deliberately does not churn the trace surface for a cosmetic rename (Foundation #14); a future unification pass may consolidate the nomenclature.

### 4.3 Observer routing

The lookup resolver MUST consult the same `seatResolutionIndex` that the existing surface providers consult. There is one authoritative state; the lookup never reads it directly. Implementation: extend `PolicyRuntimeProviders` (`policy-runtime.ts:98-105`) with a `lookupSurface: PolicyLookupSurfaceProvider` field exposing `resolveLookup(ref, keyValue, seatContext)`. `PolicyEvaluationCore` evaluates `ref.key` first because the main `microturn.option.value` use case is resolved through completion context, not a move candidate; the provider owns only observer-routed collection/path resolution. Wire the provider inside `createPolicyRuntimeProviders` (`policy-runtime.ts:178`).

Hidden-state semantics are uniform across both visibility tables: any property the seat does not own visibility for returns `unavailable` with reason `hidden`. Each `collection` routes through the appropriate existing table:

| `collection` | Visibility source | Notes |
|---|---|---|
| `zones` | `CompiledZoneVisibilityCatalog` (per-zone tokens/order classes) | Zone-property reads filter via observer projection of zone state |
| `tokens` | `CompiledZoneVisibilityCatalog` (token visibility inherits owning zone class) | Hidden-zone tokens are unobservable; private-prop tokens reveal only their public projection |
| `players` | Per-player surface entries inside `CompiledSurfaceCatalog` (`perPlayerVars`) plus per-seat hand/hidden-zone visibility | The seat owning a player sees private vars; other seats see only public projections |
| `globals` | `CompiledSurfaceCatalog` (`globalVars`, `globalMarkers`) | All seats see public globals; private globals (if any) yield `hidden` for non-owning seats |

Omniscient policies (the testing-only profile family that bypasses observer filtering) read the authoritative state directly; this spec does not change that path, but the lookup resolver MUST honor whichever observer mode the consideration's seat context declares.

## 5. Compiler changes

`packages/engine/src/cnl/compile-agents.ts`:

1. **Lower `lookup` value expressions.** Parse the YAML `value: { lookup: { ... } }` block into `CompiledAgentLookupRef`. Validate:
   - `surface` is `policyState` (only allowed value in this spec).
   - `collection` is one of the four supported names.
   - `keyType` is one of the supported branded-type names.
   - `key` is a compileable policy expression.
   - `path` is a non-empty array of strings.
   - `onMissing` is `unavailable` or a `{ kind: 'constant', value }` literal.
   - `onHidden` is absent or set to `unavailable` (any other value is rejected with `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED`).

2. **Validate `keyType` against `key`'s runtime value.** No microturn-option-type catalog exists today (verified during reassessment); a static `keyType` check would require building one as a prerequisite. Per Foundation #14 and YAGNI, the typecheck is performed at runtime only — the resolver returns `unavailable` with reason `typeMismatch` when the runtime value's branded type does not match the declared `keyType`. Foundation #17 is honored by the runtime branded-type comparison. If a static catalog is later introduced (out of scope here), the static check can be added without changing the runtime contract.

3. **Require `lookupFallback` for lookup-typed considerations.** Detect considerations whose compiled `value` AST contains a `CompiledAgentLookupRef` and whose `lookupFallback` is unset; emit `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` (error). Diagnostic must name the consideration id, the lookup ref id, and suggest both `lookupFallback: { onUnavailable: noContribution }` and `lookupFallback: { onUnavailable: { constant: 0 } }`.

4. **No cap interaction.** Lookup compilation does not touch `INNER_PREVIEW_HARD_CAP` or any preview budget. The cost of a lookup is O(1) per evaluation (one map probe + one path walk).

## 6. Runtime changes

Files touched (anchors verified):

- `packages/engine/src/kernel/types-core.ts` — extend `CompiledAgentPolicyRef` union (`:393-443`), add `CompiledAgentLookupRef`, `LookupUnavailabilityReason`, `LookupRefStatus`. Add `lookupFallback` to compiled consideration shape (parallel to existing `previewFallback` declared around `:628`/`:823`; lowering plumbed in `compile-agents.ts:196`).

- `packages/engine/src/agents/policy-runtime.ts` — extend `PolicyRuntimeProviders` (`:98-105`) with a `lookupSurface: PolicyLookupSurfaceProvider` slot; declare `PolicyLookupSurfaceProvider` near `PolicyPreviewSurfaceProvider`; wire the lookup provider inside `createPolicyRuntimeProviders` (`:178`+). Unlike preview, the lookup provider accepts an already-evaluated key value so expression evaluation stays in `PolicyEvaluationCore`.

- `packages/engine/src/agents/policy-evaluation-core.ts` — add `resolveLookupRef(candidate, ref)` method (mirroring `resolveSurfaceRef` at `:1510-1542`); evaluate `ref.key`, route through `runtimeProviders.lookupSurface`, and register unavailability into a per-candidate `unknownLookupRefs` map when a real candidate exists (parallel to the existing `unknownPreviewRefs` field declared at `:91` and registered at `:1529`). The consideration-level `lookupFallback` branch is Phase 3 / `163GENLOOKUP-004`.

- `packages/engine/src/agents/policy-agent.ts` — `traceCandidatesForFrontier` and the structural-frontier dispatch populate `unknownLookupRefs` from per-candidate tracking, mirroring the Spec 162 `unknownPreviewRefs` wiring at lines 74-91 and 280-310. `lookupFallbackFired` is Phase 3 / `163GENLOOKUP-004`.

- New module `packages/engine/src/agents/policy-lookup-surface.ts` — implements `resolveLookup(ref, keyValue, seatContext)` against the canonical state via the seat resolution index. Handles the four collections (`zones`, `tokens`, `players`, `globals`) and the visibility check, routing to `CompiledZoneVisibilityCatalog` for entity collections and `CompiledSurfaceCatalog` for `globals`.

No changes to the kernel, compiler-kernel boundary, or visibility tables themselves. Foundation #4's invariant (observer-routed projection) is reused, not reimplemented.

## 7. Phases and acceptance criteria

| Phase | Deliverable | Acceptance criterion | Effort |
|---|---|---|---|
| 0 | Compiled types + diagnostic codes registry update | `CompiledAgentLookupRef`, `LookupRefStatus`, `LookupUnavailabilityReason`, `lookupFallback` shape exist in `types-core.ts`; new diagnostic codes registered; `pnpm turbo build` green | XS |
| 1 | Compiler lowering + diagnostics | Round-trip test: a YAML profile with `lookup.surface: policyState` compiles into the expected `CompiledAgentLookupRef` shape; missing `lookupFallback` rejected; unknown `surface`/`collection`/`keyType` rejected; `onHidden` override rejected; runtime `keyType` mismatch path covered by §8.1 #4 | M |
| 2 | Runtime resolver + observer routing | Architectural-invariant test: omniscient and seat-scoped resolutions for the same lookup return identical values when the property is public, divergent values when the property is private (hidden); no path through the resolver reads authoritative state when called with a seat-scoped context | M |
| 3 | Consideration integration + trace surface | Architectural-invariant test: a consideration with `lookup` value AND `lookupFallback: { onUnavailable: noContribution }` produces no contribution when the lookup is unavailable; `unknownLookupRefs` populated; `lookupFallbackFired` populated only when explicit constant fallback fires | S |
| 4 | Cookbook recipe + fixture migration | `docs/agent-dsl-cookbook.md` gains a "Static state lookups at chooseN frontiers" section; at least one fixture profile in `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` (mirroring Spec 162's `preview-integrity-fixture.ts`) exercises the lookup family end-to-end | S |

## 8. Test plan

Test classification per `.claude/rules/testing.md`. Architectural-invariant tests live under `packages/engine/test/architecture/lookup-refs/`, which is part of the live default blocking engine lane. Convergence-witness tests live under `packages/engine/test/policy-profile-quality/` only when they assert profile-quality trajectories.

### 8.1 architectural-invariant tests

1. **`lookup-observer-visibility.test.ts`** — Two-seat fixture where seat A can see a zone's `population` and seat B cannot. Same lookup ref, two seat contexts. Assert: seat A resolves `ready` with the actual value; seat B resolves `unavailable` with reason `hidden`. No path through the resolver returns seat B the authoritative value. This is the core Foundation #4 invariant for the lookup family.

2. **Phase 3 / `163GENLOOKUP-004`: `lookup-unavailable-not-silently-zero.test.ts`** — Construct a microturn whose option-value ID does not name an existing zone in the current state. Assert: every candidate's contribution from the lookup consideration is omitted (no entry in `scoreContributions` for that termId), `unknownLookupRefs` lists the ref with reason `missing`. Mirror of Spec 162's `preview-unavailable-not-silently-zero` test for the lookup family.

3. **Phase 3 / `163GENLOOKUP-004`: `lookup-fallback-explicit-zero-traced.test.ts`** — Same harness with `lookupFallback.onUnavailable: { constant: 0 }`. Assert: contribution exists in `scoreContributions` with value 0, and `lookupFallbackFired` records the explicit fallback.

4. **`lookup-keytype-mismatch.test.ts`** — Runtime resolver returns `unavailable` with reason `typeMismatch` when the resolved key exists in a different collection domain than the declared lookup collection/key type. Consideration fallback behavior remains Phase 3 / `163GENLOOKUP-004`.

5. **`lookup-dispatch-determinism.test.ts`** — Microturn option scoring dispatches lookup refs through resolved option keys, and unavailable lookup refs serialize in deterministic ref-id order. Foundation #8 (Determinism) and #16 (Testing as Proof).

6. **`lookup-collection-coverage.test.ts`** — Each of the four collections (`zones`, `tokens`, `players`, `globals`) has at least one path-walk depth ≥ 2 (e.g., `[properties, population]` for zones, `[properties, owner]` for tokens) verified against a synthetic state. Asserts the path walker handles each collection's projection shape uniformly. Additionally asserts that `zones`/`tokens`/`players` lookups route visibility through observer-projected entity state (`CompiledZoneVisibilityCatalog`) while `globals` lookups route through `CompiledSurfaceCatalog` — both honor the seat context but consult different visibility tables.

### 8.2 compiler tests

7. **`lookupfallback-required-diagnostic.test.ts`** — Authoring a consideration whose `value` is a `lookup` ref without `lookupFallback` produces `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK`. Authoring with `lookupFallback.onUnavailable: noContribution` compiles. Authoring with `lookupFallback` AND legacy `unknownAs` compiles but the diagnostic registry documents `unknownAs` as inactive for the lookup-ref path.

8. **`lookup-hidden-override-rejected.test.ts`** — Authoring `onHidden: { constant: 0 }` produces `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED`. The hidden-state-cannot-be-overridden invariant is enforced at compile time, not at runtime, to prevent profile authors from circumventing Foundation #4.

### 8.3 New fixture creation

No existing fixture migration is needed (no fixture currently uses lookup refs), but the architectural-invariant tests in §8.1 require a *new* fixture profile in `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` (mirroring Spec 162's `preview-integrity-fixture.ts`) that exercises each `collection`. Phase 4 makes this fixture the canonical cookbook example. Foundation #14 (no backwards-compat shims) — the new ref family adds capability; no shim is needed because no prior consumer exists.

## 9. Foundation alignment

| Foundation | Alignment |
|---|---|
| #1 (Engine Agnosticism) | Direct goal — `lookup.surface: policyState` operates over generic state collections; no per-game lookup tables |
| #4 (Authoritative State and Observer Views) | Direct goal — lookups route through `seatResolutionIndex` and consult two existing visibility tables (`CompiledSurfaceCatalog` for globals; `CompiledZoneVisibilityCatalog` for entity collections). Hidden state cannot be read by a seat that does not own visibility; no `onHidden` override permitted |
| #5 (One Rules Protocol, Many Clients) | Unaffected — kernel-published microturns unchanged |
| #6 (Schema Ownership Stays Generic) | Direct goal — lookup operates on the existing `CompiledSurfaceCatalog`; no new per-game schema |
| #8 (Determinism Is Sacred) | Reinforced — replay-twice test (8.1.5) proves byte-identical trace under all four collections |
| #9 (Replay, Telemetry, and Auditability) | Reinforced — `unknownLookupRefs` and `lookupFallbackFired` give the trace honest provenance for static-state evidence, mirroring Spec 162's preview-side telemetry |
| #10 (Bounded Computation) | Unaffected — lookups are O(1) per evaluation; `INNER_PREVIEW_HARD_CAP` untouched |
| #12 (Compiler-Kernel Validation Boundary) | Reinforced — three new compile-time diagnostics catch authoring bugs at compile time |
| #14 (No Backwards Compatibility) | Honored — new ref family added without compatibility shim; the legacy `unknownAs` path is unreachable for lookup-ref considerations |
| #15 (Architectural Completeness) | Direct goal — closes the "evolution profiles have no non-preview signal at deep frontiers" gap surfaced by Spec 162's witness |
| #16 (Testing as Proof) | Direct goal — tests in §8 prove the visibility, integrity, and determinism properties |
| #17 (Strongly Typed Domain Identifiers) | Aligned — branded `keyType` for entity collections (`ZoneId`/`TokenId`/`PlayerId`); raw `'string'` for globals (no `GlobalVarId` brand exists today) with runtime existence validation against the global-id catalog. The runtime branded-type comparison enforces discipline at the policy DSL boundary |
| #19 (Decision-Granularity Uniformity) | Reinforced — lookups apply uniformly across `chooseOne`, `chooseNStep`, and any future microturn kind that publishes typed option values |
| #20 (Preview Signal Integrity) | Reinforced — lookup family extends the same integrity contract: unavailable lookups never silently coerce; explicit fallback declared in YAML; status visible in trace |

## 10. Code anchors for implementers

- `packages/engine/src/kernel/types-core.ts:393-443` — `CompiledAgentPolicyRef` union (extend with `lookup` discriminant)
- `packages/engine/src/kernel/types-core.ts:716-729` — `CompiledSurfaceCatalog` (read-only; lookup `globals` collection consults this table)
- `packages/engine/src/kernel/types-core.ts:749-752` — `CompiledZoneVisibilityCatalog` (read-only; lookup `zones`/`tokens`/`players` collections consult this table)
- `packages/engine/src/kernel/types-core.ts:870-876` — `CompiledAgentPreviewInnerConfig` (UNCHANGED; this spec does not touch preview)
- `packages/engine/src/cnl/compile-agents.ts:196` — compiled-consideration shape (parallel `lookupFallback` placement next to `previewFallback`)
- `packages/engine/src/cnl/compile-agents.ts:1850-1877` — `previewFallback` lowering and required-fallback diagnostic (mirror this for `lookupFallback`)
- `packages/engine/src/cnl/compile-agents.ts:3056-3085` — `previewFallback` shape validation (mirror for `lookupFallback`)
- `packages/engine/src/agents/policy-runtime.ts:71-87` — `PolicyPreviewSurfaceProvider` (the closest provider analog; new `PolicyLookupSurfaceProvider` follows the same shape)
- `packages/engine/src/agents/policy-runtime.ts:98-105` — `PolicyRuntimeProviders` interface (extend with `lookupSurface` field)
- `packages/engine/src/agents/policy-runtime.ts:178` — `createPolicyRuntimeProviders` factory (wire the lookup provider here)
- `packages/engine/src/agents/policy-evaluation-core.ts:91` — `unknownPreviewRefs` declaration on `PolicyEvaluationCandidate` (mirror with `unknownLookupRefs`)
- `packages/engine/src/agents/policy-evaluation-core.ts:515-537` — `previewFallback` consumption inside `evaluateConsideration` (mirror branch for `lookupFallback`)
- `packages/engine/src/agents/policy-evaluation-core.ts:1510-1542` — `resolveSurfaceRef` (the closest existing observer-routed resolver; new `resolveLookupRef` follows the same shape)
- `packages/engine/src/agents/policy-evaluation-core.ts:1529` — `unknownPreviewRefs` registration site (mirror for `unknownLookupRefs`)
- `packages/engine/src/agents/policy-agent.ts:74-91, 280-310` — frontier dispatch trace population (extend for `unknownLookupRefs`, `lookupFallbackFired`)
- `packages/engine/src/kernel/types-ast.ts:677` — `MoveParamScalar` (the typed identifier surface the resolver matches against `keyType`)
- `packages/engine/src/kernel/branded.ts:3-9` — `PlayerId`, `ZoneId`, `TokenId`, `SeatId` brands (no `GlobalVarId` brand; `globals` keyType is raw `'string'`)
- `docs/agent-dsl-cookbook.md` — new "Static state lookups at chooseN frontiers" section
- `docs/FOUNDATIONS.md:131-137` — Foundation #20 (UNCHANGED; this spec extends its scope to a new ref family without amending the text)

## 11. Open questions

1. **`globals` collection key type — RESOLVED during reassessment**: No `GlobalVarId` brand exists in `kernel/branded.ts` (verified). Globals are addressed by raw `string` IDs throughout the compiled spec. Decision: `keyType: 'string'` for `globals`; literal-string keys permitted; runtime validates global-id existence in the `policyState.globals` catalog. Adding a `GlobalVarId` brand is deferred to a future spec.

2. **Path-walk return-type validation**: Today the lookup returns `unavailable` with reason `unresolved` if the terminal value is not a `PolicyValue`-compatible scalar. An alternative is to compile-time-validate the `path` against the surface catalog's known shape, surfacing terminal-type mismatches as compile-time diagnostics. Decision deferred to Phase 1 implementation; either approach honors Foundation #20.

3. **Cross-collection lookups**: A token's `properties.zoneId` could in principle be used as the key for a follow-on zone lookup. This spec does NOT support chained lookups; each consideration's `value` is a single lookup. If authoring demand emerges, a future spec could introduce a `coalesce` or `pipe` operator that composes lookups.

## 12. Reassessment of source proposal

The external deep-research document `reports/preview-signal-integrity.md` §5 was reassessed against the codebase:

- **`lookup.surface: policyState` concept**: Adopted (this spec §4). Wording adjusted to integrate with existing `CompiledAgentPolicyRef` discriminant naming and Spec 162's `previewFallback`-style fallback grammar.
- **Collections including `dataAssets`**: Removed. DataAssets are kernel-side; exposing them through the policy-evaluation layer would couple per-game schemas to the agent runtime and violate Foundations #1 and #6. Deferred to a future spec.
- **`ObserverId` parameter**: Removed. The codebase routes observer visibility via `seatResolutionIndex` keyed by `seatId`/`playerId`, not a dedicated `ObserverId` type. This spec uses the existing seat-context plumbing.
- **`onMissing: unknown | constant` and `onHidden: unknown`**: Adopted, with naming aligned to Spec 162's `unavailable` (kind, not the keyword `unknown`) and `onHidden` made non-overridable to enforce Foundation #4 at compile time. The proposal's "explicit constant or unknown" pattern is preserved.
- **`keyType` nominal validation**: Adopted (§5). Static when the chooseN microturn's published `keyType` is statically known; runtime `unavailable` with reason `typeMismatch` otherwise. Aligns with Foundation #17.
- **Compiler diagnostic name**: Originally adopted as `CNL_COMPILER_AGENT_LOOKUP_KEY_TYPE_MISMATCH`, but **dropped during this reassessment** — no `microturn-option-type catalog` exists today, so a static keyType check would require a substantial prerequisite (Foundation #14, YAGNI). The runtime-only `typeMismatch` resolution path (§4.1 step 1) is sufficient and Foundation #17 remains honored by the runtime branded-type comparison. Two diagnostics survive: `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` and `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED`.
- **Generic over per-game heuristics**: Adopted as a non-goal in §3. No FITL-specific or game-specific shortcuts.
- **Observer routing through policy projections**: Adopted (§4.3). Reuses existing infrastructure rather than introducing new visibility machinery.

## 13. Follow-On Tickets

Anticipated decomposition under namespace `163GENLOOKUP-*` (final breakdown produced by `/spec-to-tickets`):

- `163GENLOOKUP-001` — Phase 0: compiled types (`CompiledAgentLookupRef`, `LookupRefStatus`, `LookupUnavailabilityReason`, `lookupFallback` shape) + diagnostic codes registry update.
- `163GENLOOKUP-002` — Phase 1: compiler lowering for the `lookup` value expression; required-fallback diagnostic; `onHidden`-override-rejected diagnostic; surface/collection/keyType validation.
- `163GENLOOKUP-003` — Phase 2: runtime resolver (`policy-lookup-surface.ts`) + observer routing for all four collections; `PolicyRuntimeProviders` extension and factory wiring.
- `163GENLOOKUP-004` — Phase 3: consideration integration in `policy-evaluation-core.ts` (`evaluateConsideration` branch); `lookupFallbackFired` trace surface wired through `policy-agent.ts`.
- `163GENLOOKUP-005` — Phase 4: cookbook recipe in `docs/agent-dsl-cookbook.md` ("Static state lookups at chooseN frontiers") + new fixture profile in `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` (mirroring Spec 162's `preview-integrity-fixture.ts`) exercising the lookup family end-to-end.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-09:

- [`archive/tickets/163GENLOOKUP-001.md`](../archive/tickets/163GENLOOKUP-001.md) — Compiled types + diagnostic codes registry for `lookup` ref family (covers Phase 0)
- [`archive/tickets/163GENLOOKUP-002.md`](../archive/tickets/163GENLOOKUP-002.md) — Compiler lowering for `lookup` ref + compile-time diagnostics (covers Phase 1)
- [`archive/tickets/163GENLOOKUP-003.md`](../archive/tickets/163GENLOOKUP-003.md) — Runtime resolver + dispatch + observer routing (covers Phase 2 + §8.1 #1, #5, #6, §8.1 #4)
- [`archive/tickets/163GENLOOKUP-004.md`](../archive/tickets/163GENLOOKUP-004.md) — Consideration integration + trace surface (covers Phase 3 + §8.1 #2, #3)
- [`tickets/163GENLOOKUP-005.md`](../tickets/163GENLOOKUP-005.md) — Cookbook recipe + canonical fixture profile (covers Phase 4)
