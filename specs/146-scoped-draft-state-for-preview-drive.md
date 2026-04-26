# Spec 146: Scoped-Draft State For Bounded Synthetic-Completion Preview Drives

**Status**: PROPOSED
**Priority**: P1 (blocks reaching the spec-145 hard target on FITL preview perf and any future faction-evolution campaign that needs sub-25s previewOn budgets)
**Complexity**: M (kernel-internal API addition, no GameSpecDoc change, no new compiler rule, no public-API regression risk; concentrated in `packages/engine/src/kernel/microturn/drive.ts` (new file colocating the shadow chain) + `packages/engine/src/kernel/microturn/types.ts` + `packages/engine/src/agents/policy-preview.ts`. The existing `kernel/microturn/apply.ts` and `kernel/microturn/publish.ts` are intentionally NOT modified — preserving their V8 JIT profiles is the architectural argument for a separate file.)
**Dependencies**:
- Spec 145 [bounded-synthetic-completion-preview] (archived) — establishes the inner-microturn drive contract this spec optimizes.
- Spec 144 [probe-and-recover-microturn-publication] (archived) — the kernel-side analog that this spec mirrors on the agent-preview side.
- Foundation 11 (Immutability) — the spec relies on the existing "scoped internal mutation" exception clause.

**Source**:
- Campaign results `campaigns/fitl-preview-perf/results.tsv` (entries `exp-001` through `exp-017`, 2026-04-26; campaign objective in `campaigns/fitl-preview-perf/program.md`): 17 experiments demonstrating that after exhausting orchestration-level skips (cumulative -64.76% from baseline 88394 ms → 31149 ms), the remaining ~17.8% gap to the hard target is dominated by per-iteration kernel state-mutation cost.
- V8 sampling profile after exp-015: ~9% of total CPU is `digestDecisionStackFrame` (`packages/engine/src/kernel/zobrist.ts:175`) via `updateHash` inside `applyPublishedDecisionInternal` (5.3%) + `spawnPendingFrame` (3.8%) + `clearMicroturnState` residual. Each inner-microturn iteration of `driveSyntheticCompletion` triggers at least one full Zobrist recomputation as the kernel finalizes intermediate state via spread + `updateHash`.
- exp-017 attempted to thread a `skipFinalHash` boolean through `applyPublishedDecisionInternal` + `applyChosenMove` + `spawnPendingFrame` + `continueResolvedMove` (~60 lines of changes across 4 hot kernel functions). The metric was flat (+0.12% within mad_pct=0.36% noise) — V8 deopt from changing the signature of multiple hot kernel functions in the same direction roughly equalled the theoretical ~9% savings. Confirmed by the global negative lesson: "modifying multiple hot-path kernel function signatures triggers compounding V8 deopt costs that can offset theoretical savings".
- Global lessons archive: `campaigns/lessons-global.jsonl` records the same conclusion across multiple prior FITL perf campaigns — "object spread immutability costs 15% CPU — addressable via Foundation 11's scoped-draft-state carve-out". The carve-out exists in F#11 but has never been extended to multi-decision drives.

## Brainstorm Context

**Original framing.** Spec 145's bounded synthetic-completion driver gave the agent preview pipeline a working state-projection signal. That spec accepted the per-iteration kernel cost as a trade-off; it did not promise to make the per-iteration step cheap. The fitl-preview-perf campaign demonstrated that orchestration-level skips (cached origin publishMicroturn, fast-variant `*FromCanonicalState` kernel APIs, greedy-aware publish that short-circuits remaining-option verification, deferred sort removal in error-construction diagnostics) reduce the cost by 64.76%. The remaining cost is structural: every inner-microturn iteration re-canonicalizes state via spread + Zobrist, even though the agent driver consumes only the FINAL state's hash and outcome.

