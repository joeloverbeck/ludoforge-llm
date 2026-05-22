# 188FITLFOUFAC-007A: ARVN witnessable selector/posture semantics prerequisite

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - generic selector-item expression support plus Tier-1 YAML authoring
**Deps**: `archive/tickets/188FITLFOUFAC-003.md`, `archive/tickets/188FITLFOUFAC-004.md`, `archive/tickets/188FITLFOUFAC-005.md`, `archive/tickets/188FITLFOUFAC-006.md`

## Problem

Ticket 007 is test-only and must prove the ARVN Phase 1 behavior witnesses from Spec 188. Live reassessment on 2026-05-21 showed at least one named behavior is not yet authored as a behavior-selective YAML surface: `arvn.governPatronageSpace` still scores every zone with a constant `patronageOpportunity: 1`, so 007 cannot truthfully prove "Govern prefers high-pop Active Support before low-pop Passive Support except emergency" without weakening the witness into a structural smoke test.

This ticket owns the missing Tier-1 YAML authoring prerequisite. It makes the ARVN selectors/posture hooks witnessable enough for ticket 007 to remain pure profile-quality proof.

## Assumption Reassessment (2026-05-21)

1. `data/games/fire-in-the-lake/92-agents.md` already contains the ARVN plan templates, guardrails, posture evaluator, relationship wiring, and the `arvn-evolved` binding from tickets 003-006.
2. Live inventory found `arvn.governPatronageSpace` still uses a constant quality component, which cannot prove the high-pop Active Support ordering named by Spec 188 §5 and ticket 007.
3. Boundary reset approved on 2026-05-21: the fix may add generic agent-planning support for selector-item expressions, then use that support from GameSpecDoc YAML. Adding FITL-specific engine, compiler, kernel, or test-helper behavior would still violate Foundations #1 and #2.
4. Ticket 007 remains the owner of profile-quality witnesses. This ticket owns only the authored semantics needed to make those witnesses meaningful.

## Architecture Check

1. Foundation #2: rule- and policy-relevant faction behavior is authored in `GameSpecDoc`, not inferred by tests or hardcoded in engine code.
2. Foundation #15: the root cause is an incomplete authored personality surface, so the fix should complete that YAML surface instead of masking it with weaker tests.
3. Foundation #16: automated witnesses in 007 must prove real behavior; this prerequisite prevents 007 from passing on construct presence alone.
4. Foundation #1: all FITL-specific identifiers remain in `data/games/fire-in-the-lake/92-agents.md`; shared runtime code stays game-agnostic.
5. Approved reset: generic selector-item expression support is allowed because it is game-agnostic and keeps the FITL behavior authored in YAML.

## What to Change

### 1. Make ARVN Govern target quality behavior-selective

Update `arvn.governPatronageSpace` so its quality components distinguish high-pop Active Support Govern opportunities from lower-value alternatives, with any emergency exception expressed through existing generic selector/posture/feature surfaces rather than engine code.

### 1A. Add generic selector-item expression support

Expose the currently scored selector item key to selector quality/where expressions through a generic policy ref, and allow selector expressions to use generic lookup/zone-property surfaces against that key. This support must not mention FITL factions, actions, spaces, or markers in shared source.

### 2. Inventory the other 007 witness surfaces for constant placeholders

Reassess the YAML surfaces that 007 must witness:
- US rival-risk flip when US near win.
- Patrol+Govern beats Train+Govern when LoCs/Econ are threatened.
- Sweep+Raid exposes before removal.
- Transport refuses origin-control loss.
- Pre-Coup posture avoids redeploy-undone Troop placement.

Patch only missing or placeholder authored semantics required for those witnesses. If a surface is already behavior-selective enough, record it as verified-no-edit in this ticket's outcome rather than changing it.

### 3. Keep the prerequisite YAML-only

Do not add FITL-specific engine/compiler/kernel changes. Do not add the six 007 profile-quality witness files here unless live implementation proves a tiny focused YAML regression is necessary to protect this prerequisite before 007 runs.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/src/agents/plan-proposal.ts` (modify; generic selector-item evaluation only)
- `packages/engine/src/agents/policy-selector-eval.ts` (modify; generic selector-item evaluation only)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify; generic selector-item ref runtime only)
- `packages/engine/src/agents/policy-lookup-surface.ts` (modify; expose generic zone markers to policy lookup)
- `packages/engine/src/cnl/compile-agents.ts` (modify; compile generic selector-item ref / selector lookup)
- `packages/engine/src/kernel/types-core.ts` (modify; generic compiled ref type)
- `packages/engine/src/kernel/schemas-core.ts` (modify; generic compiled ref schema)
- `packages/engine/test/unit/agents/plan-proposal.test.ts` (modify; generic selector-item role scoring regression)
- `tickets/188FITLFOUFAC-007.md` (modify only if implementation discovers additional dependency wording needed before returning to 007)

## Out of Scope

- The six ARVN profile-quality witness files named by 007.
- Re-authoring `arvn-train-govern-separation.test.ts`.
- US/NVA/VC skeleton work.
- FITL-specific engine, compiler, kernel, schema, or shared runtime changes.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the updated ARVN YAML and no diagnostics.
2. The authored ARVN selector/posture surfaces needed by ticket 007 are no longer constant placeholders where ticket 007 requires behavior-specific ordering or demotion.
3. Existing ARVN Train+Govern separation still passes.
4. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. No FITL-specific engine/compiler/kernel diff is introduced; any shared-source diff is generic selector-item expression support only.
2. All FITL-specific behavior remains authored in `data/games/fire-in-the-lake/92-agents.md`.
3. Ticket 007 remains the owner of the profile-quality witnesses and depends on this prerequisite.

## Test Plan

### New/Modified Tests

1. None required by default; this is a YAML authoring prerequisite. If implementation adds a focused regression, it must be narrow and must not replace ticket 007's profile-quality witnesses.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/arvn-train-govern-separation.test.js`
3. `pnpm -F @ludoforge/engine test:all`

