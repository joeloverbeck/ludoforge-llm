# Spec 132: Reconcile Viable-Move Enumeration With Template-Completion Outcomes

**Status**: COMPLETED
**Priority**: P0
**Complexity**: L
**Dependencies**: none (touches `packages/engine/src/agents/*`, `packages/engine/src/kernel/playable-candidate.ts`, `packages/engine/src/kernel/move-completion.ts`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/src/sim/simulator.ts`)
**Source**: `campaigns/fitl-arvn-agent-evolution` full-tier tournament run on HEAD (2026-04-16) — 5/15 seeds crash with `NoPlayableMovesAfterPreparationError`, causing the harness to reject every experiment (`Too many errors: 5/15 (>30%)`)

## Overview

On main, `PolicyAgent.chooseMove(...)` deterministically throws `NoPlayableMovesAfterPreparationError` for one-third of the seeds in the `fitl-arvn-agent-evolution` seed range (1000–1014). The simulator catches the throw and maps it to `stopReason = 'agentStuck'`. The tournament runner classifies `agentStuck` as a runner error, so every experiment in the campaign fails the gate and cannot be scored. The campaign is therefore completely blocked until the underlying disagreement between **legal-move enumeration** and **template-move completion** is resolved.

The root disagreement is: `enumerateLegalMoves(...)` emits a classified move whose `viability.viable === true`, but the PolicyAgent's downstream preparation pipeline — which reaches `completeTemplateMove(...)` and `probeMoveViability(...)` — concludes the same move is unplayable in the same state. The two views must converge. This spec specifies how.

Scope is the engine-agnostic pipeline (`enumerateLegalMoves` → `probeMoveViability` → `completeTemplateMove` → `evaluatePlayableMoveCandidate` → `PolicyAgent.chooseMove`). No FITL-specific code is in scope.

## Reproduction

Seed 1000 of the FITL production game spec, starting from a clean build at current HEAD, deterministically fails at move **140** of the game (NVA seat, turn 1, free-operation march).

```bash
pnpm -F @ludoforge/engine build
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs \
  --seeds 15 --players 4 --evolved-seat arvn --max-turns 200
```

Observed:

- seeds **1000, 1007, 1008, 1010, 1013** → `stopReason=agentStuck` (error)
- seeds **1001–1006, 1009, 1011, 1012, 1014** → `stopReason=maxTurns` (hit 200-move ceiling, no terminal)
- runner exits non-zero with `Too many errors: 5/15 (>30%)`
- `compositeScore = -3.9`, `wins = 0`

Context — new vs. already-known failures:

- Seed **1010** is already listed in `packages/engine/test/integration/fitl-seed-stability.test.ts:13–15` (`FORMER_CRASH_OR_HANG_SEEDS`). That suite explicitly tolerates `'agentStuck'` (`ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'agentStuck'])` at L16). Seed 1010's crash is therefore a pre-existing, accepted-as-bounded failure — not a new regression.
- Seeds **1000, 1007, 1008, 1013** are **new** regressions that appeared after the `FORMER_CRASH_OR_HANG_SEEDS` list was last updated. The engine has leaked `agentStuck` for some time on 1010; recent commits have widened the failure to four additional campaign seeds.

The `maxTurns` outcomes are plausibly a *separate* concern (agents are not yet tuned to cross the post-Spec-66 Coup-gating thresholds). This spec covers the `agentStuck` crashes only.

A reproducer script is checked in at `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs`. For seed 1000 it prints:

```
seed=1000 profile=nva-baseline player=2 moveCount=34 stateHash=6539610714732013105
legalMoves.length=2, legalMoves by actionId: march=2, legalMoves by viability: VIABLE=2
Broader preparePlayableMoves → completedMoves=0 stochasticMoves=0
  templateCompletionAttempts=1, templateCompletionSuccesses=0, templateCompletionUnsatisfiable=1
  movePreparations: march init=pending final=rejected rejection=completionUnsatisfiable
                    march init=rejected final=rejected skippedAsDuplicate=true

Fresh enumerate:              both march moves VIABLE (consistent with input.legalMoves)
Direct probeMoveViability:    viable=false, code=ILLEGAL_MOVE      ← DISAGREEMENT
completeTemplateMove:         kind=unsatisfiable after 1 choice request
completeMoveDecisionSequence: complete=false, illegal=false,
                              nextDecision={chooseN min:1 max:1 optionCount:29}
