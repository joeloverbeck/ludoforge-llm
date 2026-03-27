# MONGRNINV-002: Cookbook — Monsoon grant encoding guidance

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — docs only
**Deps**: archive/tickets/MONGRNINV/MONGRNINV-001-monsoon-grant-compilation-invariant.md

## Problem

The `docs/fitl-event-authoring-cookbook.md` has zero mentions of Monsoon. That leaves a gap in the canonical authoring guide for a contract that is now enforced elsewhere: any event card `freeOperationGrant` that targets a Monsoon-restricted action must set `allowDuringMonsoon: true`.

Before `MONGRNINV-001`, this omission caused real FITL regressions because the grant would work outside Monsoon but be filtered during Monsoon. That particular failure mode is now caught at compile time, but the cookbook still fails to teach authors why the flag exists, when it is required, and what runtime behavior it is preventing.

## Reassessed Assumptions

- The original ticket correctly identified a documentation gap, but its framing is stale in one important way: this is no longer the primary protection against breakage. The compiler already rejects malformed authored content via the Monsoon cross-validation invariant in `packages/engine/src/cnl/cross-validate.ts`.
- Existing automated coverage is broader than the ticket claimed:
  - `packages/engine/test/unit/cross-validate.test.ts` covers the compile-time invariant.
  - `packages/engine/test/unit/kernel/legal-moves.test.ts` covers the runtime Monsoon filtering behavior with and without `allowDuringMonsoon`.
  - FITL production integration tests for card 44 (`Ia Drang`) and card 62 (`Cambodian Civil War`) already exercise Monsoon-sensitive grant flows.
- Because the compiler and tests already own enforcement, this ticket should remain docs-only. Adding a documentation-coupled prose test would be a worse architectural tradeoff than the current design: it would make tests brittle on wording without adding new behavior protection.
- The durable architecture is:
  - compiler cross-validation rejects invalid grants,
  - runtime turn-flow filtering enforces Monsoon windows,
  - production integration tests prove real authored cards behave correctly,
  - the cookbook explains the authoring contract so future YAML changes do not rediscover it by failure.

## Architectural Reassessment

This proposed change is beneficial relative to the current architecture because it strengthens the correct layer rather than competing with it.

- The engine/compiler architecture is already the right long-term shape. The Monsoon invariant belongs in shared validation, not in FITL-only runtime hacks or looser backwards-compatible aliases.
- The missing piece is authoring guidance. The cookbook is the correct place to document the contract because it is the durable FITL authoring surface for humans and LLMs working in YAML.
- It would not be cleaner to move this concern into additional engine abstractions or doc-fragile tests. The robust path is to keep enforcement where it is and make the cookbook accurately reflect that contract.

## Foundation Alignment

- **Foundation 10 (Architectural Completeness)**: "Solutions address root causes, not symptoms. If a problem reveals a design gap, the design is fixed." The cookbook is the canonical authoring reference — its silence on Monsoon is a documentation gap that will cause repeat errors.
- **Foundation 2 (Evolution-First)**: Evolution mutates YAML. If an LLM evolves an event card that grants a Monsoon-restricted operation, it needs to know about `allowDuringMonsoon` from the documentation, not from runtime failure.
- **Foundation 8 (Compiler-Kernel Validation Boundary)**: Structural enforcement already lives in compiler cross-validation while runtime legality stays in the kernel. This ticket updates documentation to match that boundary instead of moving responsibility again.

## What to Change

### 1. New section in `docs/fitl-event-authoring-cookbook.md`

Add a new `## Monsoon-Restricted Free-Operation Grants` section. Place it after the existing `## Ordered Free-Op Event Testing` section (line ~530) since both concern free-operation grants.

Content should cover:

**Which actions are Monsoon-restricted**: Reference the authored turn-flow config (`turnOrder.config.turnFlow.monsoon.restrictedActions`) rather than treating any specific action list as magic. Note the current FITL production restriction set as an example, not as a second source of truth.

**The rule**: Per FITL rule 5.1.1, Events override Monsoon restrictions. When an event card grants a free operation for a Monsoon-restricted action via `freeOperationGrants`, the grant MUST include `allowDuringMonsoon: true`.

**What happens without it**: Explain both the historical runtime behavior and the current compile-time enforcement:
- at runtime, Monsoon filtering removes the move and required grant chains can expire unusably;
- today, compiler cross-validation rejects the authored grant before it reaches runtime.

**Canonical example**: Card-62 (Cambodian Civil War) grants US free Air Lift + Sweep into Cambodia. Both Air Lift grants and both Sweep grants have `allowDuringMonsoon: true`. Without the flag on Air Lift, the entire grant chain fails during Monsoon because Air Lift is sequence step 0 and its expiry cascades.

**Compile-time guard**: Point to the shared cross-validator and its focused tests (`packages/engine/test/unit/cross-validate.test.ts`) rather than naming a nonexistent standalone invariant file.

### 2. Add to Practical Checklist

Append a checklist item to the existing `## Practical Checklist` section (line ~589):

```
- [ ] Every `freeOperationGrant` whose `actionIds` includes a Monsoon-restricted action has `allowDuringMonsoon: true`
```

## Files to Touch

- `docs/fitl-event-authoring-cookbook.md` (modify — add section + checklist item)

## Out of Scope

- Engine code changes
- New documentation-coupled prose tests
- Non-FITL documentation

## Verification

- The new section is findable via `grep -i monsoon docs/fitl-event-authoring-cookbook.md`
- The checklist item appears in the Practical Checklist section
- Content references the shared compiler invariant and current relevant tests accurately

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - updated this ticket's assumptions and scope to match the current architecture, including the existing compiler invariant and existing runtime/integration coverage
  - added a new Monsoon-specific authoring section to `docs/fitl-event-authoring-cookbook.md`
  - added a Monsoon checklist item to the cookbook's Practical Checklist
- Deviations from original plan:
  - no engine or test code changes were needed because the invariant and relevant automated coverage already existed
  - the ticket now explicitly documents why a prose-coupled documentation test would be a worse architectural tradeoff than the current validation stack
- Verification results:
  - `grep -in "monsoon" docs/fitl-event-authoring-cookbook.md`
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm turbo lint`
  - `pnpm turbo test`
  - `pnpm run check:ticket-deps` still fails due to unrelated preexisting unresolved dependency references in `tickets/85COMEFFCONMIG-001-widen-scoped-var-signatures.md` and `tickets/85COMEFFCONMIG-002-widen-choice-decision-player.md`
