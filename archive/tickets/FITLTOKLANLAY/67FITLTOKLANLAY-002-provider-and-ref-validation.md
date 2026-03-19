# 67FITLTOKLANLAY-002: VisualConfigProvider Resolution APIs and Visual-Config Ref Validation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner config/provider only
**Deps**: 67FITLTOKLANLAY-001

## Problem

Ticket `001` already landed the schema/types work for Spec 67, but the runner still lacks the provider-side resolution layer that later renderer work should consume. `VisualConfigProvider` currently resolves only token shape/color/size/symbols and basic zone visuals; it cannot answer “what token lane does this token use?”, “what token layout applies to this zone?”, or “how should the stack badge be styled?”.

The repo also already has a reference-validation layer, but it currently checks only basic runtime-id references. It does not yet validate Spec 67 category assignments or presentation-lane satisfiability against the configured zone token layouts.

## Assumption Reassessment (2026-03-18)

1. [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) and [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) already cover the Spec 67 schema surface, including token presentation, stack badge styling, lane presets, and preset assignment existence — confirmed.
2. [`packages/runner/src/config/visual-config-provider.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-provider.ts) is already the central resolver for runtime visual decisions, but it does not yet expose Spec 67 resolved APIs — confirmed.
3. [`packages/runner/src/config/validate-visual-config-refs.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/validate-visual-config-refs.ts) already owns `GameDef`-aware cross-reference checks, but it does not yet validate zone-category assignments or presentation-lane compatibility — confirmed.
4. `packages/runner/test/config/visual-config-provider.test.ts` and `packages/runner/test/config/validate-visual-config-refs.test.ts` are the right places to lock down provider behavior and bad-reference failures — confirmed.

## Architecture Check

1. Provider APIs keep lane resolution, token presentation, and badge styling out of the renderer and out of YAML-call-site code.
2. Cross-reference validation belongs in `validate-visual-config-refs.ts`, not in the renderer, because it needs real `GameDef` zone categories and should fail before any canvas rendering begins.
3. This ticket must preserve the Spec 67 “single resolution path” principle: consumers ask the provider, not raw config objects.
4. Keep `ResolvedTokenVisual` focused on appearance. Prefer sibling resolved contracts for presentation/layout/badge policy instead of turning it into a catch-all bag.
5. The validation scope must match the data actually encoded in config. Because visual config does not encode token-type-to-zone-category reachability, this ticket should validate lane ids against assigned layouts generically, not invent per-token placement knowledge the config does not provide.

## What to Change

### 1. Add resolved provider types and APIs

Extend [`packages/runner/src/config/visual-config-provider.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-provider.ts) so it can resolve:

- token presentation metadata for a token type
- stack badge style
- zone token layout for a given zone id/category

The resolved types should be explicit and normalized, not raw YAML fragments. This should include sensible provider defaults for omitted visual-policy config where needed.

### 2. Keep `ResolvedTokenVisual` and presentation metadata coherent

Choose one of these clean approaches and document it in the implementation:

1. expand `ResolvedTokenVisual` to include presentation data
2. introduce a sibling `ResolvedTokenPresentation`
3. introduce a composite resolved token visual object used consistently by renderer code

Recommendation: option 2, so shape/color/size concerns stay distinct from layout-policy metadata and later renderer work can compose the two deliberately.

Implementation note: do not treat this as a backwards-compatibility exercise for the current `ResolvedTokenVisual` shape. If a cleaner provider contract requires updating downstream consumers, do that directly and let ticket `003` adapt to the cleaner API.

### 3. Add cross-reference validation for Spec 67 config

Extend [`packages/runner/src/config/validate-visual-config-refs.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/validate-visual-config-refs.ts) so invalid references fail before runtime, including:

- zone token layout assignments that reference unknown `GameDef` zone categories
- token presentation lanes that cannot be satisfied by any assigned lane layout preset

Do not duplicate schema-only checks that are already enforced in `VisualConfigSchema` (for example unknown preset ids inside `assignments.byCategory` or malformed lane-order declarations). This ticket is about the remaining `GameDef`-aware cross-reference layer.

Use the existing validation error pattern instead of custom throw sites in the renderer.

### 4. Add focused provider and validation tests

Extend:

- [`packages/runner/test/config/visual-config-provider.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-provider.test.ts)
- [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts)

Tests should cover both happy-path resolution and the new fast-fail validation cases, including defaulted provider behavior for omitted Spec 67 config.

## Files to Touch

- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/validate-visual-config-refs.test.ts` (modify)

## Out of Scope

- token renderer placement logic
- `GameCanvas` data plumbing
- FITL `visual-config.yaml`
- screenshot capture or screenshot artifact updates
- any engine/runtime/kernel/compiler changes
- re-implementing schema invariants already covered by ticket `001`

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/config/visual-config-provider.test.ts` verifies a FITL-style map-space category resolves to the two-lane preset.
2. `packages/runner/test/config/visual-config-provider.test.ts` verifies base tokens resolve `lane: base` and `scale: 1.5`, while regular force tokens resolve `lane: regular`.
3. `packages/runner/test/config/visual-config-provider.test.ts` verifies stack badge style and provider defaults resolve into normalized runtime values.
4. `packages/runner/test/config/validate-visual-config-refs.test.ts` fails when `tokenLayouts.assignments.byCategory` references an unknown zone category.
5. `packages/runner/test/config/validate-visual-config-refs.test.ts` fails when a token presentation lane cannot be satisfied by any assigned lane layout preset.
6. Existing suite: `pnpm -F @ludoforge/runner test -- visual-config-provider.test.ts validate-visual-config-refs.test.ts`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `VisualConfigProvider` remains the only runtime source of resolved token presentation/layout/badge metadata.
2. Validation failures happen before rendering; the renderer does not contain fallback guesses for malformed config.
3. No FITL-specific branching is introduced into provider logic.
4. The resolved provider contract becomes cleaner, not more overloaded. Avoid folding lane/layout policy into legacy appearance-only shapes.
5. Ref validation must stay aligned with the encoded contract and avoid pretending to know token-to-zone-category reachability that the config does not express.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-provider.test.ts` — token presentation resolution, lane preset resolution, stack badge resolution, provider defaults
2. `packages/runner/test/config/validate-visual-config-refs.test.ts` — unknown assigned categories and unsatisfied token presentation lanes

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-provider.test.ts validate-visual-config-refs.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completed: 2026-03-18
- Actually changed:
  - added normalized provider APIs for token presentation, zone token layout resolution, and stack badge styling
  - kept `ResolvedTokenVisual` appearance-only and introduced sibling resolved contracts instead of overloading it
  - extended `GameDef`-aware ref validation to reject unknown assigned zone categories and presentation lanes that no assigned lane layout can satisfy
  - added focused provider and ref-validation coverage for the new contracts and edge cases
- Deviations from original plan:
  - did not re-implement schema checks already covered by ticket `001`
  - narrowed lane validation to the enforceable config contract: satisfiability against assigned lane layouts, not token-type-to-zone-category reachability that the config does not encode
- Verification results:
  - `pnpm -F @ludoforge/runner test -- visual-config-provider.test.ts validate-visual-config-refs.test.ts`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
