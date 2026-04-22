# Spec 140: Microturn-Native Decision Protocol (Phase 3)

**Status**: COMPLETED
**Priority**: P1 (architectural simplification, unblocks richer agent policy evaluation; no active CI failure)
**Complexity**: XL (cross-package: engine kernel, simulator, agents, worker bridge, runner UI, tests, goldens, policy profiles)
**Dependencies**: Spec 139 [constructibility-certificate-legality-contract] (landed — this spec retires its certificate machinery and restates its FOUNDATIONS #18 amendment), Spec 138 [enumerate-time-template-viability-classifier] (archived — already superseded by 139; fully retired here), Spec 137 [convergence-witness-invariant-promotion] (distillation protocol applied in test rewrites), Spec 134 [unified-move-legality-predicate] (preserved — still the final legality oracle, now invoked per microturn), Spec 132 [agent-stuck-viable-template-completion-mismatch] (archived — template-completion concern disappears under microturns), Spec 97 [decision-point snapshot infrastructure] (leveraged — snapshot types generalize to per-microturn)
**Source**: Deferred Phase 3 block in Spec 139 § Future Work, built on `reports/legal-moves-research.md` § "Split decision states (new direction)". External prior-art survey completed 2026-04-20 covering OpenSpiel (DeepMind), the Tabletop Games Framework (TAG, Queen Mary University of London), PyTAG (multi-agent RL on TAG), General Game Playing (Stanford), and classical extensive-form game theory.

## Brainstorm Context

**Original framing (Spec 139 Phase 3).** Spec 139 stabilized the legality contract by adding completion certificates so incomplete templates could not become legal without a kernel-produced witness. The spec explicitly deferred the long-term architecture: **reify pending decisions as kernel-owned split decision states / microturns.** Under that end-state, template completion as an agent concern disappears entirely, the sampler is retired, and the certificate is no longer needed because every legal action is already complete-in-its-own-microturn.

**Motivation.** Two concrete gains drive Phase 3:

1. **Human player in the runner.** The runner already presents decisions choice-by-choice via `legalChoices` / `advanceChooseN` / `ChoicePanel`. That flow is a runner-local convenience layered on top of a move-at-a-time kernel. Under microturns, the kernel *is* that layer; the runner simply projects kernel microturn states. Rewind, breadcrumbs, cancellation, and illegality feedback become kernel-owned and engine-wide instead of a runner reconstruction.
2. **AI agents.** Today's `PolicyAgent` scores complete moves (Phase 1 action preview + Phase 2 completion). Microturn-native agents score at every decision frontier. The policy DSL gains per-microturn evaluation context, enabling materially richer policy expressions than the current two-phase approximation — the user explicitly called out "policies at the microturn level, not just a phase 1 and phase 2."

**Prior art surveyed.** Three reference systems handle this shape:

- **OpenSpiel (DeepMind)** — procedural extensive-form games. Every decision is a `State`; `State.LegalActions()` returns atomic actions; `State.ApplyAction(action)` advances one step. Chance is its own player. Sequential sub-decisions, compound turns, and imperfect information are all modeled uniformly as consecutive states for different deciders (human, chance, or partial-observer). [OpenSpiel concepts](https://openspiel.readthedocs.io/en/latest/concepts.html).
- **TAG: Tabletop Games Framework (Queen Mary London)** — the closest architectural match. `IExtendedSequence` interface with a stack of in-progress sequences stored in `GameState`. An action that needs sub-decisions calls `state.setActionInProgress(seqObj)` to push a sub-sequence. After each action, the ForwardModel pops finished sequences from the top of the stack. The design paper cites Dominion's "discard 3 of 6" (20 actions → 3 chained decisions) as the archetype — exactly our FITL `march` `chooseN{min:1,max:27,options:27}` case. [TAG Actions and Rules](https://tabletopgames.ai/wiki/games/creating/actions_and_rules.html), [TAG Design paper (arXiv)](https://arxiv.org/pdf/2009.12065), [TAG ceur-ws paper](https://ceur-ws.org/Vol-2862/paper9.pdf).
- **PyTAG (multi-agent RL on TAG)** — uses action masks over the variable action space at each microturn; RL policies only pick from the legal mask. Generalizes cleanly to our policy-DSL evaluation per microturn. [PyTAG arXiv](https://arxiv.org/html/2405.18123v1).

**Synthesis.** Adopt TAG's decision-stack pattern as the kernel representation. Retire templates, certificates, and template-completion from the client-visible contract. Every kernel-published legal action is atomic at its microturn scope. The simulator loop becomes decision-by-decision; the worker bridge protocol becomes microturn-native; the runner UI simplifies; the PolicyAgent gains per-microturn policy evaluation.

**Alternatives explicitly considered (and rejected).**

- **Flat game-tree nodes (OpenSpiel-style, no stack).** Maximum purity, but effect-driven kernels open nested decisions mid-execution; flat representation forces the effect compiler to pre-plan every decision, losing the compositional clarity that today's instruction set provides. Rejected — F11/F12 conflict.
- **Turn-continuation events with retained `Move` aggregation.** Preserves existing `MoveLog` shape byte-compatibly, but runs two grammars (microturn + aggregated move) in parallel. Agents end up reasoning about both. Rejected — F5 spirit violated; template complexity returns.
- **Keep Spec 139's certificate contract indefinitely.** Certificates fix constructibility but do not give agents per-microturn evaluation context. The user specifically asked for richer microturn-level policies; certificates do not unlock that. Rejected — leaves the primary motivating capability on the table.
- **Per-game microturn adoption (FITL-only).** Violates F1 (engine agnosticism). Rejected.
- **Dual-contract transition period.** Violates F14 (no backwards compatibility). Rejected.

## Overview

This spec adopts a **microturn-native decision protocol** as the kernel representation. The kernel publishes a single microturn state at each step; its legal actions are **atomic decisions only** (one `chooseOne` bind, one `chooseN` step, one stochastic resolve, one action selection, or one free-operation outcome grant). `applyDecision` consumes exactly one decision and returns the next kernel state, which may be another microturn for the same seat (compound turn continuation), a microturn for a different seat (reaction or seat change), a chance microturn (kernel auto-advances), or a fully retired turn.

Templates, completion certificates, template completion, and client-side completion search are retired. The `CompletionCertificate` type, `certificateIndex`, `decision-sequence-satisfiability` classifier's full-path search, `choose-n-set-variable-propagation` (as an admission-time tool), `emitCompletionCertificate`, and the agent template-retry loop all delete in the same change (F14).

The change is engine-agnostic: zero per-game code is added. The GameDef YAML contract and kernel DSL instruction set are unchanged. The change is in how `chooseN`/`chooseOne`/`chooseStochastic` execution is **scheduled** — not in what these operators mean.

This spec also amends `docs/FOUNDATIONS.md`: F5, F10, and F18 are restated to match the new contract, and a new F19 (`Decision-Granularity Uniformity`) is added. See § Design D10.

## Problem Statement

### What Spec 139 left open

Spec 139 closed the "pseudo-legal template" defect by requiring every client-visible incomplete move to carry a kernel-produced completion certificate. That works and is stable. But three structural concerns remain:

1. **Template machinery persists as a dual grammar.** `LegalMoveEnumerationResult.moves[]` still contains templates (viability.complete = false with a certificate side-channel). The agent first attempts random completion, falls back to certificate materialization. The simulator loop still advances at the granularity of "one aggregate compound turn." The authoritative state transition is still `applyMove(template-or-complete-move) → newState`. Two ways for a move to be valid means two ways to reason about legality.
2. **Agent policy evaluation is move-level, not decision-level.** `PolicyAgent`'s Phase 1 (action preview) and Phase 2 (completion scoring) are workarounds for not being able to score *inside* a compound turn. A policy expression cannot easily reference the partial state after deciding the second of three `chooseN` selections — that state is not a first-class kernel object. Evolution of better policies is bounded by this.
3. **The runner UI reconstructs microturn semantics that the kernel should own.** `game-store.ts` tracks a `selectedAction`, `choiceStack`, and `partialMove`, and calls `legalChoices` / `advanceChooseN` to get per-decision legality. Rewind, cancellation, breadcrumbs, and illegality feedback are all runner-side reconstructions of state the kernel does not publish. A second runner (e.g., a CLI, a test harness, an alternate agent shell) has to re-implement the same reconstruction.

### Why these are not separate problems

They are all consequences of the kernel contract being "one compound turn = one state transition." That contract is a representational choice, not a semantic necessity. The kernel instruction set already supports atomic decisions — `chooseN` sub-selections, `chooseOne` binds, stochastic resolutions — but they currently execute **inside** a single `applyMove` call instead of **across** a sequence of `applyDecision` calls.

Making the kernel publish every atomic decision as its own microturn fixes all three problems at once. The agent API, the trace protocol, the worker bridge, and the runner state model all simplify because they converge on the same shape: one decision at a time, by one decider, against one projected state.

### The core defect in shorthand

> "One `applyMove` call" is the wrong unit of kernel advance. It bakes in assumptions about decision granularity, policy evaluation scope, and UI projection that do not generalize across games or across richer agent architectures.

## Goals

- **G1 — Decision stack in GameState.** Introduce `GameState.decisionStack: readonly DecisionStackFrame[]` holding pending sub-decisions. The top frame is the active microturn. See Design D2.
- **G2 — Atomic microturn publication.** `publishMicroturn(def, state) → MicroturnState` returns a state that exposes exactly one pending decision and its atomic legal actions. No templates, no completion-required shapes. See Design D3.
- **G3 — Decision-at-a-time advance.** `applyDecision(def, state, decision) → { state, log }` consumes exactly one atomic decision. Mid-execution effect frames are suspended and resumed via a resumption token on the stack. See Design D3.
- **G4 — Auto-advance for chance / grant microturns.** `advanceAutoresolvable(def, state)` repeatedly applies kernel-owned microturns (stochastic resolution, free-operation grant resolution, turn-retirement markers) until the next player-owned microturn. Simulators and worker bridges call this between agent steps. See Design D3.
- **G5 — Agent surface rework.** `Agent.chooseMove` → `Agent.chooseDecision(input: { def, state, microturn, rng, runtime? })`. `PolicyAgent` gains per-microturn policy evaluation with a new `microturnContext` binding. Phase 1 / Phase 2 split retires. See Design D5.
- **G6 — DecisionLog replaces MoveLog.** `GameTrace.moves[]` → `GameTrace.decisions[]`. Each entry records one atomic decision with `turnId` grouping siblings of a compound turn. `GameTrace` gains `compoundTurns[]` for analytics continuity. See Design D4.
- **G7 — Worker bridge protocol rewrite.** `GameWorkerAPI` replaces `enumerateLegalMoves` / `legalChoices` / `advanceChooseN` / `applyMove` / `applyTrustedMove` / `applyTemplateMove` with `publishMicroturn` / `applyDecision` / `advanceAutoresolvable`. See Design D6.
- **G8 — Runner UI rewire.** `ChoicePanel` + `game-store.ts` are rewired to project kernel microturn state directly. `selectedAction`, `choiceStack`, `partialMove` become derived projections of the decision stack, not independently tracked store fields. See Design D7.
- **G9 — Certificate machinery retirement.** All Spec 139 artifacts that represented the "template + certificate" contract are deleted in the same change (F14). The underlying search machinery may be retained as an internal helper for non-admission-time uses (e.g., action-availability preview). See Design D8.
- **G10 — Policy profile migration.** Every profile expression in `data/games/fire-in-the-lake/92-agents.md` (and any Texas Hold'em equivalents) is migrated to the microturn-native DSL in the same change (F14). Mechanically rewritten where possible; re-evolved where not. See Design D9.
- **G11 — FOUNDATIONS amendments.** Apply the F5, F10, F18 restatements and add F19 (`Decision-Granularity Uniformity`) in the same change. The implementation must satisfy the amended Foundations as proven invariants. See Design D10.
- **G12 — Replay-identity preservation across the migration boundary.** Post-spec traces are bit-identical across runs on the new protocol (strict determinism). Pre-spec traces are **not** re-executable under the new contract; historical traces are migrated via a one-time transform utility for analytics continuity, not for replay verification. Re-execution of historical games requires re-running from the original seed under the new kernel.
- **G13 — No-throw invariant strengthened.** `F15` global invariant from Spec 139 (agents never throw when legal actions are non-empty) is preserved and strengthened: every published microturn's legal actions are directly applicable; the absent-certificate branch from Spec 139 D6 is structurally unreachable.
- **G14 — Bounded per-turn overhead.** Aggregate overhead of a compound turn (N microturns + publish + advance) stays within 1.5× of the current single-`applyMove` latency on the stable FITL corpus. Single-decision turns may short-circuit to a direct-apply path when beneficial. See Edge Cases.

## Non-Goals

- **No new agent type.** `RandomAgent`, `GreedyAgent`, `PolicyAgent` remain. Their `chooseDecision` body and the PolicyAgent policy-evaluation path change; the external taxonomy does not.
- **No GameDef YAML / compiler contract change.** Kernel DSL operators (`chooseN`, `chooseOne`, `chooseStochastic`, `forEach`, `repeat`, `let`, triggers, etc.) are unchanged. Only their execution scheduling changes.
- **No per-game code.** F1. Zero FITL-, Texas-, or game-family-specific branches.
- **No change to kernel legality oracle.** `evaluateMoveLegality` from Spec 132/134 is the final oracle; it is now invoked per microturn but unchanged. (At microturn resolution time, the decision being applied plus the accumulated bindings form a partial move whose legality is checked against the unified predicate.)
- **No external solver / third-party library.** F1 + F8 + F13.
- **No dual-contract transition period.** F14. Atomic migration only.
- **No backwards-compatible runner store shape.** The store fields that tracked speculative partial-move state (`selectedAction`, `choiceStack`, `partialMove`) are replaced with derived projections. Existing component consumers are migrated in the same change.
- **No new spec for MCTS / microturn-aware tree-search agent.** That is future work and depends on this spec. See § Future Work.
- **No hidden-information model change.** F4 is preserved. Microturn projection is strictly per-decider; this cleans up the existing model rather than changing it.
- **No change to visual-config.yaml contract.** F3 preserved. The runner still consumes visual config through `VisualConfigProvider` — the only change is that microturn state drives UI queries instead of partial-move state.

## Required Investigation (Pre-Implementation)

Each investigation MUST produce either a checked-in fixture, a test file, or a measurement report referenced from the spec's tickets. No implementation work begins until I1 through I5 complete.

### I1 — FITL compound-turn inventory

For every FITL action in `data/games/fire-in-the-lake/` that uses `chooseN`, nested `chooseOne`, or `chooseStochastic`, document the decomposed microturn sequence shape under the new contract:

- Trigger state: action just selected, zero bindings accumulated.
- Microturn sequence: ordered list of `(decisionKind, decisionKey, options-at-publication, legal-action-count)`.
- Turn-retirement boundary: which microturn ends the compound turn.
- Reaction / interrupt boundaries: which microturns are pushed by event triggers mid-turn.

Output: a checked-in fixture table at `packages/engine/test/fixtures/spec-140-compound-turn-shapes/fitl-actions.json` plus a walk-through document under `campaigns/phase3-microturn/compound-turn-inventory.md`. Covers at minimum: `march`, `operation-terror`, `operation-assault`, `operation-patrol`, `operation-rally`, `operation-train`, `operation-ambush`, all event-card-driven actions with chooser branches.

This is the design validator for the stack shape. If any FITL action produces a shape that cannot be represented as a `DecisionStackFrame[]` sequence, the spec is revised before implementation begins.

### I2 — Policy profile migration audit

Grep every policy expression in `data/games/fire-in-the-lake/92-agents.md`. Classify each expression into one of:

- **(A) Microturn-compatible as-is.** Expression references only game-state variables and action-level metadata. Evaluates identically at the action-selection microturn. No change required.
- **(B) Mechanically rewriteable.** Expression references partial-move params that have a direct microturn-context equivalent (`accumulatedBindings[decisionKey]`, `options[n].metadata`, etc.). Rewrite with a mechanical transform; document the transform.
- **(C) Requires re-evolution.** Expression depends on the two-phase scoring shape in a way that does not have a 1:1 microturn equivalent (e.g., expressions that normalize scores across all completions of a template). Mark for re-evolution from scratch in a Wave 5 campaign.

Output: a classification table at `campaigns/phase3-microturn/profile-migration-audit.md` covering every profile declared in `data/games/fire-in-the-lake/92-agents.md` and `data/games/texas-holdem/92-agents.md` at migration time. The current FITL set is `us-baseline`, `arvn-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`; in-progress `*-evolved` profiles (e.g., `us-evolved`) may appear between now and migration depending on campaign state — the audit enumerates profiles as they exist in the file at the moment migration begins, not against a frozen list. Quantify: N profiles, M expressions, breakdown by category.

This is the migration-cost gate. If category (C) exceeds a reasonable campaign budget, the spec is revised to include an explicit re-evolution phase with a time budget and success criterion.

### I3 — Worker-bridge session retirement audit

Inventory every runner-side consumer of the deprecated worker bridge APIs:

- `bridge.enumerateLegalMoves` — every call site, every consumer of the result shape, every test using `certificateIndex`.
- `bridge.legalChoices` — every call site in `game-store.ts`, `ChoicePanel`, `ActionToolbar`, `InterruptBanner`, etc.
- `bridge.advanceChooseN` — every call site + all session-related store state.
- `bridge.applyMove` / `applyTrustedMove` / `applyTemplateMove` — every call site.
- `ChooseNTemplate`, `ChooseNSession`, `advanceChooseNWithSession`, `isChooseNSessionEligible`, `isSessionValid`, `createChooseNSession` — all exports and their consumers.
- `packages/runner/test/worker/choose-n-session-integration.test.ts` — primary test consumer of the deleted bridge methods (12× `legalChoices`, 20× `advanceChooseN`, 40× `applyMove` / `applyTrustedMove` / `applyTemplateMove` assertions). This file deletes entirely; fresh microturn-session integration tests are authored in the same change (Wave 6).

Output: a rewiring checklist at `campaigns/phase3-microturn/worker-bridge-rewire.md` that maps each old call site to its new `publishMicroturn` / `applyDecision` / `advanceAutoresolvable` equivalent. Every item on the checklist becomes a migration subtask in Wave 6.

### I4 — Replay protocol migration utility

Design (do not implement) the transform from pre-spec `MoveLog[]` traces to post-spec `DecisionLog[]` traces for analytics continuity. The transform is needed for:

- Historical-comparison metrics in `sim/trace-eval.ts`, `sim/aggregate-evals.ts`, and `sim/trace-enrichment.ts`.
- Visual historical playback in evaluation reports.
- Cross-spec convergence / bounded-termination witnesses in `packages/engine/test/policy-profile-quality/`.

The transform is **not** needed for:

- Replay-identity tests — those regenerate from scratch under the new protocol (F14).
- Determinism gates — those regenerate from scratch (F16 requires re-running, not re-interpreting, historical traces).

Output: a design doc at `docs/migration/spec-140-trace-transform.md` specifying input format, output format, and ambiguity resolution (cases where a single `MoveLog` entry decomposes into multiple `DecisionLog` entries whose inter-decision state the legacy trace did not record). The `docs/migration/` directory does not exist today — I4 includes creating it alongside the design doc. Expected outcome: lossy transform marked `traceGeneration: 'migrated-spec-140'`, good enough for aggregate analytics, not good enough for replay verification. The transform is a one-time offline migration tool — not a runtime compatibility layer — and is covered by F14's "migrated snapshots" allowance for preserving historical-experiment reproducibility without introducing shims.

### I5 — Effect-frame suspend/resume prototype

Prototype the effect-frame suspend-resume pattern on a synthetic GameDef whose action does `forEach(chooseN(...))` nested inside `chooseOne(...)`. Prove:

- The first `chooseOne` bind opens the outer frame; publication emits a microturn for the outer decision.
- After binding, effect execution resumes and enters the `forEach`; each iteration opens a `chooseN` sub-frame; publication emits one microturn per sub-selection (add / remove / confirm model for `chooseN` preserved).
- After the final sub-frame pops, the outer `forEach` completes, and the action's post-selection effects execute (triggers, state updates, terminal check).
- State serialization round-trips the mid-execution stack such that replay resumes identically.

Output: a checked-in kernel-only fixture test at `packages/engine/test/unit/kernel/effect-frame-suspend-resume-prototype.test.ts` with `// @test-class: architectural-invariant`. Validates the most technically-uncertain part of the spec before full implementation.

## Design

### D1 — Domain types

New kernel-owned types. Located across new files under `packages/engine/src/kernel/microturn/`.

```ts
// packages/engine/src/kernel/microturn/types.ts

export type DecisionContextKind =
  | 'actionSelection'        // seat chooses which action to start
  | 'chooseOne'              // bounded pick from options
  | 'chooseNStep'            // bounded subset step (add / remove / confirm)
  | 'stochasticResolve'      // chance node
  | 'outcomeGrantResolve'    // free-operation grant resolution (preserved from 139's path)
  | 'turnRetirement';        // terminal marker that retires the compound turn

export type TurnId = number & { readonly __brand: 'TurnId' };
export type DecisionFrameId = number & { readonly __brand: 'DecisionFrameId' };

export interface ActionSelectionContext {
  readonly kind: 'actionSelection';
  readonly seatId: SeatId;
  readonly eligibleActions: readonly ActionId[];  // Pre-filtered by eligibility predicates
}

export interface ChooseOneContext {
  readonly kind: 'chooseOne';
  readonly seatId: SeatId;
  readonly decisionKey: DecisionKey;
  readonly options: readonly ChooseOption[];      // Atomic: one selection is the whole decision
}

export interface ChooseNStepContext {
  readonly kind: 'chooseNStep';
  readonly seatId: SeatId;
  readonly decisionKey: DecisionKey;
  readonly options: readonly ChooseOption[];
  readonly selectedSoFar: readonly MoveParamScalar[];
  readonly cardinality: { readonly min: number; readonly max: number };
  readonly stepCommands: readonly ChooseNStepCommand[];  // e.g., 'add', 'remove', 'confirm'
}

export interface StochasticResolveContext {
  readonly kind: 'stochasticResolve';
  readonly seatId: '__chance';
  readonly decisionKey: DecisionKey;
  readonly distribution: StochasticDistribution;  // Kernel-owned; auto-resolved via RNG
}

export interface OutcomeGrantResolveContext {
  readonly kind: 'outcomeGrantResolve';
  readonly seatId: '__kernel';  // Deterministic resolution by kernel rules
  readonly grant: FreeOperationGrant;
}

export interface TurnRetirementContext {
  readonly kind: 'turnRetirement';
  readonly seatId: '__kernel';
  readonly retiringTurnId: TurnId;
}

export type DecisionContext =
  | ActionSelectionContext
  | ChooseOneContext
  | ChooseNStepContext
  | StochasticResolveContext
  | OutcomeGrantResolveContext
  | TurnRetirementContext;

export interface DecisionStackFrame {
  readonly frameId: DecisionFrameId;
  readonly parentFrameId: DecisionFrameId | null;  // Reactions/interrupts nest via parent
  readonly turnId: TurnId;
  readonly context: DecisionContext;
  readonly accumulatedBindings: Readonly<Record<DecisionKey, MoveParamValue>>;
  readonly effectFrame: EffectExecutionFrameSnapshot;  // Resumption token
}
```

`GameState` gains:

```ts
readonly decisionStack: readonly DecisionStackFrame[];
readonly nextFrameId: DecisionFrameId;      // Monotonic allocator
readonly nextTurnId: TurnId;                // Incremented on turn retirement
readonly activeDeciderSeatId: SeatId | '__chance' | '__kernel';  // Derived from top of stack
```

The stack is fully serialized as part of `GameState`. Two states with identical `stateHash` have identical decision stacks (F8). The stack is **never empty** between games; an empty stack means the current compound turn has retired, and `advanceAutoresolvable` immediately pushes the next seat's `ActionSelectionContext` or terminal check.

**New deterministic constants introduced by this spec** (neither currently exists in the codebase; both must be allocated in the same change as the microturn types):

- `MAX_AUTO_RESOLVE_CHAIN: number` — upper bound on consecutive kernel-owned microturns (`stochasticResolve` / `outcomeGrantResolve` / `turnRetirement`) resolvable in a single `advanceAutoresolvable` call. Derived from `MoveEnumerationBudgets`-scale defaults; configurable via `def.metadata` override mirroring `maxTriggerDepth`'s configuration shape.
- `CHANCE_RNG_MIX: bigint` — deterministic XOR mix applied to the game seed to produce the separate chance RNG used by `stochasticResolve` microturns. Pattern mirrors the existing `AGENT_RNG_MIX` constant at `packages/engine/src/sim/simulator.ts:26`. Kept separate from per-player RNGs so chance outcomes are invariant to which agents play.

Both are serialization-irrelevant (runtime-only) but must be stable across releases (F13).

### D2 — Microturn publication

New kernel function:

```ts
// packages/engine/src/kernel/microturn/publish.ts

export interface MicroturnState {
  readonly kind: DecisionContextKind;
  readonly seatId: SeatId | '__chance' | '__kernel';
  readonly decisionContext: DecisionContext;
  readonly legalActions: readonly Decision[];   // Atomic decisions; always non-empty
  readonly projectedState: ProjectedGameState;  // Per-decider view
  readonly turnId: TurnId;
  readonly frameId: DecisionFrameId;
  readonly compoundTurnTrace: readonly CompoundTurnTraceEntry[];  // Decisions made so far in this compound turn
}

export const publishMicroturn = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): MicroturnState;
```

Invariants, enforced by test (see Testing § T1):

- **Single decision**: `legalActions.length >= 1`. Zero legal actions is impossible by construction — if it occurred, the kernel surfaced a `turnRetirement` or `stochasticResolve` / `outcomeGrantResolve` context instead, which has one canonical resolution.
- **Atomicity**: Every action in `legalActions` is directly executable via `applyDecision`. No action is a template, no action carries a certificate, no action requires further search.
- **Projection**: `projectedState` reflects the active decider's view. For `'__chance'` and `'__kernel'` contexts, the projection equals the authoritative state; for player seats, it applies hidden-information masking (F4).
- **Compound-turn trace**: `compoundTurnTrace` lists decisions made so far under the current `turnId`. Enables policy expressions and runner UI breadcrumbs without re-querying the trace.

### D3 — `applyDecision` and auto-advance

```ts
// packages/engine/src/kernel/microturn/apply.ts

export interface ApplyDecisionResult {
  readonly state: GameState;                    // New state with updated decisionStack
  readonly log: DecisionLog;                    // One atomic log entry
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
}

export const applyDecision = (
  def: GameDef,
  state: GameState,
  decision: Decision,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
): ApplyDecisionResult;
```

`applyDecision` performs exactly one of the following, depending on the top-of-stack context:

| Context kind | `applyDecision` semantics |
|---|---|
| `actionSelection` | Validate action is eligible; push an `ActionExecutionRoot` frame that begins effect execution. Replaces today's `apply-move-pipeline.ts` entry path. |
| `chooseOne` | Bind the chosen value to the `decisionKey` in the top frame's `accumulatedBindings`. Pop the frame; resume the parent frame's suspended effect execution. |
| `chooseNStep` | Apply the step command (`add`/`remove`/`confirm`). Confirm binds the subset and pops; other commands update `selectedSoFar` and republish a new microturn of the same kind. |
| `stochasticResolve` | Sample from the distribution using the authoritative RNG advance; bind the sampled value; pop; resume parent. Only callable by the auto-advance path. |
| `outcomeGrantResolve` | Resolve the grant per deterministic kernel rules (preserved from Spec 139 D5's outcome-grant logic); pop; resume parent. Only callable by the auto-advance path. |
| `turnRetirement` | Retire the current compound turn: increment `turnCount`, fire end-of-turn triggers, run terminal check, advance `activePlayer` per turn-order state, pop the retirement frame. |

**Auto-advance**:

```ts
export const advanceAutoresolvable = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  runtime?: GameDefRuntime,
): { readonly state: GameState; readonly rng: Rng; readonly autoResolvedLogs: readonly DecisionLog[] };
```

Runs a bounded loop: while the top of the stack is `stochasticResolve`, `outcomeGrantResolve`, or `turnRetirement`, apply the canonical resolution and continue. Bounded by a per-call cap (`MAX_AUTO_RESOLVE_CHAIN`, derived from `MoveEnumerationBudgets`) to prevent runaway cascades under trigger chains. Simulators and worker bridges call this before calling `publishMicroturn` for the next agent step.

**Effect-frame suspend/resume** (the core technical detail):

When effect execution encounters a `chooseN`/`chooseOne`/`chooseStochastic` operator during `applyDecision`, the kernel:

1. Snapshots the effect execution frame (program counter, bounded-iteration cursors, local let-bindings, pending trigger queue).
2. Pushes a new `DecisionStackFrame` with the snapshot as its `effectFrame` and the appropriate `DecisionContext` as its `context`.
3. Returns from `applyDecision` without advancing further.

The next `applyDecision` call (after the agent chooses) resumes by:

1. Reading the top frame's `effectFrame`.
2. Restoring the program counter and local state.
3. Continuing effect execution past the suspension point with the newly-bound value.
4. Iterating: further sub-decisions push further frames; completion unwinds the stack.

This is the point where I5 proves the pattern works end-to-end on a synthetic nested case before FITL-scale work begins.

### D4 — Simulator loop rewrite

`packages/engine/src/sim/simulator.ts` is rewritten:

```ts
export const runGame = (
  def: ValidatedGameDef,
  seed: number,
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
  options?: SimulationOptions,
  runtime?: GameDefRuntime,
): GameTrace => {
  // ... validation + init unchanged ...

  let state = initialState(...).state;
  const decisionLogs: DecisionLog[] = [];
  const agentRngByPlayer = [...createAgentRngByPlayer(seed, state.playerCount)];
  const chanceRng = createRng(BigInt(seed) ^ CHANCE_RNG_MIX);
  let currentChanceRng = chanceRng;
  let result: TerminalResult | null = null;
  let stopReason: SimulationStopReason;

  while (true) {
    const autoResult = advanceAutoresolvable(validatedDef, state, currentChanceRng, resolvedRuntime);
    state = autoResult.state;
    currentChanceRng = autoResult.rng;
    for (const log of autoResult.autoResolvedLogs) decisionLogs.push(log);

    const terminal = terminalResult(validatedDef, state, resolvedRuntime);
    if (terminal !== null) { result = terminal; stopReason = 'terminal'; break; }

    // Turn-count gate: counts compound-turn retirements, not microturns.
    if (state.turnCount >= maxTurns) { stopReason = 'maxTurns'; break; }

    const microturn = publishMicroturn(validatedDef, state, resolvedRuntime);
    // microturn.seatId is always a player seat here (chance/kernel already auto-resolved)

    const player = microturn.seatId as PlayerId;
    const agent = agents[player];
    const agentRng = agentRngByPlayer[player];
    if (agent === undefined || agentRng === undefined) throw new Error(...);

    const snapshot = snapshotDepth === 'none' ? undefined : extractMicroturnSnapshot(...);
    const selected = agent.chooseDecision({
      def: validatedDef,
      state, microturn, rng: agentRng, runtime: resolvedRuntime,
    });
    agentRngByPlayer[player] = selected.rng;

    const applied = applyDecision(validatedDef, state, selected.decision, kernelOptions, resolvedRuntime);
    state = applied.state;
    decisionLogs.push({ ...applied.log, agentDecision: selected.agentDecision, snapshot });
  }

  // compoundTurns[] synthesized from decisionLogs[] via turnId grouping
  const compoundTurns = synthesizeCompoundTurnSummaries(decisionLogs);

  return {
    gameDefId: validatedDef.metadata.id,
    seed,
    decisions: decisionLogs,
    compoundTurns,
    finalState: state,
    result,
    turnsCount: state.turnCount,
    stopReason,
  };
};
```

`MoveLog` → `DecisionLog`:

```ts
export interface DecisionLog {
  readonly stateHash: bigint;
  readonly seatId: SeatId | '__chance' | '__kernel';
  readonly decisionContextKind: DecisionContextKind;
  readonly decisionKey: DecisionKey | null;   // null for actionSelection + turnRetirement
  readonly decision: Decision;                 // Atomic: ActionId, ChoiceValue, ChooseNStepCommand, SampledOutcome, ...
  readonly turnId: TurnId;
  readonly turnRetired: boolean;               // True on the last microturn of the compound turn
  readonly legalActionCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
  readonly agentDecision?: AgentDecisionTrace;
  readonly snapshot?: MicroturnSnapshot;       // Extends DecisionPointSnapshot from Spec 97
}

export interface CompoundTurnSummary {
  readonly turnId: TurnId;
  readonly seatId: SeatId;
  readonly decisionIndexRange: { readonly start: number; readonly end: number };  // Into GameTrace.decisions
  readonly microturnCount: number;
  readonly turnStopReason: 'retired' | 'terminal' | 'maxTurns';
}

export interface GameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly decisions: readonly DecisionLog[];
  readonly compoundTurns: readonly CompoundTurnSummary[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
  readonly stopReason: SimulationStopReason;
  readonly traceProtocolVersion: 'spec-140';
}
```

The `traceProtocolVersion` string is an identity artifact (F13) so downstream consumers can detect spec-140 traces vs. legacy.

### D5 — Agent surface rework

`Agent.chooseMove` is deleted. New:

```ts
export interface Agent {
  readonly kind: AgentKind;
  readonly label: string;
  chooseDecision(input: {
    readonly def: ValidatedGameDef;
    readonly state: GameState;
    readonly microturn: MicroturnState;
    readonly rng: Rng;
    readonly runtime?: GameDefRuntime;
    readonly profiler?: PerfProfiler;
  }): {
    readonly decision: Decision;
    readonly rng: Rng;
    readonly agentDecision?: AgentDecisionTrace;
  };
}
```

**RandomAgent**: trivial — pick a uniformly-random element of `microturn.legalActions`, advance the RNG.

**GreedyAgent**: apply each legal action speculatively via a lookahead-1 `applyDecision` (not committed); score the resulting state via the policy-state evaluator; pick the highest-scoring action.

**PolicyAgent**: the non-trivial rework.

```ts
// packages/engine/src/agents/policy-agent.ts (rewritten)

export function createPolicyAgent(profile: PolicyProfile): Agent {
  return {
    kind: 'policy',
    label: profile.label,
    chooseDecision({ def, state, microturn, rng, runtime, profiler }) {
      const microturnContext = buildMicroturnContext(microturn, state);
      const scored = microturn.legalActions.map((action) => ({
        action,
        score: evaluatePolicyExpression(profile.expression, {
          def, state,
          microturnContext,
          candidateAction: action,
          runtime,
        }),
      }));
      const { selected, rng: nextRng } = tieBreakAndSample(scored, rng, profile.softmaxTau);
      return {
        decision: selected.action,
        rng: nextRng,
        agentDecision: { kind: 'policy', scores: scored.map((s) => ({...})) },
      };
    },
  };
}
```

`evaluatePolicyExpression` in the pseudocode is the **post-migration identity** of today's `evaluatePolicyMove` / `evaluatePolicyMoveCore` (`packages/engine/src/agents/policy-eval.ts`). G5 renames and refactors the existing evaluators to take `microturnContext` instead of a full move + partial-completion pair; the name change reflects the semantic shift from move-level scoring to expression-at-microturn evaluation. No parallel function is added — the old names retire in the same change (F14).

Phase 1 / Phase 2 disappears. The `policy-preview.ts`, `policy-evaluation-core.ts` two-phase split, and `prepare-playable-moves.ts` completion loop retire. The policy expression language gains a new binding:

```yaml
microturnContext:
  decisionKind: 'actionSelection' | 'chooseOne' | 'chooseNStep' | ...
  decisionKey: DecisionKey | null
  options: readonly Option[]
  accumulatedBindings: Record<DecisionKey, MoveParamValue>
  compoundTurnTrace: readonly PastDecision[]
```

Policy expressions can now reference the partial state and the decision kind, enabling per-microturn-specific scoring rules.

### D6 — Worker bridge protocol rewrite

`packages/runner/src/worker/game-worker-api.ts`:

Deleted:
- `legalMoves`, `enumerateLegalMoves`
- `legalChoices`
- `advanceChooseN`, `advanceChooseNWithSession`, `createChooseNSession`, `isChooseNSessionEligible`, `isSessionValid`
- `applyMove`, `applyTrustedMove`, `applyTemplateMove`
- `ChoiceRequest`, `ChoicePendingChooseNRequest`, `ChoiceNCommand`, `ChooseNSession`, `ChooseNTemplate` types

Added:

```ts
export interface GameWorkerAPI {
  init(nextDef, seed, options, stamp): Promise<InitResult>;

  publishMicroturn(): Promise<MicroturnState>;
  applyDecision(
    decision: Decision,
    options: ExecutionOptions | undefined,
    stamp: OperationStamp,
  ): Promise<ApplyDecisionResult>;
  advanceAutoresolvable(stamp: OperationStamp): Promise<{
    readonly state: GameState;
    readonly autoResolvedLogs: readonly DecisionLog[];
  }>;
  rewindToTurnBoundary(turnId: TurnId, stamp: OperationStamp): Promise<GameState | null>;

  describeAction(actionId, context?): Promise<AnnotatedActionDescription | null>;
  terminalResult(): Promise<TerminalResult | null>;
  getState(): Promise<GameState>;
  getMetadata(): Promise<GameMetadata>;
  getHistoryLength(): Promise<number>;
  undo(stamp): Promise<GameState | null>;
  reset(...): Promise<InitResult>;
  loadFromUrl(...): Promise<InitResult>;
}
```

The `OperationStamp` / session-revision invalidation logic simplifies: every `applyDecision` / `advanceAutoresolvable` / `rewindToTurnBoundary` call is a mutation that invalidates any prior in-flight microturn publication, so the `chooseNSession` / `revision` fields delete entirely.

`rewindToTurnBoundary` is the new API for UI cancellation: rewind to the start of the current compound turn (or a prior turn by `turnId`), restoring state to the point before the first microturn of that turn was applied. Implemented by replaying from history up to the target boundary.

### D7 — Runner UI adaptation

`packages/runner/src/store/game-store.ts`:

The store fields that tracked speculative partial-move state are deleted or derived:

- `selectedAction`: derived from `currentMicroturn.compoundTurnTrace[0]?.decision` (the first decision of the current compound turn is the action selection).
- `choiceStack`: derived from `currentMicroturn.compoundTurnTrace` (maps atomic decisions to breadcrumb entries).
- `partialMove`: deleted; no longer a store concept.
- `choicePending`: replaced by `currentMicroturn: MicroturnState | null`.

New store actions:

- `submitActionSelection(actionId)`: calls `bridge.applyDecision({ kind: 'actionSelection', actionId }, stamp)`, then re-publishes the microturn.
- `submitChoice(value)`: calls `bridge.applyDecision({ kind: 'chooseOne', value }, stamp)`.
- `submitChooseNStep(command)`: calls `bridge.applyDecision({ kind: 'chooseNStep', command: 'add'/'remove'/'confirm', value? }, stamp)`.
- `cancelChoice()`: replaced by `rewindToCurrentTurnStart()`, which calls `bridge.rewindToTurnBoundary(currentTurnId, stamp)`.
- `runAiStep()`: under microturns, one AI step is one microturn (not one compound turn). `agentTurnOrchestrator` is updated to iterate microturns until seat change or terminal.

`packages/runner/src/ui/ChoicePanel.tsx` renders directly off `currentMicroturn`:

- `decisionContextKind === 'chooseOne'` → existing chooseOne rendering
- `decisionContextKind === 'chooseNStep'` → existing chooseN rendering with add/remove/confirm buttons
- `decisionContextKind === 'actionSelection'` → rendered by `packages/runner/src/ui/ActionToolbar.tsx` instead (pre-existing action-selection UI)
- `decisionContextKind === 'turnRetirement'` / `stochasticResolve` / `outcomeGrantResolve` → never shown (auto-advanced before publication)

`packages/runner/src/ui/IllegalityFeedback.tsx` logic simplifies because microturn `legalActions` already enforce legality — the kernel never publishes an illegal action. `packages/runner/src/ui/InterruptBanner.tsx` continues to surface reaction/interrupt phases, now driven directly by `currentMicroturn.compoundTurnTrace` and the decision-stack frames rather than runner-reconstructed partial-move state.

### D8 — Certificate machinery retirement

Deleted in the same change (F14):

- `packages/engine/src/kernel/completion-certificate.ts` — entire file
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` — entire file (classifier subsumed by microturn publication)
- `packages/engine/src/kernel/move-decision-sequence.ts` — entire file (`isMoveDecisionSequenceSatisfiable`, `isMoveDecisionSequenceAdmittedForLegalMove`, related wrappers)
- `packages/engine/src/kernel/move-decision-completion.ts` — entire file (template completion pipeline)
- `packages/engine/src/kernel/move-completion.ts` — template-completion pipeline deletes; stochastic resolution logic (currently 389 lines, 7 src + 9 test consumers) relocates into `microturn/apply.ts`. The relocation is structurally distinct from pure deletion and receives its own sub-ticket (see D12 Wave 3 — the stochastic-resolve hoist is part of the effect-frame suspend/resume work, not the Wave 8 retirement sweep).
- `packages/engine/src/kernel/move-admissibility.ts` — legacy admission helpers retire
- `packages/engine/src/kernel/playable-candidate.ts` — agent-side completion retires
- `packages/engine/src/agents/prepare-playable-moves.ts` — entire file (template retry loop)
- `packages/engine/src/agents/completion-guidance-choice.ts`, `completion-guidance-eval.ts` — two-phase guidance retires
- `packages/engine/src/agents/select-candidates.ts` — template-level candidate selection retires

Retained (internal utility):

- `packages/engine/src/kernel/choose-n-set-variable-propagation.ts` — may remain as an internal helper for action-availability preview at the action-selection microturn (estimating whether an action has *any* legal completion pathway without fully publishing every downstream microturn). Today's exports (`propagateChooseNSetVariable`, `ChooseNPropagationResult`, `ChooseNSetVariablePropagationContext`) either retire or become module-internal. If the module is retained, a **new** `hasAnyReachableCompletion(def, state, actionId) → boolean` public function is added as the sole external surface — this symbol does not currently exist in the codebase and must be implemented as part of this retirement wave.
- `packages/engine/src/kernel/choose-n-option-resolution.ts` — may remain as an internal helper for the same preview use case.
- `packages/engine/src/kernel/move-identity.ts` — `toMoveIdentityKey` may be repurposed for deduplication at the action-selection microturn when multiple actions resolve to the same downstream microturn sequence. Pending I3 audit.

The current `LegalMoveEnumerationResult` type deletes. Its `certificateIndex` field disappears with it.

### D9 — Policy profile migration

`data/games/fire-in-the-lake/92-agents.md` profile expressions are migrated in the same change per F14. The migration strategy per I2:

- **Category A** (microturn-compatible as-is): no change.
- **Category B** (mechanically rewriteable): apply the documented transform. Each transform is reviewable as a diff in the profile file.
- **Category C** (requires re-evolution): re-evolve from scratch using the existing MAP-Elites pipeline against the new microturn-native policy evaluator. A Wave 5 campaign block lays out seeds, budget, and success criterion (profile must meet or exceed pre-spec baseline win rate on the canary corpus).

Texas Hold'em profiles follow the same procedure. `data/games/texas-holdem/92-agents.md` is currently a sparse skeleton (minimal baselines, no evolved profiles), so Texas migration is expected to be fully Category A/B mechanical with no Category C re-evolution requirement. FITL is the scope-driver for the migration effort; Texas parity is not dropped (F14 atomic migration of all owned artifacts) but is acknowledged as near-trivial given current coverage. If any game lacks evolved profiles entirely, the migration is purely mechanical.

### D10 — FOUNDATIONS.md amendments

Four edits. All applied in the same change as the implementation.

#### D10.1 — Amend F5 (`One Rules Protocol, Many Clients`)

Replace the current "Constructibility clause" with:

> **Constructibility clause**: Every client-visible legal action is directly executable at its microturn scope. Client-side search, template completion, or completion certificates are not part of the legality contract. Each microturn publishes a finite list of atomic decisions; selecting any decision is sufficient to advance kernel state.

#### D10.2 — Amend F10 (`Bounded Computation`)

Replace the third sentence onward (currently: "The kernel must finitely enumerate the current executable decision frontier... bounded and deterministic.") with:

> The kernel must finitely enumerate the current executable decision frontier in stable deterministic order. A compound human-visible turn is modeled as a bounded sequence of kernel-owned decision states (microturns), each of which exposes atomic legal actions only. Mechanics emerge from composition of a small instruction set, not bespoke primitives.

#### D10.3 — Amend F18 (`Constructibility Is Part of Legality`)

Replace the existing second paragraph with:

> Every kernel-published legal action is constructible atomically at its microturn scope. No client-side search, no template completion, no satisfiability verdict distinct from publication, no `unknown` legal actions. The microturn publication pipeline is the single kernel artifact that establishes legality and executability; they cannot diverge.

#### D10.4 — Add F19 (`Decision-Granularity Uniformity`)

Append after F18:

> ## 19. Decision-Granularity Uniformity
>
> **Every kernel-visible decision is atomic. Compound human-visible turns emerge from decision sequences grouped by `turnId`, not from templates or pre-declared compound shapes.**
>
> Player agents and chance / kernel agents operate under the same microturn protocol; the only distinction is who decides. Player decisions require agent consultation; chance decisions resolve via the authoritative RNG; kernel-owned decisions (outcome grants, turn retirement) resolve via deterministic kernel rules. No compound shape is ever exposed as a legal action. No grammar layer in the kernel or runtime ever aggregates multiple kernel decisions into a single client-visible unit except for analytics-side summaries (`compoundTurns[]`), which are derived post-hoc from `decisions[]` and never authoritative.

The Appendix is updated: replace "Spec 139 added Foundation #18 and refined Foundations #5 and #10 to formalize the constructibility-carrying legality contract." with "Spec 140 amended Foundations #5, #10, and #18, and added Foundation #19, to formalize the microturn-native decision protocol. Spec 139's certificate-carrying contract (the prior iteration of #18) is retired."

### D11 — Documentation

`docs/architecture.md` is rewritten at the admission-contract section. Replace the current "Legal Move Admission Contract" + "Agent Fallback" + "Admission Search Shape" subsections with:

> ## Microturn Protocol
>
> The kernel publishes one atomic decision at a time. `publishMicroturn(def, state)` returns a `MicroturnState` whose legal actions are all directly executable. `applyDecision(def, state, decision)` advances exactly one decision, possibly opening sub-decisions via the decision stack. `advanceAutoresolvable(def, state, rng)` auto-applies chance / grant / turn-retirement microturns until the next player decision.
>
> Compound human-visible turns are derived post-hoc from the decision sequence by `turnId` grouping. See `GameTrace.compoundTurns[]`.
>
> [... full section continues with decision stack details, effect-frame suspend/resume, hidden-information projection, trace protocol ...]

`docs/project-structure.md` is updated to include `packages/engine/src/kernel/microturn/`.

### D12 — Ticket decomposition (high-level waves)

Implementation waves (parallel groups). Final ticket list generated by `/spec-to-tickets`.

- **Wave 1** (roots): I1 FITL inventory, I2 profile audit, I3 worker-bridge audit, I4 trace-transform design, I5 effect-frame suspend-resume prototype, D1 types + decision stack on `GameState`.
- **Wave 2** (after W1 types): D2 `publishMicroturn`, D3 `applyDecision` + `advanceAutoresolvable` for simple contexts (actionSelection, chooseOne, turnRetirement).
- **Wave 3** (after W2): D3 full effect-frame suspend/resume across chooseN / chooseOne / chooseStochastic nesting. This is the technically hardest wave; I5 derisks it.
- **Wave 4** (after W3): D4 simulator loop, `DecisionLog`, `GameTrace.compoundTurns`, snapshot extension. **Blast radius**: ~183 test files currently reference `applyMove` / `applyTrustedMove`; Wave 4 migrates these to `applyDecision` in the same change, grouped by test subsystem. Test migration is the dominant scope of this wave.
- **Wave 5** (after W4): D5 agent API, PolicyAgent rewrite, D9 profile migration (Categories A+B mechanical, C re-evolution campaign).
- **Wave 6** (after W4, parallel with W5): D6 worker bridge rewrite, I3 rewiring checklist execution. **Blast radius**: ~84 call sites across runner tests reference the deleted bridge methods, concentrated in `packages/runner/test/worker/choose-n-session-integration.test.ts`; that file deletes entirely and is replaced by fresh microturn-session integration tests in the same wave.
- **Wave 7** (after W6): D7 runner UI + store adaptation.
- **Wave 8** (after W5): D8 certificate machinery retirement + spec 139 symbol deletions across the tree.
- **Wave 9** (after W7+W8): D10 FOUNDATIONS amendments + D11 docs + test suite regeneration.
- **Wave 10** (after W9): Policy-profile re-evolution campaign closeout + performance gates (G14).

## Testing Strategy

All tests follow Spec 137's classification taxonomy. File-top markers and witness-id conventions per `.claude/rules/testing.md`.

### T0 — Migration of Spec 139 test artifacts (F14)

Every Spec 139 test that exercised certificate machinery is migrated or deleted. Dispositions:

| File | Disposition | Reason |
|---|---|---|
| `packages/engine/test/unit/kernel/completion-certificate.test.ts` | **Delete** | Type retires. |
| `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts` | **Migrate if retained** | If propagation is kept as a preview helper (D8), test scope narrows to the retained API. Otherwise delete. |
| `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts` | **Delete** | Admission contract retires in favor of microturn publication. Replaced by T1/T2/T3. |
| `packages/engine/test/unit/agents/prepare-playable-moves-certificate-fallback.test.ts` | **Delete** | Agent retry loop retires. Replaced by T5. |
| `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts` | **Migrate** | Update to assert the invariant under the microturn protocol: agents never throw on non-empty `microturn.legalActions`. |
| `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts` | **Migrate** | Assertion shape unchanged (bounded termination, no throw); underlying protocol changes. |
| `packages/engine/test/determinism/spec-139-replay-identity.test.ts` | **Migrate** | Regenerate golden fixtures under spec-140 protocol; assertion (byte-identical) preserved. |
| `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts` | **Migrate** | Per-microturn projection replaces per-move projection. Stronger invariant. |
| `packages/engine/test/performance/spec-139-certificate-overhead.test.ts` | **Delete** | Certificate no longer exists. Replaced by T14 (compound-turn overhead). |
| `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts` | **Migrate** | Restated F18 conformance: every published legal action directly applicable. |

Migration work lands in the same commit(s) as the D8 retirement.

For each file marked **Migrate**, the first sub-step is to record the current file-top `// @test-class:` marker (per `.claude/rules/testing.md`). Migrations that preserve a `convergence-witness` classification require fresh witness IDs tied to Spec 140 artifacts (e.g., `spec-140-microturn-native-decision-protocol` or a ticket slug) — do not reuse Spec 139 witness IDs, since the protocol those IDs guarded has retired. Where possible, promote witness-style assertions to `architectural-invariant` per Spec 137's distillation rule.

### T1 — Microturn publication invariant (architectural-invariant)

Under `packages/engine/test/unit/kernel/microturn-publication.test.ts`:

- For a corpus of synthetic GameDef states (action-selection, chooseOne, chooseNStep, stochasticResolve, outcomeGrantResolve, turnRetirement), assert `publishMicroturn` returns a `MicroturnState` with:
  - `legalActions.length >= 1`
  - every action in `legalActions` has `kind === microturn.decisionContextKind`
  - `projectedState` matches the active decider's view (full authoritative state for `__chance`/`__kernel`; projected for player seats)

### T2 — Decision stack invariants (architectural-invariant)

Under `packages/engine/test/unit/kernel/decision-stack-invariants.test.ts`:

- Push / pop invariants: after any `applyDecision`, the stack top's `frameId` differs from the pre-call top's `frameId` (either popped or pushed-and-popped-to-new-child).
- Monotonicity: `nextFrameId` and `nextTurnId` never decrease.
- Parent chain: every non-root frame has a `parentFrameId` that points to a frame whose `turnId` is ≤ its own (reactions nest inside the causing turn).
- Turn grouping: all frames with a given `turnId` share the same compound turn.

### T3 — Atomic legal action contract (architectural-invariant)

Under `packages/engine/test/unit/kernel/atomic-legal-actions.test.ts`:

- For every synthetic corpus state, every action in `microturn.legalActions` is **directly applicable** — `applyDecision(def, state, action)` succeeds without opening a preliminary sub-decision first. (Opening sub-decisions post-application is expected; opening sub-decisions instead of advancing is forbidden.)
- No action carries a certificate, a template flag, or a partial-binding marker.

### T4 — Effect-frame suspend/resume correctness (architectural-invariant)

Under `packages/engine/test/unit/kernel/effect-frame-suspend-resume.test.ts`:

- Synthetic GameDef: `action X = forEach(zone Z, chooseN(tokens in zone Z'', min:1, max:3)) then applyEffect(...)`.
- Starting from action selection, drive a full multi-microturn sequence, asserting:
  - The outer `forEach` cursor advances correctly across each iteration.
  - Each `chooseN` sub-frame independently captures and resumes its execution frame.
  - The final post-effect execution runs exactly once, with correct accumulated bindings from all iterations.
- State-hash equality: serializing at each microturn and deserializing preserves stack + bindings identically.

### T5 — Agent no-throw global invariant (architectural-invariant)

Under `packages/engine/test/integration/agents-never-throw-microturn.test.ts`:

- Property test over (synthetic GameDef, initial state, seed, agent) tuples:
  - `RandomAgent`, `GreedyAgent`, every baseline + evolved `PolicyAgent` profile.
  - For every published microturn with non-empty `legalActions`, `agent.chooseDecision(...)` returns a decision without throwing.
- Corpus includes FITL seeds 123, 1002, 1010 (spec 139's failing seeds) to verify they continue passing under the microturn protocol.

### T6 — Bounded termination over the canary corpus (architectural-invariant)

Under `packages/engine/test/integration/spec-140-bounded-termination.test.ts`:

- FITL seed 123 with 4 × `RandomAgent`, max-turns 200: `runGame` does not throw; `stopReason ∈ {terminal, maxTurns, noLegalMoves}`; `decisions.length > 0`; `compoundTurns.length > 0`.
- FITL seed 1002, 1010 with the full profile set: same assertions.
- Texas Hold'em corpus analog.

### T7 — Replay identity over microturns (architectural-invariant)

Under `packages/engine/test/determinism/spec-140-replay-identity.test.ts`:

- For each (GameDef, seed) pair in the determinism corpus, run `runGame` twice. Assert:
  - `decisions[]` is bit-identical across runs (same length, same content in same order).
  - `finalState.stateHash` is identical.
  - Each `compoundTurn.decisionIndexRange` is identical.
- Regenerate all golden fixtures under this protocol; fixtures explicitly tagged `traceProtocolVersion: 'spec-140'`.

### T8 — Stochastic auto-advance (architectural-invariant)

Under `packages/engine/test/unit/kernel/stochastic-auto-advance.test.ts`:

- Construct a state with a `stochasticResolveContext` on the stack top.
- Assert: `publishMicroturn` is not called for this state during `runGame` — `advanceAutoresolvable` resolves it first.
- Assert: the authoritative chance RNG is advanced deterministically (same seed → same resolution across runs).

### T9 — Hidden-information microturn safety (architectural-invariant)

Under `packages/engine/test/integration/spec-140-hidden-information-safety.test.ts`:

- For Texas Hold'em hidden-hole-card states, assert `microturn.projectedState` masks other seats' hole cards.
- Two states differing only in masked bindings produce `microturn.legalActions` with identical option identities — proving the decider's legal action set does not depend on invisible state.

### T10 — No-certificate invariant (architectural-invariant)

Under `packages/engine/test/integration/spec-140-no-certificate.test.ts`:

- Grep the engine source tree; assert zero references to `CompletionCertificate`, `materializeCompletionCertificate`, `emitCompletionCertificate`, `certificateIndex`.
- Assert every published microturn's legal actions have `kind === 'direct'` (or the D1 microturn kinds) — never `'template'`, never with a certificate attachment.

This is the F14 retirement gate in test form.

### T11 — PolicyAgent per-microturn evaluation (architectural-invariant)

Under `packages/engine/test/unit/agents/policy-agent-microturn-evaluation.test.ts`:

- For a hand-authored policy profile with distinct expressions for `actionSelection` and `chooseOne` microturn kinds, assert:
  - Evaluation at an `actionSelection` microturn uses the action-selection expression.
  - Evaluation at a downstream `chooseOne` microturn uses the chooseOne expression with `accumulatedBindings` populated.
- Synthetic corpus; no FITL-specific logic.

### T12 — Profile migration correctness (architectural-invariant)

Under `packages/engine/test/integration/spec-140-profile-migration.test.ts`:

- For every migrated Category A + B profile, assert the migrated expression evaluates identically to the original expression at the action-selection microturn over a seed corpus (within floating-point tolerance per the existing policy-eval contract).
- Category C profiles have their own re-evolution campaign gates in `policy-profile-quality/`.

### T13 — Compound-turn summary correctness (architectural-invariant)

Under `packages/engine/test/integration/spec-140-compound-turn-summary.test.ts`:

- For a seed corpus, assert every `CompoundTurnSummary`:
  - `decisionIndexRange.start < end`
  - `decisions[start..end-1]` all share `turnId === summary.turnId`
  - `decisions[end - 1].turnRetired === true`
  - Synthesizing `compoundTurns` from `decisions` reproduces the trace's own `compoundTurns` field.

### T14 — Performance gate (deterministic proxy)

Under `packages/engine/test/performance/spec-140-compound-turn-overhead.test.ts`:

- On a stable FITL reference corpus, measure aggregate compound-turn latency (publish + apply + advance per microturn, summed across the compound turn).
- Assert overhead ≤ 1.50× the current Spec 139 per-`applyMove` baseline on equivalent seeds.
- Use deterministic probe-step proxy (per Spec 137 + 138 + 139 methodology), not wall-clock.

### T15 — FOUNDATIONS conformance (architectural-invariant)

Under `packages/engine/test/integration/spec-140-foundations-conformance.test.ts`:

- F5: every microturn's `legalActions` are all directly applicable (proven via T3 + random sampling).
- F10: microturn publication terminates within bounded budget on the canary corpus.
- F18 (restated): no admitted action carries a certificate, template marker, or unknown verdict.
- F19 (new): every action across the canary corpus has `kind ∈ { actionSelection, chooseOne, chooseNStep, stochasticResolve, outcomeGrantResolve, turnRetirement }` — no compound shapes.

## Alignment With `docs/FOUNDATIONS.md`

| Foundation | How Spec 140 respects it |
|---|---|
| **#1 Engine Agnosticism** | Zero per-game code. Changes are in kernel microturn infrastructure, simulator, agent API, worker bridge, runner store — all game-agnostic. |
| **#2 Evolution-First Design** | GameSpecDoc unchanged. Policy DSL gains per-microturn evaluation context, which is a capability expansion, not a semantic shift. |
| **#3 Visual Separation** | `visual-config.yaml` contract unchanged. Runner visual queries are now per-microturn, still query-only. |
| **#4 Authoritative State and Observer Views** | Strengthened: microturn projection is strictly per-decider. Hidden info is cleaner under microturns than under template projection. |
| **#5 One Rules Protocol** | Amended (D10.1): the single protocol is now microturn-publish / apply-decision. Retires the certificate clause. |
| **#6 Schema Ownership** | Kernel schemas stay generic. New types (`DecisionContext`, `DecisionStackFrame`, `MicroturnState`) are engine-wide. |
| **#7 Specs Are Data** | Pure data. No `eval`, no callbacks. `microturnContext` is a read-only binding; policy expressions remain declarative. |
| **#8 Determinism** | Strictly stronger: determinism proven per-decision, not per-compound-turn. Replay identity at the decision level. |
| **#9 Replay, Telemetry, Auditability** | `DecisionLog[]` replaces `MoveLog[]`. Finer-grained replay and analytics. `compoundTurns[]` preserves aggregate analytics. |
| **#10 Bounded Computation** | Amended (D10.2): microturns are now the model. Auto-advance chain bounded by `MAX_AUTO_RESOLVE_CHAIN`. Publication bounded by existing budgets. |
| **#11 Immutability** | Decision stack is immutable at microturn boundaries. Scoped internal mutation during effect-frame suspend/resume uses F11's exception with test-enforced isolation. |
| **#12 Compiler-Kernel Boundary** | Unchanged. Compiler still validates static shape; kernel validates state-dependent semantics per microturn. |
| **#13 Artifact Identity** | `traceProtocolVersion: 'spec-140'` on all traces. State-hash still authoritative equality oracle. |
| **#14 No Backwards Compatibility** | Atomic migration: templates, certificates, Spec 139 artifacts, old policy profiles, runner store fields — all retired in same change. No shims. |
| **#15 Architectural Completeness** | Root cause closed: "one compound turn per state transition" dual-grammar retired. Single-protocol kernel. |
| **#16 Testing as Proof** | Fifteen test artifacts (T0–T15) covering microturn publication, decision stack, effect-frame correctness, agent invariants, replay identity, hidden info, retirement, policy migration, summary correctness, performance, and FOUNDATIONS conformance. |
| **#17 Strongly Typed Domain Identifiers** | New branded types: `TurnId`, `DecisionFrameId`. Existing `DecisionKey`, `SeatId`, `ActionId` reused. |
| **#18 Constructibility Is Part of Legality** *(amended — D10.3)* | Restated: every published action is atomically constructible at its microturn scope. Trivially satisfied by publication contract. |
| **#19 Decision-Granularity Uniformity** *(new — D10.4)* | The new principle. Spec 140 is its first proving implementation. |

## Edge Cases & Open Questions

- **Reactions and interrupts**. A reaction card that interrupts the current player's compound turn (FITL event triggers, Texas "react to bet" decisions) pushes a new `DecisionStackFrame` with `seatId` set to the reactor. The microturn for the reactor publishes first (kernel advances by push order); when the reaction resolves (pop), control returns to the original compound turn. `parentFrameId` links the reaction frame to its causing frame. `turnId` of the reaction is its own (retires independently), or the parent's (shares retirement) — determined by whether the reaction's effect block sets a new `turnId`. Spec sub-item: determine canonical semantics for which reactions share vs. start new `turnId`s; fallback to always-new-turnId if ambiguous. This is an I1 deliverable.
- **Undo history under microturns**. `history[]` stores pre-microturn `GameState` snapshots. `undo(stamp)` rewinds one microturn. `rewindToTurnBoundary(turnId)` rewinds to the start of the compound turn. Rewind may cross reaction boundaries — rewinding a reaction's last microturn returns to the parent-frame's suspended state, which is valid because the frame is serialized in `decisionStack`.
- **Performance of single-decision turns**. Many turns have exactly one microturn (e.g., a FITL pass action). A direct-apply short-circuit path avoids the publish/apply cycle overhead for these. Kernel detects at action-selection time by checking whether the action's effect body will open any sub-decisions (static analysis from the compiler, stored on `ActionDef`). If zero, the action executes synchronously with one `DecisionLog` entry marked `turnRetired: true`. This optimization preserves the microturn contract — the fast path is observationally indistinguishable from the slow path — and is required to hit the 1.5× overhead gate (G14).
- **Trace migration for historical analytics**. The I4 design doc specifies a lossy `MoveLog[] → DecisionLog[]` transform. Expected losses: inter-decision state changes that the legacy trace did not record cannot be reconstructed, so `compoundTurns[].microturnCount` is a lower bound (actual decomposed count may be higher). Analytics pipelines that don't care about microturn structure (win rate, game length in turns, action frequency) are unaffected. Analytics that care (decision-tree branching at microturn level) require re-running from seed, which is the standard F13 reproducibility path.
- **Agent RNG per microturn**. Currently the agent RNG is per-player. Under microturns, each microturn draws from the same per-player RNG. Determinism is preserved because the RNG state is threaded through `chooseDecision` return value as today. Chance microturns use a separate `chanceRng` seeded from the game seed (not per-player) so chance outcomes are invariant to which agents play.
- **Worker-bridge `rewindToTurnBoundary` correctness under concurrent mutations**. The existing `OperationStamp` + `revision` protocol invalidates in-flight requests; under microturns the same protocol applies at the microturn granularity. A `rewindToTurnBoundary(turnId, stamp)` invalidates any pending `applyDecision` whose stamp is older.
- **Testing-taxonomy classification**. All tests in T0–T15 are `architectural-invariant` per Spec 137's distillation rule. None are convergence-witnesses. The performance gate in T14 uses the deterministic probe-step methodology established by Specs 138 and 139.
- **Re-evolved Category C profiles**. Profile re-evolution is a multi-hour to multi-day campaign depending on fitness landscape. This spec commits to producing migrated profiles that meet baseline win rates; it does not commit to beating pre-spec evolved profiles on day one. Surpassing pre-spec quality is expected as a follow-up based on the richer per-microturn policy evaluation, but is formally future work (captured in the § Future Work section).
- **Schema for `Decision` type**. Needs a clean discriminated union covering action selection, chooseOne pick, chooseN step command (with payload), chance resolution input (should be absent — kernel-driven), grant resolution input (should be absent — kernel-driven). Open sub-item: whether `Decision` is a single union or separate per-microturn-kind types. Prefer the latter for type safety.

## Future Work

This spec is the end-state kernel architecture for decision representation. Follow-up items that are **not** part of this spec:

- **Microturn-aware MCTS agent**. A new agent type that runs Monte Carlo Tree Search over the atomic decision tree. MCTS becomes naturally applicable once every state has a bounded, enumerable set of atomic actions with a direct-apply forward model — which is what microturns provide. A future spec will cover: MCTS node representation, UCT variants suited to the mixed player/chance/grant node structure, rollout policies (random vs. policy-guided), and integration with the evolution pipeline.
- **Microturn-level policy evolution**. The existing MAP-Elites evolution operates on policy expressions evaluated at move level. A future spec will upgrade the evolution pipeline to also mutate expressions per-microturn-kind, enabling specialization (e.g., one scoring shape for `chooseOne` microturns, another for `chooseNStep`, another for `actionSelection`).
- **Partial-observability RL training harness**. With per-microturn projection (F4 cleaned up), an RL harness that trains neural policies against the kernel gains a clean observation space: each microturn is a training step, `microturn.projectedState` is the observation, `microturn.legalActions` is the action mask, `applyDecision` is the transition.
- **Simultaneous-action games**. Current kernel only supports strictly turn-taking seats. Simultaneous decisions (e.g., Diplomacy, sealed-bid auctions) are a future expansion that can layer naturally onto microturns: an `actionSelection` context whose `seatId` is a `'__simultaneous'` sentinel, with `legalActions` including per-seat decision tuples. Reported out of scope for this spec.

## Tickets

To be generated via `/spec-to-tickets`. Expected shape:

- `tickets/140MICRODECPRO-001.md` — I1 + I5 investigation deliverables (FITL compound-turn inventory, effect-frame suspend/resume prototype)
- `tickets/140MICRODECPRO-002.md` — I2 + I3 + I4 investigation deliverables (profile audit, worker-bridge audit, trace transform design)
- `tickets/140MICRODECPRO-003.md` — D1 domain types + decision stack on `GameState`
- `tickets/140MICRODECPRO-004.md` — D2 + D3 simple-context primitives (publishMicroturn, applyDecision for actionSelection / chooseOne / turnRetirement)
- `tickets/140MICRODECPRO-005.md` — D3 full effect-frame suspend/resume for nested chooseN / chooseOne / chooseStochastic
- `tickets/140MICRODECPRO-006.md` — D4 simulator rewrite + DecisionLog / GameTrace rework + snapshot extension
- `tickets/140MICRODECPRO-007.md` — D5 agent API + PolicyAgent microturn-native rewrite
- `tickets/140MICRODECPRO-008.md` — D9 profile migration (Categories A + B mechanical)
- `tickets/140MICRODECPRO-009.md` — D9 re-evolution campaign (Category C)
- `tickets/140MICRODECPRO-010.md` — D6 worker bridge rewrite + retired-API deletion
- `tickets/140MICRODECPRO-011.md` — D7 runner store + UI adaptation
- `tickets/140MICRODECPRO-012.md` — D8 certificate machinery retirement + Spec 139 symbol deletion
- `tickets/140MICRODECPRO-013.md` — D10 FOUNDATIONS amendments + D11 docs
- `tickets/140MICRODECPRO-014.md` — Test suite regeneration (T0 migration + T1–T15 new tests) + performance gate (T14)

Implementation waves (per D12) orchestrate these into a 10-wave plan.

## Outcome

Completed on 2026-04-21.

What changed:
- The engine, runner, worker bridge, agents, and trace/test surfaces were migrated to the microturn-native decision protocol described by this spec.
- The old template/certificate legality contract was retired from the public runtime surface, and the remaining internal authority seam was completed in the follow-up implementation wave.
- The documentation set, agent-profile shipped surface, and the final spec-140 proof corpus were all updated to reflect the microturn-native architecture.

Deviations from original plan:
- Ticket `140MICRODECPRO-009` did not run a profile re-evolution campaign. Per later reassessment, it removed shipped microturn-incompatible heuristics only; future profile improvement remains separate work.
- Ticket `140MICRODECPRO-012` was narrowed to truthful public-surface retirement and then split residual work into `140MICRODECPRO-015` (internal authority seam replacement) and `140MICRODECPRO-016` (remaining diagnostics/schema cleanup) instead of claiming the deeper rewrite had landed in one ticket.
- Ticket `140MICRODECPRO-014` used truthful live-repo proofs rather than nonexistent historical comparators for the profile-migration and performance-gate lanes.

Verification results:
- The implementation ticket series through `140MICRODECPRO-016` was completed and post-reviewed, with the finished tickets archived under `archive/tickets/`.
- `pnpm run check:ticket-deps` passed after the final ticket archival state.
- The spec-140 test wave in `140MICRODECPRO-014` passed its focused proof lanes; the broader `pnpm -F @ludoforge/engine test` lane remained explicitly recorded there as `harness-noisy / not final-confirmed` rather than being overstated.
