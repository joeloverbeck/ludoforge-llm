# 15GAMAGEPOLIR-011: Author Baseline FITL Policy Library, Profiles, and Bindings

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — authored FITL data, generic policy-agent candidate concretization, and engine integration tests
**Deps**: specs/15-gamespec-agent-policy-ir.md, docs/fitl-event-authoring-cookbook.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-008-integrate-policyagent-with-traces-and-diagnostics.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-014-make-policy-metric-refs-executable-through-generic-runtime-contracts.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-015-align-candidate-param-refs-with-concrete-move-contracts.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-016-extend-candidate-param-contract-with-static-choice-binding-shape-support.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md

## Problem

Spec 15 is not complete until a real asymmetric game authors seat-bound policies through `GameSpecDoc` rather than engine branches. Fire in the Lake is the required proving ground for authored multi-seat policy asymmetry.

## Assumption Reassessment (2026-03-19)

1. FITL already has the canonical authored game spec and supporting markdown data files under `data/games/fire-in-the-lake*`, including the production seat catalog in `data/games/fire-in-the-lake/40-content-data-assets.md`.
2. FITL does not yet author any `agents` section, so this ticket is still the first production authored-policy proof for a real asymmetric game.
3. The current production-spec layout suggests a cleaner authored boundary than the old ticket text: add policy authoring in a dedicated imported FITL fragment instead of burying policy semantics in content-data or victory files unless those files truly need new shared surfaces.
4. Spec 15 requires shared library items, four seat-specific profiles/bindings, and FITL heuristics expressed through authored generic surfaces rather than runtime branches.
5. Archived tickets 014, 015, 016, and 017 already provide the generic runtime/compiler ownership needed for `metric.*`, `candidate.param.*`, preview visibility, and exact static id-list candidate params. The old blocker language about ticket 016 is stale and must not constrain this work.
6. There is one real architectural discrepancy to address in scope: the FITL production spec currently exposes template/incomplete legal moves such as `event` to agents, while Spec 15 defines policy evaluation over concrete decision-complete candidates. The clean fix is generic agent-side candidate concretization, not authored FITL-specific avoidance rules.
7. Corrected scope: author a minimal but complete FITL baseline policy pack and close the concrete-candidate gap generically for `PolicyAgent`. Do not add FITL-specific runtime branches, deeper search, or tuning for high play strength.

## Architecture Check

1. Encoding FITL heuristics as authored policy library items over existing generic surfaces is cleaner than preserving specialized FITL agent code.
2. The authored policy payload should live in its own FITL import fragment. That keeps the GameSpec modular and avoids smuggling bot semantics into unrelated data-asset or victory files.
3. The current agent/runtime boundary is not ideal because `PolicyAgent` scores raw `legalMoves` while builtin agents already complete templates. Long term, all agents should consume one generic concrete-candidate preparation path. This ticket should move `PolicyAgent` onto that boundary rather than teaching FITL policies to work around incomplete moves.
4. No FITL-specific exceptions should be added to evaluator, preview, trace, simulator, or runner code.

## What to Change

### 1. Author the FITL policy catalog in a dedicated imported fragment

Add a new FITL policy authoring fragment that contains:

- policy visibility declarations over existing generic FITL surfaces
- shared parameters and library items
- four faction profiles
- top-level seat bindings

Prefer existing public/seat-visible FITL surfaces first, such as current victory margins/ranks and existing variables. Add new authored metrics only if a real policy need cannot be expressed cleanly through surfaces the production spec already owns.

### 2. Close the concrete-candidate gap generically for `PolicyAgent`

Make `PolicyAgent` evaluate concrete playable candidates instead of raw template legal moves, using the same generic completion semantics already owned by builtin agents. This must remain engine-agnostic and must not special-case FITL or specific action ids such as `event`.

### 3. Add integration coverage for FITL authored policy execution

Prove production FITL authored policy compile/self-play stays on legal playable moves, does not hit runtime errors, and stays inside the generic policy runtime.

## File List

- `data/games/fire-in-the-lake.game-spec.md` (modify to import the policy fragment)
- `data/games/fire-in-the-lake/92-agents.md` (new)
- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify only if genuinely needed for new shared authored surfaces)
- `data/games/fire-in-the-lake/91-victory-standings.md` (modify only if genuinely needed for new shared authored surfaces)
- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/` shared helper(s) for generic candidate concretization (new or modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (new)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify)
- `packages/engine/test/fixtures/trace/fitl-policy-baseline.golden.json` (new only if assertions genuinely require a golden)

## Out of Scope

- FITL-specific engine/runtime branches
- policy evolution/tuning loops
- visual-config changes
- Texas Hold'em authored policies
- benchmark regression thresholds
- changing generic `legalMoves()` enumeration semantics for every engine caller unless that becomes necessary to preserve one canonical concrete-candidate boundary

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` proves the FITL production spec compiles authored policy data, resolves all four seat bindings, and completes fixed-seed authored self-play runs without runtime errors.
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` proves FITL `PolicyAgent` chooses only concrete playable legal moves even when the raw legal-move surface includes templates/incomplete candidates.
3. `packages/engine/test/integration/fitl-policy-agent.test.ts` proves policy traces resolve authored seat bindings/profiles for a fixed seed.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL-specific policy behavior is authored in game data, not hardcoded into engine logic.
2. `data/games/fire-in-the-lake/visual-config.yaml` remains presentation-only and untouched for policy semantics.
3. All four FITL seats bind through canonical authored seat ids.
4. `PolicyAgent` must not rely on FITL-specific action-id avoidance to stay legal; incomplete/template candidate handling belongs to generic agent infrastructure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — production FITL authored-policy compile/self-play coverage and concrete-candidate legality assertions.
2. `packages/engine/test/unit/agents/policy-agent.test.ts` — generic template/incomplete-move concretization coverage for `PolicyAgent`.
3. `packages/engine/test/fixtures/trace/fitl-policy-baseline.golden.json` — fixed-seed reasoning/trace baseline only if trace assertions genuinely need a golden.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What changed:
  - added a dedicated FITL authored policy fragment at `data/games/fire-in-the-lake/92-agents.md` and imported it from the production entrypoint
  - authored four seat-bound FITL baseline profiles plus shared visibility, pruning, preview-margin, and action-preference library items entirely in `GameSpecDoc`
  - fixed imported `agents` section ownership in `compose-gamespec.ts` so authored policy sections survive import composition instead of being dropped
  - introduced a shared generic playable-move preparation helper for agents, moved `PolicyAgent` onto it, and re-validated completed candidates through `probeMoveViability()`
  - added bounded multi-completion support to `PolicyAgent` so real FITL template moves produce a usable concrete candidate set
  - added FITL production-policy integration coverage and strengthened `PolicyAgent` unit coverage for template completion/config validation
- Deviations from original plan:
  - corrected the stale assumption that ticket 016 was still blocking exact id-list candidate params; that support already existed and was reused as-is
  - corrected the old file plan that scattered policy semantics into FITL data/victory files by default; the implemented architecture uses a dedicated imported policy fragment instead
  - expanded scope to include two generic engine fixes the ticket assumptions missed: imported `agents` section composition and policy-agent concrete candidate preparation
  - kept the self-play smoke run bounded to a fixed five-turn window; the core legality/concretization invariants are covered directly, while deeper long-horizon policy quality remains separate from this baseline-authoring ticket
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/unit/agents/random-agent.test.js packages/engine/dist/test/unit/agents/greedy-agent-core.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine test:e2e` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm run check:ticket-deps` passed
