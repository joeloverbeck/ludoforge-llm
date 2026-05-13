# Projected-State Lookup Refs for Per-Option Preview

**Date**: 2026-05-10
**Type**: Research report (not a spec — design space exploration ahead of spec authoring)
**Source**: fitl-arvn-agent-evolution improve-loop campaign, post CONTPREVDEP+spec-164 baseline
**Status**: Open. External deep research requested before spec authoring.

> **Note for the external reviewer**: this report is self-contained for design discussion. The codebase it describes is **LudoForge-LLM**, a TypeScript engine that compiles structured game specifications into executable game definitions and evaluates agents that play them. You will have access to `docs/FOUNDATIONS.md` (referenced by foundation number throughout). You will not have access to the source tree, so this report inlines type signatures, file paths, and line numbers for the runtime code paths that matter.

---

## TL;DR

After Spec 161 (chooseNStep inner preview), Spec 162 (preview signal integrity / Foundation #20), Spec 163 (generic microturn state-feature lookups), and Spec 164 (continued inner preview deepening), the FITL ARVN agent-evolution campaign hit a structural ceiling on seed 1000 at compositeScore=-6. Trace evidence shows the per-option preview pipeline is functioning correctly (ready-rate 86.4%, deep pass fires correctly when triggered, lookup family resolves zone properties at current state) — but the only ref family available at chooseNStep ADD frontiers that reads *projected-state* information is `preview.option.*`, which exposes a small fixed enum of scalars (`victoryCurrentMarginSelf`, `derivedMetric`, etc.). For many FITL action+target combinations, those scalars are game-theoretically uniform across target choices, so the per-option preview produces ready-but-uniform values and the agent falls through to the stable-key tiebreaker.

**Proposed direction**: a new ref family that combines Spec 163's keyed-lookup pattern with Spec 164's synthetic-completion-end state. Roughly: `preview.option.lookup.<surface>.<collection>.<path>`, keyed by `microturn.option.value`, resolved against `DriveResult.state` (the post-completion state Spec 164 already produces) under the existing observer projection. Same authoring contract as Spec 163 (`previewFallback.onUnavailable` required), same Foundation #20 signal-integrity guarantees, additive over Spec 164.

**Open research question**: does this design clear all foundation requirements, especially #1 (engine agnosticism), #4 (observer projection invariant), #10 (bounded computation), #19/#20 (signal integrity), and how should the cookbook frame the "current vs projected state" authoring choice?

---

## 1. Background — architecture snapshot the reviewer needs

LudoForge-LLM compiles a Markdown+YAML game specification into an executable `GameDef` JSON. A deterministic kernel evaluates moves; a policy-driven agent (`PolicyAgent`) chooses actions per faction. The agent layer is split into:

- `packages/engine/src/agents/` — policy evaluation, expression system, runtime surface, preview, diagnostics, IR.
- `packages/engine/src/cnl/compile-agents.ts` — compile policy YAML into a `CompiledAgentPolicyCatalog`.
- `packages/engine/src/cnl/validate-agents.ts` — compile-time validation (Foundation #20 fallback declarations, ref typing, etc.).
- `packages/engine/src/kernel/types-core.ts` — agent policy type definitions.
- `packages/engine/src/contracts/policy-contract.ts` — frozen enums for ref kinds, intrinsics, etc.

### 1.1 Decision shape and microturn vocabulary

The kernel publishes one decision at a time. A decision is one of `actionSelection | chooseOne | chooseNStep`. The agent picks one option, the kernel applies it, then publishes the next pending decision. Inside an action, the chain looks like:

```
actionSelection (pick action+top-level params)
  → chooseNStep (target-selection ladder: ADD ... ADD ... CONFIRM)
  → chooseOne (intra-action sub-choices, e.g., govern mode)
  → ... (more inner microturns until the action's effects resolve)
```

A consideration declares `scopes: ['move']` to score at action-selection or `scopes: ['microturn']` to score at chooseOne / chooseNStep ADD frontiers. CONFIRM frontiers are not per-option-scored; their cardinality is set by the chooseN's `min`/`max`.

### 1.2 The preview pipeline

Per-candidate preview is the agent's mechanism for forward-projecting "if I pick this option, what does the projected state look like?" without the kernel actually committing. `policy-preview-inner.ts` houses the inner driver (the synthetic completion of a single pending action's microturns):

- `policy-preview-inner.ts:198-205` — `DriveResult` interface:
  ```ts
  export interface DriveResult {
    readonly state: GameState;                         // post-completion state checkpoint
    readonly depth: number;                            // microturns driven
    readonly outcome: PolicyPreviewTraceOutcome;       // ready/unavailable/depthCap/...
    readonly completionPolicy: PolicyPreviewDriveTrace['completionPolicy'];
    readonly syntheticDecisions: readonly SyntheticDecisionTraceEntry[];
    readonly completionPolicyFallbackCount: number;
  }
  ```
- `policy-preview-inner.ts:318-422` — the inner driver. Accepts a starting `GameState` and a `depthCap`; synthetically completes inner microturns by either greedy fallback or `policyGuided` (the same considerations score the synthetic decisions). Returns `DriveResult` whose `state` field is a fully-typed `GameState` reflecting the projected state at depth-cap exit.

Spec 164 (continuedDeepening) added a two-pass driver: a broad pass at the legacy `depthCap` (default 4), and an opt-in deep pass (e.g., `deep.depthCap=16` under `capClass: deep1024`) that resumes from the broad pass's `DriveResult.state` if a trigger fires (`allRequestedRefsDepthCapped` or `allReadyValuesUniform`). Static cost is bounded per `compile-agents.ts:1033-1035` cost formula and capped by `INNER_PREVIEW_HARD_CAP=256` (default) or the named cap class (`deep1024` is the only opt-in tier today).

### 1.3 Compiled ref discriminants (the surface area for refs)

`packages/engine/src/kernel/types-core.ts` defines `CompiledAgentPolicyRef` as a tagged union. Relevant discriminants:

```ts
type CompiledAgentPolicyRef =
  | { readonly kind: 'previewOptionRef';
      readonly refKind: AgentPolicyPreviewOptionRefKind;   // enum, see §1.4
      readonly id?: string; }                              // for globalVar / derivedMetric / etc.
  | { readonly kind: 'lookup';                             // Spec 163
      readonly surface: 'policyState';
      readonly collection: 'zones' | 'tokens' | 'players' | 'globals';
      readonly keyType: 'ZoneId' | 'TokenId' | 'PlayerId' | 'string';
      readonly key: CompiledPolicyExpr;
      readonly path: readonly string[];
      readonly onMissing: 'unavailable' | { readonly kind: 'constant'; ... };
      readonly onHidden: 'unavailable'; }
  | ...;                                                   // many more (zoneProp, zoneTokenAgg, ...)
```

### 1.4 What `preview.option.*` exposes today

`packages/engine/src/contracts/policy-contract.ts:57-66`:
```ts
export const AGENT_POLICY_PREVIEW_OPTION_REF_KINDS = [
  'victoryCurrentMarginSelf',
  'victoryCurrentRankSelf',
  'deltaVictoryCurrentMarginSelf',
  'globalVar',
  'perPlayerVarSelf',
  'derivedMetric',
  'outcome',
  'driveDepth',
] as const;
```

These are scalar reads against the post-completion projected state (or its delta vs. current). Notably absent: any per-zone, per-token, or path-keyed read against the projected state. **There is no projected-state analog of Spec 163's `lookup` family.**

### 1.5 Spec 163 lookup at current state

`policy-lookup-surface.ts` resolves `lookup` refs against the *current* `GameState` under observer projection. Critical reuse-able behavior:

- Line 19: `type LookupRef = Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>;`
- Lines 153-180: `resolveZoneLookup(zoneId, ...)` finds the zone def, applies observer visibility (`isZoneVisible`), then projects the zone into a generic shape:
  ```ts
  return {
    id: String(zone.id),
    category: zone.category,
    owner: zone.owner,
    ownerPlayerIndex: zone.ownerPlayerIndex,
    properties: zone.attributes ?? {},                    // ← game-defined attributes flattened to "properties"
    variables: context.state.zoneVars[String(zone.id)] ?? {},
  };
  ```
- The `path` array (e.g., `['properties', 'population']`) walks this projected shape. Game-agnostic: the engine doesn't know what `population` means; it just walks the path.
- Visibility uses `CompiledZoneVisibilityCatalog` (kernel/types-core.ts:749-752) and `CompiledObserverCatalog` (Spec 102).
- Foundation #20 fidelity: paths that fail to resolve return `unavailable`; the consideration must declare `lookupFallback.onUnavailable: noContribution | { constant: <int> }`. The compiler rejects considerations that omit it.

---

## 2. Empirical motivation — what the campaign showed

### 2.1 Campaign setup

- Game: Fire in the Lake (FITL), 4-player COIN-series. ARVN is the evolved seat.
- Profile under evolution: `arvn-evolved` in `data/games/fire-in-the-lake/92-agents.md`.
- Victory formula for ARVN: `COIN-Controlled Population + Patronage > 50`. Margin = `... - 50`.
- Composite score: `avgMargin + 10 * winRate`, higher is better.
- Tier 1 evaluation (one seed, `1000`); Phase A win-gated ramp-up.
- Engine state: post CONTPREVDEP-002/003/004/011, post Spec 161/162/163/164, post Spec 158 (microturn scope + microturn.option intrinsic).

### 2.2 Baseline preview health (verified)

8 experiments ran. The baseline trace (`traces/trace-1000.json`) showed:
- ARVN had **57 decisions** (20 actionSelection, 25 chooseOne, 12 chooseNStep) over 157 total moves (4-player game).
- Total preview-evaluated roots: 612. Ready: **529 (86.4%)**. 0 `unknownNoPreviewDecision`, 0 `unknownFailed`, 0 `unknownUnresolved`.
- chooseOne: 100% ready (319/319 roots).
- actionSelection: 100% ready post-pruning. The 59 "gated" entries are **intentional Foundation #20 fallback firings** for `preferOptionProjectedMargin` at root candidates where `preview.option.*` is structurally unavailable (action selection is not a per-option microturn frontier — gated is by design, not a bug).
- chooseNStep: 47/71 ready broad-pass; 4 frontiers hit `unknownDepthCap` (depth counts 8/7/5/4 — the exact Spec 162 §11 / Spec 164 witness pattern).

This established that the architecture is functional; the post-Spec-164 capability is the design intent.

### 2.3 exp-001 — Spec 164 opt-in: deep pass fires correctly, ready values uniform 0

Profile change (additive, 10 lines):
```yaml
preview:
  inner:
    chooseOne: true
    chooseNStep: true
    maxOptions: 8
    chooseNBeamWidth: 1
    depthCap: 4
    strategy: continuedDeepening
    capClass: deep1024
    continuedDeepening:
      broad:
        depthCap: 4
      deep:
        depthCap: 16
        trigger:
          - allRequestedRefsDepthCapped
        rootPolicy: allRootsWithinCap
```

Trace verification:
- All 12 chooseNStep decisions adopted `coverage.strategy: continuedDeepening, capClass: deep1024`.
- 4 frontiers (idx 1, 5, 9, 13) reported `broad: { readyRoot=0, unavailable=N }` and `deep: { triggerFired: 'allRequestedRefsDepthCapped', readyRoot=N, unavailable=0 }`. The deep pass resolved all 24 previously depth-capped roots to `ready`.
- The other 8 chooseNStep frontiers had broad-pass alone resolve them; deep didn't fire (correct — trigger conditions not met).

But: at every deep-fired frontier, `readyRefStats['preview.option.delta.victory.currentMargin.self']` reported `{ distinctValueCount: 1, range: 0, allReadyValuesEqual: true, min: 0, max: 0 }`. The contribution of `preferOptionProjectedMargin` was 0 for every candidate. Selection fell through to the `stableMoveKey` tiebreaker. compositeScore: -6 → -6 (NEAR_MISS).

**Root cause**: FITL Govern adds +1 patronage per chosen target zone, regardless of which zone. `victory.currentMargin.self = patronage + coinControlPop - 50`. Picking an-loc vs ba-xuyen vs saigon yields the same patronage delta = +1, so the per-option projected margin delta is uniform 0 across all options. Spec 164's deep pass correctly evaluated the post-completion projected state, but the formula being read is zone-agnostic for Govern.

This is **NOT an architectural gap**. It matches Spec 164 §4: "continuedDeepening preserves Foundation 20. It is additive signal, not a way to silence unavailability." The deep pass surfaced ready values that were genuinely uniform.

### 2.4 exp-002 — Spec 163 lookup at current state: works, but causes regression

Tested whether per-option zone-property differentiation could break the tie. Added consideration:
```yaml
preferHighPopulationTarget:
  scopes: [microturn]
  costClass: state
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
    onUnavailable: noContribution
```

Trace verification:
- 58/78 chooseNStep candidates received `preferHighPopulationTarget` contributions in `scoreContributions[]`.
- Distinct contribution values: `[0, 50, 100, 300]` — matches FITL zone populations (saigon=6→+300, tay-ninh/kien-hoa=2→+100, an-loc/ba-xuyen=1→+50, sihanoukville=0→+0).
- 0 `unknownLookupRefs`, 0 `lookupFallbackFired`. The 20 unscored candidates were CONFIRM frontiers (no per-option ZoneId).
- Spec 163 lookup is fully functional at current state.

But: compositeScore -6 → -7 (REJECT). Picking saigon/tay-ninh first instead of alphabetical-tiebreak order (an-loc/ba-xuyen/...) produced a 1-margin regression. Confirms a separate prior negative lesson: for ARVN-evolved on seed 1000, the stable-key tiebreak order on Govern targets is load-bearing in a non-obvious way.

**This is a side-finding for the current report, not the central one.** The central finding is that the lookup family **at current state** does work and the differentiation it produces is real. What's missing is the *projected-state* analog.

### 2.5 Why both directions matter

For Govern target selection on FITL seed 1000, *neither* current-state population (exp-002) nor projected margin (exp-001) is the "right" signal — Govern's rule is genuinely zone-agnostic for the patronage gain, and zone choice's downstream effects (e.g., how the chained Train special activity later places troops, whether COIN troop count flips a zone to COIN-controlled) only manifest after multiple inner microturns plus subsequent action effects.

But the campaign's wider point is structural:

| Ref kind | What it reads | Bound | Currently available? |
|---|---|---|---|
| `preview.option.victoryCurrentMarginSelf` (and similar enum kinds) | Scalar at projected-state-end | depthCap | ✅ yes, but enum-restricted |
| `lookup.policyState.zones.[path]` (Spec 163) | Path on a zone, **at current state** | O(1) | ✅ yes, fully generic |
| Path on a zone, **at projected state** | — | O(1) per option | ❌ **no** |
| Cross-action / cross-round simulation | — | unbounded without new policy | ❌ no, also out of scope |

The empty cell is direction 2 of this report.

---

## 3. The gap, framed precisely

### 3.1 What an author *cannot* express today

Suppose the policy author wants to score chooseNStep ADD candidates by a per-zone projected-state signal — e.g., "after this Govern (and its chained Train special activity) resolves under the synthetic completion, will this zone be COIN-controlled?" or "what will the projected `arvnTroopCount` be in this zone?" The path from the option value (a `ZoneId`) to the projected-state field is conceptually identical to Spec 163's lookup, *except the surface is the post-completion state instead of the current state*.

The author has three current options:
1. Use a `preview.option.*` ref — but the enum is fixed and exposes only scalars (margin, rank, globals, derived metrics, drive depth). None of them are per-zone-keyed.
2. Use a Spec 163 `lookup` ref — works generically, but reads *current* state. Cannot see anything the synthetic completion has projected.
3. Live with `preferOptionProjectedMargin` and accept that for actions whose immediate effect formula is zone-agnostic, the per-option margin is uniform.

### 3.2 What the runtime already produces (key reuse opportunity)

Spec 164's `DriveResult.state` is a fully-typed `GameState` value: the post-synthetic-completion state, observer-projected the same way the current state is. The lookup resolver in `policy-lookup-surface.ts:153-180` is *parameterized over* the state value — its core logic is `state -> { zoneVars, zoneAttributes, ... }` projection plus path walk. Pointing it at `DriveResult.state` instead of the current state requires no game-specific changes.

### 3.3 Why the existing `preview.option.*` family doesn't naturally absorb this

The enum-restricted shape was deliberate (Spec 158 / Spec 161 / Spec 162 all preserve it). Adding a 9th kind for "lookup" would mix two different ref shapes into one discriminant: enum kinds are nullary (or take a single `id` string for `globalVar` / `derivedMetric`), while the lookup family is structured (collection + keyType + key expr + path array + fallback). Better to add a sibling discriminant — keep the existing tagged union clean.

---

## 4. Direction proposal — projected-state lookup refs

### 4.1 Surface name candidates

Three plausible spellings, each with tradeoffs:

| Candidate | Pros | Cons |
|---|---|---|
| `preview.option.lookup.<collection>.<path>` | Author intuition: "preview.option family, lookup variant"; clear that it's preview-derived | Mixes enum-vs-structured shapes under same `preview.option` namespace |
| `lookup` ref with new `surface: 'previewOptionState'` (extending Spec 163) | Maximum reuse — same compiled ref shape, only `surface` discriminator changes | Compile-time validation has to fork on `surface` for cost-class and fallback semantics (preview vs state) |
| New top-level `previewLookup` ref family | Cleanest separation | More compile-time and trace plumbing; weaker reuse |

The author leans toward option 2 (new surface on existing lookup family), but this is the central design question to research.

### 4.2 Compiled ref shape (illustrative)

```ts
// Either as a new surface on the existing lookup ref...
type CompiledAgentPolicyRef = ...
  | {
      readonly kind: 'lookup';
      readonly surface: 'policyState' | 'previewOptionState';   // ← new variant
      readonly collection: 'zones' | 'tokens' | 'players' | 'globals';
      readonly keyType: 'ZoneId' | 'TokenId' | 'PlayerId' | 'string';
      readonly key: CompiledPolicyExpr;
      readonly path: readonly string[];
      readonly onMissing: 'unavailable' | { ... };
      readonly onHidden: 'unavailable';
    }
  | ...;

// ...or as a sibling kind.
```

### 4.3 Cookbook example (illustrative)

```yaml
# At a chooseNStep ADD frontier in any chooseN-target action, score the
# candidate by the projected ARVN troop count in the target zone after
# the synthetic completion of the pending action.
preferProjectedTroopBuildup:
  scopes: [microturn]
  costClass: preview                # ← preview-derived
  weight: 100
  value:
    lookup:
      surface: previewOptionState   # ← new variant
      collection: zones
      keyType: ZoneId
      key:
        ref: microturn.option.value
      path: [variables, arvnTroopCount]   # game-defined zone var
      onMissing: unavailable
  previewFallback:                  # ← preview's fallback contract, not lookup's
    onUnavailable: noContribution
```

The author chooses *which projected per-zone field* to read. The engine has no opinion about what `arvnTroopCount` means; it just walks the path against the same projection function `policy-lookup-surface.ts:170` already uses.

### 4.4 Foundation analysis

Working through the FOUNDATIONS the reviewer has access to:

| Foundation | Statement | Direction-2 alignment |
|---|---|---|
| #1 Engine agnosticism | No game-specific logic in kernel/compiler/runtime. | ✅ Same generic surface, no FITL-specific helpers. The `path` is author-supplied; engine walks it without semantic interpretation. Spec 163 already crosses this bar at current state. |
| #4 Observer projections | All state reads are observer-projected; visibility is enforced uniformly. | ✅ The projected state `DriveResult.state` flows through the same observer/visibility pipeline used for the current state. No new visibility infrastructure. |
| #6 Generic primitives | No per-game shortcuts. | ✅ Same primitive shape as Spec 163. No new operators. |
| #10 Bounded computation | Every choice and iteration is finite, enumerable, and bounded; named cap classes record bounds in compiled artifacts (Spec 164 amendment). | ✅ Synthetic completion is bounded by Spec 164's `capClass`. The lookup itself is O(1) per option. Total cost is unchanged: `(existing Spec 164 budget) + (per-option lookup count × O(1))`. |
| #14 Default-preserving | Adding a feature must not change behavior for profiles that don't opt in. | ✅ Opt-in via consideration declaration. Profiles without the new family see no change. |
| #17 Typed identifiers | Branded ID types validated at compile time. | ✅ Reuse `keyType` field unchanged. |
| #19 / #20 Signal integrity | Refs report `ready` or `unavailable`; profiles must declare explicit fallbacks; never silent zeros. | ✅ When the synthetic completion exits before the path becomes resolvable, the ref returns `unavailable`. The consideration must declare `previewFallback.onUnavailable` (preview-derived → preview fallback contract, *not* lookup's `lookupFallback`). The compiler rejects considerations that omit it. |

The tightest constraint is #19/#20 + the choice of fallback contract. See open questions §6.

### 4.5 What this unlocks (and what it does not)

**Unlocks**: differentiation at chooseNStep ADD frontiers when the game-rule *does* produce per-zone differences but the global scalar `currentMargin.self` aggregates them away. Concrete FITL examples:
- Train target choice (does the post-Train state have a different ARVN-troop count in this zone? does the zone's COIN-control flip?).
- Pacify target choice (does the post-Pacify support level change which zones contribute population to the COIN-controlled total?).
- Sweep target choice (does the post-Sweep activated-guerrilla count differ across zones — affecting the next round's Assault leverage?).

**Does NOT unlock**: differentiation when the underlying game-rule effect is genuinely zone-agnostic (FITL Govern's `+1 patronage per target` regardless of zone). No projected-state ref can manufacture differentiation that doesn't exist in the rules. This is a feature, not a bug — Foundation #20 honesty.

---

## 5. Implementation sketch

For the reviewer to assess feasibility (not a final design):

### 5.1 New surface plumbing

`packages/engine/src/agents/policy-lookup-surface.ts` is the central resolver. Its `resolveLookup(ref, context)` is parameterized over `context.state` (a `GameState`). The current implementation passes the runtime's `state`. A new variant of `context` (or a wrapper resolver) would carry `previewOptionState: GameState` and route to it when `ref.surface === 'previewOptionState'`.

The synthetic completion result is already produced by `policy-preview-inner.ts:198-205` `DriveResult.state`. The per-candidate preview pipeline (in `policy-preview-runtime.ts` and surrounding files — out of scope to detail here, but the reviewer can rely on this routing existing) already feeds `DriveResult` back into per-candidate evaluation. The new resolver just reads `DriveResult.state` at the point where Spec 163's resolver currently reads runtime `state`.

### 5.2 Compile-time validation

Existing checks in `validate-agents.ts` verify:
- Spec 162: every consideration whose `value` reads a `preview.option.*` ref must declare `previewFallback.onUnavailable`. Diagnostic: `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`.
- Spec 163: every consideration whose `value` is a `lookup` ref must declare `lookupFallback.onUnavailable`. Diagnostic: similar.

The new family raises a design question: **which fallback contract applies?** The lookup is preview-derived (depends on synthetic completion), so unavailability cases include both "path missing in projected state" (lookup-shaped) and "synthetic completion couldn't resolve to a state where this path is reachable" (preview-shaped). Compile-time validation should require *one* fallback declaration and the choice should be principled. See §6.

### 5.3 Trace recording

Reuse existing `previewUsage.coverage.broad` and `previewUsage.coverage.deep` blocks (Spec 162 / Spec 164). The new ref's resolution outcome should appear in:
- `outcomeBreakdown` (ready / unknownDepthCap / unknownGated / etc.) — same shape.
- `readyRefStats[ref.id]` (with statistics: distinctValueCount, range, etc.).
- `unknownLookupRefs[]` or a new `unknownPreviewLookupRefs[]` for unavailable cases.

This part should be straightforward — no new trace shape, just additional ref ids in existing buckets.

### 5.4 Default-preserving (Foundation #14)

The new surface variant is opt-in. Profiles that don't reference `surface: previewOptionState` get bit-identical behavior to today. No JSON shape changes for existing compiled profiles.

---

## 6. Open research questions for the external reviewer

These are the questions the campaign would like ChatGPT-Pro deep research to address — they are the hard design questions not yet decided.

### 6.1 Fallback contract: lookup vs preview

Direction 2 sits at the intersection of Spec 162 (`previewFallback`) and Spec 163 (`lookupFallback`). Three options:

(a) **Single new contract**: introduce `previewLookupFallback.onUnavailable`. Cleanest separation; one more authoring axis to learn.
(b) **Reuse `previewFallback`**: it's preview-derived, so the preview contract applies. Authors who already know Spec 162 don't learn a new contract.
(c) **Reuse `lookupFallback`**: it's a lookup, so the lookup contract applies. Authors who already know Spec 163 don't learn a new contract.

Author leans toward (b) because the *root cause* of unavailability is the synthetic completion (preview-derived), not the path (lookup-derived). But this conflicts with Spec 163's existing `lookupFallback` precedent for any ref shaped as a `lookup`. Recommend a clear principle so future refs that span families have a deterministic answer.

### 6.2 Path stability across completion endpoints

The synthetic completion can exit at different inner-microturn boundaries depending on `depthCap` and how `policyGuided` completion drives. A path like `[variables, arvnTroopCount]` for a zone may be:
- Stably resolvable at any synthetic state (zone vars are always present, just possibly with stale values).
- Resolvable only after specific inner microturns have applied (e.g., after the chooseN CONFIRM, before the operation effects fire).
- Unresolvable mid-completion if the kernel transiently invalidates the field.

Question: how should the spec define which paths are "stable" at the synthetic-completion endpoint, and what compile-time check (if any) can warn authors of paths likely to be partial?

### 6.3 Spec 163 extension vs new ref family

Three architectural choices, listed in §4.1 above. The campaign author has a weak preference for option 2 (extend Spec 163's lookup with a new surface variant) but this is genuinely an open research question. Trade-offs:

- Reuse vs separation of concerns.
- Compile-time validation forking on `surface`.
- Trace clarity (do consumers understand `lookup.policyState` vs `lookup.previewOptionState`?).
- Forward compatibility (e.g., a future `previewBroadOnlyState` for "broad-pass result without deep" — would it slot in cleanly?).

### 6.4 Cookbook authoring guidance

The cookbook needs a clear decision tree:
- "Use Spec 163 `lookup` (current state) when scoring by a *visible* property of the option's referent that doesn't depend on action resolution." (Example: zone population — static.)
- "Use direction-2 lookup (projected state) when scoring by a property that the pending action *would* change." (Example: zone-level COIN troop count after Train.)
- "Use `preview.option.victoryCurrentMarginSelf` (and friends) when scoring by the *aggregate* projected outcome." (Example: total projected margin.)

Question: does this trichotomy have edge cases? What if an author wants both current and projected state (e.g., "prefer zones where the *delta* in projected COIN troop count is largest")? Should the new family support a delta variant, or is composition (two considerations + arithmetic in the value expression) sufficient?

### 6.5 Interaction with continuedDeepening triggers

Spec 164's `allReadyValuesUniform` trigger fires the deep pass when the broad pass produces ready-but-uniform values. With the new ref family, "ready-but-uniform" semantics extend beyond the scalar enum — a per-zone projected ref could be ready at every option but have `range=0`. Should `allReadyValuesUniform` apply uniformly across all preview-derived refs (existing enum + new lookup), or should the new family have its own trigger semantics? What does "uniform" mean for refs returning typed non-numeric values?

### 6.6 Hidden state and observer projection

Spec 163 has `onHidden: 'unavailable'` (no override allowed; honors Foundation #4). When the projected state reveals information that the *current* state hides (e.g., a synthetic completion that would expose currently-hidden zone tokens), the projected lookup's hidden-state behavior matters. Does the projected state inherit current-state visibility (i.e., the synthetic completion never reveals more than the agent already sees)? This is likely a Foundation #4 invariant of the existing preview pipeline; please confirm and surface any subtlety.

### 6.7 Cost class

Spec 163 considerations declare `costClass: state`; Spec 162 preview-derived considerations declare `costClass: preview`. The new ref family is preview-derived (depends on synthetic completion) but reads via the lookup pipeline. Should the cost class be `preview`, `state`, or a new `previewLookup`? Affects how the broad/deep cost formula in `compile-agents.ts:1033-1035` accounts for it.

### 6.8 Out-of-scope clarifications (please confirm)

The author considers these out of scope for direction 2 and would like the reviewer to confirm or flag:
- **Cross-action / multi-round preview** ("direction 1" in the conversation that produced this report). Requires opponent modeling and unbounded game-tree exploration; defer.
- **Per-game shortcuts** (a FITL-specific `preview.option.coinControlled.<zone>` ref). Violates Foundation #1; reject.
- **Lookup against an arbitrary checkpoint** (not just `DriveResult.state`). Tempting for diagnostics but violates Foundation #14 by adding new authoring axes; defer.
- **Aggregations across multiple matches** (a `lookup-aggregate` family). Complementary to single-value lookup; defer to a future spec.

---

## 7. Witness data from this campaign

For the reviewer's grounding, the concrete chooseNStep frontiers from `traces/trace-1000.json` (post-exp-001 deep-pass enabled):

| Decision idx | Action | Candidates | broad readyRoot | deep triggerFired | deep readyRoot | readyRefStats range |
|---|---|---|---|---|---|---|
| 1 | Govern target select | 8 | 0 | `allRequestedRefsDepthCapped` | 8 | 0 (all values 0) |
| 5 | Govern target select | 7 | 0 | `allRequestedRefsDepthCapped` | 7 | 0 |
| 9 | Govern target select | 5 | 0 | `allRequestedRefsDepthCapped` | 5 | 0 |
| 13 | Govern target select | 4 | 0 | `allRequestedRefsDepthCapped` | 4 | 0 |
| 51 | Pacify target select (Coup) | 26 | 26 | (not fired) | — | 0 (uniform) |

These are the 4 ARVN-seed-1000 chooseNStep frontiers Spec 162 §11 carved out and Spec 164 was authored to address. Spec 164 made them `ready`; the values are uniform 0 because the per-option `victory.currentMargin.self` delta is zone-agnostic for Govern's `+1 patronage` rule.

Also recorded: at action selection, 12 of 20 decisions tied at score=-1800 with `topActionId: coupPacifyARVN` — 6 candidates (different target zones) all projecting the same margin. The same uniformity manifests at action-selection level for Pacify zone choice in Coup phase. Direction 2 would address both the chooseN ADD case and the action-selection case (Pacify candidates are also keyed by `microturn.option.value` equivalent — the action's primary param ZoneId).

The relevant code citations gathered during the campaign:
- `policy-preview-inner.ts:198-205` — `DriveResult` shape, `state: GameState` is the post-completion projection.
- `policy-preview-inner.ts:318-422` — inner driver entry; accepts arbitrary `GameState`, returns `DriveResult`.
- `policy-lookup-surface.ts:19` — `LookupRef = Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>`.
- `policy-lookup-surface.ts:153-180` — `resolveZoneLookup`; projects `zone.attributes` into `properties`, `state.zoneVars[id]` into `variables`.
- `kernel/types-core.ts:431-442` — current `lookup` ref shape (the type to extend or sibling).
- `kernel/types-core.ts:425-429` — current `previewOptionRef` shape (the alternative discriminant).
- `contracts/policy-contract.ts:57-66` — `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS` enum (the closed set today).
- `cnl/compile-agents.ts:1033-1035` — Spec 164 cost formula (broad + incremental deep).
- `cnl/compile-agents.ts:95` — `INNER_PREVIEW_HARD_CAP = 256` default.

---

## 8. Asks of the external reviewer

In priority order:

1. **Foundation alignment audit**: walk through Foundations #1, #4, #6, #10, #14, #17, #19, #20 and identify any way direction 2 could violate them. The campaign author's analysis in §4.4 may have blind spots.
2. **Resolve §6.1 (fallback contract) and §6.3 (extension vs new family)**: pick the cleanest answer with reasoning, not a list of options.
3. **Stability semantics (§6.2)**: propose a concrete rule for what paths are well-defined at the synthetic-completion endpoint and what compile-time check (if any) flags risky paths.
4. **Cookbook decision tree (§6.4)**: confirm the trichotomy or extend it.
5. **Confirm out-of-scope items (§6.8)** or argue for promoting any of them in.
6. **Strawman spec outline**: based on the resolved questions, sketch the section structure of a `Spec NNN — Projected-State Lookup Refs` document so the project team has a starting point. Include what witnesses, fixtures, and test classes should accompany it (the project's `.claude/rules/testing.md` defines `architectural-invariant`, `convergence-witness`, and `golden-trace` test classes — recommend distribution).

---

## 9. Provenance

This report was produced by the LudoForge-LLM `improve-loop` skill running the `fitl-arvn-agent-evolution` campaign on 2026-05-10 at git HEAD `6104f910b` (post-merge of PR #251 / Spec 164). The campaign ran 8 experiments (1 NEAR_MISS, 3 ACCEPT simplifications, 4 REJECT) and reached compositeScore=-6 (baseline ceiling) with no architectural-gap halt. Lessons promoted to `campaigns/lessons-global.jsonl` are in the squash-merge commit. The full experiment ledger is in `campaigns/fitl-arvn-agent-evolution/results.tsv` (gitignored), preserved alongside `traces/trace-1000.json` for the reviewer who has codebase access.

The campaign was triggered with the explicit user directive: "Consider all global lessons related to preview not working as suspect. If throughout performing experiments you find out there are issues or architectural gaps we'd need to fix, then stop and report the matter to me in detail; we don't want to evolve the AI agents until the AI agent policy architecture is fully complete." The architecture verified complete; this report is the "next-modeling-layer" recommendation that emerged from the campaign's empirical floor.
