# 62CONPIESOU-005: Tier-aware admissibility for `chooseN` over `prioritized` queries

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime (legal-choices, effects-choice)
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md, archive/tickets/62CONPIESOU-004.md, specs/62b-incremental-choice-protocol.md

## Status Note

This ticket is no longer the recommended implementation path.

Spec 62b replaced the underlying interaction architecture: tier-aware prioritized legality should land on top of the incremental engine-owned `chooseN` protocol, not on top of the superseded one-shot array submission model.

Treat this ticket as historical problem analysis. Any implementation ticket replacing it should be cut from [Spec 62b](/home/joeloverbeck/projects/ludoforge-llm/specs/62b-incremental-choice-protocol.md), not from this document's narrower stopgap scope.

## Problem

When a `chooseN` effect's `options` is a `prioritized` query, the engine must reject full selections that violate tier priority. Today, `chooseN` validates only cardinality, uniqueness, and raw domain membership, so a submitted array can include lower-tier items even when higher-tier items of the same qualifier were still available. That breaks rules like FITL Rule 1.4.1.

The original ticket also assumed the engine already supported incremental multi-select re-evaluation, where lower-tier items become clickable only after higher-tier items are exhausted. That assumption is false in the current architecture and must be corrected before implementation.

## Assumption Reassessment (2026-03-14)

1. `packages/engine/src/kernel/effects-choice.ts` evaluates `chooseN.options` from the query AST at execution time and owns submitted-array validation. Confirmed.
2. `packages/engine/src/kernel/legal-choices.ts` computes `chooseN` option legality by probing whether an option can appear in at least one legal final combination. Confirmed.
3. `packages/runner/src/ui/ChoicePanel.tsx` holds multi-select state locally and submits one completed array through `chooseN(selectedValues)`. There is no engine-level partial `chooseN` submission/re-entry loop today. Confirmed.
4. Because of that one-shot contract, the current stack does **not** support true kernel-driven stepwise re-evaluation of `chooseN` legality after each click. The original ticket wording about dynamic re-evaluation in existing infrastructure was incorrect.
5. Ticket 004 deliberately did **not** add tier metadata or a `computeTierMembership(...)` utility. Any tier-aware rule here should derive from the `prioritized` AST and the evaluated tier contents, not from hidden query-result metadata. Confirmed.
6. `packages/engine/test/unit/kernel/legal-choices.test.ts` exists and is the right unit-test home for legality probing. The original ticket's test section was stale in treating tests as out of scope while also requiring new legality coverage.

## Architecture Check

1. **Shared legality helper, not query metadata**: The durable architecture is a pure helper at the choice layer that derives tier admissibility from the `prioritized` AST plus evaluated tier contents. `evalQuery` should remain a pure flattening/evaluation mechanism.
2. **Apply and discovery must share the same rule**: Discovery-time legality and execution-time validation must use one shared tier-admissibility rule. Duplicating the rule in `legal-choices.ts` and `effects-choice.ts` would drift.
3. **Current UI contract limits what this ticket can deliver cleanly**: Under today's one-shot `chooseN` API, the engine can robustly answer “is this final selection admissible?” and can expose discovery-time option legality only insofar as it is derivable from the current pending state. True click-by-click legality transitions would require a deeper `chooseN` interaction model change and should not be smuggled into this ticket.
4. **Recommended scope for this ticket**: Implement robust final-selection admissibility plus discovery-time legality that is consistent with that shared helper. If we later want true stepwise lower-tier unlock behavior in the UI, that should be a separate architecture ticket to make `chooseN` incremental at the kernel/runner contract level.

## Scope Correction

This ticket should no longer claim that it will deliver full engine-driven dynamic multi-select re-evaluation. Under the current architecture, that is a larger product/API change than a narrow legality fix.

This ticket should instead:

- add shared tier-admissibility logic for `chooseN` over `prioritized`
- enforce that logic during submitted-array validation in `effects-choice.ts`
- reuse that logic during discovery so `legal-choices.ts` does not contradict apply-time admissibility
- update card 87 to author the rule declaratively with `prioritized`
- add regression coverage in the actual legality/apply/integration test files

If the product requirement remains “lower-tier options must become clickable only after higher-tier selections are already chosen in the same open picker”, open a follow-up ticket to redesign `chooseN` as an incremental decision protocol instead of a one-shot array submission.

## What to Change

### 1. Add shared tier-admissibility logic for `chooseN`

Create a focused helper that:

- detects `chooseN.options.query === 'prioritized'`
- derives tier membership from the authored `tiers`
- computes whether a submitted or candidate item is admissible under tier priority
  - **With `qualifierKey`**: a lower-tier item is inadmissible while an unselected higher-tier item with the same qualifier remains
  - **Without `qualifierKey`**: a lower-tier item is inadmissible while any unselected higher-tier item remains

### 2. Enforce the rule during execution

In `effects-choice.ts`, reject submitted `chooseN` arrays that violate the shared tier-admissibility rule, even if cardinality and raw domain membership would otherwise pass.

### 3. Use the same rule during discovery

In discovery/legality evaluation, apply the same shared rule so the pending choice surface does not advertise options that apply-time would reject. If pre-filtering can reduce combination probing safely, do it here through the shared helper rather than by adding query-result metadata.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify — chooseN evaluation)
- `packages/engine/src/kernel/legal-choices.ts` (modify — to consume the shared rule)
- `packages/engine/src/kernel/prioritized-tier-legality.ts` (new — preferred if a focused helper materially improves cohesion)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/effects-choice.test.ts` and/or `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` (modify)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — card 87)

## Out of Scope

- Type definitions (ticket 001)
- Compiler lowering (ticket 002)
- Validation diagnostics (ticket 003)
- `evalQuery` handler (ticket 004)
- Card 87 YAML (ticket 008)
- A full incremental `chooseN` interaction redesign
- Runner-side per-click legality recomputation
- Any hidden tier metadata on query results
- UI/UX presentation of grayed-out items (spec non-goal)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. Shared tier-admissibility logic exists outside `evalQuery`
3. `chooseN` execution rejects submitted selections that violate `prioritized` tier rules
4. Discovery legality and apply-time validation agree on admissibility for `prioritized` `chooseN`
5. With `qualifierKey`, qualifier independence is enforced
6. Without `qualifierKey`, whole-tier exhaustion is enforced
7. Card 87 is re-authored to use `prioritized`
8. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. Legal choice discovery and move application agree on admissibility (spec invariant 6)
2. Lower-priority tiers never satisfy the same qualified remainder when higher tiers still can (spec invariant 2)
3. Qualifier matching is driven entirely by authored data — `qualifierKey` property name (spec invariant 3)
4. `evalQuery` remains a pure evaluator — no per-result tier metadata or side-channel membership map is introduced here
5. No FITL-specific identifiers appear in shared kernel code
6. This ticket does not pretend the current stack has true kernel-driven incremental multi-select re-evaluation when it does not

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — shared discovery/admissibility cases
2. `packages/engine/test/unit/effects-choice.test.ts` and/or `packages/engine/test/unit/kernel/apply-move.test.ts` — apply-time rejection for illegal submitted arrays
3. `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` — card 87 rule behavior using `prioritized`

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
