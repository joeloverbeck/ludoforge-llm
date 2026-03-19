# 15GAMAGEPOLIR-021: Prove Authored FITL Policy Agents Reach Terminal Headless Self-Play

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic policy self-play survivability harness, possible generic policy/runtime hardening, and FITL authored-policy refinement
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-011-author-baseline-fitl-policy-library-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-008-integrate-policyagent-with-traces-and-diagnostics.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md

## Problem

Spec 15 is still not proven at the level we actually need. The repo now demonstrates that FITL can author baseline policies through `GameSpecDoc` and survive a bounded smoke run, but that is weaker than the real bar: authored policy agents for a complex asymmetric production game must be able to run a complete headless playthrough to terminal state without engine exceptions, illegal moves, or architecture-specific escape hatches.

Until that is true, the current authored-policy architecture is not yet robust enough to claim that `GameSpecDoc`-authored agents can really carry a large real game end-to-end.

## Assumption Reassessment (2026-03-19)

1. Archived ticket 011 delivered FITL authored policy bindings, generic concrete-candidate preparation for `PolicyAgent`, and a fixed-seed bounded self-play smoke run, but it intentionally stopped short of proving terminal completion.
2. The current codebase already has a generic simulator, policy traces, and a production-spec fixture harness, so this ticket should extend those reusable surfaces rather than invent a FITL-only execution path.
3. Current bounded policy execution exposed a real distinction between “can choose a legal playable move now” and “can survive an entire authored self-play game”. The latter is not yet covered by tests and may still reveal gaps in generic move preparation, policy evaluation, or authored baseline coverage.
4. The corrected scope is broader than simply increasing `maxTurns` in one FITL test. If full-playthrough failures occur, the fix must land at the proper architectural layer:
   - authored FITL policy data when the baseline heuristics are insufficient,
   - shared policy/runtime/simulator infrastructure when the runtime contract is insufficient,
   - never FITL-specific branches in `GameDef`, simulator, evaluator, or kernel.
5. `GameSpecDoc` remains the home for game-specific non-visual semantics. `visual-config.yaml` remains presentation-only and must not become a policy or runtime dependency while solving this.

## Architecture Check

1. A reusable full-policy-playthrough survivability harness is cleaner than a one-off FITL regression because the same architecture will need to prove Texas Hold'em and future authored-policy games later.
2. FITL-specific decision priorities belong in authored policy fragments under `GameSpecDoc`; generic move completion, candidate preparation, evaluation, and simulation survivability belong in engine-agnostic layers.
3. The right long-term architecture is “policy agents consume a generic playable-candidate contract and can survive full simulation” rather than “each game gets enough special handling to limp through a smoke test”.
4. No backwards-compatibility aliases, dual paths, or FITL-only runtime exceptions should be introduced. If a generic contract is wrong, replace it cleanly and update all call sites.

## What to Change

### 1. Add a reusable full-playthrough policy survivability harness

Introduce a generic engine test helper or harness that runs policy-only headless self-play from a production spec until terminal state, while collecting enough diagnostics to localize failures deterministically:

- seed
- turn count
- active seat / profile
- fallback usage
- failure surface if evaluation or move application breaks

This harness must be reusable for other authored-policy games, not coupled to FITL.

### 2. Make authored policy-only FITL self-play reach terminal state

Use the harness to drive FITL from initial state to terminal completion under authored `PolicyAgent`s bound through the production `GameSpecDoc`.

If failures appear, fix them at the correct ownership boundary:

- authored FITL policy data if the baseline needs stronger but still data-authored priorities
- generic policy candidate preparation/evaluation if concrete-candidate or runtime assumptions are still incomplete
- generic simulator/runtime contracts if headless simulation surfaces are insufficient

Do not solve FITL survivability with FITL-specific code branches in agnostic layers.

### 3. Lock the terminal-completion guarantee with deterministic regression coverage

Add deterministic integration coverage that proves one or more fixed-seed FITL policy-only playthroughs reach terminal state without emergency fallback or runtime errors.

If the full run is expensive, keep the harness deterministic and bounded by an explicit documented maximum turn budget that is justified by FITL’s actual terminal behavior, not by convenience.

## Files to Touch

- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- `packages/engine/test/helpers/` shared policy self-play helper (new or modify)
- `packages/engine/src/agents/` generic policy candidate/runtime helpers (modify only if a shared contract gap is found)
- `packages/engine/src/sim/` generic simulator surfaces (modify only if a shared contract gap is found)
- `data/games/fire-in-the-lake/92-agents.md` (modify only if authored FITL baseline refinement is genuinely required)
- `archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-011-author-baseline-fitl-policy-library-profiles-and-bindings.md` (reference only; do not re-open)

## Out of Scope

- FITL-specific runtime/kernel/simulator branches
- visual presentation work or any `visual-config.yaml` changes
- policy-strength tuning beyond what is necessary for terminal survivability
- benchmark/performance threshold work except where a survivability test needs a justified turn budget
- Texas Hold'em terminal-survivability work

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` proves policy-only FITL headless self-play reaches terminal state for the fixed regression seed corpus.
2. The same test proves no move in those runs uses emergency fallback or crashes due to policy/runtime/template-completion failures.
3. Shared helper coverage proves the full-playthrough survivability harness is reusable and not FITL-specific in its API/ownership.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Game-specific policy semantics remain authored in `GameSpecDoc` files, not in `GameDef`, simulator, policy evaluator, or kernel branches.
2. `visual-config.yaml` remains presentation-only and uninvolved in policy compilation or headless self-play.
3. Full-playthrough survivability is proven through generic runtime/test infrastructure and authored data, not through fallback-tolerant or game-specific exception paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — upgrade from bounded smoke coverage to terminal-completion regression coverage for authored FITL policy self-play.
2. `packages/engine/test/helpers/` shared policy self-play helper — reusable deterministic harness for policy-only production-game playthroughs and failure diagnostics.
3. Additional focused unit/integration tests near any generic runtime contract that fails during terminal-playthrough work — each added only to pin a newly exposed invariant or edge case.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`