```

Both enumeration paths (the simulator's and a freshly-invoked one) agree the move is VIABLE. `probeMoveViability`, called in isolation on the same `(def, state, move, runtime)` tuple, disagrees. `completeMoveDecisionSequence` with an identity chooser happily exposes a well-formed `chooseN{min:1, max:1, options:29}` request, i.e., the decision shape is legal and satisfiable in principle. The actual `unsatisfiable` verdict is produced only when random selection drives `completeTemplateMove` past that first request — the subsequent step either throws `CHOICE_RUNTIME_VALIDATION_FAILED` (caught at `packages/engine/src/kernel/move-completion.ts:146`) or resolves to an `illegal` / terminal-`nextDecision` state (`move-completion.ts:159`), both paths returning `{ kind: 'unsatisfiable' }`.

The retry budget in `attemptTemplateCompletion` does **not** rescue this case: `packages/engine/src/agents/prepare-playable-moves.ts:349` treats `completionUnsatisfiable` as a structural failure and `break`s the attempt loop on the first occurrence, skipping the `NOT_VIABLE_RETRY_CAP` retry budget entirely. Only `notViable` outcomes extend the budget.

## Root Cause Summary

Two independent defects combine to produce the crash:

1. **Enumeration-vs-probe viability disagreement.** For a free-operation `march` template move, `enumerateLegalMoves` classifies it `viable=true` while `probeMoveViability` on the same inputs returns `viable=false, code=ILLEGAL_MOVE`. One of the two is wrong for this state shape. The two paths must share a single source of truth for viability of template moves.

2. **`completionUnsatisfiable` short-circuits retry.** The retry extension in `attemptTemplateCompletion` only fires for `notViable`. When a random draw lands on a decision branch that later trips `CHOICE_RUNTIME_VALIDATION_FAILED` or resolves to `illegal`, the outcome is classified `completionUnsatisfiable` and the retry loop exits after one attempt — even though other random draws over the same `chooseN{min:1,max:1,options:29}` domain might succeed. This means a single unlucky draw on an otherwise completable template can mark the entire move unplayable.

Either defect alone would be benign: if enumeration agreed with probe, the move would be filtered out of `legalMoves` and the simulator would end the turn cleanly (`noLegalMoves`). If `completionUnsatisfiable` were retryable, the RNG would eventually find a working completion. Together they produce a crash.

## Alignment With `docs/FOUNDATIONS.md`

This spec is constrained by the following commandments:

- **#5 One Rules Protocol, Many Clients** — Legality must have a single source of truth. An enumerate/probe disagreement violates this directly.
- **#8 Determinism Is Sacred** — The fix MUST be deterministic: same `GameDef + state + seed + actions → identical result`. Retry-budget changes MUST preserve existing trace determinism for currently-passing seeds.
- **#10 Bounded Computation** — Retry extensions MUST remain bounded. Any widened retry budget MUST have a hard ceiling documented alongside `NOT_VIABLE_RETRY_CAP`.
- **#11 Immutability** — The extracted viability predicate (S1) and the new retry / classification branches (S2) MUST be pure and side-effect free. They receive state and return a verdict; they MUST NOT mutate `state`, `def`, `runtime`, or any caller-visible object.
- **#12 Compiler-Kernel Validation Boundary** — Free-operation viability is state-dependent and thus owned by the kernel; the compiler is not in scope here.
- **#13 Reproducibility** — Retry logic MUST remain deterministic given identical RNG state. Golden replay equality (byte-identical canonical serialized state for the same seed+actions) is a proof obligation for every currently-passing seed.
- **#14 No Backwards Compatibility** — When `'agentStuck'` becomes unreachable (S3), the union-type member and its Zod schema entry MUST be deleted in the same change; no compatibility shim, no deprecated fallback.
- **#15 Architectural Completeness** — The fix MUST address root causes. A symptom-only patch (e.g., swallow the throw and emit a pass move) is rejected.
- **#16 Testing as Proof** — The regression MUST be proven by automated tests before implementation lands. Bugs are fixed through TDD.

## Non-Goals

- Do **not** change FITL spec data (`data/games/fire-in-the-lake/*`) as part of this fix. The defect reproduces on a purely engine-agnostic surface; adding FITL-specific conditions is an engine-agnosticism violation (#1).
- Do **not** change agent policy YAML (`92-agents.md`) to dodge the crash (e.g., pruning `march`). The same path can surface from any free-operation template.
- Do **not** address the `maxTurns` outcomes observed on the other 10 seeds. Those are a separate downstream question — whether current baseline policies can cross the post-Spec-66 victory thresholds — and belong in a campaign-side spec once the `agentStuck` gate is removed.
- Do **not** revert `971992fc` or any Spec 130/131 work; this defect is orthogonal.

## Required Investigation (Pre-Implementation)

Before any code is written, the following investigations MUST complete and be recorded in the ticket(s) that decompose this spec. Each feeds directly into the implementation choices below.

### I1. Identify the exact enumerate/probe divergence point

Instrument both `enumerateLegalMoves` and `probeMoveViability` on the failing `(def, state, move)` tuple and walk the decision pipeline step-by-step to find the first branch where they diverge. Candidate suspects, in order of likelihood:

- Free-operation zone-filter evaluation (`freeOperationNotGranted` / `zoneFilterMismatch` paths): `isZoneFilterMismatchOnFreeOpTemplate` in `prepare-playable-moves.ts` shows this case is already known to differ between enumerate-time and complete-time. Verify whether enumerate is skipping a check that probe performs, or vice versa.
- Action-cost / resource precondition evaluation when the template has no params yet (`move.params = {}` in the failing case).
- Turn-flow window filters applied post-hoc to enumeration but not to a direct probe (cf. memory note: *legalMoves has a silent post-filter*).

The investigation output MUST be a minimal scenario test — a pure-engine fixture (no FITL dependency) that exhibits the same disagreement deterministically.

### I2. Characterize the `completionUnsatisfiable` draw space

For the seed-1000 march template, enumerate the `chooseN{min:1,max:1,options:29}` first-choice domain and quantify how many of the 29 choices lead to:

- `completed`
- `stochasticUnresolved`
- `illegal` (explicit downstream rejection)
- `CHOICE_RUNTIME_VALIDATION_FAILED` (thrown during subsequent decisions)
- `exceeded` budget

This distribution determines whether the correct fix is (a) a retryable `completionUnsatisfiable` class or (b) a stronger enumerate-time filter that excludes the dead-end draws up front.

### I3. Identify all other call sites affected

Audit every caller of `probeMoveViability` and every consumer of `enumerateLegalMoves.moves[].viability`. List each one and confirm the fix leaves them consistent. Particular attention to `policy-preview.ts`, `evaluatePolicyMoveCore`, and `applyTrustedMove`.

## Specification

### S1. Single source of truth for template-move viability

`enumerateLegalMoves` and `probeMoveViability` MUST produce the same verdict for the same `(def, state, move, runtime)`. Concretely:

- Extract the viability predicate(s) they each currently apply into a single pure function exported from `packages/engine/src/kernel/playable-candidate.ts` (or a new `viability-predicate.ts` alongside it). Both call sites consume that function.
- The extracted predicate MUST be deterministic and side-effect free.
- The predicate's failure mode set (VIABLE, or one of a closed enum of non-viable codes) MUST be enumerable; tests assert the enum is exhaustive.

If investigation I1 shows the disagreement lives in a different layer (e.g., enumerate applies turn-flow filters that probe does not), the fix MAY instead be to move the missing filter into the shared predicate or to document and test the intentional asymmetry. In the latter case, the extracted predicate MUST still be shared; the asymmetry is expressed as an explicit parameter, not a duplicated branch.

### S2. Close the `completionUnsatisfiable` retry gap

Modify `attemptTemplateCompletion` in `packages/engine/src/agents/prepare-playable-moves.ts` so that a `completionUnsatisfiable` outcome produced by a *downstream* random draw (i.e., a dead-end on a specific draw path) does NOT terminate the attempt loop prematurely. Either:

- (a) Extend the retry budget for `completionUnsatisfiable` in the same manner as `notViable`, capped by `NOT_VIABLE_RETRY_CAP`, when the template is known to be structurally completable (i.e., the move was classified VIABLE by the shared predicate from S1).
- (b) Distinguish two kinds of `completionUnsatisfiable` at the `move-completion.ts` boundary: `structurallyUnsatisfiable` (empty options at top level, `min>max`, budget exceeded) vs. `drawDeadEnd` (illegal downstream or `CHOICE_RUNTIME_VALIDATION_FAILED`). Only `structurallyUnsatisfiable` breaks the retry loop.

Option (b) is preferred because it yields better diagnostics and keeps the retry cap hardening localized to a narrow case. The implementation MUST document the ceiling and MUST NOT introduce unbounded retry (FOUNDATIONS #10).

### S3. Fail-closed tournament-runner surface and union-type cleanup

When S1 and S2 land, `NoPlayableMovesAfterPreparationError` becomes the signature of a genuine engine invariant violation, not a recoverable game state. The simulator MUST therefore NOT silently map it to `stopReason = 'agentStuck'` as it does today. Concretely:

- Delete the `isNoPlayableErr` catch at `packages/engine/src/sim/simulator.ts:128–140`. Let the error propagate to `runGame`'s caller.
- Delete `'agentStuck'` from the `SimulationStopReason` union in `packages/engine/src/kernel/types-core.ts` in the same change. Per FOUNDATIONS #14, an unreachable member is a compatibility shim and MUST NOT linger.
- Delete the corresponding Zod union entry in `packages/engine/src/kernel/schemas-core.ts`. Keep the schema and type definitions in sync as a single atomic change.
- Add a test asserting that a state where all legal moves are genuinely uncompletable after the shared predicate's verdict produces `stopReason = 'noLegalMoves'`, not `agentStuck`, because enumerate will have already filtered the uncompletable moves out.

If investigation I3 surfaces any call site that legitimately relies on `agentStuck` as a soft-stop (I have found none so far; the history in `14a33c29` suggests the opposite), that call site MUST be updated in the same change. No compatibility shims (FOUNDATIONS #14).

### S4. TDD deliverables (order of work)

Every ticket MUST follow `tdd-workflow`. The following new tests MUST exist and fail before any code change:

1. **S4.1 — Kernel unit**: given a synthetic GameDef with a free-operation template that exhibits the enumerate/probe disagreement, assert `probeMoveViability` agrees with `enumerateLegalMoves[...].viability` for every `(def, state, move)` in the scenario. Location: `packages/engine/test/unit/kernel/viability-predicate.test.ts`. (Fails on current HEAD.)
2. **S4.2 — Kernel unit**: given the same template, call `completeTemplateMove` across all `chooseN{min,max}` domain draws and assert that a structurally completable template produces at least one `completed` result. Location: `packages/engine/test/unit/kernel/move-completion-retry.test.ts`. (Fails on current HEAD for the failing draw path.)
3. **S4.3 — Agent unit**: given a VIABLE template move per the shared predicate, `preparePlayableMoves` with `pendingTemplateCompletions = 3` MUST return at least one `completedMove` or `stochasticMove`. Location: `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts`. (Fails on current HEAD because `completionUnsatisfiable` breaks retry.)
4. **S4.4 — Integration**: FITL seed 1000 with the production spec and baseline profiles plays to a `'terminal' | 'maxTurns' | 'noLegalMoves'` stop reason — never throws and never produces `'agentStuck'`. Location: `packages/engine/test/integration/fitl-seed-1000-regression.test.ts`. (Fails on current HEAD.)
5. **S4.5 — Simulator unit**: after the S3 deletion, a state with all legal moves deliberately uncompletable produces `stopReason = 'noLegalMoves'` and does not throw. Also verify that constructing a GameTrace with `stopReason: 'agentStuck'` is a type error (the union member is gone) and a Zod validation failure. Location: `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts`.

### S4.6 — Migrate existing tests

The following existing tests reference `'agentStuck'` and MUST be updated in the same change that lands S1–S3. Do not defer any of them.

- `packages/engine/test/integration/fitl-seed-stability.test.ts:16` — change `ALLOWED_STOP_REASONS` from `new Set(['terminal', 'maxTurns', 'agentStuck'])` to `new Set(['terminal', 'maxTurns'])`. The `FORMER_CRASH_OR_HANG_SEEDS` list (L13–15, including the campaign-overlapping seed 1010) MUST now resolve to `'terminal'` or `'maxTurns'` for every entry. If any seed still crashes or throws post-fix, that is an implementation bug in the S1/S2 work — NOT a test-data issue.
- `packages/engine/test/integration/fitl-seed-2057-regression.test.ts:13` — same update to `ALLOWED_STOP_REASONS`.
- `packages/engine/test/integration/fitl-policy-agent.test.ts:1196` — the existing positive invariant `trace.stopReason === 'noLegalMoves' || 'maxTurns' || 'terminal'` continues to hold for seed 17. Add a code comment noting this is a post-S3 invariant (agentStuck is no longer a representable stop reason), not a loose expectation.

Goldens, fixtures, and any data-asset snapshots MUST be updated in the same change (FOUNDATIONS #14).

## Success Criteria

All of the following MUST hold on HEAD after implementation:

- `pnpm turbo lint`, `pnpm turbo typecheck`, `pnpm turbo test` all pass.
- Running `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200` produces `errors = 0` (the `agentStuck` stop reason no longer appears for any seed in 1000–1014). `completed + truncated` MAY remain as they are; that is out of scope.
- The tournament runner exits `0`.
- `SimulationStopReason` no longer includes `'agentStuck'` — neither the TypeScript union in `types-core.ts` nor the Zod schema in `schemas-core.ts`. Attempting to construct a trace with `stopReason: 'agentStuck'` is a type error and a Zod validation failure.
- Post-fix, every seed in `FORMER_CRASH_OR_HANG_SEEDS` (`fitl-seed-stability.test.ts:13–15`) produces only `'terminal'` or `'maxTurns'` — never throws, never stalls.
- FITL seed 1002 completes under the `14a33c29`-equivalent smoke path without hanging or regressing (guards against reintroducing the infinite-loop class of bug on the `move-completion.ts` boundary).
- The new tests in S4.1–S4.5 pass; the same tests cherry-picked onto the pre-fix HEAD fail (regression is proven).
- The migrated tests in S4.6 pass.
- No FITL-specific code is added to any file under `packages/engine/src/kernel/`, `packages/engine/src/cnl/`, or `packages/engine/src/agents/` (FOUNDATIONS #1).

## Risk and Rollback

- **Risk**: Making `completionUnsatisfiable` retryable could cause latent hangs if the shared predicate incorrectly marks a structurally-uncompletable template as VIABLE. Mitigation: the hard cap `NOT_VIABLE_RETRY_CAP` remains in force, and S3 converts any residual case into a clean `NoPlayableMovesAfterPreparationError` throw that is not caught by the simulator.
- **Risk**: Unifying the viability predicate may shift viability verdicts for currently-passing seeds, changing trace contents. Mitigation: run the FITL and Texas Hold'em golden replay suites and update canonical goldens in the same change, with before/after inspection to confirm the shifts are principled.
- **Risk (`14a33c29` overlap)**: S2 option (b) adds a new return-shape variant at the `packages/engine/src/kernel/move-completion.ts` boundary. That same file was reverted in commit `14a33c29` ("fix: revert completion-path changes that caused CI hangs") because earlier modifications produced infinite loops on FITL seed 1002. Any S2 change to the completion boundary is in that known-fragile zone. Mitigation: (a) manual review of every `completeMoveDecisionSequence` call path before merging S2; (b) a seed-1002 smoke run included in S4.4 integration coverage; (c) keep the existing `maxCompletionDecisions` budget check intact as the final hard ceiling — do not widen, do not rename, do not bypass.
- **Rollback**: revert the spec's commits; the pre-spec engine state is unchanged except for the simulator's catch block, which can be reinstated as a temporary shim only if a downstream failure is discovered after merge. No long-lived compatibility layer is acceptable (FOUNDATIONS #14).

## Generated Tickets

Decomposed 2026-04-16 via `/spec-to-tickets`:

- `tickets/132AGESTUVIA-001.md` — Unify enumerate/probe viability behind a shared predicate (S1 + I1 + S4.1)
- `tickets/132AGESTUVIA-002.md` — Split `completionUnsatisfiable` into structural vs draw-dead-end (S2 + I2 + S4.2)
- `tickets/132AGESTUVIA-003.md` — Agent retry integration test (S4.3)
- `tickets/132AGESTUVIA-004.md` — Remove `agentStuck` soft-stop + union cleanup + test migrations (S3 + S4.5 + S4.6)
- `tickets/132AGESTUVIA-005.md` — FITL seed 1000 + seed 1002 regression gate (S4.4)

## Outcome

Completed: 2026-04-17

1. The series landed the intended engine-agnostic fix set across tickets `132AGESTUVIA-001` through `132AGESTUVIA-005`. The shared outcome is that viability/admission and completion no longer disagree on the known FITL tournament witnesses in a way that can surface as `agentStuck`.
2. `SimulationStopReason` no longer includes `'agentStuck'`, the simulator no longer soft-stops on `NoPlayableMovesAfterPreparationError`, and the relevant tests and schema surfaces were migrated in the same change series.
3. The completion boundary now distinguishes structural impossibility from draw-specific dead ends, and legal-move classification filters incomplete free-operation templates that have no legal completed move under the required outcome policy.
4. The original exact historical witness shifted during implementation: the live seed-1000 gate ended up as a bounded, deterministic, non-throwing regression proof with allowed stop reason in `'terminal' | 'maxTurns' | 'noLegalMoves'`, rather than preserving the earlier exact `maxTurns` outcome. This was recorded truthfully in archived ticket `132AGESTUVIA-005`.
5. Verification for the landed series included the seed-specific regression lanes, `pnpm turbo test`, and the campaign closure smoke `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200`, which now reports `errors: 0`.
