# Spec 166 — Candidate Parameter Refs for Action-Selection Policy

**Status**: Proposed
**Priority**: High — blocks agent evolution for any game whose action-selection candidates carry semantically loaded parameters (FITL events, FITL pivotal events, and any future analogous shape).
**Complexity**: M
**Date**: 2026-05-11
**Predecessors**: Spec 158 (microturn policy scope and `microturn.option.value` intrinsic), Spec 162 (preview signal integrity / Foundation #20), Spec 163 (generic microturn state-feature lookups), Spec 164 (continued inner-preview deepening), Spec 165 (projected-state lookup refs — most recent surface-union-extension precedent).
**Dependencies**: Spec 158 (closed); Spec 162 (closed); Spec 163 (closed); Spec 164 (closed); Spec 165 (closed).
**Trigger reports**:
- `reports/agent-candidate-param-discrimination-gap-2026-05-11.md` — internal campaign report identifying the structural gap during the fitl-arvn-agent-evolution improve-loop.
- `reports/agent-candidate-param-proposal.md` — external deep-research proposal (ChatGPT-Pro). Reassessed against the codebase by this spec; per-recommendation dispositions in §12.

---

## 1. Goal

Give action-selection-scope considerations a generic, observer-safe way to score same-action candidates by the **typed scalar parameters that already exist on the published candidate** — without inner preview, without `stableMoveKey` parsing, and without per-game tag emission.

After this spec lands, a profile author can write:

```yaml
avoidShadedEvent:
  scopes: [move]
  weight: -800
  value:
    boolToNumber:
      eq:
        - { ref: candidate.params.side }
        - shaded
  candidateParamFallback:
    onUnavailable: noContribution
```

and the resolver MUST read `candidate.params.side` directly from the published candidate's `move.params`. The new ref family is a state-local, instantaneous read; it never invokes preview, never populates `unknownPreviewRefs[]`, and never triggers `tiebreakAfterPreviewNoSignal`. Foundation #20 is preserved.

The new family completes the action-selection discrimination surface:

| What's being chosen | Surface today | This spec |
|---|---|---|
| Action class | `candidate.tag.<actionId>`, `candidate.intrinsic.actionId` | unchanged |
| Same-action variant by **typed scalar param** | **missing** (`stableMoveKey` is a string, `candidate.param.*` is rejected) | **added** as `candidate.params.<name>` |
| Microturn option value | `microturn.option.value`, `microturn.option.tags`, `microturn.option.targetKind` | unchanged |
| Projected scalar metric | `preview.victory.*`, `preview.feature.*`, `preview.var.*` | unchanged |
| Projected keyed property | `lookup.surface: previewOptionState` (Spec 165) | unchanged |

## 2. Context (verified against codebase)

### 2.1 The discrimination gap

`packages/engine/src/contracts/policy-contract.ts:29-35` defines `AGENT_POLICY_CANDIDATE_INTRINSICS = ['actionId', 'stableMoveKey', 'paramCount']`. None expose individual param values. `packages/engine/src/cnl/compile-agents.ts:2646-2658` explicitly rejects authoring `candidate.param.<name>` with diagnostic `CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN` and message `"candidate.param.* refs are removed; use move candidate features or microturn.* refs as appropriate."`. `docs/agent-dsl-cookbook.md` reflects the same retirement: `"...so preview.* refs project through same-seat inner microturns without reviving retired decision.*, option.value, or candidate.param.* authoring."`.

### 2.2 The internal machinery already exists end-to-end

The runtime resolution path for a compiled `candidateParam` ref is **fully implemented** today; only the parser-level YAML acceptance was retired:

- `packages/engine/src/kernel/types-core.ts:413-416` — `CompiledAgentPolicyRef` union includes `{ kind: 'candidateParam'; id: string }`.
- `packages/engine/src/kernel/schemas-core.ts:687-689` — zod schema accepts the discriminant.
- `packages/engine/src/kernel/types-core.ts:802-808` — `CompiledAgentCandidateParamDef { type: 'number' | 'boolean' | 'id' | 'idList'; cardinality?: { kind: 'exact'; n } }`.
- `packages/engine/src/cnl/compile-agents.ts:412-471` — `lowerCandidateParamDefs` iterates over every action's `params: [{name, domain}]` plus every choice-binding inside action effects and action-pipeline effects (`classifyActionParamCandidateParamDef`, `classifyChoiceBindingCandidateParamDef`). When a param name appears with inconsistent types across declarations, the def is set to `null` and silently dropped.
- `packages/engine/src/agents/policy-evaluation-core.ts:1231-1232` — dispatch case `'candidateParam'` calls `resolveCandidateParam(candidate, ref.id)`.
- `packages/engine/src/agents/policy-runtime.ts:323-351` — `resolveCandidateParam` reads `candidate.move.params[paramId]`, performs a suffix/indexed-binding fallback lookup (`::paramId`, `::paramId[`), and type-coerces against the declared `candidateParamDef.type`.
- `packages/engine/src/agents/policy-vm/vm.ts:302-312` — bytecode VM resolves the same ref.
- `packages/engine/src/agents/policy-wasm-runtime.ts:50` — WASM opcode slot reserved (`candidateParam: 9`).
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts:252-254` — feature table emits the bytecode entry.

The runtime contract is therefore stable today. This spec is a **parser/diagnostic layer + trace plumbing** addition; the resolver itself does not change.

### 2.3 FITL action declaration mismatch

`data/games/fire-in-the-lake/30-rules-actions.md:160`:

```yaml
- { id: event, tags: [event-play], actor: active, executor: 'actor', phase: [main],
    capabilities: [cardEvent], params: [], pre: null, cost: [], effects: [], limits: [] }
```

declares `params: []`, but `packages/engine/src/kernel/legal-moves.ts:1273-1325` (`enumerateCurrentEventMoves`) emits candidates with `params: { eventCardId, eventDeckId, side, branch? }`. Consequently `lowerCandidateParamDefs` produces `candidateParamDefs = {}` for event-class candidate params, so even if the parser accepted `candidate.params.side` today, the resolver would return `undefined` because `eventCardId/eventDeckId/side/branch` are not in `catalog.candidateParamDefs`.

The companion mismatch elsewhere:
- `30-rules-actions.md:997-999` — `pivotalEvent` correctly declares `params: [{ name: eventCardId, domain: { query: enums, values: [card-121, card-122, card-123, card-124] } }]`. This is the canonical declarative shape this spec assumes; no new domain grammar is required.

This spec therefore includes a phase that adds the missing `event` action params declaration so that the ref family is usable end-to-end on the empirical FITL witness.

### 2.4 Fallback-contract precedent (Spec 165)

`packages/engine/src/cnl/compile-agents.ts:2086-2131` enforces a **state-source-keyed** consideration-level fallback rule:

| Ref family in `value` | Required consideration-level fallback |
|---|---|
| `previewOptionRef` (any) | `previewFallback.onUnavailable` |
| `lookup.surface: policyState` (Spec 163) | `lookupFallback.onUnavailable` |
| `lookup.surface: previewOptionState` (Spec 165) | `previewFallback.onUnavailable` |

`onMissing` / `onHidden` are **ref-local** for the lookup family. The consideration-level fallback only applies when a leaf ref's `onMissing: 'unavailable'` policy resolves to unavailable at evaluation time.

This spec adds one new state-source-keyed fallback bucket for the new ref family:

| Ref family | Required consideration-level fallback |
|---|---|
| `candidateParam` | **`candidateParamFallback.onUnavailable`** (new) |

A `candidate.params.<name>` ref read against a candidate whose action does not declare `<name>`, or whose `move.params` omits the value, is **state-local unavailability** (no preview drive in play, no path walk against state). Routing it through the new fallback keeps the existing channels (`previewFallback`, `lookupFallback`) honest about provenance.

### 2.5 Empirical witness

`reports/agent-candidate-param-discrimination-gap-2026-05-11.md` §2.3 documents that across 15 seeds (1000-1014) under the post-coup-fix tier-15 ARVN baseline, ARVN played anti-COIN shaded events 4/10 times (40%); after a `preferEvent` boost the rate rose to 6/12 (50%), regressing the composite score from -3.8 to -3.9333. The bounded preview at `depthCap=4` cannot resolve shaded-vs-unshaded event variants because their downstream effects materialize through subsequent factions' turns. A `candidate.params.side` ref makes the variant directly visible to scoring without invoking preview.

## 3. Non-goals

- **No revival of the singular retired namespace.** `candidate.param.<name>` (singular) remains a compile-time rejection with the existing diagnostic. Foundation #14 (no compatibility shims, no alias paths) is preserved.
- **No `decision.*` or `option.value` revival.** Microturn-scope discrimination continues to use `microturn.option.value` / `microturn.option.tags` / `microturn.option.targetKind` (Spec 158). The new family is action-selection-scope only.
- **No dynamic per-candidate tag emission in the kernel.** Option C from the original report ("emit `event-shaded` / `event-unshaded` tags at candidate generation") is rejected. Tag bloat plus a parallel quasi-schema for tag-from-param emission is strictly worse than the ref family. If ergonomics later demand tag-style sugar, it lowers to `candidate.params.*` via a compiler macro (Spec 7 — compiler macros over generic AST), not via kernel-time emission.
- **No microturn lowering of FITL event side/branch selection.** Option D ("lower side choice into a `chooseOne` microturn published after the event candidate") is structurally cleaner under Foundation #19 but is a larger refactor with non-trivial migration cost, and pivotal events still require readable candidate identity. Queued as a separate future spec; not a prerequisite for this one.
- **No implicit preview fallback when preview margins are uniform.** Spec 162 forbids silent coercion. This spec ships `candidate.params.*` as the explicit replacement for the missing discriminator; it does not introduce a "preview-uniform → authored fallback" channel. A telemetry advisory (`POLICY_PREVIEW_UNIFORM_SIGNAL`) is deferred to a follow-up spec.
- **No new GameSpecDoc action-params grammar.** The existing `params: [{name, domain}]` shape with `domain.query: enums, values: [...]` (as `pivotalEvent.eventCardId` already demonstrates) is sufficient. No `domain.kind: enum, valuesFrom: dataAsset` invention.
- **No aggregation over candidate-params.** Aggregations remain under the existing `aggregate.*` families. Single-value reads only.
- **No `onHidden` discriminant.** Action-selection candidates are not seat-projected per-param: the acting agent always sees the candidates it is about to choose from. A `candidate.params.*` resolution is either `ready` (param present, type matches) or `unavailable` (param missing on this candidate, type mismatch against declared domain). Foundation #4 is preserved because the candidate publication itself is already observer-routed by the kernel; the param read is downstream of that publication.

## 4. Architecture

### 4.1 Surface extension

Extend the parser to accept `candidate.params.<paramName>` at action-selection scope (`scopes: [move]`). The lowered compiled ref shape is extended:

```ts
{
  readonly kind: 'candidateParam';
  readonly id: string;                    // existing: param name
  readonly onMissing:                     // new
    | 'unavailable'
    | { readonly kind: 'constant'; readonly value: number | string | boolean };
  readonly appliesToActions?: readonly string[]; // new, optional
}
```

YAML authoring shape:

```yaml
# Required param, default semantics — onMissing defaults to 'unavailable'
avoidShadedEvent:
  scopes: [move]
  weight: -800
  value:
    boolToNumber:
      eq:
        - { ref: candidate.params.side }
        - shaded
  candidateParamFallback:
    onUnavailable: noContribution

# Optional param with explicit onMissing constant — no fallback required
preferEventBranch:
  scopes: [move]
  weight: 300
  value:
    boolToNumber:
      eq:
        - ref:
            candidate.params.branch:
              onMissing: { constant: __absent__ }
        - someBranchId

# Multi-card pivotal preference
preferSpecificPivotal:
  scopes: [move]
  appliesToActions: [pivotalEvent]
  weight: 500
  value:
    boolToNumber:
      in:
        - { ref: candidate.params.eventCardId }
        - [card-121, card-122]
  candidateParamFallback:
    onUnavailable: noContribution
```

Resolver value type is constrained to **typed scalars**: `number`, `boolean`, `string` (enum or branded id), in line with the existing `CompiledAgentCandidateParamDef.type` discriminant (`'number' | 'boolean' | 'id' | 'idList'`). `idList` is permitted in the compiled ref but its use in `candidate.params.*` value expressions remains restricted to the existing list operators (`in`, `eq` against another `idList`, `aggregate count`, etc.); arithmetic on `idList` remains a separate concern outside this spec.

### 4.2 Compile-time validation

A `candidate.params.<paramName>` ref is accepted at compile time if and only if:

1. The consideration's scope is `[move]`. (Microturn-scope considerations cannot reference action-selection candidate params — they have no candidate. Rejected with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID`.)
2. `paramName` exists in the compiled `candidateParamDefs` catalog (i.e., declared on at least one action's `params: []` block, or as a non-dynamic choice binding under an action's effects). Rejected with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN` otherwise.
3. If `appliesToActions` is provided: every listed action must declare `paramName`. Cross-action consistency is enforced via the existing `lowerCandidateParamDefs` cross-action `candidateParamDefsEqual` check (`compile-agents.ts:435-437`); if the param's compiled def was nulled by inconsistency, the ref is rejected with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT`. When `appliesToActions` is omitted, no per-action existence check fires at compile time — runtime returns `unavailable(missing)` for candidates of actions that do not carry `paramName`, and the consideration's `candidateParamFallback` handles the contribution per §4.3.

