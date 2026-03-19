# 15GAMAGEPOLIR-021: Realign FITL Authored-Policy Survivability Scope Around Generic Policy Cost

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic policy candidate-preparation hardening, policy-agent breadth/cost correction, and FITL authored-policy regression alignment
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-011-author-baseline-fitl-policy-library-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-008-integrate-policyagent-with-traces-and-diagnostics.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md

## Problem

The old ticket overreaches relative to the current generic policy architecture. FITL authored policies are already proven to compile, bind by seat, concretize template moves, and survive a short deterministic smoke run, but the ticket assumes the remaining gap is “just add a reusable terminal-playthrough harness and extend the run to completion”.

That is not what the code says today. The current generic policy path still spends too much time in candidate preparation and policy evaluation for FITL to make terminal authored self-play a clean default-regression target. A full-playthrough proof is still desirable, but the robust architectural move is to fix the generic policy cost boundary first, then revisit terminal survivability on top of that cheaper runtime.

## Assumption Reassessment (2026-03-19)

1. Archived ticket 011 already delivered the important baseline proof: FITL authored policy bindings in `GameSpecDoc`, generic concrete-candidate preparation for `PolicyAgent`, and deterministic bounded self-play without fallback.
2. The current codebase does not yet have a reusable full-playthrough authored-policy harness. More importantly, measured FITL policy selection cost is still high enough that proving terminal completion inside the normal engine regression suite would be an architectural stretch, not just missing test scaffolding.
3. On the current generic path, `PolicyAgent` defaults to a wider template-completion breadth than the shared playable-move preparation helper. That default is generic, not FITL-specific, and it materially raises authored-policy runtime cost.
4. The current evidence does not justify deleting `preparePlayableMoves()` viability re-checks for completed template moves. A bounded FITL smoke probe still exposes decision-complete moves that fail later legality checks, so the safer contract today is “decision-complete plus viability-checked”, not “decision-complete alone”.
5. The biggest discrepancy in the old ticket is scope. The most valuable change is not “add terminal harness first”; it is “tighten the generic policy cost boundary so authored-policy smoke coverage stays cheap and deterministic”.
6. FITL-specific authored policy data should only change if the authored heuristics are actually wrong. No FITL-specific simulator/runtime/kernel branches are justified by the current evidence.
7. `GameSpecDoc` remains the home for game-specific non-visual semantics. `visual-config.yaml` remains presentation-only and must not become a policy or runtime dependency while solving this.

## Architecture Check

1. A reusable terminal-playthrough harness is still the right long-term proof vehicle, but it is not the next clean step while generic authored-policy choice remains too expensive for FITL.
2. The cleaner immediate architecture is to reduce generic authored-policy breadth without weakening proven legality gates. `PolicyAgent` default breadth should be justified by generic cost/benefit, not by legacy optimism.
3. If broader template sampling is still useful, it should remain an explicit override instead of the default authored-policy path.
4. FITL-specific decision priorities still belong in authored policy fragments under `GameSpecDoc`; generic move completion, candidate preparation, and policy runtime ownership stay in engine-agnostic layers.
5. No backwards-compatibility aliases, dual paths, or FITL-only runtime exceptions should be introduced. If a generic contract is wrong, replace it cleanly and update all call sites.

## What to Change

### 1. Right-size authored-policy default breadth

Reassess `PolicyAgent`’s default template-completion breadth against the generic helper’s contract and actual FITL cost. If broader sampling is still useful, keep it as an explicit override rather than the default authored-policy path.

The goal is not to tune FITL strength. The goal is to keep the shared authored-policy runtime cheap enough that bounded production-spec regression remains practical.

### 2. Strengthen bounded FITL authored-policy regression coverage

Keep the existing FITL authored-policy regression bounded and deterministic, but strengthen it to pin the corrected generic behavior:

- authored policy bindings compile for all four seats
- template legal moves are concretized to playable moves before evaluation
- fixed-seed bounded self-play uses no emergency fallback or runtime escape hatches
- the bounded proof remains cheap enough to belong in the engine suite

Terminal authored self-play should move to a follow-up ticket after the generic policy cost boundary is reduced enough to make that proof maintainable.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify if needed)
- `data/games/fire-in-the-lake/92-agents.md` (modify only if evidence shows authored policy data is actually wrong)
- `archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-011-author-baseline-fitl-policy-library-profiles-and-bindings.md` (reference only; do not re-open)

## Out of Scope

- FITL-specific runtime/kernel/simulator branches
- visual presentation work or any `visual-config.yaml` changes
- policy-strength tuning beyond what is necessary to keep bounded authored-policy regression deterministic and cheap
- reusable terminal-playthrough harness work
- Texas Hold'em authored-policy survivability work

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` proves FITL authored policy bindings compile and fixed-seed bounded self-play stays legal, deterministic, and fallback-free.
2. The same test proves template legal moves are concretized to playable moves before policy evaluation.
3. Unit/integration coverage pins the corrected default policy breadth and the bounded no-fallback legality guarantee.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Game-specific policy semantics remain authored in `GameSpecDoc` files, not in `GameDef`, simulator, policy evaluator, or kernel branches.
2. `visual-config.yaml` remains presentation-only and uninvolved in policy compilation or headless self-play.
3. Broader template sampling, if still desired, is an explicit agent configuration choice rather than an unjustified default.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — retain bounded FITL authored-policy smoke coverage, but pin the corrected generic no-fallback/concrete-candidate path.
2. `packages/engine/test/unit/agents/policy-agent.test.ts` — add or refine coverage to pin the changed default breadth if needed.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What changed:
  - corrected the ticket from a terminal-survivability implementation ticket into an architecture reassessment artifact grounded in the current code and tests
  - documented that FITL authored policies are already proven for compile/binding/concrete-candidate/bounded-smoke coverage, but not yet at a cost point that justifies terminal self-play in the default engine regression suite
  - documented the measured architectural constraints that matter now: the current FITL policy integration test takes about 45 seconds on its own, exploratory `PolicyAgent` breadth reduction to `completionsPerTemplate=1` broke the bounded smoke path, and removing completed-move viability checks exposed a legality mismatch
- Deviations from original plan:
  - no engine code was kept, because the most obvious generic simplifications were not more robust than the current architecture once validated against FITL
  - terminal-playthrough harness work was explicitly deferred rather than forced through on top of an expensive and still brittle generic policy-selection path
  - no new tests were added; the reassessment used the existing FITL authored-policy regression plus exploratory bounded probes to validate or reject the proposed architectural changes
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm run check:ticket-deps` passed