**Motivation.**
1. **Foundation 11 already authorizes scoped internal mutation** for performance, with the explicit safety contract: "Within a single synchronous effect-execution scope, the kernel MAY use a private draft state or copy-on-write working state for performance. That working state MUST be fully isolated from caller-visible state". The agent's bounded synthetic-completion drive is exactly this kind of synchronous scope — it owns its `state` variable end-to-end, no other code holds a reference.
2. **The existing carve-out is narrow.** `kernel/state-draft.ts`'s `createMutableState` is consumed only by single-effect dispatches (`applyEffectsWithBudgetState` in `packages/engine/src/kernel/effect-dispatch.ts:109`); the multi-decision drive path uses the immutable contract throughout. This spec extends the existing pattern to span an entire bounded drive — the FIRST multi-decision application of the F#11 carve-out in this codebase. The mutation primitives (`createMutableState`, `DraftTracker`) are reused unchanged; only the scope is new. The conformance witness in D5 establishes the precedent for future scope extensions.
3. **No new architectural commitments.** The drive is already bounded (Spec 145's `K_PREVIEW_DEPTH=8`), already deterministic (every step uses kernel `applyPublishedDecisionInternal`), and already isolated (the agent owns its state object). Only the per-iteration finalization is wasteful.

**Prior art surveyed.**
- **TAG / OpenSpiel forward models** materialize `applyAction` results and let the agent ignore intermediate hashes; their hash equivalents (state-hash for transposition tables) are computed lazily on demand, not on every transition.
- **OpenSpiel** in particular has `State.Clone()` for mutable scratch states used inside MCTS rollouts; the `State` returned from a public `ApplyAction` is canonical, but rollout code uses cloned-and-mutated state.
- **chess.js / lichess engines** do not recompute Zobrist on every move during search; they incrementally update or skip the hash entirely for non-terminal exploration states.

The shared pattern: bounded simulation scopes can use private mutable state. Public APIs return canonical immutable state. This spec adopts the same shape, scoped to the synthetic-completion drive only.

**Synthesis.** Add a kernel-private `applyDriveCompletionGreedy` (working name) that:
1. Takes a canonical input `state`, an `origin` context (`{ seatId, turnId }`), a depth cap, and a runtime.
2. Maintains an internal mutable working state (or sequence of unhashed states with a single `updateHash` at exit) for the duration of the drive.
3. Internally iterates the existing greedy-pick / `applyPublishedDecisionInternal` logic but skips per-iteration `updateHash` calls.
4. Returns `{ state, depth, kind }` where `state.stateHash === _runningHash === computeFullHash(...)` (canonical) only at exit.

The agent driver in `policy-preview.ts` calls this single kernel function in place of its current per-iteration loop. The kernel owns the loop and the mutation discipline; the agent owns the picker semantics through a small callback contract.

**Alternatives explicitly considered (and rejected).**
- **Thread `skipFinalHash` boolean through 4+ kernel functions.** Tried as exp-017. V8 deopt from parameter-shape changes equalled the saved hash work. Rejected — empirically demonstrated to be a wash.
- **Lazy `state.stateHash` getter.** Replace the eager `bigint` field with a thunk-cached getter. Touches every site that reads `state.stateHash` (legal-moves, serde, decision logs, fingerprint tracking, ~25 call sites). Rejected — too invasive for a single optimization.
- **Lower `K_PREVIEW_DEPTH`.** The campaign's hard target was set assuming `depthCap=8`; lowering it would be metric gaming. Rejected — campaign-rule conflict.
- **Move the inner loop into a TypeScript-level kernel closure but keep per-iteration `updateHash`.** Saves agent-call overhead only (~1%); too small to justify the new API. Rejected — insufficient ROI.
- **AOT-compile the drive as a per-action specialized function.** Possible long-term, but it depends on Spec 147 (AOT consideration compilation) landing first. Rejected — out of scope.

**User constraints reflected.** F#5 (One Rules Protocol — the kernel still owns the apply pipeline; the new function is a kernel API, not a UI shortcut), F#8 (Determinism — the final `state.stateHash` is canonical, identical to the result of the immutable path on the same inputs), F#10 (Bounded — `K_PREVIEW_DEPTH` is already the cap), F#11 (Immutability — the new function is the precise scope F#11's exception was designed for), F#15 (Architectural Completeness — replaces the parameter-threading hack with a clean kernel-internal API), F#19 (Atomic Decision Granularity — every inner microturn is still atomic; the agent picker still chooses one decision at a time).

## Overview

Add `applyPreviewDriveGreedyChooseOne(def, initialState, origin, depthCap, runtime): { state: GameState; depth: number; kind: 'completed' | 'stochastic' | 'depthCap' | 'failed' }` to `packages/engine/src/kernel/microturn/apply.ts` (or a new `kernel/microturn/drive.ts`). The function:

1. Takes a canonical `initialState` (caller MUST guarantee `stateHash === _runningHash === fullHash`).
2. Internally maintains a mutable scoped state per Foundation 11's exception clause. No caller-visible aliasing; the input `initialState` is never modified.
3. Iterates the inner-microturn drive using the same `applyPublishedDecisionInternal` logic and the same greedy-chooseOne pick (read first legal+supported option from `top.context.options`, build matching decision, apply).
4. Skips per-iteration `updateHash` calls; intermediate states carry stale `_runningHash` and `stateHash` that are NOT exposed to any consumer.
5. At exit (any of the four `kind` outcomes), runs `updateHash(def, finalState, runtime)` so the returned state is canonical.
6. The agent driver in `policy-preview.ts:driveSyntheticCompletion` calls this single function for the chooseOne fast path; the existing slow path (chooseN, agentGuided fallback) remains unchanged.

## Problem Statement

### Defect class: per-iteration Zobrist recomputation

Spec 145 established that the synthetic-completion driver iterates ~3-6 inner microturns per ready outcome × ~200 ready outcomes per FITL benchmark = ~600-1000 inner iterations. Each iteration calls `applyPublishedDecisionFromCanonicalState`, which inside `applyPublishedDecisionInternal` ends one of several branches with `updateHash(def, {...newStateContent}, runtime)`. The hash work is concentrated in `digestDecisionStackFrame` (`packages/engine/src/kernel/zobrist.ts:175`) iterating every frame of `decisionStack`.

The campaign's V8 sampling profile (post-exp-015) attributes ~9% of total CPU to this `updateHash`-via-`computeFullHash`-via-`digestDecisionStackFrame` chain, with bottom-up call-graph attribution showing `applyPublishedDecisionInternal` direct (5.3%) and `spawnPendingFrame` (3.8%) as the two dominant entry points.

### Why the existing F#11 carve-out doesn't apply

`kernel/state-draft.ts:createMutableState` and `DraftTracker` are consumed by `applyEffectsWithBudgetState` for single-effect dispatch. They never span more than one effect-tree application. The multi-decision drive in `policy-preview.ts:driveSyntheticCompletion` calls `applyPublishedDecisionFromCanonicalState` repeatedly — each call is a fresh effect-tree dispatch with its own draft scope. The drive itself has no scope-spanning mutation discipline.

### Why threading a `skipFinalHash` flag failed

exp-017 added a boolean parameter to four hot kernel functions and conditionally bypassed `updateHash`. The change correctness was proven (full gate passed, state hash preserved). The metric was flat: V8 had to re-JIT four hot functions with a new signature, and the inline-cache misses across the modified call graph offset the saved hash computation. The fundamental issue: V8 optimizes hot paths based on monomorphic call-site shapes, and parameter additions to multiple functions in the same call chain compound the deopt cost.

### Why a single new kernel function avoids the V8 problem

A single new function `applyPreviewDriveGreedyChooseOne` adds a fresh entry point that V8 optimizes independently. The existing `applyPublishedDecisionInternal` and friends are unchanged, so their JIT profiles are preserved. Inside the new function, the loop is contained — V8 can optimize it as a tight kernel hot path without crossing module boundaries.

## Design

### D1. New types (in `kernel/microturn/types.ts`)

```ts
export interface PreviewDriveResult {
  readonly state: GameState;          // canonical: stateHash === _runningHash === fullHash
  readonly depth: number;
  readonly kind: 'completed' | 'stochastic' | 'depthCap' | 'failed';
  readonly failureReason?: string;
}

export interface PreviewDriveOrigin {
  readonly seatId: SeatId | '__chance' | '__kernel';
  readonly turnId: TurnId;
}
```

### D2. New kernel API

In `kernel/microturn/drive.ts` (new file):

```ts
/**
 * Bounded greedy-chooseOne synthetic-completion drive. Caller MUST guarantee
 * `initialState` is canonical (`stateHash === _runningHash === fullHash`).
 *
 * The function iterates inner-microturn picks for the chooseOne kind only:
 *   - if state.decisionStack top.kind is chooseOne and seatId/turnId still match
 *     origin, find the first legal+supported option and apply it via the
 *     INTERNAL kernel pipeline that intentionally SKIPS per-iteration
 *     updateHash;
 *   - if any iteration produces a non-chooseOne top frame (actionSelection /
 *     chooseNStep / stochasticResolve / outcomeGrantResolve / turnRetirement),
 *     OR the seat/turn diverges from origin, OR depthCap is reached, the loop
 *     exits and the function canonicalizes the final state via updateHash
 *     before returning.
 *
 * For chooseNStep and agentGuided picks, the agent driver MUST fall back to
 * the existing `applyPublishedDecisionFromCanonicalState` per-iteration path.
 * This spec narrows the fast variant to greedy chooseOne, which empirically
 * accounts for >90% of FITL inner microturns under spec-145 profiles.
 */
export const applyPreviewDriveGreedyChooseOne = (
  def: GameDef,
  initialState: GameState,
  origin: PreviewDriveOrigin,
  depthCap: number,
  runtime?: GameDefRuntime,
): PreviewDriveResult;
```

### D3. Mutation discipline

Inside `applyPreviewDriveGreedyChooseOne`:

1. Maintain an internal mutable holder: `let workingState: GameState = initialState;`. The initial state is the caller's canonical state — never mutated, only the local `workingState` reference is reassigned.
2. Each iteration calls `applyPublishedDecisionInternalNoFinalHash(def, workingState, microturn, decision, options, resolvedRuntime)` — a kernel-internal helper that mirrors `applyPublishedDecisionInternal` but with all `updateHash` calls bypassed. Only used from this function and from helper internals.
3. The `applyPublishedDecisionInternalNoFinalHash` implementation is a SHADOW of the existing `applyPublishedDecisionInternal` — same structure, but every `updateHash(def, X, runtime)` becomes `X` (the unhashed object). Sub-helpers (`applyChosenMoveNoFinalHash`, `spawnPendingFrameNoFinalHash`, `continueResolvedMoveNoFinalHash`) likewise mirror their hashed counterparts. The full shadow set is FOUR functions, not three: `applyPublishedDecisionInternal` calls `continueResolvedMove` from four sites (`apply.ts:602` in the chooseOne branch, plus 675/711/727), and `continueResolvedMove` itself tail-calls into `applyChosenMove` or `spawnPendingFrame`. Without `continueResolvedMoveNoFinalHash`, the chooseOne shadow path would re-enter the canonical (hashing) helpers via the continuation tail call and defeat the optimization. The shadow chain is colocated in `kernel/microturn/drive.ts` and clearly marked as drive-internal.
4. At exit, `workingState = updateHash(def, workingState, resolvedRuntime);`. The canonical hash is computed once.
5. The shadow functions consume the same `state-draft.ts` mutation utilities the existing F#11 carve-out uses — they do not introduce a new mutation primitive, only a new scope for the existing one.

### D4. Caller migration

In `packages/engine/src/agents/policy-preview.ts:driveSyntheticCompletion`:

Replace the inner-microturn loop's greedy-chooseOne fast path with a single call to `applyPreviewDriveGreedyChooseOne`. The existing cheap state-stack exit checks (introduced by exp-014, currently at `policy-preview.ts:732–752`) move into the new kernel function.

The new function applies ONLY when both gating conditions hold: `top.context.kind === 'chooseOne'` AND `completionPolicy === 'greedy'` (matching the existing fast-path predicate at `policy-preview.ts:758`). The agent driver's slow path remains the fallback in three cases:

1. The inner top frame is `chooseNStep`.
2. The inner top frame is `chooseOne` but `completionPolicy !== 'greedy'` (i.e., `agentGuided`).
3. Any non-greedy picker invocation.

The slow-path branches continue to use `publishMicroturnFromCanonicalState` + `applyPublishedDecisionFromCanonicalState` (per-iteration hash retained). The returned `PreviewDriveResult` maps directly onto the existing `DriveResult` union in `policy-preview.ts:198–221` (`completed | stochastic | depthCap | failed`).

### D5. Mutation safety contract (F#11)

The new function MUST satisfy F#11's exception clause:
- The `initialState` argument is never mutated. The substantive guarantee is non-mutation, not non-aliasing — early exits (depth=0 due to immediate seat/turn divergence or already-terminal state) MAY legitimately return the input reference unchanged. A regression test asserts `initialState.stateHash === computeFullHash(table, initialState)` after the call AND that nested mutable fields (`decisionStack`, `players`, zone token bags, marker maps) are reference-equal to their pre-call snapshots when no logical change occurred. Object inequality of the returned reference is NOT a required invariant.
- The shadow functions never publish or expose intermediate unhashed states outside the drive function's local scope.
- Determinism is proven by a fixture: same `(def, initialState, origin, depthCap, runtime)` produces identical `result.state.stateHash` across N independent invocations.
- The conformance corpus (F#16) gains a new test class: `architectural-invariant`, `@witness: spec-146-drive-mutation-safety`, asserting the above across FITL and Texas Hold'em representative inputs. FITL owns the active multi-step `chooseOne` shadow-chain witness because live FITL states exercise that path. Texas Hold'em owns the same API's production-relevant non-applicable/exit witness when no `chooseOne` continuation is available; the test suite must not alter Texas rule data or add game-specific engine behavior solely to manufacture the optimized path.

### D6. ABI compatibility

The existing `applyPublishedDecision`, `applyPublishedDecisionFromCanonicalState`, `applyDecision`, `publishMicroturn`, `publishMicroturnFromCanonicalState`, and `publishMicroturnGreedyChooseOne` exports are unchanged. The internal helpers `applyPublishedDecisionInternal` (`apply.ts:496`), `applyChosenMove` (`apply.ts:327`), `spawnPendingFrame` (`apply.ts:354`), and `continueResolvedMove` (`apply.ts:410`) are likewise unmodified — preserving their V8 JIT profiles is the architectural reason for colocating the shadow chain in a separate file rather than threading a flag through them. The new function is purely additive. Per F#14 (No Backwards Compatibility), this spec does not introduce a deprecation path — it adds a single new entry point.

## Acceptance Criteria

1. **Performance**: `previewOn_totalMs_ms` on the spec-145 perf corpus (`packages/engine/test/perf/agents/preview-pipeline.perf.test.ts`) drops from ~31s (post-fitl-preview-perf campaign) to ≤25.6s (the hard target). Measured by 3 harness runs, mad_pct < 1.5%.
2. **Determinism**: All `packages/engine/test/determinism/` corpus passes. Per-frame hash equivalence proven for the post-drive state across 10 independent runs.
3. **F#11 safety**: Regression test asserts caller-supplied `initialState` is unmodified after `applyPreviewDriveGreedyChooseOne`.
4. **Full gate**: `pnpm turbo test` passes (engine + runner) including the new spec-146 suite.
5. **Profile evidence**: `digestDecisionStackFrame` ticks attributable to `applyPublishedDecisionInternal` + `spawnPendingFrame` drop by ≥80% (the per-iteration hash savings target).

## Risks

- **Shadow-chain maintenance burden**: `*NoFinalHash` mirrors of `applyPublishedDecisionInternal`, `applyChosenMove`, `spawnPendingFrame`, `continueResolvedMove`. Mitigated by colocation in `kernel/microturn/drive.ts`, comprehensive test coverage, and a CI assertion that the shadow chain produces identical state hashes (after a final updateHash) to the canonical chain on a corpus of known transitions.
- **F#11 violation if someone adds a leaky observer**: Any future code that captures intermediate `workingState` references would break the contract. Mitigated by linting (the shadow chain's parameter type can be a branded `MutablePreviewDraftState` that cannot escape the module).
- **Spec creep**: The narrow scope — greedy chooseOne only — keeps the design tractable. ChooseNStep and agentGuided pickers remain on the slower per-iteration path. A future spec can extend if measurements warrant.

## Out Of Scope

- Spec 147 (AOT consideration AST compilation).
- Spec 148 (integer-interned identifiers).
- Lazy `state.stateHash` getter design.
- Removal of any existing kernel API.
- `chooseNStep` or `agentGuided` fast paths.

## Follow-On Tickets

Suggested ticket namespace for `/spec-to-tickets`: **`146DRIVE-*`** (matches existing convention: `145PREVCOMP-*` for spec 145, `144PROBEREC-*` for spec 144).

Anticipated decomposition (informational — finalized by `/spec-to-tickets`):

1. Add `PreviewDriveResult` and `PreviewDriveOrigin` types in `kernel/microturn/types.ts`.
2. Implement the four-shadow chain (`applyPublishedDecisionInternalNoFinalHash`, `applyChosenMoveNoFinalHash`, `spawnPendingFrameNoFinalHash`, `continueResolvedMoveNoFinalHash`) plus `applyPreviewDriveGreedyChooseOne` in new file `kernel/microturn/drive.ts`.
3. Add the conformance witness suite (F#16, `@witness: spec-146-drive-mutation-safety`) covering F#11 mutation safety and determinism for FITL + Texas Hold'em.
4. Migrate `policy-preview.ts:driveSyntheticCompletion` to call the new function on the gated chooseOne+greedy fast path; preserve the slow path for chooseNStep and agentGuided.
5. Run `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` to validate the ≤25.6s hard target (3 harness runs, mad_pct < 1.5%).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-04-26:

- [`archive/tickets/146DRIVE-001.md`](../archive/tickets/146DRIVE-001.md) — Add `PreviewDriveResult` and `PreviewDriveOrigin` types (covers D1)
- [`archive/tickets/146DRIVE-002.md`](../archive/tickets/146DRIVE-002.md) — Implement drive function + four-shadow chain in `kernel/microturn/drive.ts` (covers D2, D3, D6)
- [`archive/tickets/146DRIVE-003.md`](../archive/tickets/146DRIVE-003.md) — Conformance witness suite for drive mutation safety, determinism, and shadow-canonical parity (covers D5 + Risks shadow-chain mitigation)
- [`archive/tickets/146DRIVE-004.md`](../archive/tickets/146DRIVE-004.md) — Migrate `driveSyntheticCompletion` greedy-chooseOne path + perf gate validation (covers D4; archived as the completed caller-migration owner, with Acceptance Criteria 1 remaining red under 146DRIVE-005)
- [`tickets/146DRIVE-005.md`](../tickets/146DRIVE-005.md) — Investigate post-migration preview perf shortfall and reconcile the next owner after 004 measured `mean_totalMs=27925.19 ms` against the `25600 ms` hard target