## Outcome

Completed 2026-05-21.

Implemented the approved Foundations-aligned reset: shared engine/compiler changes are limited to generic selector-item expression support, while FITL-specific ARVN behavior remains authored in `data/games/fire-in-the-lake/92-agents.md`. The new generic surface exposes `selector.item.key` to selector quality/where expressions, allows selector expressions to use generic lookup/zone-property surfaces against that key, and evaluates selector item keys without per-item context allocation on the hot selector path.

Updated ARVN authored semantics:
- `arvn.governPatronageSpace` now scores support and population rather than a constant placeholder: Active Support > Passive Support > population-only alternatives.
- `arvn.patrolLocOrCity` now scores Econ and city category rather than constant placeholders.
- The other ticket-007 witness surfaces were verified as already behavior-selective enough for the witness owner: US rival-risk flip via existing relationship/posture terms, Sweep/Raid and removal priority via existing selectors, Transport origin-control refusal via guardrail, and pre-Coup overcommit posture via existing guardrail.

Generic shared changes:
- Added compiled `selectorItemIntrinsic` ref support in kernel types/schemas and compiler lowering.
- Allowed selector expressions to use generic lookup refs.
- Exposed zone markers through the generic policy lookup projection.
- Added runtime and plan-proposal evaluator support for selector-item-key refs, `zoneProp`, and the generic arithmetic/comparison operators needed by selector quality components.
- Added a focused plan-proposal regression proving a zone selector can score candidates using the current selector item key.

Proof fallout:
- Regenerated `GameDef.schema.json` after the compiled ref schema changed.
- Regenerated existing ARVN/FITL preview golden fixtures that pin the intentionally changed production policy trajectory, including the Spec 178 outcome parity fixtures and the Spec 161 chooseNStep canary decision index. The canary still witnesses the same card-94 chooseNStep projected-margin signal after moving from decision index 296 to 315.

Source-size hard-gate decision:

User-approved deferral on 2026-05-21 after reassessing against `docs/FOUNDATIONS.md`. Foundation alignment is satisfied because the implementation is generic, prevents FITL-specific shared runtime behavior, fixes the authored root cause, and is covered by automated proof. Extraction of the touched canonical hubs is deferred because splitting type/schema/compiler/evaluator registries here would widen this prerequisite beyond the generic selector-item capability.

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/agents/plan-proposal.ts` | 659 | 718 | No | +59 | Under cap; retained locally because the change is the generic plan-role selector evaluator path. | None |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2861 | 2878 | No; preexisting over cap | +17 | User-approved deferral; narrow generic runtime ref support in canonical evaluator hub. | None |
| `packages/engine/src/cnl/compile-agents.ts` | 5949 | 5957 | No; preexisting over cap | +8 | User-approved deferral; narrow generic selector ref/lookup lowering in canonical compiler hub. | None |
| `packages/engine/src/kernel/types-core.ts` | 2927 | 2931 | No; preexisting over cap | +4 | User-approved deferral; generic compiled-ref union extension in canonical type registry. | None |
| `packages/engine/src/kernel/schemas-core.ts` | 3266 | 3270 | No; preexisting over cap | +4 | User-approved deferral; generic compiled-ref schema extension in canonical schema registry. | None |

Verification:
- `pnpm -F @ludoforge/engine build` — pass.
- `node --test packages/engine/dist/test/unit/agents/plan-proposal.test.js` — pass, 10/10 tests.
- `node --test packages/engine/dist/test/policy-profile-quality/arvn-train-govern-separation.test.js` — pass, 1/1 test.
- `node --test --test-reporter=./scripts/test-class-reporter.mjs --test-reporter-destination=stdout dist/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.js` from `packages/engine` — pass, 1/1 test after the trajectory reindex.
- `node --test dist/test/unit/schema-artifacts-sync.test.js` from `packages/engine` — pass, 2/2 tests.
- `node --test dist/test/architecture/policy-preview-inner-outcome-parity.test.js` from `packages/engine` — pass, 5/5 tests.
- `pnpm -F @ludoforge/engine test:all` — pass, 957/957 tests.