The singular retired form `candidate.param.<paramName>` continues to be rejected with the existing diagnostic. No alias path.

### 4.3 Consideration-level fallback contract

Mirrors Spec 165 §4.6 partitioning:

| Ref family in `value` expression | Required fallback |
|---|---|
| `previewOptionRef` | `previewFallback.onUnavailable` |
| `lookup.surface: policyState` | `lookupFallback.onUnavailable` |
| `lookup.surface: previewOptionState` | `previewFallback.onUnavailable` |
| **`candidateParam`** (new) | **`candidateParamFallback.onUnavailable`** |

A consideration whose `value` reads any `candidate.params.<name>` ref whose `onMissing: 'unavailable'` (default) **and** that ref can resolve to unavailable (i.e., not every reachable candidate of the consideration's `appliesToActions` is guaranteed to carry the param) MUST declare `candidateParamFallback.onUnavailable`. Diagnostic: `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK`.

`candidateParamFallback.onUnavailable` admits the existing fallback shape:

```yaml
candidateParamFallback:
  onUnavailable: noContribution
# or
candidateParamFallback:
  onUnavailable: { constant: 0 }
```

A consideration whose `value` mixes candidate-param refs with preview-derived or lookup refs MUST declare all relevant fallbacks. This matches Spec 165's mixed-surface rule.

A `candidate.params.<name>` ref whose author-supplied `onMissing: { kind: 'constant'; value }` always resolves to a typed constant when missing — it never produces an unavailable contribution and therefore does NOT require `candidateParamFallback`. The compiler tracks this distinction via the existing `collectXRefIds(value.expr, onMissingPolicy)` pattern used for lookup refs.

### 4.4 Runtime resolver contract

`packages/engine/src/agents/policy-runtime.ts:323-351`'s existing `resolveCandidateParam` implementation is preserved. The only change is the addition of an `onMissing` constant-fallback path before reporting unavailability:

1. Look up `candidate.move.params[paramId]`.
2. If undefined, attempt the existing suffix/indexed-binding fallback (`::paramId`, `::paramId[`) — preserved for compatibility with the existing choice-binding bind-name lookup convention. (No new behavior; documented here for clarity.)
3. If still undefined:
   - If the compiled ref's `onMissing.kind === 'constant'`, return the typed constant. Trace records `status: 'missing'` with `resolvedValue: <constant>`.
   - Else, return `undefined` (representing unavailability). Trace records the ref id in `unknownCandidateParamRefs` with reason `'missing'`.
4. If present, type-coerce against `candidateParamDef.type`:
   - Type mismatch (e.g., declared `number` but the candidate carries a string): return `undefined`; trace records reason `'typeMismatch'`.
   - Type match: return the value.

The resolver never invokes preview, never reads `DriveResult.state`, never populates `unknownPreviewRefs[]`, never populates `unknownLookupRefs[]`. Foundation #20 is preserved by construction.

### 4.5 Trace surface

One new map mirroring `unknownPreviewRefs` / `unknownLookupRefs`:

```ts
export type CandidateParamUnavailabilityReason = 'missing' | 'typeMismatch';

// added to EvaluationCandidate (policy-evaluation-core.ts)
readonly unknownCandidateParamRefs: Map<string, CandidateParamUnavailabilityReason>;
```

Ref-id encoding: `candidate.params.<paramName>` (the public DSL form; no surface prefix needed because the discriminant `candidateParam` is itself the surface). The trace consumer can distinguish missing-on-this-candidate (`missing`) from declared-domain-mismatch (`typeMismatch`).

Ready resolutions appear in the existing `considerations[].refs[]` structure with `status: 'ready', value, provenance: 'publishedCandidate'`. This avoids a parallel "ready ref" bucket and keeps per-candidate trace shape compact.

`candidateParamFallback`-triggered contributions are recorded in a new `candidateParamFallbackFired` map keyed by consideration id, mirroring `previewFallbackFired` and `lookupFallbackFired`. Aggregated breakdown counters under existing analytics names are extended uniformly.

### 4.6 Observer alignment

The candidate's `move.params` map is part of the publication object the kernel emits to the acting agent. Foundation #4 (Authoritative State and Observer Views) is honored because:

- The kernel is the single authority for publishing candidates. Whatever projection the kernel chose to apply at publication time (e.g., hidden-information masking via observer-view selection) is already baked into the published candidate's params.
- The new ref family is downstream of that publication: it reads the **already-projected** candidate, never reaches into authoritative state, and never invokes the preview drive.
- For FITL specifically, ARVN reading `candidate.params.side` and `candidate.params.eventCardId` for events it is about to play does not expose any information beyond what the agent already needs to execute the move; no observer-purity concern arises.

If a future game models hidden-information action candidates (e.g., a face-down card whose identity is unknown to the agent until selection), the kernel must publish the candidate with the corresponding params either omitted or replaced by a sentinel. The runtime resolver returns `unavailable(missing)` in that case, and the consideration's `candidateParamFallback` handles the contribution. The kernel publication contract — not this ref family — is responsible for enforcing the projection.

### 4.7 Cookbook update

The retirement sentence in `docs/agent-dsl-cookbook.md` ("...without reviving retired `decision.*`, `option.value`, or `candidate.param.*` authoring") is rewritten to:

- `candidate.param.<name>` (singular) remains retired and invalid.
- `candidate.params.<name>` (plural) is the current action-selection candidate-param surface.
- `microturn.option.*` remains the microturn option surface.

A new "Action-Selection Candidate Parameter Refs" recipe section is added covering: required vs optional params, `onMissing` shape, when to use `appliesToActions`, the `candidateParamFallback` contract, and the trichotomy between this family and `microturn.option.*` (microturn-scope only) vs `lookup.*` (state-keyed).

## 5. Compiler changes

`packages/engine/src/cnl/compile-agents.ts`:

1. **Parse `candidate.params.<paramName>`** — Replace the current "starts with `candidate.param.`" rejection at `:2646-2658` with a branch that distinguishes the plural prefix `candidate.params.` and the singular `candidate.param.`. The singular form continues to emit `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` (existing). The plural form lowers to `{ kind: 'candidateParam', id: paramName, onMissing: ... , appliesToActions?: ... }`.
2. **Cost class** — Carry `costClass: 'candidate'` on the lowered ref (same as the existing `candidate.intrinsic.*` family). The consideration's overall `costClass` propagates upward through the existing `maxCostClass` chain at `:2135` unchanged.
3. **Validate `paramName` against `candidateParamDefs`** — In the constructor's scope-validation pass, reject any `candidate.params.<paramName>` whose `paramName` is absent from `catalog.candidateParamDefs`. Diagnostic: `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN`.
4. **Validate `appliesToActions`** — When `appliesToActions: [<actionId>, ...]` is provided on the consideration, verify each listed action declares `paramName`. Reject with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION` when the action does not exist; reject with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT` when an inconsistency caused `lowerCandidateParamDefs` to drop the def.
5. **Scope validation** — Extend `validateConsiderationScopeRefs` (`:2290`) to flag a `candidate.params.*` ref appearing in a `microturn`-scope consideration with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID`. (The existing `hasMoveOnlyRefs` set is extended to include the new ref discriminant.)
6. **Required-fallback collector** — Add `collectCandidateParamRefIds(value.expr)` that walks the compiled ref tree and returns the set of `candidateParam` refs whose `onMissing === 'unavailable'`. When non-empty AND `candidateParamFallback` is omitted, emit `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK` with the same shape as the existing fallback diagnostics (`:2099-2130`).
7. **`onMissing` lowering** — Reuse the existing `onMissing` discriminant shape from `Spec 163`'s lookup family (`'unavailable' | { kind: 'constant'; value: number | string | boolean }`). Validate that the constant's type matches the param's declared `candidateParamDef.type`; type mismatch is rejected with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH`.
8. **`candidateParamFallback` lowering** — Add a `lowerCandidateParamFallback(considerationId, path, def.candidateParamFallback, diagnostics)` helper paralleling `lowerLookupFallback`. The compiled consideration carries `candidateParamFallback?: ConsiderationParamFallback` alongside the existing `previewFallback?` / `lookupFallback?` fields. The trace consumer reads this on `candidateParamFallbackFired`.

### 5.1 New diagnostic codes (compiler)

| Code | Fires when |
|---|---|
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN` | `candidate.params.<paramName>` references a param not in `candidateParamDefs`. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID` | `candidate.params.*` appears in a microturn-scope consideration. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION` | `appliesToActions` lists an action that does not exist in the compiled `GameDef.actions`. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT` | The referenced param is declared with inconsistent types across actions, so `lowerCandidateParamDefs` dropped its def. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH` | An `onMissing: { kind: 'constant'; value }` provides a value whose type does not match the declared param type. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK` | A consideration's `value` reads any `candidate.params.*` ref with `onMissing: 'unavailable'` (default) AND `candidateParamFallback` is omitted. |

The existing `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` (singular form) and `CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN` (generic unknown ref) are unchanged.

## 6. Runtime changes

Files touched (anchors verified):

- `packages/engine/src/kernel/types-core.ts:413-416` — extend the `candidateParam` discriminant with `onMissing` and optional `appliesToActions`.
- `packages/engine/src/kernel/schemas-core.ts:687-689` — extend the zod schema to mirror the new fields (`onMissing` union; optional `appliesToActions: z.array(StringSchema).optional()`).
- `packages/engine/src/agents/policy-runtime.ts:323-351` — `resolveCandidateParam` adds the `onMissing` constant-fallback path described in §4.4. No change to the suffix/indexed-binding lookup.
- `packages/engine/src/agents/policy-evaluation-core.ts:99-100` — extend `EvaluationCandidate` with `unknownCandidateParamRefs: Map<string, CandidateParamUnavailabilityReason>`. Extend `:1231-1232`'s `case 'candidateParam'` dispatch to populate the new map on `undefined` resolution and to consult the compiled ref's `onMissing` for constant fallback.
- `packages/engine/src/agents/policy-vm/vm.ts:302-312` — update the VM's `case 'candidateParam'` to mirror the same constant-fallback semantics. The `aux[]` slot encoding for the ref id remains stable; the VM `onMissing` lowering is a new entry in the bytecode feature table.
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts:252-254` — emit the new `onMissing` field into the feature-table entry alongside the existing `id` field.
- `packages/engine/src/agents/microturn-option-eval.ts:28-29` — extend the per-option result tuple with `unknownCandidateParamRefs` (always empty at microturn scope, but uniform structure simplifies merging in `microturn-option-evaluator.ts`).
- `packages/engine/src/agents/policy-agent.ts` — wherever `unknownPreviewRefs` / `unknownLookupRefs` flow into per-candidate trace output, add the parallel `unknownCandidateParamRefs` channel and the `candidateParamFallbackFired` counter.

No changes to the kernel, the compiler-kernel boundary, the RNG, or the visibility tables themselves. The existing `lowerCandidateParamDefs` cross-action consistency check is reused as the compile-time domain authority.

## 7. Phases and acceptance criteria

| Phase | Deliverable | Acceptance criterion | Effort |
|---|---|---|---|
| 0 | Compiled types + schema + diagnostic codes registry | `CompiledAgentPolicyRef` candidateParam variant extended; schema mirrors; six new diagnostic codes registered; `pnpm turbo build` green | XS |
| 1 | Parser acceptance + scope validation | `candidate.params.<paramName>` lowers to the new compiled ref; singular form continues to reject; microturn-scope reference rejected; round-trip compile test asserts the full ref shape including `onMissing` and optional `appliesToActions` | S |
| 2 | Compiler fallback contract | `collectCandidateParamRefIds` collector added; `candidateParamFallback` lowered through `lowerCandidateParamFallback`; required-fallback diagnostic enforced; consideration-level mixed-surface scenarios with all three fallbacks compile | S |
| 3 | Runtime resolver `onMissing` integration | `resolveCandidateParam` honors `onMissing.kind === 'constant'`; trace populates `unknownCandidateParamRefs` for missing/typeMismatch cases; bytecode VM mirrors the semantics; architectural-invariant test asserts both code paths byte-identically | S |
| 4 | Trace plumbing + analytics | `unknownCandidateParamRefs` propagates through `microturn-option-eval.ts` and `microturn-option-evaluator.ts` aggregation; `candidateParamFallbackFired` recorded; the per-candidate trace contains `provenance: 'publishedCandidate'` for ready resolutions | S |
| 5 | FITL action declaration update | `data/games/fire-in-the-lake/30-rules-actions.md` `event` action declares `params: [{ name: eventCardId, domain: ... }, { name: eventDeckId, domain: ... }, { name: side, domain: { query: enums, values: [unshaded, shaded] } }, { name: branch, domain: ... }]`. Cross-action `candidateParamDefsEqual` check passes. A profile fixture exercising `avoidShadedEvent` over a 1-seed FITL trace produces the expected `contribution: -800` for shaded candidates and `0` for unshaded. | M |
| 6 | Cookbook + retirement-line rewrite | `docs/agent-dsl-cookbook.md` retirement sentence rewritten to distinguish singular (retired) from plural (current). New "Action-Selection Candidate Parameter Refs" recipe added with the four example shapes from §4.1 plus the fallback decision tree | XS |

## 8. Test plan

Test classification per `.claude/rules/testing.md`. Architectural-invariant tests live under `packages/engine/test/architecture/candidate-param-refs/`, part of the live default blocking engine lane. Convergence-witness tests live under `packages/engine/test/policy-profile-quality/`.

### 8.1 architectural-invariant tests

1. **`candidate-params-retired-namespace-rejected.test.ts`** — A policy using `{ ref: candidate.param.side }` (singular) fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID`. The plural form `{ ref: candidate.params.side }` compiles (given a fixture that declares `side` on at least one action).

2. **`candidate-params-scope-rejected.test.ts`** — A microturn-scope consideration using `candidate.params.side` fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID`.

3. **`candidate-params-unknown-name-rejected.test.ts`** — A move-scope consideration using `candidate.params.foo` where `foo` is not declared on any action fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN`.

4. **`candidate-params-appliesto-cross-action-validation.test.ts`** — Three sub-cases: (a) `appliesToActions: [event]` with `candidate.params.side` declared on `event` — compiles; (b) `appliesToActions: [govern]` with `candidate.params.side` — fails (govern does not declare `side`); (c) `appliesToActions: [nonexistent]` — fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION`.

5. **`candidate-params-type-inconsistent-rejected.test.ts`** — A fixture declaring `paramX` as `number` on one action and `string` on another causes `lowerCandidateParamDefs` to drop the def. A consideration reading `candidate.params.paramX` is rejected with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT`.

6. **`candidate-params-fallback-required.test.ts`** — Three compilation attempts: (a) `candidate.params.side` with `onMissing: 'unavailable'` (default) and no `candidateParamFallback` → rejected with `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK`; (b) same ref with `candidateParamFallback: { onUnavailable: noContribution }` → compiles; (c) ref with `onMissing: { kind: constant, value: __absent__ }` and no `candidateParamFallback` → compiles (the constant fallback obviates the consideration-level requirement).

7. **`candidate-params-onmissing-type-mismatch-rejected.test.ts`** — A `candidate.params.eventCardId` (declared `id`) with `onMissing: { kind: constant, value: 0 }` (number) fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH`.

8. **`candidate-params-preview-isolation.test.ts`** — A policy reading only `candidate.params.*` must NOT call the preview driver: assert `previewDriveInvocationCount === 0` for a fixture frontier with such a profile; assert `unknownPreviewRefs.size === 0`; assert no `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory is emitted. Foundation #20.

9. **`candidate-params-determinism.test.ts`** — Replay a move twice; assert byte-identical `unknownCandidateParamRefs` map order, `candidateParamFallbackFired` map order, and resolved contribution values. Foundation #8.

10. **`candidate-params-collection-coverage.test.ts`** — Each scalar type (`number`, `boolean`, `id`, enum-string `id`) has at least one ref resolution exercised with both `ready` and `missing` outcomes against synthetic action declarations.

11. **`candidate-params-conformance-corpus.test.ts`** — Add one tiny action-param example each for: perfect-information board (an action with a typed coordinate param), hidden-information card (a card-pick action with a card-id param), stochastic (a chance-roll action with a roll-result param), asymmetric/phase-heavy (a faction-of-target action with an enum param). Mirrors Spec 16 conformance corpus discipline. Foundation #16.

### 8.2 golden-trace tests

12. **`candidate-params-toy-same-action-tracing.test.ts`** — Two legal candidates share `actionId: chooseMode` but differ by `params.mode ∈ {A, B}`. A consideration penalizes `mode=B`. Assert the trace shows one ready ref with `value: A, contribution: 0` and one ready ref with `value: B, contribution: -<weight>`. Both candidates' `unknownCandidateParamRefs` are empty.

13. **`candidate-params-fitl-seed-1001-side.test.ts`** — With `avoidShadedEvent` active in a FITL ARVN profile, the card-78 shaded candidate at seed 1001 turn N records `contribution: -800` and the unshaded candidate records `0`. Both per-candidate trace blocks include the resolved `candidate.params.side` ref with `provenance: 'publishedCandidate'`. Pinned trace under `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/`.

14. **`candidate-params-optional-branch-missing.test.ts`** — A card-event candidate without a `branch` param resolves through the declared `onMissing: { kind: constant, value: __absent__ }` fallback and records `status: 'missing'` with `resolvedValue: '__absent__'`. The trace does NOT route through `unknownCandidateParamRefs` because the constant fallback fired.

15. **`candidate-params-pivotal-event-id.test.ts`** — `candidate.params.eventCardId` reads each of card-121..card-124 as a branded card id; `in` and `eq` operators compose correctly against card literals.

### 8.3 Convergence-witness tests (profile-quality)

16. **FITL ARVN shaded-event suppression witness** (under `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/`): with `avoidShadedEvent` added to ARVN, shaded event selections drop to zero across the 15-seed campaign unless no unshaded alternative is legal at that frontier or another explicit profile consideration overwhelms the penalty. Asserted as a non-blocking `POLICY_PROFILE_QUALITY_REGRESSION` advisory. Witness id: `spec-166-candidate-params-fitl-witness`.

### 8.4 New fixture creation

A new fixture profile in `packages/engine/test/architecture/candidate-param-refs/candidate-params-fixture.ts` exercises each compile-time and runtime rule on a synthetic two-action game (`chooseMode` and `chooseRole`, each declaring distinct typed params, with one shared param exercised across both to drive the cross-action consistency tests).

## 9. Foundation alignment

| Foundation | Alignment |
|---|---|
| #1 (Engine Agnosticism) | Direct goal — the engine and compiler validate generic param names and scalar domains. They never learn `side`, `eventCardId`, `branch`. |
| #2 (Evolution-First Design) | Direct goal — action-param schemas live in GameSpecDoc YAML; profile evolution mutates YAML only. |
| #4 (Authoritative State and Observer Views) | Resolver reads the already-published candidate; the kernel's publication contract owns observer projection. No bypass of the projection layer. |
| #5 (One Rules Protocol, Many Clients) | Agents score the same published legal candidates that UI/simulator clients execute. No separate AI-only action path. |
| #6 (Schema Ownership Stays Generic) | Direct goal — no per-game schema; the existing `params: [{name, domain}]` shape is generic; `pivotalEvent.eventCardId` already demonstrates this. |
| #7 (Specs Are Data, Not Code) | The new ref is a declarative read; comparisons remain existing arithmetic/boolean expressions. No scripts/eval/string parsing. |
| #8 (Determinism Is Sacred) | Reinforced — §8.1 #9 proves byte-identical replay. Lookup is O(1) scalar by canonical key. |
| #9 (Replay, Telemetry, and Auditability) | Reinforced — `unknownCandidateParamRefs` map and `candidateParamFallbackFired` channel; ready resolutions carry explicit `provenance: 'publishedCandidate'`. |
| #10 (Bounded Computation) | Direct goal — O(1) map lookup per ref per candidate; no preview drive, no search. |
| #12 (Compiler-Kernel Validation Boundary) | Reinforced — six new compile-time diagnostics catch authoring errors before runtime. Runtime invariants enforce only type-coercion and presence at evaluation time. |
| #13 (Reproducibility) | Reinforced — compiled `GameDef.actions` carries the param domain declaration that drives the resolver; `candidateParamDefs` is part of `AgentPolicyCatalog`. |
| #14 (No Backwards Compatibility) | Honored — singular `candidate.param.*` continues to be rejected (no alias). The cookbook line is rewritten in-place; owned policies/docs/goldens migrate to plural in the same change. |
| #15 (Architectural Completeness) | Direct goal — closes the discrimination gap identified in `reports/agent-candidate-param-discrimination-gap-2026-05-11.md` §3 rather than papering over with `stableMoveKey` parsing, dynamic tags, or implicit preview fallback. |
| #16 (Testing as Proof) | Direct goal — §8 enumerates architectural-invariant, golden-trace, and convergence-witness tests proving each property. |
| #17 (Strongly Typed Domain Identifiers) | Aligned — `id`-typed params compile to branded scalars internally; serialized YAML/JSON stays canonical string form. The existing `CompiledAgentCandidateParamDef.type` discriminant is preserved. |
| #18 (Constructibility) | Aligned — candidate params are part of already-published constructible actions; no client-side completion is introduced. |
| #19 (Decision-Granularity Uniformity) | Direct goal — action-selection candidates gain parity with `microturn.option.value`: when the thing being chosen carries a typed scalar value, policy can read it. Sister-surface to Spec 158's microturn option discrimination. |
| #20 (Preview Signal Integrity) | Direct goal — candidate-param reads are NOT preview refs, do NOT request preview, and do NOT appear in preview-unavailable accounting. The new fallback channel (`candidateParamFallback`) keeps the preview channel honest about provenance. |

## 10. Code anchors for implementers

- `packages/engine/src/kernel/types-core.ts:413-416` — `CompiledAgentPolicyRef.candidateParam` discriminant (extend with `onMissing` and optional `appliesToActions`)
- `packages/engine/src/kernel/types-core.ts:802-808` — `CompiledAgentCandidateParamDef` (no shape change; reused as the runtime type oracle)
- `packages/engine/src/kernel/schemas-core.ts:687-689` — zod schema (mirror the union extension)
- `packages/engine/src/cnl/compile-agents.ts:412-471` — `lowerCandidateParamDefs` and `classifyActionParamCandidateParamDef` / `classifyChoiceBindingCandidateParamDef` (no shape change; the catalog is the authority the new validator consults)
- `packages/engine/src/cnl/compile-agents.ts:2646-2658` — current rejection branch for `candidate.param.*` (extend with `candidate.params.` plural branch)
- `packages/engine/src/cnl/compile-agents.ts:2086-2131` — required-fallback collectors (add `collectCandidateParamRefIds`, `candidateParamFallback`)
- `packages/engine/src/cnl/compile-agents.ts:2290-2332` — `validateConsiderationScopeRefs` (extend `hasMoveOnlyRefs` to include `candidateParam`)
- `packages/engine/src/cnl/compile-agents.ts:3692-3739` — `collectConsiderationRefKinds` (already routes `candidateParam` into the `candidate` bucket; no change)
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts:252-254` — emit the new `onMissing` field
- `packages/engine/src/agents/policy-runtime.ts:323-351` — `resolveCandidateParam` (add the `onMissing` constant-fallback path)
- `packages/engine/src/agents/policy-evaluation-core.ts:99-100` — `EvaluationCandidate` (add `unknownCandidateParamRefs`)
- `packages/engine/src/agents/policy-evaluation-core.ts:1231-1232` — `case 'candidateParam'` dispatch (consult `onMissing`, populate trace map)
- `packages/engine/src/agents/policy-vm/vm.ts:302-312` — VM dispatch (mirror constant-fallback semantics)
- `packages/engine/src/agents/microturn-option-eval.ts:28-29` — uniform per-option result tuple (add empty `unknownCandidateParamRefs`)
- `packages/engine/src/agents/microturn-option-evaluator.ts:40-41` — aggregation maps (uniform per-option breakdown for consistency)
- `packages/engine/src/agents/policy-agent.ts` — `traceCandidatesForFrontier` (add the parallel channel and counter)
- `packages/engine/src/kernel/legal-moves.ts:1273-1325` — `enumerateCurrentEventMoves` (UNCHANGED; the kernel already emits the correct params; only the GameSpecDoc declaration changes)
- `data/games/fire-in-the-lake/30-rules-actions.md:160` — FITL `event` action declaration (Phase 5 — declare `params: [{ name: eventCardId, ... }, { name: eventDeckId, ... }, { name: side, ... }, { name: branch, ... }]`)
- `data/games/fire-in-the-lake/30-rules-actions.md:993-999` — FITL `pivotalEvent` action declaration (UNCHANGED; already canonical)
- `docs/agent-dsl-cookbook.md` — retirement sentence and new recipe (Phase 6)
- `docs/FOUNDATIONS.md` — UNCHANGED; this spec extends the scope of existing Foundations without amending any text

## 11. Open questions

1. **Indexed-binding fallback lookup semantics**: `policy-runtime.ts:329-337` already implements a `::paramId` / `::paramId[` suffix-fallback lookup against `candidate.move.params` keys. This was added when choice bindings could expand into per-iteration param keys (e.g., a chooseN-bound name appearing as `<actionId>::paramId[0]`, `<actionId>::paramId[1]`). The new ref family inherits this fallback unchanged. Open question: should authors be able to disambiguate "scalar param" vs "indexed binding" at the DSL level? V1 says no — the fallback is opportunistic and the resolver's existing behavior is preserved for back-compat with the choice-binding path. If profile authors hit ambiguity, a `candidate.params.<name>[<i>]` indexed read is a clean v2 follow-up.

2. **`idList` aggregation primitives**: `candidate.params.<name>` may resolve to an `idList` when the param is declared `idList` (e.g., a chooseN-bound name with `cardinality: { kind: 'exact'; n }`). The existing arithmetic/boolean operator set includes `in` and `eq`-against-array but does not include `aggregate count`/`min`/`max` directly over an `idList`-typed ref. V1 ships with `eq` and `in` on `idList` values; aggregation operators can be added by composition (`zoneTokenAgg` plus a token-filter) or as a v2 extension if profile demand emerges.

3. **Choice-binding visibility through `appliesToActions`**: Choice-binding-derived candidate-param defs (e.g., a `chooseOne`-bound name under an action's `effects:`) carry the action's id transitively. `appliesToActions` validation in §4.2.4 needs to consult both the action's `params: []` AND the action's effect-tree binding names. The implementation should reuse `collectChoiceBindingSpecs([...action.cost, ...action.effects])` from `compile-agents.ts:444` to derive the effective per-action param set. Documented for the implementer; no semantics change.

4. **FITL `event` action `branch` domain**: FITL events declare branches as plain string ids inside each card's `unshaded.branches[]` / `shaded.branches[]`. The GameSpecDoc `domain` for the `branch` param therefore needs to admit "any string from the per-card branch enumeration" rather than a static enum. Two viable shapes: (a) `domain: { query: enums, valuesFrom: { dataAsset: 'fitlEventBranchIds' } }` (requires a new data asset enumerating every branch id); (b) `domain: { query: enums, values: [] }` plus a runtime relaxation that treats empty `values` as "any string id valid for the declared `idKind`". Phase 5 evaluates both; the simpler path is (a), and the data asset is a one-time enumeration derived from the existing event card data. If (a) ends up cumbersome enough that the data asset adds more authoring noise than the ref family removes, Phase 5 may instead leave `branch` undeclared (it becomes an unresolved candidate-param at runtime, and consumer considerations either provide `onMissing: { kind: constant }` or use `candidateParamFallback`). The decision is implementation-time, recorded in the Phase 5 ticket.

5. **Telemetry advisory for uniform preview margins (deferred)**: The trigger report's §3.5 secondary issue (preview margins uniform across action classes at `depthCap=4`, blocking action-class differentiation when no hand-tuned per-action boost is present) is a profile-quality concern, not an engine integrity concern. A telemetry-only advisory `POLICY_PREVIEW_UNIFORM_SIGNAL` is the right channel; deferred to a follow-up spec. Foundation #20 prohibits silent coercion into scalar contributions; the candidate-param ref family ships first as the explicit replacement for the missing discriminator.

## 12. Reassessment of source proposal

`reports/agent-candidate-param-proposal.md` (ChatGPT-Pro deep research) reassessed against the codebase:

| Recommendation | Disposition | Rationale |
|---|---|---|
| Add `candidate.params.<name>` (plural) as the new public DSL surface | **Adopted** (§4.1) | The internal `kind: 'candidateParam'` discriminant already exists end-to-end. Only the parser-level YAML acceptance was retired. The plural namespace cleanly distinguishes the retired singular form. |
| Reject singular `candidate.param.<name>` with no alias path | **Adopted** (§4.2) | Foundation #14 (no compatibility shims). The existing diagnostic `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` is preserved verbatim. |
| Mandatory `appliesToActions` field on every `candidate.params.*` ref | **Adopted with adjustment — made optional** (§4.2) | Codebase verification: `lowerCandidateParamDefs` already enforces cross-action consistency (param defs are dropped when types disagree). Forcing `appliesToActions` on every ref would be stricter than the parallel `microturn.option.value` and `lookup.*` families and adds authoring friction without buying validation that compile-time + runtime-unavailable + `candidateParamFallback` doesn't already provide. `appliesToActions` is retained as an OPT-IN tightening — when present, it triggers stricter per-action existence checks. |
| Compile-time error code `AGENT_POLICY_CANDIDATE_PARAM_ACTION_DOMAIN_REQUIRED` (fires when `appliesToActions` is omitted and param is not on every action in scope) | **Rejected** | The codebase resolver returns `unavailable(missing)` for off-domain candidates today, and the `candidateParamFallback` mechanism is the right channel to handle the contribution. A hard compile-time rejection here would force authors to enumerate every action that declares a param, which is fragile under evolution (Foundation #2 — evolution adds/removes actions). The error code is omitted; runtime unavailable + explicit fallback is the contract. |
| New typed `domain` grammar with `kind: enum, valuesFrom: { dataAsset }` and explicit `presence: required | optional` | **Rejected as proposed; adopted in spirit** (§3) | Codebase verification: the existing `params: [{name, domain}]` shape with `domain.query: enums, values: [...]` (as `pivotalEvent.eventCardId` already uses) is sufficient. No new grammar required. `presence` is handled by the candidate-emitter naturally (the param appears or doesn't on each emitted candidate) plus the ref-local `onMissing` policy; no schema-level `presence: required` field is needed. Open question 4 covers `branch`'s per-card enumeration as a follow-up. |
| `onMissing: 'unavailable' \| { kind: constant, value }` ref-local | **Adopted** (§4.4) | Mirrors Spec 163's lookup-family convention exactly. Authors learn one `onMissing` shape across all keyed/structured ref families. |
| `onHidden: 'unavailable'` non-overridable | **Rejected** (§3) | Codebase verification: action-selection candidates are not seat-projected per-param. Foundation #4 is enforced at candidate publication time, upstream of this ref family. Adding `onHidden` would imply a hidden-projection invariant the resolver does not actually need to enforce. |
| Compiler error codes `AGENT_POLICY_CANDIDATE_PARAM_SCOPE_INVALID`, `AGENT_POLICY_CANDIDATE_PARAM_UNKNOWN`, `AGENT_POLICY_CANDIDATE_PARAM_OPTIONAL_REQUIRES_ON_MISSING`, `AGENT_POLICY_CANDIDATE_PARAM_TYPE_MISMATCH`, `AGENT_POLICY_CANDIDATE_PARAM_UNSUPPORTED_VALUE_TYPE` | **Adopted with renaming + restructuring** (§5.1) | Codebase convention is `CNL_COMPILER_AGENT_*` prefix. The five codes map to `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID`, `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN`, `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH`, `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT`. The "unsupported value type" code is unnecessary because `CompiledAgentCandidateParamDef.type` is already constrained to `'number' | 'boolean' | 'id' | 'idList'` at the catalog level — unsupported types are filtered upstream by `classifyActionParamCandidateParamDef` / `classifyChoiceBindingCandidateParamDef`. |
| Runtime resolver reads observer-projected candidate, never authoritative state | **Adopted** (§4.4, §4.6) | Codebase verification: `policy-runtime.ts:323-351` already reads `candidate.move.params` (the published candidate). No code change to the projection contract. |
| Trace bucket `candidateParamRefs[]` for ready resolutions + separate provenance category | **Adopted with simplification** (§4.5) | Codebase convention is to emit per-candidate resolutions through the existing `considerations[].refs[]` channel with explicit `provenance` and `status`. A dedicated `candidateParamRefs[]` bucket duplicates that surface. The simplified shape adds ONE new map (`unknownCandidateParamRefs`) mirroring `unknownPreviewRefs` / `unknownLookupRefs`, plus the existing per-ref provenance tag set to `'publishedCandidate'`. Spec 165's "no new top-level trace shape" mantra applies. |
| Foundation alignment table covering 18 numbered foundations | **Adopted with corrections** (§9) | Foundation numbering verified against `docs/FOUNDATIONS.md`. The proposal's table conflated some foundation names (e.g., listed "Foundation #5 One Rules Protocol" correctly but elided #11 Immutability and the appendix). §9 covers every relevant foundation; immutability is not directly relevant because no kernel state mutation is added by this spec. |
| Add compiler determinism test (re-compile same GameSpecDoc, assert byte-identical GameDef) | **Adopted** (§8.1 #9, by extension) | The architectural-invariant determinism test covers replay byte-identity. Compiler determinism is already proven by the existing engine corpus per Foundation #16; this spec inherits, does not re-prove. |
| Game-agnostic conformance corpus across four game families | **Adopted** (§8.1 #11) | Mirrors Foundation #16's mandate. Test #11 in §8.1 adds the four-family conformance corpus item. |
| FITL action declaration fix: declare `eventCardId`, `eventDeckId`, `side`, `branch` on `event`; confirm `pivotalEvent.eventCardId` already canonical | **Adopted** (§7 Phase 5) | Codebase verification: `event` declares `params: []` while `legal-moves.ts:1303-1325` emits these four params on every candidate. Phase 5 closes the mismatch. `pivotalEvent.eventCardId` declaration is already canonical and unchanged. |
| Telemetry advisory for uniform preview margins (`POLICY_PREVIEW_UNIFORM_SIGNAL`) | **Deferred to follow-up spec** (§3, §11.5) | Out of scope for this spec; the candidate-param ref family is the primary unblocker. A telemetry-only advisory is a small future spec; profile authors can use authored conditionals in the interim. |
| Dynamic per-candidate tag emission (Option C from the trigger report) | **Rejected as proposed; admitted as compiler macro path** (§3) | Tag bloat plus a quasi-schema for tag-emission is strictly worse than the ref family. If ergonomics later demand tag-style sugar, it lowers via a compiler macro to `candidate.params.*` comparisons (per Foundation #7's "extensibility through compiler macros over generic AST"). |
| Microturn lowering of FITL event side/branch (Option D from the trigger report) | **Deferred to future spec** (§3) | Larger refactor; pivotal events still require readable candidate identity; not a prerequisite for this spec. Queued as a Foundation #19-hardening follow-up. |
| Test plan distribution (architectural-invariant blocking, golden-trace, convergence-witness profile-quality) | **Adopted** (§8) | Aligned with `.claude/rules/testing.md`. The FITL ARVN shaded-event suppression witness is non-blocking profile-quality per the existing rules. |
| Migration plan: cookbook update, parser/compiler update, trace schema extension, FITL action declarations fix, audit other games | **Adopted** (§7) | Migration spans Phases 0-6. The "audit other games" item is handled by the conformance corpus test #11 in §8.1, which forces awareness of how the ref family lands in non-FITL contexts. |

## 13. Out of scope

- **Action-class differentiation at uniform preview margins**: the secondary issue from §3.5 of the trigger report — when `depthCap=4` produces uniform margins across govern/patrol/sweep/assault/train, only hand-tuned per-action boosts can select among them. Addressed in follow-up via the telemetry advisory (§11.5) plus authored conditional libraries; not engine work.
- **Microturn lowering of event side/branch** (Option D from the trigger report): structurally cleaner under Foundation #19 but larger refactor; queued for a follow-up spec.
- **Dynamic per-candidate tag emission** (Option C): rejected outright. A compiler-macro path is admissible if profile demand emerges.

## 14. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-11:

- [`archive/tickets/166CANPARREF-001.md`](../archive/tickets/166CANPARREF-001.md) — Compiled types + schema + diagnostic codes for candidateParam ref family (covers Phase 0; §4.1, §4.4, §5.1)
- [`tickets/166CANPARREF-002.md`](../tickets/166CANPARREF-002.md) — Parser acceptance and compile-time validation of `candidate.params.<name>` (covers Phase 1; §4.1, §4.2, §5.1–§5.5, §5.7)
- [`tickets/166CANPARREF-003.md`](../tickets/166CANPARREF-003.md) — Required-fallback collector and `candidateParamFallback` lowering (covers Phase 2; §4.3, §5.6, §5.8)
- [`tickets/166CANPARREF-004.md`](../tickets/166CANPARREF-004.md) — Runtime resolver `onMissing` path, VM mirror, and `unknownCandidateParamRefs` trace (covers Phase 3; §4.4, §4.5, §6)
- [`tickets/166CANPARREF-005.md`](../tickets/166CANPARREF-005.md) — Trace plumbing through microturn option eval and policy-agent per-candidate channel (covers Phase 4; §4.5, §6)
- [`tickets/166CANPARREF-006.md`](../tickets/166CANPARREF-006.md) — FITL `event` action params declaration + ARVN shaded-event witness (covers Phase 5; §2.3, §2.5, §8.3, §11.4)
- [`tickets/166CANPARREF-007.md`](../tickets/166CANPARREF-007.md) — Cookbook retirement-line rewrite + new candidate-parameter-refs recipe (covers Phase 6; §4.7)

Each ticket records its own acceptance criteria, dependencies, and architectural-invariant test ownership. Wave plan: 001 first; then 002 and 004 in parallel; then 003 (after 002); then 005 (after 003 + 004); then 006 (after 005); then 007 (after 006).
